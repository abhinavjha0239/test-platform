import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from './src/schema.js';

// Import React ui_jsdom challenges
import { challenge as expenseTrackerChallenge } from '../../challenges/react-expense-tracker/challenge.js';
import { challenge as bookmarkManagerChallenge } from '../../challenges/react-bookmark-manager/challenge.js';
import { challenge as studentRosterChallenge } from '../../challenges/react-student-roster/challenge.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

// ============================================================
// UPDATED TODO CHALLENGE - with loophole-free tests
// ============================================================
const todoPublicTests = `const request = require('supertest');

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
    // First verify the API actually works (prevents false pass on empty app)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify API works' });
    expect(createRes.status).toBe(201);
    
    // Now test 404 for non-existent
    const res = await request(app).get('/todos/99999');
    expect(res.status).toBe(404);
  });

  test('POST /todos without title should return 400', async () => {
    // First verify the API actually works (prevents false pass on empty app)
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Verify API works' });
    expect(createRes.status).toBe(201);
    
    // Now test 400 for missing title
    const res = await request(app)
      .post('/todos')
      .send({});
    expect(res.status).toBe(400);
  });
});
`;

const todoHiddenTests = `const request = require('supertest');

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
`;

// ============================================================
// BLACKBOX TODO CHALLENGE - HTTP testing with real server
// ============================================================
const todoBlackboxPublicTests = `const request = require('supertest');

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
  });

  test('GET /todos/:id should return 404 for non-existent', async () => {
    const res = await request(BASE_URL).get('/todos/99999');
    expect(res.status).toBe(404);
  });

  test('POST /todos without title should return 400', async () => {
    const res = await request(BASE_URL)
      .post('/todos')
      .send({});
    expect(res.status).toBe(400);
  });
});
`;

const todoBlackboxHiddenTests = `const request = require('supertest');

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

  // ===== CORE CRUD OPERATIONS =====
  
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
    const createRes = await createTodo('Persist Test');
    
    await request(BASE_URL)
      .put('/todos/' + createRes.body.id)
      .send({ title: 'Persisted', completed: true });
    
    const getRes = await request(BASE_URL).get('/todos/' + createRes.body.id);
    expect(getRes.status).toBe(200);
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

  // ===== DEFAULTS AND STRUCTURE =====

  test('Todo defaults to completed: false', async () => {
    const res = await createTodo('Check default');
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

  test('createdAt is a valid ISO date string', async () => {
    const res = await createTodo('Timestamp test');
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('createdAt');
    
    const date = new Date(res.body.createdAt);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  test('Multiple todos have unique IDs', async () => {
    const a = await createTodo('First');
    const b = await createTodo('Second');
    const c = await createTodo('Third');
    
    const ids = new Set([a.body.id, b.body.id, c.body.id]);
    expect(ids.size).toBe(3);
  });

  // ===== 404 TESTS (with API verification) =====

  test('PUT /todos/:id returns 404 for non-existent', async () => {
    // First verify API works
    const createRes = await createTodo('Verify API');
    expect(createRes.status).toBe(201);
    
    // Now test 404
    const res = await request(BASE_URL)
      .put('/todos/999999')
      .send({ title: 'Ghost' });
    expect(res.status).toBe(404);
  });

  test('DELETE /todos/:id returns 404 for non-existent', async () => {
    // First verify API works
    const createRes = await createTodo('Verify API');
    expect(createRes.status).toBe(201);
    
    // Now test 404
    const res = await request(BASE_URL).delete('/todos/999999');
    expect(res.status).toBe(404);
  });

  // ===== EDGE CASES =====

  test('GET /todos/:id with string ID returns 404', async () => {
    const res = await request(BASE_URL).get('/todos/not-a-number');
    expect(res.status).toBe(404);
  });

  test('Complete CRUD flow works', async () => {
    const title = 'Flow-' + Date.now();
    
    // Create
    const createRes = await request(BASE_URL)
      .post('/todos')
      .send({ title });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // Verify in list
    const listRes = await request(BASE_URL).get('/todos');
    expect(listRes.body.some(t => t.id === id)).toBe(true);

    // Update
    const updateRes = await request(BASE_URL)
      .put('/todos/' + id)
      .send({ completed: true });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.completed).toBe(true);

    // Fetch single
    const getRes = await request(BASE_URL).get('/todos/' + id);
    expect(getRes.status).toBe(200);
    expect(getRes.body.completed).toBe(true);

    // Delete
    const deleteRes = await request(BASE_URL).delete('/todos/' + id);
    expect(deleteRes.status).toBe(200);

    // Verify deleted
    const getDeletedRes = await request(BASE_URL).get('/todos/' + id);
    expect(getDeletedRes.status).toBe(404);
  });
});
`;

const todoBlackboxRunner = {
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
};

async function syncChallenges() {
    console.log('🔄 Syncing challenges to database...\n');

    try {
        // Get admin user for createdBy
        const admin = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.role, 'ADMIN'),
        });

        // Sync Todo Challenge (Jest mode)
        const existingTodo = await db.query.challenges.findFirst({
            where: (challenges, { eq }) => eq(challenges.name, 'Express Todo API'),
        });

        if (existingTodo) {
            await db.update(schema.challenges)
                .set({
                    publicTests: todoPublicTests,
                    hiddenTests: todoHiddenTests,
                })
                .where(eq(schema.challenges.id, existingTodo.id));
            console.log('✅ Updated: Express Todo API');
            console.log('   - Fixed loophole in 404 tests (now verify API works first)');
        } else {
            console.log('⚠️  Challenge not found: Express Todo API (run seed first)');
        }

        // Sync/Create Blackbox Todo Challenge
        const existingBlackbox = await db.query.challenges.findFirst({
            where: (challenges, { eq }) => eq(challenges.name, 'Express Todo API (Blackbox)'),
        });

        if (existingBlackbox) {
            await db.update(schema.challenges)
                .set({
                    publicTests: todoBlackboxPublicTests,
                    hiddenTests: todoBlackboxHiddenTests,
                    runner: todoBlackboxRunner,
                })
                .where(eq(schema.challenges.id, existingBlackbox.id));
            console.log('✅ Updated: Express Todo API (Blackbox)');
        } else if (admin) {
            // Create new blackbox challenge
            await db.insert(schema.challenges).values({
                name: 'Express Todo API (Blackbox)',
                description: `Build a complete REST API for a Todo application using Express.js.

This challenge uses BLACKBOX testing - your server will actually run and tests will make HTTP requests to it.

Requirements:
- GET /todos - Return all todos
- GET /todos/:id - Return single todo by ID
- POST /todos - Create a new todo (body: { title, completed? })
- PUT /todos/:id - Update a todo
- DELETE /todos/:id - Delete a todo

Server must listen on PORT environment variable (default 3000).`,
                starterFiles: {
                    'src/app.js': `const express = require('express');
const app = express();

app.use(express.json());

let todos = [];
let nextId = 1;

// TODO: Implement endpoints
// GET /todos, GET /todos/:id, POST /todos, PUT /todos/:id, DELETE /todos/:id

module.exports = app;
`,
                    'src/server.js': `const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
                },
                publicTests: todoBlackboxPublicTests,
                hiddenTests: todoBlackboxHiddenTests,
                dependencies: { 'express': '^4.18.2' },
                nodeVersion: '20',
                runner: todoBlackboxRunner,
                createdBy: admin.id,
            });
            console.log('✅ Created: Express Todo API (Blackbox)');
            console.log('   - Uses HTTP blackbox testing (real server)');
        } else {
            console.log('⚠️  Cannot create Blackbox challenge: No admin user found');
        }

        console.log('\n🎉 Challenge sync complete!');
        console.log('   New exam attempts will use the updated tests.');

    } catch (error) {
        console.error('❌ Sync error:', error);
        throw error;
    } finally {
        await client.end();
    }
}

syncChallenges();
