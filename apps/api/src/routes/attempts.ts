import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { examAttempts, exams, challenges, proctorEvents } from '@exam-platform/database';
import { startAttemptSchema, submitAttemptSchema, saveFilesSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { addGradingJob } from '../lib/grading.js';
import { saveToBuffer, getFromBuffer, flushToDatabase, clearBuffer } from '../lib/autosave-buffer.js';
import { stopTimerPermanently } from '../socket/timerService.js';
import { redisConnection, REDIS_CHANNELS } from '../lib/redis.js';
import { getIO } from '../socket/index.js';
import { uploadScreenshot, isS3Configured, getS3Info } from '../lib/s3.js';
import { screenshotLimiter, autosaveLimiter, runTestsLimiter, submissionLimiter } from '../middleware/rateLimiter.js';

// Configure multer for screenshot uploads - use memory storage for S3 upload
const screenshotUpload = multer({
    storage: multer.memoryStorage(), // Store in memory for S3 upload
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    },
});

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

// GET /api/attempts/:id/starter-files - Get starter files for resetting code
router.get('/:id/starter-files', authenticate, async (req, res, next) => {
    try {
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, req.params.id),
            with: {
                exam: {
                    with: {
                        challenge: {
                            columns: { starterFiles: true },
                        },
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

        const starterFiles = attempt.exam?.challenge?.starterFiles || {};

        res.json({
            success: true,
            data: { files: starterFiles },
        });
    } catch (error) {
        next(error);
    }
});

// PUT /api/attempts/:id/files - Save files (Redis-buffered auto-save)
router.put('/:id/files', authenticate, autosaveLimiter, async (req, res, next) => {
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
router.post('/:id/run-tests', authenticate, runTestsLimiter, async (req, res, next) => {
    const attemptId = req.params.id;
    const lockKey = `grading:lock:${attemptId}`;

    try {
        // Rate limiting: Prevent concurrent test runs for same attempt
        // Use Redis SET NX (set if not exists) with 90s expiry
        const lockAcquired = await redisConnection.set(lockKey, Date.now().toString(), 'NX', 'EX', 90);
        if (!lockAcquired) {
            throw new ApiError('Tests are already running for this attempt. Please wait...', 429);
        }

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
            await redisConnection.del(lockKey); // Release lock on error
            throw new ApiError('Attempt not found', 404);
        }

        if (attempt.candidateId !== req.user!.userId) {
            await redisConnection.del(lockKey);
            throw new ApiError('Not authorized', 403);
        }

        if (attempt.status !== 'IN_PROGRESS') {
            await redisConnection.del(lockKey);
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
            challengeId: attempt.exam!.challenge!.id,
            isPreview: true, // Don't change status - this is just a preview
        });

        // Note: Lock expires after 90s or is cleaned up when grading completes
        // The grader publishes to grading:complete which triggers lock release

        res.json({
            success: true,
            data: { jobId },
            message: 'Running public tests...',
        });
    } catch (error) {
        // Release lock on any error (except 429 which means lock wasn't acquired)
        if (!(error instanceof ApiError && error.statusCode === 429)) {
            await redisConnection.del(lockKey).catch(() => { }); // Ignore cleanup errors
        }
        next(error);
    }
});

// POST /api/attempts/:id/submit - Submit for final grading
router.post('/:id/submit', authenticate, submissionLimiter, async (req, res, next) => {
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
            challengeId: attempt.exam!.challenge!.id,
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

// POST /api/attempts/:id/screenshot - Upload proctor screenshot (S3 or local)
router.post('/:id/screenshot', authenticate, screenshotLimiter, screenshotUpload.single('screenshot'), async (req, res, next) => {
    try {
        const attemptId = req.params.id;
        const { eventType, timestamp } = req.body;

        if (!req.file) {
            throw new ApiError('No screenshot file provided', 400);
        }

        // Verify attempt belongs to user
        const attempt = await db.query.examAttempts.findFirst({
            where: and(
                eq(examAttempts.id, attemptId),
                eq(examAttempts.candidateId, req.user!.userId)
            ),
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        // Only allow screenshots for in-progress or grading attempts
        if (!['IN_PROGRESS', 'GRADING'].includes(attempt.status)) {
            throw new ApiError('Cannot capture screenshot for completed exam', 400);
        }

        // Generate filename
        const originalName = req.file.originalname.replace(/\.[^.]+$/, '');
        const filename = `${attemptId}_${Date.now()}_${originalName}.jpg`;

        // Upload to S3 or local filesystem
        const { url, location } = await uploadScreenshot(
            req.file.buffer,
            filename,
            {
                attemptId,
                examId: attempt.examId,
                candidateId: attempt.candidateId,
                eventType,
            }
        );

        const capturedAt = new Date().toISOString();

        // Create screenshot metadata
        const screenshotData = {
            attemptId,
            examId: attempt.examId,
            candidateId: attempt.candidateId,
            eventType,
            timestamp: capturedAt,
            url,
            filename,
            storage: location, // 'S3' or 'LOCAL'
        };

        // Store in Redis for real-time access (keep last 50 per attempt, expire in 24h)
        const redisKey = `screenshots:${attemptId}`;
        await redisConnection.lpush(redisKey, JSON.stringify(screenshotData));
        await redisConnection.ltrim(redisKey, 0, 49); // Keep last 50
        await redisConnection.expire(redisKey, 86400); // 24 hour expiry

        // Also store in exam-level list for reviewer monitoring
        const examRedisKey = `screenshots:exam:${attempt.examId}`;
        await redisConnection.lpush(examRedisKey, JSON.stringify(screenshotData));
        await redisConnection.ltrim(examRedisKey, 0, 199); // Keep last 200 for exam
        await redisConnection.expire(examRedisKey, 86400);

        // Emit real-time event to reviewers monitoring this exam
        try {
            const io = getIO();
            // Emit to exam monitoring room (for reviewers)
            io.to(`exam:monitor:${attempt.examId}`).emit('proctor:screenshot', screenshotData);
            // Also emit to attempt room (for the candidate's own view if needed)
            io.to(`attempt:${attemptId}`).emit('proctor:screenshot', screenshotData);
        } catch (socketError) {
            console.error('[Proctor] Socket emit error:', socketError);
        }

        // Publish to Redis channel for cross-process notification
        await redisConnection.publish(REDIS_CHANNELS.PROCTOR_EVENT, JSON.stringify({
            type: 'SCREENSHOT',
            ...screenshotData,
        }));

        res.json({
            success: true,
            data: {
                eventType,
                timestamp: capturedAt,
                url,
                storage: location,
            },
            message: `Screenshot captured (${location})`,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/attempts/:id/screenshots - List all screenshots for an attempt (Reviewer/Admin only)
router.get('/:id/screenshots', authenticate, async (req, res, next) => {
    try {
        const attemptId = req.params.id;
        const userRole = req.user!.role;

        // Only allow ADMIN, REVIEWER, or the candidate themselves
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, attemptId),
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        // Check access
        const isOwner = attempt.candidateId === req.user!.userId;
        const isReviewerOrAdmin = userRole === 'ADMIN' || userRole === 'REVIEWER';

        if (!isOwner && !isReviewerOrAdmin) {
            throw new ApiError('Forbidden', 403);
        }

        // Get screenshots from Redis (includes S3 URLs)
        const redisKey = `screenshots:${attemptId}`;
        const redisScreenshots = await redisConnection.lrange(redisKey, 0, -1);

        let screenshots: any[] = [];

        if (redisScreenshots.length > 0) {
            // Parse Redis data (newest first in Redis, reverse for chronological order)
            screenshots = redisScreenshots
                .map(s => {
                    try {
                        return JSON.parse(s);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
                .reverse() // Oldest first
                .map(s => ({
                    filename: s.filename,
                    url: s.url,
                    eventType: s.eventType,
                    capturedAt: s.timestamp,
                    storage: s.storage || 'UNKNOWN',
                }));
        } else {
            // Fallback: Read from local filesystem (legacy)
            const screenshotDir = path.join(process.cwd(), 'uploads', 'screenshots');

            if (fs.existsSync(screenshotDir)) {
                const files = fs.readdirSync(screenshotDir);
                screenshots = files
                    .filter(f => f.startsWith(attemptId))
                    .map(filename => {
                        const filePath = path.join(screenshotDir, filename);
                        const stats = fs.statSync(filePath);
                        const parts = filename.replace(/\.[^.]+$/, '').split('_');
                        const eventType = parts.length > 2 ? parts.slice(2).join('_') : 'UNKNOWN';

                        return {
                            filename,
                            url: `/uploads/screenshots/${filename}`,
                            eventType: eventType.replace(/_\d+$/, ''),
                            capturedAt: stats.mtime.toISOString(),
                            storage: 'LOCAL',
                        };
                    })
                    .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
            }
        }

        res.json({
            success: true,
            data: {
                screenshots,
                count: screenshots.length,
                source: redisScreenshots.length > 0 ? 'redis' : 'filesystem',
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/attempts/:id/screenshots/live - Get latest screenshots from Redis (Reviewer/Admin only)
router.get('/:id/screenshots/live', authenticate, async (req, res, next) => {
    try {
        const attemptId = req.params.id;
        const userRole = req.user!.role;

        // Only allow ADMIN and REVIEWER
        if (!['ADMIN', 'REVIEWER'].includes(userRole)) {
            throw new ApiError('Forbidden', 403);
        }

        // Get from Redis
        const redisKey = `screenshots:${attemptId}`;
        const screenshots = await redisConnection.lrange(redisKey, 0, 49);

        const parsedScreenshots = screenshots.map(s => {
            try {
                return JSON.parse(s);
            } catch {
                return null;
            }
        }).filter(Boolean);

        res.json({
            success: true,
            data: {
                screenshots: parsedScreenshots,
                count: parsedScreenshots.length,
                source: 'redis',
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/exams/:examId/screenshots/live - Get all screenshots for an exam from Redis (Reviewer/Admin)
router.get('/exam/:examId/screenshots/live', authenticate, async (req, res, next) => {
    try {
        const examId = req.params.examId;
        const userRole = req.user!.role;

        // Only allow ADMIN and REVIEWER
        if (!['ADMIN', 'REVIEWER'].includes(userRole)) {
            throw new ApiError('Forbidden', 403);
        }

        // Get from Redis
        const redisKey = `screenshots:exam:${examId}`;
        const screenshots = await redisConnection.lrange(redisKey, 0, 199);

        const parsedScreenshots = screenshots.map(s => {
            try {
                return JSON.parse(s);
            } catch {
                return null;
            }
        }).filter(Boolean);

        res.json({
            success: true,
            data: {
                screenshots: parsedScreenshots,
                count: parsedScreenshots.length,
                source: 'redis',
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
