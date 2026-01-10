// Example Playwright E2E tests for a React Todo app
// These tests run in a separate container and call the candidate app via BASE_URL

const { test, expect } = require('@playwright/test');

// BASE_URL is set by the Playwright grader to point to the candidate container
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL);
});

test.describe('Todo App - Public Tests', () => {
  test('renders the app with input and add button', async ({ page }) => {
    // Use data-testid for stable selectors
    await expect(page.getByTestId('todo-input')).toBeVisible();
    await expect(page.getByTestId('todo-add')).toBeVisible();
  });

  test('can add a todo item', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Buy groceries');
    await page.getByTestId('todo-add').click();

    // Verify the todo appears in the list
    await expect(page.getByText('Buy groceries')).toBeVisible();
  });

  test('can add multiple todos', async ({ page }) => {
    await page.getByTestId('todo-input').fill('First task');
    await page.getByTestId('todo-add').click();

    await page.getByTestId('todo-input').fill('Second task');
    await page.getByTestId('todo-add').click();

    await expect(page.getByText('First task')).toBeVisible();
    await expect(page.getByText('Second task')).toBeVisible();
  });

  test('clears input after adding', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Test item');
    await page.getByTestId('todo-add').click();

    // Input should be cleared
    await expect(page.getByTestId('todo-input')).toHaveValue('');
  });
});

// --- Hidden tests (do NOT show to candidates) ---
// These would go in hiddenTests field

test.describe('Todo App - Hidden Tests', () => {
  test('does not add empty todos', async ({ page }) => {
    // Try to add without text
    await page.getByTestId('todo-add').click();

    // Should not add any todo item
    const items = page.getByTestId('todo-item');
    await expect(items).toHaveCount(0);
  });

  test('can toggle todo completion', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Toggle me');
    await page.getByTestId('todo-add').click();

    // Click the todo to toggle
    const todoItem = page.getByText('Toggle me');
    await todoItem.click();

    // Should have completed class or be struck through
    await expect(todoItem).toHaveClass(/completed|done/);
  });

  test('can delete a todo', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Delete me');
    await page.getByTestId('todo-add').click();

    // Find and click delete button for this item
    const deleteBtn = page.getByRole('button', { name: /delete|remove/i }).first();
    await deleteBtn.click();

    // Item should be gone
    await expect(page.getByText('Delete me')).not.toBeVisible();
  });

  test('persists todos across page reload (if required)', async ({ page }) => {
    await page.getByTestId('todo-input').fill('Persistent item');
    await page.getByTestId('todo-add').click();

    // Reload and check
    await page.reload();
    await expect(page.getByText('Persistent item')).toBeVisible();
  });

  test('handles rapid additions without duplicates', async ({ page }) => {
    // Rapid fire additions
    for (let i = 1; i <= 5; i++) {
      await page.getByTestId('todo-input').fill(`Rapid ${i}`);
      await page.getByTestId('todo-add').click();
    }

    // Each should appear exactly once
    for (let i = 1; i <= 5; i++) {
      await expect(page.getByText(`Rapid ${i}`)).toHaveCount(1);
    }
  });

  test('anti-hardcoding: randomized todo title', async ({ page }) => {
    const randomTitle = `Random-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    await page.getByTestId('todo-input').fill(randomTitle);
    await page.getByTestId('todo-add').click();

    await expect(page.getByText(randomTitle)).toBeVisible();
  });
});

