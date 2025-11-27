"""
Vector and Raster Data API Endpoints

Provides endpoints to serve project datasets.
"""

import io
import json
import math
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple
from urllib.request import urlopen

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response
from PIL import Image
import tifffile

from .project_utils import resolve_project_path

router = APIRouter()

# Cache for converted GeoJSON files
GEOJSON_CACHE = {}
TILE_CACHE_ROOT = Path(os.getenv("AGRS_TILE_CACHE_DIR", "/opt/agrs/gui-v2/backend/.tile_cache"))
_terrain_source_env = os.getenv("GLOBAL_TERRAIN_TILE_URL")
GLOBAL_TERRAIN_TILE_SOURCES = [
    src for src in [
        _terrain_source_env,
        "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        "https://storage.googleapis.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
    ] if src
]


def get_project_path_or_404(project: str) -> Path:
    """Resolve a project path or raise a 404 HTTPException."""
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Project '{project}' not found (missing project_metadata.json or pipeline_specs.json)"
        )
    return project_path


def _safe_segment(value: str) -> str:
    sanitized = value.replace("..", "__").replace("/", "_").strip()
    return sanitized or "default"


def _ensure_cache_root() -> None:
    TILE_CACHE_ROOT.mkdir(parents=True, exist_ok=True)


def _purge_directory_contents(directory: Path) -> None:
    if not directory.exists():
        return
    for child in directory.iterdir():
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            try:
                child.unlink()
            except FileNotFoundError:
                continue


def _ensure_version_dir(base_dir: Path, version: str) -> Path:
    """
    Ensure a cache directory exists for the current dataset version and
    drop stale versions to keep disk usage bounded.
    """
    _ensure_cache_root()
    version_dir = base_dir / version
    if version_dir.exists():
        return version_dir

    base_dir.mkdir(parents=True, exist_ok=True)
    _purge_directory_contents(base_dir)
    version_dir.mkdir(parents=True, exist_ok=True)
    return version_dir


def _write_cache_file(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with open(tmp_path, "wb") as tmp_file:
        tmp_file.write(data)
    os.replace(tmp_path, path)


def _tile_cache_path(kind: str, project: str, layer: str, mtime_ns: int, z: int, x: int, y: int) -> Path:
    base_dir = TILE_CACHE_ROOT / kind / _safe_segment(project) / _safe_segment(layer)
    version_dir = _ensure_version_dir(base_dir, str(int(mtime_ns)))
    tile_dir = version_dir / str(z) / str(x)
    tile_dir.mkdir(parents=True, exist_ok=True)
    return tile_dir / f"{y}.png"


def _vector_cache_file(project: str, layer: str, mtime_ns: int) -> Path:
    base_dir = TILE_CACHE_ROOT / "vectors" / _safe_segment(project) / _safe_segment(layer)
    return base_dir / f"{int(mtime_ns)}.geojson"


def _parse_hstore(hstore_str: str) -> dict:
    """
    Parse PostgreSQL/OSM hstore format string into a dictionary.
    Format: "key1"=>"value1","key2"=>"value2"
    """
    if not hstore_str:
        return {}
    
    result = {}
    # Match "key"=>"value" pairs
    import re
    pattern = r'"([^"]+)"=>"([^"]*)"'
    matches = re.findall(pattern, hstore_str)
    for key, value in matches:
        result[key] = value
    return result


def _expand_other_tags(geojson_data: dict) -> dict:
    """
    Previously expanded the 'other_tags' hstore column from OSM data into individual columns.
    Now disabled to preserve the original attribute structure as requested by the user.
    The attributes table should display exactly as the raw data is structured.
    """
    # Return data unchanged - preserve original attribute structure
    return geojson_data


def _dataset_mtime(path: Path) -> Tuple[float, int]:
    stat_info = path.stat()
    mtime = stat_info.st_mtime
    mtime_ns = getattr(stat_info, "st_mtime_ns", int(mtime * 1_000_000_000))
    return mtime, int(mtime_ns)


def _dataset_latlon_bounds(path: Path) -> Tuple[float, float, float, float]:
    """
    Return dataset bounds in WGS84 (min_lon, min_lat, max_lon, max_lat).
    """
    result = subprocess.run(["gdalinfo", "-json", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"gdalinfo failed for {path}: {result.stderr}")

    metadata = json.loads(result.stdout)
    corners = metadata.get("cornerCoordinates")
    if corners:
        lons = [corner[0] for corner in corners.values()]
        lats = [corner[1] for corner in corners.values()]
        return min(lons), min(lats), max(lons), max(lats)

    extent_coords = (
        metadata.get("wgs84Extent", {})
        .get("coordinates", [[]])
    )
    if extent_coords and extent_coords[0]:
        lons = [pt[0] for pt in extent_coords[0]]
        lats = [pt[1] for pt in extent_coords[0]]
        return min(lons), min(lats), max(lons), max(lats)

    # Fallback: entire world
    return -180.0, -85.0, 180.0, 85.0


def _lonlat_to_tile(lon: float, lat: float, zoom: int) -> Tuple[int, int]:
    lat = max(min(lat, 85.05112878), -85.05112878)
    n = 2 ** zoom
    x_tile = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y_tile = int((1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    x_tile = min(max(x_tile, 0), n - 1)
    y_tile = min(max(y_tile, 0), n - 1)
    return x_tile, y_tile


def _tile_range_for_bounds(bounds: Tuple[float, float, float, float], zoom: int) -> Tuple[int, int, int, int]:
    min_lon, min_lat, max_lon, max_lat = bounds
    x_min, y_max = _lonlat_to_tile(min_lon, min_lat, zoom)
    x_max, y_min = _lonlat_to_tile(max_lon, max_lat, zoom)
    if x_min > x_max:
        x_min, x_max = x_max, x_min
    if y_min > y_max:
        y_min, y_max = y_max, y_min
    return x_min, x_max, y_min, y_max


def precache_tiles(project: str, layer: str, min_zoom: int, max_zoom: int, *, terrain: bool = False) -> None:
    """
    Pre-generate tile PNGs for a given dataset and zoom range,
    storing them in the persistent tile cache.
    """
    if min_zoom > max_zoom:
        raise ValueError("min_zoom must be <= max_zoom")

    project_path = get_project_path_or_404(project)
    raster_file = project_path / "data" / "rasters" / f"{layer}.tif"
    if not raster_file.exists():
        raise FileNotFoundError(f"Raster layer '{layer}' not found for project '{project}'")

    bounds = _dataset_latlon_bounds(raster_file)
    mtime, mtime_ns = _dataset_mtime(raster_file)
    cache_kind = "terrain" if terrain else "rasters"
    total_tiles = 0

    for zoom in range(min_zoom, max_zoom + 1):
        x_min, x_max, y_min, y_max = _tile_range_for_bounds(bounds, zoom)
        zoom_tiles = (x_max - x_min + 1) * (y_max - y_min + 1)
        print(f"[precache] z={zoom}: generating up to {zoom_tiles} tiles for {layer}")
        for x in range(x_min, x_max + 1):
            for y in range(y_min, y_max + 1):
                cache_path = _tile_cache_path(cache_kind, project, layer, mtime_ns, zoom, x, y)
                if cache_path.exists():
                    continue
                try:
                    if terrain:
                        tile_bytes = _cached_terrain_tile(str(raster_file), zoom, x, y, mtime)
                    else:
                        tile_bytes = _cached_raster_tile(str(raster_file), zoom, x, y, mtime)
                    _write_cache_file(cache_path, tile_bytes)
                except Exception as exc:
                    print(f"[precache] failed tile z={zoom} x={x} y={y}: {exc}")
                    continue
                total_tiles += 1

    print(f"[precache] completed for {project}/{layer}: {total_tiles} tiles written to cache.")


def mercator_tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """
    Calculate Web Mercator bounds for a given XYZ tile.
    Returns (minx, miny, maxx, maxy) in EPSG:3857 meters.
    """
    n = 2 ** z
    lon_left = x / n * 360.0 - 180.0
    lon_right = (x + 1) / n * 360.0 - 180.0

    def lat_for_tile(y_val: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y_val / n))))

    lat_top = lat_for_tile(y)
    lat_bottom = lat_for_tile(y + 1)

    def to_mercator(lon: float, lat: float) -> tuple[float, float]:
        # Clamp latitude to Web Mercator valid range
        lat = max(min(lat, 85.05112878), -85.05112878)
        x_merc = lon * 20037508.342789244 / 180.0
        y_merc = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137.0
        return x_merc, y_merc

    min_x, max_y = to_mercator(lon_left, lat_top)
    max_x, min_y = to_mercator(lon_right, lat_bottom)

    return min_x, min_y, max_x, max_y


def read_nodata_from_sidecar(raster_file: Path) -> Optional[float]:
    """Read nodata value from metadata sidecar or fall back to GDAL metadata."""
    sidecar = raster_file.with_suffix(raster_file.suffix + ".json")
    if sidecar.exists():
        try:
            with open(sidecar, "r", encoding="utf-8") as f:
                meta = json.load(f)
            nodata = meta.get("nodata_value")
            if isinstance(nodata, (int, float)):
                return float(nodata)
        except Exception:
            pass

    # Fallback to gdalinfo metadata
    try:
        result = subprocess.run(["gdalinfo", "-json", str(raster_file)], capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            return None
        metadata = json.loads(result.stdout)
        bands = metadata.get("bands", [])
        if bands:
            nodata = bands[0].get("noDataValue")
            if isinstance(nodata, (int, float)):
                return float(nodata)
    except Exception:
        return None
    return None


@lru_cache(maxsize=256)
def get_raster_band_profile(path: str) -> dict:
    """
    Inspect a raster once to determine band count, data type, and palette usage.
    Cached per file path to avoid repeated gdalinfo calls.
    """
    result = subprocess.run(["gdalinfo", "-json", path], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"gdalinfo failed for {path}: {result.stderr}")

    metadata = json.loads(result.stdout)
    bands = metadata.get("bands", [])
    color_interps = [band.get("colorInterpretation", "") for band in bands]
    has_palette = any(ci.lower() == "palette" for ci in color_interps)
    
    # Get data type from first band
    data_type = "Byte"
    if bands:
        data_type = bands[0].get("type", "Byte")
    
    return {
        "band_count": len(bands),
        "color_interps": color_interps,
        "has_palette": has_palette,
        "data_type": data_type,
    }


@lru_cache(maxsize=256)
def _get_raster_statistics(path: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Get global min/max statistics for a raster.
    Uses gdalinfo -stats to compute or retrieve statistics.
    Returns (min, max) tuple or (None, None) if unavailable.
    """
    try:
        # First try to get stats from existing metadata
        result = subprocess.run(
            ["gdalinfo", "-json", "-stats", path], 
            capture_output=True, 
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            return None, None
        
        metadata = json.loads(result.stdout)
        bands = metadata.get("bands", [])
        if not bands:
            return None, None
        
        band = bands[0]
        
        # Try to get min/max from statistics
        stat_min = band.get("minimum")
        stat_max = band.get("maximum")
        
        if stat_min is not None and stat_max is not None:
            return float(stat_min), float(stat_max)
        
        # Try computedMin/computedMax
        stat_min = band.get("computedMin")
        stat_max = band.get("computedMax")
        
        if stat_min is not None and stat_max is not None:
            return float(stat_min), float(stat_max)
        
        return None, None
    except Exception:
        return None, None


@lru_cache(maxsize=1024)
def fetch_global_terrain(z: int, x: int, y: int) -> Optional[np.ndarray]:
    """Fetch low-resolution global DEM (Terrarium encoding) for fallback coverage."""
    if not GLOBAL_TERRAIN_TILE_SOURCES:
        return None

    for template in GLOBAL_TERRAIN_TILE_SOURCES:
        url = template.format(z=z, x=x, y=y)
        try:
            with urlopen(url, timeout=6) as resp:
                data = resp.read()
            img = Image.open(io.BytesIO(data)).convert("RGB")
            arr = np.asarray(img, dtype=np.float32)
            r = arr[:, :, 0]
            g = arr[:, :, 1]
            b = arr[:, :, 2]
            elevation = (r * 256.0 + g + b / 256.0) - 32768.0
            return elevation.astype(np.float32)
        except Exception as exc:
            print(f"[terrain:fallback] Failed to fetch fallback tile {url}: {exc}")
            continue
    return None


def _build_display_name_from_metadata(metadata: dict, fallback_name: str) -> str:
    """
    Build display name from metadata JSON sidecar.
    Format: {category}_{dataset_name}_{target_crs}_processed
    Where dataset_name has spaces replaced with hyphens.
    target_crs is formatted as EPSGnumber (no colon).
    """
    category = metadata.get("category", "")
    dataset_name = metadata.get("dataset_name", "")
    target_crs = metadata.get("target_crs", "")
    
    # Clean up dataset_name - remove "(Processed)" suffix if present
    if dataset_name.endswith(" (Processed)"):
        dataset_name = dataset_name[:-12]
    
    # Replace spaces with hyphens
    dataset_name = dataset_name.replace(" ", "-")
    
    # Format CRS as EPSGnumber (remove colon)
    # e.g., "EPSG:32633" -> "EPSG32633"
    target_crs = target_crs.replace(":", "")
    
    # Build the display name
    if category and dataset_name and target_crs:
        return f"{category}_{dataset_name}_{target_crs}_processed"
    
    # Fallback to the filename-based approach
    return fallback_name


def _find_vector_file(project_path: Path, layer: str) -> Optional[Path]:
    """
    Find a vector file by layer name (display name or filename-based name).
    Checks processed/ first, then legacy location.
    """
    import re
    vectors_processed_dir = project_path / "data" / "vectors" / "processed"
    vectors_dir = project_path / "data" / "vectors"
    
    # Try processed/ first (canonical location)
    if vectors_processed_dir.exists():
        # Try exact filename match
        candidate = vectors_processed_dir / f"{layer}.gpkg"
        if candidate.exists():
            return candidate
        
        # Search by display name (from metadata) or filename pattern
        for item in vectors_processed_dir.iterdir():
            if item.suffix == '.gpkg':
                # Check metadata-based display name
                metadata_file = item.with_name(f"{item.name}.json")
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                        raw_name = item.stem
                        fallback = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                        fallback = re.sub(r'_processed$', '', fallback, flags=re.IGNORECASE)
                        display_name = _build_display_name_from_metadata(metadata, fallback)
                        if display_name == layer:
                            return item
                    except Exception:
                        pass
                
                # Also check filename-based pattern
                raw_name = item.stem
                fallback_name = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                fallback_name = re.sub(r'_processed$', '', fallback_name, flags=re.IGNORECASE)
                if fallback_name == layer:
                    return item
    
    # Fallback to legacy location
    legacy_file = vectors_dir / f"{layer}.gpkg"
    if legacy_file.exists():
        return legacy_file
    
    return None


@router.get("/data/{project}/vectors/{layer}")
async def get_vector_layer(project: str, layer: str):
    """
    Get a vector layer as GeoJSON
    
    Converts GeoPackage to GeoJSON on-the-fly using ogr2ogr.
    Results are cached for performance.
    
    Looks in data/vectors/processed/ first (canonical location),
    then falls back to data/vectors/ for legacy symlinks.
    Matches by display name (from metadata) or filename pattern.
    """
    project_path = get_project_path_or_404(project)
    
    vector_file = _find_vector_file(project_path, layer)
    
    if vector_file is None or not vector_file.exists():
        raise HTTPException(status_code=404, detail=f"Vector layer '{layer}' not found in project '{project}'")
    
    cache_key = f"{project}:{layer}"
    vector_mtime, vector_mtime_ns = _dataset_mtime(vector_file)

    # In-memory cache
    if cache_key in GEOJSON_CACHE:
        return JSONResponse(content=GEOJSON_CACHE[cache_key])

    # Persistent cache
    cache_file = _vector_cache_file(project, layer, vector_mtime_ns)
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as cached:
                geojson_data = json.load(cached)
            GEOJSON_CACHE[cache_key] = geojson_data
            return JSONResponse(content=geojson_data)
        except Exception:
            # Fall through to regenerate if cache read fails
            pass
    
    try:
        # Convert GPKG to GeoJSON using ogr2ogr
        with tempfile.NamedTemporaryFile(mode='w', suffix='.geojson', delete=False) as tmp_file:
            tmp_path = tmp_file.name

        # Ensure the path is free before ogr2ogr writes
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

        # Run ogr2ogr to convert GPKG to GeoJSON
        cmd = [
            'ogr2ogr',
            '-f', 'GeoJSON',
            '-t_srs', 'EPSG:4326',  # Convert to WGS84 for web display
            tmp_path,
            str(vector_file)
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise Exception(f"ogr2ogr failed: {result.stderr}")
        
        # Read the generated GeoJSON
        with open(tmp_path, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        # Expand other_tags hstore column into proper attributes (for OSM data)
        geojson_data = _expand_other_tags(geojson_data)
        
        # Cache the result
        GEOJSON_CACHE[cache_key] = geojson_data

        if not cache_file.exists():
            cache_dir = cache_file.parent
            cache_dir.mkdir(parents=True, exist_ok=True)
            _purge_directory_contents(cache_dir)
            cache_dir.mkdir(parents=True, exist_ok=True)
        try:
            with open(cache_file, "w", encoding="utf-8") as cached:
                json.dump(geojson_data, cached)
        except Exception:
            # Disk cache failures should not impact response
            pass
        
        return JSONResponse(content=geojson_data)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to convert vector layer: {str(e)}")


def render_raster_tile(raster_file: Path, z: int, x: int, y: int) -> bytes:
    """Render a single raster tile as PNG using gdalwarp and numpy for color mapping."""
    min_x, min_y, max_x, max_y = mercator_tile_bounds(z, x, y)

    # Create temp file for warp
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as warp_tmp:
        warp_path = Path(warp_tmp.name)

    nodata_value = read_nodata_from_sidecar(raster_file)
    band_profile = get_raster_band_profile(str(raster_file))
    band_count = band_profile["band_count"]
    has_palette = band_profile["has_palette"]
    data_type = band_profile.get("data_type", "Byte")
    
    # Check if this is a continuous data raster (like DEM) that needs color scaling
    # Float32/Float64 single-band rasters are typically DEMs or other continuous data
    is_continuous_data = (
        band_count == 1 
        and not has_palette 
        and data_type in ("Float32", "Float64", "Int16", "Int32", "UInt16", "UInt32")
    )

    try:
        # Step 1: Warp to Web Mercator extent
        warp_cmd = [
            "gdalwarp",
            "-t_srs", "EPSG:3857",
            "-te", str(min_x), str(min_y), str(max_x), str(max_y),
            "-te_srs", "EPSG:3857",
            "-ts", "256", "256",
            "-r", "bilinear",
            "-of", "GTiff",
            "-dstalpha",
        ]

        if nodata_value is not None:
            nodata_str = str(nodata_value)
            warp_cmd.extend(["-srcnodata", nodata_str, "-dstnodata", nodata_str])

        warp_cmd.extend([str(raster_file), str(warp_path)])

        result = subprocess.run(warp_cmd, capture_output=True)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"gdalwarp failed: {result.stderr}")

        alpha_mask = _read_alpha_mask(warp_path)

        # For continuous data (DEMs, etc.), use numpy for proper color scaling
        if is_continuous_data:
            global_min, global_max = _get_raster_statistics(str(raster_file))
            return _render_continuous_raster_tile(
                warp_path, nodata_value, global_min, global_max, alpha_mask
            )

        # For palette or multi-band rasters, use gdal_translate
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as png_tmp:
            png_path = Path(png_tmp.name)
        
        try:
            # Determine if we need to add an alpha channel
            add_alpha = not has_palette and (band_count == 1 or band_count == 3)
            
            if add_alpha:
                # Re-warp with alpha
                warp_cmd_alpha = warp_cmd[:-2] + ["-dstalpha"] + warp_cmd[-2:]
                result = subprocess.run(warp_cmd_alpha, capture_output=True)
            
            translate_cmd = [
                "gdal_translate",
                "-of", "PNG",
                "-outsize", "256", "256",
            ]

            if has_palette:
                translate_cmd.extend(["-expand", "rgba"])
            else:
                total_bands = band_count + 1  # extra alpha band
                max_bands = max(1, min(total_bands, 4))
                for band_index in range(1, max_bands + 1):
                    translate_cmd.extend(["-b", str(band_index)])

            if nodata_value is not None and not has_palette:
                translate_cmd.extend(["-a_nodata", str(nodata_value)])
            
            translate_cmd.extend([str(warp_path), str(png_path)])

            result = subprocess.run(translate_cmd, capture_output=True)

            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"gdal_translate failed: {result.stderr}")

            tile_bytes = _apply_alpha_mask_to_png(png_path, alpha_mask)
            return tile_bytes
        finally:
            if png_path.exists():
                os.unlink(png_path)
            
    finally:
        if warp_path.exists():
            os.unlink(warp_path)


def _render_continuous_raster_tile(
    warp_path: Path,
    nodata_value: Optional[float],
    global_min: Optional[float] = None,
    global_max: Optional[float] = None,
    alpha_mask: Optional[np.ndarray] = None,
) -> bytes:
    """
    Render a continuous data raster (DEM, etc.) with proper color scaling.
    Uses a terrain color ramp for elevation-like data.
    
    If global_min/global_max are provided, uses those for normalization
    to ensure consistent colors across all tiles.
    """
    # Read the warped tile
    with tifffile.TiffFile(warp_path) as tif:
        arr = tif.asarray()

    # Handle alpha band if present
    alpha_band = None
    if arr.ndim == 3:
        if arr.shape[0] <= 4 and arr.shape[0] < arr.shape[-1]:
            data = arr[0].astype(np.float32)
            alpha_band = arr[-1]
        else:
            data = arr[:, :, 0].astype(np.float32)
            if arr.shape[2] > 1:
                alpha_band = arr[:, :, -1]
    elif arr.ndim == 2:
        data = arr.astype(np.float32)
    else:
        data = arr[0].astype(np.float32)
    
    # Create mask for valid data
    mask = np.ones_like(data, dtype=bool)
    if alpha_mask is None and alpha_band is not None:
        alpha_mask = alpha_band
    if alpha_mask is not None:
        mask &= alpha_mask > 0

    if nodata_value is not None:
        mask &= data != nodata_value
    mask &= ~np.isnan(data)
    mask &= ~np.isinf(data)
    
    # If no valid data, return transparent tile
    if not mask.any():
        rgba = np.zeros((256, 256, 4), dtype=np.uint8)
        buffer = io.BytesIO()
        Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", compress_level=6)
        return buffer.getvalue()
    
    # Use global min/max if provided, otherwise compute from tile
    if global_min is not None and global_max is not None:
        data_min = global_min
        data_max = global_max
    else:
        valid_data = data[mask]
        data_min = float(np.min(valid_data))
        data_max = float(np.max(valid_data))
    
    # Avoid division by zero
    if data_max == data_min:
        data_max = data_min + 1.0
    
    # Normalize to 0-1 using global range
    normalized = np.zeros_like(data)
    normalized[mask] = (data[mask] - data_min) / (data_max - data_min)
    normalized = np.clip(normalized, 0, 1)
    
    # Apply grayscale mapping (ArcGIS default style)
    # Low elevation = Black (0), High elevation = White (255)
    gray = (normalized * 255).astype(np.uint8)
    
    height, width = normalized.shape
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    
    rgba[:, :, 0] = gray
    rgba[:, :, 1] = gray
    rgba[:, :, 2] = gray
    rgba[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    
    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()


def _read_alpha_mask(warp_path: Path) -> Optional[np.ndarray]:
    try:
        with tifffile.TiffFile(warp_path) as tif:
            arr = tif.asarray()
    except Exception:
        return None

    mask = None
    if arr.ndim == 3:
        if arr.shape[0] <= 4 and arr.shape[0] < arr.shape[-1]:
            mask = arr[-1]
        else:
            mask = arr[:, :, -1]
    elif arr.ndim == 2:
        mask = np.full(arr.shape, 255, dtype=np.uint8)
    else:
        mask = arr[-1]

    if mask is None:
        return None

    mask = np.clip(mask, 0, 255).astype(np.uint8)
    return mask


def _apply_alpha_mask_to_png(png_path: Path, mask: Optional[np.ndarray]) -> bytes:
    with open(png_path, "rb") as f:
        png_bytes = f.read()

    if mask is None:
        return png_bytes

    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    rgba = np.array(img)

    if mask.shape != rgba.shape[:2]:
        mask_img = Image.fromarray(mask)
        mask = np.array(mask_img.resize((rgba.shape[1], rgba.shape[0]), Image.NEAREST))

    new_alpha = (rgba[:, :, 3].astype(np.uint16) * mask.astype(np.uint16) // 255).astype(np.uint8)
    rgba[:, :, 3] = new_alpha

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()


def encode_mapbox_terrain(elevation: np.ndarray, nodata_value: float) -> np.ndarray:
    """Convert elevation array (meters) into Mapbox terrain-RGB encoding."""
    data = np.array(elevation, dtype=np.float32)
    mask = np.ones_like(data, dtype=bool)

    if nodata_value is not None:
        mask &= data != nodata_value

    mask &= ~np.isnan(data)

    clipped = np.clip(np.nan_to_num(data, nan=nodata_value if nodata_value is not None else -32768.0), -10000.0, 9000.0)
    encoded = np.round((clipped + 10000.0) * 10.0).astype(np.uint32)
    encoded[~mask] = 0

    r = ((encoded >> 16) & 255).astype(np.uint8)
    g = ((encoded >> 8) & 255).astype(np.uint8)
    b = (encoded & 255).astype(np.uint8)
    a = np.where(mask, 255, 0).astype(np.uint8)

    return np.dstack([r, g, b, a])


def render_terrain_tile(raster_file: Path, z: int, x: int, y: int) -> bytes:
    """Render a DEM tile encoded as Mapbox terrain RGB."""
    min_x, min_y, max_x, max_y = mercator_tile_bounds(z, x, y)

    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp_file:
        tmp_path = Path(tmp_file.name)

    nodata_value = read_nodata_from_sidecar(raster_file)
    if nodata_value is None:
        nodata_value = -32768.0

    cmd = [
        "gdalwarp",
        "-t_srs", "EPSG:3857",
        "-te", str(min_x), str(min_y), str(max_x), str(max_y),
        "-te_srs", "EPSG:3857",
        "-ts", "256", "256",
        "-r", "bilinear",
        "-of", "GTiff",
        "-ot", "Float32",
        "-dstnodata", str(nodata_value),
        str(raster_file),
        str(tmp_path),
    ]

    result = subprocess.run(cmd, capture_output=True)

    if result.returncode != 0:
        try:
            os.unlink(tmp_path)
        finally:
            raise HTTPException(status_code=500, detail=f"gdalwarp failed: {result.stderr}")

    try:
        with tifffile.TiffFile(tmp_path) as tif:
            elevation = tif.asarray()
    finally:
        os.unlink(tmp_path)

    mask = np.isnan(elevation)
    if nodata_value is not None:
        mask |= elevation == nodata_value

    if mask.any():
        fallback = fetch_global_terrain(z, x, y)
        if fallback is not None:
            if fallback.shape != elevation.shape:
                # Should not happen, but ensure shapes align
                fallback = np.resize(fallback, elevation.shape)
            elevation = elevation.copy()
            elevation[mask] = fallback[mask]
            mask = np.isnan(elevation)

    rgba = encode_mapbox_terrain(elevation, nodata_value if nodata_value is not None else -32768.0)
    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", compress_level=6)
    return buffer.getvalue()


@lru_cache(maxsize=256)
def _cached_raster_tile(path: str, z: int, x: int, y: int, mtime: float) -> bytes:
    return render_raster_tile(Path(path), z, x, y)


@lru_cache(maxsize=256)
def _cached_terrain_tile(path: str, z: int, x: int, y: int, mtime: float) -> bytes:
    return render_terrain_tile(Path(path), z, x, y)


def _find_raster_file(project_path: Path, layer: str) -> Optional[Path]:
    """
    Find a raster file by layer name (display name or filename-based name).
    Checks processed/ first, then legacy location.
    """
    import re
    rasters_processed_dir = project_path / "data" / "rasters" / "processed"
    rasters_dir = project_path / "data" / "rasters"
    
    # Try processed/ first (canonical location)
    if rasters_processed_dir.exists():
        # Try exact filename match
        candidate = rasters_processed_dir / f"{layer}.tif"
        if candidate.exists():
            return candidate
        
        # Search by display name (from metadata) or filename pattern
        for item in rasters_processed_dir.iterdir():
            if item.suffix == '.tif':
                # Check metadata-based display name
                metadata_file = item.with_name(f"{item.name}.json")
                if metadata_file.exists():
                    try:
                        with open(metadata_file, 'r') as f:
                            metadata = json.load(f)
                        raw_name = item.stem
                        fallback = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                        fallback = re.sub(r'_processed$', '', fallback, flags=re.IGNORECASE)
                        display_name = _build_display_name_from_metadata(metadata, fallback)
                        if display_name == layer:
                            return item
                    except Exception:
                        pass
                
                # Also check filename-based pattern
                raw_name = item.stem
                fallback_name = re.sub(r'_epsg\d+_processed$', '', raw_name, flags=re.IGNORECASE)
                fallback_name = re.sub(r'_processed$', '', fallback_name, flags=re.IGNORECASE)
                if fallback_name == layer:
                    return item
    
    # Fallback to legacy location
    legacy_file = rasters_dir / f"{layer}.tif"
    if legacy_file.exists():
        return legacy_file
    
    return None


@router.get("/tiles/{project}/{layer}/{z}/{x}/{y}.png")
async def get_raster_tile(project: str, layer: str, z: int, x: int, y: int):
    """
    Serve map tiles for raster datasets.

    Tiles are rendered on the fly in Web Mercator to align with MapLibre.
    Looks in data/rasters/processed/ first (canonical), then legacy location.
    """
    project_path = get_project_path_or_404(project)
    raster_file = _find_raster_file(project_path, layer)

    if raster_file is None or not raster_file.exists():
        raise HTTPException(status_code=404, detail=f"Raster layer '{layer}' not found in project '{project}'")

    try:
        mtime, mtime_ns = _dataset_mtime(raster_file)
        cache_path = _tile_cache_path("rasters", project, layer, mtime_ns, z, x, y)

        if cache_path.exists():
            with open(cache_path, "rb") as cached_tile:
                return Response(content=cached_tile.read(), media_type="image/png")

        tile_bytes = _cached_raster_tile(str(raster_file), z, x, y, mtime)
        try:
            _write_cache_file(cache_path, tile_bytes)
        except Exception:
            pass
        return Response(content=tile_bytes, media_type="image/png")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to render raster tile: {exc}")


@router.get("/terrain/{project}/{layer}/{z}/{x}/{y}.png")
async def get_terrain_tile(project: str, layer: str, z: int, x: int, y: int):
    """
    Serve terrain tiles encoded as Mapbox Terrain-RGB for DEM layers.
    Looks in data/rasters/processed/ first (canonical), then legacy location.
    """
    project_path = get_project_path_or_404(project)
    raster_file = _find_raster_file(project_path, layer)

    if raster_file is None or not raster_file.exists():
        raise HTTPException(status_code=404, detail=f"Raster layer '{layer}' not found in project '{project}'")

    try:
        mtime, mtime_ns = _dataset_mtime(raster_file)
        cache_path = _tile_cache_path("terrain", project, layer, mtime_ns, z, x, y)

        if cache_path.exists():
            with open(cache_path, "rb") as cached_tile:
                return Response(content=cached_tile.read(), media_type="image/png")

        tile_bytes = _cached_terrain_tile(str(raster_file), z, x, y, mtime)
        try:
            _write_cache_file(cache_path, tile_bytes)
        except Exception:
            pass
        return Response(content=tile_bytes, media_type="image/png")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to render terrain tile: {exc}")


@router.get("/data/{project}/aoi/{filename}")
async def get_aoi_file(project: str, filename: str):
    """
    Get AOI files like start/end points in KMZ/KML format.
    """
    project_path = get_project_path_or_404(project)
    aoi_dir = project_path / "aoi"
    file_path = aoi_dir / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found in AOI folder of project '{project}'")

    # Determine media type
    suffix = file_path.suffix.lower()
    media_type = "application/octet-stream"
    if suffix == ".kml":
        media_type = "application/vnd.google-earth.kml+xml"
    elif suffix == ".kmz":
        media_type = "application/vnd.google-earth.kmz"
    elif suffix == ".json" or suffix == ".geojson":
        media_type = "application/json"

    with open(file_path, "rb") as f:
        content = f.read()

    return Response(content=content, media_type=media_type)



@router.delete("/data/cache")
async def clear_cache():
    """
    Clear the GeoJSON conversion cache and on-disk tile caches.
    """
    global GEOJSON_CACHE
    cache_size = len(GEOJSON_CACHE)
    GEOJSON_CACHE = {}

    disk_entries_removed = 0
    if TILE_CACHE_ROOT.exists():
        try:
            disk_entries_removed = sum(1 for _ in TILE_CACHE_ROOT.iterdir())
        except Exception:
            disk_entries_removed = 0
        shutil.rmtree(TILE_CACHE_ROOT, ignore_errors=True)
    _ensure_cache_root()
    
    return {
        "message": f"Cache cleared ({cache_size} memory entries, {disk_entries_removed} disk namespaces)",
        "status": "success"
    }


