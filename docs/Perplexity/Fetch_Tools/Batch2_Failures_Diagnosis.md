# Batch 2 Fetch Tools - Failure Diagnosis

**Date**: 2025-10-12
**Issue**: All 4 tools failing with small downloads or invalid data

---

To diagnose and resolve the issues with the geospatial data fetch tools, let's address each service individually.

## 1. **HydroSHEDS**
- **Validity of URL**: The URL provided for HydroSHEDS seems to be specific to a particular dataset (`hybas_eu_lev6_v1c.zip`). It's essential to check if the dataset or URL has been updated or moved.
- **Authentication/Headers**: Typically, HydroSHEDS datasets are available for download without requiring authentication or special headers.
- **Alternative URLs**: Check the official HydroSHEDS website for any updates or alternative download links.
- **Blocking Automated Downloads**: Some servers might block automated downloads based on user-agent headers. Try using a browser or setting a user-agent header in your script to mimic a browser.

**Solution**:
1. Verify the dataset's availability on the HydroSHEDS website.
2. Use a browser or set a user-agent header in your script.

```python
import requests

url = "https://www.hydrosheds.org/downloads/HydroBASINS/hybas_eu_lev6_v1c.zip"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
response = requests.get(url, headers=headers)

with open('hybas_eu_lev6_v1c.zip', 'wb') as file:
    file.write(response.content)
```

## 2. **ISTAT Italy**
- **Validity of URL**: The URL seems specific to a particular dataset. Check if the dataset or URL has been updated.
- **Authentication/Headers**: ISTAT datasets are generally available without authentication, but some might require cookies or specific headers.
- **Alternative URLs**: Visit the ISTAT website for any updates or alternative links.
- **Blocking Automated Downloads**: Similar to HydroSHEDS, try using a browser or setting a user-agent header.

**Solution**:
1. Check the ISTAT website for updates.
2. Use a browser or set a user-agent header.

```python
import requests

url = "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Limiti01012023/Com01012023_g.zip"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}
response = requests.get(url, headers=headers)

with open('Com01012023_g.zip', 'wb') as file:
    file.write(response.content)
```

## 3. **SoilGrids WCS**
- **Validity of URL**: The URL seems to be a WCS request. Ensure that the parameters are correctly set.
- **Authentication/Headers**: WCS requests typically do not require authentication but might need specific parameters.
- **Alternative URLs**: Check the SoilGrids documentation for any updates or alternative methods.
- **Blocking Automated Downloads**: WCS services usually do not block based on user-agent but might limit requests.

**Solution**:
1. Verify the WCS request parameters.
2. Check the SoilGrids documentation for any updates.

```python
import requests

url = "https://maps.isric.org/mapserv?..."
params = {
    "SERVICE": "WCS",
    "VERSION": "2.0.1",
    "REQUEST": "GetCoverage",
    # Add other necessary parameters here
}
response = requests.get(url, params=params)

with open('soilgrid_data.tif', 'wb') as file:
    file.write(response.content)
```

## 4. **CORINE WMS**
- **Validity of URL**: The URL seems to be a WMS service. Ensure that the parameters are correctly set.
- **Authentication/Headers**: WMS services typically do not require authentication but might need specific parameters.
- **Alternative URLs**: Check the EEA website for any updates or alternative methods.
- **Blocking Automated Downloads**: WMS services usually do not block based on user-agent but might limit requests.

**Solution**:
1. Verify the WMS request parameters.
2. Check the EEA documentation for any updates.

```python
import requests

url = "https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WMSServer"
params = {
    "SERVICE": "WMS",
    "VERSION": "1.3.0",
    "REQUEST": "GetMap",
    "FORMAT": "image/tiff",
    # Add other necessary parameters here (e.g., BBOX, LAYERS)
}
response = requests.get(url, params=params)

with open('corine_data.tif', 'wb') as file:
    file.write(response.content)
```

### General Advice
- **User-Agent Header**: Always set a user-agent header to mimic a browser when downloading files.
- **Rate Limiting**: Be mindful of rate limits when making multiple requests.
- **Documentation**: Regularly check the official documentation for each service for updates or changes in usage.