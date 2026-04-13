#!/bin/bash
set -e

# ==============================================================================
# Deploy Grader - End-to-End
# Usage: ./deploy-grader.sh <grader-vm-ip> [api-vm-ip]
#
# Steps:
#   1. rsync codebase to grader VM
#   2. Install Docker + dependencies on grader VM
#   3. Build exam-react-candidate and grader images
#   4. Write .env.grader with real credentials
#   5. Start grader via docker compose
#   6. Sync challenges to database (via API VM or direct)
#   7. Verify grader connects to Redis streams
# ==============================================================================

GRADER_IP=$1
API_IP=${2:-20.207.203.80}
SSH_USER="azureuser"

if [ -z "$GRADER_IP" ]; then
  echo "Usage: ./deploy-grader.sh <grader-vm-ip> [api-vm-ip]"
  echo ""
  echo "Example: ./deploy-grader.sh 4.157.x.x 20.207.203.80"
  exit 1
fi

GRADER_SSH="${SSH_USER}@${GRADER_IP}"
API_SSH="${SSH_USER}@${API_IP}"
REMOTE_DIR="/opt/exam-platform"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Azure credentials (update these before running)
DB_URL="postgres://examadmin:ExamPl%40tf0rm2026!@exam-pg-server.postgres.database.azure.com:5432/exam_platform?sslmode=require"
REDIS_URL="rediss://:8U2A8BFXe9XqdrS0vVwRGYLXaKgHdIYmDAzCaMrcVnk=@exam-redis-cache.redis.cache.windows.net:6380"

echo "============================================================"
echo "  GRADER DEPLOYMENT"
echo "============================================================"
echo "  Grader VM:  ${GRADER_IP}"
echo "  API VM:     ${API_IP}"
echo "  Project:    ${PROJECT_ROOT}"
echo "============================================================"
echo ""

# ------------------------------------------------------------------
# Step 1: Install Docker on grader VM (idempotent)
# ------------------------------------------------------------------
echo "[1/7] Installing Docker on grader VM..."

ssh -o StrictHostKeyChecking=no ${GRADER_SSH} << 'INSTALL_EOF'
set -e

if command -v docker &>/dev/null; then
  echo "  Docker already installed: $(docker --version)"
else
  echo "  Installing Docker..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker $USER
  echo "  Docker installed: $(docker --version)"
fi

# Docker daemon config (live-restore + log rotation)
if [ ! -f /etc/docker/daemon.json ] || ! grep -q live-restore /etc/docker/daemon.json; then
  echo '{"live-restore": true, "log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "3"}}' | sudo tee /etc/docker/daemon.json > /dev/null
  sudo systemctl restart docker
  echo "  Docker daemon configured (live-restore, log rotation)"
fi

sudo mkdir -p /opt/exam-platform
sudo chown -R $USER:$USER /opt/exam-platform
INSTALL_EOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Step 2: Sync codebase to grader VM
# ------------------------------------------------------------------
echo "[2/7] Syncing codebase to grader VM..."

rsync -az --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='apps/api/dist' \
  --exclude='apps/web/.next' \
  --exclude='packages/*/dist' \
  --exclude='apps/api/.pnpm-store' \
  --exclude='apps/api/uploads' \
  --exclude='useless' \
  --exclude='*.pyc' \
  --exclude='__pycache__' \
  -e "ssh -o StrictHostKeyChecking=no" \
  "${PROJECT_ROOT}/" "${GRADER_SSH}:${REMOTE_DIR}/"

echo "  Synced $(du -sh "${PROJECT_ROOT}" 2>/dev/null | cut -f1) to ${GRADER_SSH}:${REMOTE_DIR}"
echo ""

# ------------------------------------------------------------------
# Step 3: Pre-pull base images
# ------------------------------------------------------------------
echo "[3/7] Pre-pulling base images on grader VM..."

ssh ${GRADER_SSH} << 'PULL_EOF'
set -e
echo "  Pulling node:20-alpine..."
docker pull node:20-alpine 2>&1 | tail -1
echo "  Pulling golang:1.24-alpine..."
docker pull golang:1.24-alpine 2>&1 | tail -1
echo "  Pulling alpine:3.20..."
docker pull alpine:3.20 2>&1 | tail -1
PULL_EOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Step 4: Build exam-react-candidate image
# ------------------------------------------------------------------
echo "[4/7] Building exam-react-candidate and exam-react-test images on grader VM..."

ssh ${GRADER_SSH} << 'BUILD_CAND_EOF'
set -e
cd /opt/exam-platform
docker build -t exam-react-candidate:latest -f docker/Dockerfile.react-candidate docker/
echo "  Candidate image: $(docker images exam-react-candidate:latest --format '{{.Size}}')"
if [ -f docker/Dockerfile.react-test ]; then
  docker build -t exam-react-test:latest -f docker/Dockerfile.react-test docker/
  echo "  Test image: $(docker images exam-react-test:latest --format '{{.Size}}')"
fi
BUILD_CAND_EOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Step 5: Build grader image
# ------------------------------------------------------------------
echo "[5/7] Building grader image on grader VM..."

ssh ${GRADER_SSH} << 'BUILD_GRADER_EOF'
set -e
cd /opt/exam-platform
docker build -t exam-grader:latest -f apps/grader-go/Dockerfile .
echo "  Image built: $(docker images exam-grader:latest --format '{{.Size}}')"
BUILD_GRADER_EOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Step 6: Write .env.grader and start grader
# ------------------------------------------------------------------
echo "[6/7] Configuring and starting grader..."

# Get Docker GID on remote
DOCKER_GID=$(ssh ${GRADER_SSH} "getent group docker | cut -d: -f3")

ssh ${GRADER_SSH} << ENVEOF
set -e
cd /opt/exam-platform

cat > .env.grader << 'INNEREOF'
DATABASE_URL=${DB_URL}
REDIS_URL=${REDIS_URL}
GRADING_CONCURRENCY=15
DOCKER_GID=${DOCKER_GID}
INNEREOF

echo "  .env.grader written"

# Stop existing grader if running
docker compose -f docker-compose.grader.yml --env-file .env.grader down 2>/dev/null || true

# Start grader
docker compose -f docker-compose.grader.yml --env-file .env.grader up -d --build

echo "  Grader container started"
sleep 3

# Check logs
echo ""
echo "  --- Grader logs (last 20 lines) ---"
docker compose -f docker-compose.grader.yml --env-file .env.grader logs --tail=20
ENVEOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Step 7: Sync challenges to database via API VM
# ------------------------------------------------------------------
echo "[7/7] Syncing challenges to database..."

# First sync the updated challenge files to the API VM
echo "  Syncing challenge files to API VM..."
rsync -az \
  -e "ssh -o StrictHostKeyChecking=no" \
  "${PROJECT_ROOT}/challenges/" "${API_SSH}:/opt/exam-platform/challenges/"
rsync -az \
  -e "ssh -o StrictHostKeyChecking=no" \
  "${PROJECT_ROOT}/packages/database/" "${API_SSH}:/opt/exam-platform/packages/database/"

echo "  Running sync-all-challenges on API VM..."
ssh ${API_SSH} << 'SYNC_EOF'
set -e
cd /opt/exam-platform

# Run sync inside the API container (which has node + DB access)
docker compose -f docker-compose.prod.yml exec -T api sh -c '
  cd /app/packages/database && \
  npx tsx sync-all-challenges.ts 2>&1
' || {
  echo "  Container exec failed, trying direct..."
  # Fallback: run directly if tsx is available
  cd packages/database
  DATABASE_URL="$DATABASE_URL" npx tsx sync-all-challenges.ts 2>&1
}
SYNC_EOF

echo "  Done."
echo ""

# ------------------------------------------------------------------
# Verification
# ------------------------------------------------------------------
echo "============================================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================================"
echo ""
echo "  Grader VM:     ${GRADER_IP}"
echo "  Grader Status: Check with:"
echo "    ssh ${GRADER_SSH} 'docker compose -f /opt/exam-platform/docker-compose.grader.yml --env-file /opt/exam-platform/.env.grader logs -f'"
echo ""
echo "  Expected log output:"
echo "    grader worker ready group=grading-workers"
echo ""
echo "  Next: Run benchmark"
echo "    node scripts/benchmark-grading.js http://${API_IP} 5"
echo "============================================================"
