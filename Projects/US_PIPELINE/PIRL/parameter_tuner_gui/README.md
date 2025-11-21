# US_PIPELINE PIRL Parameter Tuner GUI

**Qt6-based GUI** for tuning reinforcement learning parameters in the simplified 7D state space.

![Status](https://img.shields.io/badge/status-ready-brightgreen)
![Version](https://img.shields.io/badge/version-1.0-blue)
![Qt](https://img.shields.io/badge/Qt-6.4.2-green)

---

## 🎨 Features

### Graphical Interface

- **3 Tabs** for organized parameter editing:
  1. **Reward Function** - 7 reward parameters with live preview
  2. **Constraints** - Physical and operational limits
  3. **Testing** - Run parameter tests and grid search directly from GUI

### Parameter Categories

#### Reward Function (Tab 1)
- Progress Multiplier
- Slope Reward Scale (0-20%)
- Slope Penalty Scale (20-50%)
- Boundary Penalty Scale/Distance
- Curvature Penalty Rate
- Goal Bonus

#### Constraints (Tab 2)
- Max Slope (Terminal threshold)
- Slope Neutral Threshold
- Max Steps Per Episode
- Step Size Range (40-300m)
- Goal Distance Threshold

#### Testing (Tab 3)
- **Run Single Test**: Evaluate current parameters
- **Run Grid Search**: Test 36 configurations automatically
- Real-time output display

### Actions

- **Apply**: Save parameters to project
- **Export JSON**: Export to custom file
- **Reset**: Restore default values
- **Live Preview**: See reward formula with current values

---

## 🚀 Usage

### Launch GUI

#### From New Location:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./pirl_parameter_tuner_us
```

#### From Old Location (Backward Compatible):
```bash
cd /opt/agrs/Projects/US_PIPELINE/US_PIPELINE/PIRL
./pirl_parameter_tuner
```

### Workflow

1. **Open GUI** - Default parameters load automatically
2. **Edit Parameters** - Adjust values in Reward Function or Constraints tabs
3. **Preview Changes** - See reward formula update in real-time
4. **Test Parameters** (Optional):
   - Switch to Testing tab
   - Click "Run Single Test" (20 episodes, ~2-3 min)
   - Review results in output window
5. **Apply Changes** - Click "Apply" to save
6. **Export** (Optional) - Click "Export JSON" to save custom config

---

## 📊 Parameter Guide

### Reward Function

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| Progress Multiplier | 2.0 | 0.1-20.0 | Reward per meter toward goal |
| Slope Reward Scale | 10.0 | 1.0-100.0 | Max reward for 0% slope |
| Slope Penalty Scale | -100.0 | -1000 to -10 | Max penalty for 50% slope |
| Boundary Penalty | -50.0 | -500 to -5 | Penalty at AOI edge |
| Boundary Distance | 100.0 m | 10-500 m | Activation threshold |
| Curvature Penalty | -0.5 | -10 to -0.05 | Penalty per radian turn |
| Goal Bonus | 1000.0 | 50-10000 | Reward for reaching goal |

### Constraints

| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| Max Slope | 50% | 10-100% | Terminal threshold |
| Slope Neutral | 20% | 5-50% | Zero reward threshold |
| Max Steps | 5000 | 100-10000 | Episode length limit |
| Step Size Min | 40 m | 10-100 m | Minimum movement |
| Step Size Max | 300 m | 100-500 m | Maximum movement |
| Goal Threshold | 50 m | 10-200 m | Success distance |

---

## 🧪 Testing Features

### Single Test

**Purpose**: Evaluate current parameters with random policy

**Configuration**:
- Number of Episodes: 1-100 (default: 20)
- Max Steps: 10-500 (default: 100)

**Output**:
- Success rate
- Average total reward
- Average slope
- Episode-by-episode breakdown

**Runtime**: ~2-3 minutes for 20 episodes

---

### Grid Search

**Purpose**: Find optimal parameters automatically

**Tests 36 Configurations**:
- 4 progress multipliers: [0.5, 1.0, 2.0, 5.0]
- 3 slope reward scales: [5.0, 10.0, 20.0]
- 3 slope penalty scales: [-50.0, -100.0, -200.0]

**Output**:
- JSON file with all results
- Best configuration highlighted

**Runtime**: ~10-15 minutes

---

## 💾 File Locations

### GUI Executable

**Primary**: `/opt/agrs/Projects/US_PIPELINE/PIRL/pirl_parameter_tuner_us`

**Symlink**: `/opt/agrs/Projects/US_PIPELINE/US_PIPELINE/PIRL/pirl_parameter_tuner`

### Source Code

```
parameter_tuner_gui/
├── PIRLParameterTuningDialog_US.h    # Header
├── PIRLParameterTuningDialog_US.cpp  # Implementation
├── main.cpp                          # Entry point
├── CMakeLists.txt                    # Build config
└── build/                            # Build artifacts
```

### Output Files

**Parameters**: `/opt/agrs/Projects/US_PIPELINE/PIRL/pirl_parameters_simplified_7d.json`

**Test Results**: `/opt/agrs/Projects/US_PIPELINE/PIRL/outputs/parameter_tuning/`

**Grid Search**: `/opt/agrs/Projects/US_PIPELINE/PIRL/outputs/grid_search/`

---

## 🔨 Building from Source

### Prerequisites

- Qt6 (6.4.2 or later)
- CMake 3.16+
- C++17 compiler

### Build Steps

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/parameter_tuner_gui
mkdir -p build && cd build
cmake ..
make -j$(nproc)
```

**Output**: `pirl_parameter_tuner_us` in parent directory

---

## 🆚 Comparison: GUI vs CLI vs Interactive Menu

| Feature | GUI | CLI | Interactive Menu |
|---------|-----|-----|-----------------|
| **Ease of Use** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Visual Feedback** | ✅ Live preview | ❌ None | ⚠️ Limited |
| **Parameter Testing** | ✅ Built-in | ✅ Manual | ✅ Prompted |
| **Batch Testing** | ✅ Grid search | ✅ Grid search | ✅ Grid search |
| **Export** | ✅ One click | ✅ Command flag | ❌ Manual |
| **Learning Curve** | Low | Medium | Low |
| **Best For** | Interactive tuning | Scripting | Quick tests |

---

## 🐛 Troubleshooting

### Issue: GUI doesn't launch

**Check Qt6 installation**:
```bash
qmake6 --version
# Should show Qt 6.4.2 or later
```

**Rebuild if needed**:
```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL/parameter_tuner_gui/build
make clean && make -j$(nproc)
```

### Issue: "Project directory not found"

**Launch with explicit path**:
```bash
./pirl_parameter_tuner_us /opt/agrs/Projects/US_PIPELINE
```

### Issue: Test button doesn't work

**Verify Python environment**:
```bash
/opt/agrs/python/pirl_venv/bin/python3 --version
# Should show Python 3.12.3
```

**Verify tuner script exists**:
```bash
ls -la /opt/agrs/Projects/US_PIPELINE/PIRL/python/tune_parameters_us.py
```

### Issue: Parameters don't save

**Check permissions**:
```bash
ls -la /opt/agrs/Projects/US_PIPELINE/PIRL/
# Should be writable by your user
```

---

## 📚 Additional Resources

- **Training Guide**: `../TRAINING_GUIDE.md`
- **Parameter Spec**: `/opt/agrs/docs/Project Instructions/US_PIPELINE/PIRL_SIMPLIFIED_SPECIFICATION.md`
- **CLI Tuner**: `../python/tune_parameters_us.py`
- **Interactive Menu**: `../pirl_parameter_tuner.sh`

---

## ✨ Highlights

### Visual Design

- **Color-coded** parameter categories
- **Real-time** reward formula preview
- **Inline help** text for each parameter
- **Status indicators** for modifications

### Workflow Integration

- **Direct testing** from GUI (no command line needed)
- **One-click export** to JSON
- **Grid search** integration
- **Backward compatible** with old location

### User-Friendly

- **Default values** pre-loaded
- **Reset button** for safety
- **Validation** on apply
- **Clear labeling** with units

---

## 🎯 Next Steps

After tuning parameters:

1. **Apply changes** in GUI
2. **Run training**:
   ```bash
   cd /opt/agrs/Projects/US_PIPELINE/PIRL
   ./train_production_500k.sh
   ```
3. **Monitor** with TensorBoard:
   ```bash
   tensorboard --logdir=outputs/production_500k_*/logs/tensorboard
   ```

---

**Ready to tune parameters?**

```bash
cd /opt/agrs/Projects/US_PIPELINE/PIRL
./pirl_parameter_tuner_us
```

🎨 **Beautiful Qt6 GUI - Simple and powerful!**

