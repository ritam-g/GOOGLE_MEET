import { Request, Response } from 'express';
import { successResponse } from '../utils/response.js';

export const meController = (req: Request, res: Response) => {
    successResponse(res, { userId: req.userId });
};