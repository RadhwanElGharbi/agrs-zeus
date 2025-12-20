#!/bin/bash
# PIRL 600K Production Training - GPU + MLP Policy
# This will produce a model matching the quality of route_600k_current.geojson

set -e

echo "========================================================================"
echo "PIRL 600K PRODUCTION TRAINING - GPU + MLP"
echo "========================================================================"
echo ""
echo "Configuration:"
echo "  - Timesteps: 600,000"
echo "  - Environments: 24"
echo "  - Device: CUDA (GPU)"
echo "  - Policy: MlpPolicy"
echo "  - Expected runtime: ~2-4 hours"
echo ""
echo "This training will produce a properly trained model that:"
echo "  - Avoids catastrophic slopes"
echo "  - Follows terrain contours"
echo "  - Balances progress vs penalties"
echo "  - Produces quality routes like route_600k_current.geojson"
echo ""
echo "========================================================================"
echo ""

# Activate virtual environment
source /opt/agrs/python/pirl_venv/bin/activate

# Set GPU
export CUDA_VISIBLE_DEVICES="0"

# Create output directory
mkdir -p outputs/production_600k
mkdir -p models

# Log start time
echo "Training started at: $(date)"
echo ""

# Run training
/opt/agrs/python/pirl_venv/bin/python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_600k_production.yaml \
    --device cuda \
    --policy MlpPolicy 2>&1 | tee outputs/production_600k/training_gpu_mlp.log

echo ""
echo "=========================================="
echo "Training complete!"
echo "=========================================="
echo "Logs: outputs/production_600k/training_gpu_mlp.log"
echo "Models: models/pirl_600k_production_*.zip"
echo "TensorBoard: outputs/production_600k/tensorboard"
echo ""
echo "Next steps:"
echo "  1. Analyze training: python3 analyze_training_run.py outputs/production_600k"
echo "  2. Generate GeoJSON: python3 generate_route_from_model_detailed.py \\"
echo "       --model models/pirl_600k_production.zip \\"
echo "       --config pirl_training_config_600k_production.yaml \\"
echo "       --output outputs/production_600k/route_600k_production.geojson \\"
echo "       --algorithm PPO"
echo "=========================================="

