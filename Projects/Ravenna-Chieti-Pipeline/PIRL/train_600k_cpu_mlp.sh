#!/bin/bash
# PIRL 600K Production Training - CPU + MLP Policy
# Multi-threaded CPU training using all available cores

set -e

echo "========================================================================"
echo "PIRL 600K PRODUCTION TRAINING - CPU + MLP (MULTI-THREADED)"
echo "========================================================================"
echo ""
echo "Configuration:"
echo "  - Timesteps: 600,000"
echo "  - Environments: 24"
echo "  - Device: CPU (multi-threaded)"
echo "  - Policy: MlpPolicy"
echo "  - Expected runtime: ~6-12 hours (depending on CPU)"
echo ""
echo "This training will produce a properly trained model that:"
echo "  - Avoids catastrophic slopes"
echo "  - Follows terrain contours"
echo "  - Balances progress vs penalties"
echo "  - Produces quality routes like route_600k_current.geojson"
echo ""
echo "========================================================================"
echo ""

# Activate virtual environment
source /opt/agrs/python/pirl_venv/bin/activate

# Disable GPU
export CUDA_VISIBLE_DEVICES=""

# ============================================================================
# CPU THREADING CONFIGURATION
# ============================================================================
# These environment variables control CPU parallelization for various libraries

# Detect number of CPU cores
NUM_CORES=$(nproc)
echo "Detected CPU cores: $NUM_CORES"
echo ""

# Option 1: Use ALL cores (maximum performance, may heat up system)
# Uncomment to use:
# export OMP_NUM_THREADS=$NUM_CORES
# export MKL_NUM_THREADS=$NUM_CORES
# export OPENBLAS_NUM_THREADS=$NUM_CORES
# export NUMEXPR_NUM_THREADS=$NUM_CORES

# Option 2: Use 75% of cores (RECOMMENDED - good balance)
# This leaves some cores for system processes
NUM_THREADS=$((NUM_CORES * 3 / 4))
if [ $NUM_THREADS -lt 1 ]; then
    NUM_THREADS=1
fi
export OMP_NUM_THREADS=$NUM_THREADS
export MKL_NUM_THREADS=$NUM_THREADS
export OPENBLAS_NUM_THREADS=$NUM_THREADS
export NUMEXPR_NUM_THREADS=$NUM_THREADS

# Option 3: Use specific number of threads (MANUAL CONTROL)
# Uncomment and set desired number:
# export OMP_NUM_THREADS=16
# export MKL_NUM_THREADS=16
# export OPENBLAS_NUM_THREADS=16
# export NUMEXPR_NUM_THREADS=16

# Additional threading configuration
export OMP_PROC_BIND=true           # Bind threads to cores for consistency
export OMP_PLACES=cores             # Thread placement strategy
export KMP_BLOCKTIME=0              # Reduce thread idle time
export KMP_AFFINITY=granularity=fine,compact,1,0  # Thread affinity for Intel CPUs

echo "CPU Threading Configuration:"
echo "  - OMP_NUM_THREADS: $OMP_NUM_THREADS"
echo "  - MKL_NUM_THREADS: $MKL_NUM_THREADS"
echo "  - OPENBLAS_NUM_THREADS: $OPENBLAS_NUM_THREADS"
echo "  - Parallel Environments: 24"
echo "  - Total parallelization: $OMP_NUM_THREADS threads × 24 environments"
echo ""

# ============================================================================
# TRAINING EXECUTION
# ============================================================================

# Create output directory
mkdir -p outputs/production_600k_cpu
mkdir -p models

# Log start time
echo "Training started at: $(date)"
echo ""

# Run training
/opt/agrs/python/pirl_venv/bin/python3 /opt/agrs/python/pirl_training/train_pirl.py \
    --config pirl_training_config_600k_production.yaml \
    --device cpu \
    --policy MlpPolicy 2>&1 | tee outputs/production_600k_cpu/training_cpu_mlp.log

echo ""
echo "=========================================="
echo "Training complete!"
echo "=========================================="
echo "Training finished at: $(date)"
echo ""
echo "Logs: outputs/production_600k_cpu/training_cpu_mlp.log"
echo "Models: models/pirl_600k_production_*.zip"
echo "TensorBoard: outputs/production_600k/tensorboard"
echo ""
echo "Next steps:"
echo "  1. Analyze training: python3 analyze_training_run.py outputs/production_600k_cpu"
echo "  2. Generate GeoJSON: python3 generate_route_from_model_detailed.py \\"
echo "       --model models/pirl_600k_production.zip \\"
echo "       --config pirl_training_config_600k_production.yaml \\"
echo "       --output outputs/production_600k_cpu/route_600k_cpu_production.geojson \\"
echo "       --algorithm PPO"
echo "=========================================="

