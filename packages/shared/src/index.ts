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

export const createChallengeSchema = z.object({
    name: z.string().min(3, 'Name must be at least 3 characters'),
    description: z.string().optional(),
    starterFiles: z.record(z.string()), // { "src/app.js": "content" }
    publicTests: z.string().min(1, 'Public tests are required'),
    hiddenTests: z.string().min(1, 'Hidden tests are required'),
    dependencies: z.record(z.string()), // { "express": "^4.18.0" }
    nodeVersion: z.string().default('20'),
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
});

export const updateExamSchema = createExamSchema.partial();

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
    pageSize: number;
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

// ============ EXPORT TYPES ============

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type UpdateChallengeInput = z.infer<typeof updateChallengeSchema>;
export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type StartAttemptInput = z.infer<typeof startAttemptSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type ProctorEventInput = z.infer<typeof proctorEventSchema>;
