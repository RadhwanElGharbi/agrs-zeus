# IFFI Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

Certainly! Here is a detailed guide on how to automatically download ISPRA IFFI (Inventario dei Fenomeni Franosi in Italia) landslide inventory data using Python, covering all your requested points.

---

## 1. Official ISPRA Data Source URLs

The IFFI landslide inventory is maintained by ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale). The official data portal is:

- **ISPRA IFFI Portal:**  
  https://www.isprambiente.gov.it/en/projects/inventory-of-landslides-in-italy-iffi

- **Direct data download page:**  
  https://www.isprambiente.gov.it/en/projects/inventory-of-landslides-in-italy-iffi/download

From the download page, the data is available as shapefiles and geodatabases.

---

## 2. Available Data Formats and Access Methods

- **Data Formats:**  
  - ESRI Shapefile (.shp)  
  - File Geodatabase (.gdb)  
  - GeoPackage (.gpkg) (sometimes available)  
  - CSV (metadata)

- **Access Methods:**  
  - Direct download of zipped shapefiles or geodatabases from ISPRA website  
  - WMS/WFS services for querying and downloading subsets (limited availability)  
  - FTP or HTTP download links for bulk data

---

## 3. WMS/WFS Endpoints if Available

ISPRA provides some WMS/WFS services for IFFI data, but these are not always publicly documented or stable. However, the following endpoint is known:

- **WMS Endpoint:**  
  `https://www.isprambiente.gov.it/geoserver/iffi/wms`

- **WFS Endpoint:**  
  `https://www.isprambiente.gov.it/geoserver/iffi/wfs`

You can query these services to get data by bounding box or other filters.

---

## 4. Python Code for Automated Download by BBOX

### Approach 1: Download full dataset and clip locally (simpler)

You can download the full shapefile zip, unzip it, and then use `geopandas` to clip by bounding box.

### Approach 2: Query WFS by bounding box (preferred for partial data)

Here is an example Python script to query the ISPRA IFFI WFS service by bounding box and save the result locally.

```python
import geopandas as gpd
from owslib.wfs import WebFeatureService
from shapely.geometry import box

# Define WFS endpoint
wfs_url = "https://www.isprambiente.gov.it/geoserver/iffi/wfs"

# Connect to WFS
wfs = WebFeatureService(url=wfs_url, version='2.0.0')

# List available layers
print("Available layers:", list(wfs.contents))

# Select the IFFI layer (example layer name, verify actual name)
layer_name = 'iffi:iffi'  # You may need to check the exact layer name

# Define bounding box (minx, miny, maxx, maxy) in EPSG:4326
bbox = (9.0, 44.0, 10.0, 45.0)  # Example bbox over northern Italy

# Build filter for bbox (WFS 2.0.0 uses bbox parameter)
response = wfs.getfeature(typename=layer_name, bbox=bbox, outputFormat='application/json')

# Save GeoJSON response
with open('iffi_subset.geojson', 'wb') as f:
    f.write(response.read())

# Load with geopandas for further processing
gdf = gpd.read_file('iffi_subset.geojson')

print(gdf.head())
```

---

## 5. Data Structure and Landslide Classification

### Data Structure

The IFFI dataset typically contains:

- **Geometry:** Polygon or multipolygon representing landslide extent  
- **Attributes:**  
  - `ID`: unique identifier  
  - `COMUNE`: municipality  
  - `PROVINCIA`: province  
  - `REGIONE`: region  
  - `TIPO_FENOM`: landslide type (e.g., slide, flow, fall)  
  - `DATA_RILEV`: date of survey  
  - `SUPERFICIE`: landslide area (m²)  
  - `STATO`: activity state (active, dormant, relict)  
  - `MORFOLOGIA`: morphology  
  - `MECANISMO`: failure mechanism  
  - `NOTE`: additional notes

### Landslide Classification

The classification follows the IFFI legend, including:

- **Types:**  
  - Creep  
  - Slide (rotational, translational)  
  - Flow (earth flow, debris flow)  
  - Fall (rock fall, debris fall)  
  - Complex (combination)

- **Activity States:**  
  - Active  
  - Dormant  
  - Reactivated  
  - Stabilized

---

## 6. Example Implementation

Here is a complete example that downloads a subset of IFFI data by bounding box, loads it, and prints a summary of landslide types.

```python
import geopandas as gpd
from owslib.wfs import WebFeatureService

def download_iffi_by_bbox(bbox, output_file='iffi_subset.geojson'):
    """
    Download IFFI landslide data from ISPRA WFS by bounding box.
    
    Parameters:
    - bbox: tuple (minx, miny, maxx, maxy) in EPSG:4326
    - output_file: filename to save GeoJSON
    
    Returns:
    - geopandas.GeoDataFrame of downloaded data
    """
    wfs_url = "https://www.isprambiente.gov.it/geoserver/iffi/wfs"
    wfs = WebFeatureService(url=wfs_url, version='2.0.0')
    
    # Check available layers
    layers = list(wfs.contents)
    print("Available layers:", layers)
    
    # Use the main IFFI layer (adjust if needed)
    layer_name = 'iffi:iffi'
    
    # Request features within bbox
    response = wfs.getfeature(typename=layer_name, bbox=bbox, outputFormat='application/json')
    
    # Save to file
    with open(output_file, 'wb') as f:
        f.write(response.read())
    
    # Load with geopandas
    gdf = gpd.read_file(output_file)
    return gdf

if __name__ == "__main__":
    # Define bounding box (example: northern Italy)
    bbox = (9.0, 44.0, 10.0, 45.0)
    
    # Download data
    gdf = download_iffi_by_bbox(bbox)
    
    # Print summary
    print(f"Downloaded {len(gdf)} landslide features.")
    print("Landslide types and counts:")
    print(gdf['TIPO_FENOM'].value_counts())
    
    # Example: save clipped data to shapefile
    gdf.to_file("iffi_subset.shp")
```

---

### Notes:

- You may need to verify the exact layer name by inspecting the WFS capabilities document or ISPRA metadata.
- The WFS service may have usage limits or require user-agent headers.
- For large areas, downloading the entire dataset and clipping locally may be more efficient.
- The coordinate reference system for WFS bbox is usually EPSG:4326 (lat/lon).

---

If you want, I can help you with code to download the entire dataset and clip locally or parse the attribute table in more detail. Let me know!