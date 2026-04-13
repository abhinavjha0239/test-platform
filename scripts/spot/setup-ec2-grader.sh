#!/bin/bash
# EC2 Grader Setup Script
# Run this to set up grading on EC2

EC2_IP="${EC2_IP:-3.110.124.250}"

echo "═══════════════════════════════════════════════════════════════"
echo "  EC2 GRADER SETUP"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Copy grader binary
echo "Step 1: Copying grader binary to EC2..."
cd "$(dirname "$0")/../../apps/grader-go"
GOOS=linux GOARCH=amd64 go build -o grader-linux ./cmd/grader/
scp grader-linux ec2-user@${EC2_IP}:~/grader
echo "✅ Grader copied"

# Step 2: Start Redis on EC2
echo ""
echo "Step 2: Starting Redis on EC2..."
ssh ec2-user@${EC2_IP} "docker rm -f redis-grader 2>/dev/null; docker run -d --name redis-grader -p 6379:6379 redis:7-alpine"
echo "✅ Redis started"

# Step 3: Pre-warm PostgreSQL containers
echo ""
echo "Step 3: Pre-warming 100 PostgreSQL containers..."
ssh ec2-user@${EC2_IP} '
docker rm -f $(docker ps -aq --filter "name=sql-pool") 2>/dev/null
for i in $(seq 0 99); do
    docker run -d --name sql-pool-$i \
        -e POSTGRES_PASSWORD=grader \
        -e POSTGRES_USER=grader \
        -e POSTGRES_DB=grader \
        --memory=80m \
        -p 0:5432 \
        postgres:16-alpine &
    [ $((i % 20)) -eq 19 ] && wait
done
wait
'
echo "✅ Containers pre-warmed"

# Step 4: Create startup script on EC2
echo ""
echo "Step 4: Creating grader startup script..."
ssh ec2-user@${EC2_IP} "cat > ~/run-grader.sh << 'EOF'
#!/bin/bash
export REDIS_URL=\"redis://localhost:6379\"
export DATABASE_URL=\"\${DATABASE_URL:-postgresql://postgres:postgres@host.docker.internal:5432/exam_platform}\"
export GRADING_CONCURRENCY=50
export SQL_CONTAINER_POOL_SIZE=100
cd ~
exec ./grader
EOF
chmod +x ~/run-grader.sh"
echo "✅ Startup script created"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "To start grader on EC2:"
echo "  ssh ec2-user@${EC2_IP} '~/run-grader.sh'"
echo ""
echo "EC2 Redis URL (for local API):"
echo "  redis://${EC2_IP}:6379"
echo ""
echo "Update your local .env:"
echo "  REDIS_URL=redis://${EC2_IP}:6379"
echo ""
