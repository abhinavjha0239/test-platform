#!/bin/bash
# Spot VM Setup Script for SQL Contest Load Testing
# Creates c6g.metal spot instance in ap-south-1c with Docker pre-installed

set -e

# Configuration
REGION="ap-south-1"
AZ="ap-south-1c"
INSTANCE_TYPE="c6g.metal"
KEY_NAME="sql-contest-key"
SECURITY_GROUP_NAME="sql-contest-sg"
MAX_SPOT_PRICE="0.50"  # Safety cap

# Get public IPv4 (prefer ipify which always returns IPv4)
MY_IP=$(curl -s https://api.ipify.org || curl -s -4 ifconfig.me)
echo "Your Public IP: ${MY_IP}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Step 1: Check/Create Key Pair
log_info "Checking for existing key pair..."
KEY_EXISTS=$(aws ec2 describe-key-pairs --key-names ${KEY_NAME} --region ${REGION} 2>/dev/null || echo "")

if [ -z "${KEY_EXISTS}" ]; then
    log_info "Creating new key pair: ${KEY_NAME}"
    aws ec2 create-key-pair \
        --key-name ${KEY_NAME} \
        --region ${REGION} \
        --query 'KeyMaterial' \
        --output text > ~/.ssh/${KEY_NAME}.pem
    chmod 400 ~/.ssh/${KEY_NAME}.pem
    log_info "Key saved to ~/.ssh/${KEY_NAME}.pem"
else
    log_info "Key pair ${KEY_NAME} already exists"
fi

# Step 2: Check/Create Security Group
log_info "Checking for existing security group..."
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=${SECURITY_GROUP_NAME}" \
    --region ${REGION} \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

if [ "${SG_ID}" == "None" ] || [ -z "${SG_ID}" ]; then
    log_info "Creating security group: ${SECURITY_GROUP_NAME}"
    SG_ID=$(aws ec2 create-security-group \
        --group-name ${SECURITY_GROUP_NAME} \
        --description "SQL Contest Spot VM Security Group" \
        --region ${REGION} \
        --query 'GroupId' \
        --output text)
    
    # Add SSH rule for your IP
    aws ec2 authorize-security-group-ingress \
        --group-id ${SG_ID} \
        --protocol tcp \
        --port 22 \
        --cidr "${MY_IP}/32" \
        --region ${REGION}
    
    # Add PostgreSQL port range for container access
    aws ec2 authorize-security-group-ingress \
        --group-id ${SG_ID} \
        --protocol tcp \
        --port 5432-5600 \
        --cidr "${MY_IP}/32" \
        --region ${REGION}
    
    log_info "Security group created: ${SG_ID}"
else
    log_info "Using existing security group: ${SG_ID}"
fi

# Step 3: Get latest Amazon Linux 2023 ARM AMI
log_info "Finding latest Amazon Linux 2023 ARM AMI..."
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-*-arm64" \
              "Name=state,Values=available" \
              "Name=architecture,Values=arm64" \
    --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
    --region ${REGION} \
    --output text)
log_info "AMI ID: ${AMI_ID}"

# Step 4: User data script to install Docker
USER_DATA=$(cat <<'EOF'
#!/bin/bash
# Install Docker on Amazon Linux 2023
dnf update -y
dnf install -y docker
systemctl start docker
systemctl enable docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Pull PostgreSQL ARM image
docker pull postgres:16

# Configure Docker for more containers
cat > /etc/docker/daemon.json <<'DOCKERCONF'
{
    "storage-driver": "overlay2",
    "default-ulimits": {
        "nofile": {
            "Name": "nofile",
            "Hard": 65536,
            "Soft": 65536
        }
    }
}
DOCKERCONF

systemctl restart docker

# Signal completion
touch /tmp/docker-ready
EOF
)

USER_DATA_BASE64=$(echo "${USER_DATA}" | base64)

# Step 5: Request Spot Instance
log_info "Requesting spot instance (${INSTANCE_TYPE} in ${AZ})..."

SPOT_REQUEST=$(aws ec2 request-spot-instances \
    --spot-price "${MAX_SPOT_PRICE}" \
    --instance-count 1 \
    --type "one-time" \
    --launch-specification "{
        \"ImageId\": \"${AMI_ID}\",
        \"InstanceType\": \"${INSTANCE_TYPE}\",
        \"KeyName\": \"${KEY_NAME}\",
        \"SecurityGroupIds\": [\"${SG_ID}\"],
        \"Placement\": {\"AvailabilityZone\": \"${AZ}\"},
        \"UserData\": \"${USER_DATA_BASE64}\"
    }" \
    --region ${REGION} \
    --query 'SpotInstanceRequests[0].SpotInstanceRequestId' \
    --output text)

log_info "Spot request ID: ${SPOT_REQUEST}"

# Step 6: Wait for spot request fulfillment
log_info "Waiting for spot instance to be fulfilled..."
INSTANCE_ID=""
for i in {1..60}; do
    INSTANCE_ID=$(aws ec2 describe-spot-instance-requests \
        --spot-instance-request-ids ${SPOT_REQUEST} \
        --region ${REGION} \
        --query 'SpotInstanceRequests[0].InstanceId' \
        --output text 2>/dev/null || echo "")
    
    if [ -n "${INSTANCE_ID}" ] && [ "${INSTANCE_ID}" != "None" ]; then
        break
    fi
    echo -n "."
    sleep 5
done
echo ""

if [ -z "${INSTANCE_ID}" ] || [ "${INSTANCE_ID}" == "None" ]; then
    log_error "Spot request not fulfilled within 5 minutes"
    exit 1
fi

log_info "Instance ID: ${INSTANCE_ID}"

# Step 7: Wait for instance to be running
log_info "Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids ${INSTANCE_ID} --region ${REGION}

# Step 8: Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids ${INSTANCE_ID} \
    --region ${REGION} \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

log_info "Instance is running!"
echo ""
echo "============================================="
echo -e "${GREEN}SPOT VM READY${NC}"
echo "============================================="
echo "Instance ID:  ${INSTANCE_ID}"
echo "Public IP:    ${PUBLIC_IP}"
echo "SSH Command:  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
echo ""
echo "Wait ~2 minutes for Docker to be ready, then test:"
echo "  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@${PUBLIC_IP} 'docker ps'"
echo ""
echo "For grader, set environment:"
echo "  export DOCKER_HOST=ssh://ec2-user@${PUBLIC_IP}"
echo "  export SQL_CONTAINER_REMOTE_HOST=${PUBLIC_IP}"
echo "============================================="

# Save instance info to file
cat > /tmp/spot-vm-info.txt <<INFO
INSTANCE_ID=${INSTANCE_ID}
PUBLIC_IP=${PUBLIC_IP}
SSH_KEY=~/.ssh/${KEY_NAME}.pem
SPOT_REQUEST_ID=${SPOT_REQUEST}
REGION=${REGION}
INFO

log_info "Instance info saved to /tmp/spot-vm-info.txt"
