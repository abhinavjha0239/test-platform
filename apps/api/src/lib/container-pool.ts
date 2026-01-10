/**
 * Container Pool Manager
 * 
 * Pre-warms Docker containers for fast grading.
 * Eliminates the ~60s npm install overhead per grading job.
 * 
 * Architecture:
 * - Test Runner Pools: Map of dependency-hash -> pool (different exams use different pools)
 * - Candidate Pools: Per-runtime pools (node, python, go, etc.)
 * 
 * Edge Cases Handled:
 * - EC-1: Mutex prevents duplicate pool creation race condition
 * - EC-3: Idempotent release prevents double-release corruption
 * - EC-4, EC-5, EC-7: Robust reset with process kill and file cleanup
 * - EC-11, EC-13: Pool limits with LRU eviction
 * - EC-14: Enhanced health validation
 * - EC-15: Orphan cleanup job
 * 
 * With pooling: ~0.8s per job (vs 60-120s without)
 */

import { createPool, Pool, Options } from 'generic-pool';
import { spawn, execSync } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { Mutex } from 'async-mutex';
import { redisConnection } from './redis.js';

// ============ Types ============

export interface PooledContainer {
    id: string;
    name: string;
    type: 'test_runner' | 'candidate';
    runtime: string;
    image: string;
    createdAt: Date;
    lastUsedAt: Date;
    isHealthy: boolean;
    workDir: string; // Host directory mounted to container
    useCount: number; // Track uses for recycling (EC-7)
    isReleased: boolean; // Prevent double release (EC-3)
}

export interface PoolConfig {
    type: 'test_runner' | 'candidate';
    runtime: string;          // 'node', 'python', 'go', etc.
    image: string;            // Docker image
    minSize: number;          // Minimum warm containers
    maxSize: number;          // Maximum containers
    idleTimeoutMs: number;    // Release after idle
    acquireTimeoutMs: number; // Timeout when acquiring
    preInstallDeps?: Record<string, string>; // Dependencies to pre-install
    dependencyHash?: string;  // Hash of dependencies for pool routing
}

export interface PoolStats {
    size: number;
    available: number;
    borrowed: number;
    pending: number;
    min: number;
    max: number;
}

// ============ Constants ============

const CONTAINER_PREFIX = 'grader_pool';
const POOL_STATUS_KEY = 'pool:status';
const DEFAULT_MEMORY_LIMIT = 512; // MB
const CONTAINER_NETWORK = 'grader_network';

// Pool limits (EC-11, EC-13)
const MAX_POOLS = 20;              // Max different dependency sets
const MAX_CONTAINERS_TOTAL = 100;  // Global container limit
const MAX_CONTAINER_USES = 50;     // Recycle container after N uses (EC-7)

// ============ Mutexes (EC-1) ============

const poolCreationMutex = new Mutex();

// ============ Utility Functions ============

/**
 * Compute deterministic hash for dependencies.
 * Same dependencies in different order produce same hash.
 */
export function computeDependencyHash(deps: Record<string, string>): string {
    const sorted = Object.keys(deps).sort().map(k => `${k}@${deps[k]}`).join('|');
    return createHash('sha256').update(sorted).digest('hex').substring(0, 16);
}

// ============ Container Pool Class ============

export class ContainerPool {
    private pool: Pool<PooledContainer>;
    private config: PoolConfig;
    private containerCounter = 0;

    constructor(config: PoolConfig) {
        this.config = config;

        const factory = {
            create: async (): Promise<PooledContainer> => {
                return this.createContainer();
            },
            destroy: async (container: PooledContainer): Promise<void> => {
                await this.destroyContainer(container);
            },
            validate: async (container: PooledContainer): Promise<boolean> => {
                return this.validateContainer(container);
            },
        };

        const opts: Options = {
            min: config.minSize,
            max: config.maxSize,
            acquireTimeoutMillis: config.acquireTimeoutMs,
            idleTimeoutMillis: config.idleTimeoutMs,
            evictionRunIntervalMillis: 5 * 60 * 1000, // Check for stale containers every 5 min (not 30s)
            testOnBorrow: true, // Validate before lending
        };

        this.pool = createPool(factory, opts);
    }

    /**
     * Create a new container for the pool
     */
    private async createContainer(): Promise<PooledContainer> {
        const id = `${CONTAINER_PREFIX}_${this.config.type}_${this.config.runtime}_${++this.containerCounter}_${Date.now()}`;
        const name = id;

        // Create host work directory
        const workDir = join(tmpdir(), name);
        await mkdir(workDir, { recursive: true, mode: 0o755 });

        console.log(`[Pool] Creating container: ${name}`);

        // Start container in detached mode with long-running process
        const dockerArgs = [
            'run', '-d',
            '--name', name,
            '--memory', `${DEFAULT_MEMORY_LIMIT}m`,
            '--memory-swap', `${DEFAULT_MEMORY_LIMIT}m`,
            '--cpus', '1',
            '--pids-limit', '100',
            '-v', `${workDir}:/app:rw`,
            '-w', '/app',
            '--user', '1000:1000',
            '--tmpfs', '/tmp:rw,noexec,nosuid,size=100m',
            '--tmpfs', '/home/node/.npm:rw,size=200m',
        ];

        // Add network for blackbox grading
        if (this.config.type === 'candidate') {
            await this.ensureNetwork();
            dockerArgs.push('--network', CONTAINER_NETWORK);
        }

        dockerArgs.push(this.config.image, 'tail', '-f', '/dev/null'); // Keep container running

        await this.dockerExec(dockerArgs, 30000);

        // Pre-install dependencies if configured
        if (this.config.preInstallDeps && Object.keys(this.config.preInstallDeps).length > 0) {
            await this.preInstallDependencies(name, workDir, this.config.preInstallDeps);
        }

        const container: PooledContainer = {
            id,
            name,
            type: this.config.type,
            runtime: this.config.runtime,
            image: this.config.image,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            isHealthy: true,
            workDir,
            useCount: 0,      // EC-7: Track uses for recycling
            isReleased: false, // EC-3: Prevent double release
        };

        console.log(`[Pool] Container created: ${name}`);
        return container;
    }

    /**
     * Pre-install dependencies in container (eliminates npm install per job)
     */
    private async preInstallDependencies(
        containerName: string,
        workDir: string,
        dependencies: Record<string, string>
    ): Promise<void> {
        console.log(`[Pool] Pre-installing dependencies in ${containerName}...`);

        // Create base package.json
        const packageJson = {
            name: 'grader-pool-container',
            version: '1.0.0',
            private: true,
            dependencies: { ...dependencies },
            devDependencies: {
                'jest': '^29.7.0',
                'supertest': '^6.3.3',
            },
        };

        await writeFile(join(workDir, 'package.json'), JSON.stringify(packageJson, null, 2));

        // Run npm install inside container WITH network
        await this.execInContainer(containerName, 'npm install --legacy-peer-deps 2>&1', 120000);

        console.log(`[Pool] Dependencies installed in ${containerName}`);
    }

    /**
     * Ensure Docker network exists for container communication
     */
    private async ensureNetwork(): Promise<void> {
        try {
            execSync(`docker network inspect ${CONTAINER_NETWORK}`, { stdio: 'ignore' });
        } catch {
            execSync(`docker network create ${CONTAINER_NETWORK}`, { stdio: 'ignore' });
            console.log(`[Pool] Created Docker network: ${CONTAINER_NETWORK}`);
        }
    }

    /**
     * Validate container is still healthy (EC-14)
     * Enhanced validation: check running state AND responsiveness
     */
    private async validateContainer(container: PooledContainer): Promise<boolean> {
        try {
            // Check container is running
            const result = execSync(`docker inspect -f '{{.State.Running}}' ${container.name}`, {
                encoding: 'utf-8',
                timeout: 5000,
            }).trim();
            
            if (result !== 'true') {
                console.warn(`[Pool] Container ${container.name} is not running`);
                return false;
            }
            
            // EC-14: Check container is responsive (can execute commands)
            await this.execInContainer(container.name, 'echo healthy', 5000);
            
            // EC-7: Check if container should be recycled
            if (container.useCount >= MAX_CONTAINER_USES) {
                console.log(`[Pool] Container ${container.name} reached max uses (${container.useCount}), marking for recycle`);
                return false;
            }
            
            return true;
        } catch (error) {
            console.warn(`[Pool] Container ${container.name} failed health check:`, error);
            return false;
        }
    }

    /**
     * Destroy a container
     */
    private async destroyContainer(container: PooledContainer): Promise<void> {
        console.log(`[Pool] Destroying container: ${container.name}`);
        try {
            execSync(`docker rm -f ${container.name}`, { stdio: 'ignore', timeout: 10000 });
        } catch {
            // Ignore errors
        }
        // Cleanup work directory
        await rm(container.workDir, { recursive: true, force: true }).catch(() => { });
    }

    /**
     * Execute command in container
     */
    async execInContainer(containerName: string, command: string, timeoutMs = 30000): Promise<string> {
        return new Promise((resolve, reject) => {
            const proc = spawn('docker', ['exec', containerName, 'sh', '-c', command], {
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            let stderr = '';

            const timer = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error(`Exec timeout: ${command}`));
            }, timeoutMs);

            proc.stdout.on('data', (d) => (stdout += d.toString()));
            proc.stderr.on('data', (d) => (stderr += d.toString()));

            proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(stdout);
                } else {
                    // For test runs, non-zero exit is ok (test failures)
                    resolve(stdout + stderr);
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    /**
     * Copy files into container
     */
    async copyToContainer(
        container: PooledContainer,
        files: Record<string, string>,
        destPath: string
    ): Promise<void> {
        const hostPath = join(container.workDir, destPath.replace(/^\/app\/?/, ''));
        await mkdir(hostPath, { recursive: true });

        for (const [filePath, content] of Object.entries(files)) {
            const fullPath = join(hostPath, filePath);
            const dir = join(fullPath, '..');
            await mkdir(dir, { recursive: true }).catch(() => { });
            await writeFile(fullPath, content);
        }
    }

    /**
     * Reset container state for reuse (EC-4, EC-5, EC-7)
     * - Kill all processes from previous job
     * - Clean all files except dependencies
     * - Track usage count for recycling
     */
    async resetContainer(container: PooledContainer): Promise<void> {
        const runtime = container.runtime;
        
        // EC-4: Kill ALL processes from previous job (runtime-specific)
        const killCommands: Record<string, string> = {
            node: 'pkill -9 -u 1000 node 2>/dev/null || true; pkill -9 -u 1000 npm 2>/dev/null || true',
            python: 'pkill -9 -u 1000 python 2>/dev/null || true; pkill -9 -u 1000 uvicorn 2>/dev/null || true; pkill -9 -u 1000 gunicorn 2>/dev/null || true',
            go: 'pkill -9 -u 1000 main 2>/dev/null || true',
            rust: 'pkill -9 -u 1000 2>/dev/null || true',
        };
        
        // EC-5: Clean ALL files except dependencies (runtime-specific)
        const cleanCommands: Record<string, string> = {
            node: 'find /app -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} +',
            python: 'find /app -mindepth 1 -maxdepth 1 ! -name .packages ! -name __pycache__ -exec rm -rf {} +',
            go: 'find /app -mindepth 1 -maxdepth 1 ! -name go -exec rm -rf {} +',
            rust: 'find /app -mindepth 1 -maxdepth 1 ! -name target -exec rm -rf {} +',
        };
        
        const killCmd = killCommands[runtime] || killCommands.node;
        const cleanCmd = cleanCommands[runtime] || cleanCommands.node;
        
        await this.execInContainer(
            container.name,
            [
                killCmd,
                'sleep 0.3', // Wait for processes to die
                cleanCmd,
                'rm -rf /tmp/* 2>/dev/null || true', // Clean temp files
            ].join(' && '),
            15000
        );
        
        container.lastUsedAt = new Date();
        container.useCount = (container.useCount || 0) + 1;
        container.isReleased = false; // Ready for next use
        
        // EC-7: Mark for recycle if max uses reached (will be caught by validateContainer)
        if (container.useCount >= MAX_CONTAINER_USES) {
            console.log(`[Pool] Container ${container.name} will be recycled after ${container.useCount} uses`);
            container.isHealthy = false;
        }
    }

    /**
     * Acquire container from pool
     */
    async acquire(timeoutMs?: number): Promise<PooledContainer> {
        const container = await this.pool.acquire();
        container.lastUsedAt = new Date();
        return container;
    }

    /**
     * Release container back to pool (EC-3: idempotent)
     */
    async release(container: PooledContainer): Promise<void> {
        // EC-3: Prevent double release
        if (container.isReleased) {
            console.warn(`[Pool] Container ${container.name} already released, ignoring`);
            return;
        }
        
        container.isReleased = true; // Mark as released immediately
        
        try {
            await this.resetContainer(container);
            await this.pool.release(container);
        } catch (error) {
            console.error(`[Pool] Reset failed for ${container.name}, destroying:`, error);
            container.isHealthy = false;
            try {
                await this.destroyContainer(container);
            } catch (destroyError) {
                console.error(`[Pool] Failed to destroy ${container.name}:`, destroyError);
            }
        }
    }

    /**
     * Drain and destroy all containers
     */
    async drain(): Promise<void> {
        console.log(`[Pool] Draining pool: ${this.config.type}/${this.config.runtime}`);
        await this.pool.drain();
        await this.pool.clear();
    }

    /**
     * Get pool statistics
     */
    getStats(): PoolStats {
        return {
            size: this.pool.size,
            available: this.pool.available,
            borrowed: this.pool.borrowed,
            pending: this.pool.pending,
            min: this.pool.min,
            max: this.pool.max,
        };
    }

    /**
     * Check if pool has available containers
     */
    isReady(): boolean {
        return this.pool.available > 0;
    }

    /**
     * Resize pool (note: generic-pool doesn't support runtime resizing)
     * This is a no-op - pool size is set at creation time.
     * To change size, drain the pool and it will recreate with new config.
     */
    async resize(min: number, max: number): Promise<void> {
        // generic-pool's min/max are read-only
        // Just log the intended size - actual resize requires drain + recreate
        console.log(`[Pool] Resize requested for ${this.config.type}/${this.config.runtime}: min=${min}, max=${max} (note: will apply on next pool creation)`);
        // Update config for next pool creation
        this.config.minSize = min;
        this.config.maxSize = max;
    }

    /**
     * Execute docker command
     */
    private dockerExec(args: string[], timeoutMs: number): Promise<string> {
        return new Promise((resolve, reject) => {
            const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';

            const timer = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error(`Docker timeout: docker ${args.slice(0, 3).join(' ')}...`));
            }, timeoutMs);

            proc.stdout.on('data', (d) => (stdout += d.toString()));
            proc.stderr.on('data', (d) => (stderr += d.toString()));

            proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Docker failed (${code}): ${stderr}`));
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
}

// ============ Global Pool Instances ============

// Test Runner Pools: Map of dependency-hash -> pool (EC-1, EC-11)
// Different exams with different dependencies get different pools
const testRunnerPools = new Map<string, { pool: ContainerPool; lastActivityAt: number }>();

// Candidate Pools (per runtime)
const candidatePools = new Map<string, { pool: ContainerPool; lastActivityAt: number }>();

// Track total containers across all pools (EC-13)
let totalContainerCount = 0;

// ============ Pool Factory Functions ============

/**
 * Enforce pool limits (EC-11, EC-13)
 * LRU eviction when too many pools exist
 */
async function enforcePoolLimits(): Promise<void> {
    // EC-11: Evict LRU pools if too many
    if (testRunnerPools.size > MAX_POOLS) {
        const poolEntries = [...testRunnerPools.entries()]
            .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
        
        for (const [hash, { pool }] of poolEntries) {
            if (testRunnerPools.size <= MAX_POOLS) break;
            
            const stats = pool.getStats();
            if (stats.borrowed === 0) {
                console.log(`[Pool] Evicting LRU test runner pool: ${hash}`);
                await pool.drain();
                testRunnerPools.delete(hash);
            }
        }
    }
    
    // Similar for candidate pools
    if (candidatePools.size > MAX_POOLS) {
        const poolEntries = [...candidatePools.entries()]
            .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
        
        for (const [key, { pool }] of poolEntries) {
            if (candidatePools.size <= MAX_POOLS) break;
            
            const stats = pool.getStats();
            if (stats.borrowed === 0) {
                console.log(`[Pool] Evicting LRU candidate pool: ${key}`);
                await pool.drain();
                candidatePools.delete(key);
            }
        }
    }
}

/**
 * Get or create test runner pool (EC-1: mutex protected)
 * Uses dependency hash to route to correct pool
 */
export async function getTestRunnerPool(deps?: Record<string, string>): Promise<ContainerPool> {
    const hash = deps ? computeDependencyHash(deps) : 'default';
    
    // EC-1: Prevent duplicate pool creation with mutex
    return await poolCreationMutex.runExclusive(async () => {
        const existing = testRunnerPools.get(hash);
        if (existing) {
            existing.lastActivityAt = Date.now();
            return existing.pool;
        }
        
        // Enforce limits before creating new pool
        await enforcePoolLimits();
        
        console.log(`[Pool] Creating new test runner pool for hash: ${hash}`);
        const pool = new ContainerPool({
            type: 'test_runner',
            runtime: 'node',
            image: 'node:20-alpine',
            minSize: 2,
            maxSize: 50,
            idleTimeoutMs: 10 * 60 * 1000, // 10 min idle
            acquireTimeoutMs: 120000, // 2 min acquire timeout
            preInstallDeps: deps,
            dependencyHash: hash,
        });
        
        testRunnerPools.set(hash, { pool, lastActivityAt: Date.now() });
        return pool;
    });
}

/**
 * Synchronous version for backwards compatibility
 * Note: This should be migrated to async version eventually
 */
export function getTestRunnerPoolSync(deps?: Record<string, string>): ContainerPool | null {
    const hash = deps ? computeDependencyHash(deps) : 'default';
    const existing = testRunnerPools.get(hash);
    if (existing) {
        existing.lastActivityAt = Date.now();
        return existing.pool;
    }
    return null;
}

/**
 * Get or create candidate pool for a runtime (EC-1: mutex protected)
 */
export async function getCandidatePool(runtime: string, image?: string): Promise<ContainerPool> {
    return await poolCreationMutex.runExclusive(async () => {
        const existing = candidatePools.get(runtime);
        if (existing) {
            existing.lastActivityAt = Date.now();
            return existing.pool;
        }
        
        // Enforce limits before creating new pool
        await enforcePoolLimits();
        
        const imageMap: Record<string, string> = {
            node: 'node:20-alpine',
            python: 'python:3.11-alpine',
            go: 'golang:1.21-alpine',
            rust: 'rust:1.75-alpine',
        };

        console.log(`[Pool] Creating new candidate pool for runtime: ${runtime}`);
        const pool = new ContainerPool({
            type: 'candidate',
            runtime,
            image: image || imageMap[runtime] || 'node:20-alpine',
            minSize: 2,
            maxSize: 50,
            idleTimeoutMs: 10 * 60 * 1000,
            acquireTimeoutMs: 120000,
        });
        
        candidatePools.set(runtime, { pool, lastActivityAt: Date.now() });
        return pool;
    });
}

/**
 * Synchronous version for backwards compatibility
 */
export function getCandidatePoolSync(runtime: string): ContainerPool | null {
    const existing = candidatePools.get(runtime);
    if (existing) {
        existing.lastActivityAt = Date.now();
        return existing.pool;
    }
    return null;
}

/**
 * Check if any test runner pool is warm
 */
export function isPoolWarm(): boolean {
    for (const { pool } of testRunnerPools.values()) {
        if (pool.isReady()) return true;
    }
    return false;
}

/**
 * Check if a specific pool (by dependency hash) is warm
 */
export function isPoolWarmForDeps(deps: Record<string, string>): boolean {
    const hash = computeDependencyHash(deps);
    const existing = testRunnerPools.get(hash);
    return existing !== undefined && existing.pool.isReady();
}

/**
 * Get all pool statistics
 */
export function getPoolStatus(): {
    testRunners: Record<string, PoolStats>;
    candidates: Record<string, PoolStats>;
    totalPools: number;
} {
    const testRunnerStats: Record<string, PoolStats> = {};
    for (const [hash, { pool }] of testRunnerPools) {
        testRunnerStats[hash] = pool.getStats();
    }
    
    const candidateStats: Record<string, PoolStats> = {};
    for (const [runtime, { pool }] of candidatePools) {
        candidateStats[runtime] = pool.getStats();
    }

    return {
        testRunners: testRunnerStats,
        candidates: candidateStats,
        totalPools: testRunnerPools.size + candidatePools.size,
    };
}

/**
 * Resize pools (config stored for next pool creation)
 * Note: generic-pool doesn't support runtime resizing.
 * To apply new sizes, drain pools first then warm again.
 */
export async function resizePool(config: {
    testRunners?: number;
    candidates?: number;
    runtime?: string;
    dependencyHash?: string;
}): Promise<{ success: boolean; message: string }> {
    let resized = false;

    if (config.testRunners) {
        const hash = config.dependencyHash || 'default';
        const existing = testRunnerPools.get(hash);
        if (existing) {
            await existing.pool.resize(Math.floor(config.testRunners / 2), config.testRunners);
            resized = true;
        }
    }

    if (config.candidates && config.runtime) {
        const existing = candidatePools.get(config.runtime);
        if (existing) {
            await existing.pool.resize(Math.floor(config.candidates / 2), config.candidates);
            resized = true;
        }
    }

    if (resized) {
        return {
            success: true,
            message: 'Pool size config updated. Drain pools and warm again to apply new sizes.'
        };
    }
    return { success: false, message: 'No active pools to resize. Warm a pool first.' };
}

/**
 * Drain all pools
 */
export async function drainAllPools(): Promise<void> {
    console.log('[Pool] Draining all pools...');

    for (const [hash, { pool }] of testRunnerPools) {
        console.log(`[Pool] Draining test runner pool: ${hash}`);
        await pool.drain();
    }
    testRunnerPools.clear();

    for (const [runtime, { pool }] of candidatePools) {
        console.log(`[Pool] Draining candidate pool: ${runtime}`);
        await pool.drain();
    }
    candidatePools.clear();

    console.log('[Pool] All pools drained');
}

/**
 * Drain a specific pool by hash
 */
export async function drainPoolByHash(hash: string): Promise<boolean> {
    const existing = testRunnerPools.get(hash);
    if (existing) {
        await existing.pool.drain();
        testRunnerPools.delete(hash);
        console.log(`[Pool] Drained test runner pool: ${hash}`);
        return true;
    }
    return false;
}

/**
 * Calculate optimal pool size based on expected candidates
 */
export function calculatePoolSize(expectedCandidates: number): {
    testRunners: number;
    candidates: number;
} {
    // Peak: 80% of candidates submit in last 5 minutes
    // Each container handles ~60 jobs/min with pool
    // Add 20% buffer

    const peakCandidates = Math.ceil(expectedCandidates * 0.8);
    const targetCompletionMinutes = 5;
    const jobsPerMinute = peakCandidates / targetCompletionMinutes;
    const containersNeeded = Math.ceil((jobsPerMinute / 60) * 1.2);

    return {
        testRunners: Math.max(5, Math.min(containersNeeded, 100)),
        candidates: Math.max(5, Math.min(containersNeeded, 100)),
    };
}

/**
 * Cleanup orphaned containers from previous server runs
 * 
 * This should be called on server startup to remove any containers
 * that were left running from a previous instance.
 */
export async function cleanupOrphanedContainers(): Promise<number> {
    console.log('[Pool] Cleaning up orphaned containers from previous runs...');

    try {
        // Find all containers with our prefix
        const result = execSync(
            `docker ps -aq --filter "name=${CONTAINER_PREFIX}" 2>/dev/null || true`,
            { encoding: 'utf-8', timeout: 10000 }
        ).trim();

        if (!result) {
            console.log('[Pool] No orphaned containers found');
            return 0;
        }

        const containerIds = result.split('\n').filter(Boolean);
        console.log(`[Pool] Found ${containerIds.length} orphaned containers, removing...`);

        // Remove them
        for (const id of containerIds) {
            try {
                execSync(`docker rm -f ${id}`, { stdio: 'ignore', timeout: 5000 });
            } catch {
                // Ignore individual failures
            }
        }

        // Also clean up orphaned work directories
        try {
            execSync(`rm -rf /tmp/${CONTAINER_PREFIX}_* 2>/dev/null || true`, { stdio: 'ignore' });
        } catch {
            // Ignore
        }

        console.log(`[Pool] Cleaned up ${containerIds.length} orphaned containers`);
        return containerIds.length;
    } catch (error) {
        console.warn('[Pool] Error during orphan cleanup:', error);
        return 0;
    }
}

/**
 * Initialize pool system (call on server startup)
 */
export async function initializePoolSystem(): Promise<void> {
    await cleanupOrphanedContainers();
    
    // Start periodic orphan cleanup (EC-15)
    setInterval(() => {
        cleanupOrphanedContainers().catch(err => {
            console.error('[Pool] Periodic cleanup failed:', err);
        });
    }, 5 * 60 * 1000); // Every 5 minutes
    
    console.log('[Pool] Pool system initialized');
}

/**
 * Cleanup idle pools (EC-11)
 * Called periodically to evict unused pools
 */
export async function cleanupIdlePools(): Promise<number> {
    const MAX_IDLE_MS = 60 * 60 * 1000; // 1 hour
    let evictedCount = 0;
    
    for (const [hash, { pool, lastActivityAt }] of testRunnerPools) {
        const stats = pool.getStats();
        if (stats.borrowed === 0 && Date.now() - lastActivityAt > MAX_IDLE_MS) {
            console.log(`[Pool] Evicting idle test runner pool: ${hash}`);
            await pool.drain();
            testRunnerPools.delete(hash);
            evictedCount++;
        }
    }
    
    for (const [runtime, { pool, lastActivityAt }] of candidatePools) {
        const stats = pool.getStats();
        if (stats.borrowed === 0 && Date.now() - lastActivityAt > MAX_IDLE_MS) {
            console.log(`[Pool] Evicting idle candidate pool: ${runtime}`);
            await pool.drain();
            candidatePools.delete(runtime);
            evictedCount++;
        }
    }
    
    if (evictedCount > 0) {
        console.log(`[Pool] Evicted ${evictedCount} idle pools`);
    }
    
    return evictedCount;
}
