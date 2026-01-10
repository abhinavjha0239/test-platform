# Test Design (Robust, secure, non-flaky)

This guide is the **core framework** for authoring tests that are:

- correct
- difficult to game
- deterministic / low-flake
- safe (no hidden-test leakage)

It applies to:

- Jest unit tests (`mode: 'jest'`)
- HTTP blackbox tests (`mode: 'http'`, tests container is Jest)
- Playwright E2E tests (`mode: 'playwright'`)

---

## 0) Principles (scoreable, fair, secure)

### P0: No false positives

A submission with **no implementation** must not pass any meaningful tests.

Classic failure mode:

- tests that assert `404` on missing IDs can pass even if the route is not implemented (Express returns 404 for unknown routes).

Fix: **prove the endpoint exists first**, then test the failure case.

### P1: Determinism > realism

Avoid:

- dependence on wall-clock time (sleep-based assertions)
- network calls (internet is disabled during test execution)
- unstable data ordering unless explicitly required by contract

If you need randomness:

- generate random input, but keep constraints stable
- do not log random secrets

### P2: Tests should be independent

Each test should:

- set up its own data
- not depend on previous tests
- be runnable in any order

### P3: Each requirement maps to a test case

The grader scores by **test case count**:

- Jest: count of `assertionResults`
- Playwright: count of JUnit `<testcase>`

So design so that:

- one requirement ≈ one test case
- failures are localized and provide partial credit

---

## 1) Public vs Hidden tests (what goes where)

### Public tests

Purpose: give candidates **actionable feedback**.

Include:

- basic happy paths
- basic error handling (but avoid the 404/400 trap; see below)
- schema/shape checks (fields present, types)

Avoid:

- strict edge cases that would be discouraging without hints
- leaking expected constants that would give away hidden logic

### Hidden tests

Purpose: enforce completeness and prevent gaming.

Include:

- edge cases
- tricky input validation
- robustness (idempotency, multiple requests, persistence)
- anti-hardcoding checks (randomized inputs, multiple variations)

Avoid:

- dumping huge payloads to logs
- assertions that leak exact expected values in error messages

---

## 2) Anti-bypass patterns (traps you must avoid)

### The 404 trap (dangerous)

**Bad** (passes if the route does not exist):

```js
test('GET /todos/:id returns 404 for missing', async () => {
  const res = await request(BASE_URL).get('/todos/99999');
  expect(res.status).toBe(404);
});
```

**Good** (prove route exists first):

```js
test('GET /todos/:id returns 404 for missing (after proving endpoint works)', async () => {
  const created = await request(BASE_URL).post('/todos').send({ title: 'x' });
  expect(created.status).toBe(201);

  const ok = await request(BASE_URL).get('/todos/' + created.body.id);
  expect(ok.status).toBe(200);

  const missing = await request(BASE_URL).get('/todos/99999');
  expect(missing.status).toBe(404);
});
```

### The 400 trap (dangerous)

**Bad** (can pass accidentally if endpoint returns 404 or is missing):

```js
test('POST /todos without title returns 400', async () => {
  const res = await request(BASE_URL).post('/todos').send({});
  expect(res.status).toBe(400);
});
```

**Good** (prove POST works first):

```js
test('POST /todos without title returns 400 (after proving POST works)', async () => {
  const ok = await request(BASE_URL).post('/todos').send({ title: 'x' });
  expect(ok.status).toBe(201);

  const bad = await request(BASE_URL).post('/todos').send({});
  expect(bad.status).toBe(400);
});
```

### The empty-list trap

If you only assert that `GET /items` returns an array, a candidate can always return `[]`.

Fix: create an item, then assert it appears in list.

### The hardcoded-output trap

If you use fixed sample inputs, candidates can hardcode responses.

Fix: include at least one randomized input per hidden suite:

- random titles/strings
- random valid IDs
- multiple variations

### The state-leak trap (order dependence)

If tests depend on shared state, a single failure can cascade.

Fix: reset state between tests (unit tests) or set up data per test (blackbox/E2E).

---

## 3) Designing HTTP API tests (Jest + supertest)

### Use a stable base URL

In blackbox mode the grader sets:

- `BASE_URL=http://candidate:<port>`

Recommended harness:

```js
const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
```

### Assert the contract, not the implementation

Prefer:

- status codes
- response body shape
- headers (if relevant)
- id uniqueness
- persistence across requests

Avoid:

- stack trace expectations
- exact error message strings (unless required)

### Make error tests meaningful

Error tests should be *behavioral*:

- missing required fields => 400
- non-existent resource => 404
- invalid ID format => 404 (or 400, but be consistent in spec)

And they should be preceded by a quick proof that the endpoint works.

### Keep JSON shape checks strict enough

Example:

```js
expect(res.body).toEqual(
  expect.objectContaining({
    id: expect.anything(),
    title: expect.any(String),
    createdAt: expect.any(String),
  })
);
```

### Limit log output

Don’t `console.log(res.body)` in hidden tests; any output can end up in logs (even if sanitized).

---

## 4) Designing Playwright tests (frontend/full-stack)

### Prefer stable selectors

Best: `data-testid`

```tsx
<button data-testid='submit'>Submit</button>
```

Playwright:

```js
await page.getByTestId('submit').click();
```

Fallback: ARIA roles/labels:

```js
await page.getByRole('button', { name: /submit/i }).click();
```

### Avoid sleep-based waits

Bad:

```js
await page.waitForTimeout(1000);
```

Good:

```js
await expect(page.getByText('Saved')).toBeVisible();
```

### Keep tests small and independent

- One user story per test
- Avoid chaining multiple stories in one test unless it is a “flow” test by design

### Full-stack via Playwright

Playwright can test:

- UI flows (forms, navigation)
- API behavior indirectly (UI triggers fetch)
- API behavior directly (Playwright `request` fixture)

---

## 5) Security considerations while authoring tests

- Do not print hidden expected values.
- Avoid including the solution in test names.
- In hidden tests, prefer asserting on *properties* rather than exact constants.
- Keep `generatedFiles` for dependency manifests (prevents dependency injection).

---

## 6) Authoring checklist (fast)

- [ ] At least one public test proves the happy path works
- [ ] Each negative test proves the endpoint exists first (no 404/400 trap)
- [ ] Hidden tests include at least one randomized input
- [ ] No test depends on previous test execution
- [ ] No external network dependencies
- [ ] Logs are candidate-safe (especially hidden)


