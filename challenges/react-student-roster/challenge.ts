import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'React Student Roster',
  description: `# React Student Roster

Build a student roster management application using React.

## Features
- Add students with name and score (0–100)
- View student list with auto-calculated letter grades
- Delete students
- Edit score via prompt dialog
- Sort by name or score
- View statistics: count, average, passing count
- Data persists in localStorage

## Grade Scale
| Grade | Range |
|-------|-------|
| A | 90–100 |
| B | 80–89 |
| C | 70–79 |
| D | 60–69 |
| F | 0–59 |

## Test Selectors (data-testid)
| Element | data-testid |
|---------|-------------|
| Name input | name-input |
| Score input | score-input |
| Add button | add-btn |
| Student list | student-list |
| Student row | student-{id} |
| Row name | student-{id}-name |
| Row score | student-{id}-score |
| Row grade | student-{id}-grade |
| Row edit button | student-{id}-edit |
| Row delete button | student-{id}-delete |
| Sort by name | sort-name |
| Sort by score | sort-score |
| Student count | student-count |
| Average score | average-score |
| Pass count | pass-count |
`,

  starterFiles: {
    'README.md': `# React Student Roster

## Overview

Build a **student roster manager** using React. You'll practice core React concepts:
\\\`useState\\\`, \\\`useEffect\\\`, event handling, list rendering, sorting, derived state,
and browser \\\`prompt()\\\` for inline editing.

---

## What You Need to Build

### 1. Add Student Form
- **Name** input (\\\`data-testid="name-input"\\\`)
- **Score** input, type number, range 0–100 (\\\`data-testid="score-input"\\\`)
- **Add** button (\\\`data-testid="add-btn"\\\`)
- Inputs must clear after a successful add
- Reject empty/whitespace-only name
- Reject scores outside 0–100 (or non-numeric)

### 2. Student List
- Container: \\\`data-testid="student-list"\\\`
- Each student row: \\\`data-testid="student-{id}"\\\`
  - Name: \\\`data-testid="student-{id}-name"\\\`
  - Score: \\\`data-testid="student-{id}-score"\\\`
  - Grade badge: \\\`data-testid="student-{id}-grade"\\\` (auto-calculated letter)
  - Edit button: \\\`data-testid="student-{id}-edit"\\\`
  - Delete button: \\\`data-testid="student-{id}-delete"\\\`

### 3. Grade Scale
| Grade | Score Range |
|-------|------------|
| A | 90 – 100 |
| B | 80 – 89 |
| C | 70 – 79 |
| D | 60 – 69 |
| F | 0 – 59 |

### 4. Edit Score
- Clicking the edit button calls \\\`prompt("Enter new score:")\\\`
- If the user cancels or enters an invalid score, nothing changes
- If valid (0–100), update that student's score and grade

### 5. Sorting
- \\\`data-testid="sort-name"\\\` — sort alphabetically by name (A → Z)
- \\\`data-testid="sort-score"\\\` — sort by score descending (highest first)
- Active sort button should have CSS class \\\`active\\\`

### 6. Statistics Panel
- \\\`data-testid="student-count"\\\` — total number of students
- \\\`data-testid="average-score"\\\` — average score rounded to one decimal (e.g. \\\`78.3\\\`), show \\\`0.0\\\` when empty
- \\\`data-testid="pass-count"\\\` — number of students with score >= 60 (grade D or above)

### 7. Persistence
- Save students to \\\`localStorage\\\` key \\\`"students"\\\`
- Load from \\\`localStorage\\\` on mount (use lazy initializer in useState)

---

## Data Shape

Each student object in state / localStorage:
\\\`\\\`\\\`json
{
  "id": "unique-string",
  "name": "Alice",
  "score": 85,
  "createdAt": 1700000000000
}
\\\`\\\`\\\`

---

## Scoring (14 public + 14 hidden tests)

| Area | Tests |
|------|-------|
| Elements render | 1 |
| Empty state / stats | 1 |
| Validation (empty name) | 1 |
| Validation (bad score) | 1 |
| Add student | 1 |
| Inputs clear | 1 |
| Grade calculation | 1 |
| Delete | 1 |
| Edit score | 1 |
| Sort by name | 1 |
| Sort by score | 1 |
| Statistics update | 1 |
| Pass count | 1 |
| localStorage persistence | 1 |

Hidden tests use randomized data to prevent hardcoding.

---

## Implementation Tips

1. Start with \\\`useState\\\` for the students array (lazy init from localStorage)
2. Create a helper \\\`getGrade(score)\\\` that returns 'A', 'B', 'C', 'D', or 'F'
3. Use a separate \\\`useState\\\` for the active sort mode ('name' or 'score')
4. Compute sorted students with \\\`.slice().sort()\\\` — don't mutate state
5. Derive count, average, and pass count — don't store them in state
6. Use \\\`useEffect\\\` to sync students to localStorage whenever they change
7. For edit, validate the prompt result before updating

Good luck!
`,

    'src/App.jsx': `import { useState, useEffect } from 'react';
import './styles.css';

// Student Roster Application
// Implement a student roster manager with:
// 1. Add students (name + score 0-100)
// 2. Auto-calculate letter grades (A/B/C/D/F)
// 3. Delete students
// 4. Edit score via prompt()
// 5. Sort by name or score
// 6. Statistics: count, average, pass count
// 7. localStorage persistence

// Grade scale: A=90-100, B=80-89, C=70-79, D=60-69, F=0-59

function getGrade(score) {
  // TODO: Return letter grade based on score
  // A: 90-100, B: 80-89, C: 70-79, D: 60-69, F: 0-59
  return 'F';
}

function App() {
  // TODO: Initialize students state from localStorage
  // Hint: useState(() => { const saved = localStorage.getItem('students'); ... })
  const [students, setStudents] = useState([]);

  // TODO: State for form inputs
  const [name, setName] = useState('');
  const [score, setScore] = useState('');

  // TODO: State for active sort mode ('name' or 'score')
  const [sortMode, setSortMode] = useState('name');

  // TODO: Sync students to localStorage with useEffect
  // useEffect(() => { localStorage.setItem('students', JSON.stringify(students)); }, [students]);

  // TODO: Generate unique ID
  function generateId() {
    // return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // TODO: Add student handler
  function handleAdd() {
    // Validate: name not empty, score is number 0-100
    // Create student object: { id, name, score (as number), createdAt }
    // Add to state, clear inputs
  }

  // TODO: Delete student
  function handleDelete(id) {
    // Filter out the student with matching id
  }

  // TODO: Edit student score
  function handleEdit(id) {
    // Call prompt("Enter new score:")
    // Validate result is a number 0-100
    // Update the student's score
  }

  // TODO: Get sorted students based on sortMode
  function getSortedStudents() {
    // If sortMode === 'name', sort alphabetically (A-Z)
    // If sortMode === 'score', sort by score descending
    return students;
  }

  // TODO: Calculate statistics
  const sortedStudents = getSortedStudents();
  const studentCount = students.length;
  const averageScore = 0; // Use .reduce() then divide by length
  const passCount = 0; // Count students with score >= 60

  return (
    <div className="app">
      <h1>Student Roster</h1>

      {/* Add Student Form */}
      <div className="form">
        <input
          data-testid="name-input"
          type="text"
          placeholder="Student name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          data-testid="score-input"
          type="number"
          placeholder="Score (0-100)"
          min="0"
          max="100"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <button data-testid="add-btn" onClick={handleAdd}>
          Add Student
        </button>
      </div>

      {/* Sort Controls */}
      <div className="sort-controls">
        <span>Sort by:</span>
        <button
          data-testid="sort-name"
          className={sortMode === 'name' ? 'active' : ''}
          onClick={() => setSortMode('name')}
        >
          Name
        </button>
        <button
          data-testid="sort-score"
          className={sortMode === 'score' ? 'active' : ''}
          onClick={() => setSortMode('score')}
        >
          Score
        </button>
      </div>

      {/* Statistics */}
      <div className="stats">
        <div className="stat">
          Students: <span data-testid="student-count">{studentCount}</span>
        </div>
        <div className="stat">
          Average: <span data-testid="average-score">{averageScore}</span>
        </div>
        <div className="stat">
          Passing: <span data-testid="pass-count">{passCount}</span>
        </div>
      </div>

      {/* Student List */}
      <div data-testid="student-list" className="student-list">
        {sortedStudents.map((s) => (
          <div key={s.id} data-testid={"student-" + s.id} className="student-row">
            <span data-testid={"student-" + s.id + "-name"} className="student-name">
              {s.name}
            </span>
            <span data-testid={"student-" + s.id + "-score"} className="student-score">
              {s.score}
            </span>
            <span
              data-testid={"student-" + s.id + "-grade"}
              className={"grade-badge grade-" + getGrade(s.score).toLowerCase()}
            >
              {getGrade(s.score)}
            </span>
            <button
              data-testid={"student-" + s.id + "-edit"}
              className="edit-btn"
              onClick={() => handleEdit(s.id)}
            >
              Edit
            </button>
            <button
              data-testid={"student-" + s.id + "-delete"}
              className="delete-btn"
              onClick={() => handleDelete(s.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
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
  background: linear-gradient(135deg, #1a2a6c 0%, #2a4365 50%, #2b6cb0 100%);
  min-height: 100vh;
  padding: 2rem;
}

.app {
  max-width: 700px;
  margin: 0 auto;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  padding: 2rem;
}

h1 {
  text-align: center;
  color: #1a2a6c;
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

.form input {
  flex: 1;
  min-width: 120px;
  padding: 0.625rem 0.75rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
}

.form input:focus {
  outline: none;
  border-color: #2b6cb0;
}

.form button {
  padding: 0.625rem 1.25rem;
  background: linear-gradient(135deg, #1a2a6c, #2b6cb0);
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

/* ── Sort Controls ── */
.sort-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  color: #4a5568;
}

.sort-controls button {
  padding: 0.375rem 0.875rem;
  border: 2px solid #e2e8f0;
  background: #fff;
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  color: #4a5568;
}

.sort-controls button.active {
  background: #1a2a6c;
  color: #fff;
  border-color: #1a2a6c;
}

.sort-controls button:hover:not(.active) {
  border-color: #a0aec0;
}

/* ── Statistics ── */
.stats {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
  padding: 0.75rem 1rem;
  background: #f7fafc;
  border-radius: 8px;
  flex-wrap: wrap;
}

.stat {
  font-size: 0.9rem;
  color: #4a5568;
  font-weight: 500;
}

.stat span {
  font-weight: 700;
  color: #1a2a6c;
}

/* ── Student List ── */
.student-list {
  margin-bottom: 1rem;
}

.student-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #edf2f7;
  transition: background 0.15s;
}

.student-row:nth-child(even) {
  background: #f7fafc;
}

.student-row:hover {
  background: #edf2f7;
}

.student-name {
  flex: 1;
  font-weight: 500;
  color: #2d3748;
}

.student-score {
  font-weight: 700;
  color: #2d3748;
  min-width: 40px;
  text-align: center;
}

/* ── Grade Badges ── */
.grade-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  min-width: 32px;
  text-align: center;
  letter-spacing: 0.5px;
}

.grade-a { background: #c6f6d5; color: #276749; }
.grade-b { background: #bee3f8; color: #2a4365; }
.grade-c { background: #fefcbf; color: #975a16; }
.grade-d { background: #fed7aa; color: #9c4221; }
.grade-f { background: #fed7d7; color: #c53030; }

/* ── Buttons ── */
.edit-btn {
  padding: 0.25rem 0.625rem;
  background: #fff;
  border: 1px solid #bee3f8;
  border-radius: 6px;
  color: #2b6cb0;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #ebf8ff;
}

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
          name: 'react-student-roster',
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
        '.grader/ui-harness.cjs': `var http = require('http');
var urlMod = require('url');
var fs = require('fs');
var path = require('path');

var PORT = parseInt(process.env.PORT || '3000', 10);
var SETTLE_MS = 50;

var current = { dom: null, window: null, document: null };
var persistentStorage = Object.create(null);

function sendJson(res, status, data) {
  var body = JSON.stringify(data || {});
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(body);
}

async function readJson(req) {
  var chunks = [];
  for await (var c of req) chunks.push(c);
  var raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch(e) { return {}; }
}

function settle() { return new Promise(function(r) { setTimeout(r, SETTLE_MS); }); }

function buildBundle() {
  var esbuild = require('esbuild');
  var outfile = path.join(__dirname, 'bundle.js');
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'src', 'index.jsx')],
    bundle: true,
    outfile: outfile,
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
  var JSDOM = require('jsdom').JSDOM;
  if (!options.preserveStorage) {
    var keys = Object.keys(persistentStorage);
    for (var i = 0; i < keys.length; i++) delete persistentStorage[keys[i]];
  }
  var bundle = buildBundle();
  var cssPath = path.join(__dirname, '..', 'src', 'styles.css');
  var css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>'
    + css + '</style></head><body>'
    + '<input data-testid="__prompt__" style="display:none" />'
    + '<div id="root"></div>'
    + '<script>' + bundle + '</' + 'script>'
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
          clear: function() { var ks = Object.keys(persistentStorage); for (var j = 0; j < ks.length; j++) delete persistentStorage[ks[j]]; },
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

function getAllByPrefix(prefix) {
  return Array.from(current.document.querySelectorAll('[data-testid^="' + prefix + '"]'));
}

async function handle(req, res) {
  var parsed = new urlMod.URL(req.url || '/', 'http://candidate');
  var pathname = parsed.pathname;

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
    var testId = parsed.searchParams.get('testId') || '';
    var el = getFirst(testId);
    return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() });
  }

  if (pathname === '/allText' && req.method === 'GET') {
    var testId = parsed.searchParams.get('testId') || '';
    var els = getAll(testId);
    return sendJson(res, 200, { ok: true, texts: els.map(function(e) { return (e.textContent || '').trim(); }) });
  }

  if (pathname === '/count' && req.method === 'GET') {
    var testId = parsed.searchParams.get('testId') || '';
    return sendJson(res, 200, { ok: true, count: getAll(testId).length });
  }

  if (pathname === '/countPrefix' && req.method === 'GET') {
    var prefix = parsed.searchParams.get('prefix') || '';
    return sendJson(res, 200, { ok: true, count: getAllByPrefix(prefix).length });
  }

  if (pathname === '/html' && req.method === 'GET') {
    var testId = parsed.searchParams.get('testId');
    var el = testId ? getFirst(testId) : current.document.body;
    return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' });
  }

  if (pathname === '/storage' && req.method === 'GET') {
    var key = parsed.searchParams.get('key') || '';
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
  var candidates = [
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ].filter(Boolean);
  for (var base of candidates) {
    try { var res = await fetch(base + '/health'); if (res.ok) return base; } catch(e) {}
  }
  throw new Error('Could not reach harness on /health');
}

function makeClient(getBase) {
  async function req(p, init) {
    var res = await fetch(getBase() + p, init);
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed: ' + p);
    return json;
  }
  return {
    reset: async function(opts) { return req('/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preserveStorage: Boolean(opts?.preserveStorage) }) }); },
    click: async function(testId) { return req('/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId: testId }) }); },
    type: async function(testId, text) { return req('/type', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId: testId, text: text }) }); },
    text: async function(testId) { return (await req('/text?testId=' + encodeURIComponent(testId))).text; },
    html: async function(testId) { return (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html; },
    count: async function(testId) { return (await req('/count?testId=' + encodeURIComponent(testId))).count; },
    storage: async function(key) { return (await req('/storage?key=' + encodeURIComponent(key))).value; },
  };
}

function parseStudents(raw) {
  if (!raw) return [];
  try { var v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch(e) { return []; }
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

describe('React Student Roster (Public)', function() {
  var baseUrl = '';
  var h;

  beforeAll(async function() {
    baseUrl = await detectBaseUrl();
    h = makeClient(function() { return baseUrl; });
  });

  beforeEach(async function() {
    await h.reset({ preserveStorage: false });
  });

  test('renders all required elements', async function() {
    expect(await h.count('name-input')).toBe(1);
    expect(await h.count('score-input')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('student-list')).toBe(1);
    expect(await h.count('sort-name')).toBe(1);
    expect(await h.count('sort-score')).toBe(1);
    expect(await h.count('student-count')).toBe(1);
    expect(await h.count('average-score')).toBe(1);
    expect(await h.count('pass-count')).toBe(1);
  });

  test('starts with empty list and zero stats', async function() {
    var listHtml = await h.html('student-list');
    expect(listHtml).not.toMatch(/data-testid="student-[^_]/);
    expect(await h.text('student-count')).toBe('0');
    expect(await h.text('average-score')).toMatch(/0\\.0/);
    expect(await h.text('pass-count')).toBe('0');
  });

  test('rejects empty name', async function() {
    await h.type('name-input', '   ');
    await h.type('score-input', '75');
    await h.click('add-btn');
    var stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(0);
  });

  test('rejects scores outside 0-100', async function() {
    await h.type('name-input', 'Test');
    await h.type('score-input', '101');
    await h.click('add-btn');
    var stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(0);

    await h.type('name-input', 'Test');
    await h.type('score-input', '-5');
    await h.click('add-btn');
    stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(0);
  });

  test('adds student with correct data and testids', async function() {
    await h.type('name-input', 'Alice');
    await h.type('score-input', '92');
    await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe('Alice');
    expect(stored[0].score).toBe(92);
    expect(typeof stored[0].id).toBe('string');

    var id = stored[0].id;
    expect(await h.count('student-' + id)).toBe(1);
    expect(await h.text('student-' + id + '-name')).toBe('Alice');
    expect(await h.text('student-' + id + '-score')).toBe('92');
    expect(await h.text('student-' + id + '-grade')).toBe('A');
  });

  test('inputs clear after adding', async function() {
    await h.type('name-input', 'Bob');
    await h.type('score-input', '80');
    await h.click('add-btn');

    // Try adding again without typing — should not add
    await h.click('add-btn');
    var stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(1);
  });

  test('grade badge is calculated correctly', async function() {
    await h.type('name-input', 'A-student'); await h.type('score-input', '95'); await h.click('add-btn');
    await h.type('name-input', 'B-student'); await h.type('score-input', '85'); await h.click('add-btn');
    await h.type('name-input', 'C-student'); await h.type('score-input', '73'); await h.click('add-btn');
    await h.type('name-input', 'D-student'); await h.type('score-input', '65'); await h.click('add-btn');
    await h.type('name-input', 'F-student'); await h.type('score-input', '40'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    for (var i = 0; i < stored.length; i++) {
      var s = stored[i];
      var grade = await h.text('student-' + s.id + '-grade');
      expect(grade).toBe(getGrade(s.score));
    }
  });

  test('delete removes the correct student', async function() {
    await h.type('name-input', 'Alice'); await h.type('score-input', '90'); await h.click('add-btn');
    await h.type('name-input', 'Bob'); await h.type('score-input', '75'); await h.click('add-btn');
    await h.type('name-input', 'Charlie'); await h.type('score-input', '60'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    var bobId = stored.find(function(s) { return s.name === 'Bob'; }).id;
    await h.click('student-' + bobId + '-delete');

    var after = parseStudents(await h.storage('students'));
    expect(after.length).toBe(2);
    expect(after.map(function(s) { return s.name; })).toContain('Alice');
    expect(after.map(function(s) { return s.name; })).toContain('Charlie');
    expect(after.map(function(s) { return s.name; })).not.toContain('Bob');
  });

  test('edit score via prompt updates grade', async function() {
    await h.type('name-input', 'Alice'); await h.type('score-input', '75'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    var id = stored[0].id;
    expect(await h.text('student-' + id + '-grade')).toBe('C');

    // Set prompt return value then click edit
    await h.type('__prompt__', '95');
    await h.click('student-' + id + '-edit');

    expect(await h.text('student-' + id + '-score')).toBe('95');
    expect(await h.text('student-' + id + '-grade')).toBe('A');
  });

  test('sort by name orders alphabetically', async function() {
    await h.type('name-input', 'Charlie'); await h.type('score-input', '70'); await h.click('add-btn');
    await h.type('name-input', 'Alice'); await h.type('score-input', '90'); await h.click('add-btn');
    await h.type('name-input', 'Bob'); await h.type('score-input', '80'); await h.click('add-btn');

    await h.click('sort-name');
    var listHtml = await h.html('student-list');
    var aliceIdx = listHtml.indexOf('Alice');
    var bobIdx = listHtml.indexOf('Bob');
    var charlieIdx = listHtml.indexOf('Charlie');
    expect(aliceIdx).toBeLessThan(bobIdx);
    expect(bobIdx).toBeLessThan(charlieIdx);
  });

  test('sort by score orders highest first', async function() {
    await h.type('name-input', 'Low'); await h.type('score-input', '50'); await h.click('add-btn');
    await h.type('name-input', 'High'); await h.type('score-input', '95'); await h.click('add-btn');
    await h.type('name-input', 'Mid'); await h.type('score-input', '75'); await h.click('add-btn');

    await h.click('sort-score');
    var listHtml = await h.html('student-list');
    var highIdx = listHtml.indexOf('High');
    var midIdx = listHtml.indexOf('Mid');
    var lowIdx = listHtml.indexOf('Low');
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  test('statistics update on add and delete', async function() {
    await h.type('name-input', 'Alice'); await h.type('score-input', '80'); await h.click('add-btn');
    await h.type('name-input', 'Bob'); await h.type('score-input', '60'); await h.click('add-btn');

    expect(await h.text('student-count')).toBe('2');
    expect(await h.text('average-score')).toContain('70.0');
    expect(await h.text('pass-count')).toBe('2');

    var stored = parseStudents(await h.storage('students'));
    var bobId = stored.find(function(s) { return s.name === 'Bob'; }).id;
    await h.click('student-' + bobId + '-delete');

    expect(await h.text('student-count')).toBe('1');
    expect(await h.text('average-score')).toContain('80.0');
    expect(await h.text('pass-count')).toBe('1');
  });

  test('pass count only includes score >= 60', async function() {
    await h.type('name-input', 'Pass'); await h.type('score-input', '60'); await h.click('add-btn');
    await h.type('name-input', 'Fail'); await h.type('score-input', '59'); await h.click('add-btn');

    expect(await h.text('pass-count')).toBe('1');
  });

  test('localStorage persistence on refresh', async function() {
    await h.type('name-input', 'Persisted'); await h.type('score-input', '88'); await h.click('add-btn');

    var storedBefore = parseStudents(await h.storage('students'));
    expect(storedBefore.length).toBe(1);
    var id = storedBefore[0].id;

    // Simulate refresh
    await h.reset({ preserveStorage: true });

    var listHtml = await h.html('student-list');
    expect(listHtml).toContain('Persisted');

    var storedAfter = parseStudents(await h.storage('students'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].id).toBe(id);
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

async function detectBaseUrl() {
  var candidates = [
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ].filter(Boolean);
  for (var base of candidates) {
    try { var res = await fetch(base + '/health'); if (res.ok) return base; } catch(e) {}
  }
  throw new Error('Could not reach harness on /health');
}

function makeClient(getBase) {
  async function req(p, init) {
    var res = await fetch(getBase() + p, init);
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok || json?.ok === false) throw new Error(json?.error || 'Request failed: ' + p);
    return json;
  }
  return {
    reset: async function(opts) { return req('/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ preserveStorage: Boolean(opts?.preserveStorage) }) }); },
    click: async function(testId) { return req('/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId: testId }) }); },
    type: async function(testId, text) { return req('/type', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ testId: testId, text: text }) }); },
    text: async function(testId) { return (await req('/text?testId=' + encodeURIComponent(testId))).text; },
    html: async function(testId) { return (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html; },
    count: async function(testId) { return (await req('/count?testId=' + encodeURIComponent(testId))).count; },
    storage: async function(key) { return (await req('/storage?key=' + encodeURIComponent(key))).value; },
  };
}

function parseStudents(raw) {
  if (!raw) return [];
  try { var v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch(e) { return []; }
}

function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function rand(prefix) { return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2); }
function randScore() { return Math.floor(Math.random() * 101); }

describe('React Student Roster (Hidden)', function() {
  var baseUrl = '';
  var h;

  beforeAll(async function() {
    baseUrl = await detectBaseUrl();
    h = makeClient(function() { return baseUrl; });
  });

  beforeEach(async function() {
    await h.reset({ preserveStorage: false });
  });

  test('renders all required elements', async function() {
    expect(await h.count('name-input')).toBe(1);
    expect(await h.count('score-input')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('student-list')).toBe(1);
    expect(await h.count('sort-name')).toBe(1);
    expect(await h.count('sort-score')).toBe(1);
    expect(await h.count('student-count')).toBe(1);
    expect(await h.count('average-score')).toBe(1);
    expect(await h.count('pass-count')).toBe(1);
  });

  test('starts with empty list and zero stats', async function() {
    var listHtml = await h.html('student-list');
    expect(listHtml).not.toMatch(/data-testid="student-[^_]/);
    expect(await h.text('student-count')).toBe('0');
    expect(await h.text('average-score')).toMatch(/0\\.0/);
    expect(await h.text('pass-count')).toBe('0');
  });

  test('rejects empty/whitespace name', async function() {
    await h.type('name-input', '   ');
    await h.type('score-input', '50');
    await h.click('add-btn');
    expect(parseStudents(await h.storage('students')).length).toBe(0);
  });

  test('rejects invalid scores (negative, >100, NaN)', async function() {
    var name = rand('reject');
    await h.type('name-input', name); await h.type('score-input', '-1'); await h.click('add-btn');
    expect(parseStudents(await h.storage('students')).length).toBe(0);

    await h.type('name-input', name); await h.type('score-input', '101'); await h.click('add-btn');
    expect(parseStudents(await h.storage('students')).length).toBe(0);

    await h.type('name-input', name); await h.type('score-input', 'abc'); await h.click('add-btn');
    expect(parseStudents(await h.storage('students')).length).toBe(0);
  });

  test('adds student with correct data shape', async function() {
    var name = rand('add');
    var score = randScore();
    await h.type('name-input', name);
    await h.type('score-input', String(score));
    await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    expect(stored.length).toBe(1);
    expect(stored[0].name).toBe(name);
    expect(stored[0].score).toBe(score);
    expect(typeof stored[0].id).toBe('string');

    var id = stored[0].id;
    expect(await h.count('student-' + id)).toBe(1);
    expect(await h.text('student-' + id + '-name')).toContain(name);
    expect(await h.text('student-' + id + '-score')).toBe(String(score));
    expect(await h.text('student-' + id + '-grade')).toBe(getGrade(score));
  });

  test('inputs clear after successful add', async function() {
    await h.type('name-input', rand('clear'));
    await h.type('score-input', '75');
    await h.click('add-btn');
    // second click should fail because inputs are empty
    await h.click('add-btn');
    expect(parseStudents(await h.storage('students')).length).toBe(1);
  });

  test('grade boundaries are exact (90,80,70,60)', async function() {
    var pairs = [
      [100, 'A'], [90, 'A'], [89, 'B'], [80, 'B'],
      [79, 'C'], [70, 'C'], [69, 'D'], [60, 'D'],
      [59, 'F'], [0, 'F'],
    ];
    for (var i = 0; i < pairs.length; i++) {
      var score = pairs[i][0];
      var expected = pairs[i][1];
      var name = rand('g' + i);
      await h.type('name-input', name);
      await h.type('score-input', String(score));
      await h.click('add-btn');

      var stored = parseStudents(await h.storage('students'));
      var last = stored[stored.length - 1];
      expect(await h.text('student-' + last.id + '-grade')).toBe(expected);
    }
  });

  test('delete removes correct student from multiple', async function() {
    var a = rand('A'), b = rand('B'), c = rand('C');
    await h.type('name-input', a); await h.type('score-input', '90'); await h.click('add-btn');
    await h.type('name-input', b); await h.type('score-input', '80'); await h.click('add-btn');
    await h.type('name-input', c); await h.type('score-input', '70'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    var idB = stored.find(function(s) { return s.name === b; }).id;
    await h.click('student-' + idB + '-delete');

    var after = parseStudents(await h.storage('students'));
    expect(after.length).toBe(2);
    expect(after.map(function(s) { return s.name; })).toContain(a);
    expect(after.map(function(s) { return s.name; })).toContain(c);
    expect(after.map(function(s) { return s.name; })).not.toContain(b);
  });

  test('edit score updates correctly via prompt', async function() {
    var name = rand('edit');
    await h.type('name-input', name); await h.type('score-input', '50'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    var id = stored[0].id;
    expect(await h.text('student-' + id + '-grade')).toBe('F');

    var newScore = 85;
    await h.type('__prompt__', String(newScore));
    await h.click('student-' + id + '-edit');

    expect(await h.text('student-' + id + '-score')).toBe(String(newScore));
    expect(await h.text('student-' + id + '-grade')).toBe('B');

    // Verify localStorage updated
    var updated = parseStudents(await h.storage('students'));
    expect(updated[0].score).toBe(newScore);
  });

  test('edit rejects invalid prompt values', async function() {
    await h.type('name-input', rand('rej')); await h.type('score-input', '70'); await h.click('add-btn');

    var stored = parseStudents(await h.storage('students'));
    var id = stored[0].id;

    // Empty prompt (simulates cancel)
    await h.type('__prompt__', '');
    await h.click('student-' + id + '-edit');
    expect(await h.text('student-' + id + '-score')).toBe('70');

    // Out of range
    await h.type('__prompt__', '150');
    await h.click('student-' + id + '-edit');
    expect(await h.text('student-' + id + '-score')).toBe('70');
  });

  test('sort by name orders alphabetically A-Z', async function() {
    var names = ['Zara', 'Alice', 'Mike'];
    for (var i = 0; i < names.length; i++) {
      await h.type('name-input', names[i]); await h.type('score-input', String(50 + i * 10)); await h.click('add-btn');
    }
    await h.click('sort-name');
    var html = await h.html('student-list');
    var aIdx = html.indexOf('Alice');
    var mIdx = html.indexOf('Mike');
    var zIdx = html.indexOf('Zara');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });

  test('sort by score orders highest first', async function() {
    var data = [
      [rand('lo'), 30], [rand('hi'), 99], [rand('mi'), 65],
    ];
    for (var i = 0; i < data.length; i++) {
      await h.type('name-input', data[i][0]); await h.type('score-input', String(data[i][1])); await h.click('add-btn');
    }
    await h.click('sort-score');
    var stored = parseStudents(await h.storage('students'));
    var html = await h.html('student-list');
    // Find the student names in the HTML and verify order
    var hiName = data[1][0];
    var miName = data[2][0];
    var loName = data[0][0];
    expect(html.indexOf(hiName)).toBeLessThan(html.indexOf(miName));
    expect(html.indexOf(miName)).toBeLessThan(html.indexOf(loName));
  });

  test('statistics are accurate with randomized data', async function() {
    var scores = [];
    for (var i = 0; i < 5; i++) {
      var sc = randScore();
      scores.push(sc);
      await h.type('name-input', rand('s' + i)); await h.type('score-input', String(sc)); await h.click('add-btn');
    }

    var total = scores.reduce(function(a, b) { return a + b; }, 0);
    var avg = (total / scores.length).toFixed(1);
    var passing = scores.filter(function(s) { return s >= 60; }).length;

    expect(await h.text('student-count')).toBe('5');
    expect(await h.text('average-score')).toContain(avg);
    expect(await h.text('pass-count')).toBe(String(passing));
  });

  test('pass count boundary: score 60 passes, score 59 fails', async function() {
    await h.type('name-input', rand('p1')); await h.type('score-input', '60'); await h.click('add-btn');
    await h.type('name-input', rand('p2')); await h.type('score-input', '59'); await h.click('add-btn');
    await h.type('name-input', rand('p3')); await h.type('score-input', '100'); await h.click('add-btn');

    expect(await h.text('pass-count')).toBe('2');
  });

  test('localStorage persistence on refresh', async function() {
    var name = rand('persist');
    var score = randScore();
    await h.type('name-input', name); await h.type('score-input', String(score)); await h.click('add-btn');

    var before = parseStudents(await h.storage('students'));
    expect(before.length).toBe(1);

    await h.reset({ preserveStorage: true });

    var after = parseStudents(await h.storage('students'));
    expect(after.length).toBe(1);
    expect(after[0].name).toBe(name);
    expect(after[0].score).toBe(score);
    var listHtml = await h.html('student-list');
    expect(listHtml).toContain(name);
  });
});
`,
};
