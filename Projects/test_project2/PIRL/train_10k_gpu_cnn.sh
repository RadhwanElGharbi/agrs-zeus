#!/bin/bash
# PIRL 10K Validation Training - GPU + CNN Policy
# This script trains PIRL with 10,000 timesteps using GPU and CNN policy
# WARNING: CNN policy expects image input and will likely fail with 21D vector state

set -e  # Exit on error

echo "=========================================="
echo "PIRL 10K VALIDATION: GPU + CNN"
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

# Enable GPU execution (first GPU)
export CUDA_VISIBLE_DEVICES="0"

# Set Python path
export PYTHONPATH="/opt/agrs/python/pirl_training:$PYTHONPATH"

# Navigate to PIRL directory
cd /opt/agrs/Projects/test_project2/PIRL

# Create output directory
mkdir -p outputs/validation_10k

# Check CUDA availability
echo "Checking GPU availability..."
python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"
echo ""

# Run training
echo "Starting training..."
echo "  Device: CUDA (GPU)"
echo "  Policy: CnnPolicy"
echo "  Timesteps: 10,000"
echo "  Environments: 24"
echo ""

python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_10k_validation.yaml \
    --device cuda \
    --policy CnnPolicy \
    2>&1 | tee outputs/validation_10k/training_gpu_cnn.log

echo ""
echo "=========================================="
echo "Training complete!"
echo "=========================================="
echo "Logs: outputs/validation_10k/training_gpu_cnn.log"
echo "Models: models/pirl_10k_validation_*.zip"
echo "TensorBoard: outputs/validation_10k/tensorboard"
echo ""

