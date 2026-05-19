/* eslint-disable no-console */
import { execFileSync, spawn, ChildProcessWithoutNullStreams, SpawnOptions } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { HERMES_BIN } from './paths';
import { errMsg } from '../../utils/errors';

/** Build argv with optional `-p <profile>` global flag. */
export function withProfile(profile: string | undefined | null, args: string[]): string[] {
  if (!profile || profile === 'default') return args;
  return ['-p', profile, ...args];
}

/**
 * Detect a container runtime so we can decide whether to drop privileges
 * before invoking hermes. We check both Docker and Podman markers.
 */
export function isContainer(): boolean {
  try {
    return existsSync('/.dockerenv') || existsSync('/run/.containerenv');
  } catch {
    return false;
  }
}

/**
 * Look up the `hermes` user in `/etc/passwd`. The official hermes-agent
 * Docker image creates this user; the hermes binary itself refuses to
 * run as root inside that image. When the API runs as root (e.g. inside
 * the container) we need to drop privileges to this user so that hermes
 * will start AND so that any files it creates under HERMES_HOME stay
 * readable by the gateway daemon (which is also the hermes user).
 *
 * Returns `null` when the user doesn't exist (i.e. not the official image).
 */
export function getHermesUserIds(): { uid: number; gid: number } | null {
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
 * Spawn-options object that drops privileges to the `hermes` user when
 * (a) we're inside a container, (b) currently root, and (c) a `hermes`
 * user exists. In every other environment this is an empty object and
 * the spawn runs as the current user.
 *
 * Applies to all hermes invocations from the API so files we create
 * under HERMES_HOME are owned by the same user that runs the gateway.
 */
export function hermesSpawnIds(): { uid: number; gid: number } | Record<string, never> {
  if (!isContainer()) return {};
  const getuid = (process as { getuid?: () => number }).getuid;
  if (typeof getuid !== 'function' || getuid() !== 0) return {};
  return getHermesUserIds() ?? {};
}

export interface HermesExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}

/** Run hermes synchronously, capturing stdout/stderr. Never throws. */
export function hermesExec(
  args: string[],
  opts: { profile?: string | null; timeoutMs?: number; env?: Record<string, string> } = {}
): HermesExecResult {
  const argv = withProfile(opts.profile, args);
  try {
    const stdout = execFileSync(HERMES_BIN, argv, {
      encoding: 'utf-8',
      timeout: opts.timeoutMs ?? 30000,
      env: { ...process.env, ...opts.env, HERMES_NO_COLOR: '1', NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...hermesSpawnIds(),
    });
    return { ok: true, stdout, stderr: '' };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    return {
      ok: false,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      error: errMsg(err),
    };
  }
}

/** Spawn hermes asynchronously (for streaming). */
export function hermesSpawn(
  args: string[],
  opts: { profile?: string | null; spawnOptions?: SpawnOptions } = {}
): ChildProcessWithoutNullStreams {
  const argv = withProfile(opts.profile, args);
  const child = spawn(HERMES_BIN, argv, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HERMES_NO_COLOR: '1', NO_COLOR: '1', TERM: 'dumb' },
    ...hermesSpawnIds(),
    ...(opts.spawnOptions ?? {}),
  });
  return child as ChildProcessWithoutNullStreams;
}

let cachedAvailability: { ok: boolean; checkedAt: number } | null = null;
const AVAILABILITY_TTL = 60_000;

export function isHermesAvailable(): boolean {
  const now = Date.now();
  if (cachedAvailability && now - cachedAvailability.checkedAt < AVAILABILITY_TTL) {
    return cachedAvailability.ok;
  }
  const result = hermesExec(['--version'], { timeoutMs: 5000 });
  cachedAvailability = { ok: result.ok, checkedAt: now };
  return result.ok;
}

/**
 * Strip ANSI escape sequences and box-drawing artifacts that hermes uses for
 * tabular output. Useful before line-parsing.
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');
}
