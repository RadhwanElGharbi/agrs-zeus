"""
Pressure Design API (FastAPI thin wrapper over C++ engine via pybind11).

Endpoint:
  POST /api/engineering/pressure-design
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..project_utils import resolve_project_path

router = APIRouter(prefix="/engineering", tags=["engineering"])


try:
    from api._native import zeus_engineering_native as _zeus_native  # type: ignore

    _Z_NATIVE_IMPORT_ERROR: Optional[str] = None
except Exception as exc:  # pragma: no cover - runtime environment dependent
    _zeus_native = None  # type: ignore
    _Z_NATIVE_IMPORT_ERROR = str(exc)


class PressureDesignRequest(BaseModel):
    """
    A deliberately flexible request model.

    - `inputs` is passed through to the C++ engine (which performs the
      authoritative validation and unit handling).
    - `project` is only required when `save=true`.
    """

    model_config = {"extra": "allow"}

    mode: Literal["thickness_from_pressure", "pressure_from_thickness"]
    inputs: Dict[str, Any] = Field(default_factory=dict)

    project: Optional[str] = None
    save: bool = False


def _project_dir_or_404(project: str) -> Path:
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project}' not found (missing project_metadata.json or pipeline_specs.json)",
        )
    return project_path


@router.post("/pressure-design")
async def pressure_design(request: PressureDesignRequest) -> Dict[str, Any]:
    if _zeus_native is None:
        raise HTTPException(
            status_code=500,
            detail=f"Native engineering module not available: {_Z_NATIVE_IMPORT_ERROR}",
        )

    try:
        if request.mode == "thickness_from_pressure":
            result = _zeus_native.compute_required_thickness(request.inputs)
        else:
            result = _zeus_native.compute_max_pressure(request.inputs)
    except Exception as exc:
        # Treat input issues as 400; the C++ layer raises invalid_argument for validation errors.
        raise HTTPException(status_code=400, detail=str(exc))

    response: Dict[str, Any] = {
        "mode": request.mode,
        "result": result,
    }

    if request.save:
        if not request.project:
            raise HTTPException(status_code=400, detail="project is required when save=true")

        project_dir = _project_dir_or_404(request.project)
        out_dir = project_dir / "engineering" / "pressure_design"
        out_dir.mkdir(parents=True, exist_ok=True)

        now = datetime.now(timezone.utc)
        ts = now.strftime("%Y%m%dT%H%M%S.%fZ")
        run_id = uuid.uuid4().hex[:10]
        filename = f"{ts}_{request.mode}_{run_id}.json"
        out_path = out_dir / filename

        artifact = {
            "timestamp_utc": ts,
            "run_id": run_id,
            "project": request.project,
            "mode": request.mode,
            "inputs": request.inputs,
            "result": result,
            "engine": {
                "type": "cpp_pybind_inprocess",
                "module": "api._native.zeus_engineering_native",
            },
        }
        out_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

        response["saved"] = True
        response["artifact_path"] = str(out_path)

    return response


