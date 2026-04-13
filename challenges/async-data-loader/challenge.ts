import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Async Data Loader',
  description: `# Async Data Loader Challenge

## What You're Building

Implement **three different data loading functions** using the three core async patterns in JavaScript:
1. **Callbacks** - The classic pattern
2. **Promises** - The intermediate pattern  
3. **Async/Await** - The modern pattern

This challenge tests your understanding of asynchronous JavaScript programming.

---

## Requirements

### Functions to Implement

| Function | Pattern | Signature |
|----------|---------|-----------|
| \`loadWithCallback\` | Callback | \`(url, callback) => void\` |
| \`loadWithPromise\` | Promise | \`(url) => Promise\` |
| \`loadWithAsync\` | Async/Await | \`async (url) => data\` |

### For Each Function:
- Fetch data from the given URL using \`fetch()\`
- Parse the JSON response
- Handle errors gracefully
- Pass/return the parsed data

### Callback Signature
\`\`\`javascript
loadWithCallback(url, (error, data) => {
  if (error) { /* handle error */ }
  else { /* use data */ }
});
\`\`\`

### Bonus: Retry with Exponential Backoff
Implement \`loadWithRetry(url, maxRetries)\` that:
- Retries failed requests up to \`maxRetries\` times
- Uses exponential backoff (1s, 2s, 4s...)
- Returns the data on success or throws after all retries fail

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| Loading spinner | \`loading\` |
| Data display | \`data\` |
| Error message | \`error\` |

---

## Hints

1. **Callbacks are async**: Use \`setTimeout\` or \`fetch().then()\` - never call the callback synchronously
2. **Promise**: Return \`new Promise()\` or use \`fetch()\` directly (it returns a Promise)
3. **Async/Await**: Mark function as \`async\`, use \`await fetch()\`
4. **Error handling**: Try/catch for async/await, \`.catch()\` for Promises, error-first for callbacks

---

## Scoring

| Requirement | Points |
|-------------|--------|
| loadWithCallback works | 3 |
| loadWithPromise works | 3 |
| loadWithAsync works | 3 |
| Callback is truly async | 2 |
| Promise returns Promise instance | 2 |
| Error handling (all patterns) | 3 |
| Retry with backoff | 4 |

**Total: ~20 tests**
`,

  starterFiles: {
    'src/loader.js': `// Async Data Loader
// Implement the three async patterns below

/**
 * Load data using the classic callback pattern.
 * The callback follows Node.js convention: callback(error, data)
 * 
 * IMPORTANT: The callback must be called asynchronously (not immediately)
 * 
 * @param {string} url - The URL to fetch
 * @param {function} callback - Callback function: (error, data) => void
 */
export function loadWithCallback(url, callback) {
  // TODO: Implement using fetch() with .then()/.catch()
  // Remember: callback must be called ASYNCHRONOUSLY
  
}

/**
 * Load data using Promises.
 * 
 * @param {string} url - The URL to fetch
 * @returns {Promise} - Promise that resolves with the data or rejects with error
 */
export function loadWithPromise(url) {
  // TODO: Return a Promise that fetches and parses JSON
  
}

/**
 * Load data using async/await syntax.
 * 
 * @param {string} url - The URL to fetch
 * @returns {Promise} - Async function returns a Promise
 */
export async function loadWithAsync(url) {
  // TODO: Use await with fetch() and response.json()
  
}

/**
 * BONUS: Load data with automatic retry and exponential backoff.
 * 
 * Retry timing: 1s, 2s, 4s, 8s... (exponential backoff)
 * 
 * @param {string} url - The URL to fetch
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise} - Promise that resolves with data or rejects after all retries fail
 */
export async function loadWithRetry(url, maxRetries = 3) {
  // TODO: Implement retry logic with exponential backoff
  // Hint: Use a loop with increasing delays
  
}
`,
    'src/app.js': `// DOM Integration Example
// This file shows how to use the loader functions with the DOM

import { loadWithCallback, loadWithPromise, loadWithAsync } from './loader.js';

// Example: Show loading state in DOM
export function loadDataWithUI(url, method = 'async') {
  const loadingEl = document.querySelector('[data-testid="loading"]');
  const dataEl = document.querySelector('[data-testid="data"]');
  const errorEl = document.querySelector('[data-testid="error"]');
  
  // Show loading
  if (loadingEl) loadingEl.style.display = 'block';
  if (dataEl) dataEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';
  
  const handleSuccess = (data) => {
    if (loadingEl) loadingEl.style.display = 'none';
    if (dataEl) {
      dataEl.style.display = 'block';
      dataEl.textContent = JSON.stringify(data, null, 2);
    }
  };
  
  const handleError = (error) => {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = error.message || 'An error occurred';
    }
  };
  
  switch (method) {
    case 'callback':
      loadWithCallback(url, (err, data) => {
        if (err) handleError(err);
        else handleSuccess(data);
      });
      break;
    case 'promise':
      loadWithPromise(url)
        .then(handleSuccess)
        .catch(handleError);
      break;
    case 'async':
    default:
      loadWithAsync(url)
        .then(handleSuccess)
        .catch(handleError);
      break;
  }
}
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Async Data Loader</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .loader { display: none; padding: 1rem; background: #f0f0f0; border-radius: 4px; }
    .data { display: none; padding: 1rem; background: #e8f5e9; border-radius: 4px; white-space: pre-wrap; }
    .error { display: none; padding: 1rem; background: #ffebee; color: #c62828; border-radius: 4px; }
    button { margin: 0.5rem; padding: 0.5rem 1rem; }
  </style>
</head>
<body>
  <h1>Async Data Loader</h1>
  
  <div>
    <button onclick="loadData('callback')">Load with Callback</button>
    <button onclick="loadData('promise')">Load with Promise</button>
    <button onclick="loadData('async')">Load with Async/Await</button>
  </div>
  
  <div data-testid="loading" class="loader">Loading...</div>
  <div data-testid="data" class="data"></div>
  <div data-testid="error" class="error"></div>
  
  <script type="module">
    import { loadDataWithUI } from './src/app.js';
    
    window.loadData = (method) => {
      loadDataWithUI('https://jsonplaceholder.typicode.com/todos/1', method);
    };
  </script>
</body>
</html>
`,
    'README.md': `# Async Data Loader Challenge

Welcome to the Async Data Loader challenge! This tests your understanding of JavaScript's three main async patterns.

## 🎯 Your Goal

Implement THREE data loading functions in \`src/loader.js\`, each using a different async pattern:

1. **loadWithCallback(url, callback)** - Classic callback pattern
2. **loadWithPromise(url)** - Promise-based approach
3. **loadWithAsync(url)** - Modern async/await syntax

## 📁 Files You'll Edit

| File | Purpose |
|------|---------|
| \`src/loader.js\` | **Main file** - Implement all functions here |
| \`src/app.js\` | DOM integration (already complete - for reference) |

## ✅ What the Tests Check

### Public Tests (5 tests)
These tests verify basic functionality:
- ✓ Each function exists with correct signature
- ✓ Functions return/resolve with fetched data
- ✓ \`loadWithPromise\` returns a Promise
- ✓ \`loadWithAsync\` is an async function

### Hidden Tests (15+ tests)
These tests verify deeper understanding:
- ✓ Callback is truly asynchronous (not called synchronously)
- ✓ Functions actually call \`fetch()\` with the correct URL
- ✓ Error handling works for all three patterns
- ✓ Data is not hardcoded (uses dynamic test data)
- ✓ Retry logic with correct backoff timing (bonus)

## 🚨 Common Mistakes to Avoid

1. **Synchronous callbacks**: Don't call the callback immediately! Use \`.then()\` or \`async/await\`
2. **Missing return**: \`loadWithPromise\` must return the Promise
3. **Forgetting await**: In \`loadWithAsync\`, don't forget \`await\` before \`fetch()\`
4. **No error handling**: All patterns should handle errors gracefully

## 💡 Tips

### Callback Pattern
\`\`\`javascript
function loadWithCallback(url, callback) {
  fetch(url)
    .then(response => response.json())
    .then(data => callback(null, data))  // null = no error
    .catch(error => callback(error, null));
}
\`\`\`

### Promise Pattern
\`\`\`javascript
function loadWithPromise(url) {
  return fetch(url).then(res => res.json());
}
\`\`\`

### Async/Await Pattern
\`\`\`javascript
async function loadWithAsync(url) {
  const response = await fetch(url);
  return await response.json();
}
\`\`\`

## 🏆 Bonus Challenge

Implement \`loadWithRetry(url, maxRetries)\` for extra points!
- Retry failed requests up to N times
- Use exponential backoff (wait 1s, then 2s, then 4s...)

Good luck! 🚀
`,
  },

  dependencies: {},
  nodeVersion: '20',

  // Using ui_jsdom runner - tests run against candidate's JavaScript in JSDOM
  runner: {
    mode: 'ui_jsdom',
    runtime: 'node',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'async-data-loader',
          private: true,
          type: 'commonjs',
          devDependencies: { jsdom: '^24.1.0' },
        }, null, 2) + '\n',
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
let current = { dom: null, window: null, document: null };

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data || {}));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function reset() {
  const { JSDOM } = require('jsdom');
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  
  // Inline both loader.js and app.js
  const loaderJs = fs.existsSync(path.join(__dirname, '..', 'src', 'loader.js')) 
    ? fs.readFileSync(path.join(__dirname, '..', 'src', 'loader.js'), 'utf8') : '';
  const appJs = fs.existsSync(path.join(__dirname, '..', 'src', 'app.js')) 
    ? fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8') : '';
  
  // Replace script tags with inline scripts
  html = html.replace(/<script src="src\\/loader.js"><\\/script>/, '<script>' + loaderJs + '</script>');
  html = html.replace(/<script src="src\\/app.js"><\\/script>/, '<script>' + appJs + '</script>');
  
  const dom = new JSDOM(html, {
    url: 'http://localhost:' + PORT + '/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  
  // Mock fetch for API calls
  dom.window.fetch = async (url, options) => {
    const u = new URL(url, 'http://localhost:' + PORT);
    if (u.pathname.startsWith('/api/')) {
      const delay = parseInt(u.searchParams.get('delay') || '0');
      const fail = u.searchParams.get('fail') === 'true';
      const id = u.pathname.split('/').pop();
      
      await new Promise(r => setTimeout(r, delay));
      
      if (fail) {
        return { ok: false, status: 500, json: async () => ({ error: 'Server error' }) };
      }
      return { ok: true, json: async () => ({ id, name: 'Test Item ' + id, timestamp: Date.now() }) };
    }
    throw new Error('Unknown endpoint: ' + url);
  };
  
  current = { dom, window: dom.window, document: dom.window.document };
}

function getFirst(testId) {
  const el = current.document.querySelector('[data-testid="' + testId + '"]');
  if (!el) throw new Error('No element with data-testid="' + testId + '"');
  return el;
}

function getAll(testId) {
  return Array.from(current.document.querySelectorAll('[data-testid="' + testId + '"]'));
}

async function handle(req, res) {
  const u = new URL(req.url || '/', 'http://localhost');
  if (u.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (u.pathname === '/reset' && req.method === 'POST') { reset(); return sendJson(res, 200, { ok: true }); }
  if (!current.dom) reset();

  if (u.pathname === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.value = String(body.text || '');
    el.dispatchEvent(new current.window.Event('input', { bubbles: true }));
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/text') { const el = getFirst(u.searchParams.get('testId') || ''); return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() }); }
  if (u.pathname === '/allText') { return sendJson(res, 200, { ok: true, texts: getAll(u.searchParams.get('testId') || '').map(e => (e.textContent || '').trim()) }); }
  if (u.pathname === '/count') { return sendJson(res, 200, { ok: true, count: getAll(u.searchParams.get('testId') || '').length }); }
  if (u.pathname === '/html') { const testId = u.searchParams.get('testId'); const el = testId ? getFirst(testId) : current.document.body; return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' }); }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

try { reset(); } catch (e) { console.error('[ui_jsdom] reset failed:', e); }
http.createServer((req, res) => handle(req, res).catch(e => sendJson(res, 500, { ok: false, error: String(e.message || e) }))).listen(PORT, '0.0.0.0', () => console.log('[ui_jsdom] listening on ' + PORT));
`,
      },
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      runCommand: 'node .grader/ui-harness.cjs',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'vitest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      timeoutMs: 120000,
    },
  },

  // ============================================================
  // PUBLIC TESTS - Visible to students
  // ============================================================
  publicTests: `import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from './_harness.js';
import * as fs from 'fs';
import * as path from 'path';

// Load candidate's loader.js for direct testing
const loaderPath = path.join(process.cwd(), 'candidate', 'src', 'loader.js');
let loaderModule;

beforeEach(async () => {
  vi.useFakeTimers();
  // Reset harness
  await client().reset();
  
  // Dynamically import candidate's code
  try {
    const code = fs.readFileSync(loaderPath, 'utf8');
    // Create mock fetch
    global.fetch = vi.fn();
    loaderModule = await import('data:text/javascript,' + encodeURIComponent(code));
  } catch (e) {
    console.log('Could not load loader.js:', e.message);
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Async Data Loader - Public Tests', () => {
  test('loadWithCallback function exists and accepts 2 arguments', () => {
    expect(typeof loaderModule?.loadWithCallback).toBe('function');
    expect(loaderModule?.loadWithCallback.length).toBeGreaterThanOrEqual(2);
  });

  test('loadWithPromise function exists and returns a Promise', async () => {
    expect(typeof loaderModule?.loadWithPromise).toBe('function');
    
    // Mock successful fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'test' }),
    });
    
    const result = loaderModule.loadWithPromise('http://example.com/api');
    expect(result).toBeInstanceOf(Promise);
  });

  test('loadWithAsync function exists and is async', () => {
    expect(typeof loaderModule?.loadWithAsync).toBe('function');
    // Async functions have constructor name 'AsyncFunction'
    expect(loaderModule?.loadWithAsync.constructor.name).toBe('AsyncFunction');
  });

  test('loadWithPromise resolves with fetched data', async () => {
    const mockData = { id: 1, name: 'Test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    
    const result = await loaderModule.loadWithPromise('http://example.com/api');
    expect(result).toEqual(mockData);
  });

  test('loadWithAsync resolves with fetched data', async () => {
    const mockData = { id: 2, name: 'Async Test' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    
    const result = await loaderModule.loadWithAsync('http://example.com/api');
    expect(result).toEqual(mockData);
  });
});
`,

  // ============================================================
  // HIDDEN TESTS - Anti-bypass, comprehensive testing
  // ============================================================
  hiddenTests: `import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { client } from './_harness.js';
import * as fs from 'fs';
import * as path from 'path';

const loaderPath = path.join(process.cwd(), 'candidate', 'src', 'loader.js');
let loaderModule;

beforeEach(async () => {
  await client().reset();
  
  try {
    const code = fs.readFileSync(loaderPath, 'utf8');
    global.fetch = vi.fn();
    loaderModule = await import('data:text/javascript,' + encodeURIComponent(code + '?t=' + Date.now()));
  } catch (e) {
    console.log('Could not load loader.js:', e.message);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Async Data Loader - Hidden Tests', () => {
  // =============================================================
  // ANTI-BYPASS: Callback must be truly asynchronous
  // =============================================================
  test('loadWithCallback is truly asynchronous (not synchronous)', async () => {
    const mockData = { async: true };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    
    let callbackExecuted = false;
    let isAsync = false;
    
    loaderModule.loadWithCallback('http://test.com/api', (err, data) => {
      callbackExecuted = true;
      // If this runs AFTER isAsync = true, callback is properly async
      if (isAsync) {
        expect(err).toBeNull();
        expect(data).toEqual(mockData);
      } else {
        throw new Error('Callback was called synchronously! Must be async.');
      }
    });
    
    // This runs immediately after calling loadWithCallback
    isAsync = true;
    
    // Wait for async operations
    await new Promise(r => setTimeout(r, 100));
    expect(callbackExecuted).toBe(true);
  });

  // =============================================================
  // ANTI-BYPASS: Promise must be a real Promise instance
  // =============================================================
  test('loadWithPromise returns actual Promise instance', () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    
    const result = loaderModule.loadWithPromise('http://test.com');
    
    // Must be a real Promise, not just a thenable
    expect(result).toBeInstanceOf(Promise);
    expect(typeof result.then).toBe('function');
    expect(typeof result.catch).toBe('function');
    expect(typeof result.finally).toBe('function');
  });

  // =============================================================
  // ANTI-BYPASS: Random data prevents hardcoding
  // =============================================================
  test('loadWithPromise returns dynamic data (not hardcoded)', async () => {
    const randomId = 'ID_' + Math.random().toString(36).slice(2);
    const randomName = 'Name_' + Date.now();
    const mockData = { id: randomId, name: randomName };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    
    const result = await loaderModule.loadWithPromise('http://test.com/api');
    
    expect(result.id).toBe(randomId);
    expect(result.name).toBe(randomName);
  });

  test('loadWithAsync returns dynamic data (not hardcoded)', async () => {
    const randomValue = 'VALUE_' + Date.now() + '_' + Math.random();
    const mockData = { value: randomValue, timestamp: Date.now() };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });
    
    const result = await loaderModule.loadWithAsync('http://test.com/api');
    
    expect(result.value).toBe(randomValue);
  });

  // =============================================================
  // ERROR HANDLING
  // =============================================================
  test('loadWithCallback handles fetch errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    const callbackPromise = new Promise((resolve) => {
      loaderModule.loadWithCallback('http://test.com/api', (err, data) => {
        resolve({ err, data });
      });
    });
    
    const { err, data } = await callbackPromise;
    expect(err).toBeTruthy();
    expect(err.message || err).toContain('error');
  });

  test('loadWithPromise rejects on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    await expect(loaderModule.loadWithPromise('http://test.com/api')).rejects.toThrow();
  });

  test('loadWithAsync throws on fetch error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    await expect(loaderModule.loadWithAsync('http://test.com/api')).rejects.toThrow();
  });

  // =============================================================
  // FETCH IS ACTUALLY CALLED
  // =============================================================
  test('loadWithCallback actually calls fetch with the URL', async () => {
    const testUrl = 'http://unique-url-' + Date.now() + '.com/api';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    
    await new Promise(resolve => {
      loaderModule.loadWithCallback(testUrl, () => resolve(null));
    });
    
    expect(global.fetch).toHaveBeenCalledWith(testUrl);
  });

  test('loadWithPromise actually calls fetch with the URL', async () => {
    const testUrl = 'http://unique-promise-url-' + Date.now() + '.com/api';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    
    await loaderModule.loadWithPromise(testUrl);
    
    expect(global.fetch).toHaveBeenCalledWith(testUrl);
  });

  test('loadWithAsync actually calls fetch with the URL', async () => {
    const testUrl = 'http://unique-async-url-' + Date.now() + '.com/api';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    
    await loaderModule.loadWithAsync(testUrl);
    
    expect(global.fetch).toHaveBeenCalledWith(testUrl);
  });

  // =============================================================
  // RETRY LOGIC (BONUS)
  // =============================================================
  test('loadWithRetry retries on failure', async () => {
    if (!loaderModule.loadWithRetry) {
      console.log('loadWithRetry not implemented, skipping');
      return;
    }
    
    let attempts = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      attempts++;
      if (attempts < 3) {
        return Promise.reject(new Error('Temporary failure'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });
    
    const result = await loaderModule.loadWithRetry('http://test.com/api', 5);
    
    expect(attempts).toBeGreaterThanOrEqual(3);
    expect(result.success).toBe(true);
  });

  test('loadWithRetry fails after max retries', async () => {
    if (!loaderModule.loadWithRetry) {
      console.log('loadWithRetry not implemented, skipping');
      return;
    }
    
    global.fetch = vi.fn().mockRejectedValue(new Error('Permanent failure'));
    
    await expect(loaderModule.loadWithRetry('http://test.com/api', 2)).rejects.toThrow();
    
    // Should have tried original + 2 retries = 3 total
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  // =============================================================
  // ANTI-BYPASS: All three patterns work independently
  // =============================================================
  test('all three patterns work with same mock data', async () => {
    const sharedData = { shared: true, id: Date.now() };
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sharedData),
    });
    
    // Test callback
    const callbackResult = await new Promise((resolve) => {
      loaderModule.loadWithCallback('http://test.com/1', (err, data) => {
        resolve(data);
      });
    });
    
    // Test promise
    const promiseResult = await loaderModule.loadWithPromise('http://test.com/2');
    
    // Test async
    const asyncResult = await loaderModule.loadWithAsync('http://test.com/3');
    
    expect(callbackResult).toEqual(sharedData);
    expect(promiseResult).toEqual(sharedData);
    expect(asyncResult).toEqual(sharedData);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
`,
};
