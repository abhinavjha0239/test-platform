// Express Todo API Challenge - BLACKBOX MODE (HTTP Testing)
// This version runs actual server and tests via HTTP requests

export const todoBlackboxChallenge = {
    name: 'Express Todo API (Blackbox)',
    description: `Build a complete REST API for a Todo application using Express.js.

Requirements:
- GET /todos - Return all todos
- GET /todos/:id - Return single todo by ID
- POST /todos - Create a new todo (body: { title, completed? })
- PUT /todos/:id - Update a todo
- DELETE /todos/:id - Delete a todo

Each todo should have: id, title, completed (boolean), createdAt

Notes:
- completed should default to false if not provided
- createdAt should be an ISO date string
- Return 404 for non-existent todos
- Return 400 for missing required fields
- Server should listen on PORT environment variable (default 3000)`,

    starterFiles: {
        'src/app.js': `const express = require('express');
const app = express();

app.use(express.json());

// In-memory storage
let todos = [];
let nextId = 1;

// TODO: Implement the following endpoints:
// GET /todos - Return all todos
// GET /todos/:id - Return single todo
// POST /todos - Create todo
// PUT /todos/:id - Update todo  
// DELETE /todos/:id - Delete todo

// Your code here...

module.exports = app;
`,
        'src/server.js': `const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
    },

    // ========== BLACKBOX RUNNER CONFIGURATION ==========
    runner: {
        mode: 'http' as const,
        runtime: 'node' as const,
        candidate: {
            image: 'node:20-alpine',
            workdir: '/app',
            generatedFiles: {},
            installCommand: 'npm install --legacy-peer-deps',
            runCommand: 'node src/server.js',
            port: 3000,
            healthPath: '/todos',
            env: { NODE_ENV: 'test' },
            startupTimeoutMs: 20000,
        },
        tests: {
            framework: 'jest' as const,
            image: 'node:20-alpine',
            installCommand: 'npm install --legacy-peer-deps',
            testCommand: 'npm test',
            env: {},
            timeoutMs: 120000,
        },
    },

    // Public Tests - Note: Tests hit BASE_URL (set by grader)
    // IMPORTANT: 404 tests must first prove the endpoint exists by creating/fetching successfully
    // Otherwise they pass without implementation (since Express returns 404 for missing routes)
    publicTests: `const request = require('supertest');

// BASE_URL is set by the blackbox grader
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Todo API - Public Tests (Blackbox)', () => {
  test('GET /todos should return an array', async () => {
    const res = await request(BASE_URL).get('/todos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /todos should create a new todo', async () => {
    const res = await request(BASE_URL)
      .post('/todos')
      .send({ title: 'Test todo' });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test todo');
    expect(res.body.completed).toBe(false);
    expect(res.body).toHaveProperty('createdAt');
  });

  test('GET /todos/:id returns todo when exists, 404 when not', async () => {
    // First, CREATE a todo to prove the endpoint works
    const createRes = await request(BASE_URL)
      .post('/todos')
      .send({ title: 'Verify endpoint works' });
    expect(createRes.status).toBe(201);
    
    // Then, GET it to prove GET /todos/:id works
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createRes.body.id);
    
    // NOW test 404 for non-existent ID (endpoint exists, but ID doesn't)
    const notFoundRes = await request(BASE_URL).get('/todos/99999');
    expect(notFoundRes.status).toBe(404);
  });

  test('POST /todos without title should return 400', async () => {
    // First prove POST /todos works with valid data
    const validRes = await request(BASE_URL)
      .post('/todos')
      .send({ title: 'Valid todo' });
    expect(validRes.status).toBe(201);
    
    // Now test 400 for invalid data
    const invalidRes = await request(BASE_URL)
      .post('/todos')
      .send({});
    expect(invalidRes.status).toBe(400);
  });
});
`,

    // Hidden Tests - Comprehensive blackbox tests with edge cases
    hiddenTests: `const request = require('supertest');

// BASE_URL is set by the blackbox grader
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('Todo API - Hidden Tests (Blackbox)', () => {
  // Helper to create todo with random title
  const createTodo = async (title) => {
    const randomTitle = title || 'Todo-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const res = await request(BASE_URL)
      .post('/todos')
      .send({ title: randomTitle });
    return res;
  };

  // ===== CORE CRUD =====
  
  test('Created todo appears in GET /todos list', async () => {
    const uniqueTitle = 'Unique-' + Date.now();
    const createRes = await createTodo(uniqueTitle);
    expect(createRes.status).toBe(201);
    
    const listRes = await request(BASE_URL).get('/todos');
    expect(listRes.status).toBe(200);
    expect(listRes.body.some(t => t.title === uniqueTitle)).toBe(true);
  });

  test('GET /todos/:id returns created todo', async () => {
    const createRes = await createTodo();
    expect(createRes.status).toBe(201);
    
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createRes.body.id);
  });

  test('PUT /todos/:id updates todo', async () => {
    const createRes = await createTodo('Original');
    
    const updateRes = await request(BASE_URL)
      .put('/todos/' + createRes.body.id)
      .send({ title: 'Updated', completed: true });
    
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated');
    expect(updateRes.body.completed).toBe(true);
  });

  test('PUT changes persist to subsequent GET', async () => {
    const createRes = await createTodo('Persist');
    
    await request(BASE_URL)
      .put('/todos/' + createRes.body.id)
      .send({ title: 'Persisted', completed: true });
    
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.body.title).toBe('Persisted');
    expect(getRes.body.completed).toBe(true);
  });

  test('DELETE /todos/:id removes todo', async () => {
    const createRes = await createTodo('Delete me');
    
    const deleteRes = await request(BASE_URL).delete('/todos/' + createRes.body.id);
    expect(deleteRes.status).toBe(200);
    
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(404);
  });

  test('DELETE only removes target (not others)', async () => {
    const a = await createTodo('Keep A');
    const b = await createTodo('Delete B');
    const c = await createTodo('Keep C');
    
    await request(BASE_URL).delete('/todos/' + b.body.id);
    
    const listRes = await request(BASE_URL).get('/todos');
    const ids = listRes.body.map(t => t.id);
    
    expect(ids).toContain(a.body.id);
    expect(ids).toContain(c.body.id);
    expect(ids).not.toContain(b.body.id);
  });

  // ===== DEFAULTS =====
  
  test('Todo defaults to completed: false', async () => {
    const res = await createTodo('Default test');
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(false);
    expect(typeof res.body.completed).toBe('boolean');
  });

  test('POST with completed=true preserves value', async () => {
    const res = await request(BASE_URL)
      .post('/todos')
      .send({ title: 'Already done', completed: true });
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(true);
  });

  test('Multiple todos have unique IDs', async () => {
    const a = await createTodo('First');
    const b = await createTodo('Second');
    const c = await createTodo('Third');
    
    const ids = new Set([a.body.id, b.body.id, c.body.id]);
    expect(ids.size).toBe(3);
  });

  test('createdAt is valid ISO date', async () => {
    const res = await createTodo('Timestamp test');
    expect(res.status).toBe(201);
    
    const date = new Date(res.body.createdAt);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  // ===== 404 TESTS =====
  // IMPORTANT: Each test first proves the endpoint works, then tests 404
  
  test('PUT /todos/:id returns 404 for non-existent', async () => {
    // First create and update a todo to prove PUT works
    const createRes = await createTodo('Verify PUT works');
    expect(createRes.status).toBe(201);
    
    const updateRes = await request(BASE_URL)
      .put('/todos/' + createRes.body.id)
      .send({ title: 'Updated title' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated title');
    
    // NOW test 404 for non-existent ID
    const notFoundRes = await request(BASE_URL)
      .put('/todos/999999')
      .send({ title: 'Ghost' });
    expect(notFoundRes.status).toBe(404);
  });

  test('DELETE /todos/:id returns 404 for non-existent', async () => {
    // First create and delete a todo to prove DELETE works
    const createRes = await createTodo('Verify DELETE works');
    expect(createRes.status).toBe(201);
    
    const deleteRes = await request(BASE_URL).delete('/todos/' + createRes.body.id);
    expect(deleteRes.status).toBe(200);
    
    // Verify it's actually deleted
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(404);
    
    // NOW test 404 for non-existent ID
    const notFoundRes = await request(BASE_URL).delete('/todos/999999');
    expect(notFoundRes.status).toBe(404);
  });

  // ===== EDGE CASES =====
  
  test('GET /todos/:id with string ID returns 404', async () => {
    // First prove GET /todos/:id works with valid ID
    const createRes = await createTodo('Verify GET works');
    expect(createRes.status).toBe(201);
    
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(200);
    
    // NOW test 404 for invalid string ID
    const notFoundRes = await request(BASE_URL).get('/todos/not-a-number');
    expect(notFoundRes.status).toBe(404);
  });

  test('Complete CRUD flow works', async () => {
    const title = 'Flow-' + Date.now();
    
    // Create
    const createRes = await request(BASE_URL).post('/todos').send({ title });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // List contains item
    const listRes = await request(BASE_URL).get('/todos');
    expect(listRes.body.some(t => t.id === id)).toBe(true);

    // Update
    const updateRes = await request(BASE_URL)
      .put('/todos/' + id)
      .send({ completed: true });
    expect(updateRes.status).toBe(200);

    // Get single
    const getRes = await request(BASE_URL).get('/todos/' + id);
    expect(getRes.body.completed).toBe(true);

    // Delete
    const deleteRes = await request(BASE_URL).delete('/todos/' + id);
    expect(deleteRes.status).toBe(200);

    // Verify deleted
    const checkRes = await request(BASE_URL).get('/todos/' + id);
    expect(checkRes.status).toBe(404);
  });
});
`,

    dependencies: {
        'express': '^4.18.2',
    },

    nodeVersion: '20',
};

export default todoBlackboxChallenge;

