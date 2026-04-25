import Router from 'express';
import * as controller from './controller';
import validate from './validation';
import auth from '../../middlewares/auth';

const router = Router();

router.get('/auth/token', auth, controller.getCurrentUser);

router.post('/auth/login', validate.login, controller.login);

router.delete('/auth/logout', auth, controller.logout);

export default router;
