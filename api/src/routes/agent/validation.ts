import { body, param } from 'express-validator';
import { List } from '../../@types/agent';
import validate from '../../middlewares/validator';
import AppDataSource from '../../data-source';
import { Agent } from '../../entities';

export default {
  sanitizeQuery: ((req, res, next) => {
    req.query.page = (req.query.page as number) >= 0 ? req.query.page : 0;
    req.query.limit = [5, 10, 20, 40, 60, 100].includes(+(req.query.limit as number))
      ? req.query.limit
      : 40;
    req.query.sortType = ['asc', 'desc'].includes(req.query.sortType as string)
      ? req.query.sortType
      : 'desc';
    req.query.sortField = ['name', 'createdAt', 'updatedAt'].includes(req.query.sortField as string)
      ? req.query.sortField
      : 'createdAt';
    return next();
  }) as List,

  id: validate([param('id').isInt().withMessage('Incorrect request url')]),

  create: validate([
    body('name')
      .notEmpty()
      .withMessage('Please enter the agent name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Agent name must contain between 1 and 100 characters')
      .custom(async (name) => {
        const agentRepo = AppDataSource.getRepository(Agent);
        const existing = await agentRepo.findOneBy({ name });
        if (existing) throw new Error('An agent with this name already exists');
      }),
  ]),

  update: validate([
    param('id').isInt().withMessage('Incorrect request url'),
    // Both `name` and the cap fields are optional. Allowing all three
    // sub-resources to be patched independently keeps the UI flexible
    // (rename without re-entering caps, set caps without renaming).
    body('name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Agent name must contain between 1 and 100 characters'),
    body('dailyCapUsd').optional({ nullable: true }),
    body('monthlyCapUsd').optional({ nullable: true }),
    body('allTimeCapUsd').optional({ nullable: true }),
  ]),
};
