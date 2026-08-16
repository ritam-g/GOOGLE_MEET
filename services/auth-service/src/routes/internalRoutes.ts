import { Router } from 'express';
import { verifyTokenController } from '../controllers/verifyTokenController.js';

const router = Router();

router.get('/verify-token', verifyTokenController);

export default router;