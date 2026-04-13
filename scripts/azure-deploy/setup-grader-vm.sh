#!/bin/bash
set -e

# ==============================================================================
# Setup Grader VM (Azure)
# Usage: ./setup-grader-vm.sh <user@ip>
# ==============================================================================

TARGET=$1

if [ -z "$TARGET" ]; then
  echo "Usage: ./setup-grader-vm.sh user@ip"
  exit 1
fi

echo "Connecting to $TARGET to configure Grader VM..."

ssh -o StrictHostKeyChecking=no $TARGET << 'EOF'
  set -e
  
  # 1. System Updates & Docker Install
  echo "Updating system and installing Docker..."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg git
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  
  # Enable Live Restore to prevent grader container crash on docker daemon restart
  echo '{"live-restore": true, "log-driver": "json-file", "log-opts": {"max-size": "50m", "max-file": "3"}}' | sudo tee /etc/docker/daemon.json
  sudo systemctl restart docker
  sudo usermod -aG docker $USER

  # 2. Repo Setup
  echo "Cloning repository..."
  sudo mkdir -p /opt/exam-platform
  sudo chown -R $USER:$USER /opt/exam-platform
  if [ ! -d "/opt/exam-platform/.git" ]; then
    # In a real scenario, this would use a deploy key or PAT. 
    # For now, we initialize an empty space that you push to, or clone public.
    git clone https://github.com/your-org/exam-platform.git /opt/exam-platform || echo "Please push code to /opt/exam-platform manually"
  fi

  cd /opt/exam-platform

  # 3. Pre-pull testing images (Node 20, Go, etc for various challenges)
  echo "Pre-pulling critical Docker images..."
  docker pull node:20-alpine
  docker pull golang:1.23-alpine
  
  # 4. Build Candidate Images locally on VM
  # Assume codebase is present synced via API VM or Git Pull
  if [ -f "docker/Dockerfile.react-candidate" ]; then
    echo "Building React Candidate Base Image..."
    docker build -t exam-react-candidate:latest -f docker/Dockerfile.react-candidate docker/
  fi

  # 5. Instructions
  echo "================================================================"
  echo "✅ Grader VM Setup Complete!"
  echo "Next steps:"
  echo "1. Create '.env.grader' in /opt/exam-platform with Redis & DB URLs"
  echo "2. Run 'docker compose -f docker-compose.grader.yml --env-file .env.grader up -d'"
  echo "================================================================"
EOF
