#!/bin/bash
# PIRL 10K Validation Training - CPU + MLP Policy
# This script trains PIRL with 10,000 timesteps using CPU and MLP policy

set -e  # Exit on error

echo "=========================================="
echo "PIRL 10K VALIDATION: CPU + MLP"
echo "=========================================="
echo ""

# Force CPU-only execution
export CUDA_VISIBLE_DEVICES=""

# Activate Python virtual environment
source /opt/agrs/python/pirl_venv/bin/activate

# Set Python path
export PYTHONPATH="/opt/agrs/python/pirl_training:$PYTHONPATH"

# Navigate to PIRL directory
cd /opt/agrs/Projects/test_project2/PIRL

# Create output directory
mkdir -p outputs/validation_10k

# Run training
echo "Starting training..."
echo "  Device: CPU"
echo "  Policy: MlpPolicy"
echo "  Timesteps: 10,000"
echo "  Environments: 24"
echo ""

/opt/agrs/python/pirl_venv/bin/python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_10k_validation.yaml \
    --device cpu \
    --policy MlpPolicy \
    2>&1 | tee outputs/validation_10k/training_cpu_mlp.log

echo ""
echo "=========================================="
echo "Training complete!"
echo "=========================================="
echo "Logs: outputs/validation_10k/training_cpu_mlp.log"
echo "Models: models/pirl_10k_validation_*.zip"
echo "TensorBoard: outputs/validation_10k/tensorboard"
echo ""

