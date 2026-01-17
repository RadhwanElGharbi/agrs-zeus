# Saudi Arabia Dataset Quick Reference Guide

## 📋 Overview

This guide provides quick access to the **33 best datasets** for pipeline routing in Saudi Arabia, organized by use case.

**Excel File**: `/opt/agrs/docs/coverage/SAUDI_ARABIA_BEST_DATASETS.xlsx`

---

## 🎯 Quick Start: Essential Datasets

### **Minimum Viable Dataset (MVD) for Pipeline Routing**

These 5 datasets provide the core data needed for initial route planning:

| # | Category | Dataset | Resolution | API | Access |
|---|----------|---------|------------|-----|--------|
| 1 | **Elevation** | Copernicus DEM GLO-30 | 30m | ✅ | Free |
| 2 | **Land Cover** | Google Dynamic World | 10m (10 bands) | ✅ | Free |
| 3 | **Hydrology** | Global Surface Water Explorer | 30m | ✅ | Free |
| 4 | **Infrastructure** | OpenStreetMap (roads, utilities) | Vector | ✅ | Free |
| 5 | **Protected Areas** | World Database on Protected Areas | Vector | ✅ | Free |

**Cost**: $0 (all free and open)  
**Setup Time**: ~2 hours (API authentication + data download)

---

## 🏆 Best Datasets by Category

### **1. Elevation/Terrain**

| Dataset | Quality | Resolution | When to Use |
|---------|---------|------------|-------------|
| **Copernicus DEM GLO-30** | ⭐⭐⭐⭐⭐ | 30m | **Default choice** - Best global DEM |
| SRTM 30m | ⭐⭐⭐⭐ | 30m | Fallback if Copernicus unavailable |
| SGS LiDAR DEM | ⭐⭐⭐⭐⭐ | 1-5m | **If available** - Best accuracy for specific corridors |

**Recommendation**: Start with Copernicus DEM. If your pipeline corridor is in a region where SGS has LiDAR data, request it.

---

### **2. Land Cover/Land Use**

| Dataset | Quality | Resolution | When to Use |
|---------|---------|------------|-------------|
| **Google Dynamic World** | ⭐⭐⭐⭐⭐ | 10m (10 bands) | **Primary** - Probability bands enable confidence filtering |
| **ESA WorldCover 2021** | ⭐⭐⭐⭐⭐ | 10m (11 classes) | **Cross-validation** - Use with GDW for consensus |
| Sentinel-2 Level-2A | ⭐⭐⭐⭐⭐ | 10m | **Custom analysis** - For NDVI, NDWI, or custom classification |

**Recommendation**: Use Google Dynamic World (10 bands) as primary. Use ESA WorldCover for validation. Where GDW + ESA agree on urban/protected, high confidence.

**Example Workflow**:
```bash
# 1. Fetch Google Dynamic World (10 bands)
zeus tools google_dynamicworld_fetch --bbox X,Y,A,B --output gdw.tif

# 2. Fetch ESA WorldCover
zeus tools esa_worldcover_fetch --bbox X,Y,A,B --output esa.tif

# 3. Extract high-confidence urban (GDW band 8 > 70% AND ESA = 50)
gdal_calc.py -A gdw.tif --A_band=8 -B esa.tif \
  --outfile high_conf_urban.tif \
  --calc="logical_and(A > 0.70, B == 50)"
```

---

### **3. Hydrology/Water**

| Dataset | Quality | Resolution | When to Use |
|---------|---------|------------|-------------|
| **Global Surface Water Explorer** | ⭐⭐⭐⭐⭐ | 30m | **Primary** - Long-term water dynamics (1984-2021) |
| HydroSHEDS | ⭐⭐⭐⭐ | ~500m | **Drainage basins** - Flow direction, watersheds |
| Saudi MEWA Data | ⭐⭐⭐⭐ | Varies | **If accessible** - National water resources, wadis |
| OSM Waterways | ⭐⭐⭐ | Vector | **Supplement** - Named rivers, canals |

**Recommendation**: Use Global Surface Water for permanent/seasonal water body detection. Use HydroSHEDS for understanding drainage patterns. Request MEWA data for official wadi/aquifer boundaries.

---

### **4. Infrastructure**

#### **Roads**
| Dataset | Quality | Access | When to Use |
|---------|---------|--------|-------------|
| **HERE Technologies Road Network** | ⭐⭐⭐⭐⭐ | Commercial | **Best accuracy** - Speed limits, lanes, road types |
| **OpenStreetMap Roads** | ⭐⭐⭐⭐ | Free (API) | **Good baseline** - Free, good Saudi coverage |

#### **Railways**
| Dataset | Quality | Access | When to Use |
|---------|---------|--------|-------------|
| **OpenStreetMap Railways** | ⭐⭐⭐⭐ | Free (API) | **Primary** - Good coverage of SAR network |

#### **Pipelines**
| Dataset | Quality | Access | When to Use |
|---------|---------|--------|-------------|
| **Saudi Aramco Pipeline Network** | ⭐⭐⭐⭐⭐ | Proprietary | **Essential** - Most comprehensive, requires agreement |
| OSM Pipelines | ⭐⭐ | Free (API) | **Rough reference only** - Incomplete |

**Recommendation**: Use OSM for free baseline. Budget for HERE if high accuracy needed. **Critical**: Engage with Saudi Aramco for existing pipeline data to avoid conflicts.

---

### **5. Protected Areas/Environmental**

| Dataset | Quality | Access | When to Use |
|---------|---------|--------|-------------|
| **Saudi National Center for Wildlife** | ⭐⭐⭐⭐⭐ | Restricted | **Most authoritative** - Official protected areas |
| **World Database on Protected Areas** | ⭐⭐⭐⭐⭐ | Free (API) | **Global baseline** - Monthly updates |
| MODIS Vegetation Indices | ⭐⭐⭐⭐ | Free (API) | **Seasonal monitoring** - Track vegetation changes |

**Recommendation**: Start with WDPA (free, API). Submit request to NCW for official boundaries. Use MODIS NDVI to detect vegetated areas not in official databases.

---

### **6. Geology/Soil**

| Dataset | Quality | Scale | When to Use |
|---------|---------|-------|-------------|
| **Saudi Geological Survey Maps** | ⭐⭐⭐⭐⭐ | 1:50,000–1:250,000 | **Essential** - Geotechnical assessment |
| FAO HWSD v1.2 | ⭐⭐⭐ | 1km | **Broad planning** - Soil types |
| OneGeology Portal | ⭐⭐⭐ | 1:1M | **Quick reference** - Global geology |

**Recommendation**: **Must-have** - Request SGS geological maps for your pipeline corridor. Essential for understanding bedrock, faults, soil suitability.

---

### **7. Climate/Weather**

| Dataset | Quality | Resolution | When to Use |
|---------|---------|------------|-------------|
| **Saudi NCM Data** | ⭐⭐⭐⭐⭐ | Station + gridded | **Most accurate** - National meteorological service |
| **ERA5 Reanalysis** | ⭐⭐⭐⭐⭐ | 31km (hourly) | **Free API** - Historical weather data (1940-present) |
| WorldClim v2.1 | ⭐⭐⭐⭐ | 1km | **Climatology** - Long-term normals |

**Recommendation**: Use ERA5 (free, API) for historical weather analysis. Request NCM data for station observations and forecasts.

---

### **8. Administrative Boundaries**

| Dataset | Quality | Access | When to Use |
|---------|---------|--------|-------------|
| **Saudi GASTAT Boundaries** | ⭐⭐⭐⭐⭐ | Restricted | **Official** - Most authoritative |
| GADM v4.1 | ⭐⭐⭐⭐ | Free | **Good baseline** - Country/province/district |

**Recommendation**: Use GADM for initial planning. Request GASTAT boundaries for permitting/jurisdictional planning.

---

### **9. Population/Demographics**

| Dataset | Quality | Resolution | When to Use |
|---------|---------|------------|-------------|
| **Saudi Census Data (GASTAT)** | ⭐⭐⭐⭐⭐ | Admin unit | **Official** - Most accurate population |
| WorldPop Population Density | ⭐⭐⭐⭐ | 100m | **High resolution** - Gridded population density |

**Recommendation**: Use WorldPop (free, high-res) for identifying populated areas to avoid. Use GASTAT for official statistics.

---

### **10. Satellite Imagery (Commercial)**

| Dataset | Quality | Resolution | Cost | When to Use |
|---------|---------|------------|------|-------------|
| **Maxar WorldView-3** | ⭐⭐⭐⭐⭐ | 0.31m pan, 1.24m multi | $$$ | **High-stakes corridors** - Highest resolution |
| **Airbus Pléiades Neo** | ⭐⭐⭐⭐⭐ | 0.30m pan, 1.2m multi | $$$ | **Daily revisit** - Monitoring, change detection |
| Sentinel-2 Level-2A | ⭐⭐⭐⭐⭐ | 10m | Free | **Baseline** - Free, 5-day revisit |

**Recommendation**: Use Sentinel-2 (free) for broad planning. Purchase Maxar/Airbus for specific high-value corridor sections or disputed areas.

---

## 🚀 Recommended Workflow

### **Phase 1: Data Acquisition (Week 1)**

**Free/Open Datasets (No approval needed)**:
```bash
# 1. Elevation
Download Copernicus DEM GLO-30 from Copernicus Data Space

# 2. Land Cover
zeus tools google_dynamicworld_fetch --bbox X,Y,A,B --output gdw.tif
zeus tools esa_worldcover_fetch --bbox X,Y,A,B --output esa.tif

# 3. Water
Download Global Surface Water Explorer from Google Earth Engine

# 4. Infrastructure
zeus tools osm_roads_fetch --bbox X,Y,A,B --output roads.gpkg
zeus tools osm_railways_fetch --bbox X,Y,A,B --output railways.gpkg
zeus tools osm_waterways_fetch --bbox X,Y,A,B --output waterways.gpkg

# 5. Protected Areas
Download WDPA from Protected Planet

# 6. Boundaries
Download GADM from gadm.org

# 7. Population
Download WorldPop from worldpop.org

# 8. Climate
Download ERA5 via Copernicus Climate Data Store API
```

**Restricted/Request Datasets (Submit requests)**:
- Saudi Geological Survey (SGS): Geological maps, LiDAR DEM
- Saudi National Center for Wildlife (NCW): Protected areas
- Saudi Ministry of Environment, Water & Agriculture (MEWA): Water resources
- Saudi National Center for Meteorology (NCM): Weather data
- Saudi General Authority for Statistics (GASTAT): Official boundaries, census

**Commercial Datasets (Budget/procure)**:
- HERE Technologies: High-accuracy road network
- Maxar/Airbus: High-resolution satellite imagery (if needed)

### **Phase 2: Data Processing (Week 2)**

1. **Create cost surface** from combined datasets
2. **Identify constraints**: Protected areas, urban areas, water bodies
3. **Generate candidate routes** using least-cost path algorithm
4. **Validate routes** with high-resolution imagery (if procured)

### **Phase 3: Engagement (Weeks 3-4)**

1. **Saudi Aramco**: Request existing pipeline data for conflict avoidance
2. **Regulatory authorities**: Present routes for preliminary review
3. **Stakeholder consultation**: Engage with affected communities

---

## 📞 Key Contacts

### **Saudi Arabia Data Providers**

| Organization | Website | Contact Purpose |
|--------------|---------|-----------------|
| **Saudi Geological Survey (SGS)** | https://sgs.org.sa/ | Geological maps, LiDAR DEM |
| **Saudi National Center for Wildlife (NCW)** | https://ncw.gov.sa/ | Protected areas |
| **Saudi Ministry of Environment, Water & Agriculture (MEWA)** | https://www.mewa.gov.sa/ | Water resources |
| **Saudi National Center for Meteorology (NCM)** | https://ncm.gov.sa/ | Weather/climate data |
| **Saudi General Authority for Statistics (GASTAT)** | https://www.stats.gov.sa/ | Boundaries, census |
| **Saudi Aramco** | https://www.aramco.com/ | Existing pipeline data |

---

## 💡 Pro Tips

### **Tip 1: Multi-Dataset Consensus for Urban Areas**
Don't rely on a single land cover dataset. Use consensus:
```python
# High-confidence urban = GDW built prob > 70% AND ESA = 50 (built-up)
# Medium-confidence urban = GDW 50-70% OR ESA = 50 (but not both)
# Disputed/uncertain = GDW < 50% AND ESA = 50 (investigate further)
```

### **Tip 2: Leverage Google Earth Engine for Batch Processing**
Many datasets (GDW, GSWE, ERA5) are available via GEE. Write Python scripts to:
- Export multiple AOIs at once
- Generate time-series composites
- Calculate derived indices (NDVI, NDWI, slope, aspect)

### **Tip 3: SGS Geological Maps Are Non-Negotiable**
For pipeline routing, you **must** have geological data. SGS maps show:
- Bedrock types
- Fault lines
- Soil depth
- Landslide susceptibility
- Seismic zones

**Action**: Contact SGS early in your project timeline.

### **Tip 4: Saudi Aramco Engagement Is Critical**
Aramco manages 18,000+ km of pipelines in Saudi Arabia. Not coordinating with them can lead to:
- Route conflicts
- Safety issues
- Regulatory rejection

**Action**: Formal request to Saudi Aramco's Pipeline Planning Division.

### **Tip 5: Use Commercial Imagery Strategically**
Don't buy imagery for your entire corridor. Use free Sentinel-2 as baseline, then purchase high-res imagery for:
- Disputed land cover areas (is it urban or not?)
- Crossing points (rivers, roads, railways)
- Protected area boundaries (verify exact extent)
- High-consequence areas (population centers)

**Savings**: Can reduce imagery costs by 80-90%.

---

## 📊 Dataset Statistics

### **By Access Type**
- **Open/Free**: 23 datasets (70%)
- **Restricted (requestable)**: 7 datasets (21%)
- **Commercial**: 3 datasets (9%)

### **By API Availability**
- **With API**: 19 datasets (58%)
- **No API (download only)**: 14 datasets (42%)

### **By Quality Rating**
- **5 stars**: 17 datasets (52%) - Best-in-class
- **4 stars**: 9 datasets (27%) - High quality
- **≤3 stars**: 7 datasets (21%) - Adequate/fallback

### **Coverage**
- **Global datasets**: 18 (55%)
- **Regional/National datasets**: 15 (45%)

---

## 🎯 Success Metrics

A **complete dataset package** for Saudi Arabia pipeline routing should include:

✅ **Elevation** - Copernicus DEM GLO-30 (minimum) + SGS LiDAR (if available)  
✅ **Land Cover** - Google Dynamic World (10 bands) + ESA WorldCover  
✅ **Hydrology** - Global Surface Water + HydroSHEDS  
✅ **Infrastructure** - OSM (free) or HERE (commercial) for roads + OSM railways  
✅ **Pipelines** - Saudi Aramco data (critical!)  
✅ **Protected Areas** - WDPA (baseline) + NCW (official)  
✅ **Geology** - SGS geological maps (essential!)  
✅ **Climate** - ERA5 or NCM data  
✅ **Boundaries** - GADM or GASTAT  
✅ **Population** - WorldPop  

**10/10 = Gold Standard** - Proceed with high confidence  
**8-9/10 = Good** - Acceptable for route planning  
**<8/10 = Incomplete** - Identify missing datasets before proceeding

---

**Document Version**: 1.0  
**Date**: 2025-10-06  
**For**: Saudi Arabia pipeline routing projects  
**Excel File**: `/opt/agrs/docs/coverage/SAUDI_ARABIA_BEST_DATASETS.xlsx`

