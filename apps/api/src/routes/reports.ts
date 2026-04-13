import { Router } from 'express';
import { eq, count, avg, sql, and, or, ilike, desc, asc } from 'drizzle-orm';
import { examAttempts, exams, users } from '@exam-platform/database';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/reports/attempts - List ALL attempts with pagination, search, filters
router.get('/attempts', authenticate, requireRole('ADMIN', 'REVIEWER'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string)?.trim() || '';
        const status = req.query.status as string || '';
        const examId = req.query.examId as string || '';
        const sortBy = (req.query.sortBy as string) || 'startedAt';
        const order = (req.query.order as string) === 'asc' ? 'asc' : 'desc';

        // Build where conditions
        const conditions: any[] = [];

        if (status && ['IN_PROGRESS', 'SUBMITTED', 'GRADING', 'COMPLETED', 'FAILED'].includes(status)) {
            conditions.push(eq(examAttempts.status, status as any));
        }

        if (examId) {
            conditions.push(eq(examAttempts.examId, examId));
        }

        // Get all attempts with joins first, then filter by search
        const allAttempts = await db.query.examAttempts.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: {
                candidate: { columns: { id: true, email: true, name: true } },
                exam: {
                    columns: { id: true, title: true },
                    with: { challenge: { columns: { name: true } } },
                },
            },
            orderBy: (attempts, { desc: d, asc: a }) => {
                const dir = order === 'asc' ? a : d;
                switch (sortBy) {
                    case 'status': return [dir(attempts.status)];
                    case 'submittedAt': return [dir(attempts.submittedAt)];
                    default: return [dir(attempts.startedAt)];
                }
            },
        });

        // Apply search filter (on candidate name/email, exam title)
        let filtered = allAttempts;
        if (search) {
            const lower = search.toLowerCase();
            filtered = allAttempts.filter(a =>
                (a.candidate?.name || '').toLowerCase().includes(lower) ||
                (a.candidate?.email || '').toLowerCase().includes(lower) ||
                (a.exam?.title || '').toLowerCase().includes(lower)
            );
        }

        const total = filtered.length;
        const paginated = filtered.slice(offset, offset + limit);

        const items = paginated.map(a => {
            const totalTests = (a.totalPublic || 0) + (a.totalHidden || 0);
            const passedTests = (a.publicScore || 0) + (a.hiddenScore || 0);
            const percentage = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : null;

            return {
                id: a.id,
                candidate: {
                    id: a.candidate?.id,
                    name: a.candidate?.name || null,
                    email: a.candidate?.email || '',
                },
                exam: {
                    id: a.exam?.id,
                    title: a.exam?.title || '',
                    challengeName: a.exam?.challenge?.name || null,
                },
                status: a.status,
                startedAt: a.startedAt,
                submittedAt: a.submittedAt,
                score: {
                    public: a.publicScore,
                    hidden: a.hiddenScore,
                    totalPublic: a.totalPublic,
                    totalHidden: a.totalHidden,
                    percentage,
                },
                integrity: {
                    tabExits: a.tabExits,
                    fullscreenExits: a.fullscreenExits,
                    pasteAttempts: a.pasteAttempts,
                    outOfWindowSeconds: a.totalOutOfWindowSeconds,
                    flags: a.tabExits + a.fullscreenExits + a.pasteAttempts,
                },
            };
        });

        res.json({
            success: true,
            data: items,
            total,
            page,
            limit,
        });
    } catch (error) {
        next(error);
    }
});

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
            ? (passedAttempts.length / completedAttempts.length) * 100
            : null;
        const averageScoreNum = completedAttempts.length > 0
            ? completedAttempts.reduce((sum, a) => {
                const total = (a.totalPublic || 0) + (a.totalHidden || 0);
                const passed = (a.publicScore || 0) + (a.hiddenScore || 0);
                return sum + (total > 0 ? (passed / total) * 100 : 0);
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

// GET /api/reports/dashboard - Admin/Reviewer dashboard stats
router.get('/dashboard', authenticate, requireRole('ADMIN', 'REVIEWER'), async (req, res, next) => {
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

// GET /api/reports/analytics - Aggregated exam analytics
router.get('/analytics', authenticate, requireRole('ADMIN', 'REVIEWER'), async (req, res, next) => {
    try {
        const examId = req.query.examId as string || '';

        // Fetch all relevant attempts
        const conditions: any[] = [];
        if (examId) {
            conditions.push(eq(examAttempts.examId, examId));
        }

        const allAttempts = await db.query.examAttempts.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: {
                candidate: { columns: { id: true, name: true, email: true } },
                exam: { columns: { id: true, title: true } },
            },
            orderBy: (a, { desc: d }) => [d(a.startedAt)],
        });

        // Score distribution (0-10, 11-20, ..., 91-100)
        const scoreBuckets = Array(10).fill(0);
        let passCount = 0;
        let failCount = 0;
        let pendingCount = 0;
        const scoredAttempts: Array<{ id: string; name: string; email: string; pct: number; examTitle: string }> = [];

        allAttempts.forEach(a => {
            const totalTests = (a.totalPublic || 0) + (a.totalHidden || 0);
            const passedTests = (a.publicScore || 0) + (a.hiddenScore || 0);

            if (totalTests === 0 || a.status === 'IN_PROGRESS') {
                pendingCount++;
                return;
            }

            const pct = Math.round((passedTests / totalTests) * 100);
            const bucket = Math.min(9, Math.floor(pct / 10));
            scoreBuckets[bucket]++;

            if (pct >= 50) passCount++;
            else failCount++;

            scoredAttempts.push({
                id: a.id,
                name: a.candidate?.name || 'Unnamed',
                email: a.candidate?.email || '',
                pct,
                examTitle: a.exam?.title || '',
            });
        });

        // Daily attempts (last 30 days)
        const dailyCounts: Record<string, number> = {};
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            dailyCounts[d.toISOString().split('T')[0]] = 0;
        }
        allAttempts.forEach(a => {
            const day = new Date(a.startedAt).toISOString().split('T')[0];
            if (day in dailyCounts) dailyCounts[day]++;
        });

        // Top performers
        const topPerformers = scoredAttempts
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 10);

        // Available exams for filter
        const examsList = await db.query.exams.findMany({
            columns: { id: true, title: true },
            orderBy: (e, { desc: d }) => [d(e.createdAt)],
        });

        res.json({
            success: true,
            data: {
                scoreDistribution: scoreBuckets,
                passRate: { pass: passCount, fail: failCount, pending: pendingCount },
                dailyAttempts: Object.entries(dailyCounts).map(([date, count]) => ({ date, count })),
                topPerformers,
                totalAttempts: allAttempts.length,
                exams: examsList,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
