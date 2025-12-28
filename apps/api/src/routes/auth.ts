import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users } from '@exam-platform/database';
import { loginSchema, registerSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { generateToken } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
    try {
        const data = registerSchema.parse(req.body);

        // Check if user exists
        const existing = await db.query.users.findFirst({
            where: eq(users.email, data.email),
        });

        if (existing) {
            throw new ApiError('Email already registered', 400);
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(data.password, 12);

        // Create user
        const [user] = await db.insert(users).values({
            email: data.email,
            password: hashedPassword,
            name: data.name,
            role: data.role || 'CANDIDATE',
        }).returning();

        // Generate token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                },
                token,
            },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
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

        // Generate token
        const token = generateToken({
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                },
                token,
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/auth/me
router.get('/me', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new ApiError('Not authenticated', 401);
        }

        const token = authHeader.split(' ')[1];
        const { verifyToken } = await import('../middleware/auth.js');
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
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
