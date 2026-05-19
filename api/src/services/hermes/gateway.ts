import { spawn } from 'child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import os from 'os';
import path from 'path';
import { hermesExec, stripAnsi, withProfile } from './cli';
import { HERMES_BIN } from './paths';

/**
 * In-memory cache for `gateway status` results, keyed by profile name.
 * Each entry is invalidated after `STATUS_CACHE_TTL_MS` so the UI sees
 * a fresh answer within the polling window without us spawning a hermes
 * subprocess for every sidebar tick (the sidebar polls per-agent).
 */
const STATUS_CACHE_TTL_MS = 15_000;
const statusCache = new Map<string, { value: ProfileGatewayStatus; expiresAt: number }>();

export interface ProfileGatewayStatus {
  profile: string;
  running: boolean;
  /** Raw `hermes -p <profile> gateway status` output. */
  raw: string;
  error?: string;
}

export interface ProfileGatewayOpResult {
  ok: boolean;
  error?: string;
  raw: string;
}

/**
 * Detect whether the gateway is alive from `hermes gateway status` output.
 * Hermes uses three different output shapes depending on install state:
 *
 *   1. Not installed
 *      `✗ Gateway is not running\nTo start: hermes gateway run …`
 *   2. Installed but not loaded
 *      `Launchd plist: …`
 *      `✓ Service definition matches the current Hermes install`
 *      `✗ Gateway service is not loaded`
 *   3. Installed and loaded — the running state
 *      `Launchd plist: …`
 *      `✓ Service definition matches the current Hermes install`
 *      `✓ Gateway service is loaded`
 *      `{ … "PID" = 12345 … }`
 *
 * We treat the daemon as running when any positive marker is present and
 * no negative qualifier appears. The PID dump is a belt-and-braces
 * fallback for future format tweaks.
 */
export function parseGatewayRunning(raw: string): boolean {
  const negative = /(not running|not loaded|not installed|not active)/i.test(raw);
  if (negative) return false;
  return (
    /Gateway is running/i.test(raw) ||
    /Gateway service is loaded/i.test(raw) ||
    /"PID"\s*=\s*\d+/.test(raw)
  );
}

/** Resolve the `-p` flag — `default` is implicit (no flag). */
function profileFlag(profile: string): string | null {
  return profile === 'default' ? null : profile;
}

// ── Container-mode gateway supervision ──────────────────────────────────────
//
// `hermes gateway install` / `start` / `stop` are no-ops inside Docker —
// hermes itself prints "Service installation is not needed inside a Docker
// container" and exits. For the default profile that's fine: the container's
// own CMD is `hermes gateway run`, so the gateway is already PID 1. For
// every other profile we have to bring up the daemon ourselves: spawn
// `hermes -p <profile> gateway run` as a detached child, track the PID
// under ~/.hermes_client/gateway-pids, and reap it on stop.

function isContainer(): boolean {
  try {
    return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
  } catch {
    return false;
  }
}

const CONTAINER_PID_DIR = path.join(os.homedir(), '.hermes_client', 'gateway-pids');
const CONTAINER_LOG_DIR = path.join(os.homedir(), '.hermes_client', 'gateway-logs');

function ensureContainerDirs(): void {
  [CONTAINER_PID_DIR, CONTAINER_LOG_DIR].forEach((dir) => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });
}

function pidFilePath(profile: string): string {
  return path.join(CONTAINER_PID_DIR, `${profile}.pid`);
}

function logFilePath(profile: string): string {
  return path.join(CONTAINER_LOG_DIR, `${profile}.log`);
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readTrackedPid(profile: string): number | null {
  try {
    const raw = readFileSync(pidFilePath(profile), 'utf-8').trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writeTrackedPid(profile: string, pid: number): void {
  writeFileSync(pidFilePath(profile), String(pid));
}

function clearTrackedPid(profile: string): void {
  try {
    unlinkSync(pidFilePath(profile));
  } catch {
    /* file already gone */
  }
}

function readLogTail(profile: string, lines: number): string {
  try {
    const text = readFileSync(logFilePath(profile), 'utf-8');
    return text.split('\n').slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Look up the `hermes` user in `/etc/passwd`. The official hermes-agent
 * Docker image creates this user and runs the entrypoint as them; the
 * hermes binary itself refuses to run as root inside that image. When we
 * spawn the gateway from the API (which runs as root), we need to drop
 * privileges to this user so hermes will actually start.
 *
 * Returns `null` outside the Docker image (no hermes user → no drop).
 */
function getHermesUserIds(): { uid: number; gid: number } | null {
  let passwd: string;
  try {
    passwd = readFileSync('/etc/passwd', 'utf-8');
  } catch {
    return null;
  }
  const line = passwd.split('\n').find((l) => l.startsWith('hermes:'));
  if (!line) return null;
  const parts = line.split(':');
  if (parts.length < 4) return null;
  const uid = Number.parseInt(parts[2], 10);
  const gid = Number.parseInt(parts[3], 10);
  if (!Number.isFinite(uid) || !Number.isFinite(gid)) return null;
  return { uid, gid };
}

/**
 * Build the privilege-drop options for `spawn`. Returns an empty object
 * unless we're root inside a container with a `hermes` user — in every
 * other environment the spawn runs as the current user.
 */
function gatewaySpawnIds(): { uid: number; gid: number } | Record<string, never> {
  if (!isContainer()) return {};
  // `process.getuid` is undefined on Windows; on POSIX it always exists.
  const { getuid } = process as { getuid?: () => number };
  if (typeof getuid !== 'function' || getuid() !== 0) return {};
  return getHermesUserIds() ?? {};
}

/** Single-profile status check (uncached). */
export function readGatewayStatusFor(profile: string): ProfileGatewayStatus {
  const result = hermesExec(['gateway', 'status'], {
    profile: profileFlag(profile),
    timeoutMs: 10000,
  });
  const raw = stripAnsi(`${result.stdout}\n${result.stderr}`).trim();
  if (!result.ok) return { profile, running: false, raw, error: result.error };
  return { profile, running: parseGatewayRunning(raw), raw };
}

/**
 * Cached single-profile status — preferred for UI hot paths (sidebar
 * indicators, agent list decoration) that fire on every list fetch.
 *
 * The lifecycle helpers (start/stop/restart) invalidate the entry so
 * the very next list call reflects the operator's action; everything
 * else just rides the TTL.
 */
export function readGatewayStatusCached(profile: string): ProfileGatewayStatus {
  const cached = statusCache.get(profile);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const fresh = readGatewayStatusFor(profile);
  statusCache.set(profile, { value: fresh, expiresAt: now + STATUS_CACHE_TTL_MS });
  return fresh;
}

function invalidateStatusCache(profile: string): void {
  statusCache.delete(profile);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Container-mode start: spawn `hermes -p <profile> gateway run` as a
 * detached, tracked background child. Returns success as soon as the
 * process is alive past the warm-up window. The default profile is left
 * alone — it's the container's PID 1 already.
 */
async function startProfileGatewayInContainer(profile: string): Promise<ProfileGatewayOpResult> {
  if (profile === 'default') {
    const status = readGatewayStatusFor('default');
    if (status.running) return { ok: true, raw: status.raw };
    return {
      ok: false,
      error:
        'Default profile gateway is the container entrypoint but is not running. Restart the container.',
      raw: status.raw,
    };
  }

  const existing = readTrackedPid(profile);
  if (existing && pidAlive(existing)) {
    const status = readGatewayStatusFor(profile);
    return {
      ok: true,
      raw: `Gateway already running (pid ${existing})\n---\n${status.raw}`,
    };
  }
  // Stale pidfile — clear before respawning.
  if (existing) clearTrackedPid(profile);

  ensureContainerDirs();
  const fd = openSync(logFilePath(profile), 'a');
  // In the official hermes-agent image the binary refuses root, so we
  // drop privileges to the 'hermes' user. Outside that image (or as a
  // non-root API), this is a no-op. The fd is opened by us before the
  // privilege drop, so the child writes through our fd regardless of
  // its UID's permissions on the log file.
  const child = spawn(HERMES_BIN, withProfile(profile, ['gateway', 'run']), {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, HERMES_NO_COLOR: '1', NO_COLOR: '1', TERM: 'dumb' },
    ...gatewaySpawnIds(),
  });
  child.unref();
  closeSync(fd);

  if (!child.pid) {
    return { ok: false, error: 'Failed to spawn hermes gateway run.', raw: '' };
  }
  writeTrackedPid(profile, child.pid);

  // Poll: fail fast if the child dies, success only when 'hermes gateway
  // status' confirms a running gateway. We deliberately do NOT trust
  // "process is alive" alone — `hermes gateway run` can stay alive while
  // failing to register as a gateway (e.g. port conflict with PID 1, no
  // channels configured, profile config invalid), and reporting that as
  // success would put a green dot on a non-functional gateway.
  for (let i = 0; i < 15; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential poll-and-check is the whole point
    await sleep(1000);
    if (!pidAlive(child.pid)) {
      const tail = readLogTail(profile, 80);
      clearTrackedPid(profile);
      return {
        ok: false,
        error: 'Gateway process exited shortly after start.',
        raw: tail || '(no output captured)',
      };
    }
    const status = readGatewayStatusFor(profile);
    if (status.running) {
      return { ok: true, raw: `Spawned gateway (pid ${child.pid})\n---\n${status.raw}` };
    }
  }

  // Timed out — alive but unrecognised. Reap and surface the log so the
  // operator can see why hermes refused to acknowledge the daemon.
  const tail = readLogTail(profile, 120);
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  clearTrackedPid(profile);
  const finalStatus = readGatewayStatusFor(profile);
  return {
    ok: false,
    error:
      `'hermes -p ${profile} gateway run' stayed alive for 15 s but ` +
      "'hermes gateway status' never reported it as running. The process " +
      'has been terminated. Common causes: (a) the container already has ' +
      'a gateway as PID 1 and a second binder fails; (b) the profile has ' +
      'no channels configured yet — set one up first; (c) the profile ' +
      `config is invalid. Log tail follows.`,
    raw: `${tail || '(no output captured)'}\n---\n${finalStatus.raw}`,
  };
}

async function stopProfileGatewayInContainer(profile: string): Promise<ProfileGatewayOpResult> {
  if (profile === 'default') {
    return {
      ok: false,
      error:
        'Default profile gateway runs as the container entrypoint — stop the container itself instead.',
      raw: '',
    };
  }
  const pid = readTrackedPid(profile);
  if (!pid || !pidAlive(pid)) {
    clearTrackedPid(profile);
    return { ok: true, raw: 'No tracked gateway process to stop.' };
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 20; i += 1) {
    if (!pidAlive(pid)) break;
    // eslint-disable-next-line no-await-in-loop -- sequential wait is the whole point
    await sleep(250);
  }
  if (pidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
  clearTrackedPid(profile);
  return { ok: true, raw: `Stopped gateway (was pid ${pid}).` };
}

/**
 * Install (idempotent) + start a single profile's gateway, then poll its
 * status until the daemon reports loaded. Polling avoids the UX papercut
 * where the launchctl bootstrap hasn't completed by the time the
 * post-mutation status fetch runs.
 *
 * Inside containers, this delegates to the spawn-tracked container path
 * because `hermes gateway install` / `start` are no-ops there.
 */
export async function startProfileGateway(profile: string): Promise<ProfileGatewayOpResult> {
  invalidateStatusCache(profile);
  if (isContainer()) return startProfileGatewayInContainer(profile);

  const flag = profileFlag(profile);
  const installed = hermesExec(['gateway', 'install'], { profile: flag, timeoutMs: 60000 });
  if (!installed.ok) {
    return {
      ok: false,
      error: installed.stderr || installed.stdout || installed.error,
      raw: stripAnsi(`${installed.stdout}\n${installed.stderr}`).trim(),
    };
  }
  const started = hermesExec(['gateway', 'start'], { profile: flag, timeoutMs: 30000 });
  let raw = stripAnsi(
    `${installed.stdout}\n${installed.stderr}\n${started.stdout}\n${started.stderr}`
  ).trim();
  if (!started.ok) {
    return { ok: false, error: started.stderr || started.stdout || started.error, raw };
  }
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential poll-and-check is the whole point
    await sleep(1000);
    const status = readGatewayStatusFor(profile);
    if (status.running) {
      raw = `${raw}\n---\n${status.raw}`;
      return { ok: true, raw };
    }
  }
  raw = `${raw}\n---\n${readGatewayStatusFor(profile).raw}`;
  return {
    ok: false,
    error: 'Gateway start command completed but the daemon never reported loaded.',
    raw,
  };
}

export async function stopProfileGateway(profile: string): Promise<ProfileGatewayOpResult> {
  invalidateStatusCache(profile);
  if (isContainer()) return stopProfileGatewayInContainer(profile);

  const result = hermesExec(['gateway', 'stop'], {
    profile: profileFlag(profile),
    timeoutMs: 30000,
  });
  const raw = stripAnsi(`${result.stdout}\n${result.stderr}`).trim();
  if (!result.ok) {
    return { ok: false, error: result.stderr || result.stdout || result.error, raw };
  }
  return { ok: true, raw };
}

/**
 * `hermes gateway restart` exists, but we go through stop + start so the
 * caller benefits from the same install-and-poll loop as start. This also
 * means restarting a never-installed profile works in one shot.
 */
export async function restartProfileGateway(profile: string): Promise<ProfileGatewayOpResult> {
  const stop = await stopProfileGateway(profile);
  const start = await startProfileGateway(profile);
  return {
    ok: start.ok,
    error: start.error ?? stop.error,
    raw: `${stop.raw}\n---\n${start.raw}`,
  };
}
