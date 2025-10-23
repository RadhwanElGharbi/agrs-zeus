# GUI Layer Auto-Loading Feature

**Date:** 2025-10-23  
**Feature:** Automatic layer detection and loading from project data directories  
**Component:** MainWindow (GUI)

---

## 📋 Overview

The GUI now automatically detects and loads all geospatial datasets from a project's `data/` directory when:
1. A project is opened (`File → Open Project`)
2. A new project is created (after the Dataset Availability dialog closes)

This eliminates the need for manual layer imports and provides immediate visual feedback of available datasets.

---

## 🎯 Implementation Details

### Modified Files

#### 1. `include/agrs_zeus/gui/MainWindow.h`
- **Added method:** `void loadProjectLayers(const QString& projectDir);`
- **Purpose:** Declare the layer loading function

#### 2. `src/gui/MainWindow.cpp`

##### Updated Methods:
- **`onOpenProject()`**: Calls `loadProjectLayers()` after project selection
- **`onNewProject()`**: Calls `loadProjectLayers()` after dataset availability dialog

##### New Method: `loadProjectLayers(const QString& projectDir)`
**Location:** Lines 457-558

**Functionality:**
1. Clears existing layer tree
2. Scans `<projectDir>/data/rasters/` for raster files
3. Scans `<projectDir>/data/vectors/` for vector files
4. Detects and processes subdirectories (e.g., `sentinel2/`)
5. Creates hierarchical tree structure with checkboxes
6. Stores full file paths in `Qt::UserRole` data
7. Provides console feedback with layer counts

---

## 📂 Supported File Formats

### Raster Formats
- **GeoTIFF:** `*.tif`, `*.tiff`
- **Virtual Raster:** `*.vrt`
- **ERDAS Imagine:** `*.img`
- **GRASS GIS:** `*.grd`

### Vector Formats
- **GeoPackage:** `*.gpkg` (preferred)
- **Shapefile:** `*.shp`
- **GeoJSON:** `*.geojson`
- **KML/KMZ:** `*.kml`, `*.kmz`
- **GML:** `*.gml`

**Note:** JSON metadata files (`*.json`) are automatically excluded from vector scanning.

---

## 🌲 Layer Tree Structure

```
Layers
├── Rasters [✓]
│   ├── tinitaly_10m_dem.tif [✓]
│   ├── slope_percent.tif [✓]
│   ├── esa_worldcover_10m.tif [✓]
│   ├── global_surface_water.tif [✓]
│   ├── soilgrids_properties.tif [✓]
│   └── sentinel2 [✓]
│       ├── B02.tif [✓]
│       ├── B03.tif [✓]
│       ├── B04.tif [✓]
│       ├── B08.tif [✓]
│       └── B8A.tif [✓]
└── Vectors [✓]
    ├── osm_roads.gpkg [✓]
    ├── osm_railways.gpkg [✓]
    ├── osm_power.gpkg [✓]
    ├── osm_waterways.gpkg [✓]
    ├── ingv_faults.gpkg [✓]
    └── gadm_admin_boundaries.gpkg [✓]
```

### Tree Item Properties:
- **Text:** File/folder name
- **Icon:** Folder icon for directories, file icon for datasets
- **Checkbox:** Checked by default (all layers visible)
- **Tooltip:** Full absolute file path
- **User Data:** Stored file path (accessible via `Qt::UserRole`)

---

## ✨ Features

### 1. Automatic Detection
- **Trigger:** Opening or creating a project
- **Scope:** All files in `data/rasters/` and `data/vectors/`
- **Depth:** Supports one level of subdirectories

### 2. Hierarchical Organization
- **Root nodes:** "Rasters" and "Vectors"
- **Subdirectories:** Treated as collapsible groups (e.g., Sentinel-2 bands)
- **Expanded by default:** All root nodes auto-expanded

### 3. Visual Feedback
- **Console messages:**
  - `[Layers] Scanning project data directories...`
  - `[Layers] Loaded X raster(s) and Y vector(s)`
  - `[Layers] No data directory found in project` (if missing)
  - `[Layers] No geospatial data files found in project` (if empty)

### 4. Layer Visibility Control
- **Checkboxes:** Each layer has a checkbox for show/hide
- **Default state:** All layers checked (visible)
- **Parent/child relationship:** Subdirectory checkboxes control child items

### 5. Metadata Storage
- **Full path:** Stored in `item->data(0, Qt::UserRole)`
- **Usage:** Accessible for future layer loading/rendering
- **Tooltip:** Full path shown on hover

---

## 🧪 Testing

### Test Case 1: Open Existing Project

**Steps:**
1. Launch `zeus_gui`
2. File → Open Project
3. Select `/opt/agrs/Projects/test_project`

**Expected Results:**
- Layers panel populates with 10 rasters (including 5 Sentinel-2 bands in subfolder)
- Layers panel populates with 6 vectors
- Console shows: `[Layers] Loaded 10 raster(s) and 6 vector(s)`
- All items have checkboxes checked
- Tooltips display full file paths

### Test Case 2: Create New Project

**Steps:**
1. Launch `zeus_gui`
2. File → New Project
3. Complete wizard and dataset availability dialog
4. Close dataset availability dialog

**Expected Results:**
- Layers panel automatically populates (if datasets were fetched)
- Console shows layer count
- Window title updates to project name

### Test Case 3: Empty Project

**Steps:**
1. Create empty project directory: `/opt/agrs/Projects/empty_project/data/rasters` and `.../vectors`
2. Open this project

**Expected Results:**
- Layers panel shows "Rasters" and "Vectors" folders (empty)
- Console shows: `[Layers] Loaded 0 raster(s) and 0 vector(s)`
- Console shows: `[Layers] No geospatial data files found in project`

### Test Case 4: Project Without Data Directory

**Steps:**
1. Create project directory without `/data` subfolder
2. Open this project

**Expected Results:**
- Console shows: `[Layers] No data directory found in project`
- Layers panel remains empty

---

## 🔄 Workflow Integration

### Project Creation Flow:
```
User → New Project → Fill Wizard → AI Summary → Confirm
    ↓
Project Folder Created → Files Copied → Metadata Saved
    ↓
Dataset Availability Dialog → User Fetches Datasets
    ↓
[NEW] Auto-Load Layers → Layers Panel Populated ✅
```

### Project Open Flow:
```
User → Open Project → Select Directory
    ↓
Window Title Updated → Terminal Dir Set
    ↓
[NEW] Auto-Load Layers → Layers Panel Populated ✅
```

---

## 📊 Expected Layer Counts (test_project)

Based on the comprehensive dataset fetch completed on 2025-10-23:

| Category | Count | Details |
|----------|-------|---------|
| **Rasters** | 10 | 5 standalone + 5 Sentinel-2 bands |
| **Vectors** | 6 | Roads, railways, power, waterways, faults, boundaries |
| **Total Features** | ~113,000 | Vector features across all datasets |
| **Total Size** | 481 MB | Complete project data |

### Raster Breakdown:
- `tinitaly_10m_dem.tif` (68 MB) - Elevation
- `slope_percent.tif` (109 MB) - Terrain slope
- `esa_worldcover_10m.tif` (4.7 MB) - Land cover
- `global_surface_water.tif` (196 KB) - Water occurrence
- `soilgrids_properties.tif` (100 KB) - Soil properties (3 bands)
- `sentinel2/B02.tif` (50 MB) - Blue
- `sentinel2/B03.tif` (50 MB) - Green
- `sentinel2/B04.tif` (52 MB) - Red
- `sentinel2/B08.tif` (54 MB) - NIR
- `sentinel2/B8A.tif` (14 MB) - Narrow NIR

### Vector Breakdown:
- `osm_roads.gpkg` (14 MB) - 46,219 features
- `osm_railways.gpkg` (212 KB) - 439 features
- `osm_power.gpkg` (30 MB) - 57,194 features
- `osm_waterways.gpkg` (788 KB) - 1,102 features
- `ingv_faults.gpkg` (104 KB) - 1 feature
- `gadm_admin_boundaries.gpkg` (39 MB) - 8,231 features (4 layers)

---

## 🚀 Future Enhancements

### Phase 1 (Current) ✅
- ✅ Automatic detection of files
- ✅ Hierarchical tree structure
- ✅ Checkbox controls
- ✅ Console feedback

### Phase 2 (Next Steps)
- ⏭️ **Actual layer rendering on map viewer**
- ⏭️ Layer styling (symbology, colors)
- ⏭️ Layer properties dialog (CRS, extent, band info)
- ⏭️ Layer reordering (drag & drop)
- ⏭️ Layer visibility toggle (checkbox interaction)

### Phase 3 (Advanced)
- ⏭️ Layer filtering/searching
- ⏭️ Layer grouping/categorization
- ⏭️ Multi-band raster display
- ⏭️ Vector attribute table view
- ⏭️ Layer symbology editor
- ⏭️ Layer statistics/metadata panel

---

## 🔍 Technical Notes

### Performance Considerations:
- **File scanning:** O(n) where n = number of files
- **Tree population:** O(n) where n = number of layers
- **Memory:** Minimal (only file paths stored, not data)
- **UI blocking:** None (runs on main thread but fast for typical project sizes)

### Thread Safety:
- **Current implementation:** Main thread only
- **Future optimization:** Background thread for large projects (>100 files)

### Error Handling:
- **Missing directories:** Gracefully handled with console message
- **Empty directories:** Displays empty tree structure
- **Invalid files:** Filtered by extension, no validation performed

### Limitations:
- **Subdirectory depth:** Only 1 level supported
- **File validation:** Extension-based only (no GDAL validation)
- **Layer rendering:** Not yet implemented (tree structure only)
- **Layer styling:** Default styling only

---

## 📚 Related Documentation

- **Project Structure:** `/opt/agrs/docs/Project Instructions`
- **Dataset Inventory:** `/opt/agrs/Projects/test_project/docs/COMPLETE_DATASET_INVENTORY.md`
- **Italy Fetch Tools:** `/opt/agrs/docs/ITALY_FIXES_FINAL_SUMMARY.md`
- **Dataset Availability:** `DatasetAvailabilityDialog.cpp`

---

## ✅ Verification Checklist

- [x] Code compiles without errors
- [x] Method declared in header
- [x] Method implemented in source
- [x] Called from `onOpenProject()`
- [x] Called from `onNewProject()`
- [x] Handles missing directories
- [x] Handles empty directories
- [x] Supports subdirectories
- [x] Provides console feedback
- [x] Stores file paths in UserRole
- [x] Sets tooltips for all items
- [x] Documentation complete

---

**Status:** ✅ **IMPLEMENTED AND READY FOR TESTING**

The layer auto-loading feature is fully implemented and integrated into the project workflow. Users can now open any project and immediately see all available datasets in the Layers panel without manual imports.

**Next Step:** Test with `zeus_gui` by opening `/opt/agrs/Projects/test_project`

