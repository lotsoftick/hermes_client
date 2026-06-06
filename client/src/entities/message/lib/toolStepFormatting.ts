import type { ToolCall } from '../api';

/** Parse a tool call's JSON argument string into an object (best effort). */
export function parseArgs(args: string): Record<string, unknown> | null {
  if (!args) return null;
  try {
    const obj = JSON.parse(args);
    return obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Pretty-print arguments for the expanded "Tool call" frame. */
export function prettyArgs(args: string): string {
  const obj = parseArgs(args);
  if (!obj) return args;
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return args;
  }
}

/**
 * Pull the most informative one-liner out of a tool call's arguments so
 * the collapsed header has context without forcing the user to expand.
 * Falls back to the first string field for unknown tools.
 */
export function summarizeInput(name: string, args: string): string {
  const input = parseArgs(args);
  if (!input) return args || '';
  const candidate =
    (typeof input.command === 'string' && input.command) ||
    (typeof input.path === 'string' && input.path) ||
    (typeof input.file_path === 'string' && input.file_path) ||
    (typeof input.url === 'string' && input.url) ||
    (typeof input.query === 'string' && input.query) ||
    (typeof input.pattern === 'string' && input.pattern) ||
    (typeof input.expression === 'string' && input.expression) ||
    '';
  if (candidate) return candidate;
  const first = Object.entries(input).find(([, v]) => typeof v === 'string' && v);
  if (first) return `${first[0]}: ${first[1]}`;
  return name;
}

function callErrored(call: ToolCall): boolean {
  return call.ok === false || (typeof call.exitCode === 'number' && call.exitCode !== 0);
}

export { callErrored };

/** Roll up per-call statuses into one summary state for the outer header. */
export function aggregateStatus(calls: ToolCall[]): 'ok' | 'error' | 'pending' {
  const hasError = calls.some(callErrored);
  if (hasError) return 'error';
  if (calls.some((c) => c.result === null)) return 'pending';
  return 'ok';
}
