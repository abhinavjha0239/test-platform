package grader

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SQLContainer represents a running PostgreSQL container
type SQLContainer struct {
	ID          string
	ChallengeID string
	Port        int
	ConnString  string
	Pool        *pgxpool.Pool
	CreatedAt   time.Time
}

// SQLContainerPoolConfig configures the container pool
type SQLContainerPoolConfig struct {
	PoolSize        int           // Containers per challenge
	BaseImage       string        // e.g., "postgres:16-alpine"
	Password        string        // PostgreSQL password
	StartupTimeout  time.Duration // Time to wait for container startup
	MaxContainerAge time.Duration // Max age before recycling
	RemoteHost      string        // Remote host IP (empty = localhost)
}

// DefaultSQLContainerPoolConfig returns sensible defaults
func DefaultSQLContainerPoolConfig() SQLContainerPoolConfig {
	return SQLContainerPoolConfig{
		PoolSize:        3,
		BaseImage:       "postgres:16-alpine",
		Password:        "grader_test_password",
		StartupTimeout:  30 * time.Second,
		MaxContainerAge: 10 * time.Minute,
	}
}

// SQLContainerPool manages pre-baked PostgreSQL containers for isolated grading
type SQLContainerPool struct {
	mu         sync.Mutex
	containers map[string][]*SQLContainer // challengeID -> available containers
	config     SQLContainerPoolConfig
	docker     DockerClient
	createSem  chan struct{} // Semaphore to limit concurrent container creation
}

// DockerClient interface for container operations
type DockerClient interface {
	CreateContainer(ctx context.Context, image string, env map[string]string, port int) (string, error)
	StartContainer(ctx context.Context, containerID string) error
	StopContainer(ctx context.Context, containerID string) error
	RemoveContainer(ctx context.Context, containerID string) error
	WaitForHealthy(ctx context.Context, containerID string, timeout time.Duration) error
	GetContainerPort(ctx context.Context, containerID string, internalPort int) (int, error)
}

// NewSQLContainerPool creates a new container pool
func NewSQLContainerPool(config SQLContainerPoolConfig, docker DockerClient) *SQLContainerPool {
	return &SQLContainerPool{
		containers: make(map[string][]*SQLContainer),
		config:     config,
		docker:     docker,
		createSem:  make(chan struct{}, 3), // Max 3 concurrent container creations
	}
}

// Acquire gets a warm container or creates one on-demand
func (p *SQLContainerPool) Acquire(ctx context.Context, challengeID string) (*SQLContainer, error) {
	p.mu.Lock()

	// Check for available warm container
	if containers, ok := p.containers[challengeID]; ok && len(containers) > 0 {
		container := containers[0]
		p.containers[challengeID] = containers[1:]
		p.mu.Unlock()

		// Verify container is still healthy
		if time.Since(container.CreatedAt) < p.config.MaxContainerAge {
			if container.Pool != nil {
				if err := container.Pool.Ping(ctx); err == nil {
					return container, nil
				}
			}
		}

		// Container unhealthy, create new one
		go p.destroyContainer(context.Background(), container)
	} else {
		p.mu.Unlock()
	}

	// No warm container available, create on-demand
	return p.createContainer(ctx, challengeID)
}

// Release destroys the container - does NOT spawn replacements
// Replacement containers should be created by the refill loop or warmup
func (p *SQLContainerPool) Release(ctx context.Context, container *SQLContainer) {
	if container == nil {
		return
	}

	// Destroy synchronously in background (no replacement spawning)
	go p.destroyContainer(context.Background(), container)
}

// WarmupChallenge pre-creates containers for a challenge (uses semaphore)
func (p *SQLContainerPool) WarmupChallenge(ctx context.Context, challengeID string, count int) error {
	if count <= 0 {
		count = p.config.PoolSize
	}

	// Check current pool size first
	p.mu.Lock()
	currentSize := len(p.containers[challengeID])
	p.mu.Unlock()

	needed := count - currentSize
	if needed <= 0 {
		return nil // Pool already has enough containers
	}

	var wg sync.WaitGroup
	errChan := make(chan error, needed)

	// Create containers one at a time to avoid overwhelming Docker
	for i := 0; i < needed; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			container, err := p.createContainer(ctx, challengeID)
			if err != nil {
				errChan <- err
				return
			}

			p.mu.Lock()
			if len(p.containers[challengeID]) < count {
				p.containers[challengeID] = append(p.containers[challengeID], container)
			} else {
				// Pool filled while we were creating, destroy this one
				go p.destroyContainer(context.Background(), container)
			}
			p.mu.Unlock()
		}()
	}

	wg.Wait()
	close(errChan)

	// Return first error if any
	for err := range errChan {
		return err
	}

	return nil
}

// Shutdown cleans up all containers
func (p *SQLContainerPool) Shutdown(ctx context.Context) {
	p.mu.Lock()
	allContainers := make([]*SQLContainer, 0)
	for _, containers := range p.containers {
		allContainers = append(allContainers, containers...)
	}
	p.containers = make(map[string][]*SQLContainer)
	p.mu.Unlock()

	var wg sync.WaitGroup
	for _, container := range allContainers {
		wg.Add(1)
		go func(c *SQLContainer) {
			defer wg.Done()
			p.destroyContainer(ctx, c)
		}(container)
	}
	wg.Wait()
}

// Stats returns pool statistics
func (p *SQLContainerPool) Stats() map[string]int {
	p.mu.Lock()
	defer p.mu.Unlock()

	stats := make(map[string]int)
	for challengeID, containers := range p.containers {
		stats[challengeID] = len(containers)
	}
	return stats
}

// createContainer creates a new PostgreSQL container with challenge data
// Uses semaphore to limit concurrent Docker operations
func (p *SQLContainerPool) createContainer(ctx context.Context, challengeID string) (*SQLContainer, error) {
	// Acquire semaphore to limit concurrent container creation
	select {
	case p.createSem <- struct{}{}:
		defer func() { <-p.createSem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	if p.docker == nil {
		return nil, fmt.Errorf("docker client not configured")
	}

	env := map[string]string{
		"POSTGRES_PASSWORD": p.config.Password,
		"POSTGRES_USER":     "grader",
		"POSTGRES_DB":       "grader",
	}

	containerID, err := p.docker.CreateContainer(ctx, p.config.BaseImage, env, 5432)
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	if err := p.docker.StartContainer(ctx, containerID); err != nil {
		p.docker.RemoveContainer(ctx, containerID)
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// Wait for PostgreSQL to be ready
	if err := p.docker.WaitForHealthy(ctx, containerID, p.config.StartupTimeout); err != nil {
		p.docker.StopContainer(ctx, containerID)
		p.docker.RemoveContainer(ctx, containerID)
		return nil, fmt.Errorf("container not healthy: %w", err)
	}

	// Get mapped port
	port, err := p.docker.GetContainerPort(ctx, containerID, 5432)
	if err != nil {
		p.docker.StopContainer(ctx, containerID)
		p.docker.RemoveContainer(ctx, containerID)
		return nil, fmt.Errorf("failed to get container port: %w", err)
	}

	// Use remote host if configured, otherwise localhost
	host := "localhost"
	if p.config.RemoteHost != "" {
		host = p.config.RemoteHost
	}
	connString := fmt.Sprintf("postgres://grader:%s@%s:%d/grader?sslmode=disable",
		p.config.Password, host, port)

	// Create connection pool
	poolConfig, _ := pgxpool.ParseConfig(connString)
	poolConfig.MaxConns = 2

	var pool *pgxpool.Pool
	// Wait for DB to be ready to accept connections
	deadline := time.Now().Add(p.config.StartupTimeout)
	for {
		var err error
		pool, err = pgxpool.NewWithConfig(ctx, poolConfig)
		if err == nil {
			if err := pool.Ping(ctx); err == nil {
				// Connection successful and DB ready
				break
			}
			pool.Close()
		}

		if time.Now().After(deadline) {
			p.docker.StopContainer(ctx, containerID)
			p.docker.RemoveContainer(ctx, containerID)
			return nil, fmt.Errorf("failed to connect to container after timeout: %v", err)
		}
		time.Sleep(1 * time.Second)
	}

	return &SQLContainer{
		ID:          containerID,
		ChallengeID: challengeID,
		Port:        port,
		ConnString:  connString,
		Pool:        pool,
		CreatedAt:   time.Now(),
	}, nil
}

// destroyContainer cleans up a container
func (p *SQLContainerPool) destroyContainer(ctx context.Context, container *SQLContainer) {
	if container == nil {
		return
	}

	if container.Pool != nil {
		container.Pool.Close()
	}

	if p.docker != nil {
		p.docker.StopContainer(ctx, container.ID)
		p.docker.RemoveContainer(ctx, container.ID)
	}
}
