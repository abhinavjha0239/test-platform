
import { Challenge } from '@/lib/types';

export const challenge: Challenge = {
    name: 'Beginner SQL Contest – Full Challenge',
    description: `# Beginner SQL Contest – PostgreSQL

**Topics Covered:**
- CREATE TABLE
- SELECT queries
- JOINs (INNER, LEFT)
- Aggregation (GROUP BY, HAVING)
- Foreign Keys
- Transactions

## Database Schema (Preloaded)

**users table**
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| name | VARCHAR | |
| email | VARCHAR | Unique |

**orders table**
| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL | PK |
| user_id | INT | FK -> users.id |
| amount | INT | |
| created_at | TIMESTAMP | Default NOW() |

## Sample Data (Used in Public Tests)

**users**
1. Aman (aman@test.com)
2. Riya (riya@test.com)
3. Kunal (kunal@test.com)
4. Sneha (sneha@test.com)

**orders**
- User 1 (Aman): 500, 1500
- User 2 (Riya): 700
*(Users 3 and 4 have no orders)*

> **Note**: The hidden tests run on a larger dataset with more users and orders to prevent hardcoding. Your queries must work dynamically.

---

## YOUR TASK
Solve the following questions in the provided files (\`q1.sql\`, \`q2.sql\`, etc.).

### Section A: Basic SELECT
**Q1. Fetch all users** (File: query.sql / q1.sql)
- Select all columns from \`users\`, ordered by \`id\` ASC.

**Q2. Fetch only user names and emails** (File: q2.sql)
- Select \`name\`, \`email\` from \`users\`, ordered by \`id\` ASC.

### Section B: JOINs
**Q3. Fetch users along with their orders (INNER JOIN)** (File: q3.sql)
- Select \`users.name\` as \`user_name\`, \`orders.id\` as \`order_id\`, \`orders.amount\`.
- Only include users who placed orders.
- Order by \`users.id\` ASC, then \`orders.id\` ASC.

**Q4. Fetch all users and their orders (LEFT JOIN)** (File: q4.sql)
- Include users without orders (user_name, order_id, amount).
- Order by \`users.id\` ASC, then \`orders.id\` ASC NULLS LAST.

**Q5. Find users who have NEVER placed any order** (File: q5.sql)
- Select only \`name\`.
- Order by \`users.id\` ASC.

**Q6. Find orders even if user does not exist** (File: q6.sql)
- Prove logical thinking (with current valid data, result is same as INNER JOIN).
- Select \`users.name\` as \`user_name\`, \`orders.id\` as \`order_id\`, \`amount\`.
- Order by \`orders.id\` ASC.

### Section C: Aggregation
**Q7. Total order amount per user** (File: q7.sql)
- Select \`name\`, \`SUM(amount)\` as \`total_amount\`.
- Group by user.
- Order by \`total_amount\` DESC, then \`users.id\` ASC.

**Q8. Users with total order amount > 1000** (File: q8.sql)
- Select \`name\`.
- Filter using HAVING.
- Order by \`users.id\` ASC.

### Section D: Metadata
**Q9. Prove Foreign Key exists** (File: q9.sql)
- Query \`information_schema\` to return constraint details for \`orders.user_id\`.
- Columns: \`constraint_name\`, \`table_name\`, \`column_name\`, \`foreign_table_name\`, \`foreign_column_name\`.

### Section E: Transactions
**Q11. Transaction: Insert User + Order** (File: q11.sql)
- BEGIN transaction.
- Insert user ('Raj', 'raj@test.com').
- Insert order for Raj (amount 999).
- COMMIT.
- **Output**: Return the inserted row joined (user_id, user_name, order_id, amount).

**Q12. Transaction: Simulate Rollback** (File: q12.sql)
- BEGIN.
- Insert user ('Temp', 'temp@test.com').
- ROLLBACK.
- **Output**: Return count of users with email 'temp@test.com' (should be 0).

**Q13. Transaction: Safe Delete** (File: q13.sql)
- BEGIN.
- Delete user 2 (Riya) orders first, then user 2.
- COMMIT.
- **Output**: Return \`remaining_users\`, \`remaining_orders\`.

`,

    starterFiles: {
        'q1.sql': `-- Q1: Fetch all users\nSELECT * FROM users ORDER BY id ASC;\n`,
        'q2.sql': `-- Q2: Fetch name and email\n-- Write your query here\n`,
        'q3.sql': `-- Q3: Users with orders (INNER JOIN)\n-- Write your query here\n`,
        'q4.sql': `-- Q4: All users + orders (LEFT JOIN)\n-- Write your query here\n`,
        'q5.sql': `-- Q5: Users with no orders\n-- Write your query here\n`,
        'q6.sql': `-- Q6: Orders (LEFT JOIN from orders)\n-- Write your query here\n`,
        'q7.sql': `-- Q7: Total amount per user\n-- Write your query here\n`,
        'q8.sql': `-- Q8: Total > 1000\n-- Write your query here\n`,
        'q9.sql': `-- Q9: Verify FK constraint\n-- Write your query here\n`,
        'q11.sql': `-- Q11: Insert Transaction\n-- Write your query here\n`,
        'q12.sql': `-- Q12: Rollback Transaction\n-- Write your query here\n`,
        'q13.sql': `-- Q13: Safe Delete Transaction\n-- Write your query here\n`,
    },

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

-- Public Data (4 users, 3 orders)
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
            hiddenSetupScript: `
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

-- Hidden Data (7 users, 6 orders)
INSERT INTO users (name, email) VALUES
    ('Aman', 'aman@test.com'),
    ('Riya', 'riya@test.com'),
    ('Kunal', 'kunal@test.com'),
    ('Sneha', 'sneha@test.com'),
    ('Priya', 'priya@test.com'),
    ('Arjun', 'arjun@test.com'),
    ('Maya', 'maya@test.com');

INSERT INTO orders (user_id, amount) VALUES
    (1, 500),
    (1, 1500),
    (2, 700),
    (5, 300),   -- Priya
    (5, 500),   -- Priya
    (6, 1500);  -- Arjun
            `
        },

        sampleData: {
            tables: {
                users: {
                    columns: [{ name: 'id', type: 'INT' }, { name: 'name', type: 'VARCHAR' }, { name: 'email', type: 'VARCHAR' }],
                    rows: [
                        { id: 1, name: 'Aman', email: 'aman@test.com' },
                        { id: 2, name: 'Riya', email: 'riya@test.com' },
                        { id: 3, name: 'Kunal', email: 'kunal@test.com' },
                        { id: 4, name: 'Sneha', email: 'sneha@test.com' }
                    ]
                }
            }
        },

        sqlTests: {
            isolation: 'container',
            timeoutMs: 15000,
        },

        publicTests: [
            {
                name: 'Q1: Fetch all users',
                fileName: 'q1.sql',
                expectedResult: [
                    { id: 1, name: 'Aman', email: 'aman@test.com' },
                    { id: 2, name: 'Riya', email: 'riya@test.com' },
                    { id: 3, name: 'Kunal', email: 'kunal@test.com' },
                    { id: 4, name: 'Sneha', email: 'sneha@test.com' },
                ]
            },
            {
                name: 'Q2: Names & Emails',
                fileName: 'q2.sql',
                expectedResult: [
                    { name: 'Aman', email: 'aman@test.com' },
                    { name: 'Riya', email: 'riya@test.com' },
                    { name: 'Kunal', email: 'kunal@test.com' },
                    { name: 'Sneha', email: 'sneha@test.com' },
                ]
            },
            // ... (I will fill all 12 public tests) ...
            {
                name: 'Q3: Users with orders (INNER JOIN)',
                fileName: 'q3.sql',
                expectedResult: [
                    { user_name: 'Aman', order_id: 1, amount: 500 },
                    { user_name: 'Aman', order_id: 2, amount: 1500 },
                    { user_name: 'Riya', order_id: 3, amount: 700 },
                ]
            },
            {
                name: 'Q4: Users + orders (LEFT JOIN)',
                fileName: 'q4.sql',
                expectedResult: [
                    { user_name: 'Aman', order_id: 1, amount: 500 },
                    { user_name: 'Aman', order_id: 2, amount: 1500 },
                    { user_name: 'Riya', order_id: 3, amount: 700 },
                    { user_name: 'Kunal', order_id: null, amount: null },
                    { user_name: 'Sneha', order_id: null, amount: null },
                ]
            },
            {
                name: 'Q5: Users with no orders',
                fileName: 'q5.sql',
                expectedResult: [
                    { name: 'Kunal' },
                    { name: 'Sneha' },
                ]
            },
            {
                name: 'Q6: Logic Check (Orders w/ LEFT JOIN)',
                fileName: 'q6.sql',
                expectedResult: [
                    { user_name: 'Aman', order_id: 1, amount: 500 },
                    { user_name: 'Aman', order_id: 2, amount: 1500 },
                    { user_name: 'Riya', order_id: 3, amount: 700 },
                ]
            },
            {
                name: 'Q7: Total per user',
                fileName: 'q7.sql',
                expectedResult: [
                    { name: 'Aman', total_amount: 2000 },
                    { name: 'Riya', total_amount: 700 },
                ]
            },
            {
                name: 'Q8: High value users',
                fileName: 'q8.sql',
                expectedResult: [
                    { name: 'Aman' },
                ]
            },
            {
                name: 'Q9: FK Metadata',
                fileName: 'q9.sql',
                expectedResult: [
                    {
                        constraint_name: 'orders_user_id_fkey',
                        table_name: 'orders',
                        column_name: 'user_id',
                        foreign_table_name: 'users',
                        foreign_column_name: 'id',
                    }
                ]
            },
            {
                name: 'Q11: Transaction Insert',
                fileName: 'q11.sql',
                expectedResult: [
                    { user_id: 5, user_name: 'Raj', order_id: 4, amount: 999 }
                ]
            },
            {
                name: 'Q12: Transaction Rollback',
                fileName: 'q12.sql',
                expectedResult: [
                    { temp_user_count: 0 }
                ]
            },
            {
                name: 'Q13: Safe Delete',
                fileName: 'q13.sql',
                expectedResult: [
                    { remaining_users: 3, remaining_orders: 2 }
                ]
            }
        ],

        hiddenTests: [
            {
                name: 'Q1: Dynamic Check (Hidden Data)',
                fileName: 'q1.sql',
                referenceQuery: `SELECT * FROM users ORDER BY id ASC`
            },
            {
                name: 'Q2: Dynamic Check',
                fileName: 'q2.sql',
                referenceQuery: `SELECT name, email FROM users ORDER BY id ASC`
            },
            {
                name: 'Q3: Dynamic Check',
                fileName: 'q3.sql',
                referenceQuery: `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u INNER JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC`
            },
            {
                name: 'Q4: Dynamic Check',
                fileName: 'q4.sql',
                referenceQuery: `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC NULLS LAST`
            },
            {
                name: 'Q5: Dynamic Check',
                fileName: 'q5.sql',
                referenceQuery: `SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL ORDER BY u.id ASC`
            },
            {
                name: 'Q6: Dynamic Check',
                fileName: 'q6.sql',
                referenceQuery: `SELECT u.name AS user_name, o.id AS order_id, o.amount FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id ASC`
            },
            {
                name: 'Q7: Dynamic Check',
                fileName: 'q7.sql',
                referenceQuery: `SELECT u.name, SUM(o.amount) AS total_amount FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name ORDER BY total_amount DESC, u.id ASC`
            },
            {
                name: 'Q8: Dynamic Check',
                fileName: 'q8.sql',
                referenceQuery: `SELECT u.name FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING SUM(o.amount) > 1000 ORDER BY u.id ASC`
            },
            {
                name: 'Q9: Dynamic Check (FK)',
                fileName: 'q9.sql',
                referenceQuery: `SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'orders' AND kcu.column_name = 'user_id' ORDER BY tc.constraint_name ASC`
            },
            {
                name: 'Q11: Dynamic Transaction Check',
                fileName: 'q11.sql',
                referenceQuery: `
BEGIN;
WITH new_user AS (INSERT INTO users (name, email) VALUES ('Raj', 'raj@test.com') RETURNING id, name),
new_order AS (INSERT INTO orders (user_id, amount) SELECT id, 999 FROM new_user RETURNING id, user_id, amount)
SELECT u.id AS user_id, u.name AS user_name, o.id AS order_id, o.amount FROM new_user u JOIN new_order o ON o.user_id = u.id;
COMMIT;`
            },
            {
                name: 'Q12: Dynamic Rollback Check',
                fileName: 'q12.sql',
                referenceQuery: `
BEGIN;
INSERT INTO users (name, email) VALUES ('Temp', 'temp@test.com');
ROLLBACK;
SELECT COUNT(*)::INT AS temp_user_count FROM users WHERE email = 'temp@test.com';`
            },
            {
                name: 'Q13: Dynamic Delete Check',
                fileName: 'q13.sql',
                referenceQuery: `
BEGIN;
DELETE FROM orders WHERE user_id = 2;
DELETE FROM users WHERE id = 2;
COMMIT;
SELECT (SELECT COUNT(*) FROM users)::INT AS remaining_users, (SELECT COUNT(*) FROM orders)::INT AS remaining_orders;`
            }
        ]
    }
};
