import { Server, Socket } from 'socket.io';
import { eq, and } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { examAttempts, proctorEvents } from '@exam-platform/database';
import { startTimer, stopTimerPermanently, resumeTimer, isTimerHandled } from './timerService.js';
import { trackSession, removeSession, updateSessionActivity } from './presenceService.js';
import { logProctorEvent } from './proctorService.js';
import { saveToBuffer, flushToDatabase } from '../lib/autosave-buffer.js';

/**
 * Set up exam-related socket handlers
 */
export function setupExamHandlers(io: Server, socket: Socket) {
    /**
     * Join an exam attempt room
     */
    socket.on('attempt:join', async (attemptId: string, callback) => {
        try {
            // Verify the user owns this attempt
            const attempt = await db.query.examAttempts.findFirst({
                where: and(
                    eq(examAttempts.id, attemptId),
                    eq(examAttempts.candidateId, socket.user.userId)
                ),
                with: {
                    exam: true,
                },
            });

            if (!attempt) {
                callback?.({ success: false, error: 'Attempt not found or access denied' });
                return;
            }

            if (attempt.status !== 'IN_PROGRESS') {
                callback?.({ success: false, error: 'Attempt is not in progress' });
                return;
            }

            // Check for existing sessions (presence)
            const canJoin = await trackSession(attemptId, socket.id, socket.user.userId);
            
            if (!canJoin) {
                callback?.({ 
                    success: false, 
                    error: 'Another session is already active for this exam. Please close other tabs.' 
                });
                return;
            }

            // Join the attempt room
            const roomName = `attempt:${attemptId}`;
            socket.join(roomName);
            console.log(`[DEBUG] Socket ${socket.id} joined room=${roomName} for user=${socket.user.email}`);
            
            // Store attempt ID on socket for cleanup
            socket.data.attemptId = attemptId;

            // Start the server-side timer (will skip if already running or handled)
            // Pass scheduled end time so timer respects exam window cutoff
            await startTimer(
                io, 
                attemptId, 
                attempt.startedAt, 
                attempt.exam!.timeLimit,
                attempt.exam!.scheduledEndAt // May be null if not scheduled
            );

            console.log(`📝 User ${socket.user.email} joined attempt ${attemptId}`);
            
            callback?.({ 
                success: true, 
                data: {
                    attemptId,
                    files: attempt.files,
                    startedAt: attempt.startedAt,
                    timeLimit: attempt.exam!.timeLimit,
                    scheduledStartAt: attempt.exam!.scheduledStartAt,
                    scheduledEndAt: attempt.exam!.scheduledEndAt,
                    timezone: attempt.exam!.timezone,
                }
            });
        } catch (error) {
            console.error('Error joining attempt:', error);
            callback?.({ success: false, error: 'Failed to join attempt' });
        }
    });

    /**
     * Save code files (Redis-buffered for performance)
     */
    socket.on('code:save', async (data: { attemptId: string; files: Record<string, string> }, callback) => {
        try {
            const { attemptId, files } = data;

            // Quick validation - verify this socket owns the attempt
            if (socket.data.attemptId !== attemptId) {
                callback?.({ success: false, error: 'Cannot save to this attempt' });
                return;
            }

            // Save to Redis buffer (fast, non-blocking)
            // Database will be updated periodically by background job
            await saveToBuffer(attemptId, files);
            
            // Update session activity (heartbeat)
            await updateSessionActivity(attemptId, socket.id);

            callback?.({ success: true, savedAt: Date.now() });
        } catch (error) {
            console.error('Error saving files:', error);
            callback?.({ success: false, error: 'Failed to save files' });
        }
    });

    /**
     * Force flush autosave to database (before submit)
     */
    socket.on('code:flush', async (data: { attemptId: string }, callback) => {
        try {
            const { attemptId } = data;

            if (socket.data.attemptId !== attemptId) {
                callback?.({ success: false, error: 'Cannot flush this attempt' });
                return;
            }

            await flushToDatabase(attemptId);
            callback?.({ success: true });
        } catch (error) {
            console.error('Error flushing files:', error);
            callback?.({ success: false, error: 'Failed to flush files' });
        }
    });

    /**
     * Log proctor event
     */
    socket.on('proctor:event', async (data: {
        attemptId: string;
        eventType: string;
        duration?: number;
        pasteLength?: number;
        isMultiline?: boolean;
    }, callback) => {
        try {
            await logProctorEvent(io, socket, data);
            callback?.({ success: true });
        } catch (error) {
            console.error('Error logging proctor event:', error);
            callback?.({ success: false });
        }
    });

    /**
     * Leave exam attempt room
     */
    socket.on('attempt:leave', async (attemptId: string) => {
        socket.leave(`attempt:${attemptId}`);
        removeSession(attemptId, socket.id);
        delete socket.data.attemptId;
        
        console.log(`📝 User ${socket.user.email} left attempt ${attemptId}`);
    });

    /**
     * Reviewer/Admin: Join exam monitoring room for real-time proctoring
     */
    socket.on('exam:monitor:join', async (examId: string, callback) => {
        try {
            // Only allow ADMIN and REVIEWER roles
            if (!['ADMIN', 'REVIEWER'].includes(socket.user.role)) {
                callback?.({ success: false, error: 'Access denied' });
                return;
            }

            const roomName = `exam:monitor:${examId}`;
            socket.join(roomName);
            socket.data.monitoringExamId = examId;

            console.log(`👁️ ${socket.user.role} ${socket.user.email} started monitoring exam ${examId}`);
            callback?.({ success: true, examId });
        } catch (error) {
            console.error('Error joining monitor room:', error);
            callback?.({ success: false, error: 'Failed to join monitoring' });
        }
    });

    /**
     * Reviewer/Admin: Leave exam monitoring room
     */
    socket.on('exam:monitor:leave', async (examId: string) => {
        socket.leave(`exam:monitor:${examId}`);
        delete socket.data.monitoringExamId;
        console.log(`👁️ ${socket.user.email} stopped monitoring exam ${examId}`);
    });

    /**
     * Handle socket disconnect - clean up sessions
     */
    socket.on('disconnect', () => {
        const attemptId = socket.data.attemptId;
        if (attemptId) {
            removeSession(attemptId, socket.id);
            
            // Log disconnection as a proctor event
            logProctorEvent(io, socket, {
                attemptId,
                eventType: 'TAB_LEAVE',
            }).catch(console.error);
        }
    });
}

