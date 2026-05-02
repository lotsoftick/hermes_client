/* eslint-disable no-console */
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { URL } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { HERMES_BIN } from '../hermes/paths';
import { consumePtyTicket } from './tickets';

/**
 * Interactive terminals are powered by a tiny Python PTY bridge
 * (`api/pty-bridge.py`) instead of the `node-pty` native module. Hermes
 * itself is a Python CLI, so `python3` is always installed on every host
 * where this client runs — using the stdlib `pty` module gives us a
 * portable, build-free terminal layer with no native binaries that can
 * lose their +x bit on deploy ("posix_spawnp failed").
 *
 * Wire protocol (see `pty-bridge.py` for the source of truth):
 *   - bridge stdout  → raw PTY bytes (forwarded straight to the WebSocket)
 *   - bridge stderr  → newline-delimited JSON status events
 *       {"t":"ready","pid":N} | {"t":"exit","code":N,"signal":N|null}
 *       {"t":"error","msg":"..."}
 *   - bridge stdin   → newline-delimited JSON commands FROM us
 *       {"t":"in","d":"<utf8>"} | {"t":"resize","c":N,"r":N} | {"t":"kill"}
 */

/** Locate `pty-bridge.py` in either dev (`api/`) or prod (`api/build/`). */
function findPtyBridge(): string {
  const candidates = [
    path.resolve(__dirname, '../../../pty-bridge.py'),
    path.resolve(__dirname, '../../../../pty-bridge.py'),
  ];
  const hit = candidates.find((c) => fs.existsSync(c));
  if (hit) return hit;
  throw new Error(
    `pty-bridge.py not found; tried: ${candidates.join(', ')}. ` +
      `Set HERMES_CLIENT_PTY_BRIDGE to the absolute path.`
  );
}

/** Resolve a usable `python3` interpreter. The bridge only uses stdlib. */
function resolvePython(): string {
  const fromEnv = process.env.HERMES_CLIENT_PYTHON;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const hit = [
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
  ].find((p) => fs.existsSync(p));
  return hit ?? 'python3';
}

/**
 * Augment the inherited PATH with the user-local install dirs we use to
 * find `hermes`. Matters when the API was started from a launcher whose
 * PATH is minimal (Finder, IDE, systemd, etc.).
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
  return Array.from(new Set([...extras, ...current])).join(path.delimiter);
}

const PTY_BRIDGE = process.env.HERMES_CLIENT_PTY_BRIDGE || findPtyBridge();
const PYTHON_BIN = resolvePython();

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
  /** Hermes profile to scope the command to (`-p <profile>`). */
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

interface BridgeEvent {
  t: 'ready' | 'exit' | 'error';
  pid?: number;
  code?: number | null;
  signal?: number | null;
  msg?: string;
}

function parseQuery(req: http.IncomingMessage): URL {
  const host = req.headers.host || 'localhost';
  return new URL(req.url || '/', `http://${host}`);
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

function buildHermesArgs(params: PtyConnectParams): string[] {
  const args: string[] = [];
  if (params.profile && params.profile !== 'default') args.push('-p', params.profile);
  args.push(params.cmd);
  return args;
}

/** Consume any complete JSON lines in `buf`, return the residual tail. */
function processStderrLines(buf: string, onEvent: (e: BridgeEvent) => void): string {
  let cursor = 0;
  let nl = buf.indexOf('\n', cursor);
  while (nl >= 0) {
    const line = buf.slice(cursor, nl).trim();
    cursor = nl + 1;
    if (line) {
      try {
        onEvent(JSON.parse(line) as BridgeEvent);
      } catch {
        // Non-JSON noise from python (warnings, tracebacks). Surface them
        // to our log so spawn failures are diagnosable.
        console.warn(`[pty-bridge] ${line}`);
      }
    }
    nl = buf.indexOf('\n', cursor);
  }
  return buf.slice(cursor);
}

/**
 * Bridge the Python PTY child to a WebSocket. Closes everything if either
 * side goes away.
 */
function bridge(ws: WebSocket, child: ChildProcessWithoutNullStreams, label: string): void {
  let alive = true;
  let exitSent = false;

  const sendCmd = (obj: Record<string, unknown>): void => {
    if (!child.stdin.writable) return;
    try {
      child.stdin.write(`${JSON.stringify(obj)}\n`);
    } catch {
      /* noop */
    }
  };

  const sendExit = (exitCode: number | null, sig: number | string | null): void => {
    if (exitSent) return;
    exitSent = true;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode, signal: sig }));
      ws.close(1000, 'process exited');
    }
  };

  const cleanup = (): void => {
    if (!alive) return;
    alive = false;
    sendCmd({ t: 'kill' });
    try {
      child.kill('SIGTERM');
    } catch {
      /* noop */
    }
    if (ws.readyState === WebSocket.OPEN) ws.close();
  };

  child.stdout.on('data', (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
  });

  let stderrBuf = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrBuf += chunk.toString('utf8');
    stderrBuf = processStderrLines(stderrBuf, (event) => {
      if (event.t === 'ready') {
        console.log(`[pty] ${label} ready (pid=${event.pid ?? '?'})`);
      } else if (event.t === 'error') {
        console.error(`[pty] ${label} bridge error: ${event.msg}`);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', error: event.msg ?? 'bridge error' }));
        }
      } else if (event.t === 'exit') {
        sendExit(event.code ?? null, event.signal ?? null);
        alive = false;
      }
    });
  });

  child.on('exit', (code, sig) => {
    // Flush any tail bytes from stderr before reporting exit.
    if (stderrBuf.trim()) {
      processStderrLines(`${stderrBuf}\n`, (event) => {
        if (event.t === 'exit') sendExit(event.code ?? null, event.signal ?? null);
      });
      stderrBuf = '';
    }
    sendExit(code ?? null, sig ?? null);
    alive = false;
  });

  child.on('error', (err) => {
    console.error(`[pty] ${label} bridge spawn error: ${err.message}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', error: err.message }));
      ws.close(1011, 'bridge spawn failed');
    }
    alive = false;
  });

  ws.on('message', (raw) => {
    if (!alive) return;
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      if (msg.type === 'input' && typeof msg.data === 'string') {
        sendCmd({ t: 'in', d: msg.data });
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        sendCmd({ t: 'resize', c: Math.max(20, msg.cols), r: Math.max(5, msg.rows) });
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
 * Validates a short-lived one-time ticket, restricts allowed subcommands, then
 * spawns `python3 pty-bridge.py hermes -p <profile> <cmd>` and proxies
 * the resulting PTY to the WebSocket.
 */
function attachPtyWebSocket(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = parseQuery(req);
    if (url.pathname !== '/ws/pty') return;

    const ticket = url.searchParams.get('ticket');
    if (!consumePtyTicket(ticket)) {
      console.warn('[pty] upgrade rejected: invalid or expired ticket');
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

    const args = buildHermesArgs(params);
    const label = `${HERMES_BIN} ${args.join(' ')}`;
    console.log(`[pty] upgrade ok → spawning bridge: ${label}`);

    wss.handleUpgrade(req, socket, head, (ws) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(PYTHON_BIN, [PTY_BRIDGE, HERMES_BIN, ...args], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.env.HOME || process.cwd(),
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLUMNS: String(params.cols ?? 100),
            LINES: String(params.rows ?? 30),
            PATH: buildChildPath(),
          },
        });
      } catch (err) {
        const message = (err as Error).message || String(err);
        console.error(`[pty] bridge spawn failed: ${message}`);
        ws.send(
          JSON.stringify({
            type: 'error',
            error: `Failed to spawn pty-bridge: ${message}`,
          })
        );
        ws.close(1011, 'spawn failed');
        return;
      }

      // Push the initial terminal size as the very first command so the
      // child's PTY matches what xterm.js measured before any output.
      if (params.cols && params.rows && child.stdin.writable) {
        try {
          child.stdin.write(
            `${JSON.stringify({ t: 'resize', c: params.cols, r: params.rows })}\n`
          );
        } catch {
          /* noop */
        }
      }

      bridge(ws, child, label);
    });
  });

  console.log(`[pty] /ws/pty handler attached`);
  console.log(`[pty]   python: ${PYTHON_BIN}`);
  console.log(`[pty]   bridge: ${PTY_BRIDGE}`);
  console.log(`[pty]   hermes: ${HERMES_BIN}`);
}

export { attachPtyWebSocket };
export default attachPtyWebSocket;
