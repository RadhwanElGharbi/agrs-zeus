# Critical Constraint Violations - Fix Required

**Date:** November 5, 2025  
**Status:** 🚨 **PRODUCTION BLOCKER - Must Fix Before Retraining**

---

## Critical Violations Detected

### 1. 🚨 Offshore Routing (80% of Route in Water)

**Current Behavior:**
- 529 out of 661 segments (80%) in water (LC=80)
- Route goes offshore into the sea
- **VIOLATION:** Coastlines are hard boundaries that cannot be crossed

**Root Causes:**
1. **Coastline constraint not working despite implementation**
   - Coastline file exists: `data/vectors/processed/coastline_epsg32633_processed.gpkg`
   - Code exists in `PIRL.cpp` but may not be loading correctly
   - Penalty may be too weak vs terrain cost savings

2. **Water land cover (LC=80) includes both inland and offshore**
   - Agent cannot distinguish between rivers (allowed) and sea (forbidden)
   - 80% water suggests coastal/offshore routing, not river following

### 2. 🚨 Built-Up Area Violations (7.3% of Route)

**Current Behavior:**
- 48 segments through built-up areas (LC=50)
- Route crosses straight through buildings

**Required:** 13.5m minimum clearance from houses (Criteria #13)

**Root Cause:**
- **NO building proximity constraint implemented!**
- Built-up land cover has cost penalty ($400/m) but no hard constraint
- Agent will cross buildings if distance/terrain savings justify cost

---

## Required Fixes

### Fix 1: Implement Hard Building Clearance Constraint

**Requirement:** 13.5m minimum distance from all buildings

**Implementation:**

#### A. Add Building Proximity Detection

**File:** `src/pirl/PIRL.h`

```cpp
class GISDataManager {
public:
    double distance_to_building(double x, double y) const;
    bool is_too_close_to_building(double x, double y) const;  // < 13.5m
    
private:
    std::unique_ptr<OGRGeometry> buildings_geom_;  // Building footprints
    static constexpr double BUILDING_CLEARANCE_M = 13.5;
};
```

#### B. Load Building Footprints

**File:** `src/pirl/PIRL.cpp` (GISDataManager::load_all_data)

```cpp
// Load building footprints (OSM buildings or built-up raster)
std::string buildings_path = project_dir_ + "/data/vectors/buildings.gpkg";
if (!fs::exists(buildings_path)) {
    buildings_path = project_dir_ + "/data/vectors/osm_buildings.gpkg";
}
if (fs::exists(buildings_path)) {
    auto buildings_ds = std::unique_ptr<GDALDataset>(
        (GDALDataset*)GDALOpenEx(buildings_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr)
    );
    
    if (buildings_ds) {
        auto layer = buildings_ds->GetLayer(0);
        OGRGeometry* union_geom = nullptr;
        
        for (auto& feature : layer) {
            auto geom = feature->GetGeometryRef();
            if (!union_geom) {
                union_geom = geom->clone();
            } else {
                auto new_union = union_geom->Union(geom);
                delete union_geom;
                union_geom = new_union;
            }
        }
        
        buildings_geom_ = std::unique_ptr<OGRGeometry>(union_geom);
        std::cout << "✅ Building footprints loaded" << std::endl;
    }
}
```

#### C. Implement Distance Check

```cpp
double GISDataManager::distance_to_building(double x, double y) const {
    if (!buildings_geom_) return 1000.0;  // No data = far away
    
    OGRPoint point(x, y);
    return buildings_geom_->Distance(&point);
}

bool GISDataManager::is_too_close_to_building(double x, double y) const {
    return distance_to_building(x, y) < BUILDING_CLEARANCE_M;
}
```

#### D. Add to State Vector

**File:** `src/pirl/PIRL.h`

```cpp
struct State {
    // ... existing fields ...
    double building_proximity;  // NEW: distance to nearest building (normalized)
    // ... rest of fields ...
};
```

**Update dimension count:** 17 → 18 dimensions

#### E. Add Hard Termination

**File:** `src/pirl/PIRL_Environment.cpp` (check_termination)

```cpp
// Building clearance violation - IMMEDIATE TERMINATION
if (gis_->has_buildings() && gis_->is_too_close_to_building(state.x, state.y)) {
    reason = "FAILURE: Building clearance violation (<13.5m)";
    return true;
}
```

#### F. Add Massive Penalty

**File:** `src/pirl/PIRL_Environment.cpp` (calculate_reward)

```cpp
// Building proximity constraint
if (gis_->has_buildings()) {
    double dist = gis_->distance_to_building(new_state.x, new_state.y);
    if (dist < 13.5) {
        double violation_penalty = -2000.0;  // Massive penalty
        info.constraint_penalty += violation_penalty;
        info.total_reward += violation_penalty;
    } else if (dist < 30.0) {
        // Soft penalty for getting close
        double proximity_penalty = -100.0 * (30.0 - dist) / 16.5;
        info.constraint_penalty += proximity_penalty;
        info.total_reward += proximity_penalty;
    }
}
```

---

### Fix 2: Strengthen Coastline Constraint

**Current Issue:** Coastline constraint exists but not working effectively

#### A. Verify Coastline Loading

**File:** `src/pirl/PIRL.cpp`

Add detailed logging:

```cpp
// Load coastline boundary (optional - for coastal projects)
std::string coastline_path = project_dir_ + "/data/vectors/coastline.gpkg";
if (!fs::exists(coastline_path)) {
    coastline_path = project_dir_ + "/data/vectors/processed/coastline_epsg" + 
                     std::to_string(epsg_code_) + "_processed.gpkg";
}

if (fs::exists(coastline_path)) {
    std::cout << "🌊 Loading coastline from: " << coastline_path << std::endl;
    auto coastline_ds = std::unique_ptr<GDALDataset>(
        (GDALDataset*)GDALOpenEx(coastline_path.c_str(), GDAL_OF_VECTOR, nullptr, nullptr, nullptr)
    );
    
    if (coastline_ds) {
        auto layer = coastline_ds->GetLayer(0);
        std::cout << "   Coastline layer has " << layer->GetFeatureCount() << " features" << std::endl;
        
        // ... rest of loading logic ...
        
        if (coastline_geom_) {
            std::cout << "✅ Coastline boundary loaded successfully" << std::endl;
            OGREnvelope env;
            coastline_geom_->getEnvelope(&env);
            std::cout << "   Extent: [" << env.MinX << ", " << env.MinY << "] to ["
                      << env.MaxX << ", " << env.MaxY << "]" << std::endl;
        }
    } else {
        std::cout << "❌ Failed to open coastline file!" << std::endl;
    }
} else {
    std::cout << "⚠️  No coastline file found at: " << coastline_path << std::endl;
}
```

#### B. Fix Coastline Logic (if inverted)

**Current logic in `is_beyond_coastline()`:**

```cpp
// Hard boundary: ANY crossing of coastline itself terminates (within 10m = on the line)
const double COASTLINE_CROSSING_THRESHOLD = 10.0;  // meters
if (min_distance < COASTLINE_CROSSING_THRESHOLD) {
    return true;  // Immediate termination
}

// Check if this is coastal water (within 200m buffer of coastline)
int land_cover = get_land_cover_class(x, y);
if (land_cover == 80) {  // Water land cover
    const double OFFSHORE_BUFFER = 200.0;  // meters
    return (min_distance < OFFSHORE_BUFFER);  // Block if within 200m of coast AND in water
}
return false;
```

**Issue:** This logic blocks water NEAR coast, but what if:
1. Agent is on land side of coast polyline → distance < 200m → NOT blocked
2. Agent crosses to sea side of coast polyline → distance < 200m → blocked

**The problem:** We need to check which SIDE of the coastline the agent is on!

#### C. Implement Proper Coastline Side Check

```cpp
bool GISDataManager::is_beyond_coastline(double x, double y) const {
    if (!coastline_geom_) return false;
    
    OGRPoint point(x, y);
    double min_distance = coastline_geom_->Distance(&point);
    
    // Hard boundary: ANY crossing of coastline itself terminates
    const double COASTLINE_CROSSING_THRESHOLD = 10.0;
    if (min_distance < COASTLINE_CROSSING_THRESHOLD) {
        return true;  // Immediate termination - touching the line
    }
    
    // For water land cover, check if it's offshore (seaward side)
    int land_cover = get_land_cover_class(x, y);
    if (land_cover == 80) {  // Water land cover
        // If in water AND close to coast, check if it's offshore
        // Method: Check if point is "outside" the coastline polygon
        // (assuming coastline is a polygon with land inside, sea outside)
        
        if (coastline_geom_->getGeometryType() == wkbPolygon ||
            coastline_geom_->getGeometryType() == wkbMultiPolygon) {
            // If coastline is a polygon, check containment
            // Point inside polygon = land side = OK for rivers
            // Point outside polygon = sea side = BLOCKED
            return !coastline_geom_->Contains(&point);
        } else {
            // If coastline is a line, use distance threshold
            const double OFFSHORE_BUFFER = 200.0;
            return (min_distance < OFFSHORE_BUFFER);
        }
    }
    
    return false;
}
```

#### D. Alternative: Use Sea Polygon Instead

**Better approach:** Create a "sea" polygon that is explicitly the offshore area

```bash
# Using ogr2ogr to create sea polygon from coastline
ogr2ogr -f GPKG sea_polygon.gpkg coastline.gpkg \
    -dialect sqlite \
    -sql "SELECT ST_Buffer(geometry, 50000) AS geometry FROM coastline"
```

Then check if point is inside sea polygon → immediate termination

---

### Fix 3: Add State Vector Update

**Current:** 17-dimensional state  
**Required:** 18-dimensional state

**New field:**
- `building_proximity` (normalized 0-1, where 0 = at building, 1 = >100m away)

**Update locations:**
1. `src/pirl/PIRL.h` - State struct
2. `src/pirl/PIRL.cpp` - State::to_vector()
3. `src/pirl/PIRL_Environment.cpp` - Update state calculation
4. Python bindings (if any)

---

## Required Data

### 1. Building Footprints

**Source:** OpenStreetMap buildings

**Fetch:**
```bash
python /opt/agrs/scripts/fetch_osm_buildings.py \
    --aoi Projects/test_project2/aoi/aoi.geojson \
    --output Projects/test_project2/data/vectors/osm_buildings.gpkg
```

**Process:**
```bash
ogr2ogr -f GPKG \
    Projects/test_project2/data/vectors/processed/buildings_epsg32633_processed.gpkg \
    Projects/test_project2/data/vectors/raw/osm_buildings_raw.gpkg \
    -t_srs EPSG:32633 \
    -clipsrc Projects/test_project2/aoi/aoi.geojson
```

### 2. Verify Coastline

**Check if coastline covers project area:**
```bash
ogrinfo -al -so Projects/test_project2/data/vectors/processed/coastline_epsg32633_processed.gpkg
```

---

## Testing Plan

### Test 1: Building Clearance

1. Create test route that passes near buildings
2. Verify termination occurs < 13.5m
3. Verify agent learns to avoid buildings
4. Verify 30m soft penalty zone works

### Test 2: Coastline Boundary

1. Verify coastline loads with logging
2. Check coastline geometry type (polygon vs line)
3. Test point on land side → OK
4. Test point on sea side → termination
5. Verify rivers (inland water) still allowed

### Test 3: Combined Constraints

1. Train for 500k timesteps with both constraints
2. Generate route
3. Validate:
   - No segments < 13.5m from buildings
   - No offshore segments
   - Rivers/inland water still OK
   - Route viable and reaches goal

---

## Implementation Priority

### URGENT (Before Any Retraining):

1. ✅ **Fetch building footprints** (if not exists)
2. ✅ **Implement building clearance constraint** (hard termination + penalty)
3. ✅ **Verify coastline constraint** (add logging, check if working)
4. ✅ **Fix coastline logic** (if inverted or broken)
5. ✅ **Update state vector** (18 dimensions)
6. ✅ **Test both constraints** (unit tests)

### BEFORE PRODUCTION:

7. ⚠️ **Update all other distance constraints:**
   - Powerlines: 6m clearance
   - Powerline poles: 6m clearance
   - Existing pipelines: 0.5m clearance

8. ⚠️ **Retrain model** with all constraints (2M timesteps)

9. ⚠️ **Validate output** against ALL criteria

---

## Expected Behavior After Fix

**Coastline:**
- Agent treats coastline as hard boundary
- Immediate termination if crossing into sea
- Rivers and inland water bodies still allowed
- Agent will take long detours to avoid offshore routing

**Buildings:**
- Agent maintains 13.5m clearance from all buildings
- Massive penalty for violating clearance
- Soft penalty for 13.5-30m proximity (guides away)
- Route avoids built-up areas entirely or skirts edges

**Combined Result:**
- Route stays inland (no offshore segments)
- Route avoids buildings (no built-up segments < 13.5m)
- Route length may increase (more constraints = longer paths)
- Route is legally and physically viable

---

## Validation Checklist

After implementing fixes and retraining:

- [ ] Coastline constraint active and logging correctly
- [ ] Building clearance constraint active
- [ ] No offshore segments in training episodes
- [ ] No building clearance violations in training
- [ ] Agent reaches goal consistently (>80%)
- [ ] Final route has 0 offshore segments
- [ ] Final route has 0 building clearance violations
- [ ] Route length reasonable (<150 km)
- [ ] All other constraints still satisfied

---

## Files to Modify

1. `src/pirl/PIRL.h` - Add building_proximity to State, add building methods to GISDataManager
2. `src/pirl/PIRL.cpp` - Load buildings, implement distance checks, verify coastline loading
3. `src/pirl/PIRL_Environment.cpp` - Add building termination, add building penalty, strengthen coastline checks
4. `scripts/fetch_osm_buildings.py` - Create if doesn't exist
5. `Projects/test_project2/PIRL/pirl_training_config.yaml` - Update state_dim: 18

---

**Status:** 🚨 **BLOCKING ISSUE - Must fix before production use**  
**Estimated Fix Time:** 1-2 days (implementation + testing + retrain)  
**Risk Level:** **CRITICAL** (legal/safety implications)




