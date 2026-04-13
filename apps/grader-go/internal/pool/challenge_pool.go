package pool

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

// chownR recursively changes ownership of a directory tree.
// Uses Lchown to handle symlinks (e.g. node_modules -> /app-deps/node_modules)
// without following them.
func chownR(root string, uid, gid int) error {
	return filepath.Walk(root, func(name string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip entries we can't stat (e.g. dangling symlinks)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return os.Lchown(name, uid, gid)
		}
		return os.Lchown(name, uid, gid)
	})
}

// PoolKey identifies a specific container pool
type PoolKey struct {
	Type        string // "candidate", "test"
	ChallengeID string // e.g., "react-todo"
	Hash        string // sha256 of config
}

func (k PoolKey) String() string {
	return fmt.Sprintf("%s:%s:%s", k.Type, k.ChallengeID, k.Hash[:8])
}

// ChallengeConfig contains warmup configuration for a challenge
type ChallengeConfig struct {
	ChallengeID string
	Candidate   CandidateConfig
	Test        TestConfig
}

type CandidateConfig struct {
	Image          string
	Runtime        string // e.g. "node", "python"
	InstallCommand string
	GeneratedFiles map[string]string
	Workdir        string
}

type TestConfig struct {
	Image          string
	Runtime        string // e.g. "node", "python"
	InstallCommand string
	PublicTests    string
	HiddenTests    string
	Harness        map[string]string // Additional test harness files
}

// ChallengePooledContainer extends PooledContainer with challenge info
type ChallengePooledContainer struct {
	*PooledContainer
	ChallengeID   string
	ContainerType string // "candidate" or "test"
	PoolKey       PoolKey
	TestsInjected bool // For test containers: true if tests are pre-written
}

// ChallengePoolManager manages pools keyed by challenge configuration
type ChallengePoolManager struct {
	pools       map[string]*challengePool // key = PoolKey.String()
	networkPool *NetworkPool
	workDirBase string
	mu          sync.RWMutex
	logger      *slog.Logger
	closed      bool
}

type challengePool struct {
	key        PoolKey
	containers chan *ChallengePooledContainer
	allConts   map[string]*ChallengePooledContainer
	config     interface{} // CandidateConfig or TestConfig
	mu         sync.RWMutex
	maxSize    int
	closed     bool
}

// NewChallengePoolManager creates a new centralized pool manager
func NewChallengePoolManager(networkPool *NetworkPool, workDirBase string) *ChallengePoolManager {
	if workDirBase == "" {
		workDirBase = "/tmp/grader-challenge-pool"
	}
	return &ChallengePoolManager{
		pools:       make(map[string]*challengePool),
		networkPool: networkPool,
		workDirBase: workDirBase,
		logger:      slog.Default().With("component", "challenge-pool"),
	}
}

// ComputeChallengeHash generates a hash for cache key from challenge config
func ComputeChallengeHash(image, runtime, installCmd string, files map[string]string) string {
	h := sha256.New()
	h.Write([]byte(image))
	h.Write([]byte(runtime))
	h.Write([]byte(installCmd))
	
	// Sort keys for deterministic hashing
	keys := make([]string, 0, len(files))
	for k := range files {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte(files[k]))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}



// getOrCreatePool gets an existing pool or creates a new one
func (m *ChallengePoolManager) getOrCreatePool(key PoolKey, maxSize int, config interface{}) *challengePool {
	keyStr := key.String()

	m.mu.RLock()
	pool, exists := m.pools[keyStr]
	m.mu.RUnlock()

	if exists {
		// Ensure config is set (might be missing if we just had a race, though unlikely with the lock pattern below)
		if pool.config == nil && config != nil {
			pool.mu.Lock()
			pool.config = config
			pool.mu.Unlock()
		}
		return pool
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Double-check after acquiring write lock
	if pool, exists = m.pools[keyStr]; exists {
		if pool.config == nil && config != nil {
			pool.mu.Lock()
			pool.config = config
			pool.mu.Unlock()
		}
		return pool
	}

	pool = &challengePool{
		key:        key,
		containers: make(chan *ChallengePooledContainer, maxSize),
		allConts:   make(map[string]*ChallengePooledContainer),
		config:     config,
		maxSize:    maxSize,
	}
	m.pools[keyStr] = pool
	m.logger.Info("created pool", "key", keyStr)
	return pool
}

// WarmupChallenge pre-creates containers for a challenge
func (m *ChallengePoolManager) WarmupChallenge(ctx context.Context, config ChallengeConfig, count int) error {
	m.logger.Info("warming up challenge", "challengeID", config.ChallengeID, "candidateCount", count, "testCount", count)

	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	// Warm candidate containers
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := m.warmupCandidateContainers(ctx, config.ChallengeID, config.Candidate, count); err != nil {
			errCh <- fmt.Errorf("candidate warmup: %w", err)
		}
	}()

	// Warm test containers
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := m.warmupTestContainers(ctx, config.ChallengeID, config.Test, count); err != nil {
			errCh <- fmt.Errorf("test warmup: %w", err)
		}
	}()

	wg.Wait()
	close(errCh)

	// Collect errors
	var errs []error
	for err := range errCh {
		errs = append(errs, err)
	}
	if len(errs) > 0 {
		return fmt.Errorf("warmup errors: %v", errs)
	}
	return nil
}

// warmupCandidateContainers creates candidate containers with deps installed
func (m *ChallengePoolManager) warmupCandidateContainers(ctx context.Context, challengeID string, config CandidateConfig, count int) error {
	hash := ComputeChallengeHash(config.Image, config.Runtime, config.InstallCommand, config.GeneratedFiles)
	key := PoolKey{Type: "candidate", ChallengeID: challengeID, Hash: hash}
	pool := m.getOrCreatePool(key, count*2, config)

	for i := 0; i < count; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		container, err := m.createCandidateContainer(ctx, challengeID, config, key)
		if err != nil {
			m.logger.Warn("failed to create candidate container", "error", err)
			continue
		}

		pool.mu.Lock()
		pool.allConts[container.Name] = container
		pool.mu.Unlock()

		select {
		case pool.containers <- container:
			m.logger.Info("warmed candidate container", "name", container.Name, "challengeID", challengeID)
		default:
			m.logger.Info("pool full, discarding container", "name", container.Name)
		}
	}
	return nil
}

// warmupTestContainers creates test containers with deps AND test code pre-injected
func (m *ChallengePoolManager) warmupTestContainers(ctx context.Context, challengeID string, config TestConfig, count int) error {
	hash := ComputeChallengeHash(config.Image, config.Runtime, config.InstallCommand, config.Harness)
	key := PoolKey{Type: "test", ChallengeID: challengeID, Hash: hash}
	pool := m.getOrCreatePool(key, count*2, config)

	for i := 0; i < count; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		container, err := m.createTestContainer(ctx, challengeID, config, key)
		if err != nil {
			m.logger.Warn("failed to create test container", "error", err)
			continue
		}

		pool.mu.Lock()
		pool.allConts[container.Name] = container
		pool.mu.Unlock()

		select {
		case pool.containers <- container:
			m.logger.Info("warmed test container", "name", container.Name, "challengeID", challengeID, "testsPreInjected", true)
		default:
			m.logger.Info("pool full, discarding container", "name", container.Name)
		}
	}
	return nil
}

// createCandidateContainer creates a container with deps installed and generated files written
func (m *ChallengePoolManager) createCandidateContainer(ctx context.Context, challengeID string, config CandidateConfig, key PoolKey) (*ChallengePooledContainer, error) {
	name := fmt.Sprintf("grader_cand_%s_%d_%d", challengeID, os.Getpid(), time.Now().UnixNano())
	workDir := filepath.Join(m.workDirBase, name)
	m.logger.Debug("createCandidateContainer START", "name", name, "workDir", workDir, "challengeID", challengeID)

	if err := os.MkdirAll(workDir, 0777); err != nil {
		m.logger.Debug("createCandidateContainer FAILED: mkdir workDir", "error", err)
		return nil, fmt.Errorf("mkdir failed: %w", err)
	}
	m.logger.Debug("created workDir", "workDir", workDir)

	// Write generated files
	m.logger.Debug("writing generated files to workDir", "count", len(config.GeneratedFiles))
	for filePath, content := range config.GeneratedFiles {
		fullPath := filepath.Join(workDir, filePath)
		m.logger.Debug("writing generated file", "file", filePath, "sizeBytes", len(content))
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			m.logger.Debug("createCandidateContainer FAILED: mkdir for file", "file", filePath, "error", err)
			return nil, err
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			m.logger.Debug("createCandidateContainer FAILED: write file", "file", filePath, "error", err)
			return nil, err
		}
		// Verify file was written
		if info, err := os.Stat(fullPath); err == nil {
			m.logger.Debug("verified file written", "file", filePath, "sizeBytes", info.Size())
		} else {
			m.logger.Warn("file verification failed", "file", filePath, "error", err)
		}
	}

	// chown workspace to 1000:1000 so container (--user 1000:1000) can write
	if err := chownR(workDir, 1000, 1000); err != nil {
		m.logger.Warn("chown workspace failed", "error", err)
	}

	image := config.Image
	if image == "" {
		image = "node:20-alpine"
		m.logger.Debug("using default image", "image", image)
	} else {
		m.logger.Debug("using configured image", "image", image)
	}

	containerWorkDir := config.Workdir
	if containerWorkDir == "" {
		containerWorkDir = "/app"
		m.logger.Debug("using default containerWorkDir", "containerWorkDir", containerWorkDir)
	} else {
		m.logger.Debug("using configured containerWorkDir", "containerWorkDir", containerWorkDir)
	}

	// Build runtime-specific env vars (must match legacy runHTTPPhase candidateEnv)
	// These are needed during pip/cargo/go install AND during server start.
	containerEnv := map[string]string{"NODE_ENV": "test"}
	switch config.Runtime {
	case "python":
		containerEnv["HOME"] = "/tmp"
		containerEnv["PIP_CACHE_DIR"] = "/tmp/pip-cache"
		containerEnv["PYTHONDONTWRITEBYTECODE"] = "1"
		containerEnv["PIP_TARGET"] = containerWorkDir + "/.packages"
		containerEnv["PYTHONPATH"] = containerWorkDir + "/.packages:" + containerWorkDir
		containerEnv["PATH"] = containerWorkDir + "/.packages/bin:/usr/local/bin:/usr/bin:/bin"
	case "rust":
		containerEnv["CARGO_HOME"] = "/tmp/.cargo"
	case "go":
		containerEnv["GOPATH"] = "/tmp/go"
		containerEnv["GOCACHE"] = "/tmp/go-cache"
	}

	// Start Docker container
	m.logger.Debug("starting Docker container", "name", name, "image", image, "workDir", workDir, "containerWorkDir", containerWorkDir)
	err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             name,
		Network:          "bridge",
		Image:            image,
		WorkDir:          workDir,
		ContainerWorkDir: containerWorkDir,
		Command:          "tail -f /dev/null",
		Env:              containerEnv,
		MemoryLimitMb:    512,
		Runtime:          config.Runtime,
		Timeout:          30 * time.Second,
		SkipReadOnly:     true, // Pooled containers need writable root for procps install
	})
	if err != nil {
		m.logger.Debug("createCandidateContainer FAILED: docker run", "error", err)
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("docker run failed: %w", err)
	}
	m.logger.Debug("Docker container started successfully", "name", name)

	// Verify container is running
	if inspect, err := docker.Exec(ctx, []string{"inspect", "-f", "{{.State.Running}}", name}, 5*time.Second); err == nil {
		m.logger.Debug("container state check", "running", strings.TrimSpace(inspect.Stdout))
	}

	// Install procps (pkill) availability for pooled cleanup
	// We do this once during container creation so it's ready for reuse cleanup
	// NOTE: Must run as root since container runs as non-root user
	m.logger.Debug("ensuring pkill (procps) is installed", "name", name)
	installProcpsCmd := ""
	if strings.Contains(image, "alpine") {
		installProcpsCmd = "apk add --no-cache procps"
	} else if strings.Contains(image, "slim") || strings.Contains(image, "debian") || strings.Contains(image, "ubuntu") || strings.Contains(image, "python") {
		// "python:3.11-slim" matches here
		installProcpsCmd = "apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*"
	}
	
	if installProcpsCmd != "" {
		// Run as root to have permission to install packages
		if _, err := docker.Exec(ctx, []string{"exec", "--user", "root", name, "sh", "-c", installProcpsCmd}, 60*time.Second); err != nil {
			m.logger.Warn("failed to install procps", "error", err)
		} else {
			m.logger.Debug("successfully installed procps")
		}
	}

	// Install dependencies if command provided
	if config.InstallCommand != "" {
		installCmd := "cd " + containerWorkDir + " && " + config.InstallCommand
		m.logger.Debug("running install command", "command", installCmd)

		// Check if key files exist before install (e.g., requirements.txt, package.json)
		if strings.Contains(config.InstallCommand, "requirements.txt") {
			reqPath := filepath.Join(workDir, "requirements.txt")
			if info, err := os.Stat(reqPath); err == nil {
				m.logger.Debug("requirements.txt exists in workDir", "path", reqPath, "sizeBytes", info.Size())
			} else {
				m.logger.Warn("requirements.txt not found in workDir", "path", reqPath, "error", err)
			}
			// Also check inside container
			if _, err := docker.Exec(ctx, []string{"exec", name, "test", "-f", containerWorkDir+"/requirements.txt"}, 5*time.Second); err == nil {
				m.logger.Debug("requirements.txt check in container: exists")
			} else {
				m.logger.Warn("requirements.txt not found in container", "path", containerWorkDir+"/requirements.txt")
			}
		}

		// List files in container workDir before install
		if listRes, err := docker.Exec(ctx, []string{"exec", name, "ls", "-la", containerWorkDir}, 5*time.Second); err == nil {
			m.logger.Debug("files in container before install", "containerWorkDir", containerWorkDir, "listing", listRes.Stdout)
		} else {
			m.logger.Warn("failed to list files in container", "error", err)
		}

		execRes, err := docker.Exec(ctx, []string{
			"exec", name, "sh", "-c", installCmd,
		}, 5*time.Minute)

		if err != nil {
			m.logger.Debug("install command failed", "error", err)
			m.logger.Debug("install command stdout", "stdout", execRes.Stdout)
			m.logger.Debug("install command stderr", "stderr", execRes.Stderr)
			docker.SafeCleanup(ctx, name, "")
			os.RemoveAll(workDir)
			return nil, fmt.Errorf("install failed: %w", err)
		}
		m.logger.Debug("install command succeeded")
		m.logger.Debug("install command stdout", "stdout", execRes.Stdout)
		if execRes.Stderr != "" {
			m.logger.Debug("install command stderr", "stderr", execRes.Stderr)
		}
	} else {
		m.logger.Debug("no install command provided, skipping dependency installation")
	}

	return &ChallengePooledContainer{
		PooledContainer: &PooledContainer{
			Name:       name,
			WorkDir:    workDir,
			Image:      image,
			CreatedAt:  time.Now(),
			LastUsedAt: time.Now(),
			DepsHash:   key.Hash,
		},
		ChallengeID:   challengeID,
		ContainerType: "candidate",
		PoolKey:       key,
	}, nil
}

// createTestContainer creates a container with deps AND test code pre-injected
func (m *ChallengePoolManager) createTestContainer(ctx context.Context, challengeID string, config TestConfig, key PoolKey) (*ChallengePooledContainer, error) {
	name := fmt.Sprintf("grader_test_%s_%d_%d", challengeID, os.Getpid(), time.Now().UnixNano())
	workDir := filepath.Join(m.workDirBase, name)

	if err := os.MkdirAll(workDir, 0777); err != nil {
		return nil, fmt.Errorf("mkdir failed: %w", err)
	}

	// Write harness files
	for filePath, content := range config.Harness {
		fullPath := filepath.Join(workDir, filePath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
			return nil, err
		}
	}

	// PRE-INJECT TEST CODE (this never changes per job!)
	testsDir := filepath.Join(workDir, "__tests__")
	if err := os.MkdirAll(testsDir, 0755); err != nil {
		return nil, err
	}
	if config.PublicTests != "" {
		if err := os.WriteFile(filepath.Join(testsDir, "public.test.js"), []byte(config.PublicTests), 0644); err != nil {
			return nil, err
		}
	}
	if config.HiddenTests != "" {
		if err := os.WriteFile(filepath.Join(testsDir, "hidden.test.js"), []byte(config.HiddenTests), 0644); err != nil {
			return nil, err
		}
	}

	// chown workspace to 1000:1000 so container (--user 1000:1000) can write
	if err := chownR(workDir, 1000, 1000); err != nil {
		m.logger.Warn("chown test workspace failed", "error", err)
	}

	image := config.Image
	if image == "" {
		image = "node:20-alpine"
	}

	// Start Docker container
	err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             name,
		Network:          "bridge",
		Image:            image,
		WorkDir:          workDir,
		ContainerWorkDir: "/app",
		Command:          "tail -f /dev/null",
		Env:              map[string]string{"NODE_ENV": "test"},
		MemoryLimitMb:    1024,
		Runtime:          config.Runtime,
		Timeout:          30 * time.Second,
		SkipReadOnly:     true, // Pooled containers need writable root for procps install
	})
	if err != nil {
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("docker run failed: %w", err)
	}

	// Install procps (pkill) availability for pooled cleanup
	// NOTE: Must run as root since container runs as non-root user
	m.logger.Debug("ensuring pkill (procps) is installed", "name", name)
	installProcpsCmd := ""
	if strings.Contains(image, "alpine") {
		installProcpsCmd = "apk add --no-cache procps"
	} else if strings.Contains(image, "slim") || strings.Contains(image, "debian") || strings.Contains(image, "ubuntu") || strings.Contains(image, "python") {
		installProcpsCmd = "apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*"
	}

	if installProcpsCmd != "" {
		// Run as root to have permission to install packages
		if _, err := docker.Exec(ctx, []string{"exec", "--user", "root", name, "sh", "-c", installProcpsCmd}, 60*time.Second); err != nil {
			m.logger.Warn("failed to install procps", "error", err)
		} else {
			m.logger.Debug("successfully installed procps")
		}
	}

	// Install test dependencies
	if config.InstallCommand != "" {
		_, err := docker.Exec(ctx, []string{
			"exec", name, "sh", "-c", "cd /app && " + config.InstallCommand,
		}, 5*time.Minute)
		if err != nil {
			docker.SafeCleanup(ctx, name, "")
			os.RemoveAll(workDir)
			return nil, fmt.Errorf("install failed: %w", err)
		}
	}

	return &ChallengePooledContainer{
		PooledContainer: &PooledContainer{
			Name:       name,
			WorkDir:    workDir,
			Image:      image,
			CreatedAt:  time.Now(),
			LastUsedAt: time.Now(),
			DepsHash:   key.Hash,
		},
		ChallengeID:   challengeID,
		ContainerType: "test",
		PoolKey:       key,
		TestsInjected: true, // Tests are pre-written!
	}, nil
}

// AcquireForChallenge gets a container from the appropriate pool
func (m *ChallengePoolManager) AcquireForChallenge(ctx context.Context, challengeID, containerType, hash string) (*ChallengePooledContainer, error) {
	key := PoolKey{Type: containerType, ChallengeID: challengeID, Hash: hash}
	keyStr := key.String()

	m.mu.RLock()
	pool, exists := m.pools[keyStr]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("no pool for %s", keyStr)
	}

	select {
	case container := <-pool.containers:
		// Defense in depth: verify container is still running before returning it.
		// If PID 1 was killed (e.g. by aggressive cleanup), restart the container.
		if inspect, err := docker.Exec(ctx, []string{"inspect", "-f", "{{.State.Running}}", container.Name}, 5*time.Second); err != nil || strings.TrimSpace(inspect.Stdout) != "true" {
			m.logger.Warn("pooled container not running, restarting", "name", container.Name, "state", strings.TrimSpace(inspect.Stdout))
			if _, err := docker.Exec(ctx, []string{"start", container.Name}, 10*time.Second); err != nil {
				m.logger.Error("failed to restart container, discarding", "name", container.Name, "error", err)
				pool.mu.Lock()
				delete(pool.allConts, container.Name)
				pool.mu.Unlock()
				docker.SafeCleanup(ctx, container.Name, "")
				os.RemoveAll(container.WorkDir)
				return nil, fmt.Errorf("container %s stopped and restart failed: %w", container.Name, err)
			}
			m.logger.Info("restarted stopped container", "name", container.Name)
		}

		container.LastUsedAt = time.Now()
		container.InUse = true
		m.logger.Info("acquired container", "type", containerType, "name", container.Name, "challengeID", challengeID)
		return container, nil
	case <-time.After(5 * time.Second):
		return nil, fmt.Errorf("acquire timeout for %s", keyStr)
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// GetOrCreateCandidate gets a pooled candidate container or creates one on-demand
// This is the main entry point for graders - handles both warmed and non-warmed cases
func (m *ChallengePoolManager) GetOrCreateCandidate(ctx context.Context, challengeID string, config CandidateConfig) (*ChallengePooledContainer, error) {
	// Defense in depth: handle empty challengeID
	if challengeID == "" {
		challengeID = "unknown"
		m.logger.Warn("empty challengeID in GetOrCreateCandidate, using fallback")
	}
	hash := ComputeChallengeHash(config.Image, config.Runtime, config.InstallCommand, config.GeneratedFiles)
	m.logger.Debug("GetOrCreateCandidate", "challengeID", challengeID, "image", config.Image, "runtime", config.Runtime, "installCmd", config.InstallCommand, "hash", hash, "generatedFiles", len(config.GeneratedFiles))

	// Try to get from pool first
	container, err := m.AcquireForChallenge(ctx, challengeID, "candidate", hash)
	if err == nil {
		m.logger.Debug("acquired existing pooled candidate container", "name", container.Name)
		return container, nil
	}

	m.logger.Debug("no pooled candidate, creating on-demand", "challengeID", challengeID, "error", err)

	// Create on-demand
	key := PoolKey{Type: "candidate", ChallengeID: challengeID, Hash: hash}
	m.logger.Debug("starting createCandidateContainer", "challengeID", challengeID, "key", key.String())
	container, err = m.createCandidateContainer(ctx, challengeID, config, key)
	if err != nil {
		m.logger.Debug("createCandidateContainer failed", "error", err)
		return nil, err
	}
	m.logger.Debug("createCandidateContainer succeeded", "container", container.Name, "workDir", container.WorkDir)
	
	// Track it so we can release it later
	pool := m.getOrCreatePool(key, 10, config)
	pool.mu.Lock()
	pool.allConts[container.Name] = container
	pool.mu.Unlock()
	
	container.InUse = true
	return container, nil
}

// GetOrCreateTest gets a pooled test container or creates one on-demand  
func (m *ChallengePoolManager) GetOrCreateTest(ctx context.Context, challengeID string, config TestConfig) (*ChallengePooledContainer, error) {
	// Defense in depth: handle empty challengeID
	if challengeID == "" {
		challengeID = "unknown"
		m.logger.Warn("empty challengeID in GetOrCreateTest, using fallback")
	}
	hash := ComputeChallengeHash(config.Image, config.Runtime, config.InstallCommand, config.Harness)

	// Try to get from pool first
	container, err := m.AcquireForChallenge(ctx, challengeID, "test", hash)
	if err == nil {
		return container, nil
	}

	m.logger.Info("no pooled test container, creating on-demand", "challengeID", challengeID)
	
	// Create on-demand
	key := PoolKey{Type: "test", ChallengeID: challengeID, Hash: hash}
	container, err = m.createTestContainer(ctx, challengeID, config, key)
	if err != nil {
		return nil, err
	}
	
	// Track it so we can release it later
	pool := m.getOrCreatePool(key, 10, config)
	pool.mu.Lock()
	pool.allConts[container.Name] = container
	pool.mu.Unlock()
	
	container.InUse = true
	return container, nil
}

// AcquireNetwork gets a network from the pool
func (m *ChallengePoolManager) AcquireNetwork(ctx context.Context) (string, error) {
	return m.networkPool.Acquire(ctx)
}

// ReleaseNetwork returns a network to the pool
func (m *ChallengePoolManager) ReleaseNetwork(ctx context.Context, network string) {
	m.networkPool.Release(ctx, network)
}

// ReleaseForChallenge returns a container to its pool
func (m *ChallengePoolManager) ReleaseForChallenge(ctx context.Context, container *ChallengePooledContainer) error {
	if container == nil {
		return nil
	}

	keyStr := container.PoolKey.String()

	m.mu.RLock()
	pool, exists := m.pools[keyStr]
	m.mu.RUnlock()

	if !exists {
		// Pool doesn't exist, cleanup container
		docker.SafeCleanup(ctx, container.Name, "")
		os.RemoveAll(container.WorkDir)
		return nil
	}

	// If pool is closed, just destroy the container
	pool.mu.RLock()
	poolClosed := pool.closed
	pool.mu.RUnlock()
	if poolClosed {
		docker.SafeCleanup(ctx, container.Name, "")
		os.RemoveAll(container.WorkDir)
		return nil
	}

	container.InUse = false
	container.LastUsedAt = time.Now()

	// Reset workspace (keep installed deps, clear everything else, restore generated files)
	if container.ContainerType == "candidate" {
		if cfg, ok := pool.config.(CandidateConfig); ok {
			m.resetCandidateWorkspace(container, cfg)
		} else {
			m.logger.Warn("missing or invalid config for candidate pool, cannot reset properly", "poolKey", container.PoolKey)
			// Destroy it to be safe if we can't reset
			docker.SafeCleanup(ctx, container.Name, "")
			os.RemoveAll(container.WorkDir)
			return nil
		}
	} else if container.ContainerType == "test" {
		if cfg, ok := pool.config.(TestConfig); ok {
			m.resetTestWorkspace(container, cfg)
		} else {
			m.logger.Warn("missing or invalid config for test pool", "poolKey", container.PoolKey)
			docker.SafeCleanup(ctx, container.Name, "")
			os.RemoveAll(container.WorkDir)
			return nil
		}
	}

	select {
	case pool.containers <- container:
		m.logger.Info("released container", "type", container.ContainerType, "name", container.Name)
	default:
		// Pool full, destroy and remove from tracking
		pool.mu.Lock()
		delete(pool.allConts, container.Name)
		pool.mu.Unlock()
		docker.SafeCleanup(ctx, container.Name, "")
		os.RemoveAll(container.WorkDir)
		m.logger.Info("pool full, destroyed container", "name", container.Name)
	}

	return nil
}

// resetCandidateWorkspace clears candidate code but keeps deps
func (m *ChallengePoolManager) resetCandidateWorkspace(container *ChallengePooledContainer, config CandidateConfig) {
	// 1. Clean workspace
	entries, err := os.ReadDir(container.WorkDir)
	if err == nil {
		for _, entry := range entries {
			name := entry.Name()
			// Keep node_modules, package.json, generated files (initially) loops
			// Better: Keep only specific heavy folders
			if name == "node_modules" || name == "venv" || name == "__pycache__" || name == "target" || name == ".next" || name == ".packages" {
				continue
			}
			// Don't delete package.json if it was installed by us? 
			// Actually package.json is usually a generated file or part of starter code. 
			// If it's a generated file, we will overwrite it. If it's not, we should probably delete it?
			// But if `npm install` runs, it needs package.json.
			// Config.GeneratedFiles contains package.json usually.
			// So it's safe to delete, it will be restored.
			// BUT `node_modules` depends on `package.json` logic.
			// If we preserve `node_modules`, we assume `package.json` hasn't changed fundamentally.
			// Let's just keep the heavy folders.
			
			os.RemoveAll(filepath.Join(container.WorkDir, name))
		}
	}

	// 2. Restore GeneratedFiles (including package.json, starter files etc)
	for filePath, content := range config.GeneratedFiles {
		fullPath := filepath.Join(container.WorkDir, filePath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err == nil {
			os.WriteFile(fullPath, []byte(content), 0644)
		}
	}

	// 3. chown workspace to 1000:1000 so next job can write
	if err := chownR(container.WorkDir, 1000, 1000); err != nil {
		m.logger.Warn("chown reset candidate workspace failed", "error", err)
	}
}

// resetTestWorkspace clears candidate code from test container
func (m *ChallengePoolManager) resetTestWorkspace(container *ChallengePooledContainer, config TestConfig) {
	// 1. Clean workspace
	entries, err := os.ReadDir(container.WorkDir)
	if err == nil {
		for _, entry := range entries {
			name := entry.Name()
			// Keep heavy dependency directories only.
			if name == "node_modules" || name == "venv" {
				continue
			}
			if err := os.RemoveAll(filepath.Join(container.WorkDir, name)); err != nil {
				m.logger.Warn("reset test workspace cleanup failed", "entry", name, "error", err)
			}
		}
	} else {
		m.logger.Warn("reset test workspace read failed", "error", err)
	}

	// 2. Restore Harness files
	for filePath, content := range config.Harness {
		fullPath := filepath.Join(container.WorkDir, filePath)
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err == nil {
			if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
				m.logger.Warn("reset test workspace harness write failed", "file", filePath, "error", err)
			}
		} else {
			m.logger.Warn("reset test workspace harness mkdir failed", "file", filePath, "error", err)
		}
	}

	// 3. Restore test files
	testsDir := filepath.Join(container.WorkDir, "__tests__")
	if err := os.MkdirAll(testsDir, 0755); err != nil {
		m.logger.Warn("reset test workspace tests mkdir failed", "error", err)
		return
	}
	if config.PublicTests != "" {
		if err := os.WriteFile(filepath.Join(testsDir, "public.test.js"), []byte(config.PublicTests), 0644); err != nil {
			m.logger.Warn("reset test workspace public tests write failed", "error", err)
		}
	}
	if config.HiddenTests != "" {
		if err := os.WriteFile(filepath.Join(testsDir, "hidden.test.js"), []byte(config.HiddenTests), 0644); err != nil {
			m.logger.Warn("reset test workspace hidden tests write failed", "error", err)
		}
	}

	// 4. chown workspace to 1000:1000 so next job can write
	if err := chownR(container.WorkDir, 1000, 1000); err != nil {
		m.logger.Warn("chown reset test workspace failed", "error", err)
	}
}

// Stats returns pool statistics
func (m *ChallengePoolManager) Stats() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	poolStats := make(map[string]interface{})
	for keyStr, pool := range m.pools {
		pool.mu.RLock()
		poolStats[keyStr] = map[string]int{
			"total":     len(pool.allConts),
			"available": len(pool.containers),
			"inUse":     len(pool.allConts) - len(pool.containers),
		}
		pool.mu.RUnlock()
	}

	return map[string]interface{}{
		"challengePools": poolStats,
		"networks": map[string]int{
			"total":     m.networkPool.Size(),
			"available": m.networkPool.Available(),
		},
	}
}

// Close shuts down all pools
func (m *ChallengePoolManager) Close(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.closed = true

	for keyStr, pool := range m.pools {
		// Mark pool as closed first to prevent sends on closed channel
		pool.mu.Lock()
		pool.closed = true
		pool.mu.Unlock()

		close(pool.containers)
		for container := range pool.containers {
			docker.SafeCleanup(ctx, container.Name, "")
			os.RemoveAll(container.WorkDir)
		}
		m.logger.Info("closed pool", "key", keyStr)
	}
	m.pools = make(map[string]*challengePool)

	return m.networkPool.Close(ctx)
}
