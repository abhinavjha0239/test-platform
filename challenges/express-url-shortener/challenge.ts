import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'URL Shortener API',
  description: `# URL Shortener API

## What You're Building

You're building a **URL shortening service** like bit.ly or tinyurl. Users can submit long URLs and receive short codes that redirect to the original URL. The service also tracks how many times each short URL has been visited.

This is a common real-world service used by marketers, social media platforms, and anyone who needs to share clean, trackable links.

---

## API Contract

### Base URL
Your server runs on \`http://localhost:3000\` (or the PORT environment variable).

### Endpoints

---

#### \`POST /shorten\`
Create a shortened URL.

**Request Body:**
\`\`\`json
{
  "url": "https://example.com/very/long/path/to/resource"
}
\`\`\`

**Success Response (201 Created):**
\`\`\`json
{
  "shortCode": "abc123",
  "originalUrl": "https://example.com/very/long/path/to/resource",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

**Error Responses:**
- \`400 Bad Request\` - Missing URL field
  \`\`\`json
  { "error": "url is required" }
  \`\`\`
- \`400 Bad Request\` - Invalid URL format (must be a valid http:// or https:// URL)
  \`\`\`json
  { "error": "invalid url format" }
  \`\`\`

---

#### \`GET /:code\`
Redirect to the original URL.

**Success Response (302 Found):**
- Redirects to the original URL
- Increments the click counter

**Error Response:**
- \`404 Not Found\` - Short code doesn't exist
  \`\`\`json
  { "error": "short code not found" }
  \`\`\`

---

#### \`GET /stats/:code\`
Get statistics for a short URL.

**Success Response (200 OK):**
\`\`\`json
{
  "shortCode": "abc123",
  "originalUrl": "https://example.com/very/long/path/to/resource",
  "clicks": 42,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

**Error Response:**
- \`404 Not Found\` - Short code doesn't exist
  \`\`\`json
  { "error": "short code not found" }
  \`\`\`

---

#### \`GET /health\`
Health check endpoint.

**Success Response (200 OK):**
\`\`\`json
{ "ok": true }
\`\`\`

---

## Examples

### Example 1: Shorten a URL
\`\`\`bash
curl -X POST http://localhost:3000/shorten \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://github.com/features/actions"}'
\`\`\`

Response:
\`\`\`json
{
  "shortCode": "x7k2m",
  "originalUrl": "https://github.com/features/actions",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

### Example 2: Visit the short URL
\`\`\`bash
curl -I http://localhost:3000/x7k2m
\`\`\`

Response:
\`\`\`
HTTP/1.1 302 Found
Location: https://github.com/features/actions
\`\`\`

### Example 3: Check stats
\`\`\`bash
curl http://localhost:3000/stats/x7k2m
\`\`\`

Response:
\`\`\`json
{
  "shortCode": "x7k2m",
  "originalUrl": "https://github.com/features/actions",
  "clicks": 1,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

---

## Hints (Explore These)

1. **Short Code Generation**: How would you generate unique short codes? Consider using a counter, random strings, or even the first few characters of a hash.

2. **URL Validation**: What makes a URL valid? It must be a **valid URL** with \`http://\` or \`https://\` protocol. The easiest way is using the built-in \`URL\` constructor and then checking \`url.protocol\`.

3. **In-Memory Storage**: For this challenge, store everything in memory (a JavaScript object or Map). No database needed!

4. **Redirect vs Response**: The \`GET /:code\` endpoint should use \`res.redirect()\`, not return JSON.

5. **Click Tracking**: Where in the code flow would you increment the click counter?

---

## Constraints

- Short codes should be alphanumeric and 5-8 characters long
- The same long URL can be shortened multiple times (each gets a unique short code)
- All timestamps should be in ISO 8601 format (use \`new Date().toISOString()\`)
- \`createdAt\` must be stored and returned consistently (the value returned by \`POST /shorten\` must match \`GET /stats/:code\`)
- \`GET /stats/:code\` must not increment the click counter
- All JSON responses should have \`Content-Type: application/json\`
- Server must bind to \`0.0.0.0\` and respect the \`PORT\` environment variable

---

## Scoring

Each requirement is tested independently. Partial credit is given for each passing test.

| Requirement | Points |
|-------------|--------|
| Health endpoint works | 1 |
| Create short URL (happy path) | 2 |
| URL validation (missing/invalid) | 2 |
| Redirect works | 2 |
| Stats endpoint works | 2 |
| Click counting works | 2 |
| 404 handling | 2 |

**Total: ~25 tests**
`,

  starterFiles: {
    'src/app.js': `const express = require('express');
const app = express();

app.use(express.json());

// In-memory storage for URLs
// Hint: Use an object or Map to store { shortCode: { originalUrl, clicks, createdAt } }
const urlStore = {};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// TODO: POST /shorten - Create a short URL
// - Validate that 'url' is present in request body
// - Validate that 'url' is a valid http(s) URL (use the URL constructor)
// - Generate a unique short code
// - Store the mapping and return the result

// TODO: GET /:code - Redirect to original URL
// - Look up the short code
// - If found, increment clicks and redirect (302)
// - If not found, return 404

// TODO: GET /stats/:code - Get URL statistics
// - Look up the short code
// - If found, return the stats
// - If not found, return 404

module.exports = app;
`,

    'src/server.js': `const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`URL Shortener API running on port \${PORT}\`);
});
`,

    'README.md': `# URL Shortener API

A simple URL shortening service built with Express.js.

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

The server will start on port 3000 (or the PORT environment variable).

## Endpoints

- \`POST /shorten\` - Create a short URL
- \`GET /:code\` - Redirect to original URL
- \`GET /stats/:code\` - Get URL statistics
- \`GET /health\` - Health check

## Your Task

Implement the TODO sections in \`src/app.js\` to make all tests pass.

## Tips

1. Start with the POST /shorten endpoint
2. Use a simple object to store URLs in memory
3. Generate short codes that match /^[A-Za-z0-9]{5,8}$/ and are unique per request (even for the same long URL)
4. Validate that url is a valid http(s) URL (use new URL(url) + protocol check); reject empty/whitespace and non-string values
5. Use new Date().toISOString() for createdAt, store it, and return the same createdAt from /stats/:code (stats should NOT increment clicks)
`
  },

  dependencies: {
    'express': '^4.18.2'
  },

  nodeVersion: '20',

  runner: {
    mode: 'http',
    runtime: 'node',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      runCommand: 'node src/server.js',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 20000,
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

const SHORT_CODE_RE = /^[A-Za-z0-9]{5,8}$/;
const isCanonicalIso = (value) => {
  try {
    return typeof value === 'string' && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
};
const expectJson = (res) => {
  expect(res.headers['content-type']).toMatch(/application\\/json/);
};

describe('URL Shortener API - Public Tests', () => {

  // ==================== HEALTH CHECK ====================
  
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  // ==================== CREATE SHORT URL ====================

  test('POST /shorten creates a short URL', async () => {
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://example.com/test-page' });
    
    expect(res.status).toBe(201);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({
      shortCode: expect.any(String),
      originalUrl: 'https://example.com/test-page',
      createdAt: expect.any(String),
    }));
    expect(res.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(isCanonicalIso(res.body.createdAt)).toBe(true);
  });

  test('POST /shorten accepts http:// URLs', async () => {
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'http://example.com/test-page' });
    
    expect(res.status).toBe(201);
    expectJson(res);
    expect(res.body.originalUrl).toBe('http://example.com/test-page');
    expect(res.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(isCanonicalIso(res.body.createdAt)).toBe(true);
  });

  test('POST /shorten returns a new shortCode every time (even for same URL)', async () => {
    const url = 'https://idempotency-test.example.com/path';

    const res1 = await request(BASE_URL).post('/shorten').send({ url });
    const res2 = await request(BASE_URL).post('/shorten').send({ url });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expectJson(res1);
    expectJson(res2);

    expect(res1.body.originalUrl).toBe(url);
    expect(res2.body.originalUrl).toBe(url);
    expect(res1.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(res2.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(res1.body.shortCode).not.toBe(res2.body.shortCode);
  });

  test('POST /shorten returns 400 when url is missing', async () => {
    // First prove the endpoint works
    const okRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://valid.com' });
    expect(okRes.status).toBe(201);
    expectJson(okRes);

    // Now test the error case
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({});
    
    expect(res.status).toBe(400);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.stringMatching(/url.*required/i),
    }));
  });

  test('POST /shorten returns 400 for invalid URL format', async () => {
    // First prove the endpoint works
    const okRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://valid.com' });
    expect(okRes.status).toBe(201);
    expectJson(okRes);

    // Now test invalid URLs (including http(s) prefix but invalid overall)
    const invalidUrls = [
      'not-a-valid-url',
      'ftp://example.com',
      'http://',
      'https://',
      'http:///',
    ];

    for (const invalidUrl of invalidUrls) {
      const res = await request(BASE_URL)
        .post('/shorten')
        .send({ url: invalidUrl });
      
      expect(res.status).toBe(400);
      expectJson(res);
      expect(res.body).toEqual(expect.objectContaining({
        error: expect.stringMatching(/invalid.*url/i),
      }));
    }
  });

  // ==================== REDIRECT ====================

  test('GET /:code redirects to original URL', async () => {
    // Create a short URL first
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://redirect-test.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    expect(createRes.body.shortCode).toMatch(SHORT_CODE_RE);
    
    const shortCode = createRes.body.shortCode;
    
    // Now test the redirect
    const res = await request(BASE_URL)
      .get('/' + shortCode)
      .redirects(0); // Don't follow redirects
    
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://redirect-test.example.com');
  });

  test('Each shortCode redirects to its own originalUrl (multiple URLs)', async () => {
    const url1 = 'https://multi-redirect-1.example.com/a';
    const url2 = 'https://multi-redirect-2.example.com/b';

    const create1 = await request(BASE_URL).post('/shorten').send({ url: url1 });
    const create2 = await request(BASE_URL).post('/shorten').send({ url: url2 });

    expect(create1.status).toBe(201);
    expect(create2.status).toBe(201);
    expectJson(create1);
    expectJson(create2);
    expect(create1.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(create2.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(create1.body.shortCode).not.toBe(create2.body.shortCode);

    const r1 = await request(BASE_URL).get('/' + create1.body.shortCode).redirects(0);
    const r2 = await request(BASE_URL).get('/' + create2.body.shortCode).redirects(0);

    expect(r1.status).toBe(302);
    expect(r2.status).toBe(302);
    expect(r1.headers.location).toBe(url1);
    expect(r2.headers.location).toBe(url2);
  });

  test('GET /:code returns 404 for non-existent code', async () => {
    // First prove redirects work with a valid code
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://valid.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const validRedirect = await request(BASE_URL)
      .get('/' + createRes.body.shortCode)
      .redirects(0);
    expect(validRedirect.status).toBe(302);
    
    // Now test 404 for non-existent code
    const res = await request(BASE_URL)
      .get('/nonexistent999')
      .redirects(0);
    
    expect(res.status).toBe(404);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.any(String),
    }));
  });

  // ==================== STATS ====================

  test('GET /stats/:code returns statistics', async () => {
    // Create a short URL
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://stats-test.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    expect(createRes.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(isCanonicalIso(createRes.body.createdAt)).toBe(true);
    
    const shortCode = createRes.body.shortCode;
    
    // Get stats
    const res = await request(BASE_URL).get('/stats/' + shortCode);
    
    expect(res.status).toBe(200);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({
      shortCode: shortCode,
      originalUrl: 'https://stats-test.example.com',
      clicks: 0,
      createdAt: expect.any(String),
    }));
    expect(res.body.createdAt).toBe(createRes.body.createdAt);
    expect(isCanonicalIso(res.body.createdAt)).toBe(true);
  });

  test('GET /stats/:code does not increment click count', async () => {
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://stats-no-increment.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);

    const shortCode = createRes.body.shortCode;

    const stats1 = await request(BASE_URL).get('/stats/' + shortCode);
    const stats2 = await request(BASE_URL).get('/stats/' + shortCode);

    expect(stats1.status).toBe(200);
    expect(stats2.status).toBe(200);
    expectJson(stats1);
    expectJson(stats2);
    expect(stats1.body.clicks).toBe(0);
    expect(stats2.body.clicks).toBe(0);
  });

  test('GET /stats/:code returns 404 for non-existent code', async () => {
    // First prove stats work with a valid code
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://valid-stats.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const statsRes = await request(BASE_URL).get('/stats/' + createRes.body.shortCode);
    expect(statsRes.status).toBe(200);
    expectJson(statsRes);
    
    // Now test 404
    const res = await request(BASE_URL).get('/stats/doesnotexist');
    
    expect(res.status).toBe(404);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({
      error: expect.any(String),
    }));
  });

  // ==================== CLICK TRACKING ====================

  test('Visiting short URL increments click count', async () => {
    // Create a short URL
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: 'https://click-test.example.com' });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const shortCode = createRes.body.shortCode;
    
    // Check initial clicks = 0
    const stats1 = await request(BASE_URL).get('/stats/' + shortCode);
    expectJson(stats1);
    expect(stats1.body.clicks).toBe(0);
    
    // Visit the URL
    await request(BASE_URL).get('/' + shortCode).redirects(0);
    
    // Check clicks = 1
    const stats2 = await request(BASE_URL).get('/stats/' + shortCode);
    expectJson(stats2);
    expect(stats2.body.clicks).toBe(1);
    
    // Visit again
    await request(BASE_URL).get('/' + shortCode).redirects(0);
    
    // Check clicks = 2
    const stats3 = await request(BASE_URL).get('/stats/' + shortCode);
    expectJson(stats3);
    expect(stats3.body.clicks).toBe(2);
  });

});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('BASE_URL is required');

const SHORT_CODE_RE = /^[A-Za-z0-9]{5,8}$/;
const isCanonicalIso = (value) => {
  try {
    return typeof value === 'string' && new Date(value).toISOString() === value;
  } catch {
    return false;
  }
};
const expectJson = (res) => {
  expect(res.headers['content-type']).toMatch(/application\\/json/);
};

// Randomization helpers
const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 10);
const randomUrl = () => \`https://\${randomString()}.example.com/path/\${randomString()}\`;

describe('URL Shortener API - Hidden Tests (Anti-Hardcoding)', () => {

  // ==================== HEALTH CHECK ====================
  
  test('Health check returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expectJson(res);
    expect(res.body.ok).toBe(true);
  });

  // ==================== CREATE SHORT URL (RANDOMIZED) ====================

  test('POST /shorten creates short URL with random URL', async () => {
    const testUrl = randomUrl();
    
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    
    expect(res.status).toBe(201);
    expectJson(res);
    expect(res.body.originalUrl).toBe(testUrl);
    expect(res.body.shortCode).toBeDefined();
    expect(typeof res.body.shortCode).toBe('string');
    expect(res.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(res.body.createdAt).toBeDefined();
    expect(isCanonicalIso(res.body.createdAt)).toBe(true);
  });

  test('POST /shorten accepts random http:// URLs', async () => {
    const httpsUrl = randomUrl();
    const httpUrl = 'http://' + httpsUrl.slice('https://'.length);

    const res = await request(BASE_URL).post('/shorten').send({ url: httpUrl });
    expect(res.status).toBe(201);
    expectJson(res);
    expect(res.body.originalUrl).toBe(httpUrl);
    expect(res.body.shortCode).toMatch(SHORT_CODE_RE);

    const redirectRes = await request(BASE_URL).get('/' + res.body.shortCode).redirects(0);
    expect(redirectRes.status).toBe(302);
    expect(redirectRes.headers.location).toBe(httpUrl);
  });

  test('POST /shorten generates unique codes for same URL', async () => {
    const testUrl = randomUrl();
    
    const res1 = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    
    const res2 = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expectJson(res1);
    expectJson(res2);
    // Same URL should produce a NEW short code each time
    expect(res1.body.originalUrl).toBe(testUrl);
    expect(res2.body.originalUrl).toBe(testUrl);
    expect(res1.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(res2.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(res1.body.shortCode).not.toBe(res2.body.shortCode);
    expect(isCanonicalIso(res1.body.createdAt)).toBe(true);
    expect(isCanonicalIso(res2.body.createdAt)).toBe(true);

    // Both codes must work and redirect to the same original URL
    const r1 = await request(BASE_URL).get('/' + res1.body.shortCode).redirects(0);
    const r2 = await request(BASE_URL).get('/' + res2.body.shortCode).redirects(0);
    expect(r1.status).toBe(302);
    expect(r2.status).toBe(302);
    expect(r1.headers.location).toBe(testUrl);
    expect(r2.headers.location).toBe(testUrl);
  });

  test('POST /shorten validates random invalid URLs', async () => {
    const invalidUrls = [
      'ftp://invalid-protocol.com',
      'just-text-' + randomString(),
      '://missing-protocol.com',
      'http://',
      'https://',
      'http:///',
      'https:///',
    ];
    
    // First prove valid URL works
    const okRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: randomUrl() });
    expect(okRes.status).toBe(201);
    expectJson(okRes);
    
    for (const invalidUrl of invalidUrls) {
      const res = await request(BASE_URL)
        .post('/shorten')
        .send({ url: invalidUrl });
      
      expect(res.status).toBe(400);
      expectJson(res);
    }
  });

  test('POST /shorten rejects non-string and whitespace-only url values', async () => {
    const okRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: randomUrl() });
    expect(okRes.status).toBe(201);

    const badValues = [123, null, {}, [], '   ', '\\n\\t'];
    for (const badValue of badValues) {
      const res = await request(BASE_URL)
        .post('/shorten')
        .send({ url: badValue });

      expect(res.status).toBe(400);
      expectJson(res);
    }
  });

  test('POST /shorten returns 400 for empty string URL', async () => {
    const okRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: randomUrl() });
    expect(okRes.status).toBe(201);
    
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({ url: '' });
    
    expect(res.status).toBe(400);
    expectJson(res);
  });

  // ==================== REDIRECT (RANDOMIZED) ====================

  test('GET /:code redirects correctly with random URL', async () => {
    const testUrl = randomUrl();
    
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    expect(createRes.body.shortCode).toMatch(SHORT_CODE_RE);
    
    const redirectRes = await request(BASE_URL)
      .get('/' + createRes.body.shortCode)
      .redirects(0);
    
    expect(redirectRes.status).toBe(302);
    expect(redirectRes.headers.location).toBe(testUrl);
  });

  test('GET /:code returns 404 for random non-existent codes', async () => {
    // Prove redirect works first
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: randomUrl() });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const validRedirect = await request(BASE_URL)
      .get('/' + createRes.body.shortCode)
      .redirects(0);
    expect(validRedirect.status).toBe(302);
    
    // Test random non-existent codes
    const randomCodes = [
      'rand_' + randomString().slice(0, 5),
      'xyz' + Date.now(),
      Math.random().toString(36).slice(2, 10),
    ];
    
    for (const code of randomCodes) {
      const res = await request(BASE_URL)
        .get('/' + code)
        .redirects(0);
      
      expect(res.status).toBe(404);
      expectJson(res);
      expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
    }
  });

  // ==================== STATS (RANDOMIZED) ====================

  test('GET /stats/:code works with random URL', async () => {
    const testUrl = randomUrl();
    
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    expect(createRes.body.shortCode).toMatch(SHORT_CODE_RE);
    expect(isCanonicalIso(createRes.body.createdAt)).toBe(true);
    
    const statsRes = await request(BASE_URL)
      .get('/stats/' + createRes.body.shortCode);
    
    expect(statsRes.status).toBe(200);
    expectJson(statsRes);
    expect(statsRes.body.originalUrl).toBe(testUrl);
    expect(statsRes.body.shortCode).toBe(createRes.body.shortCode);
    expect(statsRes.body.clicks).toBe(0);
    expect(statsRes.body.createdAt).toBe(createRes.body.createdAt);
    expect(isCanonicalIso(statsRes.body.createdAt)).toBe(true);
  });

  test('GET /stats/:code does not increment clicks', async () => {
    const testUrl = randomUrl();
    const createRes = await request(BASE_URL).post('/shorten').send({ url: testUrl });
    expect(createRes.status).toBe(201);
    expectJson(createRes);

    const code = createRes.body.shortCode;
    const s1 = await request(BASE_URL).get('/stats/' + code);
    const s2 = await request(BASE_URL).get('/stats/' + code);

    expect(s1.status).toBe(200);
    expect(s2.status).toBe(200);
    expectJson(s1);
    expectJson(s2);
    expect(s1.body.clicks).toBe(0);
    expect(s2.body.clicks).toBe(0);
  });

  test('GET /stats/:code returns 404 for random non-existent codes', async () => {
    // Prove stats work first
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: randomUrl() });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const validStats = await request(BASE_URL)
      .get('/stats/' + createRes.body.shortCode);
    expect(validStats.status).toBe(200);
    expectJson(validStats);
    
    // Random non-existent code
    const randomCode = 'stats_' + randomString().slice(0, 6);
    const res = await request(BASE_URL).get('/stats/' + randomCode);
    
    expect(res.status).toBe(404);
    expectJson(res);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  // ==================== CLICK TRACKING (RANDOMIZED) ====================

  test('Click count increments correctly with random visits', async () => {
    const testUrl = randomUrl();
    
    const createRes = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    expect(createRes.status).toBe(201);
    expectJson(createRes);
    
    const shortCode = createRes.body.shortCode;
    
    // Verify initial clicks is 0
    const initialStats = await request(BASE_URL).get('/stats/' + shortCode);
    expectJson(initialStats);
    expect(initialStats.body.clicks).toBe(0);
    
    // Random number of visits (3-7)
    const visitCount = 3 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < visitCount; i++) {
      await request(BASE_URL).get('/' + shortCode).redirects(0);
    }
    
    // Check final count matches
    const finalStats = await request(BASE_URL).get('/stats/' + shortCode);
    expectJson(finalStats);
    expect(finalStats.body.clicks).toBe(visitCount);
    expect(finalStats.body.createdAt).toBe(createRes.body.createdAt);
  });

  test('Multiple URLs track clicks independently', async () => {
    const url1 = randomUrl();
    const url2 = randomUrl();
    
    const create1 = await request(BASE_URL).post('/shorten').send({ url: url1 });
    const create2 = await request(BASE_URL).post('/shorten').send({ url: url2 });
    
    expect(create1.status).toBe(201);
    expect(create2.status).toBe(201);
    expectJson(create1);
    expectJson(create2);
    
    const code1 = create1.body.shortCode;
    const code2 = create2.body.shortCode;
    expect(code1).toMatch(SHORT_CODE_RE);
    expect(code2).toMatch(SHORT_CODE_RE);
    expect(code1).not.toBe(code2);
    
    // Visit url1 three times (verify redirect target at least once)
    const v1 = await request(BASE_URL).get('/' + code1).redirects(0);
    expect(v1.status).toBe(302);
    expect(v1.headers.location).toBe(url1);
    await request(BASE_URL).get('/' + code1).redirects(0);
    await request(BASE_URL).get('/' + code1).redirects(0);
    
    // Visit url2 once (verify redirect target)
    const v2 = await request(BASE_URL).get('/' + code2).redirects(0);
    expect(v2.status).toBe(302);
    expect(v2.headers.location).toBe(url2);
    
    // Check counts are independent
    const stats1 = await request(BASE_URL).get('/stats/' + code1);
    const stats2 = await request(BASE_URL).get('/stats/' + code2);
    expectJson(stats1);
    expectJson(stats2);
    
    expect(stats1.body.clicks).toBe(3);
    expect(stats2.body.clicks).toBe(1);
    expect(stats1.body.createdAt).toBe(create1.body.createdAt);
    expect(stats2.body.createdAt).toBe(create2.body.createdAt);
  });

  // ==================== TIMESTAMP VALIDATION ====================

  test('CreatedAt is valid ISO 8601 timestamp', async () => {
    const testUrl = randomUrl();
    
    const res = await request(BASE_URL)
      .post('/shorten')
      .send({ url: testUrl });
    
    expect(res.status).toBe(201);
    expectJson(res);
    
    // Should be canonical ISO string
    expect(isCanonicalIso(res.body.createdAt)).toBe(true);
    const timestamp = new Date(res.body.createdAt);
    
    // Should be recent (within last minute)
    const now = Date.now();
    const created = timestamp.getTime();
    expect(now - created).toBeLessThan(60000);
  });

});
`,
};

