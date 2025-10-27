# Perplexity Intelligence Report

**Generated:** 1761309851
**Model:** sonar

---

**ArcGIS Pro** uses Esri's **World Elevation Services** as the default global elevation source for 3D scenes, which is a composite elevation service derived from multiple datasets including SRTM, USGS 3DEP, and other regional high-resolution DEMs provided by Esri's ArcGIS Online platform[2][3][10]. Users can customize or replace this default elevation surface with other elevation sources if desired[3].

**Google Earth** by default uses the **SRTM (Shuttle Radar Topography Mission) 90m resolution DEM** for global elevation data, supplemented by higher-resolution data in some regions where available. Google Earth does not publicly expose a direct API for elevation tiles but provides elevation data through its client interface and Google Maps Elevation API (which is a web service for point queries, not tiled DEM downloads)[1][6].

### Common Global DEM/Elevation Models and Access

| DEM/Elevation Model        | Resolution           | Access Method / API                                  | Notes                                                  |
|---------------------------|----------------------|----------------------------------------------------|--------------------------------------------------------|
| **SRTM**                  | 30m (SRTM1) / 90m (SRTM3) | Available via NASA/USGS APIs, EarthExplorer, AWS Terrain Tiles | SRTM 30m data available globally except poles; 90m is older version[2] |
| **Mapzen Terrain Tiles**  | ~30m                 | Tile service: `https://tile.mapzen.com/mapzen/terrain/v1/terrarium/{z}/{x}/{y}.png` (deprecated but archived) | Provided elevation as PNG tiles encoding height; service discontinued but tiles archived |
| **AWS Terrain Tiles**     | 1 arc-second (~30m)   | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Open access terrain tiles in Terrarium format PNGs, usable for DEM extraction |
| **Esri Terrain Service**  | Variable (10m-90m)    | ArcGIS REST Service: `https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer` | Used by ArcGIS Pro as default elevation source; supports export and analysis |
| **OpenTopography**        | Variable (Lidar, SRTM, etc.) | Web portal and APIs for data download in GeoTIFF and other formats | Provides high-resolution DEMs and point cloud data, often regional |

### How to Download/Fetch Elevation Tiles in GeoTIFF for a Bounding Box

1. **Using AWS Terrain Tiles (Terrarium PNG)**
   - Tiles are PNG images encoding elevation in RGB values.
   - Convert tiles to GeoTIFF by decoding RGB values to elevation.
   - Tile URL pattern:  
     ```
     https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
     ```
   - To get tiles for a bounding box, calculate tile indices (x,y) at zoom level z covering the area.
   - Tools like `gdal2tiles.py` or custom scripts can automate tile fetching and conversion.

2. **Using Esri Terrain Service**
   - ArcGIS REST API endpoint:  
     ```
     https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer
     ```
   - Supports export via REST API with parameters for bounding box, format (GeoTIFF), and resolution.
   - Example export request (replace bbox and size):  
     ```
     https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer/exportImage?
     bbox=-123.1,37.4,-122.9,37.6&bboxSR=4326&imageSR=4326&size=400,400&format=tiff&f=image
     ```
   - Requires authentication via ArcGIS Online credentials or token.

3. **Using NASA/USGS SRTM Data**
   - Download raw SRTM tiles (HGT files) from EarthExplorer or USGS servers.
   - Convert HGT to GeoTIFF using GDAL:  
     ```
     gdal_translate input.hgt output.tif
     ```
   - For programmatic access, use APIs like NASA's Earthdata or AWS S3 public buckets.

4. **OpenTopography**
   - Use their web interface or API to select area and download DEMs in GeoTIFF.
   - Supports various DEM products including SRTM, Lidar-derived DEMs.
   - No direct tile service but bulk downloads by bounding box.

### Summary of Tile Service URLs and API Examples

| Service                 | Tile URL / API Endpoint                                                                                              | Notes                                                                                   |
|-------------------------|---------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| AWS Terrain Tiles       | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`                                            | Free, global, Terrarium PNG tiles, decode RGB to elevation                              |
| Esri World Elevation    | `https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer`                              | ArcGIS REST API, supports exportImage operation for GeoTIFF                             |
| Mapzen Terrain Tiles    | `https://tile.mapzen.com/mapzen/terrain/v1/terrarium/{z}/{x}/{y}.png` (archived)                                     | Deprecated, but tiles available in archives                                            |
| NASA SRTM Data          | Download via EarthExplorer or AWS S3 buckets (e.g., `s3://raster/SRTM/`)                                             | Raw HGT files, convert to GeoTIFF                                                      |
| OpenTopography          | Web portal/API for DEM download by bounding box                                                                      | High-resolution regional DEMs, no tile service                                         |

### Example: Fetching a GeoTIFF from Esri Terrain Service for a Bounding Box

```http
GET https://elevation.arcgis.com/arcgis/rest/services/WorldElevation/Terrain/ImageServer/exportImage?
bbox=-123.1,37.4,-122.9,37.6&
bboxSR=4326&
imageSR=4326&
size=400,400&
format=tiff&
f=image
```

- Replace `bbox` with your bounding box coordinates in WGS84.
- `size` controls pixel dimensions.
- Requires authentication token appended as `&token=YOUR_TOKEN`.

### Additional Notes

- ArcGIS Pro users can set the default elevation surface in **Settings > Options > Map and Scene > Ground Elevation Surface** to use Esri's default or custom elevation layers[3].
- Google Earth elevation data extraction is typically done via point sampling or KML/GPX export and not by direct DEM tile download[1][6].
- For programmatic DEM generation in ArcGIS Pro, users often import elevation points or raster DEMs and create surfaces using spatial analyst tools[2][4].

This overview covers the default elevation sources in ArcGIS Pro and Google Earth, common global DEM datasets, and practical methods to access or download elevation tiles in GeoTIFF format with relevant service URLs and API usage examples.

---

## Sources & Citations

1. https://www.youtube.com/watch?v=97u2PucAihk
2. https://geospatialtraining.com/creating-a-digital-elevation-model-dem-with-arcgis-pro/
3. https://pro.arcgis.com/en/pro-app/latest/help/mapping/layer-properties/elevation-surfaces.htm
4. https://www.youtube.com/watch?v=5EHwVXpulbM
5. https://doc.arcgis.com/en/arcgis-earth/use/interactive-analysis.htm
6. https://www.youtube.com/watch?v=_fYOAF09XBw
7. https://pro.arcgis.com/en/pro-app/latest/help/sharing/overview/configure-web-elevation-layer.htm
8. https://pro.arcgis.com/en/pro-app/latest/help/editing/specify-an-elevation-for-3d-features.htm
9. https://geospatialtraining.com/generating-digital-surface-models-from-lidar-data-in-arcgis-pro/
10. https://pro.arcgis.com/en/pro-app/latest/help/mapping/map-authoring/author-a-basemap.htm
