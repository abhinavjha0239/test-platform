#!/bin/bash
set -e

# ==============================================================================
# Deploy Grader to All Spot VMs
# Usage: ./deploy-spot-fleet.sh [concurrency-per-vm]
#
# Reads IPs from /tmp/grader-spot-ips.txt (written by provision-spot-fleet.sh)
# or from command line args: ./deploy-spot-fleet.sh 40 ip1 ip2 ip3 ...
# ==============================================================================

CONCURRENCY_PER_VM=${1:-40}
shift 2>/dev/null || true

# Get IPs from args or file
if [ $# -gt 0 ]; then
  IPS=("$@")
else
  IP_FILE="/tmp/grader-spot-ips.txt"
  if [ ! -f "$IP_FILE" ]; then
    echo "No IPs provided and ${IP_FILE} not found."
    echo "Usage: ./deploy-spot-fleet.sh [concurrency] [ip1 ip2 ...]"
    exit 1
  fi
  mapfile -t IPS < "$IP_FILE"
fi

SSH_USER="azureuser"
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB_URL="postgres://examadmin:ExamPl%40tf0rm2026!@exam-pg-server.postgres.database.azure.com:5432/exam_db?sslmode=require"
REDIS_URL="rediss://:8U2A8BFXe9XqdrS0vVwRGYLXaKgHdIYmDAzCaMrcVnk=@exam-redis-cache.redis.cache.windows.net:6380"

echo "============================================================"
echo "  FLEET DEPLOYMENT"
echo "============================================================"
echo "  VMs:          ${#IPS[@]}"
echo "  Concurrency:  ${CONCURRENCY_PER_VM} per VM"
echo "  Project:      ${PROJECT_ROOT}"
echo "============================================================"
echo ""

deploy_to_vm() {
  local IP=$1
  local VM_NUM=$2
  local LOG="/tmp/grader-deploy-${VM_NUM}.log"

  echo "[VM-${VM_NUM}] Deploying to ${IP}..." | tee -a "$LOG"

  SSH_TARGET="${SSH_USER}@${IP}"

  # Step 1: Install Docker
  echo "[VM-${VM_NUM}] Installing Docker..." >> "$LOG"
  ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 ${SSH_TARGET} << 'DOCKER_EOF' >> "$LOG" 2>&1
set -e
if command -v docker &>/dev/null; then
  echo "Docker already installed"
else
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker $USER
fi
if [ ! -f /etc/docker/daemon.json ] || ! grep -q live-restore /etc/docker/daemon.json; then
  echo '{"live-restore": true, "log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "3"}}' | sudo tee /etc/docker/daemon.json > /dev/null
  sudo systemctl restart docker
fi
sudo mkdir -p /opt/exam-platform
sudo chown -R $USER:$USER /opt/exam-platform
DOCKER_EOF
  echo "[VM-${VM_NUM}] Docker ready." | tee -a "$LOG"

  # Step 2: Sync codebase
  echo "[VM-${VM_NUM}] Syncing codebase..." >> "$LOG"
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
    "${PROJECT_ROOT}/" "${SSH_TARGET}:/opt/exam-platform/" >> "$LOG" 2>&1
  echo "[VM-${VM_NUM}] Code synced." | tee -a "$LOG"

  # Step 3: Pull images + build
  echo "[VM-${VM_NUM}] Building images..." >> "$LOG"
  ssh -o StrictHostKeyChecking=no ${SSH_TARGET} << 'BUILD_EOF' >> "$LOG" 2>&1
set -e
cd /opt/exam-platform

# Pull base images
docker pull node:20-alpine 2>&1 | tail -1
docker pull golang:1.24-alpine 2>&1 | tail -1
docker pull alpine:3.20 2>&1 | tail -1

# Build candidate image
docker build -t exam-react-candidate:latest -f docker/Dockerfile.react-candidate docker/

# Build test image (if exists)
if [ -f docker/Dockerfile.react-test ]; then
  docker build -t exam-react-test:latest -f docker/Dockerfile.react-test docker/
fi

# Build grader image
docker build -t exam-grader:latest -f apps/grader-go/Dockerfile .
BUILD_EOF
  echo "[VM-${VM_NUM}] Images built." | tee -a "$LOG"

  # Step 4: Write env and start grader
  echo "[VM-${VM_NUM}] Starting grader (concurrency=${CONCURRENCY_PER_VM})..." >> "$LOG"
  DOCKER_GID=$(ssh -o StrictHostKeyChecking=no ${SSH_TARGET} "getent group docker | cut -d: -f3")

  ssh -o StrictHostKeyChecking=no ${SSH_TARGET} << STARTEOF >> "$LOG" 2>&1
set -e
cd /opt/exam-platform

cat > .env.grader << 'INNEREOF'
DATABASE_URL=${DB_URL}
REDIS_URL=${REDIS_URL}
GRADING_CONCURRENCY=${CONCURRENCY_PER_VM}
DOCKER_GID=${DOCKER_GID}
INNEREOF

# Stop existing grader
docker compose -f docker-compose.grader.yml --env-file .env.grader down 2>/dev/null || true

# Start grader
docker compose -f docker-compose.grader.yml --env-file .env.grader up -d --build

sleep 3
echo "--- Grader logs ---"
docker compose -f docker-compose.grader.yml --env-file .env.grader logs --tail=10
STARTEOF

  echo "[VM-${VM_NUM}] DEPLOYED to ${IP}" | tee -a "$LOG"
}

# Deploy to all VMs in parallel
PIDS=()
for i in "${!IPS[@]}"; do
  IP="${IPS[$i]}"
  VM_NUM=$((i + 1))
  if [ -z "$IP" ] || [ "$IP" == "PENDING" ]; then
    echo "[VM-${VM_NUM}] Skipping - no IP"
    continue
  fi
  deploy_to_vm "$IP" "$VM_NUM" &
  PIDS+=($!)
done

echo ""
echo "Deploying to ${#PIDS[@]} VMs in parallel..."
echo "Logs: /tmp/grader-deploy-*.log"
echo ""

# Wait for all deployments
FAILED=0
for i in "${!PIDS[@]}"; do
  pid="${PIDS[$i]}"
  if wait $pid; then
    echo "  VM-$((i+1)): SUCCESS"
  else
    echo "  VM-$((i+1)): FAILED (check /tmp/grader-deploy-$((i+1)).log)"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "============================================================"
echo "  FLEET DEPLOYMENT COMPLETE"
echo "============================================================"
echo "  Deployed: $((${#PIDS[@]} - FAILED))/${#PIDS[@]}"
if [ $FAILED -gt 0 ]; then
  echo "  Failed:   ${FAILED}"
fi
echo ""
echo "  All graders join consumer group: grading-workers"
echo "  Redis auto-distributes jobs across all VMs."
echo ""
echo "  Verify: ssh azureuser@<IP> 'docker compose -f /opt/exam-platform/docker-compose.grader.yml --env-file /opt/exam-platform/.env.grader logs --tail=5'"
echo ""
echo "  Benchmark:"
echo "    node scripts/benchmark-grading.js http://20.207.203.80 500"
echo "============================================================"
