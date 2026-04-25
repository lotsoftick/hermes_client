import { List, Toggle } from '../../@types/plugin';
import * as hermes from '../../services/hermes';

export const list: List = async (_req, res, next) => {
  try {
    return res.json(hermes.listPlugins());
  } catch (error) {
    return next(error);
  }
};

export const toggle: Toggle = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enable } = req.body;
    if (typeof enable !== 'boolean') {
      return res.status(400).json({ ok: false, error: 'enable (boolean) is required' });
    }
    const result = enable ? hermes.enablePlugin(id) : hermes.disablePlugin(id);
    if (!result.ok) return res.status(500).json(result);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
