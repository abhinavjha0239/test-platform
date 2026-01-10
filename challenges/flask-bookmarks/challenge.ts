import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Bookmark Manager API (Flask)',
  description: `# Bookmark Manager API

## What You're Building

You're building a **bookmark manager API** using Flask. Users can save web bookmarks, organize them with tags, and search/filter their collection.

This is a great introduction to Flask - a lightweight Python web framework.

---

## API Contract

### Bookmarks

#### \`POST /bookmarks\`
Create a new bookmark.

**Request:**
\`\`\`json
{
  "url": "https://flask.palletsprojects.com",
  "title": "Flask Documentation",
  "tags": ["python", "flask", "docs"]
}
\`\`\`
- \`url\`: Required, must be valid URL (http:// or https://)
- \`title\`: Optional
- \`tags\`: Optional array of strings

**Success (201 Created):**
\`\`\`json
{
  "id": "bm_1",
  "url": "https://flask.palletsprojects.com",
  "title": "Flask Documentation",
  "tags": ["python", "flask", "docs"],
  "createdAt": "2024-01-15T10:00:00.000Z"
}
\`\`\`

**Errors:**
- \`400\` - \`{ "error": "url is required" }\`
- \`400\` - \`{ "error": "invalid url format" }\`

---

#### \`GET /bookmarks\`
List all bookmarks with optional filtering.

**Query Parameters:**
- \`?tag=python\` - Filter by tag

**Success (200 OK):**
\`\`\`json
[
  { "id": "bm_1", "url": "...", "title": "...", "tags": [...], "createdAt": "..." }
]
\`\`\`

---

#### \`GET /bookmarks/{id}\`
Get a specific bookmark.

**Success (200 OK):** Returns bookmark object
**Error:** \`404\` - \`{ "error": "bookmark not found" }\`

---

#### \`PUT /bookmarks/{id}\`
Update a bookmark.

**Request:** (all fields optional)
\`\`\`json
{
  "title": "Updated Title",
  "tags": ["new", "tags"]
}
\`\`\`

**Success (200 OK):** Returns updated bookmark
**Errors:** \`404\` / \`400\`

---

#### \`DELETE /bookmarks/{id}\`
Delete a bookmark.

**Success (204 No Content)**
**Error:** \`404\`

---

#### \`GET /tags\`
List all unique tags used across bookmarks.

**Success (200 OK):**
\`\`\`json
["python", "flask", "docs", "learning"]
\`\`\`

---

#### \`GET /health\`
Health check.

**Success (200 OK):** \`{ "ok": true }\`

---

## Examples

### Example 1: Save and Tag a Bookmark

\`\`\`bash
curl -X POST http://localhost:3000/bookmarks \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://realpython.com", "title": "Real Python", "tags": ["python", "learning"]}'
\`\`\`

### Example 2: Filter by Tag

\`\`\`bash
curl "http://localhost:3000/bookmarks?tag=python"
\`\`\`

---

## Hints

1. **Flask Basics**: Use \`@app.route('/path', methods=['GET', 'POST'])\`
2. **Request Data**: Access JSON body with \`request.get_json()\`
3. **URL Validation**: Check if URL starts with \`http://\` or \`https://\`
4. **Tags**: Store as a list/array. Filter by checking if tag is in bookmark's tags list.

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Health endpoint | 1 |
| Create bookmark | 2 |
| URL validation | 2 |
| List bookmarks | 1 |
| Filter by tag | 2 |
| Get/Update/Delete | 3 |
| List tags | 2 |

**Total: ~13 tests**
`,

  starterFiles: {
    'app.py': `import os
from datetime import datetime
from flask import Flask, request, jsonify

app = Flask(__name__)

# In-memory storage
bookmarks = {}
bookmark_counter = 0

def generate_id():
    global bookmark_counter
    bookmark_counter += 1
    return f"bm_{bookmark_counter}"

def validate_url(url):
    """Check if URL is valid (starts with http:// or https://)"""
    if not url:
        return False
    return url.startswith('http://') or url.startswith('https://')

@app.get('/health')
def health():
    return jsonify({'ok': True})

# ==================== BOOKMARKS ====================

@app.route('/bookmarks', methods=['POST'])
def create_bookmark():
    # TODO: Get JSON data from request
    # TODO: Validate URL is present and valid
    # TODO: Create bookmark with id, url, title, tags, createdAt
    # TODO: Return 201 with bookmark
    return jsonify({'error': 'not implemented'}), 501

@app.route('/bookmarks', methods=['GET'])
def list_bookmarks():
    # TODO: Get optional 'tag' query parameter
    # TODO: Filter bookmarks by tag if provided
    # TODO: Return list of bookmarks
    return jsonify([])

@app.route('/bookmarks/<bookmark_id>', methods=['GET'])
def get_bookmark(bookmark_id):
    # TODO: Find bookmark by ID
    # TODO: Return 404 if not found
    # TODO: Return bookmark
    return jsonify({'error': 'not implemented'}), 501

@app.route('/bookmarks/<bookmark_id>', methods=['PUT'])
def update_bookmark(bookmark_id):
    # TODO: Find bookmark
    # TODO: Update fields from request body
    # TODO: Validate URL if provided
    # TODO: Return updated bookmark
    return jsonify({'error': 'not implemented'}), 501

@app.route('/bookmarks/<bookmark_id>', methods=['DELETE'])
def delete_bookmark(bookmark_id):
    # TODO: Find bookmark
    # TODO: Delete it
    # TODO: Return 204 No Content
    return jsonify({'error': 'not implemented'}), 501

@app.route('/tags', methods=['GET'])
def list_tags():
    # TODO: Collect all unique tags from all bookmarks
    # TODO: Return sorted list
    return jsonify([])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
`,
    'README.md': `# Bookmark Manager API

A bookmark manager built with Flask.

## Getting Started

\`\`\`bash
pip install -r requirements.txt
python app.py
\`\`\`

## Your Task

Implement the TODO sections in \`app.py\`.
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
      generatedFiles: {
        'requirements.txt': 'flask==3.0.3\n',
      },
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

describe('Bookmark Manager API - Public Tests', () => {
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /bookmarks creates a bookmark', async () => {
    const res = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://example.com', title: 'Example', tags: ['test'] });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^bm_/),
      url: 'https://example.com',
      title: 'Example',
      tags: ['test'],
    }));
  });

  test('POST /bookmarks validates URL', async () => {
    const okRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://valid.com' });
    expect(okRes.status).toBe(201);

    const res = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'invalid-url' });
    expect(res.status).toBe(400);
  });

  test('GET /bookmarks returns array', async () => {
    const created = await request(BASE_URL).post('/bookmarks').send({ url: 'https://list.com' });
    expect(created.status).toBe(201);
    const res = await request(BASE_URL).get('/bookmarks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(b => b.id === created.body.id)).toBe(true);
  });

  test('GET /bookmarks?tag filters by tag', async () => {
    const tagged = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://tagged.com', tags: ['special'] });
    const other = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://other-tag.com', tags: ['other'] });
    expect(tagged.status).toBe(201);
    expect(other.status).toBe(201);
    
    const res = await request(BASE_URL).get('/bookmarks?tag=special');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(b => b.id === tagged.body.id)).toBe(true);
    expect(res.body.every(b => Array.isArray(b.tags) && b.tags.includes('special'))).toBe(true);
    expect(res.body.some(b => b.id === other.body.id)).toBe(false);
  });

  test('GET /bookmarks/{id} returns bookmark', async () => {
    const createRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://getbyid.com' });
    const res = await request(BASE_URL).get('/bookmarks/' + createRes.body.id);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createRes.body.id);
  });

  test('GET /bookmarks/{id} returns 404', async () => {
    const createRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://valid404.com' });
    expect((await request(BASE_URL).get('/bookmarks/' + createRes.body.id)).status).toBe(200);
    const res = await request(BASE_URL).get('/bookmarks/bm_nonexistent');
    expect(res.status).toBe(404);
  });

  test('PUT /bookmarks/{id} updates bookmark', async () => {
    const createRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://update.com', title: 'Original' });
    const res = await request(BASE_URL)
      .put('/bookmarks/' + createRes.body.id)
      .send({ title: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
  });

  test('DELETE /bookmarks/{id} deletes bookmark', async () => {
    const createRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://delete.com' });
    const res = await request(BASE_URL).delete('/bookmarks/' + createRes.body.id);
    expect(res.status).toBe(204);
  });

  test('GET /tags returns unique tags', async () => {
    await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://tags1.com', tags: ['alpha', 'beta'] });
    await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: 'https://tags2.com', tags: ['beta', 'gamma'] });
    const res = await request(BASE_URL).get('/tags');
    expect(res.status).toBe(200);
    expect(res.body).toContain('alpha');
    expect(res.body).toContain('beta');
    expect(res.body).toContain('gamma');
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const randomUrl = () => \`https://\${randomString()}.example.com\`;

describe('Bookmark Manager API - Hidden Tests', () => {
  test('POST /bookmarks with random URL and title', async () => {
    const url = randomUrl();
    const title = 'Title_' + randomString();
    const res = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url, title, tags: ['tag_' + randomString()] });
    expect(res.status).toBe(201);
    expect(res.body.url).toBe(url);
    expect(res.body.title).toBe(title);
  });

  test('URL validation rejects random invalid URLs', async () => {
    const okRes = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: randomUrl() });
    expect(okRes.status).toBe(201);

    const invalidUrls = ['ftp://' + randomString(), randomString(), '://' + randomString()];
    for (const url of invalidUrls) {
      const res = await request(BASE_URL).post('/bookmarks').send({ url });
      expect(res.status).toBe(400);
    }
  });

  test('Tag filtering works with random tags', async () => {
    const tag = 'unique_' + randomString();
    const bm = await request(BASE_URL)
      .post('/bookmarks')
      .send({ url: randomUrl(), tags: [tag] });
    
    const filtered = await request(BASE_URL).get('/bookmarks?tag=' + tag);
    expect(filtered.body.map(b => b.id)).toContain(bm.body.id);
  });

  test('GET by random ID returns 404 correctly', async () => {
    const valid = await request(BASE_URL).post('/bookmarks').send({ url: randomUrl() });
    expect((await request(BASE_URL).get('/bookmarks/' + valid.body.id)).status).toBe(200);
    
    const randomIds = ['bm_' + randomString(), 'invalid_' + Date.now()];
    for (const id of randomIds) {
      expect((await request(BASE_URL).get('/bookmarks/' + id)).status).toBe(404);
    }
  });

  test('PUT with random values updates correctly', async () => {
    const bm = await request(BASE_URL).post('/bookmarks').send({ url: randomUrl() });
    const newTitle = 'Updated_' + randomString();
    const res = await request(BASE_URL)
      .put('/bookmarks/' + bm.body.id)
      .send({ title: newTitle });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(newTitle);
  });

  test('DELETE with random bookmark works', async () => {
    const bm = await request(BASE_URL).post('/bookmarks').send({ url: randomUrl() });
    expect((await request(BASE_URL).delete('/bookmarks/' + bm.body.id)).status).toBe(204);
    expect((await request(BASE_URL).get('/bookmarks/' + bm.body.id)).status).toBe(404);
  });

  test('GET /tags includes random tags', async () => {
    const tag = 'randomtag_' + randomString();
    await request(BASE_URL).post('/bookmarks').send({ url: randomUrl(), tags: [tag] });
    const res = await request(BASE_URL).get('/tags');
    expect(res.body).toContain(tag);
  });
});
`,
};

