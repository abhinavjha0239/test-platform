/**
 * 100 Candidate Concurrent Exam Test
 * 
 * Simulates 100 candidates taking the sql-contest-full exam:
 * - Each candidate has 12 SQL questions
 * - Mix of correct, partial, and wrong answers
 * - Tests both "Run Test" and "Submit" flows
 */

import Redis from 'ioredis';
import crypto from 'crypto';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const REDIS_URL = process.env.REDIS_URL || 'redis://3.110.124.250:6379';
const EXAM_ID = process.env.EXAM_ID || ''; // Will be provided
const NUM_CANDIDATES = parseInt(process.env.NUM_CANDIDATES || '100', 10);

// Correct SQL answers for each question
const CORRECT_ANSWERS: Record<string, string> = {
    'q1.sql': `SELECT * FROM users ORDER BY id ASC;`,
    'q2.sql': `SELECT name, email FROM users ORDER BY id ASC;`,
    'q3.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount 
FROM users u 
INNER JOIN orders o ON u.id = o.user_id 
ORDER BY u.id ASC, o.id ASC;`,
    'q4.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
ORDER BY u.id ASC, o.id ASC NULLS LAST;`,
    'q5.sql': `SELECT u.name 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
WHERE o.id IS NULL 
ORDER BY u.id ASC;`,
    'q6.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount 
FROM orders o 
LEFT JOIN users u ON u.id = o.user_id 
ORDER BY o.id ASC;`,
    'q7.sql': `SELECT u.name, SUM(o.amount) AS total_amount 
FROM users u 
INNER JOIN orders o ON u.id = o.user_id 
GROUP BY u.id, u.name 
ORDER BY total_amount DESC, u.id ASC;`,
    'q8.sql': `SELECT u.name 
FROM users u 
INNER JOIN orders o ON u.id = o.user_id 
GROUP BY u.id, u.name 
HAVING SUM(o.amount) > 1000 
ORDER BY u.id ASC;`,
    'q9.sql': `SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name 
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'orders' 
    AND kcu.column_name = 'user_id'
ORDER BY tc.constraint_name ASC;`,
    'q11.sql': `BEGIN;
WITH new_user AS (
    INSERT INTO users (name, email) VALUES ('Raj', 'raj@test.com') RETURNING id, name
),
new_order AS (
    INSERT INTO orders (user_id, amount) SELECT id, 999 FROM new_user RETURNING id, user_id, amount
)
SELECT u.id AS user_id, u.name AS user_name, o.id AS order_id, o.amount 
FROM new_user u JOIN new_order o ON o.user_id = u.id;
COMMIT;`,
    'q12.sql': `BEGIN;
INSERT INTO users (name, email) VALUES ('Temp', 'temp@test.com');
ROLLBACK;
SELECT COUNT(*)::INT AS temp_user_count FROM users WHERE email = 'temp@test.com';`,
    'q13.sql': `BEGIN;
DELETE FROM orders WHERE user_id = 2;
DELETE FROM users WHERE id = 2;
COMMIT;
SELECT 
    (SELECT COUNT(*) FROM users)::INT AS remaining_users, 
    (SELECT COUNT(*) FROM orders)::INT AS remaining_orders;`,
};

// Wrong answers for variation
const WRONG_ANSWERS: Record<string, string> = {
    'q1.sql': `SELECT * FROM users;`, // Missing ORDER BY
    'q2.sql': `SELECT * FROM users;`, // Wrong columns
    'q3.sql': `SELECT * FROM users, orders;`, // Wrong join
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

interface Candidate {
    id: number;
    email: string;
    token: string;
    attemptId: string;
    expectedScore: number; // 0-12
    files: Record<string, string>;
}

const redis = new Redis(REDIS_URL);

// Generate candidate with random score profile
function generateCandidateAnswers(candidateNum: number): { files: Record<string, string>; expectedScore: number } {
    const files: Record<string, string> = {};
    let correctCount = 0;

    // Distribute scores: ~20% full score, ~60% partial, ~20% low score
    let targetCorrect: number;
    const rand = Math.random();
    if (rand < 0.2) {
        targetCorrect = 12; // Full score
    } else if (rand < 0.4) {
        targetCorrect = Math.floor(Math.random() * 3) + 10; // 10-12
    } else if (rand < 0.8) {
        targetCorrect = Math.floor(Math.random() * 5) + 5; // 5-9
    } else {
        targetCorrect = Math.floor(Math.random() * 5); // 0-4
    }

    const questions = Object.keys(CORRECT_ANSWERS);
    const shuffled = [...questions].sort(() => Math.random() - 0.5);

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (correctCount < targetCorrect && shuffled.indexOf(q) < targetCorrect) {
            files[q] = CORRECT_ANSWERS[q];
            correctCount++;
        } else {
            files[q] = WRONG_ANSWERS[q];
        }
    }

    return { files, expectedScore: correctCount };
}

// Create candidate account
async function createCandidate(num: number): Promise<Candidate> {
    const email = `loadtest_${num}_${Date.now()}@test.com`;
    const password = 'Test123!';

    // Register
    const registerRes = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: `Candidate ${num}` }),
    });

    if (!registerRes.ok) {
        // Try login if already exists
        const loginRes = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (!loginRes.ok) {
            throw new Error(`Failed to create/login candidate ${num}`);
        }
        const loginData = await loginRes.json();
        const { files, expectedScore } = generateCandidateAnswers(num);
        return { id: num, email, token: loginData.data.token, attemptId: '', expectedScore, files };
    }

    const data = await registerRes.json();
    const { files, expectedScore } = generateCandidateAnswers(num);
    return { id: num, email, token: data.data.token, attemptId: '', expectedScore, files };
}

// Start exam attempt
async function startExam(candidate: Candidate, examId: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/exams/${examId}/start`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${candidate.token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to start exam for candidate ${candidate.id}: ${text}`);
    }

    const data = await res.json();
    return data.data.attemptId;
}

// Save files
async function saveFiles(candidate: Candidate): Promise<void> {
    const res = await fetch(`${API_URL}/api/attempts/${candidate.attemptId}/files`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${candidate.token}`,
        },
        body: JSON.stringify({ files: candidate.files }),
    });

    if (!res.ok) {
        throw new Error(`Failed to save files for candidate ${candidate.id}`);
    }
}

// Run tests (preview)
async function runTests(candidate: Candidate): Promise<string> {
    const res = await fetch(`${API_URL}/api/attempts/${candidate.attemptId}/run-tests`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${candidate.token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to run tests for candidate ${candidate.id}: ${text}`);
    }

    const data = await res.json();
    return data.data.jobId;
}

// Submit exam
async function submitExam(candidate: Candidate): Promise<string> {
    const res = await fetch(`${API_URL}/api/attempts/${candidate.attemptId}/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${candidate.token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to submit for candidate ${candidate.id}: ${text}`);
    }

    const data = await res.json();
    return data.data.jobId;
}

// Wait for grading to complete
async function waitForGrading(jobIds: string[], timeout: number = 120000): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const startTime = Date.now();

    while (results.size < jobIds.length && Date.now() - startTime < timeout) {
        for (const jobId of jobIds) {
            if (results.has(jobId)) continue;

            const jobData = await redis.hgetall(`grading:job:${jobId}`);
            if (jobData.status === 'completed' || jobData.status === 'failed') {
                results.set(jobId, jobData);
            }
        }

        if (results.size < jobIds.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    return results;
}

// Main test runner
async function runLoadTest() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  100 CANDIDATE CONCURRENT EXAM TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`API: ${API_URL}`);
    console.log(`Redis: ${REDIS_URL}`);
    console.log(`Candidates: ${NUM_CANDIDATES}`);
    console.log('');

    // Get exam ID from command line or find it
    let examId = EXAM_ID;
    if (!examId) {
        console.log('Finding sql-contest-full exam...');
        // We'll need to get this from the API or database
        console.log('Please provide EXAM_ID environment variable');
        console.log('Example: EXAM_ID=your-exam-id npx tsx 100-candidate-exam-test.ts');
        process.exit(1);
    }

    console.log(`Exam ID: ${examId}`);
    console.log('');

    // Phase 1: Create candidates
    console.log('Phase 1: Creating candidates...');
    const candidates: Candidate[] = [];
    const createStart = Date.now();

    const createPromises = [];
    for (let i = 0; i < NUM_CANDIDATES; i++) {
        createPromises.push(createCandidate(i).catch(e => {
            console.log(`  ❌ Candidate ${i}: ${e.message}`);
            return null;
        }));
    }

    const createdCandidates = await Promise.all(createPromises);
    for (const c of createdCandidates) {
        if (c) candidates.push(c);
    }

    console.log(`  ✅ Created ${candidates.length}/${NUM_CANDIDATES} candidates in ${Date.now() - createStart}ms`);
    console.log('');

    // Phase 2: Start exams
    console.log('Phase 2: Starting exams...');
    const startStart = Date.now();

    const startPromises = candidates.map(c =>
        startExam(c, examId).then(attemptId => {
            c.attemptId = attemptId;
        }).catch(e => {
            console.log(`  ❌ Start exam ${c.id}: ${e.message}`);
        })
    );

    await Promise.all(startPromises);
    const startedCandidates = candidates.filter(c => c.attemptId);
    console.log(`  ✅ Started ${startedCandidates.length} exams in ${Date.now() - startStart}ms`);
    console.log('');

    // Phase 3: Save files
    console.log('Phase 3: Saving files (12 SQL answers each)...');
    const saveStart = Date.now();

    await Promise.all(startedCandidates.map(c => saveFiles(c).catch(e => {
        console.log(`  ❌ Save ${c.id}: ${e.message}`);
    })));

    console.log(`  ✅ Saved files in ${Date.now() - saveStart}ms`);
    console.log('');

    // Phase 4: Run tests (concurrent)
    console.log('Phase 4: Running tests (concurrent)...');
    const runStart = Date.now();

    const runJobIds: string[] = [];
    const runPromises = startedCandidates.map(c =>
        runTests(c).then(jobId => {
            runJobIds.push(jobId);
        }).catch(e => {
            console.log(`  ❌ Run tests ${c.id}: ${e.message}`);
        })
    );

    await Promise.all(runPromises);
    console.log(`  ✅ Queued ${runJobIds.length} run-tests jobs in ${Date.now() - runStart}ms`);

    // Wait for run-tests to complete
    console.log('  ⏳ Waiting for grading...');
    const runResults = await waitForGrading(runJobIds, 180000);
    const runCompleted = [...runResults.values()].filter(r => r.status === 'completed').length;
    console.log(`  ✅ Run-tests completed: ${runCompleted}/${runJobIds.length} in ${Date.now() - runStart}ms`);
    console.log('');

    // Phase 5: Submit exams (concurrent)
    console.log('Phase 5: Submitting exams (concurrent)...');
    const submitStart = Date.now();

    const submitJobIds: string[] = [];
    const submitPromises = startedCandidates.map(c =>
        submitExam(c).then(jobId => {
            submitJobIds.push(jobId);
        }).catch(e => {
            console.log(`  ❌ Submit ${c.id}: ${e.message}`);
        })
    );

    await Promise.all(submitPromises);
    console.log(`  ✅ Queued ${submitJobIds.length} submit jobs in ${Date.now() - submitStart}ms`);

    // Wait for submissions to complete
    console.log('  ⏳ Waiting for grading...');
    const submitResults = await waitForGrading(submitJobIds, 180000);
    const submitCompleted = [...submitResults.values()].filter(r => r.status === 'completed').length;
    console.log(`  ✅ Submissions completed: ${submitCompleted}/${submitJobIds.length} in ${Date.now() - submitStart}ms`);
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Total candidates: ${candidates.length}`);
    console.log(`Exams started: ${startedCandidates.length}`);
    console.log(`Run-tests completed: ${runCompleted}`);
    console.log(`Submissions completed: ${submitCompleted}`);
    console.log('');

    // Score distribution
    const scores: number[] = [];
    for (const c of startedCandidates) {
        scores.push(c.expectedScore);
    }
    scores.sort((a, b) => a - b);

    console.log('Expected score distribution:');
    const scoreGroups: Record<string, number> = { '0-3': 0, '4-6': 0, '7-9': 0, '10-12': 0 };
    for (const s of scores) {
        if (s <= 3) scoreGroups['0-3']++;
        else if (s <= 6) scoreGroups['4-6']++;
        else if (s <= 9) scoreGroups['7-9']++;
        else scoreGroups['10-12']++;
    }
    for (const [range, count] of Object.entries(scoreGroups)) {
        console.log(`  ${range}: ${count} candidates`);
    }

    // Get final stats
    const stats = await redis.hgetall('grading:stats');
    console.log('');
    console.log('Redis grading stats:', stats);

    await redis.quit();
    console.log('');
    console.log('✅ Load test completed!');
}

runLoadTest().catch(console.error);
