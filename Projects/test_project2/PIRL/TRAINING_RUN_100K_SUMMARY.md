# PIRL Training Run: 100k Timesteps - test_project2

**Date:** November 13, 2025
**Status:** ✅ RUNNING
**Process ID:** 55122

---

## Pre-Run Validation Summary

### ✅ Data Validation (PASSED)
- **CRS Consistency:** All datasets in EPSG:32633 (UTM Zone 33N)
- **Raster Validation:**
  - DEM: 0.01m - 691.37m elevation range ✅
  - Landcover: Classes 10-90 (ESA WorldCover) ✅
  - Geohazards: 0.15-0.22 normalized risk ✅
  - Soil: Uniform bearing capacity (50.0) ✅
  - Population: 0-259 people/km² ✅
- **Vector Validation:**
  - AOI boundary: ✅
  - Water bodies: 718 features ✅
  - Roads: 28,638 features ✅
  - Railways: 236 features ✅
  - Power lines: 221 features ✅
  - Pipelines: 1 feature ✅

### ✅ Configuration Validation (PASSED)
- **pipeline_specs.json:** Updated hot bend angles to [15°, 30°, 45°, 60°, 90°] (SAIPEM standard)
- **pirl_training_config_100k.yaml:** 
  - Total timesteps: 100,000
  - Parallel environments: 8
  - Evaluation frequency: 5,000 timesteps
  - Save frequency: 25,000 timesteps
  - Learning rate: 0.0003
  - Algorithm: PPO

### ✅ Environment Instantiation (PASSED)
- Native C++ environment via pybind11 ✅
- State space: 21 dimensions ✅
- Action space: 2 dimensions (continuous) ✅
- Goal distance: 61,967.1m (~62km) ✅
- GIS data loading: All layers loaded successfully ✅
- Step execution: Multiple test steps completed ✅

---

## Training Configuration

### Route Parameters
- **Start Point:** (379,647.98, 4,805,029.95) UTM 33N
- **End Point:** (408,381.01, 4,750,126.95) UTM 33N
- **Straight-line Distance:** ~62 km
- **Expected Route Length:** 65-75 km (accounting for terrain/constraints)

### Pipeline Specifications
- **Diameter:** 660.4 mm (26")
- **Wall Thickness:** 11.1 mm
- **Material:** Carbon Steel
- **MOP:** 70 bar
- **Design Pressure:** 75 bar
- **Max Slope:** 20% (SAIPEM requirement)
- **Hot Bend Angles:** [15°, 30°, 45°, 60°, 90°]
- **Field Bend Max:** 5°
- **Cold Bend Min Radius:** 40DN = 26.416m

### PPO Hyperparameters
- **Total Timesteps:** 100,000
- **Parallel Environments:** 8
- **Learning Rate:** 0.0003
- **Batch Size:** 256
- **Rollout Steps:** 2,048
- **Gamma (Discount):** 0.99
- **GAE Lambda:** 0.95
- **Clip Range:** 0.2
- **Entropy Coefficient:** 0.01
- **Value Function Coefficient:** 0.5
- **Max Gradient Norm:** 0.5

### Reward Configuration
- **Progress Multiplier:** 2.0
- **Goal Bonus:** +10,000
- **Sea Penalty:** -10,000 (1km exclusion zone)
- **Built-up Penalty:** -10,000 (13.5m clearance)
- **Powerline Penalty:** -500 (6m clearance)
- **Railway Penalty:** -500 (10m clearance)
- **Cost Normalization:** 100,000

---

## Training Process

### Start Time
- **Initiated:** 17:08:56 UTC, November 13, 2025
- **Log File:** `/opt/agrs/Projects/test_project2/PIRL/training_100k_20251113_170856.log`

### Output Locations
- **Output Directory:** `/opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_100k/`
- **Tensorboard Logs:** `/opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_100k/tensorboard/`
- **Model Checkpoints:** `/opt/agrs/Projects/test_project2/PIRL/models/pirl_italy_100k_*.zip`

### Checkpoints
Models will be saved at:
- 25,000 timesteps
- 50,000 timesteps
- 75,000 timesteps
- 100,000 timesteps (final)

### Evaluation
- Evaluation episodes run every 5,000 timesteps
- Mean episode reward and length tracked

---

## Monitoring

### Check Training Status
```bash
# View live training log
tail -f /opt/agrs/Projects/test_project2/PIRL/training_100k_20251113_170856.log

# Check process status
ps aux | grep train_pirl_direct

# Monitor with tensorboard
cd /opt/agrs/Projects/test_project2
tensorboard --logdir PIRL/outputs/pirl_training_100k/tensorboard
```

### Current Status
- **PID:** 55122
- **CPU Usage:** ~74% (active training)
- **Memory Usage:** ~5.4%
- **State:** Running

---

## Expected Outcomes

### Training Metrics (100k timesteps)
- **Episode Length:** 500-1500 steps (improving over time)
- **Episode Reward:** -1000 to +3000 (feasible routes with some goal reaching)
- **Success Rate:** 20-40% (goal reached within 50m)
- **Training Duration:** 30-90 minutes (estimated)

### Route Quality
- **Feasibility:** Routes should respect all hard constraints
- **Slope Compliance:** No violations >20%
- **Clearance Compliance:** Minimal violations
- **Cost:** ~$12-25M for 62km route
- **Crossings:** Appropriate HDD usage for railways/power lines

---

## Known Issues & Notes

1. **Slope Calculation:** On-the-fly from DEM (no precomputed slope raster)
2. **Crossing Width:** Currently hardcoded to 20m (not queried from GIS attributes)
3. **Directional Features:** Agent lacks bearing-to-feature information for optimal crossing decisions
4. **Model Maturity:** 100k timesteps provides basic functionality; 500k-2M recommended for production

---

## Next Steps After Training

1. **Load Model:**
   ```python
   from stable_baselines3 import PPO
   model = PPO.load('/opt/agrs/Projects/test_project2/PIRL/models/pirl_italy_100k_final.zip')
   ```

2. **Generate Route:**
   ```bash
   cd /opt/agrs/Projects/test_project2
   python3 generate_route_from_model.py --model PIRL/models/pirl_italy_100k_final.zip
   ```

3. **Validate Results:**
   - Check constraint compliance
   - Review crossing logic
   - Analyze cost breakdown
   - Export to GeoJSON for visualization

4. **Iterate:**
   - Adjust reward parameters if needed
   - Continue training from checkpoint
   - Run production training (500k+ timesteps)

---

**Last Updated:** November 13, 2025 17:12 UTC


