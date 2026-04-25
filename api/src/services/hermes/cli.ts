/* eslint-disable no-console */
import { execFileSync, spawn, ChildProcessWithoutNullStreams, SpawnOptions } from 'child_process';
import { HERMES_BIN } from './paths';
import { errMsg } from '../../utils/errors';

/** Build argv with optional `-p <profile>` global flag. */
export function withProfile(profile: string | undefined | null, args: string[]): string[] {
  if (!profile || profile === 'default') return args;
  return ['-p', profile, ...args];
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
