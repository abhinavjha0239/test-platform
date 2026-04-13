import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Request } from 'express';
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
 * Get IP address from request
 * Handles proxy scenarios (X-Forwarded-For)
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
        return ips[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Key generator for authenticated routes
 * Uses User ID from JWT token for rate limiting
 * Falls back to IP for unauthenticated requests
 * 
 * IMPORTANT: This allows 300 students from same college IP
 * to each have their own rate limit quota
 */
function userIdKeyGenerator(req: Request): string {
    // If user is authenticated, use their userId
    if (req.user?.userId) {
        return `user:${req.user.userId}`;
    }
    // Fallback to IP for unauthenticated requests
    return `ip:${getClientIP(req)}`;
}

/**
 * Key generator for login attempts
 * Uses email + IP combination to prevent brute force
 * while still allowing college scenario
 */
function loginKeyGenerator(req: Request): string {
    const email = req.body?.email?.toLowerCase() || 'unknown';
    const ip = getClientIP(req);
    // Rate limit per email, not per IP
    // This allows 300 students to login from same IP
    return `email:${email}`;
}

/**
 * Global IP-based DDoS protection (Layer 1)
 *
 * In a college 500 students share the same public IP.
 * At ~10 req/s per student that's ~5000 req/s aggregate.
 * This limiter only triggers for genuine DDoS / abuse traffic.
 * All per-user limiters below act as Layer 2.
 */
export const globalIPLimiter = rateLimit({
    windowMs: 1000, // 1-second window
    max: process.env.NODE_ENV === 'development' ? 10000 : 5000,
    message: {
        success: false,
        error: 'Too many requests from this network. Please try again shortly.',
    },
    standardHeaders: false, // don't override per-user headers
    legacyHeaders: false,
    keyGenerator: (req: Request) => `gip:${getClientIP(req)}`,
    store: createRedisStore('gip'),
});

/**
 * Rate limiter for login attempts
 * Prevents brute force attacks PER EMAIL
 * College-friendly: different emails = different limits
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 50 : 10, // 10 failed attempts per email
    message: {
        success: false,
        error: 'Too many login attempts for this email. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
    keyGenerator: loginKeyGenerator,
    store: createRedisStore('login'),
});

/**
 * Rate limiter for registration
 * Prevents spam account creation PER EMAIL
 */
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === 'development' ? 50 : 5, // 5 attempts per email
    message: {
        success: false,
        error: 'Too many registration attempts for this email. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        const email = req.body?.email?.toLowerCase() || getClientIP(req);
        return `email:${email}`;
    },
    store: createRedisStore('register'),
});

/**
 * General API rate limiter
 * Uses USER ID for authenticated requests
 * 
 * COLLEGE-FRIENDLY:
 * - Each student gets 300 req/min regardless of shared IP
 * - Unauthenticated requests still use IP-based limiting
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute per USER
    message: {
        success: false,
        error: 'Too many requests. Please slow down.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('api'),
});

/**
 * Strict rate limiter for sensitive operations
 * E.g., password reset, email verification
 */
export const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 attempts per hour per user
    message: {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('strict'),
});

/**
 * Rate limiter for exam submissions
 * Per-user limiting for college scenario
 */
export const submissionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 submissions per minute per USER
    message: {
        success: false,
        error: 'Too many submission attempts. Please wait a moment.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('submission'),
});

/**
 * Rate limiter for screenshot uploads
 * Prevents DoS via screenshot spam
 * Allows burst for multi-screenshot events (TAB_LEAVE = 3 shots)
 */
export const screenshotLimiter = rateLimit({
    windowMs: 5 * 1000, // 5 seconds
    max: 15, // 15 screenshots per 5 seconds per USER (allows bursts)
    message: {
        success: false,
        error: 'Too many screenshots. Please wait.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('screenshot'),
});

/**
 * Rate limiter for autosave (file save)
 * Prevents Redis spam
 */
export const autosaveLimiter = rateLimit({
    windowMs: 10 * 1000, // 10 seconds
    max: 20, // 20 saves per 10 seconds per USER
    message: {
        success: false,
        error: 'Saving too frequently. Will retry automatically.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('autosave'),
});

/**
 * Rate limiter for run tests
 * Prevents grading queue overload
 */
export const runTestsLimiter = rateLimit({
    windowMs: 30 * 1000, // 30 seconds
    max: 5, // 5 test runs per 30 seconds per USER
    message: {
        success: false,
        error: 'Too many test runs. Please wait before running again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userIdKeyGenerator,
    store: createRedisStore('runtests'),
});
