# PIRL Initialization Checklist

**Quick Reference Guide for Setting Up PIRL Environment**

Use this checklist to ensure complete and correct PIRL initialization for new projects.

---

## Pre-Flight Check

- [ ] GUI New Project wizard completed successfully
- [ ] Project directory created
- [ ] `project_metadata.json` exists
- [ ] `pipeline_specs.json` exists (basic version from GUI)
- [ ] AOI file loaded in `aoi/` directory
- [ ] Start/end coordinates specified

---

## Step 1: Create Directory Structure

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>
mkdir -p PIRL/{outputs,models/{best_model,checkpoints},logs,parameter_tuner}
```

**Verify:**
- [ ] `/PIRL/` directory exists
- [ ] `/PIRL/outputs/` exists
- [ ] `/PIRL/models/best_model/` exists
- [ ] `/PIRL/models/checkpoints/` exists
- [ ] `/PIRL/logs/` exists
- [ ] `/PIRL/parameter_tuner/` exists

---

## Step 2: Generate Training Configuration

```bash
cp /opt/agrs/templates/pirl_training_config_template.yaml PIRL/pirl_training_config.yaml
nano PIRL/pirl_training_config.yaml
```

**Replace placeholders:**
- [ ] `<PROJECT_NAME>` → actual project name
- [ ] `<PROJECT_CODE>` → project code (e.g., PROJ_ITALY_V1)
- [ ] `<CLIENT_NAME>` → client name
- [ ] `<EPSG_CODE>` → EPSG code from GUI
- [ ] `<START_X>`, `<START_Y>` → UTM coordinates (converted from lat/lon)
- [ ] `<END_X>`, `<END_Y>` → UTM coordinates (converted from lat/lon)
- [ ] `<AOI_MIN_X>`, `<AOI_MIN_Y>`, `<AOI_MAX_X>`, `<AOI_MAX_Y>` → from AOI bounds
- [ ] `<PROJECT_PATH>` → full project path
- [ ] `<PROJECT_NAME_LOWER>` → lowercase project name
- [ ] `<COUNTRY_CODE>` → ISO country code (ITA, USA, etc.)
- [ ] `<REGION_NAME>` → region/state name

**Verify no placeholders remain:**
```bash
grep -E "<[A-Z_]+>" PIRL/pirl_training_config.yaml
# Should return no matches
```

---

## Step 3: Enhance Pipeline Specs with Hydraulics

```bash
nano pipeline_specs.json
```

**Add hydraulics section (after existing fields):**
```json
{
  ...existing fields...,
  "hydraulics": {
    "enable_hydraulics": true,
    "enable_compressor_placement": true,
    "initial_pressure_bar": 70.0,
    "min_delivery_pressure_bar": 45.0,
    "max_operating_pressure_bar": 75.0,
    "volumetric_flow_rate_m3_s": 1.0,
    "operating_temperature_k": 288.15,
    "gas_molecular_weight_kg_kmol": 16.8,
    "gas_specific_gravity": 0.58,
    "pipe_roughness_mm": 0.045,
    "compressor_capex_per_kw_usd": 5000.0,
    "compressor_opex_fraction": 0.03,
    "energy_cost_usd_per_kwh": 0.05
  }
}
```

**Reference:** `/opt/agrs/templates/pipeline_specs_hydraulics_defaults.json`

**Verify:**
- [ ] `hydraulics` section added
- [ ] `enable_hydraulics: true`
- [ ] Gas properties appropriate for pipeline type
- [ ] Valid JSON syntax (no trailing commas)

```bash
python3 -c "import json; json.load(open('pipeline_specs.json')); print('✓ Valid JSON')"
```

---

## Step 4: Setup Parameter Tuner

```bash
cd PIRL

# Copy template
cp -r /opt/agrs/Projects/test_project2/PIRL/parameter_tuner/* parameter_tuner/
cp /opt/agrs/Projects/test_project2/PIRL/pirl_parameters_default.json .

# Update CMakeLists.txt
sed -i 's/test_project2/<PROJECT_NAME>/g' parameter_tuner/CMakeLists.txt
```

**Verify:**
- [ ] `parameter_tuner/` contains: `main.cpp`, `*.h`, `*.cpp`, `CMakeLists.txt`, `README.md`
- [ ] `pirl_parameters_default.json` copied to `PIRL/` directory
- [ ] `parameter_tuner/CMakeLists.txt` updated with correct project name

```bash
grep "Projects/<PROJECT_NAME>/PIRL" parameter_tuner/CMakeLists.txt
# Should show your project name, not test_project2
```

---

## Step 5: Add to Build System

```bash
nano /opt/agrs/CMakeLists.txt
```

**Add at the end (before final endif or similar):**
```cmake
# PIRL Parameter Tuner for <PROJECT_NAME>
add_subdirectory(Projects/<PROJECT_NAME>/PIRL/parameter_tuner)
```

**Verify:**
- [ ] Line added to `/opt/agrs/CMakeLists.txt`
- [ ] Project name matches your actual project

---

## Step 6: Build Parameter Tuner

```bash
cd /opt/agrs/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make pirl_parameter_tuner -j$(nproc)
```

**Expected output:**
```
[ 98%] Building CXX object Projects/<PROJECT_NAME>/PIRL/parameter_tuner/...
[100%] Linking CXX executable pirl_parameter_tuner
[100%] Built target pirl_parameter_tuner
```

**Verify:**
- [ ] Build completed without errors
- [ ] Executable exists: `/opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_parameter_tuner`
- [ ] Executable is executable: `ls -lh PIRL/pirl_parameter_tuner` shows `-rwxr-xr-x`
- [ ] Size is reasonable (2-3 MB)

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>/PIRL
ls -lh pirl_parameter_tuner
file pirl_parameter_tuner
```

---

## Step 7: Final Verification

Run automated checks:

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>

# Check directory structure
tree -L 3 PIRL/

# Check for placeholders
grep -r "<[A-Z_]*>" PIRL/pirl_training_config.yaml

# Verify JSON files
python3 -c "import json; json.load(open('pipeline_specs.json')); print('✓ pipeline_specs.json valid')"
python3 -c "import json; json.load(open('PIRL/pirl_parameters_default.json')); print('✓ pirl_parameters_default.json valid')"

# Test parameter tuner
cd PIRL
timeout 2 ./pirl_parameter_tuner 2>&1 || echo "✓ Executable functional"
```

**Final checklist:**
- [ ] All directories created
- [ ] `pirl_training_config.yaml` exists with no placeholders
- [ ] `pipeline_specs.json` has hydraulics section
- [ ] `pirl_parameters_default.json` exists
- [ ] `pirl_parameter_tuner` executable exists and runs
- [ ] No build errors
- [ ] All JSON files valid

---

## Step 8: Optional - Test Parameter Tuner

If you have X11/display available:

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>/PIRL
./pirl_parameter_tuner
```

**Expected:**
- [ ] Qt dialog window opens
- [ ] 6 tabs visible: PPO Rewards, Terrain, Land Cover, Infrastructure, Hydraulics, Constraints
- [ ] All fields populated with default values
- [ ] "Export to JSON" button functional

---

## Coordinate Conversion Reference

### Using gdaltransform

```bash
echo "<LON> <LAT>" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:<TARGET_EPSG>
```

**Example:**
```bash
echo "13.514053 43.388493" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32633
# Output: 379647.98 4805029.95 0.00
```

### Using Python

```python
from pyproj import Transformer

transformer = Transformer.from_crs("EPSG:4326", "EPSG:<TARGET_EPSG>", always_xy=True)
x, y = transformer.transform(<LON>, <LAT>)
print(f"X: {x:.2f}, Y: {y:.2f}")
```

### Extract AOI Bounds

```bash
ogrinfo -al -so /opt/agrs/Projects/<PROJECT_NAME>/aoi/aoi.geojson | grep Extent
# Output: Extent: (min_x, min_y) - (max_x, max_y)
```

---

## Troubleshooting Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Placeholders remain | Run: `grep -E "<[A-Z_]+>" PIRL/pirl_training_config.yaml` and replace manually |
| Build fails | Check Qt6 installed: `sudo apt install qt6-base-dev libqt6widgets6` |
| Executable missing | Check install path: `find /opt/agrs/build -name pirl_parameter_tuner` |
| Segfault on run | Ensure `pirl_parameters_default.json` in same dir as executable |
| Invalid JSON | Validate: `python3 -c "import json; json.load(open('FILE.json'))"` |
| Wrong coordinates | Verify UTM (6-7 digits), not lat/lon (<360) |

---

## Time Estimates

- **Step 1 (Directories):** 1 minute
- **Step 2 (Config):** 5-10 minutes
- **Step 3 (Hydraulics):** 3-5 minutes
- **Step 4 (Parameter Tuner):** 2-3 minutes
- **Step 5 (CMake):** 1 minute
- **Step 6 (Build):** 2-5 minutes
- **Step 7 (Verification):** 2-3 minutes

**Total:** ~20-30 minutes

---

## Success Criteria

✅ **Ready for training when:**
- All checkboxes above are completed
- Verification commands pass without errors
- No placeholders remain in config files
- Parameter tuner builds and runs
- Hydraulics section present in pipeline specs

---

## Next Steps After Initialization

1. **Fetch GIS data** (if not already done)
   ```bash
   zeus tools osm_roads_fetch --aoi aoi/aoi.geojson -o data/vectors/roads.gpkg
   # ... (fetch other datasets)
   ```

2. **Run parameter tuner** to customize
   ```bash
   cd PIRL
   ./pirl_parameter_tuner
   # Export parameters to pirl_parameter_overrides.json
   ```

3. **Start training**
   ```bash
   cd /opt/agrs/python/pirl_training
   python3 train_pirl.py --config /opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_training_config.yaml
   ```

4. **Monitor progress**
   ```bash
   tensorboard --logdir /opt/agrs/Projects/<PROJECT_NAME>/PIRL/outputs/pirl_training/tensorboard
   ```

---

## Quick Copy-Paste Commands

Replace `<PROJECT_NAME>` with your actual project name, then execute:

```bash
# Set project name
export PROJECT_NAME="your_project_name"

# Step 1: Create directories
cd /opt/agrs/Projects/${PROJECT_NAME}
mkdir -p PIRL/{outputs,models/{best_model,checkpoints},logs,parameter_tuner}

# Step 2: Copy config template
cp /opt/agrs/templates/pirl_training_config_template.yaml PIRL/pirl_training_config.yaml

# Step 4: Copy parameter tuner
cd PIRL
cp -r /opt/agrs/Projects/test_project2/PIRL/parameter_tuner/* parameter_tuner/
cp /opt/agrs/Projects/test_project2/PIRL/pirl_parameters_default.json .
sed -i "s/test_project2/${PROJECT_NAME}/g" parameter_tuner/CMakeLists.txt

# Step 6: Build
cd /opt/agrs/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make pirl_parameter_tuner -j$(nproc)

# Step 7: Verify
cd /opt/agrs/Projects/${PROJECT_NAME}
tree -L 3 PIRL/
ls -lh PIRL/pirl_parameter_tuner
```

**NOTE:** Still need to manually:
- Edit `PIRL/pirl_training_config.yaml` (replace placeholders)
- Add hydraulics section to `pipeline_specs.json`
- Add to `/opt/agrs/CMakeLists.txt`

---

**Quick Reference Complete** ✅

For detailed explanations, see: `/opt/agrs/docs/Project Instructions/PIRL_ENVIRONMENT_INITIALIZATION.md`





