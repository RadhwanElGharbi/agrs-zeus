"""Helpers for grounding agent outputs in validated route decision data.

The PIRL pipeline can generate a ``*.decisions.json`` sidecar alongside each
route GeoJSON. That sidecar contains cross-validated, segment-by-segment
geospatial analysis (slope/elevation, land cover, soil, seismic, crossings,
costs, permits, etc.).

This module provides small utilities to:
- Extract that validated data from the segment payload passed to agents
- Format it into compact, human-readable context blocks for prompts

Design goal: keep agent prompts grounded and defensible (no hallucinated claims).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def _is_nonempty_str(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip())


def _as_float(v: Any) -> Optional[float]:
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v))
    except Exception:
        return None


def _fmt_num(v: Any, digits: int = 2, default: str = "unknown") -> str:
    val = _as_float(v)
    if val is None:
        return default
    return f"{val:.{digits}f}"


def _fmt_money_eur(v: Any, default: str = "unknown") -> str:
    val = _as_float(v)
    if val is None:
        return default
    # Use thousands separators, no decimals for reporting
    return f"EUR {val:,.0f}"


def extract_decisions(segment_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract validated segment decisions (if present)."""
    decisions = segment_data.get("decisions")
    if isinstance(decisions, dict) and decisions:
        return decisions
    return None


def extract_route_context(segment_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract route-level decisions context (if present)."""
    ctx = segment_data.get("route_context")
    if isinstance(ctx, dict) and ctx:
        return ctx
    return None


def format_route_context(route_context: Optional[Dict[str, Any]]) -> str:
    """Format route context (sources/specs) into a compact prompt block."""
    if not route_context:
        return ""

    data_sources = route_context.get("data_sources") or {}
    pipeline_specs = route_context.get("pipeline_specifications") or {}
    route_summary = route_context.get("route_summary") or {}

    lines: List[str] = []

    # Data sources (traceability)
    if isinstance(data_sources, dict) and data_sources:
        lines.append("DATA SOURCES (from decisions.json):")
        for key, ds in data_sources.items():
            if isinstance(ds, dict):
                src = ds.get("source")
                res = ds.get("resolution")
                if _is_nonempty_str(src) and _is_nonempty_str(res):
                    lines.append(f"- {key}: {src} ({res})")
                elif _is_nonempty_str(src):
                    lines.append(f"- {key}: {src}")
                else:
                    lines.append(f"- {key}: (unspecified)")
            else:
                lines.append(f"- {key}: {ds}")

    # Pipeline specs (design basis)
    if isinstance(pipeline_specs, dict) and pipeline_specs:
        lines.append("PIPELINE DESIGN BASIS (from decisions.json):")
        product = pipeline_specs.get("product")
        diameter = pipeline_specs.get("diameter_nominal") or pipeline_specs.get("diameter")
        mop = pipeline_specs.get("max_operating_pressure_bar")
        doc = pipeline_specs.get("depth_of_cover_m")
        max_slope = pipeline_specs.get("max_slope_percent")

        if _is_nonempty_str(product):
            lines.append(f"- Product: {product}")
        if _is_nonempty_str(diameter):
            lines.append(f"- Diameter: {diameter}")
        if mop is not None:
            lines.append(f"- MOP: {_fmt_num(mop, 0)} bar")
        if doc is not None:
            lines.append(f"- Depth of cover: {_fmt_num(doc, 2)} m")
        if max_slope is not None:
            lines.append(f"- Max slope (criteria): {_fmt_num(max_slope, 2)}%")

    # Route summary (context for “why this route”)
    if isinstance(route_summary, dict) and route_summary:
        total_len = route_summary.get("total_length_km")
        total_segments = route_summary.get("total_segments")
        slope_stats = route_summary.get("slope_statistics") or {}
        max_pct = slope_stats.get("max_percent") if isinstance(slope_stats, dict) else None
        over_20 = slope_stats.get("segments_over_20pct") if isinstance(slope_stats, dict) else None

        lines.append("ROUTE SUMMARY (context):")
        if total_len is not None:
            lines.append(f"- Total length: {_fmt_num(total_len, 2)} km")
        if total_segments is not None:
            lines.append(f"- Total segments: {total_segments}")
        if max_pct is not None:
            lines.append(f"- Max segment slope: {_fmt_num(max_pct, 2)}%")
        if over_20 is not None:
            lines.append(f"- Segments over 20%: {over_20}")

    return "\n".join(lines).strip()


def format_segment_decisions(decisions: Optional[Dict[str, Any]], max_crossings: int = 8) -> str:
    """Format validated segment decisions into a compact prompt block."""
    if not decisions:
        return ""

    slope = decisions.get("slope") or {}
    land_cover = decisions.get("land_cover") or {}
    soil = decisions.get("soil") or {}
    seismic = decisions.get("seismic") or {}
    crossings = decisions.get("crossings") or {}
    construction = decisions.get("construction") or {}

    lines: List[str] = ["VALIDATED SEGMENT FACTS (from decisions.json):"]

    # Geometry/length
    length_m = decisions.get("length_m")
    if length_m is not None:
        lines.append(f"- Length: {_fmt_num(length_m, 2)} m")

    # Slope
    if isinstance(slope, dict) and slope:
        avg_pct = slope.get("average_percent")
        max_pct = slope.get("max_percent")
        terrain_class = slope.get("terrain_class")
        compliant = slope.get("compliant")
        parts = []
        if avg_pct is not None:
            parts.append(f"avg {_fmt_num(avg_pct, 2)}%")
        if max_pct is not None:
            parts.append(f"max {_fmt_num(max_pct, 2)}%")
        if _is_nonempty_str(terrain_class):
            parts.append(f"terrain_class {terrain_class}")
        if compliant is not None:
            parts.append(f"compliant={bool(compliant)}")
        if parts:
            lines.append(f"- Slope: " + ", ".join(parts))

    # Land cover
    if isinstance(land_cover, dict) and land_cover:
        class_name = land_cover.get("class_name")
        note = land_cover.get("note")
        if _is_nonempty_str(class_name) and _is_nonempty_str(note):
            lines.append(f"- Land cover: {class_name} ({note})")
        elif _is_nonempty_str(class_name):
            lines.append(f"- Land cover: {class_name}")

    # Soil
    if isinstance(soil, dict) and soil:
        soil_type = soil.get("type")
        stability = soil.get("stability")
        excavation = soil.get("excavation")
        hdd = soil.get("hdd_suitability")
        parts = []
        if _is_nonempty_str(soil_type):
            parts.append(f"type {soil_type}")
        if _is_nonempty_str(stability):
            parts.append(f"stability {stability}")
        if _is_nonempty_str(excavation):
            parts.append(f"excavation {excavation}")
        if _is_nonempty_str(hdd):
            parts.append(f"HDD_suitability {hdd}")
        if parts:
            lines.append(f"- Soil: " + ", ".join(parts))

    # Seismic
    if isinstance(seismic, dict) and seismic:
        zone = seismic.get("zone")
        pga = seismic.get("pga_g")
        desc = seismic.get("description")
        parts = []
        if _is_nonempty_str(zone):
            parts.append(f"{zone}")
        if pga is not None:
            parts.append(f"PGA {_fmt_num(pga, 3)} g")
        if _is_nonempty_str(desc):
            parts.append(str(desc))
        if parts:
            lines.append(f"- Seismic: " + " | ".join(parts))

    # Crossings
    if isinstance(crossings, dict) and crossings:
        count = crossings.get("count")
        if count is not None:
            lines.append(f"- Crossings: {count}")

        details = crossings.get("details")
        if isinstance(details, list) and details:
            lines.append("  Crossing details:")
            for i, cx in enumerate(details[:max_crossings]):
                if not isinstance(cx, dict):
                    continue
                infra = cx.get("infrastructure") or {}
                infra_type = infra.get("type")
                infra_class = infra.get("class")
                infra_name = infra.get("name")
                km = cx.get("km")

                method = None
                rationale = None
                cost_eur = None
                method_analysis = cx.get("method_analysis") or {}
                if isinstance(method_analysis, dict):
                    method = method_analysis.get("selected_method")
                    rationale = method_analysis.get("rationale")
                    cost_eur = method_analysis.get("cost_eur")

                permit_list = cx.get("permits_required")
                permits = None
                if isinstance(permit_list, list) and permit_list:
                    permits = ", ".join([str(p) for p in permit_list if p is not None])

                infra_bits = []
                if _is_nonempty_str(infra_type):
                    infra_bits.append(str(infra_type))
                if _is_nonempty_str(infra_class):
                    infra_bits.append(str(infra_class))
                if _is_nonempty_str(infra_name) and infra_name != "Unnamed road":
                    infra_bits.append(f"\"{infra_name}\"")

                line = f"  - {', '.join(infra_bits) if infra_bits else 'crossing'}"
                if km is not None:
                    line += f" @ km {_fmt_num(km, 3)}"
                if _is_nonempty_str(method):
                    line += f": method {method}"
                if _is_nonempty_str(rationale):
                    line += f" ({rationale})"
                if cost_eur is not None:
                    line += f", cost {_fmt_money_eur(cost_eur)}"
                if permits:
                    line += f", permits: {permits}"
                lines.append(line)

            if len(details) > max_crossings:
                lines.append(f"  - ... {len(details) - max_crossings} more crossings not shown")

    # Construction cost
    if isinstance(construction, dict) and construction:
        est = construction.get("estimated_cost_eur")
        breakdown = construction.get("cost_breakdown") or {}
        terrain_cost = breakdown.get("terrain_cost_eur") if isinstance(breakdown, dict) else None
        crossing_cost = breakdown.get("crossing_cost_eur") if isinstance(breakdown, dict) else None
        if est is not None:
            parts = [f"{_fmt_money_eur(est)}"]
            if terrain_cost is not None:
                parts.append(f"terrain {_fmt_money_eur(terrain_cost)}")
            if crossing_cost is not None:
                parts.append(f"crossings {_fmt_money_eur(crossing_cost)}")
            lines.append("- Construction cost (validated): " + " | ".join(parts))

    return "\n".join(lines).strip()


















