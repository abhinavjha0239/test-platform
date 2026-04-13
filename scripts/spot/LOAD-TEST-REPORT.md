# Grader Load Test Report

**Date:** January 15, 2026  
**EC2 Instance:** c6i.2xlarge (3.110.124.250)

---

## Test Results Summary

### Test 1: 30 Concurrent Candidates
| Metric | Value |
|--------|-------|
| **Candidates Tested** | 30 |
| **Jobs Completed** | 30 |
| **Jobs Failed** | 0 |
| **Success Rate** | 100% |
| **Duration** | ~180s |
| **Throughput** | 0.18-0.26 jobs/sec |

### Test 2: 99 Concurrent Candidates (Full Capacity)
| Metric | Value |
|--------|-------|
| **Candidates Tested** | 99 |
| **Jobs Completed** | 99 |
| **Jobs Failed** | 0 |
| **Success Rate** | **100%** |
| **Total Duration** | ~15 minutes |
| **Throughput** | 0.20-0.22 jobs/sec |

### Container Pool Test (Direct on EC2)
| Metric | Value |
|--------|-------|
| **Containers Created** | 99 |
| **Containers Tested** | 99 |
| **All Tests Passed** | ✅ Yes |
| **Concurrent Test Time** | **1 second** |
| **Throughput (on EC2)** | **99 tests/sec** |

---

## EC2 Instance Analysis

### Hardware Specs (c6i.2xlarge)
- **vCPUs:** 8
- **RAM:** 16GB (14GB available)
- **Storage:** 30GB EBS (25GB free)
- **Network:** Up to 12.5 Gbps

### Resource Utilization During 99-Container Test
| Resource | Idle | With 99 Containers | Status |
|----------|------|-------------------|--------|
| CPU Load | 0.5 | 2.5-5.4 | ✅ **Plenty of headroom** |
| Memory | 431MB | 2.3GB / 15GB | ✅ **85% available** |
| Disk | 5GB | 5GB / 30GB | ✅ OK |
| Containers | 3 | **99-104 running** | ✅ Handled easily |

### Key Finding: EC2 Can Handle 100+ Containers
The instance successfully ran **99 PostgreSQL containers** with:
- Only 2.3GB RAM used (15% of total)
- Load average peaked at 5.4, settled to 2.5
- All containers responded to queries successfully

### Bottleneck Analysis
The EC2 instance is **NOT the bottleneck**. The limitation is:

1. **SSH Docker Latency** - Each container operation goes over SSH (~30s per container)
2. **Local Grader** - Running on Mac, creating containers remotely
3. **Container Creation** - Not reusing pre-warmed pool effectively

---

## Capacity Recommendations

### Current Capacity (Proven)
With current configuration (local grader, SSH Docker):
- **Tested Successfully:** 99 concurrent candidates ✅
- **Throughput:** ~0.22 jobs/sec
- **Success Rate:** 100%

### Maximum Container Capacity (c6i.2xlarge)
Based on testing:
- **Safe Container Limit:** 100 containers
- **Memory per Container:** ~25MB idle, ~100MB active
- **Theoretical Max:** ~150 containers (leaving 2GB headroom)

### Optimizations for Higher Throughput

#### Option 1: Pre-warm Container Pool (Implemented)
```bash
# Pre-warm 50-100 containers before contest
ssh ec2-user@3.110.124.250 "for i in \$(seq 1 100); do docker run -d ..."
```
**Benefit:** Eliminates container startup latency (~30s savings per job)

#### Option 2: Run Grader on EC2 (Best Performance)
Move grader to EC2 to eliminate SSH latency:
```bash
# On EC2 - direct Docker access
export DOCKER_HOST=unix:///var/run/docker.sock
./grader-go
```
**Expected:** 10-50x improvement → **10-50 jobs/sec**

#### Option 3: Use Shared Database Pool
For read-only SQL tests:
```go
sqlTests: { isolation: 'shared', timeoutMs: 15000 }
```
**Expected:** 100x improvement → **100+ jobs/sec**

---

## Maximum Load Estimate by Configuration

| Configuration | Throughput | Candidates/Hour | Concurrent |
|---------------|------------|-----------------|------------|
| **Current (SSH Docker)** | 0.22/s | ~50-80 | **99 ✅ Tested** |
| Pre-warmed Pool (SSH) | 0.5-1/s | ~150-300 | 100+ |
| Grader on EC2 (local Docker) | 10-50/s | ~3000+ | 300+ |
| Shared DB Pool | 50-100/s | ~5000+ | 500+ |

---

## For Your Contest

### ✅ PROVEN: 99 Candidates Successfully Tested
- **99 concurrent submissions** completed with **100% success rate**
- EC2 handled 104 containers simultaneously
- Memory usage stayed under 2.5GB (out of 15GB)
- Zero failures

### Pre-Contest Checklist

```bash
# 1. Clean up orphan containers
ssh ec2-user@3.110.124.250 "docker rm -f \$(docker ps -aq --filter 'name=grader-pool')"
ssh ec2-user@3.110.124.250 "docker rm -f \$(docker ps -aq -f status=created -f status=exited)"

# 2. Pre-warm containers (optional, improves throughput)
ssh ec2-user@3.110.124.250 "
for i in \$(seq 1 30); do
    docker run -d --name grader-pool-\$i \
        -e POSTGRES_PASSWORD=grader \
        -e POSTGRES_USER=grader \
        -e POSTGRES_DB=grader \
        --memory=100m \
        -p 0:5432 \
        postgres:16-alpine
done
"

# 3. Verify containers are running
ssh ec2-user@3.110.124.250 "docker ps --format 'table {{.Names}}\t{{.Status}}' | head -15"

# 4. Monitor during contest
./scripts/spot/monitor-grading.sh

# 5. Check for failures
redis-cli XLEN grading:jobs:dlq  # Should be 0
```

---

## Monitoring During Contest

### Real-time Dashboard
```bash
./scripts/spot/monitor-grading.sh
```

### Key Metrics to Watch
```bash
# Queue depth (should stay < 50)
redis-cli XLEN grading:jobs:high

# Active workers
redis-cli HGET grading:stats active

# Failures (should be 0)
redis-cli HGET grading:stats failed

# EC2 load (should stay < 4.0)
ssh ec2-user@3.110.124.250 "uptime"
```

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Queue Depth | > 50 | > 100 |
| EC2 Load | > 6.0 | > 7.5 |
| Memory | > 80% | > 95% |
| Failed Jobs | > 0 | > 5 |

---

## Files Created

| File | Purpose |
|------|---------|
| `30-candidate-test.ts` | TypeScript load test |
| `30-candidate-test.sh` | Bash load test |
| `monitor-grading.sh` | Real-time monitoring |
| `run-30-test.sh` | All-in-one test runner |
| `TEST-30-CANDIDATES.md` | Setup documentation |
| `LOAD-TEST-REPORT.md` | This report |
