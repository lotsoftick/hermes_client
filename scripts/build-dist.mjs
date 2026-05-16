import { execFileSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { portEnv, readPorts } from './ports.mjs';
import { NPM_BIN } from './proc.mjs';

const SERVE_MJS = `
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.CLIENT_PORT) || Number(process.env.PORT) || 18888;
const API_PORT = Number(process.env.API_PORT) || 18889;

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

// Service-worker files must not be cached long-term or users get stuck on
// old bundles. Everything else can use the default (immutable hashed names).
const NO_CACHE_FILES = new Set(['sw.js', 'registerSW.js', 'workbox-window.prod.es5.mjs']);

// X-Forwarded-* headers are spoofable by any caller that can reach this
// server, so we ignore them by default and only honor them when the
// operator has explicitly placed this process behind a trusted reverse
// proxy. Mirrors Express's \`app.set('trust proxy')\` opt-in semantics.
const TRUST_PROXY = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.HERMES_TRUST_PROXY || '').toLowerCase()
);

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : (value || '');
}

function hostToHostname(host) {
  try {
    return new URL('http://' + host).hostname || 'localhost';
  } catch {
    return host.replace(/:\\d+$/, '') || 'localhost';
  }
}

function injectRuntimeConfig(html, headers) {
  const forwardedProto = TRUST_PROXY
    ? firstHeader(headers['x-forwarded-proto']).split(',')[0].trim()
    : '';
  const protocol = forwardedProto || 'http';
  const forwardedHost = TRUST_PROXY
    ? firstHeader(headers['x-forwarded-host']).split(',')[0].trim()
    : '';
  const host = forwardedHost || firstHeader(headers.host).trim() || 'localhost';
  const hostname = hostToHostname(host);
  const apiBaseUrl = protocol + '://' + hostname + ':' + API_PORT + '/api';
  const cfg = JSON.stringify({ apiBaseUrl, apiPort: API_PORT });
  const tag = '<script>window.__HERMES_CONFIG__=' + cfg + ';</script>';
  if (html.includes('</head>')) return html.replace('</head>', '  ' + tag + '\\n  </head>');
  return tag + html;
}

function resolveFilePath(url) {
  try {
    const rawPath = String(url || '/').split('?')[0].split('#')[0] || '/';
    const pathname = decodeURIComponent(rawPath);
    const target = pathname === '/' ? '/index.html' : pathname;
    const candidate = path.resolve(DIST, '.' + target);
    if (candidate !== DIST && !candidate.startsWith(DIST + path.sep)) return null;
    return candidate;
  } catch {
    return null;
  }
}

http.createServer((req, res) => {
  const requestedPath = resolveFilePath(req.url);
  if (!requestedPath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let filePath = requestedPath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    if (mime === 'text/html') {
      const html = fs.readFileSync(filePath, 'utf-8');
      const out = injectRuntimeConfig(html, req.headers);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(out);
      return;
    }
    const data = fs.readFileSync(filePath);
    const headers = { 'Content-Type': mime };
    if (NO_CACHE_FILES.has(path.basename(filePath))) {
      headers['Cache-Control'] = 'no-cache';
      headers['Service-Worker-Allowed'] = '/';
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('client listening on port ' + PORT);
});
`.trimStart();

export function deploy() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const API_SRC = path.join(root, 'api');
  const CLIENT_SRC = path.join(root, 'client');

  const dist = path.join(os.homedir(), '.hermes_client');
  const apiDist = path.join(dist, 'api');
  const clientDist = path.join(dist, 'client');
  const dataDir = path.join(dist, 'data');

  function run(cmd, args = [], cwd = root) {
    try {
      execFileSync(cmd, args, { cwd, stdio: 'pipe' });
    } catch (err) {
      const output = err.stdout?.toString() || '';
      const stderr = err.stderr?.toString() || '';
      if (output) process.stderr.write(output);
      if (stderr) process.stderr.write(stderr);
      throw err;
    }
  }

  const { apiPort, clientPort } = readPorts();
  const buildEnv = { ...process.env, ...portEnv() };

  process.stdout.write('📦 Installing dependencies...\n');
  run(NPM_BIN, ['ci', '--include=dev'], API_SRC);
  run(NPM_BIN, ['ci', '--include=dev'], CLIENT_SRC);

  process.stdout.write('🔨 Building...\n');
  run(NPM_BIN, ['run', 'build'], API_SRC);
  // VITE_API_BASE_URL is embedded into the bundle at build time
  try {
    execFileSync(NPM_BIN, ['run', 'build'], { cwd: CLIENT_SRC, stdio: 'pipe', env: buildEnv });
  } catch (err) {
    const output = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    if (output) process.stderr.write(output);
    if (stderr) process.stderr.write(stderr);
    throw err;
  }

  mkdirSync(apiDist, { recursive: true });
  mkdirSync(clientDist, { recursive: true });

  cpSync(path.join(API_SRC, 'build'), path.join(apiDist, 'build'), {
    recursive: true,
    force: true,
  });
  // The Python PTY bridge replaces our previous `node-pty` dependency.
  // Copy it next to the compiled app code so the runtime resolver finds
  // it via `path.resolve(__dirname, '../../../pty-bridge.py')`.
  const ptyBridgeSrc = path.join(API_SRC, 'pty-bridge.py');
  if (existsSync(ptyBridgeSrc)) {
    const ptyBridgeDest = path.join(apiDist, 'pty-bridge.py');
    cpSync(ptyBridgeSrc, ptyBridgeDest, { force: true });
    try {
      chmodSync(ptyBridgeDest, 0o755);
    } catch {
      /* permission setting is best-effort; python3 doesn't need +x to run it */
    }
  } else {
    process.stdout.write('  ⚠️  pty-bridge.py missing — interactive terminals will not work\n');
  }
  cpSync(path.join(API_SRC, 'package.json'), path.join(apiDist, 'package.json'));
  cpSync(path.join(API_SRC, 'package-lock.json'), path.join(apiDist, 'package-lock.json'));

  cpSync(path.join(CLIENT_SRC, 'dist'), path.join(clientDist, 'dist'), {
    recursive: true,
    force: true,
  });

  mkdirSync(dataDir, { recursive: true });
  const canonicalDbPath = path.join(dataDir, 'hermes.sqlite');

  const envDist = path.join(apiDist, '.env');

  // We seed only what the runtime can't figure out on its own.
  //   - DB_PATH and PORT must match where the install actually lives.
  //   - JWT_SECRET must persist across reinstalls or every login token
  //     gets invalidated, so we generate it once.
  //   - ALLOWED_DOMAIN / API_PUBLIC_URL are deliberately omitted: the
  //     API has a permissive CORS default and derives public URLs from
  //     the request host. Users who want strict CORS set
  //     `ALLOWED_DOMAIN=...` and `HERMES_STRICT_CORS=1` themselves.
  const seedDefaults = {
    NODE_ENV: 'production',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    DB_PATH: canonicalDbPath,
    PORT: String(apiPort),
  };
  const overrides = {
    DB_PATH: canonicalDbPath,
    PORT: String(apiPort),
  };

  if (!existsSync(envDist)) {
    writeFileSync(
      envDist,
      Object.entries(seedDefaults)
        .map(([k, v]) => `${k}=${v}`)
        .concat('')
        .join('\n')
    );
  } else {
    const seen = new Set();
    const lines = readFileSync(envDist, 'utf-8').split('\n');
    const updated = lines.map((line) => {
      for (const [k, v] of Object.entries(overrides)) {
        if (line.startsWith(`${k}=`)) {
          seen.add(k);
          return `${k}=${v}`;
        }
      }
      return line;
    });
    for (const [k, v] of Object.entries(overrides)) {
      if (!seen.has(k)) updated.push(`${k}=${v}`);
    }
    writeFileSync(envDist, updated.join('\n'));
  }

  if (!existsSync(canonicalDbPath)) {
    const legacyDb = [
      path.join(apiDist, 'build', 'data', 'hermes.sqlite'),
      path.join(apiDist, 'data', 'hermes.sqlite'),
    ].find((p) => existsSync(p));
    if (legacyDb) cpSync(legacyDb, canonicalDbPath);
  }

  writeFileSync(path.join(clientDist, 'serve.mjs'), SERVE_MJS);

  const runnerSrc = path.join(root, 'scripts', 'service-runner.mjs');
  if (existsSync(runnerSrc)) {
    cpSync(runnerSrc, path.join(dist, 'service-runner.mjs'), { force: true });
  }

  const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
  const updateDir = path.join(dist, 'update');
  const repoUrl = rootPkg.repository?.url || '';
  if (!repoUrl) {
    process.stdout.write('  ℹ️  No repository.url in package.json; updates from git are disabled.\n');
  }

  if (repoUrl && !existsSync(path.join(updateDir, '.git'))) {
    process.stdout.write('📥 Setting up update source...\n');
    try {
      execFileSync(
        'git',
        ['clone', '--depth', '1', repoUrl, updateDir],
        { stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
      );
    } catch {
      process.stdout.write('  ⚠️  Could not clone update source (updates will use local repo)\n');
    }
  }

  const sourceRepo = existsSync(path.join(updateDir, 'package.json')) ? updateDir : root;
  writeFileSync(
    path.join(dist, 'meta.json'),
    JSON.stringify({
      version: rootPkg.version,
      sourceRepo,
      // Surfaced to `updateService.readLocalMeta()` so production installs
      // can poll the upstream `package.json` for new versions.
      repoHttpsUrl: repoUrl || null,
    })
  );

  process.stdout.write('📦 Installing production dependencies...\n');
  run(NPM_BIN, ['ci', '--omit=dev'], apiDist);
}
