import { Server } from 'socket.io';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { examAttempts } from '@exam-platform/database';
import { addGradingJob } from '../lib/grading.js';
import { redisConnection } from '../lib/redis.js';
import { flushToDatabase, getFromBuffer } from '../lib/autosave-buffer.js';

/**
 * Redis-backed Timer Service
 * 
 * Stores timer state in Redis for horizontal scaling.
 * Multiple API instances can share timer state.
 */

// Redis key prefixes
const TIMER_KEY_PREFIX = 'timer:';
const TIMER_LOCK_PREFIX = 'timer_lock:';
const TIMER_HANDLED_PREFIX = 'timer_handled:';

// Local interval tracking (for cleanup on this instance)
const localIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Redis-backed handled timers tracking
 * Replaces in-memory Set for cross-instance coordination
 */
async function isTimerHandledRedis(attemptId: string): Promise<boolean> {
    const key = `${TIMER_HANDLED_PREFIX}${attemptId}`;
    const exists = await redisConnection.exists(key);
    return exists === 1;
}

async function markTimerHandledRedis(attemptId: string): Promise<void> {
    const key = `${TIMER_HANDLED_PREFIX}${attemptId}`;
    // TTL of 1 hour - timer handling is temporary state
    await redisConnection.set(key, '1', 'EX', 3600);
}

async function clearTimerHandledRedis(attemptId: string): Promise<void> {
    const key = `${TIMER_HANDLED_PREFIX}${attemptId}`;
    await redisConnection.del(key).catch(() => { });
}

/**
 * Timer metadata stored in Redis
 */
interface TimerMeta {
    attemptId: string;
    startedAt: number;
    endTime: number;
    timeLimit: number; // minutes
    scheduledEndAt?: number; // Epoch timestamp of scheduled exam end (if applicable)
}

/**
 * Start a server-authoritative timer for an attempt
 * Timer state is stored in Redis for distributed access
 * 
 * @param io - Socket.IO server instance
 * @param attemptId - The attempt ID
 * @param startedAt - When the attempt started
 * @param timeLimit - Individual timer limit in minutes
 * @param scheduledEndAt - Optional hard cutoff time (exam window end)
 */
export async function startTimer(
    io: Server,
    attemptId: string,
    startedAt: Date,
    timeLimit: number, // in minutes
    scheduledEndAt?: Date | null // Optional hard cutoff from exam schedule
): Promise<void> {
    // Check if timer was already handled (attempt completed)
    if (await isTimerHandledRedis(attemptId)) {
        console.log(`⏱️ Timer already handled for attempt ${attemptId}, skipping start`);
        return;
    }

    // Check if a local timer already exists - don't create duplicate
    if (localIntervals.has(attemptId)) {
        console.log(`⏱️ Timer already running locally for attempt ${attemptId}, skipping`);
        return;
    }

    // Calculate individual timer end time
    const startTime = new Date(startedAt).getTime();
    const individualEndTime = startTime + timeLimit * 60 * 1000;

    // Use the earlier of: individual timer end OR scheduled exam end
    const scheduledEndTimestamp = scheduledEndAt ? new Date(scheduledEndAt).getTime() : null;
    const endTime = scheduledEndTimestamp
        ? Math.min(individualEndTime, scheduledEndTimestamp)
        : individualEndTime;

    // Check if timer has already expired
    if (endTime <= Date.now()) {
        console.log(`⏱️ Timer already expired for attempt ${attemptId}, handling expiration`);
        await handleTimerExpired(io, attemptId);
        return;
    }

    // Store timer metadata in Redis
    const timerKey = `${TIMER_KEY_PREFIX}${attemptId}`;
    const timerMeta: TimerMeta = {
        attemptId,
        startedAt: startTime,
        endTime,
        timeLimit,
        scheduledEndAt: scheduledEndTimestamp ?? undefined,
    };

    await redisConnection.set(timerKey, JSON.stringify(timerMeta));

    // Set expiry slightly longer than the timer duration
    const remainingSeconds = Math.ceil((endTime - Date.now()) / 1000);
    const ttl = remainingSeconds + 300; // remaining time + 5 min buffer
    await redisConnection.expire(timerKey, ttl);

    // Create local interval to broadcast timer updates
    const timer = setInterval(async () => {
        // Guard: Check if this timer is still valid
        if (!localIntervals.has(attemptId)) {
            return;
        }
        const handled = await isTimerHandledRedis(attemptId);
        if (handled) {
            return;
        }

        const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));

        // Emit to all clients in the attempt room
        io.to(`attempt:${attemptId}`).emit('timer:tick', {
            remaining,
            endTime,
            formattedTime: formatTime(remaining),
            scheduledEndAt: scheduledEndTimestamp, // Include for UI display
        });

        // Auto-submit when time expires
        if (remaining === 0) {
            // Immediately mark as handled to prevent duplicate processing
            await markTimerHandledRedis(attemptId);
            await stopTimer(attemptId);
            await handleTimerExpired(io, attemptId);
        }
    }, 1000);

    localIntervals.set(attemptId, timer);

    const cutoffReason = scheduledEndTimestamp && scheduledEndTimestamp < individualEndTime
        ? ' (limited by scheduled end time)'
        : '';
    const effectiveMinutes = Math.ceil((endTime - Date.now()) / 60000);
    console.log(`⏱️ Timer started for attempt ${attemptId}: ${effectiveMinutes} minutes remaining${cutoffReason} (Redis-backed)`);
}

/**
 * Stop the timer for an attempt
 */
export async function stopTimer(attemptId: string): Promise<void> {
    // Clear local interval first (synchronous)
    const localTimer = localIntervals.get(attemptId);
    if (localTimer) {
        clearInterval(localTimer);
        localIntervals.delete(attemptId);
        console.log(`⏱️ Timer stopped for attempt ${attemptId}`);
    }

    // Remove from Redis (async, but we don't wait for it to prevent race conditions)
    const timerKey = `${TIMER_KEY_PREFIX}${attemptId}`;
    redisConnection.del(timerKey).catch(err => {
        console.error(`Failed to delete timer key from Redis: ${err}`);
    });
}

/**
 * Permanently stop timer and mark as handled (for completed attempts)
 */
export async function stopTimerPermanently(attemptId: string): Promise<void> {
    // Mark as handled so it won't be restarted
    await markTimerHandledRedis(attemptId);

    // Stop the timer
    await stopTimer(attemptId);

    // Also delete any lock keys
    const lockKey = `${TIMER_LOCK_PREFIX}${attemptId}`;
    await redisConnection.del(lockKey).catch(() => { });

    console.log(`⏱️ Timer permanently stopped for attempt ${attemptId}`);
}

/**
 * Get remaining time for an attempt from Redis
 */
export async function getRemainingTime(attemptId: string): Promise<number | null> {
    const timerKey = `${TIMER_KEY_PREFIX}${attemptId}`;
    const timerData = await redisConnection.get(timerKey);

    if (!timerData) return null;

    try {
        const meta: TimerMeta = JSON.parse(timerData);
        return Math.max(0, Math.floor((meta.endTime - Date.now()) / 1000));
    } catch {
        return null;
    }
}

/**
 * Get timer metadata from Redis
 */
export async function getTimerMeta(attemptId: string): Promise<TimerMeta | null> {
    const timerKey = `${TIMER_KEY_PREFIX}${attemptId}`;
    const timerData = await redisConnection.get(timerKey);

    if (!timerData) return null;

    try {
        return JSON.parse(timerData);
    } catch {
        return null;
    }
}

/**
 * Resume a timer for an attempt (when client reconnects)
 */
export async function resumeTimer(
    io: Server,
    attemptId: string
): Promise<boolean> {
    // Check if timer was already handled
    if (await isTimerHandledRedis(attemptId)) {
        console.log(`⏱️ Timer already handled for attempt ${attemptId}, cannot resume`);
        return false;
    }

    // Check if already running locally
    if (localIntervals.has(attemptId)) {
        console.log(`⏱️ Timer already running locally for attempt ${attemptId}`);
        return true;
    }

    const meta = await getTimerMeta(attemptId);

    if (!meta) {
        console.log(`⏱️ No timer found for attempt ${attemptId}`);
        return false;
    }

    const remaining = Math.max(0, Math.floor((meta.endTime - Date.now()) / 1000));

    if (remaining === 0) {
        console.log(`⏱️ Timer already expired for attempt ${attemptId}`);
        await markTimerHandledRedis(attemptId);
        await handleTimerExpired(io, attemptId);
        return false;
    }

    // Start local interval
    const timer = setInterval(async () => {
        // Guard: Check if this timer is still valid
        if (!localIntervals.has(attemptId)) {
            return;
        }
        const handledInResume = await isTimerHandledRedis(attemptId);
        if (handledInResume) {
            return;
        }

        const currentRemaining = Math.max(0, Math.floor((meta.endTime - Date.now()) / 1000));

        io.to(`attempt:${attemptId}`).emit('timer:tick', {
            remaining: currentRemaining,
            endTime: meta.endTime,
            formattedTime: formatTime(currentRemaining),
        });

        if (currentRemaining === 0) {
            await markTimerHandledRedis(attemptId);
            await stopTimer(attemptId);
            await handleTimerExpired(io, attemptId);
        }
    }, 1000);

    localIntervals.set(attemptId, timer);

    console.log(`⏱️ Timer resumed for attempt ${attemptId}: ${remaining}s remaining`);
    return true;
}

/**
 * Handle timer expiration - auto-submit the attempt
 */
async function handleTimerExpired(io: Server, attemptId: string): Promise<void> {
    // Mark as handled immediately to prevent any more processing
    await markTimerHandledRedis(attemptId);

    // Use a Redis lock to ensure only one instance handles expiration
    const lockKey = `${TIMER_LOCK_PREFIX}${attemptId}`;
    const handledKey = `${TIMER_HANDLED_PREFIX}${attemptId}`;

    // Check if already handled by another instance
    const alreadyHandled = await redisConnection.get(handledKey);
    if (alreadyHandled) {
        console.log(`⏱️ Attempt ${attemptId} already handled by another instance`);
        await stopTimer(attemptId);
        return;
    }

    const lockAcquired = await redisConnection.set(lockKey, '1', 'EX', 60, 'NX');

    if (!lockAcquired) {
        console.log(`⏱️ Another instance is handling expiration for ${attemptId}`);
        await stopTimer(attemptId);
        return;
    }

    // Mark as handled in Redis (persists across restarts)
    await redisConnection.set(handledKey, '1', 'EX', 3600); // 1 hour TTL

    console.log(`⏱️ Timer expired for attempt ${attemptId}, auto-submitting...`);

    try {
        // Emit timer expired event
        io.to(`attempt:${attemptId}`).emit('timer:expired', {
            message: 'Time is up! Your exam has been automatically submitted.',
        });

        // Get attempt with files
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, attemptId),
            with: {
                exam: {
                    with: {
                        challenge: true,
                    },
                },
            },
        });

        if (!attempt || attempt.status !== 'IN_PROGRESS') {
            console.log(`Attempt ${attemptId} is not in progress, skipping auto-submit`);
            // Still cleanup the timer
            await stopTimer(attemptId);
            return;
        }

        // SECURITY FIX: Flush Redis autosave buffer before auto-submit
        // This ensures latest candidate edits are not lost
        await flushToDatabase(attemptId);

        // Get latest files from buffer or fallback to DB
        const bufferedFiles = await getFromBuffer(attemptId);
        const filesToGrade = bufferedFiles || attempt.files || {};

        // Update status to SUBMITTED
        await db.update(examAttempts)
            .set({
                status: 'SUBMITTED',
                submittedAt: new Date(),
            })
            .where(eq(examAttempts.id, attemptId));

        // Queue grading job with latest files
        await addGradingJob({
            attemptId,
            files: filesToGrade,
            publicTests: attempt.exam!.challenge!.publicTests,
            hiddenTests: attempt.exam!.challenge!.hiddenTests,
            dependencies: attempt.exam!.challenge!.dependencies as Record<string, string>,
            runner: (attempt.exam!.challenge as any).runner ?? undefined,
            nodeVersion: attempt.exam!.challenge!.nodeVersion,
            timeLimit: 120,
            memoryLimit: 512,
        });

        // Update status to GRADING
        await db.update(examAttempts)
            .set({ status: 'GRADING' })
            .where(eq(examAttempts.id, attemptId));

        console.log(`✅ Attempt ${attemptId} auto-submitted successfully`);
    } catch (error) {
        console.error(`❌ Failed to auto-submit attempt ${attemptId}:`, error);
    } finally {
        // Release lock but keep handled key
        await redisConnection.del(lockKey);
        // Ensure timer is fully stopped
        await stopTimer(attemptId);
    }
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get all active timers count (local instance only)
 */
export function getLocalTimersCount(): number {
    return localIntervals.size;
}

/**
 * Get all active timers count from Redis
 */
export async function getActiveTimersCount(): Promise<number> {
    // Use SCAN instead of KEYS to avoid blocking Redis
    const keys: string[] = [];
    let cursor = '0';
    do {
        const [nextCursor, batch] = await redisConnection.scan(
            cursor,
            'MATCH',
            `${TIMER_KEY_PREFIX}*`,
            'COUNT',
            '100'
        );
        cursor = nextCursor;
        keys.push(...batch);
    } while (cursor !== '0');
    return keys.length;
}

/**
 * Stop all local timers (for graceful shutdown)
 */
export function stopAllLocalTimers(): void {
    for (const [attemptId, timer] of localIntervals) {
        clearInterval(timer);
        console.log(`⏱️ Timer stopped for attempt ${attemptId} (shutdown)`);
    }
    localIntervals.clear();
    // Note: Redis-backed handled timers will expire via TTL
}

/**
 * Clear handled timer status (for cleanup or testing)
 */
export async function clearHandledTimer(attemptId: string): Promise<void> {
    await clearTimerHandledRedis(attemptId);
}

/**
 * Check if a timer has been handled (for debugging)
 */
export async function isTimerHandled(attemptId: string): Promise<boolean> {
    return await isTimerHandledRedis(attemptId);
}
