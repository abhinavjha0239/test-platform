# AWS Full Stack Deployment

Deploy the complete exam platform on AWS with budget ~$40 for 4 days.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS ap-south-1                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   EC2 #1     │     │   EC2 #2     │     │   RDS        │    │
│  │  Web + API   │────►│   Grader     │────►│  PostgreSQL  │    │
│  │  t3.small    │     │  c6i.xlarge  │     │  db.t3.micro │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│                    ┌──────────────┐                            │
│                    │ ElastiCache  │                            │
│                    │    Redis     │                            │
│                    │cache.t3.micro│                            │
│                    └──────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Cost Breakdown (ap-south-1 region)

| Resource | Type | Hourly | Daily | 4 Days |
|----------|------|--------|-------|--------|
| Web EC2 | t3.small | $0.021 | $0.50 | $2.00 |
| Grader EC2 | c6i.xlarge | $0.170 | $4.08 | $16.32 |
| RDS PostgreSQL | db.t3.micro | $0.018 | $0.43 | $1.72 |
| ElastiCache Redis | cache.t3.micro | $0.017 | $0.41 | $1.64 |
| **Total** | | **$0.226** | **$5.42** | **$21.68** |

### With Spot Instance for Grader (60-70% savings)

| Resource | Type | Hourly | Daily | 4 Days |
|----------|------|--------|-------|--------|
| Web EC2 | t3.small | $0.021 | $0.50 | $2.00 |
| Grader EC2 | c6i.xlarge **SPOT** | $0.051 | $1.22 | $4.88 |
| RDS PostgreSQL | db.t3.micro | $0.018 | $0.43 | $1.72 |
| ElastiCache Redis | cache.t3.micro | $0.017 | $0.41 | $1.64 |
| **Total** | | **$0.107** | **$2.56** | **$10.24** |

## Quick Start

### 1. Deploy Infrastructure

```bash
chmod +x deploy-full-stack.sh
./deploy-full-stack.sh
```

This creates:
- VPC with subnets
- Security groups
- RDS PostgreSQL (db.t3.micro)
- ElastiCache Redis (cache.t3.micro)
- Web/API EC2 (t3.small)
- Grader EC2 (c6i.xlarge)

### 2. Wait for RDS & ElastiCache (~10 minutes)

```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier exam-platform-db \
    --query 'DBInstances[0].DBInstanceStatus'

# Check ElastiCache status
aws elasticache describe-cache-clusters --cache-cluster-id exam-platform-redis \
    --query 'CacheClusters[0].CacheClusterStatus'
```

### 3. Setup Application

```bash
chmod +x setup-app.sh
./setup-app.sh
```

This:
- Migrates local database to RDS
- Deploys Web/API to EC2
- Deploys Grader to EC2
- Pre-warms SQL containers

### 4. Access Application

After deployment, access:
- **Web App**: http://[WEB_IP]:3000
- **API**: http://[WEB_IP]:3001

## Monitoring

### Check Grader Status
```bash
ssh -i ~/.ssh/exam-platform-key.pem ec2-user@[GRADER_IP] 'tail -f ~/grader.log'
```

### Check Redis Queue
```bash
ssh -i ~/.ssh/exam-platform-key.pem ec2-user@[GRADER_IP] \
    'docker run --rm redis:7-alpine redis-cli -h [REDIS_ENDPOINT] HGETALL grading:stats'
```

## Cleanup (IMPORTANT!)

**Run this when done to stop charges:**

```bash
chmod +x cleanup.sh
./cleanup.sh
```

## Performance Expectations

With this setup:
- **Concurrent Candidates**: 200+
- **Grading Throughput**: ~10-20 jobs/second
- **No SSH tunnel latency** (all services in same VPC)

## Troubleshooting

### RDS Connection Issues
- Check security group allows EC2 access
- Verify DB endpoint is correct
- Test: `psql -h [DB_ENDPOINT] -U postgres -d exam_platform`

### ElastiCache Connection Issues
- ElastiCache not publicly accessible by design
- Must connect from within VPC (EC2)
- Test from EC2: `redis-cli -h [REDIS_ENDPOINT] PING`

### Grader Not Processing Jobs
1. Check grader is running: `pgrep grader`
2. Check logs: `tail -100 ~/grader.log`
3. Check Redis connection: `docker run --rm redis:7-alpine redis-cli -h [REDIS_ENDPOINT] PING`
4. Check DB connection: Test with psql
