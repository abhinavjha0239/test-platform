
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_URL = process.env.API_URL || 'http://localhost:3001';
// If specific Exam ID is known, set it. Otherwise script will try to find it.
const TARGET_CHALLENGE_NAME = 'Beginner SQL Contest – Full Challenge'; // From challenge.ts

// Solutions map (from load-test.sh)
const SOLUTIONS: Record<string, string> = {
    "q1.sql": "SELECT * FROM users ORDER BY id ASC;",
    "q2.sql": "SELECT name, email FROM users ORDER BY id ASC;",
    "q3.sql": "SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u INNER JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC;",
    "q4.sql": "SELECT u.name AS user_name, o.id AS order_id, o.amount FROM users u LEFT JOIN orders o ON u.id = o.user_id ORDER BY u.id ASC, o.id ASC NULLS LAST;",
    "q5.sql": "SELECT u.name FROM users u LEFT JOIN orders o ON u.id = o.user_id WHERE o.id IS NULL ORDER BY u.id ASC;",
    "q6.sql": "SELECT u.name AS user_name, o.id AS order_id, o.amount FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY o.id ASC;",
    "q7.sql": "SELECT u.name, SUM(o.amount) AS total_amount FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name ORDER BY total_amount DESC, u.id ASC;",
    "q8.sql": "SELECT u.name FROM users u INNER JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name HAVING SUM(o.amount) > 1000 ORDER BY u.id ASC;",
    "q9.sql": "SELECT tc.constraint_name, tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'orders' AND kcu.column_name = 'user_id';",
    "q11.sql": "BEGIN; WITH new_user AS (INSERT INTO users (name, email) VALUES ('Raj', 'raj@test.com') RETURNING id, name), new_order AS (INSERT INTO orders (user_id, amount) SELECT id, 999 FROM new_user RETURNING id, user_id, amount) SELECT u.id AS user_id, u.name AS user_name, o.id AS order_id, o.amount FROM new_user u JOIN new_order o ON o.user_id = u.id; COMMIT;",
    "q12.sql": "BEGIN; INSERT INTO users (name, email) VALUES ('Temp', 'temp@test.com'); ROLLBACK; SELECT COUNT(*)::INT AS temp_user_count FROM users WHERE email = 'temp@test.com';",
    "q13.sql": "BEGIN; DELETE FROM orders WHERE user_id = 2; DELETE FROM users WHERE id = 2; COMMIT; SELECT (SELECT COUNT(*) FROM users)::INT AS remaining_users, (SELECT COUNT(*) FROM orders)::INT AS remaining_orders;"
};

const CSV_PATH = path.join(__dirname, '../candidate_credentials.csv');

interface User {
    email: string;
    password: string;
    token?: string;
    userId?: string;
}

// Helper to pick N random keys
function pickRandomSolutions(count: number) {
    const keys = Object.keys(SOLUTIONS);
    const selected: Record<string, string> = {};
    const shuffled = keys.sort(() => 0.5 - Math.random());

    for (let i = 0; i < count; i++) {
        if (shuffled[i]) {
            selected[shuffled[i]] = SOLUTIONS[shuffled[i]];
        }
    }
    return selected;
}

async function main() {
    console.log(`[StressTest] Starting 200-user load test targeting ${API_URL}`);

    // 1. Parse CSV
    const users: User[] = [];
    try {
        const fileContent = fs.readFileSync(CSV_PATH, 'utf-8');
        const lines = fileContent.split('\n').filter(l => l.trim().length > 0);
        // Skip header (Roll_No,Email,Password,Name)
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 3) {
                users.push({
                    email: parts[1].trim(),
                    password: parts[2].trim()
                });
            }
        }
        console.log(`[StressTest] Loaded ${users.length} users from CSV`);
    } catch (e) {
        console.error('[StressTest] Failed to read CSV:', e);
        process.exit(1);
    }

    // Limit to 200 for this test
    const testUsers = users.slice(0, 200);

    // 2. Login User 1 and Find Exam
    console.log('[StressTest] Logging in first user to find active exam...');
    let examId = '';

    try {
        const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
            email: testUsers[0].email,
            password: testUsers[0].password
        });

        const token = loginRes.data.data.accessToken;
        // Fetch exams
        const examsRes = await axios.get(`${API_URL}/api/exams`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const exams = examsRes.data.data;
        const targetExam = exams.find((e: any) => e.challenge?.name === TARGET_CHALLENGE_NAME);

        if (!targetExam) {
            console.error(`[StressTest] Could not find published exam for challenge "${TARGET_CHALLENGE_NAME}"`);
            console.log('Available exams:', exams.map((e: any) => e.title));
            process.exit(1);
        }

        examId = targetExam.id;
        console.log(`[StressTest] Found Exam ID: ${examId} ("${targetExam.title}")`);

    } catch (e: any) {
        console.error('[StressTest] Setup failed:', e.message);
        if (e.response) console.error(e.response.data);
        process.exit(1);
    }

    // 3. Concurrent Load Test
    console.log(`[StressTest] Starting concurrent execution for ${testUsers.length} users...`);
    const startTime = Date.now();

    let completed = 0;
    let errors = 0;

    // Function to process single user
    const processUser = async (user: User, index: number) => {
        try {
            // Login
            const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
                email: user.email,
                password: user.password
            });
            const token = loginRes.data.data.accessToken;

            // Start Attempt (or resume)
            const startRes = await axios.post(`${API_URL}/api/attempts`, {
                examId
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const attemptId = startRes.data.data.id; // Or data.id if directly returning attempt
            // startRes.data.data might be the attempt object

            // Pick random solution count (4, 8, or 12)
            const solutionCount = [4, 8, 12][Math.floor(Math.random() * 3)];
            const files = pickRandomSolutions(solutionCount);

            // Submit
            // We use /run-tests to simulate "Run Code" behavior which triggers grading
            // OR /submit for final submission.
            // User said "grading done...". Submit is safer for "done".
            const submitRes = await axios.post(`${API_URL}/api/attempts/${attemptId}/submit`, {
                files
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (submitRes.data.success) {
                // console.log(`[User ${index+1}] Submitted (Job: ${submitRes.data.data.jobId})`);
                completed++;
            } else {
                errors++;
            }

        } catch (e: any) {
            if (index < 3) { // Log first 3 errors only
                console.error(`[User ${index + 1}] Error:`, e.message);
                if (e.response) console.error(JSON.stringify(e.response.data));
            }
            errors++;
        }
    };

    // Chunk execution or all at once?
    // "200 containers at the same time".
    // We launch all promises.

    const promises = testUsers.map((u, i) => processUser(u, i));

    // wait for all
    await Promise.all(promises);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[StressTest] Finished in ${duration.toFixed(2)}s`);
    console.log(`[StressTest] Successful submissions: ${completed}`);
    console.log(`[StressTest] Errors: ${errors}`);
}

main();
