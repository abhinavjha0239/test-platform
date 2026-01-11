#!/bin/bash
# ============================================
# Exam Platform - Deployment Script
# ============================================
# Deploys or updates the exam platform
#
# Usage: ./deploy.sh [--build] [--migrate]
#   --build   Force rebuild of Docker images
#   --migrate Run database migrations
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"
PROJECT_DIR="/opt/exam-platform"

# Parse arguments
BUILD=false
MIGRATE=false
for arg in "$@"; do
    case $arg in
        --build)
            BUILD=true
            shift
            ;;
        --migrate)
            MIGRATE=true
            shift
            ;;
    esac
done

echo -e "${YELLOW}🚀 Starting Exam Platform Deployment...${NC}"

# ============================================
# Pre-flight checks
# ============================================
echo -e "${YELLOW}🔍 Running pre-flight checks...${NC}"

# Check if we're in the right directory
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ Error: $COMPOSE_FILE not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ Error: $ENV_FILE not found${NC}"
    echo "Please copy env.production.template to .env.production and configure it"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Error: Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Pre-flight checks passed${NC}"

# ============================================
# Pull latest code (if git repo)
# ============================================
if [ -d ".git" ]; then
    echo -e "${YELLOW}📥 Pulling latest code...${NC}"
    git pull origin main || git pull origin master || echo "Git pull skipped"
fi

# ============================================
# Build or pull images
# ============================================
if [ "$BUILD" = true ]; then
    echo -e "${YELLOW}🔨 Building Docker images...${NC}"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
else
    echo -e "${YELLOW}🔨 Building Docker images (with cache)...${NC}"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
fi

# ============================================
# Start/Update services
# ============================================
echo -e "${YELLOW}🚀 Starting services...${NC}"

# Start infrastructure first (postgres, redis)
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis
echo "Waiting for database to be ready..."
sleep 10

# Run migrations if requested
if [ "$MIGRATE" = true ]; then
    echo -e "${YELLOW}📊 Running database migrations...${NC}"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm api \
        sh -c "cd /app && npm run db:migrate --workspace=@exam-platform/database"
    echo -e "${GREEN}✅ Migrations complete${NC}"
fi

# Start all services
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ============================================
# Health check
# ============================================
echo -e "${YELLOW}🏥 Running health checks...${NC}"
sleep 15

# Check if services are running
SERVICES=("nginx" "web" "api" "worker" "postgres" "redis")
ALL_HEALTHY=true

for service in "${SERVICES[@]}"; do
    if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up"; then
        echo -e "${GREEN}✅ $service is running${NC}"
    else
        echo -e "${RED}❌ $service is not running${NC}"
        ALL_HEALTHY=false
    fi
done

# Check API health endpoint
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health | grep -q "200"; then
    echo -e "${GREEN}✅ API health check passed${NC}"
else
    echo -e "${YELLOW}⚠️  API health check failed (may still be starting)${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
if [ "$ALL_HEALTHY" = true ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}✅ Deployment Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}⚠️  Deployment Complete with warnings${NC}"
    echo -e "${YELLOW}============================================${NC}"
    echo ""
    echo "Check logs with: docker-compose -f $COMPOSE_FILE logs -f"
fi

echo ""
echo "Useful commands:"
echo "  View logs:     docker-compose -f $COMPOSE_FILE logs -f"
echo "  View status:   docker-compose -f $COMPOSE_FILE ps"
echo "  Restart:       docker-compose -f $COMPOSE_FILE restart"
echo "  Stop:          docker-compose -f $COMPOSE_FILE down"
echo ""


