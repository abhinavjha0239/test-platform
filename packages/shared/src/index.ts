import { z } from 'zod';

// ============ AUTH SCHEMAS ============

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    role: z.enum(['ADMIN', 'CANDIDATE', 'REVIEWER']).optional(),
});

// ============ CHALLENGE SCHEMAS ============

/**
 * Challenge Runner Configuration (optional)
 *
 * This enables multi-runtime grading with strong hidden-test secrecy:
 * - mode=jest: legacy in-process Jest runner (imports candidate code)
 * - mode=http: two-container black-box grading over HTTP (language-agnostic)
 * - mode=playwright: two-container E2E browser grading (React/UI)
 *
 * Backwards compatibility:
 * - If runner is omitted, the platform behaves as legacy Node/Jest using
 *   `dependencies` + `nodeVersion` + (publicTests/hiddenTests).
 */
export const challengeRunnerSchema = z.discriminatedUnion('mode', [
    // Legacy: Jest imports candidate code (not fully secret for hidden tests)
    z.object({
        mode: z.literal('jest'),
    }),

    // Secure: Candidate runs as a server in container A, tests run in container B via HTTP
    z.object({
        mode: z.literal('http'),
        /**
         * Runtime label for the candidate container.
         *
         * NOTE: This is primarily used for UX/presets and minor grader conveniences
f         * (e.g. auto-generating package.json for runtime="node"). The HTTP blackbox
         * runner can grade ANY language/framework that exposes HTTP as long as the
         * candidate container starts a server and binds to PORT.
         *
         * Examples: "node", "python", "go", "rust", "java", "dotnet", "php", ...
         */
        runtime: z.string().min(1),
        candidate: z.object({
            image: z.string().min(1),
            workdir: z.string().default('/app'),
            /**
             * Files written by the grader (candidate cannot override these).
             * Useful for language runtimes that need lockfiles/manifest files
             * without allowing candidates to modify dependencies (e.g. requirements.txt).
             */
            generatedFiles: z.record(z.string()).optional(),
            installCommand: z.string().optional(), // executed before runCommand
            runCommand: z.string().min(1),
            port: z.number().int().min(1).max(65535).default(3000),
            healthPath: z.string().default('/'),
            env: z.record(z.string()).optional(),
            startupTimeoutMs: z.number().int().min(1000).max(120000).default(20000),
        }),
        tests: z.object({
            framework: z.literal('jest'),
            image: z.string().optional(), // default chosen by grader
            installCommand: z.string().optional(), // executed before testCommand
            testCommand: z.string().optional(), // default chosen by grader
            env: z.record(z.string()).optional(),
            timeoutMs: z.number().int().min(1000).max(300000).default(120000),
        }),
    }),

    // Secure: Candidate runs as a web app in container A, tests run in container B via Playwright
    z.object({
        mode: z.literal('playwright'),
        runtime: z.literal('react'),
        candidate: z.object({
            image: z.string().min(1),
            workdir: z.string().default('/app'),
            generatedFiles: z.record(z.string()).optional(),
            installCommand: z.string().optional(),
            runCommand: z.string().min(1),
            port: z.number().int().min(1).max(65535).default(3000),
            healthPath: z.string().default('/'),
            env: z.record(z.string()).optional(),
            startupTimeoutMs: z.number().int().min(1000).max(180000).default(30000),
        }),
        tests: z.object({
            framework: z.literal('playwright'),
            image: z.string().optional(), // default chosen by grader
            installCommand: z.string().optional(),
            testCommand: z.string().optional(), // default chosen by grader
            env: z.record(z.string()).optional(),
            timeoutMs: z.number().int().min(1000).max(600000).default(180000),
        }),
    }),

    // Secure: Candidate runs a jsdom harness server in container A, tests run in container B via Vitest
    // Intended for fast UI/unit-style checks without a full browser.
    z.object({
        mode: z.literal('ui_jsdom'),
        runtime: z.literal('react'),
        candidate: z.object({
            image: z.string().min(1),
            workdir: z.string().default('/app'),
            generatedFiles: z.record(z.string()).optional(),
            installCommand: z.string().optional(),
            runCommand: z.string().min(1),
            port: z.number().int().min(1).max(65535).default(3000),
            healthPath: z.string().default('/health'),
            env: z.record(z.string()).optional(),
            startupTimeoutMs: z.number().int().min(1000).max(180000).default(30000),
        }),
        tests: z.object({
            framework: z.literal('vitest'),
            image: z.string().optional(),
            installCommand: z.string().optional(),
            testCommand: z.string().optional(),
            env: z.record(z.string()).optional(),
            timeoutMs: z.number().int().min(1000).max(300000).default(180000),
        }),
    }),
]);

export type ChallengeRunner = z.infer<typeof challengeRunnerSchema>;

export const createChallengeSchema = z.object({
    name: z.string().min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    starterFiles: z.record(z.string()), // { "src/app.js": "content" }
    publicTests: z.string().min(1, 'Public tests are required'),
    hiddenTests: z.string().min(1, 'Hidden tests are required'),
    dependencies: z.record(z.string()), // { "express": "^4.18.0" }
    nodeVersion: z.string().default('20'),
    runner: challengeRunnerSchema.optional(),
});

export const updateChallengeSchema = createChallengeSchema.partial();

// ============ EXAM SCHEMAS ============

export const createExamSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters'),
    description: z.string().optional(),
    challengeId: z.string().min(1, 'Challenge ID is required'),
    timeLimit: z.number().min(5, 'Minimum 5 minutes').max(480, 'Maximum 8 hours'),
    maxAttempts: z.number().min(1).max(10).default(1),
    passThreshold: z.number().min(0).max(1).default(0.6),
    fullscreenRequired: z.boolean().default(true),
    tabSwitchLogging: z.boolean().default(true),
    pasteDisabled: z.boolean().default(true),
    // Scaling Configuration - expected number of candidates for container pool sizing
    expectedCandidates: z.number().int().min(1).max(10000).default(100),
    // Scheduled exam window (optional - if not set, exam is always available when published)
    // Transform strings to Date objects for database storage
    scheduledStartAt: z.string().optional().nullable().transform(val => {
        if (!val) return null;
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date;
    }),
    scheduledEndAt: z.string().optional().nullable().transform(val => {
        if (!val) return null;
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date;
    }),
    timezone: z.string().default('Asia/Kolkata'),
}).refine(
    (data) => {
        // If both dates are provided, end must be after start
        if (data.scheduledStartAt && data.scheduledEndAt) {
            return new Date(data.scheduledEndAt) > new Date(data.scheduledStartAt);
        }
        return true;
    },
    { message: 'End time must be after start time', path: ['scheduledEndAt'] }
);

export const updateExamSchema = z.object({
    title: z.string().min(3, 'Title must be at least 3 characters').optional(),
    description: z.string().optional(),
    challengeId: z.string().min(1, 'Challenge ID is required').optional(),
    timeLimit: z.number().min(5, 'Minimum 5 minutes').max(480, 'Maximum 8 hours').optional(),
    maxAttempts: z.number().min(1).max(10).optional(),
    passThreshold: z.number().min(0).max(1).optional(),
    fullscreenRequired: z.boolean().optional(),
    tabSwitchLogging: z.boolean().optional(),
    pasteDisabled: z.boolean().optional(),
    // Scaling Configuration - expected number of candidates for container pool sizing
    expectedCandidates: z.number().int().min(1).max(10000).optional(),
    scheduledStartAt: z.string().optional().nullable().transform(val => {
        if (!val) return null;
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date;
    }),
    scheduledEndAt: z.string().optional().nullable().transform(val => {
        if (!val) return null;
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date;
    }),
    timezone: z.string().optional(),
}).refine(
    (data) => {
        if (data.scheduledStartAt && data.scheduledEndAt) {
            return new Date(data.scheduledEndAt) > new Date(data.scheduledStartAt);
        }
        return true;
    },
    { message: 'End time must be after start time', path: ['scheduledEndAt'] }
);

// ============ INVITATION SCHEMAS ============

export const createInvitationSchema = z.object({
    email: z.string().email('Invalid email address'),
    expiresIn: z.number().min(1).max(720).optional(), // Hours, max 30 days
});

// ============ ATTEMPT SCHEMAS ============

export const startAttemptSchema = z.object({
    examId: z.string().min(1, 'Exam ID is required'),
});

export const submitAttemptSchema = z.object({
    files: z.record(z.string()), // { "src/app.js": "updated content" }
});

export const saveFilesSchema = z.object({
    files: z.record(z.string()),
});

// ============ PROCTOR EVENT SCHEMAS ============

export const proctorEventSchema = z.object({
    attemptId: z.string().min(1),
    eventType: z.enum(['TAB_LEAVE', 'TAB_RETURN', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'PASTE_ATTEMPT']),
    duration: z.number().optional(),
    pasteLength: z.number().optional(),
    isMultiline: z.boolean().optional(),
});

// ============ USER APPROVAL SCHEMAS ============

export const approveUserSchema = z.object({
    userId: z.string().min(1),
});

export const changeRoleSchema = z.object({
    role: z.enum(['ADMIN', 'CANDIDATE', 'REVIEWER']),
});

// ============ PAGINATION SCHEMAS ============

export const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
});

// ============ RESPONSE TYPES ============

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    total: number;
    page: number;
    limit: number;
}

// ============ AUTH TYPES ============

export interface JwtPayload {
    userId: string;
    email: string;
    role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER';
}

export interface AuthTokens {
    accessToken: string;
    refreshToken?: string;
}

export interface User {
    id: string;
    email: string;
    name: string | null;
    role: 'ADMIN' | 'CANDIDATE' | 'REVIEWER';
    approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

// ============ CHALLENGE TYPES ============

export interface Challenge {
    id: string;
    name: string;
    description: string | null;
    starterFiles: Record<string, string>;
    publicTests: string;
    hiddenTests: string;
    dependencies: Record<string, string>;
    nodeVersion: string;
    runner?: ChallengeRunner | null;
    createdAt: string;
}

// ============ EXAM TYPES ============

export interface Exam {
    id: string;
    title: string;
    description: string | null;
    challengeId: string;
    timeLimit: number;
    maxAttempts: number;
    passThreshold: number;
    // Scheduled exam window
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    timezone: string;
    // Integrity settings
    fullscreenRequired: boolean;
    tabSwitchLogging: boolean;
    pasteDisabled: boolean;
    // Scaling configuration
    expectedCandidates: number;
    poolWarmedAt: string | null;
    // Status
    isPublished: boolean;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    challenge?: Challenge;
}

export interface ExamInvitation {
    id: string;
    examId: string;
    email: string;
    token: string;
    usedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
    exam?: Exam;
}

// ============ ATTEMPT TYPES ============

export interface ExamAttempt {
    id: string;
    examId: string;
    candidateId: string;
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADING' | 'COMPLETED' | 'FAILED';
    startedAt: string;
    submittedAt: string | null;
    files: Record<string, string> | null;
    publicScore: number | null;
    hiddenScore: number | null;
    totalPublic: number | null;
    totalHidden: number | null;
    gradingLogs: string | null;
    gradedAt: string | null;
    tabExits: number;
    totalOutOfWindowSeconds: number;
    fullscreenExits: number;
    pasteAttempts: number;
    exam?: Exam;
    candidate?: User;
}

// ============ PROCTOR TYPES ============

export interface ProctorEvent {
    id: string;
    attemptId: string;
    eventType: 'TAB_LEAVE' | 'TAB_RETURN' | 'FULLSCREEN_EXIT' | 'FULLSCREEN_ENTER' | 'PASTE_ATTEMPT';
    timestamp: string;
    duration: number | null;
    pasteLength: number | null;
    isMultiline: boolean | null;
}

// ============ GRADING TYPES ============

export interface GradingJob {
    attemptId: string;
    files: Record<string, string>;
    publicTests: string;
    hiddenTests: string;
    dependencies: Record<string, string>;
    nodeVersion: string;
    timeLimit: number; // seconds
    memoryLimit: number; // MB
    runner?: ChallengeRunner | null;
}

export interface GradingResult {
    publicScore: number;
    hiddenScore: number;
    totalPublic: number;
    totalHidden: number;
    logs: string;
    success: boolean;
    error?: string;
}

export interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}

// ============ EXAM SCHEDULING TYPES ============

export type ExamScheduleStatus =
    | 'not_scheduled'      // No scheduled times set
    | 'before_start'       // Current time is before scheduledStartAt
    | 'in_progress'        // Current time is between start and end
    | 'ended';             // Current time is past scheduledEndAt

export interface ExamScheduleInfo {
    status: ExamScheduleStatus;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    timezone: string;
    msUntilStart?: number;  // Milliseconds until exam starts (if before_start)
    msUntilEnd?: number;    // Milliseconds until exam ends (if in_progress)
}

// ============ SOCKET TYPES ============

export interface TimerTickData {
    remaining: number;
    endTime: number;
    formattedTime: string;
    scheduledEndAt?: number; // Epoch timestamp of scheduled end (if applicable)
}

export interface ProctorWarningData {
    type: string;
    message: string;
    count: number;
    severity: 'low' | 'medium' | 'high';
}

export interface GradingCompleteData {
    result: GradingResult;
    isPreview: boolean;
}

// ============ EXPORT TYPES ============

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type ProctorEventInput = z.infer<typeof proctorEventSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
