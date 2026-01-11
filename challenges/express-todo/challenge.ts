// Express Todo API Challenge - Robust Test Design
export const todoChallenge = {
    name: 'Express Todo API',
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
- Return 400 for missing required fields`,

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

    // Public Tests - Visible to candidates with proper test isolation
    publicTests: `const request = require('supertest');

let app;

// Test isolation - reload app before each test to reset state
beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Todo API - Public Tests', () => {
  test('GET /todos should return an empty array initially', async () => {
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test('POST /todos should create a new todo with correct structure', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Test todo' });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test todo');
    expect(res.body.completed).toBe(false); // Default value
    expect(res.body).toHaveProperty('createdAt');
  });

  test('GET /todos/:id should return a single todo', async () => {
    // First create a todo
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Find me' });
    
    const res = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Find me');
    expect(res.body.id).toBe(createRes.body.id);
  });

  test('GET /todos/:id should return 404 for non-existent todo', async () => {
    // IMPORTANT: First prove the endpoint works, then test 404
    // Otherwise this test passes without implementation (Express returns 404 for missing routes)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify endpoint works' });
    expect(createRes.status).toBe(201);
    
    const getRes = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(getRes.status).toBe(200);
    
    // NOW test 404 for non-existent ID
    const notFoundRes = await request(app).get('/todos/99999');
    expect(notFoundRes.status).toBe(404);
  });

  test('POST /todos without title should return 400', async () => {
    // First prove POST works with valid data
    const validRes = await request(app)
      .post('/todos')
      .send({ title: 'Valid todo' });
    expect(validRes.status).toBe(201);
    
    // NOW test 400 for missing title
    const invalidRes = await request(app)
      .post('/todos')
      .send({});
    expect(invalidRes.status).toBe(400);
  });
});
`,

    // Hidden Tests - Robust behavior-based tests (loophole-free)
    hiddenTests: `const request = require('supertest');

let app;

// Test isolation - reload app before each test to reset state
beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Todo API - Hidden Tests', () => {
  // ===== LIST CORRECTNESS (prevents empty array forever) =====
  test('GET /todos returns all created items', async () => {
    const titles = [\`A-\${Date.now()}\`, \`B-\${Date.now()}\`];
    
    for (const title of titles) {
      const res = await request(app).post('/todos').send({ title });
      expect(res.status).toBe(201);
    }
    
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    
    const returnedTitles = res.body.map(t => t.title);
    for (const title of titles) {
      expect(returnedTitles).toContain(title);
    }
  });

  // ===== RANDOM DATA (prevents hardcoding) =====
  test('POST /todos with random title works', async () => {
    const randomTitle = \`Task-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
    const res = await request(app)
      .post('/todos')
      .send({ title: randomTitle });
    
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(randomTitle);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('number');
  });

  // ===== DEFAULTS =====
  test('POST /todos sets completed to false by default', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: \`Default-\${Date.now()}\` });
    
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(false);
    expect(typeof res.body.completed).toBe('boolean');
  });

  test('POST /todos with completed=true preserves the value', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: \`Completed-\${Date.now()}\`, completed: true });
    
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(true);
  });

  // ===== TIMESTAMP VALIDATION =====
  test('createdAt is a valid ISO date string', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: \`Timestamp-\${Date.now()}\` });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('createdAt');
    
    const date = new Date(res.body.createdAt);
    expect(date.toString()).not.toBe('Invalid Date');
    expect(res.body.createdAt).toMatch(/^\\d{4}-\\d{2}-\\d{2}T/);
  });

  // ===== UPDATE TESTS =====
  test('PUT /todos/:id updates title and completed', async () => {
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Original' });
    
    const updateRes = await request(app)
      .put(\`/todos/\${createRes.body.id}\`)
      .send({ title: 'Updated', completed: true });
    
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated');
    expect(updateRes.body.completed).toBe(true);
  });

  test('PUT /todos/:id changes persist to subsequent GET', async () => {
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Persist Test' });
    
    await request(app)
      .put(\`/todos/\${createRes.body.id}\`)
      .send({ title: 'Persisted', completed: true });
    
    const getRes = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.title).toBe('Persisted');
    expect(getRes.body.completed).toBe(true);
  });

  test('PUT /todos/:id returns 404 for non-existent (after verifying API works)', async () => {
    // First verify the API actually works (prevents false pass on empty app)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify API works' });
    expect(createRes.status).toBe(201);
    
    // Now test 404 for non-existent
    const res = await request(app)
      .put('/todos/999999')
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });

  // ===== DELETE TESTS =====
  test('DELETE /todos/:id removes the todo', async () => {
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Delete me' });
    
    const deleteRes = await request(app).delete(\`/todos/\${createRes.body.id}\`);
    expect(deleteRes.status).toBe(200);
    
    const getRes = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(getRes.status).toBe(404);
  });

  test('DELETE /todos/:id only removes target item (isolation)', async () => {
    const a = await request(app).post('/todos').send({ title: 'Keep A' });
    const b = await request(app).post('/todos').send({ title: 'Delete B' });
    const c = await request(app).post('/todos').send({ title: 'Keep C' });
    
    await request(app).delete(\`/todos/\${b.body.id}\`);
    
    const list = await request(app).get('/todos');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(2);
    
    const ids = list.body.map(t => t.id);
    expect(ids).toContain(a.body.id);
    expect(ids).toContain(c.body.id);
    expect(ids).not.toContain(b.body.id);
  });

  test('DELETE /todos/:id returns 404 for non-existent (after verifying API works)', async () => {
    // First verify the API actually works (prevents false pass on empty app)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify API works' });
    expect(createRes.status).toBe(201);
    
    // Now test 404 for non-existent
    const res = await request(app).delete('/todos/999999');
    expect(res.status).toBe(404);
  });

  // ===== COMPLETE FLOW =====
  test('Complete flow: create -> list -> update -> get -> delete', async () => {
    const title = \`Flow-\${Date.now()}\`;
    
    // Create
    const createRes = await request(app)
      .post('/todos')
      .send({ title });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // Verify in list
    const listRes = await request(app).get('/todos');
    expect(listRes.body.some(t => t.id === id)).toBe(true);

    // Update
    const updateRes = await request(app)
      .put(\`/todos/\${id}\`)
      .send({ completed: true });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.completed).toBe(true);

    // Fetch single
    const getRes = await request(app).get(\`/todos/\${id}\`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.completed).toBe(true);
    expect(getRes.body.title).toBe(title);

    // Delete
    const deleteRes = await request(app).delete(\`/todos/\${id}\`);
    expect(deleteRes.status).toBe(200);

    // Verify deleted
    const getDeletedRes = await request(app).get(\`/todos/\${id}\`);
    expect(getDeletedRes.status).toBe(404);
  });

  // ===== EDGE CASES =====
  test('Multiple creates have unique IDs', async () => {
    const res1 = await request(app).post('/todos').send({ title: 'First' });
    const res2 = await request(app).post('/todos').send({ title: 'Second' });
    const res3 = await request(app).post('/todos').send({ title: 'Third' });
    
    expect(res1.body.id).not.toBe(res2.body.id);
    expect(res2.body.id).not.toBe(res3.body.id);
    expect(res1.body.id).not.toBe(res3.body.id);
  });

  test('GET /todos/:id with string ID returns 404 (after verifying API works)', async () => {
    // First verify the API actually works (prevents false pass on empty app)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify API works' });
    expect(createRes.status).toBe(201);
    
    // Now test 404 for invalid ID format
    const res = await request(app).get('/todos/not-a-number');
    expect(res.status).toBe(404);
  });
});
`,

    dependencies: {
        'express': '^4.18.2',
    },

    nodeVersion: '20',

    // Blackbox HTTP Testing Configuration
    // Uncomment below to enable blackbox mode (real server testing)
    /*
    runner: {
        mode: 'http',                    // Use blackbox grader
        candidateImage: 'node:20-alpine', // Docker image for candidate server
        testerImage: 'node:20-alpine',    // Docker image for test runner
        startCommand: 'node src/server.js', // Command to start candidate server
        port: 3000,                       // Port the server listens on
        healthPath: '/todos',             // Health check endpoint
        envVars: {},                      // Optional env vars for server
    },
    */
};

// Note: Reference solution moved to challenges/_solutions/express-todo.ts (gitignored)
