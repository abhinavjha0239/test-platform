import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Blog Comments API (Django)',
  description: `# Blog Comments API

## What You're Building

A **nested comments system** for a blog using Django. Comments can reply to other comments, creating a threaded discussion.

This is a medium-difficulty Django challenge focusing on hierarchical data.

---

## API Contract

#### \`POST /posts/{postId}/comments\`
Add a top-level comment or reply.

**Request:**
\`\`\`json
{
  "author": "John",
  "content": "Great article!",
  "parentId": null
}
\`\`\`
- \`parentId\`: Optional, ID of parent comment for replies

**Success (201):**
\`\`\`json
{
  "id": "comment_1",
  "postId": "post_1",
  "author": "John",
  "content": "Great article!",
  "parentId": null,
  "createdAt": "..."
}
\`\`\`

---

#### \`GET /posts/{postId}/comments\`
Get all comments for a post (flat list).

**Success (200):** Array of comments

---

#### \`PUT /comments/{id}\`
Edit a comment.

**Request:**
\`\`\`json
{ "content": "Updated content" }
\`\`\`

**Success (200):** Updated comment

---

#### \`DELETE /comments/{id}\`
Soft delete - marks as deleted but preserves for thread continuity.

**Success (200):**
\`\`\`json
{
  "id": "comment_1",
  "content": "[deleted]",
  "deletedAt": "..."
}
\`\`\`

---

#### \`POST /comments/{id}/replies\`
Reply to a comment (shorthand for POST with parentId).

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

**Note:** Posts are pre-seeded. Use \`post_1\`, \`post_2\`, \`post_3\`.

---

## Hints

1. **parentId**: Store as reference to another comment
2. **Soft Delete**: Don't remove, set \`deletedAt\` and change \`content\` to "[deleted]"
3. **Threading**: The flat list approach is simpler - frontend can build the tree

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Create comment | 2 |
| List comments | 2 |
| Reply to comment | 2 |
| Edit comment | 2 |
| Soft delete | 3 |
| Validation | 2 |

**Total: ~13 tests**
`,

  starterFiles: {
    'comments/views.py': `import json
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

# Pre-seeded posts
POSTS = {'post_1': True, 'post_2': True, 'post_3': True}

# In-memory storage
comments = {}
counter = 0

def generate_id():
    global counter
    counter += 1
    return f"comment_{counter}"

@csrf_exempt
def health(request):
    return JsonResponse({'ok': True})

@csrf_exempt
def post_comments(request, post_id):
    if post_id not in POSTS:
        return JsonResponse({'error': 'post not found'}, status=404)
    
    if request.method == 'POST':
        # TODO: Create comment
        return JsonResponse({'error': 'not implemented'}, status=501)
    elif request.method == 'GET':
        # TODO: List comments for this post
        return JsonResponse([], safe=False)
    return JsonResponse({'error': 'method not allowed'}, status=405)

@csrf_exempt
def comment_detail(request, comment_id):
    if request.method == 'PUT':
        # TODO: Update comment content
        pass
    elif request.method == 'DELETE':
        # TODO: Soft delete - set deletedAt and content to "[deleted]"
        pass
    return JsonResponse({'error': 'not implemented'}, status=501)

@csrf_exempt
def comment_replies(request, comment_id):
    if request.method == 'POST':
        # TODO: Create reply (comment with parentId)
        pass
    return JsonResponse({'error': 'not implemented'}, status=501)
`,
    'comments/urls.py': `from django.urls import path
from . import views

urlpatterns = [
    path('health', views.health),
    path('posts/<str:post_id>/comments', views.post_comments),
    path('comments/<str:comment_id>', views.comment_detail),
    path('comments/<str:comment_id>/replies', views.comment_replies),
]
`,
    'myproject/settings.py': `SECRET_KEY = 'dev-secret-key'
DEBUG = True
ALLOWED_HOSTS = ['*']
INSTALLED_APPS = ['django.contrib.contenttypes', 'comments']
ROOT_URLCONF = 'comments.urls'
USE_TZ = True
`,
    'myproject/wsgi.py': `import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
application = get_wsgi_application()
`,
    'manage.py': `#!/usr/bin/env python
import os, sys
if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
`,
    'README.md': `# Blog Comments API

Implement nested comments in \`comments/views.py\`.
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
      generatedFiles: { 'requirements.txt': 'Django==5.1.3\n' },
      installCommand: 'pip install -r requirements.txt',
      runCommand: 'python manage.py runserver 0.0.0.0:$PORT --noreload',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 45000,
    },
    tests: {
      framework: 'jest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npm test 2>&1 || true',
      timeoutMs: 180000,
    },
  },

  publicTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

describe('Blog Comments API - Public Tests', () => {
  test('GET /health returns ok', async () => {
    expect((await request(BASE_URL).get('/health')).body).toEqual({ ok: true });
  });

  test('POST /posts/{id}/comments creates comment', async () => {
    const res = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'John', content: 'Great post!' });
    expect(res.status).toBe(201);
    expect(res.body.author).toBe('John');
    expect(res.body.postId).toBe('post_1');
  });

  test('GET /posts/{id}/comments returns array', async () => {
    const created = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'Alice', content: 'Comment' });
    expect(created.status).toBe(201);
    const res = await request(BASE_URL).get('/posts/post_1/comments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(c => c.id === created.body.id)).toBe(true);
    expect(res.body.every(c => c.postId === 'post_1')).toBe(true);
  });

  test('POST /comments/{id}/replies creates reply', async () => {
    const parent = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'Parent', content: 'Parent comment' });
    
    const reply = await request(BASE_URL)
      .post('/comments/' + parent.body.id + '/replies')
      .send({ author: 'Reply', content: 'This is a reply' });
    
    expect(reply.status).toBe(201);
    expect(reply.body.parentId).toBe(parent.body.id);
  });

  test('PUT /comments/{id} updates content', async () => {
    const comment = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'Test', content: 'Original' });
    
    const updated = await request(BASE_URL)
      .put('/comments/' + comment.body.id)
      .send({ content: 'Updated' });
    
    expect(updated.status).toBe(200);
    expect(updated.body.content).toBe('Updated');
  });

  test('DELETE /comments/{id} soft deletes', async () => {
    const comment = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'Delete', content: 'To be deleted' });
    
    const deleted = await request(BASE_URL).delete('/comments/' + comment.body.id);
    
    expect(deleted.status).toBe(200);
    expect(deleted.body.content).toBe('[deleted]');
    expect(deleted.body.deletedAt).toBeDefined();
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Blog Comments API - Hidden Tests', () => {
  test('Creates comment with random content', async () => {
    const content = 'Content_' + randomString();
    const res = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'Random', content });
    expect(res.body.content).toBe(content);
  });

  test('Reply chain works', async () => {
    const parent = await request(BASE_URL)
      .post('/posts/post_2/comments')
      .send({ author: 'P', content: 'Parent_' + randomString() });
    
    const child = await request(BASE_URL)
      .post('/comments/' + parent.body.id + '/replies')
      .send({ author: 'C', content: 'Child_' + randomString() });
    
    expect(child.body.parentId).toBe(parent.body.id);
    expect(child.body.postId).toBe('post_2');
  });

  test('Update with random content', async () => {
    const comment = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'U', content: 'Old' });
    
    const newContent = 'New_' + randomString();
    const updated = await request(BASE_URL)
      .put('/comments/' + comment.body.id)
      .send({ content: newContent });
    
    expect(updated.body.content).toBe(newContent);
  });

  test('Soft delete preserves comment for threading', async () => {
    const parent = await request(BASE_URL)
      .post('/posts/post_1/comments')
      .send({ author: 'P', content: 'Parent' });
    
    await request(BASE_URL)
      .post('/comments/' + parent.body.id + '/replies')
      .send({ author: 'C', content: 'Child' });
    
    await request(BASE_URL).delete('/comments/' + parent.body.id);
    
    // Comment should still be in list
    const list = await request(BASE_URL).get('/posts/post_1/comments');
    const deleted = list.body.find(c => c.id === parent.body.id);
    expect(deleted).toBeDefined();
    expect(deleted.content).toBe('[deleted]');
  });

  test('Returns 404 for non-existent post', async () => {
    const res = await request(BASE_URL)
      .post('/posts/post_nonexistent/comments')
      .send({ author: 'X', content: 'Y' });
    expect(res.status).toBe(404);
  });
});
`,
};

