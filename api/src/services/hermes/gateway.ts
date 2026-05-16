import { hermesExec, stripAnsi } from './cli';

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
 * Install (idempotent) + start a single profile's gateway, then poll its
 * status until the daemon reports loaded. Polling avoids the UX papercut
 * where the launchctl bootstrap hasn't completed by the time the
 * post-mutation status fetch runs.
 */
export async function startProfileGateway(profile: string): Promise<ProfileGatewayOpResult> {
  invalidateStatusCache(profile);
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

export function stopProfileGateway(profile: string): ProfileGatewayOpResult {
  invalidateStatusCache(profile);
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
  const stop = stopProfileGateway(profile);
  const start = await startProfileGateway(profile);
  return {
    ok: start.ok,
    error: start.error ?? stop.error,
    raw: `${stop.raw}\n---\n${start.raw}`,
  };
}
