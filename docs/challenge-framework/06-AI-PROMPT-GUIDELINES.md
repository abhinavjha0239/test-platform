# AI Prompt Guidelines (Generate challenges safely + consistently)

This guide gives you **prompt frameworks** that reliably produce:

- a clear problem statement
- correct starter files
- robust public tests
- robust hidden tests (no leakage)
- correct runner configuration (http/playwright/jest)
- a review checklist so you catch bypasses (404/400 trap) and flakiness

> Goal: You can hand a single prompt to an AI and get a challenge that is *publish-ready* with minimal edits.

---

## 0) Non-negotiable authoring rules (tell the AI)

1. **No false positives**: a blank submission must not pass meaningful tests.
2. **Avoid the 404/400 trap**: negative tests must first prove the endpoint exists.
3. **No secret leakage**:
   - hidden tests must not print the solution or exact expected constants
   - no hidden test names that reveal the approach
4. **Deterministic**:
   - no internet access assumptions
   - no time-based sleeps
   - no flaky selectors
5. **Grader constraints**:
   - backend multi-language uses `runner.mode='http'` and tests are written in JS using Jest+supertest
   - frontend uses `runner.mode='playwright'` and tests are Playwright spec files
   - candidates cannot edit dependency manifests; use `runner.candidate.generatedFiles`

---

## 1) “One-shot” master prompt (recommended)

Use this when you want the AI to output the full challenge object.

```text
You are authoring a coding challenge for an exam platform.

Output MUST be a single TypeScript object literal named `challenge` with:
  - name (string)
  - description (string, candidate-facing, include exact API/UI contract)
  - starterFiles: Record<string, string>
  - publicTests: string  (tests safe to show to candidate)
  - hiddenTests: string  (tests NOT shown to candidate, do NOT leak secrets)
  - dependencies: Record<string, string> (only relevant for Node/Jest runner; keep empty for non-Node)
  - nodeVersion: "20"
  - runner: ChallengeRunner (choose correctly)

Choose runner:
  - If backend/API: runner.mode="http" and write tests in JS using supertest + BASE_URL.
  - If frontend/full-stack UI: runner.mode="playwright" and write Playwright tests.
  - If JS/TS library/component only: runner.mode="jest" (or omit runner).

Hard constraints:
  - Public tests must be helpful.
  - Hidden tests must be loophole-free, avoid printing expected values, and must include at least one randomized input.
  - Any test that expects 404 or 400 MUST first prove the endpoint exists (create + read).
  - No test may depend on execution order.
  - No network calls outside BASE_URL (internet is not available during test execution).
  - Keep tests deterministic: no waitForTimeout / sleep.
  - If using http runner, candidate server must bind to 0.0.0.0 and read port from PORT env var.
  - Provide a /health endpoint and set runner.candidate.healthPath="/health".

Challenge request:
  - Language/framework: {{LANGUAGE_AND_FRAMEWORK}}
  - Difficulty: {{DIFFICULTY}}
  - Expected time: {{TIME_MINUTES}} minutes
  - What to build: {{REQUIREMENTS}}
  - Allowed dependencies: {{ALLOWED_DEPS}} (if any)
  - Scoring: map each requirement to a distinct test case (partial credit)
  - Include 5-8 public tests and 10-20 hidden tests.

Now produce the `challenge` object.
```

---

## 2) Public tests prompt (high signal)

Use this when you already have starter files and want AI to author public tests.

```text
Write PUBLIC tests for this challenge.

Rules:
  - Tests must be candidate-helpful (clear failures).
  - Do NOT leak hidden logic or solution steps.
  - Ensure no false positives: a blank implementation should fail quickly.
  - Avoid the 404/400 trap: prove endpoint exists before checking 404/400.
  - Keep tests deterministic (no sleep).

Runner mode: {{http|playwright|jest}}
Contract: {{PASTE_CONTRACT}}
Starter files summary: {{PASTE_STARTER_FILES_SUMMARY}}

Output only the test file contents as a JS string (no markdown fences).
```

---

## 3) Hidden tests prompt (anti-cheat)

```text
Write HIDDEN tests for this challenge.

Rules:
  - Loophole-free: prevent hardcoding and empty implementations from passing.
  - Include randomized inputs in at least 2 tests (but keep deterministic assertions).
  - Do NOT print solution constants or exact expected values in failure messages.
  - Avoid the 404/400 trap: prove endpoint exists before 404/400 checks.
  - Avoid order dependence (each test sets up its own state).
  - Keep runtime reasonable (no huge loops).

Runner mode: {{http|playwright|jest}}
Contract: {{PASTE_CONTRACT}}

Output only the test file contents as a JS string (no markdown fences).
```

---

## 4) Runner config prompt (http/playwright)

```text
Given this challenge and starter files, output the correct runner configuration.

If backend/API:
  - mode: "http"
  - candidate.image: pick official image for the language
  - candidate.installCommand: install dependencies (manifest must be generatedFiles)
  - candidate.runCommand: start server binding 0.0.0.0:$PORT
  - candidate.healthPath: "/health"

If frontend UI:
  - mode: "playwright"
  - candidate.image: node:20-alpine
  - candidate.runCommand: ensure server binds 0.0.0.0:$PORT
  - tests.image: Playwright image

Hard constraint:
  - candidates cannot modify dependency manifests; put them in generatedFiles.

Output JSON only.
```

---

## 5) AI self-review prompt (catch bypasses + flakiness)

```text
Review this generated challenge for:
  - false positives (blank submission passing)
  - 404/400 trap
  - test order dependence
  - flaky timing/selectors (Playwright)
  - hidden test leakage (logs, assertion messages, test names)
  - dependency injection risks (manifests must be generatedFiles)
  - runtime/timeout realism (install/build time)

Output:
  1) a list of concrete issues (bullet points)
  2) exact edits to fix them (diff-style or patch instructions)
```

---

## 6) Challenge “levels” framework (so AI difficulty is consistent)

- **Easy**: 4–6 public tests, 6–10 hidden tests; single concept; minimal edge cases.
- **Medium**: 6–10 public, 10–18 hidden; multiple endpoints/states; input validation and persistence.
- **Hard**: 8–12 public, 16–25 hidden; concurrency, auth, complex UI flows, security constraints.

---

## 7) Recommended output structure for AI (copy-paste stable)

When prompting, require the AI to create:

- `description` with:
  - exact endpoints / UI flows
  - response shapes (examples)
  - constraints (timeouts, memory)
- starterFiles with:
  - `README.md` for candidates
  - a `/health` endpoint
  - clear TODO markers
- tests with:
  - “happy path” tests
  - 2–3 negative tests (careful with 404/400 trap)
  - randomized anti-hardcoding hidden tests


