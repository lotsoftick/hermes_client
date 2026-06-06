import { IsNull, In, QueryFailedError } from 'typeorm';
import AppDataSource from '../../data-source';
import { Agent, Conversation, Message } from '../../entities';
import { getSessionMessages, listProfileSessionFiles, listSessions, readSessionMeta } from './sessions';
import { isAgentChatActive } from './activeChats';
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

  // Hermes session files list messages in chronological order but often
  // omit per-message timestamps. We therefore can't trust `createdAt`
  // alone to preserve order: rows imported live (or out-of-order across
  // racing sync passes) can land within milliseconds of each other and
  // even invert a turn (assistant above its user message). To guarantee
  // the UI — which sorts by `createdAt` — renders in true session order,
  // we walk the session sequence and force each row's `createdAt` to be
  // strictly greater than the previous one's, repairing inversions in
  // place. Rows already in order are left untouched.
  let prevCreatedAtMs = 0;

  await sessionMessages.reduce<Promise<void>>(
    (chain, sm) =>
      chain.then(async () => {
        const smKey = normalizeForMatch(sm.role, sm.text);
        let row: Message | undefined;

        const hit = byExternalId.get(sm.externalId);
        if (hit) {
          // Already tied to this Hermes id — including soft-deleted rows.
          // Respect user deletion: never undelete or duplicate. We do
          // backfill richer fields (thinking/tools/images) that older
          // imports predate, so upgrading lights up past conversations.
          const patch: Partial<Message> = {};
          if (sm.thinking && !hit.thinking) patch.thinking = sm.thinking;
          if (sm.toolCalls.length && !hit.toolCalls?.length) patch.toolCalls = sm.toolCalls;
          if (sm.images.length && !hit.images?.length) patch.images = sm.images;
          if (Object.keys(patch).length) await msgRepo.update(hit._id, patch);

          // Sweep up a live-save orphan: when a concurrent poll imported
          // this session row (giving it an externalId) before the chat
          // handler's own row got claimed, that handler row is left with
          // a null externalId and identical text — showing as a duplicate.
          // `hit` is the canonical copy, so we hard-delete the orphan.
          if (!hit.deletedAt) {
            const orphan = claimablePool.find(
              (c) => !c.claimed && c.msg._id !== hit._id && c.msg.role === sm.role && c.key === smKey
            );
            if (orphan) {
              orphan.claimed = true;
              await msgRepo.delete(orphan.msg._id);
            }
          }
          row = hit;
        } else {
          const candidate = claimablePool.find(
            (c) => !c.claimed && c.msg.role === sm.role && c.key === smKey
          );
          if (candidate) {
            candidate.claimed = true;
            candidate.msg.externalId = sm.externalId;
            if (sm.thinking && !candidate.msg.thinking) candidate.msg.thinking = sm.thinking;
            if (sm.toolCalls.length && !candidate.msg.toolCalls?.length) {
              candidate.msg.toolCalls = sm.toolCalls;
            }
            if (sm.images.length && !candidate.msg.images?.length) {
              candidate.msg.images = sm.images;
            }
            await msgRepo.update(candidate.msg._id, {
              externalId: sm.externalId,
              thinking: candidate.msg.thinking,
              toolCalls: candidate.msg.toolCalls,
              images: candidate.msg.images,
            });
            claimed += 1;
            byExternalId.set(sm.externalId, candidate.msg);
            row = candidate.msg;
          } else {
            // Anchor a timestamp-less fresh import just after the previous
            // turn so it can never sort ahead of it.
            const desiredMs = sm.timestamp ? sm.timestamp.getTime() : Date.now();
            const createdAtMs = Math.max(desiredMs, prevCreatedAtMs + 1);
            const fresh = msgRepo.create({
              conversationId: conv._id,
              externalId: sm.externalId,
              text: sm.text,
              thinking: sm.thinking,
              toolCalls: sm.toolCalls,
              images: sm.images,
              role: sm.role,
              createdBy: ag?.createdBy ?? conv.createdBy,
              createdAt: new Date(createdAtMs),
            });
            try {
              const saved = await msgRepo.save(fresh);
              byExternalId.set(sm.externalId, saved);
              added.push(saved);
              row = saved;
            } catch (err) {
              if (!(err instanceof QueryFailedError) || !isSqliteUniqueConstraint(err)) {
                throw err;
              }
              const dupRow = await msgRepo.findOne({
                where: { conversationId: conv._id, externalId: sm.externalId },
                withDeleted: true,
              });
              if (!dupRow) throw err;
              // Row already exists: either soft-deleted (user hid this turn;
              // UNIQUE still blocks insert) or a concurrent insert won. Swallow.
              row = dupRow;
            }
          }
        }

        // Keep `createdAt` monotonically increasing along the session
        // sequence so the chat renders in true order even when timestamps
        // are missing or were assigned out of order. Skip soft-deleted
        // rows — they aren't rendered and shouldn't anchor the sequence.
        if (row && !row.deletedAt) {
          const curMs = new Date(row.createdAt).getTime();
          if (curMs <= prevCreatedAtMs) {
            const fixedAt = new Date(prevCreatedAtMs + 1);
            await msgRepo.update(row._id, { createdAt: fixedAt });
            row.createdAt = fixedAt;
            prevCreatedAtMs += 1;
          } else {
            prevCreatedAtMs = curMs;
          }
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
  // All on-disk session ids — used to (re)sync conversations we already
  // track, regardless of whether Hermes still lists them (old chats age
  // out of `sessions list` but their history should keep syncing).
  const sessionIds = files.map((f) => f.id);

  // New conversations, however, are only created for sessions Hermes
  // itself lists as top-level chats. Agents spawn internal sub-sessions
  // for delegated tasks (e.g. an image-gen skill writes its own session
  // whose first "user" turn is a synthetic instruction like "Generate a
  // random AI image and save it…"). Those live in the same directory but
  // are NOT returned by `sessions list`; importing them leaks bogus
  // conversations into the sidebar. If the listing comes back empty (CLI
  // hiccup), fall back to all files so a transient error can't hide real
  // sessions.
  // A turn in flight for this agent is about to bind a (possibly brand
  // new) session to the conversation the user is actually in. Don't race
  // it by creating a competing conversation — the chat controller claims
  // the session, and the next discovery pass after the turn finishes
  // finds it already linked. Existing linked conversations still sync.
  let creatableFiles: typeof files = [];
  if (!isAgentChatActive(agent._id)) {
    const listedIds = new Set(listSessions(profile).map((s) => s.id));
    creatableFiles = listedIds.size ? files.filter((f) => listedIds.has(f.id)) : files;
  }

  const convRepo = AppDataSource.getRepository(Conversation);
  const linked = await convRepo.find({
    where: { agentId: agent._id, sessionKey: In(sessionIds) },
    withDeleted: true,
  });
  const linkedKeys = new Set(linked.map((c) => c.sessionKey).filter((x): x is string => !!x));

  const created: Conversation[] = [];
  const now = Date.now();
  await creatableFiles.reduce<Promise<void>>(
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
