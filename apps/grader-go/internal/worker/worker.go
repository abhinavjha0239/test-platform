package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/errgroup"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/config"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/db"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/grader"
	"github.com/yourorg/exam-platform/apps/grader-go/internal/types"
)

const (
	streamHigh  = "grading:jobs:high"
	streamLow   = "grading:jobs:low"
	streamDLQ   = "grading:jobs:dlq"
	retryZset   = "grading:jobs:retry"
	pauseKey    = "grading:queue:paused"
	jobKeyPrefix = "grading:job:"
	statsKey    = "grading:stats"
	channelGradingComplete = "grading:complete"
	retryCleanupInterval = 30 * time.Minute
)

var transitionScript = redis.NewScript(`
local jobKey = KEYS[1]
local statsKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local nextStatus = ARGV[2]
local nowMs = ARGV[3]

local prev = redis.call("HGET", jobKey, "status")

if prev == "queued" then
  redis.call("HINCRBY", statsKey, "queued", -1)
elseif prev == "processing" then
  redis.call("HINCRBY", statsKey, "active", -1)
elseif prev == "retrying" then
  redis.call("HINCRBY", statsKey, "retrying", -1)
end

if nextStatus == "queued" then
  redis.call("HINCRBY", statsKey, "queued", 1)
elseif nextStatus == "processing" then
  redis.call("HINCRBY", statsKey, "active", 1)
elseif nextStatus == "completed" then
  redis.call("HINCRBY", statsKey, "completed", 1)
elseif nextStatus == "failed" then
  redis.call("HINCRBY", statsKey, "failed", 1)
elseif nextStatus == "retrying" then
  redis.call("HINCRBY", statsKey, "retrying", 1)
end

redis.call("HSET", jobKey, "status", nextStatus, "updatedAt", nowMs)
for i = 4, #ARGV, 2 do
  redis.call("HSET", jobKey, ARGV[i], ARGV[i + 1])
end

if ttl and ttl > 0 then
  redis.call("EXPIRE", jobKey, ttl)
end

return prev
`)

type Worker struct {
	cfg         config.Config
	redis       *redis.Client
	store       *db.Store
	poolManager PoolManager
	challengePoolManager grader.ChallengePoolManager
	sqlPool              *grader.SQLPool       // Public tests database
	sqlHiddenPool        *grader.SQLPool       // Hidden tests database (more data)
	sqlContainerPool     *grader.SQLContainerPool
	cleanupPool          *grader.CleanupPool
	logger      *slog.Logger
	sem         chan struct{}
	wg          sync.WaitGroup
	consumer    string
}

// PoolManager interface for resource acquisition
type PoolManager interface {
	AcquireResources(ctx context.Context) (interface{}, string, error)
	ReleaseResources(ctx context.Context, container interface{}, network string)
	Stats() map[string]interface{}
}

func New(cfg config.Config, redisClient *redis.Client, store *db.Store, poolManager PoolManager, challengePoolManager grader.ChallengePoolManager, sqlPool *grader.SQLPool, sqlHiddenPool *grader.SQLPool, sqlContainerPool *grader.SQLContainerPool, cleanupPool *grader.CleanupPool) *Worker {
	consumer := cfg.StreamConsumer
	if consumer == "" {
		hostname, _ := os.Hostname()
		consumer = fmt.Sprintf("%s-%d", hostname, os.Getpid())
	}

	return &Worker{
		cfg:                  cfg,
		redis:                redisClient,
		store:                store,
		poolManager:          poolManager,
		challengePoolManager: challengePoolManager,
		sqlPool:              sqlPool,
		sqlHiddenPool:        sqlHiddenPool,
		sqlContainerPool:     sqlContainerPool,
		cleanupPool:          cleanupPool,
		logger:               slog.Default().With("component", "worker"),
		sem:                  make(chan struct{}, cfg.Concurrency),
		consumer:             consumer,
	}
}

func (w *Worker) Run(ctx context.Context) error {
	if err := w.ensureStreamGroup(ctx, streamHigh); err != nil {
		return err
	}
	if err := w.ensureStreamGroup(ctx, streamLow); err != nil {
		return err
	}

	w.logger.Info("grader worker ready", "group", w.cfg.StreamGroup, "consumer", w.consumer)

	group, ctx := errgroup.WithContext(ctx)
	group.Go(func() error { return w.processingLoop(ctx) })
	group.Go(func() error { return w.reclaimLoop(ctx) })
	group.Go(func() error { return w.retryLoop(ctx) })

	err := group.Wait()
	w.waitForJobs()
	return err
}

func (w *Worker) waitForJobs() {
	w.wg.Wait()
}

func (w *Worker) ensureStreamGroup(ctx context.Context, stream string) error {
	err := w.redis.XGroupCreateMkStream(ctx, stream, w.cfg.StreamGroup, "0").Err()
	if err == nil {
		w.logger.Info("created stream group", "group", w.cfg.StreamGroup, "stream", stream)
		return nil
	}
	if strings.Contains(err.Error(), "BUSYGROUP") {
		return nil
	}
	return err
}

func (w *Worker) processingLoop(ctx context.Context) error {
	consecutiveErrors := 0
	for {
		if ctx.Err() != nil {
			return nil
		}
		paused, err := w.isPaused(ctx)
		if err != nil {
			w.logger.Warn("pause check error", "error", err)
		}
		if paused {
			time.Sleep(time.Second)
			continue
		}

		hadError := false

		if err := w.readAndDispatch(ctx, streamHigh); err != nil && !errors.Is(err, redis.Nil) {
			hadError = true
			if w.isNoGroupError(err) {
				w.handleNoGroupRecovery(ctx, streamHigh)
			} else {
				w.logger.Warn("stream read error", "stream", "high", "error", err)
			}
		}
		if w.hasCapacity() {
			if err := w.readAndDispatch(ctx, streamLow); err != nil && !errors.Is(err, redis.Nil) {
				hadError = true
				if w.isNoGroupError(err) {
					w.handleNoGroupRecovery(ctx, streamLow)
				} else {
					w.logger.Warn("stream read error", "stream", "low", "error", err)
				}
			}
		}

		// Backoff on consecutive errors to avoid tight-loop spam
		if hadError {
			consecutiveErrors++
			backoff := time.Duration(consecutiveErrors) * time.Second
			if backoff > 10*time.Second {
				backoff = 10 * time.Second
			}
			time.Sleep(backoff)
		} else {
			consecutiveErrors = 0
		}
	}
}

func (w *Worker) isNoGroupError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "NOGROUP")
}

func (w *Worker) handleNoGroupRecovery(ctx context.Context, stream string) {
	w.logger.Warn("NOGROUP detected, recreating stream group", "stream", stream, "group", w.cfg.StreamGroup)
	if err := w.ensureStreamGroup(ctx, stream); err != nil {
		w.logger.Error("failed to recreate stream group", "stream", stream, "error", err)
	} else {
		w.logger.Info("stream group recreated", "stream", stream, "group", w.cfg.StreamGroup)
	}
}

func (w *Worker) reclaimLoop(ctx context.Context) error {
	for {
		if ctx.Err() != nil {
			return nil
		}

		if err := w.reclaimStream(ctx, streamHigh); err != nil {
			if !w.isNoGroupError(err) {
				w.logger.Warn("reclaim error", "stream", "high", "error", err)
			}
		}
		if err := w.reclaimStream(ctx, streamLow); err != nil {
			if !w.isNoGroupError(err) {
				w.logger.Warn("reclaim error", "stream", "low", "error", err)
			}
		}

		time.Sleep(time.Duration(w.cfg.PelPollMs) * time.Millisecond)
	}
}

func (w *Worker) retryLoop(ctx context.Context) error {
	lastCleanup := time.Now()

	for {
		if ctx.Err() != nil {
			return nil
		}

		now := time.Now().UnixMilli()
		ids, err := w.redis.ZRangeByScore(ctx, retryZset, &redis.ZRangeBy{
			Min:    "-inf",
			Max:    fmt.Sprintf("%d", now),
			Offset: 0,
			Count:  50,
		}).Result()
		if err != nil && !errors.Is(err, redis.Nil) {
			w.logger.Warn("retry loop error", "error", err)
			time.Sleep(time.Duration(w.cfg.RetryPollMs) * time.Millisecond)
			continue
		}

		if len(ids) > 0 {
			pipe := w.redis.TxPipeline()
			for _, id := range ids {
				pipe.ZRem(ctx, retryZset, id)
			}
			if _, err := pipe.Exec(ctx); err != nil {
				w.logger.Warn("retry zset update error", "error", err)
			}

			for _, jobID := range ids {
				if ctx.Err() != nil {
					break
				}
				if err := w.requeueJob(ctx, jobID); err != nil {
					w.logger.Warn("retry requeue error", "jobID", jobID, "error", err)
				}
			}
		}

		if time.Since(lastCleanup) >= retryCleanupInterval {
			cutoff := time.Now().Add(-time.Duration(w.cfg.JobTTLSec) * time.Second).UnixMilli()
			if err := w.redis.ZRemRangeByScore(ctx, retryZset, "-inf", fmt.Sprintf("%d", cutoff)).Err(); err != nil {
				w.logger.Warn("retry cleanup error", "error", err)
			}
			lastCleanup = time.Now()
		}

		time.Sleep(time.Duration(w.cfg.RetryPollMs) * time.Millisecond)
	}
}

func (w *Worker) readAndDispatch(ctx context.Context, stream string) error {
	available := w.availableSlots()
	if available <= 0 {
		return nil
	}

	// Cap read count to available capacity so we never claim more than we can process
	count := int64(w.cfg.ReadBatch)
	if int64(available) < count {
		count = int64(available)
	}

	res, err := w.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    w.cfg.StreamGroup,
		Consumer: w.consumer,
		Streams:  []string{stream, ">"},
		Count:    count,
		Block:    time.Duration(w.cfg.ReadBlockMs) * time.Millisecond,
	}).Result()
	if err != nil {
		return err
	}

	for _, streamRes := range res {
		for _, msg := range streamRes.Messages {
			if ctx.Err() != nil {
				return nil
			}
			w.dispatch(ctx, streamRes.Stream, msg)
		}
	}

	return nil
}

func (w *Worker) hasCapacity() bool {
	return len(w.sem) < cap(w.sem)
}

func (w *Worker) availableSlots() int {
	return cap(w.sem) - len(w.sem)
}

func (w *Worker) dispatch(ctx context.Context, stream string, msg redis.XMessage) {
	w.sem <- struct{}{}
	w.wg.Add(1)

	go func() {
		defer func() {
			<-w.sem
			w.wg.Done()
		}()

		if err := w.processMessage(ctx, stream, msg); err != nil {
			w.logger.Warn("process error", "error", err)
		}
	}()
}

func (w *Worker) processMessage(ctx context.Context, stream string, msg redis.XMessage) error {
	jobID := getStringField(msg.Values, "jobId")
	if jobID == "" {
		w.logger.Warn("missing jobId", "stream", stream, "messageID", msg.ID)
		if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
			w.logger.Warn("ack error", "error", err)
		}
		return nil
	}

	payload := getStringField(msg.Values, "payload")
	if payload == "" {
		stored, err := w.redis.HGet(ctx, jobKey(jobID), "payload").Result()
		if err == nil {
			payload = stored
		}
	}

	if payload == "" {
		err := w.transitionStatus(ctx, jobID, "failed", map[string]string{"error": "missing payload"})
		if err != nil {
			w.logger.Warn("status update error", "error", err)
		}
		if err := w.sendToDLQ(ctx, jobID, "", "missing payload"); err != nil {
			w.logger.Warn("dlq error", "error", err)
		}
		if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
			w.logger.Warn("ack error", "error", err)
		}
		return nil
	}

	var job types.GradingJob
	if err := json.Unmarshal([]byte(payload), &job); err != nil {
		errMsg := fmt.Sprintf("invalid payload: %v", err)
		if err := w.transitionStatus(ctx, jobID, "failed", map[string]string{"error": errMsg}); err != nil {
			w.logger.Warn("status update error", "error", err)
		}
		if err := w.sendToDLQ(ctx, jobID, payload, errMsg); err != nil {
			w.logger.Warn("dlq error", "error", err)
		}
		if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
			w.logger.Warn("ack error", "error", err)
		}
		return nil
	}

	if err := validateJobPayload(job); err != nil {
		errMsg := fmt.Sprintf("invalid job: %v", err)
		if err := w.transitionStatus(ctx, jobID, "failed", map[string]string{"error": errMsg}); err != nil {
			w.logger.Warn("status update error", "error", err)
		}
		if err := w.sendToDLQ(ctx, jobID, payload, errMsg); err != nil {
			w.logger.Warn("dlq error", "error", err)
		}
		if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
			w.logger.Warn("ack error", "error", err)
		}
		return nil
	}

	if err := w.updateJobHash(ctx, jobID, map[string]string{
		"payload":   payload,
		"attemptId": job.AttemptID,
		"isPreview": boolToString(job.IsPreview),
		"stream":    stream,
		"streamId":  msg.ID,
	}); err != nil {
		w.logger.Warn("job hash update error", "error", err)
	}

	if err := w.transitionStatus(ctx, jobID, "processing", map[string]string{"startedAt": fmt.Sprintf("%d", time.Now().UnixMilli())}); err != nil {
		w.logger.Warn("status update error", "error", err)
	}
	if err := w.updateProgress(ctx, jobID, 10); err != nil {
		w.logger.Warn("progress update error", "error", err)
	}

	attempts, err := w.redis.HIncrBy(ctx, jobKey(jobID), "attempts", 1).Result()
	if err != nil {
		w.logger.Warn("attempts increment error", "error", err)
		attempts = 1
	}

	gctx := &grader.GraderContext{
		PoolManager:          w.poolManager,
		ChallengePoolManager: w.challengePoolManager,
		UsePooling:           w.cfg.UsePooling,
		UseChallengePooling:  w.cfg.UsePooling,
		CleanupPool:          w.cleanupPool,
		SQLPool:              w.sqlPool,
		SQLHiddenPool:        w.sqlHiddenPool,
		SQLContainerPool:     w.sqlContainerPool,
	}
	result, err := grader.RunGrader(ctx, job, gctx)
	if err == nil {
		if err := w.updateProgress(ctx, jobID, 80); err != nil {
			w.logger.Warn("progress update error", "error", err)
		}
		sanitizedResult, updateErr := w.store.UpdateAttemptResults(ctx, job.AttemptID, result, job.IsPreview)
		if updateErr != nil {
			err = fmt.Errorf("db update failed: %w", updateErr)
		} else {
			if err := w.updateProgress(ctx, jobID, 90); err != nil {
				w.logger.Warn("progress update error", "error", err)
			}

		payloadBytes, _ := json.Marshal(map[string]interface{}{
			"attemptId": job.AttemptID,
			"result":    sanitizedResult,
			"isPreview": job.IsPreview,
			"jobId":     jobID,
		})
		w.logger.Debug("publishing grading:complete", "channel", channelGradingComplete, "attemptId", job.AttemptID, "isPreview", job.IsPreview, "jobId", jobID)
		if err := w.redis.Publish(ctx, channelGradingComplete, payloadBytes).Err(); err != nil {
			w.logger.Debug("redis publish error", "error", err)
		} else {
			w.logger.Debug("published to redis", "channel", channelGradingComplete, "payloadSize", len(payloadBytes))
		}

			if err := w.updateProgress(ctx, jobID, 100); err != nil {
				w.logger.Warn("progress update error", "error", err)
			}
			if err := w.transitionStatus(ctx, jobID, "completed", map[string]string{"completedAt": fmt.Sprintf("%d", time.Now().UnixMilli())}); err != nil {
				w.logger.Warn("status update error", "error", err)
			}
			if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
				w.logger.Warn("ack error", "error", err)
			}

			w.logger.Info("job completed", "jobID", jobID, "publicPassed", result.PublicScore, "publicTotal", result.TotalPublic, "hiddenPassed", result.HiddenScore, "hiddenTotal", result.TotalHidden)
			return nil
		}
	}

	errMessage := sanitizeError(err)
	failureResult := types.GradingResult{
		PublicScore: 0,
		HiddenScore: 0,
		TotalPublic: 0,
		TotalHidden: 0,
		Logs:        "Grading error: " + errMessage,
		Success:     false,
		Error:       errMessage,
	}

	if _, updateErr := w.store.UpdateAttemptResults(ctx, job.AttemptID, failureResult, job.IsPreview); updateErr != nil {
		w.logger.Warn("db update error", "error", updateErr)
	}
	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"attemptId": job.AttemptID,
		"result":    failureResult,
		"isPreview": job.IsPreview,
		"jobId":     jobID,
		"error":     errMessage,
	})
	w.logger.Debug("publishing grading:complete (failure)", "channel", channelGradingComplete, "attemptId", job.AttemptID, "isPreview", job.IsPreview, "jobId", jobID, "error", errMessage)
	if err := w.redis.Publish(ctx, channelGradingComplete, payloadBytes).Err(); err != nil {
		w.logger.Debug("redis publish error", "error", err)
	} else {
		w.logger.Debug("published to redis", "channel", channelGradingComplete, "payloadSize", len(payloadBytes))
	}

	if int(attempts) < w.cfg.MaxAttempts {
		delay := retryDelay(w.cfg.RetryBaseMs, w.cfg.RetryMaxMs, int(attempts))
		retryAt := time.Now().Add(delay)
		if err := w.transitionStatus(ctx, jobID, "retrying", map[string]string{
			"error":   errMessage,
			"retryAt": fmt.Sprintf("%d", retryAt.UnixMilli()),
		}); err != nil {
			w.logger.Warn("status update error", "error", err)
		}
		if err := w.redis.ZAdd(ctx, retryZset, redis.Z{
			Score:  float64(retryAt.UnixMilli()),
			Member: jobID,
		}).Err(); err != nil {
			w.logger.Warn("retry enqueue error", "error", err)
		}
		if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
			w.logger.Warn("ack error", "error", err)
		}
		w.logger.Info("job failed, retrying", "jobID", jobID, "retryDelay", delay)
		return nil
	}

	if err := w.transitionStatus(ctx, jobID, "failed", map[string]string{
		"error":       errMessage,
		"completedAt": fmt.Sprintf("%d", time.Now().UnixMilli()),
	}); err != nil {
		w.logger.Warn("status update error", "error", err)
	}
	if err := w.sendToDLQ(ctx, jobID, payload, errMessage); err != nil {
		w.logger.Warn("dlq error", "error", err)
	}
	if err := w.ackAndDelete(ctx, stream, msg.ID); err != nil {
		w.logger.Warn("ack error", "error", err)
	}
	w.logger.Info("job failed permanently", "jobID", jobID, "attempts", attempts)

	return nil
}

func (w *Worker) reclaimStream(ctx context.Context, stream string) error {
	if !w.hasCapacity() {
		return nil
	}

	minIdle := time.Duration(w.cfg.PelIdleMs) * time.Millisecond

	// Use XPENDING + XCLAIM (works on Azure Redis which lacks XAUTOCLAIM)
	// Note: omit Idle filter from XPENDING (requires Redis 6.2+, Azure may not support it)
	// We filter by idle time manually below
	pending, err := w.redis.XPendingExt(ctx, &redis.XPendingExtArgs{
		Stream: stream,
		Group:  w.cfg.StreamGroup,
		Start:  "-",
		End:    "+",
		Count:  20,
	}).Result()
	if err != nil {
		return err
	}

	if len(pending) == 0 {
		return nil
	}

	// Collect message IDs that are idle long enough
	var ids []string
	for _, p := range pending {
		if p.Idle >= minIdle {
			ids = append(ids, p.ID)
		}
	}

	if len(ids) == 0 {
		return nil
	}

	// Claim the idle messages
	messages, err := w.redis.XClaim(ctx, &redis.XClaimArgs{
		Stream:   stream,
		Group:    w.cfg.StreamGroup,
		Consumer: w.consumer,
		MinIdle:  minIdle,
		Messages: ids,
	}).Result()
	if err != nil {
		return err
	}

	for _, msg := range messages {
		if ctx.Err() != nil {
			return nil
		}
		if !w.hasCapacity() {
			return nil
		}
		w.dispatch(ctx, stream, msg)
	}

	return nil
}

func (w *Worker) requeueJob(ctx context.Context, jobID string) error {
	data, err := w.redis.HGetAll(ctx, jobKey(jobID)).Result()
	if err != nil {
		return err
	}
	payload := data["payload"]
	if payload == "" {
		if err := w.transitionStatus(ctx, jobID, "failed", map[string]string{"error": "missing payload on retry"}); err != nil {
			w.logger.Warn("status update error", "error", err)
		}
		if err := w.sendToDLQ(ctx, jobID, "", "missing payload on retry"); err != nil {
			w.logger.Warn("dlq error", "error", err)
		}
		return fmt.Errorf("missing payload on retry")
	}

	isPreview := data["isPreview"] == "1"
	stream := streamHigh
	if isPreview {
		stream = streamLow
	}

	createdAt := time.Now().UnixMilli()
	streamID, err := w.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: stream,
		Values: map[string]interface{}{
			"jobId":     jobID,
			"attemptId": data["attemptId"],
			"isPreview": boolToString(isPreview),
			"createdAt": fmt.Sprintf("%d", createdAt),
			"payload":   payload,
		},
	}).Result()
	if err != nil {
		return err
	}

	return w.transitionStatus(ctx, jobID, "queued", map[string]string{
		"stream":    stream,
		"streamId":  streamID,
		"createdAt": fmt.Sprintf("%d", createdAt),
	})
}

func (w *Worker) updateJobHash(ctx context.Context, jobID string, fields map[string]string) error {
	values := map[string]interface{}{}
	for k, v := range fields {
		values[k] = v
	}
	values["updatedAt"] = fmt.Sprintf("%d", time.Now().UnixMilli())

	pipe := w.redis.TxPipeline()
	pipe.HSet(ctx, jobKey(jobID), values)
	pipe.Expire(ctx, jobKey(jobID), time.Duration(w.cfg.JobTTLSec)*time.Second)
	_, err := pipe.Exec(ctx)
	return err
}

func (w *Worker) updateProgress(ctx context.Context, jobID string, progress int) error {
	return w.updateJobHash(ctx, jobID, map[string]string{"progress": fmt.Sprintf("%d", progress)})
}

func (w *Worker) transitionStatus(ctx context.Context, jobID, next string, fields map[string]string) error {
	args := []interface{}{
		w.cfg.JobTTLSec,
		next,
		fmt.Sprintf("%d", time.Now().UnixMilli()),
	}
	for k, v := range fields {
		args = append(args, k, v)
	}

	_, err := transitionScript.Run(ctx, w.redis, []string{jobKey(jobID), statsKey}, args...).Result()
	return err
}

func (w *Worker) ackAndDelete(ctx context.Context, stream, messageID string) error {
	pipe := w.redis.TxPipeline()
	pipe.XAck(ctx, stream, w.cfg.StreamGroup, messageID)
	pipe.XDel(ctx, stream, messageID)
	_, err := pipe.Exec(ctx)
	return err
}

func (w *Worker) sendToDLQ(ctx context.Context, jobID, payload, errMsg string) error {
	return w.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: streamDLQ,
		Values: map[string]interface{}{
			"jobId":   jobID,
			"payload": payload,
			"error":   errMsg,
			"failedAt": fmt.Sprintf("%d", time.Now().UnixMilli()),
		},
	}).Err()
}

func (w *Worker) isPaused(ctx context.Context) (bool, error) {
	val, err := w.redis.Exists(ctx, pauseKey).Result()
	if err != nil {
		return false, err
	}
	return val == 1, nil
}

func jobKey(jobID string) string {
	return jobKeyPrefix + jobID
}

func getStringField(values map[string]interface{}, key string) string {
	val, ok := values[key]
	if !ok || val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case fmt.Stringer:
		return v.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

func boolToString(value bool) string {
	if value {
		return "1"
	}
	return "0"
}

func validateJobPayload(job types.GradingJob) error {
	if strings.TrimSpace(job.AttemptID) == "" {
		return fmt.Errorf("attemptId is required")
	}
	if job.Runner == nil {
		return fmt.Errorf("runner configuration is required")
	}

	switch job.Runner.Mode {
	case "http", "playwright", "ui_jsdom":
		// Standard modes require candidate config
		if strings.TrimSpace(job.Runner.Candidate.Image) == "" {
			return fmt.Errorf("candidate image is required")
		}
		if strings.TrimSpace(job.Runner.Candidate.RunCommand) == "" {
			return fmt.Errorf("candidate run command is required")
		}
	case "sql":
		// SQL mode requires database config
		if job.Runner.Database == nil {
			return fmt.Errorf("database configuration is required for sql mode")
		}
		if strings.TrimSpace(job.Runner.Database.SetupScript) == "" {
			return fmt.Errorf("database setup script is required for sql mode")
		}
	default:
		return fmt.Errorf("unsupported runner mode: %s", job.Runner.Mode)
	}

	return nil
}

func retryDelay(baseMs, maxMs, attempt int) time.Duration {
	delayMs := float64(baseMs) * math.Pow(2, float64(attempt-1))
	if delayMs > float64(maxMs) {
		delayMs = float64(maxMs)
	}
	return time.Duration(delayMs) * time.Millisecond
}

func sanitizeError(err error) string {
	msg := err.Error()
	sanitized := strings.ReplaceAll(msg, "/var/folders/", "[temp]")
	sanitized = strings.ReplaceAll(sanitized, "/tmp/", "[temp]")
	if len(sanitized) > 200 {
		sanitized = sanitized[:200]
	}
	return sanitized
}
