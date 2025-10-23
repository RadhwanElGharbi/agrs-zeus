# Intelligent DEM Routing System

## Overview

The ZEUS platform now includes an **Intelligent DEM Routing System** that automatically selects the best available Digital Elevation Model (DEM) dataset based on:

1. **Geographic Location** (Area of Interest)
2. **Target Resolution** (1m, 5m, 10m, 30m, etc.)
3. **Data Availability** (implemented fetch tools)

When you request a DEM using `zeus tools dem_fetch` with `--provider auto` (the default), the system:
- Detects the country/region from the AOI coordinates
- Consults a comprehensive DEM inventory database
- Selects the highest-quality, highest-resolution available dataset
- Automatically delegates to the appropriate specialized fetch tool

---

## Usage

### Basic Syntax

```bash
zeus tools dem_fetch --bbox MINX,MINY,MAXX,MAXY --res RESOLUTION -o OUTPUT.tif
```

### Examples

#### Example 1: Italy (10m TINITALY)

```bash
zeus tools dem_fetch --bbox 13.5,42.8,13.9,43.2 --res 10m -o italy_dem.tif
```

**Result:**
```
📍 Location: 43°N, 13.7°E
🗺️  Detected Country/Region: IT
🎯 Target Resolution: 10m

✅ Selected DEM Dataset:
   Name:       TINITALY 10m
   Provider:   INGV
   Resolution: 10m
   Coverage:   Italy (national)
   Tool:       tinitaly_fetch
   License:    Free Research

🔄 Delegating to tinitaly_fetch tool...
```

The system automatically uses the TINITALY 10m DEM (best available for Italy).

#### Example 2: Saudi Arabia (30m SRTM)

```bash
zeus tools dem_fetch --bbox 46.5,24.5,46.9,24.9 --res 30m -o saudi_dem.tif
```

**Result:**
```
📍 Location: 24.7°N, 46.7°E
🗺️  Detected Country/Region: SA
🎯 Target Resolution: 30m

✅ Selected DEM Dataset:
   Name:       SRTM 30m
   Provider:   NASA/USGS
   Resolution: 30m
   Coverage:   Global coverage
   Tool:       dem_fetch (srtm)

✅ Using internal provider: srtm
```

For Saudi Arabia, the system uses SRTM 30m (best currently available for KSA).

#### Example 3: USA Texas (10m 3DEP)

```bash
zeus tools dem_fetch --bbox -97.5,29.5,-97.1,29.9 --res 10m -o texas_dem.tif
```

**Result:**
```
📍 Location: 29.7°N, -97.3°E
🗺️  Detected Country/Region: US
🎯 Target Resolution: 10m

✅ Selected DEM Dataset:
   Name:       3DEP 10m DEM
   Provider:   USGS
   Resolution: 10m
   Coverage:   USA (national)

✅ Using internal provider: usgs13
```

#### Example 4: Manual Provider Override

If you want to force a specific provider, use `--provider`:

```bash
zeus tools dem_fetch --bbox 13.5,42.8,13.9,43.2 --provider srtm --res 30m -o italy_srtm.tif
```

This bypasses the intelligent routing and uses SRTM directly.

---

## DEM Dataset Inventory

The system maintains a comprehensive inventory of DEM datasets at `/opt/agrs/data/dem_datasets_inventory.csv` covering:

### Tier 1 Oil & Gas Countries
- **USA**: 3DEP (1m, 10m, 30m)
- **Saudi Arabia**: SRTM 30m
- **Russia**: ALOS World 3D, SRTM
- **Canada**: CDEM 20m, HRDEM 1-2m
- **Iraq**: SRTM 30m
- **UAE**: SRTM 30m, ALOS 30m
- **Iran**: SRTM 30m
- **Brazil**: SRTM 30m
- **Kuwait**: SRTM 30m
- **Qatar**: SRTM 30m
- **Norway**: DTM 1m, 10m
- **Mexico**: SRTM 30m, INEGI 15m
- **Nigeria**: SRTM 30m
- **Algeria**: SRTM 30m
- **Angola**: SRTM 30m
- **Libya**: SRTM 30m
- **Kazakhstan**: SRTM 30m
- **Oman**: SRTM 30m
- **Australia**: ELVIS 5m
- **Indonesia**: DEMNAS 8m
- **Malaysia**: SRTM 30m
- **Azerbaijan**: SRTM 30m
- **Egypt**: SRTM 30m

### European Union Countries
- **Italy**: TINITALY 10m ✅ (implemented)
- **France**: RGE ALTI 1m, 5m
- **Germany**: DGM 1m, 5m, 10m
- **Spain**: MDT 2m, 5m
- **UK**: LIDAR 1m, Terrain 5m
- **Netherlands**: AHN 0.5m
- **Belgium**: DTM 1m
- **Austria**: DGM 10m
- **Switzerland**: swissALTI3D 0.5m
- **Norway**: DTM 1m, 10m
- **Sweden**: Laserdata 0.5-2m
- **Denmark**: DHM 0.4m
- **Finland**: NLS DEM 2m
- **Poland**: CODGiK 1m
- **Czech Republic**: DMR 5m
- And all other EU countries...

### Global Fallbacks
- **SRTM 30m**: Global coverage (60°N - 56°S) ✅ (implemented)
- **ASTER GDEM**: Global coverage (83°N - 83°S)
- **ALOS World 3D**: Global coverage, high quality
- **Copernicus DEM 30m**: Global coverage
- **FABDEM**: Global, forest-corrected

---

## Implementation Status

### ✅ Fully Implemented DEM Fetch Tools

| Tool | Coverage | Resolution | Status |
|------|----------|------------|--------|
| `dem_fetch (srtm)` | Global (60°N-56°S) | 30m | ✅ Implemented |
| `dem_fetch (usgs13)` | USA | 10m | ✅ Implemented |
| `dem_fetch (usgs1m)` | USA (partial) | 1m | ✅ Implemented |
| `tinitaly_fetch` | Italy | 10m | ✅ Implemented |

### ⏳ Planned Implementations

| Dataset | Country | Resolution | Priority |
|---------|---------|------------|----------|
| CDEM | Canada | 20m | High |
| RGE ALTI | France | 1-5m | High |
| DGM | Germany | 1-10m | High |
| ELVIS | Australia | 5m | Medium |
| DEMNAS | Indonesia | 8m | Medium |
| ALOS World 3D | Global | 30m | Medium |
| Copernicus DEM | Global/EU | 10-30m | Medium |

---

## How It Works

### 1. Country Detection

The system uses bounding box coordinate analysis to detect the country:

```cpp
// Calculate centroid of AOI
double center_lon = (minx + maxx) / 2.0;
double center_lat = (miny + maxy) / 2.0;

// Detect country from coordinates
DEMRouter router;
std::string country = router.get_country_from_coords(center_lon, center_lat);
```

### 2. Dataset Selection

The router queries the inventory and selects the best dataset based on:

1. **Country match** (national > regional > global)
2. **Resolution match** (closest to target, prefer finer)
3. **Implementation status** (implemented > not_implemented)

```cpp
auto best_dem = router.find_best_dem(center_lon, center_lat, target_res_m);
```

### 3. Tool Delegation

Once the best dataset is identified, the system:
- **Specialized tool**: Delegates to `tinitaly_fetch`, etc.
- **Internal provider**: Uses built-in SRTM/USGS backends
- **Not implemented**: Falls back to SRTM 30m with warning

---

## Adding New DEM Datasets

To add a new DEM dataset to the inventory:

### 1. Update the CSV

Add a new row to `/opt/agrs/data/dem_datasets_inventory.csv`:

```csv
country,country_code,dataset_name,provider,resolution_m,coverage,data_format,implementation_status,fetch_tool,url,license,notes
France,FR,RGE ALTI 5m,IGN,5,France (national),GeoTIFF,not_implemented,future,https://geoservices.ign.fr/,Open License,National coverage
```

### 2. Implement a Fetch Tool (Optional)

If the dataset requires a specialized fetch tool:

1. Create `tools_france_dem_fetch()` function in `Tools.cpp`
2. Register CLI command in `register_tools_commands()`
3. Update inventory: `implementation_status=implemented`, `fetch_tool=france_dem_fetch`

### 3. Update Country Detection (Optional)

If it's a new country, add bounding box detection in `dem_routing.hpp`:

```cpp
// France
if (lon >= -5.0 && lon <= 9.6 && lat >= 41.3 && lat <= 51.1) return "FR";
```

### 4. Test

```bash
zeus tools dem_fetch --bbox LON,LAT,LON,LAT --res Xm -o test.tif
```

---

## Benefits for Pipeline Routing

### Cost Optimization Impact

The intelligent DEM routing system directly supports the **10%+ cost savings goal** by:

1. **Higher Resolution = Better Slope Analysis**
   - 10m TINITALY vs 30m SRTM = 9x more detail
   - More accurate terrain cost calculations
   - Fewer surprises during construction

2. **Country-Specific Data = Local Accuracy**
   - National DEMs often incorporate LiDAR and survey data
   - Better vertical accuracy (1-5m vs 10-30m for global DEMs)
   - Captures local terrain features critical for routing

3. **Automated Best Practice**
   - No manual dataset research required
   - Always uses the best available data
   - Consistent across all projects

### Example: SAIPEM Italy Pipeline

**Before Intelligent Routing:**
- Manual SRTM 30m download
- 900m² cells
- ±10-30m vertical accuracy

**After Intelligent Routing:**
- Automatic TINITALY 10m selection
- 100m² cells (9x more detail)
- ±1-5m vertical accuracy
- Better slope analysis for constraint layers

**Result:** More accurate cost surface → more optimal route → lower construction costs

---

## Configuration

The DEM inventory is located at:
```
/opt/agrs/data/dem_datasets_inventory.csv
```

**Format:**
```csv
country,country_code,dataset_name,provider,resolution_m,coverage,data_format,implementation_status,fetch_tool,url,license,notes
```

**Fields:**
- `country`: Full country name
- `country_code`: ISO 3166-1 alpha-2 code (US, IT, SA, etc.)
- `dataset_name`: Human-readable dataset name
- `provider`: Organization providing the data
- `resolution_m`: Resolution in meters (integer)
- `coverage`: Geographic coverage description
- `data_format`: Data format (typically GeoTIFF)
- `implementation_status`: `implemented` | `not_implemented`
- `fetch_tool`: Tool name or `future`
- `url`: Dataset homepage or access URL
- `license`: License type (Public Domain, Open, CC BY, etc.)
- `notes`: Additional information

---

## Future Enhancements

1. **More National DEMs**: Implement fetch tools for high-priority countries
2. **Commercial DEMs**: Add support for TanDEM-X, Maxar, Airbus
3. **LiDAR Collections**: Direct access to national LiDAR repositories
4. **Resolution Synthesis**: Automatically mosaic different resolutions
5. **Quality Metrics**: Track and report DEM accuracy statistics
6. **User Preferences**: Allow per-project DEM preferences

---

## Summary

The Intelligent DEM Routing System:
- ✅ Automatically selects best DEM for any location
- ✅ Supports 50+ countries (Tier 1 O&G + EU)
- ✅ 4 fully implemented datasets (SRTM, 3DEP, TINITALY)
- ✅ Transparent operation with detailed logging
- ✅ Fallback to global datasets when needed
- ✅ Directly supports cost optimization goals

**Next Steps:**
1. Implement high-priority national DEMs (Canada, Norway, France)
2. Add ALOS World 3D for better global coverage
3. Integrate with SAIPEM constraint layer generation



