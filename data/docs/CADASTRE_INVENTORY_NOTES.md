# Cadastre & Land Parcels Dataset Inventory

**Date:** 2025-10-17  
**Status:** ✅ Complete  
**Entries:** 84 cadastral datasets  
**File:** `/opt/agrs/data/cadastre_datasets_inventory.csv`

---

## 🎯 **PURPOSE**

Cadastral data is **critical for pipeline routing** as it provides:
- **Property boundaries** for ROW (Right-of-Way) acquisition
- **Landowner identification** for stakeholder engagement
- **Legal parcel descriptions** for easement negotiations
- **Land use designations** for regulatory compliance
- **Property valuation context** for compensation estimates

---

## 📊 **INVENTORY STATISTICS**

### Total Coverage:
- **84 cadastral datasets** across 52 countries
- **File size:** 14KB
- **Format:** Standardized CSV

### Geographic Distribution:
- **Global datasets:** 1 (OSM landuse polygons)
- **Europe (EU27):** 36 entries (best coverage)
- **Asia-Pacific:** 13 entries
- **USA/Canada:** 10 entries
- **Middle East:** 8 entries
- **Latin America:** 7 entries
- **Africa:** 5 entries

---

## 🔑 **KEY FINDINGS**

### 1. **Data Accessibility Challenges:**
- **Open/Free data:** ~25% (mainly Europe + some developed countries)
- **Commercial/Gov only:** ~40% (requires payment or government access)
- **Restricted access:** ~35% (cadastral agencies, limited public availability)

### 2. **Best Cadastral Data Coverage:**

**🟢 Excellent (Open Data):**
- **France:** Complete national cadastre (600k+ communes), free/open via Cadastre.gouv.fr
- **Spain:** Complete national cadastre, free/open via Sede Electrónica
- **Netherlands:** Kadaster open data, simplified cadastral boundaries
- **Switzerland:** Amtliche Vermessung (official survey), free/open
- **Norway:** Matrikkelen national cadastre, free/open
- **Denmark:** Matrikelkort national cadastre, free/open
- **Czech Republic:** Katastrální Mapa, free WMS/WFS services
- **Australia (Queensland):** DCDB open data
- **New Zealand:** LINZ cadastral parcels, free/open
- **Brazil (SIGEF):** Rural land management, georreferenced parcels, free

**🟡 Good (INSPIRE/Commercial):**
- **Germany:** ALKIS official cadastre (by state), some states offer open data
- **UK:** Land Registry INSPIRE polygons (England/Wales), free but limited detail
- **Belgium:** Cadmap cadastral map, free/open
- **Austria:** Digital cadastral map, commercial
- **Sweden:** Fastighetskartan property map, commercial but some open data
- **USA:** County assessor parcels (3000+ counties, varies by county)
- **Canada:** Provincial land registries (varies by province)

**🔴 Limited (Restricted Access):**
- **Italy:** Catasto WMS for viewing only, full data restricted
- **Poland:** EGIB land registry, access restricted
- **Russia:** Rosreestr cadastre, limited open access, paid extracts
- **China:** National land registry, not publicly accessible
- **Middle East:** Most countries have restricted cadastral access (Saudi Arabia, UAE, Qatar, Kuwait, Iraq, Iran)
- **Africa:** Limited cadastral systems, mostly restricted (Nigeria, Algeria, Libya, Egypt)
- **Latin America:** Municipal-level systems (Brazil, Mexico, Venezuela), not unified

### 3. **Europe Leadership:**
- **INSPIRE Directive:** EU countries required to provide harmonized cadastral data
- **36 European datasets cataloged** (43% of inventory)
- **National cadastral portals:** Most EU countries have online access
- **Open data movement:** Increasing trend toward free cadastral access

### 4. **North America Complexity:**
- **USA:** No national cadastre; 3000+ county-level systems
  - **Commercial aggregators:** ParcelQuest, Regrid (nationwide coverage, paid)
  - **Open by county:** Some counties provide free parcel data
  - **Inconsistent quality:** Varies significantly by jurisdiction
- **Canada:** Provincial systems, not unified nationally
  - **Ontario MPAC, BC Assessment:** Commercial provincial cadastres
  - **No free national dataset**

### 5. **Developing Countries:**
- **Cadastral systems under development** in many Tier 1 O&G countries
- **Limited public access** even where systems exist
- **OSM landuse polygons** may be the only free alternative
- **On-the-ground surveys often required** for pipeline projects

---

## 💡 **IMPLICATIONS FOR PIPELINE ROUTING**

### ROW Acquisition Strategy:

**Phase 1: Data Availability Assessment**
1. Check if project AOI has open cadastral data
2. If yes → Use free/open datasets for preliminary ROW planning
3. If no → Budget for commercial data or manual surveys

**Phase 2: Data Acquisition**
- **Europe (esp. France, Spain, Netherlands):** Direct download, free
- **USA:** County-by-county acquisition or commercial aggregator
- **Canada:** Provincial cadastral office or commercial source
- **Other regions:** Engage local cadastral agencies, expect fees

**Phase 3: Landowner Identification**
- **Where cadastral data includes ownership:** Direct stakeholder list
- **Where ownership not included:** Cross-reference with land registries
- **Where no data:** Manual survey and local government engagement

### Cost Impact:

**Scenarios:**

1. **Best case (Europe, some developed countries):**
   - Free cadastral data available
   - Cost: $0 for data acquisition
   - Use for: Preliminary route planning, stakeholder identification

2. **Moderate case (USA, Canada, Australia):**
   - Commercial cadastral data or county-level purchase
   - Cost: $1,000-$10,000 depending on AOI size
   - Use for: Detailed ROW planning, property owner lists

3. **Challenging case (Middle East, Africa, parts of Asia/LatAm):**
   - No public cadastral data or highly restricted
   - Cost: $10,000-$50,000 for surveys and local agency engagement
   - Use: Essential for ROW acquisition, but requires ground-truthing

**ZEUS Strategy:**
- Automatically detect cadastral data availability for AOI
- Prioritize free/open sources (EU, Norway, Denmark, NZ, etc.)
- Flag AOIs requiring commercial data or surveys
- Provide cost estimates for cadastral data acquisition
- Include in project initialization budget

---

## 🔧 **FETCH TOOL STATUS**

### Implemented:
- **None yet** - Cadastral fetch tools are complex due to:
  - Varying data formats and APIs
  - Authentication requirements
  - License restrictions
  - Country-specific protocols

### Priority Implementation (Tier 1):
1. `cadastre_france_fetch` - French national cadastre (best open data)
2. `cadastre_spain_fetch` - Spanish Sede Electrónica (complete coverage)
3. `kadaster_nl_fetch` - Dutch Kadaster open data
4. `inspire_cadastre_fetch` - EU INSPIRE harmonized cadastral parcels
5. `linz_cadastre_fetch` - New Zealand cadastral parcels (excellent quality)

### Priority Implementation (Tier 2):
6. `regrid_fetch` - USA commercial aggregator (API available)
7. `land_registry_uk_fetch` - UK INSPIRE polygons
8. `matrikkelen_fetch` - Norwegian cadastre
9. `matrikelkort_dk_fetch` - Danish cadastre
10. `dcdb_qld_fetch` - Australia Queensland open cadastre

### Guidance/Manual (Most datasets):
- Many cadastral systems require manual access, agency accounts, or paid subscriptions
- ZEUS will provide guidance on where to obtain data
- Users will need to manually acquire and import cadastral data for restricted regions

---

## 📚 **KEY CADASTRAL DATA PORTALS**

### Europe:
- **France:** https://cadastre.data.gouv.fr/ (open data)
- **Spain:** https://www.sedecatastro.gob.es/ (national cadastre)
- **Netherlands:** https://www.kadaster.nl/ (Kadaster)
- **Germany:** State-level cadastral offices (varies)
- **UK:** https://www.gov.uk/land-registry (Land Registry)
- **EU INSPIRE:** https://inspire.ec.europa.eu/ (harmonized cadastral data)

### North America:
- **USA Regrid:** https://regrid.com/ (commercial, nationwide)
- **USA ParcelQuest:** https://www.parcelquest.com/ (commercial)
- **Canada:** Provincial cadastral offices (varies)

### Oceania:
- **New Zealand LINZ:** https://www.linz.govt.nz/ (open data)
- **Australia:** State-based systems (QLD open, others commercial)

### Other:
- **Brazil SIGEF:** https://sigef.incra.gov.br/ (rural parcels, open)
- **OpenStreetMap:** https://www.openstreetmap.org/ (limited cadastral coverage)

---

## ⚠️ **LIMITATIONS & CAVEATS**

1. **Ownership data often restricted:** Even where parcel boundaries are open, ownership information may be restricted by privacy laws
2. **Update frequency varies:** Cadastral data may be months or years out of date
3. **Quality varies:** Accuracy ranges from survey-grade (EU) to approximate (developing countries)
4. **Legal status:** Cadastral data may not constitute legal proof of ownership; official surveys may be required for ROW acquisition
5. **Commercial restrictions:** Many "open" datasets prohibit commercial use or require attribution

---

## 🎯 **NEXT STEPS**

1. **Implement Tier 1 cadastral fetch tools** (France, Spain, Netherlands, INSPIRE, NZ)
2. **Document manual acquisition procedures** for restricted cadastral systems
3. **Integrate with ROW cost estimation** in ZEUS pipeline routing
4. **Test cadastral data integration** on SAIPEM and other pilot projects
5. **Build landowner identification workflows** using cadastral data + land registries

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-17  
**Status:** ✅ Inventory complete, fetch tool implementation pending



