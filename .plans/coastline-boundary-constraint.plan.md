# Coastline Boundary Constraint - General PIRL Feature (Updated with Dataset Research)

## Overview

Add coastline boundary support to PIRL as a general-purpose feature for coastal pipeline projects. The coastline will be treated as a hard constraint (similar to AOI), preventing the agent from routing into the sea while allowing necessary river/stream crossings. Implementation includes multi-source dataset support with region-specific recommendations based on comprehensive research.

## Problem Statement

Current PIRL implementation allows routing through offshore waters when water land cover costs are lower than difficult terrain alternatives. For coastal projects (Italy, Canada LNG terminals, Middle East export facilities, etc.), this produces unrealistic routes that go offshore to avoid terrain obstacles.

**Root Cause:**
- No distinction between inland water (rivers, lakes) and offshore water (seas, oceans)
- Water land cover raster (ESA WorldCover class 80) treats all water identically
- No coastline boundary data integrated into constraint system

## Solution: Generalized Coastline Boundary with Multi-Source Support

Treat coastline as an **optional hard boundary** similar to AOI:
- **If coastline data present:** Enforce as hard constraint (cannot cross)
- **If coastline data absent:** Fallback to existing behavior (water cost-based)
- **Reuses proven code:** Leverages existing AOI boundary checking logic
- **Globally applicable:** Works for any coastal project with coastline data
- **Multi-source support:** Automatic source selection based on project region

## Coastline Dataset Strategy (Based on Research)

### Recommended Sources (by priority)

1. **EEA Coastline** (Europe) - ⭐ **BEST for test_project2**
   - Accuracy: ±5-10m, Resolution: 10-50m
   - Coverage: All EU + neighbors
   - Download: https://www.eea.europa.eu/data-and-maps/data/eea-coastline-for-analysis-2

2. **GSHHG** (Global)
   - Accuracy: ±100m, Resolution: 100m (full resolution)
   - Coverage: Worldwide
   - Download: https://www.ngdc.noaa.gov/mgg/shorelines/

3. **NOAA** (USA)
   - Accuracy: ±10-50m, Resolution: 1:80,000 scale
   - Coverage: USA only
   - Download: https://www.ngdc.noaa.gov/mgg/shorelines/data/noaa/

4. **OpenStreetMap** (Global)
   - Accuracy: ±10-50m (variable), Resolution: 1-100m
   - Coverage: Worldwide, real-time updates
   - API: Overpass API (programmatic access)

### Region-Specific Selection Logic

```python
if project_region == 'Europe':
    primary_source = 'EEA'      # ±5-10m accuracy
    fallback = 'OSM'
elif project_region == 'USA':
    primary_source = 'NOAA'     # Nautical chart quality
    fallback = 'OSM'
else:
    primary_source = 'GSHHG'    # Global coverage
    fallback = 'OSM'
```

## Implementation Steps

### 1. Create Multi-Source Coastline Fetch Script

**File:** `scripts/fetch_coastline.py`

Enhanced to support EEA, GSHHG, NOAA, and OSM:

```python
#!/usr/bin/env python3
"""
Fetch coastline data from multiple sources for PIRL projects
Supports: EEA, GSHHG, NOAA, OSM with automatic source selection
"""

import argparse
import requests
import json
import sys
from pathlib import Path

SOURCES = {
    'eea': {
        'name': 'European Environment Agency',
        'coverage': 'Europe',
        'accuracy': '±5-10m',
        'url': 'https://www.eea.europa.eu/data-and-maps/data/eea-coastline-for-analysis-2'
    },
    'gshhg': {
        'name': 'GSHHG (Global Shoreline)',
        'coverage': 'Worldwide',
        'accuracy': '±100m',
        'url': 'https://www.ngdc.noaa.gov/mgg/shorelines/'
    },
    'noaa': {
        'name': 'NOAA Digital Vector Shoreline',
        'coverage': 'USA',
        'accuracy': '±10-50m',
        'url': 'https://www.ngdc.noaa.gov/mgg/shorelines/data/noaa/'
    },
    'osm': {
        'name': 'OpenStreetMap',
        'coverage': 'Worldwide',
        'accuracy': '±10-50m (variable)',
        'api': 'Overpass API'
    }
}

def auto_select_source(bbox):
    """
    Automatically select best coastline source based on bbox location
    
    Args:
        bbox: (min_lon, min_lat, max_lon, max_lat)
    
    Returns:
        str: Recommended source ('eea', 'gshhg', 'noaa', or 'osm')
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    
    # Europe bbox check (roughly -10W to 40E, 35N to 71N)
    if -10 <= min_lon <= 40 and 35 <= min_lat <= 71:
        print(f"📍 Location: Europe → Recommending EEA (±5-10m accuracy)")
        return 'eea'
    
    # USA bbox check (roughly -125W to -67W, 25N to 49N)
    if -125 <= min_lon <= -67 and 25 <= min_lat <= 49:
        print(f"📍 Location: USA → Recommending NOAA (nautical chart quality)")
        return 'noaa'
    
    # Global fallback
    print(f"📍 Location: Global → Recommending GSHHG (worldwide coverage)")
    return 'gshhg'


def fetch_osm_coastline(bbox, output_path):
    """Fetch coastline from OpenStreetMap using Overpass API"""
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    query = f"""
    [out:json][timeout:60];
    (
      way["natural"="coastline"]({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
    );
    out geom;
    """
    
    print(f"🌐 Fetching OSM coastline for bbox: {bbox}")
    response = requests.post(overpass_url, data={"data": query}, timeout=120)
    
    if response.status_code == 200:
        osm_data = response.json()
        features = []
        
        for element in osm_data.get("elements", []):
            if element["type"] == "way":
                coords = [[node["lon"], node["lat"]] for node in element.get("geometry", [])]
                if len(coords) >= 2:  # Valid linestring
                    features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": coords
                        },
                        "properties": {
                            "osm_id": element["id"],
                            "source": "OpenStreetMap",
                            "natural": "coastline",
                            "accuracy": "±10-50m (variable)"
                        }
                    })
        
        geojson = {
            "type": "FeatureCollection",
            "features": features,
            "crs": {
                "type": "name",
                "properties": {"name": "EPSG:4326"}
            },
            "metadata": {
                "source": "OpenStreetMap Overpass API",
                "query_bbox": bbox,
                "feature_count": len(features),
                "download_date": "2025-11-01",
                "license": "ODbL 1.0"
            }
        }
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
        
        print(f"✅ Fetched {len(features)} coastline segments from OSM")
        print(f"📁 Saved to: {output_path}")
        return True
    else:
        print(f"❌ Failed to fetch from OSM: HTTP {response.status_code}")
        return False


def fetch_eea_coastline(output_path):
    """Provide instructions for EEA manual download"""
    print("\n" + "="*80)
    print("📥 EEA COASTLINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n⭐ RECOMMENDED for European projects (±5-10m accuracy)\n")
    print("Steps:")
    print("1. Visit: https://www.eea.europa.eu/data-and-maps/data/eea-coastline-for-analysis-2")
    print("2. Click 'Download' button")
    print("3. Select 'EEA Coastline Polyline' GeoPackage format")
    print("4. Save to your project directory")
    print(f"5. Clip to your AOI using ogr2ogr:")
    print(f"\n   ogr2ogr -clipsrc <minx> <miny> <maxx> <maxy> \\")
    print(f"           {output_path} \\")
    print(f"           /path/to/eea_coastline.gpkg\n")
    print("Format: GeoPackage, Shapefile, or GML")
    print("CRS: ETRS89 / LAEA Europe (EPSG:3035) - requires reprojection to project CRS")
    print("="*80 + "\n")
    return False  # Manual download required


def fetch_gshhg_coastline(bbox, resolution, output_path):
    """Provide instructions for GSHHG download"""
    print("\n" + "="*80)
    print("📥 GSHHG COASTLINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n🌍 GLOBAL coverage (±100m accuracy at 'full' resolution)\n")
    print("Steps:")
    print("1. Download GSHHG shapefiles:")
    print("   Primary: https://www.ngdc.noaa.gov/mgg/shorelines/")
    print("   Mirror: https://www.soest.hawaii.edu/pwessel/gshhg/")
    print(f"2. Select resolution: {resolution} (crude/low/intermediate/high/full)")
    print("3. Extract to local directory")
    print(f"4. Clip to bbox {bbox} using ogr2ogr:")
    print(f"\n   ogr2ogr -clipsrc {bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]} \\")
    print(f"           {output_path} \\")
    print(f"           GSHHS_{resolution[0]}_L1.shp\n")
    print("Hierarchical levels:")
    print("  L1: Land/ocean boundaries (use this for coastline)")
    print("  L2: Lakes")
    print("  L3: Islands within lakes")
    print("  L4: Ponds within islands")
    print("="*80 + "\n")
    return False  # Manual download required


def fetch_noaa_coastline(output_path):
    """Provide instructions for NOAA download"""
    print("\n" + "="*80)
    print("📥 NOAA SHORELINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n🇺🇸 USA coverage only (±10-50m nautical chart quality)\n")
    print("Steps:")
    print("1. Visit: https://www.ngdc.noaa.gov/mgg/shorelines/data/noaa/")
    print("2. Select region (e.g., 'Gulf of Mexico', 'East Coast', 'West Coast')")
    print("3. Download shapefile format")
    print(f"4. Clip to your AOI:")
    print(f"\n   ogr2ogr -clipsrc <minx> <miny> <maxx> <maxy> \\")
    print(f"           {output_path} \\")
    print(f"           noaa_shoreline.shp\n")
    print("Resolution: ~1:80,000 scale (medium resolution)")
    print("="*80 + "\n")
    return False  # Manual download required


def create_metadata(output_path, source, bbox, feature_count):
    """Create metadata JSON for coastline dataset"""
    metadata_path = Path(output_path).with_suffix('.json')
    
    metadata = {
        "dataset_name": "coastline",
        "source": SOURCES[source],
        "query_bbox": {
            "min_lon": bbox[0],
            "min_lat": bbox[1],
            "max_lon": bbox[2],
            "max_lat": bbox[3]
        },
        "geometry_type": "LineString",
        "feature_count": feature_count,
        "crs": "EPSG:4326",
        "description": "Coastline boundary for offshore routing constraint in PIRL"
    }
    
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📝 Created metadata: {metadata_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Fetch coastline data for PIRL projects',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-select source based on location
  python fetch_coastline.py --bbox 13.5,42.9,14.0,43.4 --output coastline.geojson

  # Explicitly use OSM (fastest, programmatic)
  python fetch_coastline.py --source osm --bbox 13.5,42.9,14.0,43.4 --output coastline.geojson

  # Get EEA instructions (best for Europe)
  python fetch_coastline.py --source eea --bbox 13.5,42.9,14.0,43.4 --output coastline.gpkg

  # Get GSHHG instructions (global)
  python fetch_coastline.py --source gshhg --bbox -10,30,40,60 --output coastline.shp
        """
    )
    
    parser.add_argument('--source', 
                       choices=['auto', 'eea', 'gshhg', 'noaa', 'osm'],
                       default='auto',
                       help='Coastline data source (default: auto-select based on location)')
    
    parser.add_argument('--bbox', 
                       required=True,
                       help='Bounding box: min_lon,min_lat,max_lon,max_lat (e.g., 13.5,42.9,14.0,43.4)')
    
    parser.add_argument('--output', 
                       required=True,
                       help='Output file path (e.g., data/vectors/raw/coastline_raw.geojson)')
    
    parser.add_argument('--resolution',
                       choices=['crude', 'low', 'intermediate', 'high', 'full'],
                       default='full',
                       help='GSHHG resolution level (only applicable for GSHHG source)')
    
    args = parser.parse_args()
    
    # Parse bbox
    try:
        bbox = tuple(map(float, args.bbox.split(',')))
        if len(bbox) != 4:
            raise ValueError("Bbox must have 4 values")
    except:
        print(f"❌ Invalid bbox format. Use: min_lon,min_lat,max_lon,max_lat")
        sys.exit(1)
    
    # Auto-select source if requested
    source = args.source
    if source == 'auto':
        source = auto_select_source(bbox)
        print(f"💡 Auto-selected source: {source.upper()}")
        print(f"    Override with: --source <eea|gshhg|noaa|osm>\n")
    
    # Fetch coastline
    if source == 'osm':
        success = fetch_osm_coastline(bbox, args.output)
        if success:
            # Count features for metadata
            with open(args.output) as f:
                data = json.load(f)
                create_metadata(args.output, source, bbox, len(data['features']))
    
    elif source == 'eea':
        fetch_eea_coastline(args.output)
    
    elif source == 'gshhg':
        fetch_gshhg_coastline(bbox, args.resolution, args.output)
    
    elif source == 'noaa':
        fetch_noaa_coastline(args.output)
    
    print("\n✅ Next steps:")
    print("1. Reproject to project CRS (e.g., EPSG:32633 for Italy):")
    print(f"   ogr2ogr -t_srs EPSG:<your_crs> \\")
    print(f"           data/vectors/processed/coastline_epsg<crs>_processed.gpkg \\")
    print(f"           {args.output}")
    print("\n2. Enable coastline constraint in training config:")
    print("   coastline:")
    print("     enabled: true")
    print("     enforce_as_boundary: true")
```

### 2. Update GISDataManager to Load Coastline

**File:** `include/agrs_zeus/PIRL.h`

Add coastline members and methods:

```cpp
class GISDataManager {
private:
    // ... existing members ...
    std::unique_ptr<OGRGeometry> coastline_geom_;  // NEW: Coastline boundary

public:
    // ... existing methods ...
    
    // NEW: Coastline constraint methods
    bool is_beyond_coastline(double x, double y) const;
    bool has_coastline() const { return coastline_geom_ != nullptr; }
};
```

**File:** `src/pirl/PIRL.cpp`

Add coastline loading (after AOI loading ~line 197):

```cpp
// Load coastline boundary (optional - for coastal projects)
// Try multiple standard paths
std::string coastline_path = project_dir_ + "/data/vectors/coastline.gpkg";
if (!fs::exists(coastline_path)) {
    coastline_path = project_dir_ + "/data/vectors/coastline.shp";
}
if (!fs::exists(coastline_path)) {
    coastline_path = project_dir_ + "/data/vectors/processed/coastline_epsg" + 
                     std::to_string(crs_epsg_) + "_processed.gpkg";
}

if (fs::exists(coastline_path)) {
    GDALDataset* coast_ds = static_cast<GDALDataset*>(
        GDALOpenEx(coastline_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr));
    if (coast_ds && coast_ds->GetLayerCount() > 0) {
        OGRLayer* layer = coast_ds->GetLayer(0);
        OGRGeometryCollection* collection = new OGRGeometryCollection();
        OGRFeature* feature;
        int count = 0;
        while ((feature = layer->GetNextFeature()) != nullptr) {
            OGRGeometry* geom = feature->GetGeometryRef();
            if (geom) {
                collection->addGeometry(geom);
                count++;
            }
            OGRFeature::DestroyFeature(feature);
        }
        if (count > 0) {
            coastline_geom_.reset(collection);
            std::cout << "    ✅ Coastline boundary loaded (" << count << " segments)" << std::endl;
        } else {
            delete collection;
        }
        GDALClose(coast_ds);
    }
} else {
    std::cout << "    ℹ️  No coastline data (offshore routing not constrained)" << std::endl;
}
```

Implement coastline checking (after `is_within_aoi()` ~line 704):

```cpp
bool GISDataManager::is_beyond_coastline(double x, double y) const {
    if (!coastline_geom_) {
        // No coastline loaded - allow all positions
        return false;
    }
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (coastline_geom_->getSpatialReference()) {
        point.assignSpatialReference(coastline_geom_->getSpatialReference());
    }
    
    // Check if point is on the ocean side of the coastline
    // Strategy: if land cover is water (class 80) AND far from any coastline segment,
    // then it's offshore
    
    int land_cover = get_land_cover_class(x, y);
    if (land_cover != 80) {
        // Not water land cover, definitely not offshore
        return false;
    }
    
    // Check distance to nearest coastline segment
    double min_distance = std::numeric_limits<double>::max();
    
    for (int i = 0; i < coastline_geom_->getNumGeometries(); i++) {
        OGRGeometry* segment = coastline_geom_->getGeometryRef(i);
        if (segment) {
            double dist = point.Distance(segment);
            min_distance = std::min(min_distance, dist);
        }
    }
    
    // If water land cover and >200m from coastline, consider it offshore
    // Threshold prevents false positives from small bays/inlets
    const double OFFSHORE_THRESHOLD = 200.0;  // meters
    return (min_distance > OFFSHORE_THRESHOLD);
}
```

### 3. Add Coastline Constraint to Environment

**File:** `src/pirl/PIRL_Environment.cpp`

Add offshore penalty in `calculate_reward()` (after out-of-bounds check ~line 280):

```cpp
// Coastline boundary constraint (NEW - prevents offshore routing)
if (gis_->has_coastline() && gis_->is_beyond_coastline(new_state.x, new_state.y)) {
    double offshore_penalty = -1000.0;  // Massive penalty (same as going out of bounds)
    info.constraint_penalty += offshore_penalty;
    info.total_reward += offshore_penalty;
}
```

Add gradual termination in `check_termination()` (~line 320):

```cpp
// Check coastline boundary (if present)
if (gis_->has_coastline() && gis_->is_beyond_coastline(state.x, state.y)) {
    offshore_steps_++;
    if (state.goal_distance < 500.0) {
        if (offshore_steps_ > 10) {
            reason = "FAILURE: Too far offshore near goal";
            return true;
        }
    }
    else if (offshore_steps_ > 3) {
        reason = "FAILURE: Offshore routing attempt";
        return true;
    }
} else {
    offshore_steps_ = 0;
}
```

**File:** `include/agrs_zeus/PIRL.h`

Add tracking variable:

```cpp
class PipelineEnvironment {
private:
    // ... existing members ...
    int offshore_steps_;  // NEW: Track consecutive offshore steps
```

Initialize in `reset()`:

```cpp
State PipelineEnvironment::reset() {
    // ... existing code ...
    offshore_steps_ = 0;
    // ...
}
```

### 4. Update Configuration Schema

**File:** YAML training configs

```yaml
# Optional coastline constraint (for coastal projects)
coastline:
  enabled: true                    # Set false for inland projects
  enforce_as_boundary: true        # Hard constraint (like AOI) vs soft penalty
  offshore_penalty: -1000.0        # Reward penalty for offshore routing
  offshore_threshold_m: 200.0      # Distance from coastline to consider "offshore"
  termination_steps: 3             # Consecutive offshore steps before termination
  
  # Data source priority (region-specific)
  # EEA: Europe (±5-10m accuracy)
  # NOAA: USA (nautical chart quality)
  # GSHHG: Global (±100m accuracy)
  # OSM: Fallback (variable accuracy)
  source_priority: ['eea', 'gshhg', 'osm']
```

### 5. Update Water Cost Model

**File:** `src/pirl/PIRL.cpp`

Update water land cover cost:

```cpp
landcover_costs_[80] = 3500.0;  // Permanent water bodies (UPDATED: realistic offshore cost)
                                 // Note: With coastline constraint, agent won't reach offshore
                                 // This cost now represents inland water body traversal
```

### 6. Create Documentation

**File:** `docs/PIRL/COASTLINE_CONSTRAINT.md`

Comprehensive user guide with:
- Dataset selection guide by region
- Setup instructions for each source
- Usage examples
- Troubleshooting
- Quality assurance checklist

(See full documentation in plan details)

## Files Modified

1. **Core Implementation:**
   - `include/agrs_zeus/PIRL.h` - Add coastline members/methods
   - `src/pirl/PIRL.cpp` - Load coastline, implement checking, update water cost
   - `src/pirl/PIRL_Environment.cpp` - Add coastline constraint to reward/termination

2. **Utilities:**
   - `scripts/fetch_coastline.py` - **NEW:** Multi-source fetch script with auto-selection
   - `docs/PIRL/COASTLINE_CONSTRAINT.md` - **NEW:** User guide
   - `docs/PIRL/COASTLINE_DATASET_SOURCES.md` - **CREATED:** Dataset research

3. **Configuration:**
   - YAML training configs - Add coastline section

## Success Criteria

1. ✅ Multi-source fetch script supports EEA, GSHHG, NOAA, OSM
2. ✅ Auto-selects best source based on project region
3. ✅ Coastline loads successfully from standard paths
4. ✅ Agent cannot cross coastline (offshore penalty triggers)
5. ✅ Route stays inland (water coverage <5%)
6. ✅ Works for any coastal project worldwide
7. ✅ Gracefully degrades without coastline (optional feature)
8. ✅ Minimal performance impact (<0.1ms per step)

## Timeline

- **Fetch script creation:** 2 hours
- **C++ implementation:** 2-3 hours
- **Testing & validation:** 1 hour
- **Documentation:** 1 hour (already completed)
- **test_project2 coastline fetch:** 30 min
- **Retraining (if needed):** 13-16 hours (2M timesteps)
- **Total:** ~20-23 hours

## Expected Results for test_project2

- **Before:** 71km route, 58.6% water coverage (offshore)
- **After:** 62-68km route, <5% water coverage (inland only)
- **Coastline source:** EEA (±5-10m accuracy, optimal for Italy)

## Implementation Todos

- [ ] Create multi-source fetch_coastline.py script with auto-selection
- [ ] Add coastline loading to GISDataManager
- [ ] Implement is_beyond_coastline() method with distance checking
- [ ] Add coastline constraint to calculate_reward() (-1000 penalty)
- [ ] Update check_termination() for gradual offshore handling
- [ ] Update water land cover cost ($500 → $3,500/m)
- [ ] Add coastline config section to YAML training configs
- [ ] Fetch EEA coastline for test_project2 Italy AOI
- [ ] Reproject coastline to EPSG:32633 (UTM 33N)
- [ ] Test coastline loading and constraint checking
- [ ] Rebuild C++ and reinstall Python bindings
- [ ] Run quick validation test (route generation)
- [ ] Optional: Retrain 2M model with coastline constraint

