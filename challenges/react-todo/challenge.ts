// React TodoList Component Challenge
export const todoListChallenge = {
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
// - This challenge is graded as a running web app (Playwright).
// - The app will render this component at "/" automatically.

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

    // Public Tests - Visible to candidates (Playwright)
    publicTests: `const { test, expect } = require('@playwright/test');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.setTimeout(15000);

async function addTodo(page, text) {
  await page.getByTestId('todo-input').fill(text);
  await page.getByTestId('add-btn').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  // Smoke check: app mounted
  await expect(page.getByTestId('todo-input')).toBeVisible();
});

test('renders input and add button', async ({ page }) => {
  await expect(page.getByTestId('todo-input')).toBeVisible();
  await expect(page.getByTestId('add-btn')).toBeVisible();
});

test('can add a new todo', async ({ page }) => {
  await addTodo(page, 'Buy groceries');
  await expect(page.getByTestId('todo-text-0')).toHaveText('Buy groceries');
});

test('input clears after adding todo', async ({ page }) => {
  await page.getByTestId('todo-input').fill('Test todo');
  await page.getByTestId('add-btn').click();
  await expect(page.getByTestId('todo-input')).toHaveValue('');
});
`,

    // Hidden Tests - For final evaluation (Playwright)
    hiddenTests: `const { test, expect } = require('@playwright/test');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.setTimeout(20000);

async function addTodo(page, text, { viaEnter = false } = {}) {
  const input = page.getByTestId('todo-input');
  await input.fill(text);
  if (viaEnter) {
    await input.press('Enter');
  } else {
    await page.getByTestId('add-btn').click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('todo-input')).toBeVisible();
});

test('can add todo by pressing Enter', async ({ page }) => {
  await addTodo(page, 'Enter todo', { viaEnter: true });
  await expect(page.getByTestId('todo-text-0')).toHaveText('Enter todo');
});

test('does not add empty todo', async ({ page }) => {
  await page.getByTestId('add-btn').click();
  await expect(page.locator('[data-testid^="todo-item-"]')).toHaveCount(0);
});

test('does not add whitespace-only todo', async ({ page }) => {
  await addTodo(page, '   ');
  await expect(page.locator('[data-testid^="todo-item-"]')).toHaveCount(0);
});

test('can add multiple todos', async ({ page }) => {
  await addTodo(page, 'First');
  await addTodo(page, 'Second');
  await addTodo(page, 'Third');
  await expect(page.getByTestId('todo-text-0')).toHaveText('First');
  await expect(page.getByTestId('todo-text-1')).toHaveText('Second');
  await expect(page.getByTestId('todo-text-2')).toHaveText('Third');
});

test('can delete a todo', async ({ page }) => {
  await addTodo(page, 'Delete me');
  await expect(page.getByTestId('todo-text-0')).toHaveText('Delete me');
  await page.getByTestId('delete-btn-0').click();
  await expect(page.locator('[data-testid="todo-item-0"]')).toHaveCount(0);
});

test('deleting middle todo shifts indices', async ({ page }) => {
  await addTodo(page, 'First');
  await addTodo(page, 'Second');
  await addTodo(page, 'Third');
  await page.getByTestId('delete-btn-1').click();
  await expect(page.getByTestId('todo-text-0')).toHaveText('First');
  await expect(page.getByTestId('todo-text-1')).toHaveText('Third');
  await expect(page.locator('[data-testid="todo-text-2"]')).toHaveCount(0);
});

test('completed todo has strikethrough style', async ({ page }) => {
  await addTodo(page, 'Style test');
  await page.getByTestId('todo-checkbox-0').check();
  await expect(page.getByTestId('todo-text-0')).toHaveCSS('text-decoration-line', 'line-through');
});

test('can untoggle completed todo', async ({ page }) => {
  await addTodo(page, 'Toggle test');
  const cb = page.getByTestId('todo-checkbox-0');
  await cb.check();
  await expect(cb).toBeChecked();
  await cb.uncheck();
  await expect(cb).not.toBeChecked();
});

test('renders all filter buttons', async ({ page }) => {
  await expect(page.getByTestId('filter-all')).toBeVisible();
  await expect(page.getByTestId('filter-active')).toBeVisible();
  await expect(page.getByTestId('filter-completed')).toBeVisible();
});

test('filter Active shows only uncompleted todos', async ({ page }) => {
  await addTodo(page, 'Active todo');
  await addTodo(page, 'Completed todo');
  await page.getByTestId('todo-checkbox-1').check();
  await page.getByTestId('filter-active').click();
  await expect(page.locator('[data-testid^="todo-item-"]')).toHaveCount(1);
  await expect(page.getByTestId('todo-text-0')).toHaveText('Active todo');
});

test('filter Completed shows only completed todos', async ({ page }) => {
  await addTodo(page, 'Active todo');
  await addTodo(page, 'Completed todo');
  await page.getByTestId('todo-checkbox-1').check();
  await page.getByTestId('filter-completed').click();
  await expect(page.locator('[data-testid^="todo-item-"]')).toHaveCount(1);
  await expect(page.getByTestId('todo-text-0')).toHaveText('Completed todo');
});

test('filter All shows all todos', async ({ page }) => {
  await addTodo(page, 'First');
  await addTodo(page, 'Second');
  await page.getByTestId('todo-checkbox-0').check();
  await page.getByTestId('filter-completed').click();
  await page.getByTestId('filter-all').click();
  await expect(page.locator('[data-testid^="todo-item-"]')).toHaveCount(2);
});

test('remaining count updates when todo is completed and deleted', async ({ page }) => {
  await addTodo(page, 'Todo 1');
  await addTodo(page, 'Todo 2');
  const remaining = page.getByTestId('remaining-count');
  await expect(remaining).toContainText('2');
  await page.getByTestId('todo-checkbox-0').check();
  await expect(remaining).toContainText('1');
  await page.getByTestId('delete-btn-1').click();
  await expect(remaining).toContainText('0');
});
`,

    // React-specific dependencies
    dependencies: {
        'react': '^18.2.0',
        'react-dom': '^18.2.0',
    },

    nodeVersion: '20',

    // Use Playwright runner so this challenge does NOT go through legacy docker-grader.ts
    // (prevents per-job npm install + enables pooled candidate container + true hidden-test secrecy).
    runner: {
        mode: 'playwright',
        runtime: 'react',
        candidate: {
            image: 'node:20-alpine',
            workdir: '/app',
            generatedFiles: {
                'package.json': JSON.stringify(
                    {
                        name: 'react-todo-list',
                        private: true,
                        type: 'module',
                        scripts: { dev: 'vite', build: 'vite build' },
                        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
                        devDependencies: { vite: '^5.4.10', '@vitejs/plugin-react': '^4.3.3' },
                    },
                    null,
                    2
                ) + '\n',
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
import TodoList from './TodoList';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TodoList />
  </React.StrictMode>
);
`,
                'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React Todo List</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
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
            // Avoid network if @playwright/test is already available in the Playwright image
            installCommand: 'node -e "require(\\\"@playwright/test\\\")" 2>/dev/null || npm install 2>&1',
            testCommand: 'PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1',
            timeoutMs: 180000,
        },
    },
};


