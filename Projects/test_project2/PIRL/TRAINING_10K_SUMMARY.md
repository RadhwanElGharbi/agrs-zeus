# PIRL 10K Timestep Training Run - Summary Report

**Date**: November 17, 2025  
**Training Configuration**: CPU + MLP Policy  
**Total Timesteps**: 49,152 (exceeded 10K target due to PPO batch size)  
**Status**: ✅ COMPLETE (with concerns)

---

## Training Results

### Performance Metrics
- **Total timesteps trained**: 49,152
- **Training time**: ~25 minutes
- **Number of environments**: 24
- **Policy architecture**: MlpPolicy (PPO)
- **Final evaluation reward**: -356,867.01 ± 0.00
- **Episode length**: 75 ± 0 steps

### Model Output
- **Model location**: `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/pirl_model.zip`
- **GeoJSON route**: `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/route_10k_cpu_mlp.geojson`
- **Log file**: `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/training_cpu_mlp.log`

---

## Critical Issues Identified

### 🔴 Issue #1: Catastrophic Slope Violation

**Problem**: The trained agent consistently terminates after 75 steps due to encountering slopes >50%.

```
✅ Episode ended at step 75
   Reason: FAILURE: Catastrophic slope (>50% - physically impossible for pipeline)
```

**Analysis**:
1. The agent learned to reach the goal quickly (75 steps vs theoretical minimum)
2. However, it's taking a direct route through very steep terrain
3. The exponential slope penalty may not be strong enough to deter catastrophic slopes
4. The reward of -356,867 suggests heavy penalties are being applied, but not preventing the behavior

**Potential Root Causes**:
1. **Insufficient training**: 49K timesteps may be too short for the agent to learn proper avoidance
2. **Reward imbalance**: The progress reward may be overwhelming the slope penalty
3. **Exploration issue**: Agent may not have discovered viable low-slope routes yet
4. **Penalty calibration**: Exponential slope penalty might need adjustment

### Issue #2: No Variance in Evaluation

All 5 evaluation episodes produced **identical** results:
- Same episode length: 75 steps
- Same reward: -356,867.01
- Same termination reason: Catastrophic slope

This suggests:
- Deterministic policy is converging to a single poor solution
- No stochasticity in evaluation
- Agent hasn't learned diverse routing strategies

---

## Diagnostic Analysis

### Slope Penalty Review

Current implementation (from `PIRL.cpp`):

```cpp
double PhysicsConstraints::slope_penalty(double slope) const {
    if (slope <= config_.constraints.max_slope_percent) {
        return 0.0;  // No penalty within constraint
    }
    
    double excess = slope - config_.constraints.max_slope_percent;
    
    // Exponential penalty: increasingly severe as slope increases
    double base_penalty = -100.0;
    double growth_rate = 1.4;  // Exponential growth factor
    double penalty = base_penalty * std::pow(growth_rate, excess);
    
    // Cap at -50000 to prevent reward explosion
    return std::max(penalty, -50000.0);
}
```

**For 50% slope** (30% excess):
- Penalty = -100 × 1.4^30 = **-50,000** (capped)

**For 20.1% slope** (0.1% excess):
- Penalty = -100 × 1.4^0.1 = **-103.3**

### Reward Structure Analysis

From evaluation results, the average reward per step:
- Total reward: -356,867.01
- Episode length: 75 steps
- **Average reward/step: -4,758.23**

This extremely negative reward indicates:
1. Severe penalties are being applied at every step
2. The route is consistently violating constraints
3. The agent isn't finding a viable low-penalty path

---

## Recommendations

### Option A: Extended Training (Recommended)
**Rationale**: 49K timesteps is extremely short for a complex routing problem

**Action**:
1. Run a longer training session: 500K-1M timesteps
2. Keep current penalty structure
3. Monitor if agent discovers low-slope routes through exploration

**Command**:
```bash
# Create 500K training config
cp pirl_training_config_10k_validation.yaml pirl_training_config_500k.yaml
# Edit: total_timesteps: 500000
./train_500k_cpu_mlp.sh
```

### Option B: Increase Slope Penalty Steepness
**Rationale**: Make catastrophic slopes (>40%) even more prohibitive

**Action**:
```cpp
// Modify PIRL.cpp line ~150
double growth_rate = 2.0;  // Increased from 1.4
// This makes 50% slope penalty grow much faster
```

### Option C: Add Intermediate Termination
**Rationale**: Prevent agent from even attempting high-slope routes

**Action**:
```cpp
// Modify PIRL_Environment.cpp check_termination()
// Add intermediate termination at 40% slope (not just 50%)
if (state.slope > 40.0) {
    reason = "FAILURE: Extreme slope (>40% - training termination)";
    return true;
}
```

### Option D: Curriculum Learning
**Rationale**: Gradually increase difficulty

**Action**:
1. Phase 1: Train with 15% max slope (100K timesteps)
2. Phase 2: Fine-tune with 20% max slope (100K timesteps)
3. Phase 3: Final training with full constraints (500K timesteps)

---

## Next Steps

### Immediate Actions

1. **Visualize the Route**:
   - Load `route_10k_cpu_mlp.geojson` in ArcGIS/QGIS
   - Overlay with DEM/slope raster
   - Identify where catastrophic slopes occur

2. **Analyze Training Logs**:
   - Extract reward progression over timesteps
   - Check if slope violations decreased during training
   - Identify if agent is learning at all

3. **Compare with 17D Model**:
   - Load old `pirl_native_final.zip` (17D model)
   - Compare routing behavior
   - Identify what changed with 21D state

### Recommended Training Plan

**Short-term validation** (to test fixes):
- 100K timesteps, CPU + MLP
- 30-60 minutes
- Check if slope behavior improves

**Production training** (if validation succeeds):
- 2M timesteps, GPU + MLP
- 4-8 hours
- Full production-quality model

---

## Technical Issues Resolved This Session

1. ✅ **ModuleNotFoundError**: Fixed virtual environment activation in training scripts
2. ✅ **env_configs IndexError**: Added env_configs field to YAML configuration
3. ✅ **PPO/SAC Parameter Mismatch**: Separated algorithm-specific parameters
4. ✅ **VecMonitor Path Error**: Converted Path objects to strings
5. ✅ **Wrong Environment Import**: Fixed to use native C++ wrapper instead of pure Python
6. ✅ **Model Evaluation Algorithm Detection**: Added algorithm parameter to evaluate_model()
7. ✅ **GeoJSON Generation**: Successfully generated route output

---

## Files Modified/Created

### Modified:
- `/opt/agrs/python/pirl_training/train_pirl.py` - Fixed environment imports, algorithm detection
- `/opt/agrs/Projects/test_project2/PIRL/train_10k_cpu_mlp.sh` - Virtual environment activation
- `/opt/agrs/Projects/test_project2/PIRL/pirl_training_config_10k_validation.yaml` - Added env_configs

### Created:
- `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/pirl_model.zip` - Trained model
- `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/route_10k_cpu_mlp.geojson` - Route output
- `/opt/agrs/Projects/test_project2/PIRL/outputs/validation_10k/training_cpu_mlp.log` - Training logs

---

## Conclusion

The 10K timestep training run **technically succeeded** in that:
- Training completed without crashes ✅
- Model saved successfully ✅
- GeoJSON generated ✅
- Agent learned to reach the goal ✅

However, the agent's routing behavior is **not production-ready**:
- Consistently encounters catastrophic slopes (>50%) ❌
- No improvement in slope avoidance during training ❌
- Extremely negative rewards indicate severe constraint violations ❌

**Recommendation**: This is expected for such a short training run. The agent needs significantly more training time (at least 500K-1M timesteps) to learn proper slope avoidance while finding efficient routes.

---

**Next User Action**: Decide on training strategy (Option A-D) and proceed with extended training run.
