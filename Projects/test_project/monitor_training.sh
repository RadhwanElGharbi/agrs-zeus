#!/bin/bash
################################################################################
# PIRL Training Monitor
# 
# Monitors active PIRL training session and displays real-time metrics
#
# Usage:
#   ./monitor_training.sh           # Single check
#   watch -n 10 ./monitor_training.sh   # Auto-refresh every 10 seconds
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Paths
PROJECT_DIR="/opt/agrs/Projects/test_project"
LOG_FILE="$PROJECT_DIR/outputs/pirl_training/training_fixed.log"
TB_DIR="$PROJECT_DIR/outputs/pirl_training/tensorboard"

# Clear screen for clean output
clear

echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}                        PIRL TRAINING MONITOR                                  ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}Project:${NC} $PROJECT_DIR"
echo -e "${CYAN}Timestamp:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

################################################################################
# 1. CHECK IF TRAINING IS RUNNING
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}1. TRAINING PROCESS STATUS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

TRAINING_PID=$(ps aux | grep "[t]rain_pirl_direct.py" | awk '{print $2}' | head -1)

if [ -n "$TRAINING_PID" ]; then
    echo -e "${GREEN}✓ Training is RUNNING${NC}"
    echo -e "  Process ID: ${BOLD}$TRAINING_PID${NC}"
    
    # Get process info
    CPU_USAGE=$(ps -p $TRAINING_PID -o %cpu= | tr -d ' ')
    MEM_USAGE=$(ps -p $TRAINING_PID -o %mem= | tr -d ' ')
    ELAPSED_TIME=$(ps -p $TRAINING_PID -o etime= | tr -d ' ')
    
    echo -e "  CPU Usage: ${YELLOW}${CPU_USAGE}%${NC}"
    echo -e "  Memory Usage: ${YELLOW}${MEM_USAGE}%${NC}"
    echo -e "  Elapsed Time: ${YELLOW}${ELAPSED_TIME}${NC}"
else
    echo -e "${RED}✗ Training is NOT running${NC}"
    echo ""
    echo -e "${YELLOW}To start training:${NC}"
    echo -e "  cd $PROJECT_DIR"
    echo -e "  python3 train_pirl_direct.py 2>&1 | tee outputs/pirl_training/training_fixed.log &"
    echo ""
    exit 0
fi

echo ""

################################################################################
# 2. TRAINING PROGRESS
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}2. TRAINING PROGRESS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$LOG_FILE" ]; then
    # Extract total timesteps target
    TOTAL_STEPS=500000
    
    # Find latest timestep count from log
    CURRENT_STEPS=$(grep -oP "total_timesteps\s+\|\s+\K\d+" "$LOG_FILE" | tail -1 || echo "0")
    
    if [ "$CURRENT_STEPS" = "0" ]; then
        CURRENT_STEPS=$(grep -oP "\d+/500,000" "$LOG_FILE" | tail -1 | cut -d'/' -f1 | tr -d ',' || echo "0")
    fi
    
    if [ "$CURRENT_STEPS" -gt 0 ]; then
        PROGRESS=$(awk "BEGIN {printf \"%.1f\", ($CURRENT_STEPS/$TOTAL_STEPS)*100}")
        echo -e "  Current Step: ${BOLD}${CURRENT_STEPS}${NC} / ${TOTAL_STEPS}"
        echo -e "  Progress: ${GREEN}${PROGRESS}%${NC}"
        
        # Progress bar
        FILLED=$(awk "BEGIN {printf \"%.0f\", ($PROGRESS/100)*50}")
        BAR=$(printf '%*s' "$FILLED" '' | tr ' ' '█')
        EMPTY=$(printf '%*s' $((50-FILLED)) '' | tr ' ' '░')
        echo -e "  [${GREEN}${BAR}${NC}${EMPTY}]"
    else
        echo -e "  ${YELLOW}Waiting for first rollout to complete...${NC}"
        echo -e "  (This can take 5-10 minutes for initial data collection)"
    fi
else
    echo -e "  ${RED}Log file not found: $LOG_FILE${NC}"
fi

echo ""

################################################################################
# 3. LATEST METRICS
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}3. LATEST TRAINING METRICS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$LOG_FILE" ]; then
    # Extract episode reward
    EP_REWARD=$(grep -oP "ep_rew_mean\s+\|\s+\K[-0-9.e+]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract episode length
    EP_LENGTH=$(grep -oP "ep_len_mean\s+\|\s+\K[0-9.e+]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract FPS
    FPS=$(grep -oP "fps\s+\|\s+\K\d+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract learning rate
    LR=$(grep -oP "learning_rate\s+\|\s+\K[0-9.]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract loss
    LOSS=$(grep -oP "loss\s+\|\s+\K[0-9.e+]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract value loss
    VALUE_LOSS=$(grep -oP "value_loss\s+\|\s+\K[0-9.e+]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    # Extract explained variance
    EXP_VAR=$(grep -oP "explained_variance\s+\|\s+\K[-0-9.e+-]+" "$LOG_FILE" | tail -1 || echo "N/A")
    
    if [ "$EP_REWARD" != "N/A" ]; then
        echo -e "  ${CYAN}Episode Reward (mean):${NC} ${BOLD}$EP_REWARD${NC}"
        
        # Check if reward is in reasonable range
        if [ "$EP_REWARD" != "N/A" ]; then
            REWARD_NUM=$(echo $EP_REWARD | sed 's/[^0-9.e+-]//g')
            if (( $(echo "$REWARD_NUM < -1000000" | bc -l) )); then
                echo -e "    ${RED}⚠️  WARNING: Reward scale appears incorrect (too negative)${NC}"
            elif (( $(echo "$REWARD_NUM > -10000" | bc -l) )); then
                echo -e "    ${GREEN}✓ Reward scale looks good${NC}"
            fi
        fi
    else
        echo -e "  ${YELLOW}No metrics available yet (waiting for first rollout)${NC}"
    fi
    
    if [ "$EP_LENGTH" != "N/A" ]; then
        echo -e "  ${CYAN}Episode Length (mean):${NC} ${BOLD}$EP_LENGTH${NC} steps"
    fi
    
    if [ "$FPS" != "N/A" ]; then
        echo -e "  ${CYAN}Training Speed:${NC} ${BOLD}$FPS${NC} steps/sec"
    fi
    
    if [ "$LR" != "N/A" ]; then
        echo -e "  ${CYAN}Learning Rate:${NC} $LR"
    fi
    
    if [ "$LOSS" != "N/A" ]; then
        echo -e "  ${CYAN}Policy Loss:${NC} $LOSS"
    fi
    
    if [ "$VALUE_LOSS" != "N/A" ]; then
        echo -e "  ${CYAN}Value Loss:${NC} $VALUE_LOSS"
    fi
    
    if [ "$EXP_VAR" != "N/A" ]; then
        echo -e "  ${CYAN}Explained Variance:${NC} $EXP_VAR"
        
        # Check explained variance
        if [ "$EXP_VAR" != "N/A" ]; then
            EXP_VAR_NUM=$(echo $EXP_VAR | sed 's/[^0-9.e+-]//g')
            if (( $(echo "$EXP_VAR_NUM > 0.5" | bc -l) )); then
                echo -e "    ${GREEN}✓ Model is learning well${NC}"
            elif (( $(echo "$EXP_VAR_NUM > 0.1" | bc -l) )); then
                echo -e "    ${YELLOW}○ Model is learning (improving)${NC}"
            else
                echo -e "    ${RED}○ Model is still exploring${NC}"
            fi
        fi
    fi
else
    echo -e "  ${RED}Log file not found${NC}"
fi

echo ""

################################################################################
# 4. RECENT ERRORS/WARNINGS
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}4. RECENT ERRORS/WARNINGS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$LOG_FILE" ]; then
    ERROR_COUNT=$(grep -c "ERROR" "$LOG_FILE" 2>/dev/null || echo "0")
    WARNING_COUNT=$(grep -c "WARNING\|UserWarning" "$LOG_FILE" 2>/dev/null || echo "0")
    
    echo -e "  Total Errors: ${RED}${ERROR_COUNT}${NC}"
    echo -e "  Total Warnings: ${YELLOW}${WARNING_COUNT}${NC}"
    
    # Show last 3 errors
    LAST_ERRORS=$(grep "ERROR" "$LOG_FILE" 2>/dev/null | tail -3)
    if [ -n "$LAST_ERRORS" ]; then
        echo ""
        echo -e "  ${BOLD}Last 3 Errors:${NC}"
        echo "$LAST_ERRORS" | while read -r line; do
            echo -e "    ${RED}→${NC} $(echo $line | cut -c1-100)..."
        done
    fi
else
    echo -e "  ${RED}Log file not found${NC}"
fi

echo ""

################################################################################
# 5. TENSORBOARD INFO
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}5. TENSORBOARD MONITORING${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -d "$TB_DIR" ]; then
    TB_RUNNING=$(ps aux | grep "[t]ensorboard.*$TB_DIR" || echo "")
    
    if [ -n "$TB_RUNNING" ]; then
        echo -e "  ${GREEN}✓ Tensorboard is RUNNING${NC}"
        TB_PORT=$(echo "$TB_RUNNING" | grep -oP "port \K\d+" || echo "6006")
        echo -e "  ${CYAN}URL:${NC} ${BOLD}http://localhost:${TB_PORT}${NC}"
    else
        echo -e "  ${YELLOW}○ Tensorboard is NOT running${NC}"
        echo ""
        echo -e "  ${CYAN}To start Tensorboard:${NC}"
        echo -e "    tensorboard --logdir $TB_DIR --port 6006"
    fi
    
    # Show latest Tensorboard event file
    LATEST_EVENT=$(find "$TB_DIR" -name "events.out.tfevents.*" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_EVENT" ]; then
        EVENT_AGE=$(stat -c %Y "$LATEST_EVENT")
        CURRENT_TIME=$(date +%s)
        AGE_SECONDS=$((CURRENT_TIME - EVENT_AGE))
        
        if [ $AGE_SECONDS -lt 60 ]; then
            echo -e "  ${GREEN}✓ Metrics updated ${AGE_SECONDS}s ago${NC}"
        elif [ $AGE_SECONDS -lt 300 ]; then
            AGE_MINUTES=$((AGE_SECONDS / 60))
            echo -e "  ${YELLOW}○ Metrics updated ${AGE_MINUTES}m ago${NC}"
        else
            AGE_MINUTES=$((AGE_SECONDS / 60))
            echo -e "  ${RED}⚠️  Metrics not updated recently (${AGE_MINUTES}m ago)${NC}"
        fi
    fi
else
    echo -e "  ${RED}Tensorboard directory not found${NC}"
fi

echo ""

################################################################################
# 6. SAVED MODELS
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}6. SAVED MODELS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

MODEL_DIR="$PROJECT_DIR/models"
if [ -d "$MODEL_DIR" ]; then
    MODEL_COUNT=$(find "$MODEL_DIR" -name "*.zip" -type f 2>/dev/null | wc -l)
    echo -e "  Total Models Saved: ${BOLD}${MODEL_COUNT}${NC}"
    
    if [ $MODEL_COUNT -gt 0 ]; then
        echo ""
        echo -e "  ${BOLD}Latest Models:${NC}"
        find "$MODEL_DIR" -name "*.zip" -type f -printf '%T@ %p %s\n' 2>/dev/null | sort -rn | head -5 | while read timestamp path size; do
            filename=$(basename "$path")
            size_mb=$(awk "BEGIN {printf \"%.1f\", $size/1024/1024}")
            age=$(stat -c %y "$path" | cut -d' ' -f1,2 | cut -d'.' -f1)
            echo -e "    • ${CYAN}${filename}${NC} (${size_mb} MB, saved ${age})"
        done
    fi
else
    echo -e "  ${YELLOW}No models directory found${NC}"
fi

echo ""

################################################################################
# 7. QUICK COMMANDS
################################################################################

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}7. QUICK COMMANDS${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "  ${CYAN}Monitor continuously:${NC}"
echo -e "    watch -n 10 $0"
echo ""
echo -e "  ${CYAN}View live log:${NC}"
echo -e "    tail -f $LOG_FILE"
echo ""
echo -e "  ${CYAN}Kill training:${NC}"
echo -e "    kill $TRAINING_PID"
echo ""
echo -e "  ${CYAN}Start Tensorboard:${NC}"
echo -e "    tensorboard --logdir $TB_DIR --port 6006"
echo ""

echo -e "${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""
