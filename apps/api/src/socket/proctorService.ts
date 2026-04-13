import { Server, Socket } from 'socket.io';
import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { examAttempts, proctorEvents } from '@exam-platform/database';
import { redisPublisher, REDIS_CHANNELS } from '../lib/redis.js';

/**
 * Proctor event data structure
 */
interface ProctorEventData {
    attemptId: string;
    eventType: string;
    duration?: number;
    pasteLength?: number;
    isMultiline?: boolean;
}

/**
 * Warning messages for different event types
 */
const WARNING_MESSAGES: Record<string, string> = {
    TAB_LEAVE: 'Tab switching detected. This activity is being recorded.',
    TAB_RETURN: '', // No warning on return
    FULLSCREEN_EXIT: 'Fullscreen mode exited. Please return to fullscreen to continue.',
    FULLSCREEN_ENTER: '', // No warning on enter
    PASTE_ATTEMPT: 'Paste blocked. Please write your own code.',
};

/**
 * Log a proctoring event and send real-time alerts
 */
export async function logProctorEvent(
    io: Server,
    socket: Socket,
    data: ProctorEventData
): Promise<void> {
    const { attemptId, eventType, duration, pasteLength, isMultiline } = data;

    // Verify the attempt belongs to the user
    const attempt = await db.query.examAttempts.findFirst({
        where: eq(examAttempts.id, attemptId),
    });

    if (!attempt) {
        console.error(`Attempt ${attemptId} not found for proctor event`);
        return;
    }

    if (attempt.candidateId !== socket.user.userId) {
        console.error(`User ${socket.user.userId} not authorized for attempt ${attemptId}`);
        return;
    }

    if (attempt.status !== 'IN_PROGRESS') {
        // Silently ignore events for completed attempts
        return;
    }

    // Validate duration - max 24 hours (86400 seconds) to prevent timestamp bugs
    const validatedDuration = duration ? Math.min(Math.max(0, duration), 86400) : undefined;

    // Insert the proctor event
    await db.insert(proctorEvents).values({
        attemptId,
        eventType: eventType as 'TAB_LEAVE' | 'TAB_RETURN' | 'FULLSCREEN_EXIT' | 'FULLSCREEN_ENTER' | 'PASTE_ATTEMPT',
        duration: validatedDuration,
        pasteLength,
        isMultiline,
    });

    // Update aggregate counters on the attempt
    await updateIntegrityCounters(attemptId, eventType, validatedDuration);

    // Get current violation count for this event type
    const violationCount = await getViolationCount(attemptId, eventType);

    // Send real-time warning to the candidate
    const warningMessage = WARNING_MESSAGES[eventType];
    if (warningMessage) {
        io.to(`attempt:${attemptId}`).emit('proctor:warning', {
            type: eventType,
            message: warningMessage,
            count: violationCount,
            severity: getSeverity(eventType, violationCount),
        });
    }

    // Publish to Redis for any other services that need to know
    await redisPublisher.publish(
        REDIS_CHANNELS.PROCTOR_EVENT,
        JSON.stringify({
            attemptId,
            eventType,
            count: violationCount,
            timestamp: Date.now(),
        })
    );

    console.log(`🔍 Proctor event: ${eventType} for attempt ${attemptId} (count: ${violationCount})`);
}

/**
 * Update the aggregate integrity counters on the attempt
 */
async function updateIntegrityCounters(
    attemptId: string,
    eventType: string,
    duration?: number
): Promise<void> {
    const updates: Record<string, unknown> = {};

    switch (eventType) {
        case 'TAB_LEAVE':
            updates.tabExits = sql`${examAttempts.tabExits} + 1`;
            break;
            
        case 'TAB_RETURN':
            if (duration) {
                updates.totalOutOfWindowSeconds = sql`${examAttempts.totalOutOfWindowSeconds} + ${duration}`;
            }
            break;
            
        case 'FULLSCREEN_EXIT':
            updates.fullscreenExits = sql`${examAttempts.fullscreenExits} + 1`;
            break;
            
        case 'PASTE_ATTEMPT':
            updates.pasteAttempts = sql`${examAttempts.pasteAttempts} + 1`;
            break;
    }

    if (Object.keys(updates).length > 0) {
        await db.update(examAttempts)
            .set(updates)
            .where(eq(examAttempts.id, attemptId));
    }
}

/**
 * Get the count of a specific violation type for an attempt
 */
async function getViolationCount(attemptId: string, eventType: string): Promise<number> {
    const attempt = await db.query.examAttempts.findFirst({
        where: eq(examAttempts.id, attemptId),
        columns: {
            tabExits: true,
            fullscreenExits: true,
            pasteAttempts: true,
        },
    });

    if (!attempt) return 0;

    switch (eventType) {
        case 'TAB_LEAVE':
        case 'TAB_RETURN':
            return attempt.tabExits;
        case 'FULLSCREEN_EXIT':
        case 'FULLSCREEN_ENTER':
            return attempt.fullscreenExits;
        case 'PASTE_ATTEMPT':
            return attempt.pasteAttempts;
        default:
            return 0;
    }
}

/**
 * Get severity level based on event type and count
 */
function getSeverity(eventType: string, count: number): 'low' | 'medium' | 'high' {
    // Paste attempts are always high severity
    if (eventType === 'PASTE_ATTEMPT') {
        return 'high';
    }

    // Severity increases with count
    if (count >= 5) return 'high';
    if (count >= 3) return 'medium';
    return 'low';
}

/**
 * Get integrity summary for an attempt
 */
export async function getIntegritySummary(attemptId: string) {
    const attempt = await db.query.examAttempts.findFirst({
        where: eq(examAttempts.id, attemptId),
        columns: {
            tabExits: true,
            totalOutOfWindowSeconds: true,
            fullscreenExits: true,
            pasteAttempts: true,
        },
    });

    if (!attempt) return null;

    const totalViolations = 
        attempt.tabExits + 
        attempt.fullscreenExits + 
        attempt.pasteAttempts;

    return {
        tabExits: attempt.tabExits,
        totalOutOfWindowSeconds: attempt.totalOutOfWindowSeconds,
        fullscreenExits: attempt.fullscreenExits,
        pasteAttempts: attempt.pasteAttempts,
        totalViolations,
        integrityScore: calculateIntegrityScore(attempt),
    };
}

/**
 * Calculate an integrity score (0-100) based on violations
 */
function calculateIntegrityScore(attempt: {
    tabExits: number;
    fullscreenExits: number;
    pasteAttempts: number;
    totalOutOfWindowSeconds: number;
}): number {
    let score = 100;

    // Deduct points for each violation type
    score -= attempt.tabExits * 5; // -5 per tab exit
    score -= attempt.fullscreenExits * 10; // -10 per fullscreen exit
    score -= attempt.pasteAttempts * 15; // -15 per paste attempt
    score -= Math.floor(attempt.totalOutOfWindowSeconds / 30) * 2; // -2 per 30s away

    return Math.max(0, score);
}


