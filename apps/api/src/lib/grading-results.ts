import { eq } from 'drizzle-orm';
import { examAttempts } from '@exam-platform/database';
import { db } from './db.js';
import { sanitizeLogs, sanitizeError } from './log-sanitizer.js';
import type { GradingResult } from '@exam-platform/shared';

/**
 * Update attempt with grading results
 * @param attemptId - The attempt ID
 * @param result - Grading results
 * @param isPreview - If true (run-tests), don't change status. If false (submit), finalize status.
 */
export async function updateAttemptResults(
    attemptId: string,
    result: GradingResult,
    isPreview: boolean = false
) {
    // Sanitize logs to prevent hidden test code leakage
    const sanitizedLogs = sanitizeLogs(result.logs, isPreview);
    const sanitizedError = result.error ? sanitizeError(result.error) : undefined;

    const updateData: Record<string, unknown> = {
        publicScore: result.publicScore,
        hiddenScore: result.hiddenScore,
        totalPublic: result.totalPublic,
        totalHidden: result.totalHidden,
        gradingLogs: sanitizedLogs,
        gradedAt: new Date(),
    };

    // Only update status on final submission, not on run-tests preview
    if (!isPreview) {
        updateData.status = result.success ? 'COMPLETED' : 'FAILED';
    }

    await db.update(examAttempts)
        .set(updateData)
        .where(eq(examAttempts.id, attemptId));

    const modeLabel = isPreview ? '(preview)' : '(final)';
    console.log(`✅ Attempt ${attemptId} graded ${modeLabel}: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);
    
    // Return sanitized result for WebSocket broadcast
    return {
        ...result,
        logs: sanitizedLogs,
        error: sanitizedError,
    };
}
