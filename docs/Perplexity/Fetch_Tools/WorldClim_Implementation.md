# WorldClim Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

## WorldClim Data Overview

WorldClim provides global climate data (e.g., temperature, precipitation) at various spatial resolutions, with WorldClim 2 offering 1 km resolution for global land areas[1][3]. The data are organized as raster files (GeoTIFF format), with each file representing a specific bioclimatic variable (e.g., BIO1 for annual mean temperature, BIO12 for annual precipitation)[1].

## Implementation Details

### 1. API Endpoints and Download URLs

**Direct HTTP Download:**  
WorldClim does not provide a formal REST API for dynamic queries. Instead, data are available as pre-generated tiles or global rasters via direct HTTP download. The main download portal is worldclim.org, but there is no documented public API for bounding box-based queries—you must download entire tiles or global rasters and clip them locally.

**Tile Structure:**  
WorldClim 2 data are provided as global rasters (not tiled by default for 1 km data), so you download a single global file per variable[1]. For coarser resolutions (e.g., 10 arc-minutes), data may be tiled by continent, but for 1 km data, you typically get one file per variable.

**Example Download URL:**  
A typical URL pattern (not officially documented, but inferred from the site structure) might look like:
```
https://biogeo.ucdavis.edu/data/worldclim/v2.1/base/wc2.1_1km_bio.zip
```
This would download all 19 bioclimatic variables at 1 km resolution. For individual variables, filenames follow the pattern `wc2.1_1km_bio_1.tif` (BIO1 = annual mean temperature), `wc2.1_1km_bio_12.tif` (BIO12 = annual precipitation), etc.

### 2. Data Structure and File Formats

- **Format:** GeoTIFF (.tif)
- **Projection:** Geographic (WGS84)
- **Resolution:** 1 km (30 arc-seconds)
- **Variables:** Each file corresponds to one bioclimatic variable (e.g., temperature, precipitation)[1].

### 3. Tile Naming Scheme

For 1 km global data, there is **no tile naming scheme**—each variable is a single global file. For other resolutions (e.g., 10 arc-minutes), tiles may be named by continent (e.g., `af`, `as`, `eu`), but this does not apply to the high-resolution 1 km data.

### 4. Download Methods

- **Direct HTTP:** Download the entire global raster for your variable of interest, then clip to your bounding box using GIS tools.
- **Python Libraries:** Use `requests` or `urllib` to download the file, then `rasterio` or `gdal` to read and clip the raster.
- **No API for Bounding Box Queries:** You cannot request only the data within a specific bounding box directly from WorldClim—you must download the full file and clip it yourself.

### 5. Example Python Code for Automated Fetching by Bounding Box

```python
import requests
import rasterio
from rasterio.mask import mask
import geopandas as gpd
import numpy as np
import os

# Define your bounding box (minx, miny, maxx, maxy) in WGS84
bbox = [xmin, ymin, xmax, ymax]  # Replace with your coordinates

# Create a GeoJSON polygon from the bbox
polygon = gpd.GeoSeries.from_bounds(*bbox, crs="EPSG:4326").to_json()

# WorldClim variable URL (example: annual precipitation)
url = "https://biogeo.ucdavis.edu/data/worldclim/v2.1/base/wc2.1_1km_bio_12.tif"
local_path = "wc2.1_1km_bio_12.tif"

# Download the file if not already present
if not os.path.exists(local_path):
    r = requests.get(url)
    with open(local_path, 'wb') as f:
        f.write(r.content)

# Open the raster and clip to the bounding box
with rasterio.open(local_path) as src:
    out_image, out_transform = mask(src, [polygon], crop=True)
    out_meta = src.meta.copy()

# Update metadata for the clipped raster
out_meta.update({
    "driver": "GTiff",
    "height": out_image.shape[1],
    "width": out_image.shape[2],
    "transform": out_transform
})

# Save the clipped raster
with rasterio.open("clipped_precipitation.tif", "w", **out_meta) as dest:
    dest.write(out_image)
```

### 6. How to Clip to Specific Bounding Box

- **Convert your bounding box** to a GeoJSON polygon (as shown above).
- **Use `rasterio.mask.mask`** to extract only the data within your polygon, writing the result to a new GeoTIFF.
- **This approach** is efficient because `rasterio` only reads the necessary portion of the raster into memory.

### 7. Authentication Requirements

- **No authentication** is required to download WorldClim data.
- **All downloads** are public and do not require an API key or login.

## Summary Table

| Aspect                | Details                                                                 |
|-----------------------|-------------------------------------------------------------------------|
| API Endpoint          | Direct HTTP (no bounding box API)                                       |
| Data Format           | GeoTIFF (.tif)                                                          |
| Tile Scheme           | Global file per variable (1 km), no tiles                               |
| Download Method       | `requests`/`urllib` + `rasterio`/`gdal` for clipping                   |
| Authentication        | None                                                                    |
| Clipping              | Use `rasterio.mask.mask` with a GeoJSON polygon                         |

## Key Points

- **WorldClim does not offer an API for bounding box queries**—you must download the full global raster and clip it locally[1].
- **Python automation** is straightforward with `requests` for download and `rasterio` for clipping.
- **No authentication** is needed.
- **File naming** follows `wc2.1_1km_bio_X.tif` where `X` is the bioclimatic variable code[1].

This workflow is robust for automated, scripted acquisition of WorldClim climate data for any geographic region of interest.