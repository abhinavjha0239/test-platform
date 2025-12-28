import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@exam-platform/shared';

export class ApiError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ApiError';
    }
}

export function errorHandler(
    err: Error,
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
) {
    console.error('Error:', err);

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
        });
    }

    // Zod validation errors
    if (err.name === 'ZodError') {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            message: err.message,
        });
    }

    // Default server error
    return res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
}
