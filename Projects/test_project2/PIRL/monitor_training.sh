#!/bin/bash
#
# PIRL Training Monitor
# Real-time monitoring of training progress with key metrics
#

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Find the most recent log file
if [ -z "$1" ]; then
    LOG_FILE=$(ls -t outputs/*/training_*.log 2>/dev/null | head -1)
    if [ -z "$LOG_FILE" ]; then
        echo "❌ No training log files found in outputs/*/"
        echo "Usage: $0 [log_file_path]"
        exit 1
    fi
else
    LOG_FILE="$1"
fi

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    exit 1
fi

echo -e "${BLUE}=========================================="
echo "PIRL Training Monitor"
echo "==========================================${NC}"
echo "Monitoring: $LOG_FILE"
echo ""

# Function to extract and display progress
monitor_progress() {
    clear
    echo -e "${BLUE}=========================================="
    echo "PIRL Training Progress Monitor"
    echo "==========================================${NC}"
    echo "Log file: $LOG_FILE"
    echo "Last updated: $(date)"
    echo ""
    
    # Extract key metrics
    echo -e "${GREEN}📊 Training Progress:${NC}"
    
    # Get latest timesteps
    TIMESTEPS=$(grep -oP 'rollout/ep_len_mean.*\| [0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[0-9.]+$' || echo "N/A")
    TOTAL_TIMESTEPS=$(grep -oP 'total_timesteps: [0-9]+' "$LOG_FILE" 2>/dev/null | head -1 | grep -oP '[0-9]+$' || echo "2000000")
    
    # Get FPS
    FPS=$(grep -oP 'fps: [0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[0-9.]+$' || echo "N/A")
    
    # Get episode stats
    EPISODE_REWARD=$(grep -oP 'rollout/ep_rew_mean.*\| [-0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[-0-9.]+$' || echo "N/A")
    EPISODE_LENGTH=$(grep -oP 'rollout/ep_len_mean.*\| [0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[0-9.]+$' || echo "N/A")
    
    # Get losses
    POLICY_LOSS=$(grep -oP 'train/policy_loss.*\| [-0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[-0-9.]+$' || echo "N/A")
    VALUE_LOSS=$(grep -oP 'train/value_loss.*\| [-0-9.]+' "$LOG_FILE" 2>/dev/null | tail -1 | grep -oP '[-0-9.]+$' || echo "N/A")
    
    # Calculate progress percentage
    if [ "$TIMESTEPS" != "N/A" ] && [ "$TOTAL_TIMESTEPS" != "N/A" ]; then
        PROGRESS=$(echo "scale=1; ($TIMESTEPS / $TOTAL_TIMESTEPS) * 100" | bc 2>/dev/null || echo "0")
    else
        PROGRESS="0"
    fi
    
    echo "  Progress: ${PROGRESS}% (Timesteps: ${TIMESTEPS}/${TOTAL_TIMESTEPS})"
    echo "  FPS: $FPS steps/second"
    echo ""
    
    echo -e "${GREEN}🎮 Episode Statistics:${NC}"
    echo "  Mean Episode Reward: $EPISODE_REWARD"
    echo "  Mean Episode Length: $EPISODE_LENGTH steps"
    echo ""
    
    echo -e "${GREEN}📉 Training Losses:${NC}"
    echo "  Policy Loss: $POLICY_LOSS"
    echo "  Value Loss: $VALUE_LOSS"
    echo ""
    
    # Show recent success/failure events
    echo -e "${GREEN}🏁 Recent Episode Outcomes (last 10):${NC}"
    grep -E "(SUCCESS:|FAILURE:|⛰️|🎉|🚫|🌊)" "$LOG_FILE" 2>/dev/null | tail -10 | while read line; do
        if echo "$line" | grep -q "SUCCESS"; then
            echo -e "${GREEN}  $line${NC}"
        elif echo "$line" | grep -q "FAILURE"; then
            echo -e "${RED}  $line${NC}"
        else
            echo "  $line"
        fi
    done
    echo ""
    
    # Show crossing detection stats if available
    echo -e "${GREEN}🔀 Crossing Context (sample from log):${NC}"
    grep -E "nearest_crossing" "$LOG_FILE" 2>/dev/null | tail -3 | while read line; do
        echo "  $line"
    done
    echo ""
    
    # Estimated time remaining
    if [ "$FPS" != "N/A" ] && [ "$TIMESTEPS" != "N/A" ] && [ "$TOTAL_TIMESTEPS" != "N/A" ]; then
        REMAINING=$((TOTAL_TIMESTEPS - TIMESTEPS))
        if [ $REMAINING -gt 0 ] && [ $(echo "$FPS > 0" | bc) -eq 1 ]; then
            TIME_REMAINING=$(echo "scale=0; $REMAINING / ($FPS * 24)" | bc)  # 24 envs
            HOURS=$((TIME_REMAINING / 3600))
            MINUTES=$(((TIME_REMAINING % 3600) / 60))
            echo -e "${YELLOW}⏱️  Estimated time remaining: ${HOURS}h ${MINUTES}m${NC}"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}Press Ctrl+C to stop monitoring${NC}"
}

# Main monitoring loop
if [ "$2" = "--once" ]; then
    monitor_progress
else
    while true; do
        monitor_progress
        sleep 10  # Update every 10 seconds
    done
fi
