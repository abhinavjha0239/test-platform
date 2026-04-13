package docker

import (
	"bytes"
	"context"
	"crypto/rand"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"
)

type ExecResult struct {
	Stdout string
	Stderr string
}

type RunDetachedOptions struct {
	Name              string
	Network           string
	Alias             string
	Image             string
	WorkDir           string
	ContainerWorkDir  string
	Command           string
	Env               map[string]string
	MemoryLimitMb     int
	Runtime           string
	Timeout           time.Duration
	SkipReadOnly      bool // Set true for pooled containers that need writable root fs
}

type RunOnceOptions struct {
	Name              string
	Network           string
	Image             string
	WorkDir           string
	ContainerWorkDir  string
	Command           string
	Env               map[string]string
	MemoryLimitMb     int
	Runtime           string
	Timeout           time.Duration
	SkipReadOnly      bool // Set true for pooled containers that need writable root fs
}

func Exec(ctx context.Context, args []string, timeout time.Duration) (ExecResult, error) {
	slog.Debug("docker exec", "command", strings.Join(args, " "), "timeout", timeout)
	if timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, "docker", args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	result := ExecResult{Stdout: stdout.String(), Stderr: stderr.String()}

	if ctx.Err() == context.DeadlineExceeded {
		slog.Warn("docker exec timeout", "command", strings.Join(args, " "), "timeout", timeout, "stdout", truncateLog(result.Stdout), "stderr", truncateLog(result.Stderr))
		return result, fmt.Errorf("docker %s timed out", strings.Join(args, " "))
	}
	if err != nil {
		slog.Debug("docker exec failed", "command", strings.Join(args, " "), "error", err, "stdout", truncateLog(result.Stdout), "stderr", truncateLog(result.Stderr))
		return result, fmt.Errorf("docker %s failed: %w\n%s\n%s", strings.Join(args, " "), err, result.Stdout, result.Stderr)
	}

	slog.Debug("docker exec success", "command", strings.Join(args, " "), "stdoutLen", len(result.Stdout), "stderrLen", len(result.Stderr))
	return result, nil
}

func RunDetached(ctx context.Context, opts RunDetachedOptions) error {
	args := []string{
		"run",
		"-d",
		"--name",
		opts.Name,
		"--network",
		opts.Network,
	}
	if opts.Alias != "" {
		args = append(args, "--network-alias", opts.Alias)
	}

	args = append(args, dockerRunArgs(opts.ContainerWorkDir, opts.WorkDir, opts.Env, opts.MemoryLimitMb, opts.Runtime, opts.SkipReadOnly)...)
	args = append(args, opts.Image, "sh", "-c", opts.Command)

	_, err := Exec(ctx, args, opts.Timeout)
	if err != nil {
		_ = SafeCleanup(ctx, opts.Name, "")
		return err
	}
	return nil
}

func RunOnce(ctx context.Context, opts RunOnceOptions) (string, error) {
	name := opts.Name
	if name == "" {
		buf := make([]byte, 4)
		rand.Read(buf)
		name = fmt.Sprintf("grader_run_%d_%x", time.Now().UnixNano(), buf)
	}

	args := []string{
		"run",
		"--rm",
		"--name",
		name,
		"--network",
		opts.Network,
	}

	args = append(args, dockerRunArgs(opts.ContainerWorkDir, opts.WorkDir, opts.Env, opts.MemoryLimitMb, opts.Runtime, opts.SkipReadOnly)...)
	args = append(args, opts.Image, "sh", "-c", opts.Command)

	result, err := Exec(ctx, args, opts.Timeout)
	if err != nil {
		_ = SafeCleanup(ctx, name, "")
		return strings.TrimSpace(result.Stdout + "\n" + result.Stderr), err
	}
	return strings.TrimSpace(result.Stdout + "\n" + result.Stderr), nil
}

func SafeCleanup(ctx context.Context, containerName, networkName string) error {
	if containerName != "" {
		_, _ = Exec(ctx, []string{"rm", "-f", containerName}, 5*time.Second)
	}
	if networkName != "" {
		_, _ = Exec(ctx, []string{"network", "rm", networkName}, 5*time.Second)
	}
	return nil
}

func CreateNetwork(ctx context.Context, name string) error {
	_, err := Exec(ctx, []string{"network", "create", "--internal", name}, 8*time.Second)
	return err
}

func RemoveNetwork(ctx context.Context, name string) error {
	_, err := Exec(ctx, []string{"network", "rm", name}, 5*time.Second)
	return err
}

func NetworkConnect(ctx context.Context, network, container, alias string) error {
	args := []string{"network", "connect"}
	if alias != "" {
		args = append(args, "--alias", alias)
	}
	args = append(args, network, container)
	_, err := Exec(ctx, args, 10*time.Second)
	return err
}

func NetworkDisconnect(ctx context.Context, network, container string) error {
	_, err := Exec(ctx, []string{"network", "disconnect", "-f", network, container}, 10*time.Second)
	return err
}

// RuntimeConfig defines the security and filesystem profile for a language runtime
type RuntimeConfig struct {
	TmpfsMounts []string
}

// RuntimeProfiles defines the production-grade, extensible configuration for supported runtimes.
// This allows adding new languages (Rust, Java, etc.) without changing the core logic.
var RuntimeProfiles = map[string]RuntimeConfig{
	"node": {
		TmpfsMounts: []string{"/home/node/.npm:rw,size=200m"},
	},
	"playwright": {
		TmpfsMounts: []string{"/home/pwuser/.npm:rw,size=200m"},
	},
	"ui_jsdom": {
		TmpfsMounts: []string{"/home/node/.npm:rw,size=200m"},
	},
	"python": {
		// Python pip needs writable .local for user installs and cache dir
		// Since we run as 1000:1000 and HOME is often /, we mount these locations.
		TmpfsMounts: []string{
			"/.local:rw,size=200m",
			"/.cache:rw,size=200m",
		},
	},
	// Default fallbacks or future languages can be added here
}

func dockerRunArgs(containerWorkDir, hostWorkDir string, env map[string]string, memoryLimitMb int, runtime string, skipReadOnly bool) []string {
	workDir := containerWorkDir
	if workDir == "" {
		workDir = "/app"
	}

	args := []string{
		"--memory", fmt.Sprintf("%dm", memoryLimitMb),
		"--memory-swap", fmt.Sprintf("%dm", memoryLimitMb),
		"--cpus", "1",
		"--pids-limit", "150",
		"--tmpfs", "/tmp:rw,nosuid,size=200m",
		"-v", fmt.Sprintf("%s:%s:rw", hostWorkDir, workDir),
		"-w", workDir,
		"--user", "1000:1000",
	}

	// Ephemeral containers use --read-only for security hardening.
	// Pooled/long-lived containers skip this to allow procps installation for process cleanup.
	if !skipReadOnly {
		args = append(args, "--read-only")
	}

	// Apply runtime-specific configuration
	if config, ok := RuntimeProfiles[runtime]; ok {
		for _, mount := range config.TmpfsMounts {
			args = append(args, "--tmpfs", mount)
		}
	} else if runtime == "" {
		// Default to node behavior for backward compatibility if runtime undefined
		for _, mount := range RuntimeProfiles["node"].TmpfsMounts {
			args = append(args, "--tmpfs", mount)
		}
	}

	for key, value := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", key, value))
	}

	return args
}

func truncateLog(s string) string {
	if len(s) > 500 {
		return s[:500] + "...[truncated]"
	}
	return s
}
