import { errMsg } from '../../utils/errors';
import * as hermes from '../../services/hermes';
import type { GetAgentsSpend, GetInsights } from '../../@types/insights';

const get: GetInsights = async (req, res) => {
  try {
    const days = req.query.days ? Number(req.query.days) : undefined;
    const topN = req.query.topN ? Number(req.query.topN) : undefined;
    const agentIdRaw = req.query.agentId ? Number(req.query.agentId) : undefined;
    const profile = req.query.profile?.trim() || null;

    const data = await hermes.getInsights({
      days: Number.isFinite(days as number) ? (days as number) : undefined,
      topN: Number.isFinite(topN as number) ? (topN as number) : undefined,
      agentId: Number.isFinite(agentIdRaw as number) ? (agentIdRaw as number) : null,
      profile,
    });
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: errMsg(err) });
  }
};

const getAgentsSpend: GetAgentsSpend = async (_req, res) => {
  try {
    const data = await hermes.getAgentsSpend();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ message: errMsg(err) });
  }
};

export { get, getAgentsSpend };
