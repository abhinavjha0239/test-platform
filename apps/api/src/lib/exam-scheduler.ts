/**
 * Exam Scheduler Service
 * 
 * Background service that:
 * 1. Auto-warms container pools 15 minutes before exam start (via grader service)
 * 2. Auto-submits IN_PROGRESS attempts when scheduled end time is reached
 * 
 * Features:
 * - Polls every 30 seconds
 * - Uses Redis distributed lock to prevent duplicate processing
 * - Gracefully handles missed end times
 * 
 * NOTE: Pool warming is now handled by the grader microservice (apps/grader-go).
 * This scheduler publishes warmup requests via Redis.
 */

import { eq, and, lte, gte, isNotNull } from 'drizzle-orm';
import { db } from './db.js';
import { exams, examAttempts } from '@exam-platform/database';
import { redisConnection, redisPublisher, REDIS_CHANNELS } from './redis.js';
import { addGradingJob } from './grading.js';
import { flushToDatabase, getFromBuffer } from './autosave-buffer.js';
import type { Server } from 'socket.io';

// Scheduler configuration
const SCHEDULER_INTERVAL_MS = 30 * 1000; // 30 seconds
const SCHEDULER_LOCK_KEY = 'exam_scheduler:lock';
const SCHEDULER_LOCK_TTL = 60; // 60 seconds (longer than interval)
const PROCESSED_EXAMS_PREFIX = 'exam_scheduler:processed:';

let schedulerInterval: NodeJS.Timeout | null = null;
let socketIoInstance: Server | null = null;

/**
 * Start the exam scheduler
 */
export function startExamScheduler(io: Server): void {
    socketIoInstance = io;

    if (schedulerInterval) {
        console.log('⏰ Exam scheduler already running');
        return;
    }

    console.log('⏰ Starting exam scheduler (checking every 30s for auto-warmup and expired windows)');

    // Run immediately on startup
    runSchedulerCycle().catch(err => {
        console.error('❌ Exam scheduler startup cycle error:', err);
    });

    // Then run periodically
    schedulerInterval = setInterval(async () => {
        try {
            await runSchedulerCycle();
        } catch (err) {
            console.error('❌ Exam scheduler cycle error:', err);
        }
    }, SCHEDULER_INTERVAL_MS);
}

/**
 * Stop the exam scheduler
 */
export function stopExamScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('⏰ Exam scheduler stopped');
    }
}

/**
 * Run a single scheduler cycle
 */
async function runSchedulerCycle(): Promise<void> {
    // Try to acquire distributed lock
    const lockAcquired = await redisConnection.set(
        SCHEDULER_LOCK_KEY,
        process.pid.toString(),
        'EX',
        SCHEDULER_LOCK_TTL,
        'NX'
    );

    if (!lockAcquired) {
        // Another instance is handling this cycle
        return;
    }

    try {
        // === Auto-warmup for upcoming exams ===
        // Publishes warmup request to grader service via Redis
        try {
            // Find exams starting in the next 15 minutes
            const now = new Date();
            const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

            const upcomingExams = await db.query.exams.findMany({
                where: and(
                    isNotNull(exams.scheduledStartAt),
                    gte(exams.scheduledStartAt, now),
                    lte(exams.scheduledStartAt, fifteenMinutesLater)
                ),
                with: { challenge: true },
            });

            if (upcomingExams.length > 0) {
                // Publish warmup request to grader service
                await redisPublisher.publish(
                    REDIS_CHANNELS.POOL_WARMUP,
                    JSON.stringify({
                        examIds: upcomingExams.map(e => e.id),
                        dependencies: upcomingExams
                            .filter(e => e.challenge)
                            .map(e => e.challenge!.dependencies),
                    })
                );
                console.log(`🔥 Requested warmup for ${upcomingExams.length} upcoming exam(s)`);
            }
        } catch (warmupError) {
            console.error('❌ Auto-warmup request error:', warmupError);
            // Continue with auto-submit even if warmup fails
        }

        // === Auto-submit for expired exams (scheduled end time) ===
        const now = new Date();
        // Only look back 24 hours (to avoid processing very old exams)
        const lookback = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Optimized query: only fetch exams where scheduledEndAt is between lookback and now
        // This is much more efficient than fetching ALL exams and filtering in JavaScript
        const expiredExams = await db.query.exams.findMany({
            where: (exams, { and, lte, gte, isNotNull }) => and(
                isNotNull(exams.scheduledEndAt),
                lte(exams.scheduledEndAt, now),
                gte(exams.scheduledEndAt, lookback)
            ),
            with: {
                attempts: {
                    where: (attempts, { eq }) => eq(attempts.status, 'IN_PROGRESS'),
                },
                challenge: true,
            },
        });

        for (const exam of expiredExams) {
            // Check if we've already processed this exam's end time
            const processedKey = `${PROCESSED_EXAMS_PREFIX}${exam.id}:${exam.scheduledEndAt?.toISOString()}`;
            const alreadyProcessed = await redisConnection.get(processedKey);

            if (alreadyProcessed) {
                continue;
            }

            // Attempts are already filtered for IN_PROGRESS in the query
            const inProgressAttempts = exam.attempts;

            if (inProgressAttempts.length === 0) {
                // No in-progress attempts, mark as processed
                await redisConnection.set(processedKey, '1', 'EX', 24 * 60 * 60); // 24h TTL
                continue;
            }

            console.log(`⏰ Exam "${exam.title}" (${exam.id}) has ${inProgressAttempts.length} IN_PROGRESS attempts at scheduled end time. Auto-submitting all...`);

            // Process each attempt
            for (const attempt of inProgressAttempts) {
                await autoSubmitAttempt(attempt, exam);
            }

            // Mark this exam's scheduled end as processed
            await redisConnection.set(processedKey, '1', 'EX', 24 * 60 * 60);
        }

        // === FALLBACK: Auto-submit for INDIVIDUAL time limit expiry ===
        // This catches attempts where:
        // 1. Exam has no scheduledEndAt (unscheduled exams)
        // 2. User lost WebSocket connection and timer stopped
        // 3. Timer never started for some reason
        try {
            // Find all IN_PROGRESS attempts that have exceeded their time limit
            const allInProgressAttempts = await db.query.examAttempts.findMany({
                where: eq(examAttempts.status, 'IN_PROGRESS'),
                with: {
                    exam: {
                        with: {
                            challenge: true,
                        },
                    },
                },
            });

            for (const attempt of allInProgressAttempts) {
                if (!attempt.exam) continue;

                // Calculate if time has expired
                const startedAt = new Date(attempt.startedAt).getTime();
                const timeLimitMs = attempt.exam.timeLimit * 60 * 1000; // timeLimit is in minutes
                const endTime = startedAt + timeLimitMs;
                const nowMs = Date.now();

                // Add 1 minute grace period to avoid race conditions with WebSocket timer
                const gracePeriodMs = 60 * 1000;

                if (nowMs > endTime + gracePeriodMs) {
                    // Check if already being processed (use Redis lock)
                    const attemptLockKey = `scheduler:attempt_lock:${attempt.id}`;
                    const lockAcquired = await redisConnection.set(attemptLockKey, '1', 'EX', 300, 'NX');
                    
                    if (!lockAcquired) {
                        continue; // Another process is handling this
                    }

                    const minutesOverdue = Math.round((nowMs - endTime) / 60000);
                    console.log(`⏰ Attempt ${attempt.id} exceeded time limit by ${minutesOverdue} min. Auto-submitting (fallback)...`);

                    await autoSubmitAttempt(attempt, attempt.exam);
                }
            }
        } catch (fallbackError) {
            console.error('❌ Fallback auto-submit error:', fallbackError);
        }
    } finally {
        // Release lock
        await redisConnection.del(SCHEDULER_LOCK_KEY);
    }
}

/**
 * Auto-submit a single attempt
 */
async function autoSubmitAttempt(
    attempt: typeof examAttempts.$inferSelect,
    exam: typeof exams.$inferSelect & { challenge: typeof import('@exam-platform/database').challenges.$inferSelect | null }
): Promise<void> {
    try {
        // Emit timer expired event via Socket.IO
        if (socketIoInstance) {
            socketIoInstance.to(`attempt:${attempt.id}`).emit('timer:expired', {
                message: 'Exam window has closed. Your exam has been automatically submitted.',
                reason: 'scheduled_end',
            });
        }

        // Flush autosave buffer to get latest code
        await flushToDatabase(attempt.id);

        // Get latest files
        const bufferedFiles = await getFromBuffer(attempt.id);
        const filesToGrade = bufferedFiles || attempt.files || {};

        // Update status to SUBMITTED
        await db.update(examAttempts)
            .set({
                status: 'SUBMITTED',
                submittedAt: new Date(),
                files: filesToGrade,
            })
            .where(eq(examAttempts.id, attempt.id));

        // Queue grading job
        if (exam.challenge) {
            await addGradingJob({
                attemptId: attempt.id,
                files: filesToGrade,
                publicTests: exam.challenge.publicTests,
                hiddenTests: exam.challenge.hiddenTests,
                dependencies: exam.challenge.dependencies as Record<string, string>,
                runner: exam.challenge.runner as any,
                challengeId: exam.challenge.id,
                nodeVersion: exam.challenge.nodeVersion,
                timeLimit: 120,
                memoryLimit: 512,
            });

            // Update status to GRADING
            await db.update(examAttempts)
                .set({ status: 'GRADING' })
                .where(eq(examAttempts.id, attempt.id));
        }

        console.log(`✅ Auto-submitted attempt ${attempt.id} (scheduled exam end)`);
    } catch (error) {
        console.error(`❌ Failed to auto-submit attempt ${attempt.id}:`, error);
    }
}

/**
 * Manually trigger processing for a specific exam (for testing)
 */
export async function processExamEnd(examId: string): Promise<number> {
    const exam = await db.query.exams.findFirst({
        where: eq(exams.id, examId),
        with: {
            attempts: {
                where: eq(examAttempts.status, 'IN_PROGRESS'),
            },
            challenge: true,
        },
    });

    if (!exam) {
        throw new Error('Exam not found');
    }

    const inProgressAttempts = exam.attempts.filter(a => a.status === 'IN_PROGRESS');

    for (const attempt of inProgressAttempts) {
        await autoSubmitAttempt(attempt, exam);
    }

    return inProgressAttempts.length;
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { running: boolean; interval: number } {
    return {
        running: schedulerInterval !== null,
        interval: SCHEDULER_INTERVAL_MS,
    };
}
