import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './src/schema.js';
import { todoChallenge } from '../../challenges/express-todo/challenge.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
    console.log('🌱 Seeding database...');

    try {
        // Create admin user
        const [admin] = await db.insert(schema.users).values({
            email: 'admin@examplatform.com',
            password: '$2a$12$LQv3c1yqBwLHVgEtS0.X6.5VHwMbz5FLNVxBPpZrjSwKQWxFGBH5K', // "admin123"
            name: 'Admin User',
            role: 'ADMIN',
        }).onConflictDoNothing().returning();

        console.log('✅ Admin user created:', admin?.email || 'already exists');

        // Create sample challenge
        const [challenge] = await db.insert(schema.challenges).values({
            name: todoChallenge.name,
            description: todoChallenge.description,
            starterFiles: todoChallenge.starterFiles,
            publicTests: todoChallenge.publicTests,
            hiddenTests: todoChallenge.hiddenTests,
            dependencies: todoChallenge.dependencies,
            nodeVersion: todoChallenge.nodeVersion,
            createdBy: admin?.id,
        }).onConflictDoNothing().returning();

        console.log('✅ Challenge created:', challenge?.name || 'already exists');

        // Create sample exam
        if (challenge && admin) {
            const [exam] = await db.insert(schema.exams).values({
                title: 'Node.js Express Assessment',
                description: 'Test your Express.js API development skills by building a Todo API.',
                challengeId: challenge.id,
                timeLimit: 60, // 60 minutes
                maxAttempts: 2,
                passThreshold: 0.6,
                fullscreenRequired: true,
                tabSwitchLogging: true,
                pasteDisabled: true,
                isPublished: true,
                publishedAt: new Date(),
                createdBy: admin.id,
            }).onConflictDoNothing().returning();

            console.log('✅ Exam created:', exam?.title || 'already exists');
        }

        console.log('🎉 Seeding complete!');
    } catch (error) {
        console.error('❌ Seeding error:', error);
        throw error;
    } finally {
        await client.end();
    }
}

seed();
