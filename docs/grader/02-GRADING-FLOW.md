# Grading Flow

This document describes the end-to-end flow of how candidate submissions are graded.

## Overview

The grading process involves multiple stages:

1. **Submission** - Candidate submits code via API
2. **Validation** - Files are validated for security
3. **Queuing** - Job added to BullMQ queue
4. **Processing** - Worker picks up and executes grading
5. **Result Delivery** - Results stored and delivered in real-time

---

## 1. Submission Stage

### Run Tests (Preview Mode)

```
POST /api/attempts/:id/run-tests
```

- Runs **public tests only** against current code
- Does NOT change attempt status
- Does NOT run hidden tests
- Rate limited to prevent queue flooding
- Used for quick feedback during exam

```typescript
// Job configuration for preview
{
  attemptId: "...",
  files: { "src/app.js": "..." },
  publicTests: "describe('Public', () => ...)",
  hiddenTests: "",  // Empty - no hidden tests
  isPreview: true,  // Don't change status
  timeLimit: 60,    // 1 minute
}
```

### Final Submit

```
POST /api/attempts/:id/submit
```

- Runs **both public and hidden tests**
- Changes status to `SUBMITTED` → `GRADING` → `COMPLETED`/`FAILED`
- Flushes any Redis-buffered autosaves first
- Stops the exam timer permanently

```typescript
// Job configuration for final submit
{
  attemptId: "...",
  files: { "src/app.js": "..." },
  publicTests: "describe('Public', () => ...)",
  hiddenTests: "describe('Hidden', () => ...)",
  isPreview: false,
  timeLimit: 120,  // 2 minutes
}
```

---

## 2. File Validation

Before queuing, all files are validated:

### Blocked Paths

```typescript
const BLOCKED_PATHS = [
  '__tests__',    // Test directories
  '__test__',
  'test',
  'tests',
  '.jest',        // Jest configuration
  'jest.config',
  'babel.config',
  'node_modules', // Dependencies
  'package.json',
  'package-lock.json',
  'results.json', // Test output
];
```

### Blocked Filename Patterns

```typescript
const BLOCKED_FILENAME_PATTERNS = [
  /\.test\.(js|jsx|ts|tsx)$/i,   // *.test.js
  /\.spec\.(js|jsx|ts|tsx)$/i,   // *.spec.js
  /^jest\./i,                     // jest.config.js
  /^babel\./i,                    // babel.config.js
  /^package(-lock)?\.json$/i,     // package.json
  /^requirements\.txt$/i,         // Python deps
  /^go\.(mod|sum)$/i,            // Go modules
];
```

### Path Traversal Prevention

```typescript
function sanitizeFilePath(filePath: string, workDir: string): string | null {
  // Block obvious traversal patterns
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return null;
  }
  
  // Resolve and verify path stays within workDir
  const fullPath = resolve(workDir, sanitized);
  if (!fullPath.startsWith(normalizedWorkDir + '/')) {
    return null;
  }
  
  return fullPath;
}
```

---

## 3. Job Queue (BullMQ)

### Queue Configuration

```typescript
export const gradingQueue = new Queue<GradingJobWithPreview>('grading', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,              // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 1000,            // 1s, 2s, 4s
    },
    removeOnComplete: {
      count: 100,             // Keep last 100 completed
      age: 24 * 60 * 60,      // Keep for 24 hours
    },
    removeOnFail: {
      count: 50,              // Keep last 50 failed
    },
  },
});
```

### Job Data Structure

```typescript
interface GradingJob {
  attemptId: string;
  files: Record<string, string>;      // Candidate code
  publicTests: string;                 // Public test code
  hiddenTests: string;                 // Hidden test code
  dependencies: Record<string, string>; // npm packages
  nodeVersion: string;                 // e.g., "20"
  timeLimit: number;                   // seconds
  memoryLimit: number;                 // MB
  runner?: ChallengeRunner;            // Optional runner config
}

interface GradingJobWithPreview extends GradingJob {
  isPreview?: boolean;  // true for run-tests, false for submit
}
```

### Job Priority

```typescript
const queueJob = await gradingQueue.add('grade', job, {
  jobId: `grading_${job.attemptId}_${Date.now()}`,
  priority: job.isPreview ? 10 : 1,  // Submissions have higher priority
});
```

---

## 4. Worker Processing

### Worker Configuration

```typescript
const worker = new Worker<GradingJobWithPreview, GradingResult>(
  'grading',
  async (job) => { /* ... */ },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.GRADING_CONCURRENCY || '2'),
    limiter: {
      max: 10,
      duration: 60000,  // 10 jobs per minute max
    },
  }
);
```

### Grader Selection

```typescript
switch (GRADER_MODE) {
  case 'docker':
    // Check if challenge uses special runner
    if (job.data.runner?.mode === 'http') {
      result = await runDockerBlackboxGrader(job.data);
    } else if (job.data.runner?.mode === 'playwright') {
      result = await runDockerPlaywrightGrader(job.data);
    } else {
      result = await runGrader(job.data);  // Standard Docker
    }
    break;
    
  case 'sandboxed':
    result = await runSandboxedGrader(job.data);
    break;
    
  case 'local':
    result = await runLocalGrader(job.data);
    break;
}
```

---

## 5. Test Execution Flow

### Standard Docker Grader

```
1. Create temp directories:
   - /tmp/grader_pub_xxx/ (public tests)
   - /tmp/grader_hid_xxx/ (hidden tests)

2. For each test type (public, hidden):
   
   a. Write candidate files (with path validation)
   b. Write test file to __tests__/<type>.test.js
   c. Generate package.json with dependencies
   
   d. Phase 1: npm install (network ENABLED)
      docker run --network bridge ...
      
   e. Phase 2: Run tests (network DISABLED)
      docker run --network none ...
      
   f. Parse results.json from Jest output

3. Combine public + hidden results
4. Cleanup temp directories
```

### HTTP Blackbox Grader

```
1. Create candidate workspace + test workspace

2. Start isolated Docker network (--internal, no egress)

3. Start candidate container:
   docker run -d --network grader_net_xxx \
     --network-alias candidate \
     node:20-alpine sh -c "node server.js"

4. Wait for candidate server to be ready (health check)

5. Run test container:
   docker run --network grader_net_xxx \
     -e BASE_URL=http://candidate:3000 \
     node:20-alpine sh -c "npm test"

6. Parse test results

7. Cleanup containers and network
```

### Playwright Grader

```
1. Similar to HTTP blackbox, but:
   - Test container uses mcr.microsoft.com/playwright image
   - Tests use Playwright for browser automation
   - Results parsed from JUnit XML output
```

---

## 6. Result Structure

```typescript
interface GradingResult {
  publicScore: number;    // Tests passed in public suite
  hiddenScore: number;    // Tests passed in hidden suite
  totalPublic: number;    // Total public tests
  totalHidden: number;    // Total hidden tests
  logs: string;           // Sanitized test output
  success: boolean;       // All tests passed
  error?: string;         // Error message if failed
}
```

---

## 7. Result Delivery

### Database Update

```typescript
// grading-results.ts
export async function updateAttemptResults(
  attemptId: string,
  result: GradingResult,
  isPreview: boolean
) {
  const sanitizedLogs = sanitizeLogs(result.logs, isPreview);
  
  await db.update(examAttempts)
    .set({
      publicScore: result.publicScore,
      hiddenScore: result.hiddenScore,
      totalPublic: result.totalPublic,
      totalHidden: result.totalHidden,
      gradingLogs: sanitizedLogs,
      gradedAt: new Date(),
      status: isPreview ? undefined : (result.success ? 'COMPLETED' : 'FAILED'),
    })
    .where(eq(examAttempts.id, attemptId));
}
```

### Real-time Delivery

```typescript
// Publish to Redis pub/sub
await redisPublisher.publish(
  REDIS_CHANNELS.GRADING_COMPLETE,
  JSON.stringify({
    attemptId,
    result: sanitizedResult,
    isPreview,
    jobId: job.id,
  })
);

// Socket.IO server subscribes and emits to client
socket.emit('grading:complete', data);
```

---

## 8. Auto-save Flow

During exam, files are auto-saved via Redis buffer:

```
1. Client sends file changes every few seconds
   PUT /api/attempts/:id/files

2. API saves to Redis buffer (fast, non-blocking)
   await saveToBuffer(attemptId, files);

3. Background job periodically flushes to database
   await flushToDatabase(attemptId);

4. On final submit, flush buffer first
   await flushToDatabase(attemptId);
   // Then use latest files for grading
```

This prevents database overload while ensuring no work is lost.

---

## 9. Timer Auto-submit

When exam time expires:

```
1. Timer service detects expiration
2. Auto-submits with current buffered files
3. Queues grading job
4. Candidate notified via WebSocket
```

---

## Sequence Diagram

```
Candidate         API            Redis/BullMQ      Worker          Docker
    │               │                  │              │               │
    │──POST submit──▶                  │              │               │
    │               │                  │              │               │
    │               │──Validate files──│              │               │
    │               │                  │              │               │
    │               │──Add job────────▶│              │               │
    │               │                  │              │               │
    │◀──Job queued──│                  │              │               │
    │               │                  │──Pick job───▶│               │
    │               │                  │              │               │
    │               │                  │              │──Run public──▶│
    │               │                  │              │               │
    │               │                  │              │◀──Results─────│
    │               │                  │              │               │
    │               │                  │              │──Run hidden──▶│
    │               │                  │              │               │
    │               │                  │              │◀──Results─────│
    │               │                  │              │               │
    │               │                  │◀─Update DB───│               │
    │               │                  │              │               │
    │               │                  │◀─Publish─────│               │
    │               │                  │              │               │
    │◀──────────Socket.IO emit─────────│              │               │
    │               │                  │              │               │
```

