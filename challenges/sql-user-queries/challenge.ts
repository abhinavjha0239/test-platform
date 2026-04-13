// SQL User Queries Challenge - LeetCode-style PostgreSQL
export const challenge = {
    name: 'SQL User Queries',
    description: `## Find Users By Age

Write a SQL query to find all users who are older than 30 years.

### Schema

**Table: users**

| Column | Type |
|--------|------|
| id | INT |
| name | VARCHAR(100) |
| email | VARCHAR(255) |
| age | INT |
| created_at | TIMESTAMP |

### Sample Data

| id | name | email | age |
|----|------|-------|-----|
| 1 | Alice | alice@test.com | 28 |
| 2 | Bob | bob@test.com | 35 |
| 3 | Charlie | charlie@test.com | 42 |
| 4 | Diana | diana@test.com | 31 |
| 5 | Eve | eve@test.com | 25 |

### Expected Output

Your query should return users where \`age > 30\`, ordered by \`id\`.

| id | name | email | age |
|----|------|-------|-----|
| 2 | Bob | bob@test.com | 35 |
| 3 | Charlie | charlie@test.com | 42 |
| 4 | Diana | diana@test.com | 31 |
`,

    starterFiles: {
        'query.sql': `-- Write your SQL query here
SELECT * FROM users;
`,
    },

    // Not used for SQL mode, but required by schema
    publicTests: '',
    hiddenTests: '',
    dependencies: {},
    nodeVersion: '20',

    // SQL Runner Configuration
    runner: {
        mode: 'sql',
        runtime: 'postgresql',

        database: {
            setupScript: `CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    age INT,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email, age) VALUES
    ('Alice', 'alice@test.com', 28),
    ('Bob', 'bob@test.com', 35),
    ('Charlie', 'charlie@test.com', 42),
    ('Diana', 'diana@test.com', 31),
    ('Eve', 'eve@test.com', 25);
`,
        },

        sampleData: {
            tables: {
                users: {
                    columns: [
                        { name: 'id', type: 'INT' },
                        { name: 'name', type: 'VARCHAR(100)' },
                        { name: 'email', type: 'VARCHAR(255)' },
                        { name: 'age', type: 'INT' },
                    ],
                    rows: [
                        { id: 1, name: 'Alice', email: 'alice@test.com', age: 28 },
                        { id: 2, name: 'Bob', email: 'bob@test.com', age: 35 },
                        { id: 3, name: 'Charlie', email: 'charlie@test.com', age: 42 },
                    ],
                    truncated: true,
                },
            },
        },

        tests: {
            isolation: 'shared',
            orderSensitive: true,
            columnOrderSensitive: false,
            timeoutMs: 5000,
        },

        publicTests: [
            {
                name: 'Users older than 30 (ordered)',
                expectedResult: [
                    { id: 2, name: 'Bob', email: 'bob@test.com', age: 35 },
                    { id: 3, name: 'Charlie', email: 'charlie@test.com', age: 42 },
                    { id: 4, name: 'Diana', email: 'diana@test.com', age: 31 },
                ],
            },
        ],

        hiddenTests: [
            {
                name: 'Hidden test with random data',
                referenceQuery: 'SELECT id, name, email, age FROM users WHERE age > 30 ORDER BY id',
            },
            {
                name: 'Edge case: exactly 30',
                referenceQuery: 'SELECT id, name, email, age FROM users WHERE age > 30 ORDER BY id',
            },
        ],
    },
};
