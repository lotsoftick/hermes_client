import Router from 'express';
import { list } from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.route('/skill').get(auth, list);

export default router;
