import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../config/db.js'
import AppError from '../utils/AppError.js';
import { publishEvent } from '../config/redis.js';
import logger from '../utils/logger.js';


/**  
 * Handles user signup by creating a new user in the database and publishing an event to Redis.
 * @param {Request} req - The Express request object containing user signup data.
 * @param {Response} res - The Express response object used to send the response.
 * @param {NextFunction} next - The Express next function to pass control to the next middleware.
 * @throws {AppError} Throws an AppError if user creation or event publishing fails.
 * @description This controller hashes the user's password, creates a new user in the database, and publishes a 'user-created' event to Redis. It logs the success or failure of each operation and sends an appropriate response to the client.
 */
export const signupController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {

        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { email, passwordHash: hashedPassword }
        })

        logger.info(`User created with ID: ${user.id} and email: ${user.email}`);

        await publishEvent('user-created', { userId: user.id })
        res.status(201).json({
            success: true,
            data: { userId: user.id, email: user.email },
        });
    } catch (err: any) {
        logger.error('Error in signupController:', err);
        next(new AppError('Failed to create user', 500));
    }
}