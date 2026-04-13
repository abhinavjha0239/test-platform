/**
 * SQL Contest Load Test Script
 * Pushes grading jobs directly to Redis for phased load testing
 * Usage: npx tsx scripts/spot/sql-load-test.ts [phase]
 */

import Redis from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STREAM = 'grading:jobs:high';
const CHALLENGE_ID = 'sql-contest-full';

// Sample SQL solutions (all correct answers)
const SOLUTIONS: Record<string, string> = {
    'q1.sql': 'SELECT * FROM users ORDER BY id ASC;',
    'q2.sql': 'SELECT name, email FROM users ORDER BY id ASC;',
    'q3.sql': 'SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u INNER JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC;',
    'q4.sql': 'SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC NULLS LAST;',
    'q5.sql': 'SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL ORDER BY u.id ASC;',
};

// Challenge runner config
const RUNNER = {
    mode: 'sql' as const,
    runtime: 'postgresql',
    database: {
        setupScript: `
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;
CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) UNIQUE);
CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), amount INT, created_at TIMESTAMP DEFAULT NOW());
INSERT INTO users (name, email) VALUES ('Aman', 'aman@test.com'), ('Riya', 'riya@test.com'), ('Kunal', 'kunal@test.com'), ('Sneha', 'sneha@test.com');
INSERT INTO orders (user_id, amount) VALUES (1, 500), (1, 1500), (2, 700);
        `,
    },
    sqlTests: {
        isolation: 'container',
        timeoutMs: 15000,
    },
    publicTests: [
        {
            name: 'Q1: Fetch all users',
            fileName: 'q1.sql',
            expectedResult: [
                { id: 1, name: 'Aman', email: 'aman@test.com' },
                { id: 2, name: 'Riya', email: 'riya@test.com' },
                { id: 3, name: 'Kunal', email: 'kunal@test.com' },
                { id: 4, name: 'Sneha', email: 'sneha@test.com' },
            ]
        },
    ],
    hiddenTests: [],
};

interface GradingJob {
    attemptId: string;
    candidateId: string;
    challengeId: string;
    code: string;
    files: Record<string, string>;
    runner: typeof RUNNER;
    isSubmit: boolean;
}

async function createJob(redis: Redis, candidateNum: number, phase: string): Promise<string> {
    const attemptId = `load-test-${phase}-${candidateNum}-${Date.now()}`;
    const jobId = `grading_${attemptId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    // Pick random files to submit (1-3 files)
    const fileNames = Object.keys(SOLUTIONS);
    const numFiles = Math.floor(Math.random() * 3) + 1;
    const selectedFiles: Record<string, string> = {};
    for (let i = 0; i < numFiles; i++) {
        const fileName = fileNames[Math.floor(Math.random() * fileNames.length)];
        selectedFiles[fileName] = SOLUTIONS[fileName];
    }

    const job: GradingJob = {
        attemptId,
        candidateId: `load-test-candidate-${candidateNum}`,
        challengeId: CHALLENGE_ID,
        code: selectedFiles['q1.sql'] || 'SELECT 1;',
        files: selectedFiles,
        runner: RUNNER,
        isSubmit: false, // Run test, not submit
    };

    const payload = JSON.stringify(job);
    const createdAt = Date.now();

    await redis.xadd(
        STREAM,
        '*',
        'jobId', jobId,
        'attemptId', attemptId,
        'isPreview', '0',
        'createdAt', String(createdAt),
        'payload', payload
    );

    return jobId;
}

async function runPhase(redis: Redis, count: number, phase: string): Promise<void> {
    console.log(`\n🚀 Phase ${phase}: Submitting ${count} jobs...`);
    const start = Date.now();

    const promises: Promise<string>[] = [];
    for (let i = 0; i < count; i++) {
        promises.push(createJob(redis, i, phase));
    }

    await Promise.all(promises);
    const elapsed = Date.now() - start;
    console.log(`✅ Phase ${phase}: ${count} jobs submitted in ${elapsed}ms`);
}

async function monitorQueue(redis: Redis, expectedCount: number): Promise<void> {
    console.log(`\n📊 Monitoring queue (expecting ${expectedCount} jobs)...`);

    let lastLen = -1;
    for (let i = 0; i < 60; i++) {
        const len = await redis.xlen(STREAM);
        if (len !== lastLen) {
            console.log(`   Queue length: ${len}`);
            lastLen = len;
        }
        if (len === 0) {
            console.log('   Queue is empty - all jobs processed!');
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function main(): Promise<void> {
    const phase = process.argv[2] || 'all';

    console.log('=========================================');
    console.log('  SQL Contest Load Test');
    console.log('=========================================');
    console.log(`Redis: ${REDIS_URL}`);
    console.log(`Challenge: ${CHALLENGE_ID}`);
    console.log(`Phase: ${phase}`);
    console.log('=========================================\n');

    const redis = new Redis(REDIS_URL);

    try {
        // Test Redis connection
        await redis.ping();
        console.log('✅ Redis connected\n');

        const phases: [number, string][] = [
            [10, 'warmup'],
            [25, 'light'],
            [50, 'medium'],
            [100, 'load'],
            [150, 'stress'],
            [300, 'full'],
        ];

        if (phase === 'all') {
            for (const [count, name] of phases) {
                await runPhase(redis, count, name);
                console.log('   Waiting 15s before next phase...');
                await new Promise(r => setTimeout(r, 15000));
                await monitorQueue(redis, count);
            }
        } else {
            const selected = phases.find(p => p[1] === phase);
            if (selected) {
                await runPhase(redis, selected[0], selected[1]);
                await monitorQueue(redis, selected[0]);
            } else {
                const count = parseInt(phase, 10);
                if (!isNaN(count)) {
                    await runPhase(redis, count, 'custom');
                    await monitorQueue(redis, count);
                } else {
                    console.log('Usage: npx tsx sql-load-test.ts [warmup|light|medium|load|stress|full|all|<number>]');
                }
            }
        }

        console.log('\n✅ Load test complete!');
    } finally {
        await redis.quit();
    }
}

main().catch(console.error);
