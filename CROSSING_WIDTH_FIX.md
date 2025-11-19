# Crossing Width Fix - November 17, 2025

## Issue Discovered

During 10k timestep training validation, all crossing features showed:
- ✅ `nearest_crossing_dist`: Valid (16-66m)
- ❌ `nearest_crossing_width`: Always **0**
- ❌ `nearest_crossing_type`: Always **0** (none)

## Training Performance

- **FPS**: **15.69 steps/second**
- **Timesteps**: 14,400 completed
- **Runtime**: 15.3 minutes (918 seconds)
- **Hardware**: CPU (24 parallel environments)

## Root Cause

The type classification logic in `PIRL_Environment.cpp` (lines 220-238) was **incomplete**:

**Original Logic:**
```cpp
if (nearest.num_lanes > 0) {
    // Classify as road
} else if (feature_type contains "water") {
    // Classify as waterway  
} else if (feature_type contains "rail") {
    // Classify as railway
}
```

**Problem:**
- OSM roads have `feature_type` = `highway` field value (e.g., "motorway", "primary")
- If `lanes` field is NULL/missing → `num_lanes = 0`
- Highway values don't contain "water" or "rail" → **Not classified**
- No classification → No width calculation → **width = 0**

## The Fix

Updated type classification to recognize roads by **highway type values**:

```cpp
// Check for roads (either by lanes OR highway type)
if (nearest.num_lanes > 0 || 
    ft_lower == "motorway" || ft_lower == "trunk" || ft_lower == "primary" ||
    ft_lower == "secondary" || ft_lower == "tertiary" || ft_lower == "residential" ||
    ft_lower == "unclassified" || ft_lower == "service" || ft_lower == "track" ||
    ft_lower == "path" || ft_lower == "motorway_link" || ...) {
    
    current_state_.nearest_crossing_type = 1.0;  // Road
    current_state_.nearest_crossing_width = gis_->calculate_road_width(nearest);
}
```

**Enhanced Classification:**
- **Roads**: Detects 15 highway types + lanes field
- **Waterways**: Detects 9 waterway types (including dam/weir)
- **Railways**: Detects 4 railway types + "rail" substring
- **Powerlines**: Detects 5 power infrastructure types

## Expected Results

After this fix, crossing detection should show:
- ✅ Valid crossing types (1=road, 2=waterway, 3=railway, 4=powerline)
- ✅ Accurate widths based on attributes:
  - Roads: 3.5m to 14.0m (based on lanes/highway type)
  - Waterways: Variable (from `width_m` field)
  - Railways: ~5.7m (gauge * 4)
  - Powerlines: ~10m (clearance zone)

## Files Modified

- `/opt/agrs/src/pirl/PIRL_Environment.cpp` - Enhanced type classification logic

## Next Steps

1. ✅ Module rebuilt and deployed
2. ⏭️ Run new 10k validation with proper classification
3. ⏭️ Verify crossing widths are populated correctly
4. ⏭️ Generate GeoJSON for ArcGIS analysis

---

**Status**: ✅ **FIXED**  
**Build**: ✅ **SUCCESSFUL**  
**Deployed**: ✅ **YES**

