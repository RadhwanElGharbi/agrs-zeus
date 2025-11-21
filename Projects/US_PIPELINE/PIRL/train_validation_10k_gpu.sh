#!/bin/bash
################################################################################
# US_PIPELINE PIRL - Validation Training (10K timesteps) - GPU VERSION
#
# Quick validation run to verify:
# - Environment works correctly
# - Agent shows basic learning
# - No crashes or errors
#
# Expected runtime (GPU, 24 envs): ~15-30 seconds
################################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}US_PIPELINE PIRL - Validation Training (GPU)${NC}"
echo -e "${BLUE}================================================${NC}"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/configs/us_pipeline_training_config.yaml"
OUTPUT_DIR="${SCRIPT_DIR}/outputs/validation_10k_gpu_$(date +%Y%m%d_%H%M%S)"
PYTHON_BIN="/opt/agrs/python/pirl_venv/bin/python3"

# Training parameters (optimized for GPU)
TIMESTEPS=10000
NUM_ENVS=24
BATCH_SIZE=1024
EVAL_FREQ=2000
SAVE_FREQ=5000
DEVICE="cuda"

# Verify GPU available
if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${RED}❌ nvidia-smi not found. GPU not available.${NC}"
    echo "   Use train_validation_10k_cpu.sh instead."
    exit 1
fi

echo -e "${GREEN}🎮 GPU Configuration:${NC}"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | head -1
echo ""

echo -e "${GREEN}Training Configuration:${NC}"
echo "  Config file:    $CONFIG_FILE"
echo "  Output dir:     $OUTPUT_DIR"
echo "  Timesteps:      $TIMESTEPS"
echo "  Environments:   $NUM_ENVS"
echo "  Batch size:     $BATCH_SIZE"
echo "  Device:         $DEVICE"
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

echo -e "${GREEN}Starting GPU validation training...${NC}"
echo -e "${YELLOW}⏱️  Expected runtime: ~15-30 seconds${NC}"
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
    --device $DEVICE

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ GPU Validation training complete!${NC}"
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
    echo "  3. Run production training (GPU, 500K timesteps):"
    echo "     ./train_production_500k_gpu.sh"
    echo ""
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Training failed with exit code $EXIT_CODE${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Check logs at: $OUTPUT_DIR/logs/"
    exit $EXIT_CODE
fi

