#!/bin/bash
# PIRL Training Quick Start Script
# This script demonstrates the complete PIRL training workflow

set -e  # Exit on any error

echo "🚀 PIRL Training Quick Start"
echo "============================"
echo ""

# Configuration
PROJECT_NAME="SAIPEM_DEMO"
CONFIG_DIR="/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/config"
TRAINING_DIR="/opt/agrs/python/pirl_training"
OUTPUT_DIR="/tmp/pirl_quick_start"

# Create output directory
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

echo "📁 Working directory: $OUTPUT_DIR"
echo ""

# Step 1: Create PIRL project configuration
echo "1️⃣ Creating PIRL project configuration..."
zeus tools pirl_create_config \
    --project "$PROJECT_NAME" \
    --output "${CONFIG_DIR}/pirl_config.yaml"

echo "✅ Configuration created: ${CONFIG_DIR}/pirl_config.yaml"
echo ""

# Step 2: Create training configuration
echo "2️⃣ Setting up training configuration..."
cp "$TRAINING_DIR/training_config_template.yaml" training_config.yaml

# Update the training config to use our project config
sed -i "s|/opt/agrs/Projects/SAIPEM_PIPELINE_DEMO/config/pirl_config.yaml|${CONFIG_DIR}/pirl_config.yaml|g" training_config.yaml

echo "✅ Training configuration created: training_config.yaml"
echo ""

# Step 3: Install Python dependencies (if not already installed)
echo "3️⃣ Checking Python dependencies..."
cd "$TRAINING_DIR"
if ! python3 -c "import stable_baselines3" 2>/dev/null; then
    echo "Installing Python dependencies..."
    pip install -r requirements.txt
else
    echo "✅ Dependencies already installed"
fi
echo ""

# Step 4: Run a short training session
echo "4️⃣ Running training session (short demo)..."
cd "$OUTPUT_DIR"

# Create a minimal training config for quick demo
cat > quick_training_config.yaml << EOF
algorithm: "PPO"
total_timesteps: 50000
num_envs: 2
eval_freq: 10000
save_freq: 25000

algorithm_params:
  learning_rate: 0.0003
  batch_size: 128
  n_epochs: 5
  clip_range: 0.2
  gamma: 0.99
  verbose: 1

env_configs:
  - "${CONFIG_DIR}/pirl_config.yaml"

output_dir: "./quick_training_output"
model_name: "quick_demo_model"
EOF

# Run training
python3 "$TRAINING_DIR/train_pirl.py" --config quick_training_config.yaml

echo "✅ Training completed!"
echo ""

# Step 5: Deploy the trained model
echo "5️⃣ Deploying trained model..."
python3 "$TRAINING_DIR/deploy_pirl.py" \
    --model "./quick_training_output/best_model.zip" \
    --config "${CONFIG_DIR}/pirl_config.yaml" \
    --num-routes 3 \
    --eval-episodes 5 \
    --output-dir "./deployment_results"

echo "✅ Model deployed!"
echo ""

# Step 6: Show results
echo "6️⃣ Results Summary:"
echo "==================="
echo ""

echo "📊 Training Results:"
if [ -f "./quick_training_output/training_summary.yaml" ]; then
    echo "   Training summary: ./quick_training_output/training_summary.yaml"
fi

echo ""
echo "🗺️  Generated Routes:"
if [ -f "./deployment_results/pirl_routes.geojson" ]; then
    echo "   Routes (GeoJSON): ./deployment_results/pirl_routes.geojson"
    echo "   Route details: ./deployment_results/routes_details.json"
fi

echo ""
echo "📈 Performance Stats:"
if [ -f "./deployment_results/performance_stats.yaml" ]; then
    echo "   Performance: ./deployment_results/performance_stats.yaml"
fi

echo ""
echo "🎉 Quick Start Complete!"
echo ""
echo "Next Steps:"
echo "1. View routes in QGIS or web viewer"
echo "2. Examine performance statistics"
echo "3. Run longer training with full configuration"
echo "4. Try hyperparameter optimization"
echo ""
echo "For full training, use:"
echo "  python3 $TRAINING_DIR/train_pirl.py --config $TRAINING_DIR/examples/saipem_training_config.yaml"
echo ""
echo "For hyperparameter optimization:"
echo "  python3 $TRAINING_DIR/hyperopt_pirl.py --config $TRAINING_DIR/hyperopt_config_template.yaml"
echo ""

# Optional: Show file sizes
echo "📁 Output Files:"
find "$OUTPUT_DIR" -name "*.yaml" -o -name "*.json" -o -name "*.zip" | while read file; do
    size=$(du -h "$file" | cut -f1)
    echo "   $(basename "$file"): $size"
done


