#!/bin/bash
# ============================================
# Exam Platform - SSL Certificate Setup
# ============================================
# Initializes Let's Encrypt SSL certificates
#
# Usage: ./ssl-init.sh <domain> <email>
# Example: ./ssl-init.sh exam.example.com admin@example.com
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check arguments
if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}❌ Usage: $0 <domain> <email>${NC}"
    echo "Example: $0 exam.example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

echo -e "${YELLOW}🔐 Setting up SSL certificates for $DOMAIN...${NC}"

# ============================================
# Step 1: Start nginx in HTTP-only mode
# ============================================
echo -e "${YELLOW}📦 Starting nginx in HTTP mode...${NC}"

# Update DOMAIN in env file
if [ -f "$ENV_FILE" ]; then
    sed -i "s/DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE"
fi

# Start only nginx for certificate challenge
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx

echo "Waiting for nginx to start..."
sleep 5

# ============================================
# Step 2: Request certificate
# ============================================
echo -e "${YELLOW}🔑 Requesting SSL certificate from Let's Encrypt...${NC}"

docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ SSL certificate obtained successfully!${NC}"
else
    echo -e "${RED}❌ Failed to obtain SSL certificate${NC}"
    echo "Make sure:"
    echo "  1. Your domain's DNS A record points to this server's IP"
    echo "  2. Port 80 is accessible from the internet"
    echo "  3. The domain is correct: $DOMAIN"
    exit 1
fi

# ============================================
# Step 3: Restart nginx with SSL
# ============================================
echo -e "${YELLOW}🔄 Restarting nginx with SSL...${NC}"

docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart nginx

sleep 5

# ============================================
# Step 4: Verify HTTPS
# ============================================
echo -e "${YELLOW}🔍 Verifying HTTPS...${NC}"

if curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/health" 2>/dev/null | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ HTTPS is working!${NC}"
else
    echo -e "${YELLOW}⚠️  Could not verify HTTPS (this might be normal if other services aren't running yet)${NC}"
fi

# ============================================
# Step 5: Setup auto-renewal
# ============================================
echo -e "${YELLOW}⏰ Setting up automatic certificate renewal...${NC}"

# Add cron job for certificate renewal
CRON_JOB="0 0 * * * cd $(pwd) && docker-compose -f $COMPOSE_FILE run --rm certbot renew && docker-compose -f $COMPOSE_FILE restart nginx"

# Check if cron job already exists
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo -e "${GREEN}✅ Automatic renewal configured (daily at midnight)${NC}"
else
    echo -e "${GREEN}✅ Automatic renewal already configured${NC}"
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ SSL Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Your site is now accessible at: https://$DOMAIN"
echo ""
echo "Certificate will auto-renew before expiration."
echo "To manually renew: docker-compose -f $COMPOSE_FILE run --rm certbot renew"
echo ""


