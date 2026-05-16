import { In } from 'typeorm';
import { RequestHandler } from 'express';
import AppDataSource from '../../data-source';
import { Agent, Conversation } from '../../entities';
import { List, Get, Create, Update, Destroy, AgentJson } from '../../@types/agent';
import * as hermes from '../../services/hermes';

/**
 * Resolve gateway status for a batch of profiles. Each call goes through
 * the per-profile cache in `hermes/gateway.ts` so this is cheap on warm
 * paths even though the underlying CLI call is sequential per profile.
 */
function getGatewayRunning(profiles: string[]): Record<string, boolean> {
  return profiles.reduce<Record<string, boolean>>((acc, p) => {
    acc[p] = hermes.readGatewayStatusCached(p).running;
    return acc;
  }, {});
}

function decorate(
  agent: Agent,
  models: Record<string, string | null>,
  gateways: Record<string, boolean>
): AgentJson {
  return {
    _id: agent._id,
    name: agent.name,
    hermesProfile: agent.hermesProfile,
    createdBy: agent.createdBy,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
    model: models[agent.hermesProfile] ?? null,
    exists: hermes.profileExists(agent.hermesProfile),
    gatewayRunning: gateways[agent.hermesProfile] ?? false,
    dailyCapUsd: agent.dailyCapUsd,
    monthlyCapUsd: agent.monthlyCapUsd,
    allTimeCapUsd: agent.allTimeCapUsd,
  };
}

/**
 * Sanitise a single cap field from the request body.
 *
 * Accepts:
 *   - `undefined` → "leave unchanged" (returns `undefined`)
 *   - `null`, `''`, `'null'`, `0` → "clear the cap" (returns `null`)
 *   - any positive finite number (or numeric string) → that number
 *
 * Negative numbers and unparseable strings are also coerced to `null`
 * so the UI can be a bit lax without us writing junk into the DB.
 */
function sanitiseCap(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '' || raw === 'null') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Cap at 6 decimals (sub-millicent precision) and a sane upper bound
  // to prevent integer-overflow funny business in the SQLite real type.
  return Math.min(Math.round(n * 1_000_000) / 1_000_000, 1_000_000_000);
}

const list: List = async (req, res, next) => {
  try {
    const { page = 0, limit = 40, sortField = 'createdAt', sortType = 'desc' } = req.query;
    const agentRepo = AppDataSource.getRepository(Agent);

    const qb = agentRepo.createQueryBuilder('agent');
    if (req.query.search) {
      const search = req.query.search as string;
      if (!Number.isNaN(Number(search))) {
        qb.andWhere('agent._id = :id', { id: Number(search) });
      } else {
        qb.andWhere('agent.name LIKE :s', { s: `%${search}%` });
      }
    }

    const total = await qb.getCount();
    const items = await qb
      .skip(Number(page) * Number(limit))
      .take(Number(limit))
      .orderBy(
        `agent.${sortField as string}`,
        (sortType as string).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
      )
      .getMany();

    const profiles = items.map((a) => a.hermesProfile);
    const models = hermes.getProfileModels(profiles);
    const gateways = getGatewayRunning(profiles);
    return res.json({ total, items: items.map((a) => decorate(a, models, gateways)) });
  } catch (error) {
    return next(error);
  }
};

const get: Get = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const agent = await agentRepo.findOneBy({ _id: Number(req.params.id) });
    if (!agent) return res.json(null);
    const models = hermes.getProfileModels([agent.hermesProfile]);
    const gateways = getGatewayRunning([agent.hermesProfile]);
    return res.json(decorate(agent, models, gateways));
  } catch (error) {
    return next(error);
  }
};

const create: Create = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const requestedProfile = req.body.hermesProfile?.trim() || hermes.toProfileName(req.body.name || '');
    if (!hermes.isValidProfileName(requestedProfile)) {
      return res
        .status(422)
        .json({ name: ['Profile name must be lowercase alphanumeric (with - or _).'] } as never);
    }
    const result = hermes.createProfile(requestedProfile);
    if (!result.ok) return res.status(500).json({ name: [result.error || 'Failed'] } as never);

    const agent = agentRepo.create({
      name: req.body.name?.trim() || requestedProfile,
      hermesProfile: requestedProfile,
      createdBy: req.user!._id,
      createdAt: new Date(),
    });
    const saved = await agentRepo.save(agent);

    // Auto-start the per-profile hermes gateway so the new agent is
    // immediately reachable by any messenger configured later. Deferred
    // via setImmediate because startProfileGateway runs blocking
    // execFileSync calls before its first `await`, which would otherwise
    // stall the create response for several seconds. The sidebar dot
    // flips green once the daemon reports loaded on the next poll.
    setImmediate(() => {
      hermes.startProfileGateway(saved.hermesProfile).catch(() => {
        // Swallow: failures are surfaced via the status dot + lifecycle UI.
      });
    });

    const models = hermes.getProfileModels([saved.hermesProfile]);
    const gateways = getGatewayRunning([saved.hermesProfile]);
    return res.json(decorate(saved, models, gateways));
  } catch (error) {
    return next(error);
  }
};

const update: Update = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const id = Number(req.params.id);

    const patch: Partial<Agent> = { updatedAt: new Date() };
    if (req.body.name !== undefined) patch.name = req.body.name;

    // Caps are optional in the body — only touched when present, so the
    // same PATCH endpoint serves both "rename agent" and "set caps" UIs.
    const daily = sanitiseCap(req.body.dailyCapUsd);
    if (daily !== undefined) patch.dailyCapUsd = daily;
    const monthly = sanitiseCap(req.body.monthlyCapUsd);
    if (monthly !== undefined) patch.monthlyCapUsd = monthly;
    const allTime = sanitiseCap(req.body.allTimeCapUsd);
    if (allTime !== undefined) patch.allTimeCapUsd = allTime;

    await agentRepo.update(id, patch);
    const agent = await agentRepo.findOneBy({ _id: id });
    if (!agent) return res.status(404).json(null);
    const models = hermes.getProfileModels([agent.hermesProfile]);
    const gateways = getGatewayRunning([agent.hermesProfile]);
    return res.json(decorate(agent, models, gateways));
  } catch (error) {
    return next(error);
  }
};

const destroy: Destroy = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const convRepo = AppDataSource.getRepository(Conversation);
    const id = Number(req.params.id);

    const agent = await agentRepo.findOneBy({ _id: id });
    await agentRepo.softDelete(id);
    await convRepo
      .createQueryBuilder()
      .update(Conversation)
      .set({ deletedAt: new Date() })
      .where('agentId = :id', { id })
      .execute();

    if (agent?.hermesProfile && agent.hermesProfile !== 'default') {
      hermes.deleteProfile(agent.hermesProfile);
    }
    return res.json(null);
  } catch (error) {
    return next(error);
  }
};

/**
 * Reconcile our DB with `hermes profile list`. New profiles found in Hermes
 * are imported as agents owned by the requesting user; profiles deleted on
 * disk are not removed from the DB (we keep history of past sessions).
 */
const sync: RequestHandler = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const profiles = hermes.listProfiles();
    if (!profiles.length) return res.json({ syncedAgents: 0 });

    const existing = await agentRepo.find({
      where: { hermesProfile: In(profiles.map((p) => p.name)) },
    });
    const knownNames = new Set(existing.map((a) => a.hermesProfile));
    const toAdd = profiles.filter((p) => !knownNames.has(p.name));
    if (toAdd.length) {
      await agentRepo.save(
        toAdd.map((p) =>
          agentRepo.create({
            name: p.name,
            hermesProfile: p.name,
            createdBy: req.user!._id,
            createdAt: p.createdAt,
          })
        )
      );
    }
    return res.json({ syncedAgents: toAdd.length });
  } catch (error) {
    return next(error);
  }
};

const getSessionSettings: RequestHandler = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const convRepo = AppDataSource.getRepository(Conversation);

    const agent = await agentRepo.findOneBy({ _id: Number(req.params.id) });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const conv = await convRepo.findOneBy({ _id: Number(req.params.conversationId) });
    if (!conv?.sessionKey) return res.json({ ok: true, settings: { title: conv?.title ?? null } });
    return res.json({ ok: true, settings: { title: conv.title ?? null, sessionId: conv.sessionKey } });
  } catch (error) {
    return next(error);
  }
};

/**
 * Patch a conversation's title; if hermes has the underlying session, the
 * rename is also pushed to the hermes session store so `hermes sessions list`
 * reflects the new label.
 */
const patchSessionSettings: RequestHandler = async (req, res, next) => {
  try {
    const agentRepo = AppDataSource.getRepository(Agent);
    const convRepo = AppDataSource.getRepository(Conversation);

    const agent = await agentRepo.findOneBy({ _id: Number(req.params.id) });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const conv = await convRepo.findOneBy({ _id: Number(req.params.conversationId) });
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const body = (req.body ?? {}) as { label?: string | null; title?: string | null };
    const newTitle = body.title ?? body.label;
    if (newTitle !== undefined) {
      await convRepo.update(conv._id, { title: newTitle });
      if (conv.sessionKey && newTitle) {
        hermes.renameSession(agent.hermesProfile, conv.sessionKey, String(newTitle));
      }
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
};

/**
 * Run a gateway lifecycle action against the agent's underlying hermes
 * profile. The hermes service helpers already invalidate the per-profile
 * status cache, so the very next agent list/get response will reflect
 * the new daemon state — no extra plumbing needed here.
 */
type GatewayOp = (profile: string) => Promise<{ ok: boolean; error?: string; raw: string }>;

const runGatewayOp =
  (op: GatewayOp): RequestHandler =>
  async (req, res, next) => {
    try {
      const agentRepo = AppDataSource.getRepository(Agent);
      const agent = await agentRepo.findOneBy({ _id: Number(req.params.id) });
      if (!agent) return res.status(404).json({ ok: false, error: 'Agent not found', raw: '' });
      const result = await op(agent.hermesProfile);
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (error) {
      return next(error);
    }
  };

const gatewayStart = runGatewayOp((profile) => hermes.startProfileGateway(profile));
const gatewayStop = runGatewayOp(async (profile) => hermes.stopProfileGateway(profile));
const gatewayRestart = runGatewayOp((profile) => hermes.restartProfileGateway(profile));

export {
  list,
  get,
  create,
  update,
  destroy,
  sync,
  getSessionSettings,
  patchSessionSettings,
  gatewayStart,
  gatewayStop,
  gatewayRestart,
};
