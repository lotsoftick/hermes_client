import Router from 'express';
import * as controller from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.route('/update/status').get(controller.status);

router.route('/update/check').post(auth, controller.check);

router.route('/update/apply').post(auth, controller.apply);

export default router;
