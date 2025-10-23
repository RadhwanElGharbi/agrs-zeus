# Pipeline Routing Dataset Checklist
## End-to-End Geospatial Data Requirements

**Purpose:** This checklist defines all geospatial datasets required for a complete, cost-optimized pipeline routing project from initial feasibility through final route selection.

**Goal:** Enable 10%+ construction cost savings through comprehensive constraint analysis and optimal route generation.

---

## ✅ **PHASE 1: TERRAIN & TOPOGRAPHY** (CRITICAL)

### 1.1 Digital Elevation Model (DEM)
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Terrain analysis, slope calculation, cut/fill estimation
- **Resolution Required:** 
  - Minimum: 30m (SRTM)
  - Recommended: 10m (national DEMs)
  - Optimal: 1-5m (LiDAR where available)
- **Coverage:** AOI + 5km buffer
- **Format:** GeoTIFF, Float32, meters MSL
- **ZEUS Tools:** ✅ `dem_fetch` (intelligent routing)
- **Derived Products:**
  - Slope (degrees/percent)
  - Aspect (degrees)
  - Curvature (profile/planform)
  - Hillshade (visualization)
  - Terrain Ruggedness Index (TRI)

### 1.2 Slope Analysis
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Terrain difficulty cost multipliers
- **Thresholds:**
  - 0-5°: Flat terrain (cost multiplier: 1.0)
  - 5-10°: Gentle slope (multiplier: 1.3)
  - 10-20°: Moderate slope (multiplier: 2.5)
  - 20-30°: Steep slope (multiplier: 5.0)
  - >30°: Very steep / no-go (multiplier: 10.0+)
- **ZEUS Tools:** ✅ `tools raster_slope`
- **Output:** Slope cost surface (raster)

### 1.3 Aspect Analysis
- **Priority:** 🟡 **HIGH**
- **Purpose:** Sun exposure, erosion risk, access planning
- **ZEUS Tools:** ✅ `tools raster_aspect`
- **Output:** Aspect raster (0-360°)

---

## ✅ **PHASE 2: LAND COVER & LAND USE** (CRITICAL)

### 2.1 Land Cover Classification
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Identify vegetation, urban areas, bare ground, water
- **Resolution Required:**
  - Minimum: 30m
  - Recommended: 10m (ESA WorldCover, Google Dynamic World)
- **Classes Required:**
  - Tree cover / forests
  - Shrubland
  - Grassland
  - Cropland
  - Built-up / urban
  - Bare ground / desert
  - Water bodies
  - Wetlands
- **ZEUS Tools:** 
  - ✅ `tools esa_worldcover_fetch` (10m, 11 classes)
  - ✅ `tools google_dynamicworld_fetch` (10m, near real-time)
- **Cost Multipliers:**
  - Bare ground: 1.0
  - Grassland: 1.1
  - Cropland: 1.5 (compensation)
  - Shrubland: 1.8 (clearing)
  - Forest: 3.0-5.0 (clearing + mitigation)
  - Urban: 10.0+ (high ROW costs)
  - Wetlands: 8.0+ (environmental mitigation)

### 2.2 Forest / Tree Cover
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Clearing costs, environmental mitigation
- **Resolution:** 10-30m
- **ZEUS Tools:** ✅ From ESA WorldCover / Dynamic World
- **Cost Impact:** High (3-5x baseline)

### 2.3 Agricultural Land
- **Priority:** 🟡 **HIGH**
- **Purpose:** Crop compensation, seasonal access restrictions
- **ZEUS Tools:** ✅ From ESA WorldCover class 40 (Cropland)
- **Cost Impact:** Moderate compensation costs

---

## ✅ **PHASE 3: HYDROLOGY & WATER FEATURES** (CRITICAL)

### 3.1 Rivers & Streams (Major Waterways)
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Water crossing costs, permitting, HDD planning
- **Data Source:** OpenStreetMap, national hydrography
- **Attributes Required:**
  - Waterway type (river, stream, canal)
  - Width (meters)
  - Flow status (perennial, intermittent)
- **ZEUS Tools:** ✅ `tools osm_waterways_fetch`
- **Cost Multipliers:**
  - Small stream (<3m): 2-3x per meter
  - Medium stream (3-10m): 5-8x per meter
  - Large river (>10m): 10-20x per meter (HDD required)

### 3.2 Lakes & Reservoirs
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Major crossing avoidance, permitting
- **Data Source:** ESA WorldCover, Global Surface Water
- **ZEUS Tools:** 
  - ✅ `tools esa_worldcover_fetch` (class 80)
  - ✅ `tools global_surface_water_fetch` (30m, 1984-2021)
- **Cost Impact:** Very high (avoid if possible, or HDD)

### 3.3 Wetlands & Marshes
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Environmental constraints, mitigation costs
- **Data Source:** ESA WorldCover, Ramsar sites
- **ZEUS Tools:** ✅ `tools esa_worldcover_fetch` (class 90)
- **Cost Multipliers:** 8-15x (environmental mitigation)

### 3.4 Floodplains
- **Priority:** 🟡 **HIGH**
- **Purpose:** Risk assessment, design requirements
- **Data Source:** National flood maps, DEM-derived
- **ZEUS Tools:** ⏳ `tools flood_risk_fetch` (in development)
- **Cost Impact:** Moderate (reinforced construction)

---

## ✅ **PHASE 4: INFRASTRUCTURE & CROSSINGS** (CRITICAL)

### 4.1 Roads & Highways
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Road crossing costs, access routes
- **Data Source:** OpenStreetMap
- **Attributes Required:**
  - Road type (motorway, primary, secondary, tertiary, track)
  - Lanes
  - Surface type
- **ZEUS Tools:** ✅ `tools osm_roads_fetch`
- **Cost Multipliers:**
  - Track/unpaved: 1.5x per meter
  - Tertiary road: 3-5x per meter
  - Secondary road: 8-12x per meter
  - Primary/highway: 15-25x per meter
  - Motorway: 30-50x per meter (HDD)

### 4.2 Railways
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** Railway crossing costs (very high)
- **Data Source:** OpenStreetMap
- **ZEUS Tools:** ✅ `tools osm_railways_fetch`
- **Cost Multipliers:** 20-40x per meter (HDD required)

### 4.3 Power Transmission Lines
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** High voltage crossing costs, safety clearances
- **Data Source:** OpenStreetMap, SciGRID
- **Attributes Required:**
  - Voltage (kV)
  - Number of circuits
- **ZEUS Tools:** 
  - ✅ `tools osm_power_fetch`
  - ✅ `tools scigrid_gas_pipelines_fetch` (European gas network)
- **Cost Multipliers:**
  - <100kV: 5-10x per meter
  - 100-400kV: 15-30x per meter
  - >400kV: 40-80x per meter (special permitting)

### 4.4 Existing Pipelines (Gas, Oil, Water)
- **Priority:** 🟡 **HIGH**
- **Purpose:** Proximity constraints, parallel routing opportunities
- **Data Source:** National pipeline registries, SciGRID
- **ZEUS Tools:** ✅ `tools scigrid_gas_pipelines_fetch` (Europe)
- **Cost Impact:** Avoidance or coordination costs

### 4.5 Urban & Built-Up Areas
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** High ROW costs, avoidance planning
- **Data Source:** ESA WorldCover, WorldPop, OSM buildings
- **ZEUS Tools:** 
  - ✅ `tools esa_worldcover_fetch` (class 50)
  - ✅ `tools worldpop_fetch` (population density)
- **Cost Multipliers:** 10-50x (avoid if possible)

---

## ✅ **PHASE 5: ENVIRONMENTAL & PROTECTED AREAS** (CRITICAL)

### 5.1 Protected Areas (National Parks, Reserves)
- **Priority:** 🔴 **CRITICAL**
- **Purpose:** No-go zones, permitting constraints
- **Data Source:** WDPA, national agencies
- **ZEUS Tools:** ✅ `tools wdpa_fetch` (global)
- **Categories:**
  - IUCN I-II: Strict protection (no-go)
  - IUCN III-IV: Restricted use (high cost)
  - IUCN V-VI: Sustainable use (moderate cost)
- **Cost Impact:** High to prohibitive

### 5.2 Natura 2000 Sites (Europe)
- **Priority:** 🔴 **CRITICAL** (for EU projects)
- **Purpose:** EU environmental protection zones
- **ZEUS Tools:** ✅ `tools natura2000_fetch`
- **Cost Impact:** High mitigation costs, possible no-go

### 5.3 Wildlife Habitats & Biodiversity Hotspots
- **Priority:** 🟡 **HIGH**
- **Purpose:** Environmental impact assessment, mitigation
- **Data Source:** National biodiversity databases
- **ZEUS Tools:** ⏳ (country-specific, future)
- **Cost Impact:** Moderate to high (seasonal restrictions)

### 5.4 Critical Habitats (Endangered Species)
- **Priority:** 🟡 **HIGH**
- **Purpose:** Avoidance, specialized mitigation
- **Data Source:** IUCN Red List, national databases
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Very high or no-go

---

## ✅ **PHASE 6: GEOHAZARDS & GEOLOGICAL CONSTRAINTS** (HIGH)

### 6.1 Seismic Hazard Zones
- **Priority:** 🟡 **HIGH**
- **Purpose:** Engineering design requirements
- **Data Source:** USGS, national geological surveys
- **ZEUS Tools:** ✅ `tools seismic_hazard_fetch`
- **Cost Impact:** Moderate (reinforced design)

### 6.2 Landslide Inventory
- **Priority:** 🟡 **HIGH**
- **Purpose:** Avoidance, slope stabilization costs
- **Data Source:** IFFI (Italy), national databases
- **ZEUS Tools:** ✅ `tools iffi_fetch` (Italy)
- **Cost Impact:** High (avoidance or stabilization)

### 6.3 Soil Types & Properties
- **Priority:** 🟡 **HIGH**
- **Purpose:** Construction difficulty, trenching costs
- **Data Source:** SoilGrids, national soil databases
- **Attributes:**
  - Soil texture
  - Organic carbon content
  - pH
  - Depth to bedrock
- **ZEUS Tools:** ✅ `tools soilgrids_fetch`
- **Cost Multipliers:**
  - Sandy soils: 1.0
  - Loamy soils: 1.2
  - Clay soils: 1.5-2.0 (difficult trenching)
  - Rocky/bedrock: 3-8x (blasting required)

### 6.4 Karst & Subsidence Areas
- **Priority:** 🟡 **HIGH**
- **Purpose:** Ground stability, sinkhole avoidance
- **Data Source:** National geological maps
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** High (avoidance or specialized design)

---

## ✅ **PHASE 7: REGULATORY & ADMINISTRATIVE** (HIGH)

### 7.1 Administrative Boundaries
- **Priority:** 🟡 **HIGH**
- **Purpose:** Permitting jurisdictions, regulatory compliance
- **Data Source:** GADM, national cadastre
- **Levels Required:**
  - Country borders (level 0)
  - State/province (level 1)
  - County/district (level 2)
  - Municipality (level 3)
- **ZEUS Tools:** ✅ `tools gadm_fetch`
- **Use Case:** Identify all permitting authorities

### 7.2 Land Ownership / Cadastral Parcels
- **Priority:** 🟡 **HIGH**
- **Purpose:** ROW acquisition, landowner engagement
- **Data Source:** National land registries
- **Attributes:**
  - Parcel ID
  - Owner information
  - Land use designation
  - Area
- **ZEUS Tools:** ⏳ (country-specific, future)
- **Cost Impact:** Variable ROW costs

### 7.3 Zoning & Land Use Designations
- **Priority:** 🟡 **HIGH**
- **Purpose:** Regulatory constraints, permitting
- **Data Source:** Municipal planning departments
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Moderate (permitting delays)

### 7.4 Indigenous Territories / Special Jurisdictions
- **Priority:** 🟡 **HIGH**
- **Purpose:** Consultation requirements, special permitting
- **Data Source:** National indigenous affairs agencies
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Consultation costs, possible no-go

---

## ✅ **PHASE 8: SOCIOECONOMIC & CULTURAL** (MEDIUM)

### 8.1 Population Density
- **Priority:** 🟢 **MEDIUM**
- **Purpose:** ROW costs, stakeholder engagement planning
- **Data Source:** WorldPop, national census
- **Resolution:** 100m-1km
- **ZEUS Tools:** ✅ `tools worldpop_fetch`
- **Use Case:** Higher density = higher ROW costs

### 8.2 Archaeological & Heritage Sites
- **Priority:** 🟢 **MEDIUM**
- **Purpose:** Cultural heritage protection, avoidance
- **Data Source:** UNESCO, national heritage registers
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Avoidance or archaeological surveys

### 8.3 Religious / Sacred Sites
- **Priority:** 🟢 **MEDIUM**
- **Purpose:** Community sensitivity, avoidance
- **Data Source:** Local databases, stakeholder input
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Social license considerations

---

## ✅ **PHASE 9: CLIMATE & ENVIRONMENTAL CONDITIONS** (MEDIUM)

### 9.1 Climate Data (Temperature, Precipitation)
- **Priority:** 🟢 **MEDIUM**
- **Purpose:** Construction window planning, design specs
- **Data Source:** WorldClim, ERA5
- **ZEUS Tools:** ⏳ `tools worldclim_fetch` (in development)
- **Use Case:** Seasonal construction restrictions

### 9.2 Snow & Ice Coverage
- **Priority:** 🟢 **MEDIUM** (high latitudes)
- **Purpose:** Winter access, permafrost considerations
- **Data Source:** National climate databases
- **ZEUS Tools:** ⏳ (future)
- **Cost Impact:** Seasonal access limitations

---

## ✅ **PHASE 10: VALIDATION & REFERENCE** (OPTIONAL)

### 10.1 Satellite Imagery (Optical)
- **Priority:** 🟢 **MEDIUM**
- **Purpose:** Visual validation, feature verification
- **Data Source:** Sentinel-2, Landsat
- **ZEUS Tools:** ✅ `tools sentinel2_fetch`
- **Use Case:** Ground-truth land cover, identify features

### 10.2 High-Resolution Imagery (Commercial)
- **Priority:** 🟢 **LOW**
- **Purpose:** Detailed feature identification
- **Data Source:** Maxar, Planet, Airbus
- **ZEUS Tools:** ⏳ (commercial, future)
- **Use Case:** Final route verification

---

## 📊 **ZEUS PLATFORM: CURRENT IMPLEMENTATION STATUS**

### ✅ Fully Implemented Fetch Tools (18)

| Category | Tool | Data Type | Resolution | Status |
|----------|------|-----------|------------|--------|
| **Terrain** | `dem_fetch` | DEM (intelligent routing) | 1-30m | ✅ |
| **Terrain** | `tinitaly_fetch` | Italy DEM | 10m | ✅ |
| **Land Cover** | `esa_worldcover_fetch` | Land cover (11 classes) | 10m | ✅ |
| **Land Cover** | `google_dynamicworld_fetch` | Land cover (9 bands) | 10m | ✅ |
| **Hydrology** | `osm_waterways_fetch` | Rivers, streams | Vector | ✅ |
| **Hydrology** | `global_surface_water_fetch` | Water occurrence | 30m | ✅ |
| **Infrastructure** | `osm_roads_fetch` | Roads, highways | Vector | ✅ |
| **Infrastructure** | `osm_railways_fetch` | Railways | Vector | ✅ |
| **Infrastructure** | `osm_power_fetch` | Power transmission | Vector | ✅ |
| **Infrastructure** | `scigrid_gas_pipelines_fetch` | Gas pipelines (EU) | Vector | ✅ |
| **Environmental** | `wdpa_fetch` | Protected areas | Vector | ✅ |
| **Environmental** | `natura2000_fetch` | Natura 2000 (EU) | Vector | ✅ |
| **Geohazards** | `seismic_hazard_fetch` | Seismic hazard | Various | ✅ |
| **Geohazards** | `iffi_fetch` | Landslides (Italy) | Vector | ✅ |
| **Soils** | `soilgrids_fetch` | Soil properties | 250m | ✅ |
| **Regulatory** | `gadm_fetch` | Admin boundaries | Vector | ✅ |
| **Socioeconomic** | `worldpop_fetch` | Population density | 100m | ✅ |
| **Validation** | `sentinel2_fetch` | Satellite imagery | 10-20m | ✅ |

### ✅ Geoprocessing Tools (14)

| Category | Tool | Purpose | Status |
|----------|------|---------|--------|
| **DEM Analysis** | `raster_slope` | Slope calculation | ✅ |
| **DEM Analysis** | `raster_aspect` | Aspect calculation | ✅ |
| **DEM Analysis** | `raster_curvature` | Curvature analysis | ✅ |
| **DEM Analysis** | `raster_threshold` | Value thresholding | ✅ |
| **DEM Analysis** | `raster_hillshade` | Visualization | ✅ |
| **DEM Analysis** | `raster_tri` | Terrain ruggedness | ✅ |
| **Cost Surfaces** | `raster_calc` | Raster algebra | ✅ |
| **Cost Surfaces** | `raster_reclassify` | Value remapping | ✅ |
| **Cost Surfaces** | `raster_boolean` | Boolean overlay | ✅ |
| **Constraints** | `vector_to_raster` | Feature rasterization | ✅ |
| **Constraints** | `raster_proximity` | Distance calculation | ✅ |
| **Constraints** | `vector_buffer` | Buffer zones | ✅ |
| **Extraction** | `raster_extract_by_mask` | Raster clipping | ✅ |
| **Polygonize** | `raster_polygonize` | Raster to vector | ✅ |

### ⏳ Priority Datasets to Implement

1. **Canada CDEM** (20m national DEM) - High O&G priority
2. **Norway DTM** (10m national DEM) - High O&G priority
3. **France RGE ALTI** (5m national DEM) - EU pipeline corridors
4. **ALOS World 3D** (30m global) - Better global fallback
5. **Flood risk maps** - Hydrology constraints
6. **Cadastral parcels** - ROW planning

---

## 🎯 **MINIMUM VIABLE DATASET (MVD) FOR COST OPTIMIZATION**

For a basic but functional pipeline routing project, you **MUST** have:

### Critical (Cannot route without these):
1. ✅ **DEM** (10-30m) - Slope analysis
2. ✅ **Land Cover** (10-30m) - Vegetation costs
3. ✅ **Major Waterways** (vector) - Water crossing costs
4. ✅ **Roads** (vector) - Road crossing costs
5. ✅ **Protected Areas** (vector) - No-go zones

### High Priority (Significant cost impact):
6. ✅ **Railways** (vector) - Very high crossing costs
7. ✅ **Power Lines** (vector) - High crossing costs
8. ✅ **Urban Areas** / Population - High ROW costs
9. ✅ **Administrative Boundaries** - Permitting jurisdictions

### Recommended (Enhanced optimization):
10. ✅ **Soil Data** - Trenching difficulty
11. ⏳ **Flood Risk** - Design requirements
12. ✅ **Seismic Hazard** - Engineering specs

---

## 📋 **PROJECT WORKFLOW CHECKLIST**

### Step 1: Project Initialization ✅
- [ ] Define AOI (bounding box or polygon)
- [ ] Select target CRS (UTM zone for AOI)
- [ ] Set resolution requirements (10m recommended)
- [ ] Create project directory structure

### Step 2: Terrain Data ✅
- [ ] Fetch DEM using intelligent routing
- [ ] Calculate slope
- [ ] Calculate aspect (optional)
- [ ] Generate hillshade (visualization)
- [ ] Create slope cost surface

### Step 3: Land Cover ✅
- [ ] Fetch ESA WorldCover or Dynamic World
- [ ] Reclassify to cost multipliers
- [ ] Validate with satellite imagery

### Step 4: Hydrology ✅
- [ ] Fetch OSM waterways
- [ ] Fetch Global Surface Water
- [ ] Buffer waterways by width
- [ ] Rasterize to crossing cost surface

### Step 5: Infrastructure ✅
- [ ] Fetch OSM roads
- [ ] Fetch OSM railways
- [ ] Fetch OSM power lines
- [ ] Buffer and rasterize each
- [ ] Create infrastructure cost surface

### Step 6: Environmental Constraints ✅
- [ ] Fetch protected areas (WDPA)
- [ ] Fetch Natura 2000 (if EU)
- [ ] Create no-go mask
- [ ] Create constraint cost surface

### Step 7: Regulatory ✅
- [ ] Fetch administrative boundaries
- [ ] Identify permitting jurisdictions
- [ ] Document regulatory requirements (Perplexity search)

### Step 8: Composite Cost Surface ⏳
- [ ] Combine all cost layers using weighted overlay
- [ ] Apply no-go masks
- [ ] Validate cost surface ranges

### Step 9: Route Generation ⏳
- [ ] Define start and end points
- [ ] Run least-cost path analysis
- [ ] Generate multiple corridor alternatives
- [ ] Compare costs and constraints

### Step 10: Validation & Reporting ⏳
- [ ] Visual inspection with hillshade overlay
- [ ] Compare with existing routes (if any)
- [ ] Generate cost breakdown report
- [ ] Export route as vector (GeoJSON/Shapefile)

---

## 💰 **COST SAVINGS IMPACT**

With comprehensive dataset coverage, ZEUS enables:

- **10-15% savings** from optimal terrain routing
- **5-10% savings** from minimized water crossings
- **3-8% savings** from road/railway crossing avoidance
- **2-5% savings** from reduced ROW acquisition costs
- **5-10% savings** from avoided environmental mitigation

**Total Potential: 10%+ construction cost savings**

For a $100M pipeline project: **$10M+ saved**

---

## 📚 **REFERENCES**

- ESA WorldCover: https://worldcover.org/
- WDPA Protected Areas: https://www.protectedplanet.net/
- OpenStreetMap: https://www.openstreetmap.org/
- GADM Administrative Boundaries: https://gadm.org/
- WorldPop: https://www.worldpop.org/
- USGS 3DEP: https://www.usgs.gov/3d-elevation-program
- TINITALY: https://tinitaly.pi.ingv.it/

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-16  
**Status:** ✅ 32/50+ datasets fully implemented in ZEUS

