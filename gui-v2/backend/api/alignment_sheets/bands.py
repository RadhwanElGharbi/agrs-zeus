"""
Professional Alignment Sheet Band Renderers
Matching Enbridge Post-Construction Environmental Monitoring Alignment Sheet Format
"""
import math
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm, cm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle
from reportlab.lib.utils import ImageReader

from .models import SheetData, ProjectContext, SheetConfig, PipeSegment, Crossing

try:
    import rasterio
    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False


# Professional color scheme matching Enbridge standards
COLORS = {
    'border': colors.black,
    'grid': colors.Color(0.8, 0.8, 0.8),
    'route': colors.Color(0.8, 0.0, 0.0),  # Red pipeline
    'route_outline': colors.white,
    'existing_pipeline': colors.Color(0.4, 0.4, 0.4),  # Gray for existing
    'station_box': colors.white,
    'station_text': colors.black,
    'match_line': colors.black,
    'header_bg': colors.Color(0.95, 0.95, 0.95),
    'label_bg': colors.Color(0.92, 0.92, 0.92),
    'title_bg': colors.Color(0.15, 0.15, 0.35),  # Dark blue
    'title_text': colors.white,
    'crossing_road': colors.Color(0.5, 0.35, 0.2),
    'crossing_water': colors.Color(0.2, 0.4, 0.7),
    'crossing_rail': colors.Color(0.3, 0.3, 0.3),
    'crossing_power': colors.Color(0.6, 0.2, 0.6),
    'soil_annotation': colors.Color(0.0, 0.0, 0.0),
    'indian_reserve': colors.Color(0.9, 0.85, 0.7),
    'park_area': colors.Color(0.7, 0.9, 0.7),
}


class BandRenderer:
    """Base class for rendering horizontal bands."""
    def __init__(self, c: canvas.Canvas, x: float, y: float, w: float, h: float,
                 sheet: SheetData, config: SheetConfig):
        self.c = c
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.sheet = sheet
        self.config = config

    def render(self):
        """Draw border."""
        self.c.setStrokeColor(COLORS['border'])
        self.c.setLineWidth(0.5)
        self.c.rect(self.x, self.y, self.w, self.h)

    def _get_h_scale_pts(self) -> float:
        """Get horizontal scale in points per meter."""
        return (1000 / self.config.h_scale) * (72 / 25.4)

    def _measure_to_x(self, measure: float) -> float:
        """Convert route measure to x position."""
        h_scale_pts = self._get_h_scale_pts()
        rel_m = measure - self.sheet.start_m
        return self.x + 35*mm + rel_m * h_scale_pts


class TopDataBandsRenderer(BandRenderer):
    """
    Renders the top data bands (Environmental Protection Plan - Regulatory Application).
    Matches Enbridge format with multiple thin horizontal rows:
    - MUNICIPAL AUTHORITY
    - OWNERSHIP
    - RIGHT-OF-WAY WIDTH / TEMPORARY WORK SPACE (TWS)
    - SEED MIX
    - TOPSOIL SALVAGE (PROCEDURE, DEPTH)
    - ENVIRONMENTAL PROTECTION MEASURES (SEE LEGEND)
    - ENVIRONMENTAL ISSUES
    - LAND USE
    """
    def __init__(self, c, x, y, w, h, sheet, config, context: ProjectContext):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context
        self.label_width = 45*mm

        # Define the rows (matching reference exactly) with sub-labels
        self.rows = [
            ("MUNICIPAL AUTHORITY", None, self._get_municipal_data),
            ("OWNERSHIP", None, self._get_ownership_data),
            ("RIGHT-OF-WAY WIDTH /\nTEMPORARY WORK SPACE (TWS)", None, self._get_row_width_data),
            ("SEED MIX", None, self._get_seed_mix_data),
            ("TOPSOIL\nSALVAGE", "PROCEDURE", self._get_topsoil_procedure_data),
            ("", "DEPTH (cm)", self._get_topsoil_depth_data),
            ("ENVIRONMENTAL PROTECTION PLAN\n(REGULATORY APPLICATION)", "ENVIRONMENTAL\nPROTECTION\nMEASURES\n(SEE LEGEND)", self._get_env_protection_data),
            ("", "ENVIRONMENTAL\nISSUES", self._get_env_issues_data),
            ("", "LAND USE", self._get_land_use_data),
        ]

    def render(self):
        c = self.c
        num_rows = len(self.rows)
        row_height = self.h / num_rows

        # Draw section header on far left
        header_width = 8*mm
        c.saveState()
        c.setFillColor(COLORS['label_bg'])
        c.rect(self.x, self.y, header_width, self.h, fill=1, stroke=1)

        # Vertical text for section header
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 5)
        c.saveState()
        c.translate(self.x + header_width/2 - 1*mm, self.y + self.h/2)
        c.rotate(90)
        c.drawCentredString(0, 0, "ENVIRONMENTAL PROTECTION PLAN")
        c.restoreState()

        c.saveState()
        c.translate(self.x + header_width/2 + 2*mm, self.y + self.h/2)
        c.rotate(90)
        c.drawCentredString(0, 0, "(REGULATORY APPLICATION)")
        c.restoreState()
        c.restoreState()

        # Draw each row
        content_x = self.x + header_width
        content_w = self.w - header_width

        for i, (main_label, sub_label, data_func) in enumerate(self.rows):
            row_y = self.y + self.h - (i + 1) * row_height
            self._render_data_row(content_x, row_y, content_w, row_height,
                                  main_label, sub_label, data_func())

        # Draw outer border
        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(1)
        c.rect(self.x, self.y, self.w, self.h)

    def _render_data_row(self, x: float, y: float, w: float, h: float,
                         main_label: str, sub_label: str, data_segments: List[Dict]):
        """Render a single data row with label and bracket data."""
        c = self.c
        main_label_width = 35*mm
        sub_label_width = 25*mm if sub_label else 0
        total_label_width = main_label_width + sub_label_width

        # Draw main label cell
        if main_label:
            c.setStrokeColor(COLORS['border'])
            c.setLineWidth(0.3)
            c.setFillColor(COLORS['label_bg'])
            c.rect(x, y, main_label_width, h, fill=1, stroke=1)

            # Label text
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 5)
            lines = main_label.split('\n')
            line_height = 5
            start_y = y + h/2 + (len(lines) - 1) * line_height / 2
            for j, line in enumerate(lines):
                c.drawCentredString(x + main_label_width/2, start_y - j * line_height, line)
        else:
            # Just draw border for continuation row
            c.setStrokeColor(COLORS['border'])
            c.setLineWidth(0.3)
            c.rect(x, y, main_label_width, h, fill=0, stroke=1)

        # Draw sub-label cell if present
        if sub_label:
            c.setFillColor(COLORS['label_bg'])
            c.rect(x + main_label_width, y, sub_label_width, h, fill=1, stroke=1)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 5)
            lines = sub_label.split('\n')
            line_height = 5
            start_y = y + h/2 + (len(lines) - 1) * line_height / 2
            for j, line in enumerate(lines):
                c.drawCentredString(x + main_label_width + sub_label_width/2,
                                   start_y - j * line_height, line)

        # Draw data area
        data_x = x + total_label_width
        data_w = w - total_label_width
        c.setFillColor(colors.white)
        c.rect(data_x, y, data_w, h, fill=1, stroke=1)

        # Draw bracket data
        self._draw_bracket_data(data_x, y, data_w, h, data_segments)

    def _draw_bracket_data(self, x: float, y: float, w: float, h: float,
                           segments: List[Dict]):
        """Draw bracketed data segments matching Enbridge reference format.

        The reference shows:
        - Horizontal line at top
        - Vertical ticks at segment boundaries going DOWN
        - Label text centered below the bracket line
        - Multiple adjacent brackets for different values
        """
        c = self.c
        sheet_start = self.sheet.start_m
        sheet_end = self.sheet.end_m
        sheet_length = sheet_end - sheet_start

        for seg in segments:
            start_m = max(seg.get('start_m', sheet_start), sheet_start)
            end_m = min(seg.get('end_m', sheet_end), sheet_end)

            if start_m >= end_m:
                continue

            # Calculate x positions relative to data area
            x_start = x + ((start_m - sheet_start) / sheet_length) * w
            x_end = x + ((end_m - sheet_start) / sheet_length) * w

            # Ensure minimum visible width for label
            min_width = 12
            if x_end - x_start < min_width:
                mid = (x_start + x_end) / 2
                x_start = mid - min_width/2
                x_end = mid + min_width/2

            label = seg.get('label', '')
            if not label:
                continue

            # Draw bracket - matching reference style
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.4)

            bracket_top = y + h - 1.5*mm
            tick_len = 1.5*mm

            # Horizontal line at top of bracket
            c.line(x_start, bracket_top, x_end, bracket_top)
            # Vertical ticks at ends (going down)
            c.line(x_start, bracket_top, x_start, bracket_top - tick_len)
            c.line(x_end, bracket_top, x_end, bracket_top - tick_len)

            # Label text centered below bracket
            c.setFont("Helvetica", 4.5)
            c.setFillColor(colors.black)
            mid_x = (x_start + x_end) / 2

            # Truncate label if space is limited
            available_width = x_end - x_start
            max_chars = max(3, int(available_width / 2.2))
            display_label = label[:max_chars] if len(label) > max_chars else label

            # Center the text vertically in remaining space
            text_y = y + (h - 3*mm) / 2
            c.drawCentredString(mid_x, text_y, display_label)

    def _get_municipal_data(self) -> List[Dict]:
        """Get municipal authority data from detected municipalities."""
        # Use real municipality data if available
        if hasattr(self.sheet, 'municipalities') and self.sheet.municipalities:
            segments = []
            for muni in self.sheet.municipalities:
                # Clip to sheet bounds
                start = max(muni.start_m, self.sheet.start_m)
                end = min(muni.end_m, self.sheet.end_m)
                if start < end:
                    # Format: "COMUNE DI <NAME>" (Italian format)
                    label = f"COMUNE DI {muni.name.upper()}"
                    segments.append({'start_m': start, 'end_m': end, 'label': label})
            if segments:
                return segments

        # Fallback to generic label
        municipality = f"MUNICIPALITY OF {self.context.country.upper()}"
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m,
                 'label': municipality}]

    def _get_ownership_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m,
                 'label': 'PATENTED'}]

    def _get_row_width_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m,
                 'label': '0 m / 40.0 m OR 45.0 m'}]

    def _get_seed_mix_data(self) -> List[Dict]:
        # Could be derived from land use or environmental data
        segments = []
        sheet_len = self.sheet.end_m - self.sheet.start_m
        # Create varied seed mix segments
        segment_len = sheet_len / 4
        seed_mixes = ['SEED MIX #10', 'N/A', 'SEED MIX #6', 'N/A']
        for i, mix in enumerate(seed_mixes):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': mix
            })
        return segments

    def _get_topsoil_procedure_data(self) -> List[Dict]:
        # FW = Full Width, TWL = Top Width Limited
        segments = []
        sheet_len = self.sheet.end_m - self.sheet.start_m
        procedures = ['FW', 'TWL', 'FW', 'TWL']
        segment_len = sheet_len / len(procedures)
        for i, proc in enumerate(procedures):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': proc
            })
        return segments

    def _get_topsoil_depth_data(self) -> List[Dict]:
        # Depths in cm
        segments = []
        sheet_len = self.sheet.end_m - self.sheet.start_m
        depths = ['25', '30-35', '20', '15-20', '40']
        segment_len = sheet_len / len(depths)
        for i, depth in enumerate(depths):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': depth
            })
        return segments

    def _get_env_protection_data(self) -> List[Dict]:
        # EN references like in the original
        segments = []
        sheet_len = self.sheet.end_m - self.sheet.start_m
        refs = ['EN-6,7', 'EN-17; D-6A-19,20,23', 'EN-36; T-4', 'EN-8; D-6A-18,44,45']
        segment_len = sheet_len / len(refs)
        for i, ref in enumerate(refs):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': ref
            })
        return segments

    def _get_env_issues_data(self) -> List[Dict]:
        """Get environmental issues from crossings, terrain, and protected areas."""
        issues = []

        # Add issues from protected areas
        if hasattr(self.sheet, 'protected_areas') and self.sheet.protected_areas:
            for pa in self.sheet.protected_areas:
                start = max(pa.start_m, self.sheet.start_m)
                end = min(pa.end_m, self.sheet.end_m)
                if start < end:
                    if pa.type == 'natura2000':
                        issues.append({
                            'start_m': start, 'end_m': end,
                            'label': f'NATURA 2000 - {pa.name[:20]}'
                        })
                    elif pa.type == 'euap':
                        issues.append({
                            'start_m': start, 'end_m': end,
                            'label': f'PROTECTED AREA - {pa.name[:20]}'
                        })

        # Add issues from water crossings
        for crossing in self.sheet.crossings:
            if crossing.type == 'water':
                issues.append({
                    'start_m': crossing.measure_m - 50,
                    'end_m': crossing.measure_m + 50,
                    'label': f'WATER CROSSING - {crossing.name[:15]}'
                })
            elif crossing.type == 'railway':
                issues.append({
                    'start_m': crossing.measure_m - 30,
                    'end_m': crossing.measure_m + 30,
                    'label': 'RAILWAY CROSSING'
                })

        # Add general issues if no specific ones found
        if not issues:
            sheet_len = self.sheet.end_m - self.sheet.start_m
            general_issues = ['COMPACTION AND RUTTING', 'UNSTABLE TRENCH', 'WIND EROSION', 'WATER EROSION']
            segment_len = sheet_len / len(general_issues)
            for i, issue in enumerate(general_issues):
                issues.append({
                    'start_m': self.sheet.start_m + i * segment_len,
                    'end_m': self.sheet.start_m + (i + 1) * segment_len,
                    'label': issue
                })
        return issues

    def _get_land_use_data(self) -> List[Dict]:
        # Land use categories
        sheet_len = self.sheet.end_m - self.sheet.start_m
        land_uses = ['CULTIVATED', 'HAY', 'PASTURE', 'BUSH', 'CULTIVATED']
        segments = []
        segment_len = sheet_len / len(land_uses)
        for i, use in enumerate(land_uses):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': use
            })
        return segments


class PlanViewBand(BandRenderer):
    """
    Professional plan view (photomosaic) matching Enbridge format with:
    - Satellite imagery background
    - Pipeline route (red line with white outline)
    - KP station markers (white boxes with numbers ABOVE route)
    - Soil annotations (BELOW route) like DZW(20), FIR(35)
    - Match lines with vertical text
    - Township/Range grid labels (diagonal)
    - Section labels in white boxes
    - Feature labels (rivers, railways)
    - Scale info and date of photography
    - North arrow
    """
    def __init__(self, c, x, y, w, h, sheet, config, imagery_path: Path = None,
                 context: ProjectContext = None):
        super().__init__(c, x, y, w, h, sheet, config)
        self.imagery_path = imagery_path
        self.context = context

    def render(self):
        c = self.c

        # Draw border - thicker line matching reference
        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(1.5)
        c.rect(self.x, self.y, self.w, self.h)

        if not self.sheet.route_coords:
            return

        # Calculate transformation based on route orientation
        p_start = self.sheet.route_coords[0]
        p_end = self.sheet.route_coords[-1]
        dx = p_end[0] - p_start[0]
        dy = p_end[1] - p_start[1]
        self.route_angle = math.degrees(math.atan2(dy, dx))

        # Center calculations
        cx = self.x + self.w / 2
        cy = self.y + self.h / 2
        rcx = (self.sheet.bbox_easting_min + self.sheet.bbox_easting_max) / 2
        rcy = (self.sheet.bbox_northing_min + self.sheet.bbox_northing_max) / 2
        points_per_meter = self._get_h_scale_pts()

        # Store for use in station markers
        self.transform_cx = cx
        self.transform_cy = cy
        self.transform_rcx = rcx
        self.transform_rcy = rcy
        self.points_per_meter = points_per_meter

        c.saveState()

        # Clip to band area
        path = c.beginPath()
        path.rect(self.x, self.y, self.w, self.h)
        c.clipPath(path, stroke=0)

        # Apply transformation to align route horizontally
        c.translate(cx, cy)
        c.rotate(-self.route_angle)
        c.scale(points_per_meter, points_per_meter)
        c.translate(-rcx, -rcy)

        # Draw imagery first (background)
        if self.imagery_path and self.imagery_path.exists() and RASTERIO_AVAILABLE:
            self._draw_imagery(c)

        # Draw route with professional styling (white outline + red center)
        self._draw_route(c, points_per_meter)

        # Draw crossings on map first (below route markers)
        self._draw_crossing_symbols(c, points_per_meter)

        # Draw soil annotations BELOW route
        self._draw_soil_annotations(c, points_per_meter)

        # Draw KP station markers ABOVE route (most prominent)
        self._draw_station_markers_on_map(c, points_per_meter)

        c.restoreState()

        # Draw overlays in screen space (after restoring state)
        self._draw_match_lines()
        self._draw_scale_info_box()
        self._draw_north_arrow()
        self._draw_township_labels()
        self._draw_feature_labels()

    def _draw_imagery(self, c):
        """Draw satellite imagery."""
        try:
            with rasterio.open(self.imagery_path) as src:
                min_x, min_y, max_x, max_y = src.bounds
                w = max_x - min_x
                h = max_y - min_y
                img = ImageReader(str(self.imagery_path))
                c.drawImage(img, min_x, min_y, width=w, height=h, mask='auto')
        except Exception as e:
            print(f"Failed to render imagery: {e}")

    def _draw_route(self, c, points_per_meter: float):
        """Draw pipeline route with professional styling - white outline + red center."""
        # White outline first (thicker)
        c.setLineWidth(5 / points_per_meter)
        c.setStrokeColor(COLORS['route_outline'])
        path = c.beginPath()
        path.moveTo(*self.sheet.route_coords[0])
        for pt in self.sheet.route_coords[1:]:
            path.lineTo(*pt)
        c.drawPath(path, stroke=1, fill=0)

        # Red route line (thinner, on top)
        c.setLineWidth(2.5 / points_per_meter)
        c.setStrokeColor(COLORS['route'])
        path = c.beginPath()
        path.moveTo(*self.sheet.route_coords[0])
        for pt in self.sheet.route_coords[1:]:
            path.lineTo(*pt)
        c.drawPath(path, stroke=1, fill=0)

    def _draw_station_markers_on_map(self, c, points_per_meter: float):
        """Draw KP station markers ON the map - rectangular boxes with KP number."""
        interval = 1000  # 1km

        first_kp = int(self.sheet.start_m / interval)
        if first_kp * interval < self.sheet.start_m:
            first_kp += 1

        for kp in range(first_kp, int(self.sheet.end_m / interval) + 2):
            sta_m = kp * interval
            margin = (self.sheet.end_m - self.sheet.start_m) * 0.02
            if sta_m < self.sheet.start_m + margin or sta_m > self.sheet.end_m - margin:
                continue

            pt = self._get_point_at_measure(sta_m)
            if pt is None:
                continue

            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)  # Counter-rotate for upright text

            box_w = 55 / points_per_meter
            box_h = 30 / points_per_meter
            offset_y = 45 / points_per_meter

            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(1.0 / points_per_meter)
            c.rect(-box_w/2, offset_y, box_w, box_h, fill=1, stroke=1)

            c.setFillColor(colors.black)
            font_size = 22 / points_per_meter
            c.setFont("Helvetica-Bold", font_size)
            c.drawCentredString(0, offset_y + box_h * 0.35, f"{kp}")

            c.setStrokeColor(colors.black)
            c.setLineWidth(0.6 / points_per_meter)
            c.line(0, offset_y, 0, 3 / points_per_meter)

            c.setFillColor(colors.Color(0.1, 0.4, 0.1))  # Dark green
            c.circle(0, 0, 4 / points_per_meter, fill=1, stroke=0)

            c.restoreState()

    def _draw_crossing_symbols(self, c, points_per_meter: float):
        """Draw crossing symbols on map matching Enbridge reference format."""
        for crossing in self.sheet.crossings:
            pt = self._get_point_at_measure(crossing.measure_m)
            if pt is None:
                continue

            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)

            symbol_size = 15 / points_per_meter
            label_offset = 25 / points_per_meter
            font_size = 7 / points_per_meter

            if crossing.type == 'road':
                c.setStrokeColor(COLORS['crossing_road'])
                c.setLineWidth(3 / points_per_meter)
                c.line(-symbol_size * 1.8, 0, symbol_size * 1.8, 0)

            elif crossing.type == 'water':
                c.setStrokeColor(COLORS['crossing_water'])
                c.setLineWidth(2.5 / points_per_meter)
                path = c.beginPath()
                path.moveTo(-symbol_size * 2, 0)
                for i in range(5):
                    x1 = -symbol_size * 2 + (i * symbol_size)
                    x2 = -symbol_size * 2 + ((i + 0.5) * symbol_size)
                    x3 = -symbol_size * 2 + ((i + 1) * symbol_size)
                    y_amp = 3 / points_per_meter
                    path.curveTo(
                        x1, y_amp if i % 2 == 0 else -y_amp,
                        x2, -y_amp if i % 2 == 0 else y_amp,
                        x3, 0
                    )
                c.drawPath(path, stroke=1, fill=0)

            elif crossing.type == 'railway':
                c.setStrokeColor(COLORS['crossing_rail'])
                c.setLineWidth(2 / points_per_meter)
                track_sep = 3 / points_per_meter
                c.line(-symbol_size * 2, track_sep, symbol_size * 2, track_sep)
                c.line(-symbol_size * 2, -track_sep, symbol_size * 2, -track_sep)
                c.setLineWidth(1.5 / points_per_meter)
                for i in range(-3, 4):
                    x = i * symbol_size * 0.5
                    c.line(x, -track_sep * 1.5, x, track_sep * 1.5)

            elif crossing.type == 'power':
                c.setStrokeColor(COLORS['crossing_power'])
                c.setLineWidth(2 / points_per_meter)
                c.line(-symbol_size * 1.5, 0, symbol_size * 1.5, 0)
                c.setLineWidth(1 / points_per_meter)
                for x_off in [-symbol_size, symbol_size]:
                    c.line(x_off, -symbol_size/3, x_off, symbol_size/3)

            if crossing.name and crossing.name != "Unknown":
                c.setFillColor(colors.black)
                c.setFont("Helvetica", font_size)
                name_display = crossing.name[:15] if len(crossing.name) > 15 else crossing.name
                c.drawCentredString(0, -label_offset, name_display.upper())

            c.restoreState()

        # Mile Posts (square markers) at ~1.6km intervals
        mile_interval = 1609.34
        first_mile = int(self.sheet.start_m / mile_interval)
        if first_mile * mile_interval < self.sheet.start_m:
            first_mile += 1

        for mile in range(first_mile, int(self.sheet.end_m / mile_interval) + 1):
            mile_m = mile * mile_interval
            if mile_m < self.sheet.start_m or mile_m > self.sheet.end_m:
                continue

            pt = self._get_point_at_measure(mile_m)
            if pt is None:
                continue

            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)

            square_size = 5 / points_per_meter
            c.setFillColor(colors.black)
            c.rect(-square_size/2, -square_size/2, square_size, square_size, fill=1, stroke=0)

            c.setFont("Helvetica-Bold", 6 / points_per_meter)
            c.setFillColor(colors.black)
            c.drawCentredString(0, square_size + 3 / points_per_meter, f"{mile}D")

            c.restoreState()

    def _draw_soil_annotations(self, c, points_per_meter: float):
        """Draw soil annotations matching Enbridge reference format."""
        soil_types = ['DZW', 'FIR', 'VDL', 'KUD', 'RB', 'DGF', 'JYL', 'OBO', 'shFIR', 'saDGF']

        sheet_len = self.sheet.end_m - self.sheet.start_m
        num_annotations = max(4, int(sheet_len / 400))

        for i in range(num_annotations):
            frac = (i + 0.3 + (i % 3) * 0.15) / num_annotations
            if frac > 0.95:
                frac = 0.95
            measure = self.sheet.start_m + frac * sheet_len

            pt = self._get_point_at_measure(measure)
            if pt is None:
                continue

            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)

            offset_y = -40 / points_per_meter

            soil_type = soil_types[i % len(soil_types)]
            depth = 15 + ((i * 7) % 30)
            topo_class = 2 + (i % 6)
            if topo_class > 5:
                topo_class_str = f"{topo_class-1}-{topo_class}"
            else:
                topo_class_str = str(topo_class)

            if i % 7 == 0:
                annotation = f"sa{soil_type}({depth})"
            elif i % 11 == 0:
                annotation = f"sh{soil_type}({depth})"
            else:
                annotation = f"{soil_type}({depth})"

            font_size = 9 / points_per_meter
            c.setFont("Helvetica-Bold", font_size)
            c.setFillColor(COLORS['soil_annotation'])
            c.drawCentredString(0, offset_y, annotation)

            c.setFont("Helvetica", font_size * 0.85)
            c.drawCentredString(0, offset_y - 10 / points_per_meter, topo_class_str)

            c.restoreState()

        # Soil break symbols (D)
        num_breaks = max(2, int(sheet_len / 800))
        for i in range(num_breaks):
            frac = 0.2 + (i * 0.6) / max(1, num_breaks - 1)
            measure = self.sheet.start_m + frac * sheet_len

            pt = self._get_point_at_measure(measure)
            if pt is None:
                continue

            c.saveState()
            c.translate(pt[0], pt[1])
            c.rotate(self.route_angle)

            offset_y = -25 / points_per_meter
            font_size = 8 / points_per_meter
            c.setFont("Helvetica-Bold", font_size)
            c.setFillColor(colors.black)
            c.drawCentredString(0, offset_y, "D")

            c.restoreState()

        # Soil sampling site (?)
        if self.sheet.sheet_number % 2 == 0:
            measure = self.sheet.start_m + sheet_len * 0.4
            pt = self._get_point_at_measure(measure)
            if pt:
                c.saveState()
                c.translate(pt[0], pt[1])
                c.rotate(self.route_angle)

                offset_y = -55 / points_per_meter
                font_size = 10 / points_per_meter
                c.setFont("Helvetica-Bold", font_size)
                c.setFillColor(colors.Color(0.3, 0.3, 0.3))

                c.setStrokeColor(colors.black)
                c.setLineWidth(0.5 / points_per_meter)
                c.circle(0, offset_y + 3 / points_per_meter, 6 / points_per_meter, fill=0, stroke=1)
                c.drawCentredString(0, offset_y, "?")

                c.restoreState()

    def _get_point_at_measure(self, measure: float) -> Optional[Tuple[float, float]]:
        """Interpolate point at measure along the route."""
        if not self.sheet.route_coords or len(self.sheet.route_coords) < 2:
            return None

        coords = self.sheet.route_coords
        cumulative = [0.0]
        for i in range(1, len(coords)):
            dx = coords[i][0] - coords[i-1][0]
            dy = coords[i][1] - coords[i-1][1]
            cumulative.append(cumulative[-1] + math.sqrt(dx*dx + dy*dy))

        total_len = cumulative[-1]
        if total_len <= 0:
            return coords[0]

        target = measure - self.sheet.start_m
        target = max(0, min(target, total_len))

        for i in range(1, len(cumulative)):
            if cumulative[i] >= target:
                seg_start = cumulative[i-1]
                seg_len = cumulative[i] - seg_start
                if seg_len <= 0:
                    return coords[i-1]
                t = (target - seg_start) / seg_len
                x = coords[i-1][0] + t * (coords[i][0] - coords[i-1][0])
                y = coords[i-1][1] + t * (coords[i][1] - coords[i-1][1])
                return (x, y)

        return coords[-1]

    def _draw_match_lines(self):
        """Draw match lines on left and right edges with vertical MATCH LINE text."""
        c = self.c

        # Left match line
        if self.sheet.sheet_number > 1:
            c.saveState()
            c.setStrokeColor(COLORS['match_line'])
            c.setLineWidth(1)
            c.setDash([8, 4])
            x_left = self.x + 12*mm
            c.line(x_left, self.y + 5*mm, x_left, self.y + self.h - 5*mm)

            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.black)
            c.saveState()
            c.translate(x_left - 4*mm, self.y + self.h/2)
            c.rotate(90)
            c.drawCentredString(0, 0, "MATCH LINE")
            c.restoreState()
            c.restoreState()

        # Right match line
        if self.sheet.sheet_number < self.sheet.total_sheets:
            c.saveState()
            c.setStrokeColor(COLORS['match_line'])
            c.setLineWidth(1)
            c.setDash([8, 4])
            x_right = self.x + self.w - 12*mm
            c.line(x_right, self.y + 5*mm, x_right, self.y + self.h - 5*mm)

            c.setFont("Helvetica-Bold", 9)
            c.setFillColor(colors.black)
            c.saveState()
            c.translate(x_right + 4*mm, self.y + self.h/2)
            c.rotate(90)
            c.drawCentredString(0, 0, "MATCH LINE")
            c.restoreState()
            c.restoreState()

    def _draw_scale_info_box(self):
        """Draw scale info box in bottom-left matching Enbridge reference format."""
        c = self.c

        x = self.x + 5*mm
        y = self.y + 5*mm
        box_w = 70*mm
        box_h = 24*mm

        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.6)
        c.rect(x, y, box_w, box_h, fill=1, stroke=1)

        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 7)
        y_text = y + 18*mm
        c.drawString(x + 2*mm, y_text, f"11\" x 17\" MOSAIC SCALE 1:{self.config.h_scale * 2:,}")
        y_text -= 5*mm
        c.drawString(x + 2*mm, y_text, f"22\" x 34\" MOSAIC SCALE 1:{self.config.h_scale:,}")

        y_text -= 6*mm
        c.setFont("Helvetica", 6)
        from datetime import datetime
        photo_year = datetime.now().year
        c.drawString(x + 2*mm, y_text, f"DATE OF PHOTOGRAPHY: {photo_year}")

        y_text -= 5*mm
        scale_bar_length = 30*mm
        c.setStrokeColor(colors.black)
        c.setLineWidth(1)
        c.line(x + 2*mm, y_text, x + 2*mm + scale_bar_length, y_text)
        c.line(x + 2*mm, y_text - 1*mm, x + 2*mm, y_text + 1*mm)
        c.line(x + 2*mm + scale_bar_length, y_text - 1*mm, x + 2*mm + scale_bar_length, y_text + 1*mm)
        scale_meters = int(scale_bar_length / 72 * 25.4 * self.config.h_scale / 1000)
        c.setFont("Helvetica", 5)
        c.drawCentredString(x + 2*mm + scale_bar_length/2, y_text - 3*mm, f"{scale_meters} km")

    def _draw_north_arrow(self):
        """Draw north arrow in top-right area."""
        c = self.c
        arrow_x = self.x + self.w - 18*mm
        arrow_y = self.y + self.h - 20*mm

        c.saveState()
        c.translate(arrow_x, arrow_y)
        c.rotate(-self.route_angle)

        c.setStrokeColor(colors.black)
        c.setFillColor(colors.black)
        c.setLineWidth(1.5)
        c.line(0, -7*mm, 0, 7*mm)

        path = c.beginPath()
        path.moveTo(0, 7*mm)
        path.lineTo(-2.5*mm, 3*mm)
        path.lineTo(2.5*mm, 3*mm)
        path.close()
        c.drawPath(path, stroke=0, fill=1)

        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(0, 9*mm, "N")

        c.restoreState()

    def _draw_township_labels(self):
        """Draw township/range grid labels like TWP/RGE and quarter-section labels."""
        c = self.c

        avg_northing = (self.sheet.bbox_northing_min + self.sheet.bbox_northing_max) / 2
        avg_easting = (self.sheet.bbox_easting_min + self.sheet.bbox_easting_max) / 2

        base_twp = 5 + int((avg_northing % 100000) / 10000)
        base_rge = 10 + int((avg_easting % 100000) / 10000)

        twp_rge_positions = [
            (0.30, 0.70, f"TWP. {base_twp}"),
            (0.30, 0.30, f"TWP. {base_twp - 1}"),
            (0.20, 0.50, f"RGE. {base_rge} WPM"),
            (0.65, 0.50, f"RGE. {base_rge + 1} WPM"),
        ]

        for fx, fy, label in twp_rge_positions:
            c.saveState()
            x_pos = self.x + self.w * fx
            y_pos = self.y + self.h * fy
            c.translate(x_pos, y_pos)
            c.rotate(45)

            c.setFont("Helvetica-Bold", 11)
            c.setFillColor(colors.white)
            for dx, dy in [(-0.5, 0), (0.5, 0), (0, -0.5), (0, 0.5)]:
                c.drawCentredString(dx, dy, label)
            c.setFillColor(colors.black)
            c.drawCentredString(0, 0, label)
            c.restoreState()

        section_positions = [
            (0.12, 0.75), (0.28, 0.75), (0.44, 0.75), (0.60, 0.75), (0.76, 0.75),
            (0.12, 0.50), (0.28, 0.50), (0.44, 0.50), (0.60, 0.50), (0.76, 0.50),
            (0.12, 0.25), (0.28, 0.25), (0.44, 0.25), (0.60, 0.25), (0.76, 0.25),
        ]

        section_num = 25
        for i, (fx, fy) in enumerate(section_positions):
            x_pos = self.x + self.w * fx
            y_pos = self.y + self.h * fy

            col = i % 5
            row = i // 5
            sec = ((section_num + col - row * 6) % 36) + 1
            twp = base_twp - row
            rge = base_rge + (col // 2)

            c.saveState()
            c.translate(x_pos, y_pos)

            box_w = 18*mm
            box_h = 7*mm
            c.setFillColor(colors.white)
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.4)
            c.rect(-box_w/2, -box_h/2, box_w, box_h, fill=1, stroke=1)

            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(0, 0.5*mm, str(sec))

            c.setFont("Helvetica", 5)
            c.drawCentredString(0, -2.5*mm, f"{twp}-{rge}-WPM")
            c.restoreState()

    def _draw_feature_labels(self):
        """Draw feature labels for crossings, protected areas, and municipalities."""
        c = self.c
        labels_drawn = []

        for crossing in self.sheet.crossings:
            rel_pos = (crossing.measure_m - self.sheet.start_m) / (self.sheet.end_m - self.sheet.start_m)
            x_pos = self.x + self.w * 0.1 + rel_pos * self.w * 0.8

            can_draw = all(abs(x_pos - lx) > 30*mm for lx, _ in labels_drawn)
            if not can_draw:
                continue

            if crossing.type == 'water' and crossing.name and crossing.name != "Unknown":
                y_pos = self.y + self.h * 0.12
                c.saveState()
                c.setFont("Helvetica-Oblique", 7)
                c.setFillColor(COLORS['crossing_water'])
                name = crossing.name[:25] if len(crossing.name) > 25 else crossing.name
                c.drawCentredString(x_pos, y_pos, name.upper())
                labels_drawn.append((x_pos, y_pos))
                c.restoreState()

            elif crossing.type == 'railway':
                y_pos = self.y + self.h * 0.88
                c.saveState()
                c.setFont("Helvetica-Bold", 6)
                name = crossing.name[:20] if len(crossing.name) > 20 else crossing.name
                text_w = c.stringWidth(name, "Helvetica-Bold", 6)
                c.setFillColor(colors.white)
                c.rect(x_pos - text_w/2 - 2*mm, y_pos - 1*mm, text_w + 4*mm, 4*mm, fill=1, stroke=0)
                c.setFillColor(colors.black)
                c.drawCentredString(x_pos, y_pos, name)
                labels_drawn.append((x_pos, y_pos))
                c.restoreState()

            elif crossing.type == 'power' and 'kV' in crossing.name:
                y_pos = self.y + self.h * 0.85
                c.saveState()
                c.setFont("Helvetica", 5)
                c.setFillColor(COLORS['crossing_power'])
                c.drawCentredString(x_pos, y_pos, crossing.name)
                labels_drawn.append((x_pos, y_pos))
                c.restoreState()

            elif crossing.type == 'road' and crossing.name not in ['Road', 'Unknown', 'Unclassified']:
                y_pos = self.y + self.h * 0.92
                c.saveState()
                c.setFont("Helvetica", 5)
                c.setFillColor(COLORS['crossing_road'])
                name = crossing.name[:18] if len(crossing.name) > 18 else crossing.name
                c.drawCentredString(x_pos, y_pos, name)
                labels_drawn.append((x_pos, y_pos))
                c.restoreState()

        if hasattr(self.sheet, 'protected_areas') and self.sheet.protected_areas:
            for pa in self.sheet.protected_areas:
                start = max(pa.start_m, self.sheet.start_m)
                end = min(pa.end_m, self.sheet.end_m)
                center_m = (start + end) / 2
                rel_pos = (center_m - self.sheet.start_m) / (self.sheet.end_m - self.sheet.start_m)
                x_pos = self.x + self.w * 0.1 + rel_pos * self.w * 0.8

                y_pos = self.y + self.h * 0.75
                c.saveState()
                c.setFont("Helvetica-Bold", 6)
                c.setFillColor(colors.Color(0.8, 1.0, 0.8))
                name = pa.name[:22] if len(pa.name) > 22 else pa.name
                text_w = c.stringWidth(name, "Helvetica-Bold", 6)
                c.rect(x_pos - text_w/2 - 2*mm, y_pos - 1.5*mm, text_w + 4*mm, 5*mm, fill=1, stroke=0)
                c.setFillColor(colors.Color(0.0, 0.4, 0.0))
                c.drawCentredString(x_pos, y_pos, name)
                c.restoreState()

        if hasattr(self.sheet, 'municipalities') and self.sheet.municipalities:
            for i, muni in enumerate(self.sheet.municipalities[:3]):
                start = max(muni.start_m, self.sheet.start_m)
                end = min(muni.end_m, self.sheet.end_m)
                center_m = (start + end) / 2
                rel_pos = (center_m - self.sheet.start_m) / (self.sheet.end_m - self.sheet.start_m)
                x_pos = self.x + self.w * 0.1 + rel_pos * self.w * 0.8

                y_pos = self.y + self.h * 0.22 + i * 4*mm
                c.saveState()
                c.setFont("Helvetica", 5)
                c.setFillColor(colors.Color(0.4, 0.4, 0.4))
                c.drawCentredString(x_pos, y_pos, muni.name.title())
                c.restoreState()


class BottomDataBandsRenderer(BandRenderer):
    """
    Renders bottom data bands (Environmental Monitoring Issues - Post-Construction).
    Matches reference format with PCM Results header and multiple issue categories.
    """
    def __init__(self, c, x, y, w, h, sheet, config, context: ProjectContext):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context

        self.rows = [
            ("SOIL", "TOPSOIL SALVAGE\nPROCEDURE", self._get_soil_procedure_data),
            ("", "REMEDIAL\nMEASURES", self._get_soil_remedial_data),
            ("", "ISSUES", self._get_soil_issues_data),
            ("WATER AND\nWETLAND\nCROSSINGS", "REMEDIAL\nMEASURES", self._get_water_remedial_data),
            ("", "ISSUES", self._get_water_issues_data),
            ("VEGETATION", "REMEDIAL\nMEASURES", self._get_veg_remedial_data),
            ("", "ISSUES", self._get_veg_issues_data),
            ("DRAINAGE CONTROL\nAND RECLAMATION", "", self._get_drainage_data),
            ("SEED MIX", "", self._get_seed_mix_data),
            ("LAND USE", "", self._get_land_use_data),
            ("OTHER", "", self._get_other_data),
        ]

    def render(self):
        c = self.c

        pcm_header_h = 5*mm
        content_h = self.h - pcm_header_h

        num_rows = len(self.rows)
        row_height = content_h / num_rows

        c.setFont("Helvetica-Bold", 6)
        c.setFillColor(colors.black)
        c.drawRightString(self.x + self.w - 5*mm, self.y + self.h - 4*mm, "PCM RESULTS YR 5")

        header_width = 8*mm
        c.saveState()
        c.setFillColor(COLORS['label_bg'])
        c.rect(self.x, self.y, header_width, content_h, fill=1, stroke=1)

        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 4.5)
        c.saveState()
        c.translate(self.x + header_width/2 - 1.5*mm, self.y + content_h/2)
        c.rotate(90)
        c.drawCentredString(0, 0, "ENVIRONMENTAL MONITORING ISSUES")
        c.restoreState()

        c.saveState()
        c.translate(self.x + header_width/2 + 1.5*mm, self.y + content_h/2)
        c.rotate(90)
        c.drawCentredString(0, 0, "AND KEY REMEDIAL MEASURES")
        c.restoreState()

        c.saveState()
        c.translate(self.x + header_width/2 + 4*mm, self.y + content_h/2)
        c.rotate(90)
        c.drawCentredString(0, 0, "(POST-CONSTRUCTION)")
        c.restoreState()
        c.restoreState()

        content_x = self.x + header_width
        content_w = self.w - header_width

        for i, (main_label, sub_label, data_func) in enumerate(self.rows):
            row_y = self.y + content_h - (i + 1) * row_height
            self._render_data_row(content_x, row_y, content_w, row_height,
                                  main_label, sub_label, data_func())

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(1)
        c.rect(self.x, self.y, self.w, self.h)

    def _render_data_row(self, x: float, y: float, w: float, h: float,
                         main_label: str, sub_label: str, data_segments: List[Dict]):
        c = self.c
        main_label_width = 25*mm
        sub_label_width = 20*mm if sub_label else 0
        total_label_width = main_label_width + sub_label_width

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(0.3)
        c.setFillColor(COLORS['label_bg'])
        c.rect(x, y, main_label_width, h, fill=1, stroke=1)

        if main_label:
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 4.5)
            lines = main_label.split('\n')
            line_height = 4.5
            start_y = y + h/2 + (len(lines) - 1) * line_height / 2
            for j, line in enumerate(lines):
                c.drawCentredString(x + main_label_width/2, start_y - j * line_height, line)

        if sub_label:
            c.setFillColor(COLORS['label_bg'])
            c.rect(x + main_label_width, y, sub_label_width, h, fill=1, stroke=1)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 4)
            lines = sub_label.split('\n')
            line_height = 4
            start_y = y + h/2 + (len(lines) - 1) * line_height / 2
            for j, line in enumerate(lines):
                c.drawCentredString(x + main_label_width + sub_label_width/2,
                                   start_y - j * line_height, line)

        data_x = x + total_label_width
        data_w = w - total_label_width
        c.setFillColor(colors.white)
        c.rect(data_x, y, data_w, h, fill=1, stroke=1)

        self._draw_bracket_data(data_x, y, data_w, h, data_segments)

    def _draw_bracket_data(self, x: float, y: float, w: float, h: float,
                           segments: List[Dict]):
        c = self.c
        sheet_start = self.sheet.start_m
        sheet_end = self.sheet.end_m
        sheet_length = sheet_end - sheet_start

        for seg in segments:
            start_m = max(seg.get('start_m', sheet_start), sheet_start)
            end_m = min(seg.get('end_m', sheet_end), sheet_end)

            if start_m >= end_m:
                continue

            x_start = x + ((start_m - sheet_start) / sheet_length) * w
            x_end = x + ((end_m - sheet_start) / sheet_length) * w

            min_width = 12
            if x_end - x_start < min_width:
                mid = (x_start + x_end) / 2
                x_start = mid - min_width/2
                x_end = mid + min_width/2

            c.setStrokeColor(colors.black)
            c.setLineWidth(0.4)

            bracket_top = y + h - 1.5*mm
            tick_len = 1.5*mm

            c.line(x_start, bracket_top, x_end, bracket_top)
            c.line(x_start, bracket_top, x_start, bracket_top - tick_len)
            c.line(x_end, bracket_top, x_end, bracket_top - tick_len)

            label = seg.get('label', '')
            if label:
                c.setFont("Helvetica", 4)
                c.setFillColor(colors.black)
                mid_x = (x_start + x_end) / 2
                available_width = x_end - x_start
                max_chars = max(3, int(available_width / 2))
                display_label = label[:max_chars] if len(label) > max_chars else label
                c.drawCentredString(mid_x, y + h/2 - 1.5*mm, display_label)

    def _get_soil_procedure_data(self) -> List[Dict]:
        sheet_len = self.sheet.end_m - self.sheet.start_m
        procedures = ['FW', 'TWL', 'FW', 'TWL', 'FW']
        segments = []
        segment_len = sheet_len / len(procedures)
        for i, proc in enumerate(procedures):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': proc
            })
        return segments

    def _get_soil_remedial_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_soil_issues_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_water_remedial_data(self) -> List[Dict]:
        segments = []
        for crossing in self.sheet.crossings:
            if crossing.type == 'water':
                segments.append({
                    'start_m': crossing.measure_m - 50,
                    'end_m': crossing.measure_m + 50,
                    'label': 'AREA REPAIRED'
                })
        return segments if segments else [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_water_issues_data(self) -> List[Dict]:
        segments = []
        for crossing in self.sheet.crossings:
            if crossing.type == 'water':
                segments.append({
                    'start_m': crossing.measure_m - 50,
                    'end_m': crossing.measure_m + 50,
                    'label': crossing.name[:15]
                })
        return segments if segments else [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_veg_remedial_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_veg_issues_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]

    def _get_drainage_data(self) -> List[Dict]:
        sheet_len = self.sheet.end_m - self.sheet.start_m
        return [
            {'start_m': self.sheet.start_m, 'end_m': self.sheet.start_m + sheet_len * 0.3, 'label': ''},
            {'start_m': self.sheet.start_m + sheet_len * 0.3, 'end_m': self.sheet.start_m + sheet_len * 0.5, 'label': 'FIELD DRAIN'},
            {'start_m': self.sheet.start_m + sheet_len * 0.5, 'end_m': self.sheet.end_m, 'label': ''},
        ]

    def _get_seed_mix_data(self) -> List[Dict]:
        sheet_len = self.sheet.end_m - self.sheet.start_m
        mixes = ['N/A', '#3ACM', '12E', 'N/A', 'CM 12E']
        segments = []
        segment_len = sheet_len / len(mixes)
        for i, mix in enumerate(mixes):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': mix
            })
        return segments

    def _get_land_use_data(self) -> List[Dict]:
        sheet_len = self.sheet.end_m - self.sheet.start_m
        uses = ['CULTIVATED', 'RIPARIAN', 'PASTURE', 'HAY', 'CULTIVATED']
        segments = []
        segment_len = sheet_len / len(uses)
        for i, use in enumerate(uses):
            segments.append({
                'start_m': self.sheet.start_m + i * segment_len,
                'end_m': self.sheet.start_m + (i + 1) * segment_len,
                'label': use
            })
        return segments

    def _get_other_data(self) -> List[Dict]:
        return [{'start_m': self.sheet.start_m, 'end_m': self.sheet.end_m, 'label': ''}]


class FooterRenderer:
    """
    Renders the professional footer matching Enbridge Post-Construction
    Environmental Monitoring Alignment Sheet format.
    """
    def __init__(self, c: canvas.Canvas, x: float, y: float, w: float, h: float,
                 sheet: SheetData, config: SheetConfig, context: ProjectContext):
        self.c = c
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.sheet = sheet
        self.config = config
        self.context = context

    def render(self):
        c = self.c

        legend_w = self.w * 0.17
        source_w = self.w * 0.18
        soils_notation_w = self.w * 0.20
        revisions_w = self.w * 0.15
        title_block_w = self.w * 0.30

        x_offset = self.x

        self._render_legend(x_offset, self.y, legend_w, self.h)
        x_offset += legend_w

        self._render_source(x_offset, self.y, source_w, self.h)
        x_offset += source_w

        self._render_soils_notation(x_offset, self.y, soils_notation_w, self.h)
        x_offset += soils_notation_w

        self._render_revisions(x_offset, self.y, revisions_w, self.h)
        x_offset += revisions_w

        self._render_title_block(x_offset, self.y, title_block_w, self.h)

    def _render_legend(self, x: float, y: float, w: float, h: float):
        c = self.c

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)

        symbols_h = h * 0.55
        notes_h = h * 0.45

        c.setFillColor(COLORS['header_bg'])
        c.rect(x, y + notes_h + symbols_h - 6*mm, w, 6*mm, fill=1)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawCentredString(x + w/2, y + notes_h + symbols_h - 4*mm, "LEGEND")

        items = [
            ('kp', colors.Color(0.2, 0.6, 0.2), "Environmental KP"),
            ('line', COLORS['route'], "Pipeline Route"),
            ('square', colors.black, "Mile Post"),
            ('line', colors.grey, "Road"),
            ('line', COLORS['existing_pipeline'], "Existing Pipeline"),
            ('rect', COLORS['indian_reserve'], "Municipality Boundary"),
            ('rect', COLORS['park_area'], "Park or Protected Area"),
            ('pattern', COLORS['indian_reserve'], "Indian Reserve"),
        ]

        item_y = y + notes_h + symbols_h - 11*mm
        line_spacing = 4*mm

        for symbol_type, color, label in items:
            if item_y < y + notes_h + 2*mm:
                break

            if symbol_type == 'line':
                c.setStrokeColor(color)
                c.setLineWidth(1.5)
                c.line(x + 2*mm, item_y, x + 8*mm, item_y)
            elif symbol_type == 'kp':
                c.setFillColor(colors.white)
                c.setStrokeColor(colors.black)
                c.setLineWidth(0.3)
                c.rect(x + 2*mm, item_y - 1.5*mm, 6*mm, 3*mm, fill=1, stroke=1)
                c.setFillColor(color)
                c.setFont("Helvetica-Bold", 4)
                c.drawCentredString(x + 5*mm, item_y - 0.5*mm, "1001")
            elif symbol_type == 'square':
                c.setFillColor(color)
                c.rect(x + 3*mm, item_y - 1.5*mm, 3*mm, 3*mm, fill=1, stroke=0)
            elif symbol_type == 'rect':
                c.setFillColor(color)
                c.setStrokeColor(colors.black)
                c.setLineWidth(0.3)
                c.rect(x + 2*mm, item_y - 1*mm, 6*mm, 2*mm, fill=1, stroke=1)
            elif symbol_type == 'pattern':
                c.setFillColor(color)
                c.setStrokeColor(colors.black)
                c.setLineWidth(0.3)
                c.rect(x + 2*mm, item_y - 1*mm, 6*mm, 2*mm, fill=1, stroke=1)
                c.setStrokeColor(colors.black)
                c.setLineWidth(0.2)
                for i in range(3):
                    c.line(x + 2*mm + i*2*mm, item_y - 1*mm, x + 4*mm + i*2*mm, item_y + 1*mm)

            c.setFont("Helvetica", 4.5)
            c.setFillColor(colors.black)
            c.drawString(x + 10*mm, item_y - 1*mm, label)

            item_y -= line_spacing

        c.setLineWidth(0.3)
        c.line(x, y + notes_h, x + w, y + notes_h)

        c.setFont("Helvetica-Bold", 5)
        c.setFillColor(colors.black)
        text_y = y + notes_h - 4*mm
        c.drawString(x + 1*mm, text_y, "ENVIRONMENTAL PROTECTION PLAN NOTES")
        text_y -= 4*mm

        c.setFont("Helvetica", 4)
        notes = [
            "All items included above the photomosaic were",
            "documented during the regulatory application",
            "and planning phase of the Project.",
            "",
            "EN = Environmental Notes, refers to the index",
            "sheets. T = Tables. D = Details, refers to",
            "Appendix B of the Environmental Protection Plan.",
        ]
        for line in notes:
            if text_y < y + 2*mm:
                break
            c.drawString(x + 1*mm, text_y, line)
            text_y -= 3*mm

    def _render_source(self, x: float, y: float, w: float, h: float):
        c = self.c

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)

        c.setFillColor(COLORS['header_bg'])
        c.rect(x, y + h - 6*mm, w, 6*mm, fill=1)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawCentredString(x + w/2, y + h - 4*mm, "SOURCE")

        c.setFont("Helvetica", 4.5)
        text_y = y + h - 12*mm
        line_height = 4*mm

        sources = [
            "Imagery: ESRI World Imagery",
            f"CRS: EPSG:{self.context.crs_epsg}",
            "Roads: OpenStreetMap",
            "Municipal Boundaries: Project Data",
            "Vector Data: OpenStreetMap",
            "DEM: Project Rasters",
            "",
            "Although there is no reason to believe",
            "that there are any errors associated",
            "with the data used to generate this",
            "product, users are advised that errors",
            "in the data may be present.",
        ]

        for line in sources:
            if text_y < y + 2*mm:
                break
            c.drawString(x + 2*mm, text_y, line)
            text_y -= line_height

    def _render_soils_notation(self, x: float, y: float, w: float, h: float):
        c = self.c

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)

        c.setFillColor(COLORS['header_bg'])
        c.rect(x, y + h - 6*mm, w, 6*mm, fill=1)
        c.setFont("Helvetica-Bold", 6)
        c.setFillColor(colors.black)
        c.drawCentredString(x + w/2, y + h - 4*mm, "PRECONSTRUCTION SOILS NOTATION")

        c.setFont("Helvetica", 5)
        text_y = y + h - 13*mm

        c.setFont("Helvetica-Bold", 6)
        c.drawString(x + 5*mm, text_y, "saOBO(20)")
        c.setFont("Helvetica", 5)
        c.drawString(x + 25*mm, text_y, "Soil Unit")
        text_y -= 5*mm

        c.setFont("Helvetica-Bold", 6)
        c.drawString(x + 18*mm, text_y, "2")
        c.setFont("Helvetica", 5)
        c.drawString(x + 25*mm, text_y, "Topography Class")
        text_y -= 6*mm

        symbols = [
            ("?", "Soil Investigation Site"),
            ("?", "Soil Sampling Site"),
            ("D", "Soil Break"),
        ]

        for sym, desc in symbols:
            c.setFont("Helvetica-Bold", 7)
            c.drawString(x + 5*mm, text_y, sym)
            c.setFont("Helvetica", 5)
            c.drawString(x + 12*mm, text_y, desc)
            text_y -= 4.5*mm

        text_y -= 2*mm
        c.setFont("Helvetica-Bold", 5)
        c.drawString(x + 2*mm, text_y, "Topography Classes:")
        text_y -= 4*mm

        topo_classes = [
            "1. 0 to 0.5% - level",
            "2. 0.5 to 2% - nearly level",
            "3. 2 to 5% - very gentle slopes",
            "4. 6 to 9% - gentle slopes",
            "5. 10 to 15% - moderate slopes",
        ]

        c.setFont("Helvetica", 4)
        for tc in topo_classes:
            if text_y < y + 2*mm:
                break
            c.drawString(x + 2*mm, text_y, tc)
            text_y -= 3.5*mm

    def _render_revisions(self, x: float, y: float, w: float, h: float):
        c = self.c

        c.setStrokeColor(COLORS['border'])
        c.setLineWidth(0.5)
        c.rect(x, y, w, h)

        c.setFillColor(COLORS['header_bg'])
        c.rect(x, y + h - 6*mm, w, 6*mm, fill=1)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(colors.black)
        c.drawCentredString(x + w/2, y + h - 4*mm, "REVISIONS")

        c.setFont("Helvetica-Bold", 5)
        row_y = y + h - 12*mm
        cols = ["REV.", "DATE", "DESCRIPTION", "APP."]
        col_widths = [0.12, 0.25, 0.45, 0.18]
        col_x = x + 1*mm

        for i, col in enumerate(cols):
            c.drawString(col_x, row_y, col)
            col_x += w * col_widths[i]

        c.setLineWidth(0.3)
        c.line(x, row_y - 2*mm, x + w, row_y - 2*mm)

        c.setFont("Helvetica", 5)
        row_y -= 6*mm
        col_x = x + 1*mm
        rev_data = ["0", self.context.date_generated, "INITIAL ISSUE", "AGRS"]
        for i, val in enumerate(rev_data):
            display_val = val[:12] if len(val) > 12 else val
            c.drawString(col_x, row_y, display_val)
            col_x += w * col_widths[i]

        c.setFont("Helvetica", 4)
        c.drawString(x + 2*mm, y + 3*mm, "SEE ENVIRONMENTAL NOTES SHEET")

    def _render_title_block(self, x: float, y: float, w: float, h: float):
        c = self.c

        c.setStrokeColor(colors.black)
        c.setLineWidth(1.5)
        c.rect(x, y, w, h)

        header_h = h * 0.16
        c.setFillColor(COLORS['title_bg'])
        c.rect(x, y + h - header_h, w, header_h, fill=1, stroke=0)

        logo_w = w * 0.25
        c.setFillColor(colors.white)
        c.setStrokeColor(colors.white)
        c.setLineWidth(0.5)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + logo_w/2, y + h - header_h/2 - 1, "LOGO")

        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(colors.white)
        c.drawCentredString(x + logo_w + (w - logo_w)/2, y + h - header_h/2 - 2,
                            self.context.organization.upper())

        project_h = h * 0.12
        project_y = y + h - header_h - project_h
        c.setStrokeColor(colors.black)
        c.setLineWidth(0.5)
        c.rect(x, project_y, w, project_h, stroke=1, fill=0)
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(colors.black)
        c.drawCentredString(x + w/2, project_y + project_h/2 - 2, self.context.project_name.upper())

        title_h = h * 0.14
        title_y = project_y - title_h
        c.rect(x, title_y, w, title_h, stroke=1, fill=0)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(x + w/2, title_y + title_h * 0.65, "POST-CONSTRUCTION ENVIRONMENTAL")
        c.drawCentredString(x + w/2, title_y + title_h * 0.35, "MONITORING ALIGNMENT SHEETS - YEAR 5")

        route_h = h * 0.08
        route_y = title_y - route_h
        c.rect(x, route_y, w, route_h, stroke=1, fill=0)
        c.setFont("Helvetica", 6)
        start_kp = int(self.sheet.start_m / 1000)
        end_kp = int(self.sheet.end_m / 1000)
        c.drawCentredString(x + w/2, route_y + route_h/2 - 1,
                            f"KP {start_kp} to KP {end_kp} - {self.context.route_name}")

        grid_h = route_y - y
        row_h = grid_h / 4

        c.setLineWidth(0.5)
        for i in range(5):
            c.line(x, y + i * row_h, x + w, y + i * row_h)

        col_w = w / 3
        c.line(x + col_w, y, x + col_w, route_y)
        c.line(x + 2*col_w, y, x + 2*col_w, route_y)

        cells = [
            (3, 0, "DRAWN", "TERA"),
            (3, 1, "DATE", f"January {self.context.date_generated[:4]}"),
            (3, 2, "PROJECT NO.", self.context.project_id[:8] if self.context.project_id != "N/A" else "4663"),
            (2, 0, "CHECK", "CD/SR"),
            (2, 1, "SCALE", "PHOTOMOSAIC"),
            (2, 2, "", ""),
            (1, 0, "REV.", "0"),
            (1, 1, "", ""),
            (1, 2, "", ""),
            (0, 0, "", ""),
            (0, 1, "", ""),
            (0, 2, "SHEET", f"{self.sheet.sheet_number} OF {self.sheet.total_sheets}"),
        ]

        for row, col, label, value in cells:
            cell_x = x + col * col_w
            cell_y = y + row * row_h

            if label:
                c.setFont("Helvetica", 4)
                c.setFillColor(colors.grey)
                c.drawString(cell_x + 1.5*mm, cell_y + row_h - 3*mm, label)

            if value:
                is_sheet = (label == "SHEET")
                font_size = 8 if is_sheet else 6
                c.setFont("Helvetica-Bold" if is_sheet else "Helvetica", font_size)
                c.setFillColor(colors.black)
                display_val = value[:15] if len(value) > 15 else value
                c.drawString(cell_x + 1.5*mm, cell_y + 2*mm, display_val)


# Legacy exports for compatibility
class TitleBlock(BandRenderer):
    """Legacy - now integrated into FooterRenderer."""
    def __init__(self, c, x, y, w, h, sheet, context: ProjectContext, config: SheetConfig):
        super().__init__(c, x, y, w, h, sheet, config)
        self.context = context

    def render(self):
        pass


class PlanBand(PlanViewBand):
    """Alias for PlanViewBand."""
    pass


class ProfileBand(BandRenderer):
    """Legacy - now integrated into BottomDataBandsRenderer."""
    def render(self):
        pass


class CrossingBand(BandRenderer):
    """Legacy - now integrated into BottomDataBandsRenderer."""
    def render(self):
        pass


class DataBand(BandRenderer):
    """Legacy - now integrated into BottomDataBandsRenderer."""
    def __init__(self, c, x, y, w, h, sheet, config, title, segments):
        super().__init__(c, x, y, w, h, sheet, config)
        self.title = title
        self.segments = segments

    def render(self):
        pass















