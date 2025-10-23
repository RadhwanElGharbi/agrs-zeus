# FAO_Soil Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

The **Harmonized World Soil Database (HWSD)** is primarily available as a global raster dataset distributed by FAO and ISRIC, typically in GeoTIFF or similar GIS raster formats. It does not have a direct API for bounding-box downloads, but you can automate downloading the full dataset and then extract soil properties for a specific geographic bounding box using Python GIS libraries.

### 1. Download URLs and Versions
- The official HWSD v1.2 dataset is available for download from FAO’s Soil Portal:  
  https://www.fao.org/soils-portal/soil-survey/soil-maps-and-databases/harmonized-world-soil-database-v12/en/ [1]  
- HWSD v2.0 or newer versions may be available from ISRIC or FAO, but v1.2 is the most commonly referenced stable version.  
- The dataset is typically provided as a zipped archive containing raster files and attribute tables.

### 2. Data Structure and File Formats
- HWSD is a **raster dataset** with a spatial resolution of about 1 km (30 arc-seconds).  
- The main files include:  
  - Raster files (GeoTIFF or ESRI GRID format) representing soil mapping units.  
  - Attribute tables (DBF or CSV) linking soil mapping units to soil properties.  
- Soil properties are stored as attributes linked to raster pixel values representing soil mapping units.

### 3. Extracting Soil Properties by Bounding Box
- Since the data is raster-based, you can:  
  - Download the full raster dataset.  
  - Use Python GIS libraries (e.g., rasterio, geopandas) to read the raster.  
  - Define your bounding box as a polygon or rectangular extent.  
  - Clip or mask the raster to the bounding box.  
  - Extract pixel values within the bbox.  
  - Join pixel values with the attribute table to retrieve soil properties.  

### 4. Available Soil Parameters
HWSD includes a wide range of soil parameters, such as:  
- Soil texture fractions (sand, silt, clay)  
- Soil organic carbon content  
- Soil pH  
- Soil depth  
- Soil classification (FAO legend)  
- Bulk density  
- Water retention characteristics  
- Cation exchange capacity  
- Coarse fragments content  

### 5. Python Code Example for Automated Download and Extraction

```python
import os
import requests
import rasterio
from rasterio.mask import mask
import geopandas as gpd
from shapely.geometry import box
import pandas as pd

# Step 1: Download HWSD v1.2 zip file (example URL, update if needed)
url = "https://example.com/hwsd_v12.zip"  # Replace with actual FAO download link
output_zip = "hwsd_v12.zip"

if not os.path.exists(output_zip):
    print("Downloading HWSD dataset...")
    r = requests.get(url, stream=True)
    with open(output_zip, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    print("Download complete.")

# Step 2: Unzip and locate raster and attribute files
import zipfile
with zipfile.ZipFile(output_zip, 'r') as zip_ref:
    zip_ref.extractall("hwsd_v12")

# Assuming raster file path and attribute table path
raster_path = "hwsd_v12/hwsd.tif"  # Adjust path as per extracted files
attr_table_path = "hwsd_v12/hwsd_attributes.csv"  # Adjust accordingly

# Step 3: Define bounding box (minx, miny, maxx, maxy) in dataset CRS (usually WGS84)
bbox = box(minx=10, miny=45, maxx=15, maxy=50)  # Example bbox in lon/lat

# Step 4: Read raster and clip to bbox
with rasterio.open(raster_path) as src:
    bbox_gdf = gpd.GeoDataFrame({'geometry': [bbox]}, crs=src.crs)
    out_image, out_transform = mask(src, bbox_gdf.geometry, crop=True)
    out_meta = src.meta.copy()
    out_meta.update({"height": out_image.shape[1],
                     "width": out_image.shape[2],
                     "transform": out_transform})

# Step 5: Extract unique soil mapping unit IDs from clipped raster
soil_unit_ids = set(out_image.data.flatten())
soil_unit_ids.discard(src.nodata)  # Remove nodata if present

# Step 6: Load attribute table and filter for extracted soil units
attr_df = pd.read_csv(attr_table_path)
soil_properties = attr_df[attr_df['MU_GLOBAL'].isin(soil_unit_ids)]

print(soil_properties.head())
```

### 6. Data Versioning
- **HWSD v1.2** is the most widely used and referenced version, released around 2012 by FAO and ISRIC.  
- There is no official HWSD v2.0 widely published; newer soil databases like SoilGrids by ISRIC are alternatives with higher resolution and API access.  
- Always check FAO and ISRIC websites for the latest versions or updates.

---

**Summary:**  
To automatically download and extract HWSD soil properties for a bounding box, you download the full raster dataset (usually HWSD v1.2 from FAO), unzip it, then use Python GIS tools (rasterio, geopandas) to clip the raster by your bounding box and join pixel soil unit IDs with the attribute table to get soil parameters like texture, pH, organic carbon, etc. There is no direct API for bbox downloads, so this approach is standard.

If you need higher resolution or API access, consider ISRIC SoilGrids instead.  

This approach is consistent with FAO’s distribution and common GIS workflows[1][2][6].