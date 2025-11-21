# US_PIPELINE Data Directory

**Project**: US_PIPELINE  
**Location**: Wyoming, USA (~105°W, 44.5°N)  
**Target CRS**: EPSG:32613 (WGS 84 / UTM zone 13N)  
**Last Updated**: 2025-11-20

---

## 📁 Directory Structure

```
data/
├── rasters/
│   ├── raw/                    # Original fetched rasters (unmodified)
│   ├── processed/              # Reprojected and clipped to EPSG:32613
│   ├── dem.tif -> processed/... # Convenience symlinks
│   └── landcover.tif -> ...
├── vectors/
│   ├── raw/                    # Original fetched vectors (unmodified)
│   ├── processed/              # Reprojected and clipped to EPSG:32613
│   ├── roads.gpkg -> processed/...
│   └── railways.gpkg -> ...
├── fetch_all_datasets.sh       # Master fetch orchestration script
├── process_all_datasets.sh     # Post-fetch processing script
├── DATASETS_REQUIRED.md        # Comprehensive dataset inventory
├── metadata_template.json      # Metadata template for datasets
├── fetch_log.txt               # Fetch operation log
├── processing_log.txt          # Processing operation log
└── README.md                   # This file
```

---

## 🚀 Quick Start

### 1. Fetch All Critical Datasets

```bash
cd /opt/agrs/Projects/US_PIPELINE/data
./fetch_all_datasets.sh --priority critical
```

### 2. Process Raw Data to Target CRS

```bash
./process_all_datasets.sh
```

### 3. Verify Dataset Availability

```bash
ls -lh rasters/processed/
ls -lh vectors/processed/
```

---

## 📋 Dataset Status

### Critical Datasets (Required for PIRL)

| Dataset | Status | Source | Resolution | CRS | Notes |
|---------|--------|--------|------------|-----|-------|
| DEM | ⏳ Pending | USGS 3DEP | 10m | 32613 | Terrain analysis |
| Land Cover | ⏳ Pending | NLCD 2021 | 30m | 5070→32613 | Cost multipliers |
| Roads | ⏳ Pending | OSM | Vector | 4326→32613 | HDD crossings |
| Railways | ⏳ Pending | OSM + FRA | Vector | 4326→32613 | HDD crossings |
| Powerlines | ⏳ Pending | OSM + HIFLD | Vector | 4326→32613 | Clearances |
| Hydrology | ⏳ Pending | NHD HR | Vector | 4269→32613 | Water crossings |

### High Priority Datasets

| Dataset | Status | Source | Resolution | CRS | Notes |
|---------|--------|--------|------------|-----|-------|
| Protected Areas | ⏳ Pending | PAD-US | Vector | 5070→32613 | No-go zones |
| Buildings | ⏳ Pending | OSM | Vector | 4326→32613 | Safety buffers |
| Soil | ⏳ Pending | SSURGO | Variable | Multiple | Geotechnical |
| Boundaries | ⏳ Pending | TIGER | Vector | 4269→32613 | Jurisdictions |

### Medium Priority Datasets

| Dataset | Status | Source | Resolution | CRS | Notes |
|---------|--------|--------|------------|-----|-------|
| Population | ⏳ Pending | LandScan | 100m | 4326→32613 | Proximity |
| Seismic | ⏳ Pending | USGS | Variable | 4326→32613 | Risk assessment |
| Landslide | ⏳ Pending | USGS | Variable | 4326→32613 | Stability |
| Climate | ⏳ Pending | PRISM | 800m | 4269→32613 | Environmental |

**Legend:**
- ✅ Available and processed
- ⏳ Pending fetch
- ⚠️ Fetch failed / needs attention
- ❌ Not available

---

## 🔧 Usage

### Fetch Operations

**Dry run (preview what will be fetched):**
```bash
./fetch_all_datasets.sh --dry-run
```

**Fetch only critical datasets:**
```bash
./fetch_all_datasets.sh --priority critical
```

**Fetch all datasets:**
```bash
./fetch_all_datasets.sh
```

### Processing Operations

**Process all raw datasets:**
```bash
./process_all_datasets.sh
```

**Process with verbose output:**
```bash
./process_all_datasets.sh --verbose
```

**Process specific dataset:**
```bash
./process_all_datasets.sh --dataset dem
```

---

## 📊 Data Sources

### US Government Sources
- **USGS** - Elevation (3DEP), hydrology (NHD), protected areas (PAD-US), hazards
- **MRLC** - Land cover (NLCD)
- **US Census** - Roads (TIGER), boundaries, population
- **USDA NRCS** - Soil data (SSURGO)
- **USDOT/FRA** - Railway network
- **HIFLD** - Critical infrastructure (powerlines)

### Community Sources
- **OpenStreetMap** - Roads, railways, powerlines, buildings, water features
- **Oregon State** - Climate data (PRISM)
- **Oak Ridge** - Population (LandScan)

---

## 📝 Metadata Standards

Every dataset MUST have an accompanying `.json` metadata file with:
- Source and provider information
- Fetch date and tool used
- CRS (raw and processed)
- Resolution and format
- Extent and bounding box
- License and attribution

See `metadata_template.json` for the full structure.

---

## ⚠️ Important Notes

### Zero Tolerance for Placeholder Data
- **NEVER** create synthetic or placeholder datasets
- **NEVER** use constant-value rasters as substitutes
- **ALWAYS** fetch real, authoritative data
- If real data is unavailable, mark as missing - DO NOT fake it

### Raw Data Preservation
- All fetched data stored in `raw/` subdirectories
- Raw files NEVER modified after fetch
- Original CRS and extent preserved
- Processing creates new files in `processed/`

### CRS Requirements
- Target CRS: **EPSG:32613** (WGS 84 / UTM zone 13N)
- All processed datasets must be in target CRS
- Wyoming spans UTM zones 12N and 13N - this AOI is in 13N

---

## 🔗 Related Documentation

- `DATASETS_REQUIRED.md` - Comprehensive dataset inventory
- `../docs/project_confirmation_report.md` - Project setup details
- `/opt/agrs/docs/Project Instructions/DATASET_FETCHING_PROTOCOLS.md` - Mandatory standards

---

## 📞 Support

For issues with:
- **Dataset fetching**: Check `fetch_log.txt`
- **Data processing**: Check `processing_log.txt`
- **Missing data**: Refer to `DATASETS_REQUIRED.md` for source URLs
- **CRS issues**: Verify project_metadata.json has correct EPSG code

---

**Maintained By**: AGRS ZEUS Dataset Management System  
**Compliance**: DATASET_FETCHING_PROTOCOLS.md  
**Project Lead**: Radwan El Gharbi



