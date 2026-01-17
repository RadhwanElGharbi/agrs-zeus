#!/usr/bin/env python3
"""
Build a single consolidated dataset coverage catalog CSV.

Inputs:
  - /opt/agrs/docs/Research/COUNTRY_COVERAGE_LONG.csv
  - /opt/agrs/docs/Research/TIER1_BEST_DATASETS.csv

Output:
  - /opt/agrs/docs/Project Instructions/WORLD_DATASET_CATALOGUE.csv

This script is intentionally self-contained (no FastAPI imports) so it can run
independently of the backend app.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Dict, Optional, Tuple


RESEARCH_ROOT = Path("/opt/agrs/docs/Research")
ISO_CODES_CSV = RESEARCH_ROOT / "iso_countries.csv"
COUNTRY_COVERAGE_LONG_CSV = RESEARCH_ROOT / "COUNTRY_COVERAGE_LONG.csv"
TIER1_BEST_DATASETS_CSV = RESEARCH_ROOT / "TIER1_BEST_DATASETS.csv"

OUTPUT_CSV = Path("/opt/agrs/docs/Project Instructions/WORLD_DATASET_CATALOGUE.csv")


OUTPUT_HEADER = [
    "ISO3",
    "Country",
    "Dataset",
    "Source",
    "Type",
    "TypeDetail",
    "Access",
    "TemporalStart",
    "TemporalEnd",
    "Frequency",
    "Coverage",
    "URL",
    "Resolution",
    "Quality",
    "Notes",
    "APIAvailable",
    "Origins",
]


def _sanitize_str(value: Optional[str]) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _strip_markdown_bold(value: str) -> str:
    v = _sanitize_str(value)
    # Remove surrounding markdown markers often present in Perplexity CSV exports.
    v = v.strip()
    v = v.strip("*").strip()
    # Also handle leading/trailing '** ' sequences without destroying inner asterisks.
    while v.startswith("**"):
        v = v[2:].lstrip()
    while v.endswith("**"):
        v = v[:-2].rstrip()
    return v.strip()


def _normalize_dataset_name(name: str) -> Tuple[str, Optional[str]]:
    """
    Turn tier1-style human phrasing into a canonical dataset name.
    Example:
      "Best Global DEM - Copernicus DEM GLO-30" -> "Copernicus DEM GLO-30"
    """
    n = _strip_markdown_bold(name)
    # Remove any remaining markdown asterisks inside the string.
    n = n.replace("*", "").strip()
    # Normalize dash variants
    n = n.replace("–", "-").replace("—", "-")

    # If the row uses a trailing qualifier (e.g. "(HIGHEST QUALITY)", "(Global)"),
    # strip it from the dataset name (to avoid duplicates) but preserve it.
    qualifier: Optional[str] = None
    m = re.search(r"\s*\(([^)]*)\)\s*$", n)
    if m:
        q = _sanitize_str(m.group(1))
        # Only strip purely textual qualifiers (keep ones that encode versions/resolution).
        if q and not re.search(r"\d", q):
            qualifier = q
            n = n[: m.start()].strip()

    prefixes = [
        "Best Global DEM - ",
        "Best Global Dataset - ",
        "Best Global Option - ",
        "Best Global DEM ",
        "Best Global Dataset ",
        "Best Global Option ",
    ]
    lower = n.lower()
    for pref in prefixes:
        if lower.startswith(pref.lower()):
            n = n[len(pref) :].strip(" -")
            break

    # Collapse whitespace
    n = re.sub(r"\\s+", " ", n).strip()

    # Canonicalize common Copernicus DEM naming variants so the GUI sees a single
    # stable dataset label (and we can attach correct resolution consistently).
    low = n.lower()
    if ("copernicus" in low or "cop-dem" in low) and ("dem" in low or "digital elevation model" in low):
        if "eea-10" in low or "eea10" in low or "eea 10" in low:
            n = "Copernicus DEM EEA-10"
        elif "glo-30" in low or "glo30" in low:
            n = "Copernicus DEM GLO-30"
        elif "glo-90" in low or "glo90" in low:
            n = "Copernicus DEM GLO-90"
    return n, qualifier


def _extract_resolution_m(value: str) -> Optional[float]:
    """
    Best-effort extraction of spatial resolution in meters from free text.
    Mirrors the frontend parser (meters/metres plural, arc-seconds plural, cm).
    """
    text = _sanitize_str(value).lower()
    if not text:
        return None

    # Fractional arc-second (e.g., "1/3 arc-second")
    m = re.search(r"(\\d+)\\s*/\\s*(\\d+)\\s*arc-?seconds?", text)
    if m:
        num = float(m.group(1))
        den = float(m.group(2))
        if den > 0:
            return (num / den) * 30.0

    # Centimeters
    m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*(?:-?\\s*)?(cm|centimeters?|centimetres?)\\b", text)
    if m:
        return float(m.group(1)) / 100.0

    # Meters
    m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*(?:-?\\s*)?(meters?|metres?|m)\\b", text)
    if m:
        return float(m.group(1))

    # Kilometers
    m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*(?:-?\\s*)?(kilometers?|kilometres?|km)\\b", text)
    if m:
        return float(m.group(1)) * 1000.0

    # Arc-seconds (approx. ~30m at equator per arc-second)
    m = re.search(r"(\\d+(?:\\.\\d+)?)\\s*arc-?seconds?\\b", text)
    if m:
        return float(m.group(1)) * 30.0

    return None


def _canonical_dem_resolution(dataset_name: str) -> Optional[str]:
    name = _sanitize_str(dataset_name)
    if name == "Copernicus DEM GLO-30":
        return "30m (GLO-30 / 1 arc-second)"
    if name == "Copernicus DEM GLO-90":
        return "90m (GLO-90 / 3 arc-seconds)"
    if name == "Copernicus DEM EEA-10":
        return "10m (EEA-10)"
    return None

def _merge_str(a: str, b: str) -> str:
    a = _sanitize_str(a)
    b = _sanitize_str(b)
    if not a:
        return b
    if not b:
        return a
    if a == b:
        return a
    # Prefer the longer string when one contains the other.
    if a in b:
        return b
    if b in a:
        return a
    # Merge with a stable delimiter, keeping both.
    return f"{a} | {b}"


def _extract_urls(value: str) -> list[str]:
    text = _sanitize_str(value)
    if not text:
        return []
    # Extract http(s) URLs; keep them reasonably bounded (stop at whitespace and common delimiters).
    urls = re.findall(r"https?://[^\s\)\],;]+", text)
    cleaned: list[str] = []
    for u in urls:
        u = u.strip().rstrip(".,;")
        if u and u not in cleaned:
            cleaned.append(u)
    return cleaned


def _normalize_url_field(raw: str) -> Tuple[str, str]:
    """
    Return (primary_url, note_text).

    The catalogue is consumed by the GUI, which expects URL to be a single
    clickable URL. If the source cell contains multiple URLs or non-URL text,
    we keep the first URL in URL and move the rest into Notes.
    """
    text = _strip_markdown_bold(raw).replace("*", "").strip()
    if not text:
        return "", ""

    urls = _extract_urls(text)
    if urls:
        primary = urls[0]
        extras = urls[1:]
        note_parts: list[str] = []
        if extras:
            note_parts.append("Additional URLs: " + " | ".join(extras))

        # Remove URLs from the original text to capture any remaining explanation.
        remainder = re.sub(r"https?://[^\s\)\],;]+", " ", text).strip()
        remainder = re.sub(r"\s+", " ", remainder).strip(" |")
        if remainder:
            note_parts.append(remainder)

        return primary, " | ".join(note_parts).strip()

    # Accept www.* by converting to https://
    m = re.search(r"\bwww\.[^\s\)\],;]+", text, flags=re.I)
    if m:
        token = m.group(0).strip().rstrip(".,;")
        primary = "https://" + token
        remainder = (text.replace(token, " ")).strip()
        remainder = re.sub(r"\s+", " ", remainder).strip(" |")
        return primary, remainder

    # If it's a single token that looks like a domain/path, prefix https://
    if " " not in text and "." in text and not text.lower().startswith(("contact", "via ", "available", "derive")):
        return "https://" + text.strip().rstrip(".,;"), ""

    # Not a URL; treat as descriptive note.
    return "", text


def _normalize_quality_field(raw: str) -> Tuple[str, str]:
    """
    Return (quality, note_text). Quality is normalized to a single integer 1-5.
    """
    text = _strip_markdown_bold(raw).replace("*", "").strip()
    if not text:
        return "", ""
    # Extract candidates in [1..5]
    candidates = [int(x) for x in re.findall(r"[1-5]", text)]
    if not candidates:
        return "", f"Quality (unparsed): {text}"
    best = max(candidates)
    if len(set(candidates)) > 1:
        return str(best), f"Quality candidates: {text}"
    return str(best), ""

def _merge_origins(a: str, b: str) -> str:
    parts = []
    for raw in [a, b]:
        for p in _sanitize_str(raw).split("|"):
            p = p.strip()
            if p and p not in parts:
                parts.append(p)
    return " | ".join(parts)


def _load_iso_mappings() -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    iso_to_name: Dict[str, str] = {}
    name_to_iso: Dict[str, str] = {}
    alpha2_to_iso: Dict[str, str] = {}

    if not ISO_CODES_CSV.exists():
        return iso_to_name, name_to_iso, alpha2_to_iso

    with ISO_CODES_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = _sanitize_str(row.get("name"))
            alpha3 = _sanitize_str(row.get("alpha-3"))
            alpha2 = _sanitize_str(row.get("alpha-2"))
            if not alpha3:
                continue
            iso_to_name[alpha3.upper()] = name
            if name:
                normalized = re.sub(r"[^a-z0-9]+", "", name.lower())
                name_to_iso[normalized] = alpha3.upper()
            if alpha2:
                alpha2_to_iso[alpha2.upper()] = alpha3.upper()

    return iso_to_name, name_to_iso, alpha2_to_iso


def _normalize_country_value(value: Optional[str], iso_to_name: Dict[str, str], name_to_iso: Dict[str, str], alpha2_to_iso: Dict[str, str]) -> Optional[str]:
    val = _sanitize_str(value)
    if not val:
        return None

    # Strip common artifacts (e.g. "Kosovo*" on EEA pages and some exports)
    val = val.replace("*", "").strip()

    common_abbreviations = {
        "UAE": "ARE",
        "UK": "GBR",
        "USA": "USA",
        "US": "USA",
        "RUSSIA": "RUS",
        # Common pseudo-ISO3 for Kosovo (not in ISO 3166-1)
        "KOSOVO": "XKX",
    }

    upper = val.upper()
    if upper in common_abbreviations:
        return common_abbreviations[upper]

    if len(upper) == 3 and upper.isalpha():
        if upper in iso_to_name:
            return upper
        if upper == "XKX":
            return "XKX"

    if len(upper) == 2 and upper.isalpha():
        return alpha2_to_iso.get(upper)

    normalized = re.sub(r"[^a-z0-9]+", "", val.lower())
    return name_to_iso.get(normalized)


def _looks_like_tier1_category(value: str) -> bool:
    v = value.lower().strip()
    if not v:
        return False
    # Heuristic: tier1 categories tend to include '/' or start with well-known prefixes.
    return ("/" in v) or v.startswith("infrastructure") or v.startswith("elevation") or v.startswith("land cover") or v.startswith("hydrology") or v.startswith("geology")


def _merge_records(existing: Dict[str, str], incoming: Dict[str, str]) -> Dict[str, str]:
    out = dict(existing)

    # Merge origins first.
    out["Origins"] = _merge_origins(out.get("Origins", ""), incoming.get("Origins", ""))

    # Prefer tier1 "Type" (category-like) if we have it, but preserve the other in TypeDetail.
    ex_type = _sanitize_str(out.get("Type"))
    in_type = _sanitize_str(incoming.get("Type"))
    ex_origin = out.get("Origins", "")
    in_origin = incoming.get("Origins", "")

    # Simple field-by-field merge, with special handling for URL/Quality.
    for key in OUTPUT_HEADER:
        if key in ("Origins", "Type", "TypeDetail"):
            continue
        if key == "URL":
            ex_url = _sanitize_str(out.get("URL"))
            in_url = _sanitize_str(incoming.get("URL"))
            if not ex_url:
                out["URL"] = in_url
            elif in_url and in_url != ex_url:
                # Keep the first URL and push the other into Notes.
                out["Notes"] = _merge_str(out.get("Notes", ""), f"Additional URL: {in_url}")
        elif key == "Quality":
            # Normalize to a single best value.
            ex_q, ex_note = _normalize_quality_field(out.get("Quality", ""))
            in_q, in_note = _normalize_quality_field(incoming.get("Quality", ""))
            best = ""
            if ex_q and in_q:
                best = str(max(int(ex_q), int(in_q)))
            else:
                best = ex_q or in_q
            out["Quality"] = best
            if ex_note:
                out["Notes"] = _merge_str(out.get("Notes", ""), ex_note)
            if in_note:
                out["Notes"] = _merge_str(out.get("Notes", ""), in_note)
        else:
            out[key] = _merge_str(out.get(key, ""), incoming.get(key, ""))

    # Handle Type / TypeDetail specially.
    if not ex_type:
        out["Type"] = in_type
    elif not in_type:
        out["Type"] = ex_type
    elif ex_type == in_type:
        out["Type"] = ex_type
    else:
        # Prefer category-like value for Type, keep the other in TypeDetail.
        if _looks_like_tier1_category(in_type) and not _looks_like_tier1_category(ex_type):
            out["TypeDetail"] = _merge_str(out.get("TypeDetail", ""), ex_type)
            out["Type"] = in_type
        elif _looks_like_tier1_category(ex_type) and not _looks_like_tier1_category(in_type):
            out["TypeDetail"] = _merge_str(out.get("TypeDetail", ""), in_type)
            out["Type"] = ex_type
        else:
            # If both look similar, keep existing Type and stash incoming in TypeDetail.
            out["TypeDetail"] = _merge_str(out.get("TypeDetail", ""), in_type)
            out["Type"] = ex_type

    # Prefer ISO3/Country that are non-empty and stable.
    out["ISO3"] = (out.get("ISO3") or incoming.get("ISO3") or "").upper()

    return out


def main() -> int:
    iso_to_name, name_to_iso, alpha2_to_iso = _load_iso_mappings()

    records: Dict[Tuple[str, str], Dict[str, str]] = {}

    def upsert(record: Dict[str, str]) -> None:
        iso3 = _sanitize_str(record.get("ISO3")).upper()
        dataset = _sanitize_str(record.get("Dataset"))
        if not iso3 or not dataset:
            return
        key = (iso3, re.sub(r"\\s+", " ", dataset.strip().lower()))
        if key in records:
            records[key] = _merge_records(records[key], record)
        else:
            # Ensure all columns exist
            rec = {h: _sanitize_str(record.get(h, "")) for h in OUTPUT_HEADER}
            rec["ISO3"] = iso3
            records[key] = rec

    # 1) Load COUNTRY_COVERAGE_LONG.csv
    if not COUNTRY_COVERAGE_LONG_CSV.exists():
        raise SystemExit(f"Missing input: {COUNTRY_COVERAGE_LONG_CSV}")

    with COUNTRY_COVERAGE_LONG_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            url_raw = _sanitize_str(row.get("URL"))
            url, url_note = _normalize_url_field(url_raw)
            rec = {
                "ISO3": _sanitize_str(row.get("ISO3")).upper(),
                "Country": _sanitize_str(row.get("Country")),
                "Dataset": _sanitize_str(row.get("Dataset")),
                "Source": _sanitize_str(row.get("Source")),
                "Type": _sanitize_str(row.get("Type")),
                "TypeDetail": "",
                "Access": _sanitize_str(row.get("Access")),
                "TemporalStart": _sanitize_str(row.get("TemporalStart")),
                "TemporalEnd": _sanitize_str(row.get("TemporalEnd")),
                "Frequency": _sanitize_str(row.get("Frequency")),
                "Coverage": _sanitize_str(row.get("Coverage")),
                "URL": url,
                "Resolution": "",
                "Quality": "",
                "Notes": url_note,
                "APIAvailable": "",
                "Origins": "COUNTRY_COVERAGE_LONG.csv",
            }

            # Populate Resolution for canonical Copernicus DEM variants in the global catalogue.
            if rec["ISO3"] == "WLD":
                canonical = _canonical_dem_resolution(rec.get("Dataset", ""))
                if canonical:
                    rec["Resolution"] = canonical

            upsert(rec)

    # 2) Load TIER1_BEST_DATASETS.csv (filter obvious section/header rows)
    if not TIER1_BEST_DATASETS_CSV.exists():
        raise SystemExit(f"Missing input: {TIER1_BEST_DATASETS_CSV}")

    skip_category_keywords = {
        "comprehensive inventory",
        "category",
        "dataset name",
        "source/provider",
        "for pipeline routing",
        "prioritize:",
        "updated",
    }

    # Generic placeholder dataset names to filter out (exact matches).
    # Mirrors the backend filtering logic used for the GUI catalog.
    skip_dataset_exact = {
        # Section headers (these never represent actual datasets)
        "national sources",
        "global sources",
        "global sources (recommended)",
        "global dem sources",
        "commercial providers",
        "commercial/industry sources",
        "national products",
        "global products",
        "global dems (best for russia)",
        "global dems",
        "global dem",
        "regional/global high-resolution dems",
        # Generic placeholders (not real dataset names)
        "lidar point clouds",
        "alternative global dems",
        "free baseline imagery",
        "high-resolution commercial imagery",
        "global soil datasets",
        "global climate datasets",
        "global population datasets",
        "global administrative boundaries",
        "provincial pipeline registries",
        # Common non-dataset narrative rows
        "critical data gaps:",
        "best open data strategy:",
        "priority actions:",
        "api access strengths:",
        "coverage notes:",
        "data quality:",
        "recommendations:",
        "access challenges:",
        # Names that are just category headers when they have no source
        "national land use maps",
        "national road network",
        "national railway network",
        "national electricity networks",
        "national protected areas",
        "national geological survey",
        "national census data",
        "official national boundaries",
        "national water resources data",
        "national administrative boundaries",
        "national lidar-derived dem",
    }

    # Patterns that indicate generic/placeholder entries or notes (not real datasets).
    # Mirrors the backend filtering logic used for the GUI catalog.
    skip_dataset_patterns = {
        "no national",
        "not available",
        "were identified",
        "not publicly available",
        "requires request",
        "not documented",
        "not recommended",
        "for pipeline routing",
        "prioritize:",
        "best global dataset",
        "best global datasets",
        "best global dem",
        "api access strengths",
        "coverage notes",
        "recommendations:",
        "access challenges:",
        "critical data gaps:",
        "best open data strategy:",
        "priority actions:",
    }

    # Names that are only valid when they have a source provider (column 3)
    # These can be section headers or real datasets depending on context
    skip_if_no_source = {
        "copernicus dem glo-30",
        "copernicus dem glo-90",
        "copernicus dem (global coverage)",
        "esa worldcover 2021",
        "global surface water explorer",
        "hydrosheds",
        "era5 reanalysis",
        "era5 reanalysis (global)",
        "worldclim",
        "worldclim 2.1",
        "worldclim (global)",
        "worldpop",
        "landscan",
        "sentinel-2 (free baseline)",
        "gadm",
        "onegeology",
    }

    with TIER1_BEST_DATASETS_CSV.open("r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            first = _sanitize_str(row[0])
            if not first or first.startswith("#") or first.lower() == "country":
                continue

            iso3 = _normalize_country_value(first, iso_to_name, name_to_iso, alpha2_to_iso)
            if not iso3:
                continue

            category = _strip_markdown_bold(row[1]) if len(row) > 1 else ""
            if not category:
                continue
            if any(kw in category.lower() for kw in skip_category_keywords):
                continue

            dataset_name_raw = row[2] if len(row) > 2 else ""
            dataset_name, name_qualifier = _normalize_dataset_name(dataset_name_raw)
            if not dataset_name or dataset_name.lower() in ("dataset name",):
                continue

            dataset_lower = dataset_name.lower().strip()
            if dataset_lower.endswith(":"):
                continue
            if dataset_lower in skip_dataset_exact:
                continue
            if any(pat in dataset_lower for pat in skip_dataset_patterns):
                continue

            source_provider = _strip_markdown_bold(row[3]) if len(row) > 3 else ""
            if dataset_lower in skip_if_no_source and not source_provider:
                continue
            resolution = _strip_markdown_bold(row[4]) if len(row) > 4 else ""
            temporal = _strip_markdown_bold(row[5]) if len(row) > 5 else ""
            frequency = _strip_markdown_bold(row[6]) if len(row) > 6 else ""
            access = _strip_markdown_bold(row[7]) if len(row) > 7 else ""
            api_available = _strip_markdown_bold(row[8]) if len(row) > 8 else ""

            url_raw = _strip_markdown_bold(row[9]) if len(row) > 9 else ""
            url, url_note = _normalize_url_field(url_raw)

            quality_raw = _strip_markdown_bold(row[10]) if len(row) > 10 else ""
            quality, quality_note = _normalize_quality_field(quality_raw)
            notes = _strip_markdown_bold(row[11]) if len(row) > 11 else ""
            if url_note:
                notes = _merge_str(notes, url_note)
            if quality_note:
                notes = _merge_str(notes, quality_note)
            if name_qualifier:
                notes = _merge_str(notes, f"Qualifier: {name_qualifier}")

            is_dem_category = "dem" in category.lower() or "elevation" in category.lower() or "terrain" in category.lower()

            # If a tier1 "resolution" cell is actually descriptive text (common in some exports),
            # keep it, but move it into Notes so we don't lose it and we can replace Resolution
            # with a canonical numeric value where possible.
            if is_dem_category and resolution and _extract_resolution_m(resolution) is None:
                notes = _merge_str(notes, resolution)
                resolution = ""

            # Enforce canonical Copernicus DEM resolutions for the three explicit variants.
            if is_dem_category:
                canonical_res = _canonical_dem_resolution(dataset_name)
                if canonical_res:
                    # If the original "resolution" contained other variant details, preserve them in Notes.
                    if resolution and resolution != canonical_res and canonical_res not in resolution:
                        notes = _merge_str(notes, resolution)
                    resolution = canonical_res

            # Avoid repeating the canonical resolution in notes (common after merges/cleanup).
            if resolution and notes:
                note_parts = [p.strip() for p in notes.split("|")]
                note_parts = [p for p in note_parts if p and p != resolution]
                notes = " | ".join(note_parts)

            # Skip rows that provide no usable details (often section placeholders).
            has_any_detail = any([source_provider, resolution, temporal, frequency, access, api_available, url, notes])
            if not has_any_detail:
                continue

            coverage_parts = [p for p in [resolution, notes] if p]
            coverage = " | ".join(coverage_parts)

            rec = {
                "ISO3": iso3,
                "Country": iso_to_name.get(iso3, first.replace("*", "").strip()),
                "Dataset": dataset_name,
                "Source": source_provider,
                "Type": category,
                "TypeDetail": "",
                "Access": access,
                "TemporalStart": temporal,
                "TemporalEnd": "",
                "Frequency": frequency,
                "Coverage": coverage,
                "URL": url,
                "Resolution": resolution,
                "Quality": quality,
                "Notes": notes,
                "APIAvailable": api_available,
                "Origins": "TIER1_BEST_DATASETS.csv",
            }
            upsert(rec)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_HEADER)
        writer.writeheader()
        for (iso3, dataset_key) in sorted(records.keys(), key=lambda k: (k[0], k[1])):
            writer.writerow(records[(iso3, dataset_key)])

    print(f"Wrote {len(records)} unique dataset record(s) -> {OUTPUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


