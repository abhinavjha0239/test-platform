import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Contact Book API (Django)',
  description: `# Contact Book API

## What You're Building

A **contact management API** using Django. Store names, emails, phone numbers and search through contacts.

This is an introduction to Django without using the ORM - everything is in-memory.

---

## API Contract

#### \`POST /contacts\`
Create a contact.

**Request:**
\`\`\`json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890"
}
\`\`\`
- \`name\`: Required
- \`email\`, \`phone\`: Optional

**Success (201):**
\`\`\`json
{
  "id": "contact_1",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "createdAt": "..."
}
\`\`\`

---

#### \`GET /contacts\`
List contacts with optional search.

**Query:** \`?search=john\` - Searches name and email

**Success (200):** Array of contacts

---

#### \`GET /contacts/{id}\`
Get single contact.

**Success (200):** Contact object
**Error (404)**

---

#### \`PUT /contacts/{id}\`
Update contact.

**Success (200):** Updated contact
**Error (404, 400)**

---

#### \`DELETE /contacts/{id}\`
Delete contact.

**Success (204)**
**Error (404)**

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

---

## Hints

1. **Django Views**: Use function-based views or class-based views
2. **JSON Parsing**: \`json.loads(request.body)\`
3. **Search**: Use Python string methods for case-insensitive search

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Create contact | 2 |
| Name validation | 1 |
| List contacts | 1 |
| Search contacts | 2 |
| Get by ID | 2 |
| Update contact | 2 |
| Delete contact | 2 |

**Total: ~12 tests**
`,

  starterFiles: {
    'contacts/views.py': `import json
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

# In-memory storage
contacts = {}
counter = 0

def generate_id():
    global counter
    counter += 1
    return f"contact_{counter}"

@csrf_exempt
def health(request):
    return JsonResponse({'ok': True})

@csrf_exempt
@require_http_methods(["GET", "POST"])
def contact_list(request):
    if request.method == 'POST':
        # TODO: Create contact
        return JsonResponse({'error': 'not implemented'}, status=501)
    else:
        # TODO: List contacts with optional search
        return JsonResponse([], safe=False)

@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def contact_detail(request, contact_id):
    if request.method == 'GET':
        # TODO: Get contact
        pass
    elif request.method == 'PUT':
        # TODO: Update contact
        pass
    elif request.method == 'DELETE':
        # TODO: Delete contact
        pass
    return JsonResponse({'error': 'not implemented'}, status=501)
`,
    'contacts/urls.py': `from django.urls import path
from . import views

urlpatterns = [
    path('health', views.health),
    path('contacts', views.contact_list),
    path('contacts/<str:contact_id>', views.contact_detail),
]
`,
    'myproject/settings.py': `SECRET_KEY = 'dev-secret-key'
DEBUG = True
ALLOWED_HOSTS = ['*']
INSTALLED_APPS = ['django.contrib.contenttypes', 'contacts']
ROOT_URLCONF = 'contacts.urls'
USE_TZ = True
`,
    'myproject/wsgi.py': `import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
application = get_wsgi_application()
`,
    'manage.py': `#!/usr/bin/env python
import os
import sys
if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
`,
    'README.md': `# Contact Book API (Django)

Implement the views in \`contacts/views.py\`.

## Run
\`\`\`bash
python manage.py runserver 0.0.0.0:$PORT
\`\`\`
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

describe('Contact Book API - Public Tests', () => {
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /contacts creates contact', async () => {
    const res = await request(BASE_URL)
      .post('/contacts')
      .send({ name: 'John Doe', email: 'john@test.com' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('John Doe');
    expect(res.body.id).toMatch(/^contact_/);
  });

  test('POST /contacts requires name', async () => {
    const ok = await request(BASE_URL).post('/contacts').send({ name: 'Valid' });
    expect(ok.status).toBe(201);
    const res = await request(BASE_URL).post('/contacts').send({ email: 'no@name.com' });
    expect(res.status).toBe(400);
  });

  test('GET /contacts returns array', async () => {
    const created = await request(BASE_URL).post('/contacts').send({ name: 'List Test' });
    expect(created.status).toBe(201);
    const res = await request(BASE_URL).get('/contacts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(c => c.id === created.body.id)).toBe(true);
  });

  test('GET /contacts?search filters', async () => {
    await request(BASE_URL).post('/contacts').send({ name: 'Alice Smith' });
    const res = await request(BASE_URL).get('/contacts?search=alice');
    expect(res.body.some(c => c.name.toLowerCase().includes('alice'))).toBe(true);
  });

  test('GET /contacts/{id} returns contact', async () => {
    const create = await request(BASE_URL).post('/contacts').send({ name: 'Get Test' });
    const res = await request(BASE_URL).get('/contacts/' + create.body.id);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(create.body.id);
  });

  test('PUT /contacts/{id} updates', async () => {
    const create = await request(BASE_URL).post('/contacts').send({ name: 'Old Name' });
    const res = await request(BASE_URL)
      .put('/contacts/' + create.body.id)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });

  test('DELETE /contacts/{id} removes', async () => {
    const create = await request(BASE_URL).post('/contacts').send({ name: 'Delete Me' });
    expect((await request(BASE_URL).delete('/contacts/' + create.body.id)).status).toBe(204);
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Contact Book API - Hidden Tests', () => {
  test('Creates contact with random name', async () => {
    const name = 'Name_' + randomString();
    const res = await request(BASE_URL).post('/contacts').send({ name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
  });

  test('Search works with random names', async () => {
    const unique = 'unique_' + randomString();
    await request(BASE_URL).post('/contacts').send({ name: unique });
    const res = await request(BASE_URL).get('/contacts?search=' + unique.slice(0, 10));
    expect(res.body.some(c => c.name === unique)).toBe(true);
  });

  test('GET by ID with random contacts', async () => {
    const name = 'GetById_' + randomString();
    const create = await request(BASE_URL).post('/contacts').send({ name });
    const get = await request(BASE_URL).get('/contacts/' + create.body.id);
    expect(get.body.name).toBe(name);
  });

  test('404 for random non-existent IDs', async () => {
    const valid = await request(BASE_URL).post('/contacts').send({ name: 'Valid' });
    expect((await request(BASE_URL).get('/contacts/' + valid.body.id)).status).toBe(200);
    
    const randomIds = ['contact_' + randomString(), 'fake_' + Date.now()];
    for (const id of randomIds) {
      expect((await request(BASE_URL).get('/contacts/' + id)).status).toBe(404);
    }
  });

  test('Update with random values', async () => {
    const create = await request(BASE_URL).post('/contacts').send({ name: 'Original' });
    const newName = 'Updated_' + randomString();
    const res = await request(BASE_URL)
      .put('/contacts/' + create.body.id)
      .send({ name: newName });
    expect(res.body.name).toBe(newName);
  });

  test('Delete with random contact', async () => {
    const name = 'Delete_' + randomString();
    const create = await request(BASE_URL).post('/contacts').send({ name });
    expect((await request(BASE_URL).delete('/contacts/' + create.body.id)).status).toBe(204);
    expect((await request(BASE_URL).get('/contacts/' + create.body.id)).status).toBe(404);
  });
});
`,
};

