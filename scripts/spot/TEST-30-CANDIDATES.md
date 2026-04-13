# 30 Candidate Grader Load Test Guide

## Quick Start

### Option 1: Full Automated Test (Recommended)

```bash
cd test-platform/scripts/spot
./run-30-test.sh full
```

This will:
1. Start Redis (in Docker)
2. Start the Go Grader
3. Run the 30-candidate test
4. Show results

### Option 2: Manual Step-by-Step

#### Terminal 1 - Start Redis
```bash
# Start Redis in Docker
docker run -d --name redis-grading -p 6379:6379 redis:7-alpine

# Verify
redis-cli ping
# Should return: PONG
```

#### Terminal 2 - Start Grader
```bash
cd test-platform/apps/grader-go

# Set environment
export REDIS_URL="redis://localhost:6379"
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/exam_platform?sslmode=disable"
export SQL_CONTAINER_REMOTE_HOST="3.110.124.250"
export DOCKER_HOST="ssh://ec2-user@3.110.124.250"
export GRADING_CONCURRENCY=20

# Build and run
go build -o ./bin/grader-go ./cmd/grader/
./bin/grader-go
```

#### Terminal 3 - Run Monitor (Optional)
```bash
cd test-platform/scripts/spot
REDIS_URL="redis://localhost:6379" ./monitor-grading.sh
```

#### Terminal 4 - Run Test
```bash
cd test-platform/scripts/spot

# Option A: TypeScript (recommended)
REDIS_URL="redis://localhost:6379" npx tsx 30-candidate-test.ts

# Option B: Bash
REDIS_URL="redis://localhost:6379" ./30-candidate-test.sh
```

---

## Current Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| EC2 Instance | 3.110.124.250 (c6i.2xlarge) | ✅ Running |
| PostgreSQL Containers | EC2 (3 containers ready) | ✅ Running |
| Redis | Local Docker | Needs to start |
| Go Grader | Local | Needs to start |

---

## Monitoring Commands

### Real-Time Dashboard
```bash
./monitor-grading.sh
```

### Manual Redis Checks
```bash
# Queue lengths
redis-cli XLEN grading:jobs:high
redis-cli XLEN grading:jobs:low

# Grading stats
redis-cli HGETALL grading:stats

# Check failed jobs (DLQ)
redis-cli XLEN grading:jobs:dlq
redis-cli XRANGE grading:jobs:dlq - + COUNT 5

# Clear stats for fresh test
redis-cli DEL grading:stats
```

### Grader Logs
```bash
# If using run-30-test.sh
tail -f /tmp/grader.log

# Look for patterns
grep -i error /tmp/grader.log
grep "job.*completed" /tmp/grader.log | tail -20
```

---

## Expected Results

For 30 candidates on c6i.2xlarge:

| Metric | Expected | Notes |
|--------|----------|-------|
| Duration | 30-60s | With container pooling |
| Throughput | 0.5-2 jobs/sec | Depends on SQL complexity |
| Success Rate | 95%+ | Some failures normal during warmup |
| DLQ | 0-2 jobs | Check for systematic failures |

---

## Troubleshooting

### Grader won't start
```bash
# Check logs
cat /tmp/grader.log | head -50

# Common issues:
# - DATABASE_URL not set
# - Redis not reachable
# - SSH to EC2 failing
```

### SSH to EC2 failing
```bash
# Test SSH connection
ssh -o ConnectTimeout=5 ec2-user@3.110.124.250 "docker ps"

# If permission denied, check key
ls -la ~/.ssh/
# May need to add key to ssh-agent
ssh-add ~/.ssh/id_ed25519
```

### Docker containers not responding on EC2
```bash
# Check container health
ssh ec2-user@3.110.124.250 "docker ps -a"

# Restart containers if needed
ssh ec2-user@3.110.124.250 "docker restart \$(docker ps -q)"
```

### Jobs stuck in queue
```bash
# Check pending jobs
redis-cli XLEN grading:jobs:high

# Check if grader is processing
redis-cli HGET grading:stats active

# Force reclaim (if jobs stuck with dead consumers)
redis-cli XINFO CONSUMERS grading:jobs:high grading-workers
```

### High DLQ count
```bash
# View failed job errors
redis-cli XRANGE grading:jobs:dlq - + COUNT 10

# Common causes:
# - Database setup script errors
# - Container timeout
# - Network issues to EC2
```

---

## Cleanup

```bash
# Stop grader
./run-30-test.sh stop

# Or manually
pkill -f grader-go
docker rm -f redis-grading

# Clear Redis data (if needed)
redis-cli FLUSHALL
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `run-30-test.sh` | All-in-one test runner |
| `30-candidate-test.ts` | TypeScript test (pushes jobs to Redis) |
| `30-candidate-test.sh` | Bash test alternative |
| `monitor-grading.sh` | Real-time monitoring dashboard |
| `load-test.sh` | Multi-phase stress test (10→300 candidates) |
