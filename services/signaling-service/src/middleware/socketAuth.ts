import jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { JWT_ACCESS_SECRET } from '../config/env.js';
import AppError from '../utils/AppError.js';

/**  
 *@description Middleware to authenticate socket.io connections
 *@argument socket
 *@argument next
 *@returns {void} 
 */
export function socketAuth(socket: Socket, next: (err?: Error) => void) {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new AppError('No token provided', 401));
    }
    try {
        const paylode = jwt.verify(token, JWT_ACCESS_SECRET) as { userId: string }
        socket.data.userId = paylode.userId;
        socket.data.token = token;
        next();
    } catch (error) {
        next(new AppError('Invalid or expired token', 401));
    }

}