#!/bin/bash
# PIRL 10K Validation Training - With Termination Coordinate Monitoring
# Generated: November 17, 2025

set -e

cd /opt/agrs/Projects/test_project2/PIRL

# Activate virtual environment
source /opt/agrs/python/pirl_venv/bin/activate

# Set CPU threads for parallel processing
export OMP_NUM_THREADS=8
export MKL_NUM_THREADS=8
export OPENBLAS_NUM_THREADS=8
export NUMEXPR_NUM_THREADS=8

# Create output directory with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="outputs/validation_10k"
LOG_FILE="${OUTPUT_DIR}/training_${TIMESTAMP}.log"

mkdir -p ${OUTPUT_DIR}

echo "=========================================="
echo "PIRL 10K Validation Training"
echo "=========================================="
echo "Output: ${LOG_FILE}"
echo "Config: pirl_training_config_10k_validation.yaml"
echo "Policy: MlpPolicy"
echo "Device: CPU"
echo "Environments: 24"
echo "=========================================="
echo ""
echo "Starting training..."
echo ""

# Run training with live output
/opt/agrs/python/pirl_venv/bin/python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_10k_validation.yaml \
    --device cpu \
    --policy MlpPolicy \
    2>&1 | tee ${LOG_FILE}

echo ""
echo "=========================================="
echo "Training Complete!"
echo "=========================================="
echo "Log: ${LOG_FILE}"
echo ""
echo "To generate GeoJSON:"
echo "  python3 /opt/agrs/python/pirl_training/generate_geojson_from_trajectory.py \\"
echo "    --model ${OUTPUT_DIR}/pirl_model.zip \\"
echo "    --config pirl_training_config_10k_validation.yaml \\"
echo "    --output ${OUTPUT_DIR}/route_10k_final.geojson \\"
echo "    --algorithm PPO"
echo ""

