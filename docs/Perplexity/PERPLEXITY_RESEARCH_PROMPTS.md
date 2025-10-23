# Perplexity Research Prompts for Best Datasets Workbook

## Overview

Use these prompts in **Perplexity** to research the best GIS datasets for oil & gas pipeline routing on a per-country basis. Complete one country at a time, then provide the results for Excel compilation.

---

## 🎯 Master Prompt Template (Use This for Each Country)

Copy and paste this into Perplexity, replacing `[COUNTRY]` with the country name:

```
I'm researching the best available GIS datasets for oil & gas pipeline routing in [COUNTRY]. For each category below, identify the highest quality datasets (both regional/national and global), including:

1. Dataset name
2. Source/provider (organization)
3. Resolution/scale
4. Temporal coverage (date range or "current")
5. Update frequency
6. Access type (open/free, restricted/requires request, commercial/purchase)
7. API availability (yes/no, specify API name if yes)
8. Official URL
9. Brief quality assessment (resolution, accuracy, completeness)

**CATEGORIES:**

**1. ELEVATION/TERRAIN (DEM)**
- National geological survey DEMs (highest priority)
- National LiDAR-derived DEMs
- Regional high-resolution DEMs
- Best global DEM for this country (Copernicus DEM, SRTM, ASTER, etc.)

**2. LAND COVER / LAND USE**
- National land use maps (government agencies)
- Regional land cover products
- Best global datasets for this country (ESA WorldCover, Google Dynamic World, Sentinel-2)

**3. HYDROLOGY / WATER**
- National water resources databases (ministry of water/environment)
- National hydrography networks (rivers, lakes, wadis, wetlands)
- Best global datasets (Global Surface Water Explorer, HydroSHEDS)

**4. INFRASTRUCTURE - ROADS**
- National road network datasets (ministry of transport)
- Commercial providers (HERE Technologies, TomTom)
- OpenStreetMap coverage quality for this country

**5. INFRASTRUCTURE - RAILWAYS**
- National railway network datasets (railway authority)
- OpenStreetMap railways for this country

**6. INFRASTRUCTURE - UTILITIES (Power, Telecom)**
- National electricity transmission network data
- OpenInfraMap / OpenStreetMap utilities

**7. INFRASTRUCTURE - PIPELINES**
- National oil/gas company pipeline GIS data (e.g., Saudi Aramco, ADNOC, etc.)
- Government pipeline registry data
- OpenStreetMap pipelines (note: usually incomplete)

**8. PROTECTED AREAS / ENVIRONMENTAL**
- National wildlife/environmental agency protected areas
- National parks, reserves, conservation areas
- World Database on Protected Areas (WDPA) coverage

**9. GEOLOGY / SOIL**
- National geological survey maps and databases
- Soil maps from agricultural agencies
- Best global datasets (FAO HWSD, OneGeology)

**10. CLIMATE / WEATHER**
- National meteorological service data (historical, real-time, forecasts)
- Best global datasets (ERA5, WorldClim)

**11. ADMINISTRATIVE BOUNDARIES**
- Official boundaries from national statistics agency
- GADM coverage for this country

**12. POPULATION / DEMOGRAPHICS**
- National census data (population density, urban areas)
- Best global datasets (WorldPop, LandScan)

**13. SATELLITE IMAGERY (COMMERCIAL)**
- High-resolution commercial imagery availability (Maxar, Airbus, Planet)
- Free baseline imagery (Sentinel-2)

**14. SPECIAL DATASETS FOR [COUNTRY]**
- Any unique datasets specific to this country that would be valuable for pipeline routing (e.g., archaeological sites, military zones, indigenous lands, seismic zones, landslide hazard maps)

**IMPORTANT:**
- Prioritize official national/regional sources over global datasets when they exist
- Verify if datasets have APIs for programmatic access
- Note if datasets require formal requests or commercial licenses
- Include URLs to official download/access pages
- Rate quality based on resolution, accuracy, and currency
```

---

## 📋 Tier 1 Countries - Research Order

Use the master prompt above for each of these countries:

### **Gulf Region (5 countries)**
1. 🇦🇪 **United Arab Emirates (UAE)**
2. 🇰🇼 **Kuwait**
3. 🇶🇦 **Qatar**
4. 🇴🇲 **Oman**
5. 🇧🇭 **Bahrain**

### **Middle East (2 countries)**
6. 🇮🇶 **Iraq**
7. 🇮🇷 **Iran**

### **North America (3 countries)**
8. 🇺🇸 **United States**
9. 🇨🇦 **Canada**
10. 🇲🇽 **Mexico**

### **Europe (2 countries)**
11. 🇳🇴 **Norway**
12. 🇬🇧 **United Kingdom**

### **Africa (4 countries)**
13. 🇳🇬 **Nigeria**
14. 🇩🇿 **Algeria**
15. 🇱🇾 **Libya**
16. 🇪🇬 **Egypt**

### **Eurasia (1 country)**
17. 🇷🇺 **Russia**

---

## 📝 How to Use These Prompts

### **Step 1: Create a Perplexity Collection**
- Create a new Collection called "GIS Datasets - Pipeline Routing"
- Create one thread per country (e.g., "UAE - Best Datasets")

### **Step 2: Run the Master Prompt**
- Copy the master prompt above
- Replace `[COUNTRY]` with the country name
- Paste into Perplexity
- Wait for comprehensive response

### **Step 3: Follow-Up Questions (If Needed)**
If Perplexity's initial response is incomplete, use these follow-ups:

**For missing categories:**
```
You didn't provide information for [CATEGORY]. Please research and provide the best datasets for [CATEGORY] in [COUNTRY], including dataset name, source, resolution, access type, API availability, and URL.
```

**For API verification:**
```
For the following datasets in [COUNTRY], please verify if they provide APIs for programmatic access and specify the API name/type:
- [Dataset 1]
- [Dataset 2]
- [Dataset 3]
```

**For URL verification:**
```
Please provide the official download or access URLs for these datasets in [COUNTRY]:
- [Dataset 1]
- [Dataset 2]
- [Dataset 3]
```

**For national agency discovery:**
```
What are the official URLs for these [COUNTRY] government agencies:
- Geological Survey
- Ministry of Water/Environment
- Ministry of Transport
- National Meteorological Service
- National Statistics Agency
- Wildlife/Environmental Protection Agency
- National Oil/Gas Company
```

### **Step 4: Export Research Notes**
- Copy Perplexity's response
- Save as: `[COUNTRY]_datasets_research.txt`
- Or: Keep in Perplexity collection for easy reference

### **Step 5: Provide to AI for Excel Compilation**
Send the research notes with:
```
Here's my Perplexity research for [COUNTRY]. Please compile this into the Excel format following the Saudi Arabia template:

[Paste Perplexity research results]
```

---

## 🎯 Quick Prompts for Specific Categories

If you want to research categories individually (more thorough):

### **Elevation/Terrain**
```
What are the best DEM (Digital Elevation Model) datasets available for [COUNTRY]? Include:
- National geological survey DEMs
- National LiDAR programs
- Regional high-resolution DEMs
- Best global DEM (Copernicus, SRTM, ASTER)
For each, provide: resolution, access type, API availability, URL, and quality assessment.
```

### **Land Cover**
```
What are the best land cover and land use datasets for [COUNTRY]? Include:
- National land use maps from government agencies
- Regional land cover products
- ESA WorldCover, Google Dynamic World, Sentinel-2 coverage quality
For each, provide: resolution, number of classes, access type, API availability, URL.
```

### **Hydrology**
```
What are the best water resources and hydrography datasets for [COUNTRY]? Include:
- National water databases (rivers, lakes, aquifers, wadis)
- Ministry of water/environment data
- Global Surface Water Explorer, HydroSHEDS
For each, provide: resolution, temporal coverage, access type, API availability, URL.
```

### **Infrastructure**
```
What are the best infrastructure datasets (roads, railways, utilities, pipelines) for [COUNTRY]? Include:
- National road network (ministry of transport)
- National railway data
- National oil/gas company pipeline data (e.g., ADNOC for UAE)
- Electricity transmission network
- Commercial providers (HERE, TomTom)
- OpenStreetMap coverage quality
For each, provide: detail level, access type, API availability, URL.
```

### **Protected Areas**
```
What are the official protected areas datasets for [COUNTRY]? Include:
- National wildlife/environmental agency data
- National parks, reserves, conservation areas
- World Database on Protected Areas (WDPA)
For each, provide: coverage completeness, access type, API availability, URL.
```

### **Geology/Soil**
```
What are the best geology and soil datasets for [COUNTRY]? Include:
- National geological survey maps and databases
- Soil maps from agricultural agencies
- Scale (e.g., 1:50,000, 1:250,000)
For each, provide: scale/resolution, access type, URL.
```

### **Climate/Weather**
```
What are the best climate and weather datasets for [COUNTRY]? Include:
- National meteorological service data (historical, forecasts)
- Station networks, gridded datasets
- ERA5, WorldClim coverage
For each, provide: resolution, temporal coverage, access type, API availability, URL.
```

### **Special: National Agencies**
```
Please identify the official websites and data portals for these [COUNTRY] government agencies:
1. Geological Survey
2. Ministry of Environment / Water / Agriculture
3. Ministry of Transport
4. National Meteorological Service
5. National Statistics Agency
6. Wildlife / Environmental Protection Agency
7. National Oil & Gas Company
8. National Spatial Data Infrastructure (NSDI) or Geoportal

For each, provide: agency name, URL, whether they offer GIS data downloads, and API availability.
```

---

## 📊 Expected Output Format

When Perplexity provides results, they should look like this:

```
UNITED ARAB EMIRATES (UAE) - BEST DATASETS FOR PIPELINE ROUTING

1. ELEVATION/TERRAIN

Dataset: UAE National DEM
Source: Dubai Municipality / Federal GIS Centre
Resolution: 5m (select areas), 30m (nationwide)
Temporal Coverage: 2020-2023
Update Frequency: Irregular
Access: Restricted (requires request)
API Available: No
URL: https://www.dubaipulse.gov.ae/
Quality: ★★★★★ High resolution, recent, official

Dataset: Copernicus DEM GLO-30
Source: European Space Agency (Copernicus)
Resolution: 30m
Temporal Coverage: 2011-2015 (static)
Update Frequency: Static baseline
Access: Open (Free)
API Available: Yes (via Copernicus Data Space)
URL: https://spacedata.copernicus.eu/
Quality: ★★★★★ Best global DEM, superior to SRTM

[Continue for all categories...]
```

---

## ✅ Quality Checklist

Before sending research to AI for compilation, verify:

- [ ] All 14 categories covered (at minimum 1-2 datasets per category)
- [ ] Dataset names are official/accurate
- [ ] Source/provider organizations identified
- [ ] Resolution/scale specified
- [ ] Access type clear (open/restricted/commercial)
- [ ] API availability verified (yes/no)
- [ ] URLs provided for official sources
- [ ] Brief quality notes included
- [ ] National/regional datasets prioritized over global where they exist

---

## 💡 Pro Tips for Perplexity Research

1. **Use Perplexity Pro** if available - better at finding government portals and technical documentation

2. **Search in local language** if needed:
   - For non-English countries, try searches in their language
   - Example: "données géographiques Algérie" (Algeria geographic data)

3. **Verify URLs** by asking Perplexity to click through and confirm they're active

4. **Ask for comparisons**:
   ```
   Compare the quality of these three DEM datasets for [COUNTRY]: Copernicus DEM, SRTM, and ASTER GDEM. Which is best for pipeline routing?
   ```

5. **Request examples**:
   ```
   Show me an example of what data the [COUNTRY] Geological Survey provides - what resolution, what format, how to access?
   ```

6. **Cross-reference**:
   ```
   I found this dataset from [SOURCE]. Can you verify this is the official/best source, or is there a better alternative?
   ```

---

## 🚀 Estimated Timeline

**Per country:** 30-60 minutes in Perplexity
**Total for 17 Tier 1 countries:** 8-17 hours of research

**Then:** Provide all research notes to AI for Excel compilation (~1-2 hours per batch of 5 countries)

**Total project time:** ~2-3 weeks (vs. 6-8 weeks with AI web search alone)

---

## 📁 File Naming Convention

When saving Perplexity research:
- `UAE_datasets_research.txt`
- `Kuwait_datasets_research.txt`
- `Qatar_datasets_research.txt`
- etc.

Or keep in Perplexity Collection organized by country threads.

---

**Ready to start?** Pick your first country (recommend starting with UAE since it's close to Saudi Arabia), use the master prompt, and provide the results for Excel compilation!

