# AOI Coordinate Reference System (CRS) Fix

## Problem Identified

The PIRL training was failing immediately with `OUT_OF_BOUNDS` termination on every episode because of a **CRS mismatch**:

- **Original AOI**: `aoi.kmz` in WGS84 Geographic (EPSG:4326) - lat/lon degrees
- **Agent Coordinates**: UTM Zone 13N (EPSG:32613) - meters X/Y
- **Bug**: C++ code was checking if UTM coordinates (e.g., `484838 meters`) were inside lat/lon polygon (e.g., `-105°` to `-105°`)

This caused every boundary check to fail immediately.

## Solution Applied

**Reprojected AOI to match project CRS (UTM Zone 13N - EPSG:32613)**

### Files Changed:
- **Original**: `aoi.kmz` → backed up as `aoi_wgs84_backup.kmz`
- **New**: `aoi.gpkg` (UTM Zone 13N projection)

### AOI Bounds (UTM meters):
- X: 480,194.86 to 484,924.86 (4.73 km wide)
- Y: 4,926,712.40 to 4,933,311.94 (6.60 km tall)

### Verification:
- ✅ Start point (484838.28, 4933184.19) is **INSIDE** AOI
- ✅ End point (480622.89, 4927166.70) is **INSIDE** AOI
- ✅ Agent successfully took 10+ steps without OUT_OF_BOUNDS termination
- ✅ Training can now proceed normally

## Key Takeaway

**All geospatial data in a PIRL project MUST use the same CRS as specified in `project_metadata.json`.**

For US_PIPELINE:
- **Project CRS**: EPSG:32613 (WGS 84 / UTM Zone 13N)
- **All data**: DEM, AOI, Land Cover, etc. must be in EPSG:32613

## Date Fixed
2025-11-21
