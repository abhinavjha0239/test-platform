/**
 * 100 Candidate Direct Load Test
 * 
 * Submits 100 grading jobs directly to Redis (bypassing API)
 * Each job simulates a candidate with 12 SQL questions
 * Mix of correct/wrong answers for realistic score distribution
 */

import Redis from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://3.110.124.250:6379';
const NUM_CANDIDATES = parseInt(process.env.NUM_CANDIDATES || '100', 10);
const CHALLENGE_ID = 'sql-contest-full';

const redis = new Redis(REDIS_URL);

// Correct SQL answers
const CORRECT_ANSWERS: Record<string, string> = {
    'q1.sql': `SELECT * FROM users ORDER BY id ASC;`,
    'q2.sql': `SELECT name, email FROM users ORDER BY id ASC;`,
    'q3.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u INNER JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC;`,
    'q4.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC NULLS LAST;`,
    'q5.sql': `SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL ORDER BY u.id ASC;`,
    'q6.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id ASC;`,
    'q7.sql': `SELECT u.name, SUM(o.amount) AS total_amount FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name ORDER BY total_amount DESC, u.id ASC;`,
    'q8.sql': `SELECT u.name FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING SUM(o.amount) > 1000 ORDER BY u.id ASC;`,
    'q9.sql': `SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'orders' AND kcu.column_name = 'user_id' ORDER BY tc.constraint_name ASC;`,
    'q11.sql': `BEGIN; WITH new_user AS (INSERT INTO users (name, email) VALUES ('Raj', 'raj@test.com') RETURNING id, name), new_order AS (INSERT INTO orders (user_id, amount) SELECT id, 999 FROM new_user RETURNING id, user_id, amount) SELECT u.id AS user_id, u.name AS user_name, o.id AS order_id, o.amount FROM new_user u JOIN new_order o ON o.user_id = u.id; COMMIT;`,
    'q12.sql': `BEGIN; INSERT INTO users (name, email) VALUES ('Temp', 'temp@test.com'); ROLLBACK; SELECT COUNT(*)::INT AS temp_user_count FROM users WHERE email = 'temp@test.com';`,
    'q13.sql': `BEGIN; DELETE FROM orders WHERE user_id = 2; DELETE FROM users WHERE id = 2; COMMIT; SELECT (SELECT COUNT(*) FROM users)::INT AS remaining_users, (SELECT COUNT(*) FROM orders)::INT AS remaining_orders;`,
};

// Wrong answers
const WRONG_ANSWERS: Record<string, string> = {
    'q1.sql': `SELECT * FROM users;`,
    'q2.sql': `SELECT * FROM users;`,
    'q3.sql': `SELECT * FROM users, orders;`,
    'q4.sql': `SELECT * FROM users LEFT JOIN orders ON 1=1;`,
    'q5.sql': `SELECT name FROM users;`,
    'q6.sql': `SELECT * FROM orders;`,
    'q7.sql': `SELECT name, amount FROM users, orders;`,
    'q8.sql': `SELECT name FROM users;`,
    'q9.sql': `SELECT * FROM information_schema.tables;`,
    'q11.sql': `INSERT INTO users (name) VALUES ('Test');`,
    'q12.sql': `SELECT 1;`,
    'q13.sql': `DELETE FROM users;`,
};

// SQL runner config (same as challenge)
const SQL_RUNNER = {
    mode: 'sql' as const,
    runtime: 'postgresql' as const,
    database: {
        setupScript: `
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    amount INT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
    ('Aman', 'aman@test.com'),
    ('Riya', 'riya@test.com'),
    ('Kunal', 'kunal@test.com'),
    ('Sneha', 'sneha@test.com');

INSERT INTO orders (user_id, amount) VALUES
    (1, 500),
    (1, 1500),
    (2, 700);
        `,
    },
    sqlTests: { isolation: 'container', timeoutMs: 15000 },
    publicTests: [
        { name: 'Q1: Fetch all users', fileName: 'q1.sql', expectedResult: [{ id: 1, name: 'Aman', email: 'aman@test.com' }, { id: 2, name: 'Riya', email: 'riya@test.com' }, { id: 3, name: 'Kunal', email: 'kunal@test.com' }, { id: 4, name: 'Sneha', email: 'sneha@test.com' }] },
        { name: 'Q2: Names & Emails', fileName: 'q2.sql', expectedResult: [{ name: 'Aman', email: 'aman@test.com' }, { name: 'Riya', email: 'riya@test.com' }, { name: 'Kunal', email: 'kunal@test.com' }, { name: 'Sneha', email: 'sneha@test.com' }] },
        { name: 'Q3: Users with orders', fileName: 'q3.sql', expectedResult: [{ user_name: 'Aman', order_id: 1, amount: 500 }, { user_name: 'Aman', order_id: 2, amount: 1500 }, { user_name: 'Riya', order_id: 3, amount: 700 }] },
        { name: 'Q4: Users + orders', fileName: 'q4.sql', expectedResult: [{ user_name: 'Aman', order_id: 1, amount: 500 }, { user_name: 'Aman', order_id: 2, amount: 1500 }, { user_name: 'Riya', order_id: 3, amount: 700 }, { user_name: 'Kunal', order_id: null, amount: null }, { user_name: 'Sneha', order_id: null, amount: null }] },
        { name: 'Q5: Users with no orders', fileName: 'q5.sql', expectedResult: [{ name: 'Kunal' }, { name: 'Sneha' }] },
        { name: 'Q6: Orders LEFT JOIN', fileName: 'q6.sql', expectedResult: [{ user_name: 'Aman', order_id: 1, amount: 500 }, { user_name: 'Aman', order_id: 2, amount: 1500 }, { user_name: 'Riya', order_id: 3, amount: 700 }] },
        { name: 'Q7: Total per user', fileName: 'q7.sql', expectedResult: [{ name: 'Aman', total_amount: 2000 }, { name: 'Riya', total_amount: 700 }] },
        { name: 'Q8: High value users', fileName: 'q8.sql', expectedResult: [{ name: 'Aman' }] },
        { name: 'Q9: FK Metadata', fileName: 'q9.sql', expectedResult: [{ constraint_name: 'orders_user_id_fkey', table_name: 'orders', column_name: 'user_id', foreign_table_name: 'users', foreign_column_name: 'id' }] },
        { name: 'Q11: Transaction Insert', fileName: 'q11.sql', expectedResult: [{ user_id: 5, user_name: 'Raj', order_id: 4, amount: 999 }] },
        { name: 'Q12: Transaction Rollback', fileName: 'q12.sql', expectedResult: [{ temp_user_count: 0 }] },
        { name: 'Q13: Safe Delete', fileName: 'q13.sql', expectedResult: [{ remaining_users: 3, remaining_orders: 2 }] },
    ],
    hiddenTests: [], // No hidden tests for preview
};

function generateCandidateFiles(candidateNum: number): { files: Record<string, string>; expectedScore: number } {
    const files: Record<string, string> = {};
    const questions = Object.keys(CORRECT_ANSWERS);

    // Score distribution: 20% full, 40% high, 30% medium, 10% low
    let targetCorrect: number;
    const rand = Math.random();
    if (rand < 0.2) targetCorrect = 12;
    else if (rand < 0.6) targetCorrect = Math.floor(Math.random() * 3) + 9; // 9-11
    else if (rand < 0.9) targetCorrect = Math.floor(Math.random() * 4) + 5; // 5-8
    else targetCorrect = Math.floor(Math.random() * 5); // 0-4

    // Randomly select which questions to answer correctly
    const correctIndices = new Set<number>();
    while (correctIndices.size < targetCorrect) {
        correctIndices.add(Math.floor(Math.random() * questions.length));
    }

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        files[q] = correctIndices.has(i) ? CORRECT_ANSWERS[q] : WRONG_ANSWERS[q];
    }

    return { files, expectedScore: targetCorrect };
}

async function submitJob(candidateNum: number, isPreview: boolean): Promise<{ jobId: string; expectedScore: number }> {
    const { files, expectedScore } = generateCandidateFiles(candidateNum);
    const attemptId = `load-test-${candidateNum}-${Date.now()}`;
    const jobId = `grading_${attemptId}_${crypto.randomUUID().slice(0, 8)}`;
    const stream = isPreview ? 'grading:jobs:low' : 'grading:jobs:high';
    const createdAt = Date.now();

    const payload = JSON.stringify({
        attemptId,
        files,
        publicTests: '',
        hiddenTests: '',
        dependencies: {},
        nodeVersion: '20',
        timeLimit: 60,
        memoryLimit: 512,
        runner: SQL_RUNNER,
        challengeId: CHALLENGE_ID,
        isPreview,
    });

    // Add to Redis stream
    await redis.xadd(stream, '*', 'jobId', jobId, 'attemptId', attemptId, 'isPreview', isPreview ? '1' : '0', 'createdAt', String(createdAt), 'payload', payload);

    // Set job metadata
    await redis.hset(`grading:job:${jobId}`, {
        status: 'queued',
        progress: '0',
        attemptId,
        stream,
        createdAt: String(createdAt),
        updatedAt: String(createdAt),
        attempts: '0',
        isPreview: isPreview ? '1' : '0',
        payload,
        group: 'grading-workers',
    });
    await redis.expire(`grading:job:${jobId}`, 172800);
    await redis.hincrby('grading:stats', 'queued', 1);

    return { jobId, expectedScore };
}

async function waitForJobs(jobIds: string[], timeout: number = 300000): Promise<{ completed: number; failed: number; pending: number }> {
    const startTime = Date.now();
    let completed = 0;
    let failed = 0;
    let lastCompleted = 0;

    while (Date.now() - startTime < timeout) {
        completed = 0;
        failed = 0;

        for (const jobId of jobIds) {
            const status = await redis.hget(`grading:job:${jobId}`, 'status');
            if (status === 'completed') completed++;
            else if (status === 'failed') failed++;
        }

        const pending = jobIds.length - completed - failed;

        if (completed !== lastCompleted) {
            process.stdout.write(`\r  Progress: ${completed}/${jobIds.length} completed, ${failed} failed, ${pending} pending`);
            lastCompleted = completed;
        }

        if (completed + failed >= jobIds.length) break;
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('');
    return { completed, failed, pending: jobIds.length - completed - failed };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  100 CANDIDATE DIRECT REDIS LOAD TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Redis: ${REDIS_URL}`);
    console.log(`Candidates: ${NUM_CANDIDATES}`);
    console.log(`Challenge: ${CHALLENGE_ID}`);
    console.log('');

    // Reset stats
    await redis.del('grading:stats');
    await redis.hset('grading:stats', { queued: '0', active: '0', completed: '0', failed: '0', retrying: '0' });

    // Phase 1: Submit preview jobs (run-tests)
    console.log('Phase 1: Submitting RUN-TESTS jobs (preview)...');
    const previewStart = Date.now();
    const previewJobs: { jobId: string; expectedScore: number }[] = [];

    const previewPromises = [];
    for (let i = 0; i < NUM_CANDIDATES; i++) {
        previewPromises.push(submitJob(i, true).then(j => previewJobs.push(j)));
    }
    await Promise.all(previewPromises);

    console.log(`  ✅ Submitted ${previewJobs.length} preview jobs in ${Date.now() - previewStart}ms`);

    // Wait for preview jobs
    console.log('  ⏳ Waiting for grading...');
    const previewResults = await waitForJobs(previewJobs.map(j => j.jobId), 300000);
    console.log(`  ✅ Preview: ${previewResults.completed} completed, ${previewResults.failed} failed in ${Date.now() - previewStart}ms`);
    console.log('');

    // Phase 2: Submit final jobs (submit with hidden tests)
    console.log('Phase 2: Submitting SUBMIT jobs (final)...');
    const submitStart = Date.now();
    const submitJobs: { jobId: string; expectedScore: number }[] = [];

    const submitPromises = [];
    for (let i = 0; i < NUM_CANDIDATES; i++) {
        submitPromises.push(submitJob(i, false).then(j => submitJobs.push(j)));
    }
    await Promise.all(submitPromises);

    console.log(`  ✅ Submitted ${submitJobs.length} final jobs in ${Date.now() - submitStart}ms`);

    // Wait for submit jobs
    console.log('  ⏳ Waiting for grading...');
    const submitResults = await waitForJobs(submitJobs.map(j => j.jobId), 300000);
    console.log(`  ✅ Submit: ${submitResults.completed} completed, ${submitResults.failed} failed in ${Date.now() - submitStart}ms`);
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');

    // Score distribution
    const expectedScores = previewJobs.map(j => j.expectedScore);
    expectedScores.sort((a, b) => a - b);

    const scoreGroups: Record<string, number> = { '12 (Full)': 0, '9-11': 0, '5-8': 0, '0-4': 0 };
    for (const s of expectedScores) {
        if (s === 12) scoreGroups['12 (Full)']++;
        else if (s >= 9) scoreGroups['9-11']++;
        else if (s >= 5) scoreGroups['5-8']++;
        else scoreGroups['0-4']++;
    }

    console.log('Expected score distribution:');
    for (const [range, count] of Object.entries(scoreGroups)) {
        const bar = '█'.repeat(Math.ceil(count / 5));
        console.log(`  ${range.padEnd(10)}: ${String(count).padStart(3)} ${bar}`);
    }

    console.log('');
    console.log('Timing:');
    console.log(`  Preview phase: ${Date.now() - previewStart}ms total`);
    console.log(`  Submit phase: ${Date.now() - submitStart}ms total`);

    const stats = await redis.hgetall('grading:stats');
    console.log('');
    console.log('Final Redis stats:', stats);

    await redis.quit();
    console.log('');
    console.log('✅ Load test completed!');
}

main().catch(console.error);
