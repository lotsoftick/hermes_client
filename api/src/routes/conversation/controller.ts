import AppDataSource from '../../data-source';
import { Agent, Conversation, Message } from '../../entities';
import { ListAll, ListByAgent, Create, Update, Destroy } from '../../@types/conversation';
import * as hermes from '../../services/hermes';

const listAll: ListAll = async (req, res, next) => {
  try {
    const convRepo = AppDataSource.getRepository(Conversation);
    const agentRepo = AppDataSource.getRepository(Agent);

    // Auto-import any newly created Hermes sessions for every agent
    // before answering. Reading a small JSON file per profile is cheap
    // and lets sessions started in standalone `hermes` REPLs surface
    // in the sidebar within one polling interval.
    const agents = await agentRepo.find();
    await Promise.allSettled(
      agents.map((a) =>
        hermes.discoverProfileSessions(a).catch((err) => {
          console.error('[conversations.listAll] discovery failed for', a.hermesProfile, err);
        })
      )
    );

    const items = await convRepo.find({ order: { createdAt: 'DESC' } });
    return res.json({ total: items.length, items });
  } catch (error) {
    return next(error);
  }
};

const listByAgent: ListByAgent = async (req, res, next) => {
  try {
    const agentId = Number(req.params.agentId);
    const agentRepo = AppDataSource.getRepository(Agent);
    const convRepo = AppDataSource.getRepository(Conversation);

    // Auto-import any Hermes sessions for this profile that we don't
    // know about yet. This covers the case where the user typed in a
    // standalone `hermes` REPL — the new session file is on disk and
    // becomes a conversation in the sidebar after this scan.
    const agent = await agentRepo.findOneBy({ _id: agentId });
    if (agent) {
      try {
        await hermes.discoverProfileSessions(agent);
      } catch (err) {
        console.error('[conversations.listByAgent] discovery failed:', err);
      }
    }

    const items = await convRepo.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
    return res.json({ total: items.length, items });
  } catch (error) {
    return next(error);
  }
};

const create: Create = async (req, res, next) => {
  try {
    const convRepo = AppDataSource.getRepository(Conversation);
    const conversation = convRepo.create({
      agentId: Number(req.body.agentId),
      createdBy: req.user!._id,
      createdAt: new Date(),
    });
    const saved = await convRepo.save(conversation);
    return res.json(saved);
  } catch (error) {
    return next(error);
  }
};

const update: Update = async (req, res, next) => {
  try {
    const convRepo = AppDataSource.getRepository(Conversation);
    const id = Number(req.params.id);

    await convRepo.update(id, { title: req.body.title });
    const conversation = await convRepo.findOneBy({ _id: id });
    if (!conversation) return res.status(404).json(null);

    if (conversation.sessionKey) {
      const agentRepo = AppDataSource.getRepository(Agent);
      const agent = await agentRepo.findOneBy({ _id: conversation.agentId });
      if (agent?.hermesProfile && req.body.title) {
        hermes.renameSession(agent.hermesProfile, conversation.sessionKey, req.body.title);
      }
    }
    return res.json(conversation);
  } catch (error) {
    return next(error);
  }
};

const destroy: Destroy = async (req, res, next) => {
  try {
    const convRepo = AppDataSource.getRepository(Conversation);
    const msgRepo = AppDataSource.getRepository(Message);
    const id = Number(req.params.id);

    const conv = await convRepo.findOneBy({ _id: id });
    await convRepo.softDelete(id);
    await msgRepo
      .createQueryBuilder()
      .update(Message)
      .set({ deletedAt: new Date() })
      .where('conversationId = :id', { id })
      .execute();

    if (conv?.sessionKey) {
      const agentRepo = AppDataSource.getRepository(Agent);
      const agent = await agentRepo.findOneBy({ _id: conv.agentId });
      if (agent?.hermesProfile) {
        hermes.deleteSession(agent.hermesProfile, conv.sessionKey);
      }
    }
    return res.json(null);
  } catch (error) {
    return next(error);
  }
};

export { listAll, listByAgent, create, update, destroy };
