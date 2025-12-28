// Sample Express Todo Challenge - Starter Files
export const todoChallenge = {
    name: 'Express Todo API',
    description: `Build a complete REST API for a Todo application using Express.js.

Requirements:
- GET /todos - Return all todos
- GET /todos/:id - Return single todo by ID
- POST /todos - Create a new todo (body: { title, completed? })
- PUT /todos/:id - Update a todo
- DELETE /todos/:id - Delete a todo

Each todo should have: id, title, completed (boolean), createdAt`,

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

    publicTests: `const request = require('supertest');
const app = require('../src/app');

describe('Todo API - Public Tests', () => {
  beforeEach(() => {
    // Reset state between tests if needed
  });

  test('GET /todos should return an array', async () => {
    const res = await request(app).get('/todos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('POST /todos should create a new todo', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Test todo' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.title).toBe('Test todo');
  });

  test('GET /todos/:id should return a single todo', async () => {
    // First create a todo
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Find me' });
    
    const res = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Find me');
  });
});
`,

    hiddenTests: `const request = require('supertest');
const app = require('../src/app');

describe('Todo API - Hidden Tests', () => {
  test('POST /todos with random title should work', async () => {
    const randomTitle = \`Task-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`;
    const res = await request(app)
      .post('/todos')
      .send({ title: randomTitle });
    
    expect(res.status).toBe(201);
    expect(res.body.title).toBe(randomTitle);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('completed');
  });

  test('PUT /todos/:id should update a todo', async () => {
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Update me' });
    
    const updateRes = await request(app)
      .put(\`/todos/\${createRes.body.id}\`)
      .send({ title: 'Updated', completed: true });
    
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated');
    expect(updateRes.body.completed).toBe(true);
  });

  test('DELETE /todos/:id should delete a todo', async () => {
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Delete me' });
    
    const deleteRes = await request(app).delete(\`/todos/\${createRes.body.id}\`);
    expect(deleteRes.status).toBe(200);
    
    const getRes = await request(app).get(\`/todos/\${createRes.body.id}\`);
    expect(getRes.status).toBe(404);
  });

  test('GET /todos/:id with non-existent ID should return 404', async () => {
    const res = await request(app).get('/todos/99999');
    expect(res.status).toBe(404);
  });

  test('Chained flow: create -> update -> fetch -> delete', async () => {
    // Create
    const createRes = await request(app)
      .post('/todos')
      .send({ title: 'Chain test' });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    // Update
    const updateRes = await request(app)
      .put(\`/todos/\${id}\`)
      .send({ completed: true });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.completed).toBe(true);

    // Fetch
    const getRes = await request(app).get(\`/todos/\${id}\`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.completed).toBe(true);

    // Delete
    const deleteRes = await request(app).delete(\`/todos/\${id}\`);
    expect(deleteRes.status).toBe(200);
  });

  test('POST /todos without title should return 400', async () => {
    const res = await request(app)
      .post('/todos')
      .send({});
    expect(res.status).toBe(400);
  });

  test('Todo should have createdAt timestamp', async () => {
    const res = await request(app)
      .post('/todos')
      .send({ title: 'Timestamp test' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('createdAt');
  });
});
`,

    dependencies: {
        'express': '^4.18.2',
    },

    nodeVersion: '20',
};

// Example of a complete solution for reference (not exposed to candidates)
export const todoSolution = `const express = require('express');
const app = express();

app.use(express.json());

let todos = [];
let nextId = 1;

// GET all todos
app.get('/todos', (req, res) => {
  res.json(todos);
});

// GET single todo
app.get('/todos/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id));
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  res.json(todo);
});

// POST create todo
app.post('/todos', (req, res) => {
  const { title, completed = false } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const todo = {
    id: nextId++,
    title,
    completed,
    createdAt: new Date().toISOString(),
  };
  
  todos.push(todo);
  res.status(201).json(todo);
});

// PUT update todo
app.put('/todos/:id', (req, res) => {
  const todo = todos.find(t => t.id === parseInt(req.params.id));
  if (!todo) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  if (req.body.title !== undefined) todo.title = req.body.title;
  if (req.body.completed !== undefined) todo.completed = req.body.completed;
  
  res.json(todo);
});

// DELETE todo
app.delete('/todos/:id', (req, res) => {
  const index = todos.findIndex(t => t.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: 'Todo not found' });
  }
  
  const deleted = todos.splice(index, 1);
  res.json(deleted[0]);
});

module.exports = app;
`;
