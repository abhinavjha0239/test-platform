# Challenge Spec (What to author)

This platform stores each challenge as:

- **Candidate-facing content**
  - `name`, `description`
  - `starterFiles` (initial workspace)
  - `publicTests` (runs during `run-tests` preview and on final submit)
- **Server-only content**
  - `hiddenTests` (runs on final submit only)
- **Execution configuration**
  - `dependencies` + `nodeVersion` (legacy Jest runner and also used for the test container defaults)
  - optional `runner` (recommended for multi-language and strong hidden-test secrecy)

## Where challenges live in the repo

Typical pattern:

- `test-platform/challenges/<slug>/challenge.ts`

Challenges are stored in DB table `challenges`:

- `starter_files` (JSON)
- `public_tests` (text)
- `hidden_tests` (text)
- `dependencies` (JSON)
- `node_version` (text)
- `runner` (JSON, optional)

## How challenges are synced into the database

The database package includes a sync script:

- `test-platform/packages/database/sync-challenges.ts`
- `npm run sync-challenges -w @exam-platform/database`

You should run sync after adding/updating challenge files.

## The challenge shape (authoring contract)

At a high level:

```ts
export const myChallenge = {
  name: 'My Challenge',
  description: 'What the candidate must build',
  starterFiles: {
    'src/app.js': '...',
    'README.md': '...',
  },
  publicTests: '...string containing tests...',
  hiddenTests: '...string containing tests...',
  dependencies: {
    // Used for Node/Jest mode and as metadata for the platform
    // For non-Node runtimes use runner.candidate.generatedFiles instead
  },
  nodeVersion: '20',

  // Optional: enables secure multi-language grading
  runner: { ... },
};
```

## Runner config (recommended)

The platform supports these runner modes:

- `mode: 'jest'` (legacy, in-process Jest that imports candidate code)
- `mode: 'http'` (recommended for backend/API, true hidden test secrecy)
- `mode: 'playwright'` (recommended for frontend/full-stack E2E)

The schema lives in `@exam-platform/shared` (`challengeRunnerSchema`).

### HTTP blackbox runner (`mode: 'http'`)

Use this for **any backend that can expose HTTP** (Node/FastAPI/Flask/Django/Go/Rust/etc).

```ts
runner: {
  mode: 'http',
  runtime: 'python', // informational label (examples: node/python/go/rust)
  candidate: {
    image: 'python:3.11-slim',
    workdir: '/app',
    generatedFiles: {
      'requirements.txt': 'fastapi==0.115.5\nuvicorn==0.32.1\n',
    },
    installCommand: 'pip install -r requirements.txt',
    runCommand: 'python -m uvicorn main:app --host 0.0.0.0 --port $PORT',
    port: 3000,
    healthPath: '/health',
    env: { NODE_ENV: 'test' },
    startupTimeoutMs: 20000,
  },
  tests: {
    framework: 'jest',
    image: 'node:20-alpine',
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    testCommand: 'npm test 2>&1 || true',
    timeoutMs: 120000,
  },
}
```

**Key idea**: tests run in a separate container and call the candidate server via `BASE_URL`.

### Playwright runner (`mode: 'playwright'`)

Use this for **UI and full-stack** where browser behavior matters.

```ts
runner: {
  mode: 'playwright',
  runtime: 'react',
  candidate: {
    image: 'node:20-alpine',
    generatedFiles: {
      // Provide package.json (and other immutable scaffolding) via generatedFiles
      'package.json': '{ ... }',
    },
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    runCommand: 'npm run dev -- --host 0.0.0.0 --port $PORT',
    port: 3000,
    healthPath: '/',
    startupTimeoutMs: 30000,
  },
  tests: {
    framework: 'playwright',
    image: 'mcr.microsoft.com/playwright:v1.57.0-jammy',
    installCommand: 'npm install 2>&1',
    testCommand: 'PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1',
    timeoutMs: 180000,
  },
}
```

## How scoring works (important for test design)

### Jest scoring

For Jest-based runs (legacy and HTTP runner tests container):

- The grader reads `results.json` produced by Jest.
- It counts **test cases** (Jest `assertionResults`) as the total.
- Score is **number of passed test cases**.

Implication: design tests so **each requirement maps to a distinct test case**, which enables partial credit.

### Playwright scoring

For Playwright runs:

- The grader parses JUnit XML (`results.xml`).
- Total tests = `<testcase>` count.
- Passed = `total - failures - errors - skipped`.

## Reserved / blocked candidate paths (security + determinism)

Candidate submissions must not be able to:

- write tests (test injection)
- change dependency manifests (dependency injection)
- change tool config (jest/babel/tsconfig)

So the platform blocks common paths and patterns such as:

- `__tests__/`, `tests/`, `*.test.js`, `*.spec.js`
- `package.json`, `package-lock.json`, `node_modules/`
- Python/Go manifests like `requirements.txt`, `pyproject.toml`, `go.mod`

When you need immutable scaffolding, put it in **`runner.candidate.generatedFiles`**.


