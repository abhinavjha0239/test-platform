import { Queue, QueueEvents } from 'bullmq';
import type { GradingJob } from '@exam-platform/shared';
import { redisConnection } from './redis.js';

/**
 * Extended grading job with preview flag
 */
export interface GradingJobWithPreview extends GradingJob {
    isPreview?: boolean;
}

/**
 * BullMQ Queue for grading jobs
 */
export const gradingQueue = new Queue<GradingJobWithPreview>('grading', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: {
            count: 100, // Keep last 100 completed jobs
            age: 24 * 60 * 60, // Keep for 24 hours
        },
        removeOnFail: {
            count: 50, // Keep last 50 failed jobs
        },
    },
});

/**
 * Queue events for monitoring
 */
export const gradingQueueEvents = new QueueEvents('grading', {
    connection: redisConnection,
});

// Log queue events
gradingQueueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.log(`✅ Grading job ${jobId} completed`);
});

gradingQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Grading job ${jobId} failed: ${failedReason}`);
});

gradingQueueEvents.on('progress', ({ jobId, data }) => {
    console.log(`📊 Grading job ${jobId} progress:`, data);
});

/**
 * Add a grading job to the queue
 */
export async function addGradingJob(job: GradingJobWithPreview): Promise<string> {
    const queueJob = await gradingQueue.add('grade', job, {
        jobId: `grading_${job.attemptId}_${Date.now()}`,
        priority: job.isPreview ? 10 : 1, // Preview runs have lower priority
    });

    console.log(`[Grading] Job ${queueJob.id} queued for attempt ${job.attemptId}${job.isPreview ? ' (preview)' : ''}`);
    
    return queueJob.id!;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string) {
    const job = await gradingQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    
    return {
        id: job.id,
        state,
        data: job.data,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
    };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        gradingQueue.getWaitingCount(),
        gradingQueue.getActiveCount(),
        gradingQueue.getCompletedCount(),
        gradingQueue.getFailedCount(),
        gradingQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
}

/**
 * Clean old jobs from the queue
 */
export async function cleanQueue(gracePeriod: number = 24 * 60 * 60 * 1000) {
    await gradingQueue.clean(gracePeriod, 1000, 'completed');
    await gradingQueue.clean(gracePeriod, 100, 'failed');
}

/**
 * Pause the grading queue
 */
export async function pauseQueue() {
    await gradingQueue.pause();
    console.log('Grading queue paused');
}

/**
 * Resume the grading queue
 */
export async function resumeQueue() {
    await gradingQueue.resume();
    console.log('Grading queue resumed');
}

/**
 * Close queue connections gracefully
 */
export async function closeGradingQueue() {
    await gradingQueueEvents.close();
    await gradingQueue.close();
    console.log('Grading queue closed');
}
