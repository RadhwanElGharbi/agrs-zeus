# Perplexity Research Quick Start Guide

**For:** Oil & Gas Pipeline Projects  
**Status:** MANDATORY as of October 11, 2025  
**Time Required:** ~30-45 minutes for complete suite

---

## Overview

Before any geospatial data acquisition, you **MUST** conduct comprehensive Perplexity AI research on your project AOI. This ensures you have complete regulatory, stakeholder, and risk context before proceeding.

---

## 6 Mandatory Research Reports

### 1. AOI Intelligence Report

**Purpose:** Understand the physical and human geography of your project area

**Command:**
```bash
zeus tools perplexity_search \
  --bbox "<minx>,<miny>,<maxx>,<maxy>" \
  --topic "terrain,climate,geography,geology,infrastructure" \
  --output docs/perplexity_research/aoi_intelligence.md
```

**What You'll Get:**
- Terrain and topography
- Climate patterns
- Existing infrastructure
- Population distribution
- Economic activities

---

### 2. Regulatory Authority Research ⚠️ CRITICAL

**Purpose:** Identify ALL authorities you need to work with

**Command:**
```bash
zeus tools perplexity_search \
  --place "<region>, <country>" \
  --topic "pipeline_regulations,oil_gas_regulations,regulatory_authorities,compliance_requirements" \
  --output docs/perplexity_research/regulatory_authorities.md
```

**What You'll Get:**
- National regulatory bodies
- Regional/state authorities
- Local permitting agencies
- Filing procedures
- Contact information
- Compliance standards

**Why Critical:** Missing a regulatory authority can delay your project by months or cause rejection.

---

### 3. Stakeholder Identification

**Purpose:** Know who needs to be consulted

**Command:**
```bash
zeus tools perplexity_search \
  --place "<region>, <country>" \
  --topic "pipeline_stakeholders,environmental_agencies,local_government,community_consultation" \
  --output docs/perplexity_research/stakeholders.md
```

**What You'll Get:**
- Government stakeholders (all levels)
- Environmental agencies
- Land management authorities
- Community representatives
- NGOs and advocacy groups
- Consultation requirements

---

### 4. Permitting & Compliance Requirements

**Purpose:** Understand the complete permitting process

**Command:**
```bash
zeus tools perplexity_search \
  --place "<region>, <country>" \
  --topic "pipeline_permits,environmental_impact_assessment,right_of_way,land_acquisition" \
  --output docs/perplexity_research/permitting.md
```

**What You'll Get:**
- Required permits list
- EIA requirements
- Right-of-way processes
- Timeline estimates
- Costs and fees

---

### 5. Environmental & Protected Areas

**Purpose:** Identify environmental constraints

**Command:**
```bash
zeus tools perplexity_search \
  --bbox "<minx>,<miny>,<maxx>,<maxy>" \
  --topic "protected_areas,national_parks,environmental_restrictions,endangered_species" \
  --output docs/perplexity_research/environmental_constraints.md
```

**What You'll Get:**
- Protected areas
- National/regional parks
- Endangered species
- Water protections
- Cultural sites

---

### 6. Risk Assessment

**Purpose:** Understand all project risks

**Command:**
```bash
zeus tools perplexity_search \
  --bbox "<minx>,<miny>,<maxx>,<maxy>" \
  --topic "seismic_risk,flood_risk,landslide_risk,natural_hazards,security_risks" \
  --output docs/perplexity_research/risk_assessment.md
```

**What You'll Get:**
- Seismic hazards
- Flood risks
- Landslide potential
- Climate risks
- Security considerations

---

## Complete Example: SAIPEM Central Italy Project

```bash
cd /opt/agrs/Projects/SAIPEM_PIPELINE_DEMO
mkdir -p docs/perplexity_research

# 1. AOI Intelligence
zeus tools perplexity_search \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --topic "terrain,climate,geography,geology,infrastructure" \
  --output docs/perplexity_research/aoi_intelligence.md

# 2. Regulatory Authorities
zeus tools perplexity_search \
  --place "Lazio and Abruzzo, Italy" \
  --topic "pipeline_regulations,oil_gas_regulations,regulatory_authorities,compliance_requirements" \
  --output docs/perplexity_research/regulatory_authorities.md

# 3. Stakeholders
zeus tools perplexity_search \
  --place "Lazio and Abruzzo, Italy" \
  --topic "pipeline_stakeholders,environmental_agencies,local_government,community_consultation" \
  --output docs/perplexity_research/stakeholders.md

# 4. Permitting
zeus tools perplexity_search \
  --place "Lazio and Abruzzo, Italy" \
  --topic "pipeline_permits,environmental_impact_assessment,right_of_way,land_acquisition" \
  --output docs/perplexity_research/permitting.md

# 5. Environmental Constraints
zeus tools perplexity_search \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --topic "protected_areas,national_parks,environmental_restrictions,endangered_species" \
  --output docs/perplexity_research/environmental_constraints.md

# 6. Risk Assessment
zeus tools perplexity_search \
  --bbox "13.454779,42.857057,13.938769,43.438886" \
  --topic "seismic_risk,flood_risk,landslide_risk,natural_hazards,security_risks" \
  --output docs/perplexity_research/risk_assessment.md
```

**Total Time:** ~30-45 minutes  
**Total Cost:** ~$0.004-$0.006 (less than a penny!)

---

## Coordinate-Based Research (As Needed)

For specific locations along your route:

```bash
# Pipeline start point
zeus tools perplexity_search \
  --location "42.857,13.455" \
  --query "Pipeline construction feasibility, land ownership, environmental permits required at this location in Central Italy" \
  --output docs/location_research/start_point.md

# River crossing
zeus tools perplexity_search \
  --location "42.920,13.520" \
  --query "River crossing regulations, hydrological considerations, and environmental protections for pipeline construction" \
  --output docs/location_research/river_crossing.md

# Protected area boundary
zeus tools perplexity_search \
  --location "43.100,13.650" \
  --query "Protected area regulations, buffer zone requirements, and alternative routing options" \
  --output docs/location_research/protected_area.md
```

---

## Review & Next Steps

After generating all reports:

1. **Read All Reports**
   - Review each report thoroughly
   - Note critical findings
   - Identify action items

2. **Create Summary**
   - Document key findings
   - List all regulatory authorities
   - Compile stakeholder list
   - Note critical constraints

3. **Update Project Metadata**
   - Add regulatory contacts to project documentation
   - Update risk assessment
   - Document compliance requirements

4. **Proceed to Data Acquisition**
   - Only after completing research
   - Only after project creator review
   - With full context and understanding

---

## Common Issues & Solutions

### Issue: Too generic results
**Solution:** Be more specific with place names and topics. Include "pipeline construction" or "oil & gas" in queries.

### Issue: Missing local authorities
**Solution:** Run follow-up queries for specific municipalities or provinces mentioned in initial reports.

### Issue: Need more detail
**Solution:** Use coordinate-based searches for specific locations. Ask targeted follow-up questions.

### Issue: Outdated information
**Solution:** All Perplexity results are current. If regulations have changed, they'll be reflected. Always verify critical information with authorities directly.

---

## Quality Checklist

Before proceeding to data acquisition:

- [ ] All 6 reports generated
- [ ] All reports include citations
- [ ] Key regulatory authorities identified
- [ ] Stakeholder list compiled
- [ ] Permitting timeline understood
- [ ] Environmental constraints noted
- [ ] Risk factors assessed
- [ ] Contact information collected
- [ ] Project creator has reviewed all reports
- [ ] Action items documented

---

## Cost & Time Savings

**Traditional Research:**
- Manual web searching: 2-3 days
- Regulatory research: 1-2 days
- Stakeholder identification: 1 day
- **Total: 4-6 days, $4,000-$6,000 in labor**

**Perplexity Research:**
- Automated AI research: 30-45 minutes
- API costs: ~$0.004-$0.006
- **Total: < 1 hour, < $0.01**

**Savings: ~$6,000 and 5+ days per project**

---

## Support

For questions or issues:
1. Check `/opt/agrs/docs/PROJECT_STRUCTURE_STANDARD.md`
2. Review `/opt/agrs/docs/PERPLEXITY_API_INTEGRATION_PLAN.md`
3. Run `zeus tools perplexity_search --help`

---

**Last Updated:** October 11, 2025  
**Version:** 1.0  
**Status:** MANDATORY for all new oil & gas pipeline projects

