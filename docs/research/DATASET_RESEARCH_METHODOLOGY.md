# Dataset Research Methodology

## Overview

This document outlines the methodology used to research and compile the **best available datasets** for oil & gas pipeline routing on a per-country basis. Unlike the generic global dataset coverage registry, this focused approach identifies the **highest quality regional and national datasets** that may be superior to global alternatives.

---

## Objectives

1. **Identify Best-in-Class Datasets**: For each country, find the highest quality, most accurate datasets across all relevant categories.
2. **Prioritize Regional Over Global**: When a regional/national dataset is superior to a global one, prioritize it.
3. **Document API Availability**: Essential for automation and integration into ZEUS pipeline routing workflows.
4. **Assess Quality**: Rate datasets on a 1-5 scale based on resolution, accuracy, currency, and relevance.
5. **Note Access Requirements**: Distinguish between open/free, restricted/request-based, and commercial datasets.

---

## Data Categories for Pipeline Routing

### 1. **Elevation/Terrain**
- **Purpose**: Understand topography, slope, aspect for route optimization
- **Key Metrics**: Resolution (1m-30m preferred), vertical accuracy (±5m or better)
- **Datasets Sought**:
  - National LiDAR-derived DEMs (highest priority)
  - Regional high-resolution DEMs (Copernicus DEM GLO-30, ALOS PALSAR)
  - Global baselines (SRTM, ASTER GDEM)

### 2. **Land Cover/Land Use**
- **Purpose**: Identify urban areas, vegetation, agricultural land to avoid or account for
- **Key Metrics**: Resolution (10m-30m), number of classes, temporal coverage
- **Datasets Sought**:
  - National land use maps (often most detailed)
  - Regional land cover products
  - Global datasets with confidence/probability bands (ESA WorldCover, Google Dynamic World)

### 3. **Hydrology/Water**
- **Purpose**: Identify rivers, lakes, wetlands, wadis, drainage basins for crossing planning
- **Key Metrics**: Completeness, seasonal/permanent distinction, flow data
- **Datasets Sought**:
  - National water resource databases
  - Regional hydrography networks
  - Global surface water datasets

### 4. **Infrastructure**
- **Roads**: Identify road crossings, access routes for construction
- **Railways**: Identify rail crossings, clearance requirements
- **Utilities**: Power lines, existing pipelines, telecom infrastructure
- **Pipelines**: Existing pipeline networks to avoid conflicts or leverage corridors

### 5. **Protected Areas/Environmental**
- **Purpose**: Identify environmental constraints (parks, reserves, wildlife areas)
- **Key Metrics**: Official designation, legal status, boundary accuracy
- **Datasets Sought**:
  - National environmental agencies (most authoritative)
  - World Database on Protected Areas (WDPA)

### 6. **Geology/Soil**
- **Purpose**: Geotechnical assessment, soil suitability for pipeline burial
- **Key Metrics**: Scale (1:50,000 to 1:250,000), detail level
- **Datasets Sought**:
  - National geological surveys (highest priority)
  - Regional soil databases
  - Global harmonized products (FAO HWSD)

### 7. **Climate/Weather**
- **Purpose**: Understand precipitation, temperature, wind patterns affecting construction
- **Key Metrics**: Temporal resolution, spatial resolution, historical extent
- **Datasets Sought**:
  - National meteorological services
  - Regional climate datasets
  - Global reanalysis products (ERA5)

### 8. **Administrative Boundaries**
- **Purpose**: Jurisdictional planning, permitting zones
- **Key Metrics**: Official status, currency
- **Datasets Sought**:
  - National statistical agencies (official boundaries)
  - GADM (backup)

### 9. **Population/Demographics**
- **Purpose**: Avoid densely populated areas, plan for social impact
- **Key Metrics**: Resolution (100m-1km), temporal coverage
- **Datasets Sought**:
  - National census data
  - WorldPop, LandScan

### 10. **Satellite Imagery (Commercial)**
- **Purpose**: High-resolution visual reference for detailed route planning
- **Key Metrics**: Resolution (<1m preferred), temporal coverage, multispectral bands
- **Datasets Sought**:
  - Maxar WorldView-3/4
  - Airbus Pléiades Neo
  - Planet SkySat

---

## Research Process

### Phase 1: Initial Research
For each country, conduct web searches for:
1. **National geospatial portals**: "Country name + national spatial data infrastructure"
2. **Government agencies**: Geological survey, environmental ministry, statistics bureau
3. **Academic/research sources**: University collaborations, open science initiatives
4. **International organizations**: World Bank, UN, regional bodies (e.g., ESCWA for Middle East)

### Phase 2: Dataset Evaluation
For each identified dataset, assess:

#### **Quality Rating (1-5 stars)**
- **5 stars**: Best-in-class, highest resolution/accuracy, current, well-documented
- **4 stars**: High quality, minor limitations (older, medium resolution, etc.)
- **3 stars**: Adequate, suitable for initial planning but may need supplementation
- **2 stars**: Low quality or very outdated, use as last resort
- **1 star**: Not recommended (severe accuracy/completeness issues)

#### **Evaluation Criteria**
- **Resolution/Scale**: Higher is better (for rasters/maps)
- **Temporal Coverage**: More recent is better, continuous updates preferred
- **Accuracy**: Documented accuracy metrics (positional, thematic, vertical)
- **Completeness**: Full coverage of country/region
- **Documentation**: Metadata, user guides, licensing clarity
- **Access**: Open > Restricted (requestable) > Commercial
- **API Availability**: Programmatic access for automation

### Phase 3: Documentation
For each dataset, record:
- **Category**: Primary use case (Elevation, Land Cover, etc.)
- **Dataset Name**: Official name
- **Source/Provider**: Organization responsible
- **Resolution/Scale**: Spatial resolution (for rasters) or map scale (for vectors)
- **Temporal Coverage**: Date range, snapshot date, or "current"
- **Update Frequency**: Static, annual, monthly, continuous, etc.
- **Access**: Open (Free), Restricted (requires request), Commercial (purchase required)
- **API Available**: Yes/No, with API name if applicable
- **URL**: Official download/access page
- **Quality Rating**: 1-5 stars
- **Notes**: Why this dataset is best for this country, limitations, alternatives

---

## Saudi Arabia: Pilot Country Example

### Summary
**33 datasets identified** across 14 categories:
- **17 datasets** rated 5 stars (best-in-class)
- **9 datasets** rated 4 stars (high quality)
- **7 datasets** rated 3 stars or lower (adequate/fallback)

### Key Findings

#### **Elevation/Terrain**
- **Best**: Copernicus DEM GLO-30 (30m, global, superior to SRTM)
- **Regional**: Saudi Geological Survey may have LiDAR-derived DEMs for specific corridors (inquire)
- **API**: Yes (via Copernicus Data Space)

#### **Land Cover**
- **Best**: ESA WorldCover 2021 + Google Dynamic World (both 10m)
- **Advantage**: GDW provides 10 bands (label + 9 probabilities) for confidence-based classification
- **API**: GDW via Google Earth Engine, ESA via download

#### **Hydrology**
- **Best**: Global Surface Water Explorer (30m, 1984-2021)
- **Regional**: Saudi Ministry of Environment, Water & Agriculture (if accessible)
- **API**: Yes (via Google Earth Engine for GSWE)

#### **Infrastructure**
- **Roads**: OpenStreetMap (free, API) or HERE Technologies (commercial, highest quality)
- **Pipelines**: Saudi Aramco (proprietary, requires agreement) - most comprehensive
- **Utilities**: World Bank electricity data (open, API)

#### **Protected Areas**
- **Best**: Saudi National Center for Wildlife (official, most authoritative)
- **Fallback**: WDPA (global, monthly updates, API)

#### **Geology/Soil**
- **Best**: Saudi Geological Survey geological maps (1:50,000 to 1:250,000)
- **Access**: Restricted (requires request/purchase)
- **Essential for geotechnical assessment**

#### **Climate**
- **Best**: Saudi National Center for Meteorology (station + gridded data)
- **Global**: ERA5 Reanalysis (hourly, 31km, free API)

#### **Commercial Imagery**
- **Best**: Maxar WorldView-3 (0.31m) or Airbus Pléiades Neo (0.30m)
- **Use case**: Detailed route planning, ground-truthing
- **API**: Yes (both providers)

### Recommendations for Saudi Arabia
1. **Prioritize national sources**: SGS (geology), NCW (protected areas), NCM (climate)
2. **Use global datasets as baseline**: Copernicus DEM, ESA WorldCover, Google Dynamic World
3. **Leverage APIs**: Google Earth Engine, Copernicus Data Space, World Bank API
4. **Engage with Saudi Aramco**: For existing pipeline data (critical for conflict avoidance)
5. **Consider commercial imagery**: For high-stakes corridors or disputed areas

---

## Tier 1 Countries (Next)

Following the Saudi Arabia pilot, research will proceed for these high-priority oil & gas producing countries:

### Middle East/Gulf
- United Arab Emirates (UAE)
- Kuwait
- Qatar
- Oman
- Bahrain
- Iraq
- Iran

### North America
- United States
- Canada
- Mexico

### Europe
- Norway
- United Kingdom

### Africa
- Nigeria
- Algeria
- Libya
- Egypt

### Central Asia
- Russia
- Kazakhstan
- Turkmenistan
- Azerbaijan

### South America
- Venezuela
- Brazil

---

## Methodology Validation

### Success Criteria
- ✅ Comprehensive coverage of all data categories
- ✅ Mix of open, restricted, and commercial datasets documented
- ✅ API availability clearly indicated
- ✅ Quality ratings assigned based on objective criteria
- ✅ Regional datasets prioritized where superior to global options
- ✅ Notes field provides actionable guidance

### Next Steps
1. **User validation** of Saudi Arabia dataset registry
2. **Methodology refinement** based on user feedback
3. **Scale to remaining Tier 1 countries** (17 countries total)
4. **Tier 2 expansion** (additional countries as needed)
5. **Integration into ZEUS** (automated dataset fetching based on AOI country)

---

## File Outputs

### Excel Format
- **File**: `SAUDI_ARABIA_BEST_DATASETS.xlsx`
- **Location**: `/opt/agrs/docs/coverage/`
- **Features**:
  - Color-coded quality ratings (green=5★, yellow=4★, red=≤3★)
  - API availability highlighted in green
  - Frozen header rows for easy scrolling
  - Column widths optimized for readability
  - Wrapped text in Notes column

### CSV Format (Backup)
- **File**: `/tmp/saudi_arabia_datasets.csv`
- **Use case**: For programmatic processing, database import, or conversion to other formats

---

## Quality Assurance

### Verification Steps
1. **URL validation**: All URLs checked for accessibility
2. **API confirmation**: API availability verified against official documentation
3. **Version check**: Latest dataset versions identified
4. **Cross-reference**: Multiple sources consulted to confirm dataset characteristics
5. **Currency check**: "Last updated" dates noted where available

### Limitations
- **Proprietary datasets**: Details may be incomplete if not publicly documented
- **Access requirements**: Some datasets require formal agreements or purchase
- **Regional variations**: Some datasets may have better coverage in certain areas within a country
- **Temporal gaps**: Historical datasets may not reflect recent developments

---

**Document Version**: 1.0  
**Date**: 2025-10-06  
**Author**: AGRS-ZEUS Dataset Research Team  
**Status**: Pilot methodology validated with Saudi Arabia

