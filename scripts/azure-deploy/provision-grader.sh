#!/bin/bash
set -e

# ==============================================================================
# Provision Grader VM (Azure)
# Usage: ./provision-grader.sh <env> <name> [--spot]
# Example: ./provision-grader.sh prod grader-1 --spot
# ==============================================================================

ENV=$1
VM_NAME=$2
IS_SPOT=$3

if [ -z "$ENV" ] || [ -z "$VM_NAME" ]; then
  echo "Usage: ./provision-grader.sh <env> <name> [--spot]"
  exit 1
fi

RG="exam-platform-${ENV}-rg"
LOCATION="eastus" # Update as needed
VM_SIZE="Standard_B4ms" # 4 vCPU, 16GB RAM for pooling

echo "Provisioning Grader VM: $VM_NAME in resource group $RG..."

# Create Resource Group if it doesn't exist
az group create --name $RG --location $LOCATION -o none

# Setup Network Security Group (SSH only, grading is polled via Redis)
NSG_NAME="grader-nsg"
az network nsg create --resource-group $RG --name $NSG_NAME -o none
az network nsg rule create \
  --resource-group $RG \
  --nsg-name $NSG_NAME \
  --name Allow-SSH \
  --priority 100 \
  --destination-port-ranges 22 \
  --access Allow \
  --protocol Tcp -o none

# Construct VM Create command
CREATE_CMD="az vm create \
  --resource-group $RG \
  --name $VM_NAME \
  --image Ubuntu2204 \
  --size $VM_SIZE \
  --admin-username azureuser \
  --generate-ssh-keys \
  --nsg $NSG_NAME \
  --os-disk-size-gb 64"

if [ "$IS_SPOT" == "--spot" ]; then
  echo "Deploying as Azure SPOT instance (Max price: capacity only)..."
  CREATE_CMD="$CREATE_CMD --priority Spot --eviction-policy Deallocate --max-price -1"
fi

# Execute Create
echo "Running Azure VM creation..."
eval $CREATE_CMD

# Fetch IP
IP=$(az vm show -d -g $RG -n $VM_NAME --query publicIps -o tsv)
echo "✅ Grader VM provisioned successfully!"
echo "📡 Public IP: $IP"
echo "Next step: Run ./setup-grader-vm.sh azureuser@$IP"
