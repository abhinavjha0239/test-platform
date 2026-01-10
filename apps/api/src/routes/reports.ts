import { Router } from 'express';
import { eq, count, avg, sql } from 'drizzle-orm';
import { examAttempts, exams, users } from '@exam-platform/database';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/reports/exam/:examId - Get exam report with all attempts
router.get('/exam/:examId', authenticate, requireRole('ADMIN', 'REVIEWER'), async (req, res, next) => {
    try {
        const exam = await db.query.exams.findFirst({
            where: eq(exams.id, req.params.examId),
            with: {
                challenge: { columns: { name: true } },
            },
        });

        if (!exam) {
            throw new ApiError('Exam not found', 404);
        }

        // Get all attempts for this exam
        const attempts = await db.query.examAttempts.findMany({
            where: eq(examAttempts.examId, req.params.examId),
            with: {
                candidate: {
                    columns: { id: true, email: true, name: true },
                },
            },
            orderBy: (attempts, { desc }) => [desc(attempts.submittedAt)],
        });

        // Calculate statistics
        const completedAttempts = attempts.filter(a => a.status === 'COMPLETED');
        const passedAttempts = completedAttempts.filter(a => {
            if (a.totalPublic === null || a.totalHidden === null) return false;
            const totalTests = (a.totalPublic || 0) + (a.totalHidden || 0);
            const passedTests = (a.publicScore || 0) + (a.hiddenScore || 0);
            return totalTests > 0 && (passedTests / totalTests) >= exam.passThreshold;
        });

        // FIX: Return numbers instead of % strings to match API type expectations
        const passRateNum = completedAttempts.length > 0
            ? passedAttempts.length / completedAttempts.length * 100
            : null;
        const averageScoreNum = completedAttempts.length > 0
            ? completedAttempts.reduce((sum, a) => {
                const total = (a.totalPublic || 0) + (a.totalHidden || 0);
                const passed = (a.publicScore || 0) + (a.hiddenScore || 0);
                return sum + (total > 0 ? passed / total * 100 : 0);
            }, 0) / completedAttempts.length
            : null;
            
        const stats = {
            totalAttempts: attempts.length,
            completedAttempts: completedAttempts.length,
            passedAttempts: passedAttempts.length,
            passRate: passRateNum !== null ? Math.round(passRateNum * 10) / 10 : null,
            averageScore: averageScoreNum !== null ? Math.round(averageScoreNum * 10) / 10 : null,
        };

        // Integrity summary per attempt
        const attemptsWithIntegrity = attempts.map(a => ({
            id: a.id,
            candidate: a.candidate,
            status: a.status,
            startedAt: a.startedAt,
            submittedAt: a.submittedAt,
            score: {
                public: `${a.publicScore || 0}/${a.totalPublic || 0}`,
                hidden: `${a.hiddenScore || 0}/${a.totalHidden || 0}`,
                total: a.totalPublic !== null && a.totalHidden !== null
                    ? `${(a.publicScore || 0) + (a.hiddenScore || 0)}/${(a.totalPublic || 0) + (a.totalHidden || 0)}`
                    : 'Pending',
            },
            integrity: {
                tabExits: a.tabExits,
                outOfWindowSeconds: a.totalOutOfWindowSeconds,
                fullscreenExits: a.fullscreenExits,
                pasteAttempts: a.pasteAttempts,
            },
        }));

        res.json({
            success: true,
            data: {
                exam: {
                    id: exam.id,
                    title: exam.title,
                    challengeName: exam.challenge?.name,
                    timeLimit: exam.timeLimit,
                    passThreshold: exam.passThreshold,
                },
                stats,
                attempts: attemptsWithIntegrity,
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/attempt/:attemptId - Get detailed attempt report
router.get('/attempt/:attemptId', authenticate, requireRole('ADMIN', 'REVIEWER'), async (req, res, next) => {
    try {
        const attempt = await db.query.examAttempts.findFirst({
            where: eq(examAttempts.id, req.params.attemptId),
            with: {
                candidate: {
                    columns: { id: true, email: true, name: true },
                },
                exam: {
                    with: {
                        challenge: { columns: { name: true } },
                    },
                },
                proctorEvents: {
                    orderBy: (events, { asc }) => [asc(events.timestamp)],
                },
            },
        });

        if (!attempt) {
            throw new ApiError('Attempt not found', 404);
        }

        // Calculate time spent
        const timeSpent = attempt.submittedAt && attempt.startedAt
            ? Math.round((new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000 / 60)
            : null;

        res.json({
            success: true,
            data: {
                id: attempt.id,
                candidate: attempt.candidate,
                exam: {
                    id: attempt.exam?.id,
                    title: attempt.exam?.title,
                    challengeName: attempt.exam?.challenge?.name,
                },
                status: attempt.status,
                startedAt: attempt.startedAt,
                submittedAt: attempt.submittedAt,
                timeSpentMinutes: timeSpent,
                score: {
                    public: attempt.publicScore,
                    hidden: attempt.hiddenScore,
                    totalPublic: attempt.totalPublic,
                    totalHidden: attempt.totalHidden,
                },
                gradingLogs: attempt.gradingLogs,
                integrity: {
                    tabExits: attempt.tabExits,
                    outOfWindowSeconds: attempt.totalOutOfWindowSeconds,
                    fullscreenExits: attempt.fullscreenExits,
                    pasteAttempts: attempt.pasteAttempts,
                },
                proctorEvents: attempt.proctorEvents,
                files: attempt.files,
            },
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/reports/dashboard - Admin dashboard stats
router.get('/dashboard', authenticate, requireRole('ADMIN'), async (req, res, next) => {
    try {
        // Count totals
        const [examCount] = await db.select({ count: count() }).from(exams);
        const [attemptCount] = await db.select({ count: count() }).from(examAttempts);
        const [candidateCount] = await db.select({ count: count() }).from(users).where(eq(users.role, 'CANDIDATE'));

        // Recent attempts
        const recentAttempts = await db.query.examAttempts.findMany({
            with: {
                candidate: { columns: { email: true, name: true } },
                exam: { columns: { title: true } },
            },
            orderBy: (attempts, { desc }) => [desc(attempts.startedAt)],
            limit: 10,
        });

        res.json({
            success: true,
            data: {
                stats: {
                    totalExams: examCount.count,
                    totalAttempts: attemptCount.count,
                    totalCandidates: candidateCount.count,
                },
                recentAttempts: recentAttempts.map(a => ({
                    id: a.id,
                    candidateName: a.candidate?.name || a.candidate?.email,
                    examTitle: a.exam?.title,
                    status: a.status,
                    startedAt: a.startedAt,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
