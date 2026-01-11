# Challenge Authoring Framework (Multi-language + Frontend)

This folder documents **how to create challenges** for this platform: problem statement + starter files + public tests + hidden tests + runner configuration.

It is complementary to `docs/grader/` (which explains how grading executes). This folder focuses on **authoring** robust, secure, non-flaky challenges across **backend, frontend, and full-stack**.

## What you can build on this platform (today)

- **Backend / API challenges (any language via HTTP)**: `runner.mode = 'http'`
  - Candidate code runs in **container A**
  - Tests run in **container B** (Jest + supertest) and call the candidate server over HTTP (`BASE_URL`)
  - Works for **FastAPI, Flask, Django, Go, Rust, Node**, etc as long as it exposes HTTP on `PORT` and is reachable via `BASE_URL`

- **Frontend / UI challenges (browser E2E)**: `runner.mode = 'playwright'`
  - Candidate web app runs in **container A**
  - Playwright tests run in **container B** and interact with the UI via a headless browser

- **JS/TS component or library challenges (unit tests)**: legacy Jest (`runner.mode = 'jest'` or omit `runner`)
  - Jest imports candidate code directly (good for small React component tasks)

- **Blockchain / Web3 challenges (Solana, NEAR, etc.)**: `runner.mode = 'blockchain'` *(Planned)*
  - Candidate smart contract runs in **container A** with local validator
  - Tests run in **container B** and interact via RPC
  - See [`../WEB3-GRADING-SPECIFICATION.md`](../WEB3-GRADING-SPECIFICATION.md) for full specification

## Golden rules (non-negotiable)

1. **Hidden tests must never be accessible** to candidate code. Prefer `http` or `playwright`.
2. **No false positives**: a challenge must not pass without real implementation (avoid the 404/400 trap).
3. **Deterministic tests**: no external network, no dependence on wall-clock timing, no order coupling between tests.
4. **Candidate-safe logs**: public tests can be helpful; hidden tests must not leak answers/expected values.

## Important platform constraints (authoring implications)

- **Candidates cannot write** test/config/dependency manifest files (blocked at API and/or grader layer). Examples:
  - `__tests__/`, `tests/`, `*.test.js`, `*.spec.js`
  - `package.json`, `package-lock.json`, `node_modules/`
  - `requirements.txt`, `pyproject.toml`, `go.mod`, `go.sum`, etc
- For multi-language challenges, use **`runner.candidate.generatedFiles`** for dependency manifests and any scaffolding you want to keep immutable.

## Contents

- `01-CHALLENGE-SPEC.md`: how a challenge is represented (fields, runner schema, where it is stored).
- `02-RUNNER-MODES.md`: when to use `jest` vs `http` vs `playwright`.
- `03-TEST-DESIGN.md`: how to design robust test suites (public + hidden), anti-cheat patterns, flake prevention.
- `04-BACKEND-TEMPLATES.md`: templates for FastAPI, Flask, Django, Go, Rust, Node APIs.
- `05-FRONTEND-FULLSTACK-TEMPLATES.md`: templates for React unit tests, Playwright UI tests, full-stack patterns.
- `06-AI-PROMPT-GUIDELINES.md`: deep prompt rules + templates for generating challenges safely with AI.
- `07-REVIEW-CHECKLIST.md`: a pre-publish checklist to prevent broken or insecure challenges.

### Copy-paste templates (`templates/`)

- `http-runner-node.json` - Node.js/Express API runner config
- `http-runner-fastapi.json` - FastAPI (Python) runner config
- `http-runner-flask.json` - Flask (Python) runner config
- `http-runner-django.json` - Django (Python) runner config
- `http-runner-go.json` - Go (net/http) runner config
- `http-runner-rust.json` - Rust (Axum) runner config
- `playwright-runner-react-vite.json` - React + Vite Playwright runner config
- `http-tests-jest-supertest.example.js` - Example Jest + supertest test file
- `playwright-tests.example.js` - Example Playwright E2E test file
- `jest-react.example.js` - Example React + Testing Library test file

## Quick decision tree

- **Is the deliverable an HTTP API/server?** → use `runner.mode = 'http'`
- **Is the deliverable a UI (frontend or full-stack)?** → use `runner.mode = 'playwright'`
- **Is the deliverable a pure function / module (JS/TS)?** → use `runner.mode = 'jest'` (or omit `runner`)
- **Is the deliverable a smart contract (Solana/NEAR/Substrate)?** → use `runner.mode = 'blockchain'` *(Planned - see [Web3 Spec](../WEB3-GRADING-SPECIFICATION.md))*

## Next steps

If you want “any language” support beyond Node/Python/Go/React, prefer HTTP blackbox runner and:

- pin language dependencies in `runner.candidate.generatedFiles`
- block candidate-controlled manifests (see `docs/grader/03-SECURITY.md` and `03-TEST-DESIGN.md`)
- keep install/build time realistic (timeouts)


