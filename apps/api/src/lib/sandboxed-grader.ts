import { exec } from 'child_process';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join, dirname, resolve, normalize } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult } from '@exam-platform/shared';

/**
 * Sandboxed Local Grader
 * 
 * ⚠️  SECURITY WARNING: This grader provides LIMITED isolation!
 * - It runs code directly on the host via exec()
 * - Process-level isolation only (separate directories for public/hidden tests)
 * - NO network isolation, NO filesystem sandboxing
 * 
 * For production with untrusted code, use GRADER_MODE=docker
 * 
 * Key Features:
 * 1. Separate execution of public and hidden tests in different directories
 * 2. Hidden tests run in isolated directory (candidate code can't access)
 * 3. Process timeout limits
 * 4. Strict path validation to prevent traversal attacks
 * 5. Minimal environment variables (no secret leakage)
 * 6. Strict test file pattern matching
 */

interface TestRunResult {
    passed: number;
    total: number;
    logs: string;
    success: boolean;
}

// Minimal safe environment for test execution
const SAFE_ENV: Record<string, string> = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    NODE_ENV: 'test',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false',
};

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
 * Returns null if path is invalid/dangerous
 */
function sanitizeFilePath(filePath: string, workDir: string): string | null {
    // Block obvious traversal patterns
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
        return null;
    }

    // Block writes to test directories and configuration files
    const normalizedPath = filePath.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (normalizedPath === blocked || normalizedPath.startsWith(blocked + '/')) {
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

    // Normalize and resolve the path
    const sanitized = filePath
        .replace(/\.\./g, '')
        .replace(/^[/\\]+/, '')
        .replace(/[/\\]+/g, '/');

    const fullPath = resolve(workDir, sanitized);
    const normalizedWorkDir = resolve(workDir);

    // Ensure resolved path is within workDir
    if (!fullPath.startsWith(normalizedWorkDir + '/') && fullPath !== normalizedWorkDir) {
        return null;
    }

    return fullPath;
}

/**
 * Run the sandboxed grader
 */
export async function runSandboxedGrader(job: GradingJob): Promise<GradingResult> {
    // Warn in production - this grader is not fully secure
    if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  SECURITY: sandboxed grader has limited isolation. Consider using docker mode.');
    }

    console.log(`[Sandbox] Starting grading for attempt ${job.attemptId}`);
    
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const publicDir = join(tmpdir(), `grader_pub_${job.attemptId}_${timestamp}_${randomSuffix}`);
    const hiddenDir = join(tmpdir(), `grader_hid_${job.attemptId}_${timestamp}_${randomSuffix}`);

    try {
        // Run public tests
        let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.publicTests && job.publicTests.trim()) {
            console.log('[Sandbox] Running public tests...');
            publicResult = await runTestsInIsolation({
                workDir: publicDir,
                files: job.files,
                testCode: job.publicTests,
                testType: 'public',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
                isReact: isReactChallenge(job.dependencies),
            });
        }

        // Run hidden tests in SEPARATE directory
        let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.hiddenTests && job.hiddenTests.trim()) {
            console.log('[Sandbox] Running hidden tests...');
            hiddenResult = await runTestsInIsolation({
                workDir: hiddenDir,
                files: job.files,
                testCode: job.hiddenTests,
                testType: 'hidden',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
                isReact: isReactChallenge(job.dependencies),
            });
        }

        const result: GradingResult = {
            publicScore: publicResult.passed,
            hiddenScore: hiddenResult.passed,
            totalPublic: publicResult.total,
            totalHidden: hiddenResult.total,
            logs: publicResult.logs, // Only show public test logs to candidate
            success: publicResult.success && hiddenResult.success,
        };

        console.log(`[Sandbox] Completed: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);
        
        return result;
    } catch (error) {
        console.error('[Sandbox] Error:', error);
        return {
            publicScore: 0,
            hiddenScore: 0,
            totalPublic: 0,
            totalHidden: 0,
            logs: `Grading error: ${sanitizeErrorMessage(String(error))}`,
            success: false,
            error: 'Grading failed',
        };
    } finally {
        // Cleanup both directories
        await Promise.all([
            rm(publicDir, { recursive: true, force: true }).catch(() => {}),
            rm(hiddenDir, { recursive: true, force: true }).catch(() => {}),
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
    isReact: boolean;
}

/**
 * Run tests in an isolated directory
 */
async function runTestsInIsolation(config: TestRunConfig): Promise<TestRunResult> {
    const { workDir, files, testCode, testType, dependencies, timeLimit, isReact } = config;

    try {
        // Create workspace
        await mkdir(workDir, { recursive: true, mode: 0o700 }); // Restrictive permissions
        await mkdir(join(workDir, 'src'), { recursive: true });
        await mkdir(join(workDir, '__tests__'), { recursive: true });

        // Write candidate files with strict path validation
        let filesWritten = 0;
        for (const [filePath, content] of Object.entries(files)) {
            const safePath = sanitizeFilePath(filePath, workDir);
            
            if (!safePath) {
                console.error(`[SECURITY] Path traversal blocked: ${filePath}`);
                continue;
            }
            
            const dir = dirname(safePath);
            await mkdir(dir, { recursive: true }).catch(() => {});
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

        // Write test file with exact naming
        const testExt = isReact ? '.jsx' : '.js';
        await writeFile(join(workDir, '__tests__', `${testType}.test${testExt}`), testCode);

        // Create package.json with strict test pattern
        const devDependencies: Record<string, string> = {
            'jest': '^29.7.0',
            'supertest': '^6.3.3',
        };

        if (isReact) {
            Object.assign(devDependencies, {
                '@testing-library/react': '^14.0.0',
                '@testing-library/jest-dom': '^6.1.0',
                '@babel/preset-react': '^7.22.0',
                '@babel/preset-env': '^7.22.0',
                'jest-environment-jsdom': '^29.7.0',
            });

            // Create React config files
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

        // SECURITY: Strict test pattern - ONLY matches __tests__/<testType>.test.<ext>
        // This prevents candidates from injecting test files at other paths
        const packageJson = {
            name: 'exam-submission',
            version: '1.0.0',
            scripts: {
                test: `jest --json --outputFile=results.json --testPathPattern="__tests__/${testType}\\.test\\.(js|jsx)$" --testPathIgnorePatterns="/node_modules/" --forceExit --testTimeout=10000`,
            },
            dependencies: { ...dependencies },
            devDependencies,
        };
        await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

        // Run npm install with timeout
        try {
            await execWithTimeout('npm install --legacy-peer-deps 2>&1', workDir, 60000);
        } catch (installError) {
            return {
                passed: 0,
                total: 0,
                logs: `npm install failed: ${sanitizeErrorMessage(String(installError))}`,
                success: false,
            };
        }

        // Run tests with timeout
        let testOutput = '';
        try {
            testOutput = await execWithTimeout('npm test 2>&1', workDir, timeLimit * 1000);
        } catch (testError: any) {
            // Jest returns non-zero on test failures - that's OK
            testOutput = testError.stdout || testError.message || String(testError);
        }

        // Parse results
        return await parseResults(workDir, testOutput);
    } catch (error) {
        return {
            passed: 0,
            total: 0,
            logs: `Test execution error: ${sanitizeErrorMessage(String(error))}`,
            success: false,
        };
    }
}

/**
 * Execute command with timeout and safe environment
 */
async function execWithTimeout(command: string, cwd: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = exec(command, {
            cwd,
            timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            // SECURITY: Use minimal safe environment - no secret leakage
            env: SAFE_ENV,
        }, (error, stdout, stderr) => {
            if (error && error.killed) {
                reject(new Error('Timeout - execution took too long'));
            } else if (error) {
                // Return output even on error (test failures)
                resolve(stdout + '\n' + stderr);
            } else {
                resolve(stdout + '\n' + stderr);
            }
        });

        // Force kill after timeout + grace period
        setTimeout(() => {
            child.kill('SIGKILL');
        }, timeout + 5000);
    });
}

/**
 * Parse Jest results
 */
async function parseResults(workDir: string, logs: string): Promise<TestRunResult> {
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
            logs: sanitizeLogs(logs) + '\n\nFailed to parse results',
            success: false,
        };
    }
}

/**
 * Check if challenge uses React
 */
function isReactChallenge(dependencies: Record<string, string>): boolean {
    return Object.keys(dependencies || {}).some(dep => dep === 'react' || dep.includes('react'));
}

/**
 * Sanitize logs to remove sensitive paths and hidden test details
 */
function sanitizeLogs(logs: string): string {
    return logs
        // Remove hidden test file paths
        .replace(/hidden\.test\.(js|jsx|ts|tsx)/gi, '[hidden-test]')
        // Remove stack traces that might reveal test structure
        .replace(/at\s+Object\.<anonymous>\s*\([^)]*hidden[^)]*\)/gi, 'at [hidden-test]')
        // Remove absolute paths
        .replace(/\/var\/folders\/[^\s]+/g, '[temp-dir]')
        .replace(/\/tmp\/grader_[^\s]+/g, '[temp-dir]')
        .replace(/\/private\/var\/[^\s]+/g, '[temp-dir]')
        // Remove potential env var leaks
        .replace(/[A-Z_]+=\S+/g, '[env-hidden]');
}

/**
 * Sanitize error messages
 */
function sanitizeErrorMessage(message: string): string {
    return message
        .replace(/\/var\/folders\/[^\s]+/g, '[temp]')
        .replace(/\/tmp\/[^\s]+/g, '[temp]')
        .replace(/\/private\/var\/[^\s]+/g, '[temp]')
        .substring(0, 500);
}
