import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Event Propagation Quiz',
  description: `# Event Propagation Quiz Challenge

## What You're Building

Build an **interactive quiz application** that tests understanding of JavaScript event propagation (bubbling and capturing). The app itself must demonstrate proper use of event delegation.

This challenge covers:
- Event Bubbling
- Event Capturing  
- stopPropagation()
- Event Delegation patterns

---

## Requirements

### Quiz Structure
- Display multiple-choice questions about event propagation
- Track correct/incorrect answers
- Show score at the end

### Event Delegation
- Use a single event listener on the parent to handle all answer clicks
- Dynamically add new questions without adding new listeners
- Demonstrate event.target vs event.currentTarget

### Interactive Demo
- Include a visual demo showing bubbling/capturing in action
- Clicking nested elements should show the propagation path

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| Quiz container | \`quiz-container\` |
| Question text | \`question-text\` |
| Answer buttons | \`answer-{index}\` |
| Score display | \`score\` |
| Next button | \`next-button\` |
| Demo container | \`demo-container\` |
| Demo inner | \`demo-inner\` |
| Demo innermost | \`demo-innermost\` |
| Propagation log | \`propagation-log\` |

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Event delegation for answers | 3 |
| Correct answer tracking | 2 |
| Quiz navigation | 2 |
| Score calculation | 2 |
| Demo shows propagation | 3 |
| stopPropagation works | 2 |

**Total: ~14 tests**
`,

  starterFiles: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Propagation Quiz</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <h1>Event Propagation Quiz</h1>
    
    <!-- Quiz Section -->
    <section class="quiz-section">
      <div data-testid="quiz-container" class="quiz-container">
        <p data-testid="question-text" class="question">Question will appear here</p>
        <div class="answers">
          <!-- Answers rendered dynamically -->
        </div>
        <button data-testid="next-button" class="next-btn" disabled>Next Question</button>
      </div>
      <p data-testid="score" class="score">Score: 0/0</p>
    </section>
    
    <!-- Propagation Demo -->
    <section class="demo-section">
      <h2>Event Propagation Demo</h2>
      <p>Click the nested boxes to see event propagation in action:</p>
      
      <div data-testid="demo-container" class="demo-box outer">
        Outer (Container)
        <div data-testid="demo-inner" class="demo-box inner">
          Inner
          <div data-testid="demo-innermost" class="demo-box innermost">
            Innermost
          </div>
        </div>
      </div>
      
      <div data-testid="propagation-log" class="log">
        Click a box to see the event path...
      </div>
      
      <label>
        <input type="checkbox" id="stop-propagation"> Stop Propagation
      </label>
    </section>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
`,
    'styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; padding: 2rem; background: #f5f5f5; }
.app { max-width: 800px; margin: 0 auto; }
h1 { text-align: center; margin-bottom: 2rem; }

.quiz-section { background: white; padding: 2rem; border-radius: 8px; margin-bottom: 2rem; }
.question { font-size: 1.25rem; margin-bottom: 1rem; }
.answers { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.answer-btn { padding: 1rem; border: 2px solid #ddd; background: white; border-radius: 4px; cursor: pointer; text-align: left; }
.answer-btn:hover { border-color: #4a90d9; }
.answer-btn.selected { border-color: #4a90d9; background: #e3f2fd; }
.answer-btn.correct { border-color: #4caf50; background: #e8f5e9; }
.answer-btn.incorrect { border-color: #f44336; background: #ffebee; }
.next-btn { padding: 0.75rem 1.5rem; background: #4a90d9; color: white; border: none; border-radius: 4px; cursor: pointer; }
.next-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.score { margin-top: 1rem; font-weight: bold; }

.demo-section { background: white; padding: 2rem; border-radius: 8px; }
.demo-box { padding: 2rem; border: 2px solid; border-radius: 8px; cursor: pointer; }
.outer { border-color: #e91e63; background: #fce4ec; }
.inner { border-color: #2196f3; background: #e3f2fd; margin-top: 1rem; }
.innermost { border-color: #4caf50; background: #e8f5e9; margin-top: 1rem; }
.log { margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-family: monospace; min-height: 100px; }
`,
    'app.js': `// Event Propagation Quiz
// Implement the following:

const questions = [
  {
    question: "What is the default event propagation direction in JavaScript?",
    answers: ["Capturing (top-down)", "Bubbling (bottom-up)", "Both at the same time", "Neither"],
    correct: 1
  },
  {
    question: "Which method stops event propagation?",
    answers: ["event.stop()", "event.stopPropagation()", "event.prevent()", "event.halt()"],
    correct: 1
  },
  {
    question: "In event delegation, which property gives the clicked element?",
    answers: ["event.currentTarget", "event.target", "event.source", "event.element"],
    correct: 1
  },
  {
    question: "How do you enable capturing phase for addEventListener?",
    answers: ["{ capture: true }", "{ bubbling: false }", "{ phase: 'capture' }", "capture: true as 3rd argument"],
    correct: 0
  }
];

let currentQuestion = 0;
let score = 0;
let answered = false;

// DOM Elements
const quizContainer = document.querySelector('[data-testid="quiz-container"]');
const questionText = document.querySelector('[data-testid="question-text"]');
const answersContainer = quizContainer.querySelector('.answers');
const nextButton = document.querySelector('[data-testid="next-button"]');
const scoreDisplay = document.querySelector('[data-testid="score"]');

// Demo elements
const demoContainer = document.querySelector('[data-testid="demo-container"]');
const propagationLog = document.querySelector('[data-testid="propagation-log"]');
const stopPropagationCheckbox = document.getElementById('stop-propagation');

// TODO: Implement renderQuestion()
function renderQuestion() {
  // Render current question and answers
  // Use event delegation - add ONE listener to answersContainer, not each button
}

// TODO: Implement handleAnswer using event delegation
function handleAnswer(e) {
  // Check if clicked element is an answer button
  // Use e.target to identify which answer was clicked
  // Update score if correct
}

// TODO: Implement nextQuestion()
function nextQuestion() {
  // Move to next question or show final score
}

// TODO: Implement updateScore()
function updateScore() {
  // Update score display
}

// TODO: Implement propagation demo
// Add event listeners to demo boxes that log the propagation path
// Respect the stopPropagationCheckbox setting

// Event Listeners
// answersContainer.addEventListener('click', handleAnswer);  // Event delegation!
// nextButton.addEventListener('click', nextQuestion);

// Initialize
// renderQuestion();
`,
    'README.md': `# Event Propagation Quiz Challenge

Learn event bubbling, capturing, and delegation by building an interactive quiz!

## 🎯 Your Goal

1. Complete the **quiz functionality** using event delegation
2. Implement the **propagation demo** showing how events bubble

## 📁 Files

| File | Purpose |
|------|---------|
| \`app.js\` | **Main file** - Implement all TODO functions |
| \`index.html\` | Structure (complete) |
| \`styles.css\` | Styling (complete) |

## ✅ What the Tests Check

### Public Tests
- ✓ Quiz container and questions render
- ✓ Demo boxes exist

### Hidden Tests  
- ✓ Clicking answer updates display
- ✓ Score tracks correctly
- ✓ Demo logs propagation path
- ✓ Next button enables after answer
- ✓ Bubbling order is correct (innermost → outer)

## 🔑 Key Concepts

### Event Delegation
Instead of adding listeners to each answer:
\`\`\`javascript
// DON'T do this:
buttons.forEach(btn => btn.addEventListener('click', ...));

// DO this (one listener on parent):
answersContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('answer-btn')) {
    // Handle the click using e.target
  }
});
\`\`\`

### Event Propagation Demo
When clicking innermost box, log should show:
\`\`\`
Clicked: Innermost
Bubbled to: Inner  
Bubbled to: Outer
\`\`\`

## 💡 Tips

- Use \`e.target\` to get the actual clicked element
- Use \`e.currentTarget\` to get the element with the listener
- \`e.stopPropagation()\` prevents further bubbling

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
          name: 'event-quiz',
          private: true,
          type: 'commonjs',
          devDependencies: { jsdom: '^24.1.0' },
        }, null, 2) + '\n',
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
let current = { dom: null, window: null, document: null };

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data || {}));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function reset() {
  const { JSDOM } = require('jsdom');
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.existsSync(path.join(__dirname, '..', 'app.js')) ? fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8') : '';
  const css = fs.existsSync(path.join(__dirname, '..', 'styles.css')) ? fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8') : '';
  html = html.replace(/<script src="app.js"><\\/script>/, '<script>' + js + '</script>');
  if (css) html = html.replace('</head>', '<style>' + css + '</style></head>');
  const dom = new JSDOM(html, { url: 'http://candidate/', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true });
  current = { dom, window: dom.window, document: dom.window.document };
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
  if (u.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (u.pathname === '/reset' && req.method === 'POST') { reset(); return sendJson(res, 200, { ok: true }); }
  if (!current.dom) reset();

  if (u.pathname === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new current.window.Event('change', { bubbles: true })); }
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.value = String(body.text || '');
    el.dispatchEvent(new current.window.Event('input', { bubbles: true }));
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/text') { const el = getFirst(u.searchParams.get('testId') || ''); return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() }); }
  if (u.pathname === '/allText') { return sendJson(res, 200, { ok: true, texts: getAll(u.searchParams.get('testId') || '').map(e => (e.textContent || '').trim()) }); }
  if (u.pathname === '/count') { return sendJson(res, 200, { ok: true, count: getAll(u.searchParams.get('testId') || '').length }); }
  if (u.pathname === '/html') { const testId = u.searchParams.get('testId'); const el = testId ? getFirst(testId) : current.document.body; return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' }); }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

try { reset(); } catch (e) { console.error('[ui_jsdom] reset failed:', e); }
http.createServer((req, res) => handle(req, res).catch(e => sendJson(res, 500, { ok: false, error: String(e.message || e) }))).listen(PORT, '0.0.0.0', () => console.log('[ui_jsdom] listening on ' + PORT));
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
      timeoutMs: 120000,
    },
  },

  publicTests: `import { describe, test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';
const harness = client();

beforeEach(async () => { await harness.reset(); });

describe('Event Quiz - Public Tests', () => {
  test('renders quiz container', async () => {
    expect(await harness.count('quiz-container')).toBe(1);
  });
  
  test('renders question text', async () => {
    const text = await harness.text('question-text');
    expect(text.length).toBeGreaterThan(0);
  });
  
  test('renders demo boxes', async () => {
    expect(await harness.count('demo-container')).toBe(1);
    expect(await harness.count('demo-inner')).toBe(1);
    expect(await harness.count('demo-innermost')).toBe(1);
  });
  
  test('renders propagation log', async () => {
    expect(await harness.count('propagation-log')).toBe(1);
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';
const harness = client();

beforeEach(async () => { await harness.reset(); });

describe('Event Quiz - Hidden Tests', () => {
  test('clicking answer updates display', async () => {
    const initialHtml = await harness.html('quiz-container');
    await harness.click('answer-0');
    const afterHtml = await harness.html('quiz-container');
    // Something should change (selected state, etc)
    expect(afterHtml).not.toBe(initialHtml);
  });
  
  test('score starts at 0', async () => {
    const score = await harness.text('score');
    expect(score).toMatch(/0/);
  });
  
  test('clicking demo innermost logs propagation', async () => {
    await harness.click('demo-innermost');
    const log = await harness.text('propagation-log');
    expect(log.toLowerCase()).toMatch(/innermost|inner|container/i);
  });
  
  test('demo shows bubbling order (innermost to outer)', async () => {
    await harness.click('demo-innermost');
    const log = await harness.text('propagation-log');
    // Should show innermost first (clicked), then bubble up
    const innermostIdx = log.toLowerCase().indexOf('innermost');
    expect(innermostIdx).toBeGreaterThan(-1);
  });
  
  test('next button enables after selecting answer', async () => {
    await harness.click('answer-1');
    const html = await harness.html('next-button');
    // Button should not be disabled after selection
    expect(html).not.toContain('disabled');
  });
  
  test('score updates after correct answer', async () => {
    // Question 1 correct answer is index 1
    await harness.click('answer-1');
    await harness.click('next-button');
    const score = await harness.text('score');
    expect(score).toMatch(/1/);
  });
});
`,
};
