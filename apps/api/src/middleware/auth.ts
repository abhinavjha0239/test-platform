import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '@exam-platform/shared';
import { ApiError } from './errorHandler.js';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';

export function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        throw new ApiError('Authorization header missing or invalid', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
        req.user = decoded;
        next();
    } catch (error) {
        throw new ApiError('Invalid or expired token', 401);
    }
}

export function requireRole(...roles: Array<'ADMIN' | 'CANDIDATE' | 'REVIEWER'>) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            throw new ApiError('Not authenticated', 401);
        }

        if (!roles.includes(req.user.role)) {
            throw new ApiError('Insufficient permissions', 403);
        }

        next();
    };
}

export function generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
