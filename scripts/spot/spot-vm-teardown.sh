#!/bin/bash
# Spot VM Teardown Script
# Terminates spot instance and cleans up resources

set -e

REGION="ap-south-1"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }

# Load instance info
if [ -f /tmp/spot-vm-info.txt ]; then
    source /tmp/spot-vm-info.txt
else
    echo "No spot instance info found at /tmp/spot-vm-info.txt"
    echo "Please provide instance ID:"
    read INSTANCE_ID
    REGION="ap-south-1"
fi

if [ -z "${INSTANCE_ID}" ]; then
    echo "No instance ID provided"
    exit 1
fi

log_info "Terminating instance: ${INSTANCE_ID}"
aws ec2 terminate-instances --instance-ids ${INSTANCE_ID} --region ${REGION}

log_info "Waiting for termination..."
aws ec2 wait instance-terminated --instance-ids ${INSTANCE_ID} --region ${REGION}

log_info "Instance terminated successfully!"

# Optional: Cancel spot request
if [ -n "${SPOT_REQUEST_ID}" ]; then
    log_info "Canceling spot request: ${SPOT_REQUEST_ID}"
    aws ec2 cancel-spot-instance-requests \
        --spot-instance-request-ids ${SPOT_REQUEST_ID} \
        --region ${REGION} 2>/dev/null || true
fi

# Clean up info file
rm -f /tmp/spot-vm-info.txt

echo ""
echo -e "${GREEN}Cleanup complete!${NC}"
