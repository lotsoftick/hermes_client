import { Apply, Check, Status } from '../../@types/update';
import * as updateService from '../../services/updateService';

export const status: Status = async (_req, res, next) => {
  try {
    return res.json(updateService.getUpdateStatus());
  } catch (error) {
    return next(error);
  }
};

export const check: Check = async (_req, res, next) => {
  try {
    const result = await updateService.checkForUpdate();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};

export const apply: Apply = async (_req, res, next) => {
  try {
    if (updateService.isUpdating()) {
      return res.status(409).json({ ok: false, error: 'Update already in progress' });
    }
    const result = await updateService.applyUpdate();
    if (!result.ok) {
      return res.status(500).json(result);
    }
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
