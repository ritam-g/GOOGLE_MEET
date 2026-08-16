import { Router } from 'express';
import { signupController } from '../controllers/signupController';
import { loginController } from '../controllers/loginController';
import { refreshController } from '../controllers/refreshController';
import { validateMiddleware } from '../middleware/validate';
import { signupSchema, loginSchema } from '../validation/authSchemas';

const router = Router();

router.post('/signup', validateMiddleware(signupSchema), signupController);
router.post('/login', validateMiddleware(loginSchema), loginController);
router.post('/refresh', refreshController);

export default router;