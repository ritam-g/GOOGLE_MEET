import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import AppError from '../utils/AppError.js';
import { successResponse } from '../utils/response.js';
import logger from '../utils/logger.js';

export const getRoomController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { code } = req.body? req.body : req.params

    try {
        const room = await prisma.room.findUnique({
            where: { code },
            include: { participants: { where: { leftAt: null } } }
        })

        if (!room) {
            return next(new AppError('Room not found', 404))
        }
        logger.info({ room }, 'Room found')
        successResponse(res, { room })
    } catch (err) {
        logger.error({ err, path: req.path, method: req.method }, 'Error getting room');
        return next(new AppError('Error getting room', 500));
    }
}