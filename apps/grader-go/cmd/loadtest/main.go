package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/grader"
)

func main() {
	publicURL := os.Getenv("SQL_GRADER_DATABASE_URL")
	hiddenURL := os.Getenv("SQL_HIDDEN_DATABASE_URL")

	if publicURL == "" || hiddenURL == "" {
		log.Fatal("Please set SQL_GRADER_DATABASE_URL and SQL_HIDDEN_DATABASE_URL")
	}

	ctx := context.Background()

	// Initialize pools
	log.Println("Initializing pools...")
	publicPool, err := grader.NewSQLPool(ctx, publicURL)
	if err != nil {
		log.Fatalf("Failed to connect to public pool: %v", err)
	}
	defer publicPool.Close()

	hiddenPool, err := grader.NewSQLPool(ctx, hiddenURL)
	if err != nil {
		log.Fatalf("Failed to connect to hidden pool: %v", err)
	}
	defer hiddenPool.Close()

	concurrency := 1000 // Simulate 1000 concurrent students
	requests := 5000   // Total requests to run

	log.Printf("Starting load test: %d concurrent users, %d total requests", concurrency, requests)

	var successCount int64
	var failureCount int64
	var totalDuration int64

	start := time.Now()
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for i := 0; i < requests; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(id int) {
			defer wg.Done()
			defer func() { <-sem }()

			reqStart := time.Now()
			
			// simulate executing a query on both pools
			if err := startTransactionAndQuery(ctx, publicPool, "SELECT count(*) FROM users"); err != nil {
				atomic.AddInt64(&failureCount, 1)
				log.Printf("Req %d failed public: %v", id, err)
				return
			}
			
			// Check hidden data (should have more rows)
			if err := startTransactionAndQuery(ctx, hiddenPool, "SELECT count(*) FROM users"); err != nil {
				atomic.AddInt64(&failureCount, 1)
				log.Printf("Req %d failed hidden: %v", id, err)
				return
			}

			dur := time.Since(reqStart).Milliseconds()
			atomic.AddInt64(&totalDuration, dur)
			atomic.AddInt64(&successCount, 1)
		}(i)
	}

	wg.Wait()
	elapsed := time.Since(start)

	avgDuration := float64(totalDuration) / float64(successCount)
	log.Printf("\n--- Load Test Results ---")
	log.Printf("Total Time: %v", elapsed)
	log.Printf("Successful: %d", successCount)
	log.Printf("Failed:     %d", failureCount)
	log.Printf("Avg Request Time: %.2f ms", avgDuration)
	log.Printf("Throughput: %.2f req/sec", float64(requests)/elapsed.Seconds())
}

func startTransactionAndQuery(ctx context.Context, pool *grader.SQLPool, query string) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire: %w", err)
	}
	defer conn.Release()

	tx, err := conn.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx)

	var count int
	if err := tx.QueryRow(ctx, query).Scan(&count); err != nil {
		return fmt.Errorf("query: %w", err)
	}
	return nil
}
