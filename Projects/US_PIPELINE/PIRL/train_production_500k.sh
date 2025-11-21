#!/bin/bash
################################################################################
# US_PIPELINE PIRL - Production Training (500K timesteps)
#
# Full production training run for deployment-ready model.
#
# Expected runtime (with 24 parallel environments):
#   - CPU (multi-core):  ~30-45 minutes
#   - GPU (CUDA):        ~10-20 minutes
#
# Success criteria:
#   - Goal reach rate > 80%
#   - Average route slope < 15%
#   - Stable convergence in reward curve
################################################################################

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}US_PIPELINE PIRL - Production Training 500K${NC}"
echo -e "${BLUE}============================================${NC}"

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/configs/us_pipeline_training_config.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="${SCRIPT_DIR}/outputs/production_500k_${TIMESTAMP}"
LOG_FILE="${OUTPUT_DIR}/training.log"
PYTHON_BIN="/opt/agrs/python/pirl_venv/bin/python3"

# Training parameters
TIMESTEPS=500000
NUM_ENVS=24        # Parallel environments for faster training
BATCH_SIZE=2048    # Optimized for 24 environments (49K samples/rollout)
N_STEPS=2048
LEARNING_RATE=0.0003
EVAL_FREQ=10000
SAVE_FREQ=50000

# Detect device
if command -v nvidia-smi &> /dev/null; then
    DEVICE="cuda"
    echo -e "${GREEN}🎮 GPU detected - using CUDA acceleration${NC}"
else
    DEVICE="cpu"
    echo -e "${YELLOW}💻 No GPU detected - using CPU${NC}"
fi

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Config file:    $CONFIG_FILE"
echo "  Output dir:     $OUTPUT_DIR"
echo "  Timesteps:      $(printf "%'d" $TIMESTEPS)"
echo "  Environments:   $NUM_ENVS"
echo "  Batch size:     $BATCH_SIZE"
echo "  Steps/update:   $N_STEPS"
echo "  Learning rate:  $LEARNING_RATE"
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

# Runtime estimate (with 24 parallel environments)
if [ "$DEVICE" == "cuda" ]; then
    ESTIMATED_RUNTIME="10-20 minutes"
else
    ESTIMATED_RUNTIME="30-45 minutes"
fi

echo -e "${YELLOW}⏱️  Estimated runtime: $ESTIMATED_RUNTIME${NC}"
echo ""
echo -e "${GREEN}Starting production training...${NC}"
echo "  Log file: $LOG_FILE"
echo ""

# Prompt for confirmation
read -p "Continue with 500K timestep training? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Training cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}🚀 TRAINING STARTED${NC}"
echo -e "${BLUE}========================================${NC}"
echo "  Start time: $(date)"
echo ""

# Run training (with logging)
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
    2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo -e "${BLUE}========================================${NC}"
echo "  End time: $(date)"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ PRODUCTION TRAINING COMPLETE!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}📦 Model Outputs:${NC}"
    echo "  Best model:      $OUTPUT_DIR/eval/best_model.zip"
    echo "  Final model:     $OUTPUT_DIR/pirl_us_final.zip"
    echo "  Checkpoints:     $OUTPUT_DIR/models/"
    echo ""
    echo -e "${BLUE}📊 Logs & Metrics:${NC}"
    echo "  Training log:    $LOG_FILE"
    echo "  TensorBoard:     $OUTPUT_DIR/logs/tensorboard"
    echo "  Eval results:    $OUTPUT_DIR/eval/"
    echo ""
    
    # Automatically generate ArcGIS-ready GeoJSON
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}🗺️  Generating ArcGIS-ready GeoJSON...${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    GEOJSON_OUTPUT="$OUTPUT_DIR/route_500k_production.geojson"
    cd "${SCRIPT_DIR}/python"
    $PYTHON_BIN generate_geojson_us.py \
        --model "$OUTPUT_DIR/eval/best_model.zip" \
        --config "$CONFIG_FILE" \
        --output "$GEOJSON_OUTPUT" 2>&1
    
    GEOJSON_EXIT=$?
    
    if [ $GEOJSON_EXIT -eq 0 ] && [ -f "$GEOJSON_OUTPUT" ]; then
        echo ""
        echo -e "${GREEN}✅ GeoJSON generated successfully!${NC}"
        echo "  Location: $GEOJSON_OUTPUT"
        GEOJSON_SIZE=$(du -h "$GEOJSON_OUTPUT" | cut -f1)
        echo "  Size: $GEOJSON_SIZE"
        echo ""
        echo -e "${BLUE}📍 Import to ArcGIS:${NC}"
        echo "  1. Open ArcGIS Pro"
        echo "  2. Add Data → $GEOJSON_OUTPUT"
        echo "  3. Symbology → Color by 'slope_percent'"
        echo ""
    else
        echo ""
        echo -e "${YELLOW}⚠️  GeoJSON generation failed (exit code: $GEOJSON_EXIT)${NC}"
        echo "  You can generate it manually:"
        echo "  cd ${SCRIPT_DIR}/python"
        echo "  python generate_geojson_us.py \\"
        echo "    --model $OUTPUT_DIR/eval/best_model.zip \\"
        echo "    --config $CONFIG_FILE \\"
        echo "    --output $GEOJSON_OUTPUT"
        echo ""
    fi
    
    echo -e "${BLUE}📈 Next Steps:${NC}"
    echo "  1. View training curves:"
    echo "     tensorboard --logdir=$OUTPUT_DIR/logs/tensorboard"
    echo ""
    echo "  2. Analyze route quality:"
    echo "     - Open $GEOJSON_OUTPUT in ArcGIS/QGIS"
    echo "     - Check average slope in attribute table"
    echo "     - Verify route stays within AOI"
    echo ""
    echo "  3. Validate performance:"
    echo "     - Goal reach rate (from eval/)"
    echo "     - Average slope < 15%"
    echo "     - Total reward > -10,000"
    echo ""
    echo -e "${GREEN}========================================${NC}"
    
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}❌ Training failed with exit code $EXIT_CODE${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo "Check logs at: $LOG_FILE"
    echo ""
    echo "Common issues:"
    echo "  - Out of memory: Reduce batch_size or num_envs"
    echo "  - NaN values: Check reward function balance"
    echo "  - C++ crashes: Verify DEM and AOI data integrity"
    echo ""
    exit $EXIT_CODE
fi

