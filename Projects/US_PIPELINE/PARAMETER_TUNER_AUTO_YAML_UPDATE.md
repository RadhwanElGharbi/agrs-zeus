# Parameter Tuner Auto-Update - YAML Configuration

**Date**: 2025-11-21  
**Status**: Implemented and tested

---

## 🎯 What Changed

### Before
- Parameter tuner GUI saved to: `pirl_parameters_simplified_7d.json`
- Training scripts read from: `configs/us_pipeline_training_config.yaml`
- **Problem**: Changes in GUI didn't affect training (different files)
- **Solution**: Manual copy of parameters to YAML file required

### After ✅
- Parameter tuner GUI saves to **BOTH**:
  1. `pirl_parameters_simplified_7d.json` (for reference)
  2. `configs/us_pipeline_training_config.yaml` ⭐ (for training)
- **Result**: GUI is now the single source of truth
- **Benefit**: Any change in GUI immediately affects next training run

---

## 🔧 What Gets Automatically Updated

When you click **"Apply"** in the parameter tuner GUI, the following are updated in the YAML config:

### Constraints (6 parameters)
```yaml
constraints:
  max_slope_percent: 50.0          # ✅ Updated from GUI
  max_steps_per_episode: 5000      # ✅ Updated from GUI
  step_size_min_m: 40.0            # ✅ Updated from GUI (YOUR CHANGE!)
  step_size_max_m: 300.0           # ✅ Updated from GUI (YOUR CHANGE!)
  goal_distance_threshold_m: 50.0  # ✅ Updated from GUI
```

### Hyperparameters (10 parameters)
```yaml
training:
  learning_rate: 0.0003     # ✅ Updated from GUI
  batch_size: 256           # ✅ Updated from GUI
  n_steps: 2048             # ✅ Updated from GUI
  n_epochs: 10              # ✅ Updated from GUI
  gamma: 0.99               # ✅ Updated from GUI
  gae_lambda: 0.95          # ✅ Updated from GUI
  clip_range: 0.2           # ✅ Updated from GUI
  ent_coef: 0.01            # ✅ Updated from GUI
  vf_coef: 0.5              # ✅ Updated from GUI
  max_grad_norm: 0.5        # ✅ Updated from GUI
```

**Total**: 16 parameters automatically synchronized!

---

## 🚀 Complete Workflow

### 1. Open Parameter Tuner
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./pirl_parameter_tuner_us
```

### 2. Modify Parameters
- **Tab 1**: Adjust reward function
- **Tab 2**: Change step sizes (e.g., 50m min, 400m max) ⭐
- **Tab 3**: Tune hyperparameters
- Status changes to: "Modified (not saved)"

### 3. Click "Apply"
- GUI saves to JSON file
- GUI automatically updates YAML file ⭐ NEW!
- Status changes to: "Applied successfully!"
- Console shows: "✓ Updated YAML config: .../us_pipeline_training_config.yaml"

### 4. Run Training
```bash
./train_production_500k_gpu.sh
```

**Result**: Training uses your new step sizes (and all other parameters)!

---

## 📊 Example: Changing Step Sizes

### Before (Manual Process)

```bash
# 1. Open GUI
./pirl_parameter_tuner_us

# 2. Change step_size_min: 40 → 50m
#    Change step_size_max: 300 → 400m
#    Click "Apply"

# 3. Manually edit YAML file
nano configs/us_pipeline_training_config.yaml
# Find lines, manually change values, save

# 4. Train
./train_production_500k_gpu.sh
```

**Problems**:
- ❌ Manual editing error-prone
- ❌ Easy to forget to update YAML
- ❌ Two sources of truth (JSON vs YAML)

---

### After (Automatic) ✅

```bash
# 1. Open GUI
./pirl_parameter_tuner_us

# 2. Change step_size_min: 40 → 50m
#    Change step_size_max: 300 → 400m
#    Click "Apply"

# 3. Train (YAML already updated!)
./train_production_500k_gpu.sh
```

**Benefits**:
- ✅ One click updates everything
- ✅ No manual editing needed
- ✅ No risk of mismatch
- ✅ GUI is single source of truth

---

## 🔍 How to Verify It Worked

### Option 1: Check YAML File
```bash
grep "step_size" /opt/agrs/Projects/US_PIPELINE/PIRL/configs/us_pipeline_training_config.yaml
```

**Expected output** (if you changed to 50 and 400):
```
  step_size_min_m: 50.0    # Minimum step size
  step_size_max_m: 400.0   # Maximum step size
```

### Option 2: Check GUI Console
When you click "Apply", the terminal running the GUI should show:
```
✓ Updated YAML config: /opt/agrs/Projects/US_PIPELINE/PIRL/configs/us_pipeline_training_config.yaml
```

### Option 3: Check Training Output
When you run training, the start output shows configuration:
```
Configuration:
  ...
  Step size min:  50.0m
  Step size max:  400.0m
  ...
```

---

## 💾 Files Affected

When you click "Apply" in the GUI:

### 1. JSON File (Updated)
```
/opt/agrs/Projects/US_PIPELINE/PIRL/pirl_parameters_simplified_7d.json
```
or
```
/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/PIRL/pirl_parameters_simplified_7d.json
```

**Purpose**: Reference, documentation, export

### 2. YAML Config File (Updated) ⭐ NEW!
```
/opt/agrs/Projects/US_PIPELINE/PIRL/configs/us_pipeline_training_config.yaml
```

**Purpose**: Used by all training scripts

### 3. C++ Environment (Uses YAML)
The C++ code reads the YAML file during environment initialization:
```cpp
// pirl_native_env_us.py loads config:
self.config.step_size_min_m = constraints.get('step_size_min_m', 40.0)
self.config.step_size_max_m = constraints.get('step_size_max_m', 300.0)
```

**Result**: C++ environment uses your GUI values!

---

## 📈 Data Flow (After This Update)

```
┌──────────────────┐
│  Parameter GUI   │  ← User changes step sizes
│  (Qt6)           │
└────────┬─────────┘
         │ Click "Apply"
         ├─────────────────────┐
         │                     │
         ▼                     ▼
┌──────────────────┐  ┌──────────────────────┐
│  JSON File       │  │  YAML Config ⭐ NEW! │
│  (reference)     │  │  (training)          │
└──────────────────┘  └─────────┬────────────┘
                                 │
                                 │ Training script reads
                                 ▼
                      ┌──────────────────────┐
                      │  train_pirl_us.py    │
                      │  (Python)            │
                      └─────────┬────────────┘
                                │
                                │ Passes config to
                                ▼
                      ┌──────────────────────┐
                      │  C++ Environment     │
                      │  (PIRL_US.cpp)       │
                      └──────────────────────┘
                                │
                                │ Uses step sizes
                                ▼
                      ┌──────────────────────┐
                      │  Agent Training      │
                      │  (PPO)               │
                      └──────────────────────┘
```

**Before**: YAML was out of sync with GUI (manual update needed)  
**After**: YAML automatically synced with GUI ✅

---

## 🎯 Common Use Cases

### Use Case 1: Test Different Step Sizes

```bash
# Experiment 1: Smaller steps (more control)
./pirl_parameter_tuner_us
# Set: min=30m, max=200m
# Click "Apply"
./train_validation_10k_gpu.sh

# Experiment 2: Larger steps (more efficiency)
./pirl_parameter_tuner_us
# Set: min=60m, max=400m
# Click "Apply"
./train_validation_10k_gpu.sh

# Compare GeoJSON outputs
```

### Use Case 2: Adjust Hyperparameters for Faster Training

```bash
./pirl_parameter_tuner_us
# Tab 3 (Hyperparameters):
#   learning_rate: 0.0003 → 0.001 (faster learning)
#   batch_size: 2048 → 1024 (more frequent updates)
# Click "Apply"
./train_production_500k_gpu.sh
```

### Use Case 3: Stricter Slope Constraints

```bash
./pirl_parameter_tuner_us
# Tab 2 (Constraints):
#   max_slope_percent: 50 → 40 (stricter limit)
#   slope_neutral_threshold: 20 → 15 (earlier penalties)
# Click "Apply"
./train_production_500k_gpu.sh
```

---

## ⚠️ Important Notes

### What Gets Synced
✅ **Constraints** (max_slope, step_sizes, etc.)  
✅ **Hyperparameters** (learning_rate, batch_size, etc.)  
❌ **Not synced**: Project paths, start/end points, EPSG code (these are project-specific)

### When to Use
- ✅ **Always** for parameter tuning
- ✅ Before production training runs
- ✅ When testing different configurations

### Backup Recommendation
Before making major changes:
```bash
cp configs/us_pipeline_training_config.yaml configs/us_pipeline_training_config.yaml.backup
```

Restore if needed:
```bash
cp configs/us_pipeline_training_config.yaml.backup configs/us_pipeline_training_config.yaml
```

---

## 🧪 Testing

### Test 1: Verify GUI Updates YAML

```bash
# 1. Check current value
grep "step_size_max" configs/us_pipeline_training_config.yaml
# Output: step_size_max_m: 300.0

# 2. Open GUI and change to 350
./pirl_parameter_tuner_us
# Tab 2 → step_size_max → 350 → Apply

# 3. Verify update
grep "step_size_max" configs/us_pipeline_training_config.yaml
# Output: step_size_max_m: 350.0   # ✅ Updated!
```

### Test 2: Verify Training Uses New Value

```bash
# 1. Set step_size_max to 250 in GUI
# 2. Run training
./train_validation_10k_gpu.sh 2>&1 | grep "step"
# Should show step sizes capped at 250m
```

---

## ✅ Summary

### What This Fixes

**Your Original Question**:
> "I modified the min and max step size in the parameter tuner, does that mean it will now apply for the next run?"

**Answer**: YES! ✅ (After this update)

### How It Works

1. Open GUI → Change parameters
2. Click "Apply"
3. GUI updates JSON file (as before)
4. GUI now **also** updates YAML file ⭐ (NEW!)
5. Training scripts read YAML file
6. C++ environment uses YAML values
7. Your parameters are applied!

### Benefits

- ✅ Single source of truth (GUI)
- ✅ No manual file editing
- ✅ Immediate effect on next run
- ✅ Less error-prone
- ✅ Consistent across all training runs

---

**GUI has been rebuilt and is ready to use with automatic YAML synchronization!** 🚀

Run: `./pirl_parameter_tuner_us` and your changes will immediately affect training.
