import { Request, Response, NextFunction } from "express"
import { ObjectSchema } from "joi"
import AppError from "../utils/AppError"

/**  
 * * @param {ObjectSchema} schema
 * * @returns {Function}
 * * @description Validate middleware
 */
export const validateMiddleware = (schema: ObjectSchema) => {

    return (req: Request, res: Response, next: NextFunction) => {
        const { error } = schema.validate(req.body)

        if (error) {
            return next(new AppError(error.details[0].message, 400))
        }
        next()
    }


}