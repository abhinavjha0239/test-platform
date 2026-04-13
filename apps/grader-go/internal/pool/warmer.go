package pool

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	warmupChannel = "pool:warmup"
	warmupStatusKeyPrefix = "pool:warmup:status:"
	warmupLockKeyPrefix   = "pool:warmup:lock:"
	warmupLockDuration    = 5 * time.Minute
)

// WarmupRequest is sent via Redis pub/sub to trigger pool warming
type WarmupRequest struct {
	ExamID             string `json:"examId"`
	ExpectedCandidates int    `json:"expectedCandidates"`
	StartsAt           int64  `json:"startsAt"`  // Unix ms
	ChallengeCount     int    `json:"challengeCount"`
	RunnerModes        []string `json:"runnerModes,omitempty"`
}

// WarmupStatus tracks warmup progress
type WarmupStatus struct {
	ExamID         string `json:"examId"`
	Status         string `json:"status"` // pending, warming, complete, failed
	ContainersReady int   `json:"containersReady"`
	NetworksReady   int   `json:"networksReady"`
	StartedAt      int64  `json:"startedAt"`
	CompletedAt    int64  `json:"completedAt,omitempty"`
	Error          string `json:"error,omitempty"`
}

// PoolManager coordinates container and network pools
type PoolManager struct {
	containerPool *ContainerPool
	networkPool   *NetworkPool
	redis         *redis.Client
	logger        *slog.Logger
	mu            sync.RWMutex
}

// NewPoolManager creates a pool manager
func NewPoolManager(containerPool *ContainerPool, networkPool *NetworkPool, redisClient *redis.Client) *PoolManager {
	return &PoolManager{
		containerPool: containerPool,
		networkPool:   networkPool,
		redis:         redisClient,
		logger:        slog.Default().With("component", "poolmgr"),
	}
}

// SubscribeWarmup listens for warmup requests on Redis pub/sub
func (m *PoolManager) SubscribeWarmup(ctx context.Context) error {
	pubsub := m.redis.Subscribe(ctx, warmupChannel)
	defer pubsub.Close()

	m.logger.Info("subscribed to warmup channel", "channel", warmupChannel)

	for {
		select {
		case <-ctx.Done():
			return nil
		case msg := <-pubsub.Channel():
			var req WarmupRequest
			if err := json.Unmarshal([]byte(msg.Payload), &req); err != nil {
				m.logger.Warn("invalid warmup request", "error", err)
				continue
			}

			go func(r WarmupRequest) {
				if err := m.handleWarmup(ctx, r); err != nil {
					m.logger.Error("warmup failed", "examID", r.ExamID, "error", err)
				}
			}(req)
		}
	}
}

// handleWarmup processes a warmup request
func (m *PoolManager) handleWarmup(ctx context.Context, req WarmupRequest) error {
	lockKey := warmupLockKeyPrefix + req.ExamID
	statusKey := warmupStatusKeyPrefix + req.ExamID

	// Try to acquire lock
	acquired, err := m.redis.SetNX(ctx, lockKey, "1", warmupLockDuration).Result()
	if err != nil {
		return fmt.Errorf("lock error: %w", err)
	}
	if !acquired {
		m.logger.Info("warmup for exam already in progress", "examID", req.ExamID)
		return nil
	}
	defer m.redis.Del(ctx, lockKey)

	// Update status
	status := WarmupStatus{
		ExamID:    req.ExamID,
		Status:    "warming",
		StartedAt: time.Now().UnixMilli(),
	}
	m.setStatus(ctx, statusKey, status)

	m.logger.Info("starting warmup", "examID", req.ExamID, "expectedCandidates", req.ExpectedCandidates)

	// Calculate pool sizes
	containerCount := m.calculatePoolSize(req.ExpectedCandidates, req.ChallengeCount)
	networkCount := containerCount // 1 network per container pair

	// Warm containers
	if err := m.containerPool.Warm(ctx, containerCount); err != nil {
		status.Status = "failed"
		status.Error = err.Error()
		m.setStatus(ctx, statusKey, status)
		return err
	}
	status.ContainersReady = m.containerPool.Size()

	// Warm networks
	if err := m.networkPool.Warm(ctx, networkCount); err != nil {
		status.Status = "failed"
		status.Error = err.Error()
		m.setStatus(ctx, statusKey, status)
		return err
	}
	status.NetworksReady = m.networkPool.Size()

	// Complete
	status.Status = "complete"
	status.CompletedAt = time.Now().UnixMilli()
	m.setStatus(ctx, statusKey, status)

	m.logger.Info("warmup complete", "examID", req.ExamID, "containers", status.ContainersReady, "networks", status.NetworksReady)

	return nil
}

// calculatePoolSize determines optimal pool size based on expected load
func (m *PoolManager) calculatePoolSize(candidates, challenges int) int {
	// Formula: candidates * submission_rate * avg_challenges
	// Assuming each candidate submits ~5 times per challenge
	// and we want to handle 30% of candidates simultaneously
	submissionRate := 5
	concurrencyRate := 0.3

	estimated := int(float64(candidates) * concurrencyRate * float64(submissionRate))

	// Clamp to reasonable bounds
	minPool := 5
	maxPool := 50

	if estimated < minPool {
		return minPool
	}
	if estimated > maxPool {
		return maxPool
	}
	return estimated
}

// setStatus updates warmup status in Redis
func (m *PoolManager) setStatus(ctx context.Context, key string, status WarmupStatus) {
	data, _ := json.Marshal(status)
	m.redis.Set(ctx, key, data, 24*time.Hour)
}

// GetStatus retrieves warmup status for an exam
func (m *PoolManager) GetStatus(ctx context.Context, examID string) (*WarmupStatus, error) {
	key := warmupStatusKeyPrefix + examID
	data, err := m.redis.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var status WarmupStatus
	if err := json.Unmarshal([]byte(data), &status); err != nil {
		return nil, err
	}
	return &status, nil
}

// Stats returns current pool statistics
func (m *PoolManager) Stats() map[string]interface{} {
	return map[string]interface{}{
		"containers": map[string]int{
			"total":     m.containerPool.Size(),
			"available": m.containerPool.Available(),
		},
		"networks": map[string]int{
			"total":     m.networkPool.Size(),
			"available": m.networkPool.Available(),
			"inUse":     m.networkPool.InUse(),
		},
	}
}

// AcquireResources gets a network for a grading job
// Note: Container pooling is disabled - graders create ephemeral containers
// because each job needs different code/dependencies/images
func (m *PoolManager) AcquireResources(ctx context.Context) (interface{}, string, error) {
	network, err := m.networkPool.Acquire(ctx)
	if err != nil {
		return nil, "", fmt.Errorf("network acquire failed: %w", err)
	}

	// Container pooling disabled - return nil container
	// Each grading job creates its own ephemeral container with specific code/deps
	return nil, network, nil
}

// ReleaseResources returns both container and network to pools
func (m *PoolManager) ReleaseResources(ctx context.Context, containerInterface interface{}, network string) {
	if containerInterface != nil {
		if container, ok := containerInterface.(*PooledContainer); ok {
			m.containerPool.Release(ctx, container)
		}
	}
	if network != "" {
		m.networkPool.Release(ctx, network)
	}
}

// Close shuts down all pools
func (m *PoolManager) Close(ctx context.Context) error {
	var errs []error

	if err := m.containerPool.Close(ctx); err != nil {
		errs = append(errs, err)
	}
	if err := m.networkPool.Close(ctx); err != nil {
		errs = append(errs, err)
	}

	if len(errs) > 0 {
		return fmt.Errorf("close errors: %v", errs)
	}
	return nil
}

// Cleanup removes orphan resources from previous runs
func (m *PoolManager) Cleanup(ctx context.Context) error {
	return m.networkPool.CleanupOrphans(ctx)
}
