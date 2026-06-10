/* eslint-disable no-console */
import { Response } from 'express';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { hermesSpawn, stripAnsi } from './cli';
import { findLatestClientSession, isValidSessionId, sessionExists, SESSION_SOURCE } from './sessions';
import { cleanAssistantMessageText } from './textCleanup';
import { claimSessionId, claimedSessionIds } from './sessionClaims';
import { streamChatViaGateway, structuredChatEnabled } from './tuiGateway';

export interface ChatOptions {
  profile?: string | null;
  /** Hermes session id to resume; pass null/undefined to start a new session. */
  sessionId?: string | null;
  /** Image attachments — passed via repeated `--image` flags. */
  imagePaths?: string[];
}

export interface ChatStreamResult {
  /** Hermes session id for this turn (resolved post-stream when starting fresh). */
  sessionId: string | null;
  /** Aggregated assistant text the client received (best-effort). */
  text: string;
  /** Raw exit code reported by `hermes chat`. */
  exitCode: number | null;
  error?: string;
}

const SESSION_ID_LINE_RE = /(?:Session(?:\s*ID)?|session_id)\s*[:=]\s*(\d{8}_\d{6}_[a-f0-9]+)/i;

/**
 * Emit an SSE comment every 15s while a turn is running. `hermes` can go
 * silent for 30-60s+ during image generation or long tool loops, and an idle
 * SSE connection through nginx/Tailscale/Cloudflare gets reaped (nginx's
 * proxy_read_timeout defaults to 60s) — the client then sees the stream die
 * with no error. Comment lines (`: ping`) are ignored by EventSource/fetch
 * parsers but keep bytes flowing on the wire.
 */
const HEARTBEAT_MS = 15_000;

/**
 * A session id can split across two stream chunks (`session_id: 2026…` with
 * the digits in the next write), so the capture regex must run over an
 * accumulated buffer, not individual fragments. The window is kept small —
 * far larger than any session-id line, far smaller than a whole transcript —
 * so repeated scans stay O(1) per chunk.
 */
const SESSION_SCAN_WINDOW = 4_096;

function buildArgs(message: string, resumeSessionId: string | null, opts: ChatOptions): string[] {
  const args = ['chat', '-Q', '--source', SESSION_SOURCE, '-q', message];
  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }
  (opts.imagePaths ?? []).forEach((img) => {
    args.push('--image', img);
  });
  return args;
}

function writeSse(res: Response, payload: object | string): void {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.write(`data: ${data}\n\n`);
}

function resolveResumeSessionId(opts: ChatOptions): string | null {
  return opts.sessionId &&
    isValidSessionId(opts.sessionId) &&
    sessionExists(opts.profile ?? null, opts.sessionId)
    ? opts.sessionId
    : null;
}

/**
 * Stream one chat turn to the client as SSE deltas and resolve with the
 * Hermes session id (if any) plus the aggregated assistant text once the
 * turn finishes.
 *
 * Legacy pipeline: spawn `hermes chat -Q -q "<msg>"` and forward stdout as
 * text deltas. Quiet mode prints the response only when the turn completes,
 * so this path has no incremental tool/thinking events.
 *
 * Inspects both stdout and stderr for the session id token because
 * `hermes chat -Q` writes the response to stdout and the trailing
 * `session_id: …` line to stderr.
 */
function streamChatViaCli(
  res: Response,
  message: string,
  resumeSessionId: string | null,
  opts: ChatOptions
): Promise<ChatStreamResult> {
  const startedAtMs = Date.now();
  const args = buildArgs(message, resumeSessionId, opts);
  let child: ChildProcessWithoutNullStreams;
  try {
    child = hermesSpawn(args, { profile: opts.profile ?? null });
  } catch (err) {
    writeSse(res, { type: 'response.error', delta: (err as Error).message });
    return Promise.resolve({
      sessionId: null,
      text: '',
      exitCode: null,
      error: (err as Error).message,
    });
  }

  let aggregated = '';
  let resolvedSessionId: string | null = resumeSessionId;
  if (resolvedSessionId) claimSessionId(resolvedSessionId);
  let stderrBuf = '';
  let stdoutScan = '';
  let stderrScan = '';
  let clientClosed = false;
  // When resuming, Hermes prefixes stdout with a `↻ Resumed session …`
  // banner. We strip it from both the aggregated text we save and from
  // what we forward to the SSE stream — buffering the very first chunks
  // until either the banner has been emitted (and chopped off) or we've
  // accumulated enough characters to know it isn't there.
  const expectsResumeBanner = !!resumeSessionId;
  let preambleBuf = '';
  let preambleStripped = !expectsResumeBanner;
  const PREAMBLE_CAP = 512;

  res.once('close', () => {
    clientClosed = true;
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* noop */
      }
    }
  });

  const tryCaptureSessionId = (buffer: string): void => {
    if (resolvedSessionId) return;
    const match = buffer.match(SESSION_ID_LINE_RE);
    if (match) {
      [, resolvedSessionId] = match;
      // Register the claim so a concurrent turn's fallback resolution can't
      // pick this session up as its own.
      claimSessionId(resolvedSessionId);
    }
  };

  /**
   * Buffer the leading bytes of a resume run until we can either chop
   * the banner off cleanly or be confident it isn't there. Returns
   * whatever is safe to flush out to the SSE stream right now.
   */
  const consumeStreamChunk = (chunk: string): string => {
    if (preambleStripped) return chunk;
    preambleBuf += chunk;
    const before = preambleBuf;
    const after = cleanAssistantMessageText(before);
    if (after !== before) {
      // The banner was present and has been stripped.
      preambleStripped = true;
      preambleBuf = '';
      return after;
    }
    if (preambleBuf.length < PREAMBLE_CAP) {
      // Wait for more bytes — the banner might still be incoming.
      return '';
    }
    // We've buffered enough to know the banner isn't there. Flush as-is.
    preambleStripped = true;
    const flushed = preambleBuf;
    preambleBuf = '';
    return flushed;
  };

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    const cleaned = stripAnsi(chunk);
    aggregated += cleaned;
    stdoutScan = (stdoutScan + cleaned).slice(-SESSION_SCAN_WINDOW);
    tryCaptureSessionId(stdoutScan);
    if (clientClosed) return;
    const toEmit = consumeStreamChunk(cleaned);
    if (toEmit) writeSse(res, { type: 'response.output_text.delta', delta: toEmit });
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    const cleaned = stripAnsi(chunk);
    stderrBuf += cleaned;
    stderrScan = (stderrScan + cleaned).slice(-SESSION_SCAN_WINDOW);
    tryCaptureSessionId(stderrScan);
  });

  return new Promise<ChatStreamResult>((resolve) => {
    child.on('error', (err) => {
      const message2 = err.message || 'hermes failed to start';
      if (!clientClosed) writeSse(res, { type: 'response.error', delta: message2 });
      resolve({ sessionId: resolvedSessionId, text: aggregated, exitCode: null, error: message2 });
    });
    child.on('close', (code) => {
      if (!resolvedSessionId) {
        // Heuristic fallback: the newest session our source tag created since
        // this turn started, excluding ids other turns already claimed —
        // concurrent chats on one profile must never bind each other's
        // session.
        resolvedSessionId = findLatestClientSession(
          opts.profile ?? null,
          startedAtMs,
          claimedSessionIds()
        );
        if (resolvedSessionId) claimSessionId(resolvedSessionId);
      }
      const error =
        code && code !== 0 ? stderrBuf.trim() || `hermes exited with code ${code}` : undefined;
      // Flush anything we were holding back while waiting to identify the
      // resume banner — by now we know it isn't (or no longer) coming.
      if (!preambleStripped && preambleBuf) {
        if (!clientClosed) {
          writeSse(res, { type: 'response.output_text.delta', delta: preambleBuf });
        }
        preambleBuf = '';
        preambleStripped = true;
      }
      if (!clientClosed) {
        if (error) writeSse(res, { type: 'response.error', delta: error });
        if (resolvedSessionId) writeSse(res, { type: 'session.update', sessionId: resolvedSessionId });
      }
      resolve({
        sessionId: resolvedSessionId,
        text: cleanAssistantMessageText(aggregated),
        exitCode: code,
        error,
      });
    });
  });
}

/**
 * Stream one chat turn to the client as SSE deltas and resolve with the
 * Hermes session id (if any) plus the aggregated assistant text once the
 * turn finishes.
 *
 * Preferred engine is the structured TUI-gateway pipeline (typed events for
 * text/thinking/tool activity, exact session id up front); it falls back to
 * spawning `hermes chat -Q` when the gateway is unavailable or fails before
 * anything was streamed.
 *
 * While the turn runs, an SSE heartbeat comment is written every 15s so
 * idle-connection reapers (nginx, Tailscale, Cloudflare) can't drop the
 * stream during a long silent stretch (image generation, big tool loops).
 *
 * Importantly, this function does **not** end the SSE response — the
 * caller is expected to persist the result (assistant message, session id,
 * …) and only then write `[DONE]` and close. Closing the response here
 * would race the caller's DB write against the client's follow-up
 * `getMessages` refetch, leaving the chat UI temporarily blank.
 */
export async function streamChat(
  res: Response,
  message: string,
  opts: ChatOptions
): Promise<ChatStreamResult> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  const resumeSessionId = resolveResumeSessionId(opts);
  try {
    if (structuredChatEnabled()) {
      try {
        return await streamChatViaGateway(res, message, { ...opts, resumeSessionId });
      } catch (err) {
        // Nothing was streamed yet (the gateway path resolves instead of
        // throwing once bytes are out) — fall back to the CLI pipeline.
        console.error(
          '[chat] structured stream unavailable, falling back to hermes chat -Q:',
          (err as Error).message
        );
      }
    }
    return await streamChatViaCli(res, message, resumeSessionId, opts);
  } finally {
    clearInterval(heartbeat);
  }
}
