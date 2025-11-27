#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/configs/us_pipeline_training_config.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${SCRIPT_DIR}/outputs/production_10M_cpu_${TIMESTAMP}"
PYTHON_BIN="/opt/agrs/python/pirl_venv/bin/python3"

TIMESTEPS=10000000
NUM_ENVS=24
BATCH_SIZE=2048
N_STEPS=2048
LEARNING_RATE=0.0003
EVAL_FREQ=50000
SAVE_FREQ=500000
DEVICE="cpu"

mkdir -p "$OUTPUT_DIR"

echo "🚀 10M CPU Training (quiet mode)"
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
echo "🏆 Top routes: $OUTPUT_DIR/top_routes/"

$PYTHON_BIN generate_geojson_us.py \
    --model "$OUTPUT_DIR/eval/best_model.zip" \
    --config "$CONFIG_FILE" \
    --output "$OUTPUT_DIR/route_10M.geojson" 2>/dev/null && \
    echo "✅ Route: $OUTPUT_DIR/route_10M.geojson" || \
    echo "⚠️  GeoJSON generation failed"
