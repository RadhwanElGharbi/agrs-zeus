# Phase 3 Tool Implementation Plan - SAIPEM Pipeline Demo

**Project:** SAIPEM_PIPELINE_DEMO  
**Phase:** Phase 3 - Constraint Layer Development  
**Date:** 2025-10-13  
**Status:** Planning → Implementation

---

## STEP 1: CLEANUP - Remove Premature Pipeline Routing Tools

### Tools to Remove:
1. `pipeline_gather` - Premature, not needed yet
2. `pipeline_constraints` - Premature, not needed yet
3. `pipeline_route` - Premature, not needed yet
4. `pipeline_cost` - Premature, not needed yet

### Files to Modify:
- `/opt/agrs/src/app/Tools.cpp` - Remove CLI registration, handlers, implementations
- `/opt/agrs/include/agrs_zeus/Tools.h` - Remove struct members, function declarations

---

## STEP 2: COMPLETE DEM ANALYSIS TOOLS

### Current Status:
✅ **Implemented:**
- `raster_slope` - Calculate slope (COMPLETE with CLI + handler)
- `tools_terrain_aspect()` - Calculate aspect (function only)
- `tools_terrain_curvature()` - Calculate curvature (function only)
- `tools_raster_threshold()` - Apply threshold (function only)

### Actions Required:
1. ✅ Register `raster_aspect` in CLI
2. ✅ Register `raster_curvature` in CLI
3. ✅ Register `raster_threshold` in CLI
4. ✅ Add handlers for all 3 tools
5. ✅ Test all 4 DEM tools with SAIPEM data

---

## STEP 3: IMPLEMENT ESSENTIAL GEOSPATIAL TOOLS

### Priority Ranking from Perplexity AI:

**CRITICAL (Implement First):**
1. ✅ `raster_calc` - Raster algebra (add, subtract, multiply, divide, weighted sum)
2. ✅ `raster_reclassify` - Value remapping
3. ✅ `raster_boolean` - Boolean overlay (AND, OR, NOT)
4. ✅ `vector_to_raster` - Rasterize vector features
5. ✅ `raster_proximity` - Euclidean distance calculation

**HIGH PRIORITY (Implement Second):**
6. ✅ `vector_buffer` - Buffer zones (fixed/variable distance)
7. ✅ `raster_weighted_overlay` - Multi-criteria evaluation
8. ✅ `vector_intersection` - Line crossing detection
9. ✅ `raster_cost_distance` - Anisotropic cost distance
10. ✅ `raster_extract_by_mask` - Clip raster by polygon

**MEDIUM PRIORITY (Implement Third):**
11. ✅ `raster_zonal_stats` - Statistics by zones
12. ✅ `raster_focal_stats` - Moving window analysis
13. ✅ `raster_hillshade` - Terrain visualization
14. ✅ `raster_tri` - Terrain Ruggedness Index
15. ✅ `raster_to_vector` - Polygonize raster

---

## IMPLEMENTATION SPECIFICATIONS

### Tool Naming Convention:
- Raster tools: `raster_<operation>`
- Vector tools: `vector_<operation>`
- Terrain tools: `terrain_<operation>` (already established)

### Tool Structure (Standard Format):
```cpp
int tools_<category>_<operation>(
    const std::string& input,
    const std::string& output,
    // operation-specific parameters
    bool overwrite
) {
    // 1. Help message check
    // 2. Input validation
    // 3. Output path validation
    // 4. GDAL operation
    // 5. Success/error reporting
    // 6. Metadata JSON creation
    return 0;
}
```

### CLI Registration Pattern:
```cpp
o.cmd<ToolName> = o.cmdTools->add_subcommand("<tool_name>", "Description");
o.cmd<ToolName>->add_option("input", o.<toolName>Input, "Input file")->required();
o.cmd<ToolName>->add_option("output", o.<toolName>Output, "Output file")->required();
// ... additional options
o.cmd<ToolName>->add_flag("--overwrite", o.<toolName>Overwrite, "Overwrite existing");
```

### Handler Pattern:
```cpp
if (o.cmd<ToolName> && o.cmd<ToolName>->parsed()) {
    return tools_<category>_<operation>(o.<toolName>Input, o.<toolName>Output, 
                                        /* params */, o.<toolName>Overwrite);
}
```

---

## TOOL SPECIFICATIONS

### 1. raster_calc - Raster Algebra
**Purpose:** Perform arithmetic operations on rasters  
**GDAL Command:** `gdal_calc.py`  
**Parameters:**
- Input rasters (A, B, C, ...)
- Expression (e.g., "A + B * 2")
- Output raster
- NoData value handling

**Example:**
```bash
zeus tools raster_calc -A slope.tif -B landcover_cost.tif \
  --calc "(A * 0.7) + (B * 0.3)" -o cost_surface.tif
```

### 2. raster_reclassify - Value Remapping
**Purpose:** Remap raster values to new categories  
**GDAL Command:** `gdal_translate` + `gdal_calc.py`  
**Parameters:**
- Input raster
- Reclassification rules (JSON or text file)
- Output raster

**Example:**
```bash
zeus tools raster_reclassify slope.tif -o slope_classes.tif \
  --rules "0-5:1, 5-10:2, 10-20:3, 20-100:4"
```

### 3. raster_boolean - Boolean Overlay
**Purpose:** Combine constraint layers with AND/OR/NOT  
**GDAL Command:** `gdal_calc.py`  
**Parameters:**
- Input rasters (multiple)
- Operation (AND, OR, NOT, XOR)
- Output raster

**Example:**
```bash
zeus tools raster_boolean protected_areas.tif water_bodies.tif \
  --operation OR -o exclusion_zones.tif
```

### 4. vector_to_raster - Rasterize
**Purpose:** Convert vector features to raster  
**GDAL Command:** `gdal_rasterize`  
**Parameters:**
- Input vector
- Attribute to burn (or fixed value)
- Output raster
- Resolution
- Extent (from template or bbox)

**Example:**
```bash
zeus tools vector_to_raster roads.gpkg -o roads_raster.tif \
  --attribute "road_type" --resolution 10 --template dem.tif
```

### 5. raster_proximity - Euclidean Distance
**Purpose:** Calculate distance to nearest feature  
**GDAL Command:** `gdal_proximity.py`  
**Parameters:**
- Input raster (binary or categorical)
- Output raster
- Distance units (pixels or georeferenced)
- Maximum distance

**Example:**
```bash
zeus tools raster_proximity water_bodies.tif -o distance_to_water.tif \
  --max-distance 5000 --units meters
```

### 6. vector_buffer - Buffer Zones
**Purpose:** Create buffer zones around features  
**GDAL Command:** `ogr2ogr` with `-dialect SQLite`  
**Parameters:**
- Input vector
- Buffer distance
- Output vector
- Dissolve option

**Example:**
```bash
zeus tools vector_buffer rivers.gpkg -o river_buffers.gpkg \
  --distance 100 --dissolve
```

### 7. raster_weighted_overlay - Multi-Criteria Evaluation
**Purpose:** Weighted sum of multiple rasters  
**GDAL Command:** `gdal_calc.py`  
**Parameters:**
- Input rasters with weights
- Output raster
- Normalization option

**Example:**
```bash
zeus tools raster_weighted_overlay \
  --inputs "slope.tif:0.3,landcover.tif:0.25,proximity.tif:0.45" \
  -o suitability.tif
```

### 8. vector_intersection - Line Crossing Detection
**Purpose:** Find intersections between features  
**GDAL Command:** `ogr2ogr` with `-dialect SQLite`  
**Parameters:**
- Input vector 1
- Input vector 2
- Output vector
- Intersection type (point, line)

**Example:**
```bash
zeus tools vector_intersection pipeline_route.gpkg roads.gpkg \
  -o crossings.gpkg --type point
```

### 9. raster_cost_distance - Cost Distance Analysis
**Purpose:** Calculate cost-weighted distance  
**GDAL Command:** Custom (GRASS `r.cost` or custom implementation)  
**Parameters:**
- Cost surface raster
- Start points (vector or raster)
- Output cost distance raster
- Anisotropic factors (optional)

**Example:**
```bash
zeus tools raster_cost_distance cost_surface.tif start_points.gpkg \
  -o accumulated_cost.tif --anisotropic slope.tif
```

### 10. raster_extract_by_mask - Clip by Polygon
**Purpose:** Extract raster values within polygon  
**GDAL Command:** `gdalwarp` with `-cutline`  
**Parameters:**
- Input raster
- Mask vector (polygon)
- Output raster
- Crop to extent option

**Example:**
```bash
zeus tools raster_extract_by_mask dem.tif aoi.gpkg -o dem_clipped.tif \
  --crop-to-cutline
```

---

## IMPLEMENTATION ORDER

### Phase 3A: Cleanup & Complete DEM Tools (Day 1)
1. Remove pipeline routing tools
2. Complete DEM tool registration
3. Test all DEM tools

### Phase 3B: Critical Tools (Day 1-2)
1. raster_calc
2. raster_reclassify
3. raster_boolean
4. vector_to_raster
5. raster_proximity

### Phase 3C: High Priority Tools (Day 2-3)
6. vector_buffer
7. raster_weighted_overlay
8. vector_intersection
9. raster_extract_by_mask

### Phase 3D: Medium Priority Tools (Day 3-4)
10. raster_cost_distance
11. raster_zonal_stats
12. raster_focal_stats
13. raster_hillshade
14. raster_tri

### Phase 3E: Validation & Documentation (Day 4-5)
- Test all tools with SAIPEM data
- Generate sample outputs
- Create tool documentation
- Update user guide

---

## SUCCESS CRITERIA

✅ All pipeline routing tools removed  
✅ All 4 DEM tools fully functional  
✅ All 15 essential tools implemented and tested  
✅ Tools follow standard format and naming  
✅ All tools have CLI registration and handlers  
✅ All tools tested with SAIPEM data  
✅ Documentation complete  

---

**Next Action:** Begin Phase 3A - Cleanup & Complete DEM Tools

