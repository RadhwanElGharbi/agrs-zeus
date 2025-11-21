#!/bin/bash
################################################################################
# US_PIPELINE PIRL - Validation Training (10K timesteps)
#
# Quick validation run to verify:
# - Environment works correctly
# - Agent shows basic learning
# - No crashes or errors
#
# Expected runtime (24 parallel environments): ~30-60 seconds (CPU), ~15-30 seconds (GPU)
################################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}US_PIPELINE PIRL - Validation Training${NC}"
echo -e "${BLUE}========================================${NC}"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/configs/us_pipeline_training_config.yaml"
OUTPUT_DIR="${SCRIPT_DIR}/outputs/validation_10k_$(date +%Y%m%d_%H%M%S)"
PYTHON_BIN="/opt/agrs/python/pirl_venv/bin/python3"

# Training parameters
TIMESTEPS=10000
NUM_ENVS=24
BATCH_SIZE=1024
EVAL_FREQ=2000
SAVE_FREQ=5000

echo -e "${GREEN}Configuration:${NC}"
echo "  Config file:    $CONFIG_FILE"
echo "  Output dir:     $OUTPUT_DIR"
echo "  Timesteps:      $TIMESTEPS"
echo "  Environments:   $NUM_ENVS"
echo "  Batch size:     $BATCH_SIZE"
echo "  Python:         $PYTHON_BIN"
echo ""

# Verify configuration exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}❌ Configuration file not found: $CONFIG_FILE${NC}"
    exit 1
fi

# Verify Python module exists
if [ ! -f "${SCRIPT_DIR}/python/pirl_native_us.cpython-312-x86_64-linux-gnu.so" ]; then
    echo -e "${RED}❌ Python module not found. Please build first:${NC}"
    echo "   cd ${SCRIPT_DIR}/build && make"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo -e "${GREEN}Starting validation training...${NC}"
echo ""

# Run training
cd "${SCRIPT_DIR}/python" && $PYTHON_BIN train_pirl_us.py \
    --config "$CONFIG_FILE" \
    --timesteps $TIMESTEPS \
    --num-envs $NUM_ENVS \
    --batch-size $BATCH_SIZE \
    --output-dir "$OUTPUT_DIR" \
    --eval-freq $EVAL_FREQ \
    --save-freq $SAVE_FREQ \
    --device auto

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Validation training complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Output files:${NC}"
    echo "  📁 Output directory: $OUTPUT_DIR"
    echo "  📦 Best model:       $OUTPUT_DIR/eval/best_model.zip"
    echo "  📦 Final model:      $OUTPUT_DIR/pirl_us_final.zip"
    echo "  📊 Logs:             $OUTPUT_DIR/logs/"
    echo ""
    
    # Automatically generate validation GeoJSON
    echo -e "${BLUE}🗺️  Generating validation GeoJSON...${NC}"
    GEOJSON_OUTPUT="$OUTPUT_DIR/route_10k_validation.geojson"
    cd "${SCRIPT_DIR}/python"
    $PYTHON_BIN generate_geojson_us.py \
        --model "$OUTPUT_DIR/eval/best_model.zip" \
        --config "$CONFIG_FILE" \
        --output "$GEOJSON_OUTPUT" 2>&1
    
    GEOJSON_EXIT=$?
    
    if [ $GEOJSON_EXIT -eq 0 ] && [ -f "$GEOJSON_OUTPUT" ]; then
        echo -e "${GREEN}✅ Validation GeoJSON generated${NC}"
        echo "  Location: $GEOJSON_OUTPUT"
        echo ""
        echo -e "${YELLOW}⚠️  Note: 10K timesteps is insufficient for production use${NC}"
        echo "     This is for validation/testing only."
        echo ""
    fi
    
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. View TensorBoard:"
    echo "     tensorboard --logdir=$OUTPUT_DIR/logs/tensorboard"
    echo "  2. Check validation GeoJSON:"
    echo "     $GEOJSON_OUTPUT"
    echo "  3. Run production training (500K timesteps):"
    echo "     ./train_production_500k.sh"
    echo ""
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Training failed with exit code $EXIT_CODE${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Check logs at: $OUTPUT_DIR/logs/"
    exit $EXIT_CODE
fi

