import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Import schema types only - we'll create our own db connection
// to avoid the DATABASE_URL check in @exam-platform/database
import * as schema from '@exam-platform/database';

// DATABASE_URL should be set by bootstrap.ts before this module loads
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('[Grader DB] DATABASE_URL not set!');
    console.error('[Grader DB] CWD:', process.cwd());
    process.exit(1);
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

console.log('[Grader DB] Connected to database');
