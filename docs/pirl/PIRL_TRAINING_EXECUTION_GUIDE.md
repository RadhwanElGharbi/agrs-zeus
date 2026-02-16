# PIRL Training Execution Guide

**Complete command reference for initializing and running PIRL training for test_project2**

---

## Prerequisites

- AGRS ZEUS framework installed at `/opt/agrs`
- Python virtual environment with dependencies at `/opt/agrs/python/pirl_venv`
- Project data validated and prepared in `/opt/agrs/Projects/test_project2`
- Native C++ PIRL environment compiled (`pirl_native.cpython-*.so`)

---

## Step 1: Pre-Run Data Validation

### Run Data Validation Script

Validates CRS consistency, raster value ranges, vector layer completeness, and NoData handling:

```bash
cd /opt/agrs/Projects/test_project2

python3 /opt/agrs/python/pirl_training/validate_training_data.py \
  PIRL/pirl_training_config.yaml \
  PIRL/data_validation_report.json \
  2>&1 | tee PIRL/data_validation.log
```

**Expected Output:**
- `"status": "ok"`
- All datasets in EPSG:32633
- All vector layers present
- Raster value ranges validated

**If validation fails:** Fix data issues before proceeding.

---

## Step 2: Configuration Verification

### Check Pipeline Specifications

```bash
cat /opt/agrs/Projects/test_project2/pipeline_specs.json | grep -A 3 "hot_bend_angles_deg"
```

**Expected Output:**
```json
"hot_bend_angles_deg": [15.0, 30.0, 45.0, 60.0, 90.0],
```

**If incorrect:** Edit `pipeline_specs.json` to match SAIPEM criteria from `AI_Routing_Criteria.xlsx`.

### Check Training Configuration

```bash
cat /opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml | grep -A 10 "^training:"
```

**Verify:**
- `total_timesteps` matches desired run length
- `num_envs` set appropriately (typically 8)
- `learning_rate`, `batch_size`, etc. are correct

### Check PIRL Parameters

```bash
cat /opt/agrs/Projects/test_project2/PIRL/pirl_parameters_default.json | grep -A 5 "ppo_rewards"
```

**Verify reward parameters are suitable for your project.**

---

## Step 3: Environment Instantiation Testing

### Create Test Script (if not exists)

```bash
cat > /opt/agrs/Projects/test_project2/PIRL/test_env_instantiation.py << 'EOF'
#!/usr/bin/env python3
"""Quick test to validate environment instantiation before training run."""

import sys
import numpy as np
from pathlib import Path

sys.path.insert(0, '/opt/agrs/python/pirl_training')

print("=" * 80)
print("PIRL Environment Instantiation Test")
print("=" * 80)

# Test 1: Import native environment
print("\n[1/5] Testing native environment import...")
try:
    from pirl_native_env import PIRLNativeEnvironment
    print("✅ Native environment imported successfully")
except Exception as e:
    print(f"❌ Failed to import native environment: {e}")
    sys.exit(1)

# Test 2: Instantiate environment
print("\n[2/5] Testing environment instantiation...")
config_path = sys.argv[1] if len(sys.argv) > 1 else '/opt/agrs/Projects/test_project2/PIRL/pirl_training_config.yaml'
try:
    env = PIRLNativeEnvironment(config_path)
    print(f"✅ Environment instantiated successfully")
except Exception as e:
    print(f"❌ Failed to instantiate environment: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 3: Reset environment
print("\n[3/5] Testing environment reset...")
try:
    obs, info = env.reset()
    print(f"✅ Environment reset successfully")
    print(f"   State shape: {obs.shape}")
    print(f"   Expected shape: (21,)")
    assert obs.shape == (21,), f"Unexpected state shape: {obs.shape}"
    print(f"   Goal distance: {info['goal_distance']:.1f}m")
    assert info['goal_distance'] > 50000, f"Goal unexpectedly close: {info['goal_distance']}"
    print("✅ State space validation passed")
except Exception as e:
    print(f"❌ Environment reset failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 4: Execute a step
print("\n[4/5] Testing step execution...")
try:
    action = np.array([0.0, 50.0], dtype=np.float32)
    obs, reward, terminated, truncated, info = env.step(action)
    print(f"✅ Step executed successfully")
    print(f"   New state shape: {obs.shape}")
    print(f"   Reward: {reward:.2f}")
    print(f"   Terminated: {terminated}")
    print(f"   Truncated: {truncated}")
    assert obs.shape == (21,), f"Unexpected state shape after step: {obs.shape}"
    assert -10000 <= reward <= 10000, f"Reward {reward} outside expected range"
    assert not terminated, "Episode should not terminate on first step"
    print("✅ Step execution validation passed")
except Exception as e:
    print(f"❌ Step execution failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Test 5: Execute multiple steps
print("\n[5/5] Testing multiple steps...")
try:
    for i in range(5):
        action = np.array([np.random.uniform(-0.1, 0.1), 50.0], dtype=np.float32)
        obs, reward, terminated, truncated, info = env.step(action)
        if terminated or truncated:
            print(f"   Episode terminated at step {i+2}: {info.get('termination_reason', 'unknown')}")
            break
    else:
        print(f"✅ Multiple steps executed successfully (6 total steps)")
except Exception as e:
    print(f"❌ Multiple steps failed: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 80)
print("✅ ALL VALIDATION TESTS PASSED")
print("=" * 80)
print("\nEnvironment is ready for training!")
EOF

chmod +x /opt/agrs/Projects/test_project2/PIRL/test_env_instantiation.py
```

### Run Environment Test

```bash
cd /opt/agrs
source python/pirl_venv/bin/activate
cd Projects/test_project2/PIRL

python3 test_env_instantiation.py pirl_training_config.yaml
```

**Expected Output:**
```
✅ ALL VALIDATION TESTS PASSED
Environment is ready for training!
```

**If test fails:** Debug environment issues before proceeding.

---

## Step 4: Prepare Training Configuration

### Option A: Use Existing Configuration

```bash
# For full training (500k timesteps)
CONFIG_FILE="PIRL/pirl_training_config.yaml"
```

### Option B: Create Custom Configuration for Test Run

```bash
# Create a copy for a shorter test run (e.g., 100k timesteps)
cd /opt/agrs/Projects/test_project2/PIRL

cp pirl_training_config.yaml pirl_training_config_100k.yaml

# Edit the configuration
nano pirl_training_config_100k.yaml
```

**Modify these lines:**
```yaml
training:
  total_timesteps: 100000  # Change from 500000
  eval_freq: 5000          # Change from 10000
  save_freq: 25000         # Change from 50000

# Legacy format (also update)
total_timesteps: 100000
eval_freq: 5000
save_freq: 25000

# Update output paths
output_dir: /opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_100k
tensorboard_log: /opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_100k/tensorboard
model_save_path: /opt/agrs/Projects/test_project2/PIRL/models/pirl_italy_100k
```

**Set your config file:**
```bash
CONFIG_FILE="PIRL/pirl_training_config_100k.yaml"
```

---

## Step 5: Create Output Directories

```bash
cd /opt/agrs/Projects/test_project2

# Extract output paths from config
OUTPUT_DIR=$(grep "^output_dir:" PIRL/pirl_training_config_100k.yaml | awk '{print $2}')
MODEL_DIR=$(grep "^model_save_path:" PIRL/pirl_training_config_100k.yaml | awk '{print $2}' | xargs dirname)

# Create directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$MODEL_DIR"
mkdir -p PIRL/logs

echo "✅ Output directories created"
```

---

## Step 6: Initialize Training Run

### Start Training in Background

```bash
cd /opt/agrs/Projects/test_project2

# Activate virtual environment and run training
source /opt/agrs/python/pirl_venv/bin/activate

nohup python3 train_pirl_direct.py \
  --config PIRL/pirl_training_config_100k.yaml \
  > PIRL/training_100k_$(date +%Y%m%d_%H%M%S).log 2>&1 &

# Store process ID
TRAIN_PID=$!
echo "Training started with PID: $TRAIN_PID"
echo $TRAIN_PID > PIRL/training.pid
```

**Alternative: Start Training in Foreground (for debugging)**

```bash
cd /opt/agrs/Projects/test_project2
source /opt/agrs/python/pirl_venv/bin/activate

python3 train_pirl_direct.py \
  --config PIRL/pirl_training_config_100k.yaml \
  2>&1 | tee PIRL/training_100k_$(date +%Y%m%d_%H%M%S).log
```

---

## Step 7: Monitor Training Progress

### Check Training Process Status

```bash
# Check if training is running
ps aux | grep train_pirl_direct.py | grep -v grep

# Or using the stored PID
PID=$(cat /opt/agrs/Projects/test_project2/PIRL/training.pid)
ps -p $PID -o pid,ppid,cmd,%cpu,%mem,etime
```

### View Live Training Log

```bash
# Get the most recent log file
LOG_FILE=$(ls -t /opt/agrs/Projects/test_project2/PIRL/training_100k_*.log | head -1)

# Watch live output
tail -f "$LOG_FILE"

# Or with specific line count
tail -100 "$LOG_FILE"
```

### Create Monitoring Script

```bash
cat > /opt/agrs/Projects/test_project2/PIRL/monitor_training.sh << 'EOF'
#!/bin/bash
# Training Monitor Script

echo "================================================================================"
echo "PIRL Training Monitor - test_project2"
echo "================================================================================"
echo ""

# Check if training process is running
PID=$(ps aux | grep "train_pirl_direct.py" | grep -v grep | awk '{print $2}' | head -1)

if [ -z "$PID" ]; then
    echo "❌ Training process not found!"
    exit 1
else
    echo "✅ Training process running (PID: $PID)"
    CPU=$(ps aux | grep "^.*$PID" | awk '{print $3}')
    MEM=$(ps aux | grep "^.*$PID" | awk '{print $4}')
    TIME=$(ps aux | grep "^.*$PID" | awk '{print $10}')
    echo "   CPU: ${CPU}%"
    echo "   Memory: ${MEM}%"
    echo "   Runtime: ${TIME}"
    echo ""
fi

# Show recent log entries
LOG_FILE=$(ls -t /opt/agrs/Projects/test_project2/PIRL/training_100k_*.log | head -1)
if [ -f "$LOG_FILE" ]; then
    echo "Recent Log Entries (last 20 lines):"
    echo "--------------------------------------------------------------------------------"
    tail -20 "$LOG_FILE"
    echo "--------------------------------------------------------------------------------"
fi

echo ""
echo "Model Checkpoints:"
ls -lh /opt/agrs/Projects/test_project2/PIRL/models/pirl_italy_100k_*.zip 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'

echo ""
echo "Tensorboard: tensorboard --logdir /opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_100k/tensorboard"
echo "================================================================================"
EOF

chmod +x /opt/agrs/Projects/test_project2/PIRL/monitor_training.sh

# Run the monitor
/opt/agrs/Projects/test_project2/PIRL/monitor_training.sh
```

### Launch Tensorboard for Real-Time Metrics

```bash
cd /opt/agrs/Projects/test_project2

# Activate virtual environment
source /opt/agrs/python/pirl_venv/bin/activate

# Start tensorboard
tensorboard --logdir PIRL/outputs/pirl_training_100k/tensorboard --port 6006

# Open in browser: http://localhost:6006
```

---

## Step 8: Stop Training (if needed)

### Stop Training Gracefully

```bash
# Get PID from file
PID=$(cat /opt/agrs/Projects/test_project2/PIRL/training.pid)

# Or find process
PID=$(ps aux | grep train_pirl_direct.py | grep -v grep | awk '{print $2}' | head -1)

# Send SIGTERM for graceful shutdown
kill -15 $PID

# Wait a few seconds, then check if stopped
sleep 5
ps -p $PID

# If still running, force kill
kill -9 $PID
```

---

## Step 9: Post-Training Analysis

### Check Final Model

```bash
cd /opt/agrs/Projects/test_project2/PIRL

# List saved models
ls -lh models/pirl_italy_100k_*.zip

# Check final checkpoint
ls -lh models/pirl_italy_100k_final.zip
```

### Review Training Log

```bash
LOG_FILE=$(ls -t /opt/agrs/Projects/test_project2/PIRL/training_100k_*.log | head -1)

# Search for goal reaches
grep "Goal reached" "$LOG_FILE" | wc -l

# Search for terminations
grep "Episode terminated" "$LOG_FILE" | tail -20

# Get training summary
tail -100 "$LOG_FILE"
```

### Generate Route from Trained Model

```bash
cd /opt/agrs/Projects/test_project2
source /opt/agrs/python/pirl_venv/bin/activate

# Use the trained model to generate a route
python3 << 'EOF'
import sys
sys.path.insert(0, '/opt/agrs/python/pirl_training')

from stable_baselines3 import PPO
from pirl_native_env import PIRLNativeEnvironment
import numpy as np

# Load model
model = PPO.load('PIRL/models/pirl_italy_100k_final.zip')

# Create environment
env = PIRLNativeEnvironment('PIRL/pirl_training_config_100k.yaml')

# Generate route
obs, info = env.reset()
route_points = [(obs[0], obs[1])]

for step in range(5000):
    action, _states = model.predict(obs, deterministic=True)
    obs, reward, terminated, truncated, info = env.step(action)
    route_points.append((obs[0], obs[1]))
    
    if terminated or truncated:
        print(f"Episode completed at step {step+1}")
        print(f"Termination reason: {info.get('termination_reason', 'unknown')}")
        break

print(f"Route generated with {len(route_points)} points")
EOF
```

---

## Complete One-Liner Command Sequence

For experienced users, here's the complete sequence in one block:

```bash
# Navigate to project
cd /opt/agrs/Projects/test_project2

# Validate data
python3 /opt/agrs/python/pirl_training/validate_training_data.py \
  PIRL/pirl_training_config_100k.yaml \
  PIRL/data_validation_report.json

# Test environment
source /opt/agrs/python/pirl_venv/bin/activate
python3 PIRL/test_env_instantiation.py PIRL/pirl_training_config_100k.yaml

# Create output directories
mkdir -p PIRL/outputs/pirl_training_100k PIRL/models

# Start training
nohup python3 train_pirl_direct.py \
  --config PIRL/pirl_training_config_100k.yaml \
  > PIRL/training_100k_$(date +%Y%m%d_%H%M%S).log 2>&1 &

# Monitor
tail -f PIRL/training_100k_*.log
```

---

## Troubleshooting

### Issue: "No module named 'gymnasium'"
```bash
# Ensure virtual environment is activated
source /opt/agrs/python/pirl_venv/bin/activate

# Install missing dependencies
pip install gymnasium stable-baselines3
```

### Issue: "Failed to load pirl_native"
```bash
# Rebuild C++ extension
cd /opt/agrs/build
make pirl_native
```

### Issue: Training terminates immediately
```bash
# Check data validation
python3 /opt/agrs/python/pirl_training/validate_training_data.py \
  PIRL/pirl_training_config_100k.yaml \
  PIRL/data_validation_report.json

# Check start/end points are within AOI
# Review constraint thresholds in pirl_parameters_default.json
```

### Issue: Out of memory
```bash
# Reduce number of parallel environments
# Edit config: num_envs: 4  (instead of 8)

# Or reduce batch size
# Edit config: batch_size: 128  (instead of 256)
```

---

## Training Configuration Reference

### Timestep Guidelines
- **10k timesteps:** Quick smoke test (~5 minutes)
- **100k timesteps:** Basic functionality validation (~30-90 minutes)
- **500k timesteps:** Production-quality routing (~2-6 hours)
- **2M timesteps:** High-quality, refined routing (~8-24 hours)

### Hardware Requirements
- **CPU:** 8+ cores recommended for parallel environments
- **RAM:** 16GB minimum, 32GB recommended
- **Disk:** 10GB free space for models and logs
- **GPU:** Optional (not used by default PPO implementation)

---

**Last Updated:** November 13, 2025
**Version:** 1.0
**Project:** test_project2 (Central Italy, 26" Gas Pipeline)

