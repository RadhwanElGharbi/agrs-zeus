# Phase 2: Implementation Guides for Missing Datasets

**Date**: 2025-10-12
**Query**: Automated data acquisition methods

---

Here is a detailed implementation guide for automated data acquisition for each requested dataset in Italy, focusing on public and automated access, including URLs, formats, download methods, and clipping instructions for the bounding box AOI: 13.454779,42.857057,13.938769,43.438886.

---

### 1. SciGRID_gas European Gas Pipeline Network

- **URL & File Format:**  
  SciGRID_gas data is part of the SciGRID project hosted on GitHub and Zenodo. The gas network data is typically provided as GeoJSON or shapefiles.  
  Official GitHub: https://github.com/SciGRID/scigrid_gas  
  Zenodo archive (latest release): https://zenodo.org/record/XXXXXX (replace with latest DOI)  
  File format: GeoJSON, Shapefile

- **Download Method:**  
  Direct download via HTTP from GitHub or Zenodo. No authentication required.

- **Coverage for Italy:**  
  The dataset covers the entire European gas pipeline network, including Italy.

- **Command-line example:**  
  ```bash
  wget https://github.com/SciGRID/scigrid_gas/releases/download/vX.Y/scigrid_gas_italy.geojson
  ```

- **How to filter/clip to bounding box:**  
  Use `ogr2ogr` (GDAL) to clip by bounding box:  
  ```bash
  ogr2ogr -f GeoJSON clipped_gas_italy.geojson scigrid_gas_italy.geojson -spat 13.454779 42.857057 13.938769 43.438886
  ```

---

### 2. Natura 2000 Protected Areas

- **Access:**  
  Provided by the European Environment Agency (EEA). Data is available via the EEA website and the INSPIRE Geoportal.

- **API or Direct Download:**  
  Direct download available as shapefile or GeoPackage from EEA’s Natura 2000 data page:  
  https://www.eea.europa.eu/data-and-maps/data/natura-11  
  INSPIRE WFS endpoint:  
  https://inspire.discomap.eea.europa.eu/arcgis/services/Natura2000/Natura2000/MapServer/WMSServer?request=GetCapabilities&service=WMS

- **File formats:**  
  Shapefile, GeoPackage, GML

- **Command-line example:**  
  ```bash
  wget https://www.eea.europa.eu/data-and-maps/data/natura-11-shapefile.zip
  unzip natura-11-shapefile.zip
  ```

- **Clipping to AOI:**  
  Use `ogr2ogr` with spatial filter:  
  ```bash
  ogr2ogr -f "ESRI Shapefile" clipped_natura2000.shp natura2000.shp -spat 13.454779 42.857057 13.938769 43.438886
  ```

---

### 3. EUAP (Italian Protected Areas) from ISPRA

- **Data Access:**  
  ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale) provides protected areas data via the Geoportal:  
  https://www.isprambiente.gov.it/it/servizi/geodati-e-cartografia

- **WFS/WMS Endpoints:**  
  Public WFS endpoint example:  
  `https://www.isprambiente.gov.it/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities`  
  Layers include Italian protected areas.

- **Alternative Download:**  
  ISPRA provides downloadable shapefiles or GeoPackages on their data portal.

- **File formats:**  
  Shapefile, GeoPackage

- **Command-line example (WFS download with ogr2ogr):**  
  ```bash
  ogr2ogr -f "GeoJSON" italian_protected_areas.geojson WFS:"https://www.isprambiente.gov.it/geoserver/ows" -where "1=1" -spat 13.454779 42.857057 13.938769 43.438886
  ```

---

### 4. WorldPop Population Density

- **Italy-specific tiles & resolution:**  
  WorldPop provides 100m resolution population density data for Italy.

- **API or Direct Download:**  
  Direct download from WorldPop FTP or HTTP:  
  https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/ITA/  
  Files are GeoTIFF (.tif)

- **Command-line example:**  
  ```bash
  wget https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/ITA/ita_ppp_2020.tif
  ```

- **Clipping to AOI:**  
  Use `gdalwarp` to clip GeoTIFF:  
  ```bash
  gdalwarp -te 13.454779 42.857057 13.938769 43.438886 ita_ppp_2020.tif ita_ppp_2020_clipped.tif
  ```

---

### 5. GADM Administrative Boundaries

- **Italy levels:**  
  GADM provides administrative boundaries for Italy at multiple levels:  
  - Level 0: Country  
  - Level 1: Regions  
  - Level 2: Provinces  
  - Level 3: Municipalities

- **Direct download links:**  
  https://gadm.org/download_country_v3.html (select Italy)  
  Files available in shapefile, GeoJSON, and RData formats.

- **Command-line example:**  
  ```bash
  wget https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_ITA_shp.zip
  unzip gadm41_ITA_shp.zip
  ```

- **Clipping to AOI:**  
  ```bash
  ogr2ogr -f "ESRI Shapefile" clipped_gadm.shp gadm41_ITA_2.shp -spat 13.454779 42.857057 13.938769 43.438886
  ```

---

### 6. Italian Cadastral/Parcel Data (Agenzia delle Entrate)

- **Access:**  
  The cadastral data is managed by Agenzia delle Entrate. Public access is limited; detailed parcel data is generally restricted and requires authorization.

- **Public vs Restricted:**  
  Public cadastral maps (Catasto) are available as raster maps via the Geoportale Catastale:  
  https://www.agenziaentrate.gov.it/portale/web/guest/schede/fabbricati-e-terreni/catasto

- **WMS/WFS services:**  
  Some WMS services are available for viewing but not for bulk download or WFS access.

- **Alternative:**  
  Use regional geoportals or open cadastral data where available.

- **Command-line:**  
  No direct public bulk download or API for parcel vector data.

---

### 7. TERNA Power Transmission Lines

- **Public data availability:**  
  TERNA does not provide open public GIS data for power lines.

- **OpenStreetMap alternative:**  
  OSM has good coverage of power transmission lines in Italy.

- **How to extract power line data from OSM:**  
  Use Overpass API or download OSM extracts (e.g., Geofabrik).

- **Overpass API example:**  
  Query power lines within AOI bounding box:  
  ```xml
  [out:json][timeout:25];
  (
    way["power"="line"](42.857057,13.454779,43.438886,13.938769);
  );
  out body;
  >;
  out skel qt;
  ```

- **Command-line with Overpass Turbo:**  
  Use `curl` to send query to Overpass API endpoint.

---

### 8. Archaeological Sites (Ministry of Culture - MiC)

- **Data source:**  
  MiC provides archaeological site data via the Geoportale Nazionale per l'Archeologia (GNA):  
  https://archeologia.beniculturali.it/geoportale

- **Public access methods:**  
  Data is accessible via WMS/WFS services and downloadable datasets.

- **WFS endpoint example:**  
  `https://geoportalearcheologico.beniculturali.it/geoserver/wfs`

- **Command-line example:**  
  ```bash
  ogr2ogr -f "GeoJSON" archaeological_sites.geojson WFS:"https://geoportalearcheologico.beniculturali.it/geoserver/wfs" -spat 13.454779 42.857057 13.938769 43.438886 -where "1=1"
  ```

---

If you need exact URLs or API keys for some restricted services, those typically require registration or formal requests to the data providers. The above instructions prioritize publicly accessible, automatable methods.