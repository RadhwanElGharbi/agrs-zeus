# Quick Start: PIRL Parameter Tuner Setup

**For:** New AGRS Project Initialization  
**Time Required:** ~5 minutes (parameter tuner only) | ~25 minutes (full PIRL environment)  
**Difficulty:** Easy

**NOTE:** This guide covers **parameter tuner setup only**. For complete PIRL environment initialization (configuration files, hydraulics, etc.), see:
- **Comprehensive Guide:** `/opt/agrs/docs/Project Instructions/PIRL_ENVIRONMENT_INITIALIZATION.md`
- **Quick Checklist:** `/opt/agrs/docs/Project Instructions/PIRL_INITIALIZATION_CHECKLIST.md`

---

## Prerequisites

- **GUI New Project wizard completed** (provides project metadata, pipeline specs, coordinates)
- New project directory created under `/opt/agrs/Projects/`
- CMake build system initialized
- Qt6 development libraries available
- **Recommended:** Complete full PIRL environment setup first (see above)

---

## Setup Steps (Parameter Tuner Only)

### 1. Copy Template (30 seconds)

```bash
# Replace <PROJECT_NAME> with your project name
export PROJECT_NAME="your_project_name"

cd /opt/agrs/Projects/${PROJECT_NAME}
mkdir -p PIRL/parameter_tuner
cp -r /opt/agrs/Projects/test_project2/PIRL/parameter_tuner/* PIRL/parameter_tuner/
```

### 2. Update CMakeLists.txt Path (1 minute)

Edit `PIRL/parameter_tuner/CMakeLists.txt`:

```bash
# Open in your editor
nano /opt/agrs/Projects/${PROJECT_NAME}/PIRL/parameter_tuner/CMakeLists.txt

# Or use sed to update automatically
sed -i "s|test_project2|${PROJECT_NAME}|g" /opt/agrs/Projects/${PROJECT_NAME}/PIRL/parameter_tuner/CMakeLists.txt
```

Change this line:
```cmake
set(PROJECT_PIRL_DIR "${CMAKE_SOURCE_DIR}/Projects/test_project2/PIRL")
```

To:
```cmake
set(PROJECT_PIRL_DIR "${CMAKE_SOURCE_DIR}/Projects/${PROJECT_NAME}/PIRL")
```

### 3. Add to Main Build System (30 seconds)

Edit `/opt/agrs/CMakeLists.txt` and add near the end:

```bash
# Open main CMakeLists.txt
nano /opt/agrs/CMakeLists.txt

# Add this line (adjust for your project name)
# PIRL Parameter Tuner for <PROJECT_NAME>
add_subdirectory(Projects/<PROJECT_NAME>/PIRL/parameter_tuner)
```

### 4. Build and Deploy (2 minutes)

```bash
cd /opt/agrs/build
cmake .. -DCMAKE_BUILD_TYPE=Release
make pirl_parameter_tuner -j$(nproc)
```

### 5. Verify Installation (30 seconds)

```bash
cd /opt/agrs/Projects/${PROJECT_NAME}/PIRL

# Check files exist
ls -lh pirl_parameter_tuner
ls -lh pirl_parameters_default.json

# Test executable (should exit with timeout or display error if no X11)
timeout 2 ./pirl_parameter_tuner 2>&1 || echo "✅ Executable is functional"
```

**Expected Output:**
```
-rwxr-xr-x 1 user user 2.3M Nov 10 14:30 pirl_parameter_tuner
-rw-r--r-- 1 user user  12K Nov 10 14:30 pirl_parameters_default.json
✅ Executable is functional
```

---

## Quick Test (Optional)

If you have X11/display available:

```bash
cd /opt/agrs/Projects/${PROJECT_NAME}/PIRL
./pirl_parameter_tuner
```

You should see a Qt dialog with 6 tabs for parameter tuning.

---

## Usage

### Launch Parameter Tuner

```bash
cd /opt/agrs/Projects/${PROJECT_NAME}/PIRL
./pirl_parameter_tuner
```

### Modify Parameters

1. **Tab 1: PPO Rewards** - Adjust progress multipliers, bonuses, penalties
2. **Tab 2: Terrain Multipliers** - Set cost factors for terrain types
3. **Tab 3: Land Cover Costs** - Define costs for each land cover class
4. **Tab 4: Infrastructure Crossings** - Configure crossing costs
5. **Tab 5: Hydraulic Costs** - Set compressor and flow velocity costs
6. **Tab 6: Constraint Thresholds** - Define limits and clearances

### Export Parameters

Click **"Export to JSON"** button to save to `pirl_parameter_overrides.json`.

### Automatic Loading

The training environment automatically loads `pirl_parameter_overrides.json` on startup - no manual steps required!

---

## Troubleshooting

### Issue: "Qt platform plugin could not be initialized"

**Solution:** You're in a headless environment. The executable still works but needs X11 for GUI.

Options:
- Use X11 forwarding: `ssh -X user@host`
- Use VNC/remote desktop
- Use `xvfb-run`: `xvfb-run ./pirl_parameter_tuner`

### Issue: "Permission denied"

**Solution:** Make executable:
```bash
chmod +x pirl_parameter_tuner
```

### Issue: Executable not found after build

**Solution:** Check build directory:
```bash
cd /opt/agrs/build
find . -name "pirl_parameter_tuner" -type f
# Copy manually if needed
cp <found_path> /opt/agrs/Projects/${PROJECT_NAME}/PIRL/
```

### Issue: CMake can't find Qt6

**Solution:** Install Qt6 development libraries:
```bash
# Ubuntu/Debian
sudo apt install qt6-base-dev libqt6widgets6

# Fedora/RHEL
sudo dnf install qt6-qtbase-devel
```

---

## File Locations

After successful setup, you should have:

```
/opt/agrs/Projects/${PROJECT_NAME}/PIRL/
├── pirl_parameter_tuner              ← Executable (2-3 MB)
├── pirl_parameters_default.json      ← Default values (12 KB)
├── pirl_parameter_overrides.json     ← Your custom values (created on first export)
└── parameter_tuner/                  ← Source code
    ├── main.cpp
    ├── PIRLParameterTuningDialog.h
    ├── PIRLParameterTuningDialog.cpp
    ├── CMakeLists.txt
    ├── pirl_parameters_default.json
    └── README.md
```

---

## One-Line Setup (Advanced)

For experienced users, automate the entire setup:

```bash
export PROJECT_NAME="your_project_name" && \
cd /opt/agrs/Projects/${PROJECT_NAME} && \
mkdir -p PIRL/parameter_tuner && \
cp -r /opt/agrs/Projects/test_project2/PIRL/parameter_tuner/* PIRL/parameter_tuner/ && \
sed -i "s|test_project2|${PROJECT_NAME}|g" PIRL/parameter_tuner/CMakeLists.txt && \
echo -e "\n# PIRL Parameter Tuner for ${PROJECT_NAME}\nadd_subdirectory(Projects/${PROJECT_NAME}/PIRL/parameter_tuner)" >> /opt/agrs/CMakeLists.txt && \
cd /opt/agrs/build && \
cmake .. -DCMAKE_BUILD_TYPE=Release && \
make pirl_parameter_tuner -j$(nproc) && \
cd /opt/agrs/Projects/${PROJECT_NAME}/PIRL && \
ls -lh pirl_parameter_tuner pirl_parameters_default.json && \
echo "✅ PIRL Parameter Tuner setup complete!"
```

**Warning:** Use only if you understand each step. Review changes to `/opt/agrs/CMakeLists.txt` afterward.

---

## Next Steps

After setup:

1. ✅ Verify executable works
2. ✅ Review default parameters in `pirl_parameters_default.json`
3. ✅ Launch dialog and familiarize yourself with parameter categories
4. ✅ Export test configuration to verify JSON generation
5. ✅ Run training with custom parameters to test automatic loading

---

## Complete PIRL Environment Setup

**This guide covers parameter tuner only.** For a complete PIRL environment (required for training):

### Additional Steps Required

1. **Create PIRL directory structure** (`outputs/`, `models/`, `logs/`)
2. **Generate `pirl_training_config.yaml`** from template with project data
3. **Enhance `pipeline_specs.json`** with hydraulics section
4. **Copy `pirl_parameters_default.json`** from template

### Full Setup Guides

- **Comprehensive:** `/opt/agrs/docs/Project Instructions/PIRL_ENVIRONMENT_INITIALIZATION.md`
  - Complete initialization guide
  - Configuration file details
  - Troubleshooting
  - ~25-30 minutes total

- **Quick Checklist:** `/opt/agrs/docs/Project Instructions/PIRL_INITIALIZATION_CHECKLIST.md`
  - Step-by-step checklist
  - Copy-paste commands
  - Verification steps
  - ~20-25 minutes total

### Integration with GUI Workflow

The GUI New Project Dialog collects:
- Project name, AOI, CRS
- Start/end coordinates
- Pipeline specifications (diameter, material, pressures)

These are automatically saved to `project_metadata.json` and `pipeline_specs.json`.

The PIRL initialization process **uses these GUI-provided values** to:
- Populate `pirl_training_config.yaml` placeholders
- Convert lat/lon to UTM coordinates
- Extract AOI bounding box
- Configure hydraulics parameters

**See:** `PIRL_ENVIRONMENT_INITIALIZATION.md` Section "What the GUI Provides"

---

## Documentation

**PIRL Environment:**
- **Primary:** `/opt/agrs/docs/Project Instructions/PIRL_ENVIRONMENT_INITIALIZATION.md`
- **Checklist:** `/opt/agrs/docs/Project Instructions/PIRL_INITIALIZATION_CHECKLIST.md`
- **Integration:** `/opt/agrs/docs/Project Instructions/PIRL_STANDARD_INTEGRATION.md`

**Project Structure:**
- **Full Standard:** `/opt/agrs/docs/Project Instructions/PROJECT_STRUCTURE_STANDARD.md`
- **Changes Log:** `/opt/agrs/docs/Project Instructions/CHANGES_SUMMARY_NOV_10_2025.md`

**Parameter Tuner:**
- **Usage Guide:** `/opt/agrs/Projects/${PROJECT_NAME}/PIRL/parameter_tuner/README.md`

**Templates:**
- **Training Config:** `/opt/agrs/templates/pirl_training_config_template.yaml`
- **Hydraulics Defaults:** `/opt/agrs/templates/pipeline_specs_hydraulics_defaults.json`

---

## Support

If you encounter issues:

**Parameter Tuner Issues:**
1. Check troubleshooting section above
2. Review reference implementation: `/opt/agrs/Projects/test_project2/PIRL/`
3. Verify Qt6 installed: `sudo apt install qt6-base-dev libqt6widgets6`

**Full PIRL Environment Issues:**
1. Consult comprehensive guide: `PIRL_ENVIRONMENT_INITIALIZATION.md`
2. Run verification checklist: `PIRL_INITIALIZATION_CHECKLIST.md`
3. Check templates in `/opt/agrs/templates/`

**Training Issues:**
1. Verify all configuration files exist and are valid
2. Check GIS data has been fetched
3. Review training logs in `PIRL/logs/`

---

**Parameter Tuner Setup Time:** ~5 minutes  
**Full PIRL Environment Setup Time:** ~25-30 minutes  
**Difficulty:** ⭐ Easy  
**Mandatory:** ✅ Yes (for all new projects)

**Happy parameter tuning! 🎛️**

