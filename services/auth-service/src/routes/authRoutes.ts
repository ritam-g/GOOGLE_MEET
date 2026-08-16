import { Router } from 'express';
import { signupController } from '../controllers/signupController.js';
import { loginController } from '../controllers/loginController.js';
import { authGuard } from '../middleware/authGuard.js';
import { meController } from '../controllers/meController.js';
import { refreshController } from '../controllers/refreshController.js';
import { validateMiddleware } from '../middleware/validate.js';
import { signupSchema, loginSchema } from '../validation/authSchemas.js';

const router = Router();

router.post('/signup', validateMiddleware(signupSchema), signupController);
router.post('/login', validateMiddleware(loginSchema), loginController);
router.post('/refresh', refreshController);
router.get('/me', authGuard, meController);

export default router;