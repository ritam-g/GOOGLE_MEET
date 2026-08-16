import { Router } from 'express';
import authRoutes from '../authRoutes.js';
import internalRoutes from '../internalRoutes.js';
import { logoutController } from '../../controllers/logoutController.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/internal', internalRoutes);
router.post('/logout', logoutController);

export default router;