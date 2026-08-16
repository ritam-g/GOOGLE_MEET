import { Request, Response, NextFunction } from 'express';
import prisma from '../config/db.js';
import { successResponse } from '../utils/response.js';

export const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.clearCookie('refreshToken');

    successResponse(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};