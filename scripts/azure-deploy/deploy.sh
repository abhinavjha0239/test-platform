#!/bin/bash
# ============================================
# Exam Platform - Azure Deployment Script
# ============================================
# Deploys or updates the exam platform on Azure
#
# Usage: ./deploy.sh [--build] [--migrate]
#   --build   Force rebuild of Docker images (no cache)
#   --migrate Run database migrations
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.azure.yml"
ENV_FILE=".env.production"

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

echo -e "${YELLOW}Starting Exam Platform Azure Deployment...${NC}"

# ============================================
# Pre-flight checks
# ============================================
echo -e "${YELLOW}Running pre-flight checks...${NC}"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}Error: $COMPOSE_FILE not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: $ENV_FILE not found${NC}"
    echo "Please copy env.azure.template to .env.production and configure it"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Load env vars for connectivity checks
set -a
source "$ENV_FILE"
set +a

echo -e "${GREEN}Pre-flight checks passed${NC}"

# ============================================
# Connectivity checks (managed services)
# ============================================
echo -e "${YELLOW}Checking connectivity to managed services...${NC}"

# Check PostgreSQL connectivity
PG_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\(.*\):.*/\1/p' | cut -d'/' -f1)
if [ -n "$PG_HOST" ]; then
    if timeout 5 bash -c "echo > /dev/tcp/$PG_HOST/5432" 2>/dev/null; then
        echo -e "${GREEN}PostgreSQL ($PG_HOST) reachable${NC}"
    else
        echo -e "${YELLOW}Warning: Cannot reach PostgreSQL at $PG_HOST:5432${NC}"
        echo "Make sure the firewall rule allows this VM's IP"
    fi
fi

echo -e "${GREEN}Connectivity checks done${NC}"

# ============================================
# Pull latest code (if git repo)
# ============================================
if [ -d ".git" ]; then
    echo -e "${YELLOW}Pulling latest code...${NC}"
    git pull origin main || git pull origin master || echo "Git pull skipped"
fi

# ============================================
# Build Docker images
# ============================================
if [ "$BUILD" = true ]; then
    echo -e "${YELLOW}Building Docker images (no cache)...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
else
    echo -e "${YELLOW}Building Docker images (with cache)...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
fi

# ============================================
# Run migrations if requested
# ============================================
if [ "$MIGRATE" = true ]; then
    echo -e "${YELLOW}Running database migrations...${NC}"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm api \
        sh -c "cd /app && npx drizzle-kit push"
    echo -e "${GREEN}Migrations complete${NC}"
fi

# ============================================
# Start services
# ============================================
echo -e "${YELLOW}Starting services...${NC}"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ============================================
# Health checks
# ============================================
echo -e "${YELLOW}Running health checks...${NC}"
sleep 15

SERVICES=("nginx" "web" "api")
ALL_HEALTHY=true

for service in "${SERVICES[@]}"; do
    count=$(docker compose -f "$COMPOSE_FILE" ps "$service" --format json 2>/dev/null | grep -c '"running"' || echo "0")
    if [ "$count" -gt 0 ]; then
        echo -e "${GREEN}$service is running ($count instance(s))${NC}"
    else
        echo -e "${RED}$service is not running${NC}"
        ALL_HEALTHY=false
    fi
done

# Check API health endpoint
sleep 5
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}API health check passed${NC}"
else
    echo -e "${YELLOW}API health check pending (may still be starting)${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
if [ "$ALL_HEALTHY" = true ]; then
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
else
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}Deployment Complete (check warnings above)${NC}"
    echo -e "${YELLOW}============================================${NC}"
fi

echo ""
echo "Useful commands:"
echo "  View logs:     docker compose -f $COMPOSE_FILE logs -f"
echo "  View status:   docker compose -f $COMPOSE_FILE ps"
echo "  Restart:       docker compose -f $COMPOSE_FILE restart"
echo "  Stop:          docker compose -f $COMPOSE_FILE down"
echo ""
