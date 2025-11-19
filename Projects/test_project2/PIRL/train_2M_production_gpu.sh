#!/bin/bash
set -e

echo "=========================================="
echo "PIRL 2M Production Training (GPU)"
echo "=========================================="
echo "Total timesteps: 2,000,000"
echo "Device: CUDA (GPU)"
echo "Policy: MlpPolicy"
echo "Environments: 24 parallel"
echo "n_steps: 2048"
echo "Expected runtime: ~45 minutes @ 60 FPS"
echo "=========================================="

CONFIG_FILE="pirl_training_config_2M_production.yaml"
DEVICE="cuda"
POLICY="MlpPolicy"
OUTPUT_DIR="outputs/production_2M_gpu"
LOG_FILE="${OUTPUT_DIR}/training_$(date +%Y%m%d_%H%M%S).log"

# Check if config exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Error: Config file not found: $CONFIG_FILE"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Activate virtual environment
echo "🔄 Activating Python virtual environment..."
source /opt/agrs/python/pirl_venv/bin/activate

echo "✅ Environment configured"
echo "   Device: $DEVICE"
echo "   Policy: $POLICY"
echo ""

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

