#!/bin/bash
# Real-time monitoring for 2M training run

LOG_DIR="outputs/production_2M_gpu"
if [ "$1" == "cpu" ]; then
    LOG_DIR="outputs/production_2M_cpu"
fi

echo "Monitoring 2M production training..."
echo "Log directory: $LOG_DIR"
echo "Press Ctrl+C to stop monitoring (training will continue)"
echo ""

# Find latest log file
LATEST_LOG=$(ls -t ${LOG_DIR}/training_*.log 2>/dev/null | head -n1)

if [ -z "$LATEST_LOG" ]; then
    echo "No training log found. Start training first."
    exit 1
fi

echo "Watching: $LATEST_LOG"
echo "=========================================="

tail -f "$LATEST_LOG" | grep --line-buffered -E "(FPS|Goal reached|ep_rew_mean|Rollout|value_loss|policy_gradient_loss|Episode|Termination|SUCCESS|FAILURE)"

