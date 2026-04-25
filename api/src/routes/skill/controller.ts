import { List } from '../../@types/skill';
import * as hermes from '../../services/hermes';

// eslint-disable-next-line import/prefer-default-export
export const list: List = async (_req, res, next) => {
  try {
    return res.json(hermes.listSkills());
  } catch (error) {
    return next(error);
  }
};
