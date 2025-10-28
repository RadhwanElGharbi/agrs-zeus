#!/bin/bash
################################################################################
# PIRL Model Retraining Script
# 
# This script retrains the PIRL model on corrected GIS data.
# The previous model was trained on data with CRS/slope issues.
# This new training will use the corrected data for accurate route generation.
################################################################################

set -e  # Exit on error

echo ""
echo "================================================================================"
echo "PIRL MODEL RETRAINING - CORRECTED GIS DATA"
echo "================================================================================"
echo ""
echo "Training Configuration:"
echo "  - Timesteps: 500,000"
echo "  - Parallel Envs: 8"
echo "  - Estimated Time: 2-4 hours"
echo "  - Model: PPO (Proximal Policy Optimization)"
echo "  - Dataset: Italy AOI (Corrected EPSG:32633, Accurate Slope)"
echo ""
echo "This training will enable the model to:"
echo "  ✓ Generate cost-optimal routes"
echo "  ✓ Respect SAIPEM criteria (max slope 20%, min crossing angle 45°)"
echo "  ✓ Utilize real GIS data (DEM, slope, land cover, constraints)"
echo "  ✓ Produce industry-compliant routes for pipeline construction"
echo ""
echo "================================================================================"
echo ""

# Navigate to project directory
cd /opt/agrs/Projects/test_project

# Activate virtual environment
echo "🐍 Activating Python virtual environment..."
source /opt/agrs/python/pirl_venv/bin/activate

# Set environment variables
echo "🔧 Setting environment variables..."
export PYTHONPATH="/opt/agrs/python/pirl_training:$PYTHONPATH"
export PATH="/opt/agrs/build:$PATH"

# Create output directory
mkdir -p outputs/pirl_training

# Backup old model if it exists
if [ -f "models/pirl_italy_v1_final.zip" ]; then
    echo "💾 Backing up old model..."
    mv models/pirl_italy_v1_final.zip models/pirl_italy_v1_final_OLD_$(date +%Y%m%d_%H%M%S).zip
fi

# Start training
echo ""
echo "🚀 Starting PIRL training..."
echo "    (This will take 2-4 hours. You can monitor progress in another terminal)"
echo "    Monitor command: tail -f outputs/pirl_training/training_corrected.log"
echo ""
echo "================================================================================"
echo ""

# Run training with logging
python3 train_pirl_direct.py 2>&1 | tee outputs/pirl_training/training_corrected.log

# Check if training was successful
if [ $? -eq 0 ]; then
    echo ""
    echo "================================================================================"
    echo "✅ TRAINING COMPLETE!"
    echo "================================================================================"
    echo ""
    echo "Model saved to: models/pirl_italy_v1_final.zip"
    echo ""
    echo "Next steps:"
    echo "  1. Generate a route:"
    echo "     python3 generate_route_native.py \\"
    echo "       --model models/pirl_italy_v1_final.zip \\"
    echo "       --config pirl_training_config.yaml \\"
    echo "       --output-dir outputs/routes_final"
    echo ""
    echo "  2. View training logs:"
    echo "     cat outputs/pirl_training/training_corrected.log"
    echo ""
    echo "  3. Visualize with TensorBoard:"
    echo "     tensorboard --logdir outputs/pirl_training/tensorboard"
    echo ""
    echo "================================================================================"
else
    echo ""
    echo "================================================================================"
    echo "❌ TRAINING FAILED"
    echo "================================================================================"
    echo ""
    echo "Check the log file for details:"
    echo "  cat outputs/pirl_training/training_corrected.log"
    echo ""
    echo "Common issues:"
    echo "  - Insufficient memory (try reducing num_envs in config)"
    echo "  - Missing GIS data (check data/rasters/ directory)"
    echo "  - Configuration errors (validate pirl_training_config.yaml)"
    echo ""
    echo "================================================================================"
    exit 1
fi


