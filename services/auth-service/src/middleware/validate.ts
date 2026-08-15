import { Request, Response, NextFunction } from "express"
import { ObjectSchema } from "joi"

/**  
 * * @param {ObjectSchema} schema
 * * @returns {Function}
 * @description Validate middleware
 */
export const validateMiddleware = (schema: ObjectSchema) => {

    return (req: Request, res: Response, next: NextFunction) => {
        const { error } = schema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            })
        }
        next()
    }


}