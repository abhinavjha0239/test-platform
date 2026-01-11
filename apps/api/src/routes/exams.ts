import { Router } from 'express';
import { eq, and, like, count, desc, asc } from 'drizzle-orm';
import { exams, challenges, examInvitations, examAttempts } from '@exam-platform/database';
import { createExamSchema, updateExamSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { escapeLikePattern } from '../lib/utils.js';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

// Environment configuration for invitation security
const REQUIRE_EMAIL_FOR_INVITATIONS = process.env.REQUIRE_EMAIL_FOR_INVITATIONS !== 'false';

// GET /api/exams - List exams with pagination (Admin sees all, Candidate sees published)
router.get('/', authenticate, async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string) || '';
        const sortBy = (req.query.sortBy as string) || 'createdAt';
        const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';

        const isAdmin = req.user!.role === 'ADMIN';

        // Build where conditions
        const conditions = [];
        if (!isAdmin) {
            conditions.push(eq(exams.isPublished, true));
        }
        if (search) {
            const sanitizedSearch = escapeLikePattern(search);
            conditions.push(like(exams.title, `%${sanitizedSearch}%`));
        }

        const whereClause = conditions.length > 0
            ? conditions.length === 1 ? conditions[0] : and(...conditions)
            : undefined;

        // Fetch items and count in parallel
        const [items, countResult] = await Promise.all([
            db.query.exams.findMany({
                where: whereClause,
                with: {
                    challenge: { columns: { id: true, name: true } },
                },
                orderBy: sortBy === 'title'
                    ? (order === 'asc' ? asc(exams.title) : desc(exams.title))
                    : (order === 'asc' ? asc(exams.createdAt) : desc(exams.createdAt)),
                limit,
                offset,
            }),
            db.select({ count: count() }).from(exams).where(whereClause),
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

// GET /api/exams/:id - Get single exam
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        // Handle invitation token lookup
        if (req.params.id.startsWith('invite-')) {
            return next();
        }

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

// GET /api/exams/invite/:token - Get invitation details (public)
router.get('/invite/:token', async (req, res, next) => {
    try {
        const invitation = await db.query.examInvitations.findFirst({
            where: eq(examInvitations.token, req.params.token),
            with: {
                exam: {
                    columns: {
                        id: true,
                        title: true,
                        description: true,
                        timeLimit: true,
                        scheduledStartAt: true,
                        scheduledEndAt: true,
                        timezone: true,
                    },
                },
            },
        });

        if (!invitation) {
            throw new ApiError('Invalid or expired invitation', 404);
        }

        // Check invitation expiry
        if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
            throw new ApiError('Invitation has expired', 410);
        }

        res.json({
            success: true,
            data: {
                token: invitation.token,
                email: invitation.email,
                exam: invitation.exam,
                expiresAt: invitation.expiresAt,
                usedAt: invitation.usedAt,
            },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/exams/invite/:token/accept - Accept invitation and start exam
 * 
 * Security:
 * - If invitation has an email, it MUST match the authenticated user's email
 * - If REQUIRE_EMAIL_FOR_INVITATIONS=true (default), invitations without email are rejected
 * - Expired invitations are rejected
 * - Already-used invitations are rejected (but existing attempts can resume)
 */
router.post('/invite/:token/accept', authenticate, async (req, res, next) => {
    try {
        const invitation = await db.query.examInvitations.findFirst({
            where: eq(examInvitations.token, req.params.token),
            with: {
                exam: {
                    with: { challenge: true },
                },
            },
        });

        if (!invitation) {
            throw new ApiError('Invalid invitation', 404);
        }

        // SECURITY: Validate email binding
        if (invitation.email) {
            // Invitation has a specific email - must match authenticated user
            if (invitation.email.toLowerCase() !== req.user!.email.toLowerCase()) {
                throw new ApiError('This invitation was sent to a different email address', 403);
            }
        } else if (REQUIRE_EMAIL_FOR_INVITATIONS) {
            // No email on invitation, but we require email binding
            throw new ApiError('Invalid invitation: email binding required', 400);
        }

        // Check expiration
        if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
            throw new ApiError('Invitation has expired', 410);
        }

        if (invitation.usedAt) {
            throw new ApiError('Invitation has already been used', 400);
        }

        // Check if user already has an attempt for this exam
        const existingAttempt = await db.query.examAttempts.findFirst({
            where: and(
                eq(examAttempts.examId, invitation.examId),
                eq(examAttempts.candidateId, req.user!.userId)
            ),
        });

        if (existingAttempt) {
            // Return existing attempt - don't mark invitation as used again
            return res.json({
                success: true,
                data: { attemptId: existingAttempt.id },
                message: 'Resuming existing attempt',
            });
        }

        // Mark invitation as used
        await db.update(examInvitations)
            .set({ usedAt: new Date() })
            .where(eq(examInvitations.id, invitation.id));

        // Create new attempt
        const [attempt] = await db.insert(examAttempts).values({
            examId: invitation.examId,
            candidateId: req.user!.userId,
            files: invitation.exam!.challenge!.starterFiles,
        }).returning();

        res.status(201).json({
            success: true,
            data: { attemptId: attempt.id },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/exams - Create exam
router.post('/', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        console.log('[Exam Create] Raw request body:', JSON.stringify(req.body, null, 2));
        const data = createExamSchema.parse(req.body);
        console.log('[Exam Create] Parsed data:', JSON.stringify(data, null, 2));

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

/**
 * POST /api/exams/:id/invite - Create invitation
 * 
 * Security:
 * - Email is required by default (REQUIRE_EMAIL_FOR_INVITATIONS=true)
 * - To allow invitations without email, set REQUIRE_EMAIL_FOR_INVITATIONS=false
 */
router.post('/:id/invite', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        const { email, expiresIn } = req.body; // expiresIn in hours

        // Validate email requirement
        if (REQUIRE_EMAIL_FOR_INVITATIONS && !email) {
            throw new ApiError('Email is required for invitations', 400);
        }

        // Validate email format if provided
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new ApiError('Invalid email format', 400);
        }

        const exam = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.id),
        });

        if (!exam) {
            throw new ApiError('Exam not found', 404);
        }

        const token = createId();
        const expiresAt = expiresIn
            ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days

        const [invitation] = await db.insert(examInvitations).values({
            examId: exam.id,
            email: email || null,
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

        // Check for existing attempts (deletion protection)
        const attemptCount = await db.select({ count: count() })
            .from(examAttempts)
            .where(eq(examAttempts.examId, req.params.id));

        if (attemptCount[0].count > 0) {
            throw new ApiError(
                `Cannot delete exam: ${attemptCount[0].count} attempt(s) exist. Archive the exam instead.`,
                400
            );
        }

        // Delete associated invitations first
        await db.delete(examInvitations).where(eq(examInvitations.examId, req.params.id));

        // Delete the exam
        await db.delete(exams).where(eq(exams.id, req.params.id));

        res.json({
            success: true,
            message: 'Exam deleted',
        });
    } catch (error) {
        next(error);
    }
});

// ============ Container Pool Management Endpoints ============
// NOTE: Pool management has been moved to the grader microservice (apps/grader).
// These endpoints are kept for API compatibility but now return guidance messages.

/**
 * POST /api/exams/:id/warm-pool
 * Pool warming is now handled by grader service via Redis pub/sub
 */
router.post('/:id/warm-pool', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Pool warming is now handled automatically by the grader service. Warmup is triggered 15 minutes before scheduled exam start.',
            data: { service: 'grader', channel: 'pool:warmup' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/exams/:id/warmup-status
 * Pool status should be queried from grader service
 */
router.get('/:id/warmup-status', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Pool status is now managed by the grader service.',
            data: { service: 'grader' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/pool/status
 * Pool status should be queried from grader service
 */
router.get('/pool/status', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Pool status is now managed by the grader service.',
            data: { service: 'grader' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/pool/resize
 * Pool resizing should be done via grader service
 */
router.post('/pool/resize', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Pool resizing is now managed by the grader service.',
            data: { service: 'grader' },
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/pool/drain
 * Pool draining should be done via grader service
 */
router.delete('/pool/drain', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        res.json({
            success: true,
            message: 'Pool draining is now managed by the grader service.',
            data: { service: 'grader' },
        });
    } catch (error) {
        next(error);
    }
});

export default router;

