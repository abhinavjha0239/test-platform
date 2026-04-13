#!/bin/bash
# Full AWS Stack Deployment
# Budget: ~$40 for 4 days
# Region: ap-south-1 (Mumbai)

set -e

REGION="ap-south-1"
VPC_CIDR="10.0.0.0/16"
STACK_NAME="exam-platform"
KEY_NAME="exam-platform-key"

echo "═══════════════════════════════════════════════════════════════"
echo "  EXAM PLATFORM - FULL AWS DEPLOYMENT"
echo "  Budget: ~$40 for 4 days"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not installed"
    exit 1
fi

echo "Region: $REGION"
echo ""

# Step 1: Create Key Pair (if not exists)
echo "Step 1: Creating Key Pair..."
if ! aws ec2 describe-key-pairs --key-names $KEY_NAME --region $REGION &>/dev/null; then
    aws ec2 create-key-pair --key-name $KEY_NAME --region $REGION --query 'KeyMaterial' --output text > ~/.ssh/${KEY_NAME}.pem
    chmod 400 ~/.ssh/${KEY_NAME}.pem
    echo "  ✅ Key pair created: ~/.ssh/${KEY_NAME}.pem"
else
    echo "  ✅ Key pair already exists"
fi

# Step 2: Create VPC and Networking
echo ""
echo "Step 2: Creating VPC and Networking..."

# Check if VPC exists
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${STACK_NAME}-vpc" --region $REGION --query 'Vpcs[0].VpcId' --output text 2>/dev/null)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    # Create VPC
    VPC_ID=$(aws ec2 create-vpc --cidr-block $VPC_CIDR --region $REGION --query 'Vpc.VpcId' --output text)
    aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=${STACK_NAME}-vpc --region $REGION
    aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames '{"Value":true}' --region $REGION
    
    # Create Internet Gateway
    IGW_ID=$(aws ec2 create-internet-gateway --region $REGION --query 'InternetGateway.InternetGatewayId' --output text)
    aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $REGION
    aws ec2 create-tags --resources $IGW_ID --tags Key=Name,Value=${STACK_NAME}-igw --region $REGION
    
    # Create Subnets (2 AZs for RDS)
    SUBNET1_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${REGION}a --region $REGION --query 'Subnet.SubnetId' --output text)
    SUBNET2_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${REGION}b --region $REGION --query 'Subnet.SubnetId' --output text)
    aws ec2 create-tags --resources $SUBNET1_ID --tags Key=Name,Value=${STACK_NAME}-subnet-1 --region $REGION
    aws ec2 create-tags --resources $SUBNET2_ID --tags Key=Name,Value=${STACK_NAME}-subnet-2 --region $REGION
    
    # Enable auto-assign public IP
    aws ec2 modify-subnet-attribute --subnet-id $SUBNET1_ID --map-public-ip-on-launch --region $REGION
    aws ec2 modify-subnet-attribute --subnet-id $SUBNET2_ID --map-public-ip-on-launch --region $REGION
    
    # Create Route Table
    RTB_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID --region $REGION --query 'RouteTable.RouteTableId' --output text)
    aws ec2 create-route --route-table-id $RTB_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $REGION
    aws ec2 associate-route-table --route-table-id $RTB_ID --subnet-id $SUBNET1_ID --region $REGION
    aws ec2 associate-route-table --route-table-id $RTB_ID --subnet-id $SUBNET2_ID --region $REGION
    
    echo "  ✅ VPC created: $VPC_ID"
else
    echo "  ✅ VPC already exists: $VPC_ID"
    SUBNET1_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=${STACK_NAME}-subnet-1" --region $REGION --query 'Subnets[0].SubnetId' --output text)
    SUBNET2_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=${STACK_NAME}-subnet-2" --region $REGION --query 'Subnets[0].SubnetId' --output text)
fi

# Step 3: Create Security Groups
echo ""
echo "Step 3: Creating Security Groups..."

# Web/API Security Group
WEB_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-web-sg" "Name=vpc-id,Values=$VPC_ID" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
if [ "$WEB_SG_ID" == "None" ] || [ -z "$WEB_SG_ID" ]; then
    WEB_SG_ID=$(aws ec2 create-security-group --group-name ${STACK_NAME}-web-sg --description "Web/API Security Group" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id $WEB_SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $WEB_SG_ID --protocol tcp --port 80 --cidr 0.0.0.0/0 --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $WEB_SG_ID --protocol tcp --port 443 --cidr 0.0.0.0/0 --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $WEB_SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $WEB_SG_ID --protocol tcp --port 3001 --cidr 0.0.0.0/0 --region $REGION
    echo "  ✅ Web SG created: $WEB_SG_ID"
else
    echo "  ✅ Web SG exists: $WEB_SG_ID"
fi

# Grader Security Group
GRADER_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-grader-sg" "Name=vpc-id,Values=$VPC_ID" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
if [ "$GRADER_SG_ID" == "None" ] || [ -z "$GRADER_SG_ID" ]; then
    GRADER_SG_ID=$(aws ec2 create-security-group --group-name ${STACK_NAME}-grader-sg --description "Grader Security Group" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id $GRADER_SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0 --region $REGION
    echo "  ✅ Grader SG created: $GRADER_SG_ID"
else
    echo "  ✅ Grader SG exists: $GRADER_SG_ID"
fi

# Database Security Group
DB_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-db-sg" "Name=vpc-id,Values=$VPC_ID" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
if [ "$DB_SG_ID" == "None" ] || [ -z "$DB_SG_ID" ]; then
    DB_SG_ID=$(aws ec2 create-security-group --group-name ${STACK_NAME}-db-sg --description "Database Security Group" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id $DB_SG_ID --protocol tcp --port 5432 --source-group $WEB_SG_ID --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $DB_SG_ID --protocol tcp --port 5432 --source-group $GRADER_SG_ID --region $REGION
    echo "  ✅ DB SG created: $DB_SG_ID"
else
    echo "  ✅ DB SG exists: $DB_SG_ID"
fi

# Redis Security Group
REDIS_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${STACK_NAME}-redis-sg" "Name=vpc-id,Values=$VPC_ID" --region $REGION --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
if [ "$REDIS_SG_ID" == "None" ] || [ -z "$REDIS_SG_ID" ]; then
    REDIS_SG_ID=$(aws ec2 create-security-group --group-name ${STACK_NAME}-redis-sg --description "Redis Security Group" --vpc-id $VPC_ID --region $REGION --query 'GroupId' --output text)
    aws ec2 authorize-security-group-ingress --group-id $REDIS_SG_ID --protocol tcp --port 6379 --source-group $WEB_SG_ID --region $REGION
    aws ec2 authorize-security-group-ingress --group-id $REDIS_SG_ID --protocol tcp --port 6379 --source-group $GRADER_SG_ID --region $REGION
    echo "  ✅ Redis SG created: $REDIS_SG_ID"
else
    echo "  ✅ Redis SG exists: $REDIS_SG_ID"
fi

# Step 4: Create RDS PostgreSQL
echo ""
echo "Step 4: Creating RDS PostgreSQL (db.t3.micro - ~$0.5/day)..."

# Create DB Subnet Group
aws rds describe-db-subnet-groups --db-subnet-group-name ${STACK_NAME}-db-subnet --region $REGION &>/dev/null || \
    aws rds create-db-subnet-group \
        --db-subnet-group-name ${STACK_NAME}-db-subnet \
        --db-subnet-group-description "Exam Platform DB Subnet" \
        --subnet-ids $SUBNET1_ID $SUBNET2_ID \
        --region $REGION

# Create RDS Instance
DB_INSTANCE=$(aws rds describe-db-instances --db-instance-identifier ${STACK_NAME}-db --region $REGION --query 'DBInstances[0].DBInstanceIdentifier' --output text 2>/dev/null)
if [ "$DB_INSTANCE" == "None" ] || [ -z "$DB_INSTANCE" ]; then
    aws rds create-db-instance \
        --db-instance-identifier ${STACK_NAME}-db \
        --db-instance-class db.t3.micro \
        --engine postgres \
        --engine-version 16.3 \
        --master-username postgres \
        --master-user-password ExamPlatform2024! \
        --allocated-storage 20 \
        --db-name exam_platform \
        --vpc-security-group-ids $DB_SG_ID \
        --db-subnet-group-name ${STACK_NAME}-db-subnet \
        --no-publicly-accessible \
        --backup-retention-period 1 \
        --region $REGION
    echo "  ✅ RDS creating... (takes 5-10 minutes)"
else
    echo "  ✅ RDS already exists"
fi

# Step 5: Create ElastiCache Redis
echo ""
echo "Step 5: Creating ElastiCache Redis (cache.t3.micro - ~$0.5/day)..."

# Create Cache Subnet Group
aws elasticache describe-cache-subnet-groups --cache-subnet-group-name ${STACK_NAME}-redis-subnet --region $REGION &>/dev/null || \
    aws elasticache create-cache-subnet-group \
        --cache-subnet-group-name ${STACK_NAME}-redis-subnet \
        --cache-subnet-group-description "Exam Platform Redis Subnet" \
        --subnet-ids $SUBNET1_ID $SUBNET2_ID \
        --region $REGION

# Create Redis Cluster
REDIS_CLUSTER=$(aws elasticache describe-cache-clusters --cache-cluster-id ${STACK_NAME}-redis --region $REGION --query 'CacheClusters[0].CacheClusterId' --output text 2>/dev/null)
if [ "$REDIS_CLUSTER" == "None" ] || [ -z "$REDIS_CLUSTER" ]; then
    aws elasticache create-cache-cluster \
        --cache-cluster-id ${STACK_NAME}-redis \
        --cache-node-type cache.t3.micro \
        --engine redis \
        --num-cache-nodes 1 \
        --cache-subnet-group-name ${STACK_NAME}-redis-subnet \
        --security-group-ids $REDIS_SG_ID \
        --region $REGION
    echo "  ✅ ElastiCache creating... (takes 5-10 minutes)"
else
    echo "  ✅ ElastiCache already exists"
fi

# Step 6: Launch Web/API EC2
echo ""
echo "Step 6: Launching Web/API EC2 (t3.small - ~$2/day)..."

# Get latest Amazon Linux 2023 AMI
AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters "Name=name,Values=al2023-ami-2023*-x86_64" "Name=state,Values=available" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --output text \
    --region $REGION)

WEB_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=${STACK_NAME}-web" "Name=instance-state-name,Values=running,pending" \
    --region $REGION \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)

if [ "$WEB_INSTANCE_ID" == "None" ] || [ -z "$WEB_INSTANCE_ID" ]; then
    WEB_INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --instance-type t3.small \
        --key-name $KEY_NAME \
        --security-group-ids $WEB_SG_ID \
        --subnet-id $SUBNET1_ID \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${STACK_NAME}-web}]" \
        --user-data '#!/bin/bash
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Install pnpm
npm install -g pnpm
' \
        --region $REGION \
        --query 'Instances[0].InstanceId' --output text)
    echo "  ✅ Web EC2 launched: $WEB_INSTANCE_ID"
else
    echo "  ✅ Web EC2 exists: $WEB_INSTANCE_ID"
fi

# Step 7: Launch Grader EC2
echo ""
echo "Step 7: Launching Grader EC2 (c6i.xlarge - ~$4/day)..."

GRADER_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=${STACK_NAME}-grader" "Name=instance-state-name,Values=running,pending" \
    --region $REGION \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null)

if [ "$GRADER_INSTANCE_ID" == "None" ] || [ -z "$GRADER_INSTANCE_ID" ]; then
    GRADER_INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --instance-type c6i.xlarge \
        --key-name $KEY_NAME \
        --security-group-ids $GRADER_SG_ID \
        --subnet-id $SUBNET1_ID \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${STACK_NAME}-grader}]" \
        --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
        --user-data '#!/bin/bash
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -aG docker ec2-user

# Pre-pull postgres image
docker pull postgres:16-alpine
' \
        --region $REGION \
        --query 'Instances[0].InstanceId' --output text)
    echo "  ✅ Grader EC2 launched: $GRADER_INSTANCE_ID"
else
    echo "  ✅ Grader EC2 exists: $GRADER_INSTANCE_ID"
fi

# Wait for instances
echo ""
echo "Step 8: Waiting for instances to be ready..."
aws ec2 wait instance-running --instance-ids $WEB_INSTANCE_ID $GRADER_INSTANCE_ID --region $REGION
echo "  ✅ Instances running"

# Get IPs
WEB_IP=$(aws ec2 describe-instances --instance-ids $WEB_INSTANCE_ID --region $REGION --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
GRADER_IP=$(aws ec2 describe-instances --instance-ids $GRADER_INSTANCE_ID --region $REGION --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT SUMMARY"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Resources Created:"
echo "  VPC:           $VPC_ID"
echo "  Web EC2:       $WEB_INSTANCE_ID ($WEB_IP)"
echo "  Grader EC2:    $GRADER_INSTANCE_ID ($GRADER_IP)"
echo "  RDS:           ${STACK_NAME}-db (creating...)"
echo "  ElastiCache:   ${STACK_NAME}-redis (creating...)"
echo ""
echo "Estimated Daily Cost:"
echo "  Web EC2 (t3.small):        ~\$0.021/hr = \$0.50/day"
echo "  Grader EC2 (c6i.xlarge):   ~\$0.17/hr  = \$4.08/day"
echo "  RDS (db.t3.micro):         ~\$0.018/hr = \$0.43/day"
echo "  ElastiCache (cache.t3.micro): ~\$0.017/hr = \$0.41/day"
echo "  ─────────────────────────────────────────────"
echo "  Total:                     ~\$5.42/day = \$21.68 for 4 days"
echo ""
echo "SSH Access:"
echo "  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$WEB_IP"
echo "  ssh -i ~/.ssh/${KEY_NAME}.pem ec2-user@$GRADER_IP"
echo ""
echo "Next Steps:"
echo "  1. Wait for RDS and ElastiCache to be ready (~10 mins)"
echo "  2. Run: ./setup-app.sh to deploy the application"
echo ""

# Save config
cat > aws-config.env << EOF
REGION=$REGION
VPC_ID=$VPC_ID
WEB_INSTANCE_ID=$WEB_INSTANCE_ID
WEB_IP=$WEB_IP
GRADER_INSTANCE_ID=$GRADER_INSTANCE_ID
GRADER_IP=$GRADER_IP
KEY_NAME=$KEY_NAME
DB_NAME=${STACK_NAME}-db
REDIS_NAME=${STACK_NAME}-redis
EOF

echo "Config saved to aws-config.env"
