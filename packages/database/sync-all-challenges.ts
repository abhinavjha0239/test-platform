import * as dotenv from 'dotenv';
import * as pathModule from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);
const require = createRequire(import.meta.url);

// Load .env from root
dotenv.config({ path: pathModule.join(__dirname, '../../.env') });
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as schema from './src/schema.js';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('DATABASE_URL is required');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

// Load challenge from TypeScript file
function loadChallenge(filePath: string): any {
    const source = fs.readFileSync(filePath, 'utf8');
    const result = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
    });

    // Create a module-like context
    const exportsObj: any = {};
    const moduleObj = { exports: exportsObj };

    // Evaluate the transpiled code
    const fn = new Function('exports', 'module', 'require', result.outputText);
    fn(exportsObj, moduleObj, require);

    return exportsObj.challenge || moduleObj.exports.challenge || Object.values(exportsObj)[0];
}

async function syncAllChallenges() {
    console.log('🔄 Syncing ALL challenges to database...\n');

    try {
        // Get admin user for createdBy
        const admin = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.role, 'ADMIN'),
        });

        if (!admin) {
            console.error('❌ No admin user found. Please run seed.ts first.');
            process.exit(1);
        }

        console.log(`📋 Using admin: ${admin.email}\n`);

        // Find all challenge directories
        const challengesDir = path.join(__dirname, '../../challenges');
        const challengeDirs = fs.readdirSync(challengesDir).filter((dir) => {
            const stat = fs.statSync(path.join(challengesDir, dir));
            return stat.isDirectory() && !dir.startsWith('_') && !dir.startsWith('.');
        });

        console.log(`📦 Found ${challengeDirs.length} challenge directories\n`);

        const syncedChallenges: { id: string; name: string }[] = [];

        for (const dir of challengeDirs) {
            const challengePath = path.join(challengesDir, dir, 'challenge.ts');

            if (!fs.existsSync(challengePath)) {
                console.log(`⚠️  Skipping ${dir}: no challenge.ts found`);
                continue;
            }

            try {
                const challenge = loadChallenge(challengePath);

                if (!challenge || !challenge.name) {
                    console.log(`⚠️  Skipping ${dir}: invalid challenge format`);
                    continue;
                }

                // Check if challenge exists
                const existing = await db.query.challenges.findFirst({
                    where: (challenges, { eq }) => eq(challenges.name, challenge.name),
                });

                if (existing) {
                    // Update existing challenge
                    await db
                        .update(schema.challenges)
                        .set({
                            description: challenge.description,
                            starterFiles: challenge.starterFiles,
                            publicTests: challenge.publicTests,
                            hiddenTests: challenge.hiddenTests,
                            dependencies: challenge.dependencies || {},
                            nodeVersion: challenge.nodeVersion || '20',
                            runner: challenge.runner,
                        })
                        .where(eq(schema.challenges.id, existing.id));

                    console.log(`✅ Updated: ${challenge.name}`);
                    syncedChallenges.push({ id: existing.id, name: challenge.name });
                } else {
                    // Create new challenge
                    const [newChallenge] = await db
                        .insert(schema.challenges)
                        .values({
                            name: challenge.name,
                            description: challenge.description,
                            starterFiles: challenge.starterFiles,
                            publicTests: challenge.publicTests,
                            hiddenTests: challenge.hiddenTests,
                            dependencies: challenge.dependencies || {},
                            nodeVersion: challenge.nodeVersion || '20',
                            runner: challenge.runner,
                            createdBy: admin.id,
                        })
                        .returning();

                    console.log(`✅ Created: ${challenge.name}`);
                    syncedChallenges.push({ id: newChallenge.id, name: challenge.name });
                }
            } catch (error: any) {
                console.error(`❌ Error loading ${dir}:`, error.message);
            }
        }

        console.log(`\n🎉 Synced ${syncedChallenges.length} challenges to database!\n`);

        // Return synced challenges for exam creation
        return { admin, syncedChallenges };
    } catch (error) {
        console.error('❌ Sync error:', error);
        throw error;
    }
}

async function createMultiChallengeExam(
    adminId: string,
    challengeIds: string[],
    title: string,
    timeLimit: number,
    maxAttempts: number
) {
    // For now, create an exam for the first challenge
    // In a real system, you'd have a multi-challenge exam structure
    if (challengeIds.length === 0) {
        console.log('⚠️  No challenges to create exam for');
        return;
    }

    // Create individual exams for each challenge
    console.log(`\n📝 Creating exams with ${maxAttempts} attempts, ${timeLimit} minutes...\n`);

    for (const challengeId of challengeIds) {
        const challenge = await db.query.challenges.findFirst({
            where: (c, { eq }) => eq(c.id, challengeId),
        });

        if (!challenge) continue;

        const examTitle = `${title}: ${challenge.name}`;

        const existing = await db.query.exams.findFirst({
            where: (e, { eq }) => eq(e.title, examTitle),
        });

        if (existing) {
            // Update existing exam
            await db
                .update(schema.exams)
                .set({
                    timeLimit,
                    maxAttempts,
                    passThreshold: 0.6,
                    isPublished: true,
                    publishedAt: new Date(),
                })
                .where(eq(schema.exams.id, existing.id));
            console.log(`✅ Updated exam: ${examTitle}`);
        } else {
            // Create new exam
            await db.insert(schema.exams).values({
                title: examTitle,
                description: `Coding assessment for ${challenge.name}. You have ${timeLimit} minutes and ${maxAttempts} attempts.`,
                challengeId,
                timeLimit,
                maxAttempts,
                passThreshold: 0.6,
                fullscreenRequired: true,
                tabSwitchLogging: true,
                pasteDisabled: false,
                isPublished: true,
                publishedAt: new Date(),
                createdBy: adminId,
            });
            console.log(`✅ Created exam: ${examTitle}`);
        }
    }
}

async function main() {
    try {
        // Sync all challenges
        const { admin, syncedChallenges } = await syncAllChallenges();

        // Create exams with 20 attempts, 90 minutes
        await createMultiChallengeExam(
            admin.id,
            syncedChallenges.map((c) => c.id),
            'Multi-Language Assessment',
            90, // 90 minutes
            20 // 20 attempts
        );

        console.log('\n' + '='.repeat(60));
        console.log('🎉 All done!');
        console.log('='.repeat(60));
        console.log(`\n📊 Summary:`);
        console.log(`   - Challenges synced: ${syncedChallenges.length}`);
        console.log(`   - Exams created/updated: ${syncedChallenges.length}`);
        console.log(`   - Time limit: 90 minutes`);
        console.log(`   - Max attempts: 20`);
        console.log(`\n📋 Synced Challenges:`);
        syncedChallenges.forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.name}`);
        });
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();

