package pool

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/yourorg/exam-platform/apps/grader-go/internal/docker"
)

const (
	defaultCacheDir   = "/var/grader/cache"
	defaultMaxCacheMB = 10 * 1024 // 10GB
	metadataFile      = ".cache_meta.json"
)

// CacheEntry represents a cached dependency set
type CacheEntry struct {
	Hash       string    `json:"hash"`
	Runtime    string    `json:"runtime"`
	Size       int64     `json:"size"`
	CreatedAt  time.Time `json:"createdAt"`
	LastUsedAt time.Time `json:"lastUsedAt"`
	UseCount   int       `json:"useCount"`
}

// DependencyCache manages host-based dependency caching with LRU eviction
type DependencyCache struct {
	cacheDir   string
	maxSizeMB  int64
	entries    map[string]*CacheEntry
	mu         sync.RWMutex
	logger     *slog.Logger
}

// DependencyCacheConfig holds cache configuration
type DependencyCacheConfig struct {
	CacheDir  string
	MaxSizeMB int64
}

// NewDependencyCache creates a dependency cache
func NewDependencyCache(config DependencyCacheConfig) (*DependencyCache, error) {
	if config.CacheDir == "" {
		config.CacheDir = defaultCacheDir
	}
	if config.MaxSizeMB <= 0 {
		config.MaxSizeMB = defaultMaxCacheMB
	}

	// Ensure cache directory exists
	if err := os.MkdirAll(config.CacheDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create cache dir: %w", err)
	}

	cache := &DependencyCache{
		cacheDir:  config.CacheDir,
		maxSizeMB: config.MaxSizeMB,
		entries:   make(map[string]*CacheEntry),
		logger:    slog.Default().With("component", "depcache"),
	}

	// Load existing metadata
	if err := cache.loadMetadata(); err != nil {
		cache.logger.Warn("failed to load metadata", "error", err)
	}

	return cache, nil
}

// ComputeHash generates a hash for dependencies
func ComputeHash(deps map[string]string, runtime string) string {
	// Sort keys for consistent hashing
	keys := make([]string, 0, len(deps))
	for k := range deps {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	h := sha256.New()
	h.Write([]byte(runtime))
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte(deps[k]))
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// GetCachePath returns the path for a dependency hash
func (c *DependencyCache) GetCachePath(hash string) string {
	return filepath.Join(c.cacheDir, hash)
}

// HasCache checks if dependencies are cached
func (c *DependencyCache) HasCache(hash string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.entries[hash]
	if !exists {
		return false
	}

	// Verify directory still exists
	cachePath := c.GetCachePath(hash)
	if _, err := os.Stat(cachePath); os.IsNotExist(err) {
		return false
	}

	// Update last used
	entry.LastUsedAt = time.Now()
	entry.UseCount++
	return true
}

// BuildAndCache builds dependencies and caches them
func (c *DependencyCache) BuildAndCache(ctx context.Context, hash, runtime, installCmd, image string, deps map[string]string) error {
	cachePath := c.GetCachePath(hash)

	// Check if already cached
	if c.HasCache(hash) {
		c.logger.Debug("cache hit", "hash", hash)
		return nil
	}

	c.logger.Info("building cache", "hash", hash)

	// Create cache directory
	if err := os.MkdirAll(cachePath, 0755); err != nil {
		return fmt.Errorf("failed to create cache path: %w", err)
	}

	// Write package files
	if err := c.writeDepsFiles(cachePath, runtime, deps); err != nil {
		os.RemoveAll(cachePath)
		return fmt.Errorf("failed to write deps: %w", err)
	}

	// Run install in container
	_, err := docker.RunOnce(ctx, docker.RunOnceOptions{
		Name:             fmt.Sprintf("grader_cache_%s", hash),
		Network:          "bridge",
		Image:            image,
		WorkDir:          cachePath,
		ContainerWorkDir: "/app",
		Command:          installCmd,
		MemoryLimitMb:    2048,
		Timeout:          10 * time.Minute,
	})
	if err != nil {
		os.RemoveAll(cachePath)
		return fmt.Errorf("install failed: %w", err)
	}

	// Calculate size
	size, _ := dirSize(cachePath)

	// Add entry
	c.mu.Lock()
	c.entries[hash] = &CacheEntry{
		Hash:       hash,
		Runtime:    runtime,
		Size:       size,
		CreatedAt:  time.Now(),
		LastUsedAt: time.Now(),
		UseCount:   1,
	}
	c.mu.Unlock()

	// Save metadata
	c.saveMetadata()

	// Evict if needed
	c.evictIfNeeded()

	c.logger.Info("cached dependencies", "hash", hash, "sizeMB", size/(1024*1024))
	return nil
}

// writeDepsFiles writes dependency files to cache directory
func (c *DependencyCache) writeDepsFiles(cachePath, runtime string, deps map[string]string) error {
	switch runtime {
	case "node", "":
		// Write package.json
		pkgJSON := map[string]interface{}{
			"name":         "cached-deps",
			"version":      "1.0.0",
			"dependencies": deps,
		}
		data, _ := json.MarshalIndent(pkgJSON, "", "  ")
		return os.WriteFile(filepath.Join(cachePath, "package.json"), data, 0644)

	case "python":
		// Write requirements.txt
		var content string
		for pkg, ver := range deps {
			if ver != "" && ver != "*" {
				content += fmt.Sprintf("%s==%s\n", pkg, ver)
			} else {
				content += pkg + "\n"
			}
		}
		return os.WriteFile(filepath.Join(cachePath, "requirements.txt"), []byte(content), 0644)

	case "go":
		// Write go.mod
		content := "module cached\n\ngo 1.21\n\nrequire (\n"
		for pkg, ver := range deps {
			content += fmt.Sprintf("\t%s %s\n", pkg, ver)
		}
		content += ")\n"
		return os.WriteFile(filepath.Join(cachePath, "go.mod"), []byte(content), 0644)

	default:
		return fmt.Errorf("unsupported runtime: %s", runtime)
	}
}

// CopyToWorkspace copies cached deps to a workspace
func (c *DependencyCache) CopyToWorkspace(hash, workDir string) error {
	cachePath := c.GetCachePath(hash)
	if !c.HasCache(hash) {
		return fmt.Errorf("cache not found: %s", hash)
	}

	// Copy node_modules, pip packages, or go modules
	entries, err := os.ReadDir(cachePath)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.Name() == metadataFile {
			continue
		}

		src := filepath.Join(cachePath, entry.Name())
		dst := filepath.Join(workDir, entry.Name())

		// Use symlink for node_modules to save space
		if entry.Name() == "node_modules" {
			if err := os.Symlink(src, dst); err != nil {
				// Fallback to copy if symlink fails
				if err := copyDir(src, dst); err != nil {
					return err
				}
			}
		} else {
			if err := copyFile(src, dst); err != nil {
				return err
			}
		}
	}

	return nil
}

// evictIfNeeded removes oldest entries when cache is full
func (c *DependencyCache) evictIfNeeded() {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Calculate current size
	var totalSize int64
	for _, entry := range c.entries {
		totalSize += entry.Size
	}

	maxSize := c.maxSizeMB * 1024 * 1024
	if totalSize <= maxSize {
		return
	}

	// Sort by last used (LRU)
	entries := make([]*CacheEntry, 0, len(c.entries))
	for _, entry := range c.entries {
		entries = append(entries, entry)
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].LastUsedAt.Before(entries[j].LastUsedAt)
	})

	// Evict oldest until under limit
	for _, entry := range entries {
		if totalSize <= maxSize {
			break
		}

		c.logger.Info("evicting cache", "hash", entry.Hash, "lastUsed", entry.LastUsedAt.Format(time.RFC3339))
		os.RemoveAll(c.GetCachePath(entry.Hash))
		delete(c.entries, entry.Hash)
		totalSize -= entry.Size
	}
}

// Clear removes all cached entries
func (c *DependencyCache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for hash := range c.entries {
		os.RemoveAll(c.GetCachePath(hash))
	}
	c.entries = make(map[string]*CacheEntry)
	c.saveMetadata()

	c.logger.Info("cache cleared")
	return nil
}

// Stats returns cache statistics
func (c *DependencyCache) Stats() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var totalSize int64
	for _, entry := range c.entries {
		totalSize += entry.Size
	}

	return map[string]interface{}{
		"entries":     len(c.entries),
		"totalSizeMB": totalSize / (1024 * 1024),
		"maxSizeMB":   c.maxSizeMB,
	}
}

// loadMetadata loads cache metadata from disk
func (c *DependencyCache) loadMetadata() error {
	path := filepath.Join(c.cacheDir, metadataFile)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	return json.Unmarshal(data, &c.entries)
}

// saveMetadata persists cache metadata to disk
func (c *DependencyCache) saveMetadata() {
	c.mu.RLock()
	defer c.mu.RUnlock()

	path := filepath.Join(c.cacheDir, metadataFile)
	data, _ := json.MarshalIndent(c.entries, "", "  ")
	os.WriteFile(path, data, 0644)
}

// Helper functions

func dirSize(path string) (int64, error) {
	var size int64
	err := filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if !info.IsDir() {
			size += info.Size()
		}
		return nil
	})
	return size, err
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(src, path)
		dstPath := filepath.Join(dst, relPath)

		if info.IsDir() {
			return os.MkdirAll(dstPath, info.Mode())
		}

		return copyFile(path, dstPath)
	})
}
