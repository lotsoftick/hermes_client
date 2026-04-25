import Router from 'express';
import { list, toggle } from './controller';
import auth from '../../middlewares/auth';

const router = Router();

router.route('/plugin').get(auth, list);

router.route('/plugin/:id').post(auth, toggle);

export default router;
