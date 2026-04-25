import { IsNull, In } from 'typeorm';
import AppDataSource from '../../data-source';
import { Agent, Conversation, Message } from '../../entities';
import { getSessionMessages, listProfileSessionFiles, readSessionMeta } from './sessions';

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
 *   2. Skip rows already imported (matched by externalId).
 *   3. Reuse local rows that we created during the live request before
 *      Hermes had assigned them a session-relative id (matched by
 *      role + text), stamping them with the externalId so we don't
 *      duplicate them on the next pass.
 *   4. Insert anything genuinely new — these are the turns that came
 *      from the standalone REPL.
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
  const existing = await msgRepo.find({
    where: { conversationId: conv._id },
    order: { createdAt: 'ASC', _id: 'ASC' },
  });
  const knownExternalIds = new Set(
    existing.map((m) => m.externalId).filter((x): x is string => !!x)
  );

  const claimablePool = existing
    .filter((m) => !m.externalId)
    .map((m) => ({ msg: m, claimed: false }));

  const added: Message[] = [];
  let claimed = 0;

  for (const sm of sessionMessages) {
    if (knownExternalIds.has(sm.externalId)) continue;

    const candidate = claimablePool.find(
      (c) => !c.claimed && c.msg.role === sm.role && c.msg.text.trim() === sm.text.trim()
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
      knownExternalIds.add(sm.externalId);
      continue;
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
    const saved = await msgRepo.save(fresh);
    knownExternalIds.add(sm.externalId);
    added.push(saved);
  }

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
  });
  const linkedKeys = new Set(linked.map((c) => c.sessionKey).filter((x): x is string => !!x));

  const created: Conversation[] = [];
  const now = Date.now();
  for (const file of files) {
    if (linkedKeys.has(file.id)) continue;
    if (now - file.mtimeMs < RECENT_FILE_GRACE_MS) continue;

    const meta = readSessionMeta(profile, file.id);
    if (!meta || meta.messageCount === 0) continue;

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
      // If the chat controller raced us and bound this session to a
      // conversation in the meantime, the unique index will reject the
      // insert. Treat that as success — the row exists, just not under
      // our hand.
      console.warn(
        `[sync] failed to import session ${file.id} for ${agent.hermesProfile}:`,
        (err as Error).message
      );
    }
  }

  const synced: Conversation[] = [];
  if (linked.length) {
    for (const c of linked) {
      const r = await syncConversationFromHermes(c, agent);
      if (r.added.length || r.claimed) synced.push(c);
    }
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
