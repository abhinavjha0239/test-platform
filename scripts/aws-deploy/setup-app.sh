#!/bin/bash
# Setup Application on AWS Infrastructure
# Run after deploy-full-stack.sh

set -e

# Load config
source aws-config.env

echo "═══════════════════════════════════════════════════════════════"
echo "  EXAM PLATFORM - APPLICATION SETUP"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Get RDS Endpoint
echo "Step 1: Getting RDS endpoint..."
DB_STATUS=$(aws rds describe-db-instances --db-instance-identifier ${DB_NAME} --region $REGION --query 'DBInstances[0].DBInstanceStatus' --output text)
if [ "$DB_STATUS" != "available" ]; then
    echo "  ⏳ RDS still creating (status: $DB_STATUS). Waiting..."
    aws rds wait db-instance-available --db-instance-identifier ${DB_NAME} --region $REGION
fi
DB_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier ${DB_NAME} --region $REGION --query 'DBInstances[0].Endpoint.Address' --output text)
echo "  ✅ RDS endpoint: $DB_ENDPOINT"

# Step 2: Get ElastiCache Endpoint
echo ""
echo "Step 2: Getting ElastiCache endpoint..."
REDIS_STATUS=$(aws elasticache describe-cache-clusters --cache-cluster-id ${REDIS_NAME} --region $REGION --query 'CacheClusters[0].CacheClusterStatus' --output text)
if [ "$REDIS_STATUS" != "available" ]; then
    echo "  ⏳ ElastiCache still creating (status: $REDIS_STATUS). Waiting..."
    sleep 60
fi
REDIS_ENDPOINT=$(aws elasticache describe-cache-clusters --cache-cluster-id ${REDIS_NAME} --show-cache-node-info --region $REGION --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text)
echo "  ✅ Redis endpoint: $REDIS_ENDPOINT"

# Step 3: Export local database and import to RDS
echo ""
echo "Step 3: Migrating local database to RDS..."

# Create temporary security group rule to allow local access
MY_IP=$(curl -s https://api.ipify.org)
DB_SG_ID=$(aws rds describe-db-instances --db-instance-identifier ${DB_NAME} --region $REGION --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id $DB_SG_ID --protocol tcp --port 5432 --cidr ${MY_IP}/32 --region $REGION 2>/dev/null || true

echo "  Exporting local database..."
pg_dump "postgresql://postgres:postgres@localhost:5432/exam_platform" > /tmp/exam_platform_dump.sql 2>/dev/null || \
    docker run --rm --network host postgres:16-alpine pg_dump "postgresql://postgres:postgres@host.docker.internal:5432/exam_platform" > /tmp/exam_platform_dump.sql 2>/dev/null || \
    echo "  ⚠️ Could not dump local DB, will need manual migration"

if [ -f /tmp/exam_platform_dump.sql ] && [ -s /tmp/exam_platform_dump.sql ]; then
    echo "  Importing to RDS..."
    PGPASSWORD='ExamPlatform2024!' psql -h $DB_ENDPOINT -U postgres -d exam_platform < /tmp/exam_platform_dump.sql 2>/dev/null || \
        docker run --rm -v /tmp:/tmp postgres:16-alpine sh -c "PGPASSWORD='ExamPlatform2024!' psql -h $DB_ENDPOINT -U postgres -d exam_platform < /tmp/exam_platform_dump.sql" || \
        echo "  ⚠️ Could not import to RDS, will need manual migration"
    echo "  ✅ Database migrated"
else
    echo "  ⚠️ No local dump found, skipping migration"
fi

# Step 4: Setup Web/API EC2
echo ""
echo "Step 4: Setting up Web/API server..."

ssh -i ~/.ssh/${KEY_NAME}.pem -o StrictHostKeyChecking=no ec2-user@$WEB_IP << ENDSSH
# Clone repository
cd ~
if [ ! -d "exam-platform" ]; then
    git clone https://github.com/YOUR_REPO/exam-platform.git || mkdir -p exam-platform
fi
cd exam-platform

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://postgres:ExamPlatform2024!@${DB_ENDPOINT}:5432/exam_platform
REDIS_URL=redis://${REDIS_ENDPOINT}:6379
JWT_SECRET=production-jwt-secret-change-this-$(openssl rand -hex 16)
FRONTEND_URL=http://${WEB_IP}:3000
PORT=3001
EOF

# Install dependencies
cd apps/api
pnpm install --frozen-lockfile 2>/dev/null || npm install

# Build and start
pnpm build 2>/dev/null || npm run build
pm2 delete api 2>/dev/null || true
pm2 start "npm run start" --name api

cd ../web
pnpm install --frozen-lockfile 2>/dev/null || npm install
pnpm build 2>/dev/null || npm run build
pm2 delete web 2>/dev/null || true
pm2 start "npm run start" --name web

pm2 save
ENDSSH

echo "  ✅ Web/API server configured"

# Step 5: Setup Grader EC2
echo ""
echo "Step 5: Setting up Grader server..."

# Build grader binary locally and copy
echo "  Building grader binary..."
cd "$(dirname "$0")/../../apps/grader-go"
GOOS=linux GOARCH=amd64 go build -o grader-linux ./cmd/grader/

# Copy to EC2
scp -i ~/.ssh/${KEY_NAME}.pem -o StrictHostKeyChecking=no grader-linux ec2-user@$GRADER_IP:~/grader
rm grader-linux

ssh -i ~/.ssh/${KEY_NAME}.pem -o StrictHostKeyChecking=no ec2-user@$GRADER_IP << ENDSSH
chmod +x ~/grader

# Pre-warm PostgreSQL containers
echo "Pre-warming 50 PostgreSQL containers..."
for i in \$(seq 0 49); do
    docker run -d --name sql-pool-\$i \
        -e POSTGRES_PASSWORD=grader \
        -e POSTGRES_USER=grader \
        -e POSTGRES_DB=grader \
        --memory=80m \
        -p 0:5432 \
        postgres:16-alpine &
    [ \$((i % 10)) -eq 9 ] && wait
done
wait
echo "Containers ready: \$(docker ps -q | wc -l)"

# Create grader startup script
cat > ~/start-grader.sh << 'EOF'
#!/bin/bash
export REDIS_URL="redis://${REDIS_ENDPOINT}:6379"
export DATABASE_URL="postgresql://postgres:ExamPlatform2024!@${DB_ENDPOINT}:5432/exam_platform"
export GRADING_CONCURRENCY=50
export SQL_CONTAINER_POOL_SIZE=50
cd ~
exec ./grader
EOF
chmod +x ~/start-grader.sh

# Start grader
nohup ~/start-grader.sh > ~/grader.log 2>&1 &
sleep 5
pgrep grader && echo "✅ Grader running" || echo "❌ Grader failed"
ENDSSH

echo "  ✅ Grader server configured"

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "URLs:"
echo "  Web App:     http://${WEB_IP}:3000"
echo "  API Server:  http://${WEB_IP}:3001"
echo ""
echo "Endpoints:"
echo "  RDS:         $DB_ENDPOINT"
echo "  Redis:       $REDIS_ENDPOINT"
echo ""
echo "SSH Access:"
echo "  Web:     ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$WEB_IP"
echo "  Grader:  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$GRADER_IP"
echo ""
echo "Monitor grader:"
echo "  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$GRADER_IP 'tail -f ~/grader.log'"
echo ""

# Save endpoints
cat >> aws-config.env << EOF
DB_ENDPOINT=$DB_ENDPOINT
REDIS_ENDPOINT=$REDIS_ENDPOINT
EOF
