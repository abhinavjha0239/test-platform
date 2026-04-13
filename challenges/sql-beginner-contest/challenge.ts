import { Challenge } from '@/lib/types';

export const challenge = {
    name: 'Beginner SQL Contest',
    description: `# Beginner SQL Contest – PostgreSQL

**Topics Covered:**
- CREATE TABLE
- SELECT queries
- JOINs (INNER, LEFT, RIGHT, FULL)
- Transactions

## Database Schema

**Table: users**
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| name | TEXT | |
| email | TEXT | Unique |

**Table: orders**
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| user_id | INT | FK -> users.id |
| amount | INT | |
| created_at | TIMESTAMP | Default NOW() |

## Sample Data

**users**
| id | name | email |
|----|------|-------|
| 1 | Aman | aman@test.com |
| 2 | Riya | riya@test.com |
| 3 | Kunal | kunal@test.com |
| 4 | Sneha | sneha@test.com |

**orders**
| id | user_id | amount |
|----|---------|--------|
| 1 | 1 | 500 |
| 2 | 1 | 1500 |
| 3 | 2 | 700 |
*(Users 3 and 4 have no orders)*

---

## YOUR TASK: Question 4
**Fetch all users and their orders (include users without orders).**

- Select \`name\` (user name), \`order_id\` (order id), and \`amount\`.
- Use a LEFT JOIN so users without orders are included.
- Order by user id ASC (from \`users.id\`), then order id ASC (from \`orders.id\`), with NULL order ids last.

**Expected Output:**

| name | order_id | amount |
| --- | --- | --- |
| Aman | 1 | 500 |
| Aman | 2 | 1500 |
| Riya | 3 | 700 |
| Kunal | NULL | NULL |
| Sneha | NULL | NULL |
`,

    starterFiles: {
        'query.sql': `-- Write your query for Question 4 here
`,
    },

    // Required by schema (not used for SQL mode)
    publicTests: '',
    hiddenTests: '',
    dependencies: {},
    nodeVersion: '20',

    runner: {
        mode: 'sql',
        runtime: 'postgresql',

        database: {
            setupScript: `
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    amount INT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
    ('Aman', 'aman@test.com'),
    ('Riya', 'riya@test.com'),
    ('Kunal', 'kunal@test.com'),
    ('Sneha', 'sneha@test.com');

INSERT INTO orders (user_id, amount) VALUES
    (1, 500),
    (1, 1500),
    (2, 700);
            `,
        },

        sampleData: {
            tables: {
                users: {
                    columns: [
                        { name: 'id', type: 'INT' },
                        { name: 'name', type: 'VARCHAR(100)' },
                        { name: 'email', type: 'VARCHAR(255)' },
                    ],
                    rows: [
                        { id: 1, name: 'Aman', email: 'aman@test.com' },
                        { id: 2, name: 'Riya', email: 'riya@test.com' },
                        { id: 3, name: 'Kunal', email: 'kunal@test.com' },
                        { id: 4, name: 'Sneha', email: 'sneha@test.com' },
                    ],
                },
                orders: {
                    columns: [
                        { name: 'id', type: 'INT' },
                        { name: 'user_id', type: 'INT' },
                        { name: 'amount', type: 'INT' },
                    ],
                    rows: [
                        { id: 1, user_id: 1, amount: 500 },
                        { id: 2, user_id: 1, amount: 1500 },
                        { id: 3, user_id: 2, amount: 700 },
                    ],
                },
            },
        },

        sqlTests: {
            isolation: 'container', // Requires isolated container to support custom schema/data
            timeoutMs: 10000,
        },

        publicTests: [
            {
                name: 'Q4: Users & Orders (Left Join)',
                expectedResult: [
                    { name: 'Aman', order_id: 1, amount: 500 },
                    { name: 'Aman', order_id: 2, amount: 1500 },
                    { name: 'Riya', order_id: 3, amount: 700 },
                    { name: 'Kunal', order_id: null, amount: null },
                    { name: 'Sneha', order_id: null, amount: null },
                ],
            },
        ],

        hiddenTests: [
            {
                name: 'Returns exactly 5 rows (all users)',
                referenceQuery: `
SELECT u.name, o.id as order_id, o.amount 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
ORDER BY u.id ASC, o.id ASC NULLS LAST`,
                // Validates: Must have 5 rows total (3 with orders + 2 with NULLs)
            },
            {
                name: 'NULL values for users without orders',
                referenceQuery: `
SELECT u.name, o.id as order_id, o.amount 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
WHERE o.id IS NULL
ORDER BY u.id ASC, o.id ASC NULLS LAST`,
                // Ensures Kunal and Sneha appear with NULL order_id/amount
            },
            {
                name: 'Correct ordering by user_id then order_id',
                referenceQuery: `
SELECT u.name, o.id as order_id, o.amount 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
ORDER BY u.id ASC, o.id ASC NULLS LAST`,
                // Verifies sorting is correct
            },
            {
                name: 'Does not use INNER JOIN (catches wrong join type)',
                referenceQuery: `
SELECT u.name, o.id as order_id, o.amount 
FROM users u 
LEFT JOIN orders o ON u.id = o.user_id 
ORDER BY u.id ASC, o.id ASC NULLS LAST`,
                // If student uses INNER JOIN, they'll only get 3 rows instead of 5
            },
        ],
    },
};
