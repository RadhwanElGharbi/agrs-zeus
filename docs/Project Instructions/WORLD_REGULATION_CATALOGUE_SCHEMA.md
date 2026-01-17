# WORLD_REGULATION_CATALOGUE.csv — Schema (AGRS)

This catalogue standardizes **pipeline-project-relevant** regulations, permits, guidance, and compliance-relevant standards across jurisdictions.

It is designed to power the GUI **Project Profile → Compliance Matrix** by matching entries to a project’s **AOI extent** (countries + admin1) and providing:
- Official source links
- Recency (when last verified)
- Optional direct downloadable texts (PDF/other) for “Indexing” into `docs/regulatory_docs/…`

---

## Core rules

1. One row = one distinct item (a law, regulation, directive, permit form, guidance, portal page, etc.).
2. `EntryID` must be unique and stable (never re-used for a different item).
3. `SourceURL` must be an official/canonical page for the specific item.
4. If a downloadable official text exists, populate `DirectDownloadURL` with a direct file link (PDF preferred).
5. Related items (amendments, guidance, forms, portals, implementing acts) must be linked via `RelatedEntryIDs`.

---

## Columns

### Identity

- `EntryID` (required): stable unique identifier. Suggested pattern:
  - `EU_EIA_DIR_2011_92` (supranational)
  - `USA_FED_49CFR_192` (country/federal)
  - `CAN_FED_SOR_99_294` (country/federal)
  - `USA_ADMIN1_US_CA_CPUC_RULES` (admin1/state)
- `Title` (required): human-readable title.

### Classification

- `EntryType` (required): `law`, `regulation`, `directive`, `permit_form`, `guidance`, `portal`, `standard_reference`, `policy`, `code`, `order`, `other`
- `Category` (required): e.g. `pipeline_safety`, `environmental_assessment`, `land_access`, `water_crossings`, `protected_areas`, `cultural_heritage`, `hazmat`, `osh`, `reporting`, `other`
- `ProjectApplicability` (optional): comma-separated tags like `onshore`, `offshore`, `gas`, `liquids`, `construction`, `operations`

### Coverage

- `CoverageLevel` (required): `global`, `supranational`, `country`, `admin1`, `admin2`
- `CoverageGroup` (optional): e.g. `EU` for supranational EU instruments
- `ISO3` (required for `country/admin1/admin2`): ISO 3166-1 alpha-3
- `Admin1Name` (required for `admin1`): state/province/emirate name
- `Admin1Code` (recommended for `admin1`): ISO 3166-2 if available (e.g. `US-CA`, `CA-ON`, `AE-AZ`)
- `Admin2Name` / `Admin2Code` (optional): for future support

### Authority & sources

- `Authority` (required): issuing body / regulator
- `SourceTitle` (required): title of the source page
- `SourceURL` (required): official link
- `SourceType` (required): `official_gazette`, `legislation_portal`, `regulator_site`, `eu_law`, `standards_body`, `other`

### Direct download (for “Index”)

- `DirectDownloadURL` (optional): direct file link for the regulation text / official publication
- `DirectDownloadFileName` (optional): preferred file name
- `DirectDownloadContentType` (optional): e.g. `application/pdf`
- `FilingCategory` (required): `supranational`, `national`, `regional`, `local`, `technical`, `industry`

### Recency & lifecycle

- `Status` (required): `in_force`, `repealed`, `draft`, `unknown`
- `EffectiveDate` (optional): `YYYY-MM-DD`
- `LastAmendedDate` (optional): `YYYY-MM-DD`
- `LastVerifiedDate` (required): when the entry was last checked
- `Language` (optional): e.g. `EN`, `FR`, `AR`

### Notes & relationships

- `Notes` (optional): brief project-relevant notes
- `RelatedEntryIDs` (optional): comma-separated `EntryID`s

---

## Example

See `WORLD_REGULATION_CATALOGUE.csv` for example EU EIA entries demonstrating `SourceURL`, `DirectDownloadURL`, and `RelatedEntryIDs`.

