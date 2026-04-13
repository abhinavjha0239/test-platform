# Security & Architecture Improvements

## Overview
This document summarizes the security and scalability improvements made to the exam platform.
Legacy TypeScript grader references are retained for audit history; the current production grader lives under `apps/grader-go/`.

---

## 🚨 LATEST FIXES (December 2024 - Round 2)

### 1. ✅ Test Injection Prevention - Block .test.js Filenames (CRITICAL)
**Files:** `attempts.ts`, `sandboxed-grader.ts`, `docker-grader.ts`, `local-grader.ts`

**Problem:** Candidates could submit files like `src/public.test.js` or `mycode.test.jsx` which would be matched by Jest patterns, allowing score inflation.

**Fix (Multi-Layer Defense):**

**Layer 1 - API Validation (attempts.ts):**
```typescript
const BLOCKED_FILENAME_PATTERNS = [
    /\.test\.(js|jsx|ts|tsx)$/i,      // *.test.js, *.test.jsx, etc.
    /\.spec\.(js|jsx|ts|tsx)$/i,      // *.spec.js, *.spec.jsx, etc.
    /^jest\./i,                        // jest.config.js, jest.setup.js
    /^babel\./i,                       // babel.config.js
    /^package(-lock)?\.json$/i,        // package.json
];

// Block test file patterns (CRITICAL: prevents test injection)
const fileName = parts[parts.length - 1];
for (const pattern of BLOCKED_FILENAME_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(filePath)) {
        throw new ApiError(`Test/config files not allowed: ${fileName}`, 400);
    }
}
```

**Layer 2 - Grader Validation:**
All graders now also block these patterns in `sanitizeFilePath()`.

**Layer 3 - Strict Jest Pattern:**
```typescript
// OLD (vulnerable): --testPathPattern="^.+/public\\.test\\.(js|jsx)$"
// NEW (secure): --testPathPattern="__tests__/public\\.test\\.(js|jsx)$"
```
The new pattern ONLY matches `__tests__/public.test.js` or `__tests__/hidden.test.js`.

### 2. ✅ Rate Limiting for Grading Endpoints (MEDIUM)
**File:** `attempts.ts`

**Problem:** `/attempts/:id/run-tests` and `/attempts/:id/submit` were not rate-limited, enabling grading queue flooding attacks.

**Fix:**
```typescript
// POST /api/attempts/:id/run-tests - Run public tests only
// Rate limited to prevent grading queue flooding
router.post('/:id/run-tests', authenticate, submissionLimiter, async (req, res, next) => {

// POST /api/attempts/:id/submit - Submit for final grading
// Rate limited to prevent grading queue flooding
router.post('/:id/submit', authenticate, submissionLimiter, async (req, res, next) => {
```

Rate limit: 10 requests per minute per IP.

### 3. ✅ Socket Token Expiry/Eviction (LOW)
**File:** `socket/index.ts`

**Problem:** Socket auth was only checked on connect; token expiry or logout did not evict existing sockets.

**Fix:**
- Periodic token validation (every 5 minutes)
- Automatic eviction of sockets with expired tokens
- `evictUserSockets(userId)` function for logout
- Redis pub/sub for cross-process socket eviction
- Client-side `auth:expired` event for graceful handling

```typescript
// Start periodic token validation
function startTokenValidation(io: Server) {
    setInterval(() => {
        for (const [_, socket] of io.sockets.sockets) {
            try {
                verifyToken(socket.handshake.auth.token);
            } catch (error) {
                socket.emit('auth:expired', { message: 'Session expired.' });
                socket.disconnect(true);
            }
        }
    }, TOKEN_CHECK_INTERVAL);
}

// Evict all sockets for a user (call on logout)
export async function evictUserSockets(userId: string): Promise<void> {
    await redisConnection.publish(SOCKET_EVICTION_CHANNEL, JSON.stringify({ userId }));
}
```

The `/auth/logout-all` endpoint now calls `evictUserSockets()` to terminate all WebSocket connections.

### 4. ✅ Secure Multi-Runtime Grading (Backend + React) (CRITICAL)
**Files:** `packages/shared/src/index.ts`, `packages/database/src/schema.ts`, `apps/api/src/lib/docker-blackbox-grader.ts`, `apps/api/src/lib/docker-playwright-grader.ts`, `apps/api/src/lib/docker-grader.ts`

**Goal:** Support **any backend runtime** (Node/FastAPI/Flask/Go, etc.) + **React UI** with **true hidden-test secrecy**.

**What changed:**
- Added optional `challenge.runner` config (stored in DB as `challenges.runner` JSON)
- `GradingJob` now carries `runner` (optional)
- `docker-grader.ts` delegates based on `runner.mode`:
  - **`runner.mode=http`** → two-container black-box HTTP grading:
    - Container A: candidate server
    - Container B: hidden/public Jest tests that hit A via HTTP (`BASE_URL`)
    - Hidden tests never exist in candidate filesystem
  - **`runner.mode=playwright`** → two-container Playwright E2E grading for React/UI:
    - Container A: candidate web app
    - Container B: Playwright tests that drive the UI
    - Hidden tests never exist in candidate filesystem

**Notes:**
- This solves the “candidate can read `hidden.test.*` at runtime” issue for backends and UI by removing test files from the candidate container entirely.
- Network egress is still a separate hardening topic (Docker bridge NAT allows outbound unless blocked at host level).

---

## 🚨 PREVIOUS FIXES (December 2024 - Round 1)

### 4. ✅ Hidden Test Isolation in All Graders (CRITICAL)
**Files:** `docker-grader.ts`, `local-grader.ts`

**Problem:** In docker and local graders, both public and hidden tests were written to the same directory. Candidate code could potentially read hidden test files using `fs.readFileSync()` or similar.

**Fix:** 
- Both graders now use SEPARATE directories for public and hidden tests
- Public tests run in `grader_pub_<attemptId>_<timestamp>_<random>`
- Hidden tests run in `grader_hid_<attemptId>_<timestamp>_<random>`
- Candidate code cannot access files from the other test run

```typescript
// docker-grader.ts & local-grader.ts
const publicDir = join(tmpdir(), `grader_pub_${job.attemptId}_${timestamp}_${randomSuffix}`);
const hiddenDir = join(tmpdir(), `grader_hid_${job.attemptId}_${timestamp}_${randomSuffix}`);

// Public tests run first
publicResult = await runTestsInIsolation({ workDir: publicDir, testType: 'public', ... });

// Hidden tests run in completely separate directory
hiddenResult = await runTestsInIsolation({ workDir: hiddenDir, testType: 'hidden', ... });
```

### 2. ✅ Block Candidate Writes to Test Directories (CRITICAL)
**Files:** `docker-grader.ts`, `local-grader.ts`, `attempts.ts`

**Problem:** Candidates could submit files in `__tests__/`, `test/`, or other reserved directories.

**Fix:**
- All graders now block writes to reserved paths
- API-level validation in attempts.ts rejects invalid file paths

```typescript
const BLOCKED_PATHS = [
    '__tests__',
    '__test__',
    'test',
    'tests',
    '.jest',
    'jest.config',
    'babel.config',
    'node_modules',
    'package.json',
    'package-lock.json',
    'results.json',
];

function sanitizeFilePath(filePath: string, workDir: string): string | null {
    // Block writes to test directories
    const normalizedPath = filePath.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (normalizedPath.startsWith(blocked + '/') || normalizedPath === blocked) {
            console.error(`[SECURITY] Blocked path: ${filePath}`);
            return null;
        }
    }
    // ... rest of path validation
}
```

### 3. ✅ Client-Side Access/Refresh Token Implementation (HIGH)
**Files:** `apps/web/src/lib/api.ts`, `apps/web/src/lib/auth-store.ts`, `apps/web/src/lib/socket.ts`

**Problem:** Server implemented refresh token rotation but client only used legacy tokens. Refresh functionality was unused.

**Fix:**
- API client now stores both access and refresh tokens
- Automatic token refresh when access token expires
- Socket.IO client updates authentication when tokens change
- Token rotation on each refresh for security
- Proper logout that revokes refresh tokens

```typescript
// api.ts - Automatic token refresh
async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    let response = await makeRequest(this.accessToken);
    
    // If unauthorized, try to refresh token
    if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
            response = await makeRequest(this.accessToken);
        }
    }
    // ...
}
```

### 4. ✅ File Extension Validation (MEDIUM)
**File:** `apps/api/src/routes/attempts.ts`

**Problem:** No validation on file extensions could allow unexpected file types.

**Fix:**
- Only allowed extensions: `js`, `jsx`, `ts`, `tsx`, `json`, `css`, `html`, `md`, `txt`
- Rejects files with other extensions

```typescript
const allowedExtensions = ['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'md', 'txt'];
if (ext && !allowedExtensions.includes(ext)) {
    throw new ApiError(`File extension '.${ext}' is not allowed`, 400);
}
```

---

## 🚨 Critical Security Fixes (Previously Implemented)

### Path Traversal Prevention
**Files:** `sandboxed-grader.ts`, `docker-grader.ts`, `local-grader.ts`

Fixed path traversal vulnerability that allowed arbitrary file writes:
- Strict path validation using `resolve()` and `normalize()`
- Block `..` patterns and absolute paths
- Verify resolved path stays within workspace directory
- Skip files that fail validation

### Test Injection Prevention
**Files:** `sandboxed-grader.ts`, `docker-grader.ts`, `local-grader.ts`

Fixed Jest pattern that allowed candidates to inject their own tests:
```javascript
// OLD (vulnerable): --testPathPattern=public
// NEW (secure): --testPathPattern="^.+/(public|hidden)\\.test\\.(js|jsx)$"
```

### Environment Variable Isolation
**File:** `sandboxed-grader.ts`

Fixed environment leakage that exposed secrets to candidate code:
- Minimal safe environment (only PATH, HOME, NODE_ENV)
- No process.env spread that could leak secrets
- Proper sanitization of logs and error messages

### Docker Grader Two-Phase Execution
**File:** `apps/grader-go/internal/grader/http_grader.go`

Fixed HTTP blackbox grader build flow (npm install requires network):
- Phase 1: `npm install` WITH network enabled
- Phase 2: `npm test` WITHOUT network (isolated)
- Additional security: `--read-only`, `--pids-limit`, non-root user

### Admin Privilege Escalation Prevention
**File:** `auth.ts`

Fixed auto-approval of first admin (privilege escalation):
- Requires explicit `ALLOW_FIRST_ADMIN_BOOTSTRAP=true` env var
- Blocked by default - manual admin creation required
- Clear warnings in production

### Invitation Token Email Binding
**File:** `exams.ts`

Fixed invitation bypass (any user could use any invitation):
- Invitations require target email by default
- Case-insensitive email matching
- `REQUIRE_EMAIL_FOR_INVITATIONS` config (default: true)

### Grader Mode Safety
**File:** `apps/grader-go/internal/worker/worker.go`

Enforced safe defaults:
- Grader accepts only Docker-based runner modes (`http`, `playwright`, `ui_jsdom`)
- Unsupported modes are rejected before execution

### Debug Code Removal
**All grader files and route files**

Removed all debug/agent logging code that leaked sensitive data:
- Removed `fetch('http://127.0.0.1:7242/ingest/...')` calls
- Clean production-ready code

---

## P0 - Critical (Before Production)

### 1. ✅ Hidden Test Log Sanitization
**File:** `apps/api/src/lib/log-sanitizer.ts`

Prevents hidden test code from leaking to candidates through grading logs:
- Sanitizes file paths containing "hidden"
- Removes stack traces from hidden tests
- Redacts hidden test assertions
- Truncates logs to prevent huge outputs
- Integrated into `grading-results.ts` to sanitize before database storage

### 2. ✅ Legacy Local/Sandboxed Graders Removed

Legacy in-process graders were removed during the Go migration. All grading now runs in Docker-based runner modes (`http`, `playwright`, `ui_jsdom`).

### 3. ✅ Two-Container Architecture Documentation
**File:** `apps/api/src/lib/grading-config.ts`

Documented the two-container grading architecture for maximum hidden test isolation:
- Student container: Only candidate code, no test files
- Tester container: Hidden tests, makes HTTP requests to student app
- Configuration for future implementation

---

## P1 - Soon After Launch

### 4. ✅ Redis-Backed Timers
**File:** `apps/api/src/socket/timerService.ts`

Timer state stored in Redis for horizontal scaling:
- Timer metadata persisted in Redis with TTL
- Distributed lock for auto-submission (prevents double-submit)
- Graceful reconnection support
- Local intervals for broadcasting with Redis source-of-truth

### 5. ✅ Redis-Backed Session Presence
**File:** `apps/api/src/socket/presenceService.ts`

Session tracking across multiple API instances:
- Sessions stored in Redis with TTL
- Prevents multiple browser tabs/sessions
- Automatic cleanup of stale sessions
- Heartbeat support for activity tracking

### 6. ✅ Autosave Buffering
**File:** `apps/api/src/lib/autosave-buffer.ts`

Reduces database load during exams:
- Fast writes to Redis buffer
- Background flush to database (every 30s)
- Force flush before submission
- Graceful shutdown flushes all pending saves
- **TTL increased to 12 hours** to handle long exams

**Integration:**
- `examHandlers.ts` - Socket.IO `code:save` uses buffer
- `routes/attempts.ts` - HTTP endpoints use buffer
- `server.ts` - Background flush job started on boot

---

## P2 - Nice to Have

### 7. ✅ Challenge Validation Before Publish
**File:** `apps/api/src/lib/challenge-validator.ts`

Validates challenges before publishing:
- Required fields check
- Test isolation check (`jest.resetModules()`)
- Dynamic test data usage check
- Starter files should fail tests
- Solution files should pass all tests

**Endpoints:**
- `POST /api/challenges/validate` - Quick validation
- `POST /api/challenges/:id/validate` - Full validation with test execution

### 8. ✅ API Versioning
**File:** `apps/api/src/middleware/apiVersion.ts`

Supports multiple API versions:
- URL path: `/api/v1/resource`
- Header: `X-API-Version: 1`
- Query param: `?api_version=1`
- Response headers include version info
- Deprecation warning middleware for sunset notices

**Endpoint:**
- `GET /api/version` - Returns supported versions

### 9. ✅ Refresh Token Rotation (Server + Client)
**Files:** `apps/api/src/lib/token-manager.ts`, `apps/web/src/lib/api.ts`

Secure token management:
- Short-lived access tokens (15 min)
- Long-lived refresh tokens (7 days)
- Token rotation on each refresh
- Token family tracking for breach detection
- Revoke all user tokens on password change
- **Client now fully implements token refresh**

**Endpoints:**
- `POST /api/auth/refresh` - Rotate tokens
- `POST /api/auth/logout` - Revoke refresh token
- `POST /api/auth/logout-all` - Revoke all user sessions

---

## Known Limitations (Inherent to Web-Based Exams)

### Client-Side Proctoring
**Files:** `apps/web/src/app/exam/[id]/page.tsx`, `apps/api/src/socket/proctorService.ts`

Web-based proctoring has inherent limitations:
- Tab visibility, fullscreen, and paste events are client-side
- A modified client could skip or spoof these events
- Server can only log what client reports

**Mitigations in place:**
- All events logged to database with timestamps
- Integrity scoring based on violations
- Admin reports show all proctoring events
- Consider browser lockdown tools for high-stakes exams

---

## Files Changed

### New Files:
- `apps/api/src/lib/log-sanitizer.ts`
- `apps/api/src/lib/grading-config.ts`
- `apps/api/src/lib/autosave-buffer.ts`
- `apps/api/src/lib/challenge-validator.ts`
- `apps/api/src/lib/token-manager.ts`
- `apps/api/src/middleware/apiVersion.ts`

### Modified Files (Latest):
- `apps/api/src/lib/docker-grader.ts` - Isolated test execution, blocked paths
- `apps/api/src/lib/local-grader.ts` - Isolated test execution, blocked paths
- `apps/api/src/routes/attempts.ts` - Enhanced file path validation
- `apps/web/src/lib/api.ts` - Access/refresh token support
- `apps/web/src/lib/auth-store.ts` - Token-aware auth management
- `apps/web/src/lib/socket.ts` - Token change handling

### Modified Files (Previous):
- `apps/api/src/lib/sandboxed-grader.ts` - Path validation, env isolation
- `apps/api/src/lib/grading-results.ts` - Log sanitization
- `apps/api/src/workers/grading-worker.ts` - Mode enforcement
- `apps/api/src/socket/timerService.ts` - Redis-backed timers
- `apps/api/src/socket/presenceService.ts` - Redis-backed presence
- `apps/api/src/socket/examHandlers.ts` - Autosave buffering
- `apps/api/src/routes/challenges.ts` - Validation endpoints
- `apps/api/src/routes/auth.ts` - Token rotation endpoints
- `apps/api/src/app.ts` - API versioning middleware
- `apps/api/src/server.ts` - Background jobs startup

---

## Environment Variables

Add these to your `.env` for new features:

```env
# =============================================================================
# SECURITY - Grading Configuration
# =============================================================================
# Redis Streams worker settings
GRADING_CONCURRENCY=2
GRADING_STREAM_GROUP=grading-workers
GRADING_MAX_ATTEMPTS=3

# =============================================================================
# SECURITY - Admin Bootstrap (TEMPORARY)
# =============================================================================
# Set to 'true' ONLY during initial setup
# REMOVE or set to 'false' after first admin is created!
ALLOW_FIRST_ADMIN_BOOTSTRAP=false

# =============================================================================
# SECURITY - Invitation Email Binding
# =============================================================================
# When 'true' (default): Invitations require target email
# When 'false': Generic invitation links allowed (less secure)
REQUIRE_EMAIL_FOR_INVITATIONS=true

# =============================================================================
# SECURITY - JWT Configuration
# =============================================================================
JWT_SECRET=your-secret-here

# Separate refresh token secret (recommended for production)
JWT_REFRESH_SECRET=your-refresh-secret-here
```

---

## Security Checklist for Production

Before deploying to production, verify:

- [ ] `NODE_ENV=production` is set
- [ ] `ALLOW_FIRST_ADMIN_BOOTSTRAP=false` after first admin created
- [ ] `JWT_SECRET` is a strong random value
- [ ] `JWT_REFRESH_SECRET` is set (different from JWT_SECRET)
- [ ] Redis is properly secured and not exposed publicly
- [ ] PostgreSQL has strong password and limited access
- [ ] Docker daemon is available for grading worker
- [ ] HTTPS is enabled for all endpoints

---

## Migration Notes

### Token Changes
The auth routes now return both legacy `token` and new `accessToken`/`refreshToken`:
- Existing clients continue to work with `token`
- New clients should use `accessToken` + `refreshToken`
- Frontend now implements automatic token refresh

### Autosave Changes
- Autosaves are now buffered in Redis
- Writes are async, not immediately persisted to DB
- Background job flushes every 30 seconds
- Explicit flush on submission
- TTL is 12 hours (handles exams up to 8+ hours)

### Grader Changes
- All graders now use isolated directories for public/hidden tests
- Candidates cannot write to test directories
- Only whitelisted file extensions are accepted

---

## Testing Recommendations

1. **Test hidden test isolation** by submitting code that tries to read `__tests__/hidden.test.js`
2. **Test blocked paths** by submitting files with paths like `__tests__/evil.js`
3. **Test token refresh** by waiting 15+ minutes and verifying session continues
4. **Load test** the autosave buffer with many concurrent writers
5. **Verify** hidden test sanitization by checking grading logs
6. **Test** timer persistence across API instance restarts
7. **Test** challenge validation catches common issues
