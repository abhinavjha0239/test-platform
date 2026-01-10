import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Shared Redis connection for BullMQ and general caching
 */
export const redisConnection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis connection retry attempt ${times}, waiting ${delay}ms...`);
        return delay;
    },
});

/**
 * Separate Redis connection for pub/sub (subscriber)
 * Redis requires separate connections for pub/sub operations
 */
export const redisSubscriber = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

/**
 * Separate Redis connection for pub/sub (publisher)
 */
export const redisPublisher = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

// Handle connection events
redisConnection.on('connect', () => {
    console.log('✅ Redis connected');
});

redisConnection.on('error', (err) => {
    console.error('❌ Redis connection error:', err.message);
});

redisConnection.on('close', () => {
    console.log('Redis connection closed');
});

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
    return redisConnection.status === 'ready';
}

/**
 * Gracefully close all Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
    await Promise.all([
        redisConnection.quit(),
        redisSubscriber.quit(),
        redisPublisher.quit(),
    ]);
    console.log('Redis connections closed');
}

// Redis pub/sub channels
export const REDIS_CHANNELS = {
    GRADING_COMPLETE: 'grading:complete',
    PROCTOR_EVENT: 'proctor:event',
    TIMER_SYNC: 'timer:sync',
} as const;

/**
 * Factory functions for Socket.IO Redis adapter
 * 
 * Socket.IO requires dedicated Redis connections for its adapter.
 * These connections handle cross-instance event broadcasting,
 * enabling horizontal scaling of API servers.
 */
export function createAdapterPubClient(): typeof redisConnection {
    return new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    });
}

export function createAdapterSubClient(): typeof redisConnection {
    return new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    });
}
