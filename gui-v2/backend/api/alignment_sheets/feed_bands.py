"""
FEED / EPC Plan+Profile alignment-sheet renderers.

Goal: produce CAD-like engineering alignment sheets (plan + profile + tables),
not monitoring-style photomosaic bands.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from .bands import BandRenderer
from .models import ProjectContext, SheetConfig, SheetData

try:
    import rasterio
    RASTERIO_AVAILABLE = True
except ImportError:  # pragma: no cover
    rasterio = None  # type: ignore
    RASTERIO_AVAILABLE = False

try:
    from shapely.geometry import LineString
except ImportError:  # pragma: no cover
    LineString = None  # type: ignore


def _format_kp(measure_m: float) -> str:
    km = int(measure_m // 1000)
    m = measure_m % 1000
    return f"KP {km}+{m:03.0f}"


class FeedPlanViewBand(BandRenderer):
    """
    FEED plan view:
    - Engineering-style (white background) with optional imagery base
    - Centerline + ROW limits
    - Station ticks + labels
    - Crossings symbols + IDs
    - Coordinate corners, north arrow, scale bar
    - Key map inset
    """

    def __init__(
        self,
        c: canvas.Canvas,
        x: float,
        y: float,
        w: float,
        h: float,
        sheet: SheetData,
        config: SheetConfig,
        context: ProjectContext,
        *,
        imagery_path: Optional[Path] = None,
        row_width_m: float = 30.0,
        full_route_geom=None,
    ):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context
        self.imagery_path = imagery_path
        self.row_width_m = float(row_width_m) if row_width_m and row_width_m > 0 else 30.0
        self.full_route_geom = full_route_geom

    def render(self):
        c = self.c

        # Background + border
        c.setFillColor(colors.white)
        c.rect(self.x, self.y, self.w, self.h, fill=1, stroke=0)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.rect(self.x, self.y, self.w, self.h, fill=0, stroke=1)

        if not self.sheet.route_coords:
            self._draw_placeholder("No route geometry")
            return

        # Transform so the sheet segment is roughly horizontal and scaled by h_scale.
        p_start = self.sheet.route_coords[0]
        p_end = self.sheet.route_coords[-1]
        dx = p_end[0] - p_start[0]
        dy = p_end[1] - p_start[1]
        self.route_angle = math.degrees(math.atan2(dy, dx))

        cx = self.x + self.w / 2
        cy = self.y + self.h / 2
        rcx = (self.sheet.bbox_easting_min + self.sheet.bbox_easting_max) / 2
        rcy = (self.sheet.bbox_northing_min + self.sheet.bbox_northing_max) / 2
        points_per_meter = self._get_h_scale_pts()

        c.saveState()

        # Clip
        path = c.beginPath()
        path.rect(self.x, self.y, self.w, self.h)
        c.clipPath(path, stroke=0)

        # World->screen: center, rotate, scale
        c.translate(cx, cy)
        c.rotate(-self.route_angle)
        c.scale(points_per_meter, points_per_meter)
        c.translate(-rcx, -rcy)

        # Optional imagery (underlay)
        if self.imagery_path and self.imagery_path.exists() and RASTERIO_AVAILABLE:
            self._draw_imagery(c)

        # ROW limits
        self._draw_row_limits(c, points_per_meter)

        # Centerline
        self._draw_centerline(c, points_per_meter)

        # Crossings (symbols + IDs)
        self._draw_crossings(c, points_per_meter)

        # Station ticks
        self._draw_station_ticks(c, points_per_meter)

        c.restoreState()

        # Screen-space overlays
        self._draw_match_lines()
        self._draw_corner_coords()
        self._draw_scale_bar()
        self._draw_north_arrow()
        self._draw_key_map()

    def _draw_placeholder(self, msg: str):
        c = self.c
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.black)
        c.drawCentredString(self.x + self.w / 2, self.y + self.h / 2, msg)

    def _draw_imagery(self, c: canvas.Canvas):
        try:
            from reportlab.lib.utils import ImageReader

            with rasterio.open(self.imagery_path) as src:
                min_x, min_y, max_x, max_y = src.bounds
                w = max_x - min_x
                h = max_y - min_y
                img = ImageReader(str(self.imagery_path))
                c.drawImage(img, min_x, min_y, width=w, height=h, mask="auto")
        except Exception:
            # Imagery must never be fatal for FEED sheets; treat as optional.
            return

    def _draw_centerline(self, c: canvas.Canvas, ppm: float):
        c.setStrokeColor(colors.Color(0.8, 0.0, 0.0))
        c.setLineWidth(2.0 / ppm)
        path = c.beginPath()
        path.moveTo(*self.sheet.route_coords[0])
        for pt in self.sheet.route_coords[1:]:
            path.lineTo(*pt)
        c.drawPath(path, stroke=1, fill=0)

    def _draw_row_limits(self, c: canvas.Canvas, ppm: float):
        if LineString is None:
            return
        try:
            line = LineString(self.sheet.route_coords)
            buf = line.buffer(self.row_width_m / 2.0, cap_style=2, join_style=2)
            if buf.is_empty:
                return
            c.setStrokeColor(colors.Color(0.2, 0.2, 0.2))
            c.setLineWidth(0.8 / ppm)
            c.setDash([6 / ppm, 4 / ppm])
            ext = buf.exterior.coords
            path = c.beginPath()
            first = True
            for x, y in ext:
                if first:
                    path.moveTo(x, y)
                    first = False
                else:
                    path.lineTo(x, y)
            c.drawPath(path, stroke=1, fill=0)
            c.setDash([])
        except Exception:
            return

    def _get_point_at_measure(self, measure: float):
        coords = self.sheet.route_coords
        if not coords or len(coords) < 2:
            return None
        cumulative = [0.0]
        for i in range(1, len(coords)):
            dx = coords[i][0] - coords[i - 1][0]
            dy = coords[i][1] - coords[i - 1][1]
            cumulative.append(cumulative[-1] + math.hypot(dx, dy))
        total_len = cumulative[-1]
        if total_len <= 0:
            return coords[0]
        target = float(measure - self.sheet.start_m)
        target = max(0.0, min(target, total_len))
        for i in range(1, len(cumulative)):
            if cumulative[i] >= target:
                seg_start = cumulative[i - 1]
                seg_len = cumulative[i] - seg_start
                if seg_len <= 0:
                    return coords[i - 1]
                t = (target - seg_start) / seg_len
                x = coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0])
                y = coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])
                return (x, y)
        return coords[-1]

    def _draw_station_ticks(self, c: canvas.Canvas, ppm: float):
        if not getattr(self.sheet, "stations", None):
            return

        tick_len = 10 / ppm
        font_size = 7 / ppm

        for measure, label in self.sheet.stations:
            try:
                m = float(measure)
            except Exception:
                continue
            if m < self.sheet.start_m or m > self.sheet.end_m:
                continue
            pt = self._get_point_at_measure(m)
            if not pt:
                continue

            # Tick mark (vertical in rotated coordinate system)
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.6 / ppm)
            c.line(pt[0], pt[1] - tick_len, pt[0], pt[1] + tick_len)

            # Label (upright)
            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)
            c.setFont("Helvetica", font_size)
            c.setFillColor(colors.black)
            c.drawCentredString(0, tick_len + (2 / ppm), str(label))
            c.restoreState()

    def _draw_crossings(self, c: canvas.Canvas, ppm: float):
        for crossing in self.sheet.crossings:
            pt = self._get_point_at_measure(crossing.measure_m)
            if not pt:
                continue

            symbol = 12 / ppm
            c.setStrokeColor(colors.black)
            c.setLineWidth(1.0 / ppm)
            # Simple symbol: short perpendicular line
            c.line(pt[0], pt[1] - symbol, pt[0], pt[1] + symbol)

            # ID label
            cid = getattr(crossing, "crossing_id", "") or "CX"
            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)
            c.setFont("Helvetica-Bold", 7 / ppm)
            c.setFillColor(colors.black)
            c.drawCentredString(0, -symbol - (6 / ppm), cid)
            c.restoreState()

    def _draw_match_lines(self):
        c = self.c
        c.saveState()
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.setDash([6, 4])
        # left
        if self.sheet.sheet_number > 1:
            x_left = self.x + 6 * mm
            c.line(x_left, self.y + 4 * mm, x_left, self.y + self.h - 4 * mm)
        # right
        if self.sheet.sheet_number < self.sheet.total_sheets:
            x_right = self.x + self.w - 6 * mm
            c.line(x_right, self.y + 4 * mm, x_right, self.y + self.h - 4 * mm)
        c.restoreState()

    def _draw_corner_coords(self):
        c = self.c
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.black)
        tl = (self.sheet.bbox_easting_min, self.sheet.bbox_northing_max)
        tr = (self.sheet.bbox_easting_max, self.sheet.bbox_northing_max)
        bl = (self.sheet.bbox_easting_min, self.sheet.bbox_northing_min)
        br = (self.sheet.bbox_easting_max, self.sheet.bbox_northing_min)
        fmt = lambda p: f"E {p[0]:.0f}  N {p[1]:.0f}"
        c.drawString(self.x + 2 * mm, self.y + self.h - 7 * mm, fmt(tl))
        c.drawRightString(self.x + self.w - 2 * mm, self.y + self.h - 7 * mm, fmt(tr))
        c.drawString(self.x + 2 * mm, self.y + 2 * mm, fmt(bl))
        c.drawRightString(self.x + self.w - 2 * mm, self.y + 2 * mm, fmt(br))

    def _draw_scale_bar(self):
        c = self.c
        # Small scale bar in bottom-left
        x = self.x + 8 * mm
        y = self.y + 10 * mm
        w = 50 * mm
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.line(x, y, x + w, y)
        c.line(x, y - 2, x, y + 2)
        c.line(x + w, y - 2, x + w, y + 2)
        c.setFont("Helvetica", 6)
        c.drawString(x, y + 3, f"Scale 1:{self.config.h_scale}")

    def _draw_north_arrow(self):
        c = self.c
        x = self.x + self.w - 16 * mm
        y = self.y + self.h - 18 * mm
        c.saveState()
        c.translate(x, y)
        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(1)
        c.line(0, -6 * mm, 0, 6 * mm)
        path = c.beginPath()
        path.moveTo(0, 6 * mm)
        path.lineTo(-2.2 * mm, 2.5 * mm)
        path.lineTo(2.2 * mm, 2.5 * mm)
        path.close()
        c.drawPath(path, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(0, 7.5 * mm, "N")
        c.restoreState()

    def _draw_key_map(self):
        if self.full_route_geom is None:
            return
        try:
            geom = self.full_route_geom
            minx, miny, maxx, maxy = geom.bounds
            # Inset box
            inset_w = 45 * mm
            inset_h = 25 * mm
            x0 = self.x + self.w - inset_w - 8 * mm
            y0 = self.y + 8 * mm
            c = self.c
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.6)
            c.rect(x0, y0, inset_w, inset_h, fill=1, stroke=1)

            pad = 0.05
            dx = maxx - minx
            dy = maxy - miny
            if dx <= 0 or dy <= 0:
                return
            minx -= dx * pad
            maxx += dx * pad
            miny -= dy * pad
            maxy += dy * pad
            dx = maxx - minx
            dy = maxy - miny

            def map_xy(x, y):
                fx = (x - minx) / dx
                fy = (y - miny) / dy
                return (x0 + fx * inset_w, y0 + fy * inset_h)

            # Draw full route (grey)
            c.setStrokeColor(colors.Color(0.6, 0.6, 0.6))
            c.setLineWidth(0.8)
            path = c.beginPath()
            coords = list(geom.coords) if hasattr(geom, "coords") else []
            if coords:
                sx, sy = map_xy(coords[0][0], coords[0][1])
                path.moveTo(sx, sy)
                for px, py in coords[1:]:
                    mx, my = map_xy(px, py)
                    path.lineTo(mx, my)
                c.drawPath(path, stroke=1, fill=0)

            # Highlight current sheet segment (red, approximate using bbox)
            c.setStrokeColor(colors.Color(0.8, 0.0, 0.0))
            c.setLineWidth(1.2)
            bx0, by0 = map_xy(self.sheet.bbox_easting_min, self.sheet.bbox_northing_min)
            bx1, by1 = map_xy(self.sheet.bbox_easting_max, self.sheet.bbox_northing_max)
            c.rect(min(bx0, bx1), min(by0, by1), abs(bx1 - bx0), abs(by1 - by0), fill=0, stroke=1)
        except Exception:
            return


class FeedProfileViewBand(BandRenderer):
    """
    FEED profile view:
    - Ground profile sampled from DEM
    - Pipe profile derived from depth of cover + diameter (TOP/INV)
    - Station ticks, basic slope/high-low annotation, scale labels
    """

    def __init__(
        self,
        c: canvas.Canvas,
        x: float,
        y: float,
        w: float,
        h: float,
        sheet: SheetData,
        config: SheetConfig,
        context: ProjectContext,
    ):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context

    def render(self):
        c = self.c

        # Background + border
        c.setFillColor(colors.white)
        c.rect(self.x, self.y, self.w, self.h, fill=1, stroke=0)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.rect(self.x, self.y, self.w, self.h, fill=0, stroke=1)

        pts = [(float(m), float(z)) for (m, z) in (self.sheet.profile_points or []) if m is not None and z is not None]
        if len(pts) < 2:
            self._placeholder("DEM/profile unavailable")
            return

        start_m = float(self.sheet.start_m)
        end_m = float(self.sheet.end_m)
        length_m = max(1.0, end_m - start_m)

        # Plot box margins
        left = self.x + 10 * mm
        right = self.x + self.w - 10 * mm
        bottom = self.y + 8 * mm
        top = self.y + self.h - 10 * mm
        plot_w = max(1.0, right - left)
        plot_h = max(1.0, top - bottom)

        elevs = [z for _, z in pts]
        e_min = min(elevs)
        e_max = max(elevs)
        if e_max - e_min < 0.01:
            e_max = e_min + 1.0

        def x_of(m: float) -> float:
            return left + ((m - start_m) / length_m) * plot_w

        def y_of(e: float) -> float:
            return bottom + ((e_max - e) / (e_max - e_min)) * plot_h

        # Axes baseline
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.6)
        c.line(left, bottom, right, bottom)

        # Vertical gridlines for station ticks
        if getattr(self.sheet, "stations", None):
            c.setFont("Helvetica", 6)
            for m, label in self.sheet.stations:
                try:
                    mm_ = float(m)
                except Exception:
                    continue
                if mm_ < start_m or mm_ > end_m:
                    continue
                x = x_of(mm_)
                c.setStrokeColor(colors.Color(0.85, 0.85, 0.85))
                c.setLineWidth(0.5)
                c.line(x, bottom, x, top)
                c.setFillColor(colors.black)
                c.setFont("Helvetica", 6)
                c.drawCentredString(x, bottom - 6, str(label))

        # Ground profile
        c.setStrokeColor(colors.black)
        c.setLineWidth(1.2)
        path = c.beginPath()
        first = True
        for m, z in pts:
            x = x_of(m)
            y = y_of(z)
            if first:
                path.moveTo(x, y)
                first = False
            else:
                path.lineTo(x, y)
        c.drawPath(path, stroke=1, fill=0)

        # Pipe profiles
        doc = float(getattr(self.context, "depth_of_cover_m", 1.5) or 1.5)
        d_m = float(getattr(self.context, "pipeline_diameter_mm", 600) or 600) / 1000.0
        top_pipe = [z - doc for _, z in pts]
        inv_pipe = [tp - d_m for tp in top_pipe]

        def draw_profile(values, stroke_color):
            c.setStrokeColor(stroke_color)
            c.setLineWidth(1.0)
            p = c.beginPath()
            first2 = True
            for (m, _z), v in zip(pts, values):
                x = x_of(m)
                y = y_of(v)
                if first2:
                    p.moveTo(x, y)
                    first2 = False
                else:
                    p.lineTo(x, y)
            c.drawPath(p, stroke=1, fill=0)

        draw_profile(top_pipe, colors.Color(0.8, 0.0, 0.0))   # Top of pipe (red)
        draw_profile(inv_pipe, colors.Color(0.1, 0.3, 0.8))   # Invert (blue)

        # High/Low points on ground
        idx_max = max(range(len(elevs)), key=lambda i: elevs[i])
        idx_min = min(range(len(elevs)), key=lambda i: elevs[i])
        for tag, idx, col in (("HP", idx_max, colors.Color(0.0, 0.5, 0.0)), ("LP", idx_min, colors.Color(0.6, 0.0, 0.0))):
            m, z = pts[idx]
            x = x_of(m)
            y = y_of(z)
            c.setFillColor(col)
            c.circle(x, y, 2.2, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(colors.black)
            c.drawString(x + 4, y + 2, f"{tag} { _format_kp(m) }")

        # Slope annotation (max abs slope)
        max_slope = 0.0
        max_seg = None
        for (m1, z1), (m2, z2) in zip(pts, pts[1:]):
            d = m2 - m1
            if d <= 0:
                continue
            s = ((z2 - z1) / d) * 100.0
            if abs(s) > abs(max_slope):
                max_slope = s
                max_seg = (m1, z1, m2, z2)
        if max_seg:
            m1, z1, m2, z2 = max_seg
            xm = x_of((m1 + m2) / 2)
            ym = y_of((z1 + z2) / 2)
            c.setFont("Helvetica", 7)
            c.setFillColor(colors.black)
            c.drawString(xm + 3, ym + 3, f"Max slope ~ {max_slope:.1f}%")

        # Scale labels / vertical exaggeration
        try:
            ve = float(self.config.h_scale) / float(self.config.v_scale) if self.config.v_scale else 1.0
        except Exception:
            ve = 1.0
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.black)
        c.drawRightString(right, top + 2, f"H 1:{self.config.h_scale}   V 1:{self.config.v_scale}   VE {ve:.1f}x")

        # Legend
        lx = left
        ly = top + 2
        c.setLineWidth(1.2)
        c.setStrokeColor(colors.black)
        c.line(lx, ly, lx + 18, ly)
        c.setFont("Helvetica", 7)
        c.setFillColor(colors.black)
        c.drawString(lx + 22, ly - 2, "Ground")
        lx += 90
        c.setStrokeColor(colors.Color(0.8, 0.0, 0.0))
        c.line(lx, ly, lx + 18, ly)
        c.setFillColor(colors.black)
        c.drawString(lx + 22, ly - 2, "Top of Pipe")
        lx += 110
        c.setStrokeColor(colors.Color(0.1, 0.3, 0.8))
        c.line(lx, ly, lx + 18, ly)
        c.setFillColor(colors.black)
        c.drawString(lx + 22, ly - 2, "Invert")

    def _placeholder(self, msg: str):
        c = self.c
        c.setFont("Helvetica-Oblique", 8)
        c.setFillColor(colors.black)
        c.drawCentredString(self.x + self.w / 2, self.y + self.h / 2, msg)


class FeedTablesBand(BandRenderer):
    """
    FEED tables band:
    - Crossings table (sheet-local)
    - Bends table (sheet-local)
    - Pipe specs block (sheet-local)
    """

    def __init__(
        self,
        c: canvas.Canvas,
        x: float,
        y: float,
        w: float,
        h: float,
        sheet: SheetData,
        config: SheetConfig,
        context: ProjectContext,
        *,
        bends: list[dict] | None = None,
    ):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context
        self.bends = bends or []

    def render(self):
        c = self.c

        # Background + border
        c.setFillColor(colors.white)
        c.rect(self.x, self.y, self.w, self.h, fill=1, stroke=0)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.8)
        c.rect(self.x, self.y, self.w, self.h, fill=0, stroke=1)

        # Layout: crossings (top), bends+pipe specs (bottom split)
        crossings_h = self.h * 0.6
        bottom_h = self.h - crossings_h

        self._render_crossings_table(self.x, self.y + bottom_h, self.w, crossings_h)
        self._render_bends_and_pipe_specs(self.x, self.y, self.w, bottom_h)

    def _render_crossings_table(self, x: float, y: float, w: float, h: float):
        rows = [["ID", "Type", "Name", "Station", "Width(m)", "Angle", "Owner"]]
        crossings = sorted(self.sheet.crossings, key=lambda c: c.measure_m)
        max_rows = max(4, int(h / (6.5 * mm)))  # rough cap based on height
        for c in crossings[: max_rows - 1]:
            rows.append(
                [
                    getattr(c, "crossing_id", "") or "",
                    str(c.type),
                    (str(c.name) or "")[:32],
                    _format_kp(float(c.measure_m)),
                    f"{float(c.width_m):.1f}",
                    f"{float(c.angle_deg):.0f}°",
                    (str(c.owner) or "")[:18],
                ]
            )
        if len(crossings) > (max_rows - 1):
            rows.append(["…", "", f"+{len(crossings) - (max_rows - 1)} more", "", "", "", ""])

        col_widths = [0.10 * w, 0.12 * w, 0.30 * w, 0.16 * w, 0.10 * w, 0.08 * w, 0.14 * w]
        table = Table(rows, colWidths=col_widths, rowHeights=None)
        style = TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.93, 0.93, 0.93)),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
            ]
        )
        table.setStyle(style)

        # Title
        c = self.c
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawString(x + 2 * mm, y + h - 8, "CROSSINGS (Sheet)")

        table_w, table_h = table.wrapOn(c, w - 4 * mm, h - 10)
        table.drawOn(c, x + 2 * mm, y + 2 * mm)

    def _render_bends_and_pipe_specs(self, x: float, y: float, w: float, h: float):
        if h <= 8:
            return
        split = 0.55
        bends_w = w * split
        specs_w = w - bends_w

        self._render_bends_table(x, y, bends_w, h)
        self._render_pipe_specs_block(x + bends_w, y, specs_w, h)

    def _render_bends_table(self, x: float, y: float, w: float, h: float):
        rows = [["ID", "Station", "Defl."]]
        bends = self.bends
        max_rows = max(3, int(h / (6.5 * mm)))
        for b in bends[: max_rows - 1]:
            rows.append(
                [
                    str(b.get("bend_id", "")),
                    str(b.get("kp_label", "")),
                    f"{float(b.get('deflection_deg', 0.0)):.1f}°",
                ]
            )
        if len(bends) > (max_rows - 1):
            rows.append(["…", f"+{len(bends) - (max_rows - 1)} more", ""])

        col_widths = [0.30 * w, 0.45 * w, 0.25 * w]
        table = Table(rows, colWidths=col_widths)
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 6),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.93, 0.93, 0.93)),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 1),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ]
            )
        )
        c = self.c
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawString(x + 2 * mm, y + h - 8, "BENDS (Sheet)")
        table.wrapOn(c, w - 4 * mm, h - 10)
        table.drawOn(c, x + 2 * mm, y + 2 * mm)

    def _render_pipe_specs_block(self, x: float, y: float, w: float, h: float):
        c = self.c
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawString(x + 2 * mm, y + h - 8, "PIPE SPECS (Sheet)")

        dia = float(getattr(self.context, "pipeline_diameter_mm", 0.0) or 0.0)
        wt = float(getattr(self.context, "pipeline_wall_thickness_mm", 0.0) or 0.0)
        mat = str(getattr(self.context, "pipeline_material", "") or "")
        ptype = str(getattr(self.context, "pipeline_type", "") or "")
        doc = float(getattr(self.context, "depth_of_cover_m", 0.0) or 0.0)
        grade = str(getattr(self.context, "pipeline_grade", "") or "")
        coat = str(getattr(self.context, "pipeline_coating", "") or "")

        rows = [
            ["Diameter (mm)", f"{dia:.1f}" if dia else ""],
            ["Wall thickness (mm)", f"{wt:.1f}" if wt else ""],
            ["Material", mat],
            ["Service", ptype],
            ["Depth of cover (m)", f"{doc:.2f}" if doc else ""],
            ["Grade", grade],
            ["Coating", coat],
        ]

        table = Table(rows, colWidths=[0.55 * w, 0.45 * w])
        table.setStyle(
            TableStyle(
                [
                    ("FONTSIZE", (0, 0), (-1, -1), 6),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
                    ("BACKGROUND", (0, 0), (0, -1), colors.Color(0.95, 0.95, 0.95)),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 1),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                ]
            )
        )
        table.wrapOn(c, w - 4 * mm, h - 10)
        table.drawOn(c, x + 2 * mm, y + 2 * mm)


