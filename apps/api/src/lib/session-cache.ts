/**
 * Redis Session Cache
 * 
 * High-performance session caching to avoid bcrypt on every login.
 * 
 * Strategy:
 * 1. On first login: bcrypt.compare() + cache session in Redis
 * 2. On subsequent requests: validate from Redis (microseconds)
 * 3. Sessions have 7-day TTL (configurable)
 * 
 * Security:
 * - Session invalidated on password change
 * - Session invalidated on explicit logout
 * - TTL prevents indefinite sessions
 */

import { redisConnection } from './redis.js';
import crypto from 'crypto';

// Session TTL: 7 days (for long exam preparation periods)
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Key prefixes
const SESSION_KEY_PREFIX = 'session:';
const USER_SESSIONS_PREFIX = 'user_sessions:';

export interface SessionData {
    userId: string;
    email: string;
    role: string;
    passwordHash: string; // Store hash to detect password changes
    createdAt: number;
    lastAccessedAt: number;
    userAgent?: string;
    ip?: string;
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session in Redis
 */
export async function createSession(
    userId: string,
    email: string,
    role: string,
    passwordHash: string,
    metadata?: { userAgent?: string; ip?: string }
): Promise<string> {
    const sessionId = generateSessionId();
    const now = Date.now();

    const sessionData: SessionData = {
        userId,
        email,
        role,
        passwordHash: passwordHash.substring(0, 20), // Store partial hash for change detection
        createdAt: now,
        lastAccessedAt: now,
        userAgent: metadata?.userAgent,
        ip: metadata?.ip,
    };

    // Store session
    await redisConnection.set(
        `${SESSION_KEY_PREFIX}${sessionId}`,
        JSON.stringify(sessionData),
        'EX',
        SESSION_TTL_SECONDS
    );

    // Track session for user (for logout-all functionality)
    await redisConnection.sadd(`${USER_SESSIONS_PREFIX}${userId}`, sessionId);
    await redisConnection.expire(`${USER_SESSIONS_PREFIX}${userId}`, SESSION_TTL_SECONDS);

    return sessionId;
}

/**
 * Get session from Redis (fast path)
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
    const data = await redisConnection.get(`${SESSION_KEY_PREFIX}${sessionId}`);
    
    if (!data) {
        return null;
    }

    const session = JSON.parse(data) as SessionData;

    // Update last accessed time (sliding window)
    session.lastAccessedAt = Date.now();
    await redisConnection.set(
        `${SESSION_KEY_PREFIX}${sessionId}`,
        JSON.stringify(session),
        'EX',
        SESSION_TTL_SECONDS
    );

    return session;
}

/**
 * Validate session and check password hasn't changed
 */
export async function validateSession(
    sessionId: string,
    currentPasswordHash: string
): Promise<SessionData | null> {
    const session = await getSession(sessionId);

    if (!session) {
        return null;
    }

    // Check if password has changed since session was created
    if (session.passwordHash !== currentPasswordHash.substring(0, 20)) {
        // Password changed, invalidate session
        await invalidateSession(sessionId);
        return null;
    }

    return session;
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
    const session = await getSession(sessionId);
    
    if (session) {
        // Remove from user's session list
        await redisConnection.srem(`${USER_SESSIONS_PREFIX}${session.userId}`, sessionId);
    }

    await redisConnection.del(`${SESSION_KEY_PREFIX}${sessionId}`);
}

/**
 * Invalidate all sessions for a user (e.g., on password change)
 */
export async function invalidateAllUserSessions(userId: string): Promise<number> {
    const sessionIds = await redisConnection.smembers(`${USER_SESSIONS_PREFIX}${userId}`);

    if (sessionIds.length === 0) {
        return 0;
    }

    // Delete all sessions
    const pipeline = redisConnection.pipeline();
    for (const sessionId of sessionIds) {
        pipeline.del(`${SESSION_KEY_PREFIX}${sessionId}`);
    }
    pipeline.del(`${USER_SESSIONS_PREFIX}${userId}`);
    await pipeline.exec();

    return sessionIds.length;
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
    const sessionIds = await redisConnection.smembers(`${USER_SESSIONS_PREFIX}${userId}`);
    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
        const session = await getSession(sessionId);
        if (session) {
            sessions.push(session);
        }
    }

    return sessions;
}

/**
 * Check if a cached login exists for email
 * This is for the fast-path login (when user has active session)
 */
export async function getCachedLogin(email: string): Promise<{
    sessionId: string;
    session: SessionData;
} | null> {
    // We can't directly look up by email, but we can use a secondary index
    const sessionId = await redisConnection.get(`login_cache:${email}`);
    
    if (!sessionId) {
        return null;
    }

    const session = await getSession(sessionId);
    
    if (!session) {
        // Clean up stale index
        await redisConnection.del(`login_cache:${email}`);
        return null;
    }

    return { sessionId, session };
}

/**
 * Set cached login index for fast lookup
 */
export async function setCachedLogin(email: string, sessionId: string): Promise<void> {
    await redisConnection.set(
        `login_cache:${email}`,
        sessionId,
        'EX',
        SESSION_TTL_SECONDS
    );
}

/**
 * Remove cached login index
 */
export async function removeCachedLogin(email: string): Promise<void> {
    await redisConnection.del(`login_cache:${email}`);
}
