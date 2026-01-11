import { spawn } from 'child_process';
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import type { GradingJob, GradingResult, ChallengeRunner } from '@exam-platform/shared';
import { acquireNetworkWithRetry, releaseNetwork } from '../pool/network-pool.js';
import { 
    acquireBlackboxContainer, 
    releaseBlackboxContainer, 
    acquireTestRunner, 
    releaseTestRunner,
    type BlackboxContainer, 
    type TestRunnerContainer 
} from '../pool/blackbox-pool-manager.js';

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
    // Multi-runtime manifests should be grader-managed
    'requirements.txt',
    'pyproject.toml',
    'poetry.lock',
    'pipfile',
    'pipfile.lock',
    'go.mod',
    'go.sum',
    // Rust manifests should be grader-managed
    'cargo.toml',
    'cargo.lock',
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
    /^requirements\.txt$/i,
    /^pyproject\.toml$/i,
    /^poetry\.lock$/i,
    /^pipfile(\.lock)?$/i,
    /^go\.(mod|sum)$/i,
    /^cargo\.(toml|lock)$/i,
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

    console.log(`[Blackbox] Writing candidate files to ${workDir}...`);
    console.log(`[Blackbox] Files to write: ${Object.keys(files).join(', ')}`);

    await mkdir(workDir, { recursive: true, mode: 0o755 });

    // Write candidate files
    let filesWritten = 0;
    for (const [path, content] of Object.entries(files)) {
        const safePath = sanitizeFilePath(path, workDir);
        if (!safePath) {
            console.error(`[SECURITY] Path blocked: ${path}`);
            continue;
        }
        await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
        const contentStr = content as string;
        await writeFile(safePath, contentStr);
        console.log(`[Blackbox] Wrote: ${path} (${contentStr.length} bytes)`);
        filesWritten++;
    }

    // Write grader-managed files (candidate cannot override due to sanitizeFilePath)
    if (generatedFiles) {
        for (const [path, content] of Object.entries(generatedFiles)) {
            const safePath = resolve(workDir, path.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '/'));
            // Ensure generated file is inside workDir
            if (!safePath.startsWith(resolve(workDir) + '/')) {
                throw new Error(`Invalid generated file path: ${path}`);
            }
            await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
            await writeFile(safePath, content);
        }
    }

    return filesWritten;
}

async function writeJestBlackboxHarness(params: {
    workDir: string;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<void> {
    const { workDir, testType, testCode } = params;

    await mkdir(workDir, { recursive: true, mode: 0o755 });
    await mkdir(join(workDir, '__tests__'), { recursive: true });

    await writeFile(join(workDir, '__tests__', `${testType}.test.js`), testCode);

    // Wait for candidate server before executing tests (prevents flaky failures)
    await writeFile(
        join(workDir, 'global-setup.js'),
        `module.exports = async () => {
  const baseUrl = process.env.BASE_URL;
  const healthPath = process.env.HEALTH_PATH || '/';
  const timeoutMs = parseInt(process.env.STARTUP_TIMEOUT_MS || '20000', 10);
  const requestTimeoutMs = parseInt(process.env.HEALTH_REQUEST_TIMEOUT_MS || '2000', 10);
  
  if (!baseUrl) throw new Error('Server configuration error');

  const deadline = Date.now() + timeoutMs;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const res = await fetch(baseUrl + healthPath, { method: 'GET', signal: controller.signal });
        if (res && typeof res.status === 'number') return;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {}
    await sleep(500);
  }

  throw new Error('Server did not start in time. Check your code for errors.');
};`
    );

    await writeFile(
        join(workDir, 'jest.config.js'),
        `module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/global-setup.js',
  testPathIgnorePatterns: ['/node_modules/'],
};`
    );

    const packageJson = {
        name: 'blackbox-tests',
        version: '1.0.0',
        private: true,
        scripts: {
            // SECURITY: Strict pattern - ONLY matches __tests__/<testType>.test.js
            test: `jest --json --outputFile=results.json --testPathPattern="__tests__/${testType}\\.test\\.js$" --forceExit --testTimeout=10000`,
        },
        devDependencies: {
            jest: '^29.7.0',
            supertest: '^6.3.3',
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
    runtime?: string; // 'node' | 'go' | 'rust' | 'python' etc.
}): Promise<void> {
    const { name, network, alias, image, workDir, containerWorkDir, command, env, memoryLimitMb, runtime } = params;

    const resolvedWorkDir = containerWorkDir || '/app';

    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(env)) {
        envArgs.push('-e', `${k}=${v}`);
    }

    // Build runtime-specific tmpfs mounts
    const tmpfsMounts: string[] = [
        '--tmpfs', '/tmp:rw,nosuid,size=200m', // All runtimes need /tmp
    ];

    // Add Node.js-specific cache mount (only needed for node runtime)
    if (runtime === 'node' || !runtime) {
        tmpfsMounts.push('--tmpfs', '/home/node/.npm:rw,size=200m');
    }

    const args = [
        'run',
        '-d',
        // IMPORTANT: don't use --rm for the candidate server container.
        // If the process exits quickly (syntax error, missing module, etc) Docker will
        // delete the container immediately and we lose the crash logs. We cleanup
        // explicitly in `safeDockerCleanup`.
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
        '150',
        '--read-only',
        ...tmpfsMounts,
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
    runtime?: string; // 'node' | 'go' | 'rust' | 'python' etc.
}): Promise<string> {
    const { network, image, workDir, containerWorkDir, command, env, timeoutMs, memoryLimitMb, name, runtime } = params;

    const resolvedWorkDir = containerWorkDir || '/app';
    const containerName =
        name ||
        `grader_run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    const envArgs: string[] = [];
    for (const [k, v] of Object.entries(env)) {
        envArgs.push('-e', `${k}=${v}`);
    }

    // Build runtime-specific tmpfs mounts
    const tmpfsMounts: string[] = [
        '--tmpfs', '/tmp:rw,nosuid,size=200m', // All runtimes need /tmp (removed noexec for go build)
    ];

    // Add runtime-specific cache directories
    if (runtime === 'node' || !runtime) {
        tmpfsMounts.push('--tmpfs', '/home/node/.npm:rw,size=200m');
    }
    // Note: Go/Rust/Python caches are handled via env vars (GOPATH, CARGO_HOME, PIP_CACHE_DIR)
    // pointing to /tmp, so no additional tmpfs mounts needed

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
        '150',
        '--read-only',
        ...tmpfsMounts,
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

async function parseJestResults(workDir: string, logs: string): Promise<TestRunResult> {
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

        // If jest didn't produce results.json (e.g. server crash), return failure
        return { passed: 0, total: 1, logs: sanitizeLogs(logs), success: false };
    } catch {
        return {
            passed: 0,
            total: 1,
            logs: sanitizeLogs(logs),
            success: false,
        };
    }
}

function sanitizeLogs(logs: string): string {
    return logs
        // Hide hidden test file references completely
        .replace(/hidden\.test\.(js|jsx|ts|tsx)/gi, '[test]')
        .replace(/__tests__\/hidden\.[^\s]+/gi, '[test]')
        .replace(/Hidden Tests?/gi, '[Tests]')
        // Filter out lines containing hidden test details
        .split('\n')
        .filter(line => !line.toLowerCase().includes('hidden.test.'))
        .join('\n')
        // Hide temp directory paths
        .replace(/\/var\/folders\/[^\s]+/g, '')
        .replace(/\/tmp\/grader_[^\s]+/g, '')
        .replace(/\/private\/var\/[^\s]+/g, '')
        .replace(/\/app\/__tests__\/[^\s]+/g, '[test-file]')
        // Hide internal container paths
        .replace(/\/app\/node_modules\/[^\s]+/g, '[module]')
        // Hide attempt IDs and timestamps from paths
        .replace(/grader_bb_[a-z]+_[a-z]+_[a-z0-9]+_\d+_[a-z0-9]+/gi, '')
        .replace(/grader_net_[a-z0-9_]+/gi, '')
        .replace(/grader_cand_[a-z0-9_]+/gi, '')
        // Remove Docker internal output
        .replace(/\[GlobalSetup\][^\n]*/g, '')
        .replace(/Force exiting Jest[^\n]*/g, '')
        // Clean up
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim()
        .substring(0, 8000);
}

/**
 * Run HTTP phase with POOLED containers (FAST PATH)
 * Uses pre-warmed containers with dependencies already installed.
 */
async function runHttpPhaseWithPool(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'http' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    const { job, runner, testType, testCode } = params;
    
    const runtime = (runner.runtime || 'node') as 'node' | 'python' | 'go' | 'rust';
    const dependencies = job.dependencies || {};
    const generatedFiles = runner.candidate.generatedFiles || {};
    
    let pooledContainer: BlackboxContainer | null = null;
    let networkName: string | null = null;
    const testsDir = join(tmpdir(), `grader_bb_${testType}_tests_${job.attemptId}_${Date.now()}`);
    
    try {
        console.log(`[Blackbox] Acquiring pooled container for ${runtime}...`);
        
        // Acquire pooled container with deps PRE-INSTALLED from generatedFiles!
        // e.g., Python: requirements.txt already installed, just need candidate's main.py
        pooledContainer = await acquireBlackboxContainer({
            runtime,
            image: runner.candidate.image,
            dependencies,
            generatedFiles,  // <-- Pass generatedFiles for warmup!
            installCommand: runner.candidate.installCommand,  // <-- Pre-run install command!
        });
        
        console.log(`[Blackbox] Using pooled container: ${pooledContainer.name} (deps pre-installed)`);
        
        // Only write CANDIDATE files (not generatedFiles - those are already in container!)
        await writeCandidateWorkspace({
            workDir: pooledContainer.workDir,
            files: job.files,
            generatedFiles: {},  // <-- Skip generatedFiles, already in container!
        });
        
        // Prepare test harness
        await writeJestBlackboxHarness({
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
        
        if (runtime === 'python') {
            candidateEnv.HOME = '/tmp';
            candidateEnv.PIP_CACHE_DIR = '/tmp/pip-cache';
            candidateEnv.PYTHONDONTWRITEBYTECODE = '1';
            candidateEnv.PIP_TARGET = '/app/.packages';
            candidateEnv.PYTHONPATH = '/app/.packages:/app';
            candidateEnv.PATH = '/app/.packages/bin:/usr/local/bin:/usr/bin:/bin';
        } else if (runtime === 'go') {
            candidateEnv.GOPATH = '/tmp/go';
            candidateEnv.GOCACHE = '/tmp/go-cache';
        } else if (runtime === 'rust') {
            candidateEnv.CARGO_HOME = '/tmp/.cargo';
        }
        
        // Build env args for docker exec
        const envCmd = Object.entries(candidateEnv)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join('; ');
        
        // NOTE: Install command already run during pool warmup!
        // Dependencies (from generatedFiles) are pre-installed, so we skip installCommand here.
        // We only copied candidate's code files (e.g., main.py), not requirements.txt.
        
        // Check if any server process is already running (use /proc which works on all Linux)
        const processCheck = await dockerExec({
            args: ['exec', pooledContainer.name, 'sh', '-c', 'ls /proc/*/cmdline 2>/dev/null | head -5 | xargs -I{} sh -c "cat {} 2>/dev/null | tr \"\\0\" \" \"; echo" || echo "no procs"'],
            timeoutMs: 5000,
        }).catch(() => ({ stdout: 'check failed', stderr: '' }));
        console.log(`[Blackbox] Processes BEFORE starting server:\n${processCheck.stdout}`);
        
        // Start server in background using docker exec
        // Replace $PORT with actual port value to avoid shell expansion issues
        const actualRunCommand = runner.candidate.runCommand.replace(/\$PORT/g, String(port));
        const runCommand = `${envCmd}; cd ${candidateContainerWorkDir}; ${actualRunCommand}`;
        console.log(`[Blackbox] Starting candidate server: ${actualRunCommand}`);
        
        // Start server in background (nohup + &)
        console.log(`[Blackbox] Full server command: ${runCommand}`);
        await dockerExec({
            args: ['exec', '-d', pooledContainer.name, 'sh', '-c', `${runCommand} &`],
            timeoutMs: 10000,
        });
        
        // Wait for server to start
        await new Promise(r => setTimeout(r, 2000));
        
        // Check files in candidate container
        const filesInCandidate = await dockerExec({
            args: ['exec', pooledContainer.name, 'sh', '-c', 'ls -la /app/ 2>&1 | head -15'],
            timeoutMs: 5000,
        }).catch(() => ({ stdout: 'failed', stderr: '' }));
        console.log(`[Blackbox] Files in candidate /app:\n${filesInCandidate.stdout}`);
        
        // Check processes AFTER start (use /proc which works on slim images)
        const processAfter = await dockerExec({
            args: ['exec', pooledContainer.name, 'sh', '-c', 'ls /proc/*/cmdline 2>/dev/null | head -10 | xargs -I{} sh -c "cat {} 2>/dev/null | tr \"\\0\" \" \"; echo" || echo "no procs"'],
            timeoutMs: 5000,
        }).catch(() => ({ stdout: 'check failed', stderr: '' }));
        console.log(`[Blackbox] Processes AFTER starting server:\n${processAfter.stdout}`);
        
        // Check if server is running (look for listening process)
        const checkResult = await dockerExec({
            args: ['exec', pooledContainer.name, 'sh', '-c', `netstat -tlnp 2>/dev/null | grep :${port} || ss -tlnp 2>/dev/null | grep :${port} || true`],
            timeoutMs: 5000,
        }).catch(() => ({ stdout: '', stderr: '' }));
        
        if (!checkResult.stdout.includes(String(port))) {
            // Server might not be listening yet, give it more time
            await new Promise(r => setTimeout(r, 2000));
        }
        
        // Use pooled test runner (jest/supertest pre-installed!)
        const testImage = runner.tests.image || `node:${job.nodeVersion || '20'}-alpine`;
        const testCmd = runner.tests.testCommand || 'npm test 2>&1';
        const testTimeoutMs = runner.tests.timeoutMs || 120000;
        
        // Acquire pre-warmed test runner (already has jest/supertest)
        let testRunner: TestRunnerContainer | null = null;
        try {
            testRunner = await acquireTestRunner(testImage);
            console.log(`[Blackbox] Using pooled test runner: ${testRunner.name}`);
            
            // List files in container /app before copying
            const beforeFiles = await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', 'ls -la /app/ 2>&1 || true'],
                timeoutMs: 5000,
            }).catch(() => ({ stdout: 'failed', stderr: '' }));
            console.log(`[Blackbox] Files in test runner BEFORE copy:\n${beforeFiles.stdout}`);
            
            // Copy test files from host to container's /app
            for (const file of ['__tests__', 'jest.config.js', 'global-setup.js', 'package.json']) {
                try {
                    console.log(`[Blackbox] Copying ${file} to test runner...`);
                    await dockerExec({
                        args: ['cp', join(testsDir, file), `${testRunner.name}:/app/`],
                        timeoutMs: 10000,
                    });
                } catch (e) {
                    console.warn(`[Blackbox] Failed to copy ${file}:`, e);
                }
            }
            
            // List files in container /app after copying
            const afterFiles = await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', 'ls -la /app/ /app/__tests__/ 2>&1 || true'],
                timeoutMs: 5000,
            }).catch(() => ({ stdout: 'failed', stderr: '' }));
            console.log(`[Blackbox] Files in test runner AFTER copy:\n${afterFiles.stdout}`);
            
            // Connect test runner to the network
            await dockerExec({
                args: ['network', 'connect', networkName, testRunner.name],
                timeoutMs: 5000,
            });
            
            // Run tests
            const baseUrl = `http://candidate:${port}`;
            const testEnv: Record<string, string> = {
                BASE_URL: baseUrl,
                HEALTH_PATH: runner.candidate.healthPath || '/',
                STARTUP_TIMEOUT_MS: String(runner.candidate.startupTimeoutMs || 20000),
                ...(runner.tests.env || {}),
            };
            
            const envCmd = Object.entries(testEnv)
                .map(([k, v]) => `export ${k}="${v}"`)
                .join('; ');
            
            console.log(`[Blackbox] Running tests: ${testCmd}`);
            const result = await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', `${envCmd}; cd /app && ${testCmd} || true`],
                timeoutMs: testTimeoutMs,
            });
            
            console.log(`[Blackbox] Test output (first 500 chars):\n${(result.stdout + result.stderr).substring(0, 500)}`);
            
            // Disconnect test runner from network
            await dockerExec({
                args: ['network', 'disconnect', networkName, testRunner.name],
                timeoutMs: 5000,
            }).catch(() => {});
            
            // Check what results.json contains in container
            const resultsInContainer = await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', 'cat /app/results.json 2>&1 | head -c 500'],
                timeoutMs: 5000,
            }).catch(() => ({ stdout: 'failed to read', stderr: '' }));
            console.log(`[Blackbox] results.json in container:\n${resultsInContainer.stdout}`);
            
            // Copy results back to host
            await dockerExec({
                args: ['cp', `${testRunner.name}:/app/results.json`, testsDir + '/results.json'],
                timeoutMs: 5000,
            }).catch(() => {});
            
            var output = result.stdout + result.stderr;
        } finally {
            if (testRunner) {
                await releaseTestRunner(testRunner);
            }
        }
        
        return await parseJestResults(testsDir, output);
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
        
        // Release container back to pool
        if (pooledContainer) {
            await releaseBlackboxContainer(pooledContainer).catch(err => {
                console.warn('[Blackbox] Failed to release container:', err);
            });
        }
        
        // Cleanup tests dir
        await rm(testsDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function runHttpPhase(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'http' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    const { job, runner, testType, testCode } = params;
    
    // FAST PATH: Try pooled containers first
    try {
        console.log(`[Blackbox] Attempting pooled execution for ${testType} tests...`);
        return await runHttpPhaseWithPool(params);
    } catch (poolError) {
        const errorMsg = String(poolError);
        if (!errorMsg.includes('SKIP_POOL')) {
            console.warn(`[Blackbox] Pool execution failed, falling back to ephemeral:`, poolError);
        }
        // Fall through to ephemeral path
    }
    
    // SLOW PATH: Ephemeral containers
    console.log(`[Blackbox] Using ephemeral containers for ${testType} tests...`);

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    const candidateDir = join(tmpdir(), `grader_bb_${testType}_cand_${job.attemptId}_${timestamp}_${randomSuffix}`);
    const testsDir = join(tmpdir(), `grader_bb_${testType}_tests_${job.attemptId}_${timestamp}_${randomSuffix}`);

    const candidateName = `grader_cand_${job.attemptId}_${testType}_${timestamp}_${randomSuffix}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    
    // EC-8: Use network pool instead of creating per-job networks
    let networkName: string | null = null;

    try {
        // Prepare workspaces
        const generatedFiles: Record<string, string> = {
            ...(runner.candidate.generatedFiles || {}),
        };

        // Convenience: for node runtime, auto-generate package.json from job.dependencies
        // so candidates don't need to submit (or modify) package.json.
        if (runner.runtime === 'node' && !generatedFiles['package.json']) {
            generatedFiles['package.json'] = JSON.stringify(
                {
                    name: 'candidate-app',
                    version: '1.0.0',
                    private: true,
                    dependencies: { ...(job.dependencies || {}) },
                },
                null,
                2
            );
        }

        const filesWritten = await writeCandidateWorkspace({
            workDir: candidateDir,
            files: job.files,
            generatedFiles,
        });

        if (filesWritten === 0) {
            return { passed: 0, total: 0, logs: 'No valid files to test', success: false };
        }

        await writeJestBlackboxHarness({
            workDir: testsDir,
            testType,
            testCode,
        });

        const candidateContainerWorkDir = runner.candidate.workdir || '/app';

        const port = runner.candidate.port ?? 3000;
        const candidateEnv: Record<string, string> = {
            NODE_ENV: 'test',
            PORT: String(port),
            ...(runner.candidate.env || {}),
        };

        // Add runtime-specific environment for writable caches in read-only containers
        if (runner.runtime === 'rust') {
            candidateEnv.CARGO_HOME = '/tmp/.cargo';
        } else if (runner.runtime === 'go') {
            candidateEnv.GOPATH = '/tmp/go';
            candidateEnv.GOCACHE = '/tmp/go-cache';
        } else if (runner.runtime === 'python') {
            // Python: install packages to /app/.packages (persists in mounted volume)
            // This is crucial because install runs in a different container than the app
            candidateEnv.HOME = '/tmp';
            candidateEnv.PIP_CACHE_DIR = '/tmp/pip-cache';
            candidateEnv.PYTHONDONTWRITEBYTECODE = '1'; // Avoid .pyc in read-only dirs
            // Install to /app/.packages, which is on the mounted volume and persists
            candidateEnv.PIP_TARGET = '/app/.packages';
            candidateEnv.PYTHONPATH = '/app/.packages:/app';
            // Add .packages/bin to PATH for uvicorn, flask, django-admin, etc.
            candidateEnv.PATH = '/app/.packages/bin:/usr/local/bin:/usr/bin:/bin';
        }

        const testImage = runner.tests.image || `node:${job.nodeVersion || '20'}-alpine`;
        const testInstall = runner.tests.installCommand || 'npm install --legacy-peer-deps 2>&1';
        const testCmd = runner.tests.testCommand || 'npm test 2>&1';
        const testTimeoutMs = runner.tests.timeoutMs || 120000;
        const testMemoryLimitMb = Math.max(256, Math.min(job.memoryLimit, 1024));

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
                    runtime: runner.runtime,
                });
            } catch (error: any) {
                const runtime = runner.runtime || 'unknown';
                const hint = runtime === 'rust' ? 'Check your Cargo.toml and src/main.rs for syntax errors.'
                    : runtime === 'go' ? 'Check your go.mod and main.go for syntax errors.'
                    : runtime === 'python' ? 'Check your requirements.txt and Python files for errors.'
                    : 'Check your dependencies and source files for errors.';
                const errorMsg = error?.message || String(error);
                return { passed: 0, total: 1, logs: `Build failed (${runtime}): ${hint}\n\nError: ${errorMsg.slice(0, 500)}`, success: false };
            }
        }

        // Test deps pre-installed in pool - skip npm install for test runner
        
        // EC-8: Acquire network from pool (prevents "address pools exhausted" error)
        try {
            networkName = await acquireNetworkWithRetry(5, 1000);
        } catch (networkError) {
            console.error('[Blackbox] Failed to acquire network:', networkError);
            return {
                passed: 0,
                total: 1,
                logs: sanitizeLogs('Grading infrastructure temporarily unavailable. Please try again.'),
                success: false,
            };
        }

        // Start candidate server container (detached)
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
            runtime: runner.runtime,
        });

        // Give the container a moment to either come up or crash
        await new Promise((resolve) => setTimeout(resolve, 800));

        // Check if container is still running
        let candidateIsRunning = false;
        let candidateLogs = '';
        try {
            const inspect = await dockerExec({
                args: ['inspect', '-f', '{{.State.Running}}', candidateName],
                timeoutMs: 5000,
            });
            candidateIsRunning = inspect.stdout.trim() === 'true';
        } catch {
            candidateIsRunning = false;
        }

        // Get logs for error reporting (sanitized)
        try {
            const logsResult = await dockerExec({
                args: ['logs', candidateName],
                timeoutMs: 5000,
            });
            candidateLogs = `${logsResult.stdout}\n${logsResult.stderr}`.trim();
        } catch {
            candidateLogs = '';
        }

        if (!candidateIsRunning) {
            // DEBUG: Log full output to help diagnose startup failures
            console.error('[GRADER DEBUG] Candidate failed to start. Full logs:', candidateLogs);
            
            // Extract useful error info without exposing internal paths
            const errorLines = candidateLogs
                .split('\n')
                .filter(line => line.includes('Error') || line.includes('error') || line.includes('SyntaxError') || 
                               line.includes('ModuleNotFoundError') || line.includes('ImportError') || 
                               line.includes('No module') || line.includes('not found'))
                .slice(0, 8)
                .join('\n');
            const msg = `Server failed to start.\n\n${errorLines || 'Check your code for syntax errors.'}`;
            return { passed: 0, total: 1, logs: sanitizeLogs(msg), success: false };
        }

        // Run tests using pooled test runner
        const baseUrl = `http://candidate:${port}`;
        const testEnv: Record<string, string> = {
            BASE_URL: baseUrl,
            HEALTH_PATH: runner.candidate.healthPath || '/',
            STARTUP_TIMEOUT_MS: String(runner.candidate.startupTimeoutMs || 20000),
            ...(runner.tests.env || {}),
        };

        let testRunner: TestRunnerContainer | null = null;
        let output = '';
        
        try {
            testRunner = await acquireTestRunner(testImage);
            console.log(`[Blackbox] Using pooled test runner: ${testRunner.name}`);
            
            // Copy test files to test runner
            for (const file of ['__tests__', 'jest.config.js', 'global-setup.js', 'package.json']) {
                try {
                    await dockerExec({
                        args: ['cp', join(testsDir, file), `${testRunner.name}:/app/`],
                        timeoutMs: 10000,
                    });
                } catch {
                    // Ignore if file doesn't exist
                }
            }
            
            // Connect test runner to network
            await dockerExec({
                args: ['network', 'connect', networkName, testRunner.name],
                timeoutMs: 5000,
            });
            
            // Run tests
            const envCmd = Object.entries(testEnv)
                .map(([k, v]) => `export ${k}="${v}"`)
                .join('; ');
            
            const result = await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', `${envCmd}; cd /app && ${testCmd} || true`],
                timeoutMs: testTimeoutMs,
            });
            
            output = result.stdout + result.stderr;
            
            // Disconnect from network
            await dockerExec({
                args: ['network', 'disconnect', networkName, testRunner.name],
                timeoutMs: 5000,
            }).catch(() => {});
            
            // Copy results back
            await dockerExec({
                args: ['cp', `${testRunner.name}:/app/results.json`, testsDir + '/results.json'],
                timeoutMs: 5000,
            }).catch(() => {});
        } finally {
            if (testRunner) {
                await releaseTestRunner(testRunner);
            }
        }

        return await parseJestResults(testsDir, output);
    } finally {
        // Cleanup container (but not network - it goes back to pool)
        await safeDockerCleanup({ containerName: candidateName });
        
        // EC-8: Release network back to pool (not delete)
        if (networkName) {
            await releaseNetwork(networkName).catch(err => {
                console.warn('[Blackbox] Failed to release network:', err);
            });
        }
        
        await Promise.all([
            rm(candidateDir, { recursive: true, force: true }).catch(() => {}),
            rm(testsDir, { recursive: true, force: true }).catch(() => {}),
        ]);
    }
}

/**
 * Docker Black-box Grader (2-container)
 *
 * - Candidate code runs in container A with NO tests mounted.
 * - Tests run in container B and talk to A via HTTP (BASE_URL).
 *
 * This provides true hidden-test secrecy for backend/API challenges and
 * supports multiple runtimes (node/python/go) as long as they expose HTTP.
 */
export async function runDockerBlackboxGrader(job: GradingJob): Promise<GradingResult> {
    const runner = job.runner as ChallengeRunner | undefined | null;

    if (!runner || runner.mode !== 'http') {
        throw new Error('Invalid grader configuration');
    }

    // Ensure memoryLimit has a default
    if (!job.memoryLimit) {
        job.memoryLimit = 256;
    }

    // Public phase
    let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.publicTests && job.publicTests.trim()) {
        publicResult = await runHttpPhase({
            job,
            runner,
            testType: 'public',
            testCode: job.publicTests,
        });
    }

    // Hidden phase
    let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.hiddenTests && job.hiddenTests.trim()) {
        hiddenResult = await runHttpPhase({
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


