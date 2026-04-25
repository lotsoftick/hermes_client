import { body, param } from 'express-validator';
import { Not } from 'typeorm';
import { List } from '../../@types/user';
import validate from '../../middlewares/validator';
import AppDataSource from '../../data-source';
import { User } from '../../entities';

export default {
  sanitizeQuery: ((req, res, next) => {
    req.query.page = (req.query.page as number) >= 0 ? req.query.page : 0;
    req.query.limit = [5, 10, 20, 40, 60, 100].includes(+(req.query.limit as number))
      ? req.query.limit
      : 40;
    req.query.sortType = ['asc', 'desc'].includes(req.query.sortType as string)
      ? req.query.sortType
      : 'desc';
    req.query.sortField = ['name', 'email', 'createdAt', 'updatedAt'].includes(
      req.query.sortField as string
    )
      ? req.query.sortField
      : 'createdAt';
    return next();
  }) as List,

  id: validate([param('id').isInt().withMessage('Incorrect request url')]),

  create: validate([
    body('name')
      .notEmpty()
      .withMessage('Please enter the first name')
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .notEmpty()
      .withMessage('Please enter the last name')
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('email')
      .notEmpty()
      .withMessage('Please enter email address')
      .isEmail()
      .withMessage('Please enter a valid email address')
      .custom(async (value) => {
        const userRepo = AppDataSource.getRepository(User);
        const existingUser = await userRepo.findOneBy({ email: value.toLowerCase() });
        if (existingUser) {
          throw new Error('Email address is already registered');
        }
        return true;
      }),
    body('password')
      .notEmpty()
      .withMessage('Please enter password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('phone').optional().isMobilePhone('any').withMessage('Please enter a valid phone number'),
  ]),

  update: validate([
    body('name')
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
      .optional()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Please enter a valid email address')
      .custom(async (value, { req }) => {
        const userRepo = AppDataSource.getRepository(User);
        const existingUser = await userRepo.findOne({
          where: {
            email: value.toLowerCase(),
            _id: Not(Number(req.params?.id)),
          },
        });
        if (existingUser) {
          throw new Error('Email address is already registered');
        }
        return true;
      }),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('phone').optional().isMobilePhone('any').withMessage('Please enter a valid phone number'),
    body('active').optional().isBoolean().withMessage('Active must be a boolean value'),
  ]),
};
