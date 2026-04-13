package grader

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/pool"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

type uiRunResult struct {
	Passed  int
	Total   int
	Logs    string
	Success bool
}

var (
	uiBlockedPaths = []string{
		"__tests__",
		"__test__",
		"test",
		"tests",
		".jest",
		"jest.config",
		"babel.config",
		"node_modules",
		"package.json",
		"package-lock.json",
		"results.json",
		".grader",
		".vite",
	}
	uiBlockedPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\.test\.(js|jsx|ts|tsx|cjs|mjs)$`),
		regexp.MustCompile(`(?i)\.spec\.(js|jsx|ts|tsx|cjs|mjs)$`),
		regexp.MustCompile(`(?i)^jest\.`),
		regexp.MustCompile(`(?i)^babel\.`),
		regexp.MustCompile(`(?i)^\.babelrc`),
		regexp.MustCompile(`(?i)^tsconfig`),
		regexp.MustCompile(`(?i)^package(-lock)?\.json$`),
		regexp.MustCompile(`(?i)^results\.(json|xml)$`),
	}
	uiAnsi = regexp.MustCompile(`\x1b\[[0-9;]*m`)
)

func RunUIJsdomGrader(ctx context.Context, job types.GradingJob, gctx *GraderContext) (types.GradingResult, error) {
	runner := job.Runner
	if runner == nil || runner.Mode != "ui_jsdom" {
		return types.GradingResult{}, fmt.Errorf("ui_jsdom grader invoked without runner.mode=ui_jsdom")
	}
	if job.MemoryLimit == 0 {
		job.MemoryLimit = 512
	}
	job.MemoryLimit = clamp(job.MemoryLimit, 512, 4096)

	usePooled := gctx != nil && gctx.UseChallengePooling && gctx.ChallengePoolManager != nil

	// Parallel pooled path: single harness startup, public+hidden tests run
	// simultaneously in separate containers (hidden tests never leak).
	if usePooled {
		return runPooledUIJsdomParallel(ctx, job, *runner, gctx)
	}

	// Legacy (non-pooled) path: sequential phases
	publicResult := uiRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.PublicTests) != "" {
		publicResult = runUIJsdomPhase(ctx, job, *runner, "public", job.PublicTests, gctx)
	}

	hiddenResult := uiRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.HiddenTests) != "" {
		hiddenResult = runUIJsdomPhase(ctx, job, *runner, "hidden", job.HiddenTests, gctx)
	}

	return types.GradingResult{
		PublicScore: publicResult.Passed,
		HiddenScore: hiddenResult.Passed,
		TotalPublic: publicResult.Total,
		TotalHidden: hiddenResult.Total,
		Logs:        publicResult.Logs,
		Success:     publicResult.Success && hiddenResult.Success,
	}, nil
}

func runUIJsdomPhase(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, testType, testCode string, gctx *GraderContext) uiRunResult {
	timestamp := time.Now().UnixMilli()
	suffix := randomSuffix(6)

	// Use pool for network if available
	var networkName string
	var pooledNetwork bool
	if gctx != nil && gctx.UsePooling && gctx.PoolManager != nil {
		_, network, err := gctx.PoolManager.AcquireResources(ctx)
		if err == nil && network != "" {
			networkName = network
			pooledNetwork = true
		}
	}

	candidateDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_ui_%s_cand_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
	testsDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_ui_%s_tests_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
	candidateName := sanitizeDockerName(fmt.Sprintf("grader_cand_%s_%s_%d_%s", job.AttemptID, testType, timestamp, suffix))

	// Async teardown: submit cleanup to background pool so the grading
	// semaphore is released immediately after results are captured.
	cleanupFn := func(cleanCtx context.Context) {
		_ = docker.SafeCleanup(cleanCtx, candidateName, "")
		if pooledNetwork && gctx != nil && gctx.PoolManager != nil {
			gctx.PoolManager.ReleaseResources(cleanCtx, nil, networkName)
		} else if networkName != "" {
			_ = docker.RemoveNetwork(cleanCtx, networkName)
		}
		_ = os.RemoveAll(candidateDir)
		_ = os.RemoveAll(testsDir)
	}
	defer func() {
		if gctx != nil && gctx.CleanupPool != nil {
			gctx.CleanupPool.Submit(cleanupFn)
		} else {
			cleanupFn(ctx) // fallback: sync cleanup
		}
	}()

	filesWritten, err := writeUIWorkspace(candidateDir, job.Files, runner.Candidate.GeneratedFiles)
	if err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(err.Error()), Success: false}
	}
	if filesWritten == 0 {
		return uiRunResult{Passed: 0, Total: 0, Logs: "No valid files to test", Success: false}
	}

	if strings.TrimSpace(runner.Candidate.Image) == "" || strings.TrimSpace(runner.Candidate.RunCommand) == "" {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Missing candidate configuration.", Success: false}
	}

	candidateWorkDir := runner.Candidate.Workdir
	if candidateWorkDir == "" {
		candidateWorkDir = "/app"
	}
	port := runner.Candidate.Port
	if port == 0 {
		port = 3000
	}
	candidateEnv := map[string]string{
		"NODE_ENV": "test",
		"PORT":     fmt.Sprintf("%d", port),
	}
	for k, v := range runner.Candidate.Env {
		candidateEnv[k] = v
	}

	if runner.Candidate.InstallCommand != "" {
		if output, installErr := docker.RunOnce(ctx, docker.RunOnceOptions{
			Name:             "",
			Network:          "bridge",
			Image:            runner.Candidate.Image,
			WorkDir:          candidateDir,
			ContainerWorkDir: candidateWorkDir,
			Command:          "set -e; " + runner.Candidate.InstallCommand,
			Env:              candidateEnv,
			MemoryLimitMb:    job.MemoryLimit,
			Runtime:          normalizeRuntime(runner.Runtime),
			Timeout:          180 * time.Second,
		}); installErr != nil {
			msg := fmt.Sprintf("Candidate build failed: %s\n\n%s", installErr.Error(), output)
			return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
		}
	}

	if networkName == "" {
		networkName = sanitizeDockerName(fmt.Sprintf("grader_net_%s_%d_%s", job.AttemptID, timestamp, suffix))
		if err := docker.CreateNetwork(ctx, networkName); err != nil && !strings.Contains(err.Error(), "already exists") {
			return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs("Grading infrastructure temporarily unavailable. Please try again."), Success: false}
		}
	}

	runCmd := strings.ReplaceAll(runner.Candidate.RunCommand, "$PORT", fmt.Sprintf("%d", port))
	if err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             candidateName,
		Network:          networkName,
		Alias:            "candidate",
		Image:            runner.Candidate.Image,
		WorkDir:          candidateDir,
		ContainerWorkDir: candidateWorkDir,
		Command:          "set -e; " + runCmd,
		Env:              candidateEnv,
		MemoryLimitMb:    job.MemoryLimit,
		Runtime:          normalizeRuntime(runner.Runtime),
		Timeout:          15 * time.Second,
	}); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(err.Error()), Success: false}
	}

	healthDebug, err := waitForHTTP(ctx, candidateName, port, defaultString(runner.Candidate.HealthPath, "/health"), defaultInt(runner.Candidate.StartupTimeoutMs, 30000))
	if err != nil {
		msg := fmt.Sprintf("[HealthProbe]\n%s\n\n[HarnessLog]\n%s", err.Error(), getContainerLogs(ctx, candidateName, 8*time.Second))
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	resetProbe := probeHarnessReset(ctx, candidateName, port)
	if !resetProbe.OK {
		msg := fmt.Sprintf("[HealthProbe]\n%s\n\n[HarnessProbe]\n/reset failed (status=%d) body=%s\n\n[HarnessLog]\n%s", healthDebug, resetProbe.StatusCode, resetProbe.BodyHead, getContainerLogs(ctx, candidateName, 8*time.Second))
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	if err := writeVitestUiHarness(testsDir, testType, testCode); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(err.Error()), Success: false}
	}

	candidateCopyDir := filepath.Join(testsDir, "candidate")
	if err := writeCandidateCopy(candidateCopyDir, job.Files); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(err.Error()), Success: false}
	}

	testImage := runner.Tests.Image
	if testImage == "" {
		nodeVersion := job.NodeVersion
		if nodeVersion == "" {
			nodeVersion = "20"
		}
		testImage = fmt.Sprintf("node:%s-alpine", nodeVersion)
	}
	testInstall := runner.Tests.InstallCommand
	if testInstall == "" {
		testInstall = "npm install --legacy-peer-deps 2>&1"
	}
	testCmd := runner.Tests.TestCommand
	if testCmd == "" {
		testCmd = "npm test 2>&1"
	}

	testTimeoutMs := runner.Tests.TimeoutMs
	if testTimeoutMs == 0 {
		testTimeoutMs = 180000
	}
	testMemoryLimit := clamp(job.MemoryLimit, 256, 1024)

	if output, installErr := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          "bridge",
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          testInstall,
		Env:              runner.Tests.Env,
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "node",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	}); installErr != nil {
		msg := fmt.Sprintf("Vitest install failed: %s\n\n%s", installErr.Error(), output)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	output, runErr := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          networkName,
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          testCmd + " || true",
		Env:              mergeEnv(map[string]string{"HARNESS_BASE_URL": fmt.Sprintf("http://candidate:%d", port)}, runner.Tests.Env),
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "node",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	})
	if runErr != nil {
		msg := fmt.Sprintf("Vitest execution failed: %s\n\n%s", runErr.Error(), output)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	junitPath := filepath.Join(testsDir, "results.xml")
	junit, err := os.ReadFile(junitPath)
	if err != nil {
		msg := fmt.Sprintf("%s\n\nMissing Vitest results.xml", output)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	total, failures, errors, skipped := parseJUnit(string(junit))
	passed := maxInt(0, total-failures-errors-skipped)
	success := failures == 0 && errors == 0
	if !success {
		msg := fmt.Sprintf("%s\n\n--- Test Output ---\n%s", getContainerLogs(ctx, candidateName, 8*time.Second), output)
		return uiRunResult{Passed: passed, Total: total, Logs: sanitizeUILogs(msg), Success: false}
	}

	return uiRunResult{Passed: passed, Total: total, Logs: sanitizeUILogs(output), Success: true}
}

// runPooledUIJsdomPhase uses pre-warmed containers from the challenge pool.
// Instead of docker run/rm per step, it uses docker exec into warm containers.
func runPooledUIJsdomPhase(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, testType, testCode string, gctx *GraderContext) uiRunResult {
	cpm := gctx.ChallengePoolManager

	// --- Build configs (same shape as pool expects) ---
	candGeneratedFiles := map[string]string{}
	for k, v := range runner.Candidate.GeneratedFiles {
		candGeneratedFiles[k] = v
	}
	candConfig := pool.CandidateConfig{
		Image:          runner.Candidate.Image,
		Runtime:        normalizeRuntime(runner.Runtime),
		InstallCommand: runner.Candidate.InstallCommand,
		GeneratedFiles: candGeneratedFiles,
		Workdir:        runner.Candidate.Workdir,
	}

	// Build test harness map (vitest harness + package.json).
	// We construct it here so the pool hash matches for reuse.
	testHarness := map[string]string{}
	vitestPkg, _ := json.MarshalIndent(map[string]any{
		"name": "ui-jsdom-tests", "version": "1.0.0", "private": true, "type": "module",
		"devDependencies": map[string]string{
			"vitest": "^1.6.0", "@babel/parser": "^7.24.0", "@babel/traverse": "^7.24.0",
		},
	}, "", "  ")
	testHarness["package.json"] = string(vitestPkg)

	// Vitest harness helper (same as writeVitestUiHarness generates)
	testHarness["tests/_harness.js"] = vitestUIHarnessCode

	testConfig := pool.TestConfig{
		Image:          runner.Tests.Image,
		Runtime:        "node",
		InstallCommand: runner.Tests.InstallCommand,
		Harness:        testHarness,
	}
	if testConfig.InstallCommand == "" {
		testConfig.InstallCommand = "npm install 2>&1"
	}
	if testType == "public" {
		testConfig.PublicTests = testCode
	} else {
		testConfig.HiddenTests = testCode
	}

	// --- Cleanup stack (reverse order on defer) ---
	var cleanups []func(context.Context)
	defer func() {
		if gctx.CleanupPool != nil {
			fns := cleanups
			gctx.CleanupPool.Submit(func(cleanCtx context.Context) {
				for i := len(fns) - 1; i >= 0; i-- {
					fns[i](cleanCtx)
				}
			})
		} else {
			for i := len(cleanups) - 1; i >= 0; i-- {
				cleanups[i](ctx)
			}
		}
	}()

	// --- Acquire resources ---
	networkName, err := cpm.AcquireNetwork(ctx)
	if err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire network: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) { cpm.ReleaseNetwork(c, networkName) })

	candContainer, err := cpm.GetOrCreateCandidate(ctx, job.ChallengeID, candConfig)
	if err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire candidate container: " + err.Error(), Success: false}
	}
	// Release container (resets workspace) after job
	cleanups = append(cleanups, func(c context.Context) { cpm.ReleaseForChallenge(c, candContainer) })
	// Kill user processes (NOT PID 1) before release
	cleanups = append(cleanups, func(c context.Context) {
		docker.Exec(c, []string{"exec", candContainer.Name, "sh", "-c",
			"ps -eo pid= | awk '$1 > 1 { print $1 }' | xargs -r kill -9 2>/dev/null; true"}, 5*time.Second)
	})

	testContainer, err := cpm.GetOrCreateTest(ctx, job.ChallengeID, testConfig)
	if err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire test container: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) { cpm.ReleaseForChallenge(c, testContainer) })

	// --- Connect to network ---
	if err := docker.NetworkConnect(ctx, networkName, candContainer.Name, "candidate"); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Network connect failed: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) { docker.NetworkDisconnect(c, networkName, candContainer.Name) })

	if err := docker.NetworkConnect(ctx, networkName, testContainer.Name, ""); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Network connect (test) failed: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) { docker.NetworkDisconnect(c, networkName, testContainer.Name) })

	// --- Write user code to candidate host dir ---
	filesWritten, err := writeUIWorkspace(candContainer.WorkDir, job.Files, candGeneratedFiles)
	if err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(err.Error()), Success: false}
	}
	if filesWritten == 0 {
		return uiRunResult{Passed: 0, Total: 0, Logs: "No valid files to test", Success: false}
	}

	// --- Start JSDOM harness (detached exec) ---
	port := runner.Candidate.Port
	if port == 0 {
		port = 3000
	}
	runCmd := strings.ReplaceAll(runner.Candidate.RunCommand, "$PORT", fmt.Sprintf("%d", port))
	startArgs := []string{"exec", "-d", "-e", fmt.Sprintf("PORT=%d", port), "-e", "NODE_ENV=test"}
	for k, v := range runner.Candidate.Env {
		startArgs = append(startArgs, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	startArgs = append(startArgs, candContainer.Name, "sh", "-c", "cd /app && "+runCmd)
	if _, err := docker.Exec(ctx, startArgs, 5*time.Second); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "Failed to start JSDOM harness: " + err.Error(), Success: false}
	}

	// --- Health check ---
	healthDebug, err := waitForHTTP(ctx, candContainer.Name, port,
		defaultString(runner.Candidate.HealthPath, "/health"),
		defaultInt(runner.Candidate.StartupTimeoutMs, 30000))
	if err != nil {
		logs := getContainerLogs(ctx, candContainer.Name, 5*time.Second)
		msg := fmt.Sprintf("[HealthProbe]\n%s\n\n[HarnessLog]\n%s", err.Error(), logs)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	// --- Reset probe ---
	resetProbe := probeHarnessReset(ctx, candContainer.Name, port)
	if !resetProbe.OK {
		logs := getContainerLogs(ctx, candContainer.Name, 5*time.Second)
		msg := fmt.Sprintf("[HealthProbe]\n%s\n\n[ResetProbe] status=%d body=%s\n\n[HarnessLog]\n%s",
			healthDebug, resetProbe.StatusCode, resetProbe.BodyHead, logs)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	// --- Write test file to test container host dir ---
	testFile := filepath.Join(testContainer.WorkDir, "tests", fmt.Sprintf("%s.spec.js", testType))
	if err := os.MkdirAll(filepath.Dir(testFile), 0755); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "mkdir tests: " + err.Error(), Success: false}
	}
	if err := os.WriteFile(testFile, []byte(testCode), 0644); err != nil {
		return uiRunResult{Passed: 0, Total: 1, Logs: "write test: " + err.Error(), Success: false}
	}
	// chown so container (--user 1000:1000) can read
	_ = os.Chown(filepath.Dir(testFile), 1000, 1000)
	_ = os.Chown(testFile, 1000, 1000)

	// --- Run vitest (blocking exec) ---
	testCmd := runner.Tests.TestCommand
	if testCmd == "" {
		testCmd = fmt.Sprintf("npx vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=verbose --reporter=junit --outputFile=results.xml tests/%s.spec.js 2>&1", testType)
	}
	testTimeoutMs := runner.Tests.TimeoutMs
	if testTimeoutMs == 0 {
		testTimeoutMs = 120000
	}

	execArgs := []string{"exec",
		"-e", fmt.Sprintf("HARNESS_BASE_URL=http://candidate:%d", port),
		"-e", "NODE_ENV=test",
	}
	for k, v := range runner.Tests.Env {
		execArgs = append(execArgs, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	execArgs = append(execArgs, testContainer.Name, "sh", "-c", "cd /app && "+testCmd+" || true")

	execRes, err := docker.Exec(ctx, execArgs, time.Duration(testTimeoutMs)*time.Millisecond)
	output := execRes.Stdout + "\n" + execRes.Stderr
	if err != nil {
		msg := fmt.Sprintf("Vitest execution failed: %s\n\n%s", err.Error(), output)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	// --- Parse JUnit XML from test container host dir ---
	junitPath := filepath.Join(testContainer.WorkDir, "results.xml")
	junit, err := os.ReadFile(junitPath)
	if err != nil {
		msg := fmt.Sprintf("%s\n\nMissing Vitest results.xml", output)
		return uiRunResult{Passed: 0, Total: 1, Logs: sanitizeUILogs(msg), Success: false}
	}

	total, failures, errors, skipped := parseJUnit(string(junit))
	passed := maxInt(0, total-failures-errors-skipped)
	success := failures == 0 && errors == 0
	slog.Info("pooled ui_jsdom phase done", "testType", testType, "passed", passed, "total", total)

	if !success {
		return uiRunResult{Passed: passed, Total: total, Logs: sanitizeUILogs(output), Success: false}
	}
	return uiRunResult{Passed: passed, Total: total, Logs: sanitizeUILogs(output), Success: true}
}

// runPooledUIJsdomParallel runs public and hidden tests fully in parallel.
// Each phase gets its own candidate container (own JSDOM harness) + test
// container + network. Total time ≈ max(public, hidden) instead of sum.
// Hidden tests are completely isolated — different container, different network.
func runPooledUIJsdomParallel(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, gctx *GraderContext) (types.GradingResult, error) {
	hasPublic := strings.TrimSpace(job.PublicTests) != ""
	hasHidden := strings.TrimSpace(job.HiddenTests) != ""

	var publicResult, hiddenResult uiRunResult
	var wg sync.WaitGroup

	if hasPublic && hasHidden {
		wg.Add(2)
		go func() {
			defer wg.Done()
			publicResult = runPooledUIJsdomPhase(ctx, job, runner, "public", job.PublicTests, gctx)
		}()
		go func() {
			defer wg.Done()
			hiddenResult = runPooledUIJsdomPhase(ctx, job, runner, "hidden", job.HiddenTests, gctx)
		}()
		wg.Wait()
	} else if hasPublic {
		publicResult = runPooledUIJsdomPhase(ctx, job, runner, "public", job.PublicTests, gctx)
	} else if hasHidden {
		hiddenResult = runPooledUIJsdomPhase(ctx, job, runner, "hidden", job.HiddenTests, gctx)
	}

	return types.GradingResult{
		PublicScore: publicResult.Passed,
		HiddenScore: hiddenResult.Passed,
		TotalPublic: publicResult.Total,
		TotalHidden: hiddenResult.Total,
		Logs:        publicResult.Logs,
		Success:     publicResult.Success && hiddenResult.Success,
	}, nil
}

// vitestUIHarnessCode is the shared harness helper for UI JSDOM tests (constant).
var vitestUIHarnessCode = `export function client() {
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

func writeUIWorkspace(workDir string, files map[string]string, generatedFiles map[string]string) (int, error) {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return 0, err
	}
	filesWritten := 0
	for pathKey, content := range files {
		safePath := sanitizeUIFilePath(pathKey, workDir)
		if safePath == "" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(safePath), 0o755); err != nil {
			return 0, err
		}
		if err := os.WriteFile(safePath, []byte(content), 0o644); err != nil {
			return 0, err
		}
		filesWritten++
	}

	for pathKey, content := range generatedFiles {
		safePath := filepath.Join(workDir, strings.TrimLeft(strings.ReplaceAll(pathKey, "\\", "/"), "/"))
		if !strings.HasPrefix(filepath.Clean(safePath), filepath.Clean(workDir)+string(os.PathSeparator)) {
			return 0, fmt.Errorf("invalid generated file path: %s", pathKey)
		}
		if err := os.MkdirAll(filepath.Dir(safePath), 0o755); err != nil {
			return 0, err
		}
		if err := os.WriteFile(safePath, []byte(content), 0o644); err != nil {
			return 0, err
		}
	}

	// chown entire workspace to 1000:1000 so the container (--user 1000:1000) can write
	if err := chownR(workDir, 1000, 1000); err != nil {
		return 0, fmt.Errorf("chown workspace: %w", err)
	}

	return filesWritten, nil
}

// chownR recursively changes ownership of a directory tree.
// Uses Lchown to handle symlinks (e.g. node_modules -> /app-deps/node_modules)
// without following them.
func chownR(root string, uid, gid int) error {
	return filepath.Walk(root, func(name string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip entries we can't stat (e.g. dangling symlinks)
		}
		return os.Lchown(name, uid, gid)
	})
}

func sanitizeUIFilePath(filePath, workDir string) string {
	if strings.Contains(filePath, "..") || strings.HasPrefix(filePath, "/") || strings.HasPrefix(filePath, "\\") {
		return ""
	}
	normalized := strings.ToLower(filePath)
	for _, blocked := range uiBlockedPaths {
		if normalized == blocked || strings.HasPrefix(normalized, blocked+"/") {
			return ""
		}
	}
	fileName := path.Base(path.Clean(strings.ReplaceAll(filePath, "\\", "/")))
	for _, pattern := range uiBlockedPatterns {
		if pattern.MatchString(fileName) {
			return ""
		}
	}
	sanitized := strings.ReplaceAll(filePath, "..", "")
	sanitized = strings.TrimLeft(sanitized, "/\\")
	sanitized = strings.ReplaceAll(sanitized, "\\", "/")
	fullPath := filepath.Join(workDir, sanitized)
	if !strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(workDir)+string(os.PathSeparator)) {
		return ""
	}
	return filepath.Clean(fullPath)
}

func writeVitestUiHarness(workDir, testType, testCode string) error {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	testsDir := filepath.Join(workDir, "tests")
	if err := os.MkdirAll(testsDir, 0o755); err != nil {
		return err
	}

	harness := `export function client() {
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
	if err := os.WriteFile(filepath.Join(testsDir, "_harness.js"), []byte(harness), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(testsDir, fmt.Sprintf("%s.spec.js", testType)), []byte(testCode), 0o644); err != nil {
		return err
	}

	packageJSON := map[string]any{
		"name":    "ui-jsdom-tests",
		"version": "1.0.0",
		"private": true,
		"type":    "module",
		"scripts": map[string]string{
			"test": fmt.Sprintf("vitest run --pool=threads --no-file-parallelism --maxWorkers=1 --minWorkers=1 --reporter=junit --outputFile=results.xml tests/%s.spec.js", testType),
		},
		"devDependencies": map[string]string{
			"vitest":         "^1.6.0",
			"@babel/parser":  "^7.24.0",
			"@babel/traverse": "^7.24.0",
		},
	}
	blob, _ := json.MarshalIndent(packageJSON, "", "  ")
	if err := os.WriteFile(filepath.Join(workDir, "package.json"), blob, 0o644); err != nil {
		return err
	}

	// chown entire test workspace to 1000:1000 so the container can write
	return chownR(workDir, 1000, 1000)
}

type resetProbeResult struct {
	OK         bool
	StatusCode int
	BodyHead   string
}

func probeHarnessReset(ctx context.Context, containerName string, port int) resetProbeResult {
	script := fmt.Sprintf(`
const http = require('http');
const req = http.request({ host: '127.0.0.1', port: %d, path: '/reset', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
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
`, port)
	script = strings.TrimSpace(script)
	res, err := docker.Exec(ctx, []string{"exec", containerName, "node", "-e", script}, 8*time.Second)
	if err != nil {
		return resetProbeResult{OK: false, StatusCode: 0, BodyHead: truncateMessage(err.Error(), 200)}
	}
	raw := strings.TrimSpace(res.Stdout + "\n" + res.Stderr)
	lines := strings.Split(raw, "\n")
	payload := lines[len(lines)-1]
	var parsed struct {
		OK         bool   `json:"ok"`
		StatusCode int    `json:"statusCode"`
		BodyHead   string `json:"bodyHead"`
	}
	if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
		return resetProbeResult{OK: false, StatusCode: 0, BodyHead: truncateMessage(raw, 200)}
	}
	return resetProbeResult{OK: parsed.OK, StatusCode: parsed.StatusCode, BodyHead: truncateMessage(parsed.BodyHead, 200)}
}

func writeCandidateCopy(workDir string, files map[string]string) error {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	for pathKey, content := range files {
		safePath := sanitizeUIFilePath(pathKey, workDir)
		if safePath == "" {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(safePath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(safePath, []byte(content), 0o444); err != nil {
			return err
		}
	}
	return nil
}

func sanitizeUILogs(logs string) string {
	clean := uiAnsi.ReplaceAllString(logs, "")
	clean = strings.ReplaceAll(clean, "\r", "")
	clean = strings.TrimSpace(clean)
	if len(clean) > 8000 {
		clean = clean[:8000]
	}
	return clean
}
