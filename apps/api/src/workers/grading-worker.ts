import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { redisConnection, redisPublisher, REDIS_CHANNELS } from '../lib/redis.js';
import { runSandboxedGrader } from '../lib/sandboxed-grader.js';
import { runLocalGrader } from '../lib/local-grader.js';
import { updateAttemptResults } from '../lib/grading-results.js';
import type { GradingJobWithPreview } from '../lib/grading.js';
import type { GradingResult } from '@exam-platform/shared';

/**
 * Grading Worker
 * 
 * Grader Modes:
 * - docker (RECOMMENDED FOR PRODUCTION): Full container isolation with network control
 * - sandboxed: Limited isolation, runs on host with separate test directories
 * - local: NO isolation, development only, blocked in production
 * 
 * Set via GRADER_MODE environment variable.
 */

// Determine grader mode - default to docker for production safety
const isProduction = process.env.NODE_ENV === 'production';
const defaultMode = isProduction ? 'docker' : 'sandboxed';
const GRADER_MODE = process.env.GRADER_MODE || defaultMode;

// Validate grader mode for production
if (isProduction && GRADER_MODE === 'local') {
    console.error('❌ CRITICAL: GRADER_MODE=local is not allowed in production!');
    console.error('   Set GRADER_MODE=docker for production deployments.');
    process.exit(1);
}

if (isProduction && GRADER_MODE === 'sandboxed') {
    console.warn('⚠️  WARNING: GRADER_MODE=sandboxed has limited isolation.');
    console.warn('   Consider using GRADER_MODE=docker for better security.');
}

console.log(`🚀 Starting grading worker (mode: ${GRADER_MODE}, env: ${process.env.NODE_ENV || 'development'})...`);

/**
 * BullMQ Worker for processing grading jobs
 */
const worker = new Worker<GradingJobWithPreview, GradingResult>(
    'grading',
    async (job: Job<GradingJobWithPreview>) => {
        const { attemptId, isPreview } = job.data;

        console.log(`[Worker] Processing job ${job.id} for attempt ${attemptId}${isPreview ? ' (preview)' : ''}`);

        // Update progress
        await job.updateProgress(10);

        try {
            // SECURITY: Multi-runtime secure runners require docker isolation
            if (job.data.runner?.mode && job.data.runner.mode !== 'jest' && GRADER_MODE !== 'docker') {
                throw new Error(`Runner mode '${job.data.runner.mode}' requires GRADER_MODE=docker`);
            }

            // Run the grader based on GRADER_MODE env var
            let result: GradingResult;

            switch (GRADER_MODE) {
                case 'docker':
                    // Docker-based grading (most secure, recommended for production)
                    const { runGrader } = await import('../lib/docker-grader.js');
                    result = await runGrader(job.data);
                    break;

                case 'local':
                    // Legacy local grader (no sandbox, dev only - blocked in production)
                    result = await runLocalGrader(job.data);
                    break;

                case 'sandboxed':
                default:
                    // Sandboxed local grader (separate public/hidden tests, limited isolation)
                    result = await runSandboxedGrader(job.data);
                    break;
            }

            await job.updateProgress(80);

            // Update database with results (returns sanitized result)
            const sanitizedResult = await updateAttemptResults(attemptId, result, isPreview ?? false);

            await job.updateProgress(90);

            // Publish SANITIZED result to Redis for Socket.IO to pick up
            // This ensures candidates never see hidden test details
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

            console.log(`[Worker] Job ${job.id} completed: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);

            return result;
        } catch (error) {
            console.error(`[Worker] Job ${job.id} failed:`, error);

            // Create error result - sanitize error message
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

            // Still update the attempt with error status
            try {
                await updateAttemptResults(attemptId, errorResult, isPreview ?? false);
            } catch (updateError) {
                console.error('[Worker] Failed to update attempt with error:', updateError);
            }

            // Publish error to Redis
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

            throw error; // Re-throw to trigger retry
        }
    },
    {
        connection: redisConnection,
        // Higher concurrency for production scaling (default 20, was 2)
        // With container pool, each job takes ~0.8s, so 20 concurrent = ~25 jobs/sec
        concurrency: parseInt(process.env.GRADING_CONCURRENCY || '20'),
        limiter: {
            // Higher rate limit for bulk grading at exam end (default 2000, was 10)
            // 4000 students submitting simultaneously needs high throughput
            max: parseInt(process.env.GRADING_RATE_LIMIT || '2000'),
            duration: 60000, // per minute
        },
    }
);

// Worker event handlers
worker.on('ready', () => {
    console.log('✅ Grading worker ready and waiting for jobs');
});

worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
    console.error(`❌ Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, error.message);
});

worker.on('error', (error) => {
    console.error('❌ Worker error:', error);
});

worker.on('stalled', (jobId) => {
    console.warn(`⚠️ Job ${jobId} stalled`);
});

// Graceful shutdown
const shutdown = async () => {
    console.log('Shutting down grading worker...');
    await worker.close();
    await redisConnection.quit();
    await redisPublisher.quit();
    console.log('Worker shutdown complete');
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('✅ Grading worker started');
