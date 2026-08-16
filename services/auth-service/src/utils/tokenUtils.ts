import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET } from '../config/env.js';

/**
 * Generates a short-lived access token.
 * @param {string} userId - The user's ID to embed in the token payload.
 * @returns {string} Signed JWT access token, expires in 15 minutes.
 */
export const generateAccessToken = (userId: string): string => {
    return jwt.sign({ userId }, JWT_ACCESS_SECRET, { expiresIn: '15m' });
};

/**
 * Generates a long-lived refresh token.
 * @param {string} userId - The user's ID to embed in the token payload.
 * @returns {string} Signed JWT refresh token, expires in 7 days.
 */
export const generateRefreshToken = (userId: string): string => {
    return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};