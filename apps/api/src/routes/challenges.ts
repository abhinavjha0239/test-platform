import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { challenges } from '@exam-platform/database';
import { createChallengeSchema, updateChallengeSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/challenges - List all challenges (Admin only)
router.get('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const allChallenges = await db.query.challenges.findMany({
            orderBy: (challenges, { desc }) => [desc(challenges.createdAt)],
        });

        res.json({
            success: true,
            data: allChallenges,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/challenges/:id - Get single challenge
router.get('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const challenge = await db.query.challenges.findFirst({
            where: eq(challenges.id, req.params.id),
        });

        if (!challenge) {
            throw new ApiError('Challenge not found', 404);
        }

        res.json({
            success: true,
            data: challenge,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/challenges - Create challenge
router.post('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const data = createChallengeSchema.parse(req.body);

        const [challenge] = await db.insert(challenges).values({
            ...data,
            createdBy: req.user!.userId,
        }).returning();

        res.status(201).json({
            success: true,
            data: challenge,
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/challenges/:id - Update challenge
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const data = updateChallengeSchema.parse(req.body);

        const existing = await db.query.challenges.findFirst({
            where: eq(challenges.id, req.params.id),
        });

        if (!existing) {
            throw new ApiError('Challenge not found', 404);
        }

        const [updated] = await db.update(challenges)
            .set(data)
            .where(eq(challenges.id, req.params.id))
            .returning();

        res.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/challenges/:id - Delete challenge
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const existing = await db.query.challenges.findFirst({
            where: eq(challenges.id, req.params.id),
        });

        if (!existing) {
            throw new ApiError('Challenge not found', 404);
        }

        await db.delete(challenges).where(eq(challenges.id, req.params.id));

        res.json({
            success: true,
            message: 'Challenge deleted',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
