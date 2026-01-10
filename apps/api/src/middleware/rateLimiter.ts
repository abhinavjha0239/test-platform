import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisConnection } from '../lib/redis.js';

/**
 * Redis Store Factory for Distributed Rate Limiting
 * 
 * Without Redis store, each API instance has its own rate limit counter.
 * With Redis store, rate limits are shared across all instances,
 * preventing bypass by distributing requests across servers.
 */
function createRedisStore(prefix: string): RedisStore {
    return new RedisStore({
        // Use ioredis call method for sending commands
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendCommand: (...args: string[]) => redisConnection.call(...args) as any,
        prefix: `rl:${prefix}:`,
    });
}

/**
 * Rate limiter for login attempts
 * Prevents brute force attacks
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 50 : 5, // 50 in dev, 5 in prod
    message: {
        success: false,
        error: 'Too many login attempts. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
    store: createRedisStore('login'),
});

/**
 * Rate limiter for registration
 * Prevents spam account creation
 */
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === 'development' ? 50 : 3, // 50 in dev, 3 in prod
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('register'),
});

/**
 * General API rate limiter
 * Prevents DoS attacks
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200, // 200 requests per minute (increased for exam traffic)
    message: {
        success: false,
        error: 'Too many requests. Please slow down.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('api'),
});

/**
 * Strict rate limiter for sensitive operations
 * E.g., password reset, email verification
 */
export const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 attempts per hour
    message: {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('strict'),
});

/**
 * Rate limiter for exam submissions
 * Prevents spam submissions
 */
export const submissionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 submissions per minute
    message: {
        success: false,
        error: 'Too many submission attempts. Please wait a moment.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createRedisStore('submission'),
});
