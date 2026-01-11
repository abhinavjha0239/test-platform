# Frontend + Full-stack Templates

This platform supports two primary ways to test frontend/full-stack challenges:

1. **React/JS unit tests** via legacy Jest (fast, component-level)
2. **E2E browser tests** via Playwright runner (recommended for UI + full-stack flows)

---

## Template: React component (Unit tests, `mode: 'jest'`)

### When to use

- Small React component tasks (state, props, events)
- Pure UI logic without backend

### How it grades

The Docker Jest grader can detect React dependencies and generates:

- `jest.config.js`, `babel.config.js`, `jest.setup.js`
- runs Jest with a strict testPath pattern

So you can author tests as if they are normal React tests.

### Starter files (example)

```jsx
// src/Counter.jsx
import React from 'react';

export default function Counter() {
  // TODO: implement
  return <div>Counter</div>;
}
```

### Public test example

```js
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Counter from '../src/Counter';

test('renders initial count of 0', () => {
  render(<Counter />);
  expect(screen.getByText(/0/)).toBeInTheDocument();
});

test('increments on click', async () => {
  const user = userEvent.setup();
  render(<Counter />);
  await user.click(screen.getByRole('button', { name: /increment/i }));
  expect(screen.getByText(/1/)).toBeInTheDocument();
});
```

### Hidden tests (pattern)

- randomized click counts
- edge cases (double click, reset)
- verify accessibility (button labels)

---

## Template: UI app (Playwright E2E, `mode: 'playwright'`)

### When to use

- Any UI where correctness = user flows
- SPA routing, form validation, async data loading

### Runner preset (React + Vite)

```ts
runner: {
  mode: 'playwright',
  runtime: 'react',
  candidate: {
    image: 'node:20-alpine',
    workdir: '/app',
    generatedFiles: {
      // Provide immutable package.json (candidates cannot modify dependency manifests)
      'package.json': JSON.stringify({
        name: 'candidate-react-app',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          react: '^18.3.1',
          'react-dom': '^18.3.1',
        },
        devDependencies: {
          vite: '^5.4.10',
          '@vitejs/plugin-react': '^4.3.3',
        },
      }, null, 2),
      // vite.config.js reads PORT from env and binds 0.0.0.0
      'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '3000'),
    strictPort: true,
  },
});
`,
    },
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    runCommand: 'npm run dev',
    port: 3000,
    healthPath: '/',
    startupTimeoutMs: 45000,
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

> **Note**: `vite.config.js` reads `PORT` from environment and binds to `0.0.0.0`. This is a grader-generated file so candidates cannot modify it.

### Playwright public test example (stable selectors)

```js
const { test, expect } = require('@playwright/test');

test('can add a todo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('todo-input').fill('Buy milk');
  await page.getByTestId('todo-add').click();
  await expect(page.getByText('Buy milk')).toBeVisible();
});
```

### Hidden tests (pattern)

- verify persistence across refresh (if required)
- edge validation (empty input, long text)
- keyboard interactions (enter to submit)
- accessibility: roles/labels

---

## Template: Full-stack (Playwright E2E)

### Option A (recommended): single server on one port

Choose frameworks where UI + API share a single server/port:

- Next.js (pages/app router + API routes)
- Remix
- a backend that serves built frontend assets

Then Playwright can test:

- UI flows
- API routes indirectly (via UI)
- API routes directly (via `request` fixture)

Example:

```js
const { test, expect } = require('@playwright/test');

test('POST /api/items creates item', async ({ request }) => {
  const res = await request.post('/api/items', { data: { name: 'x' } });
  expect(res.status()).toBe(201);
});
```

### Option B: multiple processes inside one container

If you need separate backend + frontend processes, you can run both in the candidate container:

- Use a runner `runCommand` that starts both (e.g. `concurrently`)
- Expose one stable base URL to Playwright (proxy or frontend dev server)

Authoring guidance:

- keep ports stable
- ensure readiness (healthPath) works
- avoid relying on external services

---

## Frontend test design rules (high signal)

- Use `data-testid` (or stable roles/labels), never brittle CSS selectors.
- Avoid `waitForTimeout`; use Playwright expect-based waits.
- Keep each test a single user story; one “full flow” test is okay, but don’t cram everything into it.
- Don’t leak hidden expected values in error messages.


