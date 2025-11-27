# Dataset Fetching and Processing Protocols

**Version:** 1.0  
**Date:** 2025-10-28  
**Status:** Official Standard  
**Purpose:** Establish mandatory protocols for all dataset fetching and processing operations in AGRS ZEUS

---

## 📋 PRE-FETCH PROTOCOLS

### 1. Project Directory Scanning
- **Requirement:** Before any fetch operation begins, scan the project directory to identify existing datasets
- **Purpose:** Avoid duplicate downloads and unnecessary network usage
- **Implementation:**
  - Check `data/rasters/` and `data/vectors/` directories
  - Parse existing metadata JSON files to determine coverage
  - Compare requested fetch parameters with existing data
  - Skip fetch if valid data already exists
  - Log skipped fetches with reason

### 2. Raw Data Integrity - **ZERO TOLERANCE FOR PLACEHOLDERS**
- **Requirement:** All fetched data must remain in its original, unmodified form
- **CRITICAL RULE:** 
  - ❌ **ABSOLUTELY FORBIDDEN:** Placeholder data, synthetic data, or generated constant-value rasters
  - ❌ **ABSOLUTELY FORBIDDEN:** Creating "fake" datasets to pass validation
  - ✅ **MANDATORY:** Only real, authoritative source data from legitimate providers
  - ✅ **MANDATORY:** If real data is unavailable, the dataset must be marked as missing, NOT faked
  - **Rationale:** Placeholder data corrupts model training, produces unreliable routes, and violates scientific integrity. Routes generated with placeholder data are NOT suitable for engineering use.
  
- **Constraints:**
  - ✅ **ALLOWED:** Direct downloads from authoritative sources
  - ❌ **FORBIDDEN:** Reprojection during fetch
  - ❌ **FORBIDDEN:** Clipping during fetch
  - ❌ **FORBIDDEN:** Format conversion during fetch (except for transport/extraction)
  - ❌ **FORBIDDEN:** Derivative calculations (slope, aspect, etc.)
  - ❌ **FORBIDDEN:** Creating placeholder/synthetic datasets
  - ❌ **FORBIDDEN:** Using constant-value rasters as substitutes for real data
  
- **Storage:** Raw files must be preserved in organized subdirectories:
  - Rasters: `data/rasters/raw/`
  - Vectors: `data/vectors/raw/`
- **Naming Convention:** `{dataset_name}_{source}_{resolution}_raw.{ext}`
  - Example: `data/rasters/raw/dem_tinitaly_10m_raw.tif`
  - Example: `data/rasters/raw/landcover_esa_worldcover_10m_raw.tif`
  - Example: `data/vectors/raw/osm_roads_raw.gpkg`

### 3. AOI Extent Coverage
- **Requirement:** Raw fetches must cover the entire AOI extent
- **Rules:**
  - Fetched data MAY extend beyond AOI boundaries
  - Fetched data MUST NOT be smaller than AOI extent
  - If multiple tiles/files are needed to cover AOI, fetch ALL required tiles
  - Buffer zone: Prefer fetching data with 1-5% buffer beyond AOI to ensure edge coverage
- **Validation:** 
  - Calculate AOI bounding box in dataset's native CRS
  - Verify fetched data bbox encompasses AOI bbox
  - Log coverage percentage

### 4. Relevance Filtering
- **Requirement:** Do NOT fetch datasets that have zero coverage of the AOI
- **Constraints:**
  - ❌ **FORBIDDEN:** Downloading entire global/continental datasets when only small region is needed
  - ❌ **FORBIDDEN:** Downloading datasets with coverage outside AOI extent
  - ✅ **REQUIRED:** Check dataset spatial index/coverage before initiating download
  - ✅ **REQUIRED:** Use tile-based fetching for large datasets (e.g., ESA WorldCover 3°x3° tiles)
- **Implementation:**
  - For tiled datasets: Calculate required tiles based on AOI bbox
  - For WMS/WCS: Use bbox parameter to limit server-side processing
  - For whole-file downloads: Verify coverage metadata before downloading

### 5. Metadata Requirements
- **Requirement:** Every fetched dataset MUST have an accompanying `.json` metadata file
- **Location:** Metadata files must be in the same directory as their associated dataset
- **Filename:** Same as dataset with `.json` extension
  - Example: `data/rasters/raw/dem_tinitaly_10m_raw.tif` → `data/rasters/raw/dem_tinitaly_10m_raw.tif.json`
  - Example: `data/vectors/raw/osm_roads_raw.gpkg` → `data/vectors/raw/osm_roads_raw.gpkg.json`
- **Required Fields:**
  ```json
  {
    "dataset_name": "TINITALY DEM 10m",
    "source": "INGV - Istituto Nazionale di Geofisica e Vulcanologia",
    "provider": "INGV",
    "provider_url": "https://tinitaly.pi.ingv.it/",
    "coverage_date": "2011",
    "fetch_date": "2025-10-28T04:06:15Z",
    "fetch_tool": "tinitaly_fetch",
    "raw_crs": "EPSG:32632",
    "resolution_m": 10,
    "data_type": "Raster",
    "format": "GeoTIFF",
    "nodata_value": -9999,
    "extent": {
      "minx": 863970,
      "miny": 4754576,
      "maxx": 899701,
      "maxy": 4821414,
      "crs": "EPSG:32632"
    },
    "bbox_wgs84": {
      "west": 13.454779,
      "south": 42.857057,
      "east": 13.938769,
      "north": 43.438886
    },
    "documentation_url": "https://tinitaly.pi.ingv.it/Download_Area1.html",
    "license": "CC BY 4.0",
    "attribution": "TINITALY/01 square WA_01, DOI 10.13127/TINITALY/1.1",
    "file_size_bytes": 71303168,
    "checksum_sha256": "optional",
    "tiles_downloaded": ["w47585_s10", "w48085_s10"],
    "notes": "Reprojection to target CRS pending"
  }
  ```

### 6. Data Validation Scan
- **Requirement:** Immediately after fetch completion, validate the downloaded data
- **Checks:**
  - File exists and is not empty (size > 1 KB)
  - File is readable by GDAL/OGR
  - CRS is correctly identified
  - Extent matches expected coverage
  - Raster: Check for reasonable min/max values (flag if all NoData or constant)
  - Vector: Check feature count > 0
  - No file corruption (GDAL can open without errors)
- **Actions on Failure:**
  - Delete corrupted file
  - Log detailed error
  - Retry fetch (max 3 attempts)
  - If all retries fail, report to user and continue with warning

### 7. Logging Standards
- **Requirement:** Maintain current logging practices with enhancements
- **Log Levels:**
  - `INFO`: Fetch initiated, progress, completion
  - `WARNING`: Partial coverage, missing tiles, retry attempts
  - `ERROR`: Failed downloads, validation failures
  - `DEBUG`: Tile calculations, URL construction, subprocess calls
- **Log Format:**
  ```
  [YYYY-MM-DD HH:MM:SS] [LEVEL] [tool_name] Message
  [2025-10-28 04:06:15] [INFO] [tinitaly_fetch] Fetching TINITALY 10m DEM...
  [2025-10-28 04:06:15] [INFO] [tinitaly_fetch] Required tiles: 2 (w47585_s10, w48085_s10)
  [2025-10-28 04:07:42] [INFO] [tinitaly_fetch] ✓ Successfully downloaded 2 tiles
  ```

---

## 🔄 POST-FETCH PROCESSING PROTOCOLS

### 1. Project CRS Extraction
- **Requirement:** Read `project_metadata.json` to determine target CRS EPSG code
- **Validation:**
  - Verify EPSG code is valid (query GDAL SRS database)
  - Confirm EPSG is appropriate for project location
  - Log target CRS for all subsequent operations
- **Consistency:** ALL processed datasets in a project MUST use the same CRS

### 2. Multi-File Mosaicking
- **Trigger:** Multiple raw files were fetched to cover AOI
- **Process:**
  1. Create VRT mosaic of all raw files using `gdalbuildvrt`
  2. Reproject VRT to target CRS using `gdalwarp -t_srs EPSG:{code}`
  3. Clip to AOI extent using `gdalwarp -cutline {aoi.gpkg}`
  4. Set NoData value and ensure it's respected
  5. Apply compression: `COMPRESS=LZW` for rasters, optimize for COG
  6. Save as `{dataset_name}_{crs}_processed.{ext}` in processed directory
- **Storage:** Processed files must be in organized subdirectories:
  - Rasters: `data/rasters/processed/`
  - Vectors: `data/vectors/processed/`
- **Output Naming Convention:** `{category}_epsg{code}_processed.{ext}`
  - Example: `data/rasters/processed/dem_epsg32633_processed.tif`
  - Example: `data/vectors/processed/roads_epsg32633_processed.gpkg`
- **Display Name Convention (Layer Manager):** `{category}_{dataset_name}_{target_crs}_processed`
  - Derived from metadata JSON sidecar fields: `category`, `dataset_name`, `target_crs`
  - Spaces in `dataset_name` are replaced with hyphens
  - `target_crs` is formatted as `EPSGnumber` (no colon) for URL compatibility
  - Example: `dem_TINITALY-DEM-10m_EPSG32633_processed`
  - Example: `roads_OpenStreetMap-Roads_EPSG32633_processed`
  - Example: `landcover_ESA-WorldCover-10m_EPSG32633_processed`
- **NoData Handling:**
  - Use `-dstnodata` to set explicit NoData value
  - For display: Configure renderer to treat NoData as transparent
  - Ensure NoData pixels are not included in statistics

### 3. Single-File Processing
- **Trigger:** One raw file covers entire AOI extent
- **Process:**
  1. Reproject to target CRS: `gdalwarp -t_srs EPSG:{code}`
  2. Clip to AOI extent: `gdalwarp -cutline {aoi.gpkg}`
  3. Set NoData value: `-dstnodata {value}`
  4. Apply compression
  5. Save to processed directory: `data/rasters/processed/{category}_epsg{code}_processed.{ext}`
- **Optimization:**
  - Use appropriate resampling method:
    - `bilinear` for continuous data (DEM, population)
    - `near` for categorical data (land cover, soil types)
    - `average` for aggregation (population when downsampling)
  - Maintain or improve resolution (avoid unnecessary resampling)

### 4. Processed Dataset Metadata
- **Requirement:** Create metadata JSON for each processed dataset
- **Location:** Metadata files must be in the same directory as their associated dataset
- **Filename:** `{category}_epsg{code}_processed.{ext}.json`
  - Example: `data/rasters/processed/dem_epsg32633_processed.tif.json`
  - Example: `data/vectors/processed/roads_epsg32633_processed.gpkg.json`
- **Required Fields:**
  ```json
  {
    "dataset_name": "TINITALY DEM 10m",
    "category": "dem",
    "project": "project_name",
    "processing_date": "2025-10-28T04:10:33Z",
    "target_crs": "EPSG:32633",
    "target_crs_name": "WGS 84 / UTM zone 33N",
    "resolution_m": 10,
    "data_type": "Raster",
    "format": "GeoTIFF",
    "extent": {
      "minx": 362000,
      "miny": 4745000,
      "maxx": 425000,
      "maxy": 4815000,
      "crs": "EPSG:32633"
    },
    "bbox_wgs84": {
      "west": 13.454779,
      "south": 42.857057,
      "east": 13.938769,
      "north": 43.438886
    },
    "operations_applied": [
      {
        "operation": "mosaic",
        "tool": "gdalbuildvrt",
        "input_files": ["dem_tinitaly_10m_raw.tif"],
        "timestamp": "2025-10-28T04:10:15Z"
      },
      {
        "operation": "reproject",
        "tool": "gdalwarp",
        "source_crs": "EPSG:32632",
        "target_crs": "EPSG:32633",
        "resampling": "bilinear",
        "timestamp": "2025-10-28T04:10:25Z"
      },
      {
        "operation": "clip",
        "tool": "gdalwarp",
        "cutline": "data/vectors/aoi.gpkg",
        "timestamp": "2025-10-28T04:10:25Z"
      }
    ],
    "source_files": [
      {
        "filename": "dem_tinitaly_10m_raw.tif",
        "metadata": "dem_tinitaly_10m_raw.tif.json"
      }
    ],
    "file_size_bytes": 48127488,
    "nodata_value": -9999,
    "statistics": {
      "min": 12.5,
      "max": 2156.3,
      "mean": 584.7,
      "stddev": 312.1
    },
    "validation_status": "passed",
    "validation_date": "2025-10-28T04:10:33Z",
    "protocol_version": "1.0",
    "zeus_version": "0.1.0"
  }
  ```
- **Display Name Derivation:** The Layer Manager builds display names from metadata:
  - Format: `{category}_{dataset_name}_{target_crs}_processed`
  - `dataset_name` has spaces replaced with hyphens
  - `target_crs` is formatted as `EPSGnumber` (no colon)
  - Example: `dem_TINITALY-DEM-10m_EPSG32633_processed`

### 5. Processed Dataset Validation
- **Requirement:** Validate processed datasets to ensure data quality
- **Checks:**
  - CRS matches target CRS from project metadata
  - Extent is within or equal to AOI extent
  - Resolution is appropriate (not degraded unexpectedly)
  - NoData values are correctly set and recognized
  - Raster statistics are reasonable (no all-NoData or constant values)
  - Vector geometries are valid (no self-intersections, topology errors)
  - File is optimized (COG for rasters, spatial index for vectors)
- **Validation Report:**
  - Add `validation_status` to metadata JSON
  - Possible values: `passed`, `passed_with_warnings`, `failed`
  - Include `validation_errors` array if issues detected
- **Actions on Failure:**
  - Log detailed error with context
  - Flag dataset as invalid in metadata
  - Alert user to review and potentially re-fetch

---

## 📁 DIRECTORY STRUCTURE

### Standard Project Layout

```
project/
├── data/
│   ├── rasters/
│   │   ├── raw/                          # Original fetched rasters
│   │   │   ├── dem_tinitaly_10m_raw.tif
│   │   │   ├── dem_tinitaly_10m_raw.tif.json
│   │   │   ├── dem_tinitaly_10m_raw.tif.aux.xml  (auto-generated)
│   │   │   └── ...
│   │   └── processed/                    # Reprojected, clipped rasters (CANONICAL)
│   │       ├── dem_epsg32633_processed.tif
│   │       ├── dem_epsg32633_processed.tif.json
│   │       ├── dem_epsg32633_processed.tif.aux.xml  (auto-generated)
│   │       ├── landcover_epsg32633_processed.tif
│   │       ├── landcover_epsg32633_processed.tif.json
│   │       └── ...
│   └── vectors/
│       ├── raw/                          # Original fetched vectors
│       │   ├── osm_roads_raw.gpkg
│       │   ├── osm_roads_raw.gpkg.json
│       │   └── ...
│       └── processed/                    # Reprojected vectors (CANONICAL)
│           ├── roads_epsg32633_processed.gpkg
│           ├── roads_epsg32633_processed.gpkg.json
│           ├── railways_epsg32633_processed.gpkg
│           ├── railways_epsg32633_processed.gpkg.json
│           └── ...
```

### File Organization Rules

1. **Raw Files:** All original, unmodified fetched datasets go in `raw/` subdirectories
2. **Processed Files:** All reprojected, clipped datasets go in `processed/` subdirectories
   - The `processed/` folder is the **CANONICAL** source for the Layer Manager
   - Multiple datasets of the same category can coexist (e.g., two different DEM sources)
3. **Metadata JSONs:** Always placed alongside their associated dataset files
   - Must contain `category`, `dataset_name`, and `target_crs` fields for display name generation
4. **Auxiliary Files (`.aux.xml`):** Auto-generated by GDAL, stored alongside parent files
   - Contain cached statistics and metadata
   - Safe to delete (will be regenerated when needed)
   - Should be in `.gitignore` but preserved locally for performance
5. **Symlinks (DEPRECATED):** No longer created or used
   - Layer Manager reads directly from `processed/` folders
   - Legacy symlinks may exist but are not required

---

## 🎯 IMPLEMENTATION PRIORITIES

### Phase 1: Core Protocols (Immediate)
1. ✅ Pre-fetch directory scanning
2. ✅ Tile-based fetching (ESA WorldCover fix applied)
3. ✅ Metadata JSON generation for all fetches
4. ⏳ Post-fetch validation scanning

### Phase 2: Enhanced Validation (Short-term)
1. Statistical validation for rasters
2. Topology validation for vectors
3. Coverage overlap detection
4. Automated retry on validation failure

### Phase 3: Optimization (Medium-term)
1. Parallel fetch and process pipelines
2. Caching mechanism for frequently used datasets
3. Incremental updates (only fetch changed data)
4. Cloud Optimized GeoTIFF (COG) generation by default

---

## 📝 COMPLIANCE CHECKLIST

Before any fetch tool is considered complete, verify:

- [ ] Scans project directory before downloading
- [ ] Preserves raw data in `*_raw.*` format
- [ ] Covers AOI extent with appropriate buffer
- [ ] Filters tiles/regions to AOI relevance
- [ ] Generates metadata JSON with all required fields
- [ ] Validates data immediately after fetch
- [ ] Logs all operations with appropriate levels
- [ ] Implements retry logic for transient failures
- [ ] Cleans up temporary files on completion
- [ ] Returns standardized exit codes (0=success, 1=error)

For post-processing tools:
- [ ] Reads target CRS from `project_metadata.json`
- [ ] Handles both single-file and multi-file mosaicking
- [ ] Reprojects to target CRS with appropriate resampling
- [ ] Clips to AOI extent precisely
- [ ] Sets and respects NoData values
- [ ] Generates processed metadata JSON
- [ ] Validates processed output
- [ ] Optimizes file format (COG, spatial index)

---

## 🔗 RELATED DOCUMENTATION

- `PROJECT_STRUCTURE_STANDARD.md` - Project directory organization
- `DATASET_CATEGORIES_SUMMARY.md` - Dataset inventory and sources
- `DATASET_INVENTORIES_COMPLETE.md` - Comprehensive dataset catalog
- `PIRL_IMPLEMENTATION_PLAN.md` - PIRL dataset requirements

---

**Enforcement:** These protocols are MANDATORY for all dataset operations. Non-compliant fetch tools must be refactored or deprecated.

**Review Cycle:** Quarterly review and update based on operational experience and new dataset sources.

**Approval:** Radwan El Gharbi - Project Lead  
**Last Updated:** 2025-10-28


