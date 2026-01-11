import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@exam-platform/shared';

export class ApiError extends Error {
    statusCode: number;
    metadata?: Record<string, unknown>;

    constructor(message: string, statusCode: number = 500, metadata?: Record<string, unknown>) {
        super(message);
        this.statusCode = statusCode;
        this.metadata = metadata;
        this.name = 'ApiError';
    }
}

export function errorHandler(
    err: Error,
    req: Request,
    res: Response<ApiResponse>,
    next: NextFunction
) {
    // Safe error logging
    console.error('Error:', err?.message || 'Unknown error', err?.name || '');

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            ...err.metadata, // Include scheduling info for frontend
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
