import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq, and, count } from 'drizzle-orm';
import { users } from '@exam-platform/database';
import { loginSchema, registerSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { generateToken, verifyToken, authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { loginLimiter, registrationLimiter } from '../middleware/rateLimiter.js';
import {
    generateAccessToken,
    generateRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    revokeAllUserTokens,
} from '../lib/token-manager.js';
import { evictUserSockets } from '../socket/index.js';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user account
 * 
 * Security Notes:
 * - ADMIN and REVIEWER accounts require approval by existing admin
 * - First admin auto-approval requires explicit ALLOW_FIRST_ADMIN_BOOTSTRAP=true
 * - Passwords are hashed with bcrypt (12 rounds)
 */
router.post('/register', registrationLimiter, async (req, res, next) => {
    try {
        const data = registerSchema.parse(req.body);

        // Check if user exists
        const existing = await db.query.users.findFirst({
            where: eq(users.email, data.email),
        });

        if (existing) {
            throw new ApiError('Email already registered', 400);
        }

        // Hash password with strong work factor
        const hashedPassword = await bcrypt.hash(data.password, 12);

        // Determine approval status based on role
        // Candidates are auto-approved, Admins/Reviewers need approval
        const role = data.role || 'CANDIDATE';
        let approvalStatus: 'APPROVED' | 'PENDING' = role === 'CANDIDATE' ? 'APPROVED' : 'PENDING';

        // Check if there are any approved admins - for first admin bootstrap
        if (role === 'ADMIN') {
            const approvedAdmins = await db.select({ count: count() })
                .from(users)
                .where(and(
                    eq(users.role, 'ADMIN'),
                    eq(users.approvalStatus, 'APPROVED')
                ));
            
            // SECURITY: Only auto-approve first admin if explicitly enabled
            // This prevents privilege escalation if registration is publicly accessible
            const allowFirstAdminBootstrap = process.env.ALLOW_FIRST_ADMIN_BOOTSTRAP === 'true';
            
            if (approvedAdmins[0].count === 0 && allowFirstAdminBootstrap) {
                approvalStatus = 'APPROVED';
                console.log('✅ First admin account auto-approved (bootstrap mode enabled)');
            }
        }

        // Create user
        const [user] = await db.insert(users).values({
            email: data.email,
            password: hashedPassword,
            name: data.name,
            role,
            approvalStatus,
            approvedAt: role === 'CANDIDATE' ? new Date() : null,
        }).returning();

        // Generate tokens (access + refresh)
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = await generateRefreshToken(tokenPayload);

        // Also generate legacy token for backwards compatibility
        const token = generateToken(tokenPayload);

        // Build response message
        const message = approvalStatus === 'PENDING'
            ? 'Account created. Your account is pending approval by an administrator.'
            : 'Account created successfully.';

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    approvalStatus: user.approvalStatus,
                },
                // Legacy token (for backwards compatibility)
                token,
                // New tokens
                accessToken,
                refreshToken,
            },
            message,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', loginLimiter, async (req, res, next) => {
    try {
        const data = loginSchema.parse(req.body);

        // Find user
        const user = await db.query.users.findFirst({
            where: eq(users.email, data.email),
        });

        if (!user) {
            throw new ApiError('Invalid credentials', 401);
        }

        // Verify password
        const validPassword = await bcrypt.compare(data.password, user.password);

        if (!validPassword) {
            throw new ApiError('Invalid credentials', 401);
        }

        // Check approval status for admin/reviewer
        if (user.role !== 'CANDIDATE' && user.approvalStatus !== 'APPROVED') {
            if (user.approvalStatus === 'PENDING') {
                throw new ApiError(
                    'Your account is pending approval. Please wait for an administrator to approve your account.',
                    403
                );
            }
            if (user.approvalStatus === 'REJECTED') {
                throw new ApiError(
                    'Your account registration was rejected. Please contact support.',
                    403
                );
            }
        }

        // Generate tokens
        const tokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = await generateRefreshToken(tokenPayload);

        // Also generate legacy token for backwards compatibility
        const token = generateToken(tokenPayload);

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    approvalStatus: user.approvalStatus,
                },
                // Legacy token (for backwards compatibility)
                token,
                // New tokens
                accessToken,
                refreshToken,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 * Implements token rotation (new refresh token issued each time)
 */
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            throw new ApiError('Refresh token required', 400);
        }

        // Rotate tokens
        const tokens = await rotateRefreshToken(refreshToken);

        if (!tokens) {
            throw new ApiError('Invalid or expired refresh token', 401);
        }

        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/logout
 * Revoke refresh token (client should also delete tokens)
 */
router.post('/logout', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await revokeRefreshToken(refreshToken);
        }

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/auth/logout-all
 * Revoke all tokens for the current user (e.g., on password change)
 * Also evicts all connected WebSocket sessions
 */
router.post('/logout-all', authenticate, async (req, res, next) => {
    try {
        const userId = req.user!.userId;
        
        // Revoke all refresh tokens
        await revokeAllUserTokens(userId);
        
        // Evict all connected sockets for this user
        await evictUserSockets(userId);

        res.json({
            success: true,
            message: 'All sessions logged out',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new ApiError('Not authenticated', 401);
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyToken(token);

        const user = await db.query.users.findFirst({
            where: eq(users.id, payload.userId),
        });

        if (!user) {
            throw new ApiError('User not found', 404);
        }

        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                approvalStatus: user.approvalStatus,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
