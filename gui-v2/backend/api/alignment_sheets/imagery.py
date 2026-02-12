import io
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional, Tuple

import requests
from PIL import Image

try:
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, calculate_default_transform, reproject

    RASTERIO_AVAILABLE = True
except ImportError:
    RASTERIO_AVAILABLE = False

try:
    from pyproj import Transformer

    PYPROJ_AVAILABLE = True
except ImportError:
    PYPROJ_AVAILABLE = False

# ESRI World Imagery (Satellite)
# Attribution: Esri, Maxar, Earthstar Geographics, and the GIS User Community
TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"


def deg2num(lat_deg, lon_deg, zoom):
    """Convert Lat/Lon to Tile X/Y."""
    lat_rad = math.radians(lat_deg)
    n = 2.0 ** zoom
    xtile = int((lon_deg + 180.0) / 360.0 * n)
    ytile = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return (xtile, ytile)


def num2deg(xtile, ytile, zoom):
    """Convert Tile X/Y to Lat/Lon of NW corner."""
    n = 2.0 ** zoom
    lon_deg = xtile / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * ytile / n)))
    lat_deg = math.degrees(lat_rad)
    return (lat_deg, lon_deg)


class SatelliteImageryService:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir / "tiles"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        # Set a User-Agent to be polite
        self.session.headers.update({"User-Agent": "AGRS-Alignment-Generator/1.0"})

    def fetch_image_for_bbox(
        self,
        bbox_utm: Tuple[float, float, float, float],
        crs_epsg: int,
        output_path: Path,
        max_dim: int = 2000,
    ) -> Optional[Path]:
        """
        Fetch satellite imagery for the given bbox in project CRS, warp it to project CRS, and save as GeoTIFF.

        Args:
            bbox_utm: (min_x, min_y, max_x, max_y) in Project CRS (typically UTM).
            crs_epsg: The Project EPSG code.
            output_path: Where to save the resulting GeoTIFF.
            max_dim: Max dimension for the resulting image (to control zoom level).
        """
        if not RASTERIO_AVAILABLE or not PYPROJ_AVAILABLE:
            print("Warning: rasterio or pyproj not available. Skipping imagery.")
            return None

        # 1. Reproject BBox to WGS84 to determine Tiles
        transformer = Transformer.from_crs(f"epsg:{crs_epsg}", "epsg:4326", always_xy=True)
        min_x, min_y, max_x, max_y = bbox_utm

        lons, lats = transformer.transform(
            [min_x, max_x, max_x, min_x],
            [min_y, min_y, max_y, max_y],
        )
        min_lon, max_lon = min(lons), max(lons)
        min_lat, max_lat = min(lats), max(lats)

        # 2. Determine Zoom Level
        # Target z17 for good quality at typical FEED scales.
        zoom = 17

        # 3. Calculate Tile Ranges
        min_tx, min_ty = deg2num(max_lat, min_lon, zoom)  # Top-Left
        max_tx, max_ty = deg2num(min_lat, max_lon, zoom)  # Bottom-Right

        width_tiles = max_tx - min_tx + 1
        height_tiles = max_ty - min_ty + 1

        # Limit total tiles to prevent massive downloads
        if width_tiles * height_tiles > 64:
            zoom = 16
            min_tx, min_ty = deg2num(max_lat, min_lon, zoom)
            max_tx, max_ty = deg2num(min_lat, max_lon, zoom)
            width_tiles = max_tx - min_tx + 1
            height_tiles = max_ty - min_ty + 1

        # 4. Download Tiles and stitch
        tile_w, tile_h = 256, 256
        stitch_w = width_tiles * tile_w
        stitch_h = height_tiles * tile_h

        stitched_image = Image.new("RGB", (stitch_w, stitch_h))

        tasks = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            for x in range(min_tx, max_tx + 1):
                for y in range(min_ty, max_ty + 1):
                    tasks.append(executor.submit(self._download_tile, x, y, zoom))

            for future in as_completed(tasks):
                res = future.result()
                if res:
                    tx, ty, img = res
                    px = (tx - min_tx) * tile_w
                    py = (ty - min_ty) * tile_h
                    stitched_image.paste(img, (px, py))

        # 5. Georeference stitched image in Web Mercator
        nw_lat, nw_lon = num2deg(min_tx, min_ty, zoom)
        se_lat, se_lon = num2deg(max_tx + 1, max_ty + 1, zoom)

        transformer_wm = Transformer.from_crs("epsg:4326", "epsg:3857", always_xy=True)
        w, n = transformer_wm.transform(nw_lon, nw_lat)
        e, s = transformer_wm.transform(se_lon, se_lat)

        wm_transform = from_bounds(w, s, e, n, stitch_w, stitch_h)

        # 6. Warp to target CRS
        temp_wm = output_path.with_suffix(".wm.tif")
        with rasterio.open(
            temp_wm,
            "w",
            driver="GTiff",
            height=stitch_h,
            width=stitch_w,
            count=3,
            dtype="uint8",
            crs="EPSG:3857",
            transform=wm_transform,
        ) as dst:
            import numpy as np

            data = np.array(stitched_image)  # H, W, C
            data = np.moveaxis(data, 2, 0)  # C, H, W
            dst.write(data)

        with rasterio.open(temp_wm) as src:
            transform, width, height = calculate_default_transform(
                src.crs, f"epsg:{crs_epsg}", src.width, src.height, *src.bounds
            )
            kwargs = src.meta.copy()
            kwargs.update(
                {
                    "crs": f"epsg:{crs_epsg}",
                    "transform": transform,
                    "width": width,
                    "height": height,
                }
            )

            with rasterio.open(output_path, "w", **kwargs) as dst:
                for i in range(1, src.count + 1):
                    reproject(
                        source=rasterio.band(src, i),
                        destination=rasterio.band(dst, i),
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=f"epsg:{crs_epsg}",
                        resampling=Resampling.bilinear,
                    )

        if temp_wm.exists():
            temp_wm.unlink()
        return output_path

    def _download_tile(self, x, y, z) -> Optional[Tuple[int, int, Image.Image]]:
        url = TILE_URL.format(x=x, y=y, z=z)
        cache_file = self.cache_dir / f"{z}_{x}_{y}.jpg"

        if cache_file.exists():
            try:
                return x, y, Image.open(cache_file)
            except Exception:
                pass

        try:
            resp = self.session.get(url, timeout=5)
            if resp.status_code == 200:
                img_bytes = io.BytesIO(resp.content)
                img = Image.open(img_bytes)
                with open(cache_file, "wb") as f:
                    f.write(resp.content)
                return x, y, img
        except Exception:
            pass
        return None















