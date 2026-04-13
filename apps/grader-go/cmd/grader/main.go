package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/config"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/db"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/grader"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/logging"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/pool"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/redis"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/worker"
)

func main() {
	// Load .env file from multiple possible locations
	_ = godotenv.Load("../../.env") // Root of monorepo
	_ = godotenv.Load(".env")       // Local to grader-go

	logging.Init()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config error", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	redisClient, err := redis.NewClient(cfg.RedisURL)
	if err != nil {
		slog.Error("redis error", "error", err)
		os.Exit(1)
	}
	defer redisClient.Close()

	store, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db error", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	// Initialize pools
	containerPool := pool.NewContainerPool(pool.PoolConfig{
		MaxSize:        cfg.PoolMaxSize,
		MinSize:        cfg.PoolMinSize,
		AcquireTimeout: cfg.PoolAcquireTimeout,
		WorkDirBase:    cfg.PoolWorkDir,
	})

	networkPool := pool.NewNetworkPool(cfg.NetworkPoolMax)

	poolManager := pool.NewPoolManager(containerPool, networkPool, redisClient)

	// Cleanup orphan resources from previous runs
	if err := poolManager.Cleanup(ctx); err != nil {
		slog.Warn("cleanup warning", "error", err)
	}

	// Start warmup subscriber in background
	go func() {
		if err := poolManager.SubscribeWarmup(ctx); err != nil {
			slog.Warn("warmup subscriber error", "error", err)
		}
	}()

	// Only network pooling is active - container pooling disabled
	// Each grading job creates ephemeral containers with specific code/deps
	// Container pooling would require workspace mounting which is not implemented

	// Initialize challenge-aware pool manager (for future use)
	challengePoolManager := pool.NewChallengePoolManager(networkPool, cfg.PoolWorkDir)
	_ = challengePoolManager // TODO: Wire to graders

	// Pre-warm network pool if configured
	if cfg.PoolMinSize > 0 {
		slog.Info("pre-warming network pool", "count", cfg.PoolMinSize)
		go func() {
			networkPool.Warm(ctx, cfg.PoolMinSize)
		}()
	}

	// Initialize SQL pools for SQL grading
	var sqlPool *grader.SQLPool
	var sqlHiddenPool *grader.SQLPool
	var sqlContainerPool *grader.SQLContainerPool

	if cfg.SQLDatabaseURL != "" {
		slog.Info("initializing SQL grader pool (public)")
		var err error
		sqlPool, err = grader.NewSQLPool(ctx, cfg.SQLDatabaseURL)
		if err != nil {
			slog.Warn("SQL pool init failed", "error", err)
		} else {
			slog.Info("SQL grader pool (public) ready")
		}
	} else {
		slog.Info("SQL grading disabled, SQL_GRADER_DATABASE_URL not set")
	}

	// Initialize hidden database pool (for hidden tests with more data)
	if cfg.SQLHiddenDatabaseURL != "" {
		slog.Info("initializing SQL grader pool (hidden)")
		var err error
		sqlHiddenPool, err = grader.NewSQLPool(ctx, cfg.SQLHiddenDatabaseURL)
		if err != nil {
			slog.Warn("SQL hidden pool init failed", "error", err)
		} else {
			slog.Info("SQL grader pool (hidden) ready")
		}
	} else {
		slog.Info("SQL hidden tests will use public database, SQL_HIDDEN_DATABASE_URL not set")
	}

	// SQL container pool for write challenges (uses Docker)
	var dockerClient *grader.DockerClientImpl
	dockerClient, err = grader.NewDockerClient()
	if err != nil {
		slog.Warn("Docker client init failed", "error", err)
	} else {
		slog.Info("Docker client initialized for container isolation")
	}

	sqlContainerPool = grader.NewSQLContainerPool(
		grader.SQLContainerPoolConfig{
			PoolSize:        cfg.SQLContainerPoolSize,
			BaseImage:       "postgres:16-alpine",
			Password:        "grader_isolated_pwd",
			StartupTimeout:  30 * 1e9,      // 30 seconds
			MaxContainerAge: 10 * 60 * 1e9, // 10 minutes
			RemoteHost:      cfg.SQLContainerRemoteHost,
		},
		dockerClient,
	)

	cleanupPool := grader.NewCleanupPool(8)

	w := worker.New(cfg, redisClient, store, poolManager, challengePoolManager, sqlPool, sqlHiddenPool, sqlContainerPool, cleanupPool)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-signals
		slog.Info("shutting down grader worker")
		cancel()
	}()

	if err := w.Run(ctx); err != nil {
		slog.Error("worker error", "error", err)
		os.Exit(1)
	}

	// Graceful shutdown: wait for async cleanup, then close pools
	slog.Info("waiting for async cleanup to finish")
	cleanupPool.Wait()
	slog.Info("closing pools")
	poolManager.Close(context.Background())
	slog.Info("shutdown complete")
}
