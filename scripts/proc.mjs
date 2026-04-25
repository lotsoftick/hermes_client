import { execFileSync } from 'node:child_process';

export const IS_WINDOWS = process.platform === 'win32';
export const IS_DARWIN = process.platform === 'darwin';

/** `npm` is `npm.cmd` on Windows — direct `spawn('npm',...)` can fail on some setups. */
export const NPM_BIN = IS_WINDOWS ? 'npm.cmd' : 'npm';

/** List PIDs currently listening on `port` (cross-platform). */
export function pidsOnPort(port) {
  if (IS_WINDOWS) {
    try {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf-8' });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) continue;
        const [proto, local, , state, pid] = parts;
        if (proto !== 'TCP' || state !== 'LISTENING') continue;
        // Match both IPv4 (0.0.0.0:PORT) and IPv6 ([::]:PORT)
        if (local.endsWith(`:${port}`)) pids.add(pid);
      }
      return [...pids];
    } catch {
      return [];
    }
  }
  try {
    const out = execFileSync('lsof', ['-ti', `:${port}`], { encoding: 'utf-8' }).trim();
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function portListening(port) {
  return pidsOnPort(port).length > 0;
}

export function killPid(pid) {
  if (IS_WINDOWS) {
    try {
      execFileSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'ignore' });
    } catch {
      /* already gone */
    }
    return;
  }
  try {
    process.kill(+pid);
  } catch {
    /* already gone */
  }
}

export function killPort(port) {
  for (const pid of pidsOnPort(port)) killPid(pid);
}
