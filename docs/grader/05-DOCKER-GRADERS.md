# Docker Graders

This document covers the implementation details of the Docker-based graders.

## Overview

The platform has three Docker-based graders:

1. **Docker Grader** (`docker-grader.ts`) - Standard container isolation for Jest tests
2. **Docker Blackbox Grader** (`docker-blackbox-grader.ts`) - Two-container HTTP testing
3. **Docker Playwright Grader** (`docker-playwright-grader.ts`) - Two-container E2E browser testing

---

## 1. Docker Grader (Standard)

### File: `apps/api/src/lib/docker-grader.ts`

### Purpose

Runs Jest tests inside Docker containers with network isolation. Tests import candidate code directly.

### Execution Flow

```
1. Create temp directories
   ├── /tmp/grader_pub_xxx/  (public tests)
   └── /tmp/grader_hid_xxx/  (hidden tests)

2. For each test type:
   a. Write candidate files (validated paths)
   b. Write test file to __tests__/<type>.test.js
   c. Create package.json with dependencies
   
   d. Phase 1: Install dependencies
      ┌─────────────────────────────────────────┐
      │ docker run --network bridge            │
      │   node:20-alpine                        │
      │   npm install --legacy-peer-deps       │
      └─────────────────────────────────────────┘
   
   e. Phase 2: Run tests
      ┌─────────────────────────────────────────┐
      │ docker run --network none              │
      │   node:20-alpine                        │
      │   npm test                              │
      └─────────────────────────────────────────┘
   
   f. Parse results.json

3. Combine scores
4. Cleanup directories
```

### Container Configuration

```typescript
const dockerArgs = [
  'run',
  '--rm',
  '--memory', `${memoryLimit}m`,
  '--memory-swap', `${memoryLimit}m`,
  '--cpus', '1',
  '--pids-limit', '100',
  '--read-only',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',
  '--tmpfs', '/home/node/.npm:rw,size=200m',
  '-v', `${workDir}:/app:rw`,
  '-w', '/app',
  '--user', '1000:1000',
];

// Disable network for test phase
if (!networkEnabled) {
  dockerArgs.push('--network', 'none');
}
```

### Key Functions

```typescript
// Main entry point
export async function runGrader(job: GradingJob): Promise<GradingResult> {
  // Delegates to blackbox/playwright if runner mode specified
  if (job.runner?.mode === 'http') {
    return runDockerBlackboxGrader(job);
  }
  if (job.runner?.mode === 'playwright') {
    return runDockerPlaywrightGrader(job);
  }
  
  // Otherwise standard Jest execution...
}

// Run tests in isolated container
async function runTestsInIsolation(config: TestRunConfig): Promise<TestRunResult>

// Execute docker command with timeout
async function executeDocker(options: DockerExecOptions): Promise<string>

// Parse Jest JSON output
async function parseTestResults(workDir: string, logs: string): Promise<TestRunResult>
```

---

## 2. Docker Blackbox Grader

### File: `apps/api/src/lib/docker-blackbox-grader.ts`

### Purpose

Two-container architecture where:
- Container A runs candidate server
- Container B runs tests via HTTP

This ensures hidden tests are NEVER accessible to candidate code.

### Execution Flow

```
1. Create workspaces
   ├── /tmp/grader_bb_xxx_cand/  (candidate code)
   └── /tmp/grader_bb_xxx_tests/ (test code)

2. Write candidate files to candidate workspace
3. Write test harness to test workspace

4. Install dependencies (network enabled)
   ├── Candidate: npm install
   └── Tests: npm install (jest, supertest)

5. Create isolated network
   docker network create --internal grader_net_xxx

6. Start candidate server (detached)
   docker run -d --network grader_net_xxx \
     --network-alias candidate \
     node:20-alpine sh -c "node server.js"

7. Wait for server ready (health check)

8. Run tests
   docker run --network grader_net_xxx \
     -e BASE_URL=http://candidate:3000 \
     node:20-alpine sh -c "npm test"

9. Parse results

10. Cleanup containers and network
```

### Network Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Docker Network: grader_net_xxx              │
│              (--internal = no external egress)           │
│                                                          │
│  ┌────────────────────┐    ┌────────────────────┐       │
│  │ Candidate Container│    │ Test Container     │       │
│  │                    │    │                    │       │
│  │ Name: grader_cand  │    │ Name: grader_test  │       │
│  │ Alias: candidate   │    │                    │       │
│  │                    │    │                    │       │
│  │ Exposes: 3000      │◀───│ Connects via HTTP  │       │
│  │                    │    │ BASE_URL=          │       │
│  │                    │    │ http://candidate:  │       │
│  │                    │    │ 3000               │       │
│  └────────────────────┘    └────────────────────┘       │
│                                                          │
│  ❌ No internet access                                   │
│  ✅ Containers can talk to each other                   │
└──────────────────────────────────────────────────────────┘
```

### Key Functions

```typescript
// Main entry point
export async function runDockerBlackboxGrader(job: GradingJob): Promise<GradingResult>

// Run one test phase (public or hidden)
async function runHttpPhase(params: {
  job: GradingJob;
  runner: Extract<ChallengeRunner, { mode: 'http' }>;
  testType: 'public' | 'hidden';
  testCode: string;
}): Promise<TestRunResult>

// Write candidate workspace with path validation
async function writeCandidateWorkspace(params: {
  workDir: string;
  files: Record<string, unknown>;
  generatedFiles?: Record<string, string>;
}): Promise<number>

// Write Jest test harness with global setup
async function writeJestBlackboxHarness(params: {
  workDir: string;
  testType: 'public' | 'hidden';
  testCode: string;
}): Promise<void>

// Run detached container (for candidate server)
async function dockerRunDetached(params: DockerDetachedParams): Promise<void>

// Run container and wait for completion
async function dockerRunOnce(params: DockerRunParams): Promise<string>

// Cleanup containers and networks
async function safeDockerCleanup(params: {
  containerName?: string;
  networkName?: string;
}): Promise<void>
```

### Global Setup (Health Check)

The test container waits for the candidate server:

```javascript
// global-setup.js (auto-generated by grader)
module.exports = async () => {
  const baseUrl = process.env.BASE_URL;
  const healthPath = process.env.HEALTH_PATH || '/';
  const timeoutMs = parseInt(process.env.STARTUP_TIMEOUT_MS || '20000');
  
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl + healthPath, { 
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (res && typeof res.status === 'number') return;
    } catch (e) {
      // Server not ready
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  throw new Error('Server did not start in time');
};
```

### Error Handling

If the candidate server crashes:

```typescript
// Check if container is still running
let candidateIsRunning = false;
try {
  const inspect = await dockerExec({
    args: ['inspect', '-f', '{{.State.Running}}', candidateName],
    timeoutMs: 5000,
  });
  candidateIsRunning = inspect.stdout.trim() === 'true';
} catch {
  candidateIsRunning = false;
}

// Get crash logs
if (!candidateIsRunning) {
  const logsResult = await dockerExec({
    args: ['logs', candidateName],
    timeoutMs: 5000,
  });
  
  // Return sanitized error
  return { 
    passed: 0, 
    total: 1, 
    logs: 'Server failed to start.\n\n' + sanitizeLogs(logsResult),
    success: false,
  };
}
```

---

## 3. Docker Playwright Grader

### File: `apps/api/src/lib/docker-playwright-grader.ts`

### Purpose

Similar to blackbox grader but uses Playwright for browser-based E2E testing.

### Differences from HTTP Grader

| Aspect | HTTP Grader | Playwright Grader |
|--------|-------------|-------------------|
| Test Container | node:20-alpine | mcr.microsoft.com/playwright:v1.57.0-jammy |
| Test Framework | Jest + Supertest | Playwright |
| Test Method | HTTP requests | Browser automation |
| Result Format | JSON | JUnit XML |
| Memory | 256-1024 MB | 512-2048 MB |
| Timeout | 120s | 180s |

### Execution Flow

```
1. Create workspaces (same as HTTP)

2. Write candidate files (same as HTTP)

3. Write Playwright harness
   - tests/public.spec.js or tests/hidden.spec.js
   - playwright.config.js
   - package.json with @playwright/test

4. Install dependencies
   - Candidate: npm install
   - Tests: npm install (playwright)

5. Create isolated network (same as HTTP)

6. Start candidate dev server

7. Wait for server ready (using alpine + wget probe)

8. Run Playwright tests
   docker run --network grader_net_xxx \
     -e BASE_URL=http://candidate:3000 \
     mcr.microsoft.com/playwright:v1.57.0-jammy \
     npx playwright test --reporter=junit

9. Parse JUnit XML results

10. Cleanup
```

### Playwright Config (Auto-generated)

```javascript
// playwright.config.js
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  use: {
    baseURL: process.env.BASE_URL,
    headless: true,
  },
  retries: 0,
});
```

### JUnit Result Parsing

```typescript
function parseJUnit(xml: string): { 
  total: number; 
  failures: number; 
  errors: number; 
  skipped: number;
} {
  const suiteTagMatches = [...xml.matchAll(/<testsuite\b[^>]*>/g)];
  
  let total = 0, failures = 0, errors = 0, skipped = 0;
  
  for (const m of suiteTagMatches) {
    const tag = m[0];
    const getAttr = (name: string) => {
      const attr = tag.match(new RegExp(`${name}="(\\d+)"`));
      return attr ? parseInt(attr[1], 10) : 0;
    };
    
    total += getAttr('tests');
    failures += getAttr('failures');
    errors += getAttr('errors');
    skipped += getAttr('skipped');
  }
  
  return { total, failures, errors, skipped };
}
```

---

## 4. Container Settings Reference

### Memory Limits

| Grader | Default | Min | Max |
|--------|---------|-----|-----|
| Docker | job.memoryLimit | 256 MB | 1024 MB |
| Blackbox (candidate) | job.memoryLimit | 256 MB | 1024 MB |
| Blackbox (tests) | 256-1024 MB | 256 MB | 1024 MB |
| Playwright (candidate) | job.memoryLimit | 512 MB | 2048 MB |
| Playwright (tests) | 512-2048 MB | 512 MB | 2048 MB |

### Timeouts

| Phase | Default | Max |
|-------|---------|-----|
| npm install | 120s | 180s |
| Jest tests | job.timeLimit (60-120s) | 300s |
| Playwright tests | 180s | 600s |
| Server startup | 20s (HTTP), 30s (Playwright) | 180s |
| Docker command | 15s | 30s |

### Process Limits

| Container Type | PID Limit |
|----------------|-----------|
| Standard | 100 |
| Blackbox | 150 |
| Playwright | 200 |

### Filesystem

| Mount | Permissions | Size |
|-------|-------------|------|
| `/app` | rw | Workspace size |
| `/tmp` | rw,noexec,nosuid | 100-300 MB |
| `/home/node/.npm` | rw | 200 MB |
| Root filesystem | read-only | N/A |

---

## 5. Cleanup

All graders implement cleanup in `finally` blocks:

```typescript
try {
  // Run grading...
} finally {
  // Always cleanup
  await safeDockerCleanup({ containerName, networkName });
  await Promise.all([
    rm(candidateDir, { recursive: true, force: true }).catch(() => {}),
    rm(testsDir, { recursive: true, force: true }).catch(() => {}),
  ]);
}
```

The cleanup function handles errors gracefully:

```typescript
async function safeDockerCleanup(params: { 
  containerName?: string; 
  networkName?: string; 
}) {
  const cleanups: Promise<unknown>[] = [];
  
  if (containerName) {
    cleanups.push(
      dockerExec({ args: ['rm', '-f', containerName], timeoutMs: 5000 })
        .catch(() => {}) // Ignore errors
    );
  }
  
  if (networkName) {
    cleanups.push(
      dockerExec({ args: ['network', 'rm', networkName], timeoutMs: 5000 })
        .catch(() => {})
    );
  }
  
  await Promise.allSettled(cleanups);
}
```

---

## 6. Debugging

### View Container Logs

```bash
# List running containers
docker ps --filter "name=grader_"

# View container logs
docker logs grader_cand_xxx

# Inspect container
docker inspect grader_cand_xxx
```

### Common Issues

#### Container Exits Immediately

```
Cause: Syntax error in candidate code
Check: docker logs grader_cand_xxx
Fix: Improve error messages in health check failure
```

#### Tests Timeout

```
Cause: Server not starting in time
Check: startupTimeoutMs configuration
Fix: Increase timeout or check healthPath
```

#### Network Creation Fails

```
Cause: Too many networks (Docker limit)
Check: docker network ls | grep grader
Fix: Cleanup old networks: docker network prune
```

#### Permission Denied

```
Cause: --user 1000:1000 and file permissions
Check: Directory permissions in temp folder
Fix: Ensure mkdir uses mode 0o755
```

