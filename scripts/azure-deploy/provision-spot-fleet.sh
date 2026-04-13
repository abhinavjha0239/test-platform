#!/bin/bash
set -e

# ==============================================================================
# Provision Spot VM Fleet for Grader
# Usage: ./provision-spot-fleet.sh [count] [size]
# Default: 6 VMs, Standard_D16as_v5 (16 vCPU, 64GB each)
# ==============================================================================

COUNT=${1:-6}
VM_SIZE=${2:-Standard_D16as_v5}
RG="EXAM-PLATFORM-RG"
LOCATION="centralindia"
NSG_NAME="grader-spot-nsg"
SSH_USER="azureuser"

echo "============================================================"
echo "  SPOT VM FLEET PROVISIONING"
echo "============================================================"
echo "  Count:    ${COUNT}"
echo "  Size:     ${VM_SIZE}"
echo "  Region:   ${LOCATION}"
echo "  RG:       ${RG}"
echo "============================================================"
echo ""

# Create NSG for spot fleet (SSH only)
echo "[1/3] Creating Network Security Group..."
az network nsg create --resource-group $RG --name $NSG_NAME --location $LOCATION -o none 2>/dev/null || echo "  NSG already exists"
az network nsg rule create \
  --resource-group $RG \
  --nsg-name $NSG_NAME \
  --name Allow-SSH \
  --priority 100 \
  --destination-port-ranges 22 \
  --access Allow \
  --protocol Tcp -o none 2>/dev/null || echo "  SSH rule already exists"
echo "  Done."
echo ""

# Provision VMs in parallel
echo "[2/3] Provisioning ${COUNT} spot VMs in parallel..."
PIDS=()
for i in $(seq 1 $COUNT); do
  VM_NAME="grader-spot-${i}"
  echo "  Starting: ${VM_NAME} (${VM_SIZE})..."
  az vm create \
    --resource-group $RG \
    --name $VM_NAME \
    --image Ubuntu2204 \
    --size $VM_SIZE \
    --admin-username $SSH_USER \
    --generate-ssh-keys \
    --nsg $NSG_NAME \
    --os-disk-size-gb 64 \
    --priority Spot \
    --eviction-policy Deallocate \
    --max-price -1 \
    --no-wait \
    -o none &
  PIDS+=($!)
done

# Wait for all VM creation commands to finish
echo ""
echo "  Waiting for all VMs to provision..."
FAILED=0
for pid in "${PIDS[@]}"; do
  if ! wait $pid; then
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -gt 0 ]; then
  echo "  WARNING: ${FAILED} VM(s) failed to provision"
fi

# Wait for VMs to be ready (--no-wait means we need to poll)
echo "  Waiting for VMs to reach Running state..."
for i in $(seq 1 $COUNT); do
  VM_NAME="grader-spot-${i}"
  echo -n "  Waiting for ${VM_NAME}..."
  for attempt in $(seq 1 60); do
    STATE=$(az vm show -g $RG -n $VM_NAME --query "provisioningState" -o tsv 2>/dev/null || echo "Creating")
    if [ "$STATE" == "Succeeded" ]; then
      echo " Ready!"
      break
    fi
    sleep 10
    echo -n "."
  done
done
echo ""

# Collect IPs
echo "[3/3] Collecting public IPs..."
echo ""
IP_FILE="/tmp/grader-spot-ips.txt"
> $IP_FILE

for i in $(seq 1 $COUNT); do
  VM_NAME="grader-spot-${i}"
  IP=$(az vm show -d -g $RG -n $VM_NAME --query publicIps -o tsv 2>/dev/null || echo "PENDING")
  echo "  ${VM_NAME}: ${IP}"
  echo "${IP}" >> $IP_FILE
done

echo ""
echo "============================================================"
echo "  FLEET PROVISIONED"
echo "============================================================"
echo "  IPs saved to: ${IP_FILE}"
echo ""
echo "  Next: Deploy grader to all VMs:"
echo "    ./deploy-spot-fleet.sh"
echo "============================================================"
