import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { exams, challenges, examInvitations } from '@exam-platform/database';
import { createExamSchema, updateExamSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

// GET /api/exams - List exams (Admin sees all, Candidate sees published)
router.get('/', authenticate, async (req, res, next) => {
    try {
        let allExams;

        if (req.user!.role === 'ADMIN') {
            allExams = await db.query.exams.findMany({
                with: {
                    challenge: { columns: { name: true } },
                },
                orderBy: (exams, { desc }) => [desc(exams.createdAt)],
            });
        } else {
            allExams = await db.query.exams.findMany({
                where: eq(exams.isPublished, true),
                with: {
                    challenge: { columns: { name: true } },
                },
                orderBy: (exams, { desc }) => [desc(exams.createdAt)],
            });
        }

        res.json({
            success: true,
            data: allExams,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/exams/:id - Get single exam
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const exam = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
            with: {
                challenge: true,
            },
        });

        if (!exam) {
            throw new ApiError('Exam not found', 404);
        }

        // Candidates can only see published exams
        if (req.user!.role === 'CANDIDATE' && !exam.isPublished) {
            throw new ApiError('Exam not found', 404);
        }

        // Don't expose hidden tests to candidates
        if (req.user!.role === 'CANDIDATE' && exam.challenge) {
            exam.challenge.hiddenTests = '[HIDDEN]';
        }

        res.json({
            success: true,
            data: exam,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/exams - Create exam
router.post('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const data = createExamSchema.parse(req.body);

        // Verify challenge exists
        const challenge = await db.query.challenges.findFirst({
            where: eq(challenges.id, data.challengeId),
        });

        if (!challenge) {
            throw new ApiError('Challenge not found', 404);
        }

        const [exam] = await db.insert(exams).values({
            ...data,
            createdBy: req.user!.userId,
        }).returning();

        res.status(201).json({
            success: true,
            data: exam,
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/exams/:id - Update exam
router.put('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const data = updateExamSchema.parse(req.body);

        const existing = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
        });

        if (!existing) {
            throw new ApiError('Exam not found', 404);
        }

        const [updated] = await db.update(exams)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(exams.id, req.params.id))
            .returning();

        res.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/exams/:id/publish - Publish exam
router.post('/:id/publish', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const existing = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
        });

        if (!existing) {
            throw new ApiError('Exam not found', 404);
        }

        const [updated] = await db.update(exams)
            .set({
                isPublished: true,
                publishedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(exams.id, req.params.id))
            .returning();

        res.json({
            success: true,
            data: updated,
            message: 'Exam published successfully',
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/exams/:id/unpublish - Unpublish exam
router.post('/:id/unpublish', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const [updated] = await db.update(exams)
            .set({
                isPublished: false,
                updatedAt: new Date(),
            })
            .where(eq(exams.id, req.params.id))
            .returning();

        if (!updated) {
            throw new ApiError('Exam not found', 404);
        }

        res.json({
            success: true,
            data: updated,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/exams/:id/invite - Create invitation
router.post('/:id/invite', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const { email, expiresIn } = req.body; // expiresIn in hours

        const exam = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
        });

        if (!exam) {
            throw new ApiError('Exam not found', 404);
        }

        const token = createId();
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
            : null;

        const [invitation] = await db.insert(examInvitations).values({
            examId: exam.id,
            email,
            token,
            expiresAt,
        }).returning();

        const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/exam/invite/${token}`;

        res.status(201).json({
            success: true,
            data: {
                invitation,
                inviteUrl,
            },
        });
    } catch (error) {
        next(error);
    }
});

// DELETE /api/exams/:id - Delete exam
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const existing = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
        });

        if (!existing) {
            throw new ApiError('Exam not found', 404);
        }

        await db.delete(exams).where(eq(exams.id, req.params.id));

        res.json({
            success: true,
            message: 'Exam deleted',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
