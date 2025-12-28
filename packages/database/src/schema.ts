import { pgTable, text, timestamp, boolean, integer, real, pgEnum, json } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';

// ============ ENUMS ============

export const roleEnum = pgEnum('role', ['ADMIN', 'CANDIDATE', 'REVIEWER']);
export const attemptStatusEnum = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'GRADING', 'COMPLETED', 'FAILED']);
export const eventTypeEnum = pgEnum('event_type', ['TAB_LEAVE', 'TAB_RETURN', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'PASTE_ATTEMPT']);

// ============ TABLES ============

// Users table
export const users = pgTable('users', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    name: text('name'),
    role: roleEnum('role').default('CANDIDATE').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => users.id),
});

// Exams table - exam configuration
export const exams = pgTable('exams', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    title: text('title').notNull(),
    description: text('description'),
    challengeId: text('challenge_id').references(() => challenges.id).notNull(),

    // Time & Attempts
    timeLimit: integer('time_limit').notNull(), // minutes
    maxAttempts: integer('max_attempts').default(1).notNull(),
    passThreshold: real('pass_threshold').default(0.6).notNull(),

    // Integrity settings
    fullscreenRequired: boolean('fullscreen_required').default(true).notNull(),
    tabSwitchLogging: boolean('tab_switch_logging').default(true).notNull(),
    pasteDisabled: boolean('paste_disabled').default(true).notNull(),

    // Status
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => users.id).notNull(),
});

// Exam invitations
export const examInvitations = pgTable('exam_invitations', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    examId: text('exam_id').references(() => exams.id).notNull(),
    email: text('email').notNull(),
    token: text('token').notNull().unique(), // Unique invite token
    usedAt: timestamp('used_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
});

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
});

// ============ RELATIONS ============

export const usersRelations = relations(users, ({ many }) => ({
    createdExams: many(exams),
    attempts: many(examAttempts),
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
