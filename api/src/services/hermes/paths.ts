import path from 'path';
import os from 'os';
import fs from 'fs';

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
const HERMES_CLIENT_HOME = path.join(os.homedir(), '.hermes_client');
const UPLOADS_ROOT = process.env.HERMES_CLIENT_UPLOADS_DIR || path.join(HERMES_CLIENT_HOME, 'uploads');

/**
 * Resolve the `hermes` executable's absolute path.
 *
 * We can't always rely on PATH inheritance — when the API is started from a
 * launcher (Finder, Cursor, systemd, etc.) PATH often doesn't include the
 * common per-user install locations like `~/.local/bin`. So we explicitly
 * search PATH plus a curated list of known install dirs and fall back to the
 * bare name only as a last resort.
 */
function resolveHermesBin(): string {
  if (process.env.HERMES_BIN && fs.existsSync(process.env.HERMES_BIN)) {
    return process.env.HERMES_BIN;
  }

  const home = os.homedir();
  const candidates: string[] = [];

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  pathDirs.forEach((dir) => candidates.push(path.join(dir, 'hermes')));

  const fallbackDirs = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.hermes', 'hermes-agent', 'venv', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
  ];
  fallbackDirs.forEach((dir) => candidates.push(path.join(dir, 'hermes')));

  const found = candidates.find((p) => {
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });

  return found || process.env.HERMES_BIN || 'hermes';
}

const HERMES_BIN = resolveHermesBin();

/** Default profile lives at ~/.hermes (no /profiles/<name> wrapper). */
export function profileHome(profile: string | undefined | null): string {
  if (!profile || profile === 'default') return HERMES_HOME;
  return path.join(HERMES_HOME, 'profiles', profile);
}

/** ~/.hermes_client/uploads/<conversationId>/ */
export function conversationUploadsDir(conversationId: number | string): string {
  const dir = path.join(UPLOADS_ROOT, String(conversationId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export { HERMES_HOME, HERMES_BIN, HERMES_CLIENT_HOME, UPLOADS_ROOT };
