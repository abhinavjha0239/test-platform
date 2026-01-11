import { spawn } from 'child_process';
import { writeFile, mkdir, rm, readFile, chmod } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult } from '@exam-platform/shared';
import { runDockerBlackboxGrader } from './http-grader.js';
import { runDockerPlaywrightGrader } from './playwright-grader.js';
import { runDockerUiJsdomGrader } from './ui-jsdom-grader.js';
import { getTestRunnerPool, isPoolWarmForDeps } from '../pool/container-pool.js';


/**
 * Docker-based Grader (Production Recommended)
 * 
 * Security Features:
 * 1. Full container isolation - code runs in ephemeral Docker container
 * 2. Network disabled during test execution (enabled briefly for npm install)
 * 3. Memory and CPU limits enforced by Docker
 * 4. Read-only filesystem for system paths
 * 5. No privileged access
 * 6. Strict path validation for all file writes
 * 7. Strict test file pattern matching
 * 8. SEPARATE execution for public and hidden tests (hidden test isolation)
 * 
 * Architecture:
 * - Phase 1: npm install WITH network (in container)
 * - Phase 2a: Run PUBLIC tests only (candidate can see output)
 * - Phase 2b: Run HIDDEN tests in FRESH container (candidate cannot read hidden tests)
 */

// Blocked paths that candidates cannot write to
const BLOCKED_PATHS = [
    '__tests__',
    '__test__',
    'test',
    'tests',
    '.jest',
    'jest.config',
    'babel.config',
    'node_modules',
    'package.json',
    'package-lock.json',
    'results.json',
];

// Blocked filename patterns - prevents test file injection
const BLOCKED_FILENAME_PATTERNS = [
    /\.test\.(js|jsx|ts|tsx)$/i,      // *.test.js, *.test.jsx, etc.
    /\.spec\.(js|jsx|ts|tsx)$/i,      // *.spec.js, *.spec.jsx, etc.
    /^jest\./i,                        // jest.config.js, jest.setup.js
    /^babel\./i,                       // babel.config.js
    /^\.babelrc/i,                     // .babelrc
    /^package(-lock)?\.json$/i,        // package.json, package-lock.json
    /^results\.json$/i,                // results.json
];

/**
 * Validate and sanitize file path to prevent traversal attacks
 * Also blocks writes to test directories and test file patterns
 */
function sanitizeFilePath(filePath: string, workDir: string): string | null {
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
        return null;
    }

    // Block writes to test directories
    const normalizedPath = filePath.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (normalizedPath.startsWith(blocked + '/') || normalizedPath === blocked) {
            console.error(`[SECURITY] Blocked path: ${filePath}`);
            return null;
        }
    }

    // Block test file patterns (CRITICAL: prevents test injection)
    const fileName = filePath.split('/').pop() || filePath;
    for (const pattern of BLOCKED_FILENAME_PATTERNS) {
        if (pattern.test(fileName)) {
            console.error(`[SECURITY] Blocked test file pattern: ${filePath}`);
            return null;
        }
    }

    const sanitized = filePath
        .replace(/\.\./g, '')
        .replace(/^[/\\]+/, '')
        .replace(/[/\\]+/g, '/');

    const fullPath = resolve(workDir, sanitized);
    const normalizedWorkDir = resolve(workDir);

    if (!fullPath.startsWith(normalizedWorkDir + '/') && fullPath !== normalizedWorkDir) {
        return null;
    }

    return fullPath;
}

interface TestRunResult {
    passed: number;
    total: number;
    logs: string;
    success: boolean;
}

export async function runGrader(job: GradingJob): Promise<GradingResult> {
    // If challenge opts into a secure runner, delegate here (backwards compatible)
    if (job.runner?.mode === 'http') {
        return runDockerBlackboxGrader(job);
    }

    if (job.runner?.mode === 'playwright') {
        return runDockerPlaywrightGrader(job);
    }

    if (job.runner?.mode === 'ui_jsdom') {
        return runDockerUiJsdomGrader(job);
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    // Use SEPARATE directories for public and hidden tests
    const publicDir = join(tmpdir(), `grader_pub_${job.attemptId}_${timestamp}_${randomSuffix}`);
    const hiddenDir = join(tmpdir(), `grader_hid_${job.attemptId}_${timestamp}_${randomSuffix}`);

    console.log(`[Docker] Starting grading for attempt ${job.attemptId}`);

    try {
        // Run public tests
        let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.publicTests && job.publicTests.trim()) {
            console.log('[Docker] Running public tests...');
            publicResult = await runTestsInIsolation({
                workDir: publicDir,
                files: job.files,
                testCode: job.publicTests,
                testType: 'public',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
                memoryLimit: job.memoryLimit,
                nodeVersion: job.nodeVersion,
            });
        }

        // Run hidden tests in SEPARATE directory (candidate code cannot read hidden tests)
        let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.hiddenTests && job.hiddenTests.trim()) {
            console.log('[Docker] Running hidden tests (isolated)...');
            hiddenResult = await runTestsInIsolation({
                workDir: hiddenDir,
                files: job.files,
                testCode: job.hiddenTests,
                testType: 'hidden',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
                memoryLimit: job.memoryLimit,
                nodeVersion: job.nodeVersion,
            });
        }

        const result: GradingResult = {
            publicScore: publicResult.passed,
            hiddenScore: hiddenResult.passed,
            totalPublic: publicResult.total,
            totalHidden: hiddenResult.total,
            logs: sanitizeLogs(publicResult.logs), // Only show public test logs
            success: publicResult.success && hiddenResult.success,
        };

        console.log(`[Docker] Completed: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);

        return result;
    } catch (error) {
        console.error('[Docker] Grader error:', error);
        return {
            publicScore: 0,
            hiddenScore: 0,
            totalPublic: 0,
            totalHidden: 0,
            logs: sanitizeErrorMessage(String(error)),
            success: false,
            error: String(error),
        };
    } finally {
        // Cleanup both directories
        await Promise.all([
            rm(publicDir, { recursive: true, force: true }).catch(() => { }),
            rm(hiddenDir, { recursive: true, force: true }).catch(() => { }),
        ]);
    }
}

interface TestRunConfig {
    workDir: string;
    files: Record<string, unknown>;
    testCode: string;
    testType: 'public' | 'hidden';
    dependencies: Record<string, string>;
    timeLimit: number;
    memoryLimit: number;
    nodeVersion?: string;
}

/**
 * Run tests in an isolated Docker container
 * Uses pooled containers when available for faster execution.
 */
async function runTestsInIsolation(config: TestRunConfig): Promise<TestRunResult> {
    const { workDir, files, testCode, testType, dependencies, timeLimit, memoryLimit, nodeVersion } = config;

    // Fast path: use pre-warmed container pool if available for these specific dependencies
    if (isPoolWarmForDeps(dependencies)) {
        try {
            console.log(`[Docker] Using pooled container for ${testType} tests...`);
            return await runTestsWithPool(config);
        } catch (poolError) {
            console.warn(`[Docker] Pool grading failed, falling back to ephemeral:`, poolError);
            // Fall through to ephemeral container
        }
    }

    // Standard path: ephemeral container
    try {
        // Create workspace
        await mkdir(workDir, { recursive: true, mode: 0o755 });
        await mkdir(join(workDir, 'src'), { recursive: true });
        await mkdir(join(workDir, '__tests__'), { recursive: true });

        // Write candidate files with strict path validation
        let filesWritten = 0;
        for (const [path, content] of Object.entries(files)) {
            const safePath = sanitizeFilePath(path, workDir);

            if (!safePath) {
                console.error(`[SECURITY] Path blocked: ${path}`);
                continue;
            }

            const dir = dirname(safePath);
            await mkdir(dir, { recursive: true }).catch(() => { });
            await writeFile(safePath, content as string);
            filesWritten++;
        }

        if (filesWritten === 0) {
            return {
                passed: 0,
                total: 0,
                logs: 'No valid files to test',
                success: false,
            };
        }

        // Detect if it's a React challenge
        const isReactChallenge = Object.keys(dependencies || {}).some(dep =>
            dep === 'react' || dep.includes('react')
        );

        // Write test file (only this test type)
        const testExt = isReactChallenge ? '.jsx' : '.js';
        await writeFile(join(workDir, '__tests__', `${testType}.test${testExt}`), testCode);

        // Base dev dependencies
        const devDependencies: Record<string, string> = {
            'jest': '^29.7.0',
            'supertest': '^6.3.3',
        };

        if (isReactChallenge) {
            Object.assign(devDependencies, {
                '@testing-library/react': '^14.0.0',
                '@testing-library/jest-dom': '^6.1.0',
                '@babel/preset-react': '^7.22.0',
                '@babel/preset-env': '^7.22.0',
                'jest-environment-jsdom': '^29.7.0',
            });

            await writeFile(join(workDir, 'jest.config.js'), `module.exports = {
    testEnvironment: 'jsdom',
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    moduleFileExtensions: ['js', 'jsx'],
    transform: { '^.+\\\\.jsx?$': 'babel-jest' },
    testPathIgnorePatterns: ['/node_modules/'],
};`);
            await writeFile(join(workDir, 'jest.setup.js'), `import '@testing-library/jest-dom';`);
            await writeFile(join(workDir, 'babel.config.js'), `module.exports = {
    presets: ['@babel/preset-env', ['@babel/preset-react', { runtime: 'automatic' }]],
};`);
        }

        // Create package.json with strict test pattern - ONLY matches this test type
        const packageJson = {
            name: 'exam-submission',
            version: '1.0.0',
            scripts: {
                // SECURITY: Strict pattern - ONLY matches __tests__/<testType>.test.<ext>
                test: `jest --json --outputFile=results.json --testPathPattern="__tests__/${testType}\\.test\\.(js|jsx)$" --testPathIgnorePatterns="/node_modules/" --forceExit --testTimeout=10000`,
            },
            dependencies: { ...dependencies },
            devDependencies,
        };
        await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

        const dockerImage = `node:${nodeVersion || '20'}-alpine`;

        // Phase 1: npm install WITH network access
        console.log(`[Docker] Installing dependencies for ${testType} tests...`);
        try {
            await executeDocker({
                image: dockerImage,
                workDir,
                command: 'npm install --legacy-peer-deps 2>&1',
                timeout: 120000, // 2 minutes for install
                memoryLimit,
                networkEnabled: true, // Enable network for npm install
            });
        } catch (installError) {
            console.error(`[Docker] npm install failed for ${testType}:`, installError);
            return {
                passed: 0,
                total: 0,
                logs: `Dependency installation failed: ${sanitizeErrorMessage(String(installError))}`,
                success: false,
            };
        }

        // Phase 2: Run tests WITHOUT network access (security)
        console.log(`[Docker] Running ${testType} tests (network disabled)...`);
        let testOutput = '';
        try {
            testOutput = await executeDocker({
                image: dockerImage,
                workDir,
                command: 'npm test 2>&1 || true',
                timeout: timeLimit * 1000,
                memoryLimit,
                networkEnabled: false, // Disable network for test execution
            });
        } catch (testError) {
            testOutput = String(testError);
        }

        // Parse results
        return await parseTestResults(workDir, testOutput);
    } catch (error) {
        return {
            passed: 0,
            total: 0,
            logs: `Test execution error: ${sanitizeErrorMessage(String(error))}`,
            success: false,
        };
    }
}

interface DockerExecOptions {
    image: string;
    workDir: string;
    command: string;
    timeout: number;
    memoryLimit: number;
    networkEnabled: boolean;
}

async function executeDocker(options: DockerExecOptions): Promise<string> {
    const { image, workDir, command, timeout, memoryLimit, networkEnabled } = options;

    const dockerArgs = [
        'run',
        '--rm',
        '--memory', `${memoryLimit}m`,
        '--memory-swap', `${memoryLimit}m`, // Prevent swap usage
        '--cpus', '1',
        '--pids-limit', '100', // Limit process spawning
        '--read-only', // Read-only root filesystem
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m', // Writable /tmp
        '--tmpfs', '/home/node/.npm:rw,size=200m', // Writable npm cache
        '-v', `${workDir}:/app:rw`,
        '-w', '/app',
        '--user', '1000:1000', // Non-root user
    ];

    // Network isolation for test phase
    if (!networkEnabled) {
        dockerArgs.push('--network', 'none');
    }

    dockerArgs.push(image, 'sh', '-c', command);

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', dockerArgs);
        let output = '';
        let errorOutput = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error('Execution timeout'));
        }, timeout);

        proc.on('close', (code) => {
            clearTimeout(timer);
            const fullOutput = output + '\n' + errorOutput;

            if (code !== 0 && !output.includes('Tests:')) {
                // Only reject if it's not a test failure
                reject(new Error(fullOutput));
            } else {
                resolve(fullOutput);
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function parseTestResults(workDir: string, logs: string): Promise<TestRunResult> {
    try {
        const resultsPath = join(workDir, 'results.json');
        const resultsContent = await readFile(resultsPath, 'utf-8').catch(() => null);

        if (resultsContent) {
            const jestResults = JSON.parse(resultsContent);

            let passed = 0;
            let total = 0;

            for (const testFile of jestResults.testResults || []) {
                for (const assertion of testFile.assertionResults || []) {
                    total++;
                    if (assertion.status === 'passed') passed++;
                }
            }

            return {
                passed,
                total,
                logs: sanitizeLogs(logs),
                success: jestResults.success !== false,
            };
        }

        // Fallback: parse from console output
        const passedMatch = logs.match(/Tests:\s+(\d+)\s+passed/);
        const failedMatch = logs.match(/Tests:\s+(\d+)\s+failed/);
        const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

        return {
            passed,
            total: passed + failed,
            logs: sanitizeLogs(logs),
            success: failed === 0 && passed > 0,
        };
    } catch (error) {
        return {
            passed: 0,
            total: 0,
            logs: sanitizeLogs(logs) + '\n\nParsing error: ' + sanitizeErrorMessage(String(error)),
            success: false,
            error: 'Failed to parse test results',
        } as any;
    }
}

function sanitizeLogs(logs: string): string {
    return logs
        .replace(/hidden\.test\.(js|jsx|ts|tsx)/gi, '[hidden-test]')
        .replace(/\/var\/folders\/[^\s]+/g, '[temp-dir]')
        .replace(/\/tmp\/grader_[^\s]+/g, '[temp-dir]')
        .replace(/\/app\/[^\s]*hidden[^\s]*/gi, '[hidden-path]')
        // Remove absolute paths
        .replace(/\/private\/var\/[^\s]+/g, '[temp-dir]')
        // Remove potential env var leaks
        .replace(/[A-Z_]+=[^\s]+/g, '[env-hidden]');
}

function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/\/var\/folders\/[^\s]+/g, '[temp]')
        .replace(/\/tmp\/[^\s]+/g, '[temp]')
        .substring(0, 500);
}

/**
 * Run tests using pre-warmed container pool (FAST PATH)
 * 
 * This eliminates the ~60s npm install overhead by reusing containers
 * with dependencies already installed.
 */
async function runTestsWithPool(config: TestRunConfig): Promise<TestRunResult> {
    const { files, testCode, testType, dependencies } = config;

    const pool = await getTestRunnerPool(dependencies);
    const container = await pool.acquire(10000); // 10s timeout

    try {
        console.log(`[Pool] Acquired container ${container.name} for ${testType} tests`);

        // Write candidate files
        const candidateFiles: Record<string, string> = {};
        for (const [path, content] of Object.entries(files)) {
            const safePath = sanitizeFilePath(path, container.workDir);
            if (safePath) {
                // Convert to relative path for copyToContainer
                const relativePath = path.startsWith('/') ? path.slice(1) : path;
                candidateFiles[relativePath] = content as string;
            }
        }

        await pool.copyToContainer(container, candidateFiles, '/app');

        // Write test file
        await pool.copyToContainer(container, {
            [`__tests__/${testType}.test.js`]: testCode,
        }, '/app');

        // Run tests (no npm install needed - already done during warmup!)
        const output = await pool.execInContainer(
            container.name,
            'npm test 2>&1 || true',
            config.timeLimit * 1000
        );

        // Read results
        let resultsJson = '';
        try {
            resultsJson = await pool.execInContainer(container.name, 'cat results.json 2>/dev/null || echo "{}"', 5000);
        } catch {
            // Ignore - parse from output
        }

        // Parse results
        let passed = 0;
        let total = 0;

        try {
            const results = JSON.parse(resultsJson);
            if (results.testResults) {
                for (const testFile of results.testResults) {
                    for (const assertion of testFile.assertionResults || []) {
                        total++;
                        if (assertion.status === 'passed') passed++;
                    }
                }
            }
        } catch {
            // Fallback: parse from console output
            const passedMatch = output.match(/Tests:\s+(\d+)\s+passed/);
            const failedMatch = output.match(/Tests:\s+(\d+)\s+failed/);
            passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
            total = passed + failed;
        }

        console.log(`[Pool] ${testType} tests completed: ${passed}/${total}`);

        return {
            passed,
            total,
            logs: sanitizeLogs(output),
            success: passed > 0 || total === 0,
        };
    } finally {
        // Release container back to pool
        await pool.release(container);
        console.log(`[Pool] Released container ${container.name}`);
    }
}
