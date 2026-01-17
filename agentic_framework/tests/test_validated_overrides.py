"""Regression tests for validated decisions grounding.

These tests ensure that when decisions.json data is available, the final
ExplainResponse is grounded in those validated numbers (key metrics + slope
compliance) regardless of any LLM output variability.
"""

from __future__ import annotations

from agents.executor import _apply_validated_overrides


def test_apply_validated_overrides_sets_key_metrics_and_slope_compliance_pass():
    segment_data = {
        "id": "1",
        "decisions": {
            "length_m": 386.31,
            "slope": {"average_percent": 4.62, "max_percent": 10.17, "compliant": True, "terrain_class": "rolling"},
            "land_cover": {"class_name": "cropland"},
            "construction": {"estimated_cost_eur": 293840.0},
            "crossings": {"count": 2, "details": [{"method_analysis": {"selected_method": "open_cut"}}]},
        },
        "route_context": {
            "pipeline_specifications": {"max_slope_percent": 20.0},
            "data_sources": {"elevation": {"source": "Copernicus DEM GLO-30", "resolution": "30m"}},
        },
    }

    synthesis = {
        "segment_id": "1",
        "overall_assessment": "favorable",
        "confidence": "medium",
        "executive_summary": "placeholder",
        "key_metrics": {},
        "saipem_compliance": {"criteria_met": [], "criteria_violated": [], "compliance_notes": ""},
        "flags": [],
        "recommendations": [],
        "conflicts": [],
    }

    out = _apply_validated_overrides(segment_data, synthesis)
    km = out["key_metrics"]

    assert abs(km["length_km"] - 0.38631) < 1e-6
    assert abs(km["avg_slope"] - 4.62) < 1e-6
    assert km["terrain"] == "rolling"
    assert km["land_use"] == "cropland"
    assert km["estimated_cost"] == "EUR 293,840"
    assert km["construction_method"].lower().startswith("standard trenching") or "open cut" in km["construction_method"].lower()
    assert km["crossing_count"] == 2

    compliance = out["saipem_compliance"]
    assert "2" in compliance["criteria_met"]
    assert "2" not in compliance["criteria_violated"]
    assert "Criterion #2" in compliance.get("compliance_notes", "")


def test_apply_validated_overrides_sets_slope_violation():
    segment_data = {
        "id": "9",
        "decisions": {
            "length_m": 400.0,
            "slope": {"average_percent": 18.0, "max_percent": 25.0, "compliant": False, "terrain_class": "steep"},
            "land_cover": {"class_name": "tree_cover"},
        },
        "route_context": {"pipeline_specifications": {"max_slope_percent": 20.0}},
    }
    synthesis = {"key_metrics": {}, "saipem_compliance": {"criteria_met": ["2"], "criteria_violated": []}}

    out = _apply_validated_overrides(segment_data, synthesis)
    compliance = out["saipem_compliance"]
    assert "2" not in compliance["criteria_met"]
    assert "2" in compliance["criteria_violated"]




