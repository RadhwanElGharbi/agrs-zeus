#!/bin/bash
set -e

echo "=========================================="
echo "PIRL 2M Production Training (CPU)"
echo "=========================================="
echo "Total timesteps: 2,000,000"
echo "Device: CPU (multi-threaded)"
echo "Policy: MlpPolicy"
echo "Environments: 24 parallel (serial execution via DummyVecEnv)"
echo "n_steps: 2,048"
echo "Batch size: 256"
echo "Expected runtime: ~3-4 hours @ 12-15 FPS"
echo "=========================================="

CONFIG_FILE="pirl_training_config_2M_production.yaml"
DEVICE="cpu"
POLICY="MlpPolicy"
OUTPUT_DIR="outputs/production_2M_cpu"
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

# Set CPU threading for optimal performance
export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8
export OPENBLAS_NUM_THREADS=8
export NUMEXPR_NUM_THREADS=8

echo "✅ Environment configured"
echo "   Device: $DEVICE"
echo "   Policy: $POLICY"
echo "   CPU threads: 8 (for neural network operations)"
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
echo "Model saved to: ${OUTPUT_DIR}/eval/best_model.zip"
echo "Logs saved to: $LOG_FILE"
echo ""
echo "🗺️  Generating GeoJSON for ArcGIS analysis..."
echo ""

# Generate GeoJSON from best model
GEOJSON_OUTPUT="${OUTPUT_DIR}/route_2M_production_cpu.geojson"

/opt/agrs/python/pirl_venv/bin/python3 \
    /opt/agrs/python/pirl_training/generate_geojson_from_trajectory.py \
    --model "${OUTPUT_DIR}/eval/best_model.zip" \
    --config "$CONFIG_FILE" \
    --output "$GEOJSON_OUTPUT" \
    --algorithm PPO \
    --episodes 1

if [ -f "$GEOJSON_OUTPUT" ]; then
    echo ""
    echo "✅ GeoJSON generated successfully!"
    echo "   📍 Output: $GEOJSON_OUTPUT"
    echo "   🗺️  Ready for ArcGIS import"
    echo "   📊 CRS: EPSG:32633 (UTM Zone 33N)"
else
    echo ""
    echo "⚠️  GeoJSON generation failed. You can generate it manually:"
    echo "python3 /opt/agrs/python/pirl_training/generate_geojson_from_trajectory.py \\"
    echo "  --model ${OUTPUT_DIR}/eval/best_model.zip \\"
    echo "  --config $CONFIG_FILE \\"
    echo "  --output $GEOJSON_OUTPUT \\"
    echo "  --algorithm PPO"
fi
echo ""

