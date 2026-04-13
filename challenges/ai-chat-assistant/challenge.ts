import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'AI Chat Assistant',
  description: `# AI Chat Assistant Challenge

## What You're Building

Build an **AI-powered chat interface** with streaming responses. This simulates real-world AI assistant UIs like ChatGPT.

This challenge covers:
- Async/Await with streaming
- Message state management
- Real-time DOM updates
- Error handling and retry

---

## Requirements

### Core Features
1. **Send Messages**: Input field to type and send messages
2. **Display Messages**: Chat history with user and AI bubbles
3. **Streaming Responses**: AI response appears word by word
4. **Typing Indicator**: Show "AI is typing..." during response
5. **Message Actions**: Edit and delete messages
6. **Error Recovery**: Retry failed messages

### Message Structure
- Unique ID
- Role: 'user' or 'assistant'
- Content (text)
- Timestamp

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| Message input | \`message-input\` |
| Send button | \`send-button\` |
| Chat container | \`chat-container\` |
| Each message | \`message-{id}\` |
| Typing indicator | \`typing-indicator\` |
| Retry button | \`retry-button\` |
| Error display | \`error\` |

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Send user message | 2 |
| Display user message | 2 |
| Receive AI response | 2 |
| Streaming effect | 3 |
| Typing indicator | 2 |
| Message history | 2 |
| Delete message | 2 |
| Error handling | 2 |

**Total: ~17 tests**
`,

  starterFiles: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Chat Assistant</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <header>
      <h1>🤖 AI Assistant</h1>
    </header>
    
    <div data-testid="chat-container" class="chat-container">
      <!-- Messages rendered here -->
    </div>
    
    <div data-testid="typing-indicator" class="typing-indicator" style="display: none;">
      AI is typing<span class="dots">...</span>
    </div>
    
    <div data-testid="error" class="error" style="display: none;">
      <span>Failed to get response</span>
      <button data-testid="retry-button">Retry</button>
    </div>
    
    <div class="input-area">
      <input 
        type="text" 
        data-testid="message-input" 
        placeholder="Type your message..."
      >
      <button data-testid="send-button">Send</button>
    </div>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
`,
    'styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; min-height: 100vh; display: flex; justify-content: center; }
.app { width: 100%; max-width: 800px; display: flex; flex-direction: column; height: 100vh; }
header { padding: 1rem; background: #16213e; text-align: center; }
.chat-container { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; }
.message { max-width: 80%; padding: 1rem; border-radius: 12px; }
.message.user { align-self: flex-end; background: #0f3460; }
.message.assistant { align-self: flex-start; background: #16213e; }
.message-content { white-space: pre-wrap; }
.message-actions { margin-top: 0.5rem; opacity: 0.7; font-size: 0.8rem; }
.message-actions button { background: none; border: none; color: #888; cursor: pointer; margin-right: 0.5rem; }
.typing-indicator { padding: 0 1rem; color: #888; }
.dots { animation: blink 1s infinite; }
@keyframes blink { 50% { opacity: 0; } }
.error { background: #f44336; color: white; padding: 1rem; margin: 0 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
.error button { background: white; color: #f44336; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
.input-area { padding: 1rem; background: #16213e; display: flex; gap: 0.5rem; }
.input-area input { flex: 1; padding: 0.75rem 1rem; font-size: 1rem; border: none; border-radius: 8px; background: #0f3460; color: white; }
.input-area button { padding: 0.75rem 1.5rem; background: #e94560; color: white; border: none; border-radius: 8px; cursor: pointer; }
`,
    'app.js': `// AI Chat Assistant
// Implement the following:

const chatContainer = document.querySelector('[data-testid="chat-container"]');
const messageInput = document.querySelector('[data-testid="message-input"]');
const sendButton = document.querySelector('[data-testid="send-button"]');
const typingIndicator = document.querySelector('[data-testid="typing-indicator"]');
const errorEl = document.querySelector('[data-testid="error"]');
const retryButton = document.querySelector('[data-testid="retry-button"]');

let messages = [];
let lastUserMessage = null;

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// TODO: Add user message to chat
function addUserMessage(content) {
  // Create message object: { id, role: 'user', content, timestamp }
  // Add to messages array
  // Render message to chat
}

// TODO: Add AI message with streaming effect
async function addAIMessage(content) {
  // Create message with role: 'assistant'
  // Show typing indicator
  // Simulate streaming by adding characters one by one
  // Hide typing indicator when done
}

// TODO: Render a message to the DOM
function renderMessage(message) {
  // Create message element with correct data-testid
  // Add edit and delete buttons
}

// TODO: Simulate AI response (call mock API)
async function getAIResponse(userMessage) {
  // POST to /api/chat with { message: userMessage }
  // Return response text
}

// TODO: Send message handler
async function sendMessage() {
  // Get input value
  // Add user message
  // Get and display AI response
  // Handle errors
}

// TODO: Delete message
function deleteMessage(id) {
  // Remove from messages array and DOM
}

// TODO: Retry last failed message
function retryLastMessage() {
  // Resend lastUserMessage
}

// Event Listeners
// sendButton.addEventListener('click', sendMessage);
// messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
// retryButton.addEventListener('click', retryLastMessage);
`,
    'README.md': `# AI Chat Assistant Challenge

Build a ChatGPT-like interface with streaming responses!

## 🎯 Your Goal

Complete the implementation in \`app.js\` to create:
- Real-time chat with user/AI messages
- Typing indicator during AI response
- Message history with unique IDs
- Error handling with retry

## 📁 Files

| File | Purpose |
|------|---------|
| \`app.js\` | **Main file** - Implement all TODO functions |
| \`index.html\` | Structure (complete) |
| \`styles.css\` | Dark theme styling (complete) |

## ✅ What the Tests Check

### Public Tests
- ✓ Input and send button exist
- ✓ Chat container exists  
- ✓ Can send a message

### Hidden Tests
- ✓ User message appears in chat
- ✓ AI response appears after user message
- ✓ Typing indicator shows during response
- ✓ Messages appear in correct order
- ✓ Each message has unique ID
- ✓ Input clears after sending

## 🤖 API Endpoint

\`\`\`javascript
POST /api/chat
Body: { message: "your message" }
Response: { response: "AI reply..." }
\`\`\`

The API has a 500ms delay to simulate AI thinking.

## 💡 Implementation Flow

1. **User types message** → Add to chat with role: 'user'
2. **Show typing indicator** → Display "AI is typing..."
3. **Call /api/chat** → POST with user message
4. **Add AI response** → With role: 'assistant'
5. **Hide typing indicator** → After response complete

## 🚨 Common Issues

- **Message not appearing**: Make sure \`data-testid="message-{id}"\`
- **Input not clearing**: Set \`messageInput.value = ''\`
- **Typing not showing**: Unhide before fetch, hide after

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
          name: 'ai-chat-assistant',
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

const responses = [
  "I'd be happy to help you with that! Let me think about the best approach.",
  "That's a great question! Here's what I know about this topic.",
  "I understand what you're looking for. Let me explain step by step.",
  "Interesting! I can provide some insights on this matter.",
];

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data || {}));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function reset() {
  const { JSDOM } = require('jsdom');
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.existsSync(path.join(__dirname, '..', 'app.js')) ? fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8') : '';
  const css = fs.existsSync(path.join(__dirname, '..', 'styles.css')) ? fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8') : '';
  html = html.replace(/<script src="app.js"><\\/script>/, '<script>' + js + '</script>');
  if (css) html = html.replace('</head>', '<style>' + css + '</style></head>');
  
  const dom = new JSDOM(html, {
    url: 'http://localhost:' + PORT + '/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  
  // Mock fetch for API calls
  dom.window.fetch = async (url, options = {}) => {
    const u = new URL(url, 'http://localhost:' + PORT);
    if (u.pathname === '/api/chat' && options.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const response = responses[Math.floor(Math.random() * responses.length)] + ' You asked: "' + (body.message || '').slice(0, 50) + '"';
      return { ok: true, json: async () => ({ response }) };
    }
    throw new Error('Unknown endpoint: ' + url);
  };
  
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
  const u = new URL(req.url || '/', 'http://localhost');
  if (u.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (u.pathname === '/reset' && req.method === 'POST') { reset(); return sendJson(res, 200, { ok: true }); }
  if (!current.dom) reset();

  if (u.pathname === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
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

describe('AI Chat - Public Tests', () => {
  test('renders message input and send button', async () => {
    expect(await harness.count('message-input')).toBe(1);
    expect(await harness.count('send-button')).toBe(1);
  });
  
  test('renders chat container', async () => {
    expect(await harness.count('chat-container')).toBe(1);
  });
  
  test('can send a message', async () => {
    await harness.type('message-input', 'Hello AI!');
    await harness.click('send-button');
    
    // Wait for message to appear
    await new Promise(r => setTimeout(r, 200));
    
    const chatHtml = await harness.html('chat-container');
    expect(chatHtml).toContain('Hello AI!');
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';
const harness = client();

beforeEach(async () => { await harness.reset(); });

describe('AI Chat - Hidden Tests', () => {
  test('user message appears in chat', async () => {
    const randomMsg = 'Message_' + Date.now();
    await harness.type('message-input', randomMsg);
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 200));
    
    const chatHtml = await harness.html('chat-container');
    expect(chatHtml).toContain(randomMsg);
  });
  
  test('AI response appears after user message', async () => {
    await harness.type('message-input', 'Test question');
    await harness.click('send-button');
    
    // Wait for AI response
    await new Promise(r => setTimeout(r, 1500));
    
    const chatHtml = await harness.html('chat-container');
    // Should have both user and assistant messages
    expect(chatHtml).toContain('Test question');
    expect(chatHtml.toLowerCase()).toContain('help');
  });
  
  test('shows typing indicator during AI response', async () => {
    await harness.type('message-input', 'Quick test');
    await harness.click('send-button');
    
    // Check immediately for typing indicator
    await new Promise(r => setTimeout(r, 100));
    const typingHtml = await harness.html('typing-indicator');
    // Should be visible during response
    expect(typingHtml).not.toContain('display: none');
  });
  
  test('multiple messages appear in order', async () => {
    await harness.type('message-input', 'First');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 1200));
    
    await harness.type('message-input', 'Second');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 1200));
    
    const chatHtml = await harness.html('chat-container');
    const firstIdx = chatHtml.indexOf('First');
    const secondIdx = chatHtml.indexOf('Second');
    expect(firstIdx).toBeLessThan(secondIdx);
  });
  
  test('messages have unique IDs', async () => {
    await harness.type('message-input', 'Msg A');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 1200));
    
    await harness.type('message-input', 'Msg B');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 1200));
    
    const chatHtml = await harness.html('chat-container');
    const messageIds = chatHtml.match(/data-testid="message-[^"]+"/g) || [];
    const uniqueIds = new Set(messageIds);
    expect(uniqueIds.size).toBeGreaterThanOrEqual(2);
  });
  
  test('input clears after sending', async () => {
    await harness.type('message-input', 'Clear test');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 200));
    
    // Type new message - should not contain old text
    await harness.type('message-input', 'New');
    await harness.click('send-button');
    await new Promise(r => setTimeout(r, 200));
    
    const chatHtml = await harness.html('chat-container');
    expect(chatHtml).toContain('Clear test');
    expect(chatHtml).toContain('New');
    expect(chatHtml).not.toContain('Clear testNew');
  });
});
`,
};
