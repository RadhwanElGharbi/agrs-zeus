# Italian_Soil Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

There are no direct search results explicitly describing an official Italian Soil Information System dataset on Zenodo or other official sources with full implementation details. However, based on general knowledge of how to download datasets from Zenodo and typical soil data structures, I provide a detailed guide on how to automatically download soil data from Zenodo or official repositories using Python, including how to filter by bounding box (bbox) and soil parameters.

---

### 1. Zenodo Dataset URLs or DOIs for Italian Soil Data

- No specific Italian Soil Information System dataset DOI was found in the search results.
- Zenodo datasets related to environmental and soil data often have DOIs like `10.5281/zenodo.xxxxxxx`.
- You can search Zenodo with keywords like "Italian soil data" or "soil information system Italy" to find relevant datasets.
- Example DOI format: `https://doi.org/10.5281/zenodo.XXXXX`

---

### 2. Typical Data Structure and File Formats

Soil datasets for Italy or similar regions usually come in:

- **Raster files** (GeoTIFF, NetCDF) for spatial soil properties (e.g., soil organic carbon, texture, pH).
- **Vector files** (Shapefile, GeoJSON) for soil polygons or sampling points.
- **Tabular data** (CSV, Excel) with soil parameters linked to spatial coordinates.
- Metadata files describing variables, units, and spatial reference.

---

### 3. Python Code for Zenodo API Download

Zenodo provides a REST API to access records and files. You can use Python's `requests` library to query and download files.

```python
import requests
import os

def download_zenodo_record_files(doi, download_dir='data'):
    # Extract record ID from DOI
    # DOI format: 10.5281/zenodo.<record_id>
    record_id = doi.split('.')[-1]
    api_url = f'https://zenodo.org/api/records/{record_id}'

    # Create download directory
    os.makedirs(download_dir, exist_ok=True)

    # Get record metadata
    response = requests.get(api_url)
    response.raise_for_status()
    record = response.json()

    # Download all files in the record
    for file_info in record['files']:
        file_url = file_info['links']['self']
        filename = file_info['key']
        filepath = os.path.join(download_dir, filename)

        print(f'Downloading {filename}...')
        with requests.get(file_url, stream=True) as r:
            r.raise_for_status()
            with open(filepath, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        print(f'Saved to {filepath}')

# Example usage
doi = '10.5281/zenodo.15025514'  # Replace with actual DOI
download_zenodo_record_files(doi)
```

---

### 4. How to Extract Data by Bounding Box (bbox)

If the dataset is spatial (raster or vector), you can extract data within a bbox using geospatial Python libraries:

- For **raster data** (GeoTIFF):

```python
import rasterio
from rasterio.mask import mask
from shapely.geometry import box
import geopandas as gpd

def extract_raster_by_bbox(raster_path, bbox, output_path):
    # bbox = (minx, miny, maxx, maxy)
    geom = box(*bbox)
    geo = gpd.GeoDataFrame({'geometry': [geom]}, crs='EPSG:4326')

    with rasterio.open(raster_path) as src:
        out_image, out_transform = mask(src, geo.geometry, crop=True)
        out_meta = src.meta.copy()
        out_meta.update({
            "height": out_image.shape[1],
            "width": out_image.shape[2],
            "transform": out_transform
        })

        with rasterio.open(output_path, "w", **out_meta) as dest:
            dest.write(out_image)

# Example bbox for Italy (approximate)
bbox_italy = (6.5, 36.5, 18.5, 47.0)
extract_raster_by_bbox('soil_data.tif', bbox_italy, 'soil_data_italy.tif')
```

- For **vector data** (Shapefile, GeoJSON):

```python
import geopandas as gpd
from shapely.geometry import box

def extract_vector_by_bbox(vector_path, bbox, output_path):
    gdf = gpd.read_file(vector_path)
    bbox_geom = box(*bbox)
    gdf_bbox = gdf[gdf.intersects(bbox_geom)]
    gdf_bbox.to_file(output_path, driver='GeoJSON')

# Example usage
extract_vector_by_bbox('soil_polygons.shp', bbox_italy, 'soil_polygons_italy.geojson')
```

---

### 5. Available Soil Parameters for Italy

Typical soil parameters available in Italian soil datasets include:

- Soil texture fractions (sand, silt, clay)
- Soil organic carbon content
- Soil pH
- Bulk density
- Soil depth layers
- Cation exchange capacity (CEC)
- Soil moisture
- Soil classification types (e.g., WRB or USDA Soil Taxonomy)

The exact parameters depend on the dataset source and version.

---

### 6. Example Implementation Workflow

1. **Identify dataset DOI or URL** on Zenodo or official Italian soil data portals.
2. **Download dataset files** using the Zenodo API Python script.
3. **Load spatial data** with `rasterio` or `geopandas`.
4. **Extract data for Italy or custom bbox** using spatial masking.
5. **Analyze or visualize soil parameters** as needed.

---

### Summary

- Use Zenodo API to programmatically download soil datasets by DOI.
- Soil data usually come as raster (GeoTIFF) or vector (Shapefile/GeoJSON).
- Use Python geospatial libraries (`rasterio`, `geopandas`) to extract data by bbox.
- Soil parameters typically include texture, organic carbon, pH, bulk density, etc.
- No direct Italian Soil Information System dataset DOI was found in the search results; you should search Zenodo or official Italian soil data portals for the latest datasets.

If you provide a specific DOI or dataset link, I can help tailor the code further.