#!/bin/bash
# ============================================
# Exam Platform - Sync Challenges Script
# ============================================
# Syncs challenge definitions to the database
#
# Usage: ./sync-challenges.sh
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

echo -e "${YELLOW}📚 Syncing challenges to database...${NC}"

docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec api \
    npm run sync-all --workspace=@exam-platform/database

echo -e "${GREEN}✅ Challenges synced successfully!${NC}"


