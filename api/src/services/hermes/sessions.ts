import fs from 'fs';
import path from 'path';
import { hermesExec, stripAnsi } from './cli';
import { profileSessionsDir } from './profiles';
import { cleanMessageText } from './textCleanup';

export interface HermesSession {
  id: string;
  title: string | null;
  preview: string | null;
  lastActiveAt: Date | null;
}

export interface SessionMessage {
  externalId: string;
  role: 'user' | 'assistant';
  text: string;
  thinking: string | null;
  timestamp: Date | null;
}

const SESSION_ID_RE = /^\d{8}_\d{6}_[a-f0-9]+$/;
/** Tag we attach to sessions our backend creates so they're filterable. */
export const SESSION_SOURCE = 'hermes-client';

export function isValidSessionId(id: string): boolean {
  return SESSION_ID_RE.test(id);
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
      const cols = before.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
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

export function deleteSession(
  profile: string | undefined | null,
  sessionId: string
): { ok: boolean; error?: string } {
  if (!isValidSessionId(sessionId)) return { ok: false, error: 'Invalid session id' };
  const result = hermesExec(['sessions', 'delete', '-y', sessionId], { profile });
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
  if (!result.ok) return { ok: false, error: result.stderr || result.stdout || result.error };
  return { ok: true };
}

/**
 * Find the most recent session created with our SESSION_SOURCE tag whose
 * mtime is at or after `sinceMs`. Used to discover the session id for a
 * just-completed chat invocation.
 */
export function findLatestClientSession(
  profile: string | undefined | null,
  sinceMs: number
): string | null {
  const dir = profileSessionsDir(profile);
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .map((file) => {
      const m = file.match(/^session_(\d{8}_\d{6}_[a-f0-9]+)\.json$/);
      if (!m) return null;
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

interface RawSessionRow {
  id?: string;
  message_id?: string;
  role?: string;
  content?: unknown;
  text?: string;
  thinking?: string;
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
export function getSessionMessages(
  profile: string | undefined | null,
  sessionId: string
): SessionMessage[] {
  if (!isValidSessionId(sessionId)) return [];
  const file = path.join(profileSessionsDir(profile), `session_${sessionId}.json`);
  if (!fs.existsSync(file)) return [];
  let data: RawSessionFile;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8')) as RawSessionFile;
  } catch {
    return [];
  }
  const rows = data.messages ?? data.events ?? [];
  return rows.reduce<SessionMessage[]>((acc, row, idx) => {
    const role = row.role === 'assistant' || row.role === 'user' ? row.role : null;
    if (!role) return acc;
    const raw = (row.text ?? flattenContent(row.content)).trim();
    // Strip Hermes-side prompt-engineering wrappers (auto-injected vision
    // pre-analysis, image hints, file footers, resume banners). What we
    // keep is what the human actually wrote / what the model actually
    // replied — the rest is noise that would otherwise duplicate-display
    // and break sync claim matching.
    const text = cleanMessageText(role, raw);
    if (!text) return acc;
    const externalId = row.id || row.message_id || `${sessionId}:${idx}`;
    const ts = row.timestamp || row.created_at;
    acc.push({
      externalId,
      role,
      text,
      thinking: row.thinking ? String(row.thinking) : null,
      timestamp: ts ? new Date(ts) : null,
    });
    return acc;
  }, []);
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

export function listProfileSessionFiles(
  profile: string | undefined | null
): SessionFileEntry[] {
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
