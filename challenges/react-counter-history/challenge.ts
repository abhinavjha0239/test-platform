import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Counter with History (React)',
  description: `# Counter with History

## What You're Building

You're building a **counter component** that tracks every change in a history log. Users can increment, decrement, reset, and undo their last action.

This tests your React fundamentals: state management, event handling, and conditional rendering.

---

## Requirements

### Display
- Show the current count (starts at 0)
- Show a history list of all changes

### Buttons
- **Increment (+1)**: Adds 1 to count
- **Decrement (-1)**: Subtracts 1 from count
- **Reset**: Sets count to 0 and clears history
- **Undo**: Reverts the last change (removes from history)

### History
Each history item shows: \`"<change> → <result>"\`
- After increment from 0: \`"+1 → 1"\`
- After decrement from 5: \`"-1 → 4"\`
- Most recent at top

---

## Test Selectors (Required)

Your component MUST include these \`data-testid\` attributes:

| Element | data-testid |
|---------|-------------|
| Count display | \`count-display\` |
| Increment button | \`increment\` |
| Decrement button | \`decrement\` |
| Reset button | \`reset\` |
| Undo button | \`undo\` |
| Each history entry | \`history-item\` |

---

## Examples

### Initial State
- Count shows: \`0\`
- History is empty
- Undo button is disabled (nothing to undo)

### After clicking Increment 3 times
- Count shows: \`3\`
- History shows (top to bottom):
  - \`+1 → 3\`
  - \`+1 → 2\`
  - \`+1 → 1\`

### After clicking Undo
- Count shows: \`2\`
- History shows:
  - \`+1 → 2\`
  - \`+1 → 1\`

---

## Hints

1. **State Structure**: You need \`count\` and \`history\` (array of entries)
2. **History Entry**: Store \`{ change: '+1' or '-1', result: number }\`
3. **Undo Logic**: Pop the last history item and recalculate count
4. **Disable Undo**: When history is empty, disable the undo button

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Initial render shows 0 | 1 |
| Increment works | 2 |
| Decrement works | 2 |
| History displays correctly | 2 |
| Reset clears count and history | 2 |
| Undo reverts last change | 3 |
| Undo disabled when empty | 1 |

**Total: ~13 tests**
`,

  starterFiles: {
    'src/App.jsx': `import React, { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);

  const handleIncrement = () => {
    // TODO: Increment count
    // TODO: Add entry to history: { change: '+1', result: newCount }
  };

  const handleDecrement = () => {
    // TODO: Decrement count
    // TODO: Add entry to history
  };

  const handleReset = () => {
    // TODO: Set count to 0
    // TODO: Clear history
  };

  const handleUndo = () => {
    // TODO: Remove last history entry
    // TODO: Calculate new count (count before last change)
    // Hint: If history had [{change: '+1', result: 1}], undoing means count becomes 0
  };

  return (
    <div className="counter">
      <h1>Counter with History</h1>
      
      {/* Count Display */}
      <div data-testid="count-display" className="count">
        {count}
      </div>
      
      {/* Buttons */}
      <div className="buttons">
        <button data-testid="increment" onClick={handleIncrement}>
          +1
        </button>
        <button data-testid="decrement" onClick={handleDecrement}>
          -1
        </button>
        <button data-testid="reset" onClick={handleReset}>
          Reset
        </button>
        <button 
          data-testid="undo" 
          onClick={handleUndo}
          disabled={history.length === 0}
        >
          Undo
        </button>
      </div>
      
      {/* History */}
      <div className="history">
        <h2>History</h2>
        {history.length === 0 ? (
          <p>No changes yet</p>
        ) : (
          <ul>
            {/* TODO: Map history entries (most recent first) */}
            {/* Each item should have data-testid="history-item" */}
            {/* Format: "{change} → {result}" */}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
`,
    'src/App.css': `.counter {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  text-align: center;
  font-family: system-ui, sans-serif;
}

.count {
  font-size: 4rem;
  font-weight: bold;
  margin: 1rem 0;
}

.buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin: 1rem 0;
}

.buttons button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  border: 2px solid #333;
  background: white;
  border-radius: 4px;
}

.buttons button:hover:not(:disabled) {
  background: #333;
  color: white;
}

.buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history {
  margin-top: 2rem;
  text-align: left;
}

.history ul {
  list-style: none;
  padding: 0;
}

.history li {
  padding: 0.5rem;
  margin: 0.25rem 0;
  background: #f5f5f5;
  border-radius: 4px;
  font-family: monospace;
}
`,
    'src/main.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Counter with History</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    'README.md': `# Counter with History

A React counter that tracks every change.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Your Task

Complete the TODO sections in \`src/App.jsx\`.
`
  },

  dependencies: {
    'react': '^18.3.1',
    'react-dom': '^18.3.1',
  },
  nodeVersion: '20',

  runner: {
    mode: 'ui_jsdom',
    runtime: 'react',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'counter-history',
          private: true,
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build' },
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
          devDependencies: {
            vite: '^5.4.10',
            '@vitejs/plugin-react': '^4.3.3',
            jsdom: '^24.1.0',
            '@testing-library/react': '^16.0.1',
            '@testing-library/dom': '^10.4.0',
            '@testing-library/user-event': '^14.5.2',
          },
        }, null, 2) + '\n',
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_ENTRY = process.env.APP_ENTRY || '/src/App.jsx';

let vite = null;
let rtl = null;
let userEventMod = null;
let ReactMod = null;

let current = {
  dom: null,
  user: null,
};

function interop(mod) {
  return mod && (mod.default || mod);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data || {});
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function ensureVite() {
  if (vite) return;
  const vitePkg = await import('vite');
  const { createServer } = vitePkg;
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
}

async function ensureLibs() {
  if (!rtl) rtl = await import('@testing-library/react');
  if (!userEventMod) userEventMod = await import('@testing-library/user-event');
  if (!ReactMod) ReactMod = await import('react');
}

async function reset() {
  await ensureVite();
  await ensureLibs();

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://candidate/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  try { rtl.cleanup(); } catch {}

  const mod = await vite.ssrLoadModule(APP_ENTRY);
  const App = interop(mod.default || mod.App || mod);
  const React = interop(ReactMod);
  rtl.render(React.createElement(App), { container: document.getElementById('root') });
  // user-event is ESM; dynamic import returns a module namespace with a default export.
  // Our interop() already returns the default export, so DO NOT access .default again.
  const user = interop(userEventMod).setup({ document: global.document });

  current = { dom, user };
}

function getFirst(testId) {
  const el = global.document.querySelector(\`[data-testid=\"\${testId}\"]\`);
  if (!el) throw new Error(\`No element with data-testid=\"\${testId}\"\`);
  return el;
}

function getAll(testId) {
  return Array.from(global.document.querySelectorAll(\`[data-testid=\"\${testId}\"]\`));
}

async function handle(req, res) {
  const u = new URL(req.url || '/', 'http://candidate');
  const path = u.pathname;

  if (path === '/health') return sendJson(res, 200, { ok: true });
  if (path === '/reset' && req.method === 'POST') { await reset(); return sendJson(res, 200, { ok: true }); }

  if (!current.dom || !current.user) await reset();

  if (path === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    await current.user.click(el);
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    await current.user.clear(el);
    await current.user.type(el, String(body.text || ''));
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/text' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const el = getFirst(testId);
    return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() });
  }

  if (path === '/allText' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = getAll(testId);
    return sendJson(res, 200, { ok: true, texts: els.map((e) => (e.textContent || '').trim()) });
  }

  if (path === '/count' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = getAll(testId);
    return sendJson(res, 200, { ok: true, count: els.length });
  }

  if (path === '/html' && req.method === 'GET') {
    const testId = u.searchParams.get('testId');
    const el = testId ? getFirst(testId) : global.document.getElementById('root');
    return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

async function main() {
  try { await reset(); } catch (e) { console.error('[ui_jsdom] reset failed:', e); }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[ui_jsdom] handler error:', e);
      sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    });
  });
  server.listen(PORT, '0.0.0.0', () => console.log(\`[ui_jsdom] listening on \${PORT}\`));
}

main().catch((e) => { console.error('[ui_jsdom] fatal:', e); process.exit(1); });
`,
        'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '3000'),
    strictPort: true,
    allowedHosts: ['candidate', 'localhost'],
  },
});
`,
        'src/main.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
        'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Counter with History</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
        'src/App.css': `.counter {
  max-width: 400px;
  margin: 2rem auto;
  padding: 2rem;
  text-align: center;
  font-family: system-ui, sans-serif;
}

.count {
  font-size: 4rem;
  font-weight: bold;
  margin: 1rem 0;
}

.buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin: 1rem 0;
}

.buttons button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  cursor: pointer;
  border: 2px solid #333;
  background: white;
  border-radius: 4px;
}

.buttons button:hover:not(:disabled) {
  background: #333;
  color: white;
}

.buttons button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history {
  margin-top: 2rem;
  text-align: left;
}

.history ul {
  list-style: none;
  padding: 0;
}

.history li {
  padding: 0.5rem;
  margin: 0.25rem 0;
  background: #f5f5f5;
  border-radius: 4px;
  font-family: monospace;
}
`,
      },
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      runCommand: 'node .grader/ui-harness.cjs',
      port: 3000,
      healthPath: '/health',
      env: { APP_ENTRY: '/src/App.jsx' },
      startupTimeoutMs: 45000,
    },
    tests: {
      framework: 'vitest',
      image: 'node:20-alpine',
      timeoutMs: 180000,
    },
  },

  publicTests: `import { test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';

const h = client();

beforeEach(async () => {
  await h.reset();
});

test('shows initial count of 0', async () => {
  expect(await h.text('count-display')).toBe('0');
});

test('increment button increases count', async () => {
  await h.click('increment');
  expect(await h.text('count-display')).toBe('1');
});

test('decrement button decreases count', async () => {
  await h.click('decrement');
  expect(await h.text('count-display')).toBe('-1');
});

test('multiple increments work', async () => {
  await h.click('increment');
  await h.click('increment');
  await h.click('increment');
  expect(await h.text('count-display')).toBe('3');
});

test('history shows changes', async () => {
  await h.click('increment');
  expect(await h.allText('history-item')).toEqual(['+1 → 1']);
});

test('history is most-recent-first with correct format', async () => {
  await h.click('increment'); // 1
  await h.click('increment'); // 2
  await h.click('increment'); // 3
  expect(await h.allText('history-item')).toEqual(['+1 → 3', '+1 → 2', '+1 → 1']);
});

test('reset clears count and history', async () => {
  await h.click('increment');
  await h.click('increment');
  await h.click('reset');
  expect(await h.text('count-display')).toBe('0');
  expect(await h.count('history-item')).toBe(0);
});

test('undo reverts last change', async () => {
  await h.click('increment');
  await h.click('increment');
  expect(await h.text('count-display')).toBe('2');
  await h.click('undo');
  expect(await h.text('count-display')).toBe('1');
  expect(await h.count('history-item')).toBe(1);
});

test('undo is disabled when history empty', async () => {
  expect(await h.html('undo')).toMatch(/disabled/);
});
`,

  hiddenTests: `import { test, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { client } from './_harness.js';

const h = client();

beforeEach(async () => {
  await h.reset();
});

test('multiple random clicks track correctly', async () => {
  const clicks = 3 + Math.floor(Math.random() * 4); // 3-6 clicks
  for (let i = 0; i < clicks; i++) await h.click('increment');
  expect(await h.text('count-display')).toBe(String(clicks));
  expect(await h.count('history-item')).toBe(clicks);
});

test('history ordering remains most-recent-first (randomized clicks)', async () => {
  const clicks = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < clicks; i++) await h.click('increment');
  const texts = await h.allText('history-item');
  expect(texts[0]).toMatch(new RegExp(\`^\\\\+1\\\\s*→\\\\s*\${clicks}$\`));
});

test('mixed increment/decrement works', async () => {
  await h.click('increment');
  await h.click('increment');
  await h.click('decrement');
  expect(await h.text('count-display')).toBe('1');
});

test('undo removes history items', async () => {
  await h.click('increment');
  await h.click('increment');
  await h.click('increment');
  expect(await h.count('history-item')).toBe(3);
  await h.click('undo');
  expect(await h.count('history-item')).toBe(2);
});

test('can go negative and undo', async () => {
  await h.click('decrement');
  await h.click('decrement');
  expect(await h.text('count-display')).toBe('-2');
  await h.click('undo');
  expect(await h.text('count-display')).toBe('-1');
});

test('history shows correct format', async () => {
  await h.click('increment');
  const first = (await h.allText('history-item'))[0] || '';
  expect(first).toMatch(/\\+1.*→.*1/);
});

test('decrement history shows correct format', async () => {
  await h.click('decrement');
  const first = (await h.allText('history-item'))[0] || '';
  expect(first).toMatch(/-1.*→.*-1/);
});

test('undo all returns to initial state', async () => {
  await h.click('increment');
  await h.click('increment');
  await h.click('undo');
  await h.click('undo');
  expect(await h.text('count-display')).toBe('0');
  expect(await h.html('undo')).toMatch(/disabled/);
});

test('AST: uses history.map (no hardcoded list)', () => {
  const appPath = path.join('/app/candidate', 'src', 'App.jsx');
  const src = fs.readFileSync(appPath, 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  let hasHistoryMap = false;
  traverse(ast, {
    MemberExpression(p) {
      const obj = p.node.object;
      const prop = p.node.property;
      if (obj && obj.type === 'Identifier' && obj.name === 'history') {
        if (prop && prop.type === 'Identifier' && prop.name === 'map') {
          hasHistoryMap = true;
        }
      }
    },
  });
  expect(hasHistoryMap).toBe(true);
});
`,
};

