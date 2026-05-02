import path from 'path';
import { RequestHandler } from 'express';
import { LessThan, MoreThan, FindOptionsWhere } from 'typeorm';
import AppDataSource from '../../data-source';
import { Message, Conversation, Agent } from '../../entities';
import {
  ListByConversation,
  Create,
  Chat,
  Destroy,
  MessageFile,
  MessageResponse,
} from '../../@types/message';
import * as hermes from '../../services/hermes';

/**
 * Resolve the public origin to use when minting URLs back to the client.
 *
 * Hermes Client is deployed in two patterns:
 *   1. Local-only: browser on the install host. `Host` header reads
 *      `localhost:<port>` and the API_PUBLIC_URL env (default
 *      `http://localhost:18889`) was historically hardcoded — fine.
 *   2. LAN/Tailscale/IP: browser on a different device. `Host` reads
 *      `<remote-host>:<port>`. A hardcoded localhost URL would point
 *      the remote browser at *its own machine*, breaking upload
 *      previews and downloads silently.
 *
 * So we prefer `req.headers.host` (already validated by Express + the
 * cors middleware) and only fall back to the env override / default
 * for non-HTTP callers. `x-forwarded-host` is honoured for users
 * running behind a reverse proxy.
 */
const apiPublicUrl = (req: { headers: Record<string, string | string[] | undefined>; protocol?: string }): string => {
  const envOverride = process.env.API_PUBLIC_URL;
  const xfHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || req.headers.host;
  if (host) {
    const xfProto = req.headers['x-forwarded-proto'];
    const proto =
      (Array.isArray(xfProto) ? xfProto[0] : xfProto) || req.protocol || 'http';
    return `${proto}://${host}`;
  }
  return envOverride || 'http://localhost:18889';
};

const DEFAULT_PAGE_SIZE = 50;

const listByConversation: ListByConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || '', 10) || DEFAULT_PAGE_SIZE, 1),
      200
    );
    const { before } = req.query;

    const msgRepo = AppDataSource.getRepository(Message);
    const where: FindOptionsWhere<Message> = { conversationId: Number(conversationId) };
    if (before) where.createdAt = LessThan(new Date(before));

    const items = await msgRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    if (hasMore) items.pop();
    items.reverse();

    return res.json({ total: items.length, items, hasMore });
  } catch (error) {
    return next(error);
  }
};

const create: Create = async (req, res, next) => {
  try {
    const msgRepo = AppDataSource.getRepository(Message);
    const message = msgRepo.create({
      conversationId: Number(req.body.conversationId),
      text: req.body.text || '',
      role: 'user' as const,
      createdBy: req.user!._id,
      createdAt: new Date(),
    });
    const saved = await msgRepo.save(message);
    const result = Object.fromEntries(
      Object.entries(saved as object).filter(([k]) => k !== 'deletedAt')
    ) as MessageResponse;
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Persist user input + uploads, then spawn `hermes chat -Q -q "<msg>"` and
 * stream stdout to the client over SSE. After the child exits, persist the
 * assistant response and bind the conversation to the resolved Hermes
 * session id (so subsequent turns can `--resume`).
 */
const chat: Chat = async (req, res, next) => {
  try {
    const { conversationId, text } = req.body;
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];

    const convRepo = AppDataSource.getRepository(Conversation);
    const agentRepo = AppDataSource.getRepository(Agent);
    const msgRepo = AppDataSource.getRepository(Message);

    const conv = await convRepo.findOneBy({ _id: Number(conversationId) });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const agent = await agentRepo.findOneBy({ _id: conv.agentId });
    const profile = agent?.hermesProfile || 'default';

    const persistedFiles = uploadedFiles.map((uf) =>
      hermes.persistUpload(conv._id, uf.path, uf.originalname, uf.mimetype, uf.size)
    );
    const publicUrl = apiPublicUrl(req);
    const messageFiles: MessageFile[] = persistedFiles.map((f) => ({
      filename: f.storedName,
      originalName: f.originalName,
      mimetype: f.mimetype,
      size: f.size,
      url: `${publicUrl}/api/conversation/${conv._id}/uploads/${encodeURIComponent(f.storedName)}`,
    }));

    const userMessage = msgRepo.create({
      conversationId: conv._id,
      text: text || (messageFiles.length ? `[Attached ${messageFiles.length} file(s)]` : ''),
      files: messageFiles,
      role: 'user' as const,
      createdBy: req.user!._id,
      createdAt: new Date(),
    });
    const savedUser = await msgRepo.save(userMessage);

    const isFirstMessage = !conv.title && !!text;
    if (isFirstMessage) {
      await convRepo.update(conv._id, { title: text!.slice(0, 200) });
    }

    const promptForHermes = (() => {
      if (!persistedFiles.length) return text || '';
      const fileNotes = persistedFiles.map((f) => `- ${f.originalName}: ${f.absolutePath}`).join('\n');
      const prefix = text ? `${text}\n\n` : '';
      return `${prefix}Attached file(s):\n${fileNotes}`;
    })();

    const imagePaths = persistedFiles
      .filter((f) => hermes.isImage(f.originalName))
      .map((f) => f.absolutePath);

    const result = await hermes.streamChat(res, promptForHermes, {
      profile,
      sessionId: conv.sessionKey ?? null,
      imagePaths,
    });

    // Persist the assistant turn BEFORE we close the SSE response. The
    // client's `useSendMessage` hook calls `refetch()` the moment it
    // sees the stream end, so anything saved after `res.end()` here
    // would race the follow-up `getMessages` request and the bubble
    // would briefly disappear from the UI.
    if (result.sessionId && conv.sessionKey !== result.sessionId) {
      await convRepo.update(conv._id, { sessionKey: result.sessionId });
      conv.sessionKey = result.sessionId;
    }
    let savedAssistantId: number | null = null;
    if (result.text) {
      const assistantMessage = msgRepo.create({
        conversationId: conv._id,
        text: result.text,
        role: 'assistant' as const,
        createdBy: req.user!._id,
        createdAt: new Date(),
      });
      const savedAssistant = await msgRepo.save(assistantMessage);
      savedAssistantId = savedAssistant._id;
    }

    if (isFirstMessage && result.sessionId) {
      hermes.renameSession(profile, result.sessionId, text!.slice(0, 200));
    }

    // Reconcile our just-written rows with the Hermes session JSON file.
    // This stamps the user/assistant rows with stable externalIds so a
    // subsequent poll-driven sync (or a sync triggered by activity in a
    // standalone `hermes` REPL) doesn't re-import them as duplicates.
    if (conv.sessionKey) {
      try {
        await hermes.syncConversationFromHermes(conv, agent);
      } catch (err) {
        console.error('[chat] post-stream sync failed:', err);
      }
    }

    if (!res.writableEnded) {
      if (savedAssistantId !== null) {
        res.write(
          `data: ${JSON.stringify({ type: 'message.saved', messageId: savedAssistantId })}\n\n`
        );
      }
      res.write('data: [DONE]\n\n');
      res.end();
    }
    if (savedUser) return undefined;
    return undefined;
  } catch (error) {
    if (!res.headersSent) return next(error);
    if (!res.writableEnded) {
      try {
        res.write(
          `data: ${JSON.stringify({ type: 'response.error', delta: (error as Error).message })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } catch {
        /* response already torn down */
      }
    }
    return undefined;
  }
};

const destroy: Destroy = async (req, res, next) => {
  try {
    const msgRepo = AppDataSource.getRepository(Message);
    const id = Number(req.params.id);
    await msgRepo.softDelete(id);
    return res.json(null);
  } catch (error) {
    return next(error);
  }
};

/**
 * Long-poll endpoint that reconciles with the Hermes session JSON file
 * before answering. This is what makes turns sent from a standalone
 * `hermes` REPL — when launched with `--resume <sessionKey>` for the
 * conversation we're polling — show up in the web UI.
 *
 * The reconciliation is idempotent (matched by stable externalId) so
 * repeating it on every poll is safe and cheap.
 */
const poll: RequestHandler<{ conversationId: string }, unknown, never, { after?: string }> = async (
  req,
  res,
  next
) => {
  try {
    const convId = Number(req.params.conversationId);
    const { after } = req.query;

    const convRepo = AppDataSource.getRepository(Conversation);
    const msgRepo = AppDataSource.getRepository(Message);
    const conv = await convRepo.findOneBy({ _id: convId });

    let synced = 0;
    if (conv?.sessionKey) {
      try {
        const r = await hermes.syncConversationFromHermes(conv);
        synced = r.added.length + r.claimed;
      } catch (err) {
        console.error('[poll] sync failed for conv', convId, err);
      }
    }

    const where: FindOptionsWhere<Message> = { conversationId: convId };
    if (after) where.createdAt = MoreThan(new Date(after));
    const items = await msgRepo.find({
      where,
      order: { createdAt: 'ASC' },
      take: 200,
    });
    return res.json({ items, synced });
  } catch (error) {
    return next(error);
  }
};

const serveUpload: RequestHandler<{ conversationId: string; filename: string }> = async (
  req,
  res,
  next
) => {
  try {
    const fp = hermes.uploadAbsolutePath(Number(req.params.conversationId), req.params.filename);
    if (!fp) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.sendFile(path.resolve(fp));
  } catch (error) {
    return next(error);
  }
};

export { listByConversation, create, chat, destroy, poll, serveUpload };
