# Runner Modes (How grading executes your challenge)

This platform supports four runner modes for challenges:

- `jest` (legacy): imports candidate code directly
- `http` (recommended for backend): 2-container blackbox testing over HTTP
- `playwright` (recommended for frontend/full-stack): 2-container E2E browser testing
- `ui_jsdom` (recommended for fast secure UI/unit): 2-container jsdom harness + Vitest over HTTP

## Quick selection table

| Challenge type | Recommended runner | Why |
|---|---|---|
| Backend/API (any language) | `http` | True hidden-test secrecy (tests never mounted into candidate container) |
| Frontend/UI | `playwright` | Tests real browser behavior and user flows |
| Full-stack (UI + API) | `playwright` | E2E tests can verify UI + API behavior together |
| JS/TS pure function/module | `jest` | Simple and fast; tests can import code directly |
| React component (unit, secure) | `ui_jsdom` | Hidden tests stay secret; faster than full Playwright |
| React component (unit, non-secret) | `jest` | Testing-library + jsdom support is built-in |

## 1) Legacy Jest runner (`mode: 'jest'`)

### When to use

- Small JS/TS challenges
- React component tasks where tests need to import modules/components

### Pros

- Fast
- Simple authoring (standard Jest tests)

### Cons

- Hidden test secrecy is weaker (candidate code is in the same environment as tests)
- Easier to leak hidden test details via stack traces/logs if not sanitized

### Authoring tips

- Always reset module state between tests (`jest.resetModules()`).
- Avoid reading files from disk in tests (candidate could mimic).
- Prefer behavior-based assertions.

## 2) HTTP blackbox runner (`mode: 'http'`) — recommended

### Model

Two containers, one internal network:

- **Container A**: candidate server (no tests mounted)
- **Container B**: tests (Jest + supertest) calls A via `BASE_URL=http://candidate:<port>`

### When to use

- Any backend/API challenge: Express, FastAPI, Flask, Django, Go, Rust, etc
- Any grading where you want **strong hidden-test secrecy**

### Pros

- Tests are never accessible to candidate code (strongest hidden-test protection)
- Language-agnostic (anything that can expose HTTP works)
- Clean contract: only HTTP observable behavior matters

### Cons / limitations

- You must provide a **health endpoint** (or a stable path) so the grader can detect readiness.
- Candidate server must bind to `0.0.0.0` and read port from `PORT`.
- Tests must be written to be resilient to startup time and environment differences.

### Authoring tips

- Use stable, explicit API contracts (paths, status codes, response schema).
- Prefer idempotent endpoints or isolate state per test (see `03-TEST-DESIGN.md`).
- Design public tests to give actionable feedback without leaking solutions.

## 3) Playwright runner (`mode: 'playwright'`) — recommended for UI/full-stack

### Model

Two containers, one internal network:

- **Container A**: candidate web app (no tests mounted)
- **Container B**: Playwright tests drive a browser against A via `BASE_URL`

### When to use

- Frontend/UI challenges
- Full-stack challenges where correctness is best measured via user flows

### Pros

- Tests the real product behavior (DOM, routing, form interactions)
- Strong hidden-test secrecy (tests live in separate container)

### Cons / limitations

- More complex to author and debug than Jest unit tests
- You must invest in flake prevention (stable selectors, avoid timing assumptions)

### Authoring tips

- Use `data-testid` selectors (or stable ARIA roles/labels).
- Avoid tests that depend on animations or sleep-based waits.
- Prefer `await expect(locator).toHaveText(...)` over manual polling.

## 4) UI jsdom runner (`mode: 'ui_jsdom'`) — recommended for fast secure UI/unit tests

### Model

Two containers, one internal network:

- **Container A**: candidate app runs a small **jsdom harness server** (no tests mounted)
- **Container B**: **Vitest** tests call A over HTTP (e.g. click/type/query by `data-testid`)

The grader provides a dedicated env var for the harness client:

- `HARNESS_BASE_URL=http://candidate:<port>`

Do **not** rely on `BASE_URL` in Vitest tests here — Vite/Vitest uses `BASE_URL` internally (typically `"/"`).

### When to use

- React UI challenges that don’t need a real browser (no drag-drop/layout fidelity needs)
- You want **strong hidden-test secrecy**, but **faster** than Playwright

### Pros

- Tests are never accessible to candidate code (strong hidden-test protection)
- Faster than Playwright for many “component/unit-style” tasks

### Cons / limitations

- More moving parts than Jest (needs a harness server and HTTP protocol)
- Not a real browser: layout, browser APIs, and rendering fidelity differ from Playwright

### Authoring tips

- Use **only** `data-testid` selectors in the harness protocol.
- Make tests **serial** (avoid shared-state flakiness); the platform runs Vitest with threads disabled.
- Keep the harness generic; keep correctness logic in tests (public + hidden).

## Full-stack patterns supported (today)

Even though the platform starts **one candidate container**, you can still do full-stack by:

- Running multiple processes inside the candidate container (example: `concurrently`), and
- Exposing **one stable base URL** to the tests container.

Recommended patterns:

- **Next.js** full-stack: UI + API routes under the same server/port
- **Single-server** architecture: backend serves frontend (or reverse-proxies)

If you need true multi-service orchestration (multiple containers), treat it as a future enhancement:

- `runner.mode = 'compose'` or `runner.mode = 'multi-service'` (not implemented yet)


