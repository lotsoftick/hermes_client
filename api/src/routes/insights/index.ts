import Router from 'express';
import { get, getAgentsSpend } from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/insights', auth, get);
// Cheap per-agent spend rollup powering the sidebar progress rings.
// Kept separate so it can be polled aggressively without re-running
// the full /insights aggregation.
router.get('/insights/agents-spend', auth, getAgentsSpend);

export default router;
