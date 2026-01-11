import { Router } from 'express';
import { eq, like, count, desc, asc } from 'drizzle-orm';
import { challenges, exams } from '@exam-platform/database';
import { createChallengeSchema, updateChallengeSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { escapeLikePattern } from '../lib/utils.js';
import { quickValidate, validateChallenge } from '../lib/challenge-validator.js';

const router = Router();

// GET /api/challenges - List all challenges with pagination (Admin only)
router.get('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string) || '';
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';

        const sanitizedSearch = search ? escapeLikePattern(search) : '';
        const whereClause = sanitizedSearch ? like(challenges.name, `%${sanitizedSearch}%`) : undefined;

        const [items, countResult] = await Promise.all([
            db.query.challenges.findMany({
                where: whereClause,
                orderBy: sortBy === 'name'
                    ? (order === 'asc' ? asc(challenges.name) : desc(challenges.name))
                    : (order === 'asc' ? asc(challenges.createdAt) : desc(challenges.createdAt)),
                limit,
                offset,
            }),
            db.select({ count: count() }).from(challenges).where(whereClause),
        ]);

        res.json({
            success: true,
            data: items,
            total: countResult[0].count,
            page,
            limit,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/challenges/all - Get all challenges without pagination (for dropdowns)
router.get('/all', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const allChallenges = await db.query.challenges.findMany({
            columns: { id: true, name: true },
            orderBy: (challenges, { asc }) => [asc(challenges.name)],
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

        // Check for existing exams (deletion protection)
        const examCount = await db.select({ count: count() })
            .from(exams)
            .where(eq(exams.challengeId, req.params.id));

        if (examCount[0].count > 0) {
            throw new ApiError(
                `Cannot delete challenge: ${examCount[0].count} exam(s) are using this challenge.`,
                400
            );
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

// POST /api/challenges/validate - Quick validate challenge (without running tests)
router.post('/validate', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const { name, starterFiles, publicTests, hiddenTests, dependencies, nodeVersion } = req.body;

        const result = quickValidate({
            name,
            starterFiles: starterFiles || {},
            publicTests: publicTests || '',
            hiddenTests: hiddenTests || '',
            dependencies: dependencies || {},
            nodeVersion: nodeVersion || '20',
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/challenges/:id/validate - Full validate existing challenge (runs tests)
router.post('/:id/validate', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const challenge = await db.query.challenges.findFirst({
            where: eq(challenges.id, req.params.id),
        });

        if (!challenge) {
            throw new ApiError('Challenge not found', 404);
        }

        // Accept optional solution files for testing
        const { solutionFiles } = req.body;

        const result = await validateChallenge({
            name: challenge.name,
            starterFiles: challenge.starterFiles as Record<string, string>,
            publicTests: challenge.publicTests,
            hiddenTests: challenge.hiddenTests,
            dependencies: challenge.dependencies as Record<string, string>,
            nodeVersion: challenge.nodeVersion,
            solutionFiles: solutionFiles || undefined,
        });

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
