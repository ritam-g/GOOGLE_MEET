import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_ACCESS_SECRET } from '../config/env.js';
import AppError from '../utils/AppError.js';

export function gatewayAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next(new AppError('No token provided', 401));
    }

    const token = authHeader.split(' ')[1]

    try {
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET) as { userId: string };
        req.userId = decoded.userId;
        req.headers['x-user-id'] = decoded.userId; // forwarded downstream via the proxy
        next()
    } catch (err) {
        return next(new AppError('Invalid token', 401));
    }

}