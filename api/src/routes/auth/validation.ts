import { body } from 'express-validator';
import validate from '../../middlewares/validator';

export default {
  login: validate([
    body('email')
      .notEmpty()
      .withMessage('Please enter email address')
      .bail()
      .isEmail()
      .withMessage('Please enter correct email address'),
    body('password').notEmpty().withMessage('Please enter your password'),
  ]),
};
