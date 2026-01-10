# Grader Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           EXAM PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────┐   │
│  │   Web App   │────▶│   API       │────▶│   Grading Queue         │   │
│  │  (Next.js)  │     │  (Express)  │     │   (BullMQ/Redis)        │   │
│  └─────────────┘     └─────────────┘     └──────────┬──────────────┘   │
│                             │                        │                   │
│                             │                        ▼                   │
│                             │            ┌───────────────────────┐      │
│                             │            │    Grading Worker     │      │
│                             │            │  ┌─────────────────┐  │      │
│                             │            │  │ Docker Grader   │  │      │
│                             │            │  │ Blackbox Grader │  │      │
│                             │            │  │ Playwright      │  │      │
│                             │            │  └────────┬────────┘  │      │
│                             │            └───────────┼───────────┘      │
│                             │                        │                   │
│                             ▼                        ▼                   │
│                    ┌─────────────┐         ┌─────────────────────┐      │
│                    │  Database   │         │   Docker Containers │      │
│                    │ (PostgreSQL)│         │   (Ephemeral)       │      │
│                    └─────────────┘         └─────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. API Server (`apps/api/src/`)

The Express API server handles:

- **Attempt Management** (`routes/attempts.ts`)
  - Starting exam attempts
  - Saving candidate files (auto-save with Redis buffer)
  - Submitting for grading
  - Running public tests (preview mode)

- **Grading Job Queue** (`lib/grading.ts`)
  - BullMQ queue for grading jobs
  - Job prioritization (preview runs have lower priority)
  - Job retry with exponential backoff

### 2. Grading Worker (`workers/grading-worker.ts`)

A separate process that:
- Consumes jobs from the BullMQ grading queue
- Selects appropriate grader based on `GRADER_MODE` and challenge `runner` config
- Updates database with results
- Publishes results via Redis pub/sub for real-time WebSocket delivery

### 3. Graders (`lib/`)

| Grader | File | Description |
|--------|------|-------------|
| Docker | `docker-grader.ts` | Standard Docker container isolation |
| Blackbox | `docker-blackbox-grader.ts` | Two-container HTTP-based testing |
| Playwright | `docker-playwright-grader.ts` | Browser-based E2E testing |
| Sandboxed | `sandboxed-grader.ts` | Limited host isolation |
| Local | `local-grader.ts` | No isolation (dev only) |

### 4. Supporting Modules

| Module | File | Purpose |
|--------|------|---------|
| Log Sanitizer | `log-sanitizer.ts` | Remove hidden test details from logs |
| Grading Results | `grading-results.ts` | Update database with sanitized results |
| Token Manager | `token-manager.ts` | JWT access/refresh token management |
| Redis | `redis.ts` | Redis connection and pub/sub channels |

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Job Queue | BullMQ + Redis | Reliable job processing with retries |
| Container Runtime | Docker | Isolated code execution |
| Database | PostgreSQL + Drizzle | Persistence |
| Real-time | Socket.IO + Redis Pub/Sub | Live result delivery |
| Testing | Jest | Public/hidden test execution |
| E2E Testing | Playwright | Browser-based UI testing |

---

## Grader Mode Comparison

### 1. Docker Mode (`GRADER_MODE=docker`)

**Recommended for Production**

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Mode                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Phase 1: Dependency Installation                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Docker Container (node:20-alpine)              │   │
│  │  - Network: ENABLED (npm install)               │   │
│  │  - Memory: Limited                              │   │
│  │  - User: non-root (1000:1000)                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Phase 2a: Public Tests                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Docker Container (FRESH)                       │   │
│  │  - Network: DISABLED                            │   │
│  │  - Candidate code + PUBLIC tests only           │   │
│  │  - Output: Visible to candidate                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Phase 2b: Hidden Tests                                 │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Docker Container (FRESH, SEPARATE)             │   │
│  │  - Network: DISABLED                            │   │
│  │  - Candidate code + HIDDEN tests only           │   │
│  │  - Output: Sanitized (hidden test details       │   │
│  │    removed before returning to candidate)       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Security Properties:**
- ✅ Full container isolation
- ✅ Network disabled during tests
- ✅ Memory/CPU limits enforced
- ✅ Read-only filesystem
- ✅ Separate containers for public/hidden tests
- ✅ Non-root execution

### 2. Blackbox Mode (`runner.mode = 'http'`)

**Best for API Challenges**

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Blackbox HTTP Mode                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────┐     ┌────────────────────────────┐  │
│  │   Container A (Candidate)   │     │   Container B (Tests)      │  │
│  │                             │     │                            │  │
│  │   - Candidate server code   │◀───▶│   - Jest + Supertest       │  │
│  │   - NO test code mounted    │ HTTP│   - Tests via HTTP only    │  │
│  │   - Runs: node server.js    │     │   - BASE_URL = candidate   │  │
│  │                             │     │                            │  │
│  └─────────────────────────────┘     └────────────────────────────┘  │
│                    │                              │                   │
│                    └──────────────┬───────────────┘                   │
│                                   │                                   │
│                    ┌──────────────▼───────────────┐                   │
│                    │   Isolated Docker Network    │                   │
│                    │   (No external egress)       │                   │
│                    └──────────────────────────────┘                   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Security Properties:**
- ✅ Test code NEVER reaches candidate container
- ✅ Candidate cannot read hidden tests
- ✅ Multi-runtime support (Node, Python, Go)
- ✅ Network isolated between containers only

### 3. Playwright Mode (`runner.mode = 'playwright'`)

**Best for UI/React Challenges**

Similar to blackbox mode but with:
- Container B runs Playwright instead of Jest
- Tests interact with candidate's UI via browser automation
- Supports visual regression and E2E testing

### 4. Sandboxed Mode (`GRADER_MODE=sandboxed`)

**Development Only**

```
┌─────────────────────────────────────────────────────────┐
│                    Sandboxed Mode                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Host Process (Node.js)                                 │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Separate temp directories for public/hidden      │ │
│  │  ┌─────────────────┐   ┌─────────────────┐       │ │
│  │  │ /tmp/pub_xxx/   │   │ /tmp/hid_xxx/   │       │ │
│  │  │ - Candidate     │   │ - Candidate     │       │ │
│  │  │ - Public tests  │   │ - Hidden tests  │       │ │
│  │  └─────────────────┘   └─────────────────┘       │ │
│  │                                                   │ │
│  │  ⚠️ No network isolation                         │ │
│  │  ⚠️ No filesystem sandboxing                     │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Security Properties:**
- ⚠️ Limited isolation
- ✅ Separate directories for public/hidden tests
- ❌ No network isolation
- ❌ No filesystem sandboxing
- ❌ Should NOT be used in production

### 5. Local Mode (`GRADER_MODE=local`)

**BLOCKED IN PRODUCTION**

- ❌ No isolation whatsoever
- ❌ Candidate code has full system access
- ❌ Only for local development
- Automatically blocked when `NODE_ENV=production`

---

## Data Flow

```
Candidate Submit
      │
      ▼
┌─────────────────┐
│ POST /attempts  │
│ /:id/submit     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate files  │  ◀─── Path traversal checks
│ (API layer)     │       Test injection prevention
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Add to BullMQ   │
│ grading queue   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Grading Worker  │
│ picks up job    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Select grader   │
│ based on mode   │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
┌────────┐ ┌────────┐ ┌────────────┐
│ Docker │ │ HTTP   │ │ Playwright │
│ Grader │ │ Grader │ │ Grader     │
└────┬───┘ └────┬───┘ └─────┬──────┘
     │          │            │
     └──────────┼────────────┘
                │
                ▼
┌─────────────────────┐
│ Parse Jest/PW       │
│ results             │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Sanitize logs       │  ◀─── Remove hidden test details
│ (log-sanitizer.ts)  │       Remove file paths
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Update database     │
│ (grading-results.ts)│
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Publish to Redis    │
│ pub/sub channel     │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Socket.IO delivers  │
│ to candidate client │
└─────────────────────┘
```

