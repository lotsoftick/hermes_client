import Router from 'express';
import { list, add, remove, toggle } from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.route('/cron')
  .get(auth, list)
  .post(auth, add);

router.route('/cron/:id')
  .delete(auth, remove)
  .post(auth, toggle);

export default router;
