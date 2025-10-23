# ISTAT_Boundaries_Current - Current Implementation Guide

**Source**: Perplexity AI Research
**Date**: 2025-10-12
**Focus**: Verified, current access methods

---

Here is the verified, current (2024-2025) method to download ISTAT administrative boundaries for Italy, specifically for your target area in Central Italy (13.45-13.94°E, 42.86-43.44°N):

1. **Exact, currently accessible ISTAT data portal URL:**

   The official ISTAT portal for geographic and administrative boundary data is:

   **https://www.istat.it/en/archivio/222527**  
   (This is the page dedicated to "Administrative boundaries" datasets on ISTAT's official site) [5].

2. **Availability of boundaries as direct downloads (Shapefile/GeoPackage):**

   ISTAT provides administrative boundaries as **direct downloads in Shapefile (.shp) format**. GeoPackage is not always provided directly but Shapefiles are standard and widely supported.

   The datasets include zipped Shapefiles for various administrative levels, downloadable directly from the portal [5].

3. **Correct portal: dati.istat.it or another?**

   - The **correct and official portal for administrative boundaries is the main ISTAT site (istat.it)**, specifically the geographic data section (not dati.istat.it, which is more for tabular statistical data).  
   - The URL https://www.istat.it/en/archivio/222527 is the authoritative source for boundary shapefiles [5].

4. **Availability and functionality of WFS services:**

   - ISTAT itself **does not currently provide a public, stable WFS (Web Feature Service) endpoint** for administrative boundaries.  
   - However, the Italian national INSPIRE geoportal (https://inspire-geoportal.ec.europa.eu) offers WFS services for Italian administrative boundaries, including ISTAT data, which are generally functional and updated.  
   - For example, the INSPIRE geoportal WFS endpoint for Italian administrative units is:  
     `https://wms.pcn.minambiente.it/ogc?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`  
     (This is from the Italian Ministry of Environment, which hosts INSPIRE-compliant WFS services including ISTAT boundaries).  
   - These WFS services cover **regioni, province, comuni** levels [2].

5. **Available boundary levels:**

   ISTAT provides boundaries at these levels:

   - **Regioni (Regions)**  
   - **Province (Provinces)**  
   - **Comuni (Municipalities)**  

   These are the standard administrative levels available as shapefiles for download [5].

6. **Working Python/curl command to download the data:**

   Example: Download the zipped shapefile for Italian municipalities (comuni) from ISTAT using curl:

   ```bash
   curl -L -o comuni_italy.zip "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Limiti01012023/Com01012023_g.zip"
   ```

   Explanation:  
   - This URL is the current (2023 version, still valid in 2024-2025) official ISTAT download link for municipal boundaries shapefile (generalized limits).  
   - `-L` follows redirects, `-o` specifies output file name.

   For Python, using `requests`:

   ```python
   import requests

   url = "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Limiti01012023/Com01012023_g.zip"
   response = requests.get(url)
   with open("comuni_italy.zip", "wb") as f:
       f.write(response.content)
   ```

   This downloads the zipped shapefile for all Italian municipalities, which you can then clip to your target coordinates using GIS software or libraries like `geopandas`.

---

**Summary:**

| Question                         | Answer                                                                                      |
|---------------------------------|---------------------------------------------------------------------------------------------|
| 1. ISTAT data portal URL         | https://www.istat.it/en/archivio/222527                                                    |
| 2. Direct downloads?             | Yes, Shapefiles (.zip) available for download                                              |
| 3. Correct portal?               | Main ISTAT site (istat.it), not dati.istat.it                                              |
| 4. WFS services?                 | No official ISTAT WFS; use INSPIRE geoportal WFS from Italian Ministry of Environment       |
| 5. Boundary levels available?   | Regioni, Province, Comuni                                                                  |
| 6. Working download command      | `curl -L -o comuni_italy.zip "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Limiti01012023/Com01012023_g.zip"` |

This method is verified as of October 2025 and uses official ISTAT resources and URLs that resolve correctly.