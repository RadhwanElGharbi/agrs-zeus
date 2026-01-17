# Deep research prompt → `WORLD_REGULATION_CATALOGUE.csv` JSON entries

Use this prompt with your deep-research LLMs to generate **catalogue-ready regulation entries** for AGRS.

## Output format (strict)

Return **ONLY** JSON in this shape:

```json
{
  "entries": [
    {
      "EntryID": "EU_EIA_DIR_2011_92",
      "Title": "Directive 2011/92/EU ...",
      "EntryType": "directive",
      "Category": "environmental_assessment",
      "ProjectApplicability": ["onshore", "offshore", "construction"],
      "CoverageLevel": "supranational",
      "CoverageGroup": "EU",
      "ISO3": null,
      "Admin1Name": null,
      "Admin1Code": null,
      "Admin2Name": null,
      "Admin2Code": null,
      "Authority": "European Parliament and Council of the European Union",
      "SourceTitle": "EUR-Lex: Directive 2011/92/EU",
      "SourceURL": "https://eur-lex.europa.eu/eli/dir/2011/92/oj",
      "SourceType": "eu_law",
      "DirectDownloadURL": "https://.../PDF/?uri=CELEX:...",
      "DirectDownloadFileName": "EIA_Directive_2011_92_EU.pdf",
      "DirectDownloadContentType": "application/pdf",
      "FilingCategory": "supranational",
      "Status": "in_force",
      "EffectiveDate": "2011-12-15",
      "LastAmendedDate": "2014-04-16",
      "LastVerifiedDate": "2026-01-16",
      "Language": "EN",
      "Notes": "1–3 sentences: why pipeline projects care + what approvals it drives.",
      "RelatedEntryIDs": ["EU_EIA_DIR_2014_52"]
    }
  ]
}
```

### Hard rules

- `SourceURL` MUST be an official/canonical page for the **specific** instrument.
- If an official downloadable text exists, set `DirectDownloadURL` to a **direct file link** (PDF preferred).
- Do not invent citations. Only include entries you can back with official sources.
- `EntryID` must be stable and unique.
- Set `LastVerifiedDate` to **2026-01-16**.

## Controlled vocab (must use)

### EntryType
`law` | `regulation` | `directive` | `permit_form` | `guidance` | `portal` | `standard_reference` | `policy` | `code` | `order` | `other`

### Category
`pipeline_safety` | `environmental_assessment` | `land_access` | `water_crossings` | `protected_areas` | `cultural_heritage` | `hazmat` | `osh` | `reporting` | `other`

### CoverageLevel
`global` | `supranational` | `country` | `admin1` | `admin2`

### FilingCategory
`supranational` | `national` | `regional` | `local` | `technical` | `industry`

### SourceType
`official_gazette` | `legislation_portal` | `regulator_site` | `eu_law` | `standards_body` | `other`

### Status
`in_force` | `repealed` | `draft` | `unknown`

## Jurisdictions to cover (this run)

1. EU (supranational)
2. All EU member states
3. USA (federal + state admin1 where relevant)
4. Canada (federal + provinces/territories admin1)
5. UAE (federal + emirates admin1)

## Minimum coverage expectations per jurisdiction

### EU
- EIA directive (+ amending directive)
- Habitats/Natura 2000 framework
- Water framework / groundwater protections
- Major accident hazards framework (where applicable)
- TEN-E / energy infrastructure framework (where applicable)

### USA
- PHMSA pipeline safety regulations (49 CFR pipeline parts relevant to gas/liquids)
- NEPA (environmental review)
- Clean Water Act permits relevant to crossings (Army Corps + state certifications)
- Endangered Species Act + NHPA Section 106 review
- FERC Natural Gas Act certification (interstate gas pipelines)
- Key state-level environmental review / siting / water permitting (admin1)

### Canada
- Canadian Energy Regulator Act + key pipeline regs (OPR)
- Impact Assessment Act
- Fisheries / navigable waters approvals
- Province/territory EA frameworks and permitting portals (admin1)

### UAE
- Federal environmental protection law(s)
- EIA framework/guidelines and competent authorities
- Emirate-level regulators (Abu Dhabi, Dubai, etc.)

