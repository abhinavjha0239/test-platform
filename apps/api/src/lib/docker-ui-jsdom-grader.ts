import { spawn } from 'child_process';
import { mkdir, rm, writeFile, readFile, chmod } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import type { ChallengeRunner, GradingJob, GradingResult } from '@exam-platform/shared';
import { acquireNetworkWithRetry, releaseNetwork } from './network-pool.js';
import {
    acquireBlackboxContainer,
    releaseBlackboxContainer,
    acquireTestRunner,
    releaseTestRunner,
    type BlackboxContainer,
    type TestRunnerContainer,
} from './blackbox-pool-manager.js';

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
    // Grader-managed scaffolding/harness
    '.grader',
    '.vite',
];

const BLOCKED_FILENAME_PATTERNS = [
    /\.test\.(js|jsx|ts|tsx|cjs|mjs)$/i,
    /\.spec\.(js|jsx|ts|tsx|cjs|mjs)$/i,
    /^jest\./i,
    /^babel\./i,
    /^\.babelrc/i,
    /^tsconfig/i,
    /^package(-lock)?\.json$/i,
    /^results\.(json|xml)$/i,
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

function sanitizeLogs(logs: string): string {
    return (logs || '')
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\r/g, '')
        .trim()
        .substring(0, 8000);
}

async function writeCandidateWorkspace(params: {
    workDir: string;
    files: Record<string, unknown>;
    generatedFiles?: Record<string, string>;
}): Promise<number> {
    const { workDir, files, generatedFiles } = params;

    await mkdir(workDir, { recursive: true, mode: 0o755 });

    let filesWritten = 0;
    for (const [path, content] of Object.entries(files)) {
        const safePath = sanitizeFilePath(path, workDir);
        if (!safePath) continue;
        await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
        await writeFile(safePath, content as string);
        filesWritten++;
    }

    // Write generated files AFTER user files (grader wins; candidate cannot override)
    if (generatedFiles) {
        for (const [path, content] of Object.entries(generatedFiles)) {
            const safePath = resolve(workDir, path.replace(/^[/\\]+/, '').replace(/[/\\]+/g, '/'));
            if (!safePath.startsWith(resolve(workDir) + '/')) {
                throw new Error(`Invalid generated file path: ${path}`);
            }
            await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
            await writeFile(safePath, content);
        }
    }

    return filesWritten;
}

async function writeVitestUiHarness(params: {
    workDir: string;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<void> {
    const { workDir, testType, testCode } = params;

    await mkdir(workDir, { recursive: true, mode: 0o755 });
    await mkdir(join(workDir, 'tests'), { recursive: true });

    // Lightweight HTTP helper (no hidden logic, just transport)
    await writeFile(
        join(workDir, 'tests', '_harness.js'),
        `export function client() {
  // NOTE: do NOT use BASE_URL here. Vitest/Vite uses BASE_URL internally and will set it to "/".
  // We use a dedicated env var to avoid collisions.
  const baseUrl = process.env.HARNESS_BASE_URL;
  if (!baseUrl) throw new Error('HARNESS_BASE_URL not set');

  const j = (r) => r.json().catch(() => ({}));

  return {
    async reset() {
      const res = await fetch(baseUrl + '/reset', { method: 'POST' });
      return j(res);
    },
    async click(testId) {
      const res = await fetch(baseUrl + '/click', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId }),
      });
      return j(res);
    },
    async type(testId, text) {
      const res = await fetch(baseUrl + '/type', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ testId, text }),
      });
      return j(res);
    },
    async text(testId) {
      const res = await fetch(baseUrl + '/text?testId=' + encodeURIComponent(testId));
      const out = await j(res);
      return out.text ?? '';
    },
    async allText(testId) {
      const res = await fetch(baseUrl + '/allText?testId=' + encodeURIComponent(testId));
      const out = await j(res);
      return Array.isArray(out.texts) ? out.texts : [];
    },
    async count(testId) {
      const res = await fetch(baseUrl + '/count?testId=' + encodeURIComponent(testId));
      const out = await j(res);
      return typeof out.count === 'number' ? out.count : 0;
    },
    async html(testId) {
      const res = await fetch(baseUrl + '/html?testId=' + encodeURIComponent(testId));
      const out = await j(res);
      return out.html ?? '';
    },
  };
}
`
    );

    await writeFile(join(workDir, 'tests', `${testType}.spec.js`), testCode);

    const packageJson = {
        name: 'ui-jsdom-tests',
        version: '1.0.0',
        private: true,
        type: 'module',
        scripts: {
            // Vitest v1.6 does not support `--threads`; enforce serial execution via workers + file parallelism.
            test: `vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=junit --outputFile=results.xml tests/${testType}.spec.js`,
        },
        devDependencies: {
            vitest: '^1.6.0',
            '@babel/parser': '^7.24.0',
            '@babel/traverse': '^7.24.0',
        },
    };

    await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));
}

function parseJUnit(xml: string): { total: number; failures: number; errors: number; skipped: number } {
    // IMPORTANT: use `\b` word boundary (not a literal backslash), otherwise we won't match `<testsuite ...>` tags.
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_debug_pre',hypothesisId:'H1',location:'docker-ui-jsdom-grader.ts:parseJUnit',message:'parseJUnit input overview',data:{xmlLen:xml?.length||0,startsWith:typeof xml==='string'?xml.slice(0,80):null,hasTestsuiteTag:typeof xml==='string'?xml.includes('<testsuite'):false,hasTestsuitesTag:typeof xml==='string'?xml.includes('<testsuites'):false},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const suiteTagMatches = [...xml.matchAll(/<testsuite\b[^>]*>/g)];
    if (suiteTagMatches.length === 0) return { total: 0, failures: 0, errors: 0, skipped: 0 };

    let total = 0;
    let failures = 0;
    let errors = 0;
    let skipped = 0;

    for (const m of suiteTagMatches) {
        const tag = m[0];
        const getNum = (attr: string) => {
            // NOTE: we want `\d+` in the *regex*, which means `\\d+` in the string passed to RegExp().
            const mm = tag.match(new RegExp(`${attr}="(\\d+)"`));
            return mm ? parseInt(mm[1]!, 10) : 0;
        };
        total += getNum('tests');
        failures += getNum('failures');
        errors += getNum('errors');
        skipped += getNum('skipped');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_debug_pre',hypothesisId:'H2',location:'docker-ui-jsdom-grader.ts:parseJUnit',message:'parseJUnit computed totals',data:{suiteTags:suiteTagMatches.length,total,failures,errors,skipped,firstSuiteTag:suiteTagMatches[0]?.[0]?.slice(0,120)||null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { total, failures, errors, skipped };
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

    // Use node to make HTTP request instead of wget/curl (reliable across slim images)
    const healthCheckScript = `
const http = require('http');
const req = http.get('http://127.0.0.1:${port}${healthPath}', { timeout: 3000 }, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
`.trim().replace(/\\n/g, ' ');

    while (Date.now() < deadline) {
        attempts++;
        try {
            await dockerExec({
                args: ['exec', containerName, 'node', '-e', healthCheckScript],
                timeoutMs: 5000,
            });
            debugLogs.push(`[Attempt ${attempts}] READY`);
            return debugLogs.join('\\n');
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (attempts <= 3 || attempts % 10 === 0) {
                debugLogs.push(`[Attempt ${attempts}] not ready: ${errMsg.substring(0, 120)}`);
            }
        }
        await new Promise((r) => setTimeout(r, 500));
    }

    return debugLogs.join('\\n');
}

async function parseVitestResults(workDir: string, logs: string): Promise<TestRunResult> {
    const junitPath = join(workDir, 'results.xml');
    const junit = await readFile(junitPath, 'utf-8').catch(() => null);

    if (!junit) {
        return {
            passed: 0,
            total: 1,
            logs: sanitizeLogs(logs || 'Vitest did not produce results.xml'),
            success: false,
        };
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_debug_pre',hypothesisId:'H3',location:'docker-ui-jsdom-grader.ts:parseVitestResults',message:'Read results.xml from host workspace',data:{junitLen:junit.length,startsWith:junit.slice(0,80),includesTestsuite:junit.includes('<testsuite'),includesTestsuites:junit.includes('<testsuites')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const { total, failures, errors, skipped } = parseJUnit(junit);
    if (total === 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_debug_pre',hypothesisId:'H4',location:'docker-ui-jsdom-grader.ts:parseVitestResults',message:'No tests detected after parseJUnit',data:{junitHead:junit.slice(0,300)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        return {
            passed: 0,
            total: 1,
            logs: sanitizeLogs(
                `${logs}\n\n[Grader]\nNo tests detected in results.xml (testsuite/tests=0). This usually indicates a reporter/parsing/config issue.`
            ),
            success: false,
        };
    }
    const passed = Math.max(0, total - failures - errors - skipped);
    const success = failures === 0 && errors === 0;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_debug_pre',hypothesisId:'H5',location:'docker-ui-jsdom-grader.ts:parseVitestResults',message:'Parsed JUnit totals',data:{passed,total,failures,errors,skipped,success},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { passed, total, logs: sanitizeLogs(logs), success };
}

async function probeHarnessReset(params: { containerName: string; port: number }): Promise<{ ok: boolean; statusCode: number; bodyHead: string }> {
    const { containerName, port } = params;
    const script = `
const http = require('http');
const req = http.request({ host: '127.0.0.1', port: ${port}, path: '/reset', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    const head = String(data || '').slice(0, 200);
    let ok = false;
    try { const j = JSON.parse(String(data||'{}')); ok = Boolean(j && j.ok); } catch {}
    console.log(JSON.stringify({ ok, statusCode: res.statusCode || 0, bodyHead: head }));
  });
});
req.on('error', (e) => { console.log(JSON.stringify({ ok: false, statusCode: 0, bodyHead: String(e && e.message ? e.message : e).slice(0, 200) })); });
req.write('{}');
req.end();
`.trim();
    const out = await dockerExec({ args: ['exec', containerName, 'node', '-e', script], timeoutMs: 8000 }).catch((e) => ({ stdout: '', stderr: String(e) }));
    const raw = ('stdout' in out ? (out.stdout || '') : '') + ('stderr' in out ? (out.stderr || '') : '');
    try {
        const parsed = JSON.parse(raw.trim().split('\n').pop() || '{}');
        return {
            ok: Boolean(parsed.ok),
            statusCode: Number(parsed.statusCode || 0),
            bodyHead: String(parsed.bodyHead || '').slice(0, 200),
        };
    } catch {
        return { ok: false, statusCode: 0, bodyHead: raw.slice(0, 200) };
    }
}

async function runUiJsdomPhaseWithPool(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'ui_jsdom' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    const { job, runner, testType, testCode } = params;

    const dependencies = job.dependencies || {};
    const generatedFiles = runner.candidate.generatedFiles || {};

    let pooledContainer: BlackboxContainer | null = null;
    let testRunner: TestRunnerContainer | null = null;
    let networkName: string | null = null;
    const testsDir = join(tmpdir(), `grader_ui_jsdom_${testType}_${job.attemptId}_${Date.now()}`);

    try {
        // Candidate container (pooled)
        pooledContainer = await acquireBlackboxContainer({
            runtime: 'node',
            image: runner.candidate.image,
            dependencies,
            generatedFiles,
            installCommand: runner.candidate.installCommand,
        });

        // Candidate workspace (rewrite generated files each run; reset keeps only node_modules/manifest)
        await writeCandidateWorkspace({
            workDir: pooledContainer.workDir,
            files: job.files,
            generatedFiles,
        });

        const port = runner.candidate.port ?? 3000;
        const candidateContainerWorkDir = runner.candidate.workdir || '/app';

        // Network
        networkName = await acquireNetworkWithRetry(5, 1000);

        await dockerExec({
            args: ['network', 'connect', '--alias', 'candidate', networkName, pooledContainer.name],
            timeoutMs: 5000,
        });

        // Candidate env
        const candidateEnv: Record<string, string> = {
            NODE_ENV: 'test',
            PORT: String(port),
            ...(runner.candidate.env || {}),
        };

        const envCmd = Object.entries(candidateEnv)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join('; ');

        // Start harness server (background)
        const actualRunCommand = runner.candidate.runCommand.replace(/\$PORT/g, String(port));
        const runCommand = `${envCmd}; cd ${candidateContainerWorkDir}; ${actualRunCommand} > /tmp/ui-harness.log 2>&1 &`;

        await dockerExec({
            args: ['exec', '-d', pooledContainer.name, 'sh', '-c', runCommand],
            timeoutMs: 10000,
        });

        // Readiness probe
        const healthPath = runner.candidate.healthPath || '/health';
        const startupTimeoutMs = runner.candidate.startupTimeoutMs || 30000;
        const healthDebug = await waitForHttp({
            containerName: pooledContainer.name,
            port,
            healthPath,
            timeoutMs: startupTimeoutMs,
        });

        const resetProbe = await probeHarnessReset({ containerName: pooledContainer.name, port });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/96ef93a5-f48d-498e-b9a7-fe6968539886',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ui_jsdom_post_harness_fix',hypothesisId:'H_harness_reset',location:'docker-ui-jsdom-grader.ts:runUiJsdomPhaseWithPool',message:'Harness reset probe after health',data:{container:pooledContainer.name,port,healthPath,healthDebug:healthDebug?.slice(0,200)||null,resetOk:resetProbe.ok,resetStatus:resetProbe.statusCode,resetBodyHead:resetProbe.bodyHead},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!resetProbe.ok) {
            const harnessTail = await dockerExec({
                args: ['exec', pooledContainer.name, 'sh', '-c', 'tail -120 /tmp/ui-harness.log 2>/dev/null || true'],
                timeoutMs: 5000,
            }).then((r) => (r.stdout || '') + (r.stderr || '')).catch(() => '');
            return {
                passed: 0,
                total: 1,
                success: false,
                logs: sanitizeLogs(
                    `${logs}\n\n[HealthProbe]\n${healthDebug}\n\n[HarnessProbe]\n/reset failed (status=${resetProbe.statusCode}) body=${resetProbe.bodyHead}\n\n[HarnessLogTail]\n${harnessTail}`
                ),
            };
        }

        // Test runner container (pooled; currently defaults to Jest profile until pool manager is extended)
        const testImage = runner.tests.image || `node:${job.nodeVersion || '20'}-alpine`;
        testRunner = await acquireTestRunner({ framework: 'vitest', image: testImage });

        // Write vitest tests/harness to temp dir then copy into runner container
        await writeVitestUiHarness({ workDir: testsDir, testType, testCode });

        for (const file of ['tests', 'package.json']) {
            await dockerExec({
                args: ['cp', join(testsDir, file), `${testRunner.name}:/app/`],
                timeoutMs: 15000,
            });
        }

        // Optional: copy candidate submitted files into test runner for AST checks (read-only)
        // IMPORTANT: Do NOT copy the entire candidate /app (would include node_modules and be huge).
        try {
            const candidateCopyDir = join(testsDir, 'candidate');
            await mkdir(candidateCopyDir, { recursive: true, mode: 0o755 });
            for (const [path, content] of Object.entries(job.files || {})) {
                const safePath = sanitizeFilePath(path, candidateCopyDir);
                if (!safePath) continue;
                await mkdir(dirname(safePath), { recursive: true }).catch(() => {});
                await writeFile(safePath, content as string);
            }
            await chmod(candidateCopyDir, 0o755).catch(() => {});
            await dockerExec({
                args: ['cp', candidateCopyDir, `${testRunner.name}:/app/`],
                timeoutMs: 15000,
            });
            await dockerExec({
                args: ['exec', testRunner.name, 'sh', '-c', 'chmod -R a-w /app/candidate 2>/dev/null || true'],
                timeoutMs: 5000,
            });
        } catch {
            // Optional; ignore if copy fails
        }

        // Ensure vitest deps are present in the test runner. This will be a no-op once the vitest
        // runner profile is implemented in the pool manager (pre-installed during warmup).
        const ensureVitestCmd =
            'cd /app && ' +
            '(test -f node_modules/vitest/package.json && test -f node_modules/@babel/parser/package.json && echo "vitest deps present" ' +
            `|| (${runner.tests.installCommand || 'npm install --legacy-peer-deps 2>&1'}))`;
        await dockerExec({
            args: ['exec', testRunner.name, 'sh', '-c', ensureVitestCmd],
            timeoutMs: 180000,
        });

        // Connect test runner to network and run tests
        await dockerExec({
            args: ['network', 'connect', networkName, testRunner.name],
            timeoutMs: 5000,
        });

        const baseUrl = `http://candidate:${port}`;
        const testEnv: Record<string, string> = {
            HARNESS_BASE_URL: baseUrl,
            ...(runner.tests.env || {}),
        };

        const testEnvCmd = Object.entries(testEnv)
            .map(([k, v]) => `export ${k}="${v}"`)
            .join('; ');

        const testCmd = runner.tests.testCommand || 'npm test 2>&1';
        const testTimeoutMs = runner.tests.timeoutMs || 180000;

        const result = await dockerExec({
            args: ['exec', testRunner.name, 'sh', '-c', `${testEnvCmd}; cd /app && ${testCmd} || true`],
            timeoutMs: testTimeoutMs,
        });

        // Disconnect test runner from network
        await dockerExec({
            args: ['network', 'disconnect', networkName, testRunner.name],
            timeoutMs: 5000,
        }).catch(() => {});

        // Copy results back
        await dockerExec({
            args: ['cp', `${testRunner.name}:/app/results.xml`, testsDir + '/results.xml'],
            timeoutMs: 5000,
        }).catch(() => {});

        const output = [
            '[HealthProbe]',
            healthDebug,
            '',
            '[VitestOutput]',
            (result.stdout + result.stderr).trim(),
        ].join('\n');

        return await parseVitestResults(testsDir, output);
    } finally {
        // Disconnect candidate from network
        if (pooledContainer && networkName) {
            await dockerExec({
                args: ['network', 'disconnect', networkName, pooledContainer.name],
                timeoutMs: 5000,
            }).catch(() => {});
        }

        if (networkName) {
            await releaseNetwork(networkName).catch(() => {});
        }

        if (testRunner) {
            await releaseTestRunner(testRunner).catch(() => {});
        }

        if (pooledContainer) {
            await releaseBlackboxContainer(pooledContainer).catch(() => {});
        }

        await rm(testsDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function runUiJsdomPhase(params: {
    job: GradingJob;
    runner: Extract<ChallengeRunner, { mode: 'ui_jsdom' }>;
    testType: 'public' | 'hidden';
    testCode: string;
}): Promise<TestRunResult> {
    // For now, only pooled path (pool will create on miss; warmup makes it fast)
    return await runUiJsdomPhaseWithPool(params);
}

export async function runDockerUiJsdomGrader(job: GradingJob): Promise<GradingResult> {
    const runner = job.runner as ChallengeRunner | undefined | null;

    if (!runner || runner.mode !== 'ui_jsdom') {
        throw new Error('Invalid ui_jsdom grader configuration');
    }

    // Public phase
    let publicResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.publicTests && job.publicTests.trim()) {
        publicResult = await runUiJsdomPhase({
            job,
            runner,
            testType: 'public',
            testCode: job.publicTests,
        });
    }

    // Hidden phase
    let hiddenResult: TestRunResult = { passed: 0, total: 0, logs: '', success: true };
    if (job.hiddenTests && job.hiddenTests.trim()) {
        hiddenResult = await runUiJsdomPhase({
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


