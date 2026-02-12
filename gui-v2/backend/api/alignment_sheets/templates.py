from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Literal, Optional


BaseMapMode = Literal["imagery", "vector"]


@dataclass(frozen=True)
class AlignmentSheetTemplate:
    template_id: str
    kind: str
    defaults: Dict[str, Any]
    presets: Dict[str, Dict[str, Any]]


TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"


def _safe_template_id(template_id: str) -> str:
    # Conservative: allow only filename-safe ids
    out = "".join(ch for ch in template_id.strip() if ch.isalnum() or ch in ("_", "-", "."))
    return out


@lru_cache(maxsize=32)
def load_template(template_id: str) -> AlignmentSheetTemplate:
    tid = _safe_template_id(template_id)
    if not tid:
        raise ValueError("template_id is empty")

    path = TEMPLATES_DIR / f"{tid}.json"
    if not path.exists():
        raise FileNotFoundError(f"Template not found: {path}")

    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)

    if not isinstance(raw, dict):
        raise ValueError(f"Invalid template JSON (expected object): {path}")

    kind = str(raw.get("kind") or "")
    defaults = raw.get("defaults") if isinstance(raw.get("defaults"), dict) else {}
    presets = raw.get("presets") if isinstance(raw.get("presets"), dict) else {}

    return AlignmentSheetTemplate(
        template_id=str(raw.get("template_id") or tid),
        kind=kind,
        defaults=dict(defaults),
        presets={str(k): (v if isinstance(v, dict) else {}) for k, v in presets.items()},
    )


def list_template_ids() -> list[str]:
    if not TEMPLATES_DIR.exists():
        return []
    out: list[str] = []
    for p in sorted(TEMPLATES_DIR.glob("*.json")):
        out.append(p.stem)
    return out


def get_default_template_id() -> str:
    """
    Keep current behavior stable until FEED template is fully implemented:
    default remains the existing monitoring-style layout.
    """
    return "enbridge_monitoring_v0"


def resolve_base_map_mode(
    *,
    template: AlignmentSheetTemplate,
    override: Optional[str],
) -> BaseMapMode:
    if isinstance(override, str) and override.lower() in ("imagery", "vector"):
        return override.lower()  # type: ignore[return-value]
    raw = template.defaults.get("base_map")
    if isinstance(raw, str) and raw.lower() in ("imagery", "vector"):
        return raw.lower()  # type: ignore[return-value]
    return "imagery"















