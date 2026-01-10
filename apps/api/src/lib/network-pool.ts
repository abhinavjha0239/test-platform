/**
 * Network Pool Manager
 * 
 * Manages Docker networks to prevent exhaustion (EC-8) and ensure proper cleanup (EC-10).
 * Reuses networks instead of creating per-job to avoid "address pools exhausted" errors.
 * 
 * Each network is isolated (--internal) to prevent external egress.
 */

import { spawn } from 'child_process';
import { Mutex } from 'async-mutex';

// ============ Constants ============

const NETWORK_POOL_SIZE = 50;        // Max networks in pool
const NETWORK_PREFIX = 'grader_net_pool';
const ACQUIRE_TIMEOUT_MS = 10000;    // 10s timeout to acquire network
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ============ State ============

const networkPool: string[] = [];
const networkInUse = new Set<string>();
const networkMutex = new Mutex();

// ============ Docker Helpers ============

async function dockerExec(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`Docker command timeout: docker ${args.join(' ')}`));
        }, timeoutMs);

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve({ stdout, stderr });
            reject(new Error(`Docker command failed (${code}): docker ${args.join(' ')}\n${stdout}\n${stderr}`));
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ============ Network Pool Functions ============

/**
 * Acquire a network from the pool (EC-8)
 * Creates new network if pool isn't full, otherwise waits for one to become available
 */
export async function acquireNetwork(): Promise<string> {
    return await networkMutex.runExclusive(async () => {
        // Try to reuse an existing network
        for (const network of networkPool) {
            if (!networkInUse.has(network)) {
                networkInUse.add(network);
                console.log(`[Network] Acquired existing network: ${network}`);
                return network;
            }
        }
        
        // Create new if under limit
        if (networkPool.length < NETWORK_POOL_SIZE) {
            const name = `${NETWORK_PREFIX}_${networkPool.length}`;
            try {
                await dockerExec(['network', 'create', '--internal', name], 8000);
                networkPool.push(name);
                networkInUse.add(name);
                console.log(`[Network] Created new network: ${name}`);
                return name;
            } catch (error) {
                // Network might already exist from previous run
                if (String(error).includes('already exists')) {
                    networkPool.push(name);
                    networkInUse.add(name);
                    console.log(`[Network] Reusing existing network: ${name}`);
                    return name;
                }
                throw error;
            }
        }
        
        // EC-8: Pool exhausted, throw error (caller should retry)
        throw new Error('Network pool exhausted. All networks are in use.');
    });
}

/**
 * Acquire network with retry (EC-8)
 */
export async function acquireNetworkWithRetry(maxRetries = 5, retryDelayMs = 1000): Promise<string> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await acquireNetwork();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries - 1) {
                console.log(`[Network] Acquire failed, retrying in ${retryDelayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
                await new Promise(r => setTimeout(r, retryDelayMs));
            }
        }
    }
    
    throw lastError || new Error('Network acquire failed after retries');
}

/**
 * Release network back to pool (EC-10)
 * Cleans up any containers still attached to the network
 */
export async function releaseNetwork(name: string): Promise<void> {
    return await networkMutex.runExclusive(async () => {
        if (!networkInUse.has(name)) {
            console.warn(`[Network] Network ${name} not in use, ignoring release`);
            return;
        }
        
        // EC-10: Clean any containers still attached
        try {
            const { stdout } = await dockerExec(
                ['network', 'inspect', name, '-f', '{{range .Containers}}{{.Name}} {{end}}'],
                5000
            );
            
            const containers = stdout.trim().split(' ').filter(Boolean);
            for (const containerName of containers) {
                console.log(`[Network] Disconnecting orphan container ${containerName} from ${name}`);
                await dockerExec(['network', 'disconnect', '-f', name, containerName], 5000).catch(() => {});
            }
        } catch {
            // Network might not exist or other error, that's okay
        }
        
        networkInUse.delete(name);
        console.log(`[Network] Released network: ${name}`);
    });
}

/**
 * Cleanup orphaned networks (EC-10)
 * Removes networks that are in use but have no containers
 */
export async function cleanupOrphanedNetworks(): Promise<number> {
    let cleanedCount = 0;
    
    try {
        // Find all grader networks
        const { stdout } = await dockerExec(
            ['network', 'ls', '--filter', `name=${NETWORK_PREFIX}`, '--format', '{{.Name}}'],
            10000
        );
        
        const existingNetworks = stdout.trim().split('\n').filter(Boolean);
        
        for (const network of existingNetworks) {
            // Check if network has any containers
            try {
                const { stdout: inspect } = await dockerExec(
                    ['network', 'inspect', network, '-f', '{{len .Containers}}'],
                    5000
                );
                
                const containerCount = parseInt(inspect.trim(), 10);
                
                // If network has no containers and is not in our pool, remove it
                if (containerCount === 0 && !networkPool.includes(network)) {
                    console.log(`[Network] Removing orphan network: ${network}`);
                    await dockerExec(['network', 'rm', network], 5000).catch(() => {});
                    cleanedCount++;
                }
            } catch {
                // Network might have been removed already
            }
        }
    } catch (error) {
        console.warn('[Network] Cleanup error:', error);
    }
    
    if (cleanedCount > 0) {
        console.log(`[Network] Cleaned up ${cleanedCount} orphan networks`);
    }
    
    return cleanedCount;
}

/**
 * Get network pool status
 */
export function getNetworkPoolStatus(): {
    total: number;
    available: number;
    inUse: number;
} {
    return {
        total: networkPool.length,
        available: networkPool.length - networkInUse.size,
        inUse: networkInUse.size,
    };
}

/**
 * Initialize network pool (called on server startup)
 */
export async function initializeNetworkPool(): Promise<void> {
    console.log('[Network] Initializing network pool...');
    
    // Cleanup orphaned networks from previous runs
    await cleanupOrphanedNetworks();
    
    // Pre-create a few networks
    const preCreateCount = 5;
    for (let i = 0; i < preCreateCount; i++) {
        const name = `${NETWORK_PREFIX}_${i}`;
        try {
            await dockerExec(['network', 'create', '--internal', name], 8000);
            networkPool.push(name);
            console.log(`[Network] Pre-created network: ${name}`);
        } catch (error) {
            if (String(error).includes('already exists')) {
                networkPool.push(name);
                console.log(`[Network] Reusing existing network: ${name}`);
            }
        }
    }
    
    // Start periodic cleanup
    setInterval(() => {
        cleanupOrphanedNetworks().catch(err => {
            console.error('[Network] Periodic cleanup failed:', err);
        });
    }, CLEANUP_INTERVAL_MS);
    
    console.log(`[Network] Pool initialized with ${networkPool.length} networks`);
}

/**
 * Drain all networks (cleanup on shutdown)
 */
export async function drainNetworkPool(): Promise<void> {
    console.log('[Network] Draining network pool...');
    
    for (const network of networkPool) {
        try {
            // Disconnect all containers first
            const { stdout } = await dockerExec(
                ['network', 'inspect', network, '-f', '{{range .Containers}}{{.Name}} {{end}}'],
                5000
            ).catch(() => ({ stdout: '' }));
            
            for (const containerName of stdout.trim().split(' ').filter(Boolean)) {
                await dockerExec(['network', 'disconnect', '-f', network, containerName], 5000).catch(() => {});
            }
            
            // Remove the network
            await dockerExec(['network', 'rm', network], 5000).catch(() => {});
        } catch {
            // Ignore errors during drain
        }
    }
    
    networkPool.length = 0;
    networkInUse.clear();
    
    console.log('[Network] Network pool drained');
}

