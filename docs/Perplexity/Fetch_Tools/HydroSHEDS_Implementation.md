# HydroSHEDS Fetch Tool Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12

---

## Implementation Details for Downloading HydroSHEDS Data

### 1. Exact Download URLs or API Endpoints

HydroSHEDS data can be downloaded from the HydroSHEDS website or through direct HTTP downloads. However, for automated processes, using the USGS EarthExplorer or similar platforms is recommended. Unfortunately, HydroSHEDS does not provide a direct API for downloading data, but you can use the USGS EarthExplorer to manually download data or use tools like `requests` in Python to automate downloads if you have a direct link.

### 2. Tile Naming Scheme and Coverage

HydroSHEDS data is typically organized into tiles based on a grid system. Each tile covers a specific geographic area, and the naming convention often includes the tile's coordinates or a unique identifier.

### 3. Data Products Available

HydroSHEDS offers several data products, including:
- **Flow Direction**: Indicates the direction of water flow.
- **Flow Accumulation**: Represents the number of cells that drain into each cell.
- **Basins**: Defines the boundaries of drainage basins.

### 4. Resolution Options

HydroSHEDS data is available at various resolutions, typically 3 arc-seconds (about 90 meters at the equator), 15 arc-seconds, and 30 arc-seconds.

### 5. Python Code for Automated Tile Download and Mosaicking

To automate the download and mosaicking process, you can use Python libraries like `requests` for downloading and `gdal` for mosaicking. However, since HydroSHEDS doesn't provide a straightforward API, you might need to manually download tiles or use a workaround like accessing the data through a third-party service.

Here's a simplified example of how you might approach this using `requests` and `gdal` for mosaicking:

```python
import requests
from osgeo import gdal, osr
import os

# Example function to download a tile (assuming you have a direct link)
def download_tile(url, filename):
    response = requests.get(url)
    with open(filename, 'wb') as file:
        file.write(response.content)

# Example function to mosaic tiles
def mosaic_tiles(tiles_path, output_path):
    # Create a VRT file first
    vrt_path = os.path.join(output_path, 'mosaic.vrt')
    gdal.BuildVRT(vrt_path, [os.path.join(tiles_path, file) for file in os.listdir(tiles_path) if file.endswith('.tif')])
    
    # Then convert VRT to GeoTIFF
    gdal.Translate(output_path + '/mosaic.tif', vrt_path)

# Example usage
url = "https://example.com/hydrosheds_tile.tif"  # Replace with actual URL
filename = "hydrosheds_tile.tif"
download_tile(url, filename)

tiles_path = "path/to/tiles"
output_path = "path/to/output"
mosaic_tiles(tiles_path, output_path)
```

### 6. How to Clip to Specific Bounding Box

To clip the downloaded data to a specific bounding box, you can use `gdal` in Python. Here's how you can do it:

```python
from osgeo import gdal, osr

def clip_to_bbox(input_path, output_path, bbox):
    # Open the input dataset
    ds = gdal.Open(input_path)
    
    # Create a new spatial reference system
    srs = osr.SpatialReference()
    srs.ImportFromWkt(ds.GetProjection())
    
    # Define the bounding box coordinates (minX, minY, maxX, maxY)
    minX, minY, maxX, maxY = bbox
    
    # Clip the dataset
    gdal.Warp(output_path, ds, dstSRS=srs, outputBounds=[minX, minY, maxX, maxY])

# Example usage
input_path = "path/to/mosaic.tif"
output_path = "path/to/clipped_mosaic.tif"
bbox = (-122.0, 37.0, -121.0, 38.0)  # Example bounding box coordinates
clip_to_bbox(input_path, output_path, bbox)
```

### Note:
- The above code snippets are simplified examples. You will need to adapt them based on your specific requirements and the structure of the HydroSHEDS data.
- For direct HTTP downloads, ensure you have the correct URLs for the tiles you need.
- Always check the licensing terms for any data you download.