# PIRL Test Run Instructions

**Purpose:** Validate the complete PIRL training pipeline with a short 10,000 timestep run before committing to the full 500,000 timestep production training.

---

## Quick Start

Execute the test run with a single command:

```bash
cd /opt/agrs/Projects/test_project2
./run_test_training.sh
```

**Duration:** 5-15 minutes

---

## What This Test Run Does

### 1. **Pre-Training Validation**
   - Validates all datasets (rasters and vectors)
   - Checks pipeline specifications
   - Verifies PIRL configuration
   - Confirms Python environment
   - Tests C++ backend connectivity

### 2. **Training (10,000 timesteps)**
   - Trains PPO model with 4 parallel environments
   - Evaluates every 2,000 timesteps (5 evaluations total)
   - Saves checkpoints every 5,000 timesteps (2 checkpoints)
   - Logs all metrics to TensorBoard
   - Tracks episode statistics in Monitor CSVs

### 3. **Route Generation**
   - Loads the best trained model
   - Runs deterministic inference from start to end point
   - Generates detailed GeoJSON with segment-level cost data
   - Exports route to `PIRL/outputs/test_route_detailed.geojson`

### 4. **Validation Report**
   - Creates comprehensive report of all outputs
   - Documents file manifest
   - Confirms analytics functionality
   - Provides recommendation for full training

---

## Manual Step-by-Step Execution

If you prefer to run steps manually:

### Step 1: Pre-Training Validation

```bash
cd /opt/agrs/Projects/test_project2
source ../../python/pirl_venv/bin/activate
python3 validate_pirl_complete.py
```

### Step 2: Run Training

```bash
python3 ../test_project/train_pirl_direct.py \
  --config PIRL/pirl_training_config_test.yaml \
  2>&1 | tee PIRL/outputs/test_run.log
```

### Step 3: Monitor Training (Optional - Separate Terminal)

```bash
tensorboard --logdir /opt/agrs/Projects/test_project2/PIRL/outputs/pirl_training_test/tensorboard
# Open browser to: http://localhost:6006
```

### Step 4: Generate Route

```bash
python3 generate_route_from_model.py \
  --model PIRL/models/best_model/best_model.zip \
  --config PIRL/pirl_training_config_test.yaml \
  --output PIRL/outputs/test_route_detailed.geojson \
  --deterministic
```

---

## Expected Outputs

### Directory Structure After Test Run:

```
PIRL/
├── pirl_training_config_test.yaml          # Test configuration
├── TEST_RUN_VALIDATION_REPORT.md           # Validation report
├── outputs/
│   ├── test_run.log                        # Console output
│   ├── test_route_detailed.geojson         # Generated route
│   ├── pre_training_validation.log         # Validation logs
│   └── pirl_training_test/
│       ├── tensorboard/
│       │   └── events.out.tfevents.*       # TensorBoard logs
│       ├── eval_logs/
│       │   ├── evaluations.npz             # Evaluation history
│       │   └── monitor.csv                 # Eval episode stats
│       └── data_validation_report.json     # Pre-training validation
└── models/
    ├── best_model/
    │   └── best_model.zip                  # Best performing model
    ├── checkpoints/
    │   ├── pirl_model_5000_steps.zip       # Checkpoint 1
    │   └── pirl_model_10000_steps.zip      # Checkpoint 2
    ├── pirl_italy_v2_test_final.zip        # Final model
    └── pirl_italy_v2_test_vecnormalize.pkl # Normalization stats
```

---

## GeoJSON Output Format

The generated route file (`test_route_detailed.geojson`) contains:

### Full Route Feature
- Complete route as a LineString
- Total statistics (length, cost, reward, success)
- Metadata (model path, config, timestamp)

### Segment Features (One per pipeline segment)
Each segment includes:
- **Geometry:** LineString with start/end coordinates
- **Properties:**
  - `segment_id`: Sequential segment number
  - `length_m`: Segment length in meters
  - `cost_usd`: Segment cost in USD
  - `cost_per_m`: Cost per meter
  - `cumulative_cost`: Running total cost
  - `cumulative_distance_m`: Running total distance
  - `elevation_m`: Terrain elevation
  - `slope_percent`: Terrain slope
  - `geohazard_risk`: Geohazard risk factor (0-1)
  - `population_density`: Population per km²
  - And more...

---

## Success Criteria

The test run is successful if:

✅ **Training completes** all 10,000 timesteps without errors  
✅ **All 7 analytics systems** produce output:
   - TensorBoard logs
   - Monitor CSVs
   - Evaluation logs
   - Checkpoints
   - VecNormalize stats
   - Python logs
   - Episode info

✅ **Checkpoints saved** at 5,000 and 10,000 timesteps  
✅ **Evaluations completed** at 2k, 4k, 6k, 8k, 10k timesteps  
✅ **Route generated** successfully with detailed segment data  
✅ **No data validation errors**  
✅ **No C++/Python binding issues**

---

## Troubleshooting

### Issue: Training fails with "config required" error
**Solution:** Ensure you're passing the `--config` argument:
```bash
python3 ../test_project/train_pirl_direct.py --config PIRL/pirl_training_config_test.yaml
```

### Issue: "pirl_native" module not found
**Solution:** Rebuild the C++ bindings:
```bash
cd /opt/agrs/build
cmake --build . --target pirl_native
cmake --install .
```

### Issue: Route generation fails
**Solution:** Check that a model was saved during training:
```bash
ls -lh PIRL/models/best_model/
ls -lh PIRL/models/pirl_italy_v2_test_*.zip
```

### Issue: TensorBoard shows no data
**Solution:** Ensure TensorBoard is pointing to correct directory:
```bash
tensorboard --logdir PIRL/outputs/pirl_training_test/tensorboard
```

---

## After Test Run: Next Steps

### 1. **Review Results**
   - Open `PIRL/TEST_RUN_VALIDATION_REPORT.md`
   - Check TensorBoard for training curves
   - Inspect generated route in QGIS

### 2. **Validate Route Quality**
   ```bash
   # Load route in QGIS or view with Python
   import geopandas as gpd
   route = gpd.read_file('PIRL/outputs/test_route_detailed.geojson')
   print(route.head())
   ```

### 3. **If Test Passes: Run Full Training**
   ```bash
   python3 ../test_project/train_pirl_direct.py \
     --config PIRL/pirl_training_config.yaml \
     2>&1 | tee PIRL/outputs/production_run.log
   ```
   
   **Note:** Full training takes 2-6 hours with 500,000 timesteps

### 4. **Clean Up Test Files (Optional)**
   ```bash
   # Remove test outputs to save space
   rm -rf PIRL/outputs/pirl_training_test
   rm -rf PIRL/models/pirl_italy_v2_test*
   rm -rf PIRL/models/checkpoints/
   ```

---

## Configuration Differences: Test vs Production

| Parameter | Test Run | Production Run |
|-----------|----------|----------------|
| Total Timesteps | 10,000 | 500,000 |
| Parallel Envs | 4 | 8 |
| Evaluation Freq | 2,000 | 10,000 |
| Checkpoint Freq | 5,000 | 50,000 |
| Batch Size | 128 | 256 |
| Rollout Steps | 512 | 2,048 |
| Output Directory | `pirl_training_test/` | `pirl_training/` |
| Model Prefix | `pirl_italy_v2_test` | `pirl_italy_v2` |

All other parameters (cost weights, constraints, hydraulics, regulatory) are **identical** between test and production.

---

## Support

- **Documentation:** `/opt/agrs/docs/`
- **Training Logs:** `PIRL/outputs/test_run.log`
- **Analytics Validation:** `ANALYTICS_VALIDATION.md`
- **PIRL Validation Report:** `VALIDATION_REPORT.txt`

---

**Last Updated:** October 30, 2025  
**Status:** Test Configuration Ready  
**Ready for Execution:** YES ✅

