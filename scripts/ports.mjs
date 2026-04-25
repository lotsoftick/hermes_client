import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const USER_DIR = path.join(os.homedir(), '.hermes_client');
export const USER_ENV_FILE = path.join(USER_DIR, '.env');

export const DEFAULT_API_PORT = 18889;
export const DEFAULT_CLIENT_PORT = 18888;

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Ensure ~/.hermes_client/.env exists. Seeds defaults and backfills any missing keys. */
export function ensureUserEnv() {
  fs.mkdirSync(USER_DIR, { recursive: true });
  if (!fs.existsSync(USER_ENV_FILE)) {
    fs.writeFileSync(
      USER_ENV_FILE,
      [
        '# Hermes Client — user configuration',
        '# Change these values then run: hermes_client restart',
        `API_PORT=${DEFAULT_API_PORT}`,
        `CLIENT_PORT=${DEFAULT_CLIENT_PORT}`,
        '',
      ].join('\n'),
    );
    return;
  }
  const current = parseEnvFile(USER_ENV_FILE);
  const additions = [];
  if (current.API_PORT === undefined) additions.push(`API_PORT=${DEFAULT_API_PORT}`);
  if (current.CLIENT_PORT === undefined) additions.push(`CLIENT_PORT=${DEFAULT_CLIENT_PORT}`);
  if (additions.length) {
    const existing = fs.readFileSync(USER_ENV_FILE, 'utf-8');
    const sep = existing.endsWith('\n') ? '' : '\n';
    fs.writeFileSync(USER_ENV_FILE, `${existing}${sep}${additions.join('\n')}\n`);
  }
}

/** Read port configuration from ~/.hermes_client/.env (creating it first if missing). */
export function readPorts() {
  ensureUserEnv();
  const env = parseEnvFile(USER_ENV_FILE);
  const apiPort = Number(env.API_PORT) || DEFAULT_API_PORT;
  const clientPort = Number(env.CLIENT_PORT) || DEFAULT_CLIENT_PORT;
  return { apiPort, clientPort };
}

/**
 * Derived env vars expected by API and Client code.
 * Use these when spawning child processes so a single user-level .env is
 * the source of truth.
 */
export function portEnv() {
  const { apiPort, clientPort } = readPorts();
  return {
    API_PORT: String(apiPort),
    CLIENT_PORT: String(clientPort),
    PORT: String(apiPort),
    ALLOWED_DOMAIN: `http://localhost:${clientPort}`,
    API_PUBLIC_URL: `http://localhost:${apiPort}`,
    VITE_API_BASE_URL: `http://localhost:${apiPort}/api`,
  };
}
