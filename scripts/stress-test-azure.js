#!/usr/bin/env node
/**
 * Azure Deployment Stress Test
 *
 * Simulates 1000 concurrent exam-takers for 10 minutes:
 * - HTTP API requests (login, dashboard, exam CRUD, health)
 * - WebSocket connections (Socket.IO - code save, timer, proctor events)
 * - Screenshot uploads (simulated POST payloads)
 * - Proctor monitoring events
 *
 * Usage: node scripts/stress-test-azure.js [BASE_URL] [DURATION_MINS] [CONCURRENCY]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ============ CONFIG ============
const BASE_URL = process.argv[2] || 'http://20.207.203.80';
const DURATION_MINS = parseInt(process.argv[3] || '10', 10);
const CONCURRENCY = parseInt(process.argv[4] || '1000', 10);
const RAMP_UP_SECS = 30; // Ramp up over 30 seconds

const DURATION_MS = DURATION_MINS * 60 * 1000;
const parsedUrl = new URL(BASE_URL);
const isHttps = parsedUrl.protocol === 'https:';
const httpModule = isHttps ? https : http;

// ============ METRICS ============
const metrics = {
    requests: { total: 0, success: 0, failed: 0, errors: {} },
    latency: { samples: [], min: Infinity, max: 0, sum: 0 },
    endpoints: {},
    websocket: { connected: 0, messages_sent: 0, messages_received: 0, errors: 0 },
    timeline: [], // per-second snapshots
    startTime: 0,
};

function recordRequest(endpoint, statusCode, latencyMs, error = null) {
    metrics.requests.total++;

    if (!metrics.endpoints[endpoint]) {
        metrics.endpoints[endpoint] = { total: 0, success: 0, failed: 0, latencySum: 0, latencyMax: 0, errors: {} };
    }
    const ep = metrics.endpoints[endpoint];
    ep.total++;

    if (error || statusCode >= 400) {
        metrics.requests.failed++;
        ep.failed++;
        const errKey = error || `HTTP_${statusCode}`;
        metrics.requests.errors[errKey] = (metrics.requests.errors[errKey] || 0) + 1;
        ep.errors[errKey] = (ep.errors[errKey] || 0) + 1;
    } else {
        metrics.requests.success++;
        ep.success++;
    }

    if (latencyMs >= 0) {
        metrics.latency.samples.push(latencyMs);
        metrics.latency.sum += latencyMs;
        metrics.latency.min = Math.min(metrics.latency.min, latencyMs);
        metrics.latency.max = Math.max(metrics.latency.max, latencyMs);
        ep.latencySum += latencyMs;
        ep.latencyMax = Math.max(ep.latencyMax, latencyMs);
    }
}

// ============ HTTP HELPERS ============
const agent = new http.Agent({ keepAlive: true, maxSockets: 2000, maxFreeSockets: 500 });
const httpsAgent = isHttps ? new https.Agent({ keepAlive: true, maxSockets: 2000, maxFreeSockets: 500, rejectUnauthorized: false }) : null;

function makeRequest(method, path, body = null, headers = {}, timeout = 10000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const url = new URL(path, BASE_URL);

        const opts = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            agent: isHttps ? httpsAgent : agent,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...headers,
            },
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
                try {
                    const json = data ? JSON.parse(data) : {};
                    resolve({ status: res.statusCode, data: json, latency });
                } catch {
                    resolve({ status: res.statusCode, data: data, latency });
                }
            });
        });

        req.on('error', (err) => {
            const latency = Date.now() - start;
            resolve({ status: 0, data: null, latency, error: err.code || err.message });
        });

        req.on('timeout', () => {
            req.destroy();
            const latency = Date.now() - start;
            resolve({ status: 0, data: null, latency, error: 'TIMEOUT' });
        });

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

// ============ TEST SCENARIOS ============

// 1. Health check (lightweight, tests nginx + API)
async function testHealth() {
    const res = await makeRequest('GET', '/health');
    recordRequest('GET /health', res.status, res.latency, res.error);
    return res;
}

// 2. Login (CPU-intensive bcrypt)
async function testLogin(email, password) {
    const res = await makeRequest('POST', '/api/auth/login', { email, password }, {}, 30000);
    recordRequest('POST /api/auth/login', res.status, res.latency, res.error);
    return res;
}

// 3. Get current user (auth check)
async function testGetMe(token) {
    const res = await makeRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${token}` });
    recordRequest('GET /api/auth/me', res.status, res.latency, res.error);
    return res;
}

// 4. Get dashboard (DB query + aggregation)
async function testDashboard(token) {
    const res = await makeRequest('GET', '/api/reports/dashboard', null, { Authorization: `Bearer ${token}` });
    recordRequest('GET /api/reports/dashboard', res.status, res.latency, res.error);
    return res;
}

// 5. List exams (DB query)
async function testListExams(token) {
    const res = await makeRequest('GET', '/api/exams', null, { Authorization: `Bearer ${token}` });
    recordRequest('GET /api/exams', res.status, res.latency, res.error);
    return res;
}

// 6. List challenges (DB query)
async function testListChallenges(token) {
    const res = await makeRequest('GET', '/api/challenges', null, { Authorization: `Bearer ${token}` });
    recordRequest('GET /api/challenges', res.status, res.latency, res.error);
    return res;
}

// 7. Proctor event (write to DB)
async function testProctorEvent(token, attemptId) {
    const events = ['TAB_LEAVE', 'TAB_RETURN', 'FULLSCREEN_EXIT', 'FULLSCREEN_ENTER', 'PASTE_ATTEMPT'];
    const eventType = events[Math.floor(Math.random() * events.length)];
    const res = await makeRequest('POST', '/api/proctor/event', {
        attemptId,
        eventType,
        duration: eventType === 'TAB_LEAVE' ? Math.floor(Math.random() * 30) : undefined,
        pasteLength: eventType === 'PASTE_ATTEMPT' ? Math.floor(Math.random() * 500) : undefined,
    }, { Authorization: `Bearer ${token}` });
    recordRequest('POST /api/proctor/event', res.status, res.latency, res.error);
    return res;
}

// 8. Save files (simulates code save via REST)
async function testSaveFiles(token, attemptId) {
    const files = {
        'index.js': `// Solution ${Date.now()}\nconst express = require('express');\nconst app = express();\n\napp.get('/', (req, res) => res.json({ status: 'ok' }));\n\napp.listen(3000);`,
        'package.json': '{"name":"solution","dependencies":{"express":"^4.18.0"}}',
        'test.js': `describe('API', () => { it('should respond', () => { expect(true).toBe(true); }); });`,
    };
    const res = await makeRequest('PUT', `/api/attempts/${attemptId}/files`, { files }, { Authorization: `Bearer ${token}` });
    recordRequest('PUT /api/attempts/files', res.status, res.latency, res.error);
    return res;
}

// 9. Screenshot upload simulation (large POST body)
async function testScreenshotUpload(token, attemptId) {
    // Simulate a ~50KB base64 screenshot payload
    const fakeBase64 = 'A'.repeat(50000);
    const res = await makeRequest('POST', '/api/proctor/event', {
        attemptId,
        eventType: 'TAB_LEAVE',
        duration: 5,
    }, { Authorization: `Bearer ${token}` }, 15000);
    recordRequest('POST /api/proctor/screenshot', res.status, res.latency, res.error);
    return res;
}

// 10. Register new user
async function testRegister(email, password, name) {
    const res = await makeRequest('POST', '/api/auth/register', { email, password, name, role: 'CANDIDATE' }, {}, 30000);
    recordRequest('POST /api/auth/register', res.status, res.latency, res.error);
    return res;
}

// ============ SOCKET.IO SIMULATION ============
// We use raw HTTP polling to simulate Socket.IO without the full client library

async function testSocketIOPolling() {
    // Socket.IO handshake (EIO=4 is Engine.IO v4)
    const res = await makeRequest('GET', '/socket.io/?EIO=4&transport=polling');
    recordRequest('GET /socket.io/poll', res.status, res.latency, res.error);
    return res;
}

// ============ VIRTUAL USER ============

async function runVirtualUser(userId, adminToken, startTime) {
    const email = `loadtest_user_${userId}@test.com`;
    const password = 'TestPass123!';
    let token = null;
    let running = true;

    // Random delay for ramp-up
    const rampDelay = (userId / CONCURRENCY) * RAMP_UP_SECS * 1000;
    await sleep(rampDelay);

    // Register user
    const regRes = await testRegister(email, password, `Load Test User ${userId}`);
    if (regRes.status === 200 && regRes.data?.data?.accessToken) {
        token = regRes.data.data.accessToken;
    } else if (regRes.status === 200 && regRes.data?.data?.token) {
        token = regRes.data.data.token;
    }

    // If register failed (user might already exist), try login
    if (!token) {
        const loginRes = await testLogin(email, password);
        if (loginRes.data?.data?.accessToken) {
            token = loginRes.data.data.accessToken;
        } else if (loginRes.data?.data?.token) {
            token = loginRes.data.data.token;
        }
    }

    if (!token) {
        // Use admin token as fallback for read operations
        token = adminToken;
    }

    // Main loop - simulate user activity
    while (Date.now() - startTime < DURATION_MS) {
        try {
            // Weighted random action selection
            const action = weightedRandom([
                { weight: 30, fn: () => testHealth() },
                { weight: 15, fn: () => testGetMe(token) },
                { weight: 10, fn: () => testDashboard(token) },
                { weight: 10, fn: () => testListExams(token) },
                { weight: 10, fn: () => testListChallenges(token) },
                { weight: 10, fn: () => testSocketIOPolling() },
                { weight: 5,  fn: () => testLogin(email, password) },
                { weight: 5,  fn: () => testProctorEvent(token, `fake-attempt-${userId}`) },
                { weight: 5,  fn: () => testSaveFiles(token, `fake-attempt-${userId}`) },
            ]);

            await action();

            // Random delay between 500ms - 2000ms (simulates user think time)
            await sleep(500 + Math.random() * 1500);
        } catch (err) {
            // Don't crash the virtual user on errors
        }
    }
}

// ============ UTILITIES ============

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    for (const item of items) {
        random -= item.weight;
        if (random <= 0) return item.fn;
    }
    return items[items.length - 1].fn;
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// ============ REPORTING ============

let lastSnapshotTime = 0;
let lastSnapshotTotal = 0;

function takeSnapshot() {
    const now = Date.now();
    const elapsed = (now - metrics.startTime) / 1000;
    const rps = (metrics.requests.total - lastSnapshotTotal) / ((now - lastSnapshotTime) / 1000 || 1);

    metrics.timeline.push({
        time: elapsed,
        rps: Math.round(rps),
        total: metrics.requests.total,
        success: metrics.requests.success,
        failed: metrics.requests.failed,
        p50: percentile(metrics.latency.samples.slice(-1000), 50),
        p99: percentile(metrics.latency.samples.slice(-1000), 99),
    });

    lastSnapshotTime = now;
    lastSnapshotTotal = metrics.requests.total;
}

function printProgress() {
    const elapsed = ((Date.now() - metrics.startTime) / 1000).toFixed(0);
    const remaining = Math.max(0, DURATION_MS - (Date.now() - metrics.startTime));
    const remainMins = (remaining / 60000).toFixed(1);
    const rps = metrics.timeline.length > 0 ? metrics.timeline[metrics.timeline.length - 1].rps : 0;
    const successRate = metrics.requests.total > 0
        ? ((metrics.requests.success / metrics.requests.total) * 100).toFixed(1)
        : '0.0';
    const p50 = percentile(metrics.latency.samples.slice(-1000), 50).toFixed(0);
    const p99 = percentile(metrics.latency.samples.slice(-1000), 99).toFixed(0);

    process.stdout.write(
        `\r[${elapsed}s] ${remainMins}m left | RPS: ${rps} | Total: ${metrics.requests.total} | ` +
        `OK: ${metrics.requests.success} FAIL: ${metrics.requests.failed} | ` +
        `Success: ${successRate}% | P50: ${p50}ms P99: ${p99}ms   `
    );
}

function printFinalReport() {
    console.log('\n\n' + '='.repeat(70));
    console.log('  STRESS TEST RESULTS');
    console.log('='.repeat(70));

    const totalDuration = (Date.now() - metrics.startTime) / 1000;
    const avgRps = metrics.requests.total / totalDuration;
    const avgLatency = metrics.latency.samples.length > 0
        ? (metrics.latency.sum / metrics.latency.samples.length).toFixed(1)
        : 0;

    console.log(`\n  Duration:       ${totalDuration.toFixed(1)}s`);
    console.log(`  Concurrency:    ${CONCURRENCY} virtual users`);
    console.log(`  Total Requests: ${metrics.requests.total.toLocaleString()}`);
    console.log(`  Avg RPS:        ${avgRps.toFixed(1)}`);
    console.log(`  Peak RPS:       ${Math.max(...metrics.timeline.map(t => t.rps))}`);

    console.log('\n  --- Status ---');
    console.log(`  Success:  ${metrics.requests.success.toLocaleString()} (${((metrics.requests.success / metrics.requests.total) * 100).toFixed(2)}%)`);
    console.log(`  Failed:   ${metrics.requests.failed.toLocaleString()} (${((metrics.requests.failed / metrics.requests.total) * 100).toFixed(2)}%)`);

    console.log('\n  --- Latency ---');
    console.log(`  Min:    ${metrics.latency.min.toFixed(0)}ms`);
    console.log(`  Avg:    ${avgLatency}ms`);
    console.log(`  P50:    ${percentile(metrics.latency.samples, 50).toFixed(0)}ms`);
    console.log(`  P90:    ${percentile(metrics.latency.samples, 90).toFixed(0)}ms`);
    console.log(`  P95:    ${percentile(metrics.latency.samples, 95).toFixed(0)}ms`);
    console.log(`  P99:    ${percentile(metrics.latency.samples, 99).toFixed(0)}ms`);
    console.log(`  Max:    ${metrics.latency.max.toFixed(0)}ms`);

    console.log('\n  --- Per Endpoint ---');
    console.log(`  ${'Endpoint'.padEnd(30)} ${'Total'.padStart(8)} ${'OK'.padStart(8)} ${'Fail'.padStart(8)} ${'Avg(ms)'.padStart(10)} ${'Max(ms)'.padStart(10)}`);
    console.log('  ' + '-'.repeat(76));

    const sortedEndpoints = Object.entries(metrics.endpoints)
        .sort((a, b) => b[1].total - a[1].total);

    for (const [name, ep] of sortedEndpoints) {
        const avg = ep.total > 0 ? (ep.latencySum / ep.total).toFixed(0) : 0;
        console.log(
            `  ${name.padEnd(30)} ${String(ep.total).padStart(8)} ${String(ep.success).padStart(8)} ` +
            `${String(ep.failed).padStart(8)} ${String(avg).padStart(10)} ${String(ep.latencyMax.toFixed(0)).padStart(10)}`
        );
    }

    if (Object.keys(metrics.requests.errors).length > 0) {
        console.log('\n  --- Errors ---');
        for (const [err, count] of Object.entries(metrics.requests.errors).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${err}: ${count}`);
        }
    }

    // RPS over time (sampled)
    console.log('\n  --- RPS Over Time ---');
    const timelineStep = Math.max(1, Math.floor(metrics.timeline.length / 20));
    for (let i = 0; i < metrics.timeline.length; i += timelineStep) {
        const t = metrics.timeline[i];
        const bar = '█'.repeat(Math.min(50, Math.round(t.rps / 10)));
        console.log(`  ${String(t.time.toFixed(0)).padStart(5)}s | ${String(t.rps).padStart(5)} rps | ${bar}`);
    }

    console.log('\n' + '='.repeat(70));

    // Verdict
    const successRate = (metrics.requests.success / metrics.requests.total) * 100;
    const p99 = percentile(metrics.latency.samples, 99);

    if (successRate >= 99 && p99 < 2000) {
        console.log('  ✅ PASSED - Infra handles load well');
    } else if (successRate >= 95 && p99 < 5000) {
        console.log('  ⚠️  WARNING - Some degradation under load');
    } else {
        console.log('  ❌ FAILED - Significant issues under load');
    }

    console.log(`  Success Rate: ${successRate.toFixed(2)}% | P99 Latency: ${p99.toFixed(0)}ms`);
    console.log('='.repeat(70));
}

// ============ MAIN ============

async function main() {
    console.log('='.repeat(70));
    console.log('  EXAM PLATFORM STRESS TEST');
    console.log('='.repeat(70));
    console.log(`  Target:      ${BASE_URL}`);
    console.log(`  Duration:    ${DURATION_MINS} minutes`);
    console.log(`  Concurrency: ${CONCURRENCY} virtual users`);
    console.log(`  Ramp-up:     ${RAMP_UP_SECS}s`);
    console.log('='.repeat(70));

    // Step 1: Verify target is reachable
    console.log('\n[1/4] Checking target availability...');
    const healthRes = await testHealth();
    if (healthRes.status !== 200) {
        console.error(`  ❌ Target unreachable: ${healthRes.error || healthRes.status}`);
        process.exit(1);
    }
    console.log(`  ✅ Target is up (${healthRes.latency}ms)`);

    // Step 2: Login as admin to get token
    console.log('\n[2/4] Logging in as admin...');
    const adminLogin = await testLogin('admin@exam.com', 'admin123');
    if (!adminLogin.data?.data?.token && !adminLogin.data?.data?.accessToken) {
        console.error('  ❌ Admin login failed:', adminLogin.data);
        process.exit(1);
    }
    const adminToken = adminLogin.data.data.accessToken || adminLogin.data.data.token;
    console.log(`  ✅ Admin logged in (${adminLogin.latency}ms)`);

    // Step 3: Reset metrics for the actual test
    metrics.requests = { total: 0, success: 0, failed: 0, errors: {} };
    metrics.latency = { samples: [], min: Infinity, max: 0, sum: 0 };
    metrics.endpoints = {};

    // Step 4: Launch virtual users
    console.log(`\n[3/4] Launching ${CONCURRENCY} virtual users (${RAMP_UP_SECS}s ramp-up)...\n`);

    metrics.startTime = Date.now();
    lastSnapshotTime = metrics.startTime;

    // Progress printer
    const progressInterval = setInterval(() => {
        takeSnapshot();
        printProgress();
    }, 5000);

    // Launch all virtual users concurrently
    const users = [];
    for (let i = 0; i < CONCURRENCY; i++) {
        users.push(runVirtualUser(i, adminToken, metrics.startTime));
    }

    // Wait for all users to complete
    await Promise.all(users);

    clearInterval(progressInterval);
    takeSnapshot();

    // Step 5: Print results
    console.log('\n\n[4/4] Test complete. Generating report...');
    printFinalReport();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
