package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

type Store struct {
	pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return &Store{pool: pool}, nil
}

func (s *Store) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

func (s *Store) UpdateAttemptResults(ctx context.Context, attemptID string, result types.GradingResult, isPreview bool) (types.GradingResult, error) {
	if attemptID == "" {
		return result, fmt.Errorf("attemptId is required")
	}

	if isPreview {
		_, err := s.pool.Exec(ctx, `
			UPDATE exam_attempts SET
				public_score = $1,
				total_public = $2,
				grading_logs = $3,
				graded_at = NOW()
			WHERE id = $4
		`, result.PublicScore, result.TotalPublic, result.Logs, attemptID)
		if err != nil {
			return result, err
		}

		return types.GradingResult{
			PublicScore: result.PublicScore,
			HiddenScore: 0,
			TotalPublic: result.TotalPublic,
			TotalHidden: 0,
			Logs:        result.Logs,
			Success:     result.Success,
			Error:       result.Error,
		}, nil
	}

	_, err := s.pool.Exec(ctx, `
		UPDATE exam_attempts SET
			public_score = $1,
			total_public = $2,
			hidden_score = $3,
			total_hidden = $4,
			grading_logs = $5,
			graded_at = NOW(),
			status = $6
		WHERE id = $7
	`, result.PublicScore, result.TotalPublic, result.HiddenScore, result.TotalHidden, result.Logs, statusForResult(result), attemptID)
	if err != nil {
		return result, err
	}

	return result, nil
}

func statusForResult(result types.GradingResult) string {
	if result.Success {
		return "COMPLETED"
	}
	return "FAILED"
}
