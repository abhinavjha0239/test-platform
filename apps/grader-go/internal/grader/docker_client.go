package grader

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

// DockerClientImpl implements DockerClient using CLI commands
type DockerClientImpl struct{}

// NewDockerClient creates a new Docker client using CLI
func NewDockerClient() (*DockerClientImpl, error) {
	// Verify docker is available by running a simple command
	ctx := context.Background()
	_, err := docker.Exec(ctx, []string{"version", "--format", "{{.Server.Version}}"}, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("docker not available: %w", err)
	}
	return &DockerClientImpl{}, nil
}

// CreateContainer creates a new PostgreSQL container with security limits
func (d *DockerClientImpl) CreateContainer(ctx context.Context, imageName string, env map[string]string, internalPort int) (string, error) {
	// Build docker run arguments with security hardening
	args := []string{
		"run", "-d",
		"--rm",
		"-p", fmt.Sprintf("0.0.0.0::%d", internalPort), // Random host port, allow remote access
		// Security: Resource limits to prevent abuse
		"--memory", "256m",
		"--memory-swap", "256m",
		"--cpus", "0.5",
		"--pids-limit", "50",
		// Security: Read-only root filesystem with writable PostgreSQL data dirs
		"--read-only",
		"--tmpfs", "/var/lib/postgresql/data:rw,size=100m",
		"--tmpfs", "/run/postgresql:rw,size=10m",
		"--tmpfs", "/tmp:rw,size=50m",
		// Security: No privilege escalation
		"--security-opt", "no-new-privileges:true",
	}

	// Add environment variables
	for k, v := range env {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}

	args = append(args, imageName)

	result, err := docker.Exec(ctx, args, 60*time.Second)
	if err != nil {
		return "", fmt.Errorf("container create failed: %w", err)
	}

	containerID := strings.TrimSpace(result.Stdout)
	if containerID == "" {
		return "", fmt.Errorf("no container ID returned")
	}

	return containerID, nil
}

// StartContainer starts a container (already started by docker run -d)
func (d *DockerClientImpl) StartContainer(ctx context.Context, containerID string) error {
	// Container is already started by docker run -d
	return nil
}

// StopContainer stops a container
func (d *DockerClientImpl) StopContainer(ctx context.Context, containerID string) error {
	_, err := docker.Exec(ctx, []string{"stop", "-t", "2", containerID}, 10*time.Second)
	return err
}

// RemoveContainer removes a container
func (d *DockerClientImpl) RemoveContainer(ctx context.Context, containerID string) error {
	_, err := docker.Exec(ctx, []string{"rm", "-f", containerID}, 10*time.Second)
	return err
}

// WaitForHealthy waits for the container to be ready
func (d *DockerClientImpl) WaitForHealthy(ctx context.Context, containerID string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		result, err := docker.Exec(ctx, []string{
			"inspect", "-f", "{{.State.Running}}", containerID,
		}, 5*time.Second)
		if err == nil && strings.TrimSpace(result.Stdout) == "true" {
			// Container is running, wait a bit for postgres to initialize
			time.Sleep(2 * time.Second)
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("container not healthy after %v", timeout)
}

// GetContainerPort gets the host port mapped to an internal port
func (d *DockerClientImpl) GetContainerPort(ctx context.Context, containerID string, internalPort int) (int, error) {
	result, err := docker.Exec(ctx, []string{
		"port", containerID, fmt.Sprintf("%d/tcp", internalPort),
	}, 5*time.Second)
	if err != nil {
		return 0, fmt.Errorf("failed to get port mapping: %w", err)
	}

	// Output format: 0.0.0.0:32768 or 127.0.0.1:32768
	output := strings.TrimSpace(result.Stdout)
	parts := strings.Split(output, ":")
	if len(parts) != 2 {
		return 0, fmt.Errorf("unexpected port format: %s", output)
	}

	port, err := strconv.Atoi(parts[1])
	if err != nil {
		return 0, fmt.Errorf("invalid port number: %s", parts[1])
	}

	return port, nil
}

// Ping checks if Docker daemon is available
func (d *DockerClientImpl) Ping(ctx context.Context) error {
	_, err := docker.Exec(ctx, []string{"info"}, 5*time.Second)
	return err
}
