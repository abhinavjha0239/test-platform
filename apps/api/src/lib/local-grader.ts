import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult } from '@exam-platform/shared';

const execAsync = promisify(exec);

/**
 * Local grader - runs tests directly with Node.js (no Docker)
 * Use this for development when Docker is not available
 */
export async function runLocalGrader(job: GradingJob): Promise<GradingResult> {
    const workDir = join(tmpdir(), `grader_${job.attemptId}_${Date.now()}`);

    try {
        // Create workspace
        await mkdir(workDir, { recursive: true });
        await mkdir(join(workDir, 'src'), { recursive: true });
        await mkdir(join(workDir, '__tests__'), { recursive: true });

        // Write candidate files
        for (const [filePath, content] of Object.entries(job.files)) {
            const fullPath = join(workDir, filePath);
            const dir = fullPath.substring(0, fullPath.lastIndexOf('/') || fullPath.lastIndexOf('\\'));
            if (dir && dir !== fullPath) {
                await mkdir(dir, { recursive: true }).catch(() => { });
            }
            await writeFile(fullPath, content as string);
        }

        // Write test files
        if (job.publicTests) {
            await writeFile(join(workDir, '__tests__', 'public.test.js'), job.publicTests);
        }
        if (job.hiddenTests) {
            await writeFile(join(workDir, '__tests__', 'hidden.test.js'), job.hiddenTests);
        }

        // Create package.json
        const packageJson = {
            name: 'exam-submission',
            version: '1.0.0',
            scripts: {
                test: 'jest --json --outputFile=results.json --testPathPattern=__tests__ --forceExit',
            },
            dependencies: {
                ...job.dependencies,
            },
            devDependencies: {
                'jest': '^29.7.0',
                'supertest': '^6.3.3',
            },
        };
        await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

        console.log(`[Grader] Running tests in ${workDir}`);

        // Run npm install
        try {
            await execAsync('npm install --legacy-peer-deps', {
                cwd: workDir,
                timeout: 60000,
            });
        } catch (installError) {
            console.error('[Grader] npm install error:', installError);
            return {
                publicScore: 0,
                hiddenScore: 0,
                totalPublic: 0,
                totalHidden: 0,
                logs: `npm install failed: ${String(installError)}`,
                success: false,
                error: 'Dependencies installation failed',
            };
        }

        // Run tests
        let testOutput = '';
        try {
            const { stdout, stderr } = await execAsync('npm test', {
                cwd: workDir,
                timeout: job.timeLimit * 1000,
            });
            testOutput = stdout + '\n' + stderr;
        } catch (testError: any) {
            // Jest returns non-zero exit code on test failures - that's OK
            testOutput = (testError.stdout || '') + '\n' + (testError.stderr || '') + '\n' + String(testError.message);
        }

        console.log('[Grader] Test output:', testOutput.substring(0, 500));

        // Parse results
        return await parseTestResults(workDir, testOutput);
    } catch (error) {
        console.error('[Grader] Error:', error);
        return {
            publicScore: 0,
            hiddenScore: 0,
            totalPublic: 0,
            totalHidden: 0,
            logs: String(error),
            success: false,
            error: String(error),
        };
    } finally {
        // Cleanup
        await rm(workDir, { recursive: true, force: true }).catch(() => { });
    }
}

async function parseTestResults(workDir: string, logs: string): Promise<GradingResult> {
    try {
        // Try to read Jest JSON output
        const resultsPath = join(workDir, 'results.json');
        const resultsContent = await readFile(resultsPath, 'utf-8').catch(() => null);

        if (resultsContent) {
            const jestResults = JSON.parse(resultsContent);

            let publicScore = 0;
            let hiddenScore = 0;
            let totalPublic = 0;
            let totalHidden = 0;

            for (const testFile of jestResults.testResults || []) {
                const isHidden = testFile.name.includes('hidden');

                for (const assertion of testFile.assertionResults || []) {
                    if (isHidden) {
                        totalHidden++;
                        if (assertion.status === 'passed') hiddenScore++;
                    } else {
                        totalPublic++;
                        if (assertion.status === 'passed') publicScore++;
                    }
                }
            }

            return {
                publicScore,
                hiddenScore,
                totalPublic,
                totalHidden,
                logs,
                success: jestResults.success !== false,
            };
        }

        // Fallback: parse from console output
        const passedMatch = logs.match(/Tests:\s+(\d+)\s+passed/);
        const failedMatch = logs.match(/Tests:\s+(\d+)\s+failed/);

        const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
        const total = passed + failed;

        return {
            publicScore: passed,
            hiddenScore: 0,
            totalPublic: total > 0 ? total : 3, // Default to 3 tests if can't parse
            totalHidden: 0,
            logs,
            success: failed === 0 && passed > 0,
        };
    } catch (error) {
        console.error('[Grader] Parse error:', error);
        return {
            publicScore: 0,
            hiddenScore: 0,
            totalPublic: 0,
            totalHidden: 0,
            logs: logs + '\n\nParsing error: ' + String(error),
            success: false,
            error: 'Failed to parse test results',
        };
    }
}
