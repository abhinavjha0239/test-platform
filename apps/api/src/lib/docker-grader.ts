import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult, TestResult } from '@exam-platform/shared';

const execAsync = promisify(exec);

export async function runGrader(job: GradingJob): Promise<GradingResult> {
    const workDir = join(tmpdir(), `grader_${job.attemptId}_${Date.now()}`);

    try {
        // Create workspace
        await mkdir(workDir, { recursive: true });
        await mkdir(join(workDir, 'src'), { recursive: true });
        await mkdir(join(workDir, '__tests__'), { recursive: true });

        // Write candidate files
        for (const [path, content] of Object.entries(job.files)) {
            const fullPath = join(workDir, path);
            const dir = fullPath.substring(0, fullPath.lastIndexOf('/') || fullPath.lastIndexOf('\\'));
            await mkdir(dir, { recursive: true }).catch(() => { });
            await writeFile(fullPath, content);
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
                test: 'jest --json --outputFile=results.json --testPathPattern=__tests__',
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

        // Run in Docker with network disabled
        const dockerImage = `node:${job.nodeVersion}-alpine`;

        // Build docker run command
        const dockerCmd = [
            'docker', 'run',
            '--rm',
            '--network', 'none', // No network access - security
            '--memory', `${job.memoryLimit}m`,
            '--cpus', '1',
            '-v', `${workDir}:/app:rw`,
            '-w', '/app',
            dockerImage,
            'sh', '-c',
            'npm install --legacy-peer-deps 2>&1 && npm test 2>&1 || true'
        ];

        // Execute with timeout
        const result = await executeWithTimeout(dockerCmd, job.timeLimit * 1000);

        // Parse results
        return parseTestResults(workDir, result);
    } catch (error) {
        console.error('Grader error:', error);
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

async function executeWithTimeout(cmd: string[], timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const process = spawn(cmd[0], cmd.slice(1), { shell: true });
        let output = '';
        let errorOutput = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        const timer = setTimeout(() => {
            process.kill('SIGKILL');
            reject(new Error('Execution timeout'));
        }, timeout);

        process.on('close', (code) => {
            clearTimeout(timer);
            resolve(output + '\n' + errorOutput);
        });

        process.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function parseTestResults(workDir: string, logs: string): Promise<GradingResult> {
    try {
        // Try to read Jest JSON output
        const { readFile } = await import('fs/promises');
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
                success: jestResults.success || false,
            };
        }

        // Fallback: parse from console output
        const passedMatch = logs.match(/Tests:\s+(\d+)\s+passed/);
        const failedMatch = logs.match(/Tests:\s+(\d+)\s+failed/);

        const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

        return {
            publicScore: passed,
            hiddenScore: 0,
            totalPublic: passed + failed,
            totalHidden: 0,
            logs,
            success: failed === 0 && passed > 0,
        };
    } catch (error) {
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
