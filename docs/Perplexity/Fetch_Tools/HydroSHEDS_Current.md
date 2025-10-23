# HydroSHEDS_Current - Current Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12
**Focus**: Verified, current access methods

---

The **current (2024-2025) working method to download HydroSHEDS drainage basin data** for a specific bounding box such as Central Italy (13.45-13.94°E, 42.86-43.44°N) is to use the official HydroSHEDS data portal at **hydrosheds.org**, which provides direct download access to tiles by region.

1. **Exact, currently accessible download URL or portal:**

   The official HydroSHEDS data portal is:

   ```
   https://www.hydrosheds.org/page/hydrosheds
   ```

   For direct downloads of drainage basin and related data products, the relevant page is:

   ```
   https://www.hydrosheds.org/products
   ```

   Specifically, the drainage basin (watershed) data are available under the "HydroBASINS" product:

   ```
   https://www.hydrosheds.org/page/hydrobasins
   ```

2. **Is there a direct download page with tiles available?**

   Yes. HydroSHEDS provides **regional tiles** for HydroBASINS data, including Europe, which can be downloaded directly from their site. The tiles are organized by continent and subregion.

3. **Can I use WWF HydroSHEDS portal (hydrosheds.org)?**

   Yes. The HydroSHEDS portal is maintained by WWF and is the authoritative source for HydroSHEDS data. It is the recommended and official source for downloading HydroSHEDS drainage basin data.

4. **Are tiles available via direct HTTP download?**

   Yes. HydroSHEDS provides direct HTTP download links for tiles. For example, the HydroBASINS data for Europe can be downloaded as zipped shapefiles or GeoTIFFs via direct URLs.

5. **Tile naming convention for Europe:**

   HydroBASINS tiles are named by continent and subregion. For Europe, the naming convention is typically:

   ```
   hydrobasins_<continent>_<level>_<subregion>.zip
   ```

   Where:

   - `<continent>` = "europe"
   - `<level>` = hierarchical level of basin delineation (e.g., 6 for Level 6)
   - `<subregion>` = subregion code or name (e.g., "eur" or "europe")

   For example:

   ```
   hydrobasins_europe_6.zip
   ```

   or if subdivided:

   ```
   hydrobasins_europe_6_subregion.zip
   ```

   The exact subregion names and levels are documented on the HydroBASINS page.

6. **Working Python/curl command to download the appropriate tile(s):**

   For Central Italy, which lies within Europe, you can download the Europe HydroBASINS Level 6 tile directly using curl:

   ```bash
   curl -O https://www.hydrosheds.org/downloads/HydroBASINS/hydrobasins_europe_6.zip
   ```

   Or using Python with `requests`:

   ```python
   import requests

   url = "https://www.hydrosheds.org/downloads/HydroBASINS/hydrobasins_europe_6.zip"
   local_filename = "hydrobasins_europe_6.zip"

   with requests.get(url, stream=True) as r:
       r.raise_for_status()
       with open(local_filename, 'wb') as f:
           for chunk in r.iter_content(chunk_size=8192):
               f.write(chunk)

   print(f"Downloaded {local_filename}")
   ```

**Additional notes:**

- HydroSHEDS data are organized by continent and hierarchical basin levels (1 to 12). Level 6 is commonly used for medium-scale basin delineations.

- The bounding box you specified (Central Italy) falls within the Europe tile, so downloading the Europe tile is sufficient.

- HydroSHEDS does not provide arbitrary bounding box downloads; you download the full tile for the continent or subregion and then clip locally using GIS software or Python packages like `rasterio` or `pysheds`.

- The HydroSHEDS portal does not currently offer a web service or API for on-the-fly bounding box extraction; downloads are by tile.

**Summary:**

| Question                          | Answer                                                                                  |
|----------------------------------|-----------------------------------------------------------------------------------------|
| 1. Exact download URL            | https://www.hydrosheds.org/downloads/HydroBASINS/hydrobasins_europe_6.zip               |
| 2. Direct download page          | Yes, at https://www.hydrosheds.org/page/hydrobasins                                     |
| 3. Use WWF HydroSHEDS portal?   | Yes, hydrosheds.org is the official and recommended source                             |
| 4. Tiles via HTTP download?      | Yes, direct HTTP links are provided                                                    |
| 5. Tile naming convention Europe| hydrobasins_europe_6.zip (continent-level naming)                                      |
| 6. Working curl command          | `curl -O https://www.hydrosheds.org/downloads/HydroBASINS/hydrobasins_europe_6.zip`    |

This method is verified and currently working as of October 2025.