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
    """Read nodata value from an optional .json sidecar next to the raster."""
    sidecar = raster_file.with_suffix(raster_file.suffix + ".json")
    if not sidecar.exists():
        return None

    try:
        with open(sidecar, "r", encoding="utf-8") as f:
            meta = json.load(f)
        nodata = meta.get("nodata_value")
        if isinstance(nodata, (int, float)):
            return float(nodata)
    except Exception:
        return None
    return None


@lru_cache(maxsize=256)
def get_raster_band_profile(path: str) -> dict:
    """
    Inspect a raster once to determine band count and palette usage.
    Cached per file path to avoid repeated gdalinfo calls.
    """
    result = subprocess.run(["gdalinfo", "-json", path], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"gdalinfo failed for {path}: {result.stderr}")

    metadata = json.loads(result.stdout)
    bands = metadata.get("bands", [])
    color_interps = [band.get("colorInterpretation", "") for band in bands]
    has_palette = any(ci.lower() == "palette" for ci in color_interps)
    return {
        "band_count": len(bands),
        "color_interps": color_interps,
        "has_palette": has_palette,
    }


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


@router.get("/data/{project}/vectors/{layer}")
async def get_vector_layer(project: str, layer: str):
    """
    Get a vector layer as GeoJSON
    
    Converts GeoPackage to GeoJSON on-the-fly using ogr2ogr.
    Results are cached for performance.
    """
    project_path = get_project_path_or_404(project)
    
    # Look for the vector file (symlink or regular file)
    vectors_dir = project_path / "data" / "vectors"
    vector_file = vectors_dir / f"{layer}.gpkg"
    
    if not vector_file.exists():
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
    """Render a single raster tile as PNG using gdalwarp and gdal_translate."""
    min_x, min_y, max_x, max_y = mercator_tile_bounds(z, x, y)

    # Create two temp files: one for warp, one for PNG
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as warp_tmp:
        warp_path = Path(warp_tmp.name)
    
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as png_tmp:
        png_path = Path(png_tmp.name)

    nodata_value = read_nodata_from_sidecar(raster_file)
    band_profile = get_raster_band_profile(str(raster_file))
    band_count = band_profile["band_count"]
    has_palette = band_profile["has_palette"]
    
    # Determine if we need to add an alpha channel
    # We add alpha for 1-band (Gray) and 3-band (RGB) to ensure transparency outside bounds
    # We skip for 2-band (Gray+Alpha) and 4-band (RGBA) as they already have alpha
    # We skip for palette images as we handle them with -expand rgba
    add_alpha = False
    if not has_palette and (band_count == 1 or band_count == 3):
        add_alpha = True

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
        ]

        if add_alpha:
            warp_cmd.append("-dstalpha")

        if nodata_value is not None:
            nodata_str = str(nodata_value)
            warp_cmd.extend(["-srcnodata", nodata_str, "-dstnodata", nodata_str])

        warp_cmd.extend([str(raster_file), str(warp_path)])

        result = subprocess.run(warp_cmd, capture_output=True)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"gdalwarp failed: {result.stderr}")

        # Step 2: Convert to RGBA PNG using gdal_translate
        translate_cmd = [
            "gdal_translate",
            "-of", "PNG",
            "-outsize", "256", "256",
        ]

        if has_palette:
            translate_cmd.extend(["-expand", "rgba"])
        else:
            # If we added an alpha channel in Step 1, we must include it in the output
            # The alpha channel will be the last band in the warped file
            effective_band_count = band_count + 1 if add_alpha else band_count
            
            # Limit to 4 bands (RGBA) for PNG
            max_bands = max(1, min(effective_band_count, 4))
            
            for band_index in range(1, max_bands + 1):
                translate_cmd.extend(["-b", str(band_index)])
        
        # Add nodata metadata for grayscale/standard rasters (skip palette expansions)
        if nodata_value is not None and not has_palette:
            translate_cmd.extend(["-a_nodata", str(nodata_value)])
        
        translate_cmd.extend([str(warp_path), str(png_path)])

        result = subprocess.run(translate_cmd, capture_output=True)

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"gdal_translate failed: {result.stderr}")

        # Read the PNG
        with open(png_path, "rb") as f:
            return f.read()
            
    finally:
        # Cleanup temp files
        if warp_path.exists():
            os.unlink(warp_path)
        if png_path.exists():
            os.unlink(png_path)


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


@router.get("/tiles/{project}/{layer}/{z}/{x}/{y}.png")
async def get_raster_tile(project: str, layer: str, z: int, x: int, y: int):
    """
    Serve map tiles for raster datasets.

    Tiles are rendered on the fly in Web Mercator to align with MapLibre.
    """
    project_path = get_project_path_or_404(project)
    raster_file = project_path / "data" / "rasters" / f"{layer}.tif"

    if not raster_file.exists():
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
    """
    project_path = get_project_path_or_404(project)
    raster_file = project_path / "data" / "rasters" / f"{layer}.tif"

    if not raster_file.exists():
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


