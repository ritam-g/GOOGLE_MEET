import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import AppError from '../utils/AppError';
import logger from '../utils/logger';
import { comparePassword } from '../utils/passwordUtils';
import { generateAccessToken, generateRefreshToken } from '../utils/tokenUtils';

/**
 * Handles user login by verifying credentials and issuing access + refresh tokens.
 * @param {Request} req - Express request object containing email and password.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next function for error handling.
 * @throws {AppError} Throws 401 if credentials are invalid.
 * @description Verifies the user's email and password, then issues a short-lived
 * access token and a long-lived refresh token (stored in the database).
 */

export const loginController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { email, password } = req.body;
        // Check if the user exists in the database
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            logger.warn(`Login attempt failed for non-existent email: ${email}`);
            return next(new AppError('Invalid email or password', 401));
        }
        // Compare the provided password with the stored hashed password
        const isPasswordValid = await comparePassword(password, user.passwordHash);

        if (!isPasswordValid) {
            logger.warn(`Login attempt failed for email: ${email} due to invalid password`);
            return next(new AppError('Invalid email or password', 401));
        }

        const accessToken = generateAccessToken(user.id)
        const refreshToken = generateRefreshToken(user.id)

        const expireAt = new Date()
        expireAt.setDate(expireAt.getDate() + 7)
        // Store the refresh token in the database with an expiration date
        await prisma.refreshToken.create({
            data: { expireAt, token: refreshToken, userId: user.id }
        })

        logger.info(`User logged in successfully with email: ${email}`);
        // Set the refresh token in an HTTP-only cookie
        res.cookie('refreshToken',refreshToken,{
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            expires: expireAt
        })

        res.status(200).json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: { id: user.id, email: user.email }
            }
        });

    } catch (err: any) {
        logger.error('Error occurred while logging in user:', err);
        return next(new AppError('Internal server error', 500));
    }
}