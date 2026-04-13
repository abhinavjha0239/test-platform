#!/usr/bin/env npx tsx
/**
 * Security Audit Script for Exam Platform
 * 
 * Tests for:
 * 1. Rate limiting effectiveness
 * 2. Authorization bypass attempts
 * 3. Hidden test exposure
 * 4. Other candidate data access
 * 5. Time manipulation
 * 6. Grading queue abuse
 * 7. File path injection
 * 8. Load testing with 300 candidates
 */

const API_URL = process.env.API_URL || 'http://13.127.171.253';

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function addResult(result: TestResult) {
    results.push(result);
    const icon = result.passed ? '✅' : '❌';
    const severityIcon = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
        info: 'ℹ️'
    }[result.severity];
    console.log(`${icon} ${severityIcon} ${result.name}: ${result.details}`);
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// ============ TEST FUNCTIONS ============

async function testLoginRateLimit(): Promise<void> {
    log('Testing login rate limiting...');
    
    const attempts: number[] = [];
    const maxAttempts = 10;
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'fake@test.com', password: 'wrong' }),
            });
            attempts.push(res.status);
        } catch (e) {
            attempts.push(0);
        }
    }
    
    const rateLimited = attempts.filter(s => s === 429).length;
    
    addResult({
        name: 'Login Rate Limiting',
        passed: rateLimited > 0,
        details: `${rateLimited}/${maxAttempts} requests rate limited (429). Status codes: ${attempts.join(',')}`,
        severity: rateLimited > 0 ? 'info' : 'critical',
    });
}

async function testRegistrationRateLimit(): Promise<void> {
    log('Testing registration rate limiting...');
    
    const attempts: number[] = [];
    const maxAttempts = 5;
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await fetchWithTimeout(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: `fake${Date.now()}${i}@test.com`, 
                    password: 'test123456' 
                }),
            });
            attempts.push(res.status);
        } catch (e) {
            attempts.push(0);
        }
    }
    
    const rateLimited = attempts.filter(s => s === 429).length;
    
    addResult({
        name: 'Registration Rate Limiting',
        passed: rateLimited > 0 || attempts.filter(s => s === 201).length <= 3,
        details: `Status codes: ${attempts.join(',')}. Rate limited: ${rateLimited}`,
        severity: rateLimited > 0 ? 'info' : 'high',
    });
}

async function testAPIRateLimit(token: string): Promise<void> {
    log('Testing API rate limiting (200 req/min)...');
    
    const promises: Promise<number>[] = [];
    const requestCount = 250; // Try to exceed 200/min limit
    
    for (let i = 0; i < requestCount; i++) {
        promises.push(
            fetchWithTimeout(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` },
            }, 5000)
            .then(r => r.status)
            .catch(() => 0)
        );
    }
    
    const results = await Promise.all(promises);
    const rateLimited = results.filter(s => s === 429).length;
    const successful = results.filter(s => s === 200).length;
    
    addResult({
        name: 'API Rate Limiting (200/min)',
        passed: rateLimited > 0,
        details: `${successful} successful, ${rateLimited} rate limited out of ${requestCount} requests`,
        severity: rateLimited > 0 ? 'info' : 'medium',
    });
}

async function testUnauthorizedAccess(): Promise<void> {
    log('Testing unauthorized access...');
    
    // Test accessing attempts without token
    const noTokenRes = await fetchWithTimeout(`${API_URL}/api/attempts`, {
        headers: { 'Content-Type': 'application/json' },
    });
    
    addResult({
        name: 'Attempts without Token',
        passed: noTokenRes.status === 401,
        details: `Expected 401, got ${noTokenRes.status}`,
        severity: noTokenRes.status === 401 ? 'info' : 'critical',
    });
    
    // Test with invalid token
    const invalidTokenRes = await fetchWithTimeout(`${API_URL}/api/attempts`, {
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid-token-here',
        },
    });
    
    addResult({
        name: 'Attempts with Invalid Token',
        passed: invalidTokenRes.status === 401,
        details: `Expected 401, got ${invalidTokenRes.status}`,
        severity: invalidTokenRes.status === 401 ? 'info' : 'critical',
    });
}

async function testChallengesAccess(candidateToken: string): Promise<void> {
    log('Testing challenges access (should be admin only)...');
    
    const res = await fetchWithTimeout(`${API_URL}/api/challenges`, {
        headers: { 'Authorization': `Bearer ${candidateToken}` },
    });
    
    addResult({
        name: 'Challenges Access (Candidate)',
        passed: res.status === 403,
        details: `Expected 403, got ${res.status}`,
        severity: res.status === 403 ? 'info' : 'critical',
    });
}

async function testHiddenTestsExposure(candidateToken: string, attemptId: string): Promise<void> {
    log('Testing hidden tests exposure...');
    
    const res = await fetchWithTimeout(`${API_URL}/api/attempts/${attemptId}`, {
        headers: { 'Authorization': `Bearer ${candidateToken}` },
    });
    
    if (res.status !== 200) {
        addResult({
            name: 'Hidden Tests Exposure',
            passed: false,
            details: `Could not fetch attempt: ${res.status}`,
            severity: 'medium',
        });
        return;
    }
    
    const data = await res.json();
    const hiddenTests = data.data?.exam?.challenge?.hiddenTests;
    
    addResult({
        name: 'Hidden Tests Exposure',
        passed: hiddenTests === '[HIDDEN]' || !hiddenTests,
        details: hiddenTests === '[HIDDEN]' ? 'Hidden tests properly masked' : `Hidden tests exposed: ${hiddenTests?.substring(0, 50)}...`,
        severity: hiddenTests === '[HIDDEN]' || !hiddenTests ? 'info' : 'critical',
    });
}

async function testOtherCandidateAccess(token1: string, token2: string, attemptId: string): Promise<void> {
    log('Testing access to other candidate attempts...');
    
    // Try to access candidate1's attempt with candidate2's token
    const res = await fetchWithTimeout(`${API_URL}/api/attempts/${attemptId}`, {
        headers: { 'Authorization': `Bearer ${token2}` },
    });
    
    addResult({
        name: 'Other Candidate Attempt Access',
        passed: res.status === 403 || res.status === 404,
        details: `Expected 403/404, got ${res.status}`,
        severity: res.status === 403 || res.status === 404 ? 'info' : 'critical',
    });
}

async function testFilePathInjection(token: string, attemptId: string): Promise<void> {
    log('Testing file path injection...');
    
    const maliciousPaths = [
        '../../../etc/passwd',
        '/etc/passwd',
        '..\\..\\windows\\system32',
        '.hidden/file.js',
        'src/../../../secret.js',
    ];
    
    for (const path of maliciousPaths) {
        const res = await fetchWithTimeout(`${API_URL}/api/attempts/${attemptId}/files`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ files: { [path]: 'malicious content' } }),
        });
        
        addResult({
            name: `Path Injection: ${path.substring(0, 20)}...`,
            passed: res.status === 400,
            details: `Expected 400, got ${res.status}`,
            severity: res.status === 400 ? 'info' : 'high',
        });
    }
}

async function testRunTestsSpam(token: string, attemptId: string): Promise<void> {
    log('Testing run-tests spam protection...');
    
    // Send multiple run-tests requests simultaneously
    const promises = Array(5).fill(null).map(() =>
        fetchWithTimeout(`${API_URL}/api/attempts/${attemptId}/run-tests`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        }).then(r => r.status).catch(() => 0)
    );
    
    const results = await Promise.all(promises);
    const successful = results.filter(s => s === 200).length;
    const rateLimited = results.filter(s => s === 429).length;
    
    addResult({
        name: 'Run Tests Spam Protection',
        passed: successful <= 1 && rateLimited >= 4,
        details: `${successful} successful, ${rateLimited} rate limited out of 5 simultaneous requests`,
        severity: successful <= 1 ? 'info' : 'medium',
    });
}

async function testReportsAccess(candidateToken: string): Promise<void> {
    log('Testing reports access (should be admin/reviewer only)...');
    
    const res = await fetchWithTimeout(`${API_URL}/api/reports/dashboard`, {
        headers: { 'Authorization': `Bearer ${candidateToken}` },
    });
    
    addResult({
        name: 'Reports Dashboard Access (Candidate)',
        passed: res.status === 403,
        details: `Expected 403, got ${res.status}`,
        severity: res.status === 403 ? 'info' : 'critical',
    });
}

async function testAdminUsersAccess(candidateToken: string): Promise<void> {
    log('Testing admin users access...');
    
    const res = await fetchWithTimeout(`${API_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${candidateToken}` },
    });
    
    addResult({
        name: 'Admin Users Access (Candidate)',
        passed: res.status === 403,
        details: `Expected 403, got ${res.status}`,
        severity: res.status === 403 ? 'info' : 'critical',
    });
}

async function testSubmitAfterSubmission(token: string, attemptId: string): Promise<void> {
    log('Testing submit after already submitted...');
    
    // Note: This requires an already submitted attempt
    const res = await fetchWithTimeout(`${API_URL}/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ files: {} }),
    });
    
    addResult({
        name: 'Submit After Submission',
        passed: res.status === 400,
        details: `Expected 400 (already submitted), got ${res.status}`,
        severity: res.status === 400 ? 'info' : 'high',
    });
}

// ============ LOAD TESTING ============

async function createTestCandidate(index: number): Promise<{ token: string; email: string } | null> {
    const email = `loadtest_${Date.now()}_${index}@test.com`;
    const password = 'loadtest123456';
    
    try {
        const res = await fetchWithTimeout(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        }, 15000);
        
        if (res.status === 201) {
            const data = await res.json();
            return { token: data.data.accessToken || data.data.token, email };
        }
        return null;
    } catch {
        return null;
    }
}

async function testConcurrentCandidates(count: number, examId: string): Promise<void> {
    log(`Testing ${count} concurrent candidates...`);
    
    const startTime = Date.now();
    const candidates: Array<{ token: string; email: string }> = [];
    
    // Create candidates in batches
    const batchSize = 50;
    for (let i = 0; i < count; i += batchSize) {
        const batch = Math.min(batchSize, count - i);
        const promises = Array(batch).fill(null).map((_, j) => createTestCandidate(i + j));
        const results = await Promise.all(promises);
        candidates.push(...results.filter(Boolean) as Array<{ token: string; email: string }>);
        log(`Created ${candidates.length}/${count} candidates...`);
    }
    
    addResult({
        name: `Candidate Creation (${count})`,
        passed: candidates.length >= count * 0.9, // 90% success rate
        details: `Created ${candidates.length}/${count} candidates in ${Date.now() - startTime}ms`,
        severity: candidates.length >= count * 0.9 ? 'info' : 'medium',
    });
    
    if (candidates.length === 0) {
        log('No candidates created, skipping concurrent tests');
        return;
    }
    
    // Test concurrent API calls
    log('Testing concurrent /me calls...');
    const meStartTime = Date.now();
    const mePromises = candidates.map(c =>
        fetchWithTimeout(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${c.token}` },
        }, 10000)
        .then(r => r.status)
        .catch(() => 0)
    );
    
    const meResults = await Promise.all(mePromises);
    const meSuccessful = meResults.filter(s => s === 200).length;
    const meDuration = Date.now() - meStartTime;
    
    addResult({
        name: `Concurrent /me Calls (${candidates.length})`,
        passed: meSuccessful >= candidates.length * 0.95,
        details: `${meSuccessful}/${candidates.length} successful in ${meDuration}ms (${Math.round(meDuration / candidates.length)}ms avg)`,
        severity: meSuccessful >= candidates.length * 0.95 ? 'info' : 'high',
    });
    
    // Test concurrent exam access
    log('Testing concurrent exam access...');
    const examStartTime = Date.now();
    const examPromises = candidates.map(c =>
        fetchWithTimeout(`${API_URL}/api/exams/${examId}`, {
            headers: { 'Authorization': `Bearer ${c.token}` },
        }, 10000)
        .then(r => r.status)
        .catch(() => 0)
    );
    
    const examResults = await Promise.all(examPromises);
    const examSuccessful = examResults.filter(s => s === 200).length;
    const examDuration = Date.now() - examStartTime;
    
    addResult({
        name: `Concurrent Exam Access (${candidates.length})`,
        passed: examSuccessful >= candidates.length * 0.95,
        details: `${examSuccessful}/${candidates.length} successful in ${examDuration}ms`,
        severity: examSuccessful >= candidates.length * 0.95 ? 'info' : 'high',
    });
}

// ============ MAIN ============

async function main() {
    console.log('='.repeat(60));
    console.log('EXAM PLATFORM SECURITY AUDIT');
    console.log('='.repeat(60));
    console.log(`API URL: ${API_URL}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    
    // Get command line args
    const args = process.argv.slice(2);
    const loadTestCount = parseInt(args.find(a => a.startsWith('--load='))?.split('=')[1] || '0');
    const candidateToken = args.find(a => a.startsWith('--token='))?.split('=')[1];
    const attemptId = args.find(a => a.startsWith('--attempt='))?.split('=')[1];
    const examId = args.find(a => a.startsWith('--exam='))?.split('=')[1];
    
    // 1. Rate Limiting Tests
    console.log('\n📊 RATE LIMITING TESTS');
    console.log('-'.repeat(40));
    await testLoginRateLimit();
    await testRegistrationRateLimit();
    
    // 2. Authorization Tests
    console.log('\n🔐 AUTHORIZATION TESTS');
    console.log('-'.repeat(40));
    await testUnauthorizedAccess();
    
    if (candidateToken) {
        await testChallengesAccess(candidateToken);
        await testReportsAccess(candidateToken);
        await testAdminUsersAccess(candidateToken);
        await testAPIRateLimit(candidateToken);
        
        if (attemptId) {
            await testHiddenTestsExposure(candidateToken, attemptId);
            await testFilePathInjection(candidateToken, attemptId);
            await testRunTestsSpam(candidateToken, attemptId);
        }
    } else {
        log('⚠️ No candidate token provided. Skipping authenticated tests.');
        log('   Usage: --token=<jwt_token> --attempt=<attempt_id>');
    }
    
    // 3. Load Testing
    if (loadTestCount > 0 && examId) {
        console.log('\n🚀 LOAD TESTING');
        console.log('-'.repeat(40));
        await testConcurrentCandidates(loadTestCount, examId);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SECURITY AUDIT SUMMARY');
    console.log('='.repeat(60));
    
    const critical = results.filter(r => !r.passed && r.severity === 'critical').length;
    const high = results.filter(r => !r.passed && r.severity === 'high').length;
    const medium = results.filter(r => !r.passed && r.severity === 'medium').length;
    const passed = results.filter(r => r.passed).length;
    
    console.log(`Total Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`🔴 Critical Issues: ${critical}`);
    console.log(`🟠 High Issues: ${high}`);
    console.log(`🟡 Medium Issues: ${medium}`);
    
    if (critical > 0) {
        console.log('\n🔴 CRITICAL ISSUES FOUND:');
        results.filter(r => !r.passed && r.severity === 'critical').forEach(r => {
            console.log(`   - ${r.name}: ${r.details}`);
        });
    }
    
    if (high > 0) {
        console.log('\n🟠 HIGH ISSUES FOUND:');
        results.filter(r => !r.passed && r.severity === 'high').forEach(r => {
            console.log(`   - ${r.name}: ${r.details}`);
        });
    }
    
    console.log('\n' + '='.repeat(60));
    
    // Exit with error code if critical issues found
    process.exit(critical > 0 ? 1 : 0);
}

main().catch(console.error);
