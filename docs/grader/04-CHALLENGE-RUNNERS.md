# Challenge Runners

Challenge runners define how candidate code is executed and tested. The platform supports multiple runner modes to accommodate different types of challenges.

## Runner Mode Overview

| Mode | Use Case | Isolation Level | Test Secrecy |
|------|----------|-----------------|--------------|
| `jest` (legacy) | Simple Node/React | Medium | Medium |
| `http` | API/Backend | High | **High** |
| `playwright` | UI/React E2E | High | **High** |

---

## 1. Jest Runner (Legacy)

The default runner when no `runner` config is specified.

### How It Works

```
┌────────────────────────────────────────────┐
│            Single Container                │
│                                            │
│  ┌────────────────────────────────────┐   │
│  │  Candidate Code                    │   │
│  │  - src/app.js                      │   │
│  │  - src/utils.js                    │   │
│  └────────────────────────────────────┘   │
│                  │                         │
│                  ▼                         │
│  ┌────────────────────────────────────┐   │
│  │  Jest Tests                        │   │
│  │  - __tests__/public.test.js        │   │
│  │  - __tests__/hidden.test.js        │   │
│  │                                    │   │
│  │  Tests IMPORT candidate code       │   │
│  │  const app = require('../src/app')│   │
│  └────────────────────────────────────┘   │
│                                            │
└────────────────────────────────────────────┘
```

### Configuration

```typescript
// No runner config needed (default behavior)
const challenge = {
  name: 'React Counter',
  starterFiles: {
    'src/Counter.jsx': '...',
  },
  publicTests: `
    import { render } from '@testing-library/react';
    import Counter from '../src/Counter';
    
    test('renders counter', () => {
      render(<Counter />);
    });
  `,
  hiddenTests: `...`,
  dependencies: {
    'react': '^18.0.0',
    'react-dom': '^18.0.0',
  },
};
```

### Security Considerations

- ⚠️ Tests run in same container as candidate code
- ⚠️ Candidate code could potentially read test files
- ✅ Separate directories mitigate direct file access
- ✅ Good for React/frontend challenges where tests import components

---

## 2. HTTP Blackbox Runner

**Recommended for API/Backend challenges**

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Isolated Network                          │
│                                                                  │
│  ┌──────────────────────────┐   HTTP   ┌──────────────────────┐ │
│  │  Candidate Container     │◀────────▶│  Test Container      │ │
│  │                          │          │                      │ │
│  │  - src/app.js            │          │  - Jest + Supertest  │ │
│  │  - node server.js        │          │  - Tests make HTTP   │ │
│  │  - Listens on port 3000  │          │    requests          │ │
│  │                          │          │                      │ │
│  │  ❌ NO test code         │          │  ❌ NO candidate     │ │
│  │                          │          │     code             │ │
│  └──────────────────────────┘          └──────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

```typescript
const challenge = {
  name: 'Express Todo API',
  runner: {
    mode: 'http',
    runtime: 'node',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      installCommand: 'npm install --legacy-peer-deps',
      runCommand: 'node src/server.js',
      port: 3000,
      healthPath: '/todos',
      env: { NODE_ENV: 'test' },
      startupTimeoutMs: 20000,
    },
    tests: {
      framework: 'jest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps',
      testCommand: 'npm test',
      env: {},
      timeoutMs: 120000,
    },
  },
  starterFiles: {
    'src/app.js': `
const express = require('express');
const app = express();
app.use(express.json());
// TODO: Implement endpoints
module.exports = app;
    `,
    'src/server.js': `
const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running'));
    `,
  },
  publicTests: `
const request = require('supertest');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test('GET /todos returns array', async () => {
  const res = await request(BASE_URL).get('/todos');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});
  `,
  hiddenTests: `...`,
  dependencies: {
    'express': '^4.18.2',
  },
};
```

### Candidate Container Options

| Option | Type | Description |
|--------|------|-------------|
| `image` | string | Docker image (e.g., `node:20-alpine`) |
| `workdir` | string | Container working directory (default: `/app`) |
| `generatedFiles` | Record<string, string> | Files grader writes (candidate can't override) |
| `installCommand` | string | Run before server (e.g., `npm install`) |
| `runCommand` | string | Start the server (e.g., `node server.js`) |
| `port` | number | Port server listens on (default: 3000) |
| `healthPath` | string | Path for health check (default: `/`) |
| `env` | Record<string, string> | Environment variables |
| `startupTimeoutMs` | number | Max wait for server ready (default: 20000) |

### Test Container Options

| Option | Type | Description |
|--------|------|-------------|
| `framework` | 'jest' | Test framework |
| `image` | string | Docker image (default: same as candidate) |
| `installCommand` | string | Install test dependencies |
| `testCommand` | string | Run tests (default: `npm test`) |
| `env` | Record<string, string> | Environment variables |
| `timeoutMs` | number | Test timeout (default: 120000) |

### Generated Files

The grader can write files that candidates cannot override:

```typescript
runner: {
  mode: 'http',
  runtime: 'node',
  candidate: {
    generatedFiles: {
      'package.json': JSON.stringify({
        name: 'candidate-app',
        dependencies: { express: '^4.18.2' },
      }),
    },
  },
}
```

This is useful for:
- Controlling dependencies (preventing injection)
- Adding configuration files
- Multi-runtime manifests (requirements.txt, go.mod)

---

## 3. Playwright Runner

**Recommended for UI/React challenges with E2E testing**

### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Isolated Network                          │
│                                                                  │
│  ┌──────────────────────────┐   HTTP   ┌──────────────────────┐ │
│  │  Candidate Container     │◀────────▶│  Playwright Container│ │
│  │                          │          │                      │ │
│  │  - React app             │          │  - Chromium browser  │ │
│  │  - npm start (dev server)│          │  - Playwright tests  │ │
│  │  - Listens on port 3000  │          │  - Interacts with UI │ │
│  │                          │          │                      │ │
│  │  ❌ NO test code         │          │  ❌ NO candidate     │ │
│  │                          │          │     code             │ │
│  └──────────────────────────┘          └──────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Configuration

```typescript
const challenge = {
  name: 'React Todo App',
  runner: {
    mode: 'playwright',
    runtime: 'react',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      installCommand: 'npm install',
      runCommand: 'npm start',
      port: 3000,
      healthPath: '/',
      env: { NODE_ENV: 'development' },
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'playwright',
      image: 'mcr.microsoft.com/playwright:v1.57.0-jammy',
      installCommand: 'npm install',
      testCommand: 'npx playwright test --reporter=junit',
      env: {},
      timeoutMs: 180000,
    },
  },
  starterFiles: {
    'src/App.jsx': '...',
    'package.json': '...',
  },
  publicTests: `
const { test, expect } = require('@playwright/test');

test('renders todo input', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('input[type="text"]')).toBeVisible();
});
  `,
  hiddenTests: `...`,
};
```

### Playwright Test Example

```javascript
const { test, expect } = require('@playwright/test');

test('can add todo item', async ({ page }) => {
  // Navigate to app (BASE_URL set by grader)
  await page.goto('/');
  
  // Add a todo
  await page.fill('input[placeholder="Add todo"]', 'Buy milk');
  await page.click('button:has-text("Add")');
  
  // Verify it appears
  await expect(page.locator('li:has-text("Buy milk")')).toBeVisible();
});

test('can mark todo as complete', async ({ page }) => {
  await page.goto('/');
  
  // Add a todo
  await page.fill('input', 'Test task');
  await page.click('button:has-text("Add")');
  
  // Mark as complete
  await page.click('input[type="checkbox"]');
  
  // Verify styling
  await expect(page.locator('li')).toHaveClass(/completed/);
});
```

---

## 4. Multi-Runtime Support

The HTTP blackbox runner supports multiple runtimes:

### Node.js

```typescript
runner: {
  mode: 'http',
  runtime: 'node',
  candidate: {
    image: 'node:20-alpine',
    runCommand: 'node server.js',
  },
}
```

### Python

```typescript
runner: {
  mode: 'http',
  runtime: 'python',
  candidate: {
    image: 'python:3.11-slim',
    installCommand: 'pip install -r requirements.txt',
    runCommand: 'python app.py',
    generatedFiles: {
      'requirements.txt': 'flask==3.0.0\ngunicorn==21.2.0',
    },
  },
}
```

### Go

```typescript
runner: {
  mode: 'http',
  runtime: 'go',
  candidate: {
    image: 'golang:1.21-alpine',
    installCommand: 'go build -o server .',
    runCommand: './server',
    generatedFiles: {
      'go.mod': 'module candidate\n\ngo 1.21',
    },
  },
}
```

---

## 5. Health Checks

Before running tests, the grader waits for the candidate server:

```typescript
// Global setup waits for server
module.exports = async () => {
  const baseUrl = process.env.BASE_URL;
  const healthPath = process.env.HEALTH_PATH || '/';
  const timeoutMs = parseInt(process.env.STARTUP_TIMEOUT_MS || '20000');
  
  const deadline = Date.now() + timeoutMs;
  
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl + healthPath);
      if (res && typeof res.status === 'number') return; // Server is up
    } catch (e) {
      // Not ready yet
    }
    await sleep(500);
  }
  
  throw new Error('Server did not start in time');
};
```

---

## 6. Choosing a Runner

| Challenge Type | Recommended Runner | Reason |
|----------------|-------------------|--------|
| React Component | `jest` (default) | Tests import and render components |
| Express API | `http` | Complete API isolation |
| REST API (any lang) | `http` | Language-agnostic testing |
| React Full App | `playwright` | E2E browser testing |
| Full-stack App | `playwright` | Tests frontend, backend implicitly |

---

## 7. Best Practices

### For Challenge Creators

1. **API Challenges**: Always use `http` mode for true hidden test secrecy
2. **Set reasonable timeouts**: Account for npm install + server startup
3. **Include health endpoint**: Makes startup detection reliable
4. **Test your tests**: Run them locally before deploying

### For Public Tests

- Give enough feedback for candidates to debug
- Test basic functionality
- Include example usage in error messages

### For Hidden Tests

- Test edge cases
- Test error handling (400, 404, 500)
- Test data persistence
- Test input validation
- Don't include obvious expected values in assertions

### Example Hidden Test Pattern

```javascript
// Good: Tests behavior without revealing exact expectation
test('handles edge case correctly', async () => {
  const res = await request(BASE_URL).post('/items').send({ name: '' });
  expect(res.status).toBe(400);
});

// Bad: Reveals expected value in assertion message
test('returns correct sum', async () => {
  const res = await request(BASE_URL).get('/calculate?a=5&b=3');
  expect(res.body.result).toBe(8); // Reveals answer!
});
```

