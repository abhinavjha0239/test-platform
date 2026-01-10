import { pgTable, text, timestamp, boolean, integer, real, pgEnum, json, index } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';

// ============ ENUMS ============

export const roleEnum = pgEnum('role', ['ADMIN', 'CANDIDATE', 'REVIEWER']);
export const attemptStatusEnum = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'GRADING', 'COMPLETED', 'FAILED']);
export const eventTypeEnum = pgEnum('event_type', ['TAB_LEAVE', 'TAB_RETURN', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'PASTE_ATTEMPT']);
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED']);

// ============ TABLES ============

// Users table
export const users = pgTable('users', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    name: text('name'),
    role: roleEnum('role').default('CANDIDATE').notNull(),
    
    // Approval workflow for admin/reviewer accounts
    approvalStatus: approvalStatusEnum('approval_status').default('APPROVED').notNull(),
    approvedBy: text('approved_by'), // References users.id (self-reference handled in relations)
    approvedAt: timestamp('approved_at'),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    roleIdx: index('users_role_idx').on(table.role),
    approvalStatusIdx: index('users_approval_status_idx').on(table.approvalStatus),
}));

// Challenges table - stores exam problem templates
export const challenges = pgTable('challenges', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: text('name').notNull(),
    description: text('description'),
    starterFiles: json('starter_files').$type<Record<string, string>>().notNull(), // { "src/app.js": "content..." }
    publicTests: text('public_tests').notNull(), // Test file content (visible to candidate)
    hiddenTests: text('hidden_tests').notNull(), // Test file content (server-only)
    dependencies: json('dependencies').$type<Record<string, string>>().notNull(), // { "express": "^4.18.0" }
    nodeVersion: text('node_version').default('20').notNull(),
    // Optional runner config for multi-runtime / black-box grading
    runner: json('runner').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => users.id),
}, (table) => ({
    nameIdx: index('challenges_name_idx').on(table.name),
    createdByIdx: index('challenges_created_by_idx').on(table.createdBy),
}));

// Exams table - exam configuration
export const exams = pgTable('exams', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    title: text('title').notNull(),
    description: text('description'),
    challengeId: text('challenge_id').references(() => challenges.id).notNull(),

    // Time & Attempts
    timeLimit: integer('time_limit').notNull(), // minutes (individual timer duration)
    maxAttempts: integer('max_attempts').default(1).notNull(),
    passThreshold: real('pass_threshold').default(0.6).notNull(),

    // Scheduled Exam Window (optional)
    scheduledStartAt: timestamp('scheduled_start_at'), // When exam opens (stored as UTC)
    scheduledEndAt: timestamp('scheduled_end_at'),     // Hard cutoff - auto-submit all (stored as UTC)
    timezone: text('timezone').default('Asia/Kolkata'), // Display timezone (IST by default)

    // Integrity settings
    fullscreenRequired: boolean('fullscreen_required').default(true).notNull(),
    tabSwitchLogging: boolean('tab_switch_logging').default(true).notNull(),
    pasteDisabled: boolean('paste_disabled').default(true).notNull(),

    // Scaling Configuration
    // Used by container pool to pre-warm appropriate number of containers
    expectedCandidates: integer('expected_candidates').default(100),
    poolWarmedAt: timestamp('pool_warmed_at'), // When containers were last pre-warmed

    // Status
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => users.id).notNull(),
}, (table) => ({
    challengeIdIdx: index('exams_challenge_id_idx').on(table.challengeId),
    createdByIdx: index('exams_created_by_idx').on(table.createdBy),
    isPublishedIdx: index('exams_is_published_idx').on(table.isPublished),
    scheduledEndAtIdx: index('exams_scheduled_end_at_idx').on(table.scheduledEndAt),
}));

// Exam invitations
export const examInvitations = pgTable('exam_invitations', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    examId: text('exam_id').references(() => exams.id).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(), // Unique invite token
    usedAt: timestamp('used_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    tokenIdx: index('exam_invitations_token_idx').on(table.token),
    examIdIdx: index('exam_invitations_exam_id_idx').on(table.examId),
    emailIdx: index('exam_invitations_email_idx').on(table.email),
}));

// Exam Attempts - candidate's exam session
export const examAttempts = pgTable('exam_attempts', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    examId: text('exam_id').references(() => exams.id).notNull(),
    candidateId: text('candidate_id').references(() => users.id).notNull(),

    // Status tracking
    status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at'),

    // Workspace state
    files: json('files').$type<Record<string, string>>(), // Current file contents

    // Grading results
    publicScore: integer('public_score'),
    hiddenScore: integer('hidden_score'),
    totalPublic: integer('total_public'),
    totalHidden: integer('total_hidden'),
    gradingLogs: text('grading_logs'),
    gradedAt: timestamp('graded_at'),

    // Integrity summary (aggregated)
    tabExits: integer('tab_exits').default(0).notNull(),
    totalOutOfWindowSeconds: integer('total_out_of_window_seconds').default(0).notNull(),
    fullscreenExits: integer('fullscreen_exits').default(0).notNull(),
    pasteAttempts: integer('paste_attempts').default(0).notNull(),
}, (table) => ({
    examIdIdx: index('exam_attempts_exam_id_idx').on(table.examId),
    candidateIdIdx: index('exam_attempts_candidate_id_idx').on(table.candidateId),
    statusIdx: index('exam_attempts_status_idx').on(table.status),
    startedAtIdx: index('exam_attempts_started_at_idx').on(table.startedAt),
}));

// Proctor Events - individual proctoring events log
export const proctorEvents = pgTable('proctor_events', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    attemptId: text('attempt_id').references(() => examAttempts.id).notNull(),
    eventType: eventTypeEnum('event_type').notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),

    // Metadata (no clipboard content stored!)
    duration: integer('duration'), // For TAB_LEAVE: how long user was away (seconds)
    pasteLength: integer('paste_length'), // For PASTE_ATTEMPT: length of attempted paste
    isMultiline: boolean('is_multiline'), // For PASTE_ATTEMPT: was it multiline
}, (table) => ({
    attemptIdIdx: index('proctor_events_attempt_id_idx').on(table.attemptId),
    eventTypeIdx: index('proctor_events_event_type_idx').on(table.eventType),
    timestampIdx: index('proctor_events_timestamp_idx').on(table.timestamp),
}));

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ one, many }) => ({
    createdExams: many(exams),
    attempts: many(examAttempts),
    approver: one(users, {
        fields: [users.approvedBy],
        references: [users.id],
    }),
}));

export const challengesRelations = relations(challenges, ({ one, many }) => ({
    creator: one(users, {
        fields: [challenges.createdBy],
        references: [users.id],
    }),
    exams: many(exams),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
    challenge: one(challenges, {
        fields: [exams.challengeId],
        references: [challenges.id],
    }),
    creator: one(users, {
        fields: [exams.createdBy],
        references: [users.id],
    }),
    attempts: many(examAttempts),
    invitations: many(examInvitations),
}));

export const examInvitationsRelations = relations(examInvitations, ({ one }) => ({
    exam: one(exams, {
        fields: [examInvitations.examId],
        references: [exams.id],
    }),
}));

export const examAttemptsRelations = relations(examAttempts, ({ one, many }) => ({
    exam: one(exams, {
        fields: [examAttempts.examId],
        references: [exams.id],
    }),
    candidate: one(users, {
        fields: [examAttempts.candidateId],
        references: [users.id],
    }),
    proctorEvents: many(proctorEvents),
}));

export const proctorEventsRelations = relations(proctorEvents, ({ one }) => ({
    attempt: one(examAttempts, {
        fields: [proctorEvents.attemptId],
        references: [examAttempts.id],
    }),
}));

// ============ TYPES ============

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type Exam = typeof exams.$inferSelect;
export type NewExam = typeof exams.$inferInsert;
export type ExamAttempt = typeof examAttempts.$inferSelect;
export type NewExamAttempt = typeof examAttempts.$inferInsert;
export type ProctorEvent = typeof proctorEvents.$inferSelect;
export type NewProctorEvent = typeof proctorEvents.$inferInsert;
export type ExamInvitation = typeof examInvitations.$inferSelect;
export type NewExamInvitation = typeof examInvitations.$inferInsert;
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
