# Enhanced Crossing Logic - Quick Reference

**Status**: ✅ **PRODUCTION READY**  
**Last Updated**: November 17, 2025

---

## ✅ IMPLEMENTATION STATUS

| Component | Status | Details |
|-----------|--------|---------|
| State Space (27D) | ✅ Complete | 6 crossing features added |
| Action Space (3D) | ✅ Complete | crossing_decision added |
| Road Width | ✅ Complete | Lanes + highway type |
| Waterway Width | ✅ Complete | width_m + type, dam detection |
| Railway Width | ✅ Complete | Gauge-based (×4 formula) |
| Feature Query | ✅ Complete | Spatial + attribute extraction |
| Cost Calculation | ✅ Complete | All 4 types implemented |
| Environment Step | ✅ Complete | Crossing context populated |
| Python Bindings | ✅ Complete | 27D/3D spaces |
| Compilation | ✅ Success | Zero errors |
| Testing | ✅ Verified | Import + dimension checks |

---

## 🔢 KEY NUMBERS

### State Space
- **Dimension**: 27 (was 21)
- **New features**: 6 crossing context fields
- **Types tracked**: 4 (road, waterway, railway, powerline)

### Action Space
- **Dimension**: 3 (was 2)
- **Decisions**: 4 (normal, cross, contour, avoid)
- **Mapping**: Continuous [-1,1] → discrete {0,1,2,3}

### Width Calculations
- **Road**: 3.5m to 14m (1-4 lanes)
- **Waterway**: 5m to 20m+ (stream to river)
- **Railway**: 4.0m to 6.7m (narrow to broad gauge)

### Cost Examples
- **Track crossing**: ~$13,500
- **Motorway crossing**: ~$48,000
- **Stream crossing**: ~$52,500
- **River crossing**: ~$105,000
- **Railway crossing**: ~$670K - $1.1M
- **Dam/weir**: ∞ (uncrossable)

---

## 🚀 TRAINING QUICK START

### Step 1: Verify Installation
```bash
cd /opt/agrs/python/pirl_training
source /opt/agrs/python/pirl_venv/bin/activate
python3 -c "import pirl_native; print(f'State: {pirl_native.State.dimension()}D, Action: {pirl_native.Action.dimension()}D')"
# Expected: State: 27D, Action: 3D
```

### Step 2: Update Training Config
```yaml
# In your pirl_training_config.yaml
total_timesteps: 600000  # Increased for larger spaces
num_envs: 24
algorithm: PPO
policy: MlpPolicy
```

### Step 3: Run Training
```bash
cd /opt/agrs/Projects/test_project2/PIRL
./train_600k_gpu_mlp.sh  # or train_600k_cpu_mlp.sh
```

---

## 📊 CROSSING CONTEXT FIELDS

### State Fields (Indices 21-26)
```cpp
[21] nearest_crossing_dist           // meters
[22] nearest_crossing_width          // meters
[23] nearest_crossing_type           // 0-4 integer
[24] crossing_before_dist            // meters
[25] crossing_after_dist             // meters
[26] crossing_cardinal_alignment     // 0-1 (perpendicularity)
```

### Crossing Types
- `0`: None (no nearby features)
- `1`: Road
- `2`: Waterway
- `3`: Railway
- `4`: Powerline

### Action Field (Index 2)
```cpp
[2] crossing_decision  // Maps to {0,1,2,3}
```

### Crossing Decisions
- `0`: Normal (no special behavior)
- `1`: Cross (execute crossing with cost)
- `2`: Request contour (follow buffer)
- `3`: Avoid (take alternative direction)

---

## 🔧 WIDTH CALCULATION FORMULAS

### Roads
```
IF lanes > 0:
    width = lanes × 3.5m
ELSE IF highway type known:
    motorway: 14.0m (4 lanes)
    primary/tertiary: 10.5m (3 lanes)
    residential/secondary/service/trunk: 7.0m (2 lanes)
    track: 3.5m (1 lane)
ELSE:
    width = 7.0m (default 2 lanes)
```

### Waterways
```
IF waterway == "dam" OR "weir":
    return ∞ (uncrossable)
ELSE IF width_m > 0:
    width = width_m
ELSE IF waterway type known:
    river: 20.0m
    stream: 5.0m
    canal: 10.0m
ELSE:
    width = 10.0m (default)
```

### Railways
```
IF gauge_mm > 0:
    width = (gauge_mm × 4) / 1000  // meters
ELSE:
    width = 5.74m (standard gauge: 1435mm × 4)

Examples:
- Standard (1435mm): 5.74m
- Narrow (1000mm): 4.0m
- Broad (1676mm): 6.7m
```

---

## 💰 COST CALCULATION FORMULAS

### Roads
```
HDD_cost_per_m = $1,000
crossing_length = width + 10m (approach/exit buffer)
type_multiplier = 2.0 (motorway), 1.0 (default), 0.5 (track)

COST = HDD_cost_per_m × crossing_length × type_multiplier
```

### Waterways
```
HDD_cost_per_m = $1,500
crossing_length = width + 30m (deeper profile)
width_multiplier = 1.0 + (width / 50)

COST = HDD_cost_per_m × crossing_length × width_multiplier
```

### Railways
```
HDD_cost_per_m = $20,000 (very expensive)
crossing_length = width + 50m (deep approach)
type_multiplier = 0.6 (light rail), 1.0 (freight), 1.5 (subway)

COST = HDD_cost_per_m × crossing_length × type_multiplier
```

### Powerlines
```
COST = $150,000 (fixed baseline)
```

---

## 🎯 TRAINING EXPECTATIONS

### Learning Behavior

**Early Training (0-100K steps)**:
- Agent explores crossing decisions randomly
- Learns basic terrain navigation first
- Begins associating high costs with certain features

**Mid Training (100K-400K steps)**:
- Learns to prefer cheaper crossings (tracks vs motorways)
- Begins avoiding uncrossable features (dams)
- Starts optimizing crossing angles (perpendicular preference)

**Late Training (400K-600K steps)**:
- Sophisticated crossing decision-making
- Context-aware routing (considers before/after features)
- Balances crossing costs with detour costs

### Success Indicators

✅ **Good signs**:
- Reward improves over time
- Route total cost decreases
- Fewer catastrophic failures (dams, etc.)
- More perpendicular crossings (alignment ≥ 0.7)

⚠️ **Warning signs**:
- Reward plateaus early
- Agent consistently fails on uncrossables
- Random crossing decisions (no learning)
- High variance in episode costs

**Solution**: Increase training timesteps, adjust hyperparameters, or check reward function integration

---

## 🐛 TROUBLESHOOTING

### Issue: "State dimension mismatch"
**Cause**: Old model (21D) loaded with new environment (27D)  
**Solution**: Retrain from scratch with 27D config

### Issue: "Action dimension mismatch"
**Cause**: Old model (2D) loaded with new environment (3D)  
**Solution**: Retrain from scratch with 3D config

### Issue: "Agent always crosses features"
**Cause**: Crossing costs not properly integrated in reward function  
**Solution**: Check `calculate_reward()` applies crossing costs

### Issue: "Agent never crosses, takes huge detours"
**Cause**: Crossing costs too high relative to detour penalties  
**Solution**: Rebalance cost weights or progress rewards

### Issue: "Compilation fails"
**Cause**: Missing GDAL headers  
**Solution**: Ensure `#include <gdal/ogr_geometry.h>` in PIRL_Environment.cpp

### Issue: "Feature query returns empty"
**Cause**: Vector datasets not loaded or wrong path  
**Solution**: Check `data/vectors/*.gpkg` exists, verify `load_all_data()` success

---

## 📁 KEY FILES

### Core Implementation
- `include/agrs_zeus/PIRL.h` - State/Action structs, declarations
- `src/pirl/PIRL.cpp` - GISDataManager, width calculations, costs
- `src/pirl/PIRL_Environment.cpp` - Environment step logic
- `python/pirl_training/pirl_native_env.py` - Python wrapper

### Documentation
- `ENHANCED_CROSSING_LOGIC_COMPLETE.md` - Full implementation docs
- `CROSSING_LOGIC_IMPLEMENTATION_STATUS.md` - Technical details
- `RAILWAY_WIDTH_IMPLEMENTATION.md` - Railway gauge specifics
- `CROSSING_LOGIC_QUICK_REFERENCE.md` - This file

### Training
- `Projects/test_project2/PIRL/pirl_training_config_600k_production.yaml`
- `Projects/test_project2/PIRL/train_600k_gpu_mlp.sh`
- `Projects/test_project2/PIRL/train_600k_cpu_mlp.sh`

---

## 🔗 DATA REQUIREMENTS

### OSM Vector Data

**Roads** (`data/vectors/roads.gpkg`):
- Required fields: `geometry`, `highway`
- Optional fields: `lanes`

**Waterways** (`data/vectors/waterways.gpkg` or `hydrology.gpkg`):
- Required fields: `geometry`, `waterway`
- Optional fields: `width_m`

**Railways** (`data/vectors/railways.gpkg`):
- Required fields: `geometry`, `railway`
- Optional fields: `gauge` (mm)

**Powerlines** (`data/vectors/power_lines.gpkg`):
- Required fields: `geometry`, `power`
- Optional fields: `voltage`

### Fallback Behavior
- Missing dataset: Feature type ignored in crossing logic
- Missing attributes: Falls back to defaults (see formulas above)
- Empty query results: Crossing fields set to defaults (1000m, 0 type)

---

## ✨ BEST PRACTICES

### Training
1. Start with 10K validation run to verify no crashes
2. Progress to 100K for learning validation
3. Full 600K-800K for production models
4. Monitor TensorBoard for reward trends
5. Save checkpoints every 10K timesteps

### Cost Tuning
1. Validate crossing costs match project budget
2. Adjust HDD cost multipliers if needed (see PIRL.cpp)
3. Test with small network first (few crossings)
4. Scale up to full network

### Model Deployment
1. Test with `generate_route_from_model_detailed.py`
2. Inspect GeoJSON crossing metadata
3. Validate costs in segment attributes
4. Compare with baseline routes

---

**Quick Reference Version**: 1.0  
**For**: AGRS PIRL Enhanced Crossing Logic  
**Contact**: Review `ENHANCED_CROSSING_LOGIC_COMPLETE.md` for details

