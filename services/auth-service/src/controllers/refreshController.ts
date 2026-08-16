import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db';
import AppError from '../utils/AppError';
import logger from '../utils/logger';
import { generateAccessToken } from '../utils/tokenUtils';

/**
 * Handles access token refresh using the refresh token stored in httpOnly cookie.
 * @param {Request} req - Express request object, expects refreshToken in cookies.
 * @param {Response} res - Express response object.
 * @param {NextFunction} next - Express next function for error handling.
 * @throws {AppError} Throws 401 if refresh token is missing, invalid, or expired.
 * @description Verifies the refresh token against the database, checks expiry,
 * and issues a new short-lived access token if valid.
 */


export const refreshController = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            logger.warn('Refresh token missing in request cookies');
            return next(new AppError('Refresh token missing', 401));
        }

        const storedToken = await prisma.refreshToken.findFirst({
            where: { token: refreshToken }
        })

        if (!storedToken) {
            logger.warn('Invalid refresh token provided');
            return next(new AppError('Invalid refresh token', 401));
        }
        const isExpired = storedToken.expireAt < new Date();
        
        if (isExpired) {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } })
            logger.warn('Refresh token has expired');
            return next(new AppError('Refresh token expired', 401));
        }
        const accessToken = generateAccessToken(storedToken.userId);
        logger.info(`Access token refreshed for userId: ${storedToken.userId}`);

        res.status(200).json({
            success: true,
            data: { accessToken }
        });

    } catch (err) {
        logger.error('Error occurred while refreshing access token');
        return next(new AppError('Error occurred while refreshing access token', 500));
    }
}