import fs from 'fs';
import path from 'path';
import { hermesExec, stripAnsi } from './cli';
import { profileSessionsDir } from './profiles';
import { cleanMessageText } from './textCleanup';
import { collectImageSrcs } from './images';
import * as stateDb from './stateDb';

export interface HermesSession {
  id: string;
  title: string | null;
  preview: string | null;
  lastActiveAt: Date | null;
}

export interface SessionToolCall {
  id: string;
  name: string;
  args: string;
  result: string | null;
  ok: boolean | null;
  exitCode: number | null;
  truncated: boolean;
}

export interface SessionMessage {
  externalId: string;
  role: 'user' | 'assistant';
  text: string;
  thinking: string | null;
  timestamp: Date | null;
  toolCalls: SessionToolCall[];
  images: string[];
}

const SESSION_ID_RE = /^\d{8}_\d{6}_[a-f0-9]+$/;
/** Tag we attach to sessions our backend creates so they're filterable. */
export const SESSION_SOURCE = 'hermes-client';

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
}

export function sessionExists(profile: string | undefined | null, sessionId: string): boolean {
  if (!isValidSessionId(sessionId)) return false;
  if (stateDb.hasStateDb(profile)) {
    try {
      if (stateDb.stateSessionExists(profile, sessionId)) return true;
      // Not in the DB — still check for a legacy JSON file (covers a session
      // created by an older Hermes that predates the migration).
    } catch {
      /* fall through */
    }
  }
  const file = path.join(profileSessionsDir(profile), `session_${sessionId}.json`);
  return fs.existsSync(file);
}

/**
 * Parse `hermes sessions list --source <src>` table output. Columns:
 *   Title, Preview, Last Active, ID
 * The ID is a stable token (8 digits, _, 6 digits, _, hex), so we anchor on
 * that and treat everything before it as the soft columns.
 */
function parseSessionList(stdout: string): HermesSession[] {
  return stripAnsi(stdout)
    .split('\n')
    .map((raw) => raw.replace(/^[\s│┃]+|[\s│┃]+$/g, ''))
    .filter((line) => line && !/^Title\s+Preview/i.test(line) && !/^[─━]/.test(line))
    .map((line) => {
      const idMatch = line.match(/(\d{8}_\d{6}_[a-f0-9]+)\s*$/);
      if (!idMatch) return null;
      const id = idMatch[1];
      const before = line.slice(0, line.length - idMatch[0].length).trimEnd();
      const cols = before
        .split(/\s{2,}/)
        .map((c) => c.trim())
        .filter(Boolean);
      const title = cols[0] && cols[0] !== '—' ? cols[0] : null;
      const preview = cols[1] && cols[1] !== '—' ? cols[1] : null;
      return { id, title, preview, lastActiveAt: null } as HermesSession;
    })
    .filter((s): s is HermesSession => s !== null);
}

export function listSessions(
  profile: string | undefined | null,
  opts: { source?: string; limit?: number } = {}
): HermesSession[] {
  const args = ['sessions', 'list'];
  if (opts.source) args.push('--source', opts.source);
  if (opts.limit) args.push('--limit', String(opts.limit));
  const result = hermesExec(args, { profile });
  if (!result.ok) return [];
  return parseSessionList(result.stdout);
}

/**
 * TTL cache for the bare `listSessions(profile)` call. Discovery only needs
 * the listing to classify *unlinked* on-disk sessions (top-level chat vs
 * internal sub-session), and the sidebar polls discovery every few seconds —
 * without a cache each poll would fork one `hermes sessions list` subprocess
 * per agent. Mirrors the gateway-status cache pattern.
 */
const SESSION_LIST_TTL_MS = 15_000;
const sessionListCache = new Map<string, { value: HermesSession[]; expiresAt: number }>();

export function listSessionsCached(profile: string | undefined | null): HermesSession[] {
  const key = profile || 'default';
  const cached = sessionListCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const fresh = listSessions(profile);
  sessionListCache.set(key, { value: fresh, expiresAt: now + SESSION_LIST_TTL_MS });
  return fresh;
}

function invalidateSessionListCache(profile: string | undefined | null): void {
  sessionListCache.delete(profile || 'default');
}

export function deleteSession(
  profile: string | undefined | null,
  sessionId: string
): { ok: boolean; error?: string } {
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'Invalid session id' };
  const result = hermesExec(['sessions', 'delete', '-y', sessionId], { profile });
  invalidateSessionListCache(profile);
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

export function renameSession(
  profile: string | undefined | null,
  sessionId: string,
  title: string
): { ok: boolean; error?: string } {
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'Invalid session id' };
  const result = hermesExec(['sessions', 'rename', sessionId, title], { profile });
  invalidateSessionListCache(profile);
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

/**
 * Find the most recent session created with our SESSION_SOURCE tag whose
 * mtime is at or after `sinceMs`. Used to discover the session id for a
 * just-completed chat invocation.
 *
 * `excludeIds` filters out sessions already claimed by other in-flight or
 * just-finished chat turns, so concurrent chats on the same profile can't
 * resolve to each other's session.
 */
export function findLatestClientSession(
  profile: string | undefined | null,
  sinceMs: number,
  excludeIds: string[] = []
): string | null {
  if (stateDb.hasStateDb(profile)) {
    try {
      return stateDb.latestStateSessionSince(profile, sinceMs, {
        source: SESSION_SOURCE,
        excludeIds,
      });
    } catch {
      /* fall through to the legacy session-file scan */
    }
  }
  const excluded = new Set(excludeIds);
  const dir = profileSessionsDir(profile);
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .map((file) => {
      const m = file.match(/^session_(\d{8}_\d{6}_[a-f0-9]+)\.json$/);
      if (!m || excluded.has(m[1])) return null;
      try {
        const stat = fs.statSync(path.join(dir, file));
        if (stat.mtimeMs < sinceMs - 2_000) return null;
        return { id: m[1], mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((c): c is { id: string; mtimeMs: number } => c !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.id ?? null;
}

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: unknown };
  name?: string;
  arguments?: unknown;
}

interface RawSessionRow {
  id?: string;
  message_id?: string;
  role?: string;
  content?: unknown;
  text?: string;
  thinking?: string;
  reasoning?: string;
  reasoning_content?: string;
  tool_calls?: RawToolCall[];
  tool_call_id?: string;
  name?: string;
  timestamp?: string;
  created_at?: string;
}

interface RawSessionFile {
  messages?: RawSessionRow[];
  events?: RawSessionRow[];
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const p = part as { text?: string; content?: unknown };
          if (typeof p.text === 'string') return p.text;
          if (p.content !== undefined) return flattenContent(p.content);
        }
        return '';
      })
      .join('');
  }
  return '';
}

/** Tool args/results can be huge (browser snapshots). Cap what we persist. */
const TOOL_ARGS_CAP = 2_000;
const TOOL_RESULT_CAP = 4_000;

function truncate(value: string, cap: number): string {
  return value.length > cap ? `${value.slice(0, cap)}…` : value;
}

function stringifyToolValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Best-effort success flag from a tool result. Tool authors are
 * inconsistent, so we look at the common shapes: an explicit `success`
 * boolean, a non-empty `error`, or a non-zero `exit_code`.
 */
function parseToolOk(raw: string): boolean | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.success === 'boolean') return obj.success;
    if ('error' in obj && obj.error) return false;
    if (typeof obj.exit_code === 'number') return obj.exit_code === 0;
    return null;
  } catch {
    return null;
  }
}

function parseExitCode(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof obj.exit_code === 'number' ? obj.exit_code : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort parser for a Hermes session JSON file. The on-disk schema is
 * not part of the public API; this code accepts a few common shapes
 * (messages[] and events[]) and extracts what it can.
 *
 * The externalId we mint is stable across re-reads: it combines the
 * session id with the row's position in the conversation, so an upsert
 * by `(conversationId, externalId)` is idempotent even when Hermes
 * appends new turns to the same file.
 */
function stateRowToRaw(r: stateDb.StateMessageRow): RawSessionRow {
  let toolCalls: RawToolCall[] | undefined;
  if (r.tool_calls) {
    try {
      const parsed = JSON.parse(r.tool_calls);
      if (Array.isArray(parsed)) toolCalls = parsed as RawToolCall[];
    } catch {
      /* ignore a malformed tool_calls blob rather than dropping the turn */
    }
  }
  return {
    role: r.role,
    content: r.content ?? undefined,
    tool_calls: toolCalls,
    tool_call_id: r.tool_call_id ?? undefined,
    name: r.tool_name ?? undefined,
    reasoning: r.reasoning ?? undefined,
    reasoning_content: r.reasoning_content ?? undefined,
    timestamp: r.timestamp ? new Date(r.timestamp * 1000).toISOString() : undefined,
  };
}

/**
 * Fold a sequence of raw session rows (from either storage backend) into the
 * `SessionMessage`s the rest of the app renders.
 */
function buildSessionMessages(sessionId: string, rows: RawSessionRow[]): SessionMessage[] {
  // The agent loop interleaves assistant rows that *call* tools with
  // `role: 'tool'` rows that carry the results, before a final assistant
  // row with the prose answer. We collect tool calls (and the images
  // their output references) as we go and attach them to the final
  // assistant turn of the round — mirroring how the desktop app shows
  // tool chips inside a single reply.
  //
  // Tool-calling assistant rows often carry narration too ("Executing
  // three tool calls in parallel…"). Emitting that prose as its own
  // message splits one logical turn into several bubbles, so we fold it
  // (plus any reasoning on those rows) into the thinking block of the
  // turn's final answer instead.
  const out: SessionMessage[] = [];
  let pendingCalls: SessionToolCall[] = [];
  let pendingImages: string[] = [];
  let pendingThinking: string[] = [];
  let pendingMeta: { externalId: string; ts?: string } | null = null;
  const callsById = new Map<string, SessionToolCall>();

  const drainPending = (): { toolCalls: SessionToolCall[]; images: string[]; thinking: string[] } => {
    const toolCalls = pendingCalls;
    const images = pendingImages;
    const thinking = pendingThinking;
    pendingCalls = [];
    pendingImages = [];
    pendingThinking = [];
    pendingMeta = null;
    callsById.clear();
    return { toolCalls, images, thinking };
  };

  // A round that never reached its final answer row (interrupted turn, or
  // a user message arriving mid-round) still has narration worth showing.
  const flushOrphanedRound = (): void => {
    const meta = pendingMeta;
    const { toolCalls, images, thinking } = drainPending();
    if (!meta || !thinking.length) return;
    const [text, ...rest] = thinking;
    out.push({
      externalId: meta.externalId,
      role: 'assistant',
      text,
      thinking: rest.length ? rest.join('\n\n') : null,
      timestamp: meta.ts ? new Date(meta.ts) : null,
      toolCalls,
      images: Array.from(new Set([...images, ...collectImageSrcs([text])])),
    });
  };

  rows.forEach((row, idx) => {
    if (row.role === 'tool') {
      const resultRaw = stringifyToolValue(row.content ?? row.text);
      pendingImages.push(...collectImageSrcs([resultRaw]));
      const call = row.tool_call_id ? callsById.get(row.tool_call_id) : undefined;
      if (call) {
        call.result = truncate(resultRaw, TOOL_RESULT_CAP);
        call.truncated = resultRaw.length > TOOL_RESULT_CAP;
        call.ok = parseToolOk(resultRaw);
        call.exitCode = parseExitCode(resultRaw);
      }
      return;
    }

    const role = row.role === 'assistant' || row.role === 'user' ? row.role : null;
    if (!role) return;

    const isToolCallRow = role === 'assistant' && Array.isArray(row.tool_calls) && row.tool_calls.length > 0;
    if (isToolCallRow) {
      row.tool_calls!.forEach((tc, tcIdx) => {
        const argsRaw = stringifyToolValue(tc.function?.arguments ?? tc.arguments);
        pendingImages.push(...collectImageSrcs([argsRaw]));
        const call: SessionToolCall = {
          id: tc.id || `${sessionId}:${idx}:${tcIdx}`,
          name: tc.function?.name || tc.name || 'tool',
          args: truncate(argsRaw, TOOL_ARGS_CAP),
          result: null,
          ok: null,
          exitCode: null,
          truncated: false,
        };
        pendingCalls.push(call);
        if (tc.id) callsById.set(tc.id, call);
      });
    }

    const raw = (row.text ?? flattenContent(row.content)).trim();
    // Strip Hermes-side prompt-engineering wrappers (auto-injected vision
    // pre-analysis, image hints, file footers, resume banners). What we
    // keep is what the human actually wrote / what the model actually
    // replied — the rest is noise that would otherwise duplicate-display
    // and break sync claim matching.
    const text = cleanMessageText(role, raw);
    const reasoning = row.reasoning ?? row.reasoning_content ?? row.thinking;

    if (isToolCallRow) {
      // Hold this round's narration/reasoning back for the answer row
      // instead of emitting a standalone bubble per tool-calling step.
      if (reasoning) pendingThinking.push(String(reasoning));
      if (text) {
        pendingThinking.push(text);
        pendingImages.push(...collectImageSrcs([text]));
      }
      pendingMeta = {
        externalId: row.id || row.message_id || `${sessionId}:${idx}`,
        ts: row.timestamp || row.created_at,
      };
      return;
    }

    if (!text) {
      // A user row arriving with stragglers means the previous round never
      // produced a final answer — surface what it did say, then move on.
      if (role === 'user') flushOrphanedRound();
      return;
    }

    if (role === 'user') flushOrphanedRound();

    const externalId = row.id || row.message_id || `${sessionId}:${idx}`;
    const ts = row.timestamp || row.created_at;
    const { toolCalls, images: toolImages, thinking: heldThinking } =
      role === 'assistant' ? drainPending() : { toolCalls: [], images: [], thinking: [] };
    const thinkingParts = role === 'assistant' ? [...heldThinking] : [];
    if (role === 'assistant' && reasoning) thinkingParts.push(String(reasoning));
    // Also scan the assistant's prose itself: agents routinely announce a
    // generated file inline ("It is saved here: …/ai_image.svg") without
    // the path appearing in any structured tool result.
    const images =
      role === 'assistant' ? Array.from(new Set([...toolImages, ...collectImageSrcs([text])])) : [];
    out.push({
      externalId,
      role,
      text,
      thinking: thinkingParts.length ? thinkingParts.join('\n\n') : null,
      timestamp: ts ? new Date(ts) : null,
      toolCalls,
      images,
    });
  });

  // Session ended mid-round (interrupted turn with no final answer).
  flushOrphanedRound();

  return out;
}

export function getSessionMessages(
  profile: string | undefined | null,
  sessionId: string
): SessionMessage[] {
  if (!isValidSessionId(sessionId)) return [];
  // Current Hermes stores conversations in a per-profile SQLite `state.db`;
  // older installs still keep one JSON file per session. Prefer the DB and
  // fall back to JSON on any read error.
  if (stateDb.hasStateDb(profile)) {
    try {
      const rows = stateDb.listStateMessages(profile, sessionId);
      if (rows) return buildSessionMessages(sessionId, rows.map(stateRowToRaw));
    } catch {
      /* fall through to the legacy JSON store */
    }
  }
  const file = path.join(profileSessionsDir(profile), `session_${sessionId}.json`);
  if (!fs.existsSync(file)) return [];
  let data: RawSessionFile;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8')) as RawSessionFile;
  } catch {
    return [];
  }
  const rows = data.messages ?? data.events ?? [];
  return buildSessionMessages(sessionId, rows);
}

/**
 * List session ids known to a profile by scanning its sessions directory,
 * along with the file mtime so callers can decide whether the file is
 * actively being written. Returned newest-first.
 */
export interface SessionFileEntry {
  id: string;
  mtimeMs: number;
}

export function listProfileSessionFiles(profile: string | undefined | null): SessionFileEntry[] {
  if (stateDb.hasStateDb(profile)) {
    try {
      const sessions = stateDb.listStateSessions(profile);
      if (sessions) {
        // `listStateSessions` already excludes sub-sessions and archived
        // ones. We expose `lastActivity` as the mtime so discovery's
        // recent-activity grace window keeps working.
        return sessions.map((s) => ({
          id: s.id,
          mtimeMs: (s.lastActivity ?? s.endedAt ?? s.startedAt ?? 0) * 1000,
        }));
      }
    } catch {
      /* fall through to the legacy session-directory scan */
    }
  }
  const dir = profileSessionsDir(profile);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((file) => {
      const m = file.match(/^session_(\d{8}_\d{6}_[a-f0-9]+)\.json$/);
      if (!m) return null;
      try {
        const stat = fs.statSync(path.join(dir, file));
        return { id: m[1], mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((s): s is SessionFileEntry => s !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function listProfileSessionIds(profile: string | undefined | null): string[] {
  return listProfileSessionFiles(profile).map((s) => s.id);
}

/**
 * Read the high-level metadata for a session straight from its JSON file,
 * without parsing the (potentially large) message array. Used by the
 * auto-discovery flow to pick a sensible title/timestamp for newly
 * imported conversations.
 */
export interface SessionMeta {
  id: string;
  title: string | null;
  startedAt: Date | null;
  lastUpdatedAt: Date | null;
  model: string | null;
  messageCount: number;
}

export function readSessionMeta(
  profile: string | undefined | null,
  sessionId: string
): SessionMeta | null {
  if (!isValidSessionId(sessionId)) return null;
  if (stateDb.hasStateDb(profile)) {
    try {
      const s = stateDb.getStateSession(profile, sessionId);
      if (s) {
        let { title } = s;
        if (!title) {
          const firstUser = stateDb.firstUserContent(profile, sessionId);
          title = firstUser ? firstUser.trim().slice(0, 200) || null : null;
        }
        const lastSecs = s.lastActivity ?? s.endedAt;
        return {
          id: sessionId,
          title,
          startedAt: s.startedAt ? new Date(s.startedAt * 1000) : null,
          lastUpdatedAt: lastSecs ? new Date(lastSecs * 1000) : null,
          model: s.model,
          messageCount: s.messageCount,
        };
      }
      // Session not in the DB — fall through in case a legacy JSON file holds it.
    } catch {
      /* fall through to the legacy JSON store */
    }
  }
  const file = path.join(profileSessionsDir(profile), `session_${sessionId}.json`);
  if (!fs.existsSync(file)) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
  const messages = (data.messages as unknown[]) || (data.events as unknown[]) || [];
  let title: string | null = (data.title as string) || (data.name as string) || null;
  if (!title) {
    const firstUser = (messages as RawSessionRow[]).find((m) => m.role === 'user');
    const firstText = firstUser ? flattenContent(firstUser.content).trim() : '';
    title = firstText ? firstText.slice(0, 200) : null;
  }
  const startStr = (data.session_start as string) || (data.created_at as string) || null;
  const lastStr = (data.last_updated as string) || (data.updated_at as string) || null;
  return {
    id: sessionId,
    title,
    startedAt: startStr ? new Date(startStr) : null,
    lastUpdatedAt: lastStr ? new Date(lastStr) : null,
    model: (data.model as string) || null,
    messageCount: messages.length,
  };
}
