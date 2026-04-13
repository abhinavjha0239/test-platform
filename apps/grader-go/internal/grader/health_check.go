package grader

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

func waitForHTTP(ctx context.Context, containerName string, port int, healthPath string, timeoutMs int) (string, error) {
	deadline := time.Now().Add(time.Duration(timeoutMs) * time.Millisecond)
	debug := []string{}
	attempts := 0

	if err := sleepWithContext(ctx, 200*time.Millisecond); err != nil {
		return strings.Join(debug, "\n"), err
	}
	debug = append(debug, "[Init] Waited 200ms for container to initialize")

	script := fmt.Sprintf(`
const http = require('http');
const req = http.get('http://127.0.0.1:%d%s', { timeout: 3000 }, (res) => {
  process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
});
req.on('error', () => process.exit(1));
req.on('timeout', () => { req.destroy(); process.exit(1); });
`, port, healthPath)
	script = strings.ReplaceAll(strings.TrimSpace(script), "\n", " ")

	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			return strings.Join(debug, "\n"), ctx.Err()
		}
		attempts++
		args := []string{"exec", containerName, "node", "-e", script}
		debug = append(debug, fmt.Sprintf("[Attempt %d] Health check via node http", attempts))
		if _, err := docker.Exec(ctx, args, 5*time.Second); err == nil {
			debug = append(debug, fmt.Sprintf("[Attempt %d] SUCCESS - Server is ready", attempts))
			return strings.Join(debug, "\n"), nil
		}
		if attempts <= 3 || attempts%10 == 0 {
			debug = append(debug, fmt.Sprintf("[Attempt %d] FAILED", attempts))
		}
		if err := sleepWithContext(ctx, 150*time.Millisecond); err != nil {
			return strings.Join(debug, "\n"), err
		}
	}

	if res, err := docker.Exec(ctx, []string{"exec", containerName, "ps", "aux"}, 3*time.Second); err == nil {
		debug = append(debug, "\n[DEBUG] Container processes:\n"+res.Stdout)
	} else {
		debug = append(debug, "\n[DEBUG] Could not get container processes")
	}

	if res, err := docker.Exec(ctx, []string{"exec", containerName, "netstat", "-tlnp"}, 3*time.Second); err == nil {
		debug = append(debug, "\n[DEBUG] Listening ports:\n"+res.Stdout)
	} else if res, err := docker.Exec(ctx, []string{"exec", containerName, "ss", "-tlnp"}, 3*time.Second); err == nil {
		debug = append(debug, "\n[DEBUG] Listening ports (ss):\n"+res.Stdout)
	} else {
		debug = append(debug, "\n[DEBUG] Could not get listening ports")
	}

	if res, err := docker.Exec(ctx, []string{"exec", containerName, "wget", "-O", "-", "-T", "3", fmt.Sprintf("http://127.0.0.1:%d%s", port, healthPath)}, 5*time.Second); err == nil {
		debug = append(debug, "\n[DEBUG] Final wget test:")
		debug = append(debug, "stdout: "+truncateMessage(res.Stdout, 500))
		debug = append(debug, "stderr: "+truncateMessage(res.Stderr, 200))
	} else {
		debug = append(debug, fmt.Sprintf("\n[DEBUG] wget failed: %s", truncateMessage(err.Error(), 200)))
	}

	return strings.Join(debug, "\n"), fmt.Errorf("candidate app did not become ready in time after %d attempts", attempts)
}

func sleepWithContext(ctx context.Context, duration time.Duration) error {
	if duration <= 0 {
		return nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
