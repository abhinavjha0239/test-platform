/**
 * 30 Candidate SQL Contest Load Test
 * Pushes 30 concurrent grading jobs to Redis and monitors completion
 * 
 * Usage: npx tsx scripts/spot/30-candidate-test.ts
 */

import Redis from 'ioredis';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const STREAM_HIGH = 'grading:jobs:high';
const STATS_KEY = 'grading:stats';
const CANDIDATE_COUNT = parseInt(process.env.CANDIDATE_COUNT || '30', 10);

// SQL Solutions (correct answers)
const SOLUTIONS: Record<string, string> = {
    'q1.sql': 'SELECT * FROM users ORDER BY id ASC;',
    'q2.sql': 'SELECT name, email FROM users ORDER BY id ASC;',
    'q3.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount 
               FROM users u INNER JOIN orders o ON u.id = o.user_id 
               ORDER BY u.id ASC, o.id ASC;`,
    'q4.sql': `SELECT u.name AS user_name, o.id AS order_id, o.amount 
               FROM users u LEFT JOIN orders o ON u.id = o.user_id 
               ORDER BY u.id ASC, o.id ASC NULLS LAST;`,
    'q5.sql': `SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id 
               WHERE o.id IS NULL ORDER BY u.id ASC;`,
};

// SQL Challenge runner configuration
const SQL_RUNNER = {
    mode: 'sql' as const,
    runtime: 'postgresql',
    database: {
        setupScript: `
            DROP TABLE IF EXISTS orders CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
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
        `.trim(),
    },
    sqlTests: {
        isolation: 'container' as const,
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
            ],
        },
        {
            name: 'Q2: Fetch name and email',
            fileName: 'q2.sql',
            expectedResult: [
                { name: 'Aman', email: 'aman@test.com' },
                { name: 'Riya', email: 'riya@test.com' },
                { name: 'Kunal', email: 'kunal@test.com' },
                { name: 'Sneha', email: 'sneha@test.com' },
            ],
        },
    ],
    hiddenTests: [],
};

interface GradingStats {
    queued: number;
    active: number;
    completed: number;
    failed: number;
    retrying: number;
}

interface TestResults {
    submitted: number;
    completed: number;
    failed: number;
    duration: number;
    throughput: number;
}

async function getStats(redis: Redis): Promise<GradingStats> {
    const raw = await redis.hgetall(STATS_KEY);
    return {
        queued: parseInt(raw.queued || '0', 10),
        active: parseInt(raw.active || '0', 10),
        completed: parseInt(raw.completed || '0', 10),
        failed: parseInt(raw.failed || '0', 10),
        retrying: parseInt(raw.retrying || '0', 10),
    };
}

async function getQueueLen(redis: Redis): Promise<number> {
    return await redis.xlen(STREAM_HIGH);
}

async function createJob(redis: Redis, candidateNum: number, phase: string): Promise<string> {
    const attemptId = `load-test-${phase}-${candidateNum}-${Date.now()}`;
    const jobId = `grading_${attemptId}_${crypto.randomUUID().slice(0, 8)}`;
    const createdAt = Date.now();

    // Pick random files (1-3)
    const fileNames = Object.keys(SOLUTIONS);
    const numFiles = Math.floor(Math.random() * 3) + 1;
    const selectedFiles: Record<string, string> = {};
    
    for (let i = 0; i < numFiles; i++) {
        const fileName = fileNames[Math.floor(Math.random() * fileNames.length)];
        selectedFiles[fileName] = SOLUTIONS[fileName];
    }

    const job = {
        attemptId,
        candidateId: `load-test-candidate-${candidateNum}`,
        challengeId: 'sql-contest-30-test',
        code: selectedFiles['q1.sql'] || SOLUTIONS['q1.sql'],
        files: selectedFiles,
        runner: SQL_RUNNER,
        isSubmit: false,
        isPreview: false,
    };

    await redis.xadd(
        STREAM_HIGH,
        '*',
        'jobId', jobId,
        'attemptId', attemptId,
        'isPreview', '0',
        'createdAt', String(createdAt),
        'payload', JSON.stringify(job)
    );

    return jobId;
}

async function submitJobs(redis: Redis, count: number, phase: string): Promise<string[]> {
    console.log(`\n🚀 Submitting ${count} jobs (phase: ${phase})...`);
    const start = Date.now();
    
    const promises = Array.from({ length: count }, (_, i) => 
        createJob(redis, i + 1, phase)
    );
    
    const jobIds = await Promise.all(promises);
    const elapsed = Date.now() - start;
    
    console.log(`✅ ${count} jobs submitted in ${elapsed}ms`);
    return jobIds;
}

async function waitForCompletion(redis: Redis, expectedDelta: number, timeoutMs: number = 180000): Promise<void> {
    console.log(`\n📊 Monitoring progress (timeout: ${timeoutMs / 1000}s)...`);
    
    const startStats = await getStats(redis);
    const startCompleted = startStats.completed + startStats.failed;
    const start = Date.now();
    
    let lastPrint = 0;
    let stableCount = 0;
    let lastCompleted = startCompleted;
    
    while (true) {
        const elapsed = Date.now() - start;
        const stats = await getStats(redis);
        const queueLen = await getQueueLen(redis);
        const totalDone = stats.completed + stats.failed;
        const delta = totalDone - startCompleted;
        
        // Print status every second
        if (Date.now() - lastPrint >= 1000) {
            const throughput = delta > 0 ? (delta / (elapsed / 1000)).toFixed(2) : '0';
            process.stdout.write(
                `\r[${Math.floor(elapsed / 1000)}s] Queue: ${queueLen} | Active: ${stats.active} | Done: ${delta}/${expectedDelta} | Rate: ${throughput}/s    `
            );
            lastPrint = Date.now();
        }
        
        // Check stability
        if (totalDone === lastCompleted && queueLen === 0 && stats.active === 0) {
            stableCount++;
            if (stableCount >= 5) {
                console.log('\n✅ Queue stable - all jobs processed');
                break;
            }
        } else {
            stableCount = 0;
            lastCompleted = totalDone;
        }
        
        // Timeout
        if (elapsed >= timeoutMs) {
            console.log('\n⚠️ Timeout reached');
            break;
        }
        
        await new Promise(r => setTimeout(r, 200));
    }
}

async function printResults(redis: Redis, startStats: GradingStats, startTime: number): Promise<TestResults> {
    const endStats = await getStats(redis);
    const duration = (Date.now() - startTime) / 1000;
    
    const completed = endStats.completed - startStats.completed;
    const failed = endStats.failed - startStats.failed;
    const throughput = completed / duration;
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════');
    console.log('               TEST RESULTS');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Total Jobs:      ${CANDIDATE_COUNT}`);
    console.log(`  Completed:       ${completed}`);
    console.log(`  Failed:          ${failed}`);
    console.log(`  Duration:        ${duration.toFixed(2)}s`);
    console.log(`  Throughput:      ${throughput.toFixed(2)} jobs/sec`);
    console.log(`  Success Rate:    ${((completed / (completed + failed)) * 100).toFixed(1)}%`);
    console.log('═══════════════════════════════════════════════');
    
    // Check DLQ
    const dlqLen = await redis.xlen('grading:jobs:dlq');
    if (dlqLen > 0) {
        console.log(`\n⚠️ ${dlqLen} jobs in Dead Letter Queue`);
        console.log('View with: redis-cli XRANGE grading:jobs:dlq - + COUNT 5');
    }
    
    return {
        submitted: CANDIDATE_COUNT,
        completed,
        failed,
        duration,
        throughput,
    };
}

async function main(): Promise<void> {
    console.log('═══════════════════════════════════════════════');
    console.log('       30 CANDIDATE SQL GRADER LOAD TEST');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Redis:       ${REDIS_URL}`);
    console.log(`  Candidates:  ${CANDIDATE_COUNT}`);
    console.log(`  Challenge:   SQL Contest`);
    console.log('═══════════════════════════════════════════════');
    
    const redis = new Redis(REDIS_URL);
    
    try {
        // Test connection
        await redis.ping();
        console.log('\n✅ Redis connected');
        
        // Get baseline stats
        const startStats = await getStats(redis);
        console.log(`\n📈 Baseline stats:`);
        console.log(`   Completed: ${startStats.completed}, Failed: ${startStats.failed}`);
        
        // Phase 1: Warmup (5 jobs)
        const warmupStart = Date.now();
        console.log('\n─── PHASE 1: WARMUP (5 jobs) ───');
        await submitJobs(redis, 5, 'warmup');
        await waitForCompletion(redis, 5, 30000);
        
        // Small pause
        console.log('\nPausing 3s before main test...');
        await new Promise(r => setTimeout(r, 3000));
        
        // Phase 2: Main test (30 jobs)
        const mainStart = Date.now();
        const mainStartStats = await getStats(redis);
        console.log('\n─── PHASE 2: MAIN TEST (30 jobs) ───');
        await submitJobs(redis, CANDIDATE_COUNT, 'main');
        await waitForCompletion(redis, CANDIDATE_COUNT, 180000);
        
        // Print results
        await printResults(redis, mainStartStats, mainStart);
        
        console.log('\n✅ Load test complete!\n');
        
    } finally {
        await redis.quit();
    }
}

main().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
