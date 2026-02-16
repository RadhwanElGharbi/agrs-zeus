# Pipeline Routing: GIS Dataset Categories Summary

**Purpose:** Master reference for all geospatial dataset categories required for oil & gas pipeline routing projects.

**Date:** 2025-10-17  
**Status:** Comprehensive categorization based on Perplexity research  
**Goal:** Enable 10%+ construction cost savings through complete data coverage

---

## 📊 **DATASET CATEGORY STRUCTURE**

### 1. **TERRAIN & TOPOGRAPHY** (Raster)
- **Primary:** Digital Elevation Models (DEMs)
- **Derived:** Slope, Aspect, Curvature, Hillshade, TRI
- **CSV Inventory:** ✅ `/opt/agrs/data/dem_datasets_inventory.csv` (98 entries)
- **Resolution:** 1m to 30m (higher = better)
- **Critical for:** Cost multipliers, cut/fill estimation, terrain difficulty

### 2. **LAND COVER & LAND USE** (Raster)
- **Primary:** Global/national land cover classifications
- **Classes:** Forest, grassland, cropland, urban, bare, water, wetlands
- **CSV Inventory:** ⏳ To be created: `landcover_datasets_inventory.csv`
- **Resolution:** 10m to 30m
- **Critical for:** Vegetation clearing costs, compensation, mitigation

### 3. **HYDROLOGY & WATER FEATURES** (Vector + Raster)
- **Primary:** Rivers, streams, lakes, wetlands, surface water
- **CSV Inventory:** ⏳ To be created: `hydrology_datasets_inventory.csv`
- **Resolution:** Vector (OSM) + 30m raster (GSW)
- **Critical for:** Water crossing costs (HDD), environmental mitigation

### 4. **INFRASTRUCTURE & CROSSINGS** (Vector)
- **Primary:** Roads, railways, power lines, existing pipelines
- **CSV Inventory:** ⏳ To be created: `infrastructure_datasets_inventory.csv`
- **Resolution:** Vector features with attributes
- **Critical for:** Crossing costs (roads 3-50x, railways 20-40x)

### 5. **ENVIRONMENTAL & PROTECTED AREAS** (Vector)
- **Primary:** Protected areas, Natura 2000, wildlife habitats
- **CSV Inventory:** ⏳ To be created: `protected_areas_datasets_inventory.csv`
- **Resolution:** Vector polygons with IUCN categories
- **Critical for:** No-go zones, permitting constraints, mitigation costs

### 6. **GEOHAZARDS & GEOLOGICAL** (Raster + Vector)
- **Primary:** Seismic hazards, landslides, soil properties, karst
- **CSV Inventory:** ⏳ To be created: `geohazards_datasets_inventory.csv`
- **Resolution:** Variable (30m to vector)
- **Critical for:** Engineering design, avoidance, stability

### 7. **REGULATORY & ADMINISTRATIVE** (Vector)
- **Primary:** Administrative boundaries, zoning
- **CSV Inventory:** ✅ Created: `administrative_datasets_inventory.csv` (76 entries)
- **Resolution:** Vector polygons (country/state/district/municipality)
- **Critical for:** Permitting jurisdictions, regulatory compliance

### 7B. **CADASTRE & LAND PARCELS** (Vector)
- **Primary:** Cadastral parcels, property boundaries, land ownership
- **CSV Inventory:** ✅ Created: `cadastre_datasets_inventory.csv` (84 entries)
- **Resolution:** Vector polygons (property-level precision)
- **Critical for:** ROW acquisition, landowner identification, easements

### 8. **SOCIOECONOMIC & CULTURAL** (Raster + Vector)
- **Primary:** Population density, heritage sites, indigenous territories
- **CSV Inventory:** ⏳ To be created: `socioeconomic_datasets_inventory.csv`
- **Resolution:** 100m to 1km (population), vector (sites)
- **Critical for:** ROW costs, stakeholder engagement, consultation

### 9. **CLIMATE & ENVIRONMENTAL CONDITIONS** (Raster)
- **Primary:** Temperature, precipitation, snow/ice, permafrost
- **CSV Inventory:** ⏳ To be created: `climate_datasets_inventory.csv`
- **Resolution:** 1km (WorldClim) to 30km (ERA5)
- **Critical for:** Construction windows, seasonal access, design specs

### 10. **VALIDATION & REFERENCE** (Raster)
- **Primary:** Satellite imagery (Sentinel-2, Landsat, commercial)
- **CSV Inventory:** ⏳ To be created: `imagery_datasets_inventory.csv`
- **Resolution:** 10m (Sentinel-2) to <1m (commercial)
- **Critical for:** Visual validation, ground-truthing, feature verification

---

## 🎯 **CSV INVENTORY REQUIREMENTS**

Each CSV inventory will include the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `Country` | Country name | USA |
| `Country_Code` | ISO 3166-1 alpha-2 | US |
| `Dataset_Name` | Full dataset name | ESA WorldCover 2021 |
| `Provider` | Data provider/agency | ESA |
| `Resolution_m` | Spatial resolution in meters | 10 |
| `Data_Type` | Raster or Vector | Raster |
| `Coverage` | Geographic coverage | Global |
| `Fetch_Tool` | ZEUS fetch tool name | esa_worldcover_fetch |
| `License` | Data license type | Free / Open / Commercial |
| `Update_Frequency` | How often updated | Annual / Monthly / Static |
| `Notes` | Additional details | 11 land cover classes |

---

## 📋 **TIER 1 OIL & GAS COUNTRY PRIORITY**

All CSV inventories will prioritize coverage for:

### Tier 1 Oil & Gas Producing Countries (24):
- USA, Saudi Arabia, Russia, Canada, Iraq, China
- UAE, Iran, Brazil, Kuwait, Venezuela, Norway
- Mexico, Nigeria, Algeria, Qatar, Angola, Libya
- Kazakhstan, Oman, Australia, Indonesia, Malaysia
- Azerbaijan, Egypt

### EU Pipeline Transit Countries (28):
- Italy, France, Germany, Spain, UK, Netherlands
- Belgium, Switzerland, Austria, Sweden, Denmark
- Finland, Poland, Czech Republic, Portugal, Greece
- Ireland, Romania, Hungary, Bulgaria, Croatia
- Slovenia, Slovakia, Lithuania, Latvia, Estonia
- Luxembourg, Malta, Cyprus

**Total Priority Countries:** 52

---

## 📈 **CURRENT IMPLEMENTATION STATUS**

### ✅ Completed Inventories (11 categories):
1. **DEM (Terrain):** `/opt/agrs/data/dem_datasets_inventory.csv` (96 entries)
2. **Land Cover:** `/opt/agrs/data/landcover_datasets_inventory.csv` (56 entries)
3. **Hydrology:** `/opt/agrs/data/hydrology_datasets_inventory.csv` (61 entries)
4. **Infrastructure:** `/opt/agrs/data/infrastructure_datasets_inventory.csv` (75 entries)
5. **Protected Areas:** `/opt/agrs/data/protected_areas_datasets_inventory.csv` (56 entries)
6. **Geohazards:** `/opt/agrs/data/geohazards_datasets_inventory.csv` (74 entries)
7. **Administrative:** `/opt/agrs/data/administrative_datasets_inventory.csv` (76 entries)
8. **Cadastre:** `/opt/agrs/data/cadastre_datasets_inventory.csv` (84 entries)
9. **Socioeconomic:** `/opt/agrs/data/socioeconomic_datasets_inventory.csv` (70 entries)
10. **Climate:** `/opt/agrs/data/climate_datasets_inventory.csv` (80 entries)
11. **Imagery:** `/opt/agrs/data/imagery_datasets_inventory.csv` (73 entries)

**Total: 801 unique dataset entries**

---

## 🔍 **PERPLEXITY RESEARCH QUERIES**

For each category, we will run deep Perplexity searches with these queries:

### Template Query:
```
"For oil & gas pipeline routing projects, I need a comprehensive list of [CATEGORY] 
geospatial datasets available for Tier 1 oil & gas producing countries and EU countries. 

For each dataset, provide:
1. Dataset name
2. Provider/agency
3. Spatial resolution
4. Geographic coverage (country-specific or global)
5. Data type (raster/vector)
6. Access method (free/open/commercial)
7. Update frequency
8. Download/API availability

Focus on:
- USA, Saudi Arabia, Russia, Canada, Iraq, China, UAE, Iran, Brazil, Kuwait, 
  Venezuela, Norway, Mexico, Nigeria, Algeria, Qatar, Angola, Libya, Kazakhstan, 
  Oman, Australia, Indonesia, Malaysia, Azerbaijan, Egypt
- EU27 countries (especially Italy, France, Germany, Spain for pipeline transit)

Provide sources and URLs for each dataset."
```

### Specific Queries by Category:
1. **Land Cover:** "land cover classification datasets with vegetation types"
2. **Hydrology:** "hydrography datasets including rivers, streams, lakes, wetlands"
3. **Infrastructure:** "infrastructure datasets including roads, railways, power lines, pipelines"
4. **Protected Areas:** "protected areas datasets including national parks, nature reserves, Natura 2000"
5. **Geohazards:** "geohazard datasets including seismic zones, landslides, soil properties"
6. **Administrative:** "administrative boundary datasets and cadastral parcel data"
7. **Socioeconomic:** "population density, settlement, and demographic datasets"
8. **Climate:** "climate datasets including temperature, precipitation, snow/ice"
9. **Imagery:** "satellite imagery sources including Sentinel, Landsat, commercial providers"

---

## 💡 **NEXT STEPS**

1. ✅ Move checklist to `/opt/agrs/data/docs/`
2. ✅ Create this summary document
3. ⏳ Run 9 Perplexity searches (one per category)
4. ⏳ Create 9 CSV inventories based on research
5. ⏳ Validate CSV entries against ZEUS fetch tools
6. ⏳ Update ZEUS documentation with new inventories

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-17  
**Status:** Planning phase - research to begin

