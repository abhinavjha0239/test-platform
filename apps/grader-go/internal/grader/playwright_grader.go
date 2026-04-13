package grader

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

type playwrightRunResult struct {
	Passed  int
	Total   int
	Logs    string
	Success bool
}

var (
	pwBlockedPaths = []string{
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
	}
	pwBlockedPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\.test\.(js|jsx|ts|tsx)$`),
		regexp.MustCompile(`(?i)\.spec\.(js|jsx|ts|tsx)$`),
		regexp.MustCompile(`(?i)^jest\.`),
		regexp.MustCompile(`(?i)^babel\.`),
		regexp.MustCompile(`(?i)^\.babelrc`),
		regexp.MustCompile(`(?i)^tsconfig`),
		regexp.MustCompile(`(?i)^package(-lock)?\.json$`),
		regexp.MustCompile(`(?i)^results\.json$`),
	}
	pwTempPaths = []*regexp.Regexp{
		regexp.MustCompile(`/var/folders/[^\s]+`),
		regexp.MustCompile(`/tmp/grader_[^\s]+`),
		regexp.MustCompile(`/private/var/[^\s]+`),
	}
)

func RunPlaywrightGrader(ctx context.Context, job types.GradingJob, gctx *GraderContext) (types.GradingResult, error) {
	runner := job.Runner
	if runner == nil || runner.Mode != "playwright" {
		return types.GradingResult{}, fmt.Errorf("playwright grader invoked without runner.mode=playwright")
	}
	if job.MemoryLimit == 0 {
		job.MemoryLimit = 512
	}
	job.MemoryLimit = clamp(job.MemoryLimit, 512, 4096)

	publicResult := playwrightRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.PublicTests) != "" {
		publicResult = runPlaywrightPhase(ctx, job, *runner, "public", job.PublicTests, gctx)
	}

	hiddenResult := playwrightRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.HiddenTests) != "" {
		hiddenResult = runPlaywrightPhase(ctx, job, *runner, "hidden", job.HiddenTests, gctx)
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

func runPlaywrightPhase(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, testType, testCode string, gctx *GraderContext) playwrightRunResult {
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

	candidateDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_pw_%s_cand_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
	testsDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_pw_%s_tests_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
	candidateName := sanitizeDockerName(fmt.Sprintf("grader_cand_%s_%s_%d_%s", job.AttemptID, testType, timestamp, suffix))

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
			cleanupFn(ctx)
		}
	}()

	filesWritten, err := writePlaywrightWorkspace(candidateDir, job.Files, runner.Candidate.GeneratedFiles)
	if err != nil {
		return playwrightRunResult{Passed: 0, Total: 1, Logs: sanitizePlaywrightLogs(err.Error()), Success: false}
	}
	if filesWritten == 0 {
		return playwrightRunResult{Passed: 0, Total: 0, Logs: "No valid files to test", Success: false}
	}

	if err := writePlaywrightHarness(testsDir, testType, testCode); err != nil {
		return playwrightRunResult{Passed: 0, Total: 1, Logs: sanitizePlaywrightLogs(err.Error()), Success: false}
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

	testImage := runner.Tests.Image
	if testImage == "" {
		testImage = "mcr.microsoft.com/playwright:v1.57.0-jammy"
	}
	installCmd := runner.Tests.InstallCommand
	if installCmd == "" {
		installCmd = "npm install 2>&1"
	}
	testCmd := runner.Tests.TestCommand
	if testCmd == "" {
		testCmd = "PLAYWRIGHT_JUNIT_OUTPUT_NAME=results.xml npx playwright test --reporter=junit 2>&1"
	}
	testTimeoutMs := runner.Tests.TimeoutMs
	if testTimeoutMs == 0 {
		testTimeoutMs = 180000
	}
	testMemoryLimit := maxInt(1024, minInt(job.MemoryLimit*2, 2048))

	if strings.TrimSpace(runner.Candidate.Image) == "" || strings.TrimSpace(runner.Candidate.RunCommand) == "" {
		return playwrightRunResult{Passed: 0, Total: 1, Logs: "Missing candidate configuration.", Success: false}
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
			Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
		}); installErr != nil {
			msg := fmt.Sprintf("Candidate build failed: %s\n\n%s", installErr.Error(), output)
			return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(msg), Success: false}
		}
	}

	if output, installErr := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          "bridge",
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          installCmd,
		Env:              runner.Tests.Env,
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "playwright",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	}); installErr != nil {
		msg := fmt.Sprintf("Playwright install failed: %s\n\n%s", installErr.Error(), output)
		return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(msg), Success: false}
	}

	if networkName == "" {
		networkName = sanitizeDockerName(fmt.Sprintf("grader_net_%s_%d_%s", job.AttemptID, timestamp, suffix))
		if err := docker.CreateNetwork(ctx, networkName); err != nil && !strings.Contains(err.Error(), "already exists") {
			return playwrightRunResult{Passed: 0, Total: 1, Logs: sanitizePlaywrightLogs("Grading infrastructure temporarily unavailable. Please try again."), Success: false}
		}
	}

	if err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             candidateName,
		Network:          networkName,
		Alias:            "candidate",
		Image:            runner.Candidate.Image,
		WorkDir:          candidateDir,
		ContainerWorkDir: candidateWorkDir,
		Command:          "set -e; " + runner.Candidate.RunCommand,
		Env:              candidateEnv,
		MemoryLimitMb:    job.MemoryLimit,
		Runtime:          normalizeRuntime(runner.Runtime),
		Timeout:          15 * time.Second,
	}); err != nil {
		return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(fmt.Sprintf("Grading error: %s", err.Error())), Success: false}
	}

	healthDebug, err := waitForHTTP(ctx, candidateName, port, defaultString(runner.Candidate.HealthPath, "/"), defaultInt(runner.Candidate.StartupTimeoutMs, 30000))
	if err != nil {
		candidateLogs := getContainerLogs(ctx, candidateName, 5*time.Second)
		msg := fmt.Sprintf("%s\n\n--- Candidate Container Logs ---\n%s", err.Error(), candidateLogs)
		return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(msg), Success: false}
	}
	_ = healthDebug

	candidateDebug := func() string {
		logs := getContainerLogs(ctx, candidateName, 8*time.Second)
		fs := ""
		cmd := []string{"exec", candidateName, "sh", "-c", fmt.Sprintf("set -e; echo \"=== ls -la %s ===\"; ls -la %s || true; echo \"\"; echo \"=== ls -la %s/src ===\"; ls -la %s/src || true", candidateWorkDir, candidateWorkDir, candidateWorkDir, candidateWorkDir)}
		if res, err := docker.Exec(ctx, cmd, 8*time.Second); err == nil {
			fs = strings.TrimSpace(res.Stdout + "\n" + res.Stderr)
		} else {
			fs = "Could not retrieve candidate filesystem snapshot."
		}
		return fmt.Sprintf("\n\n--- Candidate Debug ---\n\n[Candidate Logs]\n%s\n\n[Candidate Files]\n%s\n", logs, fs)
	}

	output, runErr := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          networkName,
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          testCmd + " || true",
		Env:              mergeEnv(map[string]string{"BASE_URL": fmt.Sprintf("http://candidate:%d", port)}, runner.Tests.Env),
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "playwright",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	})
	if runErr != nil {
		return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(fmt.Sprintf("Grading error: %s%s", runErr.Error(), candidateDebug())), Success: false}
	}

	junitPath := filepath.Join(testsDir, "results.xml")
	junit, err := os.ReadFile(junitPath)
	if err != nil {
		return playwrightRunResult{Passed: 0, Total: 0, Logs: sanitizePlaywrightLogs(candidateDebug() + "\n\n--- Test Output ---\n" + output + "\n\nMissing Playwright JUnit report"), Success: false}
	}

	total, failures, errors, skipped := parseJUnit(string(junit))
	passed := maxInt(0, total-failures-errors-skipped)
	success := failures == 0 && errors == 0
	if !success {
		return playwrightRunResult{Passed: passed, Total: total, Logs: sanitizePlaywrightLogs(candidateDebug() + "\n\n--- Test Output ---\n" + output), Success: false}
	}

	return playwrightRunResult{Passed: passed, Total: total, Logs: sanitizePlaywrightLogs(output), Success: true}
}

func writePlaywrightWorkspace(workDir string, files map[string]string, generatedFiles map[string]string) (int, error) {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return 0, err
	}

	filesWritten := 0
	for pathKey, content := range files {
		safePath := sanitizePlaywrightFilePath(pathKey, workDir)
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

	return filesWritten, nil
}

func sanitizePlaywrightFilePath(filePath, workDir string) string {
	if strings.Contains(filePath, "..") || strings.HasPrefix(filePath, "/") || strings.HasPrefix(filePath, "\\") {
		return ""
	}
	normalized := strings.ToLower(filePath)
	for _, blocked := range pwBlockedPaths {
		if normalized == blocked || strings.HasPrefix(normalized, blocked+"/") {
			return ""
		}
	}
	fileName := path.Base(path.Clean(strings.ReplaceAll(filePath, "\\", "/")))
	for _, pattern := range pwBlockedPatterns {
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

func writePlaywrightHarness(workDir, testType, testCode string) error {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	testsDir := filepath.Join(workDir, "tests")
	if err := os.MkdirAll(testsDir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(testsDir, fmt.Sprintf("%s.spec.js", testType)), []byte(testCode), 0o644); err != nil {
		return err
	}

	playwrightConfig := `const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  use: {
    baseURL: process.env.BASE_URL,
    headless: true,
  },
  retries: 0,
});`
	if err := os.WriteFile(filepath.Join(workDir, "playwright.config.js"), []byte(playwrightConfig), 0o644); err != nil {
		return err
	}

	packageJSON := map[string]any{
		"name":    "playwright-tests",
		"version": "1.0.0",
		"private": true,
		"devDependencies": map[string]string{
			"@playwright/test": "^1.49.0",
		},
	}
	blob, _ := json.MarshalIndent(packageJSON, "", "  ")
	return os.WriteFile(filepath.Join(workDir, "package.json"), blob, 0o644)
}

func parseJUnit(xml string) (int, int, int, int) {
	suiteTagMatches := regexp.MustCompile(`<testsuite\b[^>]*>`).FindAllString(xml, -1)
	if len(suiteTagMatches) > 0 {
		total := 0
		failures := 0
		errors := 0
		skipped := 0
		for _, tag := range suiteTagMatches {
			total += parseJUnitAttr(tag, "tests")
			failures += parseJUnitAttr(tag, "failures")
			errors += parseJUnitAttr(tag, "errors")
			skipped += parseJUnitAttr(tag, "skipped")
		}
		return total, failures, errors, skipped
	}

	total := len(regexp.MustCompile(`<testcase\b`).FindAllString(xml, -1))
	failures := len(regexp.MustCompile(`<failure\b`).FindAllString(xml, -1))
	errors := len(regexp.MustCompile(`<error\b`).FindAllString(xml, -1))
	skipped := len(regexp.MustCompile(`<skipped\b`).FindAllString(xml, -1))
	return total, failures, errors, skipped
}

func parseJUnitAttr(tag, name string) int {
	re := regexp.MustCompile(fmt.Sprintf(`%s="(\d+)"`, name))
	match := re.FindStringSubmatch(tag)
	if len(match) < 2 {
		return 0
	}
	val, err := strconv.Atoi(match[1])
	if err != nil {
		return 0
	}
	return val
}

func sanitizePlaywrightLogs(logs string) string {
	clean := logs
	for _, re := range pwTempPaths {
		clean = re.ReplaceAllString(clean, "[temp-dir]")
	}
	clean = strings.TrimSpace(clean)
	if len(clean) > 20000 {
		clean = clean[:20000]
	}
	return clean
}

func getContainerLogs(ctx context.Context, containerName string, timeout time.Duration) string {
	if res, err := docker.Exec(ctx, []string{"logs", containerName}, timeout); err == nil {
		return strings.TrimSpace(res.Stdout + "\n" + res.Stderr)
	}
	return "Could not retrieve candidate logs."
}

func mergeEnv(base, extra map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
