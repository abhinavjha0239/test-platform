// Express Auth API Challenge - JWT Authentication
export const authChallenge = {
    name: 'Express Auth API',
    description: `Build a complete authentication API with Express.js and JWT.

Requirements:
- POST /auth/register - Register new user (email, password, name)
- POST /auth/login - Login and get JWT token
- GET /auth/me - Get current user (protected route, requires valid JWT)

User object should have: id, email, name, createdAt
- Password must be hashed (use bcrypt)
- Password should NEVER be returned in responses
- JWT should contain user id and email
- Protected routes should validate JWT from Authorization header (Bearer token)

Error Responses:
- 400: Missing required fields
- 401: Invalid credentials or missing/invalid token
- 409: Email already exists`,

    starterFiles: {
        'src/app.js': `const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

// In-memory storage
let users = [];
let nextId = 1;

// JWT secret (in production, use environment variable)
const JWT_SECRET = 'your-secret-key';

// TODO: Implement the following endpoints:
// POST /auth/register - Register new user
// POST /auth/login - Login and get JWT
// GET /auth/me - Get current user (protected)

// Hint: Create an auth middleware to verify JWT tokens

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

describe('Auth API - Public Tests', () => {
  test('POST /auth/register creates a new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ 
        email: 'test@example.com', 
        password: 'password123', 
        name: 'Test User' 
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('test@example.com');
    expect(res.body.name).toBe('Test User');
    expect(res.body).not.toHaveProperty('password');
  });

  test('POST /auth/login returns a token', async () => {
    // First register
    await request(app)
      .post('/auth/register')
      .send({ 
        email: 'login@example.com', 
        password: 'password123', 
        name: 'Login User' 
      });
    
    // Then login
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  test('GET /auth/me returns 401 without token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /auth/me with valid token returns user data', async () => {
    // Register
    await request(app)
      .post('/auth/register')
      .send({ 
        email: 'me@example.com', 
        password: 'password123', 
        name: 'Me User' 
      });
    
    // Login
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'me@example.com', password: 'password123' });
    
    // Access protected route
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', \`Bearer \${loginRes.body.token}\`);
    
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('me@example.com');
    expect(res.body).not.toHaveProperty('password');
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

describe('Auth API - Hidden Tests', () => {
  // ===== REGISTRATION TESTS =====
  test('Register with random email works', async () => {
    const email = \`user-\${Date.now()}-\${Math.random().toString(36).slice(2)}@test.com\`;
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'securePass123', name: 'Random User' });
    
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('createdAt');
  });

  test('Register without email returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ password: 'password123', name: 'No Email' });
    expect(res.status).toBe(400);
  });

  test('Register without password returns 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'nopass@test.com', name: 'No Pass' });
    expect(res.status).toBe(400);
  });

  test('Register with duplicate email returns 409', async () => {
    const email = \`dup-\${Date.now()}@test.com\`;
    
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'pass123', name: 'First' });
    
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'pass456', name: 'Second' });
    
    expect(res.status).toBe(409);
  });

  test('Password is NOT returned in registration response', async () => {
    const password = 'supersecret123';
    const res = await request(app)
      .post('/auth/register')
      .send({ 
        email: \`sec-\${Date.now()}@test.com\`, 
        password, 
        name: 'Secure' 
      });
    
    expect(res.body).not.toHaveProperty('password');
    expect(JSON.stringify(res.body)).not.toContain(password);
  });

  // ===== LOGIN TESTS =====
  test('Login with correct credentials returns valid JWT structure', async () => {
    const email = \`jwt-\${Date.now()}@test.com\`;
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'jwtpass123', name: 'JWT User' });
    
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'jwtpass123' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    
    // Token should be a valid JWT structure (header.payload.signature)
    const parts = res.body.token.split('.');
    expect(parts.length).toBe(3);
  });

  test('Login with wrong password returns 401', async () => {
    const email = \`wrongpass-\${Date.now()}@test.com\`;
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'correctpass', name: 'Wrong Pass User' });
    
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'wrongpass' });
    
    expect(res.status).toBe(401);
  });

  test('Login with non-existent user returns 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nonexistent@test.com', password: 'anypass' });
    
    expect(res.status).toBe(401);
  });

  test('Login without email returns 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'somepass' });
    
    expect(res.status).toBe(400);
  });

  test('Login without password returns 400', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@test.com' });
    
    expect(res.status).toBe(400);
  });

  // ===== PROTECTED ROUTE TESTS =====
  test('GET /auth/me with valid token returns correct user data', async () => {
    const email = \`me-\${Date.now()}@test.com\`;
    const name = 'Protected User';
    
    await request(app)
      .post('/auth/register')
      .send({ email, password: 'mepass123', name });
    
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'mepass123' });
    
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', \`Bearer \${loginRes.body.token}\`);
    
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(res.body.name).toBe(name);
    expect(res.body).toHaveProperty('id');
    expect(res.body).not.toHaveProperty('password');
  });

  test('GET /auth/me with invalid token returns 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    
    expect(res.status).toBe(401);
  });

  test('GET /auth/me with malformed Authorization header returns 401', async () => {
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'NotBearer sometoken');
    
    expect(res.status).toBe(401);
  });

  test('GET /auth/me without Authorization header returns 401', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  // ===== PASSWORD HASHING =====
  test('Password is hashed - login works after registration', async () => {
    const email = \`hash-\${Date.now()}@test.com\`;
    const password = 'plaintextpassword';
    
    await request(app)
      .post('/auth/register')
      .send({ email, password, name: 'Hash Test' });
    
    // Login should still work (password verified against hash)
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  // ===== COMPLETE FLOW =====
  test('Complete flow: register -> login -> access protected route', async () => {
    const email = \`flow-\${Date.now()}@test.com\`;
    const name = 'Flow User';
    
    // Register
    const regRes = await request(app)
      .post('/auth/register')
      .send({ email, password: 'flowpass', name });
    expect(regRes.status).toBe(201);
    expect(regRes.body.email).toBe(email);
    
    // Login
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'flowpass' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
    
    // Access protected route
    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', \`Bearer \${loginRes.body.token}\`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email);
    expect(meRes.body.name).toBe(name);
  });

  // ===== UNIQUE IDs =====
  test('Multiple users have unique IDs', async () => {
    const res1 = await request(app)
      .post('/auth/register')
      .send({ email: \`u1-\${Date.now()}@test.com\`, password: 'pass', name: 'U1' });
    
    const res2 = await request(app)
      .post('/auth/register')
      .send({ email: \`u2-\${Date.now()}@test.com\`, password: 'pass', name: 'U2' });
    
    expect(res1.body.id).not.toBe(res2.body.id);
  });

  // ===== TOKEN ISOLATION =====
  test('Token from one user cannot access another user data', async () => {
    // Register user 1
    const email1 = \`user1-\${Date.now()}@test.com\`;
    await request(app)
      .post('/auth/register')
      .send({ email: email1, password: 'pass1', name: 'User 1' });
    
    // Register user 2
    const email2 = \`user2-\${Date.now()}@test.com\`;
    await request(app)
      .post('/auth/register')
      .send({ email: email2, password: 'pass2', name: 'User 2' });
    
    // Login as user 1
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: email1, password: 'pass1' });
    
    // Access /me with user 1's token should return user 1's data
    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', \`Bearer \${loginRes.body.token}\`);
    
    expect(meRes.body.email).toBe(email1);
    expect(meRes.body.email).not.toBe(email2);
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

// Note: Reference solution in challenges/_solutions/express-auth.ts (gitignored)


