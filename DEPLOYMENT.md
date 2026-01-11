# Exam Platform Deployment Guide

Complete guide to deploying the Exam Platform on Google Cloud Platform (GCP) Compute Engine.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [GCP Setup](#gcp-setup)
4. [VM Configuration](#vm-configuration)
5. [Application Deployment](#application-deployment)
6. [SSL Certificate Setup](#ssl-certificate-setup)
7. [Database Setup](#database-setup)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Cost Estimation](#cost-estimation)

---

## Architecture Overview

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                    GCP Compute Engine VM                     │
                    │                     (e2-standard-2)                          │
                    │                                                              │
    Internet        │  ┌─────────┐    ┌─────────┐    ┌─────────┐                 │
        │           │  │  Nginx  │───▶│   Web   │    │   API   │                 │
        │           │  │  :80    │    │  :3000  │    │  :3001  │                 │
        ▼           │  │  :443   │───▶│ Next.js │    │ Express │                 │
   ┌────────┐       │  └────┬────┘    └─────────┘    └────┬────┘                 │
   │  User  │──────▶│       │                              │                      │
   └────────┘       │       │         ┌─────────┐          │                      │
                    │       └────────▶│ Socket  │◀─────────┘                      │
                    │                 │   .IO   │                                  │
                    │                 └─────────┘                                  │
                    │                                                              │
                    │  ┌─────────┐    ┌─────────┐    ┌─────────────────┐         │
                    │  │ Worker  │───▶│  Redis  │    │   PostgreSQL    │         │
                    │  │ Grading │    │  :6379  │    │     :5432       │         │
                    │  └────┬────┘    └─────────┘    └─────────────────┘         │
                    │       │                                                      │
                    │       ▼                                                      │
                    │  ┌─────────────────────────────────────┐                    │
                    │  │        Docker Socket (DinD)          │                    │
                    │  │   ┌───────┐ ┌───────┐ ┌───────┐     │                    │
                    │  │   │Node   │ │Python │ │ Go    │ ... │                    │
                    │  │   │Grader │ │Grader │ │Grader │     │                    │
                    │  │   └───────┘ └───────┘ └───────┘     │                    │
                    │  └─────────────────────────────────────┘                    │
                    │                                                              │
                    └─────────────────────────────────────────────────────────────┘
```

### Services

| Service | Description | Port |
|---------|-------------|------|
| Nginx | Reverse proxy, SSL termination | 80, 443 |
| Web | Next.js frontend | 3000 (internal) |
| API | Express backend + WebSocket | 3001 (internal) |
| Worker | BullMQ grading worker | - |
| PostgreSQL | Database | 5432 (internal) |
| Redis | Job queue & pub/sub | 6379 (internal) |

---

## Prerequisites

Before starting, ensure you have:

- [ ] GCP account with billing enabled
- [ ] Domain name with DNS access
- [ ] `gcloud` CLI installed locally
- [ ] SSH key configured

### Install gcloud CLI

```bash
# macOS
brew install google-cloud-sdk

# Linux
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud init
```

---

## GCP Setup

### Step 1: Create a Project

```bash
# Create a new project
gcloud projects create exam-platform-prod --name="Exam Platform"

# Set as default project
gcloud config set project exam-platform-prod

# Enable billing (do this in console)
# https://console.cloud.google.com/billing
```

### Step 2: Enable Required APIs

```bash
gcloud services enable compute.googleapis.com
```

### Step 3: Create Firewall Rules

```bash
# Allow HTTP
gcloud compute firewall-rules create allow-http \
    --allow=tcp:80 \
    --target-tags=http-server \
    --description="Allow HTTP traffic"

# Allow HTTPS
gcloud compute firewall-rules create allow-https \
    --allow=tcp:443 \
    --target-tags=https-server \
    --description="Allow HTTPS traffic"
```

### Step 4: Reserve Static IP

```bash
# Reserve a static IP
gcloud compute addresses create exam-platform-ip --region=us-central1

# Get the IP address
gcloud compute addresses describe exam-platform-ip --region=us-central1 --format='value(address)'
```

**Important:** Add this IP to your domain's DNS as an A record.

### Step 5: Create VM Instance

With $200 budget and for fast grading, use `e2-standard-8`:

```bash
gcloud compute instances create exam-platform \
    --zone=us-central1-a \
    --machine-type=e2-standard-8 \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=50GB \
    --boot-disk-type=pd-ssd \
    --tags=http-server,https-server \
    --address=exam-platform-ip

# Optionally attach additional disk for data (recommended for production)
# gcloud compute disks create exam-data --zone=us-central1-a --size=50GB --type=pd-ssd
# gcloud compute instances attach-disk exam-platform --disk=exam-data --zone=us-central1-a
```

### Machine Type Options

| Type | vCPU | Memory | Monthly Cost | Recommended For |
|------|------|--------|--------------|-----------------|
| e2-medium | 2 | 4GB | ~$25 | Development |
| e2-standard-2 | 2 | 8GB | ~$50 | 1-10 users |
| e2-standard-4 | 4 | 16GB | ~$100 | 10-50 users |
| **e2-standard-8** | **8** | **32GB** | **~$195** | **Production (selected)** |
| e2-standard-16 | 16 | 64GB | ~$390 | High-volume exams |

---

## VM Configuration

### Step 1: SSH into the VM

```bash
gcloud compute ssh exam-platform --zone=us-central1-a
```

### Step 2: Run Setup Script

Upload and run the setup script:

```bash
# Clone your repository
cd /opt
sudo git clone https://github.com/YOUR_USERNAME/exam-platform.git
sudo chown -R $USER:$USER exam-platform
cd exam-platform

# Run setup script
chmod +x scripts/setup-vm.sh
./scripts/setup-vm.sh

# IMPORTANT: Log out and log back in for Docker group to take effect
exit
```

SSH back in:

```bash
gcloud compute ssh exam-platform --zone=us-central1-a
cd /opt/exam-platform
```

### Step 3: Verify Docker Installation

```bash
docker --version
docker-compose --version
docker ps  # Should work without sudo
```

---

## Application Deployment

### Step 1: Configure Environment

```bash
cd /opt/exam-platform

# Copy template
cp env.production.template .env.production

# Edit configuration
nano .env.production
```

**Required changes:**

```env
# Your domain
DOMAIN=exam.yourdomain.com
FRONTEND_URL=https://exam.yourdomain.com

# Generate secure password
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Update DATABASE_URL with the password
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@postgres:5432/exam_platform

# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Get Docker GID
DOCKER_GID=$(getent group docker | cut -d: -f3)
```

Generate secrets automatically:

```bash
# Generate and display secure values
echo "POSTGRES_PASSWORD: $(openssl rand -base64 32)"
echo "JWT_SECRET: $(openssl rand -hex 32)"
echo "DOCKER_GID: $(getent group docker | cut -d: -f3)"
```

### Step 2: First Deployment

```bash
# Build and start all services
./scripts/deploy.sh --build --migrate

# Check if all services are running
docker-compose -f docker-compose.prod.yml ps
```

### Step 3: Initialize Database

```bash
# Sync challenges to database
docker-compose -f docker-compose.prod.yml exec api \
    npm run sync-all --workspace=@exam-platform/database

# Optionally seed with sample data
docker-compose -f docker-compose.prod.yml exec api \
    npm run db:seed --workspace=@exam-platform/database
```

---

## SSL Certificate Setup

### Step 1: Ensure DNS is Configured

Your domain should point to your VM's static IP:

```bash
# Check DNS propagation
dig +short your-domain.com
# Should return your GCP static IP
```

### Step 2: Generate Certificate

```bash
cd /opt/exam-platform
./scripts/ssl-init.sh your-domain.com your-email@example.com
```

### Step 3: Verify HTTPS

```bash
# Test HTTPS
curl -I https://your-domain.com

# Should return 200 or redirect to login
```

---

## Database Setup

### Initial Admin User

Create your first admin user:

```bash
docker-compose -f docker-compose.prod.yml exec api \
    node -e "
    const { db, users } = require('./packages/database/dist/index.js');
    const bcrypt = require('bcryptjs');
    
    async function createAdmin() {
        const hashedPassword = await bcrypt.hash('YOUR_SECURE_PASSWORD', 12);
        await db.insert(users).values({
            email: 'admin@yourdomain.com',
            password: hashedPassword,
            name: 'Admin',
            role: 'ADMIN',
            approvalStatus: 'APPROVED'
        });
        console.log('Admin user created!');
        process.exit(0);
    }
    createAdmin();
    "
```

Or use the seed script if available:

```bash
docker-compose -f docker-compose.prod.yml exec api \
    npm run db:seed --workspace=@exam-platform/database
```

### Database Backups

Set up automatic daily backups:

```bash
# Add to crontab
crontab -e

# Add this line (runs at 2 AM daily)
0 2 * * * /opt/exam-platform/scripts/backup.sh >> /var/log/exam-backup.log 2>&1
```

Manual backup:

```bash
./scripts/backup.sh
```

### Database Restore

```bash
# Restore from backup
gunzip -c /opt/exam-platform/backups/exam_platform_YYYYMMDD_HHMMSS.sql.gz | \
    docker-compose -f docker-compose.prod.yml exec -T postgres \
    psql -U postgres exam_platform
```

---

## Monitoring & Maintenance

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f worker
docker-compose -f docker-compose.prod.yml logs -f nginx
```

### Health Checks

```bash
# API health
curl http://localhost:3001/health

# Full health check
curl https://your-domain.com/health
```

### Restart Services

```bash
# Restart all
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart api
```

### Update Application

```bash
cd /opt/exam-platform

# Pull latest code
git pull origin main

# Rebuild and deploy
./scripts/deploy.sh --build

# If there are database changes
./scripts/deploy.sh --build --migrate
```

### Resource Monitoring

```bash
# Docker stats
docker stats

# System resources
htop

# Disk usage
df -h
```

---

## Troubleshooting

### Common Issues

#### 1. Services won't start

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Check if ports are in use
sudo netstat -tlpn | grep -E '80|443|3000|3001'

# Restart Docker
sudo systemctl restart docker
```

#### 2. Database connection errors

```bash
# Check if postgres is running
docker-compose -f docker-compose.prod.yml ps postgres

# Check postgres logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker-compose -f docker-compose.prod.yml exec postgres \
    psql -U postgres -c "SELECT 1;"
```

#### 3. Grading worker not processing jobs

```bash
# Check worker logs
docker-compose -f docker-compose.prod.yml logs worker

# Check if Docker socket is accessible
docker-compose -f docker-compose.prod.yml exec worker \
    docker ps

# Restart worker
docker-compose -f docker-compose.prod.yml restart worker
```

#### 4. SSL certificate issues

```bash
# Check certificate status
docker-compose -f docker-compose.prod.yml run --rm certbot certificates

# Force renewal
docker-compose -f docker-compose.prod.yml run --rm certbot renew --force-renewal
docker-compose -f docker-compose.prod.yml restart nginx
```

#### 5. Out of disk space

```bash
# Check disk usage
df -h

# Clean Docker
docker system prune -a --volumes

# Clean old backups
find /opt/exam-platform/backups -mtime +7 -delete
```

### Getting Support

1. Check logs: `docker-compose -f docker-compose.prod.yml logs`
2. Check system resources: `htop`, `df -h`
3. Review this documentation
4. Check GitHub issues

---

## Cost Estimation

### Monthly Costs (Approximate)

| Resource | Specification | Cost |
|----------|---------------|------|
| Compute Engine | e2-standard-8 (8 vCPU, 32GB) | ~$195 |
| Boot Disk | 50GB SSD | ~$8 |
| Static IP | 1 regional IP | ~$3 |
| Network Egress | ~20GB | ~$2 |
| **Total** | | **~$208/month** |

> **Tip:** Use [committed use discounts](https://cloud.google.com/compute/docs/instances/signing-up-committed-use-discounts) for 1-year commitment to save ~20% (~$165/month).

### Cost Optimization Tips

1. **Use committed use discounts** - 1 or 3-year commitments save 20-57%
2. **Use preemptible VMs** for development - 60-91% cheaper
3. **Right-size your VM** - Start small, scale up as needed
4. **Set up budget alerts** in GCP Console

---

## Quick Reference

### Common Commands

```bash
# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Stop all services
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Restart specific service
docker-compose -f docker-compose.prod.yml restart <service>

# Run database migrations
docker-compose -f docker-compose.prod.yml exec api \
    npm run db:migrate --workspace=@exam-platform/database

# Backup database
./scripts/backup.sh

# Update and deploy
git pull && ./scripts/deploy.sh --build
```

### File Locations

| File/Directory | Purpose |
|----------------|---------|
| `/opt/exam-platform` | Application code |
| `/opt/exam-platform/backups` | Database backups |
| `/opt/exam-platform/.env.production` | Environment config |
| `/var/log/exam-backup.log` | Backup logs |

---

## Security Checklist

- [ ] Strong passwords in `.env.production`
- [ ] SSH key authentication only (disable password auth)
- [ ] Firewall allows only ports 22, 80, 443
- [ ] Regular system updates: `sudo apt update && sudo apt upgrade`
- [ ] Database not exposed to internet
- [ ] Regular backups configured
- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Rate limiting configured in Nginx

