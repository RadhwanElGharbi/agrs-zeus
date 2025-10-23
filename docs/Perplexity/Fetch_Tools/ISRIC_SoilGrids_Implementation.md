# ISRIC SoilGrids v2.0 Implementation Guide

**Query Date:** 2025-10-12 20:20:49 UTC
**Model:** sonar
**Query ID:** soilgrids_implementation_20251012_202049

## Query


I need to implement an automated fetch tool for ISRIC SoilGrids soil property data.

Requirements:
1. Access ISRIC SoilGrids v2.0 WCS (Web Coverage Service)
2. Fetch soil properties: SOC (soil organic carbon), clay, sand, silt, pH, bulk density (bdod), CEC
3. Use WCS GetCoverage requests
4. Support bounding box (EPSG:4326) input
5. Output as GeoTIFF (preferably multi-band with each property as a band)
6. Use standard depth: 0-5cm layer
7. Use command-line tools (gdal_translate, curl, Python if needed)

Please provide:
- Current ISRIC SoilGrids WCS endpoint URL (2024-2025)
- WCS GetCoverage request syntax
- Layer names for each soil property
- How to combine multiple properties into one multi-band GeoTIFF
- Example curl/gdal commands
- Error handling recommendations

Context: This is for a C++ CLI tool that will shell out to gdal/curl/python commands.


## Response

Here is a detailed guide to implement an automated fetch tool for ISRIC SoilGrids v2.0 soil property data via WCS, meeting your requirements:

---

**1. Current ISRIC SoilGrids v2.0 WCS endpoint URL (2024-2025):**

The base WCS endpoint for SoilGrids v2.0 is:

```
https://maps.isric.org/mapserv?map=/map/{property}.map
```

where `{property}` is the soil property name (e.g., `soc`, `clay`, `sand`, `silt`, `phh2o`, `bdod`, `cec`).

This is confirmed by ISRIC documentation and examples showing that each soil property has an independent WCS service at this URL pattern[1][2][7].

---

**2. Soil properties and their WCS service names:**

| Soil Property           | WCS Service `{property}` Name | Layer name prefix in coverage |
|------------------------|-------------------------------|-------------------------------|
| Soil Organic Carbon (SOC) | `soc`                        | `soc_`                        |
| Clay                   | `clay`                        | `clay_`                       |
| Sand                   | `sand`                        | `sand_`                       |
| Silt                   | `silt`                        | `silt_`                       |
| pH (in H2O)            | `phh2o`                       | `phh2o_`                      |
| Bulk Density (bdod)     | `bdod`                        | `bdod_`                       |
| Cation Exchange Capacity (CEC) | `cec`                  | `cec_`                        |

Each property has 24 coverages combining 6 depth intervals and 4 quantiles. You want the **0-5cm mean layer**, which is named:

```
{property}_0-5cm_mean
```

For example, for SOC:

```
soc_0-5cm_mean
```

---

**3. WCS GetCoverage request syntax:**

The WCS 2.0 GetCoverage request is an HTTP GET with parameters:

- `SERVICE=WCS`
- `VERSION=2.0.1` (or 2.0.0)
- `REQUEST=GetCoverage`
- `COVERAGEID={layer_name}` (e.g., `soc_0-5cm_mean`)
- `SUBSET=Long({minLon},{maxLon})` (EPSG:4326 longitude bounds)
- `SUBSET=Lat({minLat},{maxLat})` (EPSG:4326 latitude bounds)
- `FORMAT=image/tiff` (GeoTIFF output)

Example URL template for SOC:

```
https://maps.isric.org/mapserv?map=/map/soc.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=soc_0-5cm_mean&SUBSET=Long({minLon},{maxLon})&SUBSET=Lat({minLat},{maxLat})&FORMAT=image/tiff
```

Replace `{minLon}`, `{maxLon}`, `{minLat}`, `{maxLat}` with your bounding box coordinates in EPSG:4326.

---

**4. How to combine multiple properties into one multi-band GeoTIFF:**

Since each property is served by a separate WCS endpoint, you must:

1. Download each property as a single-band GeoTIFF for the same bounding box and resolution.
2. Use `gdal_merge.py` or `gdalbuildvrt` + `gdal_translate` to combine these single-band GeoTIFFs into one multi-band GeoTIFF.

Example using GDAL command line:

```bash
gdal_merge.py -separate -o combined.tif soc.tif clay.tif sand.tif silt.tif phh2o.tif bdod.tif cec.tif
```

This creates `combined.tif` with 7 bands, each corresponding to one soil property in the order listed.

Alternatively, use `gdalbuildvrt` to create a virtual raster and then translate to GeoTIFF:

```bash
gdalbuildvrt -separate combined.vrt soc.tif clay.tif sand.tif silt.tif phh2o.tif bdod.tif cec.tif
gdal_translate combined.vrt combined.tif
```

---

**5. Example curl and gdal_translate commands:**

*Example: Fetch SOC 0-5cm mean layer for bounding box (-10, 35, 0, 45):*

```bash
curl -o soc.tif "https://maps.isric.org/mapserv?map=/map/soc.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=soc_0-5cm_mean&SUBSET=Long(-10,0)&SUBSET=Lat(35,45)&FORMAT=image/tiff"
```

*Example: Fetch clay layer similarly:*

```bash
curl -o clay.tif "https://maps.isric.org/mapserv?map=/map/clay.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=clay_0-5cm_mean&SUBSET=Long(-10,0)&SUBSET=Lat(35,45)&FORMAT=image/tiff"
```

*Combine downloaded single-band GeoTIFFs into one multi-band GeoTIFF:*

```bash
gdal_merge.py -separate -o soil_properties_0-5cm.tif soc.tif clay.tif sand.tif silt.tif phh2o.tif bdod.tif cec.tif
```

---

**6. Optional: Using gdal_translate directly from WCS**

`gdal_translate` supports WCS input. You can use it to fetch and convert in one step:

```bash
gdal_translate "WCS:https://maps.isric.org/mapserv?map=/map/soc.map" -of GTiff -co COMPRESS=LZW -projwin {minLon} {maxLat} {maxLon} {minLat} -b 1 -outsize {width} {height} soc.tif
```

However, specifying the exact coverage and subset parameters is easier with direct HTTP requests via curl.

---

**7. Error handling recommendations:**

- **Check HTTP response codes:** If curl returns non-200, retry or log error.
- **Validate downloaded GeoTIFFs:** Use `gdalinfo` to confirm file integrity and expected band count.
- **Timeouts and retries:** Implement retries with exponential backoff for network errors.
- **Bounding box validation:** Ensure input bbox is valid (min < max, within -180 to 180 longitude and -90 to 90 latitude).
- **Coordinate reference system:** Always use EPSG:4326 for bounding box subsets.
- **File cleanup:** Remove partial or corrupted files on failure before retrying.
- **Rate limiting:** Respect ISRIC server usage policies to avoid blocking.
- **Logging:** Log all requests and responses for troubleshooting.

---

This approach allows your C++ CLI tool to shell out to curl and gdal commands to fetch and combine SoilGrids v2.0 soil property data for the 0-5cm layer as a multi-band GeoTIFF.

If you want, I can provide example Python snippets to automate this process as well.
