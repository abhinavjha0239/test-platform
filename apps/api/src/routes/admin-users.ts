import { Router } from 'express';
import { eq, and, or, count, desc, asc, like } from 'drizzle-orm';
import { users } from '@exam-platform/database';
import { db } from '../lib/db.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';

const router = Router();

// All routes require admin authentication
router.use(authenticate);

/**
 * GET /api/admin/users - List all users with filtering
 */
router.get('/', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
        const offset = (page - 1) * limit;
        const search = (req.query.search as string) || '';
        const status = req.query.status as string; // PENDING, APPROVED, REJECTED
        const role = req.query.role as string; // ADMIN, CANDIDATE, REVIEWER

        // Build where conditions
        const conditions = [];
        
        if (search) {
            conditions.push(
                or(
                    like(users.email, `%${search}%`),
                    like(users.name, `%${search}%`)
                )
            );
        }
        
        if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            conditions.push(eq(users.approvalStatus, status as 'PENDING' | 'APPROVED' | 'REJECTED'));
        }
        
        if (role && ['ADMIN', 'CANDIDATE', 'REVIEWER'].includes(role)) {
            conditions.push(eq(users.role, role as 'ADMIN' | 'CANDIDATE' | 'REVIEWER'));
        }

        const whereClause = conditions.length > 0 
            ? conditions.length === 1 ? conditions[0] : and(...conditions)
            : undefined;

        const [items, countResult] = await Promise.all([
            db.query.users.findMany({
                where: whereClause,
                columns: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    approvalStatus: true,
                    createdAt: true,
                    approvedAt: true,
                },
                with: {
                    approver: {
                        columns: { id: true, email: true, name: true },
                    },
                },
                orderBy: desc(users.createdAt),
                limit,
                offset,
            }),
            db.select({ count: count() }).from(users).where(whereClause),
        ]);

        res.json({
            success: true,
            data: items,
            total: countResult[0].count,
            page,
            limit,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/users/pending - List pending approval requests
 */
router.get('/pending', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const pendingUsers = await db.query.users.findMany({
            where: and(
                eq(users.approvalStatus, 'PENDING'),
                or(
                    eq(users.role, 'ADMIN'),
                    eq(users.role, 'REVIEWER')
                )
            ),
            columns: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
            },
            orderBy: asc(users.createdAt), // Oldest first
        });

        res.json({
            success: true,
            data: pendingUsers,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/admin/users/:id/approve - Approve a user account
 */
router.post('/:id/approve', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const userId = req.params.id;
        
        // Can't approve yourself
        if (userId === req.user!.userId) {
            throw new ApiError('Cannot approve your own account', 400);
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            throw new ApiError('User not found', 404);
        }

        if (user.approvalStatus === 'APPROVED') {
            throw new ApiError('User is already approved', 400);
        }

        const [updated] = await db.update(users)
            .set({
                approvalStatus: 'APPROVED',
                approvedBy: req.user!.userId,
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId))
            .returning();

        res.json({
            success: true,
            data: {
                id: updated.id,
                email: updated.email,
                name: updated.name,
                role: updated.role,
                approvalStatus: updated.approvalStatus,
            },
            message: 'User approved successfully',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/admin/users/:id/reject - Reject a user account
 */
router.post('/:id/reject', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const userId = req.params.id;
        
        // Can't reject yourself
        if (userId === req.user!.userId) {
            throw new ApiError('Cannot reject your own account', 400);
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            throw new ApiError('User not found', 404);
        }

        if (user.approvalStatus === 'REJECTED') {
            throw new ApiError('User is already rejected', 400);
        }

        const [updated] = await db.update(users)
            .set({
                approvalStatus: 'REJECTED',
                approvedBy: req.user!.userId, // Tracks who rejected
                approvedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId))
            .returning();

        res.json({
            success: true,
            data: {
                id: updated.id,
                email: updated.email,
                name: updated.name,
                role: updated.role,
                approvalStatus: updated.approvalStatus,
            },
            message: 'User rejected',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/admin/users/:id/role - Change user role
 */
router.put('/:id/role', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const userId = req.params.id;
        const { role } = req.body;

        if (!role || !['ADMIN', 'CANDIDATE', 'REVIEWER'].includes(role)) {
            throw new ApiError('Invalid role', 400);
        }

        // Can't change your own role
        if (userId === req.user!.userId) {
            throw new ApiError('Cannot change your own role', 400);
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) {
            throw new ApiError('User not found', 404);
        }

        // If changing to admin/reviewer, require approval
        const needsApproval = (role === 'ADMIN' || role === 'REVIEWER') && user.role === 'CANDIDATE';

        const [updated] = await db.update(users)
            .set({
                role,
                approvalStatus: needsApproval ? 'PENDING' : user.approvalStatus,
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId))
            .returning();

        res.json({
            success: true,
            data: {
                id: updated.id,
                email: updated.email,
                name: updated.name,
                role: updated.role,
                approvalStatus: updated.approvalStatus,
            },
            message: 'User role updated',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/admin/users/stats - Get user statistics
 */
router.get('/stats', requireRole('ADMIN'), async (req, res, next) => {
    try {
        const [
            totalCount,
            adminCount,
            reviewerCount,
            candidateCount,
            pendingCount,
        ] = await Promise.all([
            db.select({ count: count() }).from(users),
            db.select({ count: count() }).from(users).where(eq(users.role, 'ADMIN')),
            db.select({ count: count() }).from(users).where(eq(users.role, 'REVIEWER')),
            db.select({ count: count() }).from(users).where(eq(users.role, 'CANDIDATE')),
            db.select({ count: count() }).from(users).where(eq(users.approvalStatus, 'PENDING')),
        ]);

        res.json({
            success: true,
            data: {
                total: totalCount[0].count,
                admins: adminCount[0].count,
                reviewers: reviewerCount[0].count,
                candidates: candidateCount[0].count,
                pendingApproval: pendingCount[0].count,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;


