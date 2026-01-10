import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Expense Tracker API (Multi-file Architecture)',
  description: `# Expense Tracker API

## What You're Building

You're building a **personal finance expense tracker API** that helps users categorize and analyze their spending. This is similar to apps like Mint, YNAB, or any budgeting tool.

This challenge focuses on **clean code architecture** - separating concerns into controllers, services, models, and utilities. You'll work with multiple files that work together.

---

## Project Architecture

\`\`\`
src/
├── controllers/         # Handle HTTP requests/responses
│   ├── categoryController.js
│   └── expenseController.js
├── services/            # Business logic (data manipulation)
│   ├── categoryService.js
│   └── expenseService.js
├── models/              # Data storage (in-memory)
│   ├── categoryModel.js
│   └── expenseModel.js
├── utils/
│   └── validators.js    # Input validation helpers
├── middleware/
│   └── errorHandler.js  # Centralized error handling
├── routes/
│   ├── index.js         # Route aggregation
│   ├── categories.js
│   └── expenses.js
├── app.js               # Express app setup
└── server.js            # Entry point
\`\`\`

**Why this structure?**
- **Controllers** only handle HTTP (req/res) - they don't know about data storage
- **Services** contain business logic - validation, calculations, data manipulation
- **Models** manage data - in this case, simple in-memory storage
- **Utils** are reusable helpers - validation functions used across the app

---

## API Contract

### Categories

#### \`POST /categories\`
Create a new expense category.

**Request:**
\`\`\`json
{ "name": "Food & Dining" }
\`\`\`

**Success (201 Created):**
\`\`\`json
{
  "id": "cat_1",
  "name": "Food & Dining",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
\`\`\`

**Errors:**
- \`400\` - \`{ "error": "name is required" }\`
- \`400\` - \`{ "error": "category already exists" }\`

---

#### \`GET /categories\`
List all categories.

**Success (200 OK):**
\`\`\`json
[
  { "id": "cat_1", "name": "Food & Dining", "createdAt": "..." },
  { "id": "cat_2", "name": "Transportation", "createdAt": "..." }
]
\`\`\`

---

### Expenses

#### \`POST /expenses\`
Create a new expense.

**Request:**
\`\`\`json
{
  "amount": 45.99,
  "description": "Lunch with team",
  "categoryId": "cat_1",
  "date": "2024-01-15"
}
\`\`\`

**Success (201 Created):**
\`\`\`json
{
  "id": "exp_1",
  "amount": 45.99,
  "description": "Lunch with team",
  "categoryId": "cat_1",
  "date": "2024-01-15",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

**Errors:**
- \`400\` - \`{ "error": "amount is required" }\`
- \`400\` - \`{ "error": "amount must be a positive number" }\`
- \`400\` - \`{ "error": "categoryId is required" }\`
- \`400\` - \`{ "error": "category not found" }\`
- \`400\` - \`{ "error": "date is required" }\` (format: YYYY-MM-DD)

---

#### \`GET /expenses\`
List expenses with optional filters.

**Query Parameters:**
- \`?categoryId=cat_1\` - Filter by category
- \`?from=2024-01-01\` - Start date (inclusive)
- \`?to=2024-01-31\` - End date (inclusive)

**Success (200 OK):**
\`\`\`json
[
  {
    "id": "exp_1",
    "amount": 45.99,
    "description": "Lunch with team",
    "categoryId": "cat_1",
    "date": "2024-01-15",
    "createdAt": "..."
  }
]
\`\`\`

---

#### \`GET /expenses/:id\`
Get a single expense.

**Success (200 OK):** Returns the expense object
**Error:** \`404\` - \`{ "error": "expense not found" }\`

---

#### \`PUT /expenses/:id\`
Update an expense.

**Request:** (all fields optional)
\`\`\`json
{
  "amount": 50.00,
  "description": "Updated description"
}
\`\`\`

**Success (200 OK):** Returns updated expense
**Errors:**
- \`404\` - expense not found
- \`400\` - invalid amount (if provided)
- \`400\` - category not found (if categoryId provided)

---

#### \`DELETE /expenses/:id\`
Delete an expense.

**Success (204 No Content)**
**Error:** \`404\` - \`{ "error": "expense not found" }\`

---

### Reports

#### \`GET /reports/summary\`
Get spending summary by category.

**Success (200 OK):**
\`\`\`json
{
  "totalExpenses": 1250.75,
  "expenseCount": 15,
  "byCategory": [
    { "categoryId": "cat_1", "categoryName": "Food & Dining", "total": 450.25, "count": 8 },
    { "categoryId": "cat_2", "categoryName": "Transportation", "total": 800.50, "count": 7 }
  ]
}
\`\`\`

---

#### \`GET /health\`
Health check.

**Success (200 OK):** \`{ "ok": true }\`

---

## Examples

### Example 1: Complete Workflow

\`\`\`bash
# 1. Create a category
curl -X POST http://localhost:3000/categories \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Groceries"}'
# Response: {"id":"cat_1","name":"Groceries","createdAt":"..."}

# 2. Create an expense
curl -X POST http://localhost:3000/expenses \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 85.50, "description": "Weekly groceries", "categoryId": "cat_1", "date": "2024-01-15"}'
# Response: {"id":"exp_1","amount":85.50,...}

# 3. Get the summary
curl http://localhost:3000/reports/summary
# Response: {"totalExpenses":85.50,"expenseCount":1,"byCategory":[...]}
\`\`\`

### Example 2: Filtering Expenses

\`\`\`bash
# Get expenses from January 2024
curl "http://localhost:3000/expenses?from=2024-01-01&to=2024-01-31"

# Get only food expenses
curl "http://localhost:3000/expenses?categoryId=cat_1"

# Combine filters
curl "http://localhost:3000/expenses?categoryId=cat_1&from=2024-01-01"
\`\`\`

---

## Hints (Explore These)

1. **Controller vs Service**: Notice how \`expenseController.js\` calls \`expenseService.js\`. The controller extracts data from \`req\` and sends \`res\`. The service does the actual work. Why is this separation useful?

2. **Validation Pattern**: Look at \`utils/validators.js\`. It exports reusable validation functions. How would you validate that \`amount\` is a positive number?

3. **Error Handling**: The \`middleware/errorHandler.js\` catches errors and formats them consistently. How do you "throw" errors from services so they're caught here?

4. **Date Filtering**: When filtering by date range, remember dates are strings in "YYYY-MM-DD" format. String comparison works for date ranges!

5. **Category Reference**: When creating an expense, you need to verify the \`categoryId\` exists. Where should this check happen - controller or service?

---

## Constraints

- IDs should be prefixed (\`cat_\`, \`exp_\`) followed by an incrementing number
- Amounts must be positive numbers (> 0)
- Dates must be in YYYY-MM-DD format
- Category names must be unique (case-sensitive)
- All timestamps in ISO 8601 format

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Health endpoint | 1 |
| Create category | 2 |
| List categories | 1 |
| Category validation | 2 |
| Create expense | 3 |
| Expense validation | 3 |
| List expenses with filters | 3 |
| Get/Update/Delete expense | 3 |
| Summary report | 3 |

**Total: ~21 tests**
`,

  starterFiles: {
    'src/app.js': `const express = require('express');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Mount all routes
app.use('/', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app;
`,

    'src/server.js': `const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`Expense Tracker API running on port \${PORT}\`);
});
`,

    'src/routes/index.js': `const express = require('express');
const router = express.Router();

const categoryRoutes = require('./categories');
const expenseRoutes = require('./expenses');

// Mount route modules
router.use('/categories', categoryRoutes);
router.use('/expenses', expenseRoutes);

// Reports routes (inline for simplicity)
// TODO: Move to separate reportRoutes if needed
router.get('/reports/summary', (req, res, next) => {
  // TODO: Implement summary report
  // Hint: Import and use expenseService and categoryService
  res.status(501).json({ error: 'not implemented' });
});

module.exports = router;
`,

    'src/routes/categories.js': `const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// POST /categories - Create category
router.post('/', categoryController.create);

// GET /categories - List all categories
router.get('/', categoryController.list);

module.exports = router;
`,

    'src/routes/expenses.js': `const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');

// POST /expenses - Create expense
router.post('/', expenseController.create);

// GET /expenses - List expenses (with filters)
router.get('/', expenseController.list);

// GET /expenses/:id - Get single expense
router.get('/:id', expenseController.getById);

// PUT /expenses/:id - Update expense
router.put('/:id', expenseController.update);

// DELETE /expenses/:id - Delete expense
router.delete('/:id', expenseController.remove);

module.exports = router;
`,

    'src/controllers/categoryController.js': `const categoryService = require('../services/categoryService');

// POST /categories
exports.create = async (req, res, next) => {
  try {
    const { name } = req.body;
    
    // TODO: Validate name is provided
    // TODO: Call categoryService.create(name)
    // TODO: Return 201 with the created category
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};

// GET /categories
exports.list = async (req, res, next) => {
  try {
    // TODO: Call categoryService.getAll()
    // TODO: Return 200 with array of categories
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};
`,

    'src/controllers/expenseController.js': `const expenseService = require('../services/expenseService');

// POST /expenses
exports.create = async (req, res, next) => {
  try {
    const { amount, description, categoryId, date } = req.body;
    
    // TODO: Validate all required fields
    // TODO: Call expenseService.create({ amount, description, categoryId, date })
    // TODO: Return 201 with the created expense
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};

// GET /expenses
exports.list = async (req, res, next) => {
  try {
    const { categoryId, from, to } = req.query;
    
    // TODO: Call expenseService.getAll({ categoryId, from, to })
    // TODO: Return 200 with filtered array of expenses
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};

// GET /expenses/:id
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // TODO: Call expenseService.getById(id)
    // TODO: Return 404 if not found
    // TODO: Return 200 with the expense
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};

// PUT /expenses/:id
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // TODO: Call expenseService.update(id, updates)
    // TODO: Return 404 if not found
    // TODO: Return 200 with updated expense
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};

// DELETE /expenses/:id
exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // TODO: Call expenseService.delete(id)
    // TODO: Return 404 if not found
    // TODO: Return 204 on success
    
    res.status(501).json({ error: 'not implemented' });
  } catch (error) {
    next(error);
  }
};
`,

    'src/services/categoryService.js': `const categoryModel = require('../models/categoryModel');
const { validateRequired } = require('../utils/validators');

// Create a new category
exports.create = (name) => {
  // TODO: Validate name is provided (use validateRequired)
  // TODO: Check if category with same name already exists
  // TODO: Create and return new category using categoryModel
  
  throw new Error('Not implemented');
};

// Get all categories
exports.getAll = () => {
  // TODO: Return all categories from categoryModel
  return [];
};

// Get category by ID
exports.getById = (id) => {
  // TODO: Return category or null if not found
  return null;
};

// Check if category exists
exports.exists = (id) => {
  return !!this.getById(id);
};
`,

    'src/services/expenseService.js': `const expenseModel = require('../models/expenseModel');
const categoryService = require('./categoryService');
const { validateRequired, validatePositiveNumber, validateDate } = require('../utils/validators');

// Create a new expense
exports.create = ({ amount, description, categoryId, date }) => {
  // TODO: Validate required fields
  // TODO: Validate amount is positive number
  // TODO: Validate categoryId exists (use categoryService.exists)
  // TODO: Validate date format (YYYY-MM-DD)
  // TODO: Create and return new expense using expenseModel
  
  throw new Error('Not implemented');
};

// Get all expenses with optional filters
exports.getAll = ({ categoryId, from, to } = {}) => {
  // TODO: Get all expenses from expenseModel
  // TODO: Filter by categoryId if provided
  // TODO: Filter by date range if from/to provided
  // TODO: Return filtered array
  
  return [];
};

// Get expense by ID
exports.getById = (id) => {
  // TODO: Return expense or null
  return null;
};

// Update expense
exports.update = (id, updates) => {
  // TODO: Find expense or throw error
  // TODO: Validate updates (if amount provided, must be positive)
  // TODO: If categoryId provided, validate it exists
  // TODO: Apply updates and return updated expense
  
  throw new Error('Not implemented');
};

// Delete expense
exports.delete = (id) => {
  // TODO: Find expense or throw error
  // TODO: Remove from model
  // TODO: Return true on success
  
  throw new Error('Not implemented');
};

// Get summary report
exports.getSummary = () => {
  // TODO: Calculate total expenses
  // TODO: Group by category with totals and counts
  // TODO: Return { totalExpenses, expenseCount, byCategory: [...] }
  
  return { totalExpenses: 0, expenseCount: 0, byCategory: [] };
};
`,

    'src/models/categoryModel.js': `// In-memory storage for categories
const categories = [];
let idCounter = 0;

// Generate unique ID
const generateId = () => {
  idCounter++;
  return \`cat_\${idCounter}\`;
};

// Create a new category
exports.create = (name) => {
  const category = {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
  };
  categories.push(category);
  return category;
};

// Get all categories
exports.getAll = () => {
  return [...categories];
};

// Find category by ID
exports.findById = (id) => {
  return categories.find(c => c.id === id) || null;
};

// Find category by name
exports.findByName = (name) => {
  return categories.find(c => c.name === name) || null;
};

// Clear all (for testing)
exports.clear = () => {
  categories.length = 0;
  idCounter = 0;
};
`,

    'src/models/expenseModel.js': `// In-memory storage for expenses
const expenses = [];
let idCounter = 0;

// Generate unique ID
const generateId = () => {
  idCounter++;
  return \`exp_\${idCounter}\`;
};

// Create a new expense
exports.create = ({ amount, description, categoryId, date }) => {
  const expense = {
    id: generateId(),
    amount,
    description: description || '',
    categoryId,
    date,
    createdAt: new Date().toISOString(),
  };
  expenses.push(expense);
  return expense;
};

// Get all expenses
exports.getAll = () => {
  return [...expenses];
};

// Find expense by ID
exports.findById = (id) => {
  return expenses.find(e => e.id === id) || null;
};

// Update expense by ID
exports.update = (id, updates) => {
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return null;
  
  expenses[index] = { ...expenses[index], ...updates };
  return expenses[index];
};

// Delete expense by ID
exports.delete = (id) => {
  const index = expenses.findIndex(e => e.id === id);
  if (index === -1) return false;
  
  expenses.splice(index, 1);
  return true;
};

// Clear all (for testing)
exports.clear = () => {
  expenses.length = 0;
  idCounter = 0;
};
`,

    'src/utils/validators.js': `// Validation utility functions
// These throw errors with descriptive messages that will be caught by errorHandler

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

// Check if a value is provided (not null, undefined, or empty string)
exports.validateRequired = (value, fieldName) => {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(\`\${fieldName} is required\`);
  }
  return true;
};

// Check if a value is a positive number
exports.validatePositiveNumber = (value, fieldName) => {
  const num = Number(value);
  if (isNaN(num) || num <= 0) {
    throw new ValidationError(\`\${fieldName} must be a positive number\`);
  }
  return true;
};

// Check if a value is a valid date (YYYY-MM-DD format)
exports.validateDate = (value, fieldName) => {
  const dateRegex = /^\\d{4}-\\d{2}-\\d{2}$/;
  if (!dateRegex.test(value)) {
    throw new ValidationError(\`\${fieldName} must be in YYYY-MM-DD format\`);
  }
  
  // Also check it's a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new ValidationError(\`\${fieldName} is not a valid date\`);
  }
  
  return true;
};

exports.ValidationError = ValidationError;
`,

    'src/middleware/errorHandler.js': `// Centralized error handling middleware
// This catches all errors thrown in controllers/services

module.exports = (err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Handle validation errors (400)
  if (err.name === 'ValidationError' || err.statusCode === 400) {
    return res.status(400).json({ error: err.message });
  }
  
  // Handle not found errors (404)
  if (err.statusCode === 404) {
    return res.status(404).json({ error: err.message });
  }
  
  // Default to 500 Internal Server Error
  res.status(500).json({ error: 'Internal server error' });
};
`,

    'README.md': `# Expense Tracker API

A personal finance expense tracking API with clean code architecture.

## Architecture

This project follows a layered architecture:

\`\`\`
Controllers → Services → Models
     ↓           ↓
   Routes    Validators
\`\`\`

- **Controllers**: Handle HTTP req/res
- **Services**: Business logic
- **Models**: Data storage (in-memory)
- **Utils**: Reusable helpers
- **Middleware**: Error handling

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## Your Task

1. Start with \`categoryService.js\` and \`categoryController.js\`
2. Then implement \`expenseService.js\` and \`expenseController.js\`
3. Finally, add the summary report in \`routes/index.js\`

## Tips

- Look at how models already work - they're mostly complete
- Use the validation utilities in \`utils/validators.js\`
- Errors thrown in services will be caught by \`errorHandler.js\`
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

describe('Expense Tracker API - Public Tests', () => {

  // ==================== HEALTH CHECK ====================
  
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ==================== CATEGORIES ====================

  test('POST /categories creates a category', async () => {
    const res = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Food & Dining' });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^cat_/),
      name: 'Food & Dining',
      createdAt: expect.any(String),
    }));
  });

  test('POST /categories returns 400 when name is missing', async () => {
    // First prove endpoint works
    const okRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Valid Category' });
    expect(okRes.status).toBe(201);

    // Now test error
    const res = await request(BASE_URL)
      .post('/categories')
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name.*required/i);
  });

  test('POST /categories returns 400 for duplicate name', async () => {
    const name = 'Unique Category Test';
    
    // Create first
    const first = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    expect(first.status).toBe(201);
    
    // Try duplicate
    const second = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already exists/i);
  });

  test('GET /categories returns array of categories', async () => {
    // Create a category first
    await request(BASE_URL)
      .post('/categories')
      .send({ name: 'List Test Category' });
    
    const res = await request(BASE_URL).get('/categories');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // ==================== EXPENSES ====================

  test('POST /expenses creates an expense', async () => {
    // Create category first
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Expense Test Category' });
    expect(catRes.status).toBe(201);
    
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 45.99,
        description: 'Test expense',
        categoryId: catRes.body.id,
        date: '2024-01-15',
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^exp_/),
      amount: 45.99,
      description: 'Test expense',
      categoryId: catRes.body.id,
      date: '2024-01-15',
    }));
  });

  test('POST /expenses returns 400 for missing required fields', async () => {
    // Create valid category
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Validation Test Cat' });
    expect(catRes.status).toBe(201);
    
    // Prove endpoint works with valid data
    const okRes = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 10,
        description: 'Valid',
        categoryId: catRes.body.id,
        date: '2024-01-01',
      });
    expect(okRes.status).toBe(201);
    
    // Missing amount
    const res1 = await request(BASE_URL)
      .post('/expenses')
      .send({ categoryId: catRes.body.id, date: '2024-01-01' });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toMatch(/amount.*required/i);
    
    // Missing categoryId
    const res2 = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 10, date: '2024-01-01' });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/categoryId.*required/i);
    
    // Missing date
    const res3 = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 10, categoryId: catRes.body.id });
    expect(res3.status).toBe(400);
    expect(res3.body.error).toMatch(/date.*required/i);
  });

  test('POST /expenses returns 400 for invalid amount', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Amount Validation Cat' });
    expect(catRes.status).toBe(201);
    
    // Negative amount
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: -10,
        categoryId: catRes.body.id,
        date: '2024-01-01',
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/positive/i);
  });

  test('POST /expenses returns 400 for non-existent category', async () => {
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 10,
        categoryId: 'cat_nonexistent',
        date: '2024-01-01',
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category.*not found/i);
  });

  test('GET /expenses returns array of expenses', async () => {
    // Create a category + an expense, then ensure it appears in list
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'List Expenses Cat' });
    expect(catRes.status).toBe(201);

    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 12.34, description: 'List expense', categoryId: catRes.body.id, date: '2024-01-10' });
    expect(expRes.status).toBe(201);

    const res = await request(BASE_URL).get('/expenses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(e => e.id === expRes.body.id)).toBe(true);
  });

  test('GET /expenses?categoryId filters expenses (no empty-list trap)', async () => {
    const cat1 = await request(BASE_URL).post('/categories').send({ name: 'Filter Cat 1' });
    const cat2 = await request(BASE_URL).post('/categories').send({ name: 'Filter Cat 2' });
    expect(cat1.status).toBe(201);
    expect(cat2.status).toBe(201);

    const e1 = await request(BASE_URL).post('/expenses').send({ amount: 1, categoryId: cat1.body.id, date: '2024-01-01', description: 'Cat1' });
    const e2 = await request(BASE_URL).post('/expenses').send({ amount: 2, categoryId: cat2.body.id, date: '2024-01-01', description: 'Cat2' });
    expect(e1.status).toBe(201);
    expect(e2.status).toBe(201);

    const res = await request(BASE_URL).get('/expenses?categoryId=' + cat1.body.id);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const ids = res.body.map(x => x.id);
    expect(ids).toContain(e1.body.id);
    expect(ids).not.toContain(e2.body.id);
    expect(res.body.every(x => x.categoryId === cat1.body.id)).toBe(true);
  });

  test('GET /expenses?from&to filters by date range (no empty-list trap)', async () => {
    const cat = await request(BASE_URL).post('/categories').send({ name: 'Date Filter Cat' });
    expect(cat.status).toBe(201);

    const jan = await request(BASE_URL).post('/expenses').send({ amount: 10, categoryId: cat.body.id, date: '2024-01-15', description: 'Jan' });
    const feb = await request(BASE_URL).post('/expenses').send({ amount: 20, categoryId: cat.body.id, date: '2024-02-15', description: 'Feb' });
    expect(jan.status).toBe(201);
    expect(feb.status).toBe(201);

    const res = await request(BASE_URL).get('/expenses?from=2024-01-01&to=2024-01-31');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map(x => x.id);
    expect(ids).toContain(jan.body.id);
    expect(ids).not.toContain(feb.body.id);
    expect(res.body.every(x => x.date >= '2024-01-01' && x.date <= '2024-01-31')).toBe(true);
  });

  test('GET /expenses/:id returns single expense', async () => {
    // Create category and expense
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Get By ID Cat' });
    expect(catRes.status).toBe(201);
    
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 100,
        categoryId: catRes.body.id,
        date: '2024-01-15',
      });
    expect(expRes.status).toBe(201);
    
    const res = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(expRes.body.id);
  });

  test('GET /expenses/:id returns 404 for non-existent expense', async () => {
    // First prove endpoint works
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Get 404 Cat' });
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 10, categoryId: catRes.body.id, date: '2024-01-01' });
    const validGet = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    expect(validGet.status).toBe(200);
    
    // Now test 404
    const res = await request(BASE_URL).get('/expenses/exp_nonexistent');
    expect(res.status).toBe(404);
  });

  test('PUT /expenses/:id updates expense', async () => {
    // Create expense
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Update Test Cat' });
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 50,
        description: 'Original',
        categoryId: catRes.body.id,
        date: '2024-01-15',
      });
    expect(expRes.status).toBe(201);
    
    // Update
    const res = await request(BASE_URL)
      .put('/expenses/' + expRes.body.id)
      .send({ amount: 75, description: 'Updated' });
    
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(75);
    expect(res.body.description).toBe('Updated');
  });

  test('DELETE /expenses/:id deletes expense', async () => {
    // Create expense
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Delete Test Cat' });
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 25,
        categoryId: catRes.body.id,
        date: '2024-01-15',
      });
    expect(expRes.status).toBe(201);
    
    // Delete
    const res = await request(BASE_URL).delete('/expenses/' + expRes.body.id);
    expect(res.status).toBe(204);
    
    // Verify deleted
    const getRes = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    expect(getRes.status).toBe(404);
  });

  // ==================== REPORTS ====================

  test('GET /reports/summary returns spending summary', async () => {
    // Create category and expense
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Summary Test Cat' });
    expect(catRes.status).toBe(201);
    
    await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: 100,
        categoryId: catRes.body.id,
        date: '2024-01-15',
      });
    
    const res = await request(BASE_URL).get('/reports/summary');
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      totalExpenses: expect.any(Number),
      expenseCount: expect.any(Number),
      byCategory: expect.any(Array),
    }));
  });

});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('BASE_URL is required');

// Randomization helpers
const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const randomAmount = () => parseFloat((Math.random() * 500 + 1).toFixed(2));
const randomDate = () => {
  const year = 2024;
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return \`\${year}-\${month}-\${day}\`;
};

describe('Expense Tracker API - Hidden Tests (Anti-Hardcoding)', () => {

  // ==================== CATEGORIES (RANDOMIZED) ====================

  test('POST /categories works with random category names', async () => {
    const name = 'Category_' + randomString();
    
    const res = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.id).toMatch(/^cat_/);
  });

  test('Duplicate detection works with random names', async () => {
    const name = 'DupTest_' + randomString();
    
    const first = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    expect(first.status).toBe(201);
    
    const second = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    expect(second.status).toBe(400);
  });

  test('GET /categories includes newly created random categories', async () => {
    const name = 'ListTest_' + randomString();
    
    const createRes = await request(BASE_URL)
      .post('/categories')
      .send({ name });
    expect(createRes.status).toBe(201);
    
    const listRes = await request(BASE_URL).get('/categories');
    expect(listRes.status).toBe(200);
    
    const found = listRes.body.find(c => c.name === name);
    expect(found).toBeDefined();
    expect(found.id).toBe(createRes.body.id);
  });

  // ==================== EXPENSES (RANDOMIZED) ====================

  test('POST /expenses works with random amounts and descriptions', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'ExpCat_' + randomString() });
    expect(catRes.status).toBe(201);
    
    const amount = randomAmount();
    const description = 'Desc_' + randomString();
    const date = randomDate();
    
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount,
        description,
        categoryId: catRes.body.id,
        date,
      });
    
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(amount);
    expect(res.body.description).toBe(description);
    expect(res.body.date).toBe(date);
  });

  test('Expense validation rejects random invalid category IDs', async () => {
    const invalidCatId = 'cat_invalid_' + randomString();
    
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: randomAmount(),
        categoryId: invalidCatId,
        date: randomDate(),
      });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category.*not found/i);
  });

  test('Expense amount validation rejects zero and negative random values', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'AmtVal_' + randomString() });
    expect(catRes.status).toBe(201);
    
    const negativeAmount = -(Math.random() * 100 + 1);
    
    const res = await request(BASE_URL)
      .post('/expenses')
      .send({
        amount: negativeAmount,
        categoryId: catRes.body.id,
        date: randomDate(),
      });
    
    expect(res.status).toBe(400);
  });

  // ==================== FILTERING (RANDOMIZED) ====================

  test('GET /expenses?categoryId filters correctly with random data', async () => {
    // Create two categories
    const cat1 = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Filter1_' + randomString() });
    const cat2 = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Filter2_' + randomString() });
    
    // Create expenses in each
    const exp1 = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: randomAmount(), categoryId: cat1.body.id, date: randomDate() });
    const exp2 = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: randomAmount(), categoryId: cat2.body.id, date: randomDate() });
    
    // Filter by first category
    const filtered = await request(BASE_URL)
      .get('/expenses?categoryId=' + cat1.body.id);
    
    expect(filtered.status).toBe(200);
    const ids = filtered.body.map(e => e.id);
    expect(ids).toContain(exp1.body.id);
    expect(ids).not.toContain(exp2.body.id);
  });

  test('GET /expenses?from&to filters by date range', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'DateFilter_' + randomString() });
    
    // Create expenses on specific dates
    const jan = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 50, categoryId: catRes.body.id, date: '2024-01-15' });
    const feb = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 60, categoryId: catRes.body.id, date: '2024-02-15' });
    const mar = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 70, categoryId: catRes.body.id, date: '2024-03-15' });
    
    // Filter January only
    const janFilter = await request(BASE_URL)
      .get('/expenses?from=2024-01-01&to=2024-01-31');
    
    expect(janFilter.status).toBe(200);
    const janIds = janFilter.body.map(e => e.id);
    expect(janIds).toContain(jan.body.id);
    expect(janIds).not.toContain(feb.body.id);
    expect(janIds).not.toContain(mar.body.id);
  });

  // ==================== CRUD (RANDOMIZED) ====================

  test('GET /expenses/:id returns correct random expense', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'GetById_' + randomString() });
    
    const amount = randomAmount();
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount, categoryId: catRes.body.id, date: randomDate() });
    
    const getRes = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.amount).toBe(amount);
  });

  test('PUT /expenses/:id updates with random values', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Update_' + randomString() });
    
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 100, categoryId: catRes.body.id, date: '2024-01-01' });
    
    const newAmount = randomAmount();
    const newDesc = 'Updated_' + randomString();
    
    const updateRes = await request(BASE_URL)
      .put('/expenses/' + expRes.body.id)
      .send({ amount: newAmount, description: newDesc });
    
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.amount).toBe(newAmount);
    expect(updateRes.body.description).toBe(newDesc);
  });

  test('DELETE /expenses/:id works with random expense', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'Delete_' + randomString() });
    
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: randomAmount(), categoryId: catRes.body.id, date: randomDate() });
    
    const delRes = await request(BASE_URL).delete('/expenses/' + expRes.body.id);
    expect(delRes.status).toBe(204);
    
    const getRes = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    expect(getRes.status).toBe(404);
  });

  // ==================== REPORTS (RANDOMIZED) ====================

  test('Summary report calculates correct totals with random amounts', async () => {
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: 'SumTest_' + randomString() });
    
    const amount1 = randomAmount();
    const amount2 = randomAmount();
    
    await request(BASE_URL)
      .post('/expenses')
      .send({ amount: amount1, categoryId: catRes.body.id, date: randomDate() });
    await request(BASE_URL)
      .post('/expenses')
      .send({ amount: amount2, categoryId: catRes.body.id, date: randomDate() });
    
    const summaryRes = await request(BASE_URL).get('/reports/summary');
    
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.totalExpenses).toBeGreaterThanOrEqual(amount1 + amount2);
    expect(summaryRes.body.expenseCount).toBeGreaterThanOrEqual(2);
    
    // Find this category in byCategory
    const catSummary = summaryRes.body.byCategory.find(
      c => c.categoryId === catRes.body.id
    );
    expect(catSummary).toBeDefined();
    expect(catSummary.total).toBeCloseTo(amount1 + amount2, 2);
    expect(catSummary.count).toBe(2);
  });

  // ==================== 404 HANDLING (RANDOMIZED) ====================

  test('404 for random non-existent expense IDs', async () => {
    // Prove endpoint works first
    const catRes = await request(BASE_URL)
      .post('/categories')
      .send({ name: '404Test_' + randomString() });
    const expRes = await request(BASE_URL)
      .post('/expenses')
      .send({ amount: 10, categoryId: catRes.body.id, date: '2024-01-01' });
    const validGet = await request(BASE_URL).get('/expenses/' + expRes.body.id);
    expect(validGet.status).toBe(200);
    
    // Random non-existent IDs
    const randomIds = [
      'exp_' + randomString(),
      'exp_999999',
      'nonexistent_' + Date.now(),
    ];
    
    for (const id of randomIds) {
      const res = await request(BASE_URL).get('/expenses/' + id);
      expect(res.status).toBe(404);
    }
  });

});
`,
};

