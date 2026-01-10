#!/bin/bash
# ============================================
# Exam Platform - Backup Script
# ============================================
# Creates backups of PostgreSQL database
#
# Usage: ./backup.sh
#
# Recommended: Add to crontab for daily backups
# 0 2 * * * /opt/exam-platform/scripts/backup.sh
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
BACKUP_DIR="/opt/exam-platform/backups"
RETENTION_DAYS=7

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
fi

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/exam_platform_$TIMESTAMP.sql.gz"

echo -e "${YELLOW}🗄️  Starting database backup...${NC}"

# ============================================
# PostgreSQL Backup
# ============================================
echo -e "${YELLOW}📦 Backing up PostgreSQL...${NC}"

docker-compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-exam_platform}" \
    | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created: $BACKUP_FILE ($BACKUP_SIZE)${NC}"
else
    echo -e "${RED}❌ Backup failed${NC}"
    exit 1
fi

# ============================================
# Cleanup old backups
# ============================================
echo -e "${YELLOW}🧹 Cleaning up old backups (older than $RETENTION_DAYS days)...${NC}"

DELETED_COUNT=$(find "$BACKUP_DIR" -name "exam_platform_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
echo -e "${GREEN}✅ Deleted $DELETED_COUNT old backup(s)${NC}"

# ============================================
# List current backups
# ============================================
echo ""
echo -e "${YELLOW}📋 Current backups:${NC}"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"

echo ""
echo -e "${GREEN}✅ Backup complete!${NC}"


