import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { successResponse } from '../utils/response.js';

export const updateProfileController = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.userId;
        const { displayName, avatarUrl, preferences } = req.body;

        const profile = await prisma.profile.update({
            where: { userId },
            data: { displayName, avatarUrl, preferences },
        });

        successResponse(res, { profile });
    } catch (err) {
        next(err);
    }
};