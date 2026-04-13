/**
 * EC2 Container Capacity Test
 * Tests how many PostgreSQL containers the instance can handle
 * Then runs full acquire → test → reset → release cycle
 * 
 * Usage: DOCKER_HOST=ssh://ec2-user@3.110.124.250 npx tsx scripts/spot/capacity-test.ts
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const EC2_IP = process.env.EC2_IP || '3.110.124.250';
const TARGET_CONTAINERS = parseInt(process.env.TARGET_CONTAINERS || '50', 10);
const BATCH_SIZE = 10;

interface ContainerInfo {
    id: string;
    port: number;
    name: string;
}

// Execute SSH command on EC2
async function sshExec(cmd: string): Promise<string> {
    const { stdout } = await execAsync(`ssh -o StrictHostKeyChecking=no ec2-user@${EC2_IP} "${cmd}"`, {
        timeout: 120000,
    });
    return stdout.trim();
}

// Get current container count and memory usage
async function getEC2Status(): Promise<{ containers: number; memUsedMB: number; memAvailMB: number; loadAvg: string }> {
    const output = await sshExec(`
        echo "containers:\$(docker ps -q | wc -l)"
        echo "memused:\$(free -m | awk '/Mem:/ {print \$3}')"
        echo "memavail:\$(free -m | awk '/Mem:/ {print \$7}')"
        echo "load:\$(uptime | awk -F'load average:' '{print \$2}')"
    `);
    
    const lines = output.split('\n');
    const data: Record<string, string> = {};
    lines.forEach(line => {
        const [key, val] = line.split(':');
        if (key && val) data[key] = val.trim();
    });
    
    return {
        containers: parseInt(data.containers || '0', 10),
        memUsedMB: parseInt(data.memused || '0', 10),
        memAvailMB: parseInt(data.memavail || '0', 10),
        loadAvg: data.load || '0',
    };
}

// Create a batch of containers
async function createContainerBatch(count: number, startIdx: number): Promise<ContainerInfo[]> {
    const containers: ContainerInfo[] = [];
    
    // Create containers in parallel (but limited batch)
    const createCmd = Array.from({ length: count }, (_, i) => {
        const name = `grader-pool-${startIdx + i}`;
        return `docker run -d --name ${name} -e POSTGRES_PASSWORD=grader -e POSTGRES_USER=grader -e POSTGRES_DB=grader --memory=128m -p 0:5432 postgres:16-alpine 2>/dev/null && echo "created:${name}"`;
    }).join(' & ');
    
    try {
        const output = await sshExec(`${createCmd}; wait`);
        const createdNames = output.match(/created:grader-pool-\d+/g) || [];
        
        // Get port mappings
        for (const match of createdNames) {
            const name = match.replace('created:', '');
            try {
                const portOutput = await sshExec(`docker port ${name} 5432 2>/dev/null | cut -d: -f2`);
                const port = parseInt(portOutput, 10);
                if (port) {
                    const idOutput = await sshExec(`docker inspect -f '{{.Id}}' ${name} 2>/dev/null | head -c 12`);
                    containers.push({ id: idOutput, port, name });
                }
            } catch (e) {
                // Container may have failed to start
            }
        }
    } catch (e) {
        console.error('Batch creation error:', e);
    }
    
    return containers;
}

// Wait for containers to be healthy
async function waitForHealthy(containers: ContainerInfo[]): Promise<number> {
    console.log(`  Waiting for ${containers.length} containers to be healthy...`);
    
    let healthy = 0;
    const maxWait = 60000; // 60 seconds
    const start = Date.now();
    
    while (healthy < containers.length && Date.now() - start < maxWait) {
        const healthChecks = containers.map(async (c) => {
            try {
                const result = await sshExec(`docker exec ${c.name} pg_isready -U grader 2>/dev/null && echo "ok" || echo "not"`);
                return result.includes('ok');
            } catch {
                return false;
            }
        });
        
        const results = await Promise.all(healthChecks);
        healthy = results.filter(Boolean).length;
        
        process.stdout.write(`\r  Healthy: ${healthy}/${containers.length}    `);
        
        if (healthy < containers.length) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    console.log('');
    return healthy;
}

// Run SQL test on a container
async function runSQLTest(container: ContainerInfo): Promise<{ success: boolean; timeMs: number }> {
    const start = Date.now();
    
    try {
        // Setup schema
        await sshExec(`docker exec ${container.name} psql -U grader -d grader -c "
            DROP TABLE IF EXISTS orders CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(255));
            CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id), amount INT);
            INSERT INTO users (name, email) VALUES ('Test', 'test@test.com');
        " 2>/dev/null`);
        
        // Run test query
        const result = await sshExec(`docker exec ${container.name} psql -U grader -d grader -t -c "SELECT * FROM users;" 2>/dev/null`);
        
        const success = result.includes('Test');
        return { success, timeMs: Date.now() - start };
    } catch (e) {
        return { success: false, timeMs: Date.now() - start };
    }
}

// Reset container database
async function resetContainer(container: ContainerInfo): Promise<boolean> {
    try {
        await sshExec(`docker exec ${container.name} psql -U grader -d grader -c "
            DROP SCHEMA public CASCADE;
            CREATE SCHEMA public;
            GRANT ALL ON SCHEMA public TO grader;
        " 2>/dev/null`);
        return true;
    } catch {
        return false;
    }
}

// Cleanup all pool containers
async function cleanupContainers(): Promise<number> {
    try {
        const output = await sshExec(`docker rm -f \$(docker ps -aq --filter "name=grader-pool") 2>/dev/null | wc -l`);
        return parseInt(output, 10) || 0;
    } catch {
        return 0;
    }
}

// Main capacity test
async function main() {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('           EC2 CONTAINER CAPACITY TEST');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`EC2 Instance: ${EC2_IP}`);
    console.log(`Target Containers: ${TARGET_CONTAINERS}`);
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    // Initial status
    let status = await getEC2Status();
    console.log(`Initial State:`);
    console.log(`  Running Containers: ${status.containers}`);
    console.log(`  Memory Available: ${status.memAvailMB} MB`);
    console.log(`  Load Average: ${status.loadAvg}\n`);
    
    // Cleanup existing pool containers
    console.log('Cleaning up existing pool containers...');
    const cleaned = await cleanupContainers();
    console.log(`  Removed ${cleaned} containers\n`);
    
    // Phase 1: Pre-warm containers in batches
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  PHASE 1: PRE-WARMING CONTAINERS');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    const allContainers: ContainerInfo[] = [];
    let batchNum = 0;
    
    while (allContainers.length < TARGET_CONTAINERS) {
        batchNum++;
        const remaining = TARGET_CONTAINERS - allContainers.length;
        const batchCount = Math.min(BATCH_SIZE, remaining);
        
        console.log(`Batch ${batchNum}: Creating ${batchCount} containers...`);
        const startTime = Date.now();
        
        const newContainers = await createContainerBatch(batchCount, allContainers.length);
        allContainers.push(...newContainers);
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Created ${newContainers.length} containers in ${elapsed}s`);
        
        // Check memory status
        status = await getEC2Status();
        console.log(`  Memory: ${status.memUsedMB}MB used, ${status.memAvailMB}MB available`);
        console.log(`  Total containers: ${allContainers.length}/${TARGET_CONTAINERS}\n`);
        
        // Safety check - stop if memory is low
        if (status.memAvailMB < 1000) {
            console.log('⚠️ Memory running low, stopping container creation');
            break;
        }
    }
    
    // Wait for all containers to be healthy
    console.log('Waiting for all containers to become healthy...');
    const healthyCount = await waitForHealthy(allContainers);
    console.log(`  ${healthyCount}/${allContainers.length} containers are healthy\n`);
    
    // Final status after pre-warming
    status = await getEC2Status();
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  PRE-WARM COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  Total Containers: ${allContainers.length}`);
    console.log(`  Healthy: ${healthyCount}`);
    console.log(`  Memory Used: ${status.memUsedMB} MB`);
    console.log(`  Memory Available: ${status.memAvailMB} MB`);
    console.log(`  Load Average: ${status.loadAvg}\n`);
    
    // Phase 2: Acquire → Test → Reset → Release cycle
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  PHASE 2: ACQUIRE → TEST → RESET → RELEASE CYCLE');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    // Simulate pool
    const pool = [...allContainers];
    const testResults: { success: number; failed: number; totalTimeMs: number } = {
        success: 0,
        failed: 0,
        totalTimeMs: 0,
    };
    
    const startTime = Date.now();
    const concurrency = Math.min(20, pool.length); // Test 20 concurrent
    let processed = 0;
    
    console.log(`Running ${pool.length} tests with ${concurrency} concurrency...\n`);
    
    // Process in concurrent batches
    while (pool.length > 0) {
        const batch = pool.splice(0, concurrency);
        
        const batchPromises = batch.map(async (container) => {
            // ACQUIRE (already have it from pool)
            
            // TEST
            const testResult = await runSQLTest(container);
            
            // RESET
            await resetContainer(container);
            
            // RELEASE (put back in pool - simulated)
            
            processed++;
            return testResult;
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach(r => {
            if (r.success) {
                testResults.success++;
            } else {
                testResults.failed++;
            }
            testResults.totalTimeMs += r.timeMs;
        });
        
        process.stdout.write(`\r  Processed: ${processed}/${allContainers.length} | Success: ${testResults.success} | Failed: ${testResults.failed}    `);
    }
    
    const totalDuration = (Date.now() - startTime) / 1000;
    console.log('\n');
    
    // Final results
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  FINAL RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  Total Containers Tested: ${allContainers.length}`);
    console.log(`  Successful Tests: ${testResults.success}`);
    console.log(`  Failed Tests: ${testResults.failed}`);
    console.log(`  Success Rate: ${((testResults.success / allContainers.length) * 100).toFixed(1)}%`);
    console.log(`  Total Duration: ${totalDuration.toFixed(1)}s`);
    console.log(`  Throughput: ${(testResults.success / totalDuration).toFixed(2)} tests/sec`);
    console.log(`  Avg Test Time: ${(testResults.totalTimeMs / allContainers.length).toFixed(0)}ms`);
    
    // Memory usage summary
    status = await getEC2Status();
    console.log(`\n  EC2 Final State:`);
    console.log(`    Memory Used: ${status.memUsedMB} MB`);
    console.log(`    Memory Available: ${status.memAvailMB} MB`);
    console.log(`    Load Average: ${status.loadAvg}`);
    
    console.log('\n═══════════════════════════════════════════════════════════════════\n');
    
    // Cleanup
    console.log('Cleaning up containers...');
    const cleanedUp = await cleanupContainers();
    console.log(`  Removed ${cleanedUp} containers`);
    
    console.log('\n✅ Capacity test complete!\n');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
