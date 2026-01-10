# Security Model

This document describes the security measures implemented in the grading system to protect against various attack vectors.

## Threat Model

### Adversary Capabilities

We assume candidates may attempt to:

1. **Read hidden tests** - Extract hidden test code or expected values
2. **Modify tests** - Inject their own tests that always pass
3. **Path traversal** - Access files outside their workspace
4. **Resource abuse** - Consume excessive CPU, memory, or network
5. **Escape container** - Break out of Docker isolation
6. **Data exfiltration** - Send code or answers to external servers
7. **Denial of service** - Crash the grading system

---

## Defense Layers

### Layer 1: Input Validation (API Level)

All file submissions are validated before reaching the grader.

#### Path Validation

```typescript
function validateFilePaths(files: Record<string, string>): void {
  for (const filePath of Object.keys(files)) {
    // 1. Block path traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
      throw new ApiError(`Invalid file path: ${filePath}`, 400);
    }
    
    // 2. Block hidden files/directories
    const parts = filePath.split('/');
    if (parts.some(part => part.startsWith('.'))) {
      throw new ApiError(`Hidden files not allowed: ${filePath}`, 400);
    }
    
    // 3. Block test directories
    const normalizedPath = filePath.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
      if (normalizedPath.startsWith(blocked + '/')) {
        throw new ApiError(`Writing to '${blocked}' is not allowed`, 400);
      }
    }
    
    // 4. Block test file patterns
    for (const pattern of BLOCKED_FILENAME_PATTERNS) {
      if (pattern.test(filePath)) {
        throw new ApiError(`Test files not allowed: ${filePath}`, 400);
      }
    }
  }
}
```

#### Blocked Paths

| Path | Reason |
|------|--------|
| `__tests__/` | Jest test directory |
| `test/`, `tests/` | Common test directories |
| `node_modules/` | Dependency injection |
| `package.json` | Dependency manipulation |
| `jest.config.js` | Test config tampering |
| `babel.config.js` | Build config tampering |

#### Blocked Filename Patterns

| Pattern | Example | Reason |
|---------|---------|--------|
| `*.test.js` | `app.test.js` | Test file injection |
| `*.spec.js` | `app.spec.js` | Test file injection |
| `jest.*.js` | `jest.setup.js` | Jest config |
| `package*.json` | `package.json` | Dependency manipulation |
| `requirements.txt` | - | Python dependency injection |
| `go.mod` | - | Go dependency injection |

---

### Layer 2: File System Isolation

#### Separate Test Directories

Public and hidden tests run in **completely separate directories**:

```typescript
const publicDir = join(tmpdir(), `grader_pub_${attemptId}_${timestamp}`);
const hiddenDir = join(tmpdir(), `grader_hid_${attemptId}_${timestamp}`);
```

This means:
- Candidate code in public test run cannot access hidden tests
- No shared state between test runs
- Each test type gets a fresh copy of candidate code

#### Strict Path Validation in Grader

Even within the grader, paths are validated again:

```typescript
function sanitizeFilePath(filePath: string, workDir: string): string | null {
  // Block traversal patterns
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return null;
  }
  
  // Resolve and verify containment
  const fullPath = resolve(workDir, sanitized);
  if (!fullPath.startsWith(normalizedWorkDir + '/')) {
    return null;
  }
  
  return fullPath;
}
```

---

### Layer 3: Container Isolation (Docker)

#### Docker Run Configuration

```typescript
const dockerArgs = [
  'run',
  '--rm',                               // Remove container after exit
  '--memory', `${memoryLimit}m`,        // Memory limit
  '--memory-swap', `${memoryLimit}m`,   // Prevent swap usage
  '--cpus', '1',                        // CPU limit
  '--pids-limit', '100',                // Process limit
  '--read-only',                        // Read-only root filesystem
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',  // Writable /tmp
  '-v', `${workDir}:/app:rw`,           // Mount workspace
  '-w', '/app',                         // Working directory
  '--user', '1000:1000',                // Non-root user
];

// Network isolation for test phase
if (!networkEnabled) {
  dockerArgs.push('--network', 'none');
}
```

#### Security Properties

| Feature | Purpose |
|---------|---------|
| `--memory` | Prevents memory exhaustion |
| `--memory-swap` | Prevents swap abuse |
| `--cpus` | Prevents CPU monopolization |
| `--pids-limit` | Prevents fork bombs |
| `--read-only` | Prevents system file modification |
| `--tmpfs` | Controlled writable area |
| `--user 1000:1000` | Non-root execution |
| `--network none` | No network during tests |

---

### Layer 4: Network Isolation

#### Two-Phase Execution

```
Phase 1: Dependency Installation
┌─────────────────────────────────┐
│  Network: ENABLED               │
│  Purpose: npm install           │
│  Risk: Controlled (no code exec)│
└─────────────────────────────────┘

Phase 2: Test Execution
┌─────────────────────────────────┐
│  Network: DISABLED              │
│  Purpose: Run tests             │
│  Risk: Candidate code executes  │
│  Mitigation: No external access │
└─────────────────────────────────┘
```

This prevents:
- Sending exam answers to external servers
- Downloading additional code during tests
- Making API calls to cheat services

#### Blackbox Mode Network

For HTTP blackbox grading, containers are on an **internal network**:

```typescript
// Create isolated network with no egress
await dockerExec({
  args: ['network', 'create', '--internal', networkName],
  timeoutMs: 8000,
});
```

The `--internal` flag means:
- Containers can talk to each other
- No external internet access
- Test container can reach candidate server
- Neither can reach the outside world

---

### Layer 5: Hidden Test Protection

#### Separate Execution

Hidden tests are:
1. Written to a **separate directory**
2. Run in a **separate container**
3. Never mounted in the same container as public tests

```typescript
// Public tests
await runTestsInIsolation({
  workDir: publicDir,
  testCode: job.publicTests,
  testType: 'public',
});

// Hidden tests (SEPARATE directory and container)
await runTestsInIsolation({
  workDir: hiddenDir,
  testCode: job.hiddenTests,
  testType: 'hidden',
});
```

#### Log Sanitization

Before returning logs to candidates:

```typescript
const SANITIZE_PATTERNS = [
  // File paths containing "hidden"
  { pattern: /__tests__\/hidden\.test\.[jt]s/g, replacement: '[HIDDEN_TEST_FILE]' },
  
  // Stack traces from hidden tests
  { pattern: /at.*hidden\.test\.[jt]s:\d+:\d+/g, replacement: 'at [HIDDEN_TEST]' },
  
  // Test names that might reveal logic
  { pattern: /Hidden Tests?/gi, replacement: '[HIDDEN_TESTS]' },
];

function sanitizeLogs(logs: string, isPreview: boolean): string {
  if (isPreview) return logs;  // Preview only runs public tests
  
  let sanitized = logs;
  for (const { pattern, replacement } of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Remove lines containing hidden test paths
  const lines = sanitized.split('\n');
  return lines
    .filter(line => !line.toLowerCase().includes('hidden.test.'))
    .join('\n');
}
```

#### API Response Filtering

```typescript
// Candidates can only see their own attempts
if (req.user!.role === 'CANDIDATE') {
  // Always hide hidden test code
  if (attempt.exam?.challenge) {
    attempt.exam.challenge.hiddenTests = '[HIDDEN]';
  }
  
  // Hide hidden scores until completed
  if (attempt.status !== 'COMPLETED') {
    attempt.hiddenScore = undefined;
    attempt.totalHidden = undefined;
  }
}
```

---

### Layer 6: Test Pattern Enforcement

Jest is configured to ONLY run specific test patterns:

```typescript
const packageJson = {
  scripts: {
    // SECURITY: ONLY matches __tests__/<testType>.test.<ext>
    test: `jest --testPathPattern="__tests__/${testType}\\.test\\.(js|jsx)$"`,
  },
};
```

This prevents:
- Running tests from other locations
- Injecting additional test files
- Overriding the test discovery

---

### Layer 7: Blackbox Mode (Maximum Security)

For API challenges, the HTTP blackbox mode provides the strongest protection:

```
┌─────────────────────────────────────────────────────────┐
│                 CANDIDATE CONTAINER                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Files mounted:                                   │   │
│  │  - src/app.js  (candidate code)                  │   │
│  │  - src/server.js                                 │   │
│  │  - package.json (grader-generated)               │   │
│  │                                                   │   │
│  │  NOT mounted:                                     │   │
│  │  - __tests__/  ❌ (no tests at all)              │   │
│  │  - Any test code ❌                              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   TEST CONTAINER                         │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Files mounted:                                   │   │
│  │  - __tests__/public.test.js (or hidden)          │   │
│  │  - package.json                                  │   │
│  │                                                   │   │
│  │  NOT mounted:                                     │   │
│  │  - Any candidate code ❌                         │   │
│  │                                                   │   │
│  │  Tests via:                                       │   │
│  │  - HTTP requests to candidate container          │   │
│  │  - BASE_URL = http://candidate:3000              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Result**: Candidate code CANNOT access hidden tests because:
1. Hidden test code is never in the same container
2. There's no file path to read it
3. Only HTTP communication is possible
4. Test logic stays completely hidden

---

### Layer 8: Resource Limits

#### Time Limits

```typescript
// Execution timeout
const timer = setTimeout(() => {
  proc.kill('SIGKILL');
  reject(new Error('Execution timeout'));
}, timeout);
```

#### Memory Limits

```typescript
'--memory', `${memoryLimit}m`,
'--memory-swap', `${memoryLimit}m`,  // Prevent swap abuse
```

#### Process Limits

```typescript
'--pids-limit', '100',  // Prevent fork bombs
```

#### Job Queue Limits

```typescript
const worker = new Worker({
  concurrency: 2,        // Max 2 concurrent jobs
  limiter: {
    max: 10,
    duration: 60000,     // 10 jobs per minute
  },
});
```

---

### Layer 9: Authentication & Authorization

#### JWT Token Security

```typescript
// Token validation
if (!authHeader?.startsWith('Bearer ')) {
  throw new ApiError('Authorization header missing', 401);
}

const decoded = jwt.verify(token, SECRET) as JwtPayload;
```

#### Access Control

```typescript
// Candidates can only access their own attempts
if (req.user!.role === 'CANDIDATE' && attempt.candidateId !== req.user!.userId) {
  throw new ApiError('Not authorized', 403);
}
```

#### Rate Limiting

```typescript
// Prevent grading queue flooding
router.post('/:id/run-tests', authenticate, submissionLimiter, ...);
router.post('/:id/submit', authenticate, submissionLimiter, ...);
```

---

## Security Checklist

### Production Deployment

- [ ] `GRADER_MODE=docker` (never `local`)
- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` is set and secure
- [ ] Docker is available and configured
- [ ] Resource limits are appropriate
- [ ] Rate limits are enabled
- [ ] HTTPS enabled for API
- [ ] Database credentials secured

### Challenge Creation

- [ ] Hidden tests don't contain obvious answers
- [ ] Public tests give enough feedback
- [ ] Timeouts are reasonable
- [ ] Memory limits are appropriate
- [ ] Dependencies are specified correctly

---

## Incident Response

### If Hidden Tests Are Suspected Leaked

1. Immediately disable the exam
2. Review logs for suspicious activity
3. Rotate the challenge with new hidden tests
4. Investigate the leak vector
5. Update security measures

### If Container Escape Is Detected

1. Stop all grading workers
2. Audit Docker configuration
3. Update Docker to latest security patch
4. Review container runtime logs
5. Consider additional isolation (gVisor, Kata)

---

---

## Test Design Best Practices

### Preventing False Positives

A critical security issue is when tests pass **without any implementation**. This commonly happens with:

#### The "404 Trap"

**Problem**: Tests that only check for 404 responses can pass when routes don't exist at all.

```javascript
// ❌ BAD: This passes without implementation!
test('GET /todos/:id returns 404 for non-existent', async () => {
  const res = await request(BASE_URL).get('/todos/99999');
  expect(res.status).toBe(404);  // Express returns 404 for missing routes too!
});
```

**Solution**: First prove the endpoint exists, then test 404.

```javascript
// ✅ GOOD: This only passes with proper implementation
test('GET /todos/:id returns 404 for non-existent', async () => {
  // First, CREATE a todo to prove the endpoint works
  const createRes = await request(BASE_URL)
    .post('/todos')
    .send({ title: 'Prove endpoint works' });
  expect(createRes.status).toBe(201);
  
  // Then, GET it to prove GET /todos/:id works
  const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
  expect(getRes.status).toBe(200);
  expect(getRes.body.id).toBe(createRes.body.id);
  
  // NOW test 404 for non-existent ID (endpoint exists, but ID doesn't)
  const notFoundRes = await request(BASE_URL).get('/todos/99999');
  expect(notFoundRes.status).toBe(404);
});
```

#### The "400 Trap"

**Problem**: Tests that only check for 400 (validation error) can pass if the endpoint doesn't exist.

```javascript
// ❌ BAD: Might pass without implementation if endpoint returns 404
test('POST /todos without title returns 400', async () => {
  const res = await request(BASE_URL).post('/todos').send({});
  expect(res.status).toBe(400);
});
```

**Solution**: First prove the endpoint works with valid data.

```javascript
// ✅ GOOD: This only passes with proper implementation
test('POST /todos without title returns 400', async () => {
  // First prove POST works with valid data
  const validRes = await request(BASE_URL)
    .post('/todos')
    .send({ title: 'Valid todo' });
  expect(validRes.status).toBe(201);
  
  // NOW test 400 for invalid data
  const invalidRes = await request(BASE_URL).post('/todos').send({});
  expect(invalidRes.status).toBe(400);
});
```

### Safe Status Codes

These status codes are **safe** to test without proving the endpoint exists:

| Status | Why Safe |
|--------|----------|
| 200 | Requires endpoint to return data |
| 201 | Requires endpoint to create resource |
| 401 | Express returns 404 (not 401) for missing routes |
| 403 | Express returns 404 (not 403) for missing routes |

These status codes require **proving the endpoint exists first**:

| Status | Why Dangerous |
|--------|---------------|
| 404 | Express returns 404 for missing routes! |
| 400 | Express might return 404 for missing routes |

---

## Future Improvements

1. **gVisor/Kata Containers** - Additional kernel-level isolation
2. **Secure Computing Mode (seccomp)** - Syscall filtering
3. **Read-only code analysis** - Static analysis before execution
4. **Plagiarism detection** - Cross-submission similarity checking
5. **Anomaly detection** - Flag unusual patterns in submissions

