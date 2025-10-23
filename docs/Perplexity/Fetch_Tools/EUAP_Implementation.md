# EUAP Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

Certainly! Here is a detailed guide on how to automatically download **EUAP (Elenco Ufficiale Aree Protette)** data (Italian official protected areas) using Python.

---

## 1. Official Data Source URLs

The **EUAP** dataset is published by the **Italian Ministry of Environment** (Ministero della Transizione Ecologica - MITE). The official data portal is:

- **ISPRA Geoportal (Istituto Superiore per la Protezione e la Ricerca Ambientale):**  
  https://www.isprambiente.gov.it/it/servizi/geodati-e-cartografia/aree-protette

- **Ministero della Transizione Ecologica - Geoportal:**  
  https://www.minambiente.it/pagina/aree-protette

The EUAP dataset is often available via:

- Direct download links (Shapefile, GeoPackage)
- WFS (Web Feature Service) endpoints for dynamic queries

---

## 2. Available Data Formats

- **Shapefile (.shp)**: Classic GIS vector format, often zipped.
- **GeoPackage (.gpkg)**: Modern, single-file GIS format.
- **WFS (Web Feature Service)**: OGC standard for querying geospatial features over HTTP.

---

## 3. WFS Endpoint

The EUAP dataset is available via WFS from ISPRA's Geoportal:

- **WFS URL:**  
  `https://www.isprambiente.gov.it/geoserver/ows?service=WFS&version=1.1.0&request=GetCapabilities`

The specific layer for EUAP is usually named something like:

- `euap:aree_protette` or `euap:aree_protette_italia`

You can confirm the exact layer name by inspecting the GetCapabilities XML.

---

## 4. Python Code for Automated Download by BBOX

You can use the `owslib` library to interact with WFS services and `geopandas` to handle geospatial data.

### Install dependencies

```bash
pip install owslib geopandas requests
```

### Example Python script

```python
from owslib.wfs import WebFeatureService
import geopandas as gpd
from shapely.geometry import box

# WFS endpoint URL
wfs_url = "https://www.isprambiente.gov.it/geoserver/ows"

# Connect to WFS
wfs = WebFeatureService(url=wfs_url, version='1.1.0')

# List available layers
print("Available layers:")
for layer in wfs.contents:
    print(layer)

# Select the EUAP layer (replace with actual layer name found)
layer_name = 'euap:aree_protette'  # Example, verify exact name

# Define bounding box (xmin, ymin, xmax, ymax) in EPSG:4326
bbox = (7.0, 44.0, 13.0, 47.0)  # Example: Northern Italy area

# Request features within bbox
response = wfs.getfeature(
    typename=layer_name,
    bbox=bbox,
    outputFormat='application/json'  # GeoJSON output
)

# Read GeoJSON into GeoDataFrame
gdf = gpd.read_file(response)

# Save to file
gdf.to_file("euap_subset.gpkg", driver="GPKG")

print(f"Downloaded {len(gdf)} features within bbox and saved to euap_subset.gpkg")
```

---

## 5. Data Structure and Attributes

The EUAP dataset typically contains polygon geometries representing protected areas and attributes such as:

| Attribute Name       | Description                                  |
|---------------------|----------------------------------------------|
| `id`                | Unique identifier                            |
| `nome`              | Name of the protected area                   |
| `tipo_area`         | Type of protected area (e.g., National Park, Regional Park) |
| `categoria`         | Protection category (IUCN category)          |
| `ente_gestore`      | Managing authority                           |
| `superficie_ha`     | Area size in hectares                        |
| `data_istituzione`  | Date of establishment                        |
| `codice`            | Official code                               |

The exact schema can be inspected by loading the data or checking metadata on the ISPRA portal.

---

## 6. Example Implementation Summary

```python
from owslib.wfs import WebFeatureService
import geopandas as gpd

# Connect to WFS
wfs_url = "https://www.isprambiente.gov.it/geoserver/ows"
wfs = WebFeatureService(url=wfs_url, version='1.1.0')

# Check available layers
print("Layers:", list(wfs.contents.keys()))

# Use the EUAP layer (replace with actual layer name)
layer_name = 'euap:aree_protette'

# Define bounding box (Italy northern region example)
bbox = (7.0, 44.0, 13.0, 47.0)

# Download features within bbox as GeoJSON
response = wfs.getfeature(typename=layer_name, bbox=bbox, outputFormat='application/json')

# Load into GeoDataFrame
gdf = gpd.read_file(response)

# Save to GeoPackage
gdf.to_file("euap_northern_italy.gpkg", driver="GPKG")

print(f"Saved {len(gdf)} features to euap_northern_italy.gpkg")
```

---

### Notes:

- Always check the WFS GetCapabilities document to confirm the exact layer name.
- The bounding box coordinates must be in the coordinate reference system used by the WFS (usually EPSG:4326).
- You can adjust the bbox to download different parts of Italy or the entire dataset.
- For large datasets, consider downloading the full shapefile or geopackage from the ISPRA portal directly.

---

If you want, I can help you with a script to download the full dataset from the official zipped shapefile URL as well. Just ask!