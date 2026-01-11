import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Kanban Board (React)',
  description: `# Kanban Board

## What You're Building

A **Trello-style Kanban board** with React. Create tasks, move them between columns (To Do → In Progress → Done), edit, and delete.

This is a medium-difficulty React challenge testing state management and user interactions.

---

## Requirements

### Columns
- **To Do**: New tasks start here
- **In Progress**: Tasks being worked on
- **Done**: Completed tasks

### Features
- Add new task (title required, description optional)
- Move task between columns (left/right buttons)
- Edit task title (prompt-based edit is acceptable)
- Delete task
- Show task count per column
- Persist to localStorage

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| To Do column | \`column-todo\` |
| In Progress column | \`column-inprogress\` |
| Done column | \`column-done\` |
| Add task input | \`add-task-input\` |
| Add task button | \`add-task-button\` |
| Each task card | \`task-{id}\` |
| Edit button | \`task-{id}-edit\` |
| Delete button | \`task-{id}-delete\` |
| Move left button | \`task-{id}-move-left\` |
| Move right button | \`task-{id}-move-right\` |
| Column task count | \`column-{name}-count\` |

---

## Examples

### Adding a Task
1. Type in input: "Build API"
2. Click Add
3. Task appears in "To Do" column

### Moving a Task
1. Task is in "To Do"
2. Click right arrow (→)
3. Task moves to "In Progress"

---

## Hints

1. **Task Structure**: \`{ id, title, description, column }\`
2. **Columns**: Use an enum or array: \`['todo', 'inprogress', 'done']\`
3. **localStorage**: \`JSON.stringify/parse\` on load/save
4. **Move Logic**: Find current column index, increment/decrement

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Render 3 columns | 2 |
| Add task | 2 |
| Move task right | 2 |
| Move task left | 2 |
| Delete task | 2 |
| Edit task | 2 |
| Task count per column | 1 |
| localStorage persistence | 2 |

**Total: ~15 tests**
`,

  starterFiles: {
    'src/App.jsx': `import React, { useState, useEffect } from 'react';
import './App.css';

const COLUMNS = [
  { id: 'todo', name: 'To Do' },
  { id: 'inprogress', name: 'In Progress' },
  { id: 'done', name: 'Done' },
];

function App() {
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('kanban-tasks');
    if (saved) {
      setTasks(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage when tasks change
  useEffect(() => {
    localStorage.setItem('kanban-tasks', JSON.stringify(tasks));
  }, [tasks]);

  const addTask = () => {
    if (!newTaskTitle.trim()) return;
    // TODO: Create new task with unique id, add to 'todo' column
    // setTasks([...tasks, { id: ..., title: newTaskTitle, description: '', column: 'todo' }]);
    // setNewTaskTitle('');
  };

  const moveTask = (taskId, direction) => {
    // TODO: Move task left (-1) or right (+1) in column order
    // Find task, find current column index, calculate new column
    // Don't move if already at edge
  };

  const deleteTask = (taskId) => {
    // TODO: Remove task from list
  };

  const editTask = (taskId, newTitle) => {
    // TODO: Update task title
  };

  const getTasksForColumn = (columnId) => {
    return tasks.filter(t => t.column === columnId);
  };

  return (
    <div className="kanban">
      <h1>Kanban Board</h1>
      
      {/* Add Task */}
      <div className="add-task">
        <input
          data-testid="add-task-input"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="New task title"
        />
        <button data-testid="add-task-button" onClick={addTask}>
          Add Task
        </button>
      </div>

      {/* Columns */}
      <div className="columns">
        {COLUMNS.map((column, colIndex) => (
          <div 
            key={column.id} 
            className="column"
            data-testid={\`column-\${column.id}\`}
          >
            <h2>
              {column.name}
              <span data-testid={\`column-\${column.id}-count\`}>
                ({getTasksForColumn(column.id).length})
              </span>
            </h2>
            
            <div className="tasks">
              {getTasksForColumn(column.id).map(task => (
                <div 
                  key={task.id} 
                  className="task"
                  data-testid={\`task-\${task.id}\`}
                >
                  <div className="task-content">
                    <span className="task-title">{task.title}</span>
                  </div>
                  
                  <div className="task-actions">
                    {/* TODO: Add move left button (disabled if first column) */}
                    <button
                      data-testid={\`task-\${task.id}-move-left\`}
                      onClick={() => moveTask(task.id, -1)}
                      disabled={colIndex === 0}
                    >
                      ←
                    </button>
                    
                    {/* TODO: Add move right button (disabled if last column) */}
                    <button
                      data-testid={\`task-\${task.id}-move-right\`}
                      onClick={() => moveTask(task.id, 1)}
                      disabled={colIndex === COLUMNS.length - 1}
                    >
                      →
                    </button>
                    
                    <button
                      data-testid={\`task-\${task.id}-edit\`}
                      onClick={() => {
                        const newTitle = prompt('New title:', task.title);
                        if (newTitle) editTask(task.id, newTitle);
                      }}
                    >
                      ✏️
                    </button>
                    
                    <button
                      data-testid={\`task-\${task.id}-delete\`}
                      onClick={() => deleteTask(task.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
`,
    'src/App.css': `.kanban {
  padding: 2rem;
  font-family: system-ui, sans-serif;
}

.add-task {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.add-task input {
  flex: 1;
  padding: 0.75rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
}

.add-task button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  background: #333;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.columns {
  display: flex;
  gap: 1rem;
}

.column {
  flex: 1;
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  min-height: 400px;
}

.column h2 {
  margin: 0 0 1rem;
  display: flex;
  justify-content: space-between;
}

.task {
  background: white;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.task-content {
  margin-bottom: 0.5rem;
}

.task-actions {
  display: flex;
  gap: 0.25rem;
}

.task-actions button {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.task-actions button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
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
    <title>Kanban Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
    'README.md': `# Kanban Board

Complete the TODO sections in \`src/App.jsx\`.

## Run
\`\`\`bash
npm install
npm run dev
\`\`\`
`
  },

  dependencies: {
    'react': '^18.3.1',
    'react-dom': '^18.3.1',
  },
  nodeVersion: '20',

  runner: {
    mode: 'playwright',
    runtime: 'react',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'kanban-board',
          private: true,
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build' },
          dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
          devDependencies: { vite: '^5.4.10', '@vitejs/plugin-react': '^4.3.3' },
        }, null, 2) + '\n',
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
    <title>Kanban Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`,
        'src/App.css': `.kanban {
  padding: 2rem;
  font-family: system-ui, sans-serif;
}

.add-task {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}

.add-task input {
  flex: 1;
  padding: 0.75rem;
  font-size: 1rem;
  border: 2px solid #ddd;
  border-radius: 4px;
}

.add-task button {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
  background: #333;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.columns {
  display: flex;
  gap: 1rem;
}

.column {
  flex: 1;
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 8px;
  min-height: 400px;
}

.column h2 {
  margin: 0 0 1rem;
  display: flex;
  justify-content: space-between;
}

.task {
  background: white;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.task-content {
  margin-bottom: 0.5rem;
}

.task-actions {
  display: flex;
  gap: 0.25rem;
}

.task-actions button {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.task-actions button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
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
  },

  publicTests: `const { test, expect } = require('@playwright/test');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Keep Playwright fast-failing (prevents Docker-level timeouts if the app doesn't render)
test.setTimeout(15000);

let __browserLogs = [];

test.beforeEach(async ({ page }) => {
  __browserLogs = [];
  page.on('console', (msg) => __browserLogs.push(\`[console.\${msg.type()}] \${msg.text()}\`));
  page.on('pageerror', (err) => __browserLogs.push(\`[pageerror] \${err.message}\`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Smoke check: if the app didn't mount (Vite error overlay, import error, etc.), fail quickly.
  await expect(page.getByTestId('column-todo')).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log('\\n--- Browser Console / Page Errors ---');
    console.log(__browserLogs.join('\\n') || '(no console logs captured)');

    try {
      const html = await page.content();
      console.log('\\n--- page.content() (head) ---');
      console.log(html.slice(0, 1500));
    } catch (e) {
      console.log('Could not read page.content():', e && e.message ? e.message : String(e));
    }
  }
});

async function getTaskIdByTitle(page, title) {
  const task = page.locator('[data-testid^="task-"]', { hasText: title }).first();
  const taskTestId = await task.getAttribute('data-testid');
  if (!taskTestId) throw new Error('Task element missing data-testid');
  return taskTestId.replace(/^task-/, '');
}

test('renders 3 columns', async ({ page }) => {
  await expect(page.getByTestId('column-todo')).toBeVisible();
  await expect(page.getByTestId('column-inprogress')).toBeVisible();
  await expect(page.getByTestId('column-done')).toBeVisible();
});

test('can add a task', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Test Task');
  await page.getByTestId('add-task-button').click();
  
  await expect(page.getByText('Test Task')).toBeVisible();
});

test('new task appears in To Do column', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('New Task');
  await page.getByTestId('add-task-button').click();
  
  const todoColumn = page.getByTestId('column-todo');
  await expect(todoColumn.getByText('New Task')).toBeVisible();
});

test('can move task right', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Move Me');
  await page.getByTestId('add-task-button').click();
  
  const id = await getTaskIdByTitle(page, 'Move Me');
  
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  
  const inProgressColumn = page.getByTestId('column-inprogress');
  await expect(inProgressColumn.getByText('Move Me')).toBeVisible();
});

test('can move task left (back to To Do)', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Move Back');
  await page.getByTestId('add-task-button').click();

  const id = await getTaskIdByTitle(page, 'Move Back');

  // Move right to In Progress
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  await expect(page.getByTestId('column-inprogress').getByText('Move Back')).toBeVisible();

  // Move left back to To Do
  await page.getByTestId(\`task-\${id}-move-left\`).click();
  await expect(page.getByTestId('column-todo').getByText('Move Back')).toBeVisible();
});

test('move left is disabled in first column', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Edge Left');
  await page.getByTestId('add-task-button').click();

  const id = await getTaskIdByTitle(page, 'Edge Left');
  await expect(page.getByTestId(\`task-\${id}-move-left\`)).toBeDisabled();
});

test('move right is disabled in last column', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Edge Right');
  await page.getByTestId('add-task-button').click();

  const id = await getTaskIdByTitle(page, 'Edge Right');

  // Move to Done
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  await page.getByTestId(\`task-\${id}-move-right\`).click();

  await expect(page.getByTestId('column-done').getByText('Edge Right')).toBeVisible();
  await expect(page.getByTestId(\`task-\${id}-move-right\`)).toBeDisabled();
});

test('edit updates task title (prompt-based)', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Old Title');
  await page.getByTestId('add-task-button').click();

  const id = await getTaskIdByTitle(page, 'Old Title');

  page.once('dialog', async (dialog) => {
    await dialog.accept('New Title');
  });

  await page.getByTestId(\`task-\${id}-edit\`).click();
  await expect(page.getByText('New Title')).toBeVisible();
});

test('can delete task', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Delete Me');
  await page.getByTestId('add-task-button').click();
  
  const id = await getTaskIdByTitle(page, 'Delete Me');
  
  await page.getByTestId(\`task-\${id}-delete\`).click();
  
  await expect(page.getByText('Delete Me')).toHaveCount(0);
});

test('shows task count per column', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Task 1');
  await page.getByTestId('add-task-button').click();
  
  await expect(page.getByTestId('column-todo-count')).toContainText('1');
});

test('persists tasks to localStorage', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('Persist Public');
  await page.getByTestId('add-task-button').click();

  // Wait for task to appear (ensures save to localStorage completed)
  await expect(page.getByText('Persist Public')).toBeVisible();
  
  await page.reload();

  await expect(page.getByText('Persist Public')).toBeVisible();
  await expect(page.getByTestId('column-todo-count')).toContainText('1');
});
`,

  hiddenTests: `const { test, expect } = require('@playwright/test');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Keep Playwright fast-failing (prevents Docker-level timeouts if the app doesn't render)
test.setTimeout(15000);

let __browserLogs = [];

test.beforeEach(async ({ page }) => {
  __browserLogs = [];
  page.on('console', (msg) => __browserLogs.push(\`[console.\${msg.type()}] \${msg.text()}\`));
  page.on('pageerror', (err) => __browserLogs.push(\`[pageerror] \${err.message}\`));

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Smoke check: if the app didn't mount (Vite error overlay, import error, etc.), fail quickly.
  await expect(page.getByTestId('column-todo')).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    console.log('\\n--- Browser Console / Page Errors ---');
    console.log(__browserLogs.join('\\n') || '(no console logs captured)');

    try {
      const html = await page.content();
      console.log('\\n--- page.content() (head) ---');
      console.log(html.slice(0, 1500));
    } catch (e) {
      console.log('Could not read page.content():', e && e.message ? e.message : String(e));
    }
  }
});

async function getTaskIdByTitle(page, title) {
  const task = page.locator('[data-testid^="task-"]', { hasText: title }).first();
  const taskTestId = await task.getAttribute('data-testid');
  if (!taskTestId) throw new Error('Task element missing data-testid');
  return taskTestId.replace(/^task-/, '');
}

test('can add multiple random tasks', async ({ page }) => {
  const tasks = ['Task_' + Date.now(), 'Task_' + (Date.now() + 1), 'Task_' + (Date.now() + 2)];
  
  for (const task of tasks) {
    await page.getByTestId('add-task-input').fill(task);
    await page.getByTestId('add-task-button').click();
  }
  
  for (const task of tasks) {
    await expect(page.getByText(task)).toBeVisible();
  }
});

test('move left is disabled in first column', async ({ page }) => {
  const title = 'Test_' + Date.now();
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-button').click();
  
  const id = await getTaskIdByTitle(page, title);
  
  await expect(page.getByTestId(\`task-\${id}-move-left\`)).toBeDisabled();
});

test('move right is disabled in last column', async ({ page }) => {
  const title = 'Edge_' + Date.now();
  await page.getByTestId('add-task-input').fill(title);
  await page.getByTestId('add-task-button').click();
  
  const id = await getTaskIdByTitle(page, title);
  
  // Move to Done
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  
  await expect(page.getByTestId(\`task-\${id}-move-right\`)).toBeDisabled();
});

test('can move task through all columns', async ({ page }) => {
  const taskName = 'Journey_' + Date.now();
  await page.getByTestId('add-task-input').fill(taskName);
  await page.getByTestId('add-task-button').click();
  
  const id = await getTaskIdByTitle(page, taskName);
  
  // Move right twice: Todo -> InProgress -> Done
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  await expect(page.getByTestId('column-inprogress').getByText(taskName)).toBeVisible();
  
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  await expect(page.getByTestId('column-done').getByText(taskName)).toBeVisible();
  
  // Move left: Done -> InProgress
  await page.getByTestId(\`task-\${id}-move-left\`).click();
  await expect(page.getByTestId('column-inprogress').getByText(taskName)).toBeVisible();
});

test('task count updates correctly', async ({ page }) => {
  await page.getByTestId('add-task-input').fill('A');
  await page.getByTestId('add-task-button').click();
  await page.getByTestId('add-task-input').fill('B');
  await page.getByTestId('add-task-button').click();
  
  await expect(page.getByTestId('column-todo-count')).toContainText('2');
  
  // Move one to inprogress
  const id = await getTaskIdByTitle(page, 'A');
  await page.getByTestId(\`task-\${id}-move-right\`).click();
  
  await expect(page.getByTestId('column-todo-count')).toContainText('1');
  await expect(page.getByTestId('column-inprogress-count')).toContainText('1');
});

test('persists to localStorage', async ({ page }) => {
  const taskName = 'Persist_' + Date.now();
  await page.getByTestId('add-task-input').fill(taskName);
  await page.getByTestId('add-task-button').click();
  
  // Wait for task to appear (ensures save to localStorage completed)
  await expect(page.getByText(taskName)).toBeVisible();
  
  // Reload page
  await page.reload();
  
  // Task should still be there
  await expect(page.getByText(taskName)).toBeVisible();
});

test('edit updates title (randomized)', async ({ page }) => {
  const oldTitle = 'Old_' + Date.now();
  const newTitle = 'New_' + Date.now();

  await page.getByTestId('add-task-input').fill(oldTitle);
  await page.getByTestId('add-task-button').click();

  const id = await getTaskIdByTitle(page, oldTitle);

  page.once('dialog', async (dialog) => {
    await dialog.accept(newTitle);
  });

  await page.getByTestId(\`task-\${id}-edit\`).click();
  await expect(page.getByText(newTitle)).toBeVisible();
});
`,
};

