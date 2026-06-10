import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { profileHome } from './paths';

/**
 * Hermes ≥ the June-2026 storage rework persists conversations in a
 * per-profile SQLite database (`state.db`) instead of one JSON file per
 * session. The default profile lives at `~/.hermes/state.db`; named
 * profiles at `~/.hermes/profiles/<name>/state.db`.
 *
 * This module is a thin, read-only adapter over that database. It mirrors
 * the few shapes `sessions.ts` needs (session listing/meta and the raw
 * message rows it already knows how to fold into `SessionMessage`s) so the
 * rest of the codebase doesn't care which storage backend Hermes used. We
 * always open read-only and never hold the handle open across calls, so we
 * can't interfere with the agent writing concurrently.
 */

/** Raw message row, column-for-column from the `messages` table. */
export interface StateMessageRow {
  role: string;
  content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  tool_name: string | null;
  reasoning: string | null;
  reasoning_content: string | null;
  /** Unix epoch seconds (REAL). */
  timestamp: number | null;
}

export interface StateSessionRow {
  id: string;
  source: string | null;
  title: string | null;
  parentId: string | null;
  /** Unix epoch seconds. */
  startedAt: number | null;
  endedAt: number | null;
  model: string | null;
  messageCount: number;
  /** Max message timestamp (unix seconds), so callers can treat it like an mtime. */
  lastActivity: number | null;
}

function dbPath(profile: string | undefined | null): string {
  return path.join(profileHome(profile), 'state.db');
}

export function hasStateDb(profile: string | undefined | null): boolean {
  return fs.existsSync(dbPath(profile));
}

/**
 * Open the profile's `state.db` read-only, run `fn`, and always close. Throws
 * if the database can't be opened or queried — callers are expected to catch
 * and fall back to the legacy JSON store. Returns `null` only when the file
 * doesn't exist (i.e. an install still on the old format).
 */
function withDb<T>(profile: string | undefined | null, fn: (db: Database.Database) => T): T | null {
  const file = dbPath(profile);
  if (!fs.existsSync(file)) return null;
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/**
 * Top-level sessions for a profile (newest first). Excludes the agent's
 * internal sub-sessions (`parent_session_id IS NOT NULL`) and archived
 * sessions, so callers naturally never surface delegated-task sessions as
 * standalone conversations.
 */
export function listStateSessions(profile: string | undefined | null): StateSessionRow[] | null {
  return withDb(
    profile,
    (db) =>
      db
        .prepare(
          `SELECT s.id            AS id,
                  s.source        AS source,
                  s.title         AS title,
                  s.parent_session_id AS parentId,
                  s.started_at    AS startedAt,
                  s.ended_at      AS endedAt,
                  s.model         AS model,
                  s.message_count AS messageCount,
                  (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id) AS lastActivity
             FROM sessions s
            WHERE s.parent_session_id IS NULL
              AND s.archived = 0
            ORDER BY s.started_at DESC`
        )
        .all() as StateSessionRow[]
  );
}

export function getStateSession(
  profile: string | undefined | null,
  sessionId: string
): StateSessionRow | null {
  return (
    withDb(profile, (db) => {
      const row = db
        .prepare(
          `SELECT s.id            AS id,
                  s.source        AS source,
                  s.title         AS title,
                  s.parent_session_id AS parentId,
                  s.started_at    AS startedAt,
                  s.ended_at      AS endedAt,
                  s.model         AS model,
                  s.message_count AS messageCount,
                  (SELECT MAX(m.timestamp) FROM messages m WHERE m.session_id = s.id) AS lastActivity
             FROM sessions s
            WHERE s.id = ?`
        )
        .get(sessionId) as StateSessionRow | undefined;
      return row ?? null;
    }) ?? null
  );
}

export function stateSessionExists(
  profile: string | undefined | null,
  sessionId: string
): boolean {
  return (
    withDb(profile, (db) => !!db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId)) ??
    false
  );
}

/** Active message rows for a session, in conversation order. */
export function listStateMessages(
  profile: string | undefined | null,
  sessionId: string
): StateMessageRow[] | null {
  return withDb(profile, (db) =>
    db
      .prepare(
        `SELECT role, content, tool_calls, tool_call_id, tool_name,
                reasoning, reasoning_content, timestamp
           FROM messages
          WHERE session_id = ? AND active = 1
          ORDER BY timestamp ASC, id ASC`
      )
      .all(sessionId) as StateMessageRow[]
  );
}

/** First user message content — used to title sessions that lack one. */
export function firstUserContent(
  profile: string | undefined | null,
  sessionId: string
): string | null {
  return (
    withDb(profile, (db) => {
      const row = db
        .prepare(
          `SELECT content FROM messages
            WHERE session_id = ? AND role = 'user' AND active = 1
            ORDER BY timestamp ASC, id ASC LIMIT 1`
        )
        .get(sessionId) as { content: string | null } | undefined;
      return row?.content ?? null;
    }) ?? null
  );
}

export interface CronSessionRow {
  id: string;
  startedAt: number | null;
  endedAt: number | null;
  messageCount: number;
}

/**
 * Cron-run sessions for a given job, newest first. Hermes encodes the job id
 * into the session id (`cron_<jobId>_<YYYYMMDD>_<HHMMSS>`), mirroring the old
 * per-run JSON filenames.
 */
export function listCronSessions(
  profile: string | undefined | null,
  jobId: string,
  limit: number
): CronSessionRow[] | null {
  return withDb(
    profile,
    (db) =>
      db
        .prepare(
          `SELECT id, started_at AS startedAt, ended_at AS endedAt, message_count AS messageCount
             FROM sessions
            WHERE source = 'cron' AND id LIKE ?
            ORDER BY started_at DESC
            LIMIT ?`
        )
        .all(`cron_${jobId}_%`, limit) as CronSessionRow[]
  );
}

/**
 * The most recently started session at or after `sinceMs`. Mirrors the old
 * "newest session file modified since X" heuristic used to resolve the id of
 * a just-finished `hermes chat` run.
 *
 * `source` narrows the match to sessions created with that `--source` tag,
 * so a standalone REPL session (source `cli`) started in the same window
 * can't be mistaken for ours. `excludeIds` drops sessions already claimed
 * by other in-flight chat turns — without it, two concurrent fresh chats on
 * the same profile could both resolve to the same (latest) session.
 */
export function latestStateSessionSince(
  profile: string | undefined | null,
  sinceMs: number,
  opts: { source?: string; excludeIds?: string[] } = {}
): string | null {
  return (
    withDb(profile, (db) => {
      const cutoff = sinceMs / 1000 - 2; // small grace, like the JSON path
      const where = ['started_at >= ?'];
      const params: unknown[] = [cutoff];
      if (opts.source) {
        where.push('source = ?');
        params.push(opts.source);
      }
      const excludeIds = opts.excludeIds ?? [];
      if (excludeIds.length) {
        where.push(`id NOT IN (${excludeIds.map(() => '?').join(', ')})`);
        params.push(...excludeIds);
      }
      const row = db
        .prepare(
          `SELECT id FROM sessions
            WHERE ${where.join(' AND ')}
            ORDER BY started_at DESC LIMIT 1`
        )
        .get(...params) as { id: string } | undefined;
      return row?.id ?? null;
    }) ?? null
  );
}
