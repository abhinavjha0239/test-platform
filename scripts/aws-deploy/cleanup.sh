#!/bin/bash
# Cleanup AWS Resources
# Run this when done to avoid charges

set -e

source aws-config.env 2>/dev/null || {
    echo "aws-config.env not found. Please set variables manually."
    exit 1
}

echo "═══════════════════════════════════════════════════════════════"
echo "  CLEANUP AWS RESOURCES"
echo "  This will DELETE all resources and STOP all charges"
echo "═══════════════════════════════════════════════════════════════"
echo ""
read -p "Are you sure? (type 'yes' to confirm): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Terminating EC2 instances..."
aws ec2 terminate-instances --instance-ids $WEB_INSTANCE_ID $GRADER_INSTANCE_ID --region $REGION 2>/dev/null || true

echo "Deleting RDS instance..."
aws rds delete-db-instance --db-instance-identifier exam-platform-db --skip-final-snapshot --region $REGION 2>/dev/null || true

echo "Deleting ElastiCache cluster..."
aws elasticache delete-cache-cluster --cache-cluster-id exam-platform-redis --region $REGION 2>/dev/null || true

echo "Waiting for resources to terminate..."
sleep 30

echo "Deleting subnet groups..."
aws rds delete-db-subnet-group --db-subnet-group-name exam-platform-db-subnet --region $REGION 2>/dev/null || true
aws elasticache delete-cache-subnet-group --cache-subnet-group-name exam-platform-redis-subnet --region $REGION 2>/dev/null || true

echo "Deleting security groups..."
aws ec2 delete-security-group --group-id $WEB_SG_ID --region $REGION 2>/dev/null || true
aws ec2 delete-security-group --group-id $GRADER_SG_ID --region $REGION 2>/dev/null || true
aws ec2 delete-security-group --group-id $DB_SG_ID --region $REGION 2>/dev/null || true
aws ec2 delete-security-group --group-id $REDIS_SG_ID --region $REGION 2>/dev/null || true

echo ""
echo "✅ Cleanup initiated. Resources will be deleted within 10-15 minutes."
echo "   Check AWS Console to verify all resources are terminated."
echo ""
echo "⚠️  VPC and subnets NOT deleted (in case you want to redeploy)."
echo "    To delete VPC manually: aws ec2 delete-vpc --vpc-id $VPC_ID"
