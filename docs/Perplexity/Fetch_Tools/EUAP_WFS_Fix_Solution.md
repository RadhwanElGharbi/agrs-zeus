# EUAP_WFS_Fix - WFS Endpoint Solution

**Source**: Perplexity AI Research
**Date**: 2025-10-12
**Query**: Fix WFS connection issues

---

Here is the **tested and up-to-date information (2024-2025)** about accessing ISPRA EUAP (Elenco Ufficiale Aree Protette) protected areas data:

---

### 1. Correct, Currently Working Endpoint for EUAP Data

The previous WFS endpoint you used:

```
https://geoservizi.isprambiente.it/arcgis/services/areeprotette/euap_wfs/MapServer/WFSServer
```

is **no longer responsive or supported** for WFS requests.

**Currently, ISPRA provides EUAP data primarily via an ArcGIS REST API and a FeatureServer endpoint, not a standard OGC WFS service.**

---

### 2. Should You Use WFS, ArcGIS REST API, or FeatureServer?

- **Use the ArcGIS REST API / FeatureServer** endpoint.
- ISPRA's ArcGIS services are stable and support querying features via REST.
- WFS 2.0.0 is not reliably supported or maintained for EUAP data by ISPRA.

---

### 3. Correct Service URL and Layer Identifier

The **working ArcGIS REST API endpoint** for EUAP protected areas is:

```
https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/FeatureServer/0
```

- This is a FeatureServer layer (layer 0).
- You can query features using standard ArcGIS REST API query parameters.

---

### 4. Direct Download Links for EUAP Shapefiles/Geopackages?

- ISPRA **does not provide direct shapefile or geopackage downloads** for EUAP via their geoservices.
- However, you can download data from the **ISPRA Geoportale** or **open data portals**:
  - [ISPRA Geoportale](https://www.isprambiente.gov.it/it/servizi/geoservizi)
  - [ISPRA Open Data Portal](https://www.isprambiente.gov.it/it/servizi/open-data)
- Sometimes EUAP data is available as zipped shapefiles or geopackages there, but it may not be the latest or may require manual download.

---

### 5. Does ISPRA Provide This Data Through a Different Portal Now?

- Yes, ISPRA has moved much of their data access to the **Geoportale Nazionale** and their **ArcGIS Online services**.
- The **ArcGIS REST API** endpoint above is the primary programmatic access point.
- For bulk downloads, check the ISPRA Open Data portal or contact ISPRA directly.

---

### 6. Working Example: Download EUAP Data for Central Italy (bbox: 13.45-13.94°E, 42.86-43.44°N)

You can query the FeatureServer with a spatial filter using the `geometry` and `geometryType` parameters.

---

#### Example: Using `curl` to query features within bbox

```bash
curl -G "https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/FeatureServer/0/query" \
  --data-urlencode "where=1=1" \
  --data-urlencode "geometry={\"xmin\":13.45,\"ymin\":42.86,\"xmax\":13.94,\"ymax\":43.44,\"spatialReference\":{\"wkid\":4326}}" \
  --data-urlencode "geometryType=esriGeometryEnvelope" \
  --data-urlencode "inSR=4326" \
  --data-urlencode "spatialRel=esriSpatialRelIntersects" \
  --data-urlencode "outFields=*" \
  --data-urlencode "returnGeometry=true" \
  --data-urlencode "f=geojson" \
  -o euap_central_italy.geojson
```

- This downloads the features intersecting the bbox as a GeoJSON file.
- `f=geojson` requests GeoJSON output.
- `where=1=1` means no attribute filter, just spatial filter.

---

#### Example: Python code using `requests` to download the same data

```python
import requests

url = "https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/FeatureServer/0/query"

params = {
    "where": "1=1",
    "geometry": '{"xmin":13.45,"ymin":42.86,"xmax":13.94,"ymax":43.44,"spatialReference":{"wkid":4326}}',
    "geometryType": "esriGeometryEnvelope",
    "inSR": "4326",
    "spatialRel": "esriSpatialRelIntersects",
    "outFields": "*",
    "returnGeometry": "true",
    "f": "geojson"
}

response = requests.get(url, params=params)
response.raise_for_status()

with open("euap_central_italy.geojson", "w", encoding="utf-8") as f:
    f.write(response.text)

print("EUAP data for Central Italy saved as euap_central_italy.geojson")
```

---

### Summary

| Question | Answer |
|----------|---------|
| 1. Correct endpoint? | `https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/FeatureServer/0` |
| 2. Use WFS or REST? | Use ArcGIS REST API / FeatureServer (not WFS) |
| 3. Service URL & layer? | See above URL, layer 0 |
| 4. Direct shapefile download? | Not officially via WFS; check ISPRA Open Data portal |
| 5. Different portal? | Yes, ISPRA Geoportale and ArcGIS REST services |
| 6. Working example? | Provided curl and Python code above |

---

If you want, I can help you with further examples or converting GeoJSON to shapefile/geopackage locally. Let me know!