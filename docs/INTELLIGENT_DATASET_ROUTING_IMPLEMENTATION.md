# Intelligent Dataset Routing System Implementation

**Date:** 2025-10-17  
**Status:** 🚧 In Progress  
**Goal:** Create intelligent routing fetch tools for all 11 dataset categories

---

## 📋 **OVERVIEW**

Following the successful implementation of `dem_fetch` with intelligent routing (auto-selects best DEM based on location), we are now implementing similar intelligent routing for all remaining dataset categories.

### Pattern:
```
tools_<category>_fetch(bbox, aoi, options) 
  → Detects country from coordinates
  → Consults <category>_datasets_inventory.csv
  → Selects best available dataset
  → Delegates to specific fetch tool or provides guidance
```

---

## 🎯 **IMPLEMENTATION PLAN**

### ✅ Phase 1: Infrastructure (COMPLETE)
1. Created `dataset_routing.hpp` - Generalized router template
2. Shared `get_country_from_coords()` function
3. Generic `DatasetRouter<>` class template

### 🚧 Phase 2: Fetch Tools (IN PROGRESS)
Implement 10 intelligent routing fetch tools:

1. `tools_landcover_fetch` - Land cover/land use
2. `tools_hydrology_fetch` - Rivers, lakes, wetlands
3. `tools_infrastructure_fetch` - Roads, railways, power lines
4. `tools_protected_areas_fetch` - Protected areas, Natura 2000
5. `tools_geohazards_fetch` - Seismic, landslides, soils
6. `tools_administrative_fetch` - Admin boundaries
7. `tools_cadastre_fetch` - Land parcels, property boundaries
8. `tools_socioeconomic_fetch` - Population, demographics
9. `tools_climate_fetch` - Temperature, precipitation, climate
10. `tools_imagery_fetch` - Satellite imagery

### Phase 3: CLI Integration
- Add CLI commands for all new fetch tools
- Update help documentation
- Test all tools

### Phase 4: Documentation
- Update FETCH_TOOLS documentation
- Create usage examples
- Add to main ZEUS documentation

---

## 📊 **DATASET ROUTING ARCHITECTURE**

### File Structure:
```
/opt/agrs/
├── src/app/
│   ├── dataset_routing.hpp           (NEW - Generic router)
│   ├── dem_routing.hpp               (Existing - DEM-specific)
│   └── Tools.cpp                     (Updated - Add 10 new tools)
├── include/agrs_zeus/
│   └── Tools.h                       (Updated - Add declarations)
└── data/
    ├── dem_datasets_inventory.csv
    ├── landcover_datasets_inventory.csv
    ├── hydrology_datasets_inventory.csv
    ├── infrastructure_datasets_inventory.csv
    ├── protected_areas_datasets_inventory.csv
    ├── geohazards_datasets_inventory.csv
    ├── administrative_datasets_inventory.csv
    ├── cadastre_datasets_inventory.csv
    ├── socioeconomic_datasets_inventory.csv
    ├── climate_datasets_inventory.csv
    └── imagery_datasets_inventory.csv
```

### Class Template:
```cpp
DatasetRouter<Dataset>(inventory_path, category_name)
  → load_inventory()                 // Parse CSV
  → find_best_dataset(lon, lat)      // Intelligent selection
  → list_datasets_for_country(code)  // Info display
```

---

## 🔧 **IMPLEMENTATION DETAILS**

### Example: `tools_landcover_fetch`

```cpp
int tools_landcover_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& resolution,
                          const std::string& outputPath,
                          bool overwrite) {
    
    // Parse AOI to get centroid
    double minx, miny, maxx, maxy;
    parse_bbox(bbox, minx, miny, maxx, maxy);
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    // Initialize router
    DatasetRouter router("/opt/agrs/data/landcover_datasets_inventory.csv", 
                        "Land Cover");
    
    // Find best dataset
    auto best = router.find_best_dataset(center_lon, center_lat, "Raster");
    
    if (best.dataset_name.empty()) {
        return 1; // No dataset found
    }
    
    // Delegate to specific tool
    if (best.fetch_tool == "esa_worldcover_fetch") {
        return tools_esa_worldcover_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (best.fetch_tool == "google_dynamicworld_fetch") {
        return tools_google_dynamicworld_fetch(bbox, aoiPath, outputPath, overwrite);
    }
    // ... more delegations
    
    // Guidance for not-yet-implemented tools
    std::cout << "📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "To acquire this dataset:" << std::endl;
    std::cout << "  1. Visit: " << best.provider << std::endl;
    std::cout << "  2. Download data for AOI" << std::endl;
    std::cout << "  3. Import manually" << std::endl;
    
    return 2; // Guidance provided
}
```

### Key Features:
1. **Auto-detection:** Uses AOI centroid to detect country
2. **Best selection:** Prioritizes implemented tools, finest resolution
3. **Delegation:** Calls specific fetch tools when available
4. **Guidance:** Provides instructions for non-implemented datasets
5. **Consistent UX:** All tools work the same way

---

## 📈 **EXPECTED OUTCOMES**

### User Experience:
```bash
# Before (manual selection):
zeus tools esa_worldcover_fetch --bbox 13.5,42.8,13.9,43.2 -o landcover.tif

# After (intelligent routing):
zeus tools landcover_fetch --bbox 13.5,42.8,13.9,43.2 -o landcover.tif
# → Auto-detects Italy
# → Selects ESA WorldCover 10m (best available)
# → Delegates to esa_worldcover_fetch
```

### Benefits:
- **Simplified workflow:** Users don't need to know which specific tool to use
- **Optimal data:** Always gets best available dataset for location
- **Scalable:** Easy to add new datasets to inventories
- **Consistent:** Same interface across all categories
- **Educational:** Shows what datasets are available

---

## ⏱️ **IMPLEMENTATION STATUS**

| Category | Fetch Tool | Status | Priority |
|----------|-----------|--------|----------|
| DEM | `dem_fetch` | ✅ Implemented | - |
| Land Cover | `landcover_fetch` | ⏳ Next | High |
| Hydrology | `hydrology_fetch` | 📋 Planned | High |
| Infrastructure | `infrastructure_fetch` | 📋 Planned | High |
| Protected Areas | `protected_areas_fetch` | 📋 Planned | High |
| Geohazards | `geohazards_fetch` | 📋 Planned | Medium |
| Administrative | `administrative_fetch` | 📋 Planned | Medium |
| Cadastre | `cadastre_fetch` | 📋 Planned | High |
| Socioeconomic | `socioeconomic_fetch` | 📋 Planned | Medium |
| Climate | `climate_fetch` | 📋 Planned | Low |
| Imagery | `imagery_fetch` | 📋 Planned | High |

---

## 📚 **NEXT STEPS**

1. ✅ Complete `dataset_routing.hpp`
2. ⏳ Implement all 10 intelligent routing fetch tools in Tools.cpp
3. ⏳ Update Tools.h with declarations
4. ⏳ Add CLI registrations
5. ⏳ Test each tool with real AOIs
6. ⏳ Document usage in main ZEUS docs

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-17



