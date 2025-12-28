import type { GradingJob } from '@exam-platform/shared';

// Grading queue stub - In production, use BullMQ with Redis
// For MVP, we'll use a simpler in-memory approach

interface GradingJobWithPreview extends GradingJob {
    isPreview?: boolean;
}

const gradingJobs = new Map<string, { job: GradingJobWithPreview; status: string; result?: unknown }>();

export async function addGradingJob(job: GradingJobWithPreview): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    gradingJobs.set(jobId, { job, status: 'queued' });

    console.log(`[Grading] Job ${jobId} queued for attempt ${job.attemptId}`);

    // In production, this would be:
    // const queue = new Queue('grading', { connection: redisConnection });
    // await queue.add('grade', job);

    // Trigger grading asynchronously
    processGradingJob(jobId).catch(err => {
        console.error('[Grading] Job failed:', err);
    });

    return jobId;
}

export async function getJobStatus(jobId: string) {
    return gradingJobs.get(jobId) || null;
}

async function processGradingJob(jobId: string) {
    const jobData = gradingJobs.get(jobId);
    if (!jobData) return;

    jobData.status = 'processing';
    console.log(`[Grading] Processing job ${jobId}...`);

    try {
        // Use local grader (no Docker required) for development
        // In production, switch to docker-grader for security
        const { runLocalGrader } = await import('./local-grader.js');
        const result = await runLocalGrader(jobData.job);

        console.log(`[Grading] Job ${jobId} completed:`, result);

        jobData.status = 'completed';
        jobData.result = result;

        // Update database with results
        const { updateAttemptResults } = await import('./grading-results.js');
        await updateAttemptResults(jobData.job.attemptId, result, jobData.job.isPreview ?? false);
    } catch (error) {
        console.error('[Grading] Error:', error);
        jobData.status = 'failed';
        jobData.result = { error: String(error) };

        // Still update the attempt with error status
        try {
            const { updateAttemptResults } = await import('./grading-results.js');
            await updateAttemptResults(jobData.job.attemptId, {
                publicScore: 0,
                hiddenScore: 0,
                totalPublic: 0,
                totalHidden: 0,
                logs: `Grading error: ${String(error)}`,
                success: false,
                error: String(error),
            });
        } catch (updateError) {
            console.error('[Grading] Failed to update attempt with error:', updateError);
        }
    }
}

