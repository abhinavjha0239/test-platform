import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'DOM Task Manager',
  description: `# DOM Task Manager Challenge

## What You're Building

Build a complete **Task Management Application** using vanilla JavaScript and DOM manipulation. No frameworks allowed—this tests your fundamental DOM skills.

This challenge covers:
- DOM Selection & Traversal
- Event Handling
- Dynamic Element Creation
- State Management
- Data Persistence

---

## Requirements

### Core Features
1. **Add Tasks**: Input field + button to create new tasks
2. **Display Tasks**: Render tasks in a list with proper structure
3. **Toggle Complete**: Click to mark task as complete/incomplete
4. **Delete Tasks**: Remove individual tasks
5. **Edit Tasks**: Modify existing task text (uses \`prompt()\`)
6. **Filter Tasks**: Show All, Active, or Completed tasks

### Task Structure
Each task must have:
- Unique ID (generated)
- Title (required)
- Completed status (boolean)
- Created timestamp

### Persistence
- Save tasks to \`localStorage\`
- Load tasks on page refresh

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| Task input | \`task-input\` |
| Add button | \`add-button\` |
| Task list container | \`task-list\` |
| Each task item | \`task-{id}\` |
| Task checkbox | \`task-{id}-checkbox\` |
| Task text | \`task-{id}-text\` |
| Delete button | \`task-{id}-delete\` |
| Edit button | \`task-{id}-edit\` |
| Filter: All | \`filter-all\` |
| Filter: Active | \`filter-active\` |
| Filter: Completed | \`filter-completed\` |
| Task count | \`task-count\` |
| Clear completed | \`clear-completed\` |

---

## Important Notes

- **Edit uses \`prompt()\`**: When the edit button is clicked, use \`prompt()\` to get the new title
- **Empty input rejected**: Don't add/edit with empty or whitespace-only titles
- **Filter buttons**: Should have \`active\` class on the current filter
- **Task count**: Shows number of ACTIVE (incomplete) tasks

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Required elements exist | 1 |
| Add task (DOM + localStorage) | 2 |
| Unique task IDs | 1 |
| Toggle completion | 2 |
| Delete task | 2 |
| Edit task | 2 |
| Filter tasks | 2 |
| Filter button active class | 1 |
| Clear completed | 2 |
| Task count | 1 |
| localStorage persistence | 2 |

**Total: 18 tests**
`,

  starterFiles: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Manager</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <h1>Task Manager</h1>
    
    <!-- Add Task Form -->
    <div class="add-task-form">
      <input 
        type="text" 
        data-testid="task-input" 
        placeholder="What needs to be done?"
      >
      <button data-testid="add-button">Add Task</button>
    </div>
    
    <!-- Filters -->
    <div class="filters">
      <button data-testid="filter-all" class="active">All</button>
      <button data-testid="filter-active">Active</button>
      <button data-testid="filter-completed">Completed</button>
    </div>
    
    <!-- Task List -->
    <ul data-testid="task-list" class="task-list">
      <!-- Tasks will be rendered here -->
    </ul>
    
    <!-- Footer -->
    <div class="footer">
      <span data-testid="task-count">0 tasks</span>
      <button data-testid="clear-completed">Clear Completed</button>
    </div>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
`,
    'styles.css': `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f5;
  min-height: 100vh;
  padding: 2rem;
}

.app {
  max-width: 600px;
  margin: 0 auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  padding: 2rem;
}

h1 {
  text-align: center;
  margin-bottom: 1.5rem;
  color: #333;
}

.add-task-form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.add-task-form input {
  flex: 1;
  padding: 0.75rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
}

.add-task-form button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.filters button {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.filters button.active {
  background: #4a90d9;
  color: white;
  border-color: #4a90d9;
}

.task-list {
  list-style: none;
  margin-bottom: 1rem;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
}

.task-item.completed .task-text {
  text-decoration: line-through;
  color: #999;
}

.task-text {
  flex: 1;
}

.task-actions button {
  padding: 0.25rem 0.5rem;
  margin-left: 0.25rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #666;
  font-size: 0.875rem;
}

.footer button {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}
`,
    'app.js': `// Task Manager Application
// Implement the following functionality:

// Task data structure: { id, title, completed, createdAt }

// 1. Initialize tasks from localStorage or use empty array
let tasks = [];

// 2. DOM Elements - Get references to all needed elements
const taskInput = document.querySelector('[data-testid="task-input"]');
const addButton = document.querySelector('[data-testid="add-button"]');
const taskList = document.querySelector('[data-testid="task-list"]');
const taskCount = document.querySelector('[data-testid="task-count"]');
const filterAll = document.querySelector('[data-testid="filter-all"]');
const filterActive = document.querySelector('[data-testid="filter-active"]');
const filterCompleted = document.querySelector('[data-testid="filter-completed"]');
const clearCompleted = document.querySelector('[data-testid="clear-completed"]');

let currentFilter = 'all';

// 3. Load tasks from localStorage
function loadTasks() {
  // TODO: Load from localStorage
  // const saved = localStorage.getItem('tasks');
  // if (saved) tasks = JSON.parse(saved);
}

// 4. Save tasks to localStorage
function saveTasks() {
  // TODO: Save to localStorage
  // localStorage.setItem('tasks', JSON.stringify(tasks));
}

// 5. Generate unique ID
function generateId() {
  // TODO: Return a unique ID
  // return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// 6. Add a new task
function addTask(title) {
  // TODO: Create task object and add to array
  // const task = { id: generateId(), title, completed: false, createdAt: Date.now() };
  // tasks.push(task);
  // saveTasks();
  // renderTasks();
}

// 7. Toggle task completion
function toggleTask(id) {
  // TODO: Find task by id and toggle completed status
}

// 8. Delete a task
function deleteTask(id) {
  // TODO: Remove task from array
}

// 9. Edit a task (uses prompt())
function editTask(id) {
  // TODO: Use prompt() to get new title and update task
  // const task = tasks.find(t => t.id === id);
  // const newTitle = prompt('Edit task', task.title);
  // if (newTitle && newTitle.trim()) {
  //   task.title = newTitle.trim();
  //   saveTasks();
  //   renderTasks();
  // }
}

// 10. Filter tasks based on current filter
function getFilteredTasks() {
  // TODO: Return filtered tasks based on currentFilter
  // if (currentFilter === 'active') return tasks.filter(t => !t.completed);
  // if (currentFilter === 'completed') return tasks.filter(t => t.completed);
  // return tasks;
}

// 11. Render tasks to DOM
function renderTasks() {
  // TODO: Clear task list and render all filtered tasks
  // taskList.innerHTML = '';
  // getFilteredTasks().forEach(task => {
  //   const li = createTaskElement(task);
  //   taskList.appendChild(li);
  // });
  // updateTaskCount();
}

// 12. Create task element
function createTaskElement(task) {
  // TODO: Create and return a li element for the task
  // const li = document.createElement('li');
  // li.className = 'task-item' + (task.completed ? ' completed' : '');
  // li.setAttribute('data-testid', 'task-' + task.id);
  // ... add checkbox, text, buttons with correct data-testid
  // return li;
}

// 13. Update task count display
function updateTaskCount() {
  // TODO: Update the task count text (shows ACTIVE tasks)
  // const activeCount = tasks.filter(t => !t.completed).length;
  // taskCount.textContent = activeCount + ' task' + (activeCount !== 1 ? 's' : '') + ' left';
}

// 14. Clear completed tasks
function clearCompletedTasks() {
  // TODO: Remove all completed tasks
}

// 15. Set filter
function setFilter(filter) {
  // TODO: Update currentFilter, update active class on buttons, and re-render
}

// 16. Event Listeners
// TODO: Add event listeners for:
// - Add button click
// - Filter button clicks
// - Clear completed click
// - Task checkbox change (use event delegation on taskList)
// - Task delete click
// - Task edit click

// Example:
// addButton.addEventListener('click', () => {
//   const title = taskInput.value.trim();
//   if (title) {
//     addTask(title);
//     taskInput.value = '';
//   }
// });

// 17. Initialize
// loadTasks();
// renderTasks();
`,
    'README.md': `# DOM Task Manager Challenge

Welcome to the Task Manager challenge! Build a complete task management app using **vanilla JavaScript** and DOM manipulation.

## 🎯 Your Goal

Complete the implementation in \`app.js\` to create a fully functional task manager with:
- Add, delete, edit tasks
- Toggle completion status  
- Filter by All/Active/Completed
- Persist to localStorage

## 📁 Files Overview

| File | Purpose |
|------|---------|
| \`app.js\` | **Main file** - Implement all TODO functions |
| \`index.html\` | HTML structure (already complete) |
| \`styles.css\` | Styling (already complete) |

## ✅ What the Tests Check

### Public Tests (18 tests)
- ✓ All required elements exist (input, buttons, list)
- ✓ Empty list shows 0 count
- ✓ Empty/whitespace input rejected
- ✓ Add task saves to localStorage with correct shape
- ✓ Task elements have correct data-testid attributes
- ✓ Input clears after adding
- ✓ Multiple tasks have unique IDs
- ✓ Toggle updates DOM and localStorage
- ✓ Delete removes correct task
- ✓ Edit uses prompt() and updates correctly
- ✓ Edit rejects empty/whitespace
- ✓ Filters show correct tasks
- ✓ Filter buttons have active class
- ✓ Clear completed works
- ✓ Task count shows active count
- ✓ Tasks persist across refresh

### Hidden Tests
Same tests with randomized task names to prevent hardcoding.

## 🚨 Important: data-testid Attributes

Each task element MUST have these attributes:

\`\`\`html
<li data-testid="task-{id}" class="task-item">
  <input type="checkbox" data-testid="task-{id}-checkbox">
  <span data-testid="task-{id}-text">Task title</span>
  <button data-testid="task-{id}-edit">Edit</button>
  <button data-testid="task-{id}-delete">Delete</button>
</li>
\`\`\`

## 📝 Task Object Shape

Tasks in localStorage must be an array of objects:
\`\`\`javascript
{
  id: string,        // unique ID
  title: string,     // task text
  completed: boolean,// true if done
  createdAt: number  // timestamp
}
\`\`\`

## 💡 Implementation Order

1. **generateId()** - Create unique IDs
2. **saveTasks() / loadTasks()** - localStorage first!
3. **addTask()** - Add task to array and DOM
4. **createTaskElement()** - Build the HTML for a task
5. **renderTasks()** - Display all tasks
6. **toggleTask()** - Mark complete/incomplete
7. **deleteTask()** - Remove from array and DOM
8. **editTask()** - Use prompt() to edit
9. **setFilter()** - Update filter and active class
10. **clearCompletedTasks()** - Remove done tasks

## ⚠️ Common Mistakes

1. Forgetting to call \`saveTasks()\` after changes
2. Wrong data-testid format (must be \`task-{id}-checkbox\`, etc.)
3. Not clearing input after adding
4. Edit allowing empty titles
5. Task count showing total instead of active

Good luck! 🚀
`,
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'ui_jsdom',
    runtime: 'node',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'dom-task-manager',
          private: true,
          type: 'commonjs',
          devDependencies: {
            jsdom: '^24.1.0',
          },
        }, null, 2) + '\n',
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);

let current = { dom: null, window: null, document: null };

// Persisted localStorage across resets (unless cleared explicitly)
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

function injectHiddenPromptInput(html) {
  // Add a hidden input to control prompt() from tests (type into __prompt__)
  return html.replace(
    /<body([^>]*)>/i,
    (m, attrs) => \`<body\${attrs}>\\n<input data-testid="__prompt__" style="display:none" />\`
  );
}

function reset(options = {}) {
  const { JSDOM } = require('jsdom');
  try {
    const preserveStorage = Boolean(options.preserveStorage);

    // If not preserving storage, clear it (default behavior)
    if (!preserveStorage) {
      for (const k of Object.keys(persistentStorage)) delete persistentStorage[k];
    }

    // Read files
    const htmlPath = path.join(__dirname, '..', 'index.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    const jsPath = path.join(__dirname, '..', 'app.js');
    const jsContent = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';

    const cssPath = path.join(__dirname, '..', 'styles.css');
    const cssContent = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

    // Inline JS
    htmlContent = htmlContent.replace(
      /<script src="app.js"><\\/script>/,
      '<script>' + jsContent + '</script>'
    );

    // Inline CSS - replace the link tag with inline style
    if (cssContent) {
      htmlContent = htmlContent.replace(
        /<link[^>]*href="styles\\.css"[^>]*>/i,
        '<style>' + cssContent + '</style>'
      );
    }

    // Inject prompt controller input
    htmlContent = injectHiddenPromptInput(htmlContent);

    const dom = new JSDOM(htmlContent, {
      url: 'http://candidate/',
      runScripts: 'dangerously',
      resources: 'usable',
      pretendToBeVisual: true,
      beforeParse(window) {
        // Mock localStorage BEFORE candidate scripts run
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: {
            getItem: (key) => (key in persistentStorage ? persistentStorage[key] : null),
            setItem: (key, value) => { persistentStorage[key] = String(value); },
            removeItem: (key) => { delete persistentStorage[key]; },
            clear: () => { for (const k of Object.keys(persistentStorage)) delete persistentStorage[k]; },
          }
        });

        // Make prompt() controllable via hidden input
        window.prompt = () => {
          const el = window.document.querySelector('[data-testid="__prompt__"]');
          return el ? String(el.value ?? '') : '';
        };
      }
    });

    current = { dom, window: dom.window, document: dom.window.document };
  } catch (err) {
    console.error('[ui_jsdom] CRITICAL RESET ERROR:', err);
    throw err;
  }
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
  const u = new URL(req.url || '/', 'http://candidate');
  const pathname = u.pathname;

  if (pathname === '/health') return sendJson(res, 200, { ok: true });

  if (pathname === '/reset' && req.method === 'POST') {
    const body = await readJson(req);
    try {
      reset({ preserveStorage: Boolean(body.preserveStorage) });
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Reset failed: ' + e.message, stack: e.stack });
    }
  }

  if (!current.dom) {
    try {
      reset(); 
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Initial reset failed: ' + e.message, stack: e.stack });
    }
  }

  if (pathname === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);

    // Better checkbox behavior: toggle checked BEFORE events
    if (el && el.type === 'checkbox') {
      el.checked = !el.checked;
    }

    const clickEvent = new current.window.MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(clickEvent);

    if (el && el.type === 'checkbox') {
      const changeEvent = new current.window.Event('change', { bubbles: true });
      el.dispatchEvent(changeEvent);
    }

    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.value = '';
    el.value = String(body.text || '');
    const inputEvent = new current.window.Event('input', { bubbles: true });
    el.dispatchEvent(inputEvent);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/text' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const el = getFirst(testId);
    return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() });
  }

  if (pathname === '/allText' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = getAll(testId);
    return sendJson(res, 200, { ok: true, texts: els.map((e) => (e.textContent || '').trim()) });
  }

  if (pathname === '/count' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = getAll(testId);
    return sendJson(res, 200, { ok: true, count: els.length });
  }

  if (pathname === '/html' && req.method === 'GET') {
    const testId = u.searchParams.get('testId');
    const el = testId ? getFirst(testId) : current.document.body;
    return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' });
  }

  // Read localStorage in tests
  if (pathname === '/storage' && req.method === 'GET') {
    const key = u.searchParams.get('key') || '';
    const value = current.window.localStorage.getItem(key);
    return sendJson(res, 200, { ok: true, key, value });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

function main() {
  try { reset(); } catch (e) { console.error('[ui_jsdom] Initial reset failed:', e); }
  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[ui_jsdom] handler error:', e);
      sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    });
  });
  server.listen(PORT, '0.0.0.0', () => console.log('[ui_jsdom] listening on ' + PORT));
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
      framework: 'vitest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npx vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=verbose --reporter=junit --outputFile=results.xml **/*.spec.js 2>&1',
      timeoutMs: 120000,
    },
  },

  publicTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

// Helper client for UI harness

async function detectBaseUrl() {
  const envCandidates = [
    process.env.UI_HARNESS_URL,
    process.env.HARNESS_URL,
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
  ].filter(Boolean);

  const candidates = [
    ...envCandidates,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ];

  for (const base of candidates) {
    try {
      const res = await fetch(base + '/health');
      if (res.ok) return base;
    } catch {}
  }
  throw new Error('Could not reach UI harness on /health');
}

function makeClient(getBase) {
  const base = () => getBase();

  async function req(path, init) {
    const res = await fetch(base() + path, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || \`Request failed: \${path}\`);
    }
    return json;
  }

  return {
    reset: async (opts = {}) =>
      req('/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preserveStorage: Boolean(opts.preserveStorage) }),
      }),
    click: async (testId) =>
      req('/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId }),
      }),
    type: async (testId, text) =>
      req('/type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId, text }),
      }),
    text: async (testId) => (await req(\`/text?testId=\${encodeURIComponent(testId)}\`)).text,
    html: async (testId) =>
      (await req(testId ? \`/html?testId=\${encodeURIComponent(testId)}\` : '/html')).html,
    count: async (testId) => (await req(\`/count?testId=\${encodeURIComponent(testId)}\`)).count,
    storage: async (key) => (await req(\`/storage?key=\${encodeURIComponent(key)}\`)).value,
  };
}

function parseTasks(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function expectTaskShape(t) {
  expect(t).toBeTruthy();
  expect(typeof t.id).toBe('string');
  expect(typeof t.title).toBe('string');
  expect(typeof t.completed).toBe('boolean');
  expect(typeof t.createdAt).toBe('number');
}

function countRenderedLis(listHtml) {
  return (listHtml.match(/<li\\b/g) || []).length;
}

describe('DOM Task Manager (Public)', () => {
  let baseUrl = '';
  let h;

  beforeAll(async () => {
    baseUrl = await detectBaseUrl();
    h = makeClient(() => baseUrl);
  });

  beforeEach(async () => {
    await h.reset({ preserveStorage: false });
  });

  const titleA = () => 'Learn DOM';
  const titleB = () => 'Write Tests';
  const titleC = () => 'Ship Feature';
  const editedTitle = () => 'Edited Task Title';

  test('renders required static elements', async () => {
    expect(await h.count('task-input')).toBe(1);
    expect(await h.count('add-button')).toBe(1);
    expect(await h.count('task-list')).toBe(1);
    expect(await h.count('filter-all')).toBe(1);
    expect(await h.count('filter-active')).toBe(1);
    expect(await h.count('filter-completed')).toBe(1);
    expect(await h.count('task-count')).toBe(1);
    expect(await h.count('clear-completed')).toBe(1);
  });

  test('starts with empty list and count shows 0', async () => {
    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(0);

    const countText = await h.text('task-count');
    expect(countText).toMatch(/0/);
  });

  test('does not add task for empty/whitespace input', async () => {
    await h.type('task-input', '   ');
    await h.click('add-button');

    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(0);

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(0);
  });

  test('adds a task, renders correct testids, and saves to localStorage', async () => {
    const t = titleA();
    await h.type('task-input', t);
    await h.click('add-button');

    // localStorage shape
    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(1);
    expectTaskShape(stored[0]);
    expect(stored[0].title).toBe(t);
    expect(stored[0].completed).toBe(false);

    const id = stored[0].id;

    // DOM wiring
    expect(await h.count(\`task-\${id}\`)).toBe(1);
    expect(await h.count(\`task-\${id}-checkbox\`)).toBe(1);
    expect(await h.count(\`task-\${id}-text\`)).toBe(1);
    expect(await h.count(\`task-\${id}-delete\`)).toBe(1);
    expect(await h.count(\`task-\${id}-edit\`)).toBe(1);

    const text = await h.text(\`task-\${id}-text\`);
    expect(text).toContain(t);
  });

  test('input clears after adding (second click without typing should NOT add another)', async () => {
    await h.type('task-input', titleA());
    await h.click('add-button');

    // If input was cleared, clicking add again (no typing) should do nothing
    await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(1);

    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(1);
  });

  test('multiple tasks have unique IDs and correct storage length', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');
    await h.type('task-input', titleC()); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(3);
    const ids = stored.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
  });

  test('toggle completion updates DOM and localStorage', async () => {
    await h.type('task-input', titleA());
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    // toggle ON
    await h.click(\`task-\${id}-checkbox\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].completed).toBe(true);

    const liHtml = await h.html(\`task-\${id}\`);
    expect(liHtml).toMatch(/\\bcompleted\\b/i);

    // toggle OFF
    await h.click(\`task-\${id}-checkbox\`);
    const stored3 = parseTasks(await h.storage('tasks'));
    expect(stored3[0].completed).toBe(false);
  });

  test('deleting one task does not affect others', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');
    await h.type('task-input', titleC()); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const toDelete = stored.find((x) => x.title === titleB());
    expect(toDelete).toBeTruthy();

    await h.click(\`task-\${toDelete.id}-delete\`);

    const storedAfter = parseTasks(await h.storage('tasks'));
    expect(storedAfter.length).toBe(2);
    expect(storedAfter.map((x) => x.title)).toContain(titleA());
    expect(storedAfter.map((x) => x.title)).toContain(titleC());
    expect(storedAfter.map((x) => x.title)).not.toContain(titleB());

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleA());
    expect(listHtml).toContain(titleC());
    expect(listHtml).not.toContain(titleB());
  });

  test('edit task uses prompt() value, updates DOM and localStorage', async () => {
    await h.type('task-input', titleA());
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    // set prompt return via hidden input
    await h.type('__prompt__', editedTitle());
    await h.click(\`task-\${id}-edit\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].title).toBe(editedTitle());

    const text = await h.text(\`task-\${id}-text\`);
    expect(text).toContain(editedTitle());
  });

  test('edit should not allow empty/whitespace titles', async () => {
    await h.type('task-input', titleA());
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    await h.type('__prompt__', '   ');
    await h.click(\`task-\${id}-edit\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].title).toBe(titleA());
  });

  test('filters: active shows only active tasks, completed shows only completed tasks', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const idB = stored.find((x) => x.title === titleB()).id;

    // complete B
    await h.click(\`task-\${idB}-checkbox\`);

    // Active filter => should show A only
    await h.click('filter-active');
    let listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleA());
    expect(listHtml).not.toContain(titleB());

    // Completed filter => should show B only
    await h.click('filter-completed');
    listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleB());
    expect(listHtml).not.toContain(titleA());

    // All filter => shows both
    await h.click('filter-all');
    listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleA());
    expect(listHtml).toContain(titleB());
  });

  test('filter buttons toggle "active" class correctly', async () => {
    await h.click('filter-active');
    expect(await h.html('filter-active')).toContain('class="active"');
    expect(await h.html('filter-all')).not.toContain('class="active"');

    await h.click('filter-completed');
    console.log('DEBUG: f-active after completed click:', await h.html('filter-active'));
    console.log('DEBUG: f-completed after completed click:', await h.html('filter-completed'));
    
    expect(await h.html('filter-completed')).toContain('class="active"');
    expect(await h.html('filter-active')).not.toContain('class="active"');

    await h.click('filter-all');
    console.log('DEBUG: f-all after all click:', await h.html('filter-all'));
    console.log('DEBUG: f-completed after all click:', await h.html('filter-completed'));

    expect(await h.html('filter-all')).toContain('class="active"');
    expect(await h.html('filter-completed')).not.toContain('class="active"');
  });

  test('clear completed removes only completed tasks (DOM + storage)', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const idB = stored.find((x) => x.title === titleB()).id;

    await h.click(\`task-\${idB}-checkbox\`);
    await h.click('clear-completed');

    const storedAfter = parseTasks(await h.storage('tasks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe(titleA());

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleA());
    expect(listHtml).not.toContain(titleB());
  });

  test('task count reflects active tasks', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');
    await h.type('task-input', titleC()); await h.click('add-button');

    let countText = await h.text('task-count');
    expect(countText).toMatch(/3/);

    const stored = parseTasks(await h.storage('tasks'));
    const idA = stored.find((x) => x.title === titleA()).id;

    await h.click(\`task-\${idA}-checkbox\`);

    countText = await h.text('task-count');
    expect(countText).toMatch(/2/);
  });

  test('persistence: tasks load from localStorage on refresh', async () => {
    await h.type('task-input', titleA()); await h.click('add-button');
    await h.type('task-input', titleB()); await h.click('add-button');

    let stored = parseTasks(await h.storage('tasks'));
    const idA = stored.find((x) => x.title === titleA()).id;

    await h.click(\`task-\${idA}-checkbox\`); // complete A

    // "Refresh" without clearing localStorage
    await h.reset({ preserveStorage: true });

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(titleA());
    expect(listHtml).toContain(titleB());

    stored = parseTasks(await h.storage('tasks'));
    const a = stored.find((x) => x.title === titleA());
    expect(a.completed).toBe(true);

    // Completed task should render with completed class
    const liHtml = await h.html(\`task-\${idA}\`);
    expect(liHtml).toMatch(/\\bcompleted\\b/i);
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach, beforeAll } from 'vitest';

// Helper client for UI harness

async function detectBaseUrl() {
  const envCandidates = [
    process.env.UI_HARNESS_URL,
    process.env.HARNESS_URL,
    process.env.HARNESS_BASE_URL,
    process.env.CANDIDATE_URL,
  ].filter(Boolean);

  const candidates = [
    ...envCandidates,
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://candidate:3000',
  ];

  for (const base of candidates) {
    try {
      const res = await fetch(base + '/health');
      if (res.ok) return base;
    } catch {}
  }
  throw new Error('Could not reach UI harness on /health');
}

function makeClient(getBase) {
  const base = () => getBase();

  async function req(path, init) {
    const res = await fetch(base() + path, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || \`Request failed: \${path}\`);
    }
    return json;
  }

  return {
    reset: async (opts = {}) =>
      req('/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preserveStorage: Boolean(opts.preserveStorage) }),
      }),
    click: async (testId) =>
      req('/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId }),
      }),
    type: async (testId, text) =>
      req('/type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId, text }),
      }),
    text: async (testId) => (await req(\`/text?testId=\${encodeURIComponent(testId)}\`)).text,
    html: async (testId) =>
      (await req(testId ? \`/html?testId=\${encodeURIComponent(testId)}\` : '/html')).html,
    count: async (testId) => (await req(\`/count?testId=\${encodeURIComponent(testId)}\`)).count,
    storage: async (key) => (await req(\`/storage?key=\${encodeURIComponent(key)}\`)).value,
  };
}

function parseTasks(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function expectTaskShape(t) {
  expect(t).toBeTruthy();
  expect(typeof t.id).toBe('string');
  expect(typeof t.title).toBe('string');
  expect(typeof t.completed).toBe('boolean');
  expect(typeof t.createdAt).toBe('number');
}

function countRenderedLis(listHtml) {
  return (listHtml.match(/<li\\b/g) || []).length;
}

function rand(prefix) {
  return \`\${prefix}_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
}

describe('DOM Task Manager (Hidden)', () => {
  let baseUrl = '';
  let h;

  beforeAll(async () => {
    baseUrl = await detectBaseUrl();
    h = makeClient(() => baseUrl);
  });

  beforeEach(async () => {
    await h.reset({ preserveStorage: false });
  });

  const titleA = () => rand('A');
  const titleB = () => rand('B');
  const titleC = () => rand('C');
  const editedTitle = () => rand('EDITED');

  test('renders required static elements', async () => {
    expect(await h.count('task-input')).toBe(1);
    expect(await h.count('add-button')).toBe(1);
    expect(await h.count('task-list')).toBe(1);
    expect(await h.count('filter-all')).toBe(1);
    expect(await h.count('filter-active')).toBe(1);
    expect(await h.count('filter-completed')).toBe(1);
    expect(await h.count('task-count')).toBe(1);
    expect(await h.count('clear-completed')).toBe(1);
  });

  test('starts with empty list and count shows 0', async () => {
    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(0);

    const countText = await h.text('task-count');
    expect(countText).toMatch(/0/);
  });

  test('does not add task for empty/whitespace input', async () => {
    await h.type('task-input', '   ');
    await h.click('add-button');

    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(0);

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(0);
  });

  test('adds a task, renders correct testids, and saves to localStorage', async () => {
    const t = titleA();
    await h.type('task-input', t);
    await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(1);
    expectTaskShape(stored[0]);
    expect(stored[0].title).toBe(t);
    expect(stored[0].completed).toBe(false);

    const id = stored[0].id;

    expect(await h.count(\`task-\${id}\`)).toBe(1);
    expect(await h.count(\`task-\${id}-checkbox\`)).toBe(1);
    expect(await h.count(\`task-\${id}-text\`)).toBe(1);
    expect(await h.count(\`task-\${id}-delete\`)).toBe(1);
    expect(await h.count(\`task-\${id}-edit\`)).toBe(1);

    const text = await h.text(\`task-\${id}-text\`);
    expect(text).toContain(t);
  });

  test('input clears after adding (second click without typing should NOT add another)', async () => {
    await h.type('task-input', titleA());
    await h.click('add-button');
    await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(1);

    const listHtml = await h.html('task-list');
    expect(countRenderedLis(listHtml)).toBe(1);
  });

  test('multiple tasks have unique IDs and correct storage length', async () => {
    const a = titleA(), b = titleB(), c = titleC();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');
    await h.type('task-input', c); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    expect(stored.length).toBe(3);
    const ids = stored.map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
  });

  test('toggle completion updates DOM and localStorage', async () => {
    const a = titleA();
    await h.type('task-input', a);
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    await h.click(\`task-\${id}-checkbox\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].completed).toBe(true);

    const liHtml = await h.html(\`task-\${id}\`);
    expect(liHtml).toMatch(/\\bcompleted\\b/i);

    await h.click(\`task-\${id}-checkbox\`);
    const stored3 = parseTasks(await h.storage('tasks'));
    expect(stored3[0].completed).toBe(false);
  });

  test('deleting one task does not affect others', async () => {
    const a = titleA(), b = titleB(), c = titleC();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');
    await h.type('task-input', c); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const toDelete = stored.find((x) => x.title === b);
    expect(toDelete).toBeTruthy();

    await h.click(\`task-\${toDelete.id}-delete\`);

    const storedAfter = parseTasks(await h.storage('tasks'));
    expect(storedAfter.length).toBe(2);
    expect(storedAfter.map((x) => x.title)).toContain(a);
    expect(storedAfter.map((x) => x.title)).toContain(c);
    expect(storedAfter.map((x) => x.title)).not.toContain(b);

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(a);
    expect(listHtml).toContain(c);
    expect(listHtml).not.toContain(b);
  });

  test('edit task uses prompt() value, updates DOM and localStorage', async () => {
    const a = titleA();
    await h.type('task-input', a);
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    const e = editedTitle();
    await h.type('__prompt__', e);
    await h.click(\`task-\${id}-edit\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].title).toBe(e);

    const text = await h.text(\`task-\${id}-text\`);
    expect(text).toContain(e);
  });

  test('edit should not allow empty/whitespace titles', async () => {
    const a = titleA();
    await h.type('task-input', a);
    await h.click('add-button');

    const stored1 = parseTasks(await h.storage('tasks'));
    const id = stored1[0].id;

    await h.type('__prompt__', '   ');
    await h.click(\`task-\${id}-edit\`);

    const stored2 = parseTasks(await h.storage('tasks'));
    expect(stored2[0].title).toBe(a);
  });

  test('filters: active shows only active tasks, completed shows only completed tasks', async () => {
    const a = titleA(), b = titleB();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const idB = stored.find((x) => x.title === b).id;

    await h.click(\`task-\${idB}-checkbox\`);

    await h.click('filter-active');
    let listHtml = await h.html('task-list');
    expect(listHtml).toContain(a);
    expect(listHtml).not.toContain(b);

    await h.click('filter-completed');
    listHtml = await h.html('task-list');
    expect(listHtml).toContain(b);
    expect(listHtml).not.toContain(a);

    await h.click('filter-all');
    listHtml = await h.html('task-list');
    expect(listHtml).toContain(a);
    expect(listHtml).toContain(b);
  });

  test('filter buttons toggle "active" class correctly', async () => {
    await h.click('filter-active');
    expect(await h.html('filter-active')).toContain('class="active"');
    expect(await h.html('filter-all')).not.toContain('class="active"');

    await h.click('filter-completed');
    expect(await h.html('filter-completed')).toContain('class="active"');
    expect(await h.html('filter-active')).not.toContain('class="active"');

    await h.click('filter-all');
    expect(await h.html('filter-all')).toContain('class="active"');
    expect(await h.html('filter-completed')).not.toContain('class="active"');
  });

  test('clear completed removes only completed tasks (DOM + storage)', async () => {
    const a = titleA(), b = titleB();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');

    const stored = parseTasks(await h.storage('tasks'));
    const idB = stored.find((x) => x.title === b).id;

    await h.click(\`task-\${idB}-checkbox\`);
    await h.click('clear-completed');

    const storedAfter = parseTasks(await h.storage('tasks'));
    expect(storedAfter.length).toBe(1);
    expect(storedAfter[0].title).toBe(a);

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(a);
    expect(listHtml).not.toContain(b);
  });

  test('task count reflects active tasks', async () => {
    const a = titleA(), b = titleB(), c = titleC();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');
    await h.type('task-input', c); await h.click('add-button');

    let countText = await h.text('task-count');
    expect(countText).toMatch(/3/);

    const stored = parseTasks(await h.storage('tasks'));
    const idA = stored.find((x) => x.title === a).id;

    await h.click(\`task-\${idA}-checkbox\`);

    countText = await h.text('task-count');
    expect(countText).toMatch(/2/);
  });

  test('persistence: tasks load from localStorage on refresh', async () => {
    const a = titleA(), b = titleB();
    await h.type('task-input', a); await h.click('add-button');
    await h.type('task-input', b); await h.click('add-button');

    let stored = parseTasks(await h.storage('tasks'));
    const idA = stored.find((x) => x.title === a).id;

    await h.click(\`task-\${idA}-checkbox\`);

    await h.reset({ preserveStorage: true });

    const listHtml = await h.html('task-list');
    expect(listHtml).toContain(a);
    expect(listHtml).toContain(b);

    stored = parseTasks(await h.storage('tasks'));
    const aObj = stored.find((x) => x.title === a);
    expect(aObj.completed).toBe(true);

    const liHtml = await h.html(\`task-\${idA}\`);
    expect(liHtml).toMatch(/\\bcompleted\\b/i);
  });
});
`,
};
