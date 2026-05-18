import Router from 'express';
import os from 'os';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import * as controller from './controller';
import validate from './validation';
import auth from '../../middlewares/auth';

const router = Router();

const tmpUploadsDir = path.join(os.tmpdir(), 'hermes_client_uploads');
if (!fs.existsSync(tmpUploadsDir)) fs.mkdirSync(tmpUploadsDir, { recursive: true });

const upload = multer({
  dest: tmpUploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
});

router
  .route('/message/conversation/:conversationId(\\d+)')
  .get(auth, validate.conversationId, controller.listByConversation);

router
  .route('/message/conversation/:conversationId(\\d+)/poll')
  .get(auth, validate.conversationId, controller.poll);

router.route('/message').post(auth, validate.create, controller.create);
router.route('/message/chat').post(auth, upload.array('files', 5), validate.chat, controller.chat);
router.route('/message/:id(\\d+)').delete(auth, validate.id, controller.destroy);

router.route('/conversation/:conversationId(\\d+)/uploads/:filename').get(auth, controller.serveUpload);

export default router;
