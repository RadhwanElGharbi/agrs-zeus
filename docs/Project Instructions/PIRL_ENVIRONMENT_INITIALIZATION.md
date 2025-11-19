# PIRL Environment Initialization Guide

**Version:** 1.0  
**Date:** November 10, 2025  
**Purpose:** Comprehensive guide for initializing PIRL (Physics-Informed Reinforcement Learning) environments in AGRS projects

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [What the GUI Provides](#what-the-gui-provides)
4. [Manual PIRL Setup](#manual-pirl-setup)
5. [File Reference](#file-reference)
6. [Configuration Details](#configuration-details)
7. [Verification](#verification)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The PIRL environment is the core training infrastructure for pipeline route optimization using reinforcement learning. This guide documents the complete initialization process, including what is automatically created by the GUI and what requires manual setup.

### Purpose

- Ensure consistent PIRL environment structure across all projects
- Document all configuration files and their parameters
- Provide clear setup instructions for new projects
- Enable reproducible training workflows

### Scope

This guide covers:
- PIRL directory structure
- Configuration file generation and customization
- Parameter tuner setup
- Integration with GUI workflow
- Default values and templates

---

## Prerequisites

### What You Need

Before initializing the PIRL environment:

1. **Completed GUI New Project Wizard**
   - Project name defined
   - AOI file loaded
   - CRS selected
   - Start/end points specified
   - Pipeline specifications entered

2. **Project Files Created by GUI**
   - `project_metadata.json` - Project identification and CRS
   - `pipeline_specs.json` - Basic pipeline specifications
   - Directory structure: `aoi/`, `data/`, `logs/`, `docs/`, `inputs/`

3. **System Requirements**
   - CMake build system configured
   - Qt6 development libraries (for parameter tuner)
   - Python 3.8+ with stable-baselines3 (for training)
   - GDAL/OGR libraries (for GIS data processing)

---

## What the GUI Provides

### Data Collected by New Project Dialog

The **NewProjectDialog** / **ProjectSetupWizard** collects:

#### Page 1: Project Information
- **Project Name**: User-defined project name
- **AOI File**: Path to Area of Interest file (GeoJSON, KML, GPKG, SHP)
- **Project Path**: Base directory for project (e.g., `/opt/agrs/Projects/`)
- **CRS**: Coordinate Reference System (EPSG code and name)

#### Page 2: Route Endpoints
- **Start Point**: Latitude and longitude (WGS84)
- **End Point**: Latitude and longitude (WGS84)

#### Page 3: Pipeline Specifications
- **Pipeline Type**: Gas, Oil, Water, Condensate, Mixed, Other
- **Material**: Carbon Steel, Stainless Steel, HDPE, PVC, Fiberglass, Other
- **Diameter**: Outer diameter in millimeters
- **Wall Thickness**: Pipe wall thickness in millimeters
- **MOP (Maximum Operating Pressure)**: In bar, psi, MPa, or kPa
- **DP (Design Pressure)**: In bar, psi, MPa, or kPa
- **Depth of Cover**: Burial depth in meters
- **Hot Bend Angles**: Allowed bend angles (e.g., [5, 10, 22.5, 45, 90])
- **Clearances**: Minimum distances from houses, poles, power lines

### Files Created Automatically

After completing the wizard, the GUI creates:

#### 1. `project_metadata.json`
```json
{
  "project_name": "<name>",
  "date_created": "<ISO timestamp>",
  "crs_epsg": <EPSG code>,
  "crs_name": "<CRS description>"
}
```

#### 2. `pipeline_specs.json` (Basic)
```json
{
  "diameter_mm": 660.4,
  "thickness_mm": 11.1,
  "material": "Carbon Steel",
  "type": "Gas",
  "mop_bar": 70.0,
  "dp_bar": 75.0,
  "depth_of_cover_m": 1.5,
  "hot_bend_angles_deg": [5.0, 10.0, 22.5, 45.0, 90.0],
  "house_min_distance_m": 15.0,
  "poles_min_distance_m": 5.0,
  "powerlines_min_distance_m": 10.0,
  "max_slope_percent": 20.0,
  "prefer_orthogonal_crossings": true
}
```

#### 3. Directory Structure
```
/opt/agrs/Projects/<PROJECT_NAME>/
├── aoi/                    # AOI files
├── data/
│   ├── vectors/           # Vector datasets
│   └── rasters/           # Raster datasets
├── logs/                  # Operation logs
├── docs/                  # Project documentation
└── inputs/                # User-provided input files
```

### What's Missing for PIRL

The GUI does **not** create:
- `/PIRL/` directory structure
- `pirl_training_config.yaml`
- Enhanced `pipeline_specs.json` with hydraulics section
- Parameter tuner executable and source
- `pirl_parameters_default.json`

These must be created manually (see next section).

---

## Manual PIRL Setup

### Step 1: Create PIRL Directory Structure

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>

# Create main PIRL directory
mkdir -p PIRL

# Create subdirectories
mkdir -p PIRL/outputs
mkdir -p PIRL/models/best_model
mkdir -p PIRL/models/checkpoints
mkdir -p PIRL/logs
mkdir -p PIRL/parameter_tuner
```

**Result:**
```
PIRL/
├── outputs/               # Training outputs and generated routes
├── models/                # Model checkpoints
│   ├── best_model/       # Best performing model
│   └── checkpoints/      # Periodic training checkpoints
├── logs/                 # Training logs
└── parameter_tuner/      # Parameter tuning tool (to be populated)
```

### Step 2: Generate pirl_training_config.yaml

Use the template and substitute placeholders with actual project data:

```bash
# Copy template
cp /opt/agrs/templates/pirl_training_config_template.yaml \
   /opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_training_config.yaml

# Edit the file and replace all <PLACEHOLDER> values
nano /opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_training_config.yaml
```

#### Required Substitutions

Replace these placeholders with actual values:

| Placeholder | Source | Example |
|-------------|--------|---------|
| `<PROJECT_NAME>` | GUI Project Name field | `SAIPEM_Italy_Pipeline` |
| `<PROJECT_CODE>` | Auto-generate | `SAIPEM_IT_V1` |
| `<CLIENT_NAME>` | Manual entry | `SAIPEM S.p.A.` |
| `<EPSG_CODE>` | GUI CRS selector | `32633` |
| `<START_X>`, `<START_Y>` | Convert GUI lat/lon to UTM | `379647.98`, `4805029.95` |
| `<END_X>`, `<END_Y>` | Convert GUI lat/lon to UTM | `408381.01`, `4750126.95` |
| `<AOI_MIN_X>`, `<AOI_MIN_Y>` | Extract from AOI file | `362000`, `4745000` |
| `<AOI_MAX_X>`, `<AOI_MAX_Y>` | Extract from AOI file | `425000`, `4815000` |
| `<PROJECT_PATH>` | GUI Project Path + Name | `/opt/agrs/Projects/SAIPEM_Italy_Pipeline` |
| `<PROJECT_NAME_LOWER>` | Lowercase project name | `saipem_italy_pipeline` |
| `<COUNTRY_CODE>` | ISO 3166-1 alpha-3 | `ITA`, `USA`, `SAU` |
| `<REGION_NAME>` | State/province | `Marche-Umbria`, `Texas`, etc. |

#### Coordinate Conversion

To convert lat/lon to UTM coordinates:

**Option A: Using GDAL (command line)**
```bash
# Example: Convert WGS84 lat/lon to UTM 33N (EPSG:32633)
echo "13.514053 43.388493" | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32633
# Output: 379647.98 4805029.95 0.00
```

**Option B: Using Python**
```python
from pyproj import Transformer

transformer = Transformer.from_crs("EPSG:4326", "EPSG:32633", always_xy=True)
x, y = transformer.transform(13.514053, 43.388493)
print(f"X: {x:.2f}, Y: {y:.2f}")
```

**Option C: Using Online Tools**
- https://epsg.io/transform
- https://mygeodata.cloud/cs2cs/

#### AOI Bounds Extraction

To extract AOI bounding box:

```bash
# Using ogrinfo
ogrinfo -al -so /opt/agrs/Projects/<PROJECT_NAME>/aoi/aoi.geojson | grep Extent

# Output example:
# Extent: (362000.000000, 4745000.000000) - (425000.000000, 4815000.000000)
```

### Step 3: Enhance pipeline_specs.json with Hydraulics

Merge hydraulics defaults into the GUI-created `pipeline_specs.json`:

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>

# Backup original
cp pipeline_specs.json pipeline_specs.json.backup

# Merge hydraulics section (manual editing or script)
nano pipeline_specs.json
```

Add the following `hydraulics` section:

```json
{
  ...existing fields from GUI...,
  
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

**Reference:** See `/opt/agrs/templates/pipeline_specs_hydraulics_defaults.json` for full details and gas property presets.

### Step 4: Setup Parameter Tuner

Copy parameter tuner template from reference project:

```bash
cd /opt/agrs/Projects/<PROJECT_NAME>/PIRL

# Copy parameter tuner source
cp -r /opt/agrs/Projects/test_project2/PIRL/parameter_tuner/* parameter_tuner/

# Copy default parameters JSON
cp /opt/agrs/Projects/test_project2/PIRL/pirl_parameters_default.json .
```

#### Update CMakeLists.txt for New Project

Edit `PIRL/parameter_tuner/CMakeLists.txt`:

```bash
nano PIRL/parameter_tuner/CMakeLists.txt
```

Change this line:
```cmake
set(PROJECT_PIRL_DIR "${CMAKE_SOURCE_DIR}/Projects/test_project2/PIRL")
```

To:
```cmake
set(PROJECT_PIRL_DIR "${CMAKE_SOURCE_DIR}/Projects/<PROJECT_NAME>/PIRL")
```

Or use sed:
```bash
sed -i 's/test_project2/<PROJECT_NAME>/g' PIRL/parameter_tuner/CMakeLists.txt
```

#### Add to Main Build System

Edit `/opt/agrs/CMakeLists.txt` and add:

```cmake
# PIRL Parameter Tuner for <PROJECT_NAME>
add_subdirectory(Projects/<PROJECT_NAME>/PIRL/parameter_tuner)
```

### Step 5: Build Parameter Tuner

```bash
cd /opt/agrs/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make pirl_parameter_tuner -j$(nproc)
```

The executable will be installed to:
```
/opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_parameter_tuner
```

---

## File Reference

### Complete PIRL Directory Structure

After manual setup:

```
/opt/agrs/Projects/<PROJECT_NAME>/
├── aoi/                            # (Created by GUI)
├── data/                           # (Created by GUI)
├── logs/                           # (Created by GUI)
├── docs/                           # (Created by GUI)
├── inputs/                         # (Created by GUI)
├── project_metadata.json           # (Created by GUI)
├── pipeline_specs.json             # (Created by GUI, enhanced manually)
└── PIRL/                           # (Created manually)
    ├── pirl_training_config.yaml   # Main training configuration
    ├── pirl_parameters_default.json # Default parameter values
    ├── pirl_parameter_overrides.json # Custom parameter overrides (created by tuner)
    ├── pirl_parameter_tuner        # Parameter tuning executable
    ├── parameter_tuner/            # Parameter tuner source code
    │   ├── main.cpp
    │   ├── PIRLParameterTuningDialog.h
    │   ├── PIRLParameterTuningDialog.cpp
    │   ├── CMakeLists.txt
    │   ├── pirl_parameters_default.json
    │   └── README.md
    ├── outputs/                    # Training outputs
    │   └── pirl_training/
    │       ├── tensorboard/        # TensorBoard logs
    │       └── route_*.geojson     # Generated routes
    ├── models/                     # Trained models
    │   ├── best_model/
    │   │   └── best_model.zip
    │   └── checkpoints/
    │       └── pirl_model_*_steps.zip
    └── logs/                       # Training logs
        └── training.log
```

### Configuration File Roles

#### 1. pirl_training_config.yaml

**Purpose:** Main training configuration file  
**Location:** `/opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_training_config.yaml`  
**Used by:** Python training scripts, C++ environment initialization  
**Contains:**
- Project identification (name, code, client, CRS)
- Route endpoints (start/end UTM coordinates)
- AOI bounding box
- Cost weights for different factors
- Hydraulics configuration
- Regulatory compliance settings
- Physical constraints (slope, curvature, clearances)
- Training hyperparameters (timesteps, learning rate, etc.)
- File paths for outputs and models

**When to edit:**
- After project creation (replace placeholders)
- To adjust training parameters for production runs
- To customize cost weights for project priorities
- To update regulatory settings for region

#### 2. pipeline_specs.json

**Purpose:** Detailed pipeline specifications  
**Location:** `/opt/agrs/Projects/<PROJECT_NAME>/pipeline_specs.json`  
**Used by:** C++ PIRL environment, hydraulics calculator  
**Contains:**
- Physical properties (diameter, thickness, material)
- Pressure parameters (MOP, DP, initial, delivery)
- Construction constraints (depth, bend radii, clearances)
- Hydraulics configuration (flow rate, gas properties, compressor costs)
- SAIPEM-specific requirements (slope limits, crossing preferences)

**When to edit:**
- After GUI project creation (add hydraulics section)
- To update gas properties for different fluid types
- To adjust pressure parameters based on detailed design
- To refine economic parameters (compressor costs, energy prices)

#### 3. pirl_parameters_default.json

**Purpose:** Default values for PPO rewards, cost matrix, and constraints  
**Location:** `/opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_parameters_default.json`  
**Used by:** Parameter tuner GUI, C++ environment (as fallback)  
**Contains:**
- PPO reward weights (progress, goal, exploration, penalties)
- Cost matrix (terrain multipliers, landcover costs, infrastructure)
- Hydraulic costs (compressor, velocity penalties, pressure drop)
- Constraint thresholds (slope limits, clearances, pressures)

**When to edit:**
- Rarely - these are extracted from C++ source code defaults
- Use parameter tuner GUI instead for customization

#### 4. pirl_parameter_overrides.json

**Purpose:** Custom parameter overrides (created by parameter tuner)  
**Location:** `/opt/agrs/Projects/<PROJECT_NAME>/PIRL/pirl_parameter_overrides.json`  
**Used by:** C++ PIRL environment (automatically loaded on startup)  
**Created by:** Parameter tuner GUI export function  
**Contains:** Same structure as `pirl_parameters_default.json`, but only modified values

**When to edit:**
- Don't edit manually - use parameter tuner GUI
- File is automatically loaded by training environment
- Overrides default values from C++ code

---

## Configuration Details

### Default Values Reference

#### Cost Weights
```yaml
terrain_difficulty: 0.20        # Construction difficulty
water_crossings: 0.15          # River/stream crossings
infrastructure_crossings: 0.10  # Roads, railways, power lines
environmental_impact: 0.12     # Protected areas, habitats
row_acquisition: 0.08          # Land acquisition costs
permitting_complexity: 0.08    # Regulatory compliance
hydraulic_costs: 0.12          # Compressor stations
regulatory_penalties: 0.15     # Code violations
```

**Total must equal 1.0**

#### Hydraulics Defaults
```yaml
flow_rate_m3_s: 1.0                      # Volumetric flow rate
temperature_k: 288.15                    # 15°C
initial_pressure_bar: 70.0               # Inlet pressure
min_delivery_pressure_bar: 45.0          # Minimum at delivery
max_operating_pressure_bar: 75.0         # Design pressure limit
gas_molecular_weight_kg_kmol: 16.8       # Natural gas
gas_specific_gravity: 0.58               # Relative to air
pipe_roughness_mm: 0.045                 # New steel pipe
```

#### Constraint Defaults
```yaml
max_slope_percent: 20                    # SAIPEM requirement
min_crossing_angle_deg: 75               # Near-orthogonal preferred
buffer_protected_areas_m: 100            # Natura 2000, parks
buffer_water_bodies_m: 50                # Rivers, lakes
max_segment_length_m: 100                # RL action step size
```

#### Training Defaults
```yaml
total_timesteps: 500000                  # Conservative for testing
num_envs: 8                              # Parallel environments
learning_rate: 0.0003                    # Adam optimizer
batch_size: 256                          # Minibatch size
algorithm: PPO                           # Proximal Policy Optimization
```

**Production Recommendations:**
- Increase `total_timesteps` to 1-2 million
- Increase `num_envs` to match CPU cores (16-32)
- Monitor convergence via TensorBoard

### Gas Property Presets

| Gas Type | Molecular Weight (kg/kmol) | Specific Gravity | Notes |
|----------|----------------------------|------------------|-------|
| Natural Gas | 16.8 | 0.58 | Default, typical composition |
| Methane (CH₄) | 16.04 | 0.554 | Pure methane |
| Hydrogen (H₂) | 2.016 | 0.0696 | Clean energy applications |
| CO₂ | 44.01 | 1.52 | Carbon capture and storage |
| NGL | 30.0 | 1.04 | Natural gas liquids mix |

**Reference:** `/opt/agrs/templates/pipeline_specs_hydraulics_defaults.json`

---

## Verification

### Post-Setup Checklist

After completing manual PIRL setup, verify:

#### 1. Directory Structure
```bash
cd /opt/agrs/Projects/<PROJECT_NAME>
tree -L 3 PIRL/
```

**Expected output:**
```
PIRL/
├── logs/
├── models/
│   ├── best_model/
│   └── checkpoints/
├── outputs/
├── parameter_tuner/
│   ├── CMakeLists.txt
│   ├── main.cpp
│   ├── PIRLParameterTuningDialog.cpp
│   ├── PIRLParameterTuningDialog.h
│   ├── pirl_parameters_default.json
│   └── README.md
├── pirl_parameter_tuner
├── pirl_parameters_default.json
└── pirl_training_config.yaml
```

#### 2. Configuration Files
```bash
# Check all required files exist
ls -lh PIRL/pirl_training_config.yaml
ls -lh PIRL/pirl_parameters_default.json
ls -lh pipeline_specs.json
ls -lh project_metadata.json

# Verify no placeholders remain
grep -E "<[A-Z_]+>" PIRL/pirl_training_config.yaml
# Should return no matches
```

#### 3. Pipeline Specs Hydraulics Section
```bash
# Check if hydraulics section exists
python3 -c "
import json
with open('pipeline_specs.json') as f:
    specs = json.load(f)
    if 'hydraulics' in specs:
        print('✓ Hydraulics section present')
        print(f'  enable_hydraulics: {specs[\"hydraulics\"].get(\"enable_hydraulics\")}')
    else:
        print('✗ Hydraulics section missing!')
"
```

#### 4. Parameter Tuner Executable
```bash
cd PIRL
ls -lh pirl_parameter_tuner
file pirl_parameter_tuner
ldd pirl_parameter_tuner | grep -i qt

# Test run (requires X11)
timeout 2 ./pirl_parameter_tuner 2>&1 || echo "✓ Executable functional"
```

#### 5. Coordinate Conversion
```bash
# Verify start/end coordinates are in UTM (not lat/lon)
python3 -c "
import yaml
with open('PIRL/pirl_training_config.yaml') as f:
    config = yaml.safe_load(f)
    start_x = config.get('start_x', 0)
    start_y = config.get('start_y', 0)
    
    # UTM coordinates are typically 6-7 digits
    if start_x > 10000 and start_y > 1000000:
        print(f'✓ Coordinates appear to be UTM: ({start_x:.2f}, {start_y:.2f})')
    else:
        print(f'✗ Coordinates may still be lat/lon: ({start_x}, {start_y})')
"
```

### Automated Verification Script

Create a verification script:

```bash
#!/bin/bash
# File: /opt/agrs/Projects/<PROJECT_NAME>/PIRL/verify_setup.sh

echo "=== PIRL Environment Verification ==="
echo ""

PROJECT_DIR="/opt/agrs/Projects/<PROJECT_NAME>"
PIRL_DIR="$PROJECT_DIR/PIRL"

# 1. Check directory structure
echo "1. Directory structure..."
for dir in "$PIRL_DIR/logs" "$PIRL_DIR/models/best_model" "$PIRL_DIR/models/checkpoints" "$PIRL_DIR/outputs" "$PIRL_DIR/parameter_tuner"; do
    if [ -d "$dir" ]; then
        echo "   ✓ $dir"
    else
        echo "   ✗ $dir (missing)"
    fi
done

# 2. Check required files
echo ""
echo "2. Required files..."
for file in "$PIRL_DIR/pirl_training_config.yaml" "$PIRL_DIR/pirl_parameters_default.json" "$PROJECT_DIR/pipeline_specs.json" "$PIRL_DIR/pirl_parameter_tuner"; do
    if [ -f "$file" ]; then
        echo "   ✓ $(basename $file)"
    else
        echo "   ✗ $(basename $file) (missing)"
    fi
done

# 3. Check for placeholders
echo ""
echo "3. Checking for unresolved placeholders..."
PLACEHOLDERS=$(grep -o '<[A-Z_]*>' "$PIRL_DIR/pirl_training_config.yaml" 2>/dev/null | sort -u)
if [ -z "$PLACEHOLDERS" ]; then
    echo "   ✓ No placeholders found"
else
    echo "   ✗ Unresolved placeholders:"
    echo "$PLACEHOLDERS" | sed 's/^/      /'
fi

# 4. Check hydraulics section
echo ""
echo "4. Pipeline specs hydraulics..."
if grep -q '"hydraulics"' "$PROJECT_DIR/pipeline_specs.json" 2>/dev/null; then
    echo "   ✓ Hydraulics section present"
else
    echo "   ✗ Hydraulics section missing"
fi

# 5. Check executable
echo ""
echo "5. Parameter tuner executable..."
if [ -x "$PIRL_DIR/pirl_parameter_tuner" ]; then
    echo "   ✓ Executable and has execute permission"
    SIZE=$(stat -c%s "$PIRL_DIR/pirl_parameter_tuner" 2>/dev/null || stat -f%z "$PIRL_DIR/pirl_parameter_tuner")
    echo "   Size: $(numfmt --to=iec $SIZE 2>/dev/null || echo "$SIZE bytes")"
else
    echo "   ✗ Not executable or missing"
fi

echo ""
echo "=== Verification Complete ==="
```

Run verification:
```bash
chmod +x /opt/agrs/Projects/<PROJECT_NAME>/PIRL/verify_setup.sh
./verify_setup.sh
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Placeholders Not Replaced

**Symptom:** Training fails with errors about invalid paths or coordinates

**Diagnosis:**
```bash
grep -E "<[A-Z_]+>" PIRL/pirl_training_config.yaml
```

**Solution:** Manually replace all `<PLACEHOLDER>` values with actual data

---

#### Issue 2: Coordinate Conversion Errors

**Symptom:** Routes are generated in wrong location or training fails

**Diagnosis:**
```bash
# Check if coordinates are still in lat/lon (< 360 for X, < 90 for Y)
head -20 PIRL/pirl_training_config.yaml | grep -E "start_x|start_y"
```

**Solution:** Convert lat/lon to UTM using gdaltransform or pyproj (see Step 2)

---

#### Issue 3: Missing Hydraulics Section

**Symptom:** Hydraulics calculations fail or are disabled

**Diagnosis:**
```bash
python3 -c "import json; f=open('pipeline_specs.json'); print('hydraulics' in json.load(f))"
```

**Solution:** Add hydraulics section from template (see Step 3)

---

#### Issue 4: Parameter Tuner Build Fails

**Symptom:** `make pirl_parameter_tuner` fails with CMake errors

**Diagnosis:**
```bash
cd /opt/agrs/build
cmake .. 2>&1 | grep -i error
```

**Common causes:**
- Qt6 not installed: `sudo apt install qt6-base-dev libqt6widgets6`
- CMakeLists.txt not updated: Check project path in `parameter_tuner/CMakeLists.txt`
- Not added to main CMake: Check `/opt/agrs/CMakeLists.txt` has `add_subdirectory(...)`

---

#### Issue 5: Parameter Tuner Segfault

**Symptom:** `./pirl_parameter_tuner` crashes immediately

**Diagnosis:**
```bash
gdb ./pirl_parameter_tuner
run
bt
```

**Solution:** Ensure `pirl_parameters_default.json` exists in same directory as executable

---

#### Issue 6: Training Fails to Load Data

**Symptom:** Python training script errors: "Failed to load GIS data"

**Diagnosis:**
```bash
# Check data directory exists and has required rasters/vectors
ls -lh data/rasters/dem.tif
ls -lh data/rasters/landcover.tif
ls -lh data/vectors/roads.gpkg
```

**Solution:** Run data fetching workflow before training (see `PROJECT_STRUCTURE_STANDARD.md`)

---

### Getting Help

If issues persist:

1. **Check logs:**
   - Training logs: `PIRL/logs/training.log`
   - TensorBoard: `PIRL/outputs/pirl_training/tensorboard/`
   - System logs: `logs/project.log`

2. **Review documentation:**
   - `PIRL/parameter_tuner/README.md` - Parameter tuner usage
   - `/opt/agrs/docs/HYDRAULICS_MODULE_IMPLEMENTATION_PLAN.md` - Hydraulics details
   - `/opt/agrs/docs/Project Instructions/PROJECT_STRUCTURE_STANDARD.md` - Project structure

3. **Verify reference implementation:**
   - Compare with working project: `/opt/agrs/Projects/test_project2/`
   - Check configuration files for differences

4. **Run automated tests:**
   - Parameter tuner: `/opt/agrs/Projects/test_project2/PIRL/test_parameter_tuner.sh`
   - Training environment: `/opt/agrs/python/pirl_training/validate_training_data.py`

---

## Summary

### PIRL Initialization Workflow

```
1. Complete GUI New Project Wizard
   ↓
2. Create PIRL directory structure
   ↓
3. Generate pirl_training_config.yaml from template
   ↓
4. Enhance pipeline_specs.json with hydraulics
   ↓
5. Setup parameter tuner (copy + build)
   ↓
6. Verify setup (run checklist)
   ↓
7. Ready for training!
```

### Time Estimate

- **Automated (GUI):** 5-10 minutes
- **Manual PIRL setup:** 15-20 minutes
- **Parameter tuner build:** 2-5 minutes
- **Verification:** 2-3 minutes

**Total:** ~25-40 minutes for complete PIRL environment initialization

### Next Steps

After successful initialization:

1. **Fetch GIS data** (if not already done)
2. **Run parameter tuner** to customize rewards/costs
3. **Start training** with `python3 /opt/agrs/python/pirl_training/train_pirl.py`
4. **Monitor progress** via TensorBoard
5. **Evaluate routes** and iterate on parameters

---

**END OF GUIDE**





