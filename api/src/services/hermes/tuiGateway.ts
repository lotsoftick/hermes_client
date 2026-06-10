/* eslint-disable no-console */
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Response } from 'express';
import { HERMES_BIN } from './paths';
import { claimSessionId } from './sessionClaims';
import type { ChatOptions, ChatStreamResult } from './chat';

/**
 * Structured chat streaming over the Hermes TUI-gateway JSON-RPC protocol.
 *
 * `hermes chat -Q` (the legacy pipeline in `chat.ts`) prints nothing until
 * the whole turn is done — the agent suppresses its streaming callbacks in
 * quiet mode — so the web UI shows a blank bubble while tools run and then
 * everything pops in at once. Hermes' official programmatic surface for
 * fine-grained streaming is `tui_gateway` (the protocol the bundled TUI and
 * desktop app speak): a `python -m tui_gateway.entry` subprocess exchanging
 * newline-delimited JSON-RPC on stdio that emits typed events per turn —
 * `message.delta`, `thinking.delta`, `reasoning.delta`, `tool.start`,
 * `tool.complete`, `message.complete`, `error`.
 *
 * This module maintains one shared gateway subprocess (lazily spawned,
 * reaped after idling) and exposes `streamChatViaGateway`, which mirrors the
 * `streamChat` contract from `chat.ts` but forwards tool/thinking activity
 * to the SSE stream as typed events. Any failure before the first byte is
 * emitted throws, and the caller falls back to the legacy `-Q` pipeline.
 *
 * Two protocol details worth noting:
 *  - `session.create` returns the persisted session id (`stored_session_id`,
 *    same `YYYYMMDD_HHMMSS_hex` format the CLI uses) up front — so on this
 *    path we never need the "latest session since" heuristic at all.
 *  - Approvals fail *closed* in gateway context (the CLI's non-TTY path
 *    fails open). To preserve the existing behaviour of `hermes chat -Q`
 *    spawned without a TTY, we auto-approve each `approval.request` for
 *    this run only (choice `once`).
 */

const READY_TIMEOUT_MS = Number(process.env.HERMES_GATEWAY_READY_TIMEOUT_MS) || 30_000;
const RPC_TIMEOUT_MS = 120_000;
/** Hard ceiling on a single turn; image-gen/tool loops stay well under this. */
const TURN_TIMEOUT_MS = Number(process.env.HERMES_GATEWAY_TURN_TIMEOUT_MS) || 60 * 60_000;
const IDLE_SHUTDOWN_MS = 15 * 60_000;

interface GatewayEvent {
  type: string;
  session_id: string;
  payload?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/** `true` unless explicitly disabled via HERMES_STRUCTURED_CHAT=0/false/off. */
export function structuredChatEnabled(): boolean {
  const raw = (process.env.HERMES_STRUCTURED_CHAT ?? '').toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

let cachedShebang: string | null | undefined;
/** Python interpreter from the `hermes` launcher's `#!` line, if readable. */
function shebangPython(): string | null {
  if (cachedShebang !== undefined) return cachedShebang;
  cachedShebang = null;
  try {
    const fd = fs.openSync(HERMES_BIN, 'r');
    const buf = Buffer.alloc(256);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const [firstLine] = buf.toString('utf-8', 0, n).split('\n');
    const m = firstLine.match(/^#!\s*(\S+python[\d.]*)\s*$/);
    if (m && fs.existsSync(m[1])) [, cachedShebang] = m;
  } catch {
    /* unreadable launcher — fall through to the venv candidates */
  }
  return cachedShebang;
}

/** Hermes agent checkout root — the cwd `tui_gateway.entry` must run from. */
function resolveAgentRoot(): string | null {
  const shebang = shebangPython();
  const candidates = [
    process.env.HERMES_AGENT_ROOT,
    path.join(os.homedir(), '.hermes', 'hermes-agent'),
    // Derive from the launcher script's shebang: the venv lives inside the
    // checkout (`<root>/venv/bin/python3`), so two dirs up is the root.
    shebang ? path.dirname(path.dirname(path.dirname(shebang))) : null,
  ];
  return (
    candidates.find(
      (root) => root && fs.existsSync(path.join(root, 'tui_gateway', 'entry.py'))
    ) ?? null
  );
}

function resolvePython(root: string): string | null {
  const candidates = [
    process.env.HERMES_PYTHON,
    shebangPython(),
    path.join(root, 'venv', 'bin', 'python3'),
    path.join(root, '.venv', 'bin', 'python3'),
    path.join(root, 'venv', 'bin', 'python'),
    path.join(root, '.venv', 'bin', 'python'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

class GatewayConnection {
  private child: ChildProcessWithoutNullStreams;

  private pending = new Map<string, PendingRequest>();

  private eventHandlers = new Set<(evt: GatewayEvent) => void>();

  private nextId = 1;

  private stdoutBuf = '';

  private stderrTail = '';

  private disposed = false;

  readonly ready: Promise<void>;

  activeTurns = 0;

  lastActivityAt = Date.now();

  constructor(python: string, root: string) {
    this.child = spawn(python, ['-m', 'tui_gateway.entry'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HERMES_PYTHON_SRC_ROOT: root,
        HERMES_NO_COLOR: '1',
        NO_COLOR: '1',
        TERM: 'dumb',
      },
    }) as ChildProcessWithoutNullStreams;

    this.child.stdout.setEncoding('utf-8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr.setEncoding('utf-8');
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4_000);
    });

    this.ready = new Promise<void>((resolve, reject) => {
      let unsubscribe: () => void = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        const stderrNote = this.stderrTail ? `; stderr: ${this.stderrTail.trim()}` : '';
        reject(new Error(`tui_gateway did not become ready within ${READY_TIMEOUT_MS}ms${stderrNote}`));
        this.dispose();
      }, READY_TIMEOUT_MS);
      unsubscribe = this.onEvent((evt) => {
        if (evt.type === 'gateway.ready') {
          clearTimeout(timer);
          unsubscribe();
          resolve();
        }
      });
      this.child.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
        this.dispose();
      });
      this.child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error(`tui_gateway exited during startup; stderr: ${this.stderrTail.trim()}`));
        this.dispose();
      });
    });
    // Surface the rejection somewhere even if no turn is awaiting it.
    this.ready.catch((err) => console.error('[tui-gateway] startup failed:', err.message));

    this.child.on('exit', (code) => {
      if (!this.disposed) {
        console.error(`[tui-gateway] process exited unexpectedly (code ${code})`);
      }
      this.dispose();
    });
  }

  get alive(): boolean {
    return !this.disposed && this.child.exitCode === null && !this.child.killed;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuf += chunk;
    for (;;) {
      const nl = this.stdoutBuf.indexOf('\n');
      if (nl < 0) break;
      const line = this.stdoutBuf.slice(0, nl).trim();
      this.stdoutBuf = this.stdoutBuf.slice(nl + 1);
      if (line) this.handleFrame(line);
    }
  }

  private handleFrame(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return; // stray non-JSON line — ignore
    }
    if (msg.method === 'event' && msg.params) {
      const evt = msg.params as unknown as GatewayEvent;
      this.eventHandlers.forEach((h) => {
        try {
          h(evt);
        } catch (err) {
          console.error('[tui-gateway] event handler threw:', err);
        }
      });
    } else if (msg.id !== undefined && this.pending.has(String(msg.id))) {
      const req = this.pending.get(String(msg.id))!;
      this.pending.delete(String(msg.id));
      clearTimeout(req.timer);
      const errObj = msg.error as { message?: string; code?: number } | undefined;
      if (errObj) {
        req.reject(new Error(errObj.message || `gateway RPC error ${errObj.code}`));
      } else {
        req.resolve((msg.result as Record<string, unknown>) ?? {});
      }
    }
  }

  request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = RPC_TIMEOUT_MS
  ): Promise<Record<string, unknown>> {
    if (!this.alive) return Promise.reject(new Error('tui_gateway process is not running'));
    this.lastActivityAt = Date.now();
    const id = String(this.nextId);
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`gateway RPC ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const frame = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
      this.child.stdin.write(frame, (err) => {
        if (err) {
          const req = this.pending.get(id);
          if (req) {
            this.pending.delete(id);
            clearTimeout(req.timer);
            req.reject(err);
          }
        }
      });
    });
  }

  onEvent(handler: (evt: GatewayEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.forEach((req) => {
      clearTimeout(req.timer);
      req.reject(new Error('tui_gateway connection closed'));
    });
    this.pending.clear();
    this.eventHandlers.clear();
    if (this.child.exitCode === null && !this.child.killed) {
      try {
        this.child.kill('SIGTERM');
      } catch {
        /* noop */
      }
    }
  }
}

let connection: GatewayConnection | null = null;
let idleReaper: NodeJS.Timeout | null = null;

function ensureIdleReaper(): void {
  if (idleReaper) return;
  idleReaper = setInterval(() => {
    if (
      connection &&
      connection.alive &&
      connection.activeTurns === 0 &&
      Date.now() - connection.lastActivityAt > IDLE_SHUTDOWN_MS
    ) {
      connection.dispose();
      connection = null;
    }
  }, 60_000);
  idleReaper.unref();
}

process.on('exit', () => {
  connection?.dispose();
});

async function getConnection(): Promise<GatewayConnection> {
  if (connection && connection.alive) {
    await connection.ready;
    return connection;
  }
  const root = resolveAgentRoot();
  if (!root) throw new Error('hermes-agent checkout not found (set HERMES_AGENT_ROOT)');
  const python = resolvePython(root);
  if (!python) throw new Error('hermes venv python not found (set HERMES_PYTHON)');
  connection = new GatewayConnection(python, root);
  ensureIdleReaper();
  await connection.ready;
  return connection;
}

function writeSse(res: Response, payload: object): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * Run one chat turn through the TUI gateway, forwarding typed events to the
 * SSE stream. Resolves with the same `ChatStreamResult` shape the legacy
 * pipeline returns; the caller persists and closes the response.
 *
 * Throws (for caller fallback) only while nothing has been written to the
 * SSE stream yet; once the first event is out, failures resolve as an error
 * result instead so the client never sees a double-streamed turn.
 */
export async function streamChatViaGateway(
  res: Response,
  message: string,
  opts: ChatOptions & { resumeSessionId: string | null }
): Promise<ChatStreamResult> {
  const conn = await getConnection();
  const profile = opts.profile && opts.profile !== 'default' ? opts.profile : undefined;

  conn.activeTurns += 1;
  let unsubscribe: (() => void) | null = null;
  try {
    let gwSid: string;
    let storedSessionId: string;
    if (opts.resumeSessionId) {
      const resumed = await conn.request('session.resume', {
        session_id: opts.resumeSessionId,
        cols: 200,
        ...(profile ? { profile } : {}),
      });
      gwSid = String(resumed.session_id ?? '');
      storedSessionId = opts.resumeSessionId;
    } else {
      const created = await conn.request('session.create', {
        cols: 200,
        cwd: process.cwd(),
        ...(profile ? { profile } : {}),
      });
      gwSid = String(created.session_id ?? '');
      storedSessionId = String(created.stored_session_id ?? '');
    }
    if (!gwSid || !storedSessionId) {
      throw new Error('gateway did not return a usable session');
    }
    // Make the session id visible to the legacy heuristic immediately so a
    // concurrent CLI-path chat on the same profile can't claim it.
    claimSessionId(storedSessionId);

    await (opts.imagePaths ?? []).reduce<Promise<void>>(
      (chain, img) =>
        chain.then(async () => {
          await conn.request('image.attach', { session_id: gwSid, path: img });
        }),
      Promise.resolve()
    );

    let emitted = false;
    let aggregated = '';
    let clientClosed = false;
    let sawReasoningDelta = false;

    const result = await new Promise<ChatStreamResult>((resolve, reject) => {
      let settled = false;
      let turnTimer: NodeJS.Timeout | null = null;
      // The response emits 'close' after a *normal* end() too, not just on a
      // client abort. The gateway keeps the session's AIAgent alive between
      // turns and `agent.interrupt()` raises a sticky flag, so interrupting
      // after a completed turn would instantly abort the NEXT turn on this
      // conversation with "turn interrupted". Only interrupt while the turn
      // is still in flight, and detach the listener once it settles.
      const onClientClose = () => {
        clientClosed = true;
        if (!settled) {
          conn.request('session.interrupt', { session_id: gwSid }, 15_000).catch(() => {});
        }
      };
      const settle = (r: ChatStreamResult) => {
        if (settled) return;
        settled = true;
        if (turnTimer) clearTimeout(turnTimer);
        res.off('close', onClientClose);
        resolve(r);
      };
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        if (turnTimer) clearTimeout(turnTimer);
        res.off('close', onClientClose);
        if (emitted) {
          // Already streamed something — don't let the caller restart the
          // turn on the legacy path; report the failure as the turn result.
          resolve({ sessionId: storedSessionId, text: aggregated, exitCode: 1, error: err.message });
        } else {
          reject(err);
        }
      };

      turnTimer = setTimeout(
        () => fail(new Error(`gateway turn timed out after ${TURN_TIMEOUT_MS}ms`)),
        TURN_TIMEOUT_MS
      );

      res.once('close', onClientClose);

      unsubscribe = conn.onEvent((evt) => {
        if (evt.session_id !== gwSid) return;
        const payload = evt.payload ?? {};
        switch (evt.type) {
          case 'message.delta': {
            const delta = asText(payload.text);
            if (delta) {
              aggregated += delta;
              emitted = true;
              if (!clientClosed) writeSse(res, { type: 'response.output_text.delta', delta });
            }
            break;
          }
          case 'thinking.delta':
            // Spinner status text (kawaii face + verb), not real reasoning —
            // the desktop app ignores it too. Real reasoning arrives via
            // reasoning.delta / reasoning.available.
            break;
          case 'reasoning.delta': {
            const delta = asText(payload.text);
            if (delta) {
              sawReasoningDelta = true;
              emitted = true;
              if (!clientClosed) writeSse(res, { type: 'response.thinking.delta', delta });
            }
            break;
          }
          case 'reasoning.available': {
            // Whole-block reasoning from providers that don't stream it.
            // Skip if deltas already covered this turn's reasoning.
            const text = asText(payload.text);
            if (text && !sawReasoningDelta) {
              emitted = true;
              if (!clientClosed) writeSse(res, { type: 'response.thinking.delta', delta: text });
            }
            break;
          }
          case 'tool.start': {
            emitted = true;
            if (!clientClosed) {
              writeSse(res, {
                type: 'tool.start',
                id: asText(payload.tool_id),
                name: asText(payload.name) || 'tool',
                label: asText(payload.context),
              });
            }
            break;
          }
          case 'tool.complete': {
            emitted = true;
            if (!clientClosed) {
              writeSse(res, {
                type: 'tool.complete',
                id: asText(payload.tool_id),
                name: asText(payload.name) || 'tool',
                summary: asText(payload.summary),
              });
            }
            break;
          }
          case 'approval.request': {
            // Gateway approvals fail closed; the CLI's non-TTY contract is
            // fail-open. Auto-approve for this run only to keep web chats
            // behaving exactly like the `hermes chat -Q` pipeline did.
            conn
              .request('approval.respond', { session_id: gwSid, choice: 'once' }, 15_000)
              .catch((err) => console.error('[tui-gateway] approval.respond failed:', err.message));
            break;
          }
          case 'message.complete': {
            const text = asText(payload.text) || aggregated;
            const status = asText(payload.status);
            let error: string | undefined;
            if (status === 'error') error = text || 'hermes reported an error';
            else if (status === 'interrupted') error = 'turn interrupted';
            if (!clientClosed && error) writeSse(res, { type: 'response.error', delta: error });
            if (!clientClosed) writeSse(res, { type: 'session.update', sessionId: storedSessionId });
            settle({
              sessionId: storedSessionId,
              text: status === 'error' ? '' : text,
              exitCode: status === 'complete' ? 0 : 1,
              error,
            });
            break;
          }
          case 'error': {
            fail(new Error(asText(payload.message) || 'gateway reported an error'));
            break;
          }
          default:
            break;
        }
      });

      conn.request('prompt.submit', { session_id: gwSid, text: message }).catch(fail);
    });

    return result;
  } finally {
    conn.activeTurns -= 1;
    conn.lastActivityAt = Date.now();
    if (unsubscribe) (unsubscribe as () => void)();
  }
}
