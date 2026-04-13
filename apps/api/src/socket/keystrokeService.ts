import { Server, Socket } from 'socket.io';
import { redisConnection } from '../lib/redis.js';

/**
 * Redis key prefixes for keystroke tracking
 */
const REDIS_KEYS = {
    /** List of keystroke batches: keystroke:batch:{attemptId} */
    BATCH: (attemptId: string) => `keystroke:batch:${attemptId}`,
    /** List of typing speed snapshots: keystroke:speed:{attemptId} */
    SPEED: (attemptId: string) => `keystroke:speed:${attemptId}`,
    /** Aggregate stats hash: keystroke:stats:{attemptId} */
    STATS: (attemptId: string) => `keystroke:stats:${attemptId}`,
};

/** TTL for keystroke data (24 hours) */
const KEYSTROKE_TTL = 86400;

/** Max batches to store per attempt (200 × ~2KB avg = ~400KB per attempt) */
const MAX_BATCHES = 200;

/** Max speed snapshots per attempt */
const MAX_SPEED_SNAPSHOTS = 200;

/** Max batch payload size in bytes (~50KB) to prevent abuse */
const MAX_BATCH_PAYLOAD = 50000;

/**
 * Set up keystroke tracking socket handlers
 */
export function setupKeystrokeHandlers(io: Server, socket: Socket) {
    /**
     * Receive a batch of keystrokes from the client
     */
    socket.on('keystroke:batch', async (data: {
        attemptId: string;
        keystrokes: Array<{
            key: string;
            ts: number;
            ctrl?: boolean;
            shift?: boolean;
            alt?: boolean;
            meta?: boolean;
        }>;
        totalKeystrokes: number;
        timestamp: number;
    }, callback) => {
        try {
            const { attemptId, keystrokes, totalKeystrokes, timestamp } = data;

            // Verify this socket owns the attempt
            if (socket.data.attemptId !== attemptId) {
                callback?.({ success: false, error: 'Not authorized' });
                return;
            }

            if (!keystrokes || keystrokes.length === 0) {
                callback?.({ success: true });
                return;
            }

            // Compress: shorten key names to save Redis memory
            // { key, ts, ctrl, shift, alt, meta } → { k, t, c, s, a, m }
            const compressed = keystrokes.map(ks => {
                const entry: Record<string, any> = { k: ks.key, t: ks.ts };
                if (ks.ctrl) entry.c = 1;
                if (ks.shift) entry.s = 1;
                if (ks.alt) entry.a = 1;
                if (ks.meta) entry.m = 1;
                return entry;
            });

            const batchEntry = JSON.stringify({
                ks: compressed,
                total: totalKeystrokes,
                ts: timestamp,
                n: keystrokes.length,
            });

            // Reject oversized payloads
            if (batchEntry.length > MAX_BATCH_PAYLOAD) {
                callback?.({ success: false, error: 'Payload too large' });
                return;
            }

            const redisKey = REDIS_KEYS.BATCH(attemptId);
            const statsKey = REDIS_KEYS.STATS(attemptId);

            const pipeline = redisConnection.pipeline();
            pipeline.rpush(redisKey, batchEntry);
            pipeline.ltrim(redisKey, -MAX_BATCHES, -1); // Keep only last N batches
            pipeline.expire(redisKey, KEYSTROKE_TTL);

            // Update aggregate stats
            pipeline.hincrby(statsKey, 'totalKeystrokes', keystrokes.length);
            pipeline.hset(statsKey, 'lastActivity', timestamp.toString());
            pipeline.expire(statsKey, KEYSTROKE_TTL);

            await pipeline.exec();

            callback?.({ success: true });
        } catch (error) {
            console.error('Error storing keystroke batch:', error);
            callback?.({ success: false });
        }
    });

    /**
     * Receive typing speed snapshot from the client
     */
    socket.on('keystroke:speed', async (data: {
        attemptId: string;
        speed: {
            wpm: number;
            cpm: number;
            interval: number;
            charCount: number;
        };
        totalKeystrokes: number;
        sessionDuration: number;
        timestamp: number;
    }, callback) => {
        try {
            const { attemptId, speed, totalKeystrokes, sessionDuration, timestamp } = data;

            if (socket.data.attemptId !== attemptId) {
                callback?.({ success: false, error: 'Not authorized' });
                return;
            }

            const speedKey = REDIS_KEYS.SPEED(attemptId);
            const statsKey = REDIS_KEYS.STATS(attemptId);

            const speedEntry = JSON.stringify({
                ...speed,
                totalKeystrokes,
                sessionDuration,
                timestamp,
            });

            const pipeline = redisConnection.pipeline();
            pipeline.rpush(speedKey, speedEntry);
            pipeline.ltrim(speedKey, -MAX_SPEED_SNAPSHOTS, -1);
            pipeline.expire(speedKey, KEYSTROKE_TTL);

            // Update aggregate stats
            pipeline.hset(statsKey, 'lastWpm', speed.wpm.toString());
            pipeline.hset(statsKey, 'lastCpm', speed.cpm.toString());
            pipeline.hset(statsKey, 'sessionDuration', sessionDuration.toString());
            pipeline.expire(statsKey, KEYSTROKE_TTL);

            await pipeline.exec();

            // Emit to monitoring admins/reviewers in real-time
            const monitoringExamId = await getExamIdForAttempt(attemptId);
            if (monitoringExamId) {
                io.to(`exam:monitor:${monitoringExamId}`).emit('keystroke:speed:update', {
                    attemptId,
                    speed,
                    totalKeystrokes,
                    sessionDuration,
                    timestamp,
                });
            }

            callback?.({ success: true });
        } catch (error) {
            console.error('Error storing typing speed:', error);
            callback?.({ success: false });
        }
    });
}

/**
 * Get keystroke stats for an attempt (used by API routes)
 */
export async function getKeystrokeStats(attemptId: string) {
    const statsKey = REDIS_KEYS.STATS(attemptId);
    const stats = await redisConnection.hgetall(statsKey);

    if (!stats || Object.keys(stats).length === 0) {
        return null;
    }

    return {
        totalKeystrokes: parseInt(stats.totalKeystrokes || '0'),
        lastWpm: parseInt(stats.lastWpm || '0'),
        lastCpm: parseInt(stats.lastCpm || '0'),
        sessionDuration: parseInt(stats.sessionDuration || '0'),
        lastActivity: parseInt(stats.lastActivity || '0'),
    };
}

/**
 * Get typing speed history for an attempt
 */
export async function getTypingSpeedHistory(attemptId: string) {
    const speedKey = REDIS_KEYS.SPEED(attemptId);
    const entries = await redisConnection.lrange(speedKey, 0, -1);
    return entries.map(e => JSON.parse(e));
}

/**
 * Get raw keystroke batches for an attempt (for detailed analysis)
 */
export async function getKeystrokeBatches(attemptId: string, start = 0, end = -1) {
    const batchKey = REDIS_KEYS.BATCH(attemptId);
    const entries = await redisConnection.lrange(batchKey, start, end);
    return entries.map(e => JSON.parse(e));
}

/**
 * Helper to get examId from an attemptId (cached in socket data or looked up)
 */
async function getExamIdForAttempt(attemptId: string): Promise<string | null> {
    try {
        // Try to get from Redis cache first
        const cached = await redisConnection.get(`attempt:examId:${attemptId}`);
        if (cached) return cached;

        // Will be populated when the socket joins an attempt
        return null;
    } catch {
        return null;
    }
}
