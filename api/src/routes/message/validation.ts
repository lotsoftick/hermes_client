import { body, param } from 'express-validator';
import validate from '../../middlewares/validator';

export default {
  conversationId: validate([
    param('conversationId').isInt().withMessage('Incorrect conversation id'),
  ]),

  id: validate([param('id').isInt().withMessage('Incorrect request url')]),

  create: validate([
    body('conversationId').isInt().withMessage('Please provide a valid conversation id'),
    body('text').notEmpty().withMessage('Please enter a message'),
  ]),

  chat: validate([
    body('conversationId').isInt().withMessage('Please provide a valid conversation id'),
    body('text').custom((value, { req }) => {
      if (!value && (!req.files || (req.files as Express.Multer.File[]).length === 0)) {
        throw new Error('Please enter a message or attach a file');
      }
      return true;
    }),
  ]),
};
