package grader

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/pool"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

type testRunResult struct {
	Passed  int
	Total   int
	Logs    string
	Success bool
}

var (
	blockedPaths = []string{
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
		"requirements.txt",
		"pyproject.toml",
		"poetry.lock",
		"pipfile",
		"pipfile.lock",
		"go.mod",
		"go.sum",
		"cargo.toml",
		"cargo.lock",
	}

	blockedFilePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\.test\.(js|jsx|ts|tsx)$`),
		regexp.MustCompile(`(?i)\.spec\.(js|jsx|ts|tsx)$`),
		regexp.MustCompile(`(?i)^jest\.`),
		regexp.MustCompile(`(?i)^babel\.`),
		regexp.MustCompile(`(?i)^\.babelrc`),
		regexp.MustCompile(`(?i)^tsconfig`),
		regexp.MustCompile(`(?i)^package(-lock)?\.json$`),
		regexp.MustCompile(`(?i)^results\.json$`),
		regexp.MustCompile(`(?i)^requirements\.txt$`),
		regexp.MustCompile(`(?i)^pyproject\.toml$`),
		regexp.MustCompile(`(?i)^poetry\.lock$`),
		regexp.MustCompile(`(?i)^pipfile(\.lock)?$`),
		regexp.MustCompile(`(?i)^go\.(mod|sum)$`),
		regexp.MustCompile(`(?i)^cargo\.(toml|lock)$`),
	}
)

var (
	reHiddenTest      = regexp.MustCompile(`(?i)hidden\.test\.(js|jsx|ts|tsx)`)
	reHiddenTestPath  = regexp.MustCompile(`(?i)__tests__/hidden\.[^\s]+`)
	reHiddenTestsWord = regexp.MustCompile(`(?i)Hidden Tests?`)
	reVarFolders      = regexp.MustCompile(`/var/folders/[^\s]+`)
	reTmpGrader       = regexp.MustCompile(`/tmp/grader_[^\s]+`)
	rePrivateVar      = regexp.MustCompile(`/private/var/[^\s]+`)
	reAppTests        = regexp.MustCompile(`/app/__tests__/[^\s]+`)
	reAppModules      = regexp.MustCompile(`/app/node_modules/[^\s]+`)
	reGraderDirs      = regexp.MustCompile(`(?i)grader_bb_[a-z]+_[a-z]+_[a-z0-9]+_\d+_[a-z0-9]+`)
	reGraderNet       = regexp.MustCompile(`(?i)grader_net_[a-z0-9_]+`)
	reGraderCand      = regexp.MustCompile(`(?i)grader_cand_[a-z0-9_]+`)
	reGlobalSetup     = regexp.MustCompile(`\[GlobalSetup\][^\n]*`)
	reForceExit       = regexp.MustCompile(`Force exiting Jest[^\n]*`)
	reMultiBlank      = regexp.MustCompile(`\n\s*\n\s*\n`)
	reNpmNotice       = regexp.MustCompile(`(?m)^npm notice[^\n]*\n?`)
	reJUNITReport     = regexp.MustCompile(`(?m)^JUNIT report written to[^\n]*\n?`)
)

func RunHTTPBlackboxGrader(ctx context.Context, job types.GradingJob, gctx *GraderContext) (types.GradingResult, error) {
	runner := job.Runner
	if runner == nil || runner.Mode != "http" {
		return types.GradingResult{}, fmt.Errorf("invalid grader configuration")
	}

	if job.MemoryLimit == 0 {
		job.MemoryLimit = 256
	}
	job.MemoryLimit = clamp(job.MemoryLimit, 256, 4096)

	publicResult := testRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.PublicTests) != "" {
		if gctx.UseChallengePooling && gctx.ChallengePoolManager != nil {
			publicResult = runPooledHTTPPhase(ctx, job, *runner, "public", job.PublicTests, gctx)
		} else {
			publicResult = runHTTPPhase(ctx, job, *runner, "public", job.PublicTests, gctx)
		}
	}

	hiddenResult := testRunResult{Passed: 0, Total: 0, Logs: "", Success: true}
	if strings.TrimSpace(job.HiddenTests) != "" {
		if gctx.UseChallengePooling && gctx.ChallengePoolManager != nil {
			hiddenResult = runPooledHTTPPhase(ctx, job, *runner, "hidden", job.HiddenTests, gctx)
		} else {
			hiddenResult = runHTTPPhase(ctx, job, *runner, "hidden", job.HiddenTests, gctx)
		}
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

func runHTTPPhase(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, testType, testCode string, gctx *GraderContext) testRunResult {
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

	candidateDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_bb_%s_cand_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
	testsDir := filepath.Join(os.TempDir(), fmt.Sprintf("grader_bb_%s_tests_%s_%d_%s", testType, job.AttemptID, timestamp, suffix))
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

	generatedFiles := map[string]string{}
	for k, v := range runner.Candidate.GeneratedFiles {
		generatedFiles[k] = v
	}
	if runner.Runtime == "node" && generatedFiles["package.json"] == "" {
		deps := job.Dependencies
		if deps == nil {
			deps = map[string]string{}
		}
		packageJSON, _ := json.MarshalIndent(map[string]any{
			"name":         "candidate-app",
			"version":      "1.0.0",
			"private":      true,
			"dependencies": deps,
		}, "", "  ")
		generatedFiles["package.json"] = string(packageJSON)
	}

	filesWritten, err := writeCandidateWorkspace(candidateDir, job.Files, generatedFiles)
	if err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(err.Error()), Success: false}
	}
	if filesWritten == 0 {
		return testRunResult{Passed: 0, Total: 0, Logs: "No valid files to test", Success: false}
	}

	if err := writeJestBlackboxHarness(testsDir, testType, testCode); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(err.Error()), Success: false}
	}

	containerWorkDir := runner.Candidate.Workdir
	if containerWorkDir == "" {
		containerWorkDir = "/app"
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

	if runner.Runtime == "rust" {
		candidateEnv["CARGO_HOME"] = "/tmp/.cargo"
	} else if runner.Runtime == "go" {
		candidateEnv["GOPATH"] = "/tmp/go"
		candidateEnv["GOCACHE"] = "/tmp/go-cache"
	} else if runner.Runtime == "python" {
		candidateEnv["HOME"] = "/tmp"
		candidateEnv["PIP_CACHE_DIR"] = "/tmp/pip-cache"
		candidateEnv["PYTHONDONTWRITEBYTECODE"] = "1"
		candidateEnv["PIP_TARGET"] = "/app/.packages"
		candidateEnv["PYTHONPATH"] = "/app/.packages:/app"
		candidateEnv["PATH"] = "/app/.packages/bin:/usr/local/bin:/usr/bin:/bin"
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
		testTimeoutMs = 120000
	}
	testMemoryLimit := clamp(job.MemoryLimit, 256, 1024)

	if strings.TrimSpace(runner.Candidate.Image) == "" {
		return testRunResult{Passed: 0, Total: 1, Logs: "Missing candidate image configuration.", Success: false}
	}
	if strings.TrimSpace(runner.Candidate.RunCommand) == "" {
		return testRunResult{Passed: 0, Total: 1, Logs: "Missing candidate run command.", Success: false}
	}

	if runner.Candidate.InstallCommand != "" {
		_, installErr := docker.RunOnce(ctx, docker.RunOnceOptions{
			Name:             "",
			Network:          "bridge",
			Image:            runner.Candidate.Image,
			WorkDir:          candidateDir,
			ContainerWorkDir: containerWorkDir,
			Command:          "set -e; " + runner.Candidate.InstallCommand,
			Env:              candidateEnv,
			MemoryLimitMb:    job.MemoryLimit,
			Runtime:          normalizeRuntime(runner.Runtime),
			Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
		})
		if installErr != nil {
			hint := "Check your dependencies and source files for errors."
			switch runner.Runtime {
			case "rust":
				hint = "Check your Cargo.toml and src/main.rs for syntax errors."
			case "go":
				hint = "Check your go.mod and main.go for syntax errors."
			case "python":
				hint = "Check your requirements.txt and Python files for errors."
			}
			msg := fmt.Sprintf("Build failed (%s): %s\n\nError: %s", runner.Runtime, hint, truncateMessage(installErr.Error(), 500))
			return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(msg), Success: false}
		}
	}

	if networkName == "" {
		networkName = sanitizeDockerName(fmt.Sprintf("grader_net_%s_%d_%s", job.AttemptID, timestamp, suffix))
		if err := docker.CreateNetwork(ctx, networkName); err != nil && !strings.Contains(err.Error(), "already exists") {
			return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs("Grading infrastructure temporarily unavailable. Please try again."), Success: false}
		}
	}

	if err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             candidateName,
		Network:          networkName,
		Alias:            "candidate",
		Image:            runner.Candidate.Image,
		WorkDir:          candidateDir,
		ContainerWorkDir: containerWorkDir,
		Command:          "set -e; " + runner.Candidate.RunCommand,
		Env:              candidateEnv,
		MemoryLimitMb:    job.MemoryLimit,
		Runtime:          normalizeRuntime(runner.Runtime),
		Timeout:          15 * time.Second,
	}); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(err.Error()), Success: false}
	}

	if err := sleepWithContext(ctx, 800*time.Millisecond); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs("Grading canceled."), Success: false}
	}

	candidateRunning := false
	if inspect, err := docker.Exec(ctx, []string{"inspect", "-f", "{{.State.Running}}", candidateName}, 5*time.Second); err == nil {
		candidateRunning = strings.TrimSpace(inspect.Stdout) == "true"
	}

	candidateLogs := ""
	if logs, err := docker.Exec(ctx, []string{"logs", candidateName}, 5*time.Second); err == nil {
		candidateLogs = strings.TrimSpace(logs.Stdout + "\n" + logs.Stderr)
	}

	if !candidateRunning {
		errLines := extractCandidateErrors(candidateLogs)
		msg := "Server failed to start.\n\n" + errLines
		if errLines == "" {
			msg = "Server failed to start.\n\nCheck your code for syntax errors."
		}
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(msg), Success: false}
	}

	testEnv := map[string]string{
		"BASE_URL":              fmt.Sprintf("http://candidate:%d", port),
		"HEALTH_PATH":           defaultString(runner.Candidate.HealthPath, "/"),
		"STARTUP_TIMEOUT_MS":    fmt.Sprintf("%d", defaultInt(runner.Candidate.StartupTimeoutMs, 20000)),
		"HEALTH_REQUEST_TIMEOUT_MS": "2000",
	}
	for k, v := range runner.Tests.Env {
		testEnv[k] = v
	}

	installOutput, installErr := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          "bridge",
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          "set -e; " + testInstall,
		Env:              runner.Tests.Env,
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "node",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	})
	if installErr != nil {
		msg := fmt.Sprintf("Test dependencies install failed: %s\n\n%s", installErr.Error(), installOutput)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(msg), Success: false}
	}

	output, err := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          networkName,
		Image:            testImage,
		WorkDir:          testsDir,
		ContainerWorkDir: "/app",
		Command:          testCmd + " || true",
		Env:              testEnv,
		MemoryLimitMb:    testMemoryLimit,
		Runtime:          "node",
		Timeout:          time.Duration(testTimeoutMs) * time.Millisecond,
	})
	if err != nil {
		msg := fmt.Sprintf("Test execution failed: %s\n\n%s", err.Error(), output)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(msg), Success: false}
	}

	return parseJestResults(testsDir, output)
}

func sanitizeFilePath(filePath, workDir string) string {
	if strings.Contains(filePath, "..") || strings.HasPrefix(filePath, "/") || strings.HasPrefix(filePath, "\\") {
		return ""
	}

	normalized := strings.ToLower(filePath)
	for _, blocked := range blockedPaths {
		if normalized == blocked || strings.HasPrefix(normalized, blocked+"/") {
			return ""
		}
	}

	fileName := path.Base(path.Clean(strings.ReplaceAll(filePath, "\\", "/")))
	for _, pattern := range blockedFilePatterns {
		if pattern.MatchString(fileName) {
			return ""
		}
	}

	sanitized := strings.ReplaceAll(filePath, "..", "")
	sanitized = strings.TrimLeft(sanitized, "/\\")
	sanitized = strings.ReplaceAll(sanitized, "\\", "/")

	fullPath := filepath.Join(workDir, sanitized)
	normalizedWorkDir := filepath.Clean(workDir)
	fullClean := filepath.Clean(fullPath)

	if !strings.HasPrefix(fullClean, normalizedWorkDir+string(os.PathSeparator)) && fullClean != normalizedWorkDir {
		return ""
	}

	return fullClean
}

func writeCandidateWorkspace(workDir string, files map[string]string, generatedFiles map[string]string) (int, error) {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return 0, err
	}

	filesWritten := 0
	for pathKey, content := range files {
		safePath := sanitizeFilePath(pathKey, workDir)
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

func writeJestBlackboxHarness(workDir, testType, testCode string) error {
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return err
	}
	testsDir := filepath.Join(workDir, "__tests__")
	if err := os.MkdirAll(testsDir, 0o755); err != nil {
		return err
	}

	if err := os.WriteFile(filepath.Join(testsDir, fmt.Sprintf("%s.test.js", testType)), []byte(testCode), 0o644); err != nil {
		return err
	}

	globalSetup := `module.exports = async () => {
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
};
`
	if err := os.WriteFile(filepath.Join(workDir, "global-setup.js"), []byte(globalSetup), 0o644); err != nil {
		return err
	}

	jestConfig := `module.exports = {
  testEnvironment: 'node',
  globalSetup: '<rootDir>/global-setup.js',
  testPathIgnorePatterns: ['/node_modules/'],
};
`
	if err := os.WriteFile(filepath.Join(workDir, "jest.config.js"), []byte(jestConfig), 0o644); err != nil {
		return err
	}

	packageJSON := map[string]any{
		"name":    "blackbox-tests",
		"version": "1.0.0",
		"private": true,
		"scripts": map[string]string{
			"test": fmt.Sprintf(`jest --json --outputFile=results.json --testPathPattern="__tests__/%s\.test\.js$" --forceExit --testTimeout=10000`, testType),
		},
		"devDependencies": map[string]string{
			"jest":     "^29.7.0",
			"supertest": "^6.3.3",
		},
	}
	blob, _ := json.MarshalIndent(packageJSON, "", "  ")
	return os.WriteFile(filepath.Join(workDir, "package.json"), blob, 0o644)
}

// testDetail is a per-assertion result embedded in logs for the frontend.
type testDetail struct {
	Name           string   `json:"name"`
	Status         string   `json:"status"`
	FailureMessages []string `json:"failureMessages,omitempty"`
}

func parseJestResults(workDir, logs string) testRunResult {
	resultsPath := filepath.Join(workDir, "results.json")
	data, err := os.ReadFile(resultsPath)
	if err != nil {
		slog.Warn("missing results.json", "path", resultsPath, "error", err)
		errMsg := fmt.Sprintf("Test results file not found. Tests may have failed to run.\n\nTest output:\n%s", logs)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(errMsg), Success: false}
	}

	var parsed struct {
		Success     *bool `json:"success"`
		TestResults []struct {
			AssertionResults []struct {
				FullName        string   `json:"fullName"`
				AncestorTitles []string `json:"ancestorTitles"`
				Title           string   `json:"title"`
				Status          string   `json:"status"`
				FailureMessages []string `json:"failureMessages"`
			} `json:"assertionResults"`
		} `json:"testResults"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		slog.Warn("invalid results.json", "path", resultsPath, "error", err)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(logs), Success: false}
	}

	passed := 0
	total := 0
	var details []testDetail
	for _, testFile := range parsed.TestResults {
		for _, a := range testFile.AssertionResults {
			total++
			if a.Status == "passed" {
				passed++
			}
			name := a.FullName
			if name == "" {
				name = a.Title
			}
			// Sanitize failure messages to remove infra paths
			var sanitizedFailures []string
			for _, msg := range a.FailureMessages {
				sanitizedFailures = append(sanitizedFailures, sanitizeLogs(msg))
			}
			details = append(details, testDetail{
				Name:           name,
				Status:         a.Status,
				FailureMessages: sanitizedFailures,
			})
		}
	}

	success := true
	if parsed.Success != nil {
		success = *parsed.Success
	}

	// Embed structured test details in logs for the frontend to parse
	sanitized := sanitizeLogs(logs)
	if len(details) > 0 {
		detailsJSON, err := json.Marshal(details)
		if err == nil {
			sanitized += "\n---TEST_DETAILS_JSON---\n" + string(detailsJSON) + "\n---END_TEST_DETAILS_JSON---"
		}
	}

	return testRunResult{
		Passed:  passed,
		Total:   total,
		Logs:    sanitized,
		Success: success,
	}
}

func sanitizeLogs(logs string) string {
	clean := reHiddenTest.ReplaceAllString(logs, "[test]")
	clean = reHiddenTestPath.ReplaceAllString(clean, "[test]")
	clean = reHiddenTestsWord.ReplaceAllString(clean, "[Tests]")

	lines := strings.Split(clean, "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		if !strings.Contains(strings.ToLower(line), "hidden.test.") {
			filtered = append(filtered, line)
		}
	}
	clean = strings.Join(filtered, "\n")

	clean = reVarFolders.ReplaceAllString(clean, "")
	clean = reTmpGrader.ReplaceAllString(clean, "")
	clean = rePrivateVar.ReplaceAllString(clean, "")
	clean = reAppTests.ReplaceAllString(clean, "[test-file]")
	clean = reAppModules.ReplaceAllString(clean, "[module]")
	clean = reGraderDirs.ReplaceAllString(clean, "")
	clean = reGraderNet.ReplaceAllString(clean, "")
	clean = reGraderCand.ReplaceAllString(clean, "")
	clean = reGlobalSetup.ReplaceAllString(clean, "")
	clean = reForceExit.ReplaceAllString(clean, "")
	clean = reNpmNotice.ReplaceAllString(clean, "")
	clean = reJUNITReport.ReplaceAllString(clean, "")

	// Strip Vitest/Jest "Unhandled Error" blocks (EACCES cache write, etc.)
	// These use Unicode box-drawing chars that are hard to regex, so filter by line content.
	{
		lines := strings.Split(clean, "\n")
		var out []string
		inErrorBlock := false
		for _, line := range lines {
			lower := strings.ToLower(line)
			if strings.Contains(lower, "unhandled error") || strings.Contains(lower, "unhandled errors") {
				inErrorBlock = true
				continue
			}
			if inErrorBlock {
				if strings.Contains(lower, "serialized error") {
					inErrorBlock = false // this line + block end
					continue
				}
				continue // skip lines inside the error block
			}
			out = append(out, line)
		}
		clean = strings.Join(out, "\n")
	}

	clean = reMultiBlank.ReplaceAllString(clean, "\n\n")

	clean = strings.TrimSpace(clean)
	if len(clean) > 8000 {
		clean = clean[:8000]
	}
	return clean
}

func extractCandidateErrors(logs string) string {
	if logs == "" {
		return ""
	}
	lines := strings.Split(logs, "\n")
	var filtered []string
	for _, line := range lines {
		if strings.Contains(line, "Error") || strings.Contains(line, "error") ||
			strings.Contains(line, "SyntaxError") || strings.Contains(line, "ModuleNotFoundError") ||
			strings.Contains(line, "ImportError") || strings.Contains(line, "No module") ||
			strings.Contains(line, "not found") {
			filtered = append(filtered, strings.TrimSpace(line))
		}
		if len(filtered) >= 8 {
			break
		}
	}
	return strings.TrimSpace(strings.Join(filtered, "\n"))
}

func sanitizeDockerName(name string) string {
	out := make([]rune, 0, len(name))
	for _, r := range name {
		if (r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == '.' {
			out = append(out, r)
		} else {
			out = append(out, '_')
		}
	}
	return string(out)
}

func randomSuffix(length int) string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	buf := make([]byte, length)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	var b strings.Builder
	for i := 0; i < length; i++ {
		b.WriteByte(alphabet[int(buf[i])%len(alphabet)])
	}
	return b.String()
}

func clamp(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}

func defaultInt(value, fallback int) int {
	if value == 0 {
		return fallback
	}
	return value
}

func truncateMessage(message string, limit int) string {
	if len(message) <= limit {
		return message
	}
	return message[:limit]
}

func normalizeRuntime(runtime string) string {
	switch strings.ToLower(runtime) {
	case "", "node", "nodejs", "react":
		return "node"
	default:
		return runtime
	}
}

// runPooledHTTPPhase executes tests using pooled containers
func runPooledHTTPPhase(ctx context.Context, job types.GradingJob, runner types.ChallengeRunner, testType, testCode string, gctx *GraderContext) testRunResult {
	// 1. Prepare Configs
	// Build the full generated files map (including auto-generated package.json)
	// BEFORE constructing candConfig so the pool container gets deps installed.
	candGeneratedFiles := map[string]string{}
	for k, v := range runner.Candidate.GeneratedFiles {
		candGeneratedFiles[k] = v
	}
	if runner.Runtime == "node" && candGeneratedFiles["package.json"] == "" {
		deps := job.Dependencies
		if deps == nil {
			deps = map[string]string{}
		}
		packageJSON, _ := json.MarshalIndent(map[string]any{
			"name":         "candidate-app",
			"version":      "1.0.0",
			"private":      true,
			"dependencies": deps,
		}, "", "  ")
		candGeneratedFiles["package.json"] = string(packageJSON)
	}

	candConfig := pool.CandidateConfig{
		Image:          runner.Candidate.Image,
		Runtime:        normalizeRuntime(runner.Runtime),
		InstallCommand: runner.Candidate.InstallCommand,
		GeneratedFiles: candGeneratedFiles,
		Workdir:        runner.Candidate.Workdir,
	}

	// NOTE: We assume the test harness (jest.config, package.json etc) are part of the pre-warmed pool config
	// But we need to construct it here to ensure we get the same hash
	// For "GetOrCreate...", if it doesn't exist, we need to provide valid harness.
	// Since we don't know the exact harness used in warmup from here, we rely on what we can construct.
	// However, usually hashing is handled by matching what was used in warmup.
	testHarness := make(map[string]string)
	// We construct a minimal harness here purely for the hash.
	// But wait! If we create on-demand, we need a REAL harness.
	// The http_grader creates harness dynamically. 
	// We replicate that dynamic creation logic into a map passed to GetOrCreate.
	
	// Create mock test/harness files map for GetOrCreate
	tempHarnessDir := filepath.Join(os.TempDir(), fmt.Sprintf("harness_%s_%d", job.AttemptID, time.Now().UnixNano()))
	os.MkdirAll(tempHarnessDir, 0755)
	writeJestBlackboxHarness(tempHarnessDir, testType, testCode) // We write it to read it back into map
	
	filepath.Walk(tempHarnessDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			rel, _ := filepath.Rel(tempHarnessDir, path)
			content, _ := os.ReadFile(path)
			// Skip __tests__/*.test.js as they are handled by struct fields
			if !strings.Contains(rel, ".test.js") {
				testHarness[rel] = string(content)
			}
		}
		return nil
	})
	os.RemoveAll(tempHarnessDir)

	// Test container always runs Node (Jest/Vitest) for HTTP blackbox testing
	testConfig := pool.TestConfig{
		Image:          runner.Tests.Image,
		Runtime:        "node",
		InstallCommand: runner.Tests.InstallCommand,
		Harness:        testHarness,
	}
	// Add default install command if empty (match non-pooled behavior)
	if testConfig.InstallCommand == "" {
		testConfig.InstallCommand = "npm install --legacy-peer-deps 2>&1"
	}
	if testType == "public" {
		testConfig.PublicTests = testCode
	} else {
		testConfig.HiddenTests = testCode
	}
	
	// 2. Acquire Resources
	// Collect cleanup steps so they can run as a single async unit.
	// Order matters: kill procs → disconnect networks → release containers → release network.
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

	// Network
	networkName, err := gctx.ChallengePoolManager.AcquireNetwork(ctx)
	if err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire network: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) {
		gctx.ChallengePoolManager.ReleaseNetwork(c, networkName)
	})

	// Candidate Container
	slog.Debug("acquiring candidate container", "challengeID", job.ChallengeID)
	slog.Debug("candidate config", "image", candConfig.Image, "installCmd", candConfig.InstallCommand, "workdir", candConfig.Workdir, "generatedFiles", len(candConfig.GeneratedFiles))
	candContainer, err := gctx.ChallengePoolManager.GetOrCreateCandidate(ctx, job.ChallengeID, candConfig)
	if err != nil {
		slog.Debug("failed to acquire candidate container", "error", err)
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire candidate container: " + err.Error(), Success: false}
	}
	slog.Debug("acquired candidate container", "name", candContainer.Name, "workDir", candContainer.WorkDir)
	cleanups = append(cleanups, func(c context.Context) {
		gctx.ChallengePoolManager.ReleaseForChallenge(c, candContainer)
	})
	// Kill user processes before releasing (must NOT kill PID 1)
	cleanups = append(cleanups, func(c context.Context) {
		docker.Exec(c, []string{"exec", candContainer.Name, "sh", "-c",
			"ps -eo pid= | awk '$1 > 1 { print $1 }' | xargs -r kill -9 2>/dev/null; true"}, 5*time.Second)
	})

	// Test Container
	testContainer, err := gctx.ChallengePoolManager.GetOrCreateTest(ctx, job.ChallengeID, testConfig)
	if err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to acquire test container: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) {
		gctx.ChallengePoolManager.ReleaseForChallenge(c, testContainer)
	})

	// 3. Connect to Network
	if err := docker.NetworkConnect(ctx, networkName, candContainer.Name, "candidate"); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Network connect failed: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) {
		docker.NetworkDisconnect(c, networkName, candContainer.Name)
	})

	if err := docker.NetworkConnect(ctx, networkName, testContainer.Name, ""); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Network connect failed: " + err.Error(), Success: false}
	}
	cleanups = append(cleanups, func(c context.Context) {
		docker.NetworkDisconnect(c, networkName, testContainer.Name)
	})

	// Write test file to test container (test code is per-job, not pre-warmed)
	testFile := filepath.Join(testContainer.WorkDir, "__tests__", fmt.Sprintf("%s.test.js", testType))
	if err := os.MkdirAll(filepath.Dir(testFile), 0755); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to create test dir: " + err.Error(), Success: false}
	}
	if err := os.WriteFile(testFile, []byte(testCode), 0644); err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to write test file: " + err.Error(), Success: false}
	}

	// 4. Write User Code (reuse candGeneratedFiles built in step 1)
	// Write files to the HOST directory of the container
	slog.Debug("writing user files", "workDir", candContainer.WorkDir)
	slog.Debug("file counts", "userFiles", len(job.Files), "generatedFiles", len(candGeneratedFiles))
	filesWritten, err := writeCandidateWorkspace(candContainer.WorkDir, job.Files, candGeneratedFiles)
	if err != nil {
		slog.Debug("failed to write files", "error", err)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(err.Error()), Success: false}
	}
	if filesWritten == 0 {
		slog.Debug("no files written")
		return testRunResult{Passed: 0, Total: 0, Logs: "No valid files to test", Success: false}
	}



	// 5. Start Candidate Server
	port := runner.Candidate.Port
	if port == 0 {
		port = 3000
	}

	// Runtime-specific env vars (PIP_TARGET, PYTHONPATH, CARGO_HOME, etc.) are
	// already set on the container from createCandidateContainer's docker run -e flags.
	// docker exec inherits them. We only need PORT and challenge-specific overrides.
	candidateEnv := map[string]string{
		"PORT": fmt.Sprintf("%d", port),
	}
	for k, v := range runner.Candidate.Env {
		candidateEnv[k] = v
	}

	startCmd := "set -e; " + runner.Candidate.RunCommand
	startArgs := []string{"exec", "-d"}
	for k, v := range candidateEnv {
		startArgs = append(startArgs, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	startArgs = append(startArgs, candContainer.Name, "sh", "-c", startCmd)
	_, err = docker.Exec(ctx, startArgs, 5*time.Second)
	if err != nil {
		return testRunResult{Passed: 0, Total: 1, Logs: "Failed to start server: " + err.Error(), Success: false}
	}

	// Wait for health check
	// We can use the same logic as legacy but we need to run it from Host or inside test container?
	// Legacy uses a "global-setup.js" inside the test container to wait for health.
	// Since we are running tests, that setup will run!
	// So we don't need manual health check here. 
	// Just ensure candidate is running.

	// 6. Run Tests
	// Exec test command in test container
	testCmd := runner.Tests.TestCommand
	if testCmd == "" {
		testCmd = "npm test 2>&1"
	}
	
	testEnv := map[string]string{
		"BASE_URL":              fmt.Sprintf("http://candidate:%d", port),
		"HEALTH_PATH":           defaultString(runner.Candidate.HealthPath, "/"),
		"STARTUP_TIMEOUT_MS":    fmt.Sprintf("%d", defaultInt(runner.Candidate.StartupTimeoutMs, 20000)),
		"HEALTH_REQUEST_TIMEOUT_MS": "2000",
		"NODE_ENV": "test",
	}
	for k, v := range runner.Tests.Env {
		testEnv[k] = v
	}
	
	// Build exec args with env vars
	execArgs := []string{"exec"}
	for k, v := range testEnv {
		execArgs = append(execArgs, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	execArgs = append(execArgs, testContainer.Name, "sh", "-c", testCmd + " || true")
	
	testTimeoutMs := runner.Tests.TimeoutMs
	if testTimeoutMs == 0 {
		testTimeoutMs = 120000
	}

	execRes, err := docker.Exec(ctx, execArgs, time.Duration(testTimeoutMs)*time.Millisecond)
	output := execRes.Stdout + "\n" + execRes.Stderr
	
	if err != nil {
		msg := fmt.Sprintf("Test execution failed: %s\n\n%s", err.Error(), output)
		return testRunResult{Passed: 0, Total: 1, Logs: sanitizeLogs(msg), Success: false}
	}

	// 7. Parse Results
	// We need to read results.json from test container WorkDir (host path)
	return parseJestResults(testContainer.WorkDir, output)
}
