#!/bin/bash
################################################################################
# Training Monitor & Auto-Launch Script
# Watches for training completion and automatically runs post-training workflow
################################################################################

PROJECT_DIR="/opt/agrs/Projects/test_project"
cd "$PROJECT_DIR"

MODEL_FILE="models/pirl_italy_v1_final.zip"
CHECK_INTERVAL=30  # Check every 30 seconds

echo "================================================================================"
echo "PIRL TRAINING MONITOR"
echo "================================================================================"
echo "Watching for training completion..."
echo "Model file: $MODEL_FILE"
echo "Check interval: ${CHECK_INTERVAL}s"
echo ""
echo "Press Ctrl+C to stop monitoring"
echo "================================================================================"
echo ""

# Function to check if training process is still running
is_training_running() {
    pgrep -f "python3 train_pirl_direct.py" > /dev/null
    return $?
}

# Function to check if model file exists
model_exists() {
    [ -f "$MODEL_FILE" ]
    return $?
}

# Initial status
if model_exists; then
    echo "✅ Model file already exists!"
    echo "   Would you like to run post-training workflow anyway? (y/n)"
    read -t 10 -n 1 response
    if [ "$response" = "y" ] || [ "$response" = "Y" ]; then
        echo ""
        echo "Running post-training workflow..."
        ./post_training_workflow.sh
        exit 0
    else
        echo ""
        echo "Exiting."
        exit 0
    fi
fi

if ! is_training_running; then
    echo "⚠️  WARNING: Training process is not running!"
    echo "   Start training first with: ./train_pirl.sh"
    exit 1
fi

echo "✅ Training process detected (PID: $(pgrep -f 'python3 train_pirl_direct.py'))"
echo ""

# Monitor loop
while true; do
    CURRENT_TIME=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Check if training is still running
    if ! is_training_running; then
        echo ""
        echo "[$CURRENT_TIME] ⚠️  Training process stopped!"
        
        # Wait a few seconds for file writes to complete
        sleep 5
        
        # Check if model was saved
        if model_exists; then
            echo "[$CURRENT_TIME] ✅ Model file detected!"
            echo ""
            echo "================================================================================"
            echo "TRAINING COMPLETE - LAUNCHING POST-TRAINING WORKFLOW"
            echo "================================================================================"
            echo ""
            
            # Run post-training workflow
            ./post_training_workflow.sh
            
            echo ""
            echo "================================================================================"
            echo "MONITORING COMPLETE"
            echo "================================================================================"
            exit 0
        else
            echo "[$CURRENT_TIME] ❌ Model file not found - training may have failed"
            echo "   Check logs: outputs/pirl_training/training_fixed.log"
            exit 1
        fi
    fi
    
    # Get current progress from log
    if [ -f "outputs/pirl_training/training_fixed.log" ]; then
        LAST_STEP=$(grep -oP "total_timesteps \| \K\d+" outputs/pirl_training/training_fixed.log | tail -1)
        if [ ! -z "$LAST_STEP" ]; then
            PROGRESS=$(echo "scale=1; $LAST_STEP * 100 / 500000" | bc)
            REMAINING=$(echo "500000 - $LAST_STEP" | bc)
            echo -ne "\r[$CURRENT_TIME] Training: ${LAST_STEP}/500,000 steps (${PROGRESS}%) - ${REMAINING} remaining   "
        fi
    fi
    
    sleep $CHECK_INTERVAL
done



