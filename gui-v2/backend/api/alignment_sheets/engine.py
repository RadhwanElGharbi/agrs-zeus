"""
Professional Alignment Sheet Engine
Generates industry-standard pipeline alignment sheets matching Enbridge format
"""
from __future__ import annotations

import math
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

# Geometry
try:
    from shapely.geometry import LineString, Point, shape
    from shapely.ops import linemerge, substring
except ImportError:  # pragma: no cover
    LineString = None  # type: ignore
    Point = None  # type: ignore
    shape = None  # type: ignore
    linemerge = None  # type: ignore
    substring = None  # type: ignore

# Raster
try:
    import rasterio
    from rasterio.windows import Window
except ImportError:  # pragma: no cover
    rasterio = None  # type: ignore
    Window = None  # type: ignore

# Vector
try:
    import fiona
    FIONA_AVAILABLE = True
except ImportError:  # pragma: no cover
    fiona = None  # type: ignore
    FIONA_AVAILABLE = False

from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from .bands import TopDataBandsRenderer, PlanViewBand, BottomDataBandsRenderer, FooterRenderer
from .feed_bands import FeedPlanViewBand, FeedProfileViewBand, FeedTablesBand
from .core import LinearReferencingSystem
from .imagery import SatelliteImageryService
from .templates import (
    AlignmentSheetTemplate,
    get_default_template_id,
    load_template,
    resolve_base_map_mode,
)
from .models import (
    Crossing,
    MunicipalitySegment,
    PipeSegment,
    ProjectContext,
    ProtectedArea,
    SheetConfig,
    SheetData,
)


class AlignmentSheetEngine:
    """
    Professional alignment sheet generator.

    Layout (top to bottom):
    1. Top Data Bands - Environmental/planning information
    2. Plan View - Satellite imagery with route and stations
    3. Bottom Data Bands - Profile, crossings, pipe data
    4. Footer - Legend, source, revisions, title block
    """

    def __init__(
        self,
        project_dir: Path,
        route_name: str,
        preset: str = "standard",
        *,
        route_path: Optional[Path] = None,
        template_id: Optional[str] = None,
        base_map: Optional[str] = None,
    ):
        self.project_dir = project_dir
        self.route_name = route_name
        self.preset = preset
        self.route_path = route_path

        # Template selection (kept backward-compatible: default stays the current monitoring-style layout)
        self.template_id = template_id or get_default_template_id()
        self.template: Optional[AlignmentSheetTemplate] = None
        try:
            self.template = load_template(self.template_id)
        except Exception:
            # If templates are missing/corrupt, fall back to embedded defaults.
            self.template = None

        self.base_map = resolve_base_map_mode(template=self.template, override=base_map) if self.template else "imagery"

        # Load Config (may depend on template presets)
        self.config = self._get_config(preset)
        self.context = self._load_context()
        self.route_geom = self._load_route()
        self.lrs = LinearReferencingSystem()
        self.imagery_service = SatelliteImageryService(project_dir / "cache")

    def _get_config(self, preset: str) -> SheetConfig:
        """Get sheet configuration for preset."""
        # Template-driven presets (preferred)
        if self.template and isinstance(self.template.presets, dict):
            raw = self.template.presets.get(preset) or self.template.presets.get("standard") or {}
            try:
                sheet_length_m = float(raw.get("sheet_length_m", 2000))
                h_scale = int(raw.get("h_scale", 5000))
                v_scale = int(raw.get("v_scale", 500))
                station_interval_m = float(raw.get("station_interval_m", 100))
                return SheetConfig(
                    sheet_length_m=sheet_length_m,
                    h_scale=h_scale,
                    v_scale=v_scale,
                    station_interval_m=station_interval_m,
                    preset_name=preset,
                )
            except Exception:
                # Fall through to embedded defaults
                pass

        # Embedded defaults (legacy behavior)
        presets = {
            "detail": SheetConfig(1000, 2000, 200, 50, preset_name="detail"),
            "standard": SheetConfig(2000, 5000, 500, 100, preset_name="standard"),
            "overview": SheetConfig(5000, 10000, 1000, 200, preset_name="overview"),
        }
        return presets.get(preset, presets["standard"])

    def _load_context(self) -> ProjectContext:
        """Load project metadata and pipeline specs."""
        import json

        meta_path = self.project_dir / "project_metadata.json"
        specs_path = self.project_dir / "pipeline_specs.json"

        # Prefer sidecar next to the resolved route file (handles nested outputs dirs + subpaths)
        pirl_meta_path: Path
        if self.route_path is not None:
            pirl_meta_path = self.route_path.with_suffix(".metadata.json")
        else:
            pirl_meta_path = self.project_dir / "PIRL" / "outputs" / f"{self.route_name}.metadata.json"

        meta, specs, pirl_meta = {}, {}, {}
        try:
            if meta_path.exists():
                with open(meta_path) as f:
                    meta = json.load(f)
            if specs_path.exists():
                with open(specs_path) as f:
                    specs = json.load(f)
            if pirl_meta_path.exists():
                with open(pirl_meta_path) as f:
                    pirl_meta = json.load(f)
        except Exception as e:
            print(f"Metadata loading error: {e}")

        total_len = pirl_meta.get("route_info", {}).get("length_m", 0) if isinstance(pirl_meta, dict) else 0
        if not total_len:
            total_len = (pirl_meta.get("metadata", {}) or {}).get("total_length_m", 0) if isinstance(pirl_meta, dict) else 0

        crs_epsg = (
            (meta.get("crs", {}) or {}).get("epsg")
            if isinstance(meta, dict)
            else None
        )
        try:
            crs_epsg = int(crs_epsg) if crs_epsg else int(meta.get("crs_epsg", 32633))
        except Exception:
            crs_epsg = 32633

        crs_name = (
            (meta.get("crs", {}) or {}).get("name")
            if isinstance(meta, dict)
            else None
        ) or meta.get("crs_name", "UTM") if isinstance(meta, dict) else "UTM"

        return ProjectContext(
            project_name=meta.get("project_name", self.project_dir.name) if isinstance(meta, dict) else self.project_dir.name,
            project_id=meta.get("project_id", "N/A") if isinstance(meta, dict) else "N/A",
            organization=meta.get("organization", "AGRS") if isinstance(meta, dict) else "AGRS",
            country=meta.get("country", "Unknown") if isinstance(meta, dict) else "Unknown",
            crs_epsg=crs_epsg,
            crs_name=crs_name,
            route_name=self.route_name,
            total_length_m=float(total_len or 0),
            pipeline_diameter_mm=float(
                (specs.get("diameter_mm") or _derive_pipeline_diameter_mm(specs) or 600)
            )
            if isinstance(specs, dict)
            else 600,
            pipeline_material=str(specs.get("material", "Carbon Steel")) if isinstance(specs, dict) else "Carbon Steel",
            pipeline_type=str(specs.get("pipeline_type") or specs.get("type") or "Gas") if isinstance(specs, dict) else "Gas",
            depth_of_cover_m=float(specs.get("depth_of_cover_m", 1.5)) if isinstance(specs, dict) else 1.5,
            mop_bar=float(specs.get("mop_bar", 70)) if isinstance(specs, dict) else 70,
            date_generated=datetime.now().strftime("%Y-%m-%d"),
            algorithm=(pirl_meta.get("generation_method", {}) or {}).get("method", "PIRL Engine") if isinstance(pirl_meta, dict) else "PIRL Engine",
            generation_date=pirl_meta.get("generated_at", "") if isinstance(pirl_meta, dict) else "",
            total_cost_usd=float((pirl_meta.get("cost_breakdown", {}) or {}).get("total", 0.0)) if isinstance(pirl_meta, dict) else 0.0,
            max_slope_pct=float((pirl_meta.get("saipem_constraints", {}) or {}).get("max_slope_percent", 0.0)) if isinstance(pirl_meta, dict) else 0.0,
            house_clearance_m=float((pirl_meta.get("saipem_constraints", {}) or {}).get("house_clearance_m", 0.0)) if isinstance(pirl_meta, dict) else 0.0,
            pipeline_wall_thickness_mm=float(
                (specs.get("thickness_mm") or specs.get("wall_thickness_mm") or 0.0)
            )
            if isinstance(specs, dict)
            else 0.0,
            pipeline_grade=str(specs.get("grade", "") or "") if isinstance(specs, dict) else "",
            pipeline_coating=str(specs.get("coating", "") or "") if isinstance(specs, dict) else "",
        )


def _derive_pipeline_diameter_mm(specs: dict) -> Optional[float]:
    """
    Alignment sheets historically look for diameter_mm; newer projects may store
    base-unit diameters (meters or inches) + measurement_system. Derive mm here
    for robustness.
    """
    try:
        ms_raw = specs.get("measurement_system")
        ms = str(ms_raw).strip().lower() if ms_raw is not None else ""
        outer = specs.get("outer_diameter")
        if outer is None:
            return None
        outer_f = float(outer)
        if ms.startswith("imp"):
            return outer_f * 25.4
        # SI: stored in meters
        return outer_f * 1000.0
    except Exception:
        return None

    def _infer_route_epsg(self, data: dict) -> Optional[int]:
        try:
            crs = data.get("crs")
            if not isinstance(crs, dict):
                return None
            props = crs.get("properties")
            if not isinstance(props, dict):
                return None
            name = str(props.get("name") or "").strip()
            if not name:
                return None
            import re

            m = re.search(r"(?i)epsg[^0-9]*(\d{3,6})", name)
            if m:
                return int(m.group(1))
        except Exception:
            return None
        return None

    def _first_xy_from_geojson(self, data: dict) -> Optional[Tuple[float, float]]:
        try:
            if not isinstance(data, dict):
                return None
            feats = data.get("features")
            if isinstance(feats, list) and feats:
                geom = feats[0].get("geometry") if isinstance(feats[0], dict) else None
                if isinstance(geom, dict):
                    coords = geom.get("coordinates")
                    # Handle nested arrays to find first point
                    while isinstance(coords, list) and coords and isinstance(coords[0], list):
                        coords = coords[0]
                    if isinstance(coords, list) and len(coords) >= 2:
                        return float(coords[0]), float(coords[1])
        except Exception:
            return None
        return None

    def _load_route(self) -> LineString:
        """Load route geometry from GeoJSON, reprojecting to project CRS if needed."""
        import json

        if self.route_path is not None:
            route_path = self.route_path
        else:
            route_path = self.project_dir / "PIRL" / "outputs" / f"{self.route_name}.geojson"
            if not route_path.exists():
                # If caller passed extension already
                alt = self.project_dir / "PIRL" / "outputs" / self.route_name
                if alt.exists():
                    route_path = alt

        if not route_path.exists():
            raise FileNotFoundError(f"Route file not found: {route_path}")

        with open(route_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if shape is None or linemerge is None:
            raise RuntimeError("Shapely not available for alignment sheets generation.")

        target_epsg = getattr(self.context, "crs_epsg", None)
        src_epsg = self._infer_route_epsg(data)
        if src_epsg is None:
            first = self._first_xy_from_geojson(data)
            if first and abs(first[0]) <= 180 and abs(first[1]) <= 90:
                src_epsg = 4326
            else:
                src_epsg = target_epsg

        transformer = None
        if target_epsg and src_epsg and int(target_epsg) != int(src_epsg):
            try:
                from pyproj import Transformer

                transformer = Transformer.from_crs(f"epsg:{int(src_epsg)}", f"epsg:{int(target_epsg)}", always_xy=True)
            except Exception as exc:
                raise RuntimeError(
                    f"Route CRS EPSG:{src_epsg} must be transformed to project EPSG:{target_epsg}, "
                    f"but pyproj is not available or failed to init: {exc}"
                ) from exc

        lines = []
        for feat in data.get("features", []) if isinstance(data, dict) else []:
            if not isinstance(feat, dict):
                continue
            try:
                geom_raw = feat.get("geometry")
                if not isinstance(geom_raw, dict):
                    continue
                if transformer is not None and "coordinates" in geom_raw:
                    geom_raw = geom_raw.copy()
                    geom_raw["coordinates"] = self._transform_coordinates(geom_raw["coordinates"], transformer)
                g = shape(geom_raw)
                if g.geom_type == "LineString":
                    lines.append(g)
                elif g.geom_type == "MultiLineString":
                    lines.extend(g.geoms)
            except Exception as e:
                print(f"Error parsing feature geometry: {e}")

        if not lines:
            raise ValueError("No valid line geometries found in route file")

        merged = linemerge(lines)
        if merged.geom_type == "MultiLineString":
            merged = max(merged.geoms, key=lambda g: g.length)
        return merged

    def _transform_coordinates(self, coords, transformer):
        """Recursively transform GeoJSON coordinate arrays using a pyproj Transformer."""
        if not isinstance(coords, list) or not coords:
            return coords
        if isinstance(coords[0], (int, float)):
            x, y = transformer.transform(coords[0], coords[1])
            if len(coords) > 2:
                return [x, y] + coords[2:]
            return [x, y]
        return [self._transform_coordinates(c, transformer) for c in coords]

    def generate(self, *, persist: bool = False) -> BytesIO:
        """Main PDF generation method.

        If persist=True, also writes deliverables artifacts under:
          Projects/<project>/Deliverables/alignment_sheets/<route>/<template_id>/
        """
        all_crossings = self._detect_crossings()
        all_protected_areas = self._detect_protected_areas()
        all_municipalities = self._detect_municipalities()

        # Machine-readable register (for deliverables persistence step)
        self.generated_crossings_register = self._build_crossings_register(all_crossings)

        sheets = self._cut_sheets(all_crossings, all_protected_areas, all_municipalities)

        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=landscape(A3))

        imagery_dir: Optional[Path] = None
        imagery_used: list[dict] = []
        if self.base_map == "imagery":
            imagery_dir = self.project_dir / "cache" / "sheet_imagery"
            imagery_dir.mkdir(parents=True, exist_ok=True)

        for sheet in sheets:
            img_path: Optional[Path] = None
            if self.base_map == "imagery" and imagery_dir is not None:
                bbox = (
                    sheet.bbox_easting_min - 400,
                    sheet.bbox_northing_min - 400,
                    sheet.bbox_easting_max + 400,
                    sheet.bbox_northing_max + 400,
                )
                img_path = imagery_dir / f"sheet_{sheet.sheet_number}.tif"
                if not img_path.exists():
                    self.imagery_service.fetch_image_for_bbox(bbox, self.context.crs_epsg, img_path)
                try:
                    if img_path.exists():
                        stat = img_path.stat()
                        imagery_used.append(
                            {
                                "sheet_number": sheet.sheet_number,
                                "path": str(img_path),
                                "size_bytes": int(stat.st_size),
                                "mtime": float(stat.st_mtime),
                            }
                        )
                except Exception:
                    pass

            self._render_sheet(c, sheet, img_path)
            c.showPage()

        c.save()
        buffer.seek(0)

        if persist:
            try:
                self._persist_deliverables(
                    pdf_bytes=buffer.getvalue(),
                    sheets=sheets,
                    imagery_used=imagery_used,
                )
            except Exception as exc:
                # Persistence must not break PDF generation; surface via logs and keep response usable.
                print(f"Warning: failed to persist alignment sheets deliverables: {exc}")

        return buffer

    def _safe_segment(self, value: str) -> str:
        try:
            s = str(value)
        except Exception:
            return "default"
        s = s.replace("..", "__").replace("/", "_").replace("\\", "_").strip()
        return s or "default"

    def _persist_deliverables(self, *, pdf_bytes: bytes, sheets: List[SheetData], imagery_used: list[dict]) -> None:
        """
        Persist deliverables artifacts to the project folder.
        """
        import json

        deliverables_dir = self.project_dir / "Deliverables"
        route_seg = self._safe_segment(self.route_name)
        template_seg = self._safe_segment(self.template_id)
        out_dir = deliverables_dir / "alignment_sheets" / route_seg / template_seg
        out_dir.mkdir(parents=True, exist_ok=True)

        # PDF
        pdf_name = f"{self._safe_segment(self.context.project_name)}_{route_seg}_{template_seg}_alignment_sheets.pdf"
        pdf_path = out_dir / pdf_name
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        # sheet_index.json
        sheet_index = []
        for s in sheets:
            sheet_index.append(
                {
                    "sheet_number": s.sheet_number,
                    "total_sheets": s.total_sheets,
                    "start_m": round(float(s.start_m), 2),
                    "end_m": round(float(s.end_m), 2),
                    "kp_start": self.lrs.measure_to_station(float(s.start_m)),
                    "kp_end": self.lrs.measure_to_station(float(s.end_m)),
                    "bbox": {
                        "easting_min": float(s.bbox_easting_min),
                        "easting_max": float(s.bbox_easting_max),
                        "northing_min": float(s.bbox_northing_min),
                        "northing_max": float(s.bbox_northing_max),
                    },
                }
            )
        with open(out_dir / "sheet_index.json", "w", encoding="utf-8") as f:
            json.dump(sheet_index, f, indent=2, ensure_ascii=False)

        # crossings (csv + json)
        with open(out_dir / "crossings.csv", "w", encoding="utf-8") as f:
            f.write(self.get_crossings_register_csv())
        with open(out_dir / "crossings.json", "w", encoding="utf-8") as f:
            json.dump(self.get_crossings_register_json(), f, indent=2, ensure_ascii=False)

        # preview.json (useful for UI + audit)
        preview = {
            "project": self.context.project_name,
            "route": self.route_name,
            "template_id": self.template_id,
            "preset": self.preset,
            "base_map": self.base_map,
            "sheet_length_m": float(self.config.sheet_length_m),
            "h_scale": int(self.config.h_scale),
            "v_scale": int(self.config.v_scale),
            "sheet_count": int(len(sheets)),
            "total_length_m": float(self.route_geom.length),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "imagery_used": imagery_used,
        }
        with open(out_dir / "preview.json", "w", encoding="utf-8") as f:
            json.dump(preview, f, indent=2, ensure_ascii=False)

        # Project-level manifest.json (append-only runs list)
        manifest_path = deliverables_dir / "manifest.json"
        manifest = {}
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
            except Exception:
                manifest = {}
        if not isinstance(manifest, dict):
            manifest = {}

        manifest.setdefault("schema_version", "1.0")
        manifest.setdefault("project", self.context.project_name)
        manifest.setdefault("generator", {"component": "alignment_sheets", "version": "v1"})
        manifest.setdefault("runs", [])

        run_entry = {
            "deliverable_type": "alignment_sheets",
            "template_id": self.template_id,
            "preset": self.preset,
            "base_map": self.base_map,
            "generated_at": preview["generated_at"],
            "output_dir": str(out_dir.relative_to(self.project_dir)),
            "artifacts": [
                str((out_dir / "preview.json").relative_to(out_dir)),
                str((out_dir / "sheet_index.json").relative_to(out_dir)),
                str((out_dir / "crossings.csv").relative_to(out_dir)),
                str((out_dir / pdf_name).relative_to(out_dir)),
            ],
            "inputs": {
                "project_dir": str(self.project_dir),
                "route_path": str(self.route_path) if self.route_path else None,
                "project_metadata": str(self.project_dir / "project_metadata.json"),
                "pipeline_specs": str(self.project_dir / "pipeline_specs.json"),
            },
        }
        try:
            manifest["runs"].append(run_entry)
        except Exception:
            manifest["runs"] = [run_entry]

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

    def _build_crossings_register(self, crossings: List[Crossing]) -> list[dict]:
        """Build a crossings register with stationing suitable for export."""
        out: list[dict] = []
        sheet_len = float(self.config.sheet_length_m) if self.config.sheet_length_m else 0.0
        for c in sorted(crossings, key=lambda x: x.measure_m):
            m = float(c.measure_m)
            sheet_no = int(m // sheet_len) + 1 if sheet_len > 0 else 1
            out.append(
                {
                    "crossing_id": getattr(c, "crossing_id", "") or "",
                    "type": str(c.type),
                    "name": str(c.name),
                    "station_m": round(m, 2),
                    "kp_label": self.lrs.measure_to_station(m),
                    "sheet_number": sheet_no,
                    "width_m": round(float(c.width_m), 2),
                    "angle_deg": round(float(c.angle_deg), 1),
                    "owner": str(getattr(c, "owner", "") or ""),
                }
            )
        return out

    def get_crossings_register_json(self) -> list[dict]:
        """Return the latest in-memory crossings register (generated during `generate()`)."""
        reg = getattr(self, "generated_crossings_register", None)
        return reg if isinstance(reg, list) else []

    def get_crossings_register_csv(self) -> str:
        """Return the latest in-memory crossings register as CSV text."""
        import csv
        import io

        reg = self.get_crossings_register_json()
        output = io.StringIO()
        fieldnames = [
            "crossing_id",
            "type",
            "name",
            "station_m",
            "kp_label",
            "sheet_number",
            "width_m",
            "angle_deg",
            "owner",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in reg:
            if isinstance(row, dict):
                writer.writerow(row)
        return output.getvalue()

    def _cut_sheets(
        self,
        all_crossings: List[Crossing] = None,
        all_protected_areas: List[ProtectedArea] = None,
        all_municipalities: List[MunicipalitySegment] = None,
    ) -> List[SheetData]:
        """Cut route into sheets with all detected features."""
        if all_crossings is None:
            all_crossings = []
        if all_protected_areas is None:
            all_protected_areas = []
        if all_municipalities is None:
            all_municipalities = []

        if substring is None:
            raise RuntimeError("Shapely substring not available.")

        total_len = float(self.route_geom.length)
        sheet_len = float(self.config.sheet_length_m)
        sheets: List[SheetData] = []
        num_sheets = math.ceil(total_len / sheet_len) if sheet_len > 0 else 1

        for i in range(num_sheets):
            start = i * sheet_len
            end = min((i + 1) * sheet_len, total_len)

            segment = substring(self.route_geom, start, end)
            coords = list(segment.coords) if segment else []

            sheet_crossings = [c for c in all_crossings if start <= c.measure_m <= end]
            sheet_protected = [p for p in all_protected_areas if not (p.end_m < start or p.start_m > end)]
            sheet_municipalities = [m for m in all_municipalities if not (m.end_m < start or m.start_m > end)]

            profile_points = self._sample_elevation(start, end)

            pipe_segs = [PipeSegment(start, end, self.context.pipeline_diameter_mm, 12.7, "X70", "FBE")]
            ticks = self.lrs.get_station_ticks(start, end, self.config.station_interval_m)

            xs = [p[0] for p in coords]
            ys = [p[1] for p in coords]
            zs = [p[1] for p in profile_points]

            sheets.append(
                SheetData(
                    sheet_number=i + 1,
                    total_sheets=num_sheets,
                    start_m=start,
                    end_m=end,
                    route_coords=coords,
                    profile_points=profile_points,
                    stations=ticks,
                    crossings=sheet_crossings,
                    pipe_segments=pipe_segs,
                    bbox_easting_min=min(xs) if xs else 0,
                    bbox_easting_max=max(xs) if xs else 0,
                    bbox_northing_min=min(ys) if ys else 0,
                    bbox_northing_max=max(ys) if ys else 0,
                    elevation_min=min(zs) if zs else 0,
                    elevation_max=max(zs) if zs else 100,
                    protected_areas=sheet_protected,
                    municipalities=sheet_municipalities,
                )
            )

        return sheets

    def _detect_bends_for_sheet(
        self,
        sheet: SheetData,
        *,
        angle_threshold_deg: float = 10.0,
        min_spacing_m: float = 50.0,
    ) -> list[dict]:
        """
        Approximate bend detection from polyline vertices.

        This is intentionally conservative (threshold + spacing) to avoid
        flooding FEED tables for high-resolution PIRL routes.
        """
        coords = sheet.route_coords or []
        if len(coords) < 3:
            return []

        # Cumulative distances along the sheet segment (relative)
        cum = [0.0]
        for i in range(1, len(coords)):
            dx = coords[i][0] - coords[i - 1][0]
            dy = coords[i][1] - coords[i - 1][1]
            cum.append(cum[-1] + math.hypot(dx, dy))

        last_kept = -1e9
        bends: list[dict] = []
        for i in range(1, len(coords) - 1):
            ax, ay = coords[i - 1]
            bx, by = coords[i]
            cx, cy = coords[i + 1]

            v1x, v1y = bx - ax, by - ay
            v2x, v2y = cx - bx, cy - by
            n1 = math.hypot(v1x, v1y)
            n2 = math.hypot(v2x, v2y)
            if n1 <= 0 or n2 <= 0:
                continue

            dot = (v1x * v2x + v1y * v2y) / (n1 * n2)
            dot = max(-1.0, min(1.0, dot))
            ang = math.degrees(math.acos(dot))
            if not math.isfinite(ang) or ang < angle_threshold_deg:
                continue

            measure_m = float(sheet.start_m + cum[i])
            if (measure_m - last_kept) < min_spacing_m:
                continue
            last_kept = measure_m

            bend_id = f"BND-{int(round(measure_m)):06d}"
            bends.append(
                {
                    "bend_id": bend_id,
                    "measure_m": measure_m,
                    "kp_label": self.lrs.measure_to_station(measure_m),
                    "deflection_deg": round(float(ang), 1),
                }
            )

        return bends

    def _detect_crossings(self) -> List[Crossing]:
        """Detect infrastructure crossings along route with detailed attributes."""
        if not FIONA_AVAILABLE or shape is None:
            return []

        crossings: List[Crossing] = []
        vectors_dir = self.project_dir / "data" / "vectors" / "processed"

        layers = [
            ("osm_roads", "road", ["name", "highway", "ref", "surface"]),
            ("osm_railways", "railway", ["name", "operator", "gauge", "railway"]),
            ("osm_waterways", "water", ["name", "waterway", "width_m", "width_class"]),
            ("osm_power_lines", "power", ["name", "voltage_kv", "voltage", "operator"]),
            ("pipelines", "pipeline", ["name", "operator", "substance"]),
        ]

        for base_name, c_type, _attr_keys in layers:
            files = list(vectors_dir.glob(f"{base_name}_*.gpkg"))
            if not files:
                continue

            try:
                with fiona.open(files[0]) as src:
                    for feature in src:
                        geom = shape(feature["geometry"])
                        if not self.route_geom.intersects(geom):
                            continue

                        inter = self.route_geom.intersection(geom)
                        if inter.is_empty:
                            continue

                        if inter.geom_type == "Point":
                            pts = [inter]
                        elif inter.geom_type == "MultiPoint":
                            pts = list(inter.geoms)
                        else:
                            pts = [inter.centroid]

                        props = feature.get("properties", {}) or {}

                        if c_type == "road":
                            highway_type = props.get("highway", "")
                            ref = props.get("ref", "")
                            name = props.get("name", "")
                            if ref:
                                display_name = f"{ref} - {name}" if name else ref
                            elif name:
                                display_name = name
                            else:
                                display_name = highway_type.replace("_", " ").title() if highway_type else "Road"
                        elif c_type == "railway":
                            name = props.get("name", "")
                            operator = props.get("operator", "")
                            display_name = name if name else (f"{operator} Railway" if operator else "Railway")
                        elif c_type == "water":
                            name = props.get("name", "")
                            waterway_type = props.get("waterway", "stream")
                            width_class = props.get("width_class", "")
                            if name:
                                display_name = name
                            else:
                                display_name = f"{width_class} {waterway_type}".strip().title() if width_class else waterway_type.title()
                        elif c_type == "power":
                            name = props.get("name", "")
                            voltage_kv = props.get("voltage_kv") or props.get("voltage", "")
                            if voltage_kv:
                                try:
                                    v = float(voltage_kv)
                                    if v > 1000:
                                        v = v / 1000
                                    display_name = f"{int(v)}kV Power Line"
                                except Exception:
                                    display_name = name if name else "Power Line"
                            else:
                                display_name = name if name else "Power Line"
                        else:
                            display_name = props.get("name", "") or c_type.title()

                        width = 10.0
                        if c_type == "water":
                            width = float(props.get("width_m", 5.0) or 5.0)
                        elif c_type == "road":
                            highway = props.get("highway", "")
                            width_map = {
                                "motorway": 30,
                                "trunk": 25,
                                "primary": 20,
                                "secondary": 15,
                                "tertiary": 12,
                                "unclassified": 8,
                            }
                            width = width_map.get(highway, 8)
                        elif c_type == "railway":
                            width = 15.0

                        angle = 90.0
                        try:
                            if geom.geom_type == "LineString":
                                for pt in pts:
                                    proj_dist = geom.project(pt)
                                    if 0.1 < proj_dist < geom.length - 0.1:
                                        p1 = geom.interpolate(proj_dist - 0.1)
                                        p2 = geom.interpolate(proj_dist + 0.1)
                                        cross_angle = math.degrees(math.atan2(p2.y - p1.y, p2.x - p1.x))

                                        route_proj = self.route_geom.project(pt)
                                        r1 = self.route_geom.interpolate(max(0, route_proj - 0.1))
                                        r2 = self.route_geom.interpolate(min(self.route_geom.length, route_proj + 0.1))
                                        route_angle = math.degrees(math.atan2(r2.y - r1.y, r2.x - r1.x))

                                        angle = abs((cross_angle - route_angle + 90) % 180 - 90)
                        except Exception:
                            pass

                        for pt in pts:
                            m = float(self.route_geom.project(pt))
                            crossings.append(
                                Crossing(
                                    measure_m=m,
                                    type=c_type,
                                    name=str(display_name),
                                    width_m=float(width),
                                    angle_deg=float(angle),
                                    owner=str(props.get("operator", "") or ""),
                                )
                            )
            except Exception as e:
                print(f"Error processing {base_name}: {e}")

        crossings.sort(key=lambda x: x.measure_m)

        filtered: List[Crossing] = []
        for c in crossings:
            if not filtered or (c.measure_m - filtered[-1].measure_m) > 15:
                filtered.append(c)
            elif c.type != filtered[-1].type:
                filtered.append(c)

        # Assign stable IDs along the route (used for plan labels + registers).
        for i, c in enumerate(filtered):
            try:
                c.crossing_id = f"CX-{i+1:04d}"
            except Exception:
                # Defensive: Crossing is a dataclass; assignment should work unless frozen.
                pass

        return filtered

    def _detect_protected_areas(self) -> List[ProtectedArea]:
        """Detect protected areas (Natura2000, EUAP) along route."""
        if not FIONA_AVAILABLE or shape is None or Point is None:
            return []

        protected_areas: List[ProtectedArea] = []
        vectors_dir = self.project_dir / "data" / "vectors" / "processed"

        layers = [
            ("natura2000", "natura2000"),
            ("natura2000_sic", "natura2000"),
            ("natura2000_combined", "natura2000"),
            ("euap_protected", "euap"),
        ]

        for base_name, area_type in layers:
            files = list(vectors_dir.glob(f"{base_name}_*.gpkg"))
            if not files:
                continue

            try:
                with fiona.open(files[0]) as src:
                    for feature in src:
                        geom = shape(feature["geometry"])
                        if not self.route_geom.intersects(geom):
                            continue
                        inter = self.route_geom.intersection(geom)
                        if inter.is_empty:
                            continue

                        props = feature.get("properties", {}) or {}
                        name = props.get("name", "") or props.get("SITENAME", "") or "Protected Area"

                        if inter.geom_type == "LineString":
                            start_m = float(self.route_geom.project(Point(inter.coords[0])))
                            end_m = float(self.route_geom.project(Point(inter.coords[-1])))
                        elif inter.geom_type == "MultiLineString":
                            all_points = []
                            for line in inter.geoms:
                                all_points.extend(line.coords)
                            if all_points:
                                start_m = min(float(self.route_geom.project(Point(p))) for p in all_points)
                                end_m = max(float(self.route_geom.project(Point(p))) for p in all_points)
                            else:
                                continue
                        else:
                            start_m = float(self.route_geom.project(inter.centroid))
                            end_m = start_m + 100

                        if start_m > end_m:
                            start_m, end_m = end_m, start_m

                        protected_areas.append(
                            ProtectedArea(
                                start_m=start_m,
                                end_m=end_m,
                                name=str(name),
                                type=area_type,
                                protection_level=str(props.get("protect_class", "") or ""),
                            )
                        )
            except Exception as e:
                print(f"Error processing {base_name}: {e}")

        return protected_areas

    def _detect_municipalities(self) -> List[MunicipalitySegment]:
        """Detect municipality boundaries along route using ISTAT data."""
        if not FIONA_AVAILABLE or shape is None or Point is None:
            return []

        municipalities: List[MunicipalitySegment] = []
        vectors_dir = self.project_dir / "data" / "vectors" / "processed"

        files = list(vectors_dir.glob("istat_boundaries_*.gpkg"))
        if not files:
            return []

        try:
            with fiona.open(files[0]) as src:
                for feature in src:
                    geom = shape(feature["geometry"])
                    if not self.route_geom.intersects(geom):
                        continue
                    inter = self.route_geom.intersection(geom)
                    if inter.is_empty:
                        continue

                    props = feature.get("properties", {}) or {}
                    name = props.get("COMUNE", "") or props.get("name", "") or "Unknown"

                    if inter.geom_type == "LineString":
                        start_m = float(self.route_geom.project(Point(inter.coords[0])))
                        end_m = float(self.route_geom.project(Point(inter.coords[-1])))
                    elif inter.geom_type == "MultiLineString":
                        all_points = []
                        for line in inter.geoms:
                            all_points.extend(line.coords)
                        if all_points:
                            start_m = min(float(self.route_geom.project(Point(p))) for p in all_points)
                            end_m = max(float(self.route_geom.project(Point(p))) for p in all_points)
                        else:
                            continue
                    else:
                        continue

                    if start_m > end_m:
                        start_m, end_m = end_m, start_m

                    municipalities.append(
                        MunicipalitySegment(
                            start_m=start_m,
                            end_m=end_m,
                            name=str(name),
                            province=str(props.get("COD_PROV", "") or ""),
                            region=str(props.get("COD_REG", "") or ""),
                        )
                    )
        except Exception as e:
            print(f"Error processing ISTAT boundaries: {e}")

        municipalities.sort(key=lambda x: x.start_m)
        return municipalities

    def _sample_elevation(self, start_m: float, end_m: float, step: int = 50) -> List[Tuple[float, float]]:
        """Sample elevation from DEM (returns [(measure, elev), ...])."""
        rasters_dir = self.project_dir / "data" / "rasters" / "processed"
        dem_files = list(rasters_dir.glob("dem_*.tif"))
        dem_path = dem_files[0] if dem_files else None

        points: List[Tuple[float, float]] = []
        curr = start_m
        ds = None

        if dem_path and dem_path.exists() and rasterio is not None:
            try:
                ds = rasterio.open(dem_path)
            except Exception:
                ds = None

        while curr <= end_m + 1e-6:
            pt = self.route_geom.interpolate(curr)
            z = 0.0
            if ds is not None and Window is not None:
                try:
                    row, col = ds.index(pt.x, pt.y)
                    val = ds.read(1, window=Window(col, row, 1, 1))[0][0]
                    if val > -9999:
                        z = float(val)
                except Exception:
                    pass
            points.append((float(curr), float(z)))
            curr += step

        if ds is not None:
            try:
                ds.close()
            except Exception:
                pass

        return points

    def _render_sheet(self, c: canvas.Canvas, sheet: SheetData, imagery_path: Optional[Path]):
        """
        Render a single sheet using the selected template.

        - monitoring templates -> current Enbridge-style layout (v0)
        - feed templates -> FEED plan/profile layout (v1, implemented progressively)
        """
        if self.template and (self.template.kind or "").lower() == "feed":
            return self._render_sheet_feed_v1(c, sheet, imagery_path)
        return self._render_sheet_enbridge_v0(c, sheet, imagery_path)

    def _render_sheet_enbridge_v0(self, c: canvas.Canvas, sheet: SheetData, imagery_path: Optional[Path]):
        """Render a single alignment sheet matching current v0 (Enbridge-style) layout."""
        width, height = landscape(A3)
        margin = 8 * mm

        draw_x = margin
        draw_y = margin
        draw_w = width - 2 * margin

        header_h = 8 * mm
        self._render_page_header(c, draw_x, height - margin - header_h, draw_w, header_h, sheet)

        draw_h = height - 2 * margin - header_h

        top_bands_h = 55 * mm
        plan_view_h = draw_h * 0.48
        bottom_bands_h = 55 * mm
        footer_h = 50 * mm

        total_h = top_bands_h + plan_view_h + bottom_bands_h + footer_h
        if total_h > draw_h:
            scale = draw_h / total_h
            top_bands_h *= scale
            plan_view_h *= scale
            bottom_bands_h *= scale
            footer_h *= scale

        y_cursor = draw_y + draw_h

        y_cursor -= top_bands_h
        TopDataBandsRenderer(c, draw_x, y_cursor, draw_w, top_bands_h, sheet, self.config, self.context).render()

        y_cursor -= plan_view_h
        PlanViewBand(c, draw_x, y_cursor, draw_w, plan_view_h, sheet, self.config, imagery_path, self.context).render()

        y_cursor -= bottom_bands_h
        BottomDataBandsRenderer(c, draw_x, y_cursor, draw_w, bottom_bands_h, sheet, self.config, self.context).render()

        y_cursor -= footer_h
        FooterRenderer(c, draw_x, y_cursor, draw_w, footer_h, sheet, self.config, self.context).render()

    def _render_sheet_feed_v1(self, c: canvas.Canvas, sheet: SheetData, imagery_path: Optional[Path]):
        """
        FEED plan/profile sheet layout (v1).

        This is intentionally CAD-like (white background) and is the foundation
        for the full FEED/EPC alignment-sheet package.
        """
        width, height = landscape(A3)
        margin = 10 * mm

        draw_x = margin
        draw_y = margin
        draw_w = width - 2 * margin
        draw_h = height - 2 * margin

        # Header (simple for now; title block work lands in later todos)
        header_h = 10 * mm
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.8)
        c.rect(draw_x, draw_y + draw_h - header_h, draw_w, header_h, fill=0, stroke=1)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(draw_x + 3 * mm, draw_y + draw_h - 7 * mm, f"ALIGNMENT SHEET (FEED) — {self.context.project_name}")
        c.setFont("Helvetica", 8)
        c.drawRightString(draw_x + draw_w - 3 * mm, draw_y + draw_h - 7 * mm, f"SHEET {sheet.sheet_number} OF {sheet.total_sheets}")

        y_cursor = draw_y + draw_h - header_h

        # Bands: Plan (top), Profile (middle), Tables (bottom) — placeholders refined in later todos.
        plan_h = (draw_h - header_h) * 0.55
        profile_h = (draw_h - header_h) * 0.25
        tables_h = (draw_h - header_h) - plan_h - profile_h

        # Plan band
        y_cursor -= plan_h
        row_width_m = 30.0
        if self.template and isinstance(self.template.defaults, dict):
            try:
                row_width_m = float(self.template.defaults.get("row_width_m", row_width_m))
            except Exception:
                row_width_m = 30.0
        FeedPlanViewBand(
            c,
            draw_x,
            y_cursor,
            draw_w,
            plan_h,
            sheet,
            self.config,
            self.context,
            imagery_path=imagery_path,
            row_width_m=row_width_m,
            full_route_geom=self.route_geom,
        ).render()

        # Profile band
        y_cursor -= profile_h
        FeedProfileViewBand(
            c,
            draw_x,
            y_cursor,
            draw_w,
            profile_h,
            sheet,
            self.config,
            self.context,
        ).render()

        # Tables band (crossings/bends/specs)
        y_cursor -= tables_h
        bends = self._detect_bends_for_sheet(sheet)
        FeedTablesBand(
            c,
            draw_x,
            y_cursor,
            draw_w,
            tables_h,
            sheet,
            self.config,
            self.context,
            bends=bends,
        ).render()

    def _render_page_header(self, c: canvas.Canvas, x: float, y: float, w: float, h: float, sheet: SheetData):
        from reportlab.lib import colors

        start_kp = int(sheet.start_m / 1000)
        end_kp = int(sheet.end_m / 1000)

        sheet_set = (sheet.sheet_number - 1) // 2 + 1
        page_in_set = ((sheet.sheet_number - 1) % 2) + 1
        total_pages_in_set = 2

        header_text = (
            f"Alignment Sheets {sheet_set:02d} - KP {start_kp} to KP {end_kp} - "
            f"{self.context.project_name} Page {page_in_set} of {total_pages_in_set}"
        )

        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawRightString(x + w, y + h / 2, header_text)

        c.setStrokeColor(colors.Color(0.7, 0.7, 0.7))
        c.setLineWidth(0.5)
        c.line(x, y, x + w, y)


