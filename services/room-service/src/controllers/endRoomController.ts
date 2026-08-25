import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import AppError from '../utils/AppError.js';
import { successResponse } from '../utils/response.js';
import logger from '../utils/logger.js';

export const endRoomController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
         const code = req.params.code as string;
        const room = await prisma.room.findUnique({ where: { code } });

        if (!room) {
            logger.debug({ code }, 'Room not found');
            return next(new AppError('Room not found', 404));
        }

        if (room.hostUserId !== req.userId) {
            logger.debug({ code }, 'Only the host can end this room');
            return next(new AppError('Only the host can end this room', 403));
        }

        const updated = await prisma.room.update({
            where: { code },
            data: { isActive: false, endedAt: new Date() }
        });
        logger.info({ room: updated }, 'Room ended');
        
        successResponse(res, { room: updated });
    } catch (err) {
        logger.error({ err, path: req.path, method: req.method }, 'Error ending room');
        return next(new AppError('Error ending room', 500));
    }
};