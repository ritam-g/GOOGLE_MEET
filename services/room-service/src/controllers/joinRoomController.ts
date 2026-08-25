import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import AppError from '../utils/AppError.js';
import { successResponse } from '../utils/response.js';
import logger from '../utils/logger.js';


export const joinRoomController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { code } = req.body

    try {
        const room = await prisma.room.findUnique({
            where: { code }
        })
        if (!room || !room.isActive) {
            return next(new AppError('Room not found or has ended', 404));
        }

        const participant = await prisma.roomParticipant.create({
            data: { roomId: room.id, userId: req.userId }
        });

        logger.info({ room, participant }, 'Room joined');

        successResponse(res, { room, participant });
    } catch (err) {
        logger.error({ err, path: req.path, method: req.method }, 'Error joining room');
        return next(new AppError('Error joining room', 500));
    }
}