/**
 * Dependency Cache Manager (EC-12)
 * 
 * Manages host-based caches for node_modules and other runtime dependencies.
 * Uses a builder container to ensure binary compatibility with runner containers.
 * 
 * Features:
 * - Size quotas to prevent disk exhaustion
 * - LRU eviction for oldest unused caches
 * - TTL-based expiration
 * - Metadata tracking in memory (could be persisted to Redis for multi-instance)
 */

import { spawn } from 'child_process';
import { mkdir, rm, readdir, stat, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { Mutex } from 'async-mutex';
import { computeDependencyHash } from './container-pool.js';

// ============ Constants ============

// Cache directory - override with GRADING_CACHE_DIR env var
const HOST_CACHE_DIR = process.env.GRADING_CACHE_DIR || '/tmp/grading-cache';
const METADATA_FILE = 'cache-metadata.json';

// Limits (EC-12)
const MAX_CACHE_SIZE_GB = parseInt(process.env.CACHE_MAX_SIZE_GB || '10', 10);
const MAX_CACHE_ENTRIES = parseInt(process.env.CACHE_MAX_ENTRIES || '100', 10);
const CACHE_TTL_DAYS = parseInt(process.env.CACHE_TTL_DAYS || '7', 10);
const BUILD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for npm install

// ============ Types ============

interface CacheMetadata {
    hash: string;
    runtime: 'node' | 'python' | 'go' | 'rust';
    createdAt: string;
    lastUsedAt: string;
    sizeBytes: number;
    dependencyCount: number;
}

interface CacheStatus {
    totalEntries: number;
    totalSizeBytes: number;
    entries: CacheMetadata[];
}

// ============ State ============

const cacheMetadata = new Map<string, CacheMetadata>();
const cacheMutex = new Mutex();
let cacheInitialized = false;

// ============ Docker Helpers ============

async function dockerExec(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`Docker command timeout: docker ${args.slice(0, 5).join(' ')}...`));
        }, timeoutMs);

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(`Docker command failed (${code}): ${stderr}`));
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ============ Cache Functions ============

/**
 * Initialize cache system
 */
export async function initializeCache(): Promise<void> {
    if (cacheInitialized) return;
    
    console.log(`[Cache] Initializing cache at ${HOST_CACHE_DIR}`);
    
    // Create cache directory
    await mkdir(HOST_CACHE_DIR, { recursive: true });
    
    // Load existing metadata
    await loadCacheMetadata();
    
    // Cleanup expired entries
    await cleanupExpiredEntries();
    
    cacheInitialized = true;
    console.log(`[Cache] Initialized with ${cacheMetadata.size} entries`);
}

/**
 * Load cache metadata from disk
 */
async function loadCacheMetadata(): Promise<void> {
    try {
        const metadataPath = join(HOST_CACHE_DIR, METADATA_FILE);
        if (existsSync(metadataPath)) {
            const content = await readFile(metadataPath, 'utf-8');
            const data = JSON.parse(content) as CacheMetadata[];
            for (const entry of data) {
                // Verify the cache directory still exists
                const cachePath = join(HOST_CACHE_DIR, entry.hash);
                if (existsSync(cachePath)) {
                    cacheMetadata.set(entry.hash, entry);
                }
            }
        }
    } catch (error) {
        console.warn('[Cache] Failed to load metadata, starting fresh:', error);
    }
}

/**
 * Save cache metadata to disk
 */
async function saveCacheMetadata(): Promise<void> {
    try {
        const metadataPath = join(HOST_CACHE_DIR, METADATA_FILE);
        const data = [...cacheMetadata.values()];
        await writeFile(metadataPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.warn('[Cache] Failed to save metadata:', error);
    }
}

/**
 * Check if dependencies are cached
 */
export function isCached(deps: Record<string, string>): boolean {
    const hash = computeDependencyHash(deps);
    return cacheMetadata.has(hash);
}

/**
 * Get cache path for dependencies
 */
export function getCachePath(deps: Record<string, string>): string | null {
    const hash = computeDependencyHash(deps);
    if (cacheMetadata.has(hash)) {
        // Update last used time
        const metadata = cacheMetadata.get(hash)!;
        metadata.lastUsedAt = new Date().toISOString();
        return join(HOST_CACHE_DIR, hash);
    }
    return null;
}

/**
 * Ensure dependencies are built and cached
 * Uses a builder container for binary compatibility
 */
export async function ensureDependenciesBuilt(config: {
    dependencies: Record<string, string>;
    runtime: 'node' | 'python' | 'go' | 'rust';
    image: string;
}): Promise<string> {
    const { dependencies, runtime, image } = config;
    const hash = computeDependencyHash(dependencies);
    
    return await cacheMutex.runExclusive(async () => {
        // Check if already cached
        const existing = cacheMetadata.get(hash);
        if (existing) {
            existing.lastUsedAt = new Date().toISOString();
            console.log(`[Cache] Cache hit for ${hash}`);
            return join(HOST_CACHE_DIR, hash);
        }
        
        // Enforce quotas before building
        await enforceQuotas();
        
        // Build in container
        console.log(`[Cache] Building dependencies for ${hash} (${Object.keys(dependencies).length} deps)`);
        const cachePath = join(HOST_CACHE_DIR, hash);
        
        await buildDependenciesInContainer({
            hash,
            dependencies,
            runtime,
            image,
            outputPath: cachePath,
        });
        
        // Calculate size
        const sizeBytes = await calculateDirSize(cachePath);
        
        // Add to metadata
        const metadata: CacheMetadata = {
            hash,
            runtime,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString(),
            sizeBytes,
            dependencyCount: Object.keys(dependencies).length,
        };
        cacheMetadata.set(hash, metadata);
        await saveCacheMetadata();
        
        console.log(`[Cache] Built and cached ${hash} (${(sizeBytes / 1024 / 1024).toFixed(2)}MB)`);
        return cachePath;
    });
}

/**
 * Build dependencies in a container for binary compatibility
 */
async function buildDependenciesInContainer(config: {
    hash: string;
    dependencies: Record<string, string>;
    runtime: 'node' | 'python' | 'go' | 'rust';
    image: string;
    outputPath: string;
}): Promise<void> {
    const { hash, dependencies, runtime, image, outputPath } = config;
    
    // Create output directory
    await mkdir(outputPath, { recursive: true });
    
    // Create temp directory for build
    const buildDir = join(HOST_CACHE_DIR, `build_${hash}_${Date.now()}`);
    await mkdir(buildDir, { recursive: true });
    
    try {
        // Runtime-specific build
        switch (runtime) {
            case 'node':
                await buildNodeDependencies(buildDir, outputPath, dependencies, image);
                break;
            case 'python':
                await buildPythonDependencies(buildDir, outputPath, dependencies, image);
                break;
            case 'go':
                await buildGoDependencies(buildDir, outputPath, dependencies, image);
                break;
            case 'rust':
                await buildRustDependencies(buildDir, outputPath, dependencies, image);
                break;
            default:
                throw new Error(`Unsupported runtime: ${runtime}`);
        }
    } finally {
        // Cleanup build directory
        await rm(buildDir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * Build Node.js dependencies
 */
async function buildNodeDependencies(
    buildDir: string,
    outputPath: string,
    dependencies: Record<string, string>,
    image: string
): Promise<void> {
    // Create package.json
    const packageJson = {
        name: 'cached-deps',
        version: '1.0.0',
        private: true,
        dependencies: { ...dependencies },
        devDependencies: {
            'jest': '^29.7.0',
            'supertest': '^6.3.3',
        },
    };
    await writeFile(join(buildDir, 'package.json'), JSON.stringify(packageJson, null, 2));
    
    // Run npm install in container
    const containerName = `cache_builder_${Date.now()}`;
    const nodeModulesPath = join(outputPath, 'node_modules');
    
    await dockerExec([
        'run', '--rm',
        '--name', containerName,
        '-v', `${buildDir}:/build:rw`,
        '-v', `${outputPath}:/output:rw`,
        '-w', '/build',
        '--memory', '1024m',
        '--cpus', '2',
        image,
        'sh', '-c', 'npm install --legacy-peer-deps 2>&1 && cp -r node_modules /output/',
    ], BUILD_TIMEOUT_MS);
}

/**
 * Build Python dependencies
 */
async function buildPythonDependencies(
    buildDir: string,
    outputPath: string,
    dependencies: Record<string, string>,
    image: string
): Promise<void> {
    // Create requirements.txt
    const requirements = Object.entries(dependencies)
        .map(([pkg, version]) => version ? `${pkg}==${version}` : pkg)
        .join('\n');
    await writeFile(join(buildDir, 'requirements.txt'), requirements);
    
    const containerName = `cache_builder_${Date.now()}`;
    
    await dockerExec([
        'run', '--rm',
        '--name', containerName,
        '-v', `${buildDir}:/build:rw`,
        '-v', `${outputPath}:/output:rw`,
        '-w', '/build',
        '--memory', '1024m',
        '--cpus', '2',
        image,
        'sh', '-c', 'pip install --target=/output/site-packages -r requirements.txt 2>&1',
    ], BUILD_TIMEOUT_MS);
}

/**
 * Build Go dependencies
 */
async function buildGoDependencies(
    buildDir: string,
    outputPath: string,
    dependencies: Record<string, string>,
    image: string
): Promise<void> {
    // Create go.mod
    const goMod = `module cached-deps\n\ngo 1.21\n\nrequire (\n${
        Object.entries(dependencies)
            .map(([pkg, version]) => `\t${pkg} ${version}`)
            .join('\n')
    }\n)`;
    await writeFile(join(buildDir, 'go.mod'), goMod);
    
    const containerName = `cache_builder_${Date.now()}`;
    
    await dockerExec([
        'run', '--rm',
        '--name', containerName,
        '-v', `${buildDir}:/build:rw`,
        '-v', `${outputPath}:/output:rw`,
        '-w', '/build',
        '-e', 'GOPATH=/output/go',
        '-e', 'GOCACHE=/tmp/go-cache',
        '--memory', '1024m',
        '--cpus', '2',
        image,
        'sh', '-c', 'go mod download 2>&1',
    ], BUILD_TIMEOUT_MS);
}

/**
 * Build Rust dependencies
 */
async function buildRustDependencies(
    buildDir: string,
    outputPath: string,
    dependencies: Record<string, string>,
    image: string
): Promise<void> {
    // Create Cargo.toml
    const cargoToml = `[package]\nname = "cached-deps"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\n${
        Object.entries(dependencies)
            .map(([pkg, version]) => `${pkg} = "${version}"`)
            .join('\n')
    }`;
    await writeFile(join(buildDir, 'Cargo.toml'), cargoToml);
    
    // Create empty main.rs
    await mkdir(join(buildDir, 'src'), { recursive: true });
    await writeFile(join(buildDir, 'src', 'main.rs'), 'fn main() {}');
    
    const containerName = `cache_builder_${Date.now()}`;
    
    await dockerExec([
        'run', '--rm',
        '--name', containerName,
        '-v', `${buildDir}:/build:rw`,
        '-v', `${outputPath}:/output:rw`,
        '-w', '/build',
        '-e', 'CARGO_HOME=/output/cargo',
        '--memory', '2048m',
        '--cpus', '2',
        image,
        'sh', '-c', 'cargo fetch 2>&1',
    ], BUILD_TIMEOUT_MS);
}

/**
 * Calculate directory size
 */
async function calculateDirSize(dirPath: string): Promise<number> {
    let totalSize = 0;
    
    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const entryPath = join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                totalSize += await calculateDirSize(entryPath);
            } else {
                const stats = await stat(entryPath);
                totalSize += stats.size;
            }
        }
    } catch {
        // Directory might not exist
    }
    
    return totalSize;
}

/**
 * Enforce cache quotas (EC-12)
 * LRU eviction when limits are exceeded
 */
async function enforceQuotas(): Promise<void> {
    let totalSize = 0;
    for (const meta of cacheMetadata.values()) {
        totalSize += meta.sizeBytes;
    }
    
    const maxSizeBytes = MAX_CACHE_SIZE_GB * 1024 * 1024 * 1024;
    
    // Check if over limits
    if (totalSize <= maxSizeBytes && cacheMetadata.size <= MAX_CACHE_ENTRIES) {
        return;
    }
    
    console.log(`[Cache] Enforcing quotas: ${cacheMetadata.size} entries, ${(totalSize / 1024 / 1024 / 1024).toFixed(2)}GB`);
    
    // Sort by last used (LRU)
    const sorted = [...cacheMetadata.entries()]
        .sort((a, b) => new Date(a[1].lastUsedAt).getTime() - new Date(b[1].lastUsedAt).getTime());
    
    // Evict oldest until under limits
    for (const [hash, meta] of sorted) {
        if (totalSize <= maxSizeBytes * 0.8 && cacheMetadata.size <= MAX_CACHE_ENTRIES * 0.8) {
            break;
        }
        
        console.log(`[Cache] Evicting ${hash} (${(meta.sizeBytes / 1024 / 1024).toFixed(2)}MB, last used: ${meta.lastUsedAt})`);
        
        await rm(join(HOST_CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {});
        cacheMetadata.delete(hash);
        totalSize -= meta.sizeBytes;
    }
    
    await saveCacheMetadata();
}

/**
 * Cleanup expired entries
 */
async function cleanupExpiredEntries(): Promise<number> {
    const now = Date.now();
    const maxAgeMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    let cleanedCount = 0;
    
    for (const [hash, meta] of cacheMetadata) {
        const lastUsed = new Date(meta.lastUsedAt).getTime();
        
        if (now - lastUsed > maxAgeMs) {
            console.log(`[Cache] Removing expired entry: ${hash}`);
            await rm(join(HOST_CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {});
            cacheMetadata.delete(hash);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        await saveCacheMetadata();
        console.log(`[Cache] Cleaned up ${cleanedCount} expired entries`);
    }
    
    return cleanedCount;
}

/**
 * Get cache status
 */
export function getCacheStatus(): CacheStatus {
    let totalSizeBytes = 0;
    const entries: CacheMetadata[] = [];
    
    for (const meta of cacheMetadata.values()) {
        totalSizeBytes += meta.sizeBytes;
        entries.push({ ...meta });
    }
    
    return {
        totalEntries: cacheMetadata.size,
        totalSizeBytes,
        entries: entries.sort((a, b) => 
            new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
        ),
    };
}

/**
 * Clear all cache
 */
export async function clearCache(): Promise<void> {
    console.log('[Cache] Clearing all cache...');
    
    for (const hash of cacheMetadata.keys()) {
        await rm(join(HOST_CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {});
    }
    
    cacheMetadata.clear();
    await saveCacheMetadata();
    
    console.log('[Cache] Cache cleared');
}

/**
 * Remove specific cache entry
 */
export async function removeFromCache(deps: Record<string, string>): Promise<boolean> {
    const hash = computeDependencyHash(deps);
    
    if (cacheMetadata.has(hash)) {
        await rm(join(HOST_CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {});
        cacheMetadata.delete(hash);
        await saveCacheMetadata();
        console.log(`[Cache] Removed ${hash}`);
        return true;
    }
    
    return false;
}

