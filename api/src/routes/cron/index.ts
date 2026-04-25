import Router from 'express';
import {
  add,
  getGateway,
  getRuns,
  list,
  remove,
  startGateway,
  stopGateway,
  toggle,
} from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.route('/cron')
  .get(auth, list)
  .post(auth, add);

// Gateway control routes are mounted *before* /cron/:id so the literal
// "gateway" path segment isn't shadowed by the `:id` param matcher.
router.get('/cron/gateway', auth, getGateway);
router.post('/cron/gateway/start', auth, startGateway);
router.post('/cron/gateway/stop', auth, stopGateway);

router.get('/cron/:id/runs', auth, getRuns);

router.route('/cron/:id')
  .delete(auth, remove)
  .post(auth, toggle);

export default router;
