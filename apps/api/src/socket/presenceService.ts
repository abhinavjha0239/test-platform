/**
 * Redis-backed Presence Tracking Service
 * 
 * Tracks active sessions across multiple API instances.
 * Prevents candidates from opening the exam in multiple tabs/browsers.
 */

import { redisConnection } from '../lib/redis.js';

// Redis key prefixes
const SESSION_KEY_PREFIX = 'session:';
const SESSION_SET_PREFIX = 'sessions:';

/**
 * Session timeout in seconds
 * Sessions are automatically cleaned up after this time.
 * Configurable via SESSION_TIMEOUT_SECONDS env var.
 * Increased default from 5 min to 10 min for better stability under load.
 */
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT_SECONDS || '600'); // 10 minutes default

/**
 * Session data stored in Redis
 */
interface SessionData {
    socketId: string;
    userId: string;
    attemptId: string;
    lastActive: number;
}

/**
 * Track a new session
 * Returns true if session can be added, false if another session exists
 */
export async function trackSession(
    attemptId: string,
    socketId: string,
    userId: string
): Promise<boolean> {
    const sessionSetKey = `${SESSION_SET_PREFIX}${attemptId}`;
    const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;

    // Get all existing sessions for this attempt
    const existingSessions = await redisConnection.smembers(sessionSetKey);

    // Check if there's another active session for this user
    for (const existingSocketId of existingSessions) {
        if (existingSocketId === socketId) continue;

        const existingSessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${existingSocketId}`;
        const existingData = await redisConnection.get(existingSessionKey);

        if (existingData) {
            try {
                const session: SessionData = JSON.parse(existingData);

                // Check if session is still active (not expired)
                const now = Date.now();
                if (now - session.lastActive < SESSION_TIMEOUT * 1000) {
                    // Same user has another active session
                    if (session.userId === userId) {
                        console.log(`⚠️ User ${userId} already has session ${existingSocketId} for attempt ${attemptId}`);
                        return false;
                    }
                } else {
                    // Session expired, clean it up
                    await redisConnection.srem(sessionSetKey, existingSocketId);
                    await redisConnection.del(existingSessionKey);
                }
            } catch {
                // Invalid session data, clean it up
                await redisConnection.srem(sessionSetKey, existingSocketId);
                await redisConnection.del(existingSessionKey);
            }
        } else {
            // Session key doesn't exist, remove from set
            await redisConnection.srem(sessionSetKey, existingSocketId);
        }
    }

    // Add this session
    const sessionData: SessionData = {
        socketId,
        userId,
        attemptId,
        lastActive: Date.now(),
    };

    // Store session data with TTL
    await redisConnection.set(sessionKey, JSON.stringify(sessionData), 'EX', SESSION_TIMEOUT);

    // Add to session set
    await redisConnection.sadd(sessionSetKey, socketId);

    // Set expiry on the set as well
    await redisConnection.expire(sessionSetKey, SESSION_TIMEOUT + 60);

    console.log(`✅ Session ${socketId} tracked for attempt ${attemptId} (user: ${userId}) [Redis]`);
    return true;
}

/**
 * Remove a session
 */
export async function removeSession(attemptId: string, socketId: string): Promise<void> {
    const sessionSetKey = `${SESSION_SET_PREFIX}${attemptId}`;
    const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;

    await redisConnection.srem(sessionSetKey, socketId);
    await redisConnection.del(sessionKey);

    console.log(`🗑️ Session ${socketId} removed from attempt ${attemptId} [Redis]`);
}

/**
 * Check if an attempt has any active sessions
 */
export async function hasActiveSession(attemptId: string): Promise<boolean> {
    const count = await getSessionCount(attemptId);
    return count > 0;
}

/**
 * Get count of active sessions for an attempt
 */
export async function getSessionCount(attemptId: string): Promise<number> {
    const sessionSetKey = `${SESSION_SET_PREFIX}${attemptId}`;

    // Get all sessions and validate each one
    const sessions = await redisConnection.smembers(sessionSetKey);
    let activeCount = 0;

    for (const socketId of sessions) {
        const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;
        const exists = await redisConnection.exists(sessionKey);

        if (exists) {
            activeCount++;
        } else {
            // Clean up stale reference
            await redisConnection.srem(sessionSetKey, socketId);
        }
    }

    return activeCount;
}

/**
 * Update session activity timestamp (heartbeat)
 */
export async function updateSessionActivity(attemptId: string, socketId: string): Promise<void> {
    const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;
    const sessionData = await redisConnection.get(sessionKey);

    if (sessionData) {
        try {
            const session: SessionData = JSON.parse(sessionData);
            session.lastActive = Date.now();

            await redisConnection.set(sessionKey, JSON.stringify(session), 'EX', SESSION_TIMEOUT);
        } catch {
            // Invalid data, ignore
        }
    }
}

/**
 * Get all sessions for an attempt
 */
export async function getSessionsForAttempt(attemptId: string): Promise<Map<string, string>> {
    const sessionSetKey = `${SESSION_SET_PREFIX}${attemptId}`;
    const sessions = await redisConnection.smembers(sessionSetKey);

    const result = new Map<string, string>();

    for (const socketId of sessions) {
        const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;
        const sessionData = await redisConnection.get(sessionKey);

        if (sessionData) {
            try {
                const session: SessionData = JSON.parse(sessionData);
                result.set(socketId, session.userId);
            } catch {
                // Invalid data, clean up
                await redisConnection.srem(sessionSetKey, socketId);
            }
        } else {
            // Clean up stale reference
            await redisConnection.srem(sessionSetKey, socketId);
        }
    }

    return result;
}

/**
 * Force disconnect all sessions for an attempt
 */
export async function clearAllSessions(attemptId: string): Promise<void> {
    const sessionSetKey = `${SESSION_SET_PREFIX}${attemptId}`;
    const sessions = await redisConnection.smembers(sessionSetKey);

    // Delete all session keys
    for (const socketId of sessions) {
        const sessionKey = `${SESSION_KEY_PREFIX}${attemptId}:${socketId}`;
        await redisConnection.del(sessionKey);
    }

    // Delete the set
    await redisConnection.del(sessionSetKey);

    console.log(`🗑️ All sessions cleared for attempt ${attemptId} [Redis]`);
}

/**
 * Get total active sessions across all attempts (approximate)
 * Uses SCAN instead of KEYS to avoid blocking Redis under load.
 */
export async function getTotalSessionCount(): Promise<number> {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys: string[] = [];
    let cursor = '0';
    do {
        const [nextCursor, batch] = await redisConnection.scan(
            cursor,
            'MATCH',
            `${SESSION_SET_PREFIX}*`,
            'COUNT',
            '100'
        );
        cursor = nextCursor;
        keys.push(...batch);
    } while (cursor !== '0');

    let total = 0;

    for (const key of keys) {
        const count = await redisConnection.scard(key);
        total += count;
    }

    return total;
}
