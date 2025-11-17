#!/bin/bash
# PIRL 10K Validation Training - CPU + CNN Policy
# This script trains PIRL with 10,000 timesteps using CPU and CNN policy
# WARNING: CNN policy expects image input and will likely fail with 21D vector state

set -e  # Exit on error

echo "=========================================="
echo "PIRL 10K VALIDATION: CPU + CNN"
echo "=========================================="
echo ""
echo "⚠️  WARNING: CNN policy expects image-like input!"
echo "   Current PIRL state is 21D vector, not image."
echo "   This may fail with shape error."
echo ""
read -p "Continue anyway? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Force CPU-only execution
export CUDA_VISIBLE_DEVICES=""

# Set Python path
export PYTHONPATH="/opt/agrs/python/pirl_training:$PYTHONPATH"

# Navigate to PIRL directory
cd /opt/agrs/Projects/test_project2/PIRL

# Create output directory
mkdir -p outputs/validation_10k

# Run training
echo "Starting training..."
echo "  Device: CPU"
echo "  Policy: CnnPolicy"
echo "  Timesteps: 10,000"
echo "  Environments: 24"
echo ""

python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_10k_validation.yaml \
    --device cpu \
    --policy CnnPolicy \
    2>&1 | tee outputs/validation_10k/training_cpu_cnn.log

echo ""
echo "=========================================="
echo "Training complete!"
echo "=========================================="
echo "Logs: outputs/validation_10k/training_cpu_cnn.log"
echo "Models: models/pirl_10k_validation_*.zip"
echo "TensorBoard: outputs/validation_10k/tensorboard"
echo ""

