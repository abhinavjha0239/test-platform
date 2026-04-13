import * as IORedis from 'ioredis';
const Redis = (IORedis as any).default || IORedis;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const useTLS = REDIS_URL.startsWith('rediss://');
console.log(`🔗 Redis URL: ${REDIS_URL} (TLS: ${useTLS})`);

/**
 * Create a Redis client with shared config.
 * Automatically enables TLS when REDIS_URL uses rediss:// (Azure Cache for Redis).
 */
function createRedisClient(overrides: Record<string, unknown> = {}) {
    return new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        ...(useTLS ? { tls: { rejectUnauthorized: false } } : {}),
        retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        ...overrides,
    });
}

/**
 * Shared Redis connection for streams and general caching
 */
export const redisConnection = createRedisClient();

/**
 * Separate Redis connection for pub/sub (subscriber)
 * Redis requires separate connections for pub/sub operations
 */
export const redisSubscriber = createRedisClient();

/**
 * Separate Redis connection for pub/sub (publisher)
 */
export const redisPublisher = createRedisClient();

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
    POOL_WARMUP: 'pool:warmup',
} as const;

/**
 * Factory functions for Socket.IO Redis adapter
 * 
 * Socket.IO requires dedicated Redis connections for its adapter.
 * These connections handle cross-instance event broadcasting,
 * enabling horizontal scaling of API servers.
 */
export function createAdapterPubClient(): typeof redisConnection {
    return createRedisClient();
}

export function createAdapterSubClient(): typeof redisConnection {
    return createRedisClient();
}
