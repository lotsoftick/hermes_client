import {
  Add,
  GetGateway,
  GetRuns,
  List,
  Remove,
  StartGateway,
  StopGateway,
  Toggle,
} from '../../@types/cron';
import * as hermes from '../../services/hermes';

export const list: List = async (_req, res, next) => {
  try {
    const jobs = hermes.listCronJobs();
    return res.json({ jobs, total: jobs.length });
  } catch (error) {
    return next(error);
  }
};

export const add: Add = async (req, res, next) => {
  try {
    const opts = req.body;
    if (!opts.name && !opts.message) {
      return res.status(400).json({ ok: false, error: 'name or message is required' });
    }
    const result = hermes.addCronJob(opts);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const remove: Remove = async (req, res, next) => {
  try {
    const result = hermes.removeCronJob(req.params.id, req.query.profile);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const toggle: Toggle = async (req, res, next) => {
  try {
    const { enable, profile } = req.body;
    if (typeof enable !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enable (boolean) is required' });
    }
    const result = hermes.toggleCronJob(req.params.id, enable, profile);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const getRuns: GetRuns = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const runs = hermes.listCronRuns(req.params.id, req.query.profile, limit);
    return res.json({ runs });
  } catch (error) {
    return next(error);
  }
};

export const getGateway: GetGateway = async (_req, res, next) => {
  try {
    return res.json(hermes.getGatewayStatus());
  } catch (error) {
    return next(error);
  }
};

export const startGateway: StartGateway = async (req, res, next) => {
  try {
    const result = await hermes.startGateway(req.body?.profile);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const stopGateway: StopGateway = async (req, res, next) => {
  try {
    const result = hermes.stopGateway(req.body?.profile);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
