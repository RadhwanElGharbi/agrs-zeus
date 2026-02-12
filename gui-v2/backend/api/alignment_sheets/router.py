import math

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from .engine import AlignmentSheetEngine
from .resolver import resolve_alignment_inputs
from .templates import load_template
from ..audit import write_audit_event
from ..auth import require_auth
from ..db import get_db

router = APIRouter(prefix="/alignment-sheets", tags=["alignment-sheets"])


class GenerateRequest(BaseModel):
    project: str
    route: str
    preset: str = "standard"
    template_id: Optional[str] = None
    base_map: Optional[str] = None  # "vector" | "imagery"
    persist: bool = True


def _auto_choose_template_id(project_dir) -> str:
    """
    Auto-select template based on project metadata flag.

    If no flag is present, default to FEED (deliverable-grade) output.
    """
    meta_path = project_dir / "project_metadata.json"
    profile = None
    if meta_path.exists():
        try:
            import json

            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            if isinstance(meta, dict):
                profile = (
                    meta.get("deliverables_profile")
                    or meta.get("alignment_sheets_profile")
                    or meta.get("alignment_sheets_template")
                )
        except Exception:
            profile = None

    if isinstance(profile, str):
        p = profile.strip().lower()
        if p in {"monitoring", "enbridge", "post_construction"}:
            return "enbridge_monitoring_v0"
        if p in {"feed", "epc", "design", "pre_construction"}:
            return "feed_plan_profile_v1"
        # Allow directly specifying a template id in metadata
        return profile.strip()

    return "feed_plan_profile_v1"


@router.post("/generate")
async def generate_alignment_sheets(
    request: GenerateRequest,
    actor=Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Generates professional alignment sheets (PDF).
    """
    try:
        resolved = resolve_alignment_inputs(request.project, request.route)
        template_id = request.template_id or _auto_choose_template_id(resolved.project_dir)
        try:
            load_template(template_id)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Unknown template_id '{template_id}': {exc}") from exc

        engine = AlignmentSheetEngine(
            resolved.project_dir,
            request.route,
            request.preset,
            route_path=resolved.route_path,
            template_id=template_id,
            base_map=request.base_map,
        )
        pdf_buffer = engine.generate(persist=bool(request.persist))

        filename = f"{request.project}_{request.route}_{template_id}_alignment_sheets.pdf"

        write_audit_event(
            db,
            project_name=request.project,
            actor=actor,
            event_type="alignment_sheets.generate",
            payload={
                "route": request.route,
                "preset": request.preset,
                "template_id": template_id,
                "base_map": request.base_map,
                "persist": bool(request.persist),
            },
            required=True,
        )

        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{project}/{route}")
async def preview_alignment_sheets(
    project: str,
    route: str,
    preset: str = "standard",
    template_id: Optional[str] = None,
    base_map: Optional[str] = None,
):
    """
    Returns metadata for the alignment sheets (count, length, etc).
    """
    try:
        resolved = resolve_alignment_inputs(project, route)
        # Instantiate engine just to load config and route length
        chosen_template = template_id or _auto_choose_template_id(resolved.project_dir)
        try:
            load_template(chosen_template)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Unknown template_id '{chosen_template}': {exc}") from exc

        engine = AlignmentSheetEngine(
            resolved.project_dir,
            route,
            preset,
            route_path=resolved.route_path,
            template_id=chosen_template,
            base_map=base_map,
        )

        total_len = float(engine.route_geom.length)
        sheet_count = math.ceil(total_len / engine.config.sheet_length_m)

        ctx = engine.context
        return {
            "project": project,
            "route": route,
            "preset": preset,
            "template_id": chosen_template,
            "base_map": engine.base_map,
            "total_length_m": total_len,
            "sheet_count": sheet_count,
            "sheet_length_m": engine.config.sheet_length_m,
            "h_scale": engine.config.h_scale,
            "v_scale": engine.config.v_scale,
            # Pipeline specs from pipeline_specs.json
            "pipeline_diameter_mm": ctx.pipeline_diameter_mm,
            "pipeline_material": ctx.pipeline_material,
            "pipeline_type": ctx.pipeline_type,
            "depth_of_cover_m": ctx.depth_of_cover_m,
            "mop_bar": ctx.mop_bar,
            # Project context
            "project_name": ctx.project_name,
            "organization": ctx.organization,
            "country": ctx.country,
            "crs_epsg": ctx.crs_epsg,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


