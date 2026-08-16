import { Response } from "express"

export const successResponse = (
    res: Response,
    data: object,
    statusCode: number = 200
) => {
    return res.status(statusCode).json({
        success: true,
        data,
    })
}