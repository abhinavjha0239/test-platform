import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Rate Limiter Service (Flask)',
  description: `# Rate Limiter Service

## What You're Building

You're building a **rate limiting service** using Flask. This is used to protect APIs from abuse by limiting how many requests a client can make in a time window.

This is a more advanced Flask challenge testing time-based logic and sliding windows.

---

## API Contract

#### \`POST /limits\`
Create a rate limit rule.

**Request:**
\`\`\`json
{
  "key": "api_key_123",
  "maxRequests": 100,
  "windowSecs": 60
}
\`\`\`

**Success (201):**
\`\`\`json
{
  "id": "limit_1",
  "key": "api_key_123",
  "maxRequests": 100,
  "windowSecs": 60,
  "createdAt": "..."
}
\`\`\`

---

#### \`POST /check\`
Check if a request is allowed (without consuming).

**Request:**
\`\`\`json
{ "key": "api_key_123" }
\`\`\`

**Success (200):**
\`\`\`json
{
  "allowed": true,
  "remaining": 95,
  "resetAt": "2024-01-15T10:01:00.000Z"
}
\`\`\`

---

#### \`POST /consume\`
Consume one request from the limit.

**Request:**
\`\`\`json
{ "key": "api_key_123" }
\`\`\`

**Success (200):** Same as /check but decrements remaining
**Error (429):** \`{ "error": "rate limit exceeded", "remaining": 0, "resetAt": "..." }\`

---

#### \`GET /stats/{key}\`
Get current usage stats.

**Success (200):**
\`\`\`json
{
  "key": "api_key_123",
  "used": 5,
  "max": 100,
  "remaining": 95,
  "resetAt": "..."
}
\`\`\`

**Error:** \`404\` - key not found

---

#### \`DELETE /limits/{key}\`
Remove a limit rule.

**Success:** \`204\`
**Error:** \`404\`

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

---

## Hints

1. **Sliding Window**: Track when the window started and reset when it expires
2. **Time Logic**: Use \`datetime.now()\` and \`timedelta\`
3. **Reset**: When window expires, reset usage count and update resetAt

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Create limit | 2 |
| Check request | 2 |
| Consume request | 2 |
| Enforce limit (429) | 2 |
| Stats endpoint | 2 |
| Delete limit | 1 |
| Window reset | 2 |

**Total: ~13 tests**
`,

  starterFiles: {
    'app.py': `import os
from datetime import datetime, timedelta
from flask import Flask, request, jsonify

app = Flask(__name__)

# Storage
limits = {}  # key -> {maxRequests, windowSecs, used, windowStart}
limit_counter = 0

@app.get('/health')
def health():
    return jsonify({'ok': True})

@app.route('/limits', methods=['POST'])
def create_limit():
    # TODO: Create rate limit rule
    return jsonify({'error': 'not implemented'}), 501

@app.route('/check', methods=['POST'])
def check_request():
    # TODO: Check if request would be allowed
    # TODO: Reset window if expired
    return jsonify({'error': 'not implemented'}), 501

@app.route('/consume', methods=['POST'])
def consume_request():
    # TODO: Consume one request
    # TODO: Return 429 if limit exceeded
    return jsonify({'error': 'not implemented'}), 501

@app.route('/stats/<key>', methods=['GET'])
def get_stats(key):
    # TODO: Return current usage stats
    return jsonify({'error': 'not implemented'}), 501

@app.route('/limits/<key>', methods=['DELETE'])
def delete_limit(key):
    # TODO: Delete limit rule
    return jsonify({'error': 'not implemented'}), 501

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
`,
    'README.md': `# Rate Limiter Service

Implement the rate limiting logic in \`app.py\`.
`
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'http',
    runtime: 'python',
    candidate: {
      image: 'python:3.11-slim',
      workdir: '/app',
      generatedFiles: { 'requirements.txt': 'flask==3.0.3\n' },
      installCommand: 'pip install -r requirements.txt',
      runCommand: 'python app.py',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'jest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npm test 2>&1 || true',
      timeoutMs: 120000,
    },
  },

  publicTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

describe('Rate Limiter - Public Tests', () => {
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /limits creates a limit', async () => {
    const res = await request(BASE_URL)
      .post('/limits')
      .send({ key: 'test_key', maxRequests: 10, windowSecs: 60 });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('test_key');
    expect(res.body.maxRequests).toBe(10);
  });

  test('POST /check returns allowed status', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'check_key', maxRequests: 10, windowSecs: 60 });
    
    const res = await request(BASE_URL)
      .post('/check')
      .send({ key: 'check_key' });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.remaining).toBe(10);
  });

  test('POST /check does not consume requests', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'nocon_public', maxRequests: 5, windowSecs: 60 });

    await request(BASE_URL).post('/check').send({ key: 'nocon_public' });
    await request(BASE_URL).post('/check').send({ key: 'nocon_public' });

    const stats = await request(BASE_URL).get('/stats/nocon_public');
    expect(stats.status).toBe(200);
    expect(stats.body.used).toBe(0);
    expect(stats.body.remaining).toBe(5);
  });

  test('POST /consume decrements remaining', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'consume_key', maxRequests: 5, windowSecs: 60 });
    
    const res = await request(BASE_URL)
      .post('/consume')
      .send({ key: 'consume_key' });
    expect(res.status).toBe(200);
    expect(res.body.remaining).toBe(4);
  });

  test('POST /consume returns 429 when limit exceeded', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'exceed_key', maxRequests: 2, windowSecs: 60 });
    
    await request(BASE_URL).post('/consume').send({ key: 'exceed_key' });
    await request(BASE_URL).post('/consume').send({ key: 'exceed_key' });
    
    const res = await request(BASE_URL)
      .post('/consume')
      .send({ key: 'exceed_key' });
    expect(res.status).toBe(429);
  });

  test('Window resets after windowSecs (time-based)', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'reset_key', maxRequests: 1, windowSecs: 1 });

    const first = await request(BASE_URL).post('/consume').send({ key: 'reset_key' });
    expect(first.status).toBe(200);
    expect(first.body.resetAt).toBeDefined();

    const second = await request(BASE_URL).post('/consume').send({ key: 'reset_key' });
    expect(second.status).toBe(429);

    const resetAtMs = new Date(first.body.resetAt).getTime();
    expect(Number.isFinite(resetAtMs)).toBe(true);
    const waitMs = resetAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    const third = await request(BASE_URL).post('/consume').send({ key: 'reset_key' });
    expect(third.status).toBe(200);
  });

  test('GET /stats returns usage', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'stats_key', maxRequests: 10, windowSecs: 60 });
    await request(BASE_URL).post('/consume').send({ key: 'stats_key' });
    
    const res = await request(BASE_URL).get('/stats/stats_key');
    expect(res.status).toBe(200);
    expect(res.body.used).toBe(1);
    expect(res.body.remaining).toBe(9);
  });

  test('DELETE /limits removes limit', async () => {
    await request(BASE_URL)
      .post('/limits')
      .send({ key: 'del_key', maxRequests: 10, windowSecs: 60 });
    const res = await request(BASE_URL).delete('/limits/del_key');
    expect(res.status).toBe(204);
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Rate Limiter - Hidden Tests', () => {
  test('Works with random keys', async () => {
    const key = 'key_' + randomString();
    await request(BASE_URL)
      .post('/limits')
      .send({ key, maxRequests: 5, windowSecs: 60 });
    
    const check = await request(BASE_URL).post('/check').send({ key });
    expect(check.body.allowed).toBe(true);
  });

  test('Consume tracks correctly with random usage', async () => {
    const key = 'consume_' + randomString();
    const max = 10;
    await request(BASE_URL)
      .post('/limits')
      .send({ key, maxRequests: max, windowSecs: 60 });
    
    const useCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < useCount; i++) {
      await request(BASE_URL).post('/consume').send({ key });
    }
    
    const stats = await request(BASE_URL).get('/stats/' + key);
    expect(stats.body.used).toBe(useCount);
    expect(stats.body.remaining).toBe(max - useCount);
  });

  test('429 enforced at exact limit', async () => {
    const key = 'exact_' + randomString();
    await request(BASE_URL)
      .post('/limits')
      .send({ key, maxRequests: 3, windowSecs: 60 });
    
    await request(BASE_URL).post('/consume').send({ key });
    await request(BASE_URL).post('/consume').send({ key });
    await request(BASE_URL).post('/consume').send({ key });
    
    const res = await request(BASE_URL).post('/consume').send({ key });
    expect(res.status).toBe(429);
  });

  test('Stats returns 404 for unknown key', async () => {
    const valid = 'valid_' + randomString();
    await request(BASE_URL).post('/limits').send({ key: valid, maxRequests: 10, windowSecs: 60 });
    expect((await request(BASE_URL).get('/stats/' + valid)).status).toBe(200);
    
    const res = await request(BASE_URL).get('/stats/unknown_' + randomString());
    expect(res.status).toBe(404);
  });

  test('Delete returns 404 for unknown key', async () => {
    const valid = 'del_valid_' + randomString();
    await request(BASE_URL).post('/limits').send({ key: valid, maxRequests: 10, windowSecs: 60 });
    expect((await request(BASE_URL).delete('/limits/' + valid)).status).toBe(204);
    
    const res = await request(BASE_URL).delete('/limits/unknown_' + randomString());
    expect(res.status).toBe(404);
  });

  test('Check does not consume', async () => {
    const key = 'nocon_' + randomString();
    await request(BASE_URL).post('/limits').send({ key, maxRequests: 5, windowSecs: 60 });
    
    await request(BASE_URL).post('/check').send({ key });
    await request(BASE_URL).post('/check').send({ key });
    
    const stats = await request(BASE_URL).get('/stats/' + key);
    expect(stats.body.used).toBe(0);
  });

  test('Window resets after windowSecs (randomized key)', async () => {
    const key = 'reset_' + randomString();
    await request(BASE_URL).post('/limits').send({ key, maxRequests: 1, windowSecs: 1 });

    const first = await request(BASE_URL).post('/consume').send({ key });
    expect(first.status).toBe(200);
    expect(first.body.resetAt).toBeDefined();

    const second = await request(BASE_URL).post('/consume').send({ key });
    expect(second.status).toBe(429);

    const resetAtMs = new Date(first.body.resetAt).getTime();
    expect(Number.isFinite(resetAtMs)).toBe(true);
    const waitMs = resetAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    expect((await request(BASE_URL).post('/consume').send({ key })).status).toBe(200);
  });
});
`,
};

