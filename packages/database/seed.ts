import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Define challenges inline to avoid ESM import issues
const todoChallenge = {
    name: 'Express Todo API',
    description: `Build a complete REST API for a Todo application using Express.js.

Requirements:
- GET /todos - Return all todos
- GET /todos/:id - Return single todo by ID
- POST /todos - Create a new todo (body: { title, completed? })
- PUT /todos/:id - Update a todo
- DELETE /todos/:id - Delete a todo

Each todo should have: id, title, completed (boolean), createdAt
- IDs should be auto-generated and unique
- completed should default to false
- createdAt should be set automatically

Error Responses:
- 404: Todo not found (for GET/:id, PUT/:id, DELETE/:id)
- 400: Missing required fields`,
    starterFiles: {
        'src/app.js': `const express = require('express');
const app = express();

app.use(express.json());

// In-memory storage
let todos = [];
let nextId = 1;

// TODO: Implement the following endpoints:
// GET /todos - Return all todos
// GET /todos/:id - Return single todo by ID
// POST /todos - Create a new todo
// PUT /todos/:id - Update a todo
// DELETE /todos/:id - Delete a todo

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
    publicTests: `const request = require('supertest');

let app;

beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Todo API - Public Tests', () => {
  test('GET /todos returns empty array initially', async () => {
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /todos creates a new todo', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Test todo' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test todo');
  });
});
`,
    hiddenTests: `const request = require('supertest');

let app;

beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Todo API - Hidden Tests', () => {
  test('GET /todos returns all created items', async () => {
    const titles = [\`A-\${Date.now()}\`, \`B-\${Date.now()}\`];
    for (const title of titles) {
      await request(app).post('/todos').send({ title });
    }
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  test('PUT on non-existent todo returns 404', async () => {
    const res = await request(app)
      .put('/todos/99999')
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  test('DELETE on non-existent todo returns 404', async () => {
    const res = await request(app).delete('/todos/99999');
    expect(res.status).toBe(404);
  });

  test('Todo defaults to completed: false', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Check default' });
    expect(res.body.completed).toBe(false);
  });
});
`,
    dependencies: {
        'express': '^4.18.2',
    },
    nodeVersion: '20',
};

const authChallenge = {
    name: 'Express Auth API',
    description: `Build a complete authentication API with Express.js and JWT.

Requirements:
- POST /auth/register - Register new user (email, password, name)
- POST /auth/login - Login and get JWT token
- GET /auth/me - Get current user (protected route, requires valid JWT)

User object should have: id, email, name, createdAt
- Password must be hashed (use bcrypt)
- Password should NEVER be returned in responses
- JWT should contain user id and email`,
    starterFiles: {
        'src/app.js': `const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// In-memory storage
let users = [];
let nextId = 1;

const JWT_SECRET = 'your-secret-key';

// TODO: Implement the following endpoints:
// POST /auth/register
// POST /auth/login
// GET /auth/me (protected)

module.exports = app;
`,
        'src/server.js': `const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
    },
    publicTests: `const request = require('supertest');

let app;

beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Auth API - Public Tests', () => {
  test('POST /auth/register creates a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Test User' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('test@example.com');
    expect(res.body).not.toHaveProperty('password');
  });

  test('POST /auth/login returns a token', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'password123', name: 'Login User' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
});
`,
    hiddenTests: `const request = require('supertest');

let app;

beforeEach(() => {
  jest.resetModules();
  app = require('../src/app');
});

describe('Auth API - Hidden Tests', () => {
  test('Register with duplicate email returns 409', async () => {
    const email = \`dup-\${Date.now()}@test.com\`;
    await request(app).post('/auth/register').send({ email, password: 'pass123', name: 'First' });
    const res = await request(app).post('/auth/register').send({ email, password: 'pass456', name: 'Second' });
    expect(res.status).toBe(409);
  });

  test('Login with wrong password returns 401', async () => {
    const email = \`wrongpass-\${Date.now()}@test.com\`;
    await request(app).post('/auth/register').send({ email, password: 'correctpass', name: 'User' });
    const res = await request(app).post('/auth/login').send({ email, password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('GET /auth/me without token returns 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /auth/me with valid token returns user data', async () => {
    const email = \`me-\${Date.now()}@test.com\`;
    await request(app).post('/auth/register').send({ email, password: 'mepass123', name: 'Me User' });
    const loginRes = await request(app).post('/auth/login').send({ email, password: 'mepass123' });
    const res = await request(app).get('/auth/me').set('Authorization', \`Bearer \${loginRes.body.token}\`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
  });
});
`,
    dependencies: {
        'express': '^4.18.2',
        'bcrypt': '^5.1.1',
        'jsonwebtoken': '^9.0.2',
    },
    nodeVersion: '20',
};

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // Create admin user (with approved status)
        const [admin] = await db.insert(schema.users).values({
            email: 'admin@examplatform.com',
            password: '$2a$12$LQv3c1yqBwLHVgEtS0.X6.5VHwMbz5FLNVxBPpZrjSwKQWxFGBH5K', // "admin123"
            name: 'Admin User',
            role: 'ADMIN',
            approvalStatus: 'APPROVED',
            approvedAt: new Date(),
        }).onConflictDoNothing().returning();

        console.log('✅ Admin user created:', admin?.email || 'already exists');
        console.log('   Email: admin@examplatform.com');
        console.log('   Password: admin123');

        // Get admin ID (either new or existing)
        let adminId = admin?.id;
        if (!adminId) {
            const existingAdmin = await db.query.users.findFirst({
                where: (users, { eq }) => eq(users.email, 'admin@examplatform.com'),
            });
            adminId = existingAdmin?.id;
        }

        // Create Todo challenge
        const [todoChallengeSaved] = await db.insert(schema.challenges).values({
            name: todoChallenge.name,
            description: todoChallenge.description,
            starterFiles: todoChallenge.starterFiles,
            publicTests: todoChallenge.publicTests,
            hiddenTests: todoChallenge.hiddenTests,
            dependencies: todoChallenge.dependencies,
            nodeVersion: todoChallenge.nodeVersion,
            createdBy: adminId,
        }).onConflictDoNothing().returning();

        console.log('✅ Todo Challenge created:', todoChallengeSaved?.name || 'already exists');

        // Create Auth challenge
        const [authChallengeSaved] = await db.insert(schema.challenges).values({
            name: authChallenge.name,
            description: authChallenge.description,
            starterFiles: authChallenge.starterFiles,
            publicTests: authChallenge.publicTests,
            hiddenTests: authChallenge.hiddenTests,
            dependencies: authChallenge.dependencies,
            nodeVersion: authChallenge.nodeVersion,
            createdBy: adminId,
        }).onConflictDoNothing().returning();

        console.log('✅ Auth Challenge created:', authChallengeSaved?.name || 'already exists');

        // Get challenge IDs
        let todoChallengeId = todoChallengeSaved?.id;
        let authChallengeId = authChallengeSaved?.id;

        if (!todoChallengeId) {
            const existing = await db.query.challenges.findFirst({
                where: (challenges, { eq }) => eq(challenges.name, todoChallenge.name),
            });
            todoChallengeId = existing?.id;
        }

        if (!authChallengeId) {
            const existing = await db.query.challenges.findFirst({
                where: (challenges, { eq }) => eq(challenges.name, authChallenge.name),
            });
            authChallengeId = existing?.id;
        }

        // Create sample exams
        if (todoChallengeId && adminId) {
            const [exam1] = await db.insert(schema.exams).values({
                title: 'Node.js Express Assessment - Todo API',
                description: 'Test your Express.js API development skills by building a Todo API.',
                challengeId: todoChallengeId,
                timeLimit: 60, // 60 minutes
                maxAttempts: 2,
                passThreshold: 0.6,
                fullscreenRequired: true,
                tabSwitchLogging: true,
                pasteDisabled: true,
                isPublished: true,
                publishedAt: new Date(),
                createdBy: adminId,
            }).onConflictDoNothing().returning();

            console.log('✅ Todo Exam created:', exam1?.title || 'already exists');
        }

        if (authChallengeId && adminId) {
            const [exam2] = await db.insert(schema.exams).values({
                title: 'Node.js Auth Assessment - JWT API',
                description: 'Build a secure authentication API with JWT tokens and password hashing.',
                challengeId: authChallengeId,
                timeLimit: 90, // 90 minutes
                maxAttempts: 2,
                passThreshold: 0.7,
                fullscreenRequired: true,
                tabSwitchLogging: true,
                pasteDisabled: true,
                isPublished: true,
                publishedAt: new Date(),
                createdBy: adminId,
            }).onConflictDoNothing().returning();

            console.log('✅ Auth Exam created:', exam2?.title || 'already exists');
        }

        console.log('\n🎉 Seeding complete!');
        console.log('\n📋 Seed Summary:');
        console.log('   - Admin: admin@examplatform.com / admin123');
        console.log('   - 2 Challenges: Todo API, Auth API');
        console.log('   - 2 Published Exams ready for candidates');
    } catch (error) {
        console.error('❌ Seeding error:', error);
        throw error;
    } finally {
        await client.end();
    }
}

seed();
