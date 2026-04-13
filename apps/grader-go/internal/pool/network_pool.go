package pool

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

const (
	networkPrefix     = "grader_net_"
	maxNetworks       = 50
	networkAcquireTimeout = 10 * time.Second
)

// NetworkPool manages isolated Docker networks to prevent exhaustion
type NetworkPool struct {
	available chan string
	inUse     map[string]bool
	mu        sync.RWMutex
	maxSize   int
	logger    *slog.Logger
	closed    bool
}

// NewNetworkPool creates a network pool
func NewNetworkPool(maxSize int) *NetworkPool {
	if maxSize <= 0 {
		maxSize = maxNetworks
	}

	return &NetworkPool{
		available: make(chan string, maxSize),
		inUse:     make(map[string]bool),
		maxSize:   maxSize,
		logger:    slog.Default().With("component", "netpool"),
	}
}

// Acquire gets an available network or creates one
func (p *NetworkPool) Acquire(ctx context.Context) (string, error) {
	p.mu.RLock()
	if p.closed {
		p.mu.RUnlock()
		return "", fmt.Errorf("network pool is closed")
	}
	p.mu.RUnlock()

	// Try to get from pool (non-blocking)
	select {
	case network := <-p.available:
		p.mu.Lock()
		p.inUse[network] = true
		p.mu.Unlock()
		return network, nil
	default:
	}

	// Check if we can create a new one
	p.mu.Lock()
	totalCount := len(p.inUse) + len(p.available)
	if totalCount >= p.maxSize {
		p.mu.Unlock()
		// Wait for one to become available
		select {
		case network := <-p.available:
			p.mu.Lock()
			p.inUse[network] = true
			p.mu.Unlock()
			return network, nil
		case <-time.After(networkAcquireTimeout):
			return "", fmt.Errorf("network acquire timeout: all %d networks in use", p.maxSize)
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	p.mu.Unlock()

	// Create a new network
	network, err := p.createNetwork(ctx)
	if err != nil {
		return "", err
	}

	p.mu.Lock()
	p.inUse[network] = true
	p.mu.Unlock()

	return network, nil
}

// Release returns a network to the pool
func (p *NetworkPool) Release(ctx context.Context, network string) error {
	if network == "" {
		return nil
	}

	p.mu.Lock()
	delete(p.inUse, network)
	p.mu.Unlock()

	// Try to return to pool
	select {
	case p.available <- network:
		// Successfully returned
	default:
		// Pool is full, destroy the network
		if err := docker.RemoveNetwork(ctx, network); err != nil {
			p.logger.Warn("failed to remove network", "name", network, "error", err)
		}
	}

	return nil
}

// createNetwork creates a new isolated Docker network
func (p *NetworkPool) createNetwork(ctx context.Context) (string, error) {
	name := fmt.Sprintf("%s%d_%d", networkPrefix, os.Getpid(), time.Now().UnixNano())

	if err := docker.CreateNetwork(ctx, name); err != nil {
		return "", fmt.Errorf("failed to create network %s: %w", name, err)
	}

	p.logger.Info("created network", "name", name)
	return name, nil
}

// Warm pre-creates networks
func (p *NetworkPool) Warm(ctx context.Context, count int) error {
	if count <= 0 {
		count = 5 // default warmup
	}
	if count > p.maxSize {
		count = p.maxSize
	}

	p.mu.RLock()
	currentSize := len(p.inUse) + len(p.available)
	p.mu.RUnlock()

	toCreate := count - currentSize
	if toCreate <= 0 {
		return nil
	}

	p.logger.Info("warming network pool", "count", toCreate)

	for i := 0; i < toCreate; i++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		network, err := p.createNetwork(ctx)
		if err != nil {
			p.logger.Warn("warm create failed", "error", err)
			continue
		}

		select {
		case p.available <- network:
		default:
			docker.RemoveNetwork(ctx, network)
		}
	}

	return nil
}

// Size returns total networks (available + in use)
func (p *NetworkPool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.inUse) + len(p.available)
}

// Available returns number of available networks
func (p *NetworkPool) Available() int {
	return len(p.available)
}

// InUse returns number of networks currently in use
func (p *NetworkPool) InUse() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.inUse)
}

// Close cleans up all networks
func (p *NetworkPool) Close(ctx context.Context) error {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil
	}
	p.closed = true
	p.mu.Unlock()

	// Drain available
	close(p.available)
	for network := range p.available {
		docker.RemoveNetwork(ctx, network)
	}

	// Clean up in-use (shouldn't happen normally)
	p.mu.Lock()
	for network := range p.inUse {
		docker.RemoveNetwork(ctx, network)
	}
	p.inUse = make(map[string]bool)
	p.mu.Unlock()

	p.logger.Info("network pool closed")
	return nil
}

// CleanupOrphans removes stale networks from previous runs
func (p *NetworkPool) CleanupOrphans(ctx context.Context) error {
	result, err := docker.Exec(ctx, []string{
		"network", "ls",
		"--filter", fmt.Sprintf("name=%s", networkPrefix),
		"--format", "{{.Name}}",
	}, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to list networks: %w", err)
	}

	networks := splitLines(result.Stdout)
	for _, network := range networks {
		if network == "" {
			continue
		}
		p.logger.Info("cleaning orphan network", "name", network)
		docker.RemoveNetwork(ctx, network)
	}

	return nil
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			if i > start {
				lines = append(lines, s[start:i])
			}
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}
