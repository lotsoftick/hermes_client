import { Response } from 'express';
import { ChildProcessWithoutNullStreams } from 'child_process';
import { hermesSpawn, stripAnsi } from './cli';
import { findLatestClientSession, isValidSessionId, SESSION_SOURCE } from './sessions';

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

function buildArgs(message: string, opts: ChatOptions): string[] {
  const args = ['chat', '-Q', '--source', SESSION_SOURCE, '-q', message];
  if (opts.sessionId && isValidSessionId(opts.sessionId)) {
    args.push('--resume', opts.sessionId);
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

/**
 * Spawn `hermes chat -Q -q "<msg>"` and stream its stdout to the client as
 * SSE deltas. Resolves with the resolved Hermes session id (if any) and the
 * aggregated assistant text once the child exits.
 *
 * Importantly, this function does **not** end the SSE response — the
 * caller is expected to persist the result (assistant message, session id,
 * …) and only then write `[DONE]` and close. Closing the response here
 * would race the caller's DB write against the client's follow-up
 * `getMessages` refetch, leaving the chat UI temporarily blank.
 *
 * Inspects both stdout and stderr for the session id token because
 * `hermes chat -Q` writes the response to stdout and the trailing
 * `session_id: …` line to stderr.
 */
export function streamChat(
  res: Response,
  message: string,
  opts: ChatOptions
): Promise<ChatStreamResult> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const startedAtMs = Date.now();
  const args = buildArgs(message, opts);
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
  let resolvedSessionId: string | null = opts.sessionId ?? null;
  let stderrBuf = '';
  let clientClosed = false;

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

  const tryCaptureSessionId = (chunk: string): void => {
    if (resolvedSessionId) return;
    const match = chunk.match(SESSION_ID_LINE_RE);
    if (match) [, resolvedSessionId] = match;
  };

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    const cleaned = stripAnsi(chunk);
    aggregated += cleaned;
    tryCaptureSessionId(cleaned);
    if (!clientClosed) writeSse(res, { type: 'response.output_text.delta', delta: cleaned });
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    const cleaned = stripAnsi(chunk);
    stderrBuf += cleaned;
    tryCaptureSessionId(cleaned);
  });

  return new Promise<ChatStreamResult>((resolve) => {
    child.on('error', (err) => {
      const message2 = err.message || 'hermes failed to start';
      if (!clientClosed) writeSse(res, { type: 'response.error', delta: message2 });
      resolve({ sessionId: resolvedSessionId, text: aggregated, exitCode: null, error: message2 });
    });
    child.on('close', (code) => {
      if (!resolvedSessionId) {
        resolvedSessionId = findLatestClientSession(opts.profile ?? null, startedAtMs);
      }
      const error =
        code && code !== 0 ? stderrBuf.trim() || `hermes exited with code ${code}` : undefined;
      if (!clientClosed) {
        if (error) writeSse(res, { type: 'response.error', delta: error });
        if (resolvedSessionId) writeSse(res, { type: 'session.update', sessionId: resolvedSessionId });
      }
      resolve({ sessionId: resolvedSessionId, text: aggregated.trim(), exitCode: code, error });
    });
  });
}
