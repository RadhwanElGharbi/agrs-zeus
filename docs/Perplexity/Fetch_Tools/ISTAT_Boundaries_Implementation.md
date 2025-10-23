# ISTAT_Boundaries Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

To automatically download ISTAT (Italian National Institute of Statistics) administrative boundaries using Python, you can use ISTAT's official data portal where shapefiles for different administrative levels are published. ISTAT provides boundaries for **comuni (municipalities), province (provinces), and regioni (regions)** in standard geospatial formats like **Shapefile** and sometimes **GeoJSON**.

### 1. Official ISTAT Download URLs
ISTAT publishes administrative boundaries on their official website, typically under the "Territorial Data" or "Cartographic Data" sections. The main URL for administrative boundaries is:

- ISTAT Administrative Boundaries page:  
  https://www.istat.it/en/archivio/222527 (English)  
  https://www.istat.it/it/archivio/222527 (Italian)

From here, you can download zipped shapefiles for:

- Regions (Regioni)
- Provinces (Province)
- Municipalities (Comuni)

The direct download URLs for the latest versions (as of 2025) usually follow a pattern like:  
`https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Livello_<level>_2021.zip`  
where `<level>` is `Regioni`, `Province`, or `Comuni`.

### 2. Available Boundary Levels
- **Regioni** (Regions) — 20 regions in Italy  
- **Province** (Provinces) — around 107 provinces  
- **Comuni** (Municipalities) — about 7,900 municipalities  

### 3. Data Formats
- **Shapefile (.shp, .shx, .dbf, .prj)** — the primary format provided by ISTAT  
- Sometimes **GeoJSON** or other GIS formats are available or can be converted from shapefiles using Python libraries.

### 4. Python Code for Automated Download

You can automate the download and extraction of these shapefiles using Python's `requests` and `zipfile` modules. Here is an example script:

```python
import requests
import zipfile
import io
import os

def download_istat_boundaries(level='Comuni', year=2021, output_dir='istat_boundaries'):
    """
    Download and extract ISTAT administrative boundaries shapefiles.
    
    Parameters:
    - level: 'Regioni', 'Province', or 'Comuni'
    - year: year of the dataset (usually 2021 or latest)
    - output_dir: directory to save extracted files
    """
    base_url = "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati"
    filename = f"Livello_{level}_{year}.zip"
    url = f"{base_url}/{filename}"
    
    print(f"Downloading {url} ...")
    response = requests.get(url)
    response.raise_for_status()
    
    with zipfile.ZipFile(io.BytesIO(response.content)) as z:
        print(f"Extracting to {output_dir} ...")
        os.makedirs(output_dir, exist_ok=True)
        z.extractall(output_dir)
    
    print(f"Download and extraction completed for {level}.")

# Example usage:
download_istat_boundaries('Regioni')
download_istat_boundaries('Province')
download_istat_boundaries('Comuni')
```

This script downloads the zipped shapefile for the specified administrative level and extracts it locally.

### 5. WFS/WMS Endpoints if Available
ISTAT does not officially provide public WFS/WMS endpoints for administrative boundaries. However, some regional or third-party services may offer WFS/WMS layers for ISTAT boundaries or derived products.

For example, the Italian Geoportal (Geoportale Nazionale) or regional geoportals sometimes provide WMS/WFS services with administrative layers, but these are not directly from ISTAT.

If you want to use WFS/WMS, you can explore:

- Italian Geoportal: https://www.pcn.minambiente.it/mattm/en/geoportale  
- Regional geoportals (e.g., Regione Lombardia, Regione Emilia-Romagna)

You can access these services in Python using libraries like `OWSLib`.

### 6. Example Implementation: Download and Load with Geopandas

After downloading and extracting the shapefiles, you can load them with `geopandas` for analysis:

```python
import geopandas as gpd

# Path to extracted shapefile (adjust path as needed)
shapefile_path = 'istat_boundaries/Livello_Comuni_2021/Com01012021_g.shp'

# Load shapefile
gdf = gpd.read_file(shapefile_path)

# Inspect data
print(gdf.head())
print(gdf.crs)  # Coordinate Reference System

# Plot boundaries
gdf.plot(figsize=(10, 10))
```

This example assumes you have installed `geopandas` (`pip install geopandas`).

---

**Summary:**

| Aspect                  | Details                                                                                   |
|-------------------------|-------------------------------------------------------------------------------------------|
| Official URLs           | https://www.istat.it/en/archivio/222527                                                  |
| Boundary Levels         | Regioni (regions), Province (provinces), Comuni (municipalities)                          |
| Data Formats            | Shapefile (primary), GeoJSON (convertible)                                               |
| Python Download Example | Use `requests` + `zipfile` to download and extract shapefiles automatically               |
| WFS/WMS Endpoints       | Not officially provided by ISTAT; check Italian Geoportal or regional geoportals          |
| Example Python Usage    | Download + extract + load with `geopandas`                                               |

This approach enables fully automated retrieval and use of ISTAT administrative boundaries in Python workflows.