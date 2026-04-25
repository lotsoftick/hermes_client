/* eslint-disable no-console */
import { IPty, spawn as spawnPty } from 'node-pty';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { HERMES_BIN } from '../hermes/paths';
import { JwtPayload } from '../../@types/blacklist';

/**
 * node-pty ships a `spawn-helper` binary that must be executable, but some
 * npm/registry/CI flows strip the +x bit during extraction. Without it every
 * `pty.spawn()` fails with the cryptic "posix_spawnp failed". Restore +x on
 * boot so the install self-heals.
 */
function ensureSpawnHelperExecutable(): void {
  const platformDir = `${process.platform}-${process.arch}`;
  const helper = path.resolve(
    __dirname,
    '../../../node_modules/node-pty/prebuilds',
    platformDir,
    'spawn-helper'
  );
  try {
    const stat = fs.statSync(helper);
    const isExec = (stat.mode & 0o111) !== 0;
    if (!isExec) {
      fs.chmodSync(helper, 0o755);
      console.log(`[pty] restored +x on ${helper}`);
    }
  } catch {
    /* missing or not applicable on this platform; ignore */
  }
}

/**
 * Ensure the PATH inherited by child processes also includes the user-local
 * install dirs we use to find `hermes`. This matters when the API was started
 * from a launcher whose PATH is minimal (Finder, IDE, systemd, etc.).
 */
function buildChildPath(): string {
  const home = os.homedir();
  const extras = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.hermes', 'hermes-agent', 'venv', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const merged = Array.from(new Set([...extras, ...current]));
  return merged.join(path.delimiter);
}

/** Subcommands the user is allowed to launch from the browser. */
const ALLOWED_SUBCOMMANDS = new Set([
  'model',
  'login',
  'auth',
  'config',
  'setup',
  'profile',
  'doctor',
  'status',
]);

interface PtyConnectParams {
  /** Hermes profile to scope the command to (sets HERMES_PROFILE). */
  profile?: string;
  /** First positional arg, e.g. "setup" or "config". Restricted by ALLOWED_SUBCOMMANDS. */
  cmd: string;
  /** Optional terminal size for the initial PTY. */
  cols?: number;
  rows?: number;
}

interface ClientMessage {
  type: 'input' | 'resize';
  data?: string;
  cols?: number;
  rows?: number;
}

function parseQuery(req: http.IncomingMessage): URL {
  const host = req.headers.host || 'localhost';
  return new URL(req.url || '/', `http://${host}`);
}

function authenticate(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    if (!payload.id || !payload.valid) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseConnectParams(url: URL): PtyConnectParams | { error: string } {
  const cmd = (url.searchParams.get('cmd') || '').trim();
  if (!cmd) return { error: 'Missing cmd' };
  if (!ALLOWED_SUBCOMMANDS.has(cmd)) return { error: `Subcommand '${cmd}' not allowed` };
  const profile = (url.searchParams.get('profile') || '').trim() || undefined;
  if (profile && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(profile)) {
    return { error: 'Invalid profile name' };
  }
  const cols = Number(url.searchParams.get('cols')) || 100;
  const rows = Number(url.searchParams.get('rows')) || 30;
  return { cmd, profile, cols, rows };
}

function buildArgs(params: PtyConnectParams): string[] {
  const args: string[] = [];
  if (params.profile && params.profile !== 'default') args.push('-p', params.profile);
  args.push(params.cmd);
  return args;
}

/**
 * Bridges a node-pty process to a WebSocket. Closes everything if either side
 * goes away. The wire format is intentionally minimal: server pushes raw PTY
 * bytes as binary frames; the client sends JSON messages for input/resize.
 */
function bridge(ws: WebSocket, pty: IPty): void {
  let alive = true;

  const cleanup = (): void => {
    if (!alive) return;
    alive = false;
    try {
      pty.kill();
    } catch {
      /* noop */
    }
    if (ws.readyState === WebSocket.OPEN) ws.close();
  };

  pty.onData((data) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(data);
  });

  pty.onExit(({ exitCode, signal }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      ws.close(1000, 'process exited');
    }
    alive = false;
  });

  ws.on('message', (raw) => {
    if (!alive) return;
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === 'input' && typeof msg.data === 'string') {
        pty.write(msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        pty.resize(Math.max(20, msg.cols), Math.max(5, msg.rows));
      }
    } catch {
      /* ignore malformed frames */
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

/**
 * Attach a `/ws/pty` upgrade handler to an existing http server.
 * Validates JWT (?token=...), restricts allowed subcommands, then
 * spawns `hermes -p <profile> <cmd>` in a real PTY and proxies it.
 */
function attachPtyWebSocket(server: http.Server): void {
  ensureSpawnHelperExecutable();
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = parseQuery(req);
    if (url.pathname !== '/ws/pty') return;

    const token = url.searchParams.get('token');
    if (!authenticate(token)) {
      console.warn(`[pty] upgrade rejected: invalid token (${url.search ? 'token=…' : 'no token'})`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const params = parseConnectParams(url);
    if ('error' in params) {
      console.warn(`[pty] upgrade rejected: ${params.error}`);
      socket.write(`HTTP/1.1 400 Bad Request\r\n\r\n${params.error}`);
      socket.destroy();
      return;
    }

    const args = buildArgs(params);
    console.log(`[pty] upgrade ok → spawning: ${HERMES_BIN} ${args.join(' ')}`);

    wss.handleUpgrade(req, socket, head, (ws) => {
      let pty: IPty;
      try {
        pty = spawnPty(HERMES_BIN, args, {
          name: 'xterm-256color',
          cols: params.cols ?? 100,
          rows: params.rows ?? 30,
          cwd: process.env.HOME || process.cwd(),
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            PATH: buildChildPath(),
          } as Record<string, string>,
        });
        console.log(`[pty] spawned pid=${pty.pid} for cmd=${params.cmd}`);
      } catch (err) {
        const message = (err as Error).message || String(err);
        console.error(`[pty] spawn failed: ${message}`);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Failed to spawn '${HERMES_BIN}': ${message}`,
          })
        );
        ws.close(1011, 'spawn failed');
        return;
      }
      bridge(ws, pty);
    });
  });

  console.log(`[pty] /ws/pty WebSocket handler attached (hermes bin: ${HERMES_BIN})`);
}

export { attachPtyWebSocket };
export default attachPtyWebSocket;
