import Router from 'express';
import * as controller from './controller';
import validate from './validation';
import auth from '../../middlewares/auth';

const router = Router();

router
  .route('/user')
  .get(auth, validate.sanitizeQuery, controller.list)
  .post(auth, validate.create, controller.create);

router
  .route('/user/:id(\\d+)')
  .get(auth, validate.id, controller.get)
  .put(auth, validate.id, validate.update, controller.update)
  .delete(auth, validate.id, controller.destroy);

export default router;
