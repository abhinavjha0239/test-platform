import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { JwtPayload } from '@exam-platform/shared';
import { ApiError } from './errorHandler.js';
import { db } from '../lib/db.js';
import { users } from '@exam-platform/database';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload & { approvalStatus?: string };
        }
    }
}

// JWT Secret handling with production enforcement
const JWT_SECRET = process.env.JWT_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!JWT_SECRET) {
    if (NODE_ENV === 'production') {
        console.error('❌ FATAL: JWT_SECRET environment variable must be set in production');
        process.exit(1);
    }
    console.warn('⚠️ WARNING: Using default JWT secret - NOT SECURE FOR PRODUCTION');
}

const SECRET = JWT_SECRET || 'dev-only-secret-change-in-production';

/**
 * Authenticate request using JWT token
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        throw new ApiError('Authorization header missing or invalid', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, SECRET) as JwtPayload;
        req.user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ApiError('Token has expired. Please log in again.', 401);
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new ApiError('Invalid token. Please log in again.', 401);
        }
        throw new ApiError('Authentication failed', 401);
    }
}

/**
 * Require specific role(s) to access route
 * Also checks approval status for ADMIN and REVIEWER roles
 */
export function requireRole(...roles: Array<'ADMIN' | 'CANDIDATE' | 'REVIEWER'>) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new ApiError('Not authenticated', 401);
            }

            if (!roles.includes(req.user.role)) {
                throw new ApiError('Insufficient permissions', 403);
            }

            // Check approval status for admin/reviewer accounts
            if (req.user.role === 'ADMIN' || req.user.role === 'REVIEWER') {
                const user = await db.query.users.findFirst({
                    where: eq(users.id, req.user.userId),
                    columns: { approvalStatus: true },
                });

                if (!user) {
                    throw new ApiError('User not found', 404);
                }

                if (user.approvalStatus !== 'APPROVED') {
                    if (user.approvalStatus === 'PENDING') {
                        throw new ApiError('Your account is pending approval. Please wait for an admin to approve your account.', 403);
                    }
                    if (user.approvalStatus === 'REJECTED') {
                        throw new ApiError('Your account registration was rejected. Please contact support.', 403);
                    }
                }
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Require user to be approved (for any role)
 */
export function requireApproved() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.user) {
                throw new ApiError('Not authenticated', 401);
            }

            const user = await db.query.users.findFirst({
                where: eq(users.id, req.user.userId),
                columns: { approvalStatus: true, role: true },
            });

            if (!user) {
                throw new ApiError('User not found', 404);
            }

            // Only check approval for non-candidate roles
            if (user.role !== 'CANDIDATE' && user.approvalStatus !== 'APPROVED') {
                throw new ApiError('Account not approved', 403);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

/**
 * Generate JWT token for user
 */
export function generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JwtPayload {
    return jwt.verify(token, SECRET) as JwtPayload;
}
