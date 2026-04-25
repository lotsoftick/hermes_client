import Router from 'express';
import * as controller from './controller';
import validate from './validation';
import auth from '../../middlewares/auth';

const router = Router();

router
  .route('/conversation')
  .get(auth, controller.listAll)
  .post(auth, validate.create, controller.create);

router
  .route('/conversation/agent/:agentId(\\d+)')
  .get(auth, validate.agentId, controller.listByAgent);

router
  .route('/conversation/:id(\\d+)')
  .patch(auth, validate.update, controller.update)
  .delete(auth, validate.id, controller.destroy);

export default router;
