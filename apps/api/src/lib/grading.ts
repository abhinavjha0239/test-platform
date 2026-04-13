import crypto from 'crypto';
import type { GradingJob } from '@exam-platform/shared';
import { redisConnection } from './redis.js';

/**
 * Extended grading job with preview flag
 */
export interface GradingJobWithPreview extends GradingJob {
    isPreview?: boolean;
}

const STREAMS = {
    HIGH: 'grading:jobs:high',
    LOW: 'grading:jobs:low',
    DLQ: 'grading:jobs:dlq',
    RETRY_ZSET: 'grading:jobs:retry',
} as const;

const STREAM_GROUP = process.env.GRADING_STREAM_GROUP || 'grading-workers';
const JOB_KEY_PREFIX = 'grading:job:';
const STATS_KEY = 'grading:stats';
const JOB_TTL_SEC = parseInt(process.env.GRADING_JOB_TTL_SEC || '172800', 10); // 48h

function jobKey(jobId: string): string {
    return `${JOB_KEY_PREFIX}${jobId}`;
}

function createJobId(attemptId: string): string {
    const suffix = crypto.randomUUID().slice(0, 8);
    return `grading_${attemptId}_${Date.now()}_${suffix}`;
}

/**
 * Compute a hash of challenge config for container pooling
 * Containers with the same hash can be reused
 */
export function computeDependenciesHash(runner: GradingJob['runner']): string {
    if (!runner) return '';

    // Only http/playwright runners have candidate config
    if (runner.mode === 'jest') return '';

    const h = crypto.createHash('sha256');
    h.update(runner.candidate?.image || '');
    h.update(runner.candidate?.installCommand || '');
    h.update(JSON.stringify(runner.candidate?.generatedFiles || {}));
    return h.digest('hex').slice(0, 16);
}

function parseIntSafe(value: string | undefined, fallback = 0): number {
    if (!value) return fallback;
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function parseJsonSafe<T>(value: string | undefined): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

let streamsInitialized = false;

async function ensureStreamsInitialized() {
    if (streamsInitialized) return;
    try {
        for (const stream of [STREAMS.HIGH, STREAMS.LOW]) {
            try {
                await redisConnection.xgroup('CREATE', stream, STREAM_GROUP, '0', 'MKSTREAM');
                console.log(`[Grading] Created stream group ${STREAM_GROUP} on ${stream}`);
            } catch (err: any) {
                if (!err.message?.includes('BUSYGROUP')) {
                    throw err;
                }
            }
        }
        streamsInitialized = true;
    } catch (err) {
        console.error('[Grading] Failed to initialize streams:', err);
    }
}

async function ensureStatsInitialized() {
    await ensureStreamsInitialized();
    const pipeline = redisConnection.multi();
    pipeline.hsetnx(STATS_KEY, 'queued', '0');
    pipeline.hsetnx(STATS_KEY, 'active', '0');
    pipeline.hsetnx(STATS_KEY, 'completed', '0');
    pipeline.hsetnx(STATS_KEY, 'failed', '0');
    pipeline.hsetnx(STATS_KEY, 'retrying', '0');
    await pipeline.exec();
}

/**
 * Add a grading job to Redis Streams
 */
export async function addGradingJob(job: GradingJobWithPreview): Promise<string> {
    await ensureStatsInitialized();
    const jobId = createJobId(job.attemptId);
    const stream = job.isPreview ? STREAMS.LOW : STREAMS.HIGH;
    const createdAt = Date.now();
    const payload = JSON.stringify(job);

    const streamId = await redisConnection.xadd(
        stream,
        '*',
        'jobId',
        jobId,
        'attemptId',
        job.attemptId,
        'isPreview',
        job.isPreview ? '1' : '0',
        'createdAt',
        String(createdAt),
        'payload',
        payload
    );

    const pipeline = redisConnection.multi();
    pipeline.hset(jobKey(jobId), {
        status: 'queued',
        progress: '0',
        attemptId: job.attemptId,
        stream,
        streamId,
        createdAt: String(createdAt),
        updatedAt: String(createdAt),
        attempts: '0',
        isPreview: job.isPreview ? '1' : '0',
        payload,
        group: STREAM_GROUP,
    });
    pipeline.expire(jobKey(jobId), JOB_TTL_SEC);
    pipeline.hincrby(STATS_KEY, 'queued', 1);
    await pipeline.exec();

    console.log(`[Grading] Job ${jobId} queued for attempt ${job.attemptId}${job.isPreview ? ' (preview)' : ''}`);
    return jobId;
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string) {
    const data = await redisConnection.hgetall(jobKey(jobId));
    if (!data || Object.keys(data).length === 0) return null;

    return {
        id: jobId,
        state: data.status || 'unknown',
        data: parseJsonSafe<GradingJobWithPreview>(data.payload),
        progress: parseIntSafe(data.progress, 0),
        attemptsMade: parseIntSafe(data.attempts, 0),
        timestamp: parseIntSafe(data.createdAt, 0),
        finishedOn: parseIntSafe(data.completedAt, 0),
        processedOn: parseIntSafe(data.startedAt, 0),
        stream: data.stream,
        streamId: data.streamId,
    };
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
    await ensureStatsInitialized();
    const stats = await redisConnection.hgetall(STATS_KEY);
    if (stats && Object.keys(stats).length > 0) {
        return {
            waiting: parseIntSafe(stats.queued),
            active: parseIntSafe(stats.active),
            completed: parseIntSafe(stats.completed),
            failed: parseIntSafe(stats.failed),
            delayed: parseIntSafe(stats.retrying),
        };
    }

    const [highLen, lowLen] = await Promise.all([
        redisConnection.xlen(STREAMS.HIGH),
        redisConnection.xlen(STREAMS.LOW),
    ]);

    return {
        waiting: highLen + lowLen,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
    };
}

/**
 * Clean old jobs from streams and retry queue
 */
export async function cleanQueue(gracePeriod: number = 24 * 60 * 60 * 1000) {
    const minId = `${Date.now() - gracePeriod}-0`;
    await Promise.all([
        redisConnection.xtrim(STREAMS.HIGH, 'MINID', minId),
        redisConnection.xtrim(STREAMS.LOW, 'MINID', minId),
        redisConnection.xtrim(STREAMS.DLQ, 'MINID', minId),
        redisConnection.zremrangebyscore(STREAMS.RETRY_ZSET, 0, Date.now() - gracePeriod),
    ]);
}

/**
 * Pause the grading queue
 */
export async function pauseQueue() {
    await redisConnection.set('grading:queue:paused', '1');
    console.log('Grading queue paused');
}

/**
 * Resume the grading queue
 */
export async function resumeQueue() {
    await redisConnection.del('grading:queue:paused');
    console.log('Grading queue resumed');
}

/**
 * Close queue connections gracefully
 */
export async function closeGradingQueue() {
    console.log('Grading queue closed');
}
