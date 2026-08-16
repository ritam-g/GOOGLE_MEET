import { Router } from 'express';
import authRoutes from '../authRoutes.js';
import internalRoutes from '../internalRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/internal', internalRoutes);

export default router;