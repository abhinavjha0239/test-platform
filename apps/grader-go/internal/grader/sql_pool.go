package grader

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SQLPool manages connections to the shared SQL grading database
type SQLPool struct {
	pool *pgxpool.Pool
}

// NewSQLPool creates a new connection pool for SQL grading
func NewSQLPool(ctx context.Context, databaseURL string) (*SQLPool, error) {
	if databaseURL == "" {
		return nil, fmt.Errorf("SQL_GRADER_DATABASE_URL not configured")
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Pool configuration for grading workloads
	maxConns := 50
	if envMax := os.Getenv("SQL_POOL_MAX_CONNS"); envMax != "" {
		if val, err := strconv.Atoi(envMax); err == nil && val > 0 {
			maxConns = val
		}
	}
	config.MaxConns = int32(maxConns)    // Support many concurrent grading requests
	config.MinConns = 5                  // Keep some connections warm
	config.MaxConnLifetime = 0           // Don't expire connections
	config.MaxConnIdleTime = 0           // Don't close idle connections
	config.HealthCheckPeriod = 30_000_000_000 // 30 seconds

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &SQLPool{pool: pool}, nil
}

// Acquire gets a connection from the pool
func (p *SQLPool) Acquire(ctx context.Context) (*pgxpool.Conn, error) {
	return p.pool.Acquire(ctx)
}

// AcquireForChallenge gets a connection with schema set for a specific challenge
func (p *SQLPool) AcquireForChallenge(ctx context.Context, challengeID string) (*pgxpool.Conn, error) {
	conn, err := p.pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}

	// Set search path to challenge-specific schema
	schemaName := fmt.Sprintf("challenge_%s", challengeID)
	_, err = conn.Exec(ctx, fmt.Sprintf("SET search_path TO %s, public", schemaName))
	if err != nil {
		conn.Release()
		return nil, fmt.Errorf("failed to set schema: %w", err)
	}

	return conn, nil
}

// Close closes the connection pool
func (p *SQLPool) Close() {
	if p.pool != nil {
		p.pool.Close()
	}
}

// Stats returns pool statistics
func (p *SQLPool) Stats() *pgxpool.Stat {
	return p.pool.Stat()
}
