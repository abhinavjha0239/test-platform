import { Challenge } from '@/lib/types';

/**
 * Prisma ORM Challenge - E-commerce API
 * 
 * Tests via HTTP endpoints (mode: 'http')
 * Candidate builds Express API with Prisma
 */
export const challenge: Challenge = {
    name: 'Prisma ORM: E-commerce API',
    description: `# Prisma ORM Challenge: E-commerce API

## Overview
Build a REST API for an e-commerce platform using Express + Prisma ORM.

## Your Task

### 1. Complete the Prisma Schema (\`prisma/schema.prisma\`)

Define 3 models:

**User**: id, email (unique), name, createdAt, orders relation
**Product**: id, name, price (Int), stock (Int), createdAt  
**Order**: id, userId, productId, quantity, status (PENDING/COMPLETED/CANCELLED), createdAt

### 2. Implement API Endpoints (\`src/index.ts\`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /users | Create user (body: {email, name}) |
| POST | /products | Create product (body: {name, price, stock}) |
| POST | /orders | Create order (body: {userId, productId, quantity}) - reduce stock |
| GET | /users/:id/orders | Get user's orders with product details |
| POST | /orders/:id/cancel | Cancel order & restore stock |

### 3. Business Rules

- \`POST /orders\`: Must check stock availability. Return 400 if insufficient.
- \`POST /orders/:id/cancel\`: Only PENDING orders can be cancelled. Restore stock atomically.

## Testing
Your API will be tested via HTTP requests. Make sure to return proper status codes!
`,

    starterFiles: {
        'prisma/schema.prisma': `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// TODO: Define OrderStatus enum (PENDING, COMPLETED, CANCELLED)

// TODO: Define User model
// - id: Int @id @default(autoincrement())
// - email: String @unique
// - name: String
// - createdAt: DateTime @default(now())
// - orders: Order[]

// TODO: Define Product model
// - id, name, price (Int), stock (Int), createdAt

// TODO: Define Order model with relations to User and Product
`,

        'src/index.ts': `import express from 'express';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// TODO: POST /users - Create a new user
// Body: { email: string, name: string }
// Return: 201 with created user
app.post('/users', async (req, res) => {
    // Implement
});

// TODO: POST /products - Create a new product
// Body: { name: string, price: number, stock: number }
// Return: 201 with created product
app.post('/products', async (req, res) => {
    // Implement
});

// TODO: POST /orders - Create order and reduce stock
// Body: { userId: number, productId: number, quantity: number }
// Return: 201 with created order
// Return: 400 if insufficient stock
app.post('/orders', async (req, res) => {
    // 1. Check product stock
    // 2. If quantity > stock, return 400 { error: 'Insufficient stock' }
    // 3. Create order with status PENDING
    // 4. Reduce product stock
    // 5. Use prisma.$transaction for atomicity
});

// TODO: GET /users/:id/orders - Get all orders for a user
// Return: Array of orders with product details
// Each order: { id, quantity, status, createdAt, product: { id, name, price } }
app.get('/users/:id/orders', async (req, res) => {
    // Implement with include
});

// TODO: POST /orders/:id/cancel - Cancel an order and restore stock
// Return: 200 with updated order
// Return: 400 if order is not PENDING
app.post('/orders/:id/cancel', async (req, res) => {
    // 1. Find order
    // 2. If status !== PENDING, return 400 { error: 'Cannot cancel' }
    // 3. Update status to CANCELLED
    // 4. Restore product stock
    // 5. Use transaction
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
`,

        'package.json': `{
  "name": "prisma-ecommerce",
  "scripts": {
    "start": "tsx src/index.ts",
    "db:push": "prisma db push"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "express": "^4.18.0"
  },
  "devDependencies": {
    "prisma": "^5.0.0",
    "tsx": "^4.0.0",
    "@types/express": "^4.17.0"
  }
}
`,

        'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist"
  }
}
`
    },

    runner: {
        mode: 'http' as const,
        runtime: 'node',

        // Container with PostgreSQL
        dockerfile: 'node-postgres',

        database: {
            type: 'postgresql',
            name: 'ecommerce',
        },

        // Setup commands before starting server
        setup: [
            'npm install',
            'npx prisma generate',
            'npx prisma db push --force-reset'
        ],

        startCommand: 'npm start',
        port: 3000,
        healthCheck: '/health',
        timeoutMs: 60000,

        // HTTP tests
        tests: [
            // Public Tests
            {
                name: 'Create User',
                request: {
                    method: 'POST',
                    path: '/users',
                    body: { email: 'test@example.com', name: 'Test User' }
                },
                expect: {
                    status: 201,
                    bodyContains: ['email', 'name', 'id']
                }
            },
            {
                name: 'Create Product',
                request: {
                    method: 'POST',
                    path: '/products',
                    body: { name: 'Laptop', price: 99900, stock: 10 }
                },
                expect: {
                    status: 201,
                    bodyContains: ['name', 'price', 'stock']
                }
            },
            {
                name: 'Create Order',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'buyer@test.com', name: 'Buyer' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Phone', price: 500, stock: 5 }, saveAs: 'product' }
                ],
                request: {
                    method: 'POST',
                    path: '/orders',
                    body: { userId: '{{user.id}}', productId: '{{product.id}}', quantity: 2 }
                },
                expect: {
                    status: 201,
                    body: { status: 'PENDING', quantity: 2 }
                }
            }
        ],

        hiddenTests: [
            // Stock Check
            {
                name: 'Reject order when insufficient stock',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'poor@test.com', name: 'Poor' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Rare', price: 1000, stock: 2 }, saveAs: 'product' }
                ],
                request: {
                    method: 'POST',
                    path: '/orders',
                    body: { userId: '{{user.id}}', productId: '{{product.id}}', quantity: 10 }
                },
                expect: {
                    status: 400,
                    bodyContains: ['stock', 'Insufficient']
                }
            },
            // Stock Reduction
            {
                name: 'Stock is reduced after order',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'stock@test.com', name: 'Stock' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Limited', price: 100, stock: 5 }, saveAs: 'product' },
                    { method: 'POST', path: '/orders', body: { userId: '{{user.id}}', productId: '{{product.id}}', quantity: 3 } }
                ],
                request: {
                    method: 'GET',
                    path: '/products/{{product.id}}'
                },
                expect: {
                    status: 200,
                    body: { stock: 2 }
                }
            },
            // Get User Orders
            {
                name: 'Get user orders includes product',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'orders@test.com', name: 'Orders' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Widget', price: 50, stock: 10 }, saveAs: 'product' },
                    { method: 'POST', path: '/orders', body: { userId: '{{user.id}}', productId: '{{product.id}}', quantity: 1 } }
                ],
                request: {
                    method: 'GET',
                    path: '/users/{{user.id}}/orders'
                },
                expect: {
                    status: 200,
                    bodyContains: ['product', 'name', 'Widget']
                }
            },
            // Cancel Order
            {
                name: 'Cancel order restores stock',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'cancel@test.com', name: 'Cancel' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Refund', price: 100, stock: 10 }, saveAs: 'product' },
                    { method: 'POST', path: '/orders', body: { userId: '{{user.id}}', productId: '{{product.id}}', quantity: 4 }, saveAs: 'order' }
                ],
                request: {
                    method: 'POST',
                    path: '/orders/{{order.id}}/cancel'
                },
                expect: {
                    status: 200,
                    body: { status: 'CANCELLED' }
                },
                verify: [
                    { method: 'GET', path: '/products/{{product.id}}', expect: { body: { stock: 10 } } }
                ]
            },
            // Cannot cancel completed order
            {
                name: 'Cannot cancel completed order',
                setup: [
                    { method: 'POST', path: '/users', body: { email: 'done@test.com', name: 'Done' }, saveAs: 'user' },
                    { method: 'POST', path: '/products', body: { name: 'Shipped', price: 100, stock: 10 }, saveAs: 'product' },
                    // Manually create completed order via SQL or special endpoint
                ],
                request: {
                    method: 'POST',
                    path: '/orders/999/cancel'  // Non-pending order
                },
                expect: {
                    status: 400
                }
            }
        ]
    },

    dependencies: {},
    nodeVersion: '20',
    publicTests: '',
    hiddenTests: ''
};
