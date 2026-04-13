package config

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"time"
)

type Config struct {
	RedisURL       string
	DatabaseURL    string
	StreamGroup    string
	StreamConsumer string
	Concurrency    int
	ReadBlockMs    int
	ReadBatch      int
	PelIdleMs      int
	PelPollMs      int
	RetryPollMs    int
	RetryBaseMs    int
	RetryMaxMs     int
	MaxAttempts    int
	JobTTLSec      int

	// Pool configuration
	PoolMaxSize        int
	PoolMinSize        int
	PoolAcquireTimeout time.Duration
	PoolWorkDir        string
	NetworkPoolMax     int
	UsePooling         bool

	// SQL Grader configuration
	SQLDatabaseURL         string // Public tests database
	SQLHiddenDatabaseURL   string // Hidden tests database (more data)
	SQLContainerPoolSize   int
	SQLContainerRemoteHost string // Remote host IP for Docker containers (empty = localhost)
}

func Load() (Config, error) {
	// Auto-detect concurrency from CPU cores if not explicitly set
	// Rule: ~3 vCPU per grading job (each job runs 4 containers)
	autoConcurrency := runtime.NumCPU() / 3
	if autoConcurrency < 1 {
		autoConcurrency = 1
	}

	cfg := Config{
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		StreamGroup:    getEnv("GRADING_STREAM_GROUP", "grading-workers"),
		StreamConsumer: getEnv("GRADING_STREAM_CONSUMER", ""),
		Concurrency:    getEnvInt("GRADING_CONCURRENCY", autoConcurrency),
		ReadBlockMs:    getEnvInt("GRADING_STREAM_BLOCK_MS", 2000),
		ReadBatch:      getEnvInt("GRADING_STREAM_BATCH", 10),
		PelIdleMs:      getEnvInt("GRADING_PEL_IDLE_MS", 60000),
		PelPollMs:      getEnvInt("GRADING_PEL_POLL_MS", 10000),
		RetryPollMs:    getEnvInt("GRADING_RETRY_POLL_MS", 1000),
		RetryBaseMs:    getEnvInt("GRADING_RETRY_BASE_MS", 1000),
		RetryMaxMs:     getEnvInt("GRADING_RETRY_MAX_MS", 60000),
		MaxAttempts:    getEnvInt("GRADING_MAX_ATTEMPTS", 3),
		JobTTLSec:      getEnvInt("GRADING_JOB_TTL_SEC", 172800),

		// Pool configuration
		PoolMaxSize:        getEnvInt("POOL_MAX_SIZE", 20),
		PoolMinSize:        getEnvInt("POOL_MIN_SIZE", 5),
		PoolAcquireTimeout: time.Duration(getEnvInt("POOL_ACQUIRE_TIMEOUT_SEC", 30)) * time.Second,
		PoolWorkDir:        getEnv("POOL_WORK_DIR", "/tmp/grader-pool"),
		NetworkPoolMax:     getEnvInt("NETWORK_POOL_MAX", 50),
		UsePooling:         getEnv("USE_POOLING", "true") == "true",

		// SQL Grader configuration
		SQLDatabaseURL:         getEnv("SQL_GRADER_DATABASE_URL", ""),
		SQLHiddenDatabaseURL:   getEnv("SQL_HIDDEN_DATABASE_URL", ""),
		SQLContainerPoolSize:   getEnvInt("SQL_CONTAINER_POOL_SIZE", 3),
		SQLContainerRemoteHost: getEnv("SQL_CONTAINER_REMOTE_HOST", ""), // Remote spot VM IP
	}

	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL not set")
	}

	// Validate critical numeric bounds
	if cfg.Concurrency < 1 {
		cfg.Concurrency = 1
	}
	if cfg.ReadBatch < 1 {
		cfg.ReadBatch = 1
	}
	if cfg.PoolMaxSize < 1 {
		cfg.PoolMaxSize = 1
	}
	if cfg.MaxAttempts < 1 {
		cfg.MaxAttempts = 1
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
