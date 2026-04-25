import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { portEnv, readPorts } from './ports.mjs';
import { NPM_BIN } from './proc.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'api');
const CLIENT_DIR = path.join(ROOT, 'client');

function run(cmd, args = [], cwd = ROOT) {
  execFileSync(cmd, args, { cwd, stdio: 'pipe' });
}

function prefix(stream, tag) {
  stream.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (line) process.stdout.write(`[${tag}] ${line}\n`);
    }
  });
}

// 1. Setup env (idempotent)
run('node', [path.join(ROOT, 'scripts', 'setup.js')]);

// 2. Install dependencies if needed
if (!fs.existsSync(path.join(API_DIR, 'node_modules'))) {
  process.stdout.write('📦 Installing API dependencies...\n');
  run(NPM_BIN, ['install'], API_DIR);
}
if (!fs.existsSync(path.join(CLIENT_DIR, 'node_modules'))) {
  process.stdout.write('📦 Installing Client dependencies...\n');
  run(NPM_BIN, ['install'], CLIENT_DIR);
}

// 3. Start both services in dev mode
const { apiPort, clientPort } = readPorts();
const childEnv = { ...process.env, ...portEnv() };

console.log();
console.log('  🔧 Starting in development mode...');
console.log(`  🌐 Client: http://localhost:${clientPort}`);
console.log(`  🧩 API:    http://localhost:${apiPort}`);
console.log('  ⚙️  Ports: ~/.hermes_client/.env');
console.log();

const api = spawn(NPM_BIN, ['run', 'dev'], { cwd: API_DIR, stdio: 'pipe', env: childEnv });
const client = spawn(NPM_BIN, ['run', 'dev'], { cwd: CLIENT_DIR, stdio: 'pipe', env: childEnv });

prefix(api.stdout, 'API');
prefix(api.stderr, 'API');
prefix(client.stdout, 'CLIENT');
prefix(client.stderr, 'CLIENT');

function shutdown() {
  api.kill();
  client.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

api.on('close', (code) => {
  console.log(`[API] exited with code ${code}`);
  client.kill();
});

client.on('close', (code) => {
  console.log(`[CLIENT] exited with code ${code}`);
  api.kill();
});
