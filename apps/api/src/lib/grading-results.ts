import { eq } from 'drizzle-orm';
import { examAttempts } from '@exam-platform/database';
import { db } from './db.js';
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
    const updateData: Record<string, unknown> = {
        publicScore: result.publicScore,
        hiddenScore: result.hiddenScore,
        totalPublic: result.totalPublic,
        totalHidden: result.totalHidden,
        gradingLogs: result.logs,
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
}

