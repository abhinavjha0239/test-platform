package grader

import (
	"context"
	"fmt"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/pool"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

// PoolManager interface for container/network pool management
type PoolManager interface {
	AcquireResources(ctx context.Context) (interface{}, string, error)
	ReleaseResources(ctx context.Context, container interface{}, network string)
	Stats() map[string]interface{}
}

// ChallengePoolManager interface for challenge-aware container pooling
type ChallengePoolManager interface {
	// Core pool operations
	AcquireForChallenge(ctx context.Context, challengeID, containerType, hash string) (*pool.ChallengePooledContainer, error)
	ReleaseForChallenge(ctx context.Context, container *pool.ChallengePooledContainer) error
	
	// Convenience methods for graders (acquire or create on-demand)
	GetOrCreateCandidate(ctx context.Context, challengeID string, config pool.CandidateConfig) (*pool.ChallengePooledContainer, error)
	GetOrCreateTest(ctx context.Context, challengeID string, config pool.TestConfig) (*pool.ChallengePooledContainer, error)
	
	// Network pool
	AcquireNetwork(ctx context.Context) (string, error)
	ReleaseNetwork(ctx context.Context, network string)
	
	// Management
	WarmupChallenge(ctx context.Context, config pool.ChallengeConfig, count int) error
	Stats() map[string]interface{}
}

// GraderContext holds dependencies for graders
type GraderContext struct {
	PoolManager          PoolManager
	ChallengePoolManager ChallengePoolManager
	UsePooling           bool
	UseChallengePooling  bool

	// Async cleanup pool — graders submit teardown work here
	// instead of blocking the grading semaphore on docker rm / os.RemoveAll
	CleanupPool *CleanupPool

	// SQL grading pools
	SQLPool          *SQLPool          // Shared database pool for public tests (read-only)
	SQLHiddenPool    *SQLPool          // Separate database pool for hidden tests (more data)
	SQLContainerPool *SQLContainerPool // Container pool for write challenges
}

// RunGrader dispatches to the appropriate grader based on runner mode
func RunGrader(ctx context.Context, job types.GradingJob, gctx *GraderContext) (types.GradingResult, error) {
	if job.Runner == nil || job.Runner.Mode == "" {
		return failureResult("missing runner configuration"), nil
	}

	switch job.Runner.Mode {
	case "http":
		return RunHTTPBlackboxGrader(ctx, job, gctx)
	case "playwright":
		return RunPlaywrightGrader(ctx, job, gctx)
	case "ui_jsdom":
		return RunUIJsdomGrader(ctx, job, gctx)
	case "sql":
		return RunSQLGrader(ctx, job, gctx)
	default:
		return failureResult(fmt.Sprintf("unknown runner mode: %s", job.Runner.Mode)), nil
	}
}

func failureResult(message string) types.GradingResult {
	return types.GradingResult{
		PublicScore: 0,
		HiddenScore: 0,
		TotalPublic: 0,
		TotalHidden: 0,
		Logs:        message,
		Success:     false,
		Error:       message,
	}
}

