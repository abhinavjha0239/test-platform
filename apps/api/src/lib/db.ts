import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@exam-platform/database';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Database Connection Pool Configuration
 * 
 * Uses postgres-js connection pooling to handle concurrent requests efficiently.
 * Without pooling, each request creates a new connection which can exhaust
 * database connections under high load (e.g., 4000 concurrent users).
 */
const queryClient = postgres(connectionString, {
    // Maximum number of connections in the pool
    max: parseInt(process.env.DB_POOL_SIZE || '30'),

    // Close idle connections after 30 seconds
    idle_timeout: 30,

    // Connection timeout in seconds
    connect_timeout: 10,

    // Maximum lifetime of a connection (30 minutes)
    // Helps prevent stale connections
    max_lifetime: 60 * 30,
});

export const db = drizzle(queryClient, { schema });
