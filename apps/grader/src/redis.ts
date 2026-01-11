import * as IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const Redis = (IORedis as any).default || IORedis;

// BullMQ connection (shared for worker)
export const redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
    },
});

// Publisher for grading results
export const redisPublisher = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
        if (times > 10) return null;
        return Math.min(times * 500, 5000);
    },
});

// Redis channels for pub/sub
export const REDIS_CHANNELS = {
    GRADING_COMPLETE: 'grading:complete',
    POOL_WARMUP: 'pool:warmup',
} as const;

redisConnection.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
});

redisConnection.on('connect', () => {
    console.log('[Redis] Connected to', REDIS_URL.replace(/\/\/.*@/, '//***@'));
});
