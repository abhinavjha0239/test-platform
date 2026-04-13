import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'React Bookmark Manager',
  description: `# React Bookmark Manager

## What You're Building

A **bookmark organizer application** built with React. Users can save bookmarks with titles, URLs, and tags, then search and filter them in real time.

This challenge tests your React fundamentals:
- Multiple \`useState\` hooks for form inputs, bookmark list, search term, and active tag filter
- Deriving filtered data from state
- Real-time search filtering (case-insensitive)
- Combined filters (search + tag intersection)
- \`useEffect\` for localStorage persistence
- \`prompt()\` for editing

---

## Requirements

### Core Features
1. **Add Bookmark**: Form with title, URL, and tag select (Work / Personal / Learning / Social / Other)
2. **Bookmark Cards**: Each card shows title, URL, tag badge
3. **Real-time Search**: Filter bookmarks by title as you type (case-insensitive)
4. **Tag Filter Buttons**: All / Work / Personal / Learning / Social / Other
5. **Combined Filtering**: Search and tag filter work together (intersection)
6. **Delete Bookmark**: Remove individual bookmarks
7. **Edit Title**: Click edit to change title via \`prompt()\`
8. **Bookmark Count**: Display total number of visible (filtered) bookmarks
9. **Persistence**: Save bookmarks to \`localStorage\` (key: \`"bookmarks"\`)

### Data Shape

Each bookmark object in localStorage:

\\\`\\\`\\\`json
{
  "id": "unique-string",
  "title": "React Docs",
  "url": "https://react.dev",
  "tag": "Learning",
  "createdAt": 1700000000000
}
\\\`\\\`\\\`

---

## Test Selectors (Required)

Your component MUST include these \`data-testid\` attributes:

| Element | data-testid |
|---------|-------------|
| Title input | \`title-input\` |
| URL input | \`url-input\` |
| Tag select | \`tag-select\` |
| Add button | \`add-btn\` |
| Search input | \`search-input\` |
| Bookmark list container | \`bookmark-list\` |
| Each bookmark card | \`bookmark-{id}\` |
| Bookmark title | \`bookmark-{id}-title\` |
| Bookmark URL | \`bookmark-{id}-url\` |
| Bookmark tag badge | \`bookmark-{id}-tag\` |
| Edit button | \`bookmark-{id}-edit\` |
| Delete button | \`bookmark-{id}-delete\` |
| Tag filter: All | \`tag-all\` |
| Tag filter: Work | \`tag-work\` |
| Tag filter: Personal | \`tag-personal\` |
| Tag filter: Learning | \`tag-learning\` |
| Tag filter: Social | \`tag-social\` |
| Tag filter: Other | \`tag-other\` |
| Bookmark count | \`bookmark-count\` |

---

## Scoring

### Public Tests (14 tests)
| Test | What it checks |
|------|---------------|
| Required elements | All inputs, buttons, and containers exist |
| Empty initial state | No bookmarks, count shows 0 |
| Reject empty title | Cannot add without title |
| Reject empty URL | Cannot add without URL |
| Add bookmark | Correct testids, localStorage shape |
| Input clear after add | Form resets after successful add |
| Tag badge | Shows the correct tag text |
| Delete | Removes correct bookmark |
| Search filter | Filters by title (case-insensitive) |
| Tag filter | Shows only matching tag |
| Combined filter | Search + tag intersection |
| Edit title | prompt() updates title in DOM and storage |
| Edit reject empty | Empty/whitespace edit is ignored |
| Persistence | Bookmarks survive refresh |

### Hidden Tests (14 tests)
Same tests with randomized titles/URLs/tags to prevent hardcoding.

---

## Implementation Tips

1. **State**: Use \`useState\` for \`bookmarks\`, \`title\`, \`url\`, \`tag\`, \`searchTerm\`, \`activeTag\`
2. **Derived Data**: Compute \`filteredBookmarks\` from state - don't store it separately
3. **Filtering Logic**: Filter by search term AND active tag (intersection)
4. **Persistence**: Use \`useEffect\` to save to localStorage when bookmarks change; load on mount
5. **IDs**: Use \`Date.now().toString(36) + Math.random().toString(36).slice(2)\`

---

## Common Mistakes

- Forgetting to call \`localStorage.setItem\` after every change
- Using wrong data-testid format (must be \`bookmark-{id}-title\`, etc.)
- Not clearing form inputs after adding
- Case-sensitive search (must be case-insensitive)
- Tag filter not combining with search filter
- Edit accepting empty or whitespace-only titles
- Count showing total instead of filtered count
`,

  starterFiles: {
    'README.md': `# React Bookmark Manager

## Overview

Build a bookmark organizer app with React. Users can save, search, filter, edit, and delete bookmarks.

## Your Task

Complete the TODO sections in \\\`src/App.jsx\\\`. The UI structure and styles are already provided.

## Features to Implement

1. **Add bookmark** with title, URL, and tag
2. **Search** bookmarks by title (real-time, case-insensitive)
3. **Filter** by tag (All / Work / Personal / Learning / Social / Other)
4. **Combined filtering** (search + tag work together)
5. **Delete** bookmarks
6. **Edit** bookmark title via prompt()
7. **Persist** to localStorage (key: "bookmarks")

## Data Shape

\\\`\\\`\\\`json
{
  "id": "unique-string",
  "title": "React Docs",
  "url": "https://react.dev",
  "tag": "Learning",
  "createdAt": 1700000000000
}
\\\`\\\`\\\`

## Test Selectors (data-testid)

| Element | data-testid |
|---------|-------------|
| Title input | \\\`title-input\\\` |
| URL input | \\\`url-input\\\` |
| Tag select | \\\`tag-select\\\` |
| Add button | \\\`add-btn\\\` |
| Search input | \\\`search-input\\\` |
| Bookmark list | \\\`bookmark-list\\\` |
| Bookmark card | \\\`bookmark-{id}\\\` |
| Bookmark title | \\\`bookmark-{id}-title\\\` |
| Bookmark URL | \\\`bookmark-{id}-url\\\` |
| Bookmark tag | \\\`bookmark-{id}-tag\\\` |
| Edit button | \\\`bookmark-{id}-edit\\\` |
| Delete button | \\\`bookmark-{id}-delete\\\` |
| Filter: All | \\\`tag-all\\\` |
| Filter: Work | \\\`tag-work\\\` |
| Filter: Personal | \\\`tag-personal\\\` |
| Filter: Learning | \\\`tag-learning\\\` |
| Filter: Social | \\\`tag-social\\\` |
| Filter: Other | \\\`tag-other\\\` |
| Bookmark count | \\\`bookmark-count\\\` |

## Scoring

- **14 public tests** + **14 hidden tests** = 28 total
- Hidden tests use randomized data to prevent hardcoding

## Implementation Tips

- Use \\\`useState\\\` for: bookmarks, title, url, tag, searchTerm, activeTag
- Derive filtered list from state (don't store separately)
- Use \\\`useEffect\\\` to save to localStorage when bookmarks change
- Load bookmarks from localStorage on mount
- Generate IDs with: \\\`Date.now().toString(36) + Math.random().toString(36).slice(2)\\\`

## Common Mistakes

- Forgetting to save to localStorage after edit/delete
- Case-sensitive search (must be case-insensitive)
- Tag filter not combining with search
- Edit accepting empty/whitespace titles
- Count showing total instead of filtered count
`,
    'src/App.jsx': `import React, { useState, useEffect } from 'react';
import './styles.css';

const TAGS = ['Work', 'Personal', 'Learning', 'Social', 'Other'];

function App() {
  const [bookmarks, setBookmarks] = useState([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState('Work');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState('All');

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bookmarks');
    if (saved) {
      try {
        setBookmarks(JSON.parse(saved));
      } catch (e) {
        // ignore parse errors
      }
    }
  }, []);

  // Save bookmarks to localStorage when they change
  useEffect(() => {
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  const handleAdd = () => {
    // TODO: Validate title and url are not empty/whitespace
    // TODO: Create a new bookmark object with unique id and add to state
    // TODO: Clear form inputs after adding
    // Hint:
    // if (!title.trim() || !url.trim()) return;
    // const newBookmark = {
    //   id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    //   title: title.trim(),
    //   url: url.trim(),
    //   tag,
    //   createdAt: Date.now(),
    // };
    // setBookmarks([...bookmarks, newBookmark]);
    // setTitle('');
    // setUrl('');
    // setTag('Work');
  };

  const handleDelete = (id) => {
    // TODO: Remove the bookmark with the given id from state
    // Hint: setBookmarks(bookmarks.filter(b => b.id !== id));
  };

  const handleEdit = (id) => {
    // TODO: Use prompt() to get new title
    // TODO: If new title is non-empty after trimming, update the bookmark
    // Hint:
    // const bookmark = bookmarks.find(b => b.id === id);
    // const newTitle = prompt('Edit bookmark title:', bookmark.title);
    // if (newTitle && newTitle.trim()) {
    //   setBookmarks(bookmarks.map(b =>
    //     b.id === id ? { ...b, title: newTitle.trim() } : b
    //   ));
    // }
  };

  const getFilteredBookmarks = () => {
    // TODO: Filter bookmarks by search term AND active tag
    // TODO: Search should be case-insensitive on title
    // TODO: If activeTag is 'All', don't filter by tag
    // Hint:
    // return bookmarks.filter(b => {
    //   const matchesSearch = b.title.toLowerCase().includes(searchTerm.toLowerCase());
    //   const matchesTag = activeTag === 'All' || b.tag === activeTag;
    //   return matchesSearch && matchesTag;
    // });
    return bookmarks;
  };

  const filtered = getFilteredBookmarks();

  return (
    <div className="app">
      <header className="header">
        <h1>Bookmark Manager</h1>
        <p>Save and organize your favorite links</p>
      </header>

      {/* Add Bookmark Form */}
      <div className="add-form">
        <input
          data-testid="title-input"
          type="text"
          placeholder="Bookmark title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          data-testid="url-input"
          type="text"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          data-testid="tag-select"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          {TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button data-testid="add-btn" onClick={handleAdd}>
          Add Bookmark
        </button>
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          data-testid="search-input"
          type="text"
          placeholder="Search bookmarks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Tag Filters */}
      <div className="tag-filters">
        <button
          data-testid="tag-all"
          className={activeTag === 'All' ? 'active' : ''}
          onClick={() => setActiveTag('All')}
        >
          All
        </button>
        {TAGS.map((t) => (
          <button
            key={t}
            data-testid={\\\`tag-\\\${t.toLowerCase()}\\\`}
            className={activeTag === t ? 'active' : ''}
            onClick={() => setActiveTag(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Bookmark Count */}
      <div data-testid="bookmark-count" className="bookmark-count">
        {filtered.length} bookmark{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Bookmark List */}
      <div data-testid="bookmark-list" className="bookmark-list">
        {filtered.map((b) => (
          <div key={b.id} data-testid={\\\`bookmark-\\\${b.id}\\\`} className="bookmark-card">
            <div className="bookmark-info">
              <h3 data-testid={\\\`bookmark-\\\${b.id}-title\\\`}>{b.title}</h3>
              <a
                data-testid={\\\`bookmark-\\\${b.id}-url\\\`}
                href={b.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {b.url}
              </a>
              <span
                data-testid={\\\`bookmark-\\\${b.id}-tag\\\`}
                className={\\\`tag-badge tag-\\\${b.tag.toLowerCase()}\\\`}
              >
                {b.tag}
              </span>
            </div>
            <div className="bookmark-actions">
              <button
                data-testid={\\\`bookmark-\\\${b.id}-edit\\\`}
                className="edit-btn"
                onClick={() => handleEdit(b.id)}
              >
                Edit
              </button>
              <button
                data-testid={\\\`bookmark-\\\${b.id}-delete\\\`}
                className="delete-btn"
                onClick={() => handleDelete(b.id)}
              >
                Delete
              </button>
            </div>
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
  background: #f0f4f8;
  min-height: 100vh;
  color: #1a202c;
}

.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.header {
  text-align: center;
  padding: 2rem;
  background: linear-gradient(135deg, #0d9488 0%, #06b6d4 100%);
  color: white;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 15px rgba(13, 148, 136, 0.3);
}

.header h1 {
  font-size: 2rem;
  margin-bottom: 0.25rem;
}

.header p {
  opacity: 0.9;
  font-size: 1rem;
}

.add-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.add-form input[type="text"] {
  flex: 1;
  min-width: 180px;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.add-form input[type="text"]:focus {
  border-color: #0d9488;
}

.add-form select {
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  outline: none;
  cursor: pointer;
}

.add-form select:focus {
  border-color: #0d9488;
}

.add-form button {
  padding: 0.75rem 1.5rem;
  font-size: 0.95rem;
  background: #0d9488;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s;
}

.add-form button:hover {
  background: #0f766e;
}

.search-bar {
  margin-bottom: 1rem;
}

.search-bar input {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
}

.search-bar input:focus {
  border-color: #06b6d4;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.15);
}

.tag-filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.tag-filters button {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  border: 2px solid #e2e8f0;
  border-radius: 20px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;
}

.tag-filters button:hover {
  border-color: #0d9488;
  color: #0d9488;
}

.tag-filters button.active {
  background: #0d9488;
  color: white;
  border-color: #0d9488;
}

.bookmark-count {
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 1rem;
  padding: 0.5rem 0;
  font-weight: 500;
}

.bookmark-list {
  display: grid;
  gap: 0.75rem;
}

.bookmark-card {
  background: white;
  border-radius: 10px;
  padding: 1.25rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  transition: box-shadow 0.2s, transform 0.2s;
}

.bookmark-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-info h3 {
  font-size: 1.05rem;
  margin-bottom: 0.35rem;
  color: #1a202c;
}

.bookmark-info a {
  font-size: 0.85rem;
  color: #0d9488;
  text-decoration: none;
  word-break: break-all;
  display: block;
  margin-bottom: 0.5rem;
}

.bookmark-info a:hover {
  text-decoration: underline;
}

.tag-badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tag-work {
  background: #dbeafe;
  color: #1d4ed8;
}

.tag-personal {
  background: #f3e8ff;
  color: #7c3aed;
}

.tag-learning {
  background: #dcfce7;
  color: #16a34a;
}

.tag-social {
  background: #fce7f3;
  color: #db2777;
}

.tag-other {
  background: #f1f5f9;
  color: #475569;
}

.bookmark-actions {
  display: flex;
  gap: 0.4rem;
  margin-left: 1rem;
  flex-shrink: 0;
}

.edit-btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  border: 1px solid #3b82f6;
  color: #3b82f6;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.edit-btn:hover {
  background: #3b82f6;
  color: white;
}

.delete-btn {
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  border: 1px solid #ef4444;
  color: #ef4444;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.delete-btn:hover {
  background: #ef4444;
  color: white;
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
          name: 'react-bookmark-manager',
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
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function settle() { return new Promise(function(r) { setTimeout(r, SETTLE_MS); }); }

function buildBundle() {
  var esbuild = require('esbuild');
  var outDir = path.join(__dirname);
  var outfile = path.join(outDir, 'bundle.js');
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
    + '<script>' + bundle + '<\\/script>'
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

async function handle(req, res) {
  var u = new urlMod.URL(req.url || '/', 'http://candidate');
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
  var envCandidates = [
    process.env.UI_HARNESS_URL,
    process.env.HARNESS_URL,
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
  ].filter(Boolean);

  var candidates = [
    ...envCandidates,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ];

  for (var base of candidates) {
    try {
      var res = await fetch(base + '/health');
      if (res.ok) return base;
    } catch (e) {}
  }
  throw new Error('Could not reach UI harness on /health');
}

function makeClient(getBase) {
  var base = function() { return getBase(); };

  async function req(path, init) {
    var res = await fetch(base() + path, init);
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || 'Request failed: ' + path);
    }
    return json;
  }

  return {
    reset: async function(opts) {
      opts = opts || {};
      return req('/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preserveStorage: Boolean(opts.preserveStorage) }),
      });
    },
    click: async function(testId) {
      return req('/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId }),
      });
    },
    type: async function(testId, text) {
      return req('/type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId, text: text }),
      });
    },
    select: async function(testId, value) {
      return req('/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId, value: value }),
      });
    },
    text: async function(testId) { return (await req('/text?testId=' + encodeURIComponent(testId))).text; },
    html: async function(testId) { return (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html; },
    count: async function(testId) { return (await req('/count?testId=' + encodeURIComponent(testId))).count; },
    storage: async function(key) { return (await req('/storage?key=' + encodeURIComponent(key))).value; },
  };
}

function parseBookmarks(raw) {
  if (!raw) return [];
  try {
    var v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

describe('React Bookmark Manager (Public)', function() {
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
    expect(await h.count('title-input')).toBe(1);
    expect(await h.count('url-input')).toBe(1);
    expect(await h.count('tag-select')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('search-input')).toBe(1);
    expect(await h.count('bookmark-list')).toBe(1);
    expect(await h.count('bookmark-count')).toBe(1);
    expect(await h.count('tag-all')).toBe(1);
    expect(await h.count('tag-work')).toBe(1);
    expect(await h.count('tag-personal')).toBe(1);
    expect(await h.count('tag-learning')).toBe(1);
    expect(await h.count('tag-social')).toBe(1);
    expect(await h.count('tag-other')).toBe(1);
  });

  test('starts with empty list, count shows 0', async function() {
    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/0/);
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('rejects empty title', async function() {
    await h.type('url-input', 'https://example.com');
    await h.click('add-btn');
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('rejects empty URL', async function() {
    await h.type('title-input', 'Test Bookmark');
    await h.click('add-btn');
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('adds bookmark with correct testids and localStorage', async function() {
    await h.type('title-input', 'React Docs');
    await h.type('url-input', 'https://react.dev');
    await h.select('tag-select', 'Learning');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);
    expect(stored[0].title).toBe('React Docs');
    expect(stored[0].url).toBe('https://react.dev');
    expect(stored[0].tag).toBe('Learning');
    expect(typeof stored[0].id).toBe('string');
    expect(typeof stored[0].createdAt).toBe('number');

    var id = stored[0].id;
    expect(await h.count('bookmark-' + id)).toBe(1);
    expect(await h.count('bookmark-' + id + '-title')).toBe(1);
    expect(await h.count('bookmark-' + id + '-url')).toBe(1);
    expect(await h.count('bookmark-' + id + '-tag')).toBe(1);
    expect(await h.count('bookmark-' + id + '-edit')).toBe(1);
    expect(await h.count('bookmark-' + id + '-delete')).toBe(1);

    var titleText = await h.text('bookmark-' + id + '-title');
    expect(titleText).toBe('React Docs');
  });

  test('inputs clear after adding', async function() {
    await h.type('title-input', 'My Bookmark');
    await h.type('url-input', 'https://example.com');
    await h.click('add-btn');

    // Click add again without typing -- should not add another
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);
  });

  test('tag badge shows correct text', async function() {
    await h.type('title-input', 'Work Site');
    await h.type('url-input', 'https://work.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;
    var tagText = await h.text('bookmark-' + id + '-tag');
    expect(tagText).toBe('Work');
  });

  test('delete removes correct bookmark', async function() {
    await h.type('title-input', 'Keep Me');
    await h.type('url-input', 'https://keep.com');
    await h.click('add-btn');

    await h.type('title-input', 'Delete Me');
    await h.type('url-input', 'https://delete.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(2);
    var toDelete = stored.find(function(b) { return b.title === 'Delete Me'; });

    await h.click('bookmark-' + toDelete.id + '-delete');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe('Keep Me');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain('Keep Me');
    expect(listHtml).not.toContain('Delete Me');
  });

  test('search filters by title (case-insensitive)', async function() {
    await h.type('title-input', 'React Tutorial');
    await h.type('url-input', 'https://react.dev');
    await h.click('add-btn');

    await h.type('title-input', 'Vue Guide');
    await h.type('url-input', 'https://vuejs.org');
    await h.click('add-btn');

    await h.type('search-input', 'react');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain('React Tutorial');
    expect(listHtml).not.toContain('Vue Guide');

    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/1/);
  });

  test('tag filter shows only matching tag', async function() {
    await h.type('title-input', 'Work Link');
    await h.type('url-input', 'https://work.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    await h.type('title-input', 'Personal Link');
    await h.type('url-input', 'https://personal.com');
    await h.select('tag-select', 'Personal');
    await h.click('add-btn');

    await h.click('tag-work');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain('Work Link');
    expect(listHtml).not.toContain('Personal Link');
  });

  test('search + tag filter work together (intersection)', async function() {
    await h.type('title-input', 'React Work');
    await h.type('url-input', 'https://react-work.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    await h.type('title-input', 'React Fun');
    await h.type('url-input', 'https://react-fun.com');
    await h.select('tag-select', 'Personal');
    await h.click('add-btn');

    await h.type('title-input', 'Vue Work');
    await h.type('url-input', 'https://vue-work.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    await h.type('search-input', 'react');
    await h.click('tag-work');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain('React Work');
    expect(listHtml).not.toContain('React Fun');
    expect(listHtml).not.toContain('Vue Work');

    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/1/);
  });

  test('edit title via prompt() updates DOM and storage', async function() {
    await h.type('title-input', 'Old Title');
    await h.type('url-input', 'https://example.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;

    await h.type('__prompt__', 'New Title');
    await h.click('bookmark-' + id + '-edit');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter[0].title).toBe('New Title');

    var titleText = await h.text('bookmark-' + id + '-title');
    expect(titleText).toBe('New Title');
  });

  test('edit rejects empty/whitespace', async function() {
    await h.type('title-input', 'Keep This Title');
    await h.type('url-input', 'https://example.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;

    await h.type('__prompt__', '   ');
    await h.click('bookmark-' + id + '-edit');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter[0].title).toBe('Keep This Title');
  });

  test('localStorage persistence on refresh', async function() {
    await h.type('title-input', 'Persist Me');
    await h.type('url-input', 'https://persist.com');
    await h.select('tag-select', 'Learning');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);
    var id = stored[0].id;

    // Refresh (reset with preserved storage)
    await h.reset({ preserveStorage: true });

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain('Persist Me');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe('Persist Me');
    expect(storedAfter[0].tag).toBe('Learning');
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

async function detectBaseUrl() {
  var envCandidates = [
    process.env.UI_HARNESS_URL,
    process.env.HARNESS_URL,
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
  ].filter(Boolean);

  var candidates = [
    ...envCandidates,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ];

  for (var base of candidates) {
    try {
      var res = await fetch(base + '/health');
      if (res.ok) return base;
    } catch (e) {}
  }
  throw new Error('Could not reach UI harness on /health');
}

function makeClient(getBase) {
  var base = function() { return getBase(); };

  async function req(path, init) {
    var res = await fetch(base() + path, init);
    var json = await res.json().catch(function() { return {}; });
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || 'Request failed: ' + path);
    }
    return json;
  }

  return {
    reset: async function(opts) {
      opts = opts || {};
      return req('/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preserveStorage: Boolean(opts.preserveStorage) }),
      });
    },
    click: async function(testId) {
      return req('/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId }),
      });
    },
    type: async function(testId, text) {
      return req('/type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId, text: text }),
      });
    },
    select: async function(testId, value) {
      return req('/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId: testId, value: value }),
      });
    },
    text: async function(testId) { return (await req('/text?testId=' + encodeURIComponent(testId))).text; },
    html: async function(testId) { return (await req(testId ? '/html?testId=' + encodeURIComponent(testId) : '/html')).html; },
    count: async function(testId) { return (await req('/count?testId=' + encodeURIComponent(testId))).count; },
    storage: async function(key) { return (await req('/storage?key=' + encodeURIComponent(key))).value; },
  };
}

function parseBookmarks(raw) {
  if (!raw) return [];
  try {
    var v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function rand(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

var TAG_OPTIONS = ['Work', 'Personal', 'Learning', 'Social', 'Other'];

function randomTag() {
  return TAG_OPTIONS[Math.floor(Math.random() * TAG_OPTIONS.length)];
}

describe('React Bookmark Manager (Hidden)', function() {
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
    expect(await h.count('title-input')).toBe(1);
    expect(await h.count('url-input')).toBe(1);
    expect(await h.count('tag-select')).toBe(1);
    expect(await h.count('add-btn')).toBe(1);
    expect(await h.count('search-input')).toBe(1);
    expect(await h.count('bookmark-list')).toBe(1);
    expect(await h.count('bookmark-count')).toBe(1);
    expect(await h.count('tag-all')).toBe(1);
    expect(await h.count('tag-work')).toBe(1);
    expect(await h.count('tag-personal')).toBe(1);
    expect(await h.count('tag-learning')).toBe(1);
    expect(await h.count('tag-social')).toBe(1);
    expect(await h.count('tag-other')).toBe(1);
  });

  test('starts with empty list, count shows 0', async function() {
    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/0/);
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('rejects empty title (randomized URL)', async function() {
    await h.type('url-input', 'https://' + rand('site') + '.com');
    await h.click('add-btn');
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('rejects empty URL (randomized title)', async function() {
    await h.type('title-input', rand('Title'));
    await h.click('add-btn');
    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(0);
  });

  test('adds bookmark with correct testids and localStorage (randomized)', async function() {
    var t = rand('BM');
    var u = 'https://' + rand('site') + '.com';
    var tag = 'Personal';

    await h.type('title-input', t);
    await h.type('url-input', u);
    await h.select('tag-select', tag);
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);
    expect(stored[0].title).toBe(t);
    expect(stored[0].url).toBe(u);
    expect(stored[0].tag).toBe(tag);
    expect(typeof stored[0].id).toBe('string');
    expect(typeof stored[0].createdAt).toBe('number');

    var id = stored[0].id;
    expect(await h.count('bookmark-' + id)).toBe(1);
    expect(await h.count('bookmark-' + id + '-title')).toBe(1);
    expect(await h.count('bookmark-' + id + '-url')).toBe(1);
    expect(await h.count('bookmark-' + id + '-tag')).toBe(1);
    expect(await h.count('bookmark-' + id + '-edit')).toBe(1);
    expect(await h.count('bookmark-' + id + '-delete')).toBe(1);

    var titleText = await h.text('bookmark-' + id + '-title');
    expect(titleText).toBe(t);
  });

  test('inputs clear after adding (randomized)', async function() {
    await h.type('title-input', rand('ClearTest'));
    await h.type('url-input', 'https://' + rand('clear') + '.com');
    await h.click('add-btn');

    // Click add again -- should not add another (inputs were cleared)
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);
  });

  test('tag badge shows correct text (randomized tag)', async function() {
    var tag = randomTag();
    await h.type('title-input', rand('Tag'));
    await h.type('url-input', 'https://' + rand('tag') + '.com');
    await h.select('tag-select', tag);
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;
    var tagText = await h.text('bookmark-' + id + '-tag');
    expect(tagText).toBe(tag);
  });

  test('delete removes correct bookmark (randomized)', async function() {
    var keepTitle = rand('Keep');
    var deleteTitle = rand('Delete');

    await h.type('title-input', keepTitle);
    await h.type('url-input', 'https://keep.com');
    await h.click('add-btn');

    await h.type('title-input', deleteTitle);
    await h.type('url-input', 'https://delete.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var toDelete = stored.find(function(b) { return b.title === deleteTitle; });

    await h.click('bookmark-' + toDelete.id + '-delete');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe(keepTitle);

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain(keepTitle);
    expect(listHtml).not.toContain(deleteTitle);
  });

  test('search filters by title case-insensitively (randomized)', async function() {
    var matchTitle = rand('SearchMatch');
    var noMatchTitle = rand('Other');

    await h.type('title-input', matchTitle);
    await h.type('url-input', 'https://match.com');
    await h.click('add-btn');

    await h.type('title-input', noMatchTitle);
    await h.type('url-input', 'https://nomatch.com');
    await h.click('add-btn');

    // Search with different case
    await h.type('search-input', matchTitle.toLowerCase().slice(0, 12));

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain(matchTitle);
    expect(listHtml).not.toContain(noMatchTitle);

    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/1/);
  });

  test('tag filter shows only matching tag (randomized)', async function() {
    var workTitle = rand('WorkBM');
    var socialTitle = rand('SocialBM');

    await h.type('title-input', workTitle);
    await h.type('url-input', 'https://work.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    await h.type('title-input', socialTitle);
    await h.type('url-input', 'https://social.com');
    await h.select('tag-select', 'Social');
    await h.click('add-btn');

    await h.click('tag-work');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain(workTitle);
    expect(listHtml).not.toContain(socialTitle);
  });

  test('search + tag filter work together (randomized)', async function() {
    var reactWork = rand('ReactWork');
    var reactPersonal = rand('ReactPersonal');
    var vueWork = rand('VueWork');

    await h.type('title-input', reactWork);
    await h.type('url-input', 'https://rw.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    await h.type('title-input', reactPersonal);
    await h.type('url-input', 'https://rp.com');
    await h.select('tag-select', 'Personal');
    await h.click('add-btn');

    await h.type('title-input', vueWork);
    await h.type('url-input', 'https://vw.com');
    await h.select('tag-select', 'Work');
    await h.click('add-btn');

    // Search for the reactWork prefix and filter Work tag
    await h.type('search-input', reactWork.slice(0, 15));
    await h.click('tag-work');

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain(reactWork);
    expect(listHtml).not.toContain(reactPersonal);
    expect(listHtml).not.toContain(vueWork);

    var countText = await h.text('bookmark-count');
    expect(countText).toMatch(/1/);
  });

  test('edit title via prompt() updates DOM and storage (randomized)', async function() {
    var original = rand('Original');
    var edited = rand('Edited');

    await h.type('title-input', original);
    await h.type('url-input', 'https://edit.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;

    await h.type('__prompt__', edited);
    await h.click('bookmark-' + id + '-edit');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter[0].title).toBe(edited);

    var titleText = await h.text('bookmark-' + id + '-title');
    expect(titleText).toBe(edited);
  });

  test('edit rejects empty/whitespace (randomized)', async function() {
    var original = rand('NoEdit');

    await h.type('title-input', original);
    await h.type('url-input', 'https://noedit.com');
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    var id = stored[0].id;

    await h.type('__prompt__', '   ');
    await h.click('bookmark-' + id + '-edit');

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter[0].title).toBe(original);
  });

  test('localStorage persistence on refresh (randomized)', async function() {
    var t = rand('Persist');
    var u = 'https://' + rand('persist') + '.com';
    var tag = 'Social';

    await h.type('title-input', t);
    await h.type('url-input', u);
    await h.select('tag-select', tag);
    await h.click('add-btn');

    var stored = parseBookmarks(await h.storage('bookmarks'));
    expect(stored.length).toBe(1);

    // Refresh with preserved storage
    await h.reset({ preserveStorage: true });

    var listHtml = await h.html('bookmark-list');
    expect(listHtml).toContain(t);

    var storedAfter = parseBookmarks(await h.storage('bookmarks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe(t);
    expect(storedAfter[0].url).toBe(u);
    expect(storedAfter[0].tag).toBe(tag);
  });
});
`,
};
