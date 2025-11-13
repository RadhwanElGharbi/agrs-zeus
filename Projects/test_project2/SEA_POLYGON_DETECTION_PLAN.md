# Sea Polygon Detection from ESA WorldCover - Implementation Plan

**Date:** November 5, 2025  
**Approach:** Detect largest water polygon from land cover data instead of external coastline  
**Status:** ✅ **SUPERIOR APPROACH** - More reliable than coastline files

---

## Concept

Instead of relying on external coastline data that may be misaligned or incomplete:

1. **Extract water bodies** from ESA WorldCover (LC=80) within AOI
2. **Identify largest polygon** = sea/ocean portion
3. **Create 1km buffer** around sea polygon
4. **Hard constraint:** Approaching within 1km = immediate termination

---

## Advantages Over Coastline Approach

✅ **Guaranteed data availability** - ESA WorldCover already required for PIRL  
✅ **Perfect alignment** - Same CRS and resolution as other layers  
✅ **No external dependency** - Self-contained solution  
✅ **Automatic coverage** - Works for any coastal AOI worldwide  
✅ **Clear distinction** - Largest polygon = sea, smaller polygons = inland water  
✅ **Simpler logic** - Just check distance to one polygon vs complex line checks

---

## Implementation

### Step 1: Extract Sea Polygon During Data Loading

**File:** `src/pirl/PIRL.cpp` (GISDataManager::load_all_data)

Replace coastline loading with sea polygon extraction:

```cpp
// ============================================================================
// EXTRACT SEA POLYGON FROM LAND COVER
// ============================================================================

// Remove old coastline loading code
// Instead, extract sea from land cover raster

std::cout << "🌊 Extracting sea polygon from land cover..." << std::endl;

if (land_cover_ds_) {
    // 1. Extract water bodies (LC=80) as polygons
    std::string temp_water_shp = project_dir_ + "/data/vectors/.temp_water_polygons.shp";
    
    // Use gdal_polygonize to convert water pixels to polygons
    char **papszOptions = nullptr;
    papszOptions = CSLSetNameValue(papszOptions, "8CONNECTED", "8");
    
    GDALDriver *shpDriver = GetGDALDriverManager()->GetDriverByName("ESRI Shapefile");
    GDALDataset *waterDS = shpDriver->Create(
        temp_water_shp.c_str(), 0, 0, 0, GDT_Unknown, nullptr
    );
    
    OGRLayer *waterLayer = waterDS->CreateLayer(
        "water", land_cover_ds_->GetSpatialRef(), wkbPolygon, nullptr
    );
    
    OGRFieldDefn classField("class", OFTInteger);
    waterLayer->CreateField(&classField);
    
    // Polygonize the land cover raster (only LC=80)
    auto band = land_cover_ds_->GetRasterBand(1);
    GDALPolygonize(
        band, nullptr, waterLayer, 0,  // 0 = class field index
        papszOptions, nullptr, nullptr
    );
    
    CSLDestroy(papszOptions);
    
    // 2. Find largest polygon (= sea)
    double max_area = 0.0;
    OGRGeometry* largest_geom = nullptr;
    
    waterLayer->ResetReading();
    OGRFeature *feature;
    int water_polygon_count = 0;
    
    while ((feature = waterLayer->GetNextFeature()) != nullptr) {
        int lc_class = feature->GetFieldAsInteger("class");
        
        if (lc_class == 80) {  // Water bodies
            OGRGeometry *geom = feature->GetGeometryRef();
            if (geom && geom->getGeometryType() == wkbPolygon) {
                double area = ((OGRPolygon*)geom)->get_Area();
                
                if (area > max_area) {
                    if (largest_geom) {
                        delete largest_geom;
                    }
                    largest_geom = geom->clone();
                    max_area = area;
                }
                water_polygon_count++;
            }
        }
        
        OGRFeature::DestroyFeature(feature);
    }
    
    GDALClose(waterDS);
    
    // 3. Store sea polygon
    if (largest_geom && max_area > 1000000.0) {  // > 1 km² = likely sea
        sea_polygon_geom_ = std::unique_ptr<OGRGeometry>(largest_geom);
        
        // Calculate actual area in km²
        double area_km2 = max_area / 1000000.0;
        
        std::cout << "    ✅ Sea polygon detected:" << std::endl;
        std::cout << "       Total water polygons: " << water_polygon_count << std::endl;
        std::cout << "       Largest area: " << area_km2 << " km²" << std::endl;
        std::cout << "       1km exclusion zone will be enforced" << std::endl;
    } else {
        std::cout << "    ℹ️  No large water body detected (inland project)" << std::endl;
        if (largest_geom) delete largest_geom;
    }
    
    // Clean up temp file
    shpDriver->Delete(temp_water_shp.c_str());
    
} else {
    std::cout << "    ⚠️  Land cover not loaded, cannot detect sea" << std::endl;
}
```

### Step 2: Update Header File

**File:** `src/pirl/PIRL.h`

```cpp
class GISDataManager {
public:
    // ... existing methods ...
    
    // NEW: Sea polygon detection
    bool is_near_sea(double x, double y) const;
    bool has_sea_polygon() const { return sea_polygon_geom_ != nullptr; }
    double distance_to_sea(double x, double y) const;
    
private:
    // ... existing members ...
    
    // REPLACE: coastline_geom_ with sea_polygon_geom_
    std::unique_ptr<OGRGeometry> sea_polygon_geom_;  // Largest water polygon (sea)
    
    static constexpr double SEA_EXCLUSION_DISTANCE_M = 1000.0;  // 1 km buffer
};
```

### Step 3: Implement Distance Check

**File:** `src/pirl/PIRL.cpp`

```cpp
double GISDataManager::distance_to_sea(double x, double y) const {
    if (!sea_polygon_geom_) {
        return std::numeric_limits<double>::max();  // No sea = infinitely far
    }
    
    OGRPoint point(x, y);
    
    // Set spatial reference if needed
    if (sea_polygon_geom_->getSpatialReference()) {
        point.assignSpatialReference(sea_polygon_geom_->getSpatialReference());
    }
    
    return sea_polygon_geom_->Distance(&point);
}

bool GISDataManager::is_near_sea(double x, double y) const {
    if (!sea_polygon_geom_) {
        return false;  // No sea polygon = can't be near it
    }
    
    double distance = distance_to_sea(x, y);
    
    // Terminate if within 1 km of sea polygon
    return distance < SEA_EXCLUSION_DISTANCE_M;
}
```

### Step 4: Update Environment Termination Check

**File:** `src/pirl/PIRL_Environment.cpp` (check_termination)

```cpp
// REPLACE coastline check with sea polygon check
// Sea proximity constraint - IMMEDIATE TERMINATION (1km exclusion zone)
if (gis_->has_sea_polygon() && gis_->is_near_sea(state.x, state.y)) {
    double distance = gis_->distance_to_sea(state.x, state.y);
    reason = "FAILURE: Too close to sea (" + 
             std::to_string(static_cast<int>(distance)) + 
             "m < 1000m exclusion zone)";
    return true;  // Immediate termination
}
```

### Step 5: Add Reward Penalty

**File:** `src/pirl/PIRL_Environment.cpp` (calculate_reward)

```cpp
// REPLACE coastline penalty with sea proximity penalty
// Sea proximity constraint (graduated penalty approaching 1km limit)
if (gis_->has_sea_polygon()) {
    double distance = gis_->distance_to_sea(new_state.x, new_state.y);
    
    if (distance < 1000.0) {
        // Within exclusion zone - MASSIVE penalty before termination
        double violation_penalty = -10000.0;
        info.constraint_penalty += violation_penalty;
        info.total_reward += violation_penalty;
    } else if (distance < 2000.0) {
        // Approaching exclusion zone - graduated warning penalty
        double proximity_penalty = -1000.0 * (2000.0 - distance) / 1000.0;
        info.constraint_penalty += proximity_penalty;
        info.total_reward += proximity_penalty;
    }
}
```

### Step 6: Update State Vector (Optional)

**File:** `src/pirl/PIRL.h`

```cpp
struct State {
    // ... existing fields ...
    double sea_proximity;  // NEW: normalized distance to sea (0=at sea, 1=>2km away)
    // ... rest of fields ...
};
```

**Update dimension:** 17 → 18 dimensions

In `State::to_vector()`:
```cpp
safe_float(sea_proximity / 2000.0, 0.0, 1.0),  // Normalize to 0-1, cap at 2km
```

### Step 7: Remove Coastline References

**Files to clean up:**

1. `src/pirl/PIRL.h` - Remove `is_beyond_coastline()`, `coastline_geom_`
2. `src/pirl/PIRL.cpp` - Remove coastline loading code
3. `src/pirl/PIRL_Environment.cpp` - Remove coastline checks

---

## Alternative: Python Pre-Processing Script

If C++ polygonization is too complex, create Python preprocessing:

**File:** `scripts/extract_sea_polygon.py`

```python
#!/usr/bin/env python3
"""
Extract sea polygon from ESA WorldCover land cover data.
The largest water polygon is assumed to be the sea/ocean.
"""

import rasterio
import rasterio.features
from shapely.geometry import shape, mapping
import geopandas as gpd
import sys
import json

def extract_sea_polygon(landcover_path, output_path, min_area_km2=1.0):
    """
    Extract largest water polygon from land cover raster.
    
    Args:
        landcover_path: Path to land cover GeoTIFF
        output_path: Output path for sea polygon GeoPackage
        min_area_km2: Minimum area to consider as sea (default 1 km²)
    """
    print(f"🌊 Extracting sea polygon from: {landcover_path}")
    
    with rasterio.open(landcover_path) as src:
        # Read land cover data
        landcover = src.read(1)
        transform = src.transform
        crs = src.crs
        
        # Create mask for water bodies (LC=80)
        water_mask = (landcover == 80).astype('uint8')
        
        # Extract water polygons
        water_shapes = []
        for geom, value in rasterio.features.shapes(water_mask, transform=transform):
            if value == 1:  # Water
                water_shapes.append(shape(geom))
        
        print(f"   Found {len(water_shapes)} water polygons")
        
        if not water_shapes:
            print("   ⚠️  No water bodies found")
            return False
        
        # Find largest polygon
        largest_area = 0
        largest_poly = None
        
        for poly in water_shapes:
            area_m2 = poly.area
            area_km2 = area_m2 / 1_000_000
            
            if area_km2 > largest_area:
                largest_area = area_km2
                largest_poly = poly
        
        print(f"   Largest water body: {largest_area:.2f} km²")
        
        if largest_area < min_area_km2:
            print(f"   ℹ️  Largest water body < {min_area_km2} km² (not sea)")
            return False
        
        # Save as GeoPackage
        gdf = gpd.GeoDataFrame(
            {'geometry': [largest_poly], 'type': ['sea']},
            crs=crs
        )
        
        gdf.to_file(output_path, driver='GPKG', layer='sea_polygon')
        
        print(f"   ✅ Sea polygon saved to: {output_path}")
        print(f"      Area: {largest_area:.2f} km²")
        print(f"      1km exclusion zone will be enforced")
        
        return True

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: extract_sea_polygon.py <landcover.tif> <output.gpkg>")
        sys.exit(1)
    
    landcover_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = extract_sea_polygon(landcover_path, output_path)
    sys.exit(0 if success else 1)
```

**Usage:**
```bash
python scripts/extract_sea_polygon.py \
    Projects/test_project2/data/rasters/processed/landcover_epsg32633_processed.tif \
    Projects/test_project2/data/vectors/sea_polygon.gpkg
```

Then in C++, just load `sea_polygon.gpkg` like any other vector layer.

---

## Testing Plan

### Test 1: Sea Detection

```bash
cd /opt/agrs/Projects/test_project2

# Run extraction
python /opt/agrs/scripts/extract_sea_polygon.py \
    data/rasters/processed/landcover_epsg32633_processed.tif \
    data/vectors/sea_polygon.gpkg

# Verify output
ogrinfo -al -so data/vectors/sea_polygon.gpkg
```

**Expected:**
- 1 polygon feature
- Area > 10 km² (for coastal projects)
- Geometry type: Polygon

### Test 2: Constraint Enforcement

```bash
# Quick test (50k steps)
cd /opt/agrs
mkdir -p build && cd build
cmake .. && make -j$(nproc)

cd /opt/agrs/Projects/test_project2
python3 train_pirl_direct.py \
    --config PIRL/pirl_training_config_test.yaml \
    --project-dir . \
    --total-timesteps 50000
```

**Check logs for:**
```
✅ Sea polygon detected:
   Total water polygons: 45
   Largest area: 234.5 km²
   1km exclusion zone will be enforced
```

**During training:**
```
Episode terminated: FAILURE: Too close to sea (873m < 1000m exclusion zone)
```

### Test 3: Route Validation

```python
import geopandas as gpd

route = gpd.read_file('PIRL/outputs/route_test.geojson')
sea = gpd.read_file('data/vectors/sea_polygon.gpkg')

# Check minimum distance
min_dist = route.distance(sea.unary_union).min()
print(f"Minimum distance to sea: {min_dist:.2f} m")

assert min_dist > 1000, "Route violates 1km sea exclusion zone!"
print("✅ Route respects sea exclusion zone")
```

---

## Built-Up Area Fix (Combined)

While implementing sea detection, also add built-up constraint:

**File:** `src/pirl/PIRL_Environment.cpp`

```cpp
// Built-up area hard constraint (13.5m clearance from buildings)
int land_cover = gis_->get_land_cover_class(state.x, state.y);
if (land_cover == 50) {  // Built-up areas (ESA WorldCover 10m resolution)
    // If IN a built-up pixel, we're < 10m from buildings
    // This violates 13.5m clearance requirement
    reason = "FAILURE: Built-up area violation (<13.5m from buildings)";
    return true;  // Immediate termination
}
```

**Reward penalty:**
```cpp
// Built-up area penalty
int land_cover = gis_->get_land_cover_class(new_state.x, new_state.y);
if (land_cover == 50) {
    double buildup_penalty = -10000.0;  // Massive penalty before termination
    info.constraint_penalty += buildup_penalty;
    info.total_reward += buildup_penalty;
}
```

---

## Implementation Timeline

### Immediate (Today):

1. ✅ Create `extract_sea_polygon.py` script
2. ✅ Run extraction on test_project2
3. ✅ Verify sea polygon output

### Tomorrow:

4. ✅ Implement C++ sea polygon loading (simpler than extraction)
5. ✅ Add `is_near_sea()` method
6. ✅ Update termination check
7. ✅ Add reward penalty
8. ✅ Add built-up constraint
9. ✅ Rebuild and test

### Testing (1-2 days):

10. ✅ Test run (50k steps)
11. ✅ Validate no sea violations
12. ✅ Validate no built-up violations
13. ✅ Full retrain (2M steps)

---

## Success Criteria

After implementation and retraining:

- [ ] Sea polygon extracted successfully from land cover
- [ ] Training logs show "Sea polygon detected"
- [ ] No "too close to sea" failures after agent learns
- [ ] Generated route maintains >1km from sea polygon
- [ ] No offshore segments in final route
- [ ] No built-up area segments (LC=50)
- [ ] Route reaches goal consistently (>80%)
- [ ] Spatial validation confirms all constraints met

---

## Files to Create/Modify

**New Files:**
- `scripts/extract_sea_polygon.py` - Sea extraction utility

**Modified Files:**
- `src/pirl/PIRL.h` - Replace coastline with sea_polygon
- `src/pirl/PIRL.cpp` - Load sea polygon, implement distance checks
- `src/pirl/PIRL_Environment.cpp` - Add sea + built-up constraints

**Delete:**
- `data/vectors/processed/coastline_epsg32633_processed.gpkg` - No longer needed
- `data/vectors/raw/coastline_raw.*` - No longer needed

---

**Status:** ✅ **READY TO IMPLEMENT**  
**Advantages:** Self-contained, guaranteed data, simpler logic  
**Estimated Time:** 4-6 hours (implementation + testing) + 12 hours (retrain)




