#!/bin/bash
# ============================================
# Exam Platform - Azure VM Setup Script
# ============================================
# Run this on the VM after SSH: ssh azureuser@<VM_IP>
# Usage: curl -sSL <raw-url> | bash  OR  bash setup-vm.sh
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Setting up Exam Platform VM...${NC}"

# ============================================
# 1. System updates
# ============================================
echo -e "${YELLOW}Updating system packages...${NC}"
sudo apt-get update -y
sudo apt-get upgrade -y

# ============================================
# 2. Install Docker Engine
# ============================================
echo -e "${YELLOW}Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    sudo apt-get install -y ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    # Add current user to docker group
    sudo usermod -aG docker $USER
    echo -e "${GREEN}Docker installed${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

# ============================================
# 3. Install Git
# ============================================
echo -e "${YELLOW}Installing Git...${NC}"
sudo apt-get install -y git

# ============================================
# 4. Configure Firewall
# ============================================
echo -e "${YELLOW}Configuring firewall...${NC}"
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
echo -e "${GREEN}Firewall configured (SSH, HTTP, HTTPS)${NC}"

# ============================================
# 5. Clone repository
# ============================================
REPO_DIR="/opt/exam-platform"
if [ ! -d "$REPO_DIR" ]; then
    echo -e "${YELLOW}Cloning repository...${NC}"
    sudo mkdir -p /opt
    sudo git clone https://github.com/abhinavjha0239/test-platform.git "$REPO_DIR"
    sudo chown -R $USER:$USER "$REPO_DIR"
else
    echo -e "${GREEN}Repository already cloned at $REPO_DIR${NC}"
    cd "$REPO_DIR" && git pull origin main || true
fi

# ============================================
# 6. Done
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}VM Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Next steps:"
echo "  1. cd $REPO_DIR"
echo "  2. cp env.azure.template .env.production"
echo "  3. Edit .env.production with your Azure credentials"
echo "  4. Run: ./scripts/azure-deploy/deploy.sh --build --migrate"
echo ""
echo -e "${YELLOW}NOTE: Log out and back in for docker group to take effect${NC}"
