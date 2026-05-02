import { IsNull, In, QueryFailedError } from 'typeorm';
import AppDataSource from '../../data-source';
import { Agent, Conversation, Message } from '../../entities';
import { getSessionMessages, listProfileSessionFiles, readSessionMeta } from './sessions';
import { normalizeForMatch } from './textCleanup';

function isSqliteUniqueConstraint(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const driver = e.driverError as Record<string, unknown> | undefined;
  if (driver?.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  return msg.includes('UNIQUE constraint failed');
}

/**
 * Skip importing session files that were modified more recently than
 * this. Hermes writes its session JSON in-place, so a very fresh mtime
 * usually means the chat handler in this same process is mid-stream
 * and is about to bind the file's session id to its own conversation.
 * Letting that race a discovery scan would create two conversations
 * for the same sessionKey and trip the unique index.
 */
const RECENT_FILE_GRACE_MS = 5_000;

const profileFor = (agent: Agent | null | undefined): string =>
  agent?.hermesProfile || 'default';

/**
 * Reconcile DB messages for a single conversation against the on-disk
 * Hermes session JSON file.
 *
 * The Hermes session file is the source of truth: it captures every
 * turn for the linked session, regardless of whether it originated
 * from the web UI or a standalone `hermes` REPL. We:
 *
 *   1. Read every message in the file (with stable per-position ids).
 *   2. Skip rows already imported (matched by externalId). If the user
 *      soft-deleted a message in the app, we keep skipping that
 *      Hermes turn — we do not re-insert or undelete it.
 *   3. Reuse local rows that we created during the live request before
 *      Hermes had assigned them a session-relative id (matched by
 *      role + text), stamping them with the externalId so we don't
 *      duplicate them on the next pass.
 *   4. Insert anything genuinely new — these are the turns that came
 *      from the standalone REPL (and never soft-deleted in our DB).
 */
export interface SyncResult {
  added: Message[];
  claimed: number;
}

export async function syncConversationFromHermes(
  conv: Conversation,
  agent?: Agent | null
): Promise<SyncResult> {
  if (!conv.sessionKey) return { added: [], claimed: 0 };

  const agentRepo = AppDataSource.getRepository(Agent);
  const ag = agent ?? (await agentRepo.findOneBy({ _id: conv.agentId }));
  const profile = profileFor(ag);

  const sessionMessages = getSessionMessages(profile, conv.sessionKey);
  if (!sessionMessages.length) return { added: [], claimed: 0 };

  const msgRepo = AppDataSource.getRepository(Message);
  // `withDeleted: true` — soft-deleted rows still occupy the SQLite
  // UNIQUE(conversationId, externalId) index. If we filtered them out,
  // we'd keep trying to INSERT the same Hermes turn on every poll and
  // spam SQLITE_CONSTRAINT_UNIQUE until the DB wedged the request.
  const existing = await msgRepo.find({
    where: { conversationId: conv._id },
    withDeleted: true,
    order: { createdAt: 'ASC', _id: 'ASC' },
  });
  const byExternalId = new Map<string, Message>();
  existing.forEach((m) => {
    if (m.externalId) byExternalId.set(m.externalId, m);
  });

  // Snapshot each unclaimed row's normalized text so we don't recompute
  // on every iteration. Normalization strips Hermes wrapper noise on
  // both sides so e.g. `"what do you see on this image ?"` matches a
  // session row that Hermes saved as `"[The user attached…] … what do
  // you see on this image ? Attached file(s):…"`.
  const claimablePool = existing
    .filter((m) => !m.externalId && !m.deletedAt)
    .map((m) => ({
      msg: m,
      key: normalizeForMatch(m.role, m.text),
      claimed: false,
    }));

  const added: Message[] = [];
  let claimed = 0;

  await sessionMessages.reduce<Promise<void>>(
    (chain, sm) =>
      chain.then(async () => {
        const hit = byExternalId.get(sm.externalId);
        if (hit) {
          // Already tied to this Hermes id — including soft-deleted rows.
          // Respect user deletion: never undelete or duplicate.
          return;
        }

        const smKey = normalizeForMatch(sm.role, sm.text);
        const candidate = claimablePool.find(
          (c) => !c.claimed && c.msg.role === sm.role && c.key === smKey
        );
        if (candidate) {
          candidate.claimed = true;
          candidate.msg.externalId = sm.externalId;
          if (sm.thinking && !candidate.msg.thinking) candidate.msg.thinking = sm.thinking;
          await msgRepo.update(candidate.msg._id, {
            externalId: sm.externalId,
            thinking: candidate.msg.thinking,
          });
          claimed += 1;
          byExternalId.set(sm.externalId, candidate.msg);
          return;
        }

        const fresh = msgRepo.create({
          conversationId: conv._id,
          externalId: sm.externalId,
          text: sm.text,
          thinking: sm.thinking,
          role: sm.role,
          createdBy: ag?.createdBy ?? conv.createdBy,
          createdAt: sm.timestamp ?? new Date(),
        });
        try {
          const saved = await msgRepo.save(fresh);
          byExternalId.set(sm.externalId, saved);
          added.push(saved);
        } catch (err) {
          if (!(err instanceof QueryFailedError) || !isSqliteUniqueConstraint(err)) {
            throw err;
          }
          const row = await msgRepo.findOne({
            where: { conversationId: conv._id, externalId: sm.externalId },
            withDeleted: true,
          });
          if (!row) throw err;
          // Row already exists: either soft-deleted (user hid this turn;
          // UNIQUE still blocks insert) or a concurrent insert won. Swallow.
        }
      }),
    Promise.resolve()
  );

  return { added, claimed };
}

/**
 * Discover Hermes sessions on disk that aren't linked to any
 * conversation for the given agent and import them.
 *
 * This is what makes a `hermes -p <profile> chat` started from a
 * separate terminal show up in the web UI as a new conversation —
 * after the next discovery pass we have a row pointing at the
 * session file, and the per-conversation sync fills in messages.
 *
 * Empty sessions (the file was created but the user never sent a
 * message) are skipped so we don't pollute the sidebar.
 */
export interface DiscoveryResult {
  created: Conversation[];
  synced: Conversation[];
}

export async function discoverProfileSessions(agent: Agent): Promise<DiscoveryResult> {
  const profile = profileFor(agent);
  const files = listProfileSessionFiles(profile);
  if (!files.length) return { created: [], synced: [] };
  const sessionIds = files.map((f) => f.id);

  const convRepo = AppDataSource.getRepository(Conversation);
  const linked = await convRepo.find({
    where: { agentId: agent._id, sessionKey: In(sessionIds) },
    withDeleted: true,
  });
  const linkedKeys = new Set(linked.map((c) => c.sessionKey).filter((x): x is string => !!x));

  const created: Conversation[] = [];
  const now = Date.now();
  await files.reduce<Promise<void>>(
    (chain, file) =>
      chain.then(async () => {
        if (linkedKeys.has(file.id)) return;
        if (now - file.mtimeMs < RECENT_FILE_GRACE_MS) return;

        const meta = readSessionMeta(profile, file.id);
        if (!meta || meta.messageCount === 0) return;

        try {
          const conv = convRepo.create({
            agentId: agent._id,
            sessionKey: file.id,
            title: meta.title,
            createdBy: agent.createdBy,
            createdAt: meta.startedAt ?? new Date(),
          });
          const saved = await convRepo.save(conv);
          created.push(saved);
          await syncConversationFromHermes(saved, agent);
        } catch (err) {
          // If the chat controller raced us, or a soft-deleted conversation
          // still owns this sessionKey, the unique index rejects the insert.
          // Treat that as already linked so discovery stays quiet and idempotent.
          if (err instanceof QueryFailedError && isSqliteUniqueConstraint(err)) return;
          throw err;
        }
      }),
    Promise.resolve()
  );

  const synced: Conversation[] = [];
  if (linked.length) {
    await linked.reduce<Promise<void>>(
      (chain, c) =>
        chain.then(async () => {
          const r = await syncConversationFromHermes(c, agent);
          if (r.added.length || r.claimed) synced.push(c);
        }),
      Promise.resolve()
    );
  }

  return { created, synced };
}

/**
 * Convenience wrapper used by code paths that only know an agent id.
 * No-ops gracefully when the agent has been deleted.
 */
export async function discoverAgentSessionsById(
  agentId: number
): Promise<DiscoveryResult> {
  const agentRepo = AppDataSource.getRepository(Agent);
  const agent = await agentRepo.findOne({ where: { _id: agentId, deletedAt: IsNull() } });
  if (!agent) return { created: [], synced: [] };
  return discoverProfileSessions(agent);
}
