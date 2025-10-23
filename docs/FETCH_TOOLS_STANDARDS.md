# Fetch Tools - Output Format Standards

**Purpose:** Define consistent output formats for all fetch tools in AGRS ZEUS  
**Date:** October 2, 2025  
**Status:** Active Standard

---

## Core Principles

1. **Data Integrity** - All source data must be preserved
2. **Format Consistency** - Use appropriate standard formats per data type
3. **Metadata Required** - Every output must have a JSON sidecar
4. **Industry Standards** - Use OGC/ISO standard formats
5. **Tool Agnostic** - Outputs work with standard GIS tools

---

## Output Format Standards by Data Type

### **Vector Data (Points, Lines, Polygons)**

**Format:** GeoPackage (`.gpkg`)

**Rationale:**
- Industry standard (OGC)
- Single-file format
- Includes spatial indexing
- Supports multiple layers
- Cross-platform compatible
- No file size limits
- Attribute completeness

**Tools Using This:**
- ✅ `osm_waterways_fetch` - Waterways as LineStrings
- 📋 `osm_roads_fetch` - Roads as LineStrings
- 📋 `osm_railways_fetch` - Railways as LineStrings
- 📋 `osm_infrastructure_fetch` - Points/Polygons

**CRS Standard:** EPSG:4326 (WGS 84) unless otherwise specified

---

### **Raster Data (Continuous Surface)**

**Format:** Cloud Optimized GeoTIFF (`.tif` with COG structure)

**Rationale:**
- Industry standard for rasters
- Cloud-optimized for performance
- Compression support (ZSTD/LZW)
- Tile-based access
- Metadata embedded
- GDAL/OGR compatible

**Tools Using This:**
- ✅ `dem_fetch` - Elevation data as Float32
- ✅ `sentinel2_fetch` - Spectral bands as UInt16/Float32
- 📋 `esa_worldcover_fetch` - Land cover classes as Byte

**CRS Standard:** Variable (source-dependent), documented in metadata

**Compression:** ZSTD (level 9) or LZW for compatibility

---

### **Multi-Band Imagery**

**Format:** Cloud Optimized GeoTIFF (`.tif`)

**Rationale:**
- Standard for remote sensing
- Supports multiple bands
- Preserves spectral information
- Efficient storage
- Industry workflows

**Tools Using This:**
- ✅ `sentinel2_fetch` - Each band as separate COG
- Future multi-spectral tools

**Band Organization:** One band per file (for flexibility)

---

## Metadata Sidecar Standards

### **Format:** JSON (`.json`)

**Naming Convention:** `<output_filename>.<output_ext>.json`

**Example:** 
- `waterways.gpkg` → `waterways.gpkg.json`
- `dem.tif` → `dem.tif.json`

### **Required Fields:**

```json
{
    "tool": "tool_name",
    "timestamp": "2025-10-02T19:07:39Z",
    "source": {
        "provider": "Data provider name",
        "api": "API name or method",
        "endpoint": "API endpoint URL",
        "license": "License type",
        "attribution": "Attribution text"
    },
    "query": {
        "bbox": "minx,miny,maxx,maxy",
        "aoi_file": "path/to/aoi.geojson",
        "datetime": "date range if applicable"
    },
    "output": {
        "format": "GeoPackage|GeoTIFF|etc",
        "crs": "EPSG:XXXX",
        "geometry": "Point|LineString|Polygon|Raster"
    }
}
```

### **Optional Fields (as applicable):**

```json
{
    "features": {
        "types": ["list", "of", "feature", "types"],
        "count": 1234
    },
    "attributes": {
        "field_name": "description"
    },
    "raster_metadata": {
        "resolution": [30.0, 30.0],
        "bands": 1,
        "nodata": -9999.0,
        "unit": "meters|dimensionless|etc"
    },
    "processing": {
        "steps": ["step1", "step2"],
        "parameters": {}
    }
}
```

---

## Tool-Specific Standards

### **OSM Vector Fetch Tools**

**Output:** GeoPackage (`.gpkg`)  
**CRS:** EPSG:4326  
**Layer Name:** Descriptive (e.g., "waterways", "roads", "railways")  
**Geometry:** Appropriate type (Point, LineString, Polygon)  
**Attributes:** All OSM tags preserved as available

**Implemented:**
- ✅ `osm_waterways_fetch`

**Pending:**
- 📋 `osm_roads_fetch`
- 📋 `osm_railways_fetch`

---

### **DEM Fetch Tools**

**Output:** Cloud Optimized GeoTIFF (`.tif`)  
**Data Type:** Float32  
**Bands:** 1  
**Unit:** meters (elevation)  
**NoData:** -9999.0  
**Compression:** ZSTD  
**CRS:** Variable (target CRS option available)

**Implemented:**
- ✅ `dem_fetch`

---

### **Satellite Imagery Fetch Tools**

**Output:** Cloud Optimized GeoTIFF (`.tif`)  
**Data Type:** UInt16 (raw bands) or Float32 (reflectance)  
**Organization:** One band per file  
**Naming:** `<band_name>_<date>.tif`  
**Compression:** ZSTD or LZW  
**CRS:** Variable (source-dependent)

**Implemented:**
- ✅ `sentinel2_fetch`

**Pending:**
- 📋 `copernicus_fetch` (Sentinel-1, Sentinel-3)

---

### **Land Cover Fetch Tools**

**Output:** Cloud Optimized GeoTIFF (`.tif`)  
**Data Type:** Byte (class codes)  
**Bands:** 1  
**Color Table:** Embedded if available  
**Legend:** Documented in metadata JSON  
**Compression:** ZSTD  
**CRS:** Variable (source-dependent)

**Pending:**
- 📋 `esa_worldcover_fetch`

---

## File Naming Conventions

### **Vector Outputs**
```
<feature_type>_<region>_<date>.gpkg
Examples:
- waterways_riyadh_20251002.gpkg
- roads_ksa_20251002.gpkg
```

### **Raster Outputs**
```
<data_type>_<region>_<resolution>_<date>.tif
Examples:
- dem_ksa_30m_20251002.tif
- B04_red_20240815.tif
- landcover_ksa_10m_2021.tif
```

### **Metadata Sidecars**
```
<output_filename>.<output_ext>.json
Examples:
- waterways_riyadh_20251002.gpkg.json
- dem_ksa_30m_20251002.tif.json
```

---

## Data Preservation Requirements

### **All Tools Must:**

1. ✅ Preserve all source attributes/bands
2. ✅ Maintain spatial accuracy (no unnecessary resampling)
3. ✅ Document CRS transformations if any
4. ✅ Include NoData values for rasters
5. ✅ Generate metadata sidecar
6. ✅ Use lossless or appropriate compression
7. ✅ Clean up temporary files
8. ✅ Validate output before completion

### **Prohibited Actions:**

1. ❌ Lossy compression for analysis data
2. ❌ Undocumented CRS transformations
3. ❌ Attribute truncation or loss
4. ❌ Missing metadata sidecars
5. ❌ Proprietary or non-standard formats
6. ❌ Hardcoded paths or credentials in output

---

## Quality Assurance Checklist

Before marking a fetch tool as complete, verify:

- [ ] Output format matches standard for data type
- [ ] All source data preserved in output
- [ ] Metadata sidecar generated with all required fields
- [ ] CRS documented and appropriate
- [ ] File can be opened in QGIS/ArcGIS
- [ ] Attributes/bands accessible via ogrinfo/gdalinfo
- [ ] Compression applied and verified
- [ ] NoData values set correctly (rasters)
- [ ] Temporary files cleaned up
- [ ] Tool tested with real API/data source
- [ ] Help system implemented
- [ ] Error handling comprehensive

---

## Version History

| Version | Date       | Changes                               |
|---------|------------|---------------------------------------|
| 1.0     | 2025-10-02 | Initial standards document            |
|         |            | Defined vector → GPKG standard        |
|         |            | Defined raster → COG standard         |
|         |            | Metadata sidecar requirements         |

---

## Compliance

All new fetch tools must comply with these standards. Any deviations must be:

1. Documented in the tool's help system
2. Justified in implementation notes
3. Approved before merging

**Standard Owner:** AGRS Development Team  
**Review Cycle:** Quarterly or as needed  
**Questions:** Discuss before implementing non-standard approaches


