# DEM Analysis Tools - User Guide

**Version:** 1.0  
**Date:** October 9, 2025  
**Tools:** `raster_slope`, `raster_aspect`, `raster_curvature`, `raster_threshold`

---

## Overview

The DEM Analysis Tools are a suite of terrain processing utilities for analyzing Digital Elevation Models (DEMs). These tools are essential for pipeline routing, geohazard assessment, and terrain characterization.

### Available Tools

1. **`raster_slope`** - Calculate slope gradient (percentage or degrees)
2. **`raster_aspect`** - Calculate slope direction/orientation (aspect)
3. **`raster_curvature`** - Calculate terrain curvature (profile, planform, or total)
4. **`raster_threshold`** - Apply threshold values to create binary or classified rasters

---

## Tool 1: `raster_slope`

### Purpose
Calculate slope gradient from a DEM. Slope represents the rate of maximum change in elevation and is critical for:
- **Pipeline routing**: Identify areas exceeding maximum allowable slope (e.g., >20%)
- **Erosion risk**: Steep slopes are more prone to erosion
- **Accessibility**: Steep terrain limits construction access

### Syntax
```bash
zeus tools raster_slope <input_dem> <output_slope> [OPTIONS]
```

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_dem` | string | ✅ Yes | Input DEM raster path (GeoTIFF, COG) |
| `output_slope` | string | ✅ Yes | Output slope raster path |
| `--percent` | flag | No | Output as percentage (default: true) |
| `--compute-edges` | flag | No | Compute values at raster edges |
| `--algorithm` | string | No | Algorithm: `Horn` (default) or `ZevenbergenThorne` |
| `--overwrite` | flag | No | Overwrite existing output |

### Output
- **Format**: Float32 COG (Cloud Optimized GeoTIFF)
- **Units**: Percentage (with `--percent`) or degrees (without)
- **Range**: 
  - Percentage: 0% (flat) to 100%+ (vertical/overhanging)
  - Degrees: 0° (flat) to 90° (vertical)
- **Metadata**: JSON sidecar (`.json`) with processing details

### Algorithms

#### **Horn's Formula** (default)
- 3x3 kernel using weighted central differences
- More accurate for smooth terrain
- Formula: `slope = arctan(√(dz/dx² + dz/dy²))`

#### **Zevenbergen & Thorne**
- 3x3 kernel optimized for smooth, continuous surfaces
- Better for polynomial-fitted DEMs
- Less sensitive to noise

### Examples

#### Example 1: Calculate slope in percentage (default)
```bash
./build/zeus tools raster_slope \
  dem_tinitaly_10m.tif \
  slope_percent.tif \
  --overwrite
```

**Use Case**: Identify areas exceeding 20% slope for pipeline routing constraints.

#### Example 2: Calculate slope in degrees
```bash
./build/zeus tools raster_slope \
  dem_cop30.tif \
  slope_degrees.tif
```
*Note: Omit `--percent` flag to output in degrees*

#### Example 3: Use alternative algorithm
```bash
./build/zeus tools raster_slope \
  dem_smooth.tif \
  slope_zt.tif \
  --algorithm ZevenbergenThorne \
  --compute-edges
```

**Use Case**: Process smoothed DEM with edge computation for complete coverage.

### Pipeline Routing Application

**SAIPEM Criterion 2**: Minimize steep slopes (max 20% gradient)

```bash
# Step 1: Calculate slope percentage
./build/zeus tools raster_slope \
  /opt/agrs/docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  /opt/agrs/docs/DEMO-SAIPEM/Output/slope_percent.tif \
  --overwrite

# Step 2: Create binary constraint (slope > 20% = forbidden)
./build/zeus tools raster_threshold \
  /opt/agrs/docs/DEMO-SAIPEM/Output/slope_percent.tif \
  /opt/agrs/docs/DEMO-SAIPEM/Output/slope_constraint.tif \
  --threshold 20.0 \
  --above 255 \
  --below 1 \
  --overwrite
```

**Result**: Constraint raster where 255 = no-go (slope > 20%), 1 = allowed

### Interpretation Guide

| Slope (%) | Slope (°) | Terrain | Pipeline Impact |
|-----------|-----------|---------|-----------------|
| 0-5% | 0-3° | Flat to gentle | ✅ Ideal for routing |
| 5-10% | 3-6° | Gentle to moderate | ✅ Acceptable |
| 10-20% | 6-11° | Moderate to steep | ⚠️ Manageable with care |
| 20-30% | 11-17° | Steep | ❌ Challenging, avoid if possible |
| >30% | >17° | Very steep | ❌ High risk, typically forbidden |

---

## Tool 2: `raster_aspect`

### Purpose
Calculate aspect (slope direction/orientation) from a DEM. Aspect indicates the compass direction that a slope faces and is used for:
- **Side-slope avoidance** (SAIPEM Criterion 8): Avoid routing perpendicular to contours
- **Solar exposure analysis**: North vs south-facing slopes
- **Wind exposure**: Aspect affects wind loading on infrastructure

### Syntax
```bash
zeus tools raster_aspect <input_dem> <output_aspect> [OPTIONS]
```

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_dem` | string | ✅ Yes | Input DEM raster path |
| `output_aspect` | string | ✅ Yes | Output aspect raster path |
| `--zero-for-flat` | flag | No | Output 0 for flat areas (default: -9999) |
| `--overwrite` | flag | No | Overwrite existing output |

### Output
- **Format**: Float32 COG
- **Units**: Degrees (0-360)
- **Orientation**: 0° = North, 90° = East, 180° = South, 270° = West
- **Flat areas**: -9999 (nodata) or 0 (with `--zero-for-flat`)

### Examples

#### Example 1: Calculate aspect (standard)
```bash
./build/zeus tools raster_aspect \
  dem_tinitaly_10m.tif \
  aspect_degrees.tif \
  --overwrite
```

#### Example 2: Use zero for flat areas
```bash
./build/zeus tools raster_aspect \
  dem_cop30.tif \
  aspect_zero.tif \
  --zero-for-flat
```

**Use Case**: Simpler analysis where flat areas should be explicitly 0° rather than nodata.

### Pipeline Routing Application

**SAIPEM Criterion 8**: Avoid side slopes (routing across hillsides)

```bash
# Calculate aspect to identify slope direction
./build/zeus tools raster_aspect \
  /opt/agrs/docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  /opt/agrs/docs/DEMO-SAIPEM/Output/aspect_degrees.tif \
  --overwrite
```

**Analysis**:
- Compare route direction to aspect
- High penalty if route crosses perpendicular to aspect (side-slope condition)
- Prefer routing parallel to or along aspect direction

### Interpretation Guide

| Aspect (°) | Direction | Characteristics |
|------------|-----------|-----------------|
| 0° or 360° | North | Cold, shaded (Northern Hemisphere) |
| 45° | Northeast | Morning sun |
| 90° | East | Morning sun, moderate exposure |
| 135° | Southeast | Best solar exposure |
| 180° | South | Maximum solar, warm, dry |
| 225° | Southwest | Hot, afternoon sun |
| 270° | West | Afternoon sun, hot |
| 315° | Northwest | Evening sun |
| -9999 | Flat | No directional slope |

### Combined Slope + Aspect Analysis

Detect problematic side-slopes:

```python
# Pseudo-code for side-slope detection
side_slope_risk = (slope > 15%) AND (abs(route_direction - aspect) > 60°)
```

---

## Tool 3: `raster_curvature`

### Purpose
Calculate terrain curvature from a DEM. Curvature measures the rate of change of slope and identifies:
- **Ridges** (positive curvature): Convex terrain, crests
- **Valleys** (negative curvature): Concave terrain, channels
- **Planar surfaces** (zero curvature): Uniform slopes

### Syntax
```bash
zeus tools raster_curvature <input_dem> <output_curvature> [OPTIONS]
```

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_dem` | string | ✅ Yes | Input DEM raster path |
| `output_curvature` | string | ✅ Yes | Output curvature raster path |
| `--type` | string | No | Curvature type: `profile` (default), `planform`, `total` |
| `--overwrite` | flag | No | Overwrite existing output |

### Output
- **Format**: Float32 COG
- **Units**: 1/meters (inverse meters)
- **Range**: -∞ to +∞ (typically -0.1 to +0.1 for natural terrain)
- **Interpretation**:
  - **Positive**: Convex (ridges, crests)
  - **Negative**: Concave (valleys, channels)
  - **Zero**: Flat or planar slopes

### Curvature Types

#### **Profile Curvature** (default)
- Curvature **in the direction of maximum slope**
- Indicates convergence/divergence along flow lines
- **Positive**: Convex slope (decelerating flow, deposition zones)
- **Negative**: Concave slope (accelerating flow, erosion zones)
- **Use**: Erosion risk, runoff modeling

#### **Planform Curvature**
- Curvature **perpendicular to maximum slope**
- Indicates lateral convergence/divergence
- **Positive**: Diverging flow (ridges, noses)
- **Negative**: Converging flow (valleys, channels)
- **Use**: Channel network delineation, drainage patterns

#### **Total Curvature** (Mean Curvature)
- Overall terrain curvature (average of profile + planform)
- General measure of terrain roughness
- **Use**: Terrain complexity assessment

### Examples

#### Example 1: Profile curvature (default)
```bash
./build/zeus tools raster_curvature \
  dem_tinitaly_10m.tif \
  curvature_profile.tif \
  --overwrite
```

#### Example 2: Planform curvature
```bash
./build/zeus tools raster_curvature \
  dem_tinitaly_10m.tif \
  curvature_planform.tif \
  --type planform \
  --overwrite
```

#### Example 3: Total curvature
```bash
./build/zeus tools raster_curvature \
  dem_cop30.tif \
  curvature_total.tif \
  --type total
```

### Pipeline Routing Application

**Use Case**: Identify unstable terrain and erosion-prone areas

```bash
# Calculate profile curvature to identify erosion risk
./build/zeus tools raster_curvature \
  /opt/agrs/docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  /opt/agrs/docs/DEMO-SAIPEM/Output/curvature_profile.tif \
  --type profile \
  --overwrite
```

**Interpretation**:
- **Highly negative profile curvature** (< -0.05): Concave slopes prone to erosion and runoff concentration
- **Highly positive profile curvature** (> 0.05): Convex ridges, potentially unstable
- **Near-zero curvature** (-0.01 to 0.01): Stable, planar slopes (preferred for routing)

### Interpretation Guide

| Profile Curvature | Landform | Erosion Risk | Routing |
|-------------------|----------|--------------|---------|
| < -0.05 | Deep valley/gully | High (concentrated flow) | ⚠️ Avoid |
| -0.05 to -0.01 | Gentle concave | Moderate | ✅ Acceptable |
| -0.01 to 0.01 | Planar slope | Low | ✅ Ideal |
| 0.01 to 0.05 | Gentle convex | Moderate | ✅ Acceptable |
| > 0.05 | Sharp ridge | Moderate (instability) | ⚠️ Caution |

---

## Tool 4: `raster_threshold`

### Purpose
Apply threshold values to a raster to create binary or classified outputs. Essential for converting continuous data (slope, elevation) into discrete constraints (allowed/forbidden zones).

### Syntax
```bash
zeus tools raster_threshold <input_raster> <output_raster> [OPTIONS]
```

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `input_raster` | string | ✅ Yes | Input raster path |
| `output_raster` | string | ✅ Yes | Output raster path |
| `--threshold` | float | No | Threshold value (default: 0.0) |
| `--above` | float | No | Value for pixels above threshold (default: 255) |
| `--below` | float | No | Value for pixels below threshold (default: 0) |
| `--invert` | flag | No | Invert threshold logic |
| `--overwrite` | flag | No | Overwrite existing output |

### Output
- **Format**: Float32 COG
- **Values**: User-defined (default: 255 for above, 0 for below)

### Examples

#### Example 1: Create slope constraint (slope > 20% = forbidden)
```bash
./build/zeus tools raster_threshold \
  slope_percent.tif \
  slope_constraint.tif \
  --threshold 20.0 \
  --above 255 \
  --below 1 \
  --overwrite
```

**Result**: 255 = forbidden (slope > 20%), 1 = allowed (slope ≤ 20%)

#### Example 2: Identify high-elevation areas (elevation > 1000m)
```bash
./build/zeus tools raster_threshold \
  dem_tinitaly_10m.tif \
  high_elevation.tif \
  --threshold 1000.0 \
  --above 1 \
  --below 0
```

**Result**: 1 = above 1000m, 0 = below 1000m

#### Example 3: Inverted threshold (flag low values)
```bash
./build/zeus tools raster_threshold \
  slope_percent.tif \
  flat_areas.tif \
  --threshold 5.0 \
  --above 0 \
  --below 1 \
  --invert
```

**Result**: 1 = slope < 5% (flat), 0 = slope ≥ 5%

### Pipeline Routing Application

**Multi-Constraint Creation Workflow**:

```bash
# Constraint 1: Slope > 20% = forbidden
./build/zeus tools raster_threshold \
  slope_percent.tif \
  constraint_slope.tif \
  --threshold 20.0 \
  --above 255 \
  --below 1

# Constraint 2: Elevation > 1200m = high cost (snow/access issues)
./build/zeus tools raster_threshold \
  dem_tinitaly_10m.tif \
  constraint_elevation.tif \
  --threshold 1200.0 \
  --above 50 \
  --below 1

# Constraint 3: High curvature = unstable (|curvature| > 0.05)
./build/zeus tools raster_threshold \
  curvature_profile.tif \
  constraint_curvature.tif \
  --threshold 0.05 \
  --above 50 \
  --below 1
```

**Combine constraints** using raster calculator (future tool: `raster_calc`)

---

## Complete Workflow Example: SAIPEM Pipeline Routing

### Objective
Analyze terrain constraints for a 62km natural gas pipeline in central Italy.

### Data
- **DEM**: TINITALY 10m (`/opt/agrs/docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif`)
- **AOI**: SAIPEM study area (13.45°E to 13.94°E, 42.86°N to 43.44°N)

### Step-by-Step Analysis

#### Step 1: Calculate Slope (Percentage)
```bash
cd /opt/agrs
./build/zeus tools raster_slope \
  docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  docs/DEMO-SAIPEM/Output/slope_percent.tif \
  --overwrite
```

**Expected Output**:
- Range: 0% to ~60% (mountainous Apennines)
- Typical: 5-15% (rolling hills)
- Critical areas: >20% (SAIPEM constraint)

#### Step 2: Calculate Aspect (Slope Direction)
```bash
./build/zeus tools raster_aspect \
  docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  docs/DEMO-SAIPEM/Output/aspect_degrees.tif \
  --overwrite
```

**Expected Output**:
- Range: 0-360° (compass direction)
- Analysis: Identify side-slope zones for avoidance

#### Step 3: Calculate Profile Curvature
```bash
./build/zeus tools raster_curvature \
  docs/DEMO-SAIPEM/Output/dem_tinitaly_10m.tif \
  docs/DEMO-SAIPEM/Output/curvature_profile.tif \
  --type profile \
  --overwrite
```

**Expected Output**:
- Range: -0.1 to +0.1 (typical terrain)
- Negative: Valleys, erosion risk
- Positive: Ridges, instability risk

#### Step 4: Create Slope Constraint (Binary)
```bash
./build/zeus tools raster_threshold \
  docs/DEMO-SAIPEM/Output/slope_percent.tif \
  docs/DEMO-SAIPEM/Output/constraint_slope_binary.tif \
  --threshold 20.0 \
  --above 255 \
  --below 1 \
  --overwrite
```

**Expected Output**:
- 255 = No-go zones (slope > 20%)
- 1 = Allowed zones (slope ≤ 20%)

#### Step 5: Validate Results
```bash
# Check slope statistics
gdalinfo -stats docs/DEMO-SAIPEM/Output/slope_percent.tif

# Check aspect statistics
gdalinfo -stats docs/DEMO-SAIPEM/Output/aspect_degrees.tif

# Check curvature statistics
gdalinfo -stats docs/DEMO-SAIPEM/Output/curvature_profile.tif

# Check constraint coverage
gdalinfo -stats docs/DEMO-SAIPEM/Output/constraint_slope_binary.tif
```

---

## Technical Notes

### GDAL Dependencies
All tools use GDAL/OGR utilities:
- **`raster_slope`**: `gdaldem slope`
- **`raster_aspect`**: `gdaldem aspect`
- **`raster_curvature`**: Python/NumPy (custom implementation)
- **`raster_threshold`**: `gdal_calc.py`

### Python Requirements (for curvature)
```bash
# Required packages
pip install numpy gdal
```

### Performance Considerations
- **Large DEMs** (>10GB): Process may take 10-30 minutes
- **COG Output**: Cloud Optimized GeoTIFF for faster access
- **Compression**: DEFLATE with PREDICTOR=2 for optimal size
- **Multi-threading**: NUM_THREADS=ALL_CPUS enabled

### Output Format
All tools output **Float32 COG** with:
- **Compression**: DEFLATE
- **Predictor**: 2 (horizontal differencing for better compression)
- **Tiling**: Optimized for cloud access
- **Metadata**: JSON sidecar with processing details

---

## Troubleshooting

### Issue: "Input DEM not found"
**Solution**: Check file path, use absolute paths if needed:
```bash
realpath dem_tinitaly_10m.tif
```

### Issue: "Output file exists"
**Solution**: Add `--overwrite` flag to replace existing output

### Issue: Curvature fails with "ImportError: No module named gdal"
**Solution**: Install GDAL Python bindings:
```bash
pip3 install gdal numpy
```

### Issue: Slope values seem incorrect
**Solution**: 
- Check if DEM units are meters (not feet or degrees)
- Verify DEM coordinate system is projected (not geographic lat/lon)
- For geographic DEMs, reproject to UTM first:
  ```bash
  gdalwarp -t_srs EPSG:32633 dem_wgs84.tif dem_utm33n.tif
  ```

### Issue: Curvature produces extreme values
**Solution**:
- Smooth DEM first using focal statistics
- Check for NoData pixels causing artifacts
- Validate DEM resolution (too coarse = unreliable curvature)

---

## References

1. **Horn, B.K.P. (1981)**: "Hill shading and the reflectance map", *Proceedings of the IEEE*, 69(1):14-47
2. **Zevenbergen, L.W. and Thorne, C.R. (1987)**: "Quantitative analysis of land surface topography", *Earth Surface Processes and Landforms*, 12:47-56
3. **Wilson, J.P. and Gallant, J.C. (2000)**: *Terrain Analysis: Principles and Applications*, Wiley
4. **GDAL Documentation**: https://gdal.org/programs/gdaldem.html

---

**Document Status:** Complete  
**Version:** 1.0  
**Last Updated:** October 9, 2025  
**Author:** AGRS ZEUS Development Team




