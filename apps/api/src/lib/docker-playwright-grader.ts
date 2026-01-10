import { spawn } from 'child_process';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import type { ChallengeRunner, GradingJob, GradingResult } from '@exam-platform/shared';
import { acquireNetworkWithRetry, releaseNetwork } from './network-pool.js';
import { acquireBlackboxContainer, releaseBlackboxContainer, type BlackboxContainer } from './blackbox-pool-manager.js';

interface TestRunResult {
    passed: number;
    total: number;
    logs: string;
    success: boolean;
}

// Reserved paths that candidate files must never touch
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

const BLOCKED_FILENAME_PATTERNS = [
    /\.test\.(js|jsx|ts|tsx)$/i,
    /\.spec\.(js|jsx|ts|tsx)$/i,
    /^jest\./i,
    /^babel\./i,
    /^\.babelrc/i,
    /^tsconfig/i,
    /^package(-lock)?\.json$/i,
    /^results\.json$/i,
];

function sanitizeFilePath(filePath: string, workDir: string): string | null {
    if (filePath.includes('..') || filePath.startsWith('/') || filePath.startsWith('\\')) {
        return null;
    }

    const normalizedPath = filePath.toLowerCase();
    for (const blocked of BLOCKED_PATHS) {
        if (normalizedPath === blocked || normalizedPath.startsWith(blocked + '/')) {
            return null;
        }
    }

    const fileName = filePath.split('/').pop() || filePath;
    for (const pattern of BLOCKED_FILENAME_PATTERNS) {
        if (pattern.test(fileName)) {
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

async function writeCandidateWorkspace(params: {
    workDir: string;
    files: Record<string, unknown>;
    generatedFiles?: Record<string, string>;
}): Promise<number> {
    const { workDir, files, generatedFiles } = params;

    await mkdir(workDir, { recursive: true, mode: 0o755 });

    console.log(`[Playwright] Writing candidate workspace to ${workDir}`);
    console.log(`[Playwright] User files: ${Object.keys(files).join(', ')}`);
    console.log(`[Playwright] Generated files: ${generatedFiles ? Object.keys(generatedFiles).join(', ') : 'none'}`);

    let filesWritten = 0;
    for (const [path, content] of Object.entries(files)) {
        const safePath = sanitizeFilePath(path, workDir);
        if (!safePath) {
            console.error(`[SECURITY] Path blocked: ${path}`);
            continue;
        }
        await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
        await writeFile(safePath, content as string);
        console.log(`[Playwright] Wrote user file: ${path}`);
        filesWritten++;
    }

    if (generatedFiles) {
        for (const [path, content] of Object.entries(generatedFiles)) {
            const safePath = resolve(workDir, path.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '/'));
            if (!safePath.startsWith(resolve(workDir) + '/')) {
                throw new Error(`Invalid generated file path: ${path}`);
            }
            await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
            await writeFile(safePath, content);
            console.log(`[Playwright] Wrote generated file: ${path}`);
        }
    }

    console.log(`[Playwright] Total files written: ${filesWritten} user + ${generatedFiles ? Object.keys(generatedFiles).length : 0} generated`);
    return filesWritten;
}

async function writePlaywrightHarness(params: {
    workDir: string;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<void> {
    const { workDir, testType, testCode } = params;

    await mkdir(workDir, { recursive: true, mode: 0o755 });
    await mkdir(join(workDir, 'tests'), { recursive: true });

    await writeFile(join(workDir, 'tests', `${testType}.spec.js`), testCode);

    // Minimal Playwright config: baseURL comes from env
    await writeFile(
        join(workDir, 'playwright.config.js'),
        `const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  use: {
    baseURL: process.env.BASE_URL,
    headless: true,
  },
  retries: 0,
});`
    );

    const packageJson = {
        name: 'playwright-tests',
        version: '1.0.0',
        private: true,
        devDependencies: {
            '@playwright/test': '^1.49.0',
        },
    };

    await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));
}

async function dockerExec(params: { args: string[]; timeoutMs: number }): Promise<{ stdout: string; stderr: string }> {
    const { args, timeoutMs } = params;

    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`Docker command timeout: docker ${args.join(' ')}`));
        }, timeoutMs);

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(`Docker command failed (${code}): docker ${args.join(' ')}\n${stdout}\n${stderr}`));
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

async function dockerRunDetached(params: {
    name: string;
    network: string;
    alias: string;
    image: string;
    workDir: string;
    containerWorkDir?: string;
    command: string;
    env: Record<string, string>;
    memoryLimitMb: number;
}): Promise<void> {
    const { name, network, alias, image, workDir, containerWorkDir, command, env, memoryLimitMb } = params;

    const resolvedWorkDir = containerWorkDir || '/app';

    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(env)) {
        envArgs.push('-e', `${k}=${v}`);
    }

    const args = [
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '--network',
        network,
        '--network-alias',
        alias,
        '--memory',
        `${memoryLimitMb}m`,
        '--memory-swap',
        `${memoryLimitMb}m`,
        '--cpus',
        '1',
        '--pids-limit',
        '200',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=300m',
        '--tmpfs',
        '/home/node/.npm:rw,size=200m', // Writable npm cache
        '--tmpfs',
        '/home/pwuser/.npm:rw,size=200m', // Playwright user npm cache
        '-v',
        `${workDir}:${resolvedWorkDir}:rw`,
        '-w',
        resolvedWorkDir,
        '--user',
        '1000:1000',
        ...envArgs,
        image,
        'sh',
        '-c',
        command,
    ];

    try {
        await dockerExec({ args, timeoutMs: 15000 });
    } catch (error) {
        await safeDockerCleanup({ containerName: name });
        throw error;
    }
}

async function dockerRunOnce(params: {
    network: string;
    image: string;
    workDir: string;
    containerWorkDir?: string;
    command: string;
    env: Record<string, string>;
    timeoutMs: number;
    memoryLimitMb: number;
    name?: string;
}): Promise<string> {
    const { network, image, workDir, containerWorkDir, command, env, timeoutMs, memoryLimitMb, name } = params;

    const resolvedWorkDir = containerWorkDir || '/app';
    const containerName =
        name ||
        `grader_run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(env)) {
        envArgs.push('-e', `${k}=${v}`);
    }

    const args = [
        'run',
        '--rm',
        '--name',
        containerName,
        '--network',
        network,
        '--memory',
        `${memoryLimitMb}m`,
        '--memory-swap',
        `${memoryLimitMb}m`,
        '--cpus',
        '1',
        '--pids-limit',
        '200',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,noexec,nosuid,size=300m',
        '--tmpfs',
        '/home/node/.npm:rw,size=200m', // Writable npm cache
        '--tmpfs',
        '/home/pwuser/.npm:rw,size=200m', // Playwright user npm cache
        '-v',
        `${workDir}:${resolvedWorkDir}:rw`,
        '-w',
        resolvedWorkDir,
        '--user',
        '1000:1000',
        ...envArgs,
        image,
        'sh',
        '-c',
        command,
    ];

    try {
        const { stdout, stderr } = await dockerExec({ args, timeoutMs });
        return `${stdout}\n${stderr}`.trim();
    } catch (error) {
        await safeDockerCleanup({ containerName });
        throw error;
    }
}

async function safeDockerCleanup(params: { containerName?: string; networkName?: string }) {
    const { containerName, networkName } = params;
    const cleanups: Promise<unknown>[] = [];
    if (containerName) {
        cleanups.push(dockerExec({ args: ['rm', '-f', containerName], timeoutMs: 5000 }).catch(() => {}));
    }
    if (networkName) {
        cleanups.push(dockerExec({ args: ['network', 'rm', networkName], timeoutMs: 5000 }).catch(() => {}));
    }
    await Promise.allSettled(cleanups);
}

async function waitForHttp(params: {
    containerName: string;
    port: number;
    healthPath: string;
    timeoutMs: number;
}): Promise<string> {
    const { containerName, port, healthPath, timeoutMs } = params;
    const deadline = Date.now() + timeoutMs;
    const debugLogs: string[] = [];
    let attempts = 0;

    // Give the container a moment to start the server process
    await new Promise((r) => setTimeout(r, 1000));
    debugLogs.push('[Init] Waited 1s for container to initialize');

    // Use node to make HTTP request instead of wget - more reliable in Alpine containers
    const healthCheckScript = `
const http = require('http');
const req = http.get('http://127.0.0.1:${port}${healthPath}', { timeout: 3000 }, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
`.trim().replace(/\n/g, ' ');

    while (Date.now() < deadline) {
        attempts++;
        try {
            const args = [
                'exec',
                containerName,
                'node',
                '-e',
                healthCheckScript,
            ];
            debugLogs.push(`[Attempt ${attempts}] Health check via node http`);
            await dockerExec({ args, timeoutMs: 5000 });
            debugLogs.push(`[Attempt ${attempts}] SUCCESS - Server is ready`);
            return debugLogs.join('\n');
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            // Only log first few attempts and then periodically to avoid spam
            if (attempts <= 3 || attempts % 10 === 0) {
                debugLogs.push(`[Attempt ${attempts}] FAILED: ${errMsg.substring(0, 150)}`);
            }
        }

        await new Promise((r) => setTimeout(r, 500));
    }

    // Final debug: check if container is still running and try to get more info
    try {
        const { stdout } = await dockerExec({
            args: ['exec', containerName, 'ps', 'aux'],
            timeoutMs: 3000,
        });
        debugLogs.push(`\n[DEBUG] Container processes:\n${stdout}`);
    } catch {
        debugLogs.push(`\n[DEBUG] Could not get container processes`);
    }

    try {
        const { stdout } = await dockerExec({
            args: ['exec', containerName, 'netstat', '-tlnp'],
            timeoutMs: 3000,
        });
        debugLogs.push(`\n[DEBUG] Listening ports:\n${stdout}`);
    } catch {
        // netstat might not be available
        try {
            const { stdout } = await dockerExec({
                args: ['exec', containerName, 'ss', '-tlnp'],
                timeoutMs: 3000,
            });
            debugLogs.push(`\n[DEBUG] Listening ports (ss):\n${stdout}`);
        } catch {
            debugLogs.push(`\n[DEBUG] Could not get listening ports`);
        }
    }

    // Also try one more wget to see if it works now
    try {
        debugLogs.push('\n[DEBUG] Final wget test:');
        const { stdout, stderr } = await dockerExec({
            args: ['exec', containerName, 'wget', '-O', '-', '-T', '3', `http://127.0.0.1:${port}${healthPath}`],
            timeoutMs: 5000,
        });
        debugLogs.push(`stdout: ${stdout.substring(0, 500)}`);
        debugLogs.push(`stderr: ${stderr.substring(0, 200)}`);
    } catch (e) {
        debugLogs.push(`wget failed: ${e instanceof Error ? e.message.substring(0, 200) : String(e).substring(0, 200)}`);
    }

    throw new Error(`Candidate app did not become ready in time after ${attempts} attempts\n\n--- Health Check Debug ---\n${debugLogs.join('\n')}`);
}

function parseJUnit(xml: string): { total: number; failures: number; errors: number; skipped: number } {
    const suiteTagMatches = [...xml.matchAll(/<testsuite\b[^>]*>/g)];

    if (suiteTagMatches.length > 0) {
        let total = 0;
        let failures = 0;
        let errors = 0;
        let skipped = 0;

        for (const m of suiteTagMatches) {
            const tag = m[0];
            const getAttr = (name: string) => {
                const attr = tag.match(new RegExp(`${name}="(\\d+)"`));
                return attr ? parseInt(attr[1], 10) : 0;
            };

            total += getAttr('tests');
            failures += getAttr('failures');
            errors += getAttr('errors');
            skipped += getAttr('skipped');
        }

        return { total, failures, errors, skipped };
    }

    // Fallback: count testcase/failure tags
    const total = (xml.match(/<testcase\b/g) || []).length;
    const failures = (xml.match(/<failure\b/g) || []).length;
    const errors = (xml.match(/<error\b/g) || []).length;
    const skipped = (xml.match(/<skipped\b/g) || []).length;
    return { total, failures, errors, skipped };
}

function sanitizeLogs(logs: string): string {
    return logs
        .replace(/\/var\/folders\/[^\s]+/g, '[temp-dir]')
        .replace(/\/tmp\/grader_[^\s]+/g, '[temp-dir]')
        .replace(/\/private\/var\/[^\s]+/g, '[temp-dir]')
        .substring(0, 20000);
}

/**
 * Run Playwright phase with POOLED containers (FAST PATH)
 */
async function runPlaywrightPhaseWithPool(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'playwright' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    const { job, runner, testType, testCode } = params;
    
    const dependencies = job.dependencies || {};
    const generatedFiles = runner.candidate.generatedFiles || {};
    
    let pooledContainer: BlackboxContainer | null = null;
    let networkName: string | null = null;
    const testsDir = join(tmpdir(), `grader_pw_${testType}_tests_${job.attemptId}_${Date.now()}`);
    
    try {
        console.log(`[Playwright] Acquiring pooled container...`);
        
        // Acquire pooled container with deps pre-installed (warmup key must match grading key)
        pooledContainer = await acquireBlackboxContainer({
            runtime: 'node',
            image: runner.candidate.image,
            dependencies,
            generatedFiles,
            installCommand: runner.candidate.installCommand,
        });
        
        console.log(`[Playwright] Using pooled container: ${pooledContainer.name}`);
        
        // Write candidate files
        await writeCandidateWorkspace({
            workDir: pooledContainer.workDir,
            files: job.files,
            // Keep writing generatedFiles so blocked config files (tsconfig/vite/etc) stay present even after reset.
            // Dependencies are already installed in warmup; we will NOT re-run installCommand on reuse.
            generatedFiles,
        });
        
        // Prepare Playwright harness
        await writePlaywrightHarness({
            workDir: testsDir,
            testType,
            testCode,
        });
        
        const port = runner.candidate.port ?? 3000;
        const candidateContainerWorkDir = runner.candidate.workdir || '/app';
        
        // Acquire network
        networkName = await acquireNetworkWithRetry(5, 1000);
        
        // Connect pooled container to network
        await dockerExec({
            args: ['network', 'connect', '--alias', 'candidate', networkName, pooledContainer.name],
            timeoutMs: 5000,
        });
        
        // Build environment
        const candidateEnv: Record<string, string> = {
            NODE_ENV: 'test',
            PORT: String(port),
            ...(runner.candidate.env || {}),
        };
        
        // Build env command
        const envCmd = Object.entries(candidateEnv)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join('; ');
        
        // IMPORTANT: installCommand is executed during pool warmup/container creation.
        // On reuse, we intentionally skip re-install to keep pooled runs fast and deterministic.
        
        // Start dev server in background
        const actualRunCommand = runner.candidate.runCommand.replace(/\$PORT/g, String(port));
        const runCommand = `${envCmd}; cd ${candidateContainerWorkDir}; ${actualRunCommand}`;
        const startCmd = `${runCommand} > /tmp/server.log 2>&1 & echo $! > /tmp/server.pid`;
        
        console.log(`[Playwright] Starting candidate server: ${actualRunCommand}`);
        await dockerExec({
            args: ['exec', pooledContainer.name, 'sh', '-c', startCmd],
            timeoutMs: 10000,
        });
        
        // Hardening: wait for server to become ready before running Playwright tests
        try {
            const healthDebug = await waitForHttp({
                containerName: pooledContainer.name,
                port,
                healthPath: runner.candidate.healthPath || '/',
                timeoutMs: runner.candidate.startupTimeoutMs || 30000,
            });
            console.log(`[Playwright] Health check passed for pooled container ${pooledContainer.name}:\n${healthDebug}`);
        } catch (healthError) {
            let serverLog = '';
            try {
                const { stdout } = await dockerExec({
                    args: ['exec', pooledContainer.name, 'sh', '-c', 'tail -n 200 /tmp/server.log 2>/dev/null || true'],
                    timeoutMs: 5000,
                });
                serverLog = stdout;
            } catch {
                serverLog = '';
            }
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`${String(healthError)}\n\n--- Candidate Server Log ---\n${serverLog}`),
                success: false,
            };
        }
        
        // Install Playwright deps
        const testImage = runner.tests.image || 'mcr.microsoft.com/playwright:v1.57.0-jammy';
        const installCmd = runner.tests.installCommand || 'npm install 2>&1';
        const testCmd = runner.tests.testCommand || 'PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1';
        const testTimeoutMs = runner.tests.timeoutMs || 180000;
        const testMemoryLimitMb = Math.max(1024, Math.min((job.memoryLimit || 512) * 2, 2048));
        
        await dockerRunOnce({
            network: 'bridge',
            image: testImage,
            workDir: testsDir,
            command: installCmd,
            env: runner.tests.env || {},
            timeoutMs: testTimeoutMs,
            memoryLimitMb: testMemoryLimitMb,
        });
        
        // Run Playwright tests
        const baseUrl = `http://candidate:${port}`;
        const testEnv: Record<string, string> = {
            BASE_URL: baseUrl,
            HEALTH_PATH: runner.candidate.healthPath || '/',
            STARTUP_TIMEOUT_MS: String(runner.candidate.startupTimeoutMs || 30000),
            ...(runner.tests.env || {}),
        };
        
        const output = await dockerRunOnce({
            network: networkName,
            image: testImage,
            workDir: testsDir,
            command: `${testCmd} || true`,
            env: testEnv,
            timeoutMs: testTimeoutMs,
            memoryLimitMb: testMemoryLimitMb,
        });
        
        // Parse results from JUnit XML
        const junitPath = join(testsDir, 'results.xml');
        const junit = await readFile(junitPath, 'utf-8').catch(() => null);
        
        if (!junit) {
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`${output}\n\nMissing Playwright JUnit report`),
                success: false,
            };
        }
        
        const { total, failures, errors, skipped } = parseJUnit(junit);
        const passed = Math.max(0, total - failures - errors - skipped);
        const success = failures === 0 && errors === 0;
        
        return {
            passed,
            total,
            logs: sanitizeLogs(output),
            success,
        };
    } finally {
        // Disconnect from network
        if (pooledContainer && networkName) {
            await dockerExec({
                args: ['network', 'disconnect', networkName, pooledContainer.name],
                timeoutMs: 5000,
            }).catch(() => {});
        }
        
        // Release network
        if (networkName) {
            await releaseNetwork(networkName).catch(() => {});
        }
        
        // Release container
        if (pooledContainer) {
            await releaseBlackboxContainer(pooledContainer).catch(err => {
                console.warn('[Playwright] Failed to release container:', err);
            });
        }
        
        // Cleanup tests dir
        await rm(testsDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function runPlaywrightPhase(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'playwright' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    const { job, runner, testType, testCode } = params;
    
    // FAST PATH: Try pooled containers first
    try {
        console.log(`[Playwright] Attempting pooled execution for ${testType} tests...`);
        return await runPlaywrightPhaseWithPool(params);
    } catch (poolError) {
        const errorMsg = String(poolError);
        if (!errorMsg.includes('SKIP_POOL')) {
            console.warn(`[Playwright] Pool execution failed, falling back to ephemeral:`, poolError);
        }
        // Fall through to ephemeral path
    }
    
    // SLOW PATH: Ephemeral containers
    console.log(`[Playwright] Using ephemeral containers for ${testType} tests...`);

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    const candidateDir = join(tmpdir(), `grader_pw_${testType}_cand_${job.attemptId}_${timestamp}_${randomSuffix}`);
    const testsDir = join(tmpdir(), `grader_pw_${testType}_tests_${job.attemptId}_${timestamp}_${randomSuffix}`);

    const candidateName = `grader_cand_${job.attemptId}_${testType}_${timestamp}_${randomSuffix}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    // EC-8: Use network pool instead of creating per-job networks
    let networkName: string | null = null;

    try {
        const filesWritten = await writeCandidateWorkspace({
            workDir: candidateDir,
            files: job.files,
            generatedFiles: runner.candidate.generatedFiles,
        });

        if (filesWritten === 0) {
            return { passed: 0, total: 0, logs: 'No valid files to test', success: false };
        }

        await writePlaywrightHarness({
            workDir: testsDir,
            testType,
            testCode,
        });

        const candidateContainerWorkDir = runner.candidate.workdir || '/app';

        const port = runner.candidate.port ?? 3000;
        const candidateEnv = {
            NODE_ENV: 'test',
            PORT: String(port),
            ...(runner.candidate.env || {}),
        };

        const testImage = runner.tests.image || 'mcr.microsoft.com/playwright:v1.57.0-jammy';
        const installCmd = runner.tests.installCommand || 'npm install 2>&1';
        const testCmd =
            runner.tests.testCommand ||
            // Use JUnit so we can reliably parse results without depending on stdout JSON
            'PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1';
        const testTimeoutMs = runner.tests.timeoutMs || 180000;
        // Playwright with Chromium needs at least 1GB RAM to run reliably
        const testMemoryLimitMb = Math.max(1024, Math.min(job.memoryLimit * 2, 2048));

        if (runner.candidate.installCommand) {
            try {
                await dockerRunOnce({
                    network: 'bridge',
                    image: runner.candidate.image,
                    workDir: candidateDir,
                    containerWorkDir: candidateContainerWorkDir,
                    command: `set -e; ${runner.candidate.installCommand}`,
                    env: candidateEnv,
                    timeoutMs: testTimeoutMs,
                    memoryLimitMb: job.memoryLimit,
                });
            } catch (error) {
                return {
                    passed: 0,
                    total: 0,
                    logs: sanitizeLogs(String(error)) + '\n\nMissing Playwright JUnit report',
                    success: false,
                };
            }
        }

        try {
            await dockerRunOnce({
                network: 'bridge',
                image: testImage,
                workDir: testsDir,
                command: installCmd,
                env: runner.tests.env || {},
                timeoutMs: testTimeoutMs,
                memoryLimitMb: testMemoryLimitMb,
            });
        } catch (error) {
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(String(error)) + '\n\nMissing Playwright JUnit report',
                success: false,
            };
        }

        // EC-8: Acquire network from pool (prevents "address pools exhausted" error)
        try {
            networkName = await acquireNetworkWithRetry(5, 1000);
        } catch (networkError) {
            console.error('[Playwright] Failed to acquire network:', networkError);
            return {
                passed: 0,
                total: 1,
                logs: sanitizeLogs('Grading infrastructure temporarily unavailable. Please try again.'),
                success: false,
            };
        }

        try {
            await dockerRunDetached({
                name: candidateName,
                network: networkName,
                alias: 'candidate',
                image: runner.candidate.image,
                workDir: candidateDir,
                containerWorkDir: candidateContainerWorkDir,
                command: `set -e; ${runner.candidate.runCommand}`,
                env: candidateEnv,
                memoryLimitMb: job.memoryLimit,
            });
        } catch (error) {
            // IMPORTANT: return a grading result instead of throwing so BullMQ doesn't retry the job.
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`Grading error: ${String(error)}`),
                success: false,
            };
        }

        const baseUrl = `http://candidate:${port}`;
        let healthCheckDebug = '';
        try {
            healthCheckDebug = await waitForHttp({
                containerName: candidateName,
                port,
                healthPath: runner.candidate.healthPath || '/',
                timeoutMs: runner.candidate.startupTimeoutMs || 30000,
            });
            console.log(`[Playwright] Health check passed for ${candidateName}:\n${healthCheckDebug}`);
        } catch (healthError) {
            // Capture candidate container logs for debugging
            let candidateLogs = '';
            try {
                const { stdout, stderr } = await dockerExec({
                    args: ['logs', candidateName],
                    timeoutMs: 5000,
                });
                candidateLogs = `\n\n--- Candidate Container Logs ---\n${stdout}\n${stderr}`;
            } catch {
                candidateLogs = '\n\n--- Could not retrieve candidate logs ---';
            }
            console.error(`[Playwright] Health check FAILED for ${candidateName}:\n${String(healthError)}`);
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`${String(healthError)}${candidateLogs}`),
                success: false,
            };
        }

        const getCandidateDebug = async (): Promise<string> => {
            let candidateLogs = '';
            try {
                const { stdout, stderr } = await dockerExec({
                    args: ['logs', candidateName],
                    timeoutMs: 8000,
                });
                candidateLogs = `${stdout}\n${stderr}`.trim();
            } catch {
                candidateLogs = 'Could not retrieve candidate logs.';
            }

            let fsSnapshot = '';
            try {
                const { stdout, stderr } = await dockerExec({
                    args: [
                        'exec',
                        candidateName,
                        'sh',
                        '-c',
                        [
                            'set -e',
                            `echo "=== ls -la ${candidateContainerWorkDir} ==="`,
                            `ls -la ${candidateContainerWorkDir} || true`,
                            `echo ""`,
                            `echo "=== ls -la ${candidateContainerWorkDir}/src ==="`,
                            `ls -la ${candidateContainerWorkDir}/src || true`,
                        ].join('; '),
                    ],
                    timeoutMs: 8000,
                });
                fsSnapshot = `${stdout}\n${stderr}`.trim();
            } catch {
                fsSnapshot = 'Could not retrieve candidate filesystem snapshot.';
            }

            return `\n\n--- Candidate Debug ---\n\n[Candidate Logs]\n${candidateLogs}\n\n[Candidate Files]\n${fsSnapshot}\n`;
        };

        let output = '';
        try {
            output = await dockerRunOnce({
                network: networkName,
                image: testImage,
                workDir: testsDir,
                command: `${testCmd} || true`,
                env: {
                    BASE_URL: baseUrl,
                    ...(runner.tests.env || {}),
                },
                timeoutMs: testTimeoutMs,
                memoryLimitMb: testMemoryLimitMb,
            });
        } catch (error) {
            // IMPORTANT: return a grading result instead of throwing so BullMQ doesn't retry the job.
            const candidateDebug = await getCandidateDebug().catch(() => '');
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`Grading error: ${String(error)}${candidateDebug}`),
                success: false,
            };
        }
        const junitPath = join(testsDir, 'results.xml');
        const junit = await readFile(junitPath, 'utf-8').catch(() => null);

        if (!junit) {
            const candidateDebug = await getCandidateDebug().catch(() => '');
            return {
                passed: 0,
                total: 0,
                logs: sanitizeLogs(`${candidateDebug}\n\n--- Test Output ---\n${output}\n\nMissing Playwright JUnit report`),
                success: false,
            };
        }

        const { total, failures, errors, skipped } = parseJUnit(junit);
        const passed = Math.max(0, total - failures - errors - skipped);
        const success = failures === 0 && errors === 0;

        if (!success) {
            const candidateDebug = await getCandidateDebug().catch(() => '');
            return {
                passed,
                total,
                logs: sanitizeLogs(`${candidateDebug}\n\n--- Test Output ---\n${output}`),
                success: false,
            };
        }

        return {
            passed,
            total,
            logs: sanitizeLogs(output),
            success: true,
        };
    } finally {
        // Cleanup container (but not network - it goes back to pool)
        await safeDockerCleanup({ containerName: candidateName });
        
        // EC-8: Release network back to pool (not delete)
        if (networkName) {
            await releaseNetwork(networkName).catch(err => {
                console.warn('[Playwright] Failed to release network:', err);
            });
        }
        
        await Promise.all([
            rm(candidateDir, { recursive: true, force: true }).catch(() => {}),
            rm(testsDir, { recursive: true, force: true }).catch(() => {}),
        ]);
    }
}

export async function runDockerPlaywrightGrader(job: GradingJob): Promise<GradingResult> {
    const runner = job.runner as ChallengeRunner | undefined | null;

    if (!runner || runner.mode !== 'playwright') {
        throw new Error('Playwright grader invoked without runner.mode=playwright');
    }

    let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.publicTests && job.publicTests.trim()) {
        publicResult = await runPlaywrightPhase({
            job,
            runner,
            testType: 'public',
            testCode: job.publicTests,
        });
    }

    let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.hiddenTests && job.hiddenTests.trim()) {
        hiddenResult = await runPlaywrightPhase({
            job,
            runner,
            testType: 'hidden',
            testCode: job.hiddenTests,
        });
    }

    return {
        publicScore: publicResult.passed,
        hiddenScore: hiddenResult.passed,
        totalPublic: publicResult.total,
        totalHidden: hiddenResult.total,
        logs: publicResult.logs,
        success: publicResult.success && hiddenResult.success,
    };
}


