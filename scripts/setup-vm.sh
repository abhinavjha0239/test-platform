#!/bin/bash
# ============================================
# Exam Platform - VM Setup Script
# ============================================
# Run this script on a fresh GCP Compute Engine VM
# 
# Usage: ./setup-vm.sh
# ============================================

set -e

echo "🚀 Starting Exam Platform VM Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# 1. Update System
# ============================================
echo -e "${YELLOW}📦 Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# ============================================
# 2. Install Docker
# ============================================
echo -e "${YELLOW}🐳 Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo -e "${GREEN}✅ Docker installed${NC}"
else
    echo -e "${GREEN}✅ Docker already installed${NC}"
fi

# ============================================
# 3. Install Docker Compose
# ============================================
echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${GREEN}✅ Docker Compose already installed${NC}"
fi

# ============================================
# 4. Install useful tools
# ============================================
echo -e "${YELLOW}🔧 Installing useful tools...${NC}"
sudo apt-get install -y git htop curl wget jq

# ============================================
# 5. Create data directory
# ============================================
echo -e "${YELLOW}📁 Creating data directories...${NC}"
sudo mkdir -p /opt/exam-platform
sudo chown -R $USER:$USER /opt/exam-platform

# ============================================
# 6. Pre-pull grading Docker images
# ============================================
echo -e "${YELLOW}📥 Pre-pulling grading Docker images (this may take a while)...${NC}"

# Need to use sudo for docker until re-login
sudo docker pull node:20-alpine
sudo docker pull python:3.11-slim
sudo docker pull golang:1.21-alpine
sudo docker pull rust:1.75-slim
sudo docker pull postgres:15-alpine
sudo docker pull redis:7-alpine
sudo docker pull nginx:alpine
sudo docker pull certbot/certbot:latest

echo -e "${GREEN}✅ Docker images pulled${NC}"

# ============================================
# 7. Configure firewall (if ufw is available)
# ============================================
echo -e "${YELLOW}🔥 Configuring firewall...${NC}"
if command -v ufw &> /dev/null; then
    sudo ufw allow 22/tcp   # SSH
    sudo ufw allow 80/tcp   # HTTP
    sudo ufw allow 443/tcp  # HTTPS
    sudo ufw --force enable
    echo -e "${GREEN}✅ Firewall configured${NC}"
else
    echo -e "${YELLOW}⚠️  UFW not available, using GCP firewall rules${NC}"
fi

# ============================================
# 8. Setup swap (for smaller VMs)
# ============================================
echo -e "${YELLOW}💾 Setting up swap...${NC}"
if [ ! -f /swapfile ]; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo -e "${GREEN}✅ Swap configured (2GB)${NC}"
else
    echo -e "${GREEN}✅ Swap already configured${NC}"
fi

# ============================================
# 9. Get Docker GID
# ============================================
DOCKER_GID=$(getent group docker | cut -d: -f3)
echo -e "${GREEN}📝 Docker GID: ${DOCKER_GID}${NC}"
echo "Add this to your .env.production: DOCKER_GID=${DOCKER_GID}"

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ VM Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo "1. Log out and log back in for Docker group to take effect"
echo "2. Clone your repository to /opt/exam-platform"
echo "3. Copy env.production.template to .env.production and configure"
echo "4. Run: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "Docker GID for .env.production: ${DOCKER_GID}"
echo ""


