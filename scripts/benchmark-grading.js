#!/usr/bin/env node
/**
 * Grading Benchmark — measures actual grading throughput
 *
 * Phase 1: Pre-create users and attempts in batches (controlled API load)
 * Phase 2: Submit all attempts at once (burst grading load)
 * Phase 3: Poll all results and measure latency
 *
 * Usage:
 *   node scripts/benchmark-grading.js [BASE_URL] [CONCURRENCY] [TOTAL_JOBS] [MODE]
 *
 * Examples:
 *   node scripts/benchmark-grading.js http://20.207.203.80 500 550 submit
 *   node scripts/benchmark-grading.js http://20.207.203.80 50 50 run-tests
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ============ CONFIG ============
const BASE_URL = process.argv[2] || 'http://20.207.203.80';
const CONCURRENCY = parseInt(process.argv[3] || '5', 10);
const TOTAL_JOBS = parseInt(process.argv[4] || '10', 10);
const MODE = process.argv[5] || 'submit';
const POLL_INTERVAL_MS = 500;
const JOB_TIMEOUT_MS = 300000; // 5 minutes max per job
const BATCH_SIZE = 30; // API batch size for creating attempts

const parsedUrl = new URL(BASE_URL);
const isHttps = parsedUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

// A working react-todo solution that should pass all tests
const WORKING_SOLUTION = {
  'src/TodoList.jsx': `import React, { useState } from 'react';

function TodoList() {
    const [todos, setTodos] = useState([]);
    const [input, setInput] = useState('');
    const [filter, setFilter] = useState('all');

    const addTodo = () => {
        if (!input.trim()) return;
        setTodos([...todos, { text: input.trim(), completed: false }]);
        setInput('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') addTodo();
    };

    const toggleTodo = (index) => {
        const newTodos = [...todos];
        newTodos[index].completed = !newTodos[index].completed;
        setTodos(newTodos);
    };

    const deleteTodo = (index) => {
        setTodos(todos.filter((_, i) => i !== index));
    };

    const filteredTodos = todos.filter(todo => {
        if (filter === 'active') return !todo.completed;
        if (filter === 'completed') return todo.completed;
        return true;
    });

    const remaining = todos.filter(t => !t.completed).length;

    return (
        <div className="todo-app">
            <input
                data-testid="todo-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a todo"
            />
            <button data-testid="add-btn" onClick={addTodo}>Add</button>

            <div>
                <button data-testid="filter-all" onClick={() => setFilter('all')}>All</button>
                <button data-testid="filter-active" onClick={() => setFilter('active')}>Active</button>
                <button data-testid="filter-completed" onClick={() => setFilter('completed')}>Completed</button>
            </div>

            <ul>
                {filteredTodos.map((todo, index) => (
                    <li key={index} data-testid={"todo-item-" + index}>
                        <input
                            type="checkbox"
                            data-testid={"todo-checkbox-" + index}
                            checked={todo.completed}
                            onChange={() => toggleTodo(todos.indexOf(todo))}
                        />
                        <span
                            data-testid={"todo-text-" + index}
                            style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}
                        >
                            {todo.text}
                        </span>
                        <button
                            data-testid={"delete-btn-" + index}
                            onClick={() => deleteTodo(todos.indexOf(todo))}
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>

            <p data-testid="remaining-count">{remaining} remaining</p>
        </div>
    );
}

export default TodoList;
`,
};

// ============ HTTP HELPERS ============
const agent = new http.Agent({ keepAlive: true, maxSockets: 600 });
const httpsAgent = isHttps ? new https.Agent({ keepAlive: true, maxSockets: 600, rejectUnauthorized: false }) : null;

function request(method, path, body = null, headers = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const opts = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            agent: isHttps ? httpsAgent : agent,
            headers: { 'Content-Type': 'application/json', ...headers },
            timeout,
        };

        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

        const req = httpModule.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', (e) => resolve({ status: 0, data: null, error: e.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null, error: 'TIMEOUT' }); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function batchRun(items, batchSize, fn) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        if (i + batchSize < items.length) {
            process.stdout.write(`    ${results.length}/${items.length}...\r`);
        }
    }
    return results;
}

// ============ MAIN ============

async function main() {
    console.log('='.repeat(65));
    console.log('  GRADING BENCHMARK');
    console.log('='.repeat(65));
    console.log(`  Target:       ${BASE_URL}`);
    console.log(`  Concurrency:  ${CONCURRENCY} (submit burst)`);
    console.log(`  Total Jobs:   ${TOTAL_JOBS}`);
    console.log(`  Mode:         ${MODE}`);
    console.log(`  Job Timeout:  ${JOB_TIMEOUT_MS / 1000}s`);
    console.log('='.repeat(65));

    // Step 1: Login as admin
    console.log('\n[1/7] Logging in as admin...');
    const loginRes = await request('POST', '/api/auth/login', { email: 'admin@exam.com', password: 'admin123' });
    const adminToken = loginRes.data?.data?.accessToken || loginRes.data?.data?.token;
    if (!adminToken) {
        console.error('  Login failed:', loginRes.data);
        process.exit(1);
    }
    console.log('  Logged in.');

    // Step 2: Find React Todo exam
    console.log('\n[2/7] Finding React Todo exam...');
    const examsRes = await request('GET', '/api/exams', null, { Authorization: `Bearer ${adminToken}` });
    const exams = examsRes.data?.data || [];
    const exam = exams.find((e) =>
        e.title?.toLowerCase().includes('react todo') ||
        e.title?.toLowerCase().includes('todo list')
    );
    if (!exam) {
        console.error('  No React Todo exam found.');
        process.exit(1);
    }
    console.log(`  Found: "${exam.title}" (${exam.id})`);

    // Step 3: Create test users — one per job (rate limit is per-email, unique emails are fine)
    const numUsers = TOTAL_JOBS;
    console.log(`\n[3/7] Creating ${numUsers} test users (batches of ${BATCH_SIZE})...`);
    const users = [];
    const userItems = Array.from({ length: numUsers }, (_, i) => i);
    const ts = Date.now();
    await batchRun(userItems, BATCH_SIZE, async (i) => {
        const email = `bench_${i}_${ts}@test.com`;
        const password = 'BenchPass123!';
        const regRes = await request('POST', '/api/auth/register', {
            email, password, name: `Bench ${i}`, role: 'CANDIDATE',
        });
        let token = regRes.data?.data?.accessToken || regRes.data?.data?.token;
        if (token) users.push({ email, token });
    });
    console.log(`  Created ${users.length} test users.`);
    if (users.length === 0) {
        console.error('  Failed to create users. Using admin token.');
        users.push({ email: 'admin@exam.com', token: adminToken });
    }

    // Step 4: Pre-create all attempts (batch of BATCH_SIZE)
    console.log(`\n[4/7] Pre-creating ${TOTAL_JOBS} attempts (batches of ${BATCH_SIZE})...`);
    const jobItems = Array.from({ length: TOTAL_JOBS }, (_, i) => i);
    const attempts = [];
    await batchRun(jobItems, BATCH_SIZE, async (i) => {
        const user = users[i % users.length];
        const res = await request('POST', '/api/attempts', { examId: exam.id }, { Authorization: `Bearer ${user.token}` });
        const attempt = res.data?.data;
        if (attempt) {
            attempts.push({ index: i, id: attempt.id, token: user.token });
        } else {
            attempts.push({ index: i, id: null, token: user.token, error: `create failed: ${res.status}` });
        }
    });
    const validAttempts = attempts.filter(a => a.id);
    console.log(`  Created ${validAttempts.length}/${TOTAL_JOBS} attempts.`);

    // Step 5: Save files on all attempts (batch)
    console.log(`\n[5/7] Saving solution files on ${validAttempts.length} attempts...`);
    await batchRun(validAttempts, BATCH_SIZE, async (a) => {
        await request('PUT', `/api/attempts/${a.id}/files`, { files: WORKING_SOLUTION }, { Authorization: `Bearer ${a.token}` });
    });
    console.log(`  Files saved.`);
    await sleep(200); // Let autosave buffer flush

    // Step 6: SUBMIT ALL AT ONCE (this is the burst!)
    console.log(`\n[6/7] SUBMITTING ${validAttempts.length} grading jobs simultaneously...`);

    const submitStart = Date.now();
    const submitResults = [];

    // Submit all at once
    const submitPromises = validAttempts.map(async (a) => {
        const t0 = Date.now();
        let submitRes;
        if (MODE === 'run-tests') {
            submitRes = await request('POST', `/api/attempts/${a.id}/run-tests`, {}, { Authorization: `Bearer ${a.token}` }, 30000);
        } else {
            submitRes = await request('POST', `/api/attempts/${a.id}/submit`, { files: WORKING_SOLUTION }, { Authorization: `Bearer ${a.token}` }, 30000);
        }

        const jobId = submitRes.data?.data?.jobId;
        if (!jobId && submitRes.status !== 200) {
            return { index: a.index, state: 'error', error: `submit failed: ${submitRes.status} ${submitRes.error || ''}`, duration: Date.now() - t0 };
        }

        // Poll for result
        const pollStart = Date.now();
        while (Date.now() - pollStart < JOB_TIMEOUT_MS) {
            const res = await request('GET', `/api/attempts/${a.id}`, null, { Authorization: `Bearer ${a.token}` });
            if (res.status === 200 && res.data?.data) {
                const attempt = res.data.data;
                if (MODE === 'run-tests') {
                    const newGradedAt = attempt.gradedAt || attempt.graded_at;
                    if (newGradedAt) {
                        return {
                            index: a.index, state: 'completed',
                            duration: Date.now() - t0,
                            result: {
                                publicScore: attempt.publicScore ?? attempt.public_score ?? 0,
                                totalPublic: attempt.totalPublic ?? attempt.total_public ?? 0,
                            },
                        };
                    }
                } else {
                    if (attempt.status === 'GRADED' || attempt.status === 'COMPLETED') {
                        return {
                            index: a.index, state: 'completed',
                            duration: Date.now() - t0,
                            result: {
                                publicScore: attempt.publicScore ?? attempt.public_score ?? 0,
                                totalPublic: attempt.totalPublic ?? attempt.total_public ?? 0,
                                hiddenScore: attempt.hiddenScore ?? attempt.hidden_score ?? 0,
                                totalHidden: attempt.totalHidden ?? attempt.total_hidden ?? 0,
                            },
                        };
                    }
                    if (attempt.status === 'FAILED') {
                        return {
                            index: a.index, state: 'failed',
                            duration: Date.now() - t0,
                            result: {
                                publicScore: attempt.publicScore ?? attempt.public_score ?? 0,
                                totalPublic: attempt.totalPublic ?? attempt.total_public ?? 0,
                                hiddenScore: attempt.hiddenScore ?? attempt.hidden_score ?? 0,
                                totalHidden: attempt.totalHidden ?? attempt.total_hidden ?? 0,
                            },
                        };
                    }
                }
            }
            await sleep(POLL_INTERVAL_MS);
        }
        return { index: a.index, state: 'timeout', duration: Date.now() - t0 };
    });

    // Track progress
    let completedCount = 0;
    const trackedPromises = submitPromises.map(p => p.then(result => {
        completedCount++;
        if (completedCount % 50 === 0 || completedCount === validAttempts.length) {
            const elapsed = ((Date.now() - submitStart) / 1000).toFixed(1);
            console.log(`  Progress: ${completedCount}/${validAttempts.length} done (${elapsed}s elapsed)`);
        }
        if (result.state === 'completed' && result.result) {
            const scores = MODE === 'submit'
                ? `public: ${result.result.publicScore}/${result.result.totalPublic}, hidden: ${result.result.hiddenScore}/${result.result.totalHidden}`
                : `public: ${result.result.publicScore}/${result.result.totalPublic}`;
            // Only log individual results for small batches
            if (TOTAL_JOBS <= 50) {
                console.log(`  Job #${result.index + 1}: ${result.state} in ${(result.duration / 1000).toFixed(1)}s — ${scores}`);
            }
        } else if (result.state !== 'completed' && TOTAL_JOBS <= 50) {
            console.log(`  Job #${result.index + 1}: ${result.state} in ${(result.duration / 1000).toFixed(1)}s`);
        }
        return result;
    }));

    const allResults = await Promise.all(trackedPromises);
    const benchDuration = (Date.now() - submitStart) / 1000;

    // Step 7: Report
    console.log(`\n${'='.repeat(65)}`);
    console.log('  BENCHMARK RESULTS');
    console.log('='.repeat(65));

    const completed = allResults.filter((r) => r.state === 'completed');
    const failed = allResults.filter((r) => r.state === 'failed');
    const errors = allResults.filter((r) => r.state === 'error');
    const timeouts = allResults.filter((r) => r.state === 'timeout');
    const setupErrors = attempts.filter(a => !a.id);

    const durations = completed.map((r) => r.duration / 1000);
    durations.sort((a, b) => a - b);

    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p50 = durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const p90 = durations.length > 0 ? durations[Math.floor(durations.length * 0.9)] : 0;
    const p99 = durations.length > 0 ? durations[Math.floor(durations.length * 0.99)] : 0;
    const min = durations.length > 0 ? durations[0] : 0;
    const max = durations.length > 0 ? durations[durations.length - 1] : 0;

    console.log(`\n  Wall-clock Time:  ${benchDuration.toFixed(1)}s (submit → all graded)`);
    console.log(`  Total Jobs:       ${TOTAL_JOBS}`);
    console.log(`  Submitted:        ${validAttempts.length}`);
    console.log(`  Concurrency:      ${CONCURRENCY} simultaneous`);
    console.log(`  Mode:             ${MODE}`);
    console.log(`  Throughput:       ${(completed.length / benchDuration).toFixed(2)} jobs/sec`);
    console.log(`  Jobs/min:         ${((completed.length / benchDuration) * 60).toFixed(1)}`);

    console.log('\n  --- Results ---');
    console.log(`  Completed:      ${completed.length} (${((completed.length / TOTAL_JOBS) * 100).toFixed(1)}%)`);
    console.log(`  Failed:         ${failed.length}`);
    console.log(`  Errors:         ${errors.length}`);
    console.log(`  Timeouts:       ${timeouts.length}`);
    console.log(`  Setup Errors:   ${setupErrors.length}`);

    if (completed.length > 0) {
        console.log('\n  --- Grading Latency (submit → graded) ---');
        console.log(`  Min:    ${min.toFixed(1)}s`);
        console.log(`  Avg:    ${avg.toFixed(1)}s`);
        console.log(`  P50:    ${p50.toFixed(1)}s`);
        console.log(`  P90:    ${p90.toFixed(1)}s`);
        console.log(`  P99:    ${p99.toFixed(1)}s`);
        console.log(`  Max:    ${max.toFixed(1)}s`);
    }

    // Test scores
    const scores = [...completed, ...failed].filter((r) => r.result);
    if (scores.length > 0) {
        console.log('\n  --- Test Scores ---');
        if (MODE === 'submit') {
            const publicPerfect = scores.filter((r) => r.result.publicScore === r.result.totalPublic && r.result.totalPublic > 1).length;
            const hiddenPerfect = scores.filter((r) => r.result.hiddenScore === r.result.totalHidden && r.result.totalHidden > 1).length;
            const zeroScore = scores.filter((r) => r.result.publicScore === 0 && r.result.hiddenScore === 0).length;
            console.log(`  Public perfect (3/3):  ${publicPerfect}/${scores.length}`);
            console.log(`  Hidden perfect (13/13): ${hiddenPerfect}/${scores.length}`);
            if (zeroScore > 0) console.log(`  Zero score (0/1):     ${zeroScore}`);
        } else {
            const perfect = scores.filter((r) => r.result.publicScore === r.result.totalPublic && r.result.totalPublic > 1).length;
            console.log(`  Public perfect:  ${perfect}/${scores.length}`);
        }
    }

    if (errors.length > 0 && errors.length <= 20) {
        console.log('\n  --- Errors (first 20) ---');
        errors.slice(0, 20).forEach((r) => console.log(`    Job #${r.index + 1}: ${r.error}`));
    } else if (errors.length > 20) {
        console.log(`\n  ${errors.length} errors (showing first 5):`);
        errors.slice(0, 5).forEach((r) => console.log(`    Job #${r.index + 1}: ${r.error}`));
    }

    // Capacity estimate
    if (completed.length > 0) {
        const jobsPerSec = completed.length / benchDuration;
        console.log('\n  --- Capacity Estimate ---');
        console.log(`  Throughput:       ${(jobsPerSec * 60).toFixed(1)} grading jobs/minute`);
        console.log(`  Per hour:         ${(jobsPerSec * 3600).toFixed(0)} jobs/hour`);
        console.log(`  Avg job latency:  ${avg.toFixed(1)}s`);
    }

    console.log('\n' + '='.repeat(65));

    // Verdict
    const successRate = (completed.length / validAttempts.length) * 100;
    if (successRate >= 95 && avg < 30) {
        console.log('  PASS — Grader fleet is healthy');
    } else if (successRate >= 80) {
        console.log('  WARNING — Some jobs failed or slow');
    } else {
        console.log('  FAIL — Grader fleet has issues');
    }
    console.log('='.repeat(65));
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
