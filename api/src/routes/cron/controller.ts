import { Add, List, Remove, Toggle } from '../../@types/cron';
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
    const result = hermes.removeCronJob(req.params.id);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const toggle: Toggle = async (req, res, next) => {
  try {
    const { enable } = req.body;
    if (typeof enable !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enable (boolean) is required' });
    }
    const result = hermes.toggleCronJob(req.params.id, enable);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
