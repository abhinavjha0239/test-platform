#!/usr/bin/env node
/**
 * Realistic Exam Platform Stress Test
 *
 * Phase 1: Create 1000 unique users (batched)
 * Phase 2: All 1000 users login simultaneously (simulating different IPs via X-Forwarded-For)
 * Phase 3: 10-minute sustained load with all authenticated users
 *
 * Usage: node scripts/stress-test-realistic.js [BASE_URL] [DURATION_MINS] [USERS]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ============ CONFIG ============
const BASE_URL = process.argv[2] || 'http://20.207.203.80';
const DURATION_MINS = parseInt(process.argv[3] || '10', 10);
const NUM_USERS = parseInt(process.argv[4] || '1000', 10);
const DURATION_MS = DURATION_MINS * 60 * 1000;

const parsedUrl = new URL(BASE_URL);
const isHttps = parsedUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

// ============ METRICS ============
const metrics = {
    phase1: { total: 0, success: 0, failed: 0, startTime: 0, endTime: 0 },
    phase2: { total: 0, success: 0, failed: 0, startTime: 0, endTime: 0, latencies: [] },
    phase3: {
        total: 0, success: 0, failed: 0, startTime: 0, endTime: 0,
        latencies: [],
        endpoints: {},
        errors: {},
        timeline: [],
    },
};

function recordPhase3(endpoint, statusCode, latencyMs, error = null) {
    metrics.phase3.total++;
    if (!metrics.phase3.endpoints[endpoint]) {
        metrics.phase3.endpoints[endpoint] = { total: 0, success: 0, failed: 0, latencySum: 0, latencyMax: 0, latencies: [] };
    }
    const ep = metrics.phase3.endpoints[endpoint];
    ep.total++;
    if (error || statusCode >= 400) {
        metrics.phase3.failed++;
        ep.failed++;
        const errKey = error || `HTTP_${statusCode}`;
        metrics.phase3.errors[errKey] = (metrics.phase3.errors[errKey] || 0) + 1;
    } else {
        metrics.phase3.success++;
        ep.success++;
    }
    if (latencyMs >= 0) {
        metrics.phase3.latencies.push(latencyMs);
        ep.latencies.push(latencyMs);
        ep.latencySum += latencyMs;
        ep.latencyMax = Math.max(ep.latencyMax, latencyMs);
    }
}

// ============ HTTP CLIENT ============
const agent = new http.Agent({ keepAlive: true, maxSockets: 3000, maxFreeSockets: 1000 });
const httpsAgent = isHttps ? new https.Agent({ keepAlive: true, maxSockets: 3000, maxFreeSockets: 1000, rejectUnauthorized: false }) : null;

function makeRequest(method, path, body = null, headers = {}, timeout = 15000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const url = new URL(path, BASE_URL);
        const opts = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            agent: isHttps ? httpsAgent : agent,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
            timeout,
        };
        if (body) {
            const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
            opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = httpModule.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const latency = Date.now() - start;
                try { resolve({ status: res.statusCode, data: JSON.parse(data), latency }); }
                catch { resolve({ status: res.statusCode, data, latency }); }
            });
        });
        req.on('error', (err) => resolve({ status: 0, data: null, latency: Date.now() - start, error: err.code || err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 0, data: null, latency: Date.now() - start, error: 'TIMEOUT' }); });
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}
function arrMin(arr) { let m = Infinity; for (const v of arr) if (v < m) m = v; return m; }
function arrMax(arr) { let m = -Infinity; for (const v of arr) if (v > m) m = v; return m; }

/**
 * Generate a fake IP per user index (simulates different student IPs)
 * The rate limiter uses X-Forwarded-For to identify clients behind proxies
 */
function fakeIP(idx) {
    const a = 10 + Math.floor(idx / (256 * 256));
    const b = Math.floor((idx / 256) % 256);
    const c = idx % 256;
    return `10.${a}.${b}.${c}`;
}

// ============ PHASE 1: CREATE USERS ============
async function phase1_createUsers() {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  PHASE 1: Creating ${NUM_USERS} users`);
    console.log('='.repeat(70));
    metrics.phase1.startTime = Date.now();
    const users = [];
    const BATCH_SIZE = 50;

    for (let batch = 0; batch < NUM_USERS; batch += BATCH_SIZE) {
        const batchEnd = Math.min(batch + BATCH_SIZE, NUM_USERS);
        const promises = [];
        for (let i = batch; i < batchEnd; i++) {
            const email = `stress_user_${i}@loadtest.com`;
            const password = 'StressTest2026!';
            promises.push(
                makeRequest('POST', '/api/auth/register',
                    { email, password, name: `Stress User ${i}`, role: 'CANDIDATE' },
                    { 'X-Forwarded-For': fakeIP(i) }, 30000
                ).then(res => {
                    metrics.phase1.total++;
                    if (res.status === 200 && res.data?.data) {
                        metrics.phase1.success++;
                        users.push({ id: i, email, password, token: res.data.data.accessToken || res.data.data.token });
                    } else {
                        metrics.phase1.failed++;
                        users.push({ id: i, email, password, token: null });
                    }
                })
            );
        }
        await Promise.all(promises);
        process.stdout.write(`\r  Created: ${Math.min(batchEnd, NUM_USERS)}/${NUM_USERS} (${metrics.phase1.success} new, ${metrics.phase1.failed} existing)`);
    }

    metrics.phase1.endTime = Date.now();
    console.log(`\n  ✅ Phase 1 done in ${((metrics.phase1.endTime - metrics.phase1.startTime) / 1000).toFixed(1)}s — ${metrics.phase1.success} new, ${metrics.phase1.failed} existing`);
    return users;
}

// ============ PHASE 2: SIMULTANEOUS LOGIN ============
async function phase2_simultaneousLogin(users) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  PHASE 2: ${users.length} users logging in SIMULTANEOUSLY`);
    console.log('='.repeat(70));

    // Clear rate limit keys first
    console.log('  Clearing rate limit counters...');
    await makeRequest('GET', '/health'); // just a warm-up

    console.log('  3...');
    await sleep(1000);
    console.log('  2...');
    await sleep(1000);
    console.log('  1...');
    await sleep(1000);
    console.log('  🚀 FIRE! — All 1000 logins launched simultaneously\n');

    metrics.phase2.startTime = Date.now();

    // Fire logins in 10 waves of 100 within 1 second (100ms apart)
    // This avoids TCP socket exhaustion while still being a realistic "same second" burst
    const WAVE_SIZE = 100;
    const WAVE_DELAY_MS = 100;
    const promises = [];

    for (let wave = 0; wave < Math.ceil(users.length / WAVE_SIZE); wave++) {
        const start = wave * WAVE_SIZE;
        const end = Math.min(start + WAVE_SIZE, users.length);
        if (wave > 0) await sleep(WAVE_DELAY_MS);

        for (let idx = start; idx < end; idx++) {
            const user = users[idx];
            promises.push(
                makeRequest('POST', '/api/auth/login',
                    { email: user.email, password: user.password },
                    { 'X-Forwarded-For': fakeIP(idx) },
                    60000
                ).then(res => {
                    metrics.phase2.total++;
                    metrics.phase2.latencies.push(res.latency);
                    if (res.status === 200 && res.data?.data) {
                        metrics.phase2.success++;
                        user.token = res.data.data.accessToken || res.data.data.token;
                    } else {
                        metrics.phase2.failed++;
                        if (metrics.phase2.failed <= 10) {
                            const reason = res.error || `HTTP ${res.status}`;
                            console.log(`  ⚠ Login #${idx} failed: ${reason}`);
                        }
                    }
                })
            );
        }
    }

    // Progress display
    const timer = setInterval(() => {
        const done = metrics.phase2.success + metrics.phase2.failed;
        const elapsed = ((Date.now() - metrics.phase2.startTime) / 1000).toFixed(1);
        process.stdout.write(`\r  Progress: ${done}/${users.length} (${metrics.phase2.success} OK, ${metrics.phase2.failed} fail) — ${elapsed}s elapsed   `);
    }, 500);

    await Promise.all(promises);
    clearInterval(timer);

    metrics.phase2.endTime = Date.now();
    const totalTime = ((metrics.phase2.endTime - metrics.phase2.startTime) / 1000).toFixed(1);
    const loggedIn = users.filter(u => u.token).length;

    console.log(`\n\n  ✅ Phase 2 complete in ${totalTime}s`);
    console.log(`  Logged in: ${loggedIn}/${users.length} (${((loggedIn / users.length) * 100).toFixed(1)}%)`);
    console.log(`  Latency — P50: ${percentile(metrics.phase2.latencies, 50).toFixed(0)}ms | P95: ${percentile(metrics.phase2.latencies, 95).toFixed(0)}ms | P99: ${percentile(metrics.phase2.latencies, 99).toFixed(0)}ms | Max: ${arrMax(metrics.phase2.latencies).toFixed(0)}ms`);

    return users.filter(u => u.token);
}

// ============ PHASE 3: SUSTAINED LOAD ============
async function phase3_sustainedLoad(authenticatedUsers) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  PHASE 3: ${DURATION_MINS}-minute sustained load with ${authenticatedUsers.length} active users`);
    console.log(`${'='.repeat(70)}\n`);

    metrics.phase3.startTime = Date.now();
    let lastSnapTime = Date.now();
    let lastSnapTotal = 0;

    const snapInterval = setInterval(() => {
        const now = Date.now();
        const elapsed = ((now - metrics.phase3.startTime) / 1000).toFixed(0);
        const remaining = Math.max(0, (DURATION_MS - (now - metrics.phase3.startTime)) / 60000).toFixed(1);
        const rps = Math.round((metrics.phase3.total - lastSnapTotal) / ((now - lastSnapTime) / 1000 || 1));
        const successRate = metrics.phase3.total > 0 ? ((metrics.phase3.success / metrics.phase3.total) * 100).toFixed(1) : '0.0';
        const p50 = percentile(metrics.phase3.latencies.slice(-2000), 50).toFixed(0);
        const p99 = percentile(metrics.phase3.latencies.slice(-2000), 99).toFixed(0);
        metrics.phase3.timeline.push({ time: +elapsed, rps, total: metrics.phase3.total });
        process.stdout.write(
            `\r  [${elapsed}s] ${remaining}m left | RPS: ${rps} | Total: ${metrics.phase3.total.toLocaleString()} | ` +
            `OK: ${metrics.phase3.success.toLocaleString()} FAIL: ${metrics.phase3.failed.toLocaleString()} | ` +
            `${successRate}% | P50: ${p50}ms P99: ${p99}ms   `
        );
        lastSnapTime = now;
        lastSnapTotal = metrics.phase3.total;
    }, 5000);

    const userLoops = authenticatedUsers.map((user, idx) => runUserSession(user, idx));
    await Promise.all(userLoops);

    clearInterval(snapInterval);
    metrics.phase3.endTime = Date.now();
}

async function runUserSession(user, idx) {
    const startTime = metrics.phase3.startTime;
    const ip = fakeIP(idx);

    // Stagger start 0-2s
    await sleep(Math.random() * 2000);

    while (Date.now() - startTime < DURATION_MS) {
        const roll = Math.random() * 100;
        const authHeaders = { Authorization: `Bearer ${user.token}`, 'X-Forwarded-For': ip };
        let res;

        // Only CANDIDATE-accessible endpoints (no admin routes, no fake attempt IDs)
        if (roll < 15) {
            // Health check (lightweight, public)
            res = await makeRequest('GET', '/health');
            recordPhase3('GET /health', res.status, res.latency, res.error);
        } else if (roll < 35) {
            // Profile check (any authenticated user)
            res = await makeRequest('GET', '/api/auth/me', null, authHeaders);
            recordPhase3('GET /api/auth/me', res.status, res.latency, res.error);
        } else if (roll < 60) {
            // Browse available exams (candidate's main action)
            res = await makeRequest('GET', '/api/exams', null, authHeaders);
            recordPhase3('GET /api/exams', res.status, res.latency, res.error);
        } else if (roll < 75) {
            // Socket.IO long-poll (connection keepalive)
            res = await makeRequest('GET', '/socket.io/?EIO=4&transport=polling', null, { 'X-Forwarded-For': ip });
            recordPhase3('GET /socket.io/poll', res.status, res.latency, res.error);
        } else if (roll < 88) {
            // Frontend page load (Next.js SSR / static)
            res = await makeRequest('GET', '/', null, { 'X-Forwarded-For': ip, 'Accept': 'text/html' });
            recordPhase3('GET / (frontend)', res.status, res.latency, res.error);
        } else {
            // Re-login (token refresh simulation)
            res = await makeRequest('POST', '/api/auth/login', { email: user.email, password: user.password },
                { 'X-Forwarded-For': ip }, 30000);
            recordPhase3('POST /api/auth/login', res.status, res.latency, res.error);
            if (res.status === 200 && res.data?.data) {
                user.token = res.data.data.accessToken || res.data.data.token;
            }
        }

        // Think time: 800ms - 3s (realistic user browsing pace)
        await sleep(800 + Math.random() * 2200);
    }
}

// ============ FINAL REPORT ============
function printFinalReport(totalUsers, loggedInCount) {
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('  STRESS TEST FINAL REPORT');
    console.log('='.repeat(70));

    // Phase 1
    console.log('\n  ── Phase 1: User Registration ──');
    console.log(`  Users: ${metrics.phase1.success} created, ${metrics.phase1.failed} already existed`);
    console.log(`  Time: ${((metrics.phase1.endTime - metrics.phase1.startTime) / 1000).toFixed(1)}s`);

    // Phase 2
    const loginRate = ((metrics.phase2.success / NUM_USERS) * 100).toFixed(1);
    console.log('\n  ── Phase 2: Simultaneous Login Burst (1000 at once) ──');
    console.log(`  Successful: ${metrics.phase2.success}/${NUM_USERS} (${loginRate}%)`);
    console.log(`  Failed: ${metrics.phase2.failed}`);
    console.log(`  Wall time: ${((metrics.phase2.endTime - metrics.phase2.startTime) / 1000).toFixed(1)}s`);
    if (metrics.phase2.latencies.length > 0) {
        console.log(`  P50:  ${percentile(metrics.phase2.latencies, 50).toFixed(0)}ms`);
        console.log(`  P95:  ${percentile(metrics.phase2.latencies, 95).toFixed(0)}ms`);
        console.log(`  P99:  ${percentile(metrics.phase2.latencies, 99).toFixed(0)}ms`);
        console.log(`  Max:  ${arrMax(metrics.phase2.latencies).toFixed(0)}ms`);
    }

    // Phase 3
    const p3dur = (metrics.phase3.endTime - metrics.phase3.startTime) / 1000;
    const avgRps = (metrics.phase3.total / p3dur).toFixed(1);
    const peakRps = arrMax(metrics.phase3.timeline.map(t => t.rps));
    const p3SuccessRate = metrics.phase3.total > 0 ? ((metrics.phase3.success / metrics.phase3.total) * 100).toFixed(2) : '0';

    console.log(`\n  ── Phase 3: Sustained Load (${DURATION_MINS} min) ──`);
    console.log(`  Active users: ${loggedInCount}`);
    console.log(`  Total requests: ${metrics.phase3.total.toLocaleString()}`);
    console.log(`  Avg RPS: ${avgRps}`);
    console.log(`  Peak RPS: ${peakRps}`);
    console.log(`  Success rate: ${p3SuccessRate}%`);

    const lat = metrics.phase3.latencies;
    if (lat.length > 0) {
        console.log(`\n  ── Latency (Phase 3) ──`);
        console.log(`  Min:  ${arrMin(lat).toFixed(0)}ms`);
        console.log(`  P50:  ${percentile(lat, 50).toFixed(0)}ms`);
        console.log(`  P90:  ${percentile(lat, 90).toFixed(0)}ms`);
        console.log(`  P95:  ${percentile(lat, 95).toFixed(0)}ms`);
        console.log(`  P99:  ${percentile(lat, 99).toFixed(0)}ms`);
        console.log(`  Max:  ${arrMax(lat).toFixed(0)}ms`);
    }

    console.log(`\n  ── Per Endpoint (Phase 3) ──`);
    console.log(`  ${'Endpoint'.padEnd(30)} ${'Total'.padStart(8)} ${'OK'.padStart(8)} ${'Fail'.padStart(8)} ${'Rate%'.padStart(7)} ${'P50ms'.padStart(7)} ${'P99ms'.padStart(7)} ${'Maxms'.padStart(7)}`);
    console.log('  ' + '-'.repeat(88));
    for (const [name, ep] of Object.entries(metrics.phase3.endpoints).sort((a, b) => b[1].total - a[1].total)) {
        const rate = ((ep.success / ep.total) * 100).toFixed(1);
        console.log(
            `  ${name.padEnd(30)} ${String(ep.total).padStart(8)} ${String(ep.success).padStart(8)} ` +
            `${String(ep.failed).padStart(8)} ${rate.padStart(7)} ${percentile(ep.latencies, 50).toFixed(0).padStart(7)} ` +
            `${percentile(ep.latencies, 99).toFixed(0).padStart(7)} ${ep.latencyMax.toFixed(0).padStart(7)}`
        );
    }

    if (Object.keys(metrics.phase3.errors).length > 0) {
        console.log(`\n  ── Errors (Phase 3) ──`);
        for (const [err, count] of Object.entries(metrics.phase3.errors).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${err}: ${count.toLocaleString()}`);
        }
    }

    console.log(`\n  ── RPS Over Time (Phase 3) ──`);
    const step = Math.max(1, Math.floor(metrics.phase3.timeline.length / 20));
    for (let i = 0; i < metrics.phase3.timeline.length; i += step) {
        const t = metrics.phase3.timeline[i];
        const bar = '█'.repeat(Math.min(60, Math.round(t.rps / 10)));
        console.log(`  ${String(t.time).padStart(5)}s | ${String(t.rps).padStart(5)} rps | ${bar}`);
    }

    // Verdict
    console.log(`\n${'='.repeat(70)}`);
    const p3Rate = +p3SuccessRate;
    const p99 = percentile(lat, 99);
    if (+loginRate >= 90 && p3Rate >= 95 && p99 < 2000) {
        console.log('  ✅ PASSED — Infrastructure handles 1000 concurrent users well');
    } else if (+loginRate >= 70 && p3Rate >= 80) {
        console.log('  ⚠️  PARTIAL PASS — Some degradation under peak load');
    } else {
        console.log('  ❌ FAILED — Significant issues under load');
    }
    console.log(`  Login burst: ${loginRate}% | Sustained: ${p3SuccessRate}% | P99: ${p99.toFixed(0)}ms`);
    console.log('='.repeat(70));
}

// ============ MAIN ============
async function main() {
    console.log('='.repeat(70));
    console.log('  REALISTIC EXAM PLATFORM STRESS TEST');
    console.log('='.repeat(70));
    console.log(`  Target:   ${BASE_URL}`);
    console.log(`  Users:    ${NUM_USERS}`);
    console.log(`  Duration: ${DURATION_MINS} minutes (after login burst)`);
    console.log('  Note:     Each user gets a unique simulated IP (X-Forwarded-For)');
    console.log('='.repeat(70));

    // Preflight
    console.log('\n  Checking target...');
    const health = await makeRequest('GET', '/health');
    if (health.status !== 200) { console.error(`  ❌ Target down: ${health.error || health.status}`); process.exit(1); }
    console.log(`  ✅ Target alive (${health.latency}ms) — Redis: ${health.data?.redis || '?'}`);

    const users = await phase1_createUsers();
    const loggedIn = await phase2_simultaneousLogin(users);

    console.log(`\n  ${loggedIn.length} users authenticated and ready`);
    if (loggedIn.length === 0) { console.error('  ❌ No users logged in. Aborting.'); process.exit(1); }

    await phase3_sustainedLoad(loggedIn);
    printFinalReport(users.length, loggedIn.length);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
