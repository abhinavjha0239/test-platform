import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { proctorEvents, examAttempts } from '@exam-platform/database';
import { proctorEventSchema } from '@exam-platform/shared';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// POST /api/proctor/event - Log proctor event
router.post('/event', authenticate, async (req, res, next) => {
    try {
        const data = proctorEventSchema.parse(req.body);

        // Verify attempt belongs to user
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, data.attemptId),
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        if (attempt.candidateId !== req.user!.userId) {
            throw new ApiError('Not authorized', 403);
        }

        if (attempt.status !== 'IN_PROGRESS') {
            // Silently ignore events for completed attempts
            return res.json({ success: true });
        }

        // Log the event
        await db.insert(proctorEvents).values({
            attemptId: data.attemptId,
            eventType: data.eventType,
            duration: data.duration,
            pasteLength: data.pasteLength,
            isMultiline: data.isMultiline,
        });

        // Update aggregate counters on attempt
        const updates: Record<string, unknown> = {};

        switch (data.eventType) {
            case 'TAB_LEAVE':
                updates.tabExits = sql`${examAttempts.tabExits} + 1`;
                break;
            case 'TAB_RETURN':
                if (data.duration) {
                    updates.totalOutOfWindowSeconds = sql`${examAttempts.totalOutOfWindowSeconds} + ${data.duration}`;
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
                .where(eq(examAttempts.id, data.attemptId));
        }

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// GET /api/proctor/events/:attemptId - Get all events for an attempt (Admin/Reviewer only)
router.get('/events/:attemptId', authenticate, async (req, res, next) => {
    try {
        if (req.user!.role === 'CANDIDATE') {
            throw new ApiError('Not authorized', 403);
        }

        const events = await db.query.proctorEvents.findMany({
            where: eq(proctorEvents.attemptId, req.params.attemptId),
            orderBy: (events, { asc }) => [asc(events.timestamp)],
        });

        res.json({
            success: true,
            data: events,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
