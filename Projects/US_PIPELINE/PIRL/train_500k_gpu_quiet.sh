#!/bin/bash
################################################################################
# US_PIPELINE PIRL - Production Training 500K (GPU) - QUIET MODE
#
# Same as train_production_500k_gpu.sh but with:
#   - No confirmation prompt (auto-starts)
#   - Minimal output (progress bar only)
#   - Clean for automation/scripting
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/configs/us_pipeline_training_config.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${SCRIPT_DIR}/outputs/production_500k_gpu_${TIMESTAMP}"
PYTHON_BIN="/opt/agrs/python/pirl_venv/bin/python3"

# Training parameters
TIMESTEPS=500000
NUM_ENVS=24
BATCH_SIZE=2048
N_STEPS=2048
LEARNING_RATE=0.0003
EVAL_FREQ=10000
SAVE_FREQ=50000
DEVICE="cuda"

mkdir -p "$OUTPUT_DIR"

echo "🚀 500K GPU Training (quiet mode)"
echo "   Output: $OUTPUT_DIR"
echo ""

cd "${SCRIPT_DIR}/python" && $PYTHON_BIN train_pirl_us.py \
    --config "$CONFIG_FILE" \
    --timesteps $TIMESTEPS \
    --num-envs $NUM_ENVS \
    --batch-size $BATCH_SIZE \
    --n-steps $N_STEPS \
    --learning-rate $LEARNING_RATE \
    --output-dir "$OUTPUT_DIR" \
    --eval-freq $EVAL_FREQ \
    --save-freq $SAVE_FREQ \
    --device $DEVICE \
    --quiet

echo ""
echo "✅ Done! Model: $OUTPUT_DIR/pirl_us_final.zip"

# Generate GeoJSON
echo "🗺️  Generating route GeoJSON..."
$PYTHON_BIN generate_geojson_us.py \
    --model "$OUTPUT_DIR/eval/best_model.zip" \
    --config "$CONFIG_FILE" \
    --output "$OUTPUT_DIR/route_500k.geojson" 2>/dev/null && \
    echo "✅ Route: $OUTPUT_DIR/route_500k.geojson" || \
    echo "⚠️  GeoJSON generation failed"
