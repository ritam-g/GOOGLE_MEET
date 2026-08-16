import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRET } from '../config/env';
import logger from '../utils/logger';

/**
 * Verifies an access token — used internally by other services
 * (Room, Signaling) to check if a token is valid without needing
 * the JWT secret themselves.
 * @param {Request} req - Expects Authorization: Bearer <token> header.
 * @param {Response} res - Returns { valid: boolean, userId?: string }.
 */
export const verifyTokenController = (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ valid: false });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as { userId: string };
        return res.status(200).json({ valid: true, userId: decoded.userId });
    } catch (err) {
        logger.warn('Internal token verification failed');
        return res.status(401).json({ valid: false });
    }
};