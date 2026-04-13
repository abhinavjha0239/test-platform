// React TodoList Component Challenge
export const challenge = {
  name: 'React Todo List',
  description: `Build a complete Todo List application using React.

Requirements:
1. **Add Todo**: Input field to add new todos
   - Press Enter or click Add button to add
   - Input should clear after adding
   - Empty todos should not be added

2. **Display Todos**: List of all todos
   - Each todo shows its text
   - Each todo has a checkbox to toggle completion
   - Completed todos should have strikethrough text style

3. **Delete Todo**: Each todo should have a delete button

4. **Filter Todos**: Three filter buttons
   - "All" - show all todos
   - "Active" - show only uncompleted todos
   - "Completed" - show only completed todos

5. **Remaining Count**: Show count of remaining (active) todos

Component Structure (data-testid attributes):
- Input field: data-testid="todo-input"
- Add button: data-testid="add-btn"
- Todo item: data-testid="todo-item-{index}" (0-indexed)
- Todo checkbox: data-testid="todo-checkbox-{index}"
- Todo text: data-testid="todo-text-{index}"
- Delete button: data-testid="delete-btn-{index}"
- Filter All: data-testid="filter-all"
- Filter Active: data-testid="filter-active"
- Filter Completed: data-testid="filter-completed"
- Remaining count: data-testid="remaining-count"

Export the component as default export.`,

  starterFiles: {
    'src/TodoList.jsx': `import React, { useState } from 'react';

// TODO: Implement the TodoList component
// See requirements in the challenge description.
//
// NOTE:
// - This challenge is graded using JSDOM (virtual DOM, not a real browser).
// - Use inline styles for strikethrough (e.g., style={{ textDecoration: 'line-through' }}).
// - The app will render this component automatically.

function TodoList() {
    // Your code here...
    
    return (
        <div className="todo-app">
            {/* Implement the TodoList UI */}
        </div>
    );
}

export default TodoList;
`,
  },

  // Public Tests - Visible to candidates (JSDOM/Vitest)
  publicTests: `import { describe, test, expect, beforeEach } from 'vitest';

const BASE_URL = process.env.HARNESS_BASE_URL || 'http://localhost:3000';

function makeClient(baseUrl) {
  return {
    click: async (id) => await fetch(\`\${baseUrl}/click?testId=\${id}\`).then(r => r.json()),
    type: async (id, text) => await fetch(\`\${baseUrl}/type?testId=\${id}&text=\${encodeURIComponent(text)}\`, { method: 'POST' }).then(r => r.json()),
    keydown: async (id, key) => await fetch(\`\${baseUrl}/keydown\`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: id, key })
    }).then(r => r.json()),
    text: async (id) => (await fetch(\`\${baseUrl}/text?testId=\${id}\`).then(r => r.json())).text,
    count: async (id) => (await fetch(\`\${baseUrl}/count?testId=\${id}\`).then(r => r.json())).count,
    countPrefix: async (prefix) => (await fetch(\`\${baseUrl}/countPrefix?prefix=\${prefix}\`).then(r => r.json())).count,
    html: async (id) => (await fetch(\`\${baseUrl}/html?testId=\${id}\`).then(r => r.json())).html,
    prop: async (id, prop) => (await fetch(\`\${baseUrl}/prop?testId=\${id}&prop=\${prop}\`).then(r => r.json())).value,
    reset: async () => await fetch(\`\${baseUrl}/reset\`).then(r => r.json())
  };
}

const h = makeClient(BASE_URL);

async function addTodo(h, text) {
  await h.type('todo-input', text);
  await h.click('add-btn');
}

beforeEach(async () => {
  await h.reset();
});

test('renders input and add button', async () => {
  expect(await h.count('todo-input')).toBe(1);
  expect(await h.count('add-btn')).toBe(1);
});

test('can add a new todo', async () => {
  await addTodo(h, 'Buy groceries');
  expect(await h.text('todo-text-0')).toBe('Buy groceries');
});

test('input clears after adding todo', async () => {
  await addTodo(h, 'Test todo');
  // If input cleared, clicking add again without typing should NOT add another
  await h.click('add-btn');
  expect(await h.countPrefix('todo-item-')).toBe(1);
});
`,

  // Hidden Tests - For final evaluation (JSDOM/Vitest)
  hiddenTests: `import { describe, test, expect, beforeEach } from 'vitest';

const BASE_URL = process.env.HARNESS_BASE_URL || 'http://localhost:3000';

function makeClient(baseUrl) {
  return {
    click: async (id) => await fetch(\`\${baseUrl}/click?testId=\${id}\`).then(r => r.json()),
    type: async (id, text) => await fetch(\`\${baseUrl}/type?testId=\${id}&text=\${encodeURIComponent(text)}\`, { method: 'POST' }).then(r => r.json()),
    keydown: async (id, key) => await fetch(\`\${baseUrl}/keydown\`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId: id, key })
    }).then(r => r.json()),
    text: async (id) => (await fetch(\`\${baseUrl}/text?testId=\${id}\`).then(r => r.json())).text,
    count: async (id) => (await fetch(\`\${baseUrl}/count?testId=\${id}\`).then(r => r.json())).count,
    countPrefix: async (prefix) => (await fetch(\`\${baseUrl}/countPrefix?prefix=\${prefix}\`).then(r => r.json())).count,
    html: async (id) => (await fetch(\`\${baseUrl}/html?testId=\${id}\`).then(r => r.json())).html,
    prop: async (id, prop) => (await fetch(\`\${baseUrl}/prop?testId=\${id}&prop=\${prop}\`).then(r => r.json())).value,
    reset: async () => await fetch(\`\${baseUrl}/reset\`).then(r => r.json())
  };
}

const h = makeClient(BASE_URL);

async function addTodo(h, text, { viaEnter = false } = {}) {
  await h.type('todo-input', text);
  if (viaEnter) {
    await h.keydown('todo-input', 'Enter');
  } else {
    await h.click('add-btn');
  }
}

beforeEach(async () => {
  await h.reset();
});

test('can add todo by pressing Enter', async () => {
  await addTodo(h, 'Enter todo', { viaEnter: true });
  expect(await h.text('todo-text-0')).toBe('Enter todo');
});

test('does not add empty todo', async () => {
  await h.click('add-btn');
  expect(await h.countPrefix('todo-item-')).toBe(0);
});

test('does not add whitespace-only todo', async () => {
  await addTodo(h, '   ');
  expect(await h.countPrefix('todo-item-')).toBe(0);
});

test('can add multiple todos', async () => {
  await addTodo(h, 'First');
  await addTodo(h, 'Second');
  await addTodo(h, 'Third');
  expect(await h.text('todo-text-0')).toBe('First');
  expect(await h.text('todo-text-1')).toBe('Second');
  expect(await h.text('todo-text-2')).toBe('Third');
});

test('can delete a todo', async () => {
  await addTodo(h, 'Delete me');
  expect(await h.text('todo-text-0')).toBe('Delete me');
  await h.click('delete-btn-0');
  expect(await h.count('todo-item-0')).toBe(0);
});

test('deleting middle todo shifts indices', async () => {
  await addTodo(h, 'First');
  await addTodo(h, 'Second');
  await addTodo(h, 'Third');
  await h.click('delete-btn-1');
  expect(await h.text('todo-text-0')).toBe('First');
  expect(await h.text('todo-text-1')).toBe('Third');
  expect(await h.count('todo-text-2')).toBe(0);
});

test('completed todo has strikethrough style', async () => {
  await addTodo(h, 'Style test');
  
  // Checking a checkbox in JSDOM via click events can be finicky.
  // Instead of a direct h.click('todo-checkbox-0'), let's assume click works
  // or use keydown Space if needed. A click is standard.
  await h.click('todo-checkbox-0');
  
  const childHtml = await h.html('todo-text-0');
  expect(childHtml.toLowerCase()).toContain('line-through');
});

test('can untoggle completed todo', async () => {
  await addTodo(h, 'Toggle test');
  await h.click('todo-checkbox-0');
  expect(await h.prop('todo-checkbox-0', 'checked')).toBe(true);
  
  await h.click('todo-checkbox-0');
  expect(await h.prop('todo-checkbox-0', 'checked')).toBe(false);
});

test('renders all filter buttons', async () => {
  expect(await h.count('filter-all')).toBe(1);
  expect(await h.count('filter-active')).toBe(1);
  expect(await h.count('filter-completed')).toBe(1);
});

test('filter Active shows only uncompleted todos', async () => {
  await addTodo(h, 'Active todo');
  await addTodo(h, 'Completed todo');
  await h.click('todo-checkbox-1');
  
  await h.click('filter-active');
  expect(await h.countPrefix('todo-item-')).toBe(1);
  expect(await h.text('todo-text-0')).toBe('Active todo');
});

test('filter Completed shows only completed todos', async () => {
  await addTodo(h, 'Active todo');
  await addTodo(h, 'Completed todo');
  await h.click('todo-checkbox-1');
  
  await h.click('filter-completed');
  expect(await h.countPrefix('todo-item-')).toBe(1);
  expect(await h.text('todo-text-0')).toBe('Completed todo');
});

test('filter All shows all todos', async () => {
  await addTodo(h, 'First');
  await addTodo(h, 'Second');
  await h.click('todo-checkbox-0');
  await h.click('filter-completed');
  await h.click('filter-all');
  
  expect(await h.countPrefix('todo-item-')).toBe(2);
});

test('remaining count updates when todo is completed and deleted', async () => {
  await addTodo(h, 'Todo 1');
  await addTodo(h, 'Todo 2');
  expect(await h.text('remaining-count')).toContain('2');
  
  await h.click('todo-checkbox-0');
  expect(await h.text('remaining-count')).toContain('1');
  
  await h.click('delete-btn-1');
  expect(await h.text('remaining-count')).toContain('0');
});
`,

  // React-specific dependencies
  dependencies: {
    'react': '^18.2.0',
    'react-dom': '^18.2.0',
  },

  nodeVersion: '20',

  runner: {
    mode: 'ui_jsdom',
    runtime: 'react',
    candidate: {
      image: 'exam-react-candidate:latest',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify(
          {
            name: 'react-todo-list',
            private: true,
            type: 'commonjs',
            dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
            devDependencies: { jsdom: '^24.1.0', esbuild: '^0.20.0' }
          },
          null,
          2
        ) + '\n',
        'src/index.jsx': `import React from 'react';\nimport ReactDOM from 'react-dom';\nimport TodoList from './TodoList';\n\nReactDOM.render(React.createElement(TodoList), document.getElementById('root'));\n`,
        '.grader/ui-harness.cjs': `// HTTP Harness for JSDOM React grading
const http = require('http');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const esbuild = require('esbuild');

const BUILD_OUTPUT = path.join(__dirname, 'bundle.js');
const ENTRY_POINT = path.join(__dirname, '../src/index.jsx');

let current = { dom: null, window: null, document: null };

async function buildBundle() {
  if (fs.existsSync(BUILD_OUTPUT)) return;
  await esbuild.build({
    entryPoints: [ENTRY_POINT],
    bundle: true,
    outfile: BUILD_OUTPUT,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
  });
}

function resetDOM() {
  if (!fs.existsSync(BUILD_OUTPUT)) throw new Error("Bundle not found");
  const scriptContent = fs.readFileSync(BUILD_OUTPUT, 'utf8');
  
  // Basic DOM setup with a root element
  current.dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
    pretendToBeVisual: true
  });
  
  current.window = current.dom.window;
  current.document = current.window.document;
  
  // Inject React bundle
  const scriptEl = current.document.createElement('script');
  scriptEl.textContent = scriptContent;
  current.document.body.appendChild(scriptEl);
}

const settle = () => new Promise(r => setTimeout(r, 10));

function getElements(testId) {
  return current.document.querySelectorAll(\`[data-testid="\${testId}"]\`);
}

function getFirst(testId) {
  const el = current.document.querySelector(\`[data-testid="\${testId}"]\`);
  if (!el) throw new Error(\`Element "\${testId}" not found\`);
  return el;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;

  const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const readJson = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(JSON.parse(body || '{}')));
  });

  try {
    if (pathname === '/health') return sendJson(res, 200, { ok: true });
    
    if (pathname === '/reset') {
      await buildBundle();
      resetDOM();
      return sendJson(res, 200, { ok: true });
    }
    
    // Ensure DOM is ready for other endpoints
    if (!current.document) {
      await buildBundle();
      resetDOM();
    }
    
    if (pathname === '/click' && req.method === 'GET') {
      const el = getFirst(u.searchParams.get('testId'));
      if (el.type === 'checkbox') el.checked = !el.checked;
      el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
      if (el.type === 'checkbox') el.dispatchEvent(new current.window.Event('change', { bubbles: true }));
      await settle();
      return sendJson(res, 200, { ok: true });
    }
    
    if (pathname === '/type' && req.method === 'POST') {
      const el = getFirst(u.searchParams.get('testId'));
      const text = u.searchParams.get('text') || '';
      
      const nativeSetter = Object.getOwnPropertyDescriptor(
        current.window.HTMLInputElement.prototype, 'value'
      );
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(el, text);
      } else {
        el.value = text;
      }
      
      const evt = new current.window.Event('change', { bubbles: true });
      el.dispatchEvent(evt);
      
      // Also dispatch input just in case
      const inputEvt = new current.window.Event('input', { bubbles: true });
      el.dispatchEvent(inputEvt);
      
      await settle();
      return sendJson(res, 200, { ok: true });
    }
    
    if (pathname === '/keydown' && req.method === 'POST') {
      const body = await readJson(req);
      const el = getFirst(body.testId);
      
      const keyEvent = new current.window.KeyboardEvent('keydown', {
        key: body.key || 'Enter',
        code: body.key === 'Enter' ? 'Enter' : body.key,
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(keyEvent);
      
      const keyupEvent = new current.window.KeyboardEvent('keyup', {
        key: body.key || 'Enter',
        bubbles: true
      });
      el.dispatchEvent(keyupEvent);
      
      await settle();
      return sendJson(res, 200, { ok: true });
    }
    
    if (pathname === '/text' && req.method === 'GET') {
      const el = getFirst(u.searchParams.get('testId'));
      return sendJson(res, 200, { ok: true, text: el.textContent });
    }
    
    if (pathname === '/count' && req.method === 'GET') {
      const count = getElements(u.searchParams.get('testId')).length;
      return sendJson(res, 200, { ok: true, count });
    }
    
    if (pathname === '/countPrefix' && req.method === 'GET') {
      const prefix = u.searchParams.get('prefix') || '';
      const count = current.document.querySelectorAll(\`[data-testid^="\${prefix}"]\`).length;
      return sendJson(res, 200, { ok: true, count });
    }
    
    if (pathname === '/html' && req.method === 'GET') {
      const el = getFirst(u.searchParams.get('testId'));
      return sendJson(res, 200, { ok: true, html: el.outerHTML });
    }
    
    if (pathname === '/prop' && req.method === 'GET') {
      const el = getFirst(u.searchParams.get('testId'));
      const prop = u.searchParams.get('prop') || '';
      return sendJson(res, 200, { ok: true, value: el[prop] });
    }
    
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(\`JSDOM Harness running on port \${port}\`));
`
      },
      installCommand: 'test -d /app-deps/node_modules && ln -sf /app-deps/node_modules ./node_modules || npm install --legacy-peer-deps 2>&1',
      runCommand: 'node .grader/ui-harness.cjs',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'vitest',
      image: 'exam-react-test:latest',
      installCommand: 'test -d /app-deps/node_modules && ln -sf /app-deps/node_modules ./node_modules || npm install 2>&1',
      testCommand: 'npx vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=verbose --reporter=junit --outputFile=results.xml **/*.spec.js 2>&1',
      timeoutMs: 120000,
    },
  },
};


