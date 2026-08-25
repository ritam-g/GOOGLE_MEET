import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { generateRoomCode } from '../utils/roomCode.js';
import { successResponse } from '../utils/response.js';
import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';



/**  
 * @description Creates a new room
 * @returns {Object}
 * @throws {AppError}
 */
export const createRoomController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        //it will create a room 
        const { title } = req.body
        const roomCode = generateRoomCode()
        const userId = req.userId;

        if (!userId) {
            return next(new AppError('Unauthorized', 401));
        }
        const room = await prisma.room.create({
            data: { code: roomCode, title, hostUserId: userId }
        })
        logger.info({ room }, 'Room created')

        successResponse(res, { room })
    } catch (err: any) {
        logger.error({ err, path: req.path, method: req.method }, 'Error creating room');
        return next(new AppError('Error creating room', 500));

    }
}