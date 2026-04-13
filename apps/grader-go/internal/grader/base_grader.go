package grader

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

// GradeSession holds resources for a single grading run
// All graders should use this for consistent pool handling
type GradeSession struct {
	ctx           context.Context
	gctx          *GraderContext
	attemptID     string
	testType      string
	timestamp     int64
	suffix        string

	// Directories
	CandidateDir string
	TestsDir     string

	// Docker resources
	Network       string
	networkPooled bool
	ContainerName string

	// Cleanup tracking
	cleanedUp bool
}

// SessionConfig configures a new grading session
type SessionConfig struct {
	AttemptID string
	TestType  string  // "public" or "hidden"
	DirPrefix string  // e.g., "grader_bb", "grader_pw", "grader_ui"
}

// NewGradeSession creates a new grading session with pool resources
func NewGradeSession(ctx context.Context, gctx *GraderContext, cfg SessionConfig) (*GradeSession, error) {
	timestamp := time.Now().UnixMilli()
	suffix := randomSuffix(6)

	session := &GradeSession{
		ctx:       ctx,
		gctx:      gctx,
		attemptID: cfg.AttemptID,
		testType:  cfg.TestType,
		timestamp: timestamp,
		suffix:    suffix,
	}

	// Create temp directories
	session.CandidateDir = filepath.Join(os.TempDir(), fmt.Sprintf("%s_%s_cand_%s_%d_%s", cfg.DirPrefix, cfg.TestType, cfg.AttemptID, timestamp, suffix))
	session.TestsDir = filepath.Join(os.TempDir(), fmt.Sprintf("%s_%s_tests_%s_%d_%s", cfg.DirPrefix, cfg.TestType, cfg.AttemptID, timestamp, suffix))
	session.ContainerName = sanitizeDockerName(fmt.Sprintf("grader_cand_%s_%s_%d_%s", cfg.AttemptID, cfg.TestType, timestamp, suffix))

	// Try to acquire network from pool
	if gctx != nil && gctx.UsePooling && gctx.PoolManager != nil {
		_, network, err := gctx.PoolManager.AcquireResources(ctx)
		if err == nil && network != "" {
			session.Network = network
			session.networkPooled = true
		}
	}

	return session, nil
}

// EnsureNetwork creates a network if not already acquired from pool
func (s *GradeSession) EnsureNetwork() error {
	if s.Network != "" {
		return nil // Already have network from pool
	}

	// Fallback: create ephemeral network
	s.Network = sanitizeDockerName(fmt.Sprintf("grader_net_%s_%d_%s", s.attemptID, s.timestamp, s.suffix))
	if err := docker.CreateNetwork(s.ctx, s.Network); err != nil {
		return fmt.Errorf("failed to create network: %w", err)
	}

	return nil
}

// Cleanup releases all resources back to pools or deletes them
func (s *GradeSession) Cleanup() {
	if s.cleanedUp {
		return
	}
	s.cleanedUp = true

	// Stop container
	_ = docker.SafeCleanup(s.ctx, s.ContainerName, "")

	// Release or delete network
	if s.networkPooled && s.gctx != nil && s.gctx.PoolManager != nil {
		s.gctx.PoolManager.ReleaseResources(s.ctx, nil, s.Network)
	} else if s.Network != "" {
		_ = docker.RemoveNetwork(s.ctx, s.Network)
	}

	// Clean temp directories
	_ = os.RemoveAll(s.CandidateDir)
	_ = os.RemoveAll(s.TestsDir)
}

// IsPooled returns true if resources were acquired from pool
func (s *GradeSession) IsPooled() bool {
	return s.networkPooled
}

// RunCandidateContainer starts the candidate server in detached mode
func (s *GradeSession) RunCandidateContainer(opts CandidateRunOptions) error {
	if err := s.EnsureNetwork(); err != nil {
		return err
	}

	return docker.RunDetached(s.ctx, docker.RunDetachedOptions{
		Name:             s.ContainerName,
		Network:          s.Network,
		Alias:            "candidate",
		Image:            opts.Image,
		WorkDir:          s.CandidateDir,
		ContainerWorkDir: opts.WorkDir,
		Command:          "set -e; " + opts.Command,
		Env:              opts.Env,
		MemoryLimitMb:    opts.MemoryLimitMb,
		Runtime:          normalizeRuntime(opts.Runtime),
		Timeout:          opts.Timeout,
	})
}

// CandidateRunOptions for running the candidate container
type CandidateRunOptions struct {
	Image         string
	WorkDir       string
	Command       string
	Env           map[string]string
	MemoryLimitMb int
	Runtime       string
	Timeout       time.Duration
}

// RunTestContainer runs a test container (install or test phase)
func (s *GradeSession) RunTestContainer(opts TestRunOptions) (string, error) {
	network := opts.Network
	if network == "" {
		network = s.Network
	}

	return docker.RunOnce(s.ctx, docker.RunOnceOptions{
		Name:             "",
		Network:          network,
		Image:            opts.Image,
		WorkDir:          opts.WorkDir,
		ContainerWorkDir: opts.ContainerWorkDir,
		Command:          opts.Command,
		Env:              opts.Env,
		MemoryLimitMb:    opts.MemoryLimitMb,
		Runtime:          opts.Runtime,
		Timeout:          opts.Timeout,
	})
}

// TestRunOptions for running test containers
type TestRunOptions struct {
	Image            string
	WorkDir          string
	ContainerWorkDir string
	Command          string
	Env              map[string]string
	MemoryLimitMb    int
	Runtime          string
	Timeout          time.Duration
	Network          string // Optional override, uses session network if empty
}

// WaitForCandidate waits for the candidate server to be ready
func (s *GradeSession) WaitForCandidate(port int, healthPath string, timeoutMs int) (string, error) {
	return waitForHTTP(s.ctx, s.ContainerName, port, healthPath, timeoutMs)
}

// GetCandidateLogs retrieves logs from the candidate container
func (s *GradeSession) GetCandidateLogs(timeout time.Duration) string {
	return getContainerLogs(s.ctx, s.ContainerName, timeout)
}

// IsCandidateRunning checks if candidate container is running
func (s *GradeSession) IsCandidateRunning() bool {
	if inspect, err := docker.Exec(s.ctx, []string{"inspect", "-f", "{{.State.Running}}", s.ContainerName}, 5*time.Second); err == nil {
		return strings.TrimSpace(inspect.Stdout) == "true"
	}
	return false
}
