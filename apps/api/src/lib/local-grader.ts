import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult } from '@exam-platform/shared';

const execAsync = promisify(exec);

/**
 * Local Grader - Development Only
 * 
 * ⚠️  CRITICAL SECURITY WARNING ⚠️
 * This grader has NO SANDBOXING and must NEVER be used in production!
 * 
 * Vulnerabilities in this mode:
 * - Candidate code can access the entire filesystem
 * - Candidate code can execute arbitrary system commands
 * - Candidate code has full network access
 * - No resource limits enforced
 * 
 * Security improvements in this version:
 * - Separate execution directories for public/hidden tests (hidden test isolation)
 * - Path validation blocks test directory writes
 * - Only used when explicitly enabled and NOT in production
 * 
 * Use ONLY for local development and testing.
 * For production, use GRADER_MODE=docker
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

export async function runLocalGrader(job: GradingJob): Promise<GradingResult> {
    // SECURITY: Strictly block usage in production
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ CRITICAL SECURITY: Local grader BLOCKED in production!');
        return {
            publicScore: 0,
            hiddenScore: 0,
            totalPublic: 0,
            totalHidden: 0,
            logs: 'Grading service misconfigured. Please contact support.',
            success: false,
            error: 'Local grader blocked in production',
        };
    }

    console.warn('⚠️  DEV ONLY: Running local grader (no sandbox) - NEVER use in production!');
    
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    // Use SEPARATE directories for public and hidden tests
    const publicDir = join(tmpdir(), `grader_pub_${job.attemptId}_${timestamp}_${randomSuffix}`);
    const hiddenDir = join(tmpdir(), `grader_hid_${job.attemptId}_${timestamp}_${randomSuffix}`);

    try {
        // Run public tests
        let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.publicTests && job.publicTests.trim()) {
            console.log('[Local] Running public tests...');
            publicResult = await runTestsInIsolation({
                workDir: publicDir,
                files: job.files,
                testCode: job.publicTests,
                testType: 'public',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
            });
        }

        // Run hidden tests in SEPARATE directory
        let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
        if (job.hiddenTests && job.hiddenTests.trim()) {
            console.log('[Local] Running hidden tests (isolated)...');
            hiddenResult = await runTestsInIsolation({
                workDir: hiddenDir,
                files: job.files,
                testCode: job.hiddenTests,
                testType: 'hidden',
                dependencies: job.dependencies,
                timeLimit: job.timeLimit,
            });
        }

        const result: GradingResult = {
            publicScore: publicResult.passed,
            hiddenScore: hiddenResult.passed,
            totalPublic: publicResult.total,
            totalHidden: hiddenResult.total,
            logs: publicResult.logs, // Only show public test logs
            success: publicResult.success && hiddenResult.success,
        };

        console.log(`[Local] Completed: ${result.publicScore}/${result.totalPublic} public, ${result.hiddenScore}/${result.totalHidden} hidden`);

        return result;
    } catch (error) {
        console.error('[Local] Error:', error);
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
}

/**
 * Run tests in an isolated directory
 */
async function runTestsInIsolation(config: TestRunConfig): Promise<TestRunResult> {
    const { workDir, files, testCode, testType, dependencies, timeLimit } = config;

    try {
        // Create workspace
        await mkdir(workDir, { recursive: true });
        await mkdir(join(workDir, 'src'), { recursive: true });
        await mkdir(join(workDir, '__tests__'), { recursive: true });

        // Write candidate files with path validation
        let filesWritten = 0;
        for (const [filePath, content] of Object.entries(files)) {
            const safePath = sanitizeFilePath(filePath, workDir);
            
            if (!safePath) {
                console.error(`[SECURITY] Path blocked: ${filePath}`);
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

        console.log(`[Local] Running ${testType} tests in ${workDir}`);

        // Run npm install
        try {
            await execAsync('npm install --legacy-peer-deps', {
                cwd: workDir,
                timeout: 60000,
            });
        } catch (installError) {
            console.error(`[Local] npm install error for ${testType}:`, installError);
            return {
                passed: 0,
                total: 0,
                logs: `npm install failed: ${String(installError)}`,
                success: false,
            };
        }

        // Run tests
        let testOutput = '';
        try {
            const { stdout, stderr } = await execAsync('npm test', {
                cwd: workDir,
                timeout: timeLimit * 1000,
            });
            testOutput = stdout + '\n' + stderr;
        } catch (testError: any) {
            testOutput = (testError.stdout || '') + '\n' + (testError.stderr || '') + '\n' + String(testError.message);
        }

        console.log(`[Local] ${testType} test output:`, testOutput.substring(0, 500));

        return await parseTestResults(workDir, testOutput);
    } catch (error) {
        console.error(`[Local] Error running ${testType} tests:`, error);
        return {
            passed: 0,
            total: 0,
            logs: String(error),
            success: false,
        };
    }
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
            total: passed + failed || 1,
            logs: sanitizeLogs(logs),
            success: failed === 0 && passed > 0,
        };
    } catch (error) {
        console.error('[Local] Parse error:', error);
        return {
            passed: 0,
            total: 0,
            logs: sanitizeLogs(logs) + '\n\nParsing error: ' + String(error),
            success: false,
        };
    }
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
