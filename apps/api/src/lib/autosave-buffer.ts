/**
 * Redis-backed Autosave Buffer
 * 
 * Buffers autosave writes in Redis before flushing to the database.
 * This reduces database load during exams while ensuring data safety.
 * 
 * Flow:
 * 1. Client saves files → Writes to Redis (instant)
 * 2. Background job flushes Redis → Database (periodic)
 * 3. On submit → Force flush to database (immediate)
 */

import { eq } from 'drizzle-orm';
import { examAttempts } from '@exam-platform/database';
import { db } from './db.js';
import { redisConnection } from './redis.js';

// Redis key prefixes
const AUTOSAVE_KEY_PREFIX = 'autosave:';
const AUTOSAVE_DIRTY_SET = 'autosave:dirty';

// Flush interval in milliseconds
const FLUSH_INTERVAL = 30 * 1000; // 30 seconds

// TTL for autosave data (should be longer than max exam duration)
// FIX: Increased from 6h to 12h to handle exams up to 8h+ with buffer
const AUTOSAVE_TTL = 12 * 60 * 60; // 12 hours

// Background flush interval reference
let flushInterval: NodeJS.Timeout | null = null;

/**
 * Save files to Redis buffer (fast, non-blocking)
 */
export async function saveToBuffer(
    attemptId: string,
    files: Record<string, string>
): Promise<void> {
    const key = `${AUTOSAVE_KEY_PREFIX}${attemptId}`;

    // Store files in Redis
    await redisConnection.set(key, JSON.stringify({
        files,
        updatedAt: Date.now(),
    }), 'EX', AUTOSAVE_TTL);

    // Mark as dirty (needs to be flushed to DB)
    await redisConnection.sadd(AUTOSAVE_DIRTY_SET, attemptId);

    console.log(`💾 Autosave buffered for attempt ${attemptId}`);
}

/**
 * Get files from buffer (or null if not in buffer)
 */
export async function getFromBuffer(attemptId: string): Promise<Record<string, string> | null> {
    const key = `${AUTOSAVE_KEY_PREFIX}${attemptId}`;
    const data = await redisConnection.get(key);

    if (!data) return null;

    try {
        const parsed = JSON.parse(data);
        return parsed.files;
    } catch {
        return null;
    }
}

/**
 * Force flush a specific attempt to database
 * Call this before final submission
 */
export async function flushToDatabase(attemptId: string): Promise<boolean> {
    const key = `${AUTOSAVE_KEY_PREFIX}${attemptId}`;
    const data = await redisConnection.get(key);

    if (!data) {
        console.log(`💾 No buffered data for attempt ${attemptId}`);
        return false;
    }

    try {
        const parsed = JSON.parse(data);

        // Update database
        await db.update(examAttempts)
            .set({ files: parsed.files })
            .where(eq(examAttempts.id, attemptId));

        // Remove from dirty set
        await redisConnection.srem(AUTOSAVE_DIRTY_SET, attemptId);

        // Keep the buffer (in case of retries) but mark as clean
        console.log(`💾 Flushed autosave to DB for attempt ${attemptId}`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to flush autosave for ${attemptId}:`, error);
        return false;
    }
}

/**
 * Flush all dirty autosaves to database
 * Called periodically by background job
 */
export async function flushAllDirty(): Promise<number> {
    const dirtyAttempts = await redisConnection.smembers(AUTOSAVE_DIRTY_SET);

    if (dirtyAttempts.length === 0) {
        return 0;
    }

    console.log(`💾 Flushing ${dirtyAttempts.length} dirty autosaves...`);

    let flushed = 0;

    for (const attemptId of dirtyAttempts) {
        const success = await flushToDatabase(attemptId);
        if (success) flushed++;
    }

    console.log(`💾 Flushed ${flushed}/${dirtyAttempts.length} autosaves`);
    return flushed;
}

/**
 * Clear buffer for an attempt (after submission)
 */
export async function clearBuffer(attemptId: string): Promise<void> {
    const key = `${AUTOSAVE_KEY_PREFIX}${attemptId}`;
    await redisConnection.del(key);
    await redisConnection.srem(AUTOSAVE_DIRTY_SET, attemptId);
    console.log(`💾 Buffer cleared for attempt ${attemptId}`);
}

/**
 * Start background flush job
 */
export function startBackgroundFlush(): void {
    if (flushInterval) {
        console.log('💾 Background flush already running');
        return;
    }

    flushInterval = setInterval(async () => {
        try {
            await flushAllDirty();
        } catch (error) {
            console.error('❌ Background flush error:', error);
        }
    }, FLUSH_INTERVAL);

    console.log(`💾 Background flush started (every ${FLUSH_INTERVAL / 1000}s)`);
}

/**
 * Stop background flush job
 */
export function stopBackgroundFlush(): void {
    if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
        console.log('💾 Background flush stopped');
    }
}

/**
 * Get buffer statistics
 * 
 * Uses SCAN instead of KEYS to avoid blocking Redis under load.
 * KEYS is O(n) and blocks the entire Redis server.
 * SCAN is iterative and non-blocking.
 */
export async function getBufferStats(): Promise<{
    bufferedCount: number;
    dirtyCount: number;
}> {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const allKeys: string[] = [];
    let cursor = '0';
    do {
        const [nextCursor, keys] = await redisConnection.scan(
            cursor,
            'MATCH',
            `${AUTOSAVE_KEY_PREFIX}*`,
            'COUNT',
            '100'
        );
        cursor = nextCursor;
        allKeys.push(...keys);
    } while (cursor !== '0');

    const dirtyCount = await redisConnection.scard(AUTOSAVE_DIRTY_SET);

    // Filter out the dirty set key itself
    const bufferedCount = allKeys.filter((k: string) => k !== AUTOSAVE_DIRTY_SET).length;

    return {
        bufferedCount,
        dirtyCount,
    };
}

/**
 * Graceful shutdown - flush all pending saves
 */
export async function gracefulShutdown(): Promise<void> {
    console.log('💾 Flushing all autosaves before shutdown...');
    stopBackgroundFlush();
    await flushAllDirty();
    console.log('💾 Autosave shutdown complete');
}

