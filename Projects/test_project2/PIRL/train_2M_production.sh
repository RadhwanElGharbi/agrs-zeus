#!/bin/bash
#
# PIRL 2M Production Training Script
# Trains a production-quality PPO MLP model with 2 million timesteps
# Expected runtime: ~1.5 hours @ 15 FPS with 24 environments
#

set -e  # Exit on error

echo "=========================================="
echo "PIRL 2M Production Training"
echo "=========================================="
echo "Configuration: pirl_training_config_2M_production.yaml"
echo "Total timesteps: 2,000,000"
echo "Environments: 24 parallel"
echo "n_steps: 2048 (optimal for 2M)"
echo "Expected rollouts: ~41"
echo "Expected runtime: ~1.5 hours"
echo "=========================================="
echo ""

# Configuration
CONFIG_FILE="pirl_training_config_2M_production.yaml"
DEVICE="cpu"  # Change to "cuda" if using GPU
POLICY="MlpPolicy"
OUTPUT_DIR="outputs/production_2M"
LOG_FILE="${OUTPUT_DIR}/training_$(date +%Y%m%d_%H%M%S).log"

# Check if config exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Error: Config file not found: $CONFIG_FILE"
    exit 1
fi

# Activate virtual environment
echo "🔄 Activating Python virtual environment..."
source /opt/agrs/python/pirl_venv/bin/activate

# Set CPU threading for optimal performance
export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8
export OPENBLAS_NUM_THREADS=8
export NUMEXPR_NUM_THREADS=8

echo "✅ Environment configured"
echo "   Device: $DEVICE"
echo "   Policy: $POLICY"
echo "   CPU threads: 8"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Start training
echo "🚀 Starting 2M production training..."
echo "   Log file: $LOG_FILE"
echo ""

cd /opt/agrs/Projects/test_project2/PIRL

/opt/agrs/python/pirl_venv/bin/python3 \
    /opt/agrs/python/pirl_training/train_pirl.py \
    --config "$CONFIG_FILE" \
    --device "$DEVICE" \
    --policy "$POLICY" \
    2>&1 | tee "$LOG_FILE"

echo ""
echo "=========================================="
echo "✅ Training complete!"
echo "=========================================="
echo "Model saved to: models/pirl_2M_production.zip"
echo "Logs saved to: $LOG_FILE"
echo ""
echo "To generate GeoJSON from the trained model:"
echo "python3 /opt/agrs/python/pirl_training/generate_geojson_from_trajectory.py \\"
echo "  --model models/pirl_2M_production.zip \\"
echo "  --config $CONFIG_FILE \\"
echo "  --output outputs/production_2M/route_2M_production.geojson \\"
echo "  --algorithm PPO"
echo ""

