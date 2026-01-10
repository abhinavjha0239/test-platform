import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { examAttempts, exams, challenges } from '@exam-platform/database';
import { startAttemptSchema, submitAttemptSchema, saveFilesSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { addGradingJob } from '../lib/grading.js';
import { saveToBuffer, getFromBuffer, flushToDatabase, clearBuffer } from '../lib/autosave-buffer.js';
import { stopTimerPermanently } from '../socket/timerService.js';

const router = Router();

// Validate file paths to prevent path traversal attacks
function validateFilePaths(files: Record<string, string>): void {
    for (const filePath of Object.keys(files)) {
        // Block path traversal and absolute paths
        if (filePath.includes('..') || filePath.startsWith('/') || filePath.includes('\\')) {
            throw new ApiError(`Invalid file path: ${filePath}`, 400);
        }
        // Block hidden files and directories
        if (filePath.split('/').some(part => part.startsWith('.'))) {
            throw new ApiError(`Hidden files not allowed: ${filePath}`, 400);
        }
    }
}

// GET /api/attempts - List user's attempts
router.get('/', authenticate, async (req, res, next) => {
    try {
        const userAttempts = await db.query.examAttempts.findMany({
            where: eq(examAttempts.candidateId, req.user!.userId),
            with: {
                exam: {
                    columns: { title: true, timeLimit: true },
                },
            },
            orderBy: (attempts, { desc }) => [desc(attempts.startedAt)],
        });

        res.json({
            success: true,
            data: userAttempts,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/attempts/:id - Get single attempt
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, req.params.id),
            with: {
                exam: {
                    with: {
                        challenge: true,
                    },
                },
            },
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        // Candidates can only see their own attempts
        if (req.user!.role === 'CANDIDATE' && attempt.candidateId !== req.user!.userId) {
            throw new ApiError('Not authorized', 403);
        }

        // Hide hidden tests from candidates
        if (req.user!.role === 'CANDIDATE' && attempt.exam?.challenge) {
            attempt.exam.challenge.hiddenTests = '[HIDDEN]';
        }

        res.json({
            success: true,
            data: attempt,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/attempts - Start new attempt
router.post('/', authenticate, async (req, res, next) => {
    try {
        const data = startAttemptSchema.parse(req.body);

        // Get exam with challenge
        const exam = await db.query.exams.findFirst({
            where: eq(exams.id, data.examId),
            with: {
                challenge: true,
            },
        });

        if (!exam || !exam.isPublished) {
            throw new ApiError('Exam not found or not published', 404);
        }

        // Check scheduled exam window
        const now = new Date();
        
        if (exam.scheduledStartAt) {
            const startTime = new Date(exam.scheduledStartAt);
            if (now < startTime) {
                const msUntilStart = startTime.getTime() - now.getTime();
                throw new ApiError(
                    `Exam has not started yet. It begins at ${startTime.toISOString()}`,
                    403,
                    { code: 'EXAM_NOT_STARTED', msUntilStart, scheduledStartAt: startTime.toISOString() }
                );
            }
        }

        if (exam.scheduledEndAt) {
            const endTime = new Date(exam.scheduledEndAt);
            if (now >= endTime) {
                throw new ApiError(
                    'Exam has ended. No new attempts can be started.',
                    403,
                    { code: 'EXAM_ENDED', scheduledEndAt: endTime.toISOString() }
                );
            }
        }

        // Check max attempts
        const existingAttempts = await db.query.examAttempts.findMany({
            where: and(
                eq(examAttempts.examId, data.examId),
                eq(examAttempts.candidateId, req.user!.userId)
            ),
        });

        if (existingAttempts.length >= exam.maxAttempts) {
            throw new ApiError('Maximum attempts reached', 400);
        }

        // Check for in-progress attempt
        const inProgress = existingAttempts.find(a => a.status === 'IN_PROGRESS');
        if (inProgress) {
            // Return existing in-progress attempt
            return res.json({
                success: true,
                data: inProgress,
                message: 'Resuming existing attempt',
            });
        }

        // Create new attempt with starter files
        const [attempt] = await db.insert(examAttempts).values({
            examId: data.examId,
            candidateId: req.user!.userId,
            files: exam.challenge.starterFiles,
        }).returning();

        res.status(201).json({
            success: true,
            data: attempt,
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/attempts/:id/files - Save files (Redis-buffered auto-save)
router.put('/:id/files', authenticate, async (req, res, next) => {
    try {
        const data = saveFilesSchema.parse(req.body);

        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, req.params.id),
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        if (attempt.candidateId !== req.user!.userId) {
            throw new ApiError('Not authorized', 403);
        }

        if (attempt.status !== 'IN_PROGRESS') {
            throw new ApiError('Attempt already submitted', 400);
        }

        // Validate file paths to prevent path traversal attacks
        validateFilePaths(data.files);

        // Save to Redis buffer (fast, non-blocking)
        // Database will be updated periodically by background job
        await saveToBuffer(req.params.id, data.files);

        res.json({
            success: true,
            data: { savedAt: Date.now() },
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/attempts/:id/run-tests - Run public tests only
router.post('/:id/run-tests', authenticate, async (req, res, next) => {
    try {
        const attemptId = req.params.id;
        
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, attemptId),
            with: {
                exam: {
                    with: {
                        challenge: true,
                    },
                },
            },
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        if (attempt.candidateId !== req.user!.userId) {
            throw new ApiError('Not authorized', 403);
        }

        if (attempt.status !== 'IN_PROGRESS') {
            throw new ApiError('Attempt already submitted', 400);
        }

        // Get files from buffer (most recent) or database
        const bufferedFiles = await getFromBuffer(attemptId);
        const files = bufferedFiles || attempt.files || {};

        // Queue grading job for public tests only (isPreview = true, don't change status)
        const jobId = await addGradingJob({
            attemptId: attempt.id,
            files,
            publicTests: attempt.exam!.challenge!.publicTests,
            hiddenTests: '', // Empty - only run public tests
            dependencies: attempt.exam!.challenge!.dependencies as Record<string, string>,
            nodeVersion: attempt.exam!.challenge!.nodeVersion,
            timeLimit: 60, // 1 minute for test run
            memoryLimit: 512,
            runner: attempt.exam!.challenge!.runner as any, // CRITICAL: tells grader which mode (http/playwright/jest)
            isPreview: true, // Don't change status - this is just a preview
        });

        res.json({
            success: true,
            data: { jobId },
            message: 'Running public tests...',
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/attempts/:id/submit - Submit for final grading
router.post('/:id/submit', authenticate, async (req, res, next) => {
    try {
        const data = submitAttemptSchema.parse(req.body);
        const attemptId = req.params.id;

        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, attemptId),
            with: {
                exam: {
                    with: {
                        challenge: true,
                    },
                },
            },
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        if (attempt.candidateId !== req.user!.userId) {
            throw new ApiError('Not authorized', 403);
        }

        if (attempt.status !== 'IN_PROGRESS') {
            throw new ApiError('Attempt already submitted', 400);
        }

        // Stop the timer permanently (prevent any more auto-submit attempts)
        await stopTimerPermanently(attemptId);

        // Flush any buffered autosaves to database first
        await flushToDatabase(attemptId);

        // Get the most up-to-date files (from buffer or request)
        const bufferedFiles = await getFromBuffer(attemptId);
        const finalFiles = data.files || bufferedFiles || attempt.files || {};

        // Update status to SUBMITTED
        await db.update(examAttempts)
            .set({
                status: 'SUBMITTED',
                submittedAt: new Date(),
                files: finalFiles,
            })
            .where(eq(examAttempts.id, attemptId));

        // Queue full grading job
        const jobId = await addGradingJob({
            attemptId: attempt.id,
            files: finalFiles,
            publicTests: attempt.exam!.challenge!.publicTests,
            hiddenTests: attempt.exam!.challenge!.hiddenTests,
            dependencies: attempt.exam!.challenge!.dependencies as Record<string, string>,
            nodeVersion: attempt.exam!.challenge!.nodeVersion,
            timeLimit: 120, // 2 minutes for full grading
            memoryLimit: 512,
            runner: attempt.exam!.challenge!.runner as any, // CRITICAL: tells grader which mode (http/playwright/jest)
        });

        // Update status to GRADING
        await db.update(examAttempts)
            .set({ status: 'GRADING' })
            .where(eq(examAttempts.id, attemptId));

        // Clear buffer after successful submission
        await clearBuffer(attemptId);

        res.json({
            success: true,
            data: { jobId },
            message: 'Submission received, grading in progress...',
        });
    } catch (error) {
        next(error);
    }
});

export default router;
