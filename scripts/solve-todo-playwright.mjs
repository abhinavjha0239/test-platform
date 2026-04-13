import { chromium } from 'playwright';

const BASE_URL = 'http://20.207.203.80';
const EMAIL = `student_${Date.now()}@test.com`;
const PASSWORD = 'Student123!';
const NAME = 'Test Student';

const TODO_SOLUTION = `import React, { useState } from 'react';

function TodoList() {
    const [todos, setTodos] = useState([]);
    const [input, setInput] = useState('');
    const [filter, setFilter] = useState('all');

    const addTodo = () => {
        if (input.trim()) {
            setTodos([...todos, { text: input.trim(), completed: false }]);
            setInput('');
        }
    };

    const deleteTodo = (index) => {
        const original = getOriginalIndex(index);
        setTodos(todos.filter((_, i) => i !== original));
    };

    const toggleTodo = (index) => {
        const original = getOriginalIndex(index);
        const updated = [...todos];
        updated[original] = { ...updated[original], completed: !updated[original].completed };
        setTodos(updated);
    };

    const filteredTodos = todos.filter(todo => {
        if (filter === 'active') return !todo.completed;
        if (filter === 'completed') return todo.completed;
        return true;
    });

    const getOriginalIndex = (filteredIndex) => {
        const todo = filteredTodos[filteredIndex];
        return todos.indexOf(todo);
    };

    const remainingCount = todos.filter(t => !t.completed).length;

    return (
        <div className="todo-app">
            <input
                data-testid="todo-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
                placeholder="Add a todo..."
            />
            <button data-testid="add-btn" onClick={addTodo}>Add</button>

            <div>
                <button data-testid="filter-all" onClick={() => setFilter('all')}>All</button>
                <button data-testid="filter-active" onClick={() => setFilter('active')}>Active</button>
                <button data-testid="filter-completed" onClick={() => setFilter('completed')}>Completed</button>
            </div>

            <div data-testid="remaining-count">{remainingCount} remaining</div>

            <ul>
                {filteredTodos.map((todo, index) => (
                    <li key={todos.indexOf(todo)} data-testid={\`todo-item-\${index}\`}>
                        <input
                            type="checkbox"
                            data-testid={\`todo-checkbox-\${index}\`}
                            checked={todo.completed}
                            onChange={() => toggleTodo(index)}
                        />
                        <span
                            data-testid={\`todo-text-\${index}\`}
                            style={todo.completed ? { textDecoration: 'line-through' } : {}}
                        >
                            {todo.text}
                        </span>
                        <button
                            data-testid={\`delete-btn-\${index}\`}
                            onClick={() => deleteTodo(index)}
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default TodoList;`;

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    console.log('=== Playwright: Solve React Todo Challenge (Headed) ===\n');

    const browser = await chromium.launch({
        headless: false,
        slowMo: 300,  // slow down so user can see
        args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
    });

    const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1400, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write'],
    });

    const page = await context.newPage();

    // Auto-accept dialogs
    page.on('dialog', async dialog => {
        console.log(`  [dialog] ${dialog.type()}: "${dialog.message()}"`);
        await dialog.accept();
    });

    // Intercept screen share requests
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    try {
        // ─── Step 1: Register ───
        console.log(`[1/7] Registering: ${EMAIL}`);
        await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle', timeout: 30000 });
        await sleep(2000);

        // Fill form fields
        await page.locator('input[type="text"]').first().fill(NAME);
        await page.locator('input[type="email"]').first().fill(EMAIL);
        await page.locator('input[type="password"]').first().fill(PASSWORD);

        // Select CANDIDATE role if dropdown exists
        const roleSelect = page.locator('select');
        if (await roleSelect.count() > 0) {
            await roleSelect.first().selectOption({ label: 'Candidate' }).catch(() =>
                roleSelect.first().selectOption('CANDIDATE').catch(() => {})
            );
        }

        // Click register button
        await page.locator('button[type="submit"]').first().click();
        await page.waitForURL('**/dashboard**', { timeout: 15000 });
        console.log('  ✓ Registered → Dashboard\n');

        // ─── Step 2: Find React Todo exam ───
        console.log('[2/7] Finding React Todo exam...');
        await sleep(3000);

        // Find the exam card that contains "todo" (case-insensitive)
        // Each exam card has a "Start Exam" button
        const allCards = page.locator('[class*="card"], [class*="Card"]');
        const cardCount = await allCards.count();
        console.log(`  Found ${cardCount} exam cards`);

        let todoCardIndex = -1;
        for (let i = 0; i < cardCount; i++) {
            const text = await allCards.nth(i).innerText();
            if (text.toLowerCase().includes('todo')) {
                todoCardIndex = i;
                console.log(`  ✓ Card ${i}: "${text.split('\n')[0]}"`);
                break;
            }
        }

        if (todoCardIndex === -1) {
            // Try scrolling to find it or look at all visible text
            const bodyText = await page.locator('body').innerText();
            console.log('  Page contains "todo"?', bodyText.toLowerCase().includes('todo'));
            // Just click the first Start Exam button
            console.log('  Falling back to first exam...');
            todoCardIndex = 0;
        }

        // Click the "Start Exam" button within the todo card
        const todoCard = allCards.nth(todoCardIndex);
        const startBtn = todoCard.locator('button:has-text("Start Exam")');
        if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await startBtn.click();
        } else {
            // Maybe it's a different button text
            const anyBtn = todoCard.locator('button').last();
            await anyBtn.click();
        }

        await page.waitForURL('**/exam/**', { timeout: 15000 });
        console.log('  ✓ Navigated to exam workspace\n');

        // ─── Step 3: Handle consent screen ───
        console.log('[3/7] Handling consent screen...');
        await sleep(2000);

        // Mock screen sharing and fullscreen before clicking consent
        await page.evaluate(() => {
            // Fake screen share
            if (navigator.mediaDevices) {
                navigator.mediaDevices.getDisplayMedia = async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 1280;
                    canvas.height = 720;
                    const ctx = canvas.getContext('2d');
                    if (ctx) { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 1280, 720); }
                    return canvas.captureStream(1);
                };
            }
            // Fake fullscreen
            Element.prototype.requestFullscreen = async function() {
                Object.defineProperty(document, 'fullscreenElement', {
                    get: () => document.documentElement, configurable: true
                });
                document.dispatchEvent(new Event('fullscreenchange'));
            };
        });

        // Click "Share Screen & Start Exam"
        const consentBtn = page.locator('button:has-text("Share Screen & Start Exam")');
        if (await consentBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await consentBtn.click();
            console.log('  ✓ Consent accepted');
        } else {
            console.log('  No consent screen, proceeding...');
        }

        await sleep(3000);

        // Take screenshot to see current state
        await page.screenshot({ path: '/tmp/todo-step3.png' });

        // ─── Step 4: Open TodoList.jsx ───
        console.log('\n[4/7] Opening TodoList.jsx...');

        // The file explorer is an aside with class "explorer"
        // Files are rendered as tree nodes - look for "TodoList" text
        // First try to expand "src" folder if it exists
        const srcFolder = page.locator('text=src').first();
        if (await srcFolder.isVisible({ timeout: 2000 }).catch(() => false)) {
            await srcFolder.click();
            await sleep(500);
        }

        // Now click TodoList.jsx
        const todoFile = page.locator('span:has-text("TodoList")').first();
        if (await todoFile.isVisible({ timeout: 3000 }).catch(() => false)) {
            await todoFile.click();
            console.log('  ✓ Opened TodoList.jsx');
        } else {
            // List all visible files in explorer
            const explorerFiles = page.locator('[class*="fileTree"] span, [class*="explorer"] span');
            const fileCount = await explorerFiles.count();
            console.log(`  Files in explorer (${fileCount}):`);
            for (let i = 0; i < Math.min(fileCount, 20); i++) {
                const name = await explorerFiles.nth(i).innerText().catch(() => '');
                if (name) console.log(`    - ${name}`);
            }
            // Click first JSX file if visible
            const jsxFile = page.locator('span:has-text(".jsx"), span:has-text(".js")').first();
            if (await jsxFile.isVisible({ timeout: 2000 }).catch(() => false)) {
                await jsxFile.click();
                console.log('  ✓ Opened first JS file');
            }
        }
        await sleep(1500);

        // ─── Step 5: Write solution code ───
        console.log('\n[5/7] Writing solution to Monaco editor...');

        // Wait for Monaco editor to load
        const monacoEditor = page.locator('.monaco-editor');
        await monacoEditor.first().waitFor({ timeout: 10000 });
        await monacoEditor.first().click();
        await sleep(500);

        // Use Monaco API to set the code
        const codeSet = await page.evaluate((code) => {
            // Try Monaco global API
            if (window.monaco && window.monaco.editor) {
                const editors = window.monaco.editor.getEditors();
                if (editors.length > 0) {
                    editors[0].getModel().setValue(code);
                    return 'monaco-api';
                }
            }
            return 'failed';
        }, TODO_SOLUTION);
        console.log(`  ✓ Code written via: ${codeSet}`);

        await sleep(1000);

        // Verify
        const preview = await page.evaluate(() => {
            const editors = window.monaco?.editor?.getEditors?.();
            return editors?.[0]?.getValue()?.substring(0, 60) || 'unknown';
        });
        console.log(`  Editor preview: "${preview}..."`);

        // ─── Step 6: Wait for auto-save, then Run Tests ───
        console.log('\n[6/7] Running tests...');

        // Wait for socket to connect and auto-save
        await sleep(5000);

        // Check if connected
        const connectionStatus = await page.locator('text=Connected').isVisible({ timeout: 3000 }).catch(() => false);
        console.log(`  Socket connected: ${connectionStatus}`);

        if (!connectionStatus) {
            // Wait more for connection
            console.log('  Waiting for socket connection...');
            await sleep(5000);
        }

        // Click "Run Tests" button
        const runTestsBtn = page.locator('button:has-text("Run Tests")');
        if (await runTestsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await runTestsBtn.click();
            console.log('  ✓ Clicked "Run Tests"');
        } else {
            // Maybe it says "Connecting..."
            const connectingBtn = page.locator('button:has-text("Connecting")');
            if (await connectingBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                console.log('  Socket still connecting, waiting...');
                // Wait for it to change to "Run Tests"
                await runTestsBtn.waitFor({ state: 'visible', timeout: 30000 });
                await runTestsBtn.click();
                console.log('  ✓ Clicked "Run Tests" (after reconnect)');
            }
        }

        // Wait for test results
        console.log('  Waiting for test results...');
        let passed = false;
        for (let i = 0; i < 45; i++) {
            await sleep(2000);
            const terminalText = await page.locator('[class*="terminal"], [class*="Terminal"], [class*="output"]').first().innerText().catch(() => '');

            if (terminalText.includes('Passed') || terminalText.includes('passed') || terminalText.includes('/3') || terminalText.includes('✅')) {
                console.log(`  ✓ Test results received!`);
                // Print relevant part
                const lines = terminalText.split('\n').filter(l => l.trim());
                for (const line of lines.slice(0, 10)) {
                    console.log(`    ${line.trim()}`);
                }
                if (terminalText.includes('3/3') || terminalText.includes('3 / 3') || (terminalText.includes('Passed') && !terminalText.includes('Failed'))) {
                    passed = true;
                }
                break;
            }
            if (terminalText.includes('Error') || terminalText.includes('error') || terminalText.includes('failed')) {
                console.log('  ⚠ Test output:');
                const lines = terminalText.split('\n').filter(l => l.trim());
                for (const line of lines.slice(0, 15)) {
                    console.log(`    ${line.trim()}`);
                }
                break;
            }
            if (i % 5 === 4) console.log(`    Still waiting... (${(i + 1) * 2}s)`);
        }

        await page.screenshot({ path: '/tmp/todo-step6.png' });

        // ─── Step 7: Submit ───
        if (passed) {
            console.log('\n[7/7] All tests passed! Submitting...');
        } else {
            console.log('\n[7/7] Submitting anyway...');
        }

        const submitBtn = page.locator('button:has-text("Submit")');
        await submitBtn.waitFor({ timeout: 10000 });
        await submitBtn.click();
        console.log('  ✓ Clicked Submit');

        // Wait for confirmation dialog or auto-submit
        await sleep(2000);

        // Check for confirmation modal
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")');
        if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmBtn.click();
            console.log('  ✓ Confirmed submission');
        }

        // Wait for grading results
        console.log('  Waiting for final grading...');
        for (let i = 0; i < 60; i++) {
            await sleep(2000);
            const url = page.url();
            const bodyText = await page.locator('body').innerText();

            if (url.includes('/result') || bodyText.includes('Score') || bodyText.includes('COMPLETED')) {
                console.log('\n========================================');
                console.log('  EXAM RESULT');
                console.log('========================================');

                const scoreMatch = bodyText.match(/(\d+)\s*%/);
                const publicMatch = bodyText.match(/public.*?(\d+)\s*\/\s*(\d+)/i);
                const hiddenMatch = bodyText.match(/hidden.*?(\d+)\s*\/\s*(\d+)/i);

                if (scoreMatch) console.log(`  Score: ${scoreMatch[0]}`);
                if (publicMatch) console.log(`  Public: ${publicMatch[1]}/${publicMatch[2]}`);
                if (hiddenMatch) console.log(`  Hidden: ${hiddenMatch[1]}/${hiddenMatch[2]}`);
                break;
            }

            if (i % 10 === 9) console.log(`    Grading... (${(i + 1) * 2}s)`);
        }

        await page.screenshot({ path: '/tmp/todo-result.png', fullPage: true });
        console.log('\n  Screenshot: /tmp/todo-result.png');

        // Keep browser open for 30s so user can see
        console.log('\n  Browser stays open for 30s...');
        await sleep(30000);

    } catch (err) {
        console.error('\n  ERROR:', err.message);
        await page.screenshot({ path: '/tmp/todo-error.png', fullPage: true });
        console.log('  Screenshot: /tmp/todo-error.png');
        await sleep(10000);
    } finally {
        await browser.close();
        console.log('\n=== Done ===');
    }
}

main().catch(console.error);
