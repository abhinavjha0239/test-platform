package grader

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// CleanupPool provides bounded async cleanup for grading jobs.
// Instead of blocking the grading semaphore while running docker rm,
// network disconnect, and os.RemoveAll, graders submit cleanup work
// to this pool. The pool limits concurrent cleanup operations to
// prevent overwhelming the Docker daemon.
type CleanupPool struct {
	sem    chan struct{}
	wg     sync.WaitGroup
	logger *slog.Logger
}

// NewCleanupPool creates a pool with maxConcurrent parallel cleanup goroutines.
// Recommended: 5-10 for a single grader VM.
func NewCleanupPool(maxConcurrent int) *CleanupPool {
	if maxConcurrent < 1 {
		maxConcurrent = 5
	}
	return &CleanupPool{
		sem:    make(chan struct{}, maxConcurrent),
		logger: slog.Default().With("component", "cleanup-pool"),
	}
}

// Submit enqueues a cleanup function to run asynchronously.
// The function receives a fresh context with a 30-second timeout
// (the original grading context may already be cancelled).
// Submit returns immediately — it never blocks the caller.
func (p *CleanupPool) Submit(fn func(ctx context.Context)) {
	p.wg.Add(1)
	go func() {
		defer p.wg.Done()

		// Acquire semaphore slot (blocks if pool is full)
		p.sem <- struct{}{}
		defer func() { <-p.sem }()

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		defer func() {
			if r := recover(); r != nil {
				p.logger.Error("cleanup panic", "error", r)
			}
		}()

		fn(ctx)
	}()
}

// Wait blocks until all submitted cleanup tasks finish.
// Call this during graceful shutdown.
func (p *CleanupPool) Wait() {
	p.wg.Wait()
}
