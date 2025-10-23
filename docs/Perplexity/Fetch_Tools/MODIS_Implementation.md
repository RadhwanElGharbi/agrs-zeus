# MODIS Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

To automatically download MODIS vegetation indices (NDVI, EVI) for a specific geographic bounding box using the Google Earth Engine (GEE) Python API, follow these detailed implementation steps:

1. **GEE Collection Names for MODIS NDVI/EVI**  
   Use the MODIS Terra Vegetation Indices 16-Day Global 250m product:  
   - Collection ID: `"MODIS/061/MOD13Q1"`  
   This dataset provides NDVI and EVI bands at 250m resolution every 16 days from 2000 to near-present[1].

2. **Python Code Using `ee.Image` Filtering by Bounding Box**  
   - Define your bounding box as an `ee.Geometry.Rectangle` with coordinates [xmin, ymin, xmax, ymax].  
   - Filter the MODIS collection by date range and spatial bounds.  
   - Select NDVI and EVI bands from the images.  
   - Optionally, generate composites (e.g., median) over the date range.

3. **Export Methods**  
   - **Export to Google Drive**: Common for downloading data locally.  
   - **Export to GEE Asset**: For storing processed data in your Earth Engine assets.  
   - **Direct Download**: Not directly supported for large image collections; typically done via Drive or Asset export.  
   Use `ee.batch.Export.image.toDrive()` or `ee.batch.Export.image.toAsset()` for exporting.

4. **Handling Composite Generation for Date Ranges**  
   - Filter images by date range.  
   - Use reducers like `.median()`, `.mean()`, or `.max()` to create a composite image representing the period.  
   - This reduces cloud/noise effects and summarizes the vegetation index over time.

5. **Authentication Setup**  
   - Install Earth Engine Python API: `pip install earthengine-api`  
   - Authenticate once using:  
     ```python
     import ee
     ee.Authenticate()
     ee.Initialize()
     ```  
   - For automated scripts (e.g., on servers), use service account credentials and initialize with a private key JSON file.

6. **Example Complete Python Script**

```python
import ee

# Authenticate and initialize Earth Engine
ee.Authenticate()  # Run once interactively; comment out after authentication
ee.Initialize()

# Define bounding box coordinates (xmin, ymin, xmax, ymax)
bbox = ee.Geometry.Rectangle([xmin, ymin, xmax, ymax])

# Define date range
start_date = '2020-01-01'
end_date = '2020-12-31'

# Load MODIS MOD13Q1 collection
modis_collection = ee.ImageCollection('MODIS/061/MOD13Q1') \
    .filterDate(start_date, end_date) \
    .filterBounds(bbox) \
    .select(['NDVI', 'EVI'])

# Create median composite over the date range
composite = modis_collection.median().clip(bbox)

# Define export parameters
export_task = ee.batch.Export.image.toDrive(
    image=composite,
    description='MODIS_VI_Composite',
    folder='EarthEngineExports',  # Google Drive folder name
    fileNamePrefix='MODIS_NDVI_EVI_2020',
    region=bbox.getInfo()['coordinates'],
    scale=250,  # MODIS native resolution
    maxPixels=1e13
)

# Start export task
export_task.start()

print('Export started. Check your Google Drive folder EarthEngineExports.')
```

**Notes:**  
- Replace `xmin, ymin, xmax, ymax` with your bounding box coordinates in longitude and latitude.  
- The `.median()` reducer creates a composite image summarizing the vegetation indices over the specified period.  
- Export scale is set to 250m to match MODIS resolution.  
- Exporting large areas or long time ranges may require tiling or smaller regions due to Earth Engine limits.

This approach allows automated retrieval of MODIS NDVI and EVI data for any geographic bounding box and time period using the GEE Python API[1][2].