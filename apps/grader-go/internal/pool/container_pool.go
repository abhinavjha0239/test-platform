package pool

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

// PooledContainer represents a container in the pool
type PooledContainer struct {
	ID           string
	Name         string
	WorkDir      string
	Network      string
	Image        string
	Runtime      string
	CreatedAt    time.Time
	LastUsedAt   time.Time
	InUse        bool
	DepsHash     string
	mu           sync.Mutex
}

// PoolConfig holds pool configuration
type PoolConfig struct {
	MaxSize          int
	MinSize          int
	AcquireTimeout   time.Duration
	IdleTimeout      time.Duration
	ValidationInterval time.Duration
	Image            string
	WorkDirBase      string
	Runtime          string
}

// DefaultPoolConfig returns sensible defaults
func DefaultPoolConfig() PoolConfig {
	return PoolConfig{
		MaxSize:          10,
		MinSize:          2,
		AcquireTimeout:   30 * time.Second,
		IdleTimeout:      5 * time.Minute,
		ValidationInterval: 30 * time.Second,
		WorkDirBase:      "/tmp/grader-pool",
	}
}

// ContainerPool manages a pool of reusable containers
type ContainerPool struct {
	config     PoolConfig
	containers chan *PooledContainer
	allConts   map[string]*PooledContainer
	mu         sync.RWMutex
	logger     *slog.Logger
	closed     bool
	wg         sync.WaitGroup
}

// NewContainerPool creates a new container pool
func NewContainerPool(config PoolConfig) *ContainerPool {
	if config.MaxSize <= 0 {
		config.MaxSize = 10
	}
	if config.MinSize < 0 {
		config.MinSize = 0
	}
	if config.AcquireTimeout <= 0 {
		config.AcquireTimeout = 30 * time.Second
	}
	if config.WorkDirBase == "" {
		config.WorkDirBase = "/tmp/grader-pool"
	}

	return &ContainerPool{
		config:     config,
		containers: make(chan *PooledContainer, config.MaxSize),
		allConts:   make(map[string]*PooledContainer),
		logger:     slog.Default().With("component", "pool"),
	}
}

// Acquire gets a container from the pool or creates a new one
func (p *ContainerPool) Acquire(ctx context.Context) (*PooledContainer, error) {
	p.mu.RLock()
	if p.closed {
		p.mu.RUnlock()
		return nil, fmt.Errorf("pool is closed")
	}
	p.mu.RUnlock()

	// Try to get from pool first (non-blocking)
	select {
	case container := <-p.containers:
		if p.validateContainer(ctx, container) {
			container.mu.Lock()
			container.InUse = true
			container.LastUsedAt = time.Now()
			container.mu.Unlock()
			return container, nil
		}
		// Container invalid, destroy and try again
		p.destroyContainer(ctx, container)
	default:
		// No container available
	}

	// Check if we can create a new one
	p.mu.Lock()
	if len(p.allConts) >= p.config.MaxSize {
		p.mu.Unlock()
		// Wait for one to become available
		select {
		case container := <-p.containers:
			if p.validateContainer(ctx, container) {
				container.mu.Lock()
				container.InUse = true
				container.LastUsedAt = time.Now()
				container.mu.Unlock()
				return container, nil
			}
			p.destroyContainer(ctx, container)
			// Fall through to create new
		case <-time.After(p.config.AcquireTimeout):
			return nil, fmt.Errorf("acquire timeout: no container available")
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		p.mu.Lock()
	}
	p.mu.Unlock()

	// Create a new container
	container, err := p.createContainer(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	p.mu.Lock()
	p.allConts[container.Name] = container
	p.mu.Unlock()

	return container, nil
}

// Release returns a container to the pool
func (p *ContainerPool) Release(ctx context.Context, container *PooledContainer) error {
	if container == nil {
		return nil
	}

	container.mu.Lock()
	container.InUse = false
	container.LastUsedAt = time.Now()
	container.mu.Unlock()

	// Validate container is still running
	if !p.validateContainer(ctx, container) {
		p.logger.Info("destroying invalid container", "name", container.Name)
		p.destroyContainer(ctx, container)
		return nil
	}

	// Reset the container workspace (but don't destroy on minor errors)
	if err := p.resetContainer(ctx, container); err != nil {
		p.logger.Warn("reset warning, keeping container", "name", container.Name, "error", err)
		// Continue - don't destroy just because reset had issues
	}

	// Try to return to pool
	select {
	case p.containers <- container:
		p.logger.Info("returned container to pool", "name", container.Name, "available", len(p.containers))
	default:
		// Pool is full, destroy extra container
		p.logger.Info("pool full, destroying extra container", "name", container.Name)
		p.destroyContainer(ctx, container)
	}

	return nil
}

// createContainer creates a new pooled container with a running Docker container
func (p *ContainerPool) createContainer(ctx context.Context) (*PooledContainer, error) {
	name := fmt.Sprintf("grader_pool_%d_%d", os.Getpid(), time.Now().UnixNano())
	workDir := filepath.Join(p.config.WorkDirBase, name)

	// Create work directory
	if err := os.MkdirAll(workDir, 0777); err != nil {
		return nil, fmt.Errorf("failed to create workdir: %w", err)
	}

	image := p.config.Image
	if image == "" {
		image = "node:20-alpine" // Default image
	}

	// Start actual Docker container in detached mode with keep-alive
	err := docker.RunDetached(ctx, docker.RunDetachedOptions{
		Name:             name,
		Network:          "bridge",
		Image:            image,
		WorkDir:          workDir,
		ContainerWorkDir: "/app",
		Command:          "tail -f /dev/null", // Keep container alive
		Env:              map[string]string{"NODE_ENV": "test"},
		MemoryLimitMb:    512,
		Runtime:          p.config.Runtime,
		Timeout:          30 * time.Second,
	})
	if err != nil {
		os.RemoveAll(workDir)
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// Get container ID
	result, err := docker.Exec(ctx, []string{"inspect", "-f", "{{.Id}}", name}, 5*time.Second)
	containerID := ""
	if err == nil {
		containerID = strings.TrimSpace(result.Stdout)
	}

	container := &PooledContainer{
		ID:         containerID,
		Name:       name,
		WorkDir:    workDir,
		Image:      image,
		Runtime:    p.config.Runtime,
		CreatedAt:  time.Now(),
		LastUsedAt: time.Now(),
		InUse:      true,
	}

	idShort := containerID
	if len(idShort) > 12 {
		idShort = idShort[:12]
	}
	p.logger.Info("created container", "name", name, "dockerID", idShort, "workDir", workDir)
	return container, nil
}

// validateContainer checks if a container is still running and usable
func (p *ContainerPool) validateContainer(ctx context.Context, container *PooledContainer) bool {
	if container == nil {
		return false
	}

	// Check if workdir still exists
	if _, err := os.Stat(container.WorkDir); os.IsNotExist(err) {
		return false
	}

	// Check idle timeout
	if time.Since(container.LastUsedAt) > p.config.IdleTimeout {
		return false
	}

	// Check if Docker container is still running
	result, err := docker.Exec(ctx, []string{"inspect", "-f", "{{.State.Running}}", container.Name}, 5*time.Second)
	if err != nil {
		return false
	}
	if strings.TrimSpace(result.Stdout) != "true" {
		return false
	}

	return true
}

// resetContainer cleans up a container workspace for reuse
func (p *ContainerPool) resetContainer(ctx context.Context, container *PooledContainer) error {
	// Clean the work directory on host
	entries, err := os.ReadDir(container.WorkDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		// Keep node_modules for dependency caching
		if entry.Name() == "node_modules" {
			continue
		}
		path := filepath.Join(container.WorkDir, entry.Name())
		if err := os.RemoveAll(path); err != nil {
			return fmt.Errorf("failed to clean %s: %w", path, err)
		}
	}

	// Don't clear DepsHash - keep it for caching
	// container.DepsHash stays the same if node_modules is preserved
	return nil
}

// destroyContainer removes a container from the pool
func (p *ContainerPool) destroyContainer(ctx context.Context, container *PooledContainer) {
	if container == nil {
		return
	}

	p.mu.Lock()
	delete(p.allConts, container.Name)
	p.mu.Unlock()

	// Clean up workdir
	if container.WorkDir != "" {
		os.RemoveAll(container.WorkDir)
	}

	// Stop any running container with this name
	docker.SafeCleanup(ctx, container.Name, "")

	p.logger.Info("destroyed container", "name", container.Name)
}

// Warm pre-creates containers up to minSize
func (p *ContainerPool) Warm(ctx context.Context, count int) error {
	if count <= 0 {
		count = p.config.MinSize
	}
	if count > p.config.MaxSize {
		count = p.config.MaxSize
	}

	p.mu.RLock()
	currentSize := len(p.allConts)
	p.mu.RUnlock()

	toCreate := count - currentSize
	if toCreate <= 0 {
		return nil
	}

	p.logger.Info("warming pool", "count", toCreate)

	for i := 0; i < toCreate; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		container, err := p.createContainer(ctx)
		if err != nil {
			p.logger.Warn("warm create failed", "error", err)
			continue
		}

		container.InUse = false

		p.mu.Lock()
		p.allConts[container.Name] = container
		p.mu.Unlock()

		select {
		case p.containers <- container:
		default:
			p.destroyContainer(ctx, container)
		}
	}

	return nil
}

// Size returns current pool size
func (p *ContainerPool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.allConts)
}

// Available returns number of available containers
func (p *ContainerPool) Available() int {
	return len(p.containers)
}

// Close shuts down the pool
func (p *ContainerPool) Close(ctx context.Context) error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	p.mu.Unlock()

	// Drain and destroy all containers
	close(p.containers)
	for container := range p.containers {
		p.destroyContainer(ctx, container)
	}

	// Destroy any remaining
	p.mu.Lock()
	for _, container := range p.allConts {
		p.destroyContainer(ctx, container)
	}
	p.allConts = make(map[string]*PooledContainer)
	p.mu.Unlock()

	p.logger.Info("pool closed")
	return nil
}

// PreInstallDependencies installs dependencies in a container
func (p *ContainerPool) PreInstallDependencies(ctx context.Context, container *PooledContainer, depsHash, installCmd, image string) error {
	if container.DepsHash == depsHash {
		// Already installed
		return nil
	}

	// Run install command in container
	_, err := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             container.Name + "_install",
		Network:          "bridge",
		Image:            image,
		WorkDir:          container.WorkDir,
		ContainerWorkDir: "/app",
		Command:          installCmd,
		MemoryLimitMb:    1024,
		Timeout:          5 * time.Minute,
	})
	if err != nil {
		return fmt.Errorf("dependency install failed: %w", err)
	}

	container.DepsHash = depsHash
	return nil
}

// RecoverExisting finds running grader_pool_* containers and adopts them into the pool
// This should be called on startup before Warm() to reuse existing containers
func (p *ContainerPool) RecoverExisting(ctx context.Context) (int, error) {
	// List all running containers matching our naming pattern
	result, err := docker.Exec(ctx, []string{
		"ps", "-a", "--filter", "name=grader_pool_", "--format", "{{.Names}}\t{{.State}}",
	}, 10*time.Second)
	if err != nil {
		return 0, fmt.Errorf("failed to list containers: %w", err)
	}

	output := strings.TrimSpace(result.Stdout)
	if output == "" {
		return 0, nil
	}

	recovered := 0
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		state := strings.TrimSpace(parts[1])

		// Only recover running containers
		if state != "running" {
			// Remove stopped containers
			p.logger.Info("removing stopped container", "name", name)
			docker.SafeCleanup(ctx, name, "")
			continue
		}

		// Check if workdir exists
		workDir := filepath.Join(p.config.WorkDirBase, name)
		if _, err := os.Stat(workDir); os.IsNotExist(err) {
			// Recreate workdir if missing
			if err := os.MkdirAll(workDir, 0777); err != nil {
				p.logger.Warn("failed to recreate workdir", "name", name, "error", err)
				docker.SafeCleanup(ctx, name, "")
				continue
			}
		}

		// Get container ID
		idResult, _ := docker.Exec(ctx, []string{"inspect", "-f", "{{.Id}}", name}, 5*time.Second)
		containerID := strings.TrimSpace(idResult.Stdout)

		container := &PooledContainer{
			ID:         containerID,
			Name:       name,
			WorkDir:    workDir,
			Image:      p.config.Image,
			Runtime:    p.config.Runtime,
			CreatedAt:  time.Now(),
			LastUsedAt: time.Now(),
			InUse:      false,
		}

		p.mu.Lock()
		// Check capacity
		if len(p.allConts) >= p.config.MaxSize {
			p.mu.Unlock()
			p.logger.Info("pool full, removing excess container", "name", name)
			docker.SafeCleanup(ctx, name, "")
			os.RemoveAll(workDir)
			continue
		}
		p.allConts[name] = container
		p.mu.Unlock()

		// Try to add to available pool
		select {
		case p.containers <- container:
			recovered++
			idShort := containerID
			if len(idShort) > 12 {
				idShort = idShort[:12]
			}
			p.logger.Info("recovered container", "name", name, "dockerID", idShort)
		default:
			// Channel full
		}
	}

	if recovered > 0 {
		p.logger.Info("recovered existing containers", "count", recovered)
	}
	return recovered, nil
}
