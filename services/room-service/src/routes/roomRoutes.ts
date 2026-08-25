import { Router } from 'express';
import { authGuard } from '../middleware/authGuard.js';
import { validateMiddleware } from '../middleware/validate.js';
import { createRoomSchema } from '../validation/roomSchemas.js';
import { createRoomController } from '../controllers/createRoomController.js';
import { joinRoomController } from '../controllers/joinRoomController.js';
import { leaveRoomController } from '../controllers/leaveRoomController.js';
import { endRoomController } from '../controllers/endRoomController.js';
import { getRoomController } from '../controllers/getRoomController.js';

const router = Router();

router.use(authGuard);

router.post('/rooms',  validateMiddleware(createRoomSchema), createRoomController);
router.get('/rooms/:code',  getRoomController);
router.post('/rooms/:code/join',  joinRoomController);
router.post('/rooms/:code/leave',  leaveRoomController);
router.post('/rooms/:code/end',  endRoomController);

export default router;