/**
 * Supervises API + static UI server under one launchd job.
 * Ports come from ~/.hermes_client/.env (API_PORT, CLIENT_PORT).
 * Installed to ~/.hermes_client/service-runner.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.dirname(fileURLToPath(import.meta.url));
const API_DIST = path.join(DIST, 'api');
const CLIENT_DIST = path.join(DIST, 'client');
const USER_ENV = path.join(DIST, '.env');
const node = process.execPath;

function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, 'utf-8').split('\n')) {
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

const userEnv = parseEnvFile(USER_ENV);
const apiPort = Number(userEnv.API_PORT) || 18889;
const clientPort = Number(userEnv.CLIENT_PORT) || 18888;
// We deliberately do NOT force `ALLOWED_DOMAIN` here. Pinning it to
// `http://localhost:${clientPort}` would block legitimate access from
// the user's other devices over Tailscale / LAN. The API ships a
// permissive CORS default; users who want a strict allowlist set
// ALLOWED_DOMAIN + HERMES_STRICT_CORS=1 in ~/.hermes_client/.env or
// api/.env and they win.
const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  API_PORT: String(apiPort),
  CLIENT_PORT: String(clientPort),
  PORT: String(apiPort),
};

const children = [];

function killAll(sig = 'SIGTERM') {
  for (const c of children) {
    try {
      c.kill(sig);
    } catch {
      /* ignore */
    }
  }
}

process.on('SIGTERM', () => {
  killAll();
  process.exit(0);
});
process.on('SIGINT', () => {
  killAll();
  process.exit(0);
});

const api = spawn(node, ['build/src/app.js'], {
  cwd: API_DIST,
  env: childEnv,
  stdio: 'inherit',
});

const client = spawn(node, ['serve.mjs'], {
  cwd: CLIENT_DIST,
  env: { ...childEnv, PORT: String(clientPort) },
  stdio: 'inherit',
});

children.push(api, client);

function onChildExit(label, code, signal) {
  const err = signal ? 1 : code ?? 0;
  console.error(`[hermes] ${label} exited${signal ? ` (signal ${signal})` : ` (code ${code})`}`);
  killAll();
  process.exit(err !== 0 ? 1 : 0);
}

api.on('exit', (code, signal) => onChildExit('api', code, signal));
client.on('exit', (code, signal) => onChildExit('client', code, signal));
