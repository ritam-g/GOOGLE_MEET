import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import AppError from '../utils/AppError.js';
import { successResponse } from '../utils/response.js';
import logger from '../utils/logger.js';

export const leaveRoomController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { code } = req.body

        const room = await prisma.room.findUnique({
            where: { code }
        })

        if (!room) {
            let err = "Room not found"
            logger.error({ err, path: req.path, method: req.method }, 'Room not found');
            return next(new AppError('Room not found', 404))
        }

        await prisma.roomParticipant.updateMany({
            where: { roomId: room.id, userId: req.userId },
            data: { leftAt: new Date() }
        })

        logger.info({ room }, 'Room left');

        successResponse(res, { room })
    } catch (err: any) {
        logger.error({ err, path: req.path, method: req.method }, 'Error leaving room');
        return next(new AppError('Error leaving room', 500));
    }
}