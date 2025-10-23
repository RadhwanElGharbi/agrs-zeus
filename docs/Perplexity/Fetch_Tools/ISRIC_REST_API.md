# ISRIC SoilGrids v2.0 REST API Documentation

Here is the detailed information you requested for the **ISRIC SoilGrids v2.0 REST API** for automated data fetching using the REST interface (not WCS):

---

### 1. REST API Base URL

The **base URL** for SoilGrids v2.0 REST API is:

```
https://rest.isric.org/soilgrids/v2.0
```

---

### 2. API Endpoint Structure

The main endpoint for querying soil properties is:

```
https://rest.isric.org/soilgrids/v2.0/properties/query
```

This endpoint supports POST requests with JSON payloads specifying locations or bounding boxes, soil properties, depth layers, and output format.

---

### 3. Query Parameters and Request Structure

- **Soil properties** you can query include:

  - `soc` (soil organic carbon content)
  - `clay`
  - `sand`
  - `silt`
  - `phh2o` (soil pH in H2O)
  - `bdod` (bulk density)
  - `cec` (cation exchange capacity)

- **Depth layers** are specified as strings representing depth intervals in cm:

  - `"0-5"`
  - `"5-15"`
  - `"15-30"`
  - `"30-60"`
  - `"60-100"`
  - `"100-200"`

- **Bounding box** is specified in EPSG:4326 (longitude, latitude) as:

  ```json
  "bbox": [minLon, minLat, maxLon, maxLat]
  ```

- **Output format** options include GeoTIFF (preferred), JSON, etc. For GeoTIFF, specify `"format": "geotiff"`.

---

### 4. Example Request Payload (POST JSON)

```json
{
  "bbox": [minLon, minLat, maxLon, maxLat],
  "properties": ["soc", "clay", "sand", "silt", "phh2o", "bdod", "cec"],
  "depths": ["0-5", "5-15", "15-30"],
  "format": "geotiff"
}
```

Replace `minLon`, `minLat`, `maxLon`, `maxLat` with your bounding box coordinates in EPSG:4326.

---

### 5. Example API Calls

#### Using `curl` to fetch GeoTIFF for a bounding box:

```bash
curl -X POST "https://rest.isric.org/soilgrids/v2.0/properties/query" \
  -H "Content-Type: application/json" \
  -d '{
    "bbox": [-120.0, 35.0, -119.0, 36.0],
    "properties": ["soc", "clay", "sand", "silt", "phh2o", "bdod", "cec"],
    "depths": ["0-5", "5-15"],
    "format": "geotiff"
  }' --output soilgrids_output.tif
```

This will download a GeoTIFF file named `soilgrids_output.tif` for the specified bounding box and soil properties.

#### Using Python `requests` library:

```python
import requests

url = "https://rest.isric.org/soilgrids/v2.0/properties/query"
payload = {
    "bbox": [-120.0, 35.0, -119.0, 36.0],
    "properties": ["soc", "clay", "sand", "silt", "phh2o", "bdod", "cec"],
    "depths": ["0-5", "5-15"],
    "format": "geotiff"
}
headers = {"Content-Type": "application/json"}

response = requests.post(url, json=payload, headers=headers)
if response.status_code == 200:
    with open("soilgrids_output.tif", "wb") as f:
        f.write(response.content)
else:
    print("Error:", response.status_code, response.text)
```

---

### 6. Authentication

- **No authentication or API key is required** to access the SoilGrids v2.0 REST API.
- The API is open but in **beta stage** and subject to fair use policies.

---

### 7. Rate Limits and Best Practices

- **Rate limit:** Fair use is defined as **5 API calls per minute** per user to maintain optimal performance.
- The API is in **beta**, so occasional downtime or issues may occur.
- Optimize your queries by requesting only needed properties, depths, and bounding boxes.
- Cache results locally when possible to reduce repeated calls.
- Contact ISRIC for support or questions: `soilgrids@isric.org`.

---

### 8. Implementing in C++ with `curl` and GDAL

- Use `libcurl` to perform the POST request with JSON payload as shown above.
- Save the response as a GeoTIFF file.
- Use GDAL commands or GDAL C++ API to read and process the GeoTIFF.

Example GDAL command to inspect the downloaded GeoTIFF:

```bash
gdalinfo soilgrids_output.tif
```

---

### Summary Table

| Item                  | Details                                                                                   |
|-----------------------|-------------------------------------------------------------------------------------------|
| Base URL              | `https://rest.isric.org/soilgrids/v2.0`                                                  |
| Main endpoint         | `/properties/query` (POST)                                                                |
| Soil properties       | `soc`, `clay`, `sand`, `silt`, `phh2o`, `bdod`, `cec`                                   |
| Depth layers          | `"0-5"`, `"5-15"`, `"15-30"`, `"30-60"`, `"60-100"`, `"100-200"`                        |
| Bounding box format   | `[minLon, minLat, maxLon, maxLat]` in EPSG:4326                                          |
| Output formats        | GeoTIFF (preferred), JSON                                                                 |
| Authentication        | None                                                                                      |
| Rate limit            | 5 calls per minute                                                                        |
| Example curl command  | See above                                                                                 |
| Support contact       | `soilgrids@isric.org`                                                                     |

---

This information is based on the official ISRIC SoilGrids v2.0 REST API documentation and related sources[1][2][6].