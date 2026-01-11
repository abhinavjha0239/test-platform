// Worker is loaded via bootstrap.ts which handles dotenv
import { Worker, Job } from 'bullmq';
import { redisConnection, redisPublisher, REDIS_CHANNELS } from './redis.js';
import { runGrader } from './graders/dispatcher.js';
import { db } from './db.js';
import * as schema from '@exam-platform/database';
import { eq } from 'drizzle-orm';
import type { GradingResult, GradingJob } from '@exam-platform/shared';


/**
 * Grader Worker (Microservice)
 * 
 * Standalone grading service that processes jobs from Redis queue.
 * Uses Docker-based blackbox grading for all challenge types:
 * - http: Backend APIs (Node/Python/Go/Rust)
 * - playwright: React E2E testing
 * - ui_jsdom: React component testing
 * 
 * Legacy challenges without runner config are auto-migrated to HTTP mode.
 */

interface GradingJobWithPreview extends GradingJob {
    isPreview?: boolean;
}

console.log(`🚀 Starting grader service (env: ${process.env.NODE_ENV || 'development'})...`);

/**
 * Update attempt results in database
 */
async function updateAttemptResults(
    attemptId: string,
    result: GradingResult,
    isPreview: boolean
): Promise<GradingResult> {
    const updateData: Record<string, unknown> = {
        publicScore: result.publicScore,
        totalPublic: result.totalPublic,
        gradingLogs: result.logs,
        gradedAt: new Date(),
    };

    // Only update hidden scores for final submissions (not previews)
    if (!isPreview) {
        updateData.hiddenScore = result.hiddenScore;
        updateData.totalHidden = result.totalHidden;
        updateData.status = result.success ? 'COMPLETED' : 'FAILED';
    }

    await db.update(schema.examAttempts)
        .set(updateData)
        .where(eq(schema.examAttempts.id, attemptId));

    // Return sanitized result (no hidden details for candidates)
    return {
        ...result,
        // For previews, don't reveal hidden test results
        hiddenScore: isPreview ? 0 : result.hiddenScore,
        totalHidden: isPreview ? 0 : result.totalHidden,
    };
}

/**
 * BullMQ Worker for processing grading jobs
 */
const worker = new Worker<GradingJobWithPreview, GradingResult>(
    'grading',
    async (job: Job<GradingJobWithPreview>) => {
        const { attemptId, isPreview } = job.data;

        console.log(`[Grader] Processing job ${job.id} for attempt ${attemptId}${isPreview ? ' (preview)' : ''}`);

        await job.updateProgress(10);

        try {
            // Run Docker-based grader (handles all modes: http, playwright, ui_jsdom)
            const result = await runGrader(job.data);

            await job.updateProgress(80);

            // Update database with results
            const sanitizedResult = await updateAttemptResults(attemptId, result, isPreview ?? false);

            await job.updateProgress(90);

            // Publish result to Redis for Socket.IO
            await redisPublisher.publish(
                REDIS_CHANNELS.GRADING_COMPLETE,
                JSON.stringify({
                    attemptId,
                    result: sanitizedResult,
                    isPreview,
                    jobId: job.id,
                })
            );

            await job.updateProgress(100);

            console.log(`[Grader] Job ${job.id} completed: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);

            return result;
        } catch (error) {
            console.error(`[Grader] Job ${job.id} failed:`, error);

            const errorMessage = String(error)
                .replace(/\/var\/folders\/[^\s]+/g, '[temp]')
                .replace(/\/tmp\/[^\s]+/g, '[temp]')
                .substring(0, 200);

            const errorResult: GradingResult = {
                publicScore: 0,
                hiddenScore: 0,
                totalPublic: 0,
                totalHidden: 0,
                logs: `Grading error: ${errorMessage}`,
                success: false,
                error: errorMessage,
            };

            try {
                await updateAttemptResults(attemptId, errorResult, isPreview ?? false);
            } catch (updateError) {
                console.error('[Grader] Failed to update attempt with error:', updateError);
            }

            await redisPublisher.publish(
                REDIS_CHANNELS.GRADING_COMPLETE,
                JSON.stringify({
                    attemptId,
                    result: errorResult,
                    isPreview,
                    jobId: job.id,
                    error: errorMessage,
                })
            );

            throw error;
        }
    },
    {
        connection: redisConnection,
        concurrency: parseInt(process.env.GRADING_CONCURRENCY || '20'),
        limiter: {
            max: parseInt(process.env.GRADING_RATE_LIMIT || '2000'),
            duration: 60000,
        },
    }
);

// Worker event handlers
worker.on('ready', () => {
    console.log('✅ Grader service ready and waiting for jobs');
});

worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
    console.error(`❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, error.message);
});

worker.on('error', (error) => {
    console.error('❌ Grader error:', error);
});

worker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
});

// Graceful shutdown
const shutdown = async () => {
    console.log('Shutting down grader service...');
    await worker.close();
    await redisConnection.quit();
    await redisPublisher.quit();
    console.log('Grader shutdown complete');
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('✅ Grader service started');
