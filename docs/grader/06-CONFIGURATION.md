# Configuration & Deployment

This document covers environment variables, production deployment, and scaling considerations.

## Environment Variables

### Grading Worker

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GRADER_MODE` | Grader mode: `docker`, `sandboxed`, `local` | `docker` (production), `sandboxed` (dev) | No |
| `GRADING_CONCURRENCY` | Number of concurrent grading jobs | `2` | No |
| `NODE_ENV` | Environment: `production`, `development` | `development` | Yes (production) |

### Redis Connection

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` | Yes |

### Database

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | Yes |

### Authentication

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret for JWT signing | Dev fallback | Yes (production) |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens | `JWT_SECRET` | No |

---

## Docker Requirements

### Installation

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install docker.io
sudo usermod -aG docker $USER

# Verify installation
docker --version
docker run hello-world
```

### Required Images

The grader pulls these images automatically:

```bash
# Pre-pull for faster first run
docker pull node:20-alpine
docker pull node:18-alpine
docker pull mcr.microsoft.com/playwright:v1.57.0-jammy
docker pull alpine:3.19
docker pull python:3.11-slim
docker pull golang:1.21-alpine
```

### Docker Configuration

```bash
# Increase max containers (if needed)
sudo sysctl -w net.core.somaxconn=65535

# Increase file descriptors
ulimit -n 65535
```

---

## Production Deployment Checklist

### Required

- [ ] `NODE_ENV=production`
- [ ] `GRADER_MODE=docker`
- [ ] `JWT_SECRET` is set and secure (32+ chars, random)
- [ ] `DATABASE_URL` configured
- [ ] `REDIS_URL` configured
- [ ] Docker daemon running
- [ ] Required Docker images pulled
- [ ] HTTPS enabled for API
- [ ] Database credentials secured
- [ ] Redis password configured

### Recommended

- [ ] Rate limiting enabled
- [ ] Logging configured (structured JSON)
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Alerts configured (disk, memory, queue depth)
- [ ] Backup strategy for database
- [ ] Container registry for custom images

### Security Hardening

- [ ] Firewall configured
- [ ] Docker socket not exposed
- [ ] Non-root user for worker process
- [ ] Secrets in environment (not files)
- [ ] Audit logging enabled

---

## Scaling Considerations

### Horizontal Scaling (Workers)

```bash
# Run multiple worker instances
GRADING_CONCURRENCY=2 npm run worker &
GRADING_CONCURRENCY=2 npm run worker &
# Each worker processes 2 concurrent jobs
# Total: 4 concurrent grading jobs
```

### Vertical Scaling (Container Resources)

```typescript
// Increase limits for complex challenges
{
  timeLimit: 180,     // 3 minutes
  memoryLimit: 1024,  // 1 GB
}
```

### Queue Monitoring

```typescript
// Get queue stats
const stats = await getQueueStats();
console.log({
  waiting: stats.waiting,   // Jobs in queue
  active: stats.active,     // Currently processing
  completed: stats.completed,
  failed: stats.failed,
});
```

### Autoscaling

Consider autoscaling workers based on:
- Queue depth (waiting jobs)
- Average processing time
- Error rate

---

## Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: exam_platform
      POSTGRES_USER: exam
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  api:
    build: ./apps/api
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://exam:${DB_PASSWORD}@postgres:5432/exam_platform
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - redis
      - postgres

  worker:
    build: ./apps/api
    command: npm run worker
    environment:
      - NODE_ENV=development
      - GRADER_MODE=docker
      - DATABASE_URL=postgresql://exam:${DB_PASSWORD}@postgres:5432/exam_platform
      - REDIS_URL=redis://redis:6379
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - redis
      - postgres

volumes:
  redis_data:
  postgres_data:
```

**Note**: The worker needs access to Docker socket to spawn grading containers.

---

## Kubernetes Deployment

### Worker Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grading-worker
spec:
  replicas: 3
  selector:
    matchLabels:
      app: grading-worker
  template:
    metadata:
      labels:
        app: grading-worker
    spec:
      containers:
      - name: worker
        image: exam-platform/api:latest
        command: ["npm", "run", "worker"]
        env:
        - name: NODE_ENV
          value: "production"
        - name: GRADER_MODE
          value: "docker"
        - name: GRADING_CONCURRENCY
          value: "2"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: redis-credentials
              key: url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: jwt-secret
              key: secret
        volumeMounts:
        - name: docker-sock
          mountPath: /var/run/docker.sock
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2"
      volumes:
      - name: docker-sock
        hostPath:
          path: /var/run/docker.sock
```

### Considerations

1. **Docker-in-Docker**: Workers need Docker socket access
2. **Resource Limits**: Workers need enough resources for container management
3. **Node Affinity**: Consider dedicating nodes for grading
4. **Persistent Storage**: Not needed (ephemeral containers)

---

## Monitoring

### Prometheus Metrics

```typescript
// Add to worker
import { Counter, Histogram, Gauge } from 'prom-client';

const gradingJobsTotal = new Counter({
  name: 'grading_jobs_total',
  help: 'Total grading jobs processed',
  labelNames: ['status', 'mode'],
});

const gradingDuration = new Histogram({
  name: 'grading_duration_seconds',
  help: 'Grading job duration',
  labelNames: ['mode'],
  buckets: [10, 30, 60, 120, 300],
});

const queueDepth = new Gauge({
  name: 'grading_queue_depth',
  help: 'Number of jobs in grading queue',
  labelNames: ['state'],
});
```

### Alerts

```yaml
# Prometheus alerting rules
groups:
- name: grading
  rules:
  - alert: GradingQueueBacklog
    expr: grading_queue_depth{state="waiting"} > 100
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: Grading queue backlog building up
      
  - alert: GradingWorkerDown
    expr: up{job="grading-worker"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: Grading worker is down
      
  - alert: HighGradingFailureRate
    expr: rate(grading_jobs_total{status="failed"}[5m]) > 0.1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: High grading failure rate
```

---

## Logging

### Structured Logging

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Usage
logger.info({ attemptId, jobId }, 'Starting grading job');
logger.error({ attemptId, error: err.message }, 'Grading failed');
```

### Log Fields

| Field | Description |
|-------|-------------|
| `attemptId` | Exam attempt ID |
| `jobId` | BullMQ job ID |
| `duration` | Processing time (ms) |
| `publicScore` | Public test score |
| `hiddenScore` | Hidden test score |
| `graderMode` | docker/sandboxed/local |
| `runnerMode` | jest/http/playwright |

---

## Troubleshooting

### Queue Issues

```bash
# Check Redis connection
redis-cli ping

# View queue stats
redis-cli llen bull:grading:wait
redis-cli llen bull:grading:active

# Clear stuck jobs (caution!)
redis-cli del bull:grading:active
```

### Docker Issues

```bash
# Check Docker daemon
systemctl status docker

# View running containers
docker ps --filter "name=grader_"

# Clean up old containers
docker container prune

# Clean up old networks
docker network prune

# Check disk space
docker system df
```

### Worker Issues

```bash
# Check worker logs
journalctl -u grading-worker -f

# Restart worker
systemctl restart grading-worker

# Check for zombie processes
ps aux | grep grader
```

---

## Backup & Recovery

### Database Backup

```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

### Queue Recovery

If Redis data is lost:
1. In-progress jobs will fail (attempts retry)
2. Waiting jobs are lost (candidates can resubmit)
3. No persistent data loss (results in PostgreSQL)

### Disaster Recovery

1. **Database is source of truth** for results
2. **Redis is ephemeral** - can be rebuilt
3. **Worker is stateless** - can be replaced
4. **Containers are ephemeral** - auto-cleaned

