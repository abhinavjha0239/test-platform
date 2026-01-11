# Exam Platform - Grading System Overview

> **Production-Grade Automated Code Assessment Platform**

This document provides a comprehensive overview of our secure, scalable, and language-agnostic code grading infrastructure designed for high-stakes technical assessments.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Security Model](#security-model)
4. [Supported Technologies](#supported-technologies)
5. [Grading Modes](#grading-modes)
6. [Test Execution Flow](#test-execution-flow)
7. [Real-Time Monitoring](#real-time-monitoring)
8. [Anti-Cheat Measures](#anti-cheat-measures)
9. [Performance & Scalability](#performance--scalability)

---

## Executive Summary

Our grading system provides **secure, isolated, and deterministic** evaluation of candidate code submissions across multiple programming languages and frameworks. Key highlights:

| Feature | Description |
|---------|-------------|
| **Multi-Language Support** | Node.js, Python (FastAPI/Flask/Django), Go, Rust, React |
| **Container Isolation** | Full Docker-based sandboxing per submission |
| **Real-Time Feedback** | Live progress updates via WebSocket |
| **Dual Test Suites** | Public tests for debugging, hidden tests for final scoring |
| **Anti-Hardcoding** | Randomized hidden test values prevent memorization |
| **Proctoring Integration** | Tab switches, focus loss, and copy/paste tracking |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXAM PLATFORM                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   Frontend   │───▶│   API Server │───▶│  PostgreSQL  │                   │
│  │   (Next.js)  │    │   (Express)  │    │   Database   │                   │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                   │
│         │                   │                                                │
│         │ WebSocket         │ BullMQ                                        │
│         ▼                   ▼                                                │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │  Socket.IO   │◀──▶│    Redis     │◀──▶│   Worker     │                   │
│  │   Server     │    │    Queue     │    │   Process    │                   │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                   │
│                                                  │                           │
│                                                  ▼                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        DOCKER GRADING LAYER                            │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │ Candidate       │  │ Test Runner     │  │ Isolated        │        │  │
│  │  │ Container       │◀─│ Container       │  │ Network         │        │  │
│  │  │ (Read-Only)     │  │ (Jest/Playwright)│  │ (No Internet)   │        │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Role |
|-----------|------|
| **Frontend (Next.js)** | Monaco code editor, file explorer, real-time test results |
| **API Server (Express)** | Authentication, exam management, job queuing |
| **Redis** | Job queue, session tracking, pub/sub for real-time updates |
| **Worker Process** | Orchestrates Docker containers, parses test results |
| **Docker Layer** | Secure code execution and test running |

---

## Security Model

### 🔒 Defense in Depth

Our security model implements multiple layers of protection:

```
Layer 1: Network Isolation
├── Internal Docker network (no internet access)
├── Candidate container cannot reach external services
└── Only test container can communicate with candidate

Layer 2: Filesystem Isolation
├── Read-only root filesystem
├── Limited tmpfs mounts for runtime needs
├── No access to host filesystem
└── Blocked file patterns (package.json, test files)

Layer 3: Resource Limits
├── Memory: 512MB default (configurable)
├── CPU: 1 core limit
├── PIDs: 200 process limit
├── Execution timeout: 60 seconds
└── No privileged operations

Layer 4: User Isolation
├── Non-root user (node:1000)
├── No sudo/su capabilities
└── Dropped Linux capabilities

Layer 5: Code Validation
├── Path traversal prevention
├── Blocked file extensions (.test.js, etc.)
└── Input sanitization
```

### Container Security Configuration

```typescript
// Actual Docker run configuration
const securityFlags = [
  '--read-only',                    // Immutable filesystem
  '--network', 'grader_net_xxx',    // Isolated network
  '--memory', '512m',               // Memory limit
  '--memory-swap', '512m',          // No swap
  '--cpus', '1',                    // CPU limit
  '--pids-limit', '200',            // Process limit
  '--user', '1000:1000',            // Non-root user
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=300m'  // Controlled temp space
];
```

### Hidden Test Protection

Hidden tests are **never exposed** to candidates:

1. **Separate Containers**: Hidden tests run in a different container than public tests
2. **Log Sanitization**: Test output is parsed to extract only pass/fail status
3. **No Source Access**: Hidden test files are never mounted in candidate workspace
4. **Randomized Values**: Hidden tests use dynamic values to prevent hardcoding

---

## Supported Technologies

### Backend Challenges (HTTP Black-Box Mode)

| Runtime | Framework | Docker Image | Features |
|---------|-----------|--------------|----------|
| **Node.js** | Express | `node:20-alpine` | Full ES6+, async/await |
| **Python** | FastAPI | `python:3.12-slim` | Async, type hints, Pydantic |
| **Python** | Flask | `python:3.12-slim` | RESTful APIs, Blueprints |
| **Python** | Django | `python:3.12-slim` | ORM, REST Framework |
| **Go** | net/http, Gin, Chi | `golang:1.23-alpine` | Goroutines, channels |
| **Rust** | Axum, Actix | `rust:1.83-alpine` | Async, zero-cost abstractions |

### Frontend Challenges (Playwright E2E Mode)

| Framework | Docker Image | Test Runner |
|-----------|--------------|-------------|
| **React** (Vite) | `node:20-alpine` | Playwright |
| **React** (CRA) | `node:20-alpine` | Playwright |
| **Vue.js** | `node:20-alpine` | Playwright |

### Blockchain/Web3 Challenges (Planned)

> 📋 **See**: [Web3 Grading Specification](./WEB3-GRADING-SPECIFICATION.md) for detailed implementation guide.

| Ecosystem | Framework | Docker Image | Status |
|-----------|-----------|--------------|--------|
| **Solana** | Anchor | `solana-grader` | 🔜 Planned |
| **Solana** | Native | `solana-grader` | 🔜 Planned |
| **NEAR** | near-sdk | `near-grader` | 📋 Spec Ready |
| **Substrate** | Ink! | `substrate-grader` | 📋 Spec Ready |

---

## Grading Modes

### 1. HTTP Black-Box Mode (Backend APIs)

**How it works:**
1. Candidate's server starts in an isolated container
2. Test container sends HTTP requests to candidate's server
3. Responses are validated against expected values
4. No access to candidate's source code during testing

```
┌─────────────────┐         HTTP          ┌─────────────────┐
│   Test Runner   │ ───────────────────▶  │   Candidate     │
│   (Jest +       │                       │   Server        │
│   Supertest)    │ ◀─────────────────── │   (Express/     │
│                 │       Response        │   FastAPI/etc)  │
└─────────────────┘                       └─────────────────┘
         │                                         │
         └──────────── Isolated Network ───────────┘
                    (No Internet Access)
```

**Security Benefits:**
- Tests validate behavior, not implementation
- Candidate cannot access test source code
- Server runs as a black box

### 2. Playwright E2E Mode (Frontend/React)

**How it works:**
1. Candidate's React app starts with Vite dev server
2. Playwright browser connects to the running app
3. Tests interact with UI elements via `data-testid` selectors
4. Visual and functional assertions verify behavior

```
┌─────────────────┐                       ┌─────────────────┐
│   Playwright    │    Browser Control    │   Candidate     │
│   Test Runner   │ ───────────────────▶  │   React App     │
│   (Chromium)    │                       │   (Vite Dev)    │
│                 │ ◀─────────────────── │                 │
│                 │    DOM/Screenshots    │                 │
└─────────────────┘                       └─────────────────┘
```

**Test Capabilities:**
- Click, type, drag-and-drop
- localStorage persistence testing
- Page reload survival
- Modal/dialog handling
- Screenshot capture on failure

---

## Test Execution Flow

### Complete Grading Pipeline

```
1. SUBMISSION
   └── User clicks "Run Tests" or "Submit"
       └── Files saved to database
           └── Job queued in Redis (BullMQ)

2. JOB PICKUP
   └── Worker process picks up job
       └── Progress: 10% ───────────────────────▶ WebSocket update

3. WORKSPACE SETUP
   └── Create temp directories
       ├── /tmp/grader_pw_public_cand_xxx/   (candidate files)
       └── /tmp/grader_pw_public_test_xxx/   (test files)

4. CANDIDATE CONTAINER START
   └── docker run --network internal --read-only ...
       └── Install dependencies (npm install)
           └── Start server (npm run dev)

5. HEALTH CHECK
   └── Wait for server to be ready (http://candidate:3000)
       └── Retry with exponential backoff (max 30 attempts)

6. PUBLIC TESTS
   └── Run Jest/Playwright against candidate container
       └── Progress: 50% ───────────────────────▶ WebSocket update
           └── Parse results: 10/11 passed

7. HIDDEN TESTS (on submit only)
   └── Fresh candidate container
       └── Run hidden test suite
           └── Progress: 80% ─────────────────▶ WebSocket update

8. CLEANUP
   └── Stop and remove all containers
       └── Delete temp directories
           └── Remove Docker network

9. RESULT STORAGE
   └── Save to database
       └── Progress: 100% ──────────────────────▶ WebSocket update
           └── Final score: 16/18 (88.9%)
```

### Sample Log Output

```
[Worker] Processing job grading_xxx_1767335762404 for attempt xxx
[Playwright] Writing candidate workspace to /tmp/grader_pw_public_cand_xxx
[Playwright] User files: src/App.jsx, src/App.css, src/main.jsx, index.html
[Playwright] Generated files: package.json, vite.config.js, src/main.jsx
[Playwright] Total files written: 5 user + 5 generated
[Playwright] Health check passed for grader_cand_xxx:
  [Init] Waited 1s for container to initialize
  [Attempt 1] Health check via node http
  [Attempt 1] SUCCESS - Server is ready
✅ Attempt xxx graded (final): 10/11 public, 6/7 hidden
```

---

## Real-Time Monitoring

### WebSocket Progress Updates

Candidates receive live updates during grading:

```typescript
// Progress events emitted to client
socket.emit('gradingProgress', {
  attemptId: 'xxx',
  progress: 10,   // Percentage
  stage: 'Setting up environment'
});

socket.emit('gradingProgress', {
  attemptId: 'xxx', 
  progress: 50,
  stage: 'Running public tests'
});

socket.emit('gradingComplete', {
  attemptId: 'xxx',
  publicPassed: 10,
  publicTotal: 11,
  hiddenPassed: 6,
  hiddenTotal: 7,
  score: 88.9
});
```

### Proctoring Events

All suspicious activities are logged:

| Event | Description |
|-------|-------------|
| `TAB_LEAVE` | Candidate switched to another tab |
| `TAB_RETURN` | Candidate returned to exam tab |
| `FOCUS_LOST` | Browser window lost focus |
| `COPY_DETECTED` | Clipboard copy operation |
| `PASTE_DETECTED` | Clipboard paste operation |

```
[api] 🔍 Proctor event: TAB_LEAVE for attempt xxx (count: 4)
[api] 🔍 Proctor event: TAB_RETURN for attempt xxx (count: 4)
```

---

## Anti-Cheat Measures

### 1. Test Design Principles

**Public Tests (Visible to Candidates):**
- Fixed, deterministic values
- Helpful for debugging
- Cover core functionality

**Hidden Tests (Secret):**
- Randomized values using `Date.now()` or `Math.random()`
- Cover edge cases
- Prevent hardcoding

```javascript
// Public test (visible)
test('creates todo with fixed title', async () => {
  const res = await request(BASE_URL)
    .post('/todos')
    .send({ title: 'Test Todo' });
  expect(res.status).toBe(201);
});

// Hidden test (secret, randomized)
test('creates todo with random title', async () => {
  const title = `Todo_${Date.now()}_${Math.random().toString(36)}`;
  const res = await request(BASE_URL)
    .post('/todos')
    .send({ title });
  expect(res.status).toBe(201);
  expect(res.body.title).toBe(title);  // Cannot hardcode!
});
```

### 2. 404/400 Trap Prevention

Tests are designed to **not pass accidentally** if endpoints aren't implemented:

```javascript
// BAD: Would pass if server returns 404 for everything
test('returns 404 for missing item', async () => {
  const res = await request(BASE_URL).get('/todos/nonexistent');
  expect(res.status).toBe(404);  // Passes on unimplemented server!
});

// GOOD: First verify the endpoint works, then test error case
test('returns 404 for missing item', async () => {
  // First, create an item to prove the endpoint works
  const create = await request(BASE_URL)
    .post('/todos')
    .send({ title: 'Test' });
  expect(create.status).toBe(201);
  
  // Now test the 404 case
  const res = await request(BASE_URL).get('/todos/nonexistent-id');
  expect(res.status).toBe(404);
});
```

### 3. Session & Attempt Tracking

- Each exam attempt has a unique ID
- Only one active session per attempt
- Duplicate logins are blocked
- Auto-submit on timer expiry

---

## Performance & Scalability

### Resource Allocation

| Resource | Default | Maximum |
|----------|---------|---------|
| Container Memory | 512 MB | 2 GB |
| Container CPU | 1 core | 2 cores |
| Test Timeout | 30 sec | 120 sec |
| Health Check Retries | 30 | 60 |
| Concurrent Jobs | 4 | Configurable |

### Optimization Strategies

1. **Docker Image Caching**: Pre-pulled images for fast container starts
2. **Parallel Grading**: Multiple workers process jobs concurrently
3. **Efficient Cleanup**: Containers removed immediately after grading
4. **Network Reuse**: Docker networks pruned periodically

### Typical Grading Times

| Challenge Type | Dependencies | Avg Time |
|----------------|--------------|----------|
| Node.js Express | ~10 packages | 15-20 sec |
| React (Vite) | ~20 packages | 25-35 sec |
| Python FastAPI | ~5 packages | 10-15 sec |
| Rust Axum | Cargo build | 30-45 sec |
| Go HTTP | No deps | 5-10 sec |

---

## Summary

Our grading system provides:

✅ **Security**: Full container isolation, read-only filesystems, no internet  
✅ **Fairness**: Hidden tests with randomized values prevent cheating  
✅ **Flexibility**: Support for 6+ languages and frameworks  
✅ **Reliability**: Health checks, retries, and timeout handling  
✅ **Transparency**: Real-time progress updates and detailed logs  
✅ **Scalability**: Worker-based architecture for parallel grading  

---

*Document Version: 1.0 | Last Updated: January 2, 2026*

