import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'React Expense Tracker',
  description: `# React Expense Tracker

Build a personal expense tracking application using React.

## Features
- Add expenses with description, amount, and category
- View expense list with category badges
- Delete expenses
- Filter by category
- View total amount
- Data persists in localStorage

## Test Selectors (data-testid)
| Element | data-testid |
|---------|-------------|
| Description input | desc-input |
| Amount input | amount-input |
| Category select | category-select |
| Add button | add-btn |
| Expense list | expense-list |
| Expense row | expense-{id} |
| Row description | expense-{id}-desc |
| Row amount | expense-{id}-amount |
| Row category | expense-{id}-category |
| Row delete button | expense-{id}-delete |
| Filter All | filter-all |
| Filter Food | filter-food |
| Filter Transport | filter-transport |
| Filter Shopping | filter-shopping |
| Filter Bills | filter-bills |
| Filter Other | filter-other |
| Total display | total-amount |
| Clear all button | clear-all |
`,

  starterFiles: {
    'README.md': `# React Expense Tracker

## Overview

Build a **personal expense tracker** using React. You'll practice core React concepts:
\\\`useState\\\`, event handling, list rendering, filtering, and derived state.

---

## What You Need to Build

### 1. Add Expense Form
- **Description** input (\\\`data-testid="desc-input"\\\`)
- **Amount** input, type number (\\\`data-testid="amount-input"\\\`)
- **Category** select dropdown (\\\`data-testid="category-select"\\\`) with options:
  - Food, Transport, Shopping, Bills, Other
- **Add** button (\\\`data-testid="add-btn"\\\`)
- Inputs must clear after a successful add
- Reject empty description or amount <= 0

### 2. Expense List
- Container: \\\`data-testid="expense-list"\\\`
- Each expense item: \\\`data-testid="expense-{id}"\\\`
  - Description text: \\\`data-testid="expense-{id}-desc"\\\`
  - Amount text: \\\`data-testid="expense-{id}-amount"\\\` (display as \\\`$XX.XX\\\`)
  - Category badge: \\\`data-testid="expense-{id}-category"\\\`
  - Delete button: \\\`data-testid="expense-{id}-delete"\\\`

### 3. Category Filters
Filter buttons that show only expenses of that category:
- \\\`data-testid="filter-all"\\\` — show all (default, has \\\`active\\\` CSS class)
- \\\`data-testid="filter-food"\\\`
- \\\`data-testid="filter-transport"\\\`
- \\\`data-testid="filter-shopping"\\\`
- \\\`data-testid="filter-bills"\\\`
- \\\`data-testid="filter-other"\\\`
- Active filter button must have CSS class \\\`active\\\`

### 4. Total & Clear
- \\\`data-testid="total-amount"\\\` — total of **currently visible** (filtered) expenses, e.g. \\\`$45.50\\\`
- \\\`data-testid="clear-all"\\\` — removes all expenses

### 5. Persistence
- Save expenses to \\\`localStorage\\\` key \\\`"expenses"\\\`
- Load from \\\`localStorage\\\` on mount (use lazy initializer in useState)

---

## Data Shape

Each expense object in state / localStorage:
\\\`\\\`\\\`json
{
  "id": "unique-string",
  "description": "Coffee",
  "amount": 4.5,
  "category": "Food",
  "createdAt": 1700000000000
}
\\\`\\\`\\\`

---

## Scoring (14 public + 14 hidden tests)

| Area | Tests |
|------|-------|
| Elements render | 1 |
| Empty state | 1 |
| Validation (empty desc) | 1 |
| Validation (bad amount) | 1 |
| Add expense | 1 |
| Inputs clear | 1 |
| Amount formatting | 1 |
| Category badge | 1 |
| Delete | 1 |
| Unique IDs | 1 |
| Category filter | 1 |
| Filter All | 1 |
| Total updates | 1 |
| localStorage persistence | 1 |

Hidden tests use randomized data to prevent hardcoding.

---

## Implementation Tips

1. Start with \\\`useState\\\` for the expenses array
2. Create a \\\`generateId()\\\` helper (e.g. \\\`Date.now().toString(36) + Math.random().toString(36).slice(2)\\\`)
3. Use a separate \\\`useState\\\` for the active filter
4. Compute filtered expenses and total with \\\`.filter()\\\` and \\\`.reduce()\\\` — don't store them in state
5. Use \\\`useEffect\\\` to sync expenses to localStorage whenever they change
6. For the amount display, use \\\`.toFixed(2)\\\`

Good luck!
`,

    'src/App.jsx': `import { useState, useEffect } from 'react';
import './styles.css';

// Expense Tracker Application
// Implement a personal expense tracker with:
// 1. Add expenses (description + amount + category)
// 2. Display expense list with category badges
// 3. Delete expenses
// 4. Filter by category
// 5. Total calculation
// 6. localStorage persistence

// Categories: Food, Transport, Shopping, Bills, Other

function App() {
  // TODO: Initialize expenses state from localStorage
  // Hint: useState(() => { const saved = localStorage.getItem('expenses'); ... })
  const [expenses, setExpenses] = useState([]);

  // TODO: State for form inputs
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');

  // TODO: State for active filter
  const [activeFilter, setActiveFilter] = useState('All');

  // TODO: Sync expenses to localStorage with useEffect
  // useEffect(() => { localStorage.setItem('expenses', JSON.stringify(expenses)); }, [expenses]);

  // TODO: Generate unique ID
  function generateId() {
    // return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // TODO: Add expense handler
  function handleAdd() {
    // Validate: description not empty, amount > 0
    // Create expense object: { id, description, amount (as number), category, createdAt }
    // Add to state, clear inputs
  }

  // TODO: Delete expense
  function handleDelete(id) {
    // Filter out the expense with matching id
  }

  // TODO: Get filtered expenses based on activeFilter
  function getFilteredExpenses() {
    // If activeFilter === 'All', return all
    // Otherwise filter by category
    return expenses;
  }

  // TODO: Calculate total of filtered expenses
  function getTotal() {
    // Use .reduce() on filtered expenses
    return 0;
  }

  const categories = ['All', 'Food', 'Transport', 'Shopping', 'Bills', 'Other'];
  const filteredExpenses = getFilteredExpenses();
  const total = getTotal();

  return (
    <div className="app">
      <h1>Expense Tracker</h1>

      {/* Add Expense Form */}
      <div className="form">
        <input
          data-testid="desc-input"
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          data-testid="amount-input"
          type="number"
          placeholder="Amount"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          data-testid="category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="Food">Food</option>
          <option value="Transport">Transport</option>
          <option value="Shopping">Shopping</option>
          <option value="Bills">Bills</option>
          <option value="Other">Other</option>
        </select>
        <button data-testid="add-btn" onClick={handleAdd}>
          Add Expense
        </button>
      </div>

      {/* Category Filters */}
      <div className="filters">
        {categories.map((cat) => (
          <button
            key={cat}
            data-testid={\\\`filter-\\\${cat.toLowerCase()}\\\`}
            className={activeFilter === cat ? 'active' : ''}
            onClick={() => setActiveFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Total */}
      <div className="total">
        Total: <span data-testid="total-amount">\$\{total.toFixed(2)}</span>
      </div>

      {/* Expense List */}
      <div data-testid="expense-list" className="expense-list">
        {filteredExpenses.map((exp) => (
          <div key={exp.id} data-testid={\\\`expense-\\\${exp.id}\\\`} className="expense-item">
            <span data-testid={\\\`expense-\\\${exp.id}-desc\\\`} className="expense-desc">
              {exp.description}
            </span>
            <span data-testid={\\\`expense-\\\${exp.id}-amount\\\`} className="expense-amount">
              \$\{exp.amount.toFixed(2)}
            </span>
            <span
              data-testid={\\\`expense-\\\${exp.id}-category\\\`}
              className={\\\`badge badge-\\\${exp.category.toLowerCase()}\\\`}
            >
              {exp.category}
            </span>
            <button
              data-testid={\\\`expense-\\\${exp.id}-delete\\\`}
              className="delete-btn"
              onClick={() => handleDelete(exp.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {/* Clear All */}
      <button
        data-testid="clear-all"
        className="clear-btn"
        onClick={() => setExpenses([])}
      >
        Clear All
      </button>
    </div>
  );
}

export default App;
`,

    'src/styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 2rem;
}

.app {
  max-width: 640px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  padding: 2rem;
}

h1 {
  text-align: center;
  color: #2d3748;
  margin-bottom: 1.5rem;
  font-size: 1.75rem;
  font-weight: 700;
}

/* ── Form ── */
.form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.form input,
.form select {
  flex: 1;
  min-width: 120px;
  padding: 0.625rem 0.75rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}

.form input:focus,
.form select:focus {
  outline: none;
  border-color: #667eea;
}

.form button {
  padding: 0.625rem 1.25rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.form button:hover {
  opacity: 0.9;
}

/* ── Filters ── */
.filters {
  display: flex;
  gap: 0.375rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.filters button {
  padding: 0.375rem 0.875rem;
  border: 2px solid #e2e8f0;
  background: #fff;
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #4a5568;
}

.filters button.active {
  background: #667eea;
  color: #fff;
  border-color: #667eea;
}

.filters button:hover:not(.active) {
  border-color: #a0aec0;
}

/* ── Total ── */
.total {
  text-align: right;
  font-size: 1.25rem;
  font-weight: 700;
  color: #2d3748;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: #f7fafc;
  border-radius: 8px;
}

/* ── Expense List ── */
.expense-list {
  margin-bottom: 1rem;
}

.expense-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #edf2f7;
  transition: background 0.15s;
}

.expense-item:hover {
  background: #f7fafc;
}

.expense-desc {
  flex: 1;
  font-weight: 500;
  color: #2d3748;
}

.expense-amount {
  font-weight: 700;
  color: #2d3748;
  min-width: 80px;
  text-align: right;
}

/* ── Category Badges ── */
.badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 70px;
  text-align: center;
}

.badge-food { background: #c6f6d5; color: #276749; }
.badge-transport { background: #bee3f8; color: #2a4365; }
.badge-shopping { background: #fed7e2; color: #97266d; }
.badge-bills { background: #fefcbf; color: #975a16; }
.badge-other { background: #e2e8f0; color: #4a5568; }

/* ── Buttons ── */
.delete-btn {
  padding: 0.25rem 0.625rem;
  background: #fff;
  border: 1px solid #feb2b2;
  border-radius: 6px;
  color: #c53030;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: #fff5f5;
}

.clear-btn {
  display: block;
  width: 100%;
  padding: 0.625rem;
  background: #fff;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  color: #718096;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  border-color: #c53030;
  color: #c53030;
}
`,
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'ui_jsdom' as const,
    runtime: 'react' as const,
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'react-expense-tracker',
          private: true,
          type: 'commonjs',
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
          },
          devDependencies: {
            jsdom: '^24.1.0',
            esbuild: '^0.20.0',
          },
        }, null, 2) + '\n',
        'src/index.jsx': `import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(React.createElement(App), document.getElementById('root'));
`,
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const SETTLE_MS = 50;

let current = { dom: null, window: null, document: null };
const persistentStorage = Object.create(null);

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

function settle() { return new Promise(r => setTimeout(r, SETTLE_MS)); }

function buildBundle() {
  const esbuild = require('esbuild');
  const outDir = path.join(__dirname);
  const outfile = path.join(outDir, 'bundle.js');
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'src', 'index.jsx')],
    bundle: true,
    outfile,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
  });
  return fs.readFileSync(outfile, 'utf8');
}

async function resetDOM(options) {
  options = options || {};
  const { JSDOM } = require('jsdom');
  if (!options.preserveStorage) {
    for (var k of Object.keys(persistentStorage)) delete persistentStorage[k];
  }
  var bundle = buildBundle();
  var cssPath = path.join(__dirname, '..', 'src', 'styles.css');
  var css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>'
    + css + '</style></head><body>'
    + '<input data-testid="__prompt__" style="display:none" />'
    + '<div id="root"></div>'
    + '<script>' + bundle + '</script>'
    + '</body></html>';
  var dom = new JSDOM(html, {
    url: 'http://candidate/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse: function(window) {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: function(key) { return key in persistentStorage ? persistentStorage[key] : null; },
          setItem: function(key, value) { persistentStorage[key] = String(value); },
          removeItem: function(key) { delete persistentStorage[key]; },
          clear: function() { for (var k of Object.keys(persistentStorage)) delete persistentStorage[k]; },
        }
      });
      window.prompt = function() {
        var el = window.document.querySelector('[data-testid="__prompt__"]');
        return el ? String(el.value || '') : '';
      };
    }
  });
  current = { dom: dom, window: dom.window, document: dom.window.document };
  await settle();
  await settle();
}

function getFirst(testId) {
  var el = current.document.querySelector('[data-testid="' + testId + '"]');
  if (!el) throw new Error('No element with data-testid="' + testId + '"');
  return el;
}

function getAll(testId) {
  return Array.from(current.document.querySelectorAll('[data-testid="' + testId + '"]'));
}

async function handle(req, res) {
  var u = new URL(req.url || '/', 'http://candidate');
  var pathname = u.pathname;
  if (pathname === '/health') return sendJson(res, 200, { ok: true });
  if (pathname === '/reset' && req.method === 'POST') {
    var body = await readJson(req);
    try {
      await resetDOM({ preserveStorage: Boolean(body.preserveStorage) });
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Reset failed: ' + e.message, stack: e.stack });
    }
  }
  if (!current.dom) {
    try { await resetDOM({}); } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Initial reset failed: ' + e.message });
    }
  }
  if (pathname === '/click' && req.method === 'POST') {
    var body = await readJson(req);
    var el = getFirst(body.testId);
    if (el.type === 'checkbox') el.checked = !el.checked;
    el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    if (el.type === 'checkbox') el.dispatchEvent(new current.window.Event('change', { bubbles: true }));
    await settle();
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/type' && req.method === 'POST') {
    var body = await readJson(req);
    var el = getFirst(body.testId);
    var nativeSetter = Object.getOwnPropertyDescriptor(current.window.HTMLInputElement.prototype, 'value');
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, String(body.text || ''));
    } else {
      el.value = String(body.text || '');
    }
    el.dispatchEvent(new current.window.Event('input', { bubbles: true }));
    el.dispatchEvent(new current.window.Event('change', { bubbles: true }));
    await settle();
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/select' && req.method === 'POST') {
    var body = await readJson(req);
    var el = getFirst(body.testId);
    el.value = String(body.value || '');
    el.dispatchEvent(new current.window.Event('change', { bubbles: true }));
    await settle();
    return sendJson(res, 200, { ok: true });
  }
  if (pathname === '/text' && req.method === 'GET') {
    var testId = u.searchParams.get('testId') || '';
    var el = getFirst(testId);
    return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() });
  }
  if (pathname === '/allText' && req.method === 'GET') {
    var testId = u.searchParams.get('testId') || '';
    var els = getAll(testId);
    return sendJson(res, 200, { ok: true, texts: els.map(function(e) { return (e.textContent || '').trim(); }) });
  }
  if (pathname === '/count' && req.method === 'GET') {
    var testId = u.searchParams.get('testId') || '';
    return sendJson(res, 200, { ok: true, count: getAll(testId).length });
  }
  if (pathname === '/html' && req.method === 'GET') {
    var testId = u.searchParams.get('testId');
    var el = testId ? getFirst(testId) : current.document.body;
    return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' });
  }
  if (pathname === '/storage' && req.method === 'GET') {
    var key = u.searchParams.get('key') || '';
    var value = current.window.localStorage.getItem(key);
    return sendJson(res, 200, { ok: true, key: key, value: value });
  }
  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

function main() {
  resetDOM({}).catch(function(e) { console.error('[react-jsdom] Initial reset failed:', e); });
  var server = http.createServer(function(req, res) {
    handle(req, res).catch(function(e) {
      console.error('[react-jsdom] error:', e);
      sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    });
  });
  server.listen(PORT, '0.0.0.0', function() { console.log('[react-jsdom] listening on ' + PORT); });
}

main();
`,
      },
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      runCommand: 'node .grader/ui-harness.cjs',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'vitest' as const,
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npx vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=verbose --reporter=junit --outputFile=results.xml **/*.spec.js 2>&1',
      timeoutMs: 120000,
    },
  },

  publicTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

async function detectBaseUrl() {
  const candidates = [
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ].filter(Boolean);
  for (const base of candidates) {
    try { const res = await fetch(base + '/health'); if (res.ok) return base; } catch {}
  }
  throw new Error('Could not reach harness on /health');
}

function makeClient(getBase) {
  async function req(p, init) {
    const res = await fetch(getBase() + p, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed: ' + p);
    return json;
  }
  return {
    reset: async (opts) => req('/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preserveStorage: Boolean(opts?.preserveStorage) }) }),
    click: async (testId) => req('/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId }) }),
    type: async (testId, text) => req('/type', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId, text }) }),
    select: async (testId, value) => req('/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId, value }) }),
    text: async (testId) => (await req('/text?testId=' + encodeURIComponent(testId))).text,
    html: async (testId) => (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html,
    count: async (testId) => (await req('/count?testId=' + encodeURIComponent(testId))).count,
    storage: async (key) => (await req('/storage?key=' + encodeURIComponent(key))).value,
  };
}

function parseExpenses(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

describe('React Expense Tracker (Public)', () => {
  let baseUrl = '';
  let h;

  beforeAll(async () => {
    baseUrl = await detectBaseUrl();
    h = makeClient(() => baseUrl);
  });

  beforeEach(async () => {
    await h.reset({ preserveStorage: false });
  });

  test('renders all required elements', async () => {
    expect(await h.count('desc-input')).toBe(1);
    expect(await h.count('amount-input')).toBe(1);
    expect(await h.count('category-select')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('expense-list')).toBe(1);
    expect(await h.count('total-amount')).toBe(1);
    expect(await h.count('clear-all')).toBe(1);
    expect(await h.count('filter-all')).toBe(1);
  });

  test('starts with empty list and total $0.00', async () => {
    const listHtml = await h.html('expense-list');
    expect(listHtml).not.toMatch(/<div[^>]*data-testid="expense-/);
    const total = await h.text('total-amount');
    expect(total).toContain('0.00');
  });

  test('rejects empty description', async () => {
    await h.type('desc-input', '   ');
    await h.type('amount-input', '10');
    await h.click('add-btn');
    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(0);
  });

  test('rejects zero or negative amount', async () => {
    await h.type('desc-input', 'Test');
    await h.type('amount-input', '0');
    await h.click('add-btn');
    let stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(0);

    await h.type('desc-input', 'Test');
    await h.type('amount-input', '-5');
    await h.click('add-btn');
    stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(0);
  });

  test('adds expense with correct data and testids', async () => {
    await h.type('desc-input', 'Coffee');
    await h.type('amount-input', '4.50');
    await h.select('category-select', 'Food');
    await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(1);
    expect(stored[0].description).toBe('Coffee');
    expect(stored[0].amount).toBe(4.5);
    expect(stored[0].category).toBe('Food');
    expect(typeof stored[0].id).toBe('string');

    const id = stored[0].id;
    expect(await h.count('expense-' + id)).toBe(1);
    expect(await h.text('expense-' + id + '-desc')).toBe('Coffee');
    expect(await h.text('expense-' + id + '-amount')).toContain('4.50');
    expect(await h.text('expense-' + id + '-category')).toBe('Food');
    expect(await h.count('expense-' + id + '-delete')).toBe(1);
  });

  test('inputs clear after adding', async () => {
    await h.type('desc-input', 'Lunch');
    await h.type('amount-input', '12');
    await h.click('add-btn');

    // Try adding again without typing — should not add
    await h.click('add-btn');
    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(1);
  });

  test('amount displays formatted as $X.XX', async () => {
    await h.type('desc-input', 'Item');
    await h.type('amount-input', '9');
    await h.select('category-select', 'Shopping');
    await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    const id = stored[0].id;
    const amtText = await h.text('expense-' + id + '-amount');
    expect(amtText).toMatch(/9\\.00/);
  });

  test('category badge shows correct text', async () => {
    await h.type('desc-input', 'Bus pass');
    await h.type('amount-input', '50');
    await h.select('category-select', 'Transport');
    await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    const id = stored[0].id;
    expect(await h.text('expense-' + id + '-category')).toBe('Transport');
  });

  test('delete removes the correct expense', async () => {
    await h.type('desc-input', 'A'); await h.type('amount-input', '10'); await h.click('add-btn');
    await h.type('desc-input', 'B'); await h.type('amount-input', '20'); await h.click('add-btn');
    await h.type('desc-input', 'C'); await h.type('amount-input', '30'); await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    const idB = stored.find(e => e.description === 'B').id;
    await h.click('expense-' + idB + '-delete');

    const after = parseExpenses(await h.storage('expenses'));
    expect(after.length).toBe(2);
    expect(after.map(e => e.description)).toContain('A');
    expect(after.map(e => e.description)).toContain('C');
    expect(after.map(e => e.description)).not.toContain('B');
  });

  test('multiple expenses have unique IDs', async () => {
    await h.type('desc-input', 'X'); await h.type('amount-input', '1'); await h.click('add-btn');
    await h.type('desc-input', 'Y'); await h.type('amount-input', '2'); await h.click('add-btn');
    await h.type('desc-input', 'Z'); await h.type('amount-input', '3'); await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(3);
    expect(new Set(stored.map(e => e.id)).size).toBe(3);
  });

  test('category filter shows only matching expenses', async () => {
    await h.type('desc-input', 'Burger'); await h.type('amount-input', '8'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', 'Taxi'); await h.type('amount-input', '25'); await h.select('category-select', 'Transport'); await h.click('add-btn');
    await h.type('desc-input', 'Pizza'); await h.type('amount-input', '12'); await h.select('category-select', 'Food'); await h.click('add-btn');

    await h.click('filter-food');
    const listHtml = await h.html('expense-list');
    expect(listHtml).toContain('Burger');
    expect(listHtml).toContain('Pizza');
    expect(listHtml).not.toContain('Taxi');
  });

  test('filter All shows all expenses and has active class', async () => {
    await h.type('desc-input', 'A'); await h.type('amount-input', '10'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', 'B'); await h.type('amount-input', '20'); await h.select('category-select', 'Bills'); await h.click('add-btn');

    await h.click('filter-food');
    await h.click('filter-all');

    const listHtml = await h.html('expense-list');
    expect(listHtml).toContain('A');
    expect(listHtml).toContain('B');

    const filterAllHtml = await h.html('filter-all');
    expect(filterAllHtml).toMatch(/class="[^"]*active[^"]*"/);
  });

  test('total updates on add, delete, and filter', async () => {
    await h.type('desc-input', 'A'); await h.type('amount-input', '10.50'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', 'B'); await h.type('amount-input', '20'); await h.select('category-select', 'Transport'); await h.click('add-btn');

    let total = await h.text('total-amount');
    expect(total).toContain('30.50');

    // Filter to Food only
    await h.click('filter-food');
    total = await h.text('total-amount');
    expect(total).toContain('10.50');

    // Back to all
    await h.click('filter-all');
    total = await h.text('total-amount');
    expect(total).toContain('30.50');

    // Delete one
    const stored = parseExpenses(await h.storage('expenses'));
    const idA = stored.find(e => e.description === 'A').id;
    await h.click('expense-' + idA + '-delete');
    total = await h.text('total-amount');
    expect(total).toContain('20.00');
  });

  test('localStorage persistence on refresh', async () => {
    await h.type('desc-input', 'Persisted'); await h.type('amount-input', '42.99'); await h.select('category-select', 'Shopping'); await h.click('add-btn');

    const storedBefore = parseExpenses(await h.storage('expenses'));
    expect(storedBefore.length).toBe(1);
    const id = storedBefore[0].id;

    // Simulate refresh
    await h.reset({ preserveStorage: true });

    const listHtml = await h.html('expense-list');
    expect(listHtml).toContain('Persisted');

    const storedAfter = parseExpenses(await h.storage('expenses'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].id).toBe(id);
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

async function detectBaseUrl() {
  const candidates = [
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ].filter(Boolean);
  for (const base of candidates) {
    try { const res = await fetch(base + '/health'); if (res.ok) return base; } catch {}
  }
  throw new Error('Could not reach harness on /health');
}

function makeClient(getBase) {
  async function req(p, init) {
    const res = await fetch(getBase() + p, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed: ' + p);
    return json;
  }
  return {
    reset: async (opts) => req('/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preserveStorage: Boolean(opts?.preserveStorage) }) }),
    click: async (testId) => req('/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId }) }),
    type: async (testId, text) => req('/type', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId, text }) }),
    select: async (testId, value) => req('/select', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId, value }) }),
    text: async (testId) => (await req('/text?testId=' + encodeURIComponent(testId))).text,
    html: async (testId) => (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html,
    count: async (testId) => (await req('/count?testId=' + encodeURIComponent(testId))).count,
    storage: async (key) => (await req('/storage?key=' + encodeURIComponent(key))).value,
  };
}

function parseExpenses(raw) {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

function rand(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2); }
function randAmount() { return +(Math.random() * 100 + 1).toFixed(2); }
function randCategory() { return ['Food', 'Transport', 'Shopping', 'Bills', 'Other'][Math.floor(Math.random() * 5)]; }

describe('React Expense Tracker (Hidden)', () => {
  let baseUrl = '';
  let h;

  beforeAll(async () => {
    baseUrl = await detectBaseUrl();
    h = makeClient(() => baseUrl);
  });

  beforeEach(async () => {
    await h.reset({ preserveStorage: false });
  });

  test('renders all required elements', async () => {
    expect(await h.count('desc-input')).toBe(1);
    expect(await h.count('amount-input')).toBe(1);
    expect(await h.count('category-select')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('expense-list')).toBe(1);
    expect(await h.count('total-amount')).toBe(1);
    expect(await h.count('clear-all')).toBe(1);
    expect(await h.count('filter-all')).toBe(1);
    expect(await h.count('filter-food')).toBe(1);
    expect(await h.count('filter-transport')).toBe(1);
    expect(await h.count('filter-shopping')).toBe(1);
    expect(await h.count('filter-bills')).toBe(1);
    expect(await h.count('filter-other')).toBe(1);
  });

  test('starts with empty list and $0.00 total', async () => {
    const listHtml = await h.html('expense-list');
    expect(listHtml).not.toMatch(/<div[^>]*data-testid="expense-/);
    expect(await h.text('total-amount')).toContain('0.00');
  });

  test('rejects empty/whitespace description', async () => {
    await h.type('desc-input', '   ');
    await h.type('amount-input', '10');
    await h.click('add-btn');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(0);
  });

  test('rejects invalid amounts (0, negative)', async () => {
    const desc = rand('reject');
    await h.type('desc-input', desc); await h.type('amount-input', '0'); await h.click('add-btn');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(0);
    await h.type('desc-input', desc); await h.type('amount-input', '-10'); await h.click('add-btn');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(0);
  });

  test('adds expense with correct data shape', async () => {
    const desc = rand('add');
    const amt = randAmount();
    const cat = randCategory();
    await h.type('desc-input', desc);
    await h.type('amount-input', String(amt));
    await h.select('category-select', cat);
    await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(1);
    expect(stored[0].description).toBe(desc);
    expect(stored[0].amount).toBeCloseTo(amt, 1);
    expect(stored[0].category).toBe(cat);
    expect(typeof stored[0].id).toBe('string');

    const id = stored[0].id;
    expect(await h.count('expense-' + id)).toBe(1);
    expect(await h.text('expense-' + id + '-desc')).toContain(desc);
    expect(await h.text('expense-' + id + '-category')).toBe(cat);
  });

  test('inputs clear after successful add', async () => {
    await h.type('desc-input', rand('clear'));
    await h.type('amount-input', '5');
    await h.click('add-btn');
    await h.click('add-btn');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(1);
  });

  test('amount formatting includes decimal', async () => {
    const desc = rand('fmt');
    await h.type('desc-input', desc); await h.type('amount-input', '7'); await h.click('add-btn');
    const stored = parseExpenses(await h.storage('expenses'));
    const id = stored[0].id;
    expect(await h.text('expense-' + id + '-amount')).toMatch(/7\\.00/);
  });

  test('delete removes correct expense from multiple', async () => {
    const a = rand('A'), b = rand('B'), c = rand('C');
    await h.type('desc-input', a); await h.type('amount-input', '10'); await h.click('add-btn');
    await h.type('desc-input', b); await h.type('amount-input', '20'); await h.click('add-btn');
    await h.type('desc-input', c); await h.type('amount-input', '30'); await h.click('add-btn');

    const stored = parseExpenses(await h.storage('expenses'));
    const idB = stored.find(e => e.description === b).id;
    await h.click('expense-' + idB + '-delete');

    const after = parseExpenses(await h.storage('expenses'));
    expect(after.length).toBe(2);
    expect(after.map(e => e.description)).toContain(a);
    expect(after.map(e => e.description)).toContain(c);
    expect(after.map(e => e.description)).not.toContain(b);
  });

  test('multiple expenses have unique IDs', async () => {
    for (let i = 0; i < 4; i++) {
      await h.type('desc-input', rand('u' + i));
      await h.type('amount-input', String(randAmount()));
      await h.click('add-btn');
    }
    const stored = parseExpenses(await h.storage('expenses'));
    expect(stored.length).toBe(4);
    expect(new Set(stored.map(e => e.id)).size).toBe(4);
  });

  test('category filter shows only matching expenses', async () => {
    const food1 = rand('food1'), food2 = rand('food2'), transport1 = rand('transport1');
    await h.type('desc-input', food1); await h.type('amount-input', '5'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', transport1); await h.type('amount-input', '15'); await h.select('category-select', 'Transport'); await h.click('add-btn');
    await h.type('desc-input', food2); await h.type('amount-input', '8'); await h.select('category-select', 'Food'); await h.click('add-btn');

    await h.click('filter-food');
    let html = await h.html('expense-list');
    expect(html).toContain(food1);
    expect(html).toContain(food2);
    expect(html).not.toContain(transport1);

    await h.click('filter-transport');
    html = await h.html('expense-list');
    expect(html).toContain(transport1);
    expect(html).not.toContain(food1);
  });

  test('filter All shows everything; active class toggles', async () => {
    await h.type('desc-input', rand('a')); await h.type('amount-input', '10'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', rand('b')); await h.type('amount-input', '20'); await h.select('category-select', 'Bills'); await h.click('add-btn');

    await h.click('filter-food');
    expect(await h.html('filter-food')).toMatch(/active/);
    expect(await h.html('filter-all')).not.toMatch(/class="[^"]*active[^"]*"/);

    await h.click('filter-all');
    expect(await h.html('filter-all')).toMatch(/active/);
  });

  test('total updates on add, delete, and filter change', async () => {
    const a = rand('ta'), b = rand('tb');
    await h.type('desc-input', a); await h.type('amount-input', '15.75'); await h.select('category-select', 'Food'); await h.click('add-btn');
    await h.type('desc-input', b); await h.type('amount-input', '24.25'); await h.select('category-select', 'Transport'); await h.click('add-btn');

    expect(await h.text('total-amount')).toContain('40.00');

    await h.click('filter-food');
    expect(await h.text('total-amount')).toContain('15.75');

    await h.click('filter-all');
    const stored = parseExpenses(await h.storage('expenses'));
    await h.click('expense-' + stored[0].id + '-delete');
    expect(await h.text('total-amount')).toContain('24.25');
  });

  test('clear all removes everything', async () => {
    await h.type('desc-input', rand('c1')); await h.type('amount-input', '10'); await h.click('add-btn');
    await h.type('desc-input', rand('c2')); await h.type('amount-input', '20'); await h.click('add-btn');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(2);

    await h.click('clear-all');
    expect(parseExpenses(await h.storage('expenses')).length).toBe(0);
    expect(await h.text('total-amount')).toContain('0.00');
  });

  test('localStorage persistence on refresh', async () => {
    const desc = rand('persist');
    await h.type('desc-input', desc); await h.type('amount-input', '99.99'); await h.select('category-select', 'Shopping'); await h.click('add-btn');

    const before = parseExpenses(await h.storage('expenses'));
    expect(before.length).toBe(1);

    await h.reset({ preserveStorage: true });

    const after = parseExpenses(await h.storage('expenses'));
    expect(after.length).toBe(1);
    expect(after[0].description).toBe(desc);
    const listHtml = await h.html('expense-list');
    expect(listHtml).toContain(desc);
  });
});
`,
};
