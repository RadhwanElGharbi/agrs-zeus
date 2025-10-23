# Global_Seismic_Hazard Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

To automatically download **global seismic hazard map data** for a specific geographic bounding box (bbox) using Python, you can use data from authoritative sources such as the **USGS** and the **Global Earthquake Model (GEM)**. Here are the detailed implementation aspects:

---

### 1. Data Source URLs

- **USGS Seismic Hazard Maps**:  
  USGS provides seismic hazard data globally and for the US via their National Seismic Hazard Maps portal and web services.  
  - USGS Hazard Data: https://earthquake.usgs.gov/hazards/  
  - USGS Hazard Map Web Services (WMS/WCS): https://mrdata.usgs.gov/services/ (some hazard layers available)  
  - USGS ShakeMap and hazard data downloads: https://earthquake.usgs.gov/data/shakemap/  

- **Global Earthquake Model (GEM)**:  
  GEM provides global seismic hazard data and tools, including hazard maps and OpenQuake engine for hazard calculations.  
  - GEM Hazard Map Portal: https://hazard.openquake.org/  
  - GEM OpenQuake Engine (Python-based): https://github.com/gem/oq-engine  

---

### 2. Available Data Products

- **Peak Ground Acceleration (PGA)**: Commonly provided for various return periods (e.g., 475 years, 2475 years).  
- **Spectral Acceleration (SA)**: At different periods (e.g., 0.2s, 1.0s) for engineering applications.  
- **Other Ground Motion Parameters**: Peak ground velocity, displacement, etc., depending on the dataset.  

USGS hazard maps typically provide PGA and spectral acceleration values for different return periods, suitable for seismic design and risk assessment[1].

---

### 3. Download Methods

- **Direct File Download**:  
  USGS and GEM provide hazard data as GeoTIFF, ASCII grids, or shapefiles for direct download. These files can be large and cover global or regional extents.  

- **Web Map Service (WMS) / Web Coverage Service (WCS)**:  
  Some hazard data layers are available via OGC WMS/WCS protocols, allowing dynamic querying and downloading of map tiles or coverage data for a specified bbox.  

- **APIs and Python Packages**:  
  GEM’s OpenQuake engine is a Python tool to compute hazard maps from seismic source models and ground motion prediction equations.  
  USGS does not have a dedicated seismic hazard API but provides data files and WMS services that can be queried programmatically.

---

### 4. Python Code for Automated Fetching by Bounding Box

You can use Python libraries like `OWSLib` for WMS/WCS services or `requests` for direct file downloads. For example, to fetch a WMS layer from USGS or GEM:

```python
from owslib.wms import WebMapService

# Example: Connect to a WMS service (replace with actual URL)
wms_url = 'https://example.com/wms'  # Replace with USGS or GEM WMS URL
wms = WebMapService(wms_url, version='1.3.0')

# List available layers
print(list(wms.contents))

# Define bounding box (minx, miny, maxx, maxy) in EPSG:4326
bbox = (-125.0, 32.0, -114.0, 42.0)  # Example bbox for California region

# Request a map image for a specific layer and bbox
img = wms.getmap(
    layers=['pga_475yr'],  # Example layer name
    srs='EPSG:4326',
    bbox=bbox,
    size=(800, 600),
    format='image/geotiff',
    transparent=True
)

# Save the image
with open('pga_475yr.tif', 'wb') as f:
    f.write(img.read())
```

For direct file downloads, you can use `requests` to download GeoTIFF or ASCII grid files if URLs are known.

---

### 5. Data Formats and Resolutions

- **Formats**: GeoTIFF, ASCII Grid (.asc), shapefiles, NetCDF.  
- **Resolutions**: Vary by dataset; USGS national maps often have ~1 km resolution; GEM global maps may be coarser (~0.1° or ~10 km).  
- **Coordinate Reference System**: Usually EPSG:4326 (WGS84) for global data.

---

### 6. Example Implementation: Downloading USGS PGA Data for a BBox

USGS does not provide a direct WMS for seismic hazard, but hazard data files are available for download. You can automate downloading and clipping with Python:

```python
import requests
import rasterio
from rasterio.windows import from_bounds

# URL of USGS PGA GeoTIFF (example for 475-year return period)
url = 'https://earthquake.usgs.gov/static/lfs/nshm/2023/2023/nshm23pga_475yr.tif'

# Download the file
r = requests.get(url)
with open('nshm23pga_475yr.tif', 'wb') as f:
    f.write(r.content)

# Define bounding box to clip (minx, miny, maxx, maxy)
bbox = (-125.0, 32.0, -114.0, 42.0)  # California region

# Open raster and clip to bbox
with rasterio.open('nshm23pga_475yr.tif') as src:
    window = from_bounds(*bbox, transform=src.transform)
    clipped_data = src.read(1, window=window)
    clipped_transform = src.window_transform(window)

    # Save clipped raster
    profile = src.profile
    profile.update({
        'height': clipped_data.shape[0],
        'width': clipped_data.shape[1],
        'transform': clipped_transform
    })

    with rasterio.open('clipped_pga_475yr.tif', 'w', **profile) as dst:
        dst.write(clipped_data, 1)
```

This script downloads a USGS PGA hazard GeoTIFF, clips it to the specified bounding box, and saves the clipped raster.

---

### Summary

| Aspect               | Details                                                                                   |
|----------------------|-------------------------------------------------------------------------------------------|
| **Data Sources**     | USGS (https://earthquake.usgs.gov/hazards/), GEM (https://hazard.openquake.org/)          |
| **Data Products**    | PGA, Spectral Acceleration (e.g., 0.2s, 1.0s), various return periods                      |
| **Download Methods** | Direct file download (GeoTIFF, ASCII), WMS/WCS (limited availability), OpenQuake engine   |
| **Python Tools**     | `requests` for downloads, `rasterio` for raster processing, `OWSLib` for WMS/WCS queries  |
| **Formats & Resolutions** | GeoTIFF, ASCII Grid; resolutions ~1 km (USGS), coarser for global (GEM)               |

---

If you want to compute custom hazard maps for any bbox, consider using the **OpenQuake engine** with seismic source models and ground motion prediction equations, which requires more setup but offers flexibility.

This approach provides a practical way to automate downloading and extracting seismic hazard data for any geographic bounding box using Python.