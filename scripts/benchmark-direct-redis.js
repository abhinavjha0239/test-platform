#!/usr/bin/env node
/**
 * Direct Redis Grader Benchmark
 *
 * Pushes grading jobs directly to Redis streams, bypassing the API.
 * Tests pure grader fleet throughput. No real attempts needed — the grader
 * processes jobs and marks them completed in Redis even if DB update is a no-op.
 *
 * Usage:
 *   node scripts/benchmark-direct-redis.js [TOTAL_JOBS] [EXTRA_JOBS]
 *
 * Example:
 *   node scripts/benchmark-direct-redis.js 500 50
 */

const crypto = require('crypto');
const Redis = require('ioredis');
const http = require('http');
const { URL } = require('url');

// ============ CONFIG ============
const TOTAL_JOBS = parseInt(process.argv[2] || '500', 10);
const EXTRA_JOBS = parseInt(process.argv[3] || '50', 10);

const REDIS_URL = 'rediss://:8U2A8BFXe9XqdrS0vVwRGYLXaKgHdIYmDAzCaMrcVnk=@exam-redis-cache.redis.cache.windows.net:6380';
const API_URL = 'http://20.207.203.80';
const STREAM_HIGH = 'grading:jobs:high';
const STREAM_GROUP = 'grading-workers';
const JOB_KEY_PREFIX = 'grading:job:';
const POLL_INTERVAL = 1000;
const MAX_WAIT_MS = 600000; // 10 min

// Working solution
const SOLUTION_FILES = {
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
            <input data-testid="todo-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Add a todo" />
            <button data-testid="add-btn" onClick={addTodo}>Add</button>
            <div>
                <button data-testid="filter-all" onClick={() => setFilter('all')}>All</button>
                <button data-testid="filter-active" onClick={() => setFilter('active')}>Active</button>
                <button data-testid="filter-completed" onClick={() => setFilter('completed')}>Completed</button>
            </div>
            <ul>
                {filteredTodos.map((todo, index) => (
                    <li key={index} data-testid={"todo-item-" + index}>
                        <input type="checkbox" data-testid={"todo-checkbox-" + index} checked={todo.completed} onChange={() => toggleTodo(todos.indexOf(todo))} />
                        <span data-testid={"todo-text-" + index} style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>{todo.text}</span>
                        <button data-testid={"delete-btn-" + index} onClick={() => deleteTodo(todos.indexOf(todo))}>Delete</button>
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function apiRequest(method, path, body, headers) {
    return new Promise((resolve) => {
        const url = new URL(path, API_URL);
        const opts = {
            hostname: url.hostname, port: url.port || 80,
            path: url.pathname, method,
            headers: { 'Content-Type': 'application/json', ...headers },
        };
        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
        });
        req.on('error', () => resolve(null));
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

async function main() {
    const totalAll = TOTAL_JOBS + EXTRA_JOBS;
    console.log('='.repeat(65));
    console.log('  DIRECT REDIS GRADER BENCHMARK');
    console.log('='.repeat(65));
    console.log(`  Phase 1:  ${TOTAL_JOBS} jobs (main burst)`);
    console.log(`  Phase 2:  +${EXTRA_JOBS} jobs (added mid-grading)`);
    console.log(`  Total:    ${totalAll} jobs`);
    console.log('='.repeat(65));
    console.log('');

    // Step 1: Connect to Redis
    console.log('[1/5] Connecting to Redis...');
    const redis = new Redis(REDIS_URL, { tls: { rejectUnauthorized: false }, maxRetriesPerRequest: 3 });
    await redis.ping();
    console.log('  Connected.');

    // Step 2: Get challenge config from a real job
    console.log('\n[2/5] Getting challenge config (submitting 1 real job)...');
    const loginRes = await apiRequest('POST', '/api/auth/login', { email: 'admin@exam.com', password: 'admin123' });
    const token = loginRes?.data?.accessToken || loginRes?.data?.token;
    const examsRes = await apiRequest('GET', '/api/exams', null, { Authorization: `Bearer ${token}` });
    const exam = (examsRes?.data || []).find(e => e.title?.toLowerCase().includes('todo'));

    // Register a user and create a real attempt to get the full payload template
    const reg = await apiRequest('POST', '/api/auth/register', {
        email: `bench_tpl_${Date.now()}@test.com`, password: 'BenchPass123!', name: 'Template', role: 'CANDIDATE',
    });
    const uTok = reg?.data?.accessToken || reg?.data?.token;
    const att = await apiRequest('POST', '/api/attempts', { examId: exam.id }, { Authorization: `Bearer ${uTok}` });
    await apiRequest('PUT', `/api/attempts/${att?.data?.id}/files`, { files: SOLUTION_FILES }, { Authorization: `Bearer ${uTok}` });
    await sleep(200);
    const sub = await apiRequest('POST', `/api/attempts/${att?.data?.id}/submit`, { files: SOLUTION_FILES }, { Authorization: `Bearer ${uTok}` });

    if (!sub?.data?.jobId) {
        console.error('  Failed to submit template job:', JSON.stringify(sub).substring(0, 300));
        process.exit(1);
    }

    // Get the payload from Redis
    await sleep(1000);
    const tplData = await redis.hgetall(`${JOB_KEY_PREFIX}${sub.data.jobId}`);
    const templatePayload = JSON.parse(tplData.payload);
    console.log(`  Got template (runner: ${templatePayload.runner?.mode}, challenge: ${templatePayload.challengeId})`);

    // Wait for template job to finish so it doesn't interfere
    console.log('  Waiting for template job to complete...');
    for (let i = 0; i < 60; i++) {
        const s = await redis.hget(`${JOB_KEY_PREFIX}${sub.data.jobId}`, 'status');
        if (s === 'completed' || s === 'failed') { console.log(`  Template job: ${s}`); break; }
        await sleep(1000);
    }

    // Step 3: Push TOTAL_JOBS to Redis
    console.log(`\n[3/5] Pushing ${TOTAL_JOBS} jobs to Redis...`);
    const allJobs = [];
    const pushStart = Date.now();

    let pipeline = redis.pipeline();
    for (let i = 0; i < TOTAL_JOBS; i++) {
        const fakeAttemptId = `bench_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const jobId = `grading_${fakeAttemptId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
        const now = String(Date.now());

        const payload = JSON.stringify({
            ...templatePayload,
            attemptId: fakeAttemptId,
            files: SOLUTION_FILES,
            isPreview: false,
        });

        pipeline.xadd(STREAM_HIGH, '*', 'jobId', jobId, 'attemptId', fakeAttemptId, 'isPreview', '0', 'createdAt', now, 'payload', payload);
        pipeline.hset(`${JOB_KEY_PREFIX}${jobId}`, {
            status: 'queued', progress: '0', attemptId: fakeAttemptId, stream: STREAM_HIGH,
            createdAt: now, updatedAt: now, attempts: '0', isPreview: '0', payload, group: STREAM_GROUP,
        });
        pipeline.expire(`${JOB_KEY_PREFIX}${jobId}`, 7200);

        allJobs.push({ jobId, createdAt: parseInt(now), phase: 1 });

        if ((i + 1) % 100 === 0) {
            await pipeline.exec();
            pipeline = redis.pipeline();
            process.stdout.write(`  ${i + 1}/${TOTAL_JOBS}...\r`);
        }
    }
    await pipeline.exec();

    const pushMs = Date.now() - pushStart;
    console.log(`\n  Pushed ${TOTAL_JOBS} jobs in ${pushMs}ms (${(TOTAL_JOBS / (pushMs / 1000)).toFixed(0)} jobs/sec)`);

    // Step 4: Monitor + push extra jobs after 10s
    console.log(`\n[4/5] Monitoring grading progress...`);
    const monitorStart = Date.now();
    let extraPushed = false;
    let lastPrint = 0;

    while (Date.now() - monitorStart < MAX_WAIT_MS) {
        // Push extra jobs after 10s
        if (!extraPushed && Date.now() - monitorStart > 10000) {
            console.log(`\n  >>> Pushing +${EXTRA_JOBS} extra jobs...`);
            let ep = redis.pipeline();
            for (let i = 0; i < EXTRA_JOBS; i++) {
                const fakeAttemptId = `bench_extra_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
                const jobId = `grading_${fakeAttemptId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
                const now = String(Date.now());
                const payload = JSON.stringify({ ...templatePayload, attemptId: fakeAttemptId, files: SOLUTION_FILES, isPreview: false });
                ep.xadd(STREAM_HIGH, '*', 'jobId', jobId, 'attemptId', fakeAttemptId, 'isPreview', '0', 'createdAt', now, 'payload', payload);
                ep.hset(`${JOB_KEY_PREFIX}${jobId}`, {
                    status: 'queued', progress: '0', attemptId: fakeAttemptId, stream: STREAM_HIGH,
                    createdAt: now, updatedAt: now, attempts: '0', isPreview: '0', payload, group: STREAM_GROUP,
                });
                ep.expire(`${JOB_KEY_PREFIX}${jobId}`, 7200);
                allJobs.push({ jobId, createdAt: parseInt(now), phase: 2 });
            }
            await ep.exec();
            extraPushed = true;
            console.log(`  Pushed. Total jobs: ${allJobs.length}`);
        }

        // Check all job statuses
        const sp = redis.pipeline();
        for (const j of allJobs) sp.hget(`${JOB_KEY_PREFIX}${j.jobId}`, 'status');
        const statuses = await sp.exec();

        let completed = 0, failed = 0, processing = 0, queued = 0;
        for (const [, status] of statuses) {
            if (status === 'completed') completed++;
            else if (status === 'failed') failed++;
            else if (status === 'processing') processing++;
            else queued++;
        }

        const elapsed = ((Date.now() - monitorStart) / 1000).toFixed(1);
        const now = Date.now();
        if (now - lastPrint > 2000) {
            console.log(`  [${elapsed}s] Done: ${completed + failed}/${allJobs.length} (${completed} ok, ${failed} fail) | Active: ${processing} | Queue: ${queued}`);
            lastPrint = now;
        }

        if (completed + failed >= allJobs.length) {
            console.log(`  [${elapsed}s] ALL DONE: ${completed + failed}/${allJobs.length}`);
            break;
        }

        await sleep(POLL_INTERVAL);
    }

    // Step 5: Collect timing data
    console.log(`\n[5/5] Collecting timing data...`);
    const rp = redis.pipeline();
    for (const j of allJobs) rp.hmget(`${JOB_KEY_PREFIX}${j.jobId}`, 'status', 'createdAt', 'startedAt', 'completedAt');
    const timingData = await rp.exec();

    let completedCount = 0, failedCount = 0;
    const queueLatencies = []; // createdAt → startedAt
    const gradeLatencies = []; // startedAt → completedAt
    const totalLatencies = []; // createdAt → completedAt

    for (let i = 0; i < timingData.length; i++) {
        const [, fields] = timingData[i];
        const [status, created, started, completed] = fields;
        const c = parseInt(created || '0');
        const s = parseInt(started || '0');
        const d = parseInt(completed || '0');

        if (status === 'completed' && c > 0 && d > 0) {
            completedCount++;
            totalLatencies.push((d - c) / 1000);
            if (s > 0) {
                queueLatencies.push((s - c) / 1000);
                gradeLatencies.push((d - s) / 1000);
            }
        } else if (status === 'failed') {
            failedCount++;
        }
    }

    totalLatencies.sort((a, b) => a - b);
    queueLatencies.sort((a, b) => a - b);
    gradeLatencies.sort((a, b) => a - b);

    const percentile = (arr, p) => arr.length > 0 ? arr[Math.floor(arr.length * p)] : 0;
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b) / arr.length : 0;

    const wallClock = (Date.now() - monitorStart) / 1000;

    console.log(`\n${'='.repeat(65)}`);
    console.log('  BENCHMARK RESULTS');
    console.log('='.repeat(65));
    console.log(`\n  Total Jobs:        ${allJobs.length} (${TOTAL_JOBS} + ${EXTRA_JOBS} mid-flight)`);
    console.log(`  Completed:         ${completedCount} (${((completedCount / allJobs.length) * 100).toFixed(1)}%)`);
    console.log(`  Failed:            ${failedCount}`);
    console.log(`  Wall-clock Time:   ${wallClock.toFixed(1)}s`);
    console.log(`  Throughput:        ${(completedCount / wallClock).toFixed(1)} jobs/sec`);
    console.log(`  Jobs/min:          ${((completedCount / wallClock) * 60).toFixed(0)}`);

    if (totalLatencies.length > 0) {
        console.log(`\n  --- End-to-End Latency (queued → completed) ---`);
        console.log(`  Min:    ${totalLatencies[0].toFixed(1)}s`);
        console.log(`  Avg:    ${avg(totalLatencies).toFixed(1)}s`);
        console.log(`  P50:    ${percentile(totalLatencies, 0.5).toFixed(1)}s`);
        console.log(`  P90:    ${percentile(totalLatencies, 0.9).toFixed(1)}s`);
        console.log(`  P99:    ${percentile(totalLatencies, 0.99).toFixed(1)}s`);
        console.log(`  Max:    ${totalLatencies[totalLatencies.length - 1].toFixed(1)}s`);
    }

    if (queueLatencies.length > 0) {
        console.log(`\n  --- Queue Wait (queued → processing) ---`);
        console.log(`  Avg:    ${avg(queueLatencies).toFixed(1)}s`);
        console.log(`  P90:    ${percentile(queueLatencies, 0.9).toFixed(1)}s`);
        console.log(`  Max:    ${queueLatencies[queueLatencies.length - 1].toFixed(1)}s`);
    }

    if (gradeLatencies.length > 0) {
        console.log(`\n  --- Pure Grading Time (processing → completed) ---`);
        console.log(`  Min:    ${gradeLatencies[0].toFixed(1)}s`);
        console.log(`  Avg:    ${avg(gradeLatencies).toFixed(1)}s`);
        console.log(`  P50:    ${percentile(gradeLatencies, 0.5).toFixed(1)}s`);
        console.log(`  P90:    ${percentile(gradeLatencies, 0.9).toFixed(1)}s`);
        console.log(`  Max:    ${gradeLatencies[gradeLatencies.length - 1].toFixed(1)}s`);
    }

    // Fleet info
    console.log(`\n  --- Fleet ---`);
    console.log(`  7 graders (1×B4as_v2 + 6×D16as_v5)`);
    console.log(`  Total: 100 vCPU, 280 concurrent slots`);

    console.log('\n' + '='.repeat(65));
    if (completedCount >= allJobs.length * 0.95) {
        console.log('  PASS — Grader fleet handles the load');
    } else if (completedCount >= allJobs.length * 0.8) {
        console.log('  WARNING — Some issues');
    } else {
        console.log('  FAIL');
    }
    console.log('='.repeat(65));

    await redis.quit();
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
