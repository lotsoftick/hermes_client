import { body, param } from 'express-validator';
import validate from '../../middlewares/validator';

export default {
  agentId: validate([param('agentId').isInt().withMessage('Incorrect agent id')]),

  id: validate([param('id').isInt().withMessage('Incorrect request url')]),

  create: validate([body('agentId').isInt().withMessage('Please provide a valid agent id')]),

  update: validate([
    param('id').isInt().withMessage('Incorrect request url'),
    body('title')
      .notEmpty()
      .withMessage('Please enter a title')
      .isLength({ min: 1, max: 200 })
      .withMessage('Title must be between 1 and 200 characters'),
  ]),
};
