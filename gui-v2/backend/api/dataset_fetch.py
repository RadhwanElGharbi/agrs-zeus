"""
Dataset Fetch Orchestration API

Implements the ZEUS dataset fetching workflow described in
DATASET_FETCHING_PROTOCOLS.md. Provides REST endpoints to inspect dataset
readiness for a project and to launch compliant fetch + processing jobs that
cover the minimum PIRL training requirements (DEM, landcover, soil, geohazard,
roads, railways, powerlines, waterways, pipelines).
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from textwrap import dedent
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .project_utils import resolve_project_path
from .projects import DATASET_FETCH_PROTOCOL, _infer_project_iso3  # type: ignore

router = APIRouter(tags=["dataset_fetch"])

ZEUS_BIN = Path(os.getenv("AGRS_ZEUS_BIN", "/opt/agrs/build/zeus"))
GDALWARP_BIN = os.getenv("GDALWARP_BIN", "gdalwarp")
OGR2OGR_BIN = os.getenv("OGR2OGR_BIN", "ogr2ogr")
GDALINFO_BIN = os.getenv("GDALINFO_BIN", "gdalinfo")
OGRINFO_BIN = os.getenv("OGRINFO_BIN", "ogrinfo")
COPERNICUS_BASE_URL = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com"
COPERNICUS_PRODUCT = "Copernicus_DSM_COG_10"
PROTOCOL_VERSION = "1.0"
SOIL_DEFAULT_DEPTH = "0-5cm"
PROTOCOL_PATH = Path(DATASET_FETCH_PROTOCOL)

_AGENT_FLAG = os.getenv("ZEUS_AGENT_ENABLED", "1").strip().lower()
AGENT_ENABLED = _AGENT_FLAG not in {"0", "false", "no"}
AGENT_MODEL = os.getenv("ZEUS_AGENT_MODEL", "claude-opus-4-5-20251101")
try:
    AGENT_MAX_STEPS = max(1, int(os.getenv("ZEUS_AGENT_MAX_STEPS", "500")))
except ValueError:
    AGENT_MAX_STEPS = 500
try:
    AGENT_MAX_RETRIES = max(1, int(os.getenv("ZEUS_AGENT_MAX_RETRIES", "8")))
except ValueError:
    AGENT_MAX_RETRIES = 8

_ZEUS_VERSION_CACHE: Optional[str] = None
_PROTOCOL_TEXT_CACHE: Optional[str] = None

_EXTENT_RE = re.compile(
    r"Extent:\s*\(([-0-9\.]+),\s*([-0-9\.]+)\)\s*-\s*\(([-0-9\.]+),\s*([-0-9\.]+)\)"
)

CommandBuilder = Callable[["FetchContext", Path, Path, Optional[str]], List[str]]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_iso() -> str:
    return _utc_now().isoformat().replace("+00:00", "Z")


@dataclass
class DatasetDefinition:
    key: str
    label: str
    dataset_type: Literal["raster", "vector"]
    raw_filename: str
    processed_basename: str
    processed_extension: str
    symlink_name: str
    fetch_tool: str
    command_builder: CommandBuilder
    resampling: str = "bilinear"
    nodata: Optional[float] = None
    required: bool = True
    description: str = ""

    def _base_dir(self, ctx: "FetchContext") -> Path:
        return ctx.project_path / "data" / ("rasters" if self.dataset_type == "raster" else "vectors")

    def get_raw_filename(self, override: Optional[str] = None) -> str:
        """Get raw filename, potentially modified based on override for DEM datasets."""
        if self.key == "dem" and override:
            # Dynamic filename based on DEM source
            if _is_3dep_override(override):
                return "dem_usgs_3dep_1m_raw.tif"
            elif "tinitaly" in override.lower():
                return "dem_tinitaly_10m_raw.tif"
            elif "eea" in override.lower() or "cop10" in override.lower():
                return "dem_copernicus_eea10_raw.tif"
            elif "srtm" in override.lower():
                return "dem_srtm_30m_raw.tif"
            elif _is_copernicus_override(override):
                return "dem_copernicus_30m_raw.tif"
        return self.raw_filename

    def raw_path(self, ctx: "FetchContext", override: Optional[str] = None) -> Path:
        return self._base_dir(ctx) / "raw" / self.get_raw_filename(override)

    def processed_path(self, ctx: "FetchContext") -> Path:
        processed_name = f"{self.processed_basename}_epsg{ctx.target_epsg}_processed.{self.processed_extension}"
        return self._base_dir(ctx) / "processed" / processed_name

    def symlink_path(self, ctx: "FetchContext") -> Path:
        return self._base_dir(ctx) / self.symlink_name

    def raw_metadata_path(self, ctx: "FetchContext", override: Optional[str] = None) -> Path:
        raw = self.raw_path(ctx, override)
        return raw.with_suffix(raw.suffix + ".json")

    def processed_metadata_path(self, ctx: "FetchContext") -> Path:
        proc = self.processed_path(ctx)
        return proc.with_suffix(proc.suffix + ".json")


@dataclass
class FetchContext:
    project: str
    project_path: Path
    target_epsg: int
    target_crs_name: Optional[str]
    iso3: Optional[str]
    bbox: Tuple[float, float, float, float]
    bbox_string: str
    aoi_file: Path
    cutline_path: Path
    log_dir: Path
    log_file: Path


def _load_protocol_text() -> str:
    global _PROTOCOL_TEXT_CACHE
    if _PROTOCOL_TEXT_CACHE is not None:
        return _PROTOCOL_TEXT_CACHE
    try:
        _PROTOCOL_TEXT_CACHE = PROTOCOL_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:
        _PROTOCOL_TEXT_CACHE = ""
    return _PROTOCOL_TEXT_CACHE


def _load_project_metadata_blob(ctx: FetchContext) -> str:
    metadata_path = ctx.project_path / "project_metadata.json"
    if metadata_path.exists():
        try:
            return metadata_path.read_text(encoding="utf-8")
        except OSError:
            return "{}"
    return "{}"


def _agent_api_key() -> Optional[str]:
    if not AGENT_ENABLED:
        return None
    api_key = os.getenv("ANTHROPIC_API_KEY")
    return api_key or None


def _build_agent_prompt(defn: DatasetDefinition, ctx: FetchContext, override: Optional[str]) -> str:
    metadata_blob = _load_project_metadata_blob(ctx)
    protocol_blob = _load_protocol_text()
    data_dir = ctx.project_path / "data"
    raw_path = defn.raw_path(ctx, override)
    processed_path = defn.processed_path(ctx)
    override_text = override or "Use catalog default"
    schema_hint = json.dumps(
        {
            "steps": [
                {"description": "Describe the action", "command": "bash command to execute from project root"}
            ],
            "post_checks": [
                {"description": "Validation step after processing", "command": "bash command ensuring compliance"}
            ],
            "notes": "Optional short summary of key decisions",
        },
        indent=2,
    )
    return dedent(
        f"""
        You are ZEUS AI, responsible for fully executing AGRS dataset ingestion workflows.
        Every command you emit will run via `/bin/bash -lc "<command>"` with working directory `{ctx.project_path}`.
        Obey these rules without exception:
          • Follow the Dataset Fetching Protocols in their entirety (text provided below).
          • Inspect existing data before downloading anything to avoid duplicates.
          • Fetch only authoritative, non-placeholder data that fully covers the AOI (bbox {ctx.bbox_string}).
          • Write raw outputs to `{raw_path}` inside `{data_dir}` without altering original values.
          • Reproject/clamp outputs to EPSG:{ctx.target_epsg} ({ctx.target_crs_name}) using cutline `{ctx.cutline_path}` and
            store the processed artifact at `{processed_path}` with minimal padding outside the AOI.
          • Use `gdalwarp`, `ogr2ogr`, `gdalbuildvrt`, `zeus tools {defn.fetch_tool}`, curl/wget, and python/gdal utilities as needed.
          • Never use sudo or destructive commands outside the project directory tree.
          • Keep raw + processed files under `data/rasters` or `data/vectors` per dataset type `{defn.dataset_type}`.
          • Ensure outputs remain within AOI extent (no extra padding beyond protocol buffer allowances).

        Project context:
          • Project: {ctx.project} (ISO3: {ctx.iso3})
          • Dataset category: {defn.key} – {defn.label} ({defn.dataset_type})
          • Preferred/override source: {override_text}
          • ZEUS CLI binary: {ZEUS_BIN}
          • Project metadata path: {ctx.project_path / "project_metadata.json"}
          • Data root: {data_dir}

        Project metadata JSON (read and follow CRS + AOI guidance):
        {metadata_blob}

        Dataset Fetching Protocol (read fully before planning steps):
        {protocol_blob}

        Respond STRICTLY with JSON following this template:
        {schema_hint}
        """
    ).strip()


def _extract_json_payload(text: str) -> Dict[str, Any]:
    """Extract JSON payload from potentially markdown-wrapped response.

    Enhanced to handle:
    - JSON in ```json blocks
    - JSON in ``` blocks (untyped)
    - Raw JSON in response
    - JSON with leading/trailing text
    - Nested JSON objects
    - Multiple JSON blocks (returns first valid one)
    """
    candidate = text.strip()

    # First, try to extract from markdown code blocks
    # Handle ```json ... ``` or ``` ... ``` blocks
    code_block_patterns = [
        r'```json\s*([\s\S]*?)\s*```',
        r'```\s*([\s\S]*?)\s*```',
    ]
    for pattern in code_block_patterns:
        matches = re.findall(pattern, candidate, re.IGNORECASE)
        for match in matches:
            match = match.strip()
            if match.startswith("{") and match.endswith("}"):
                try:
                    return json.loads(match)
                except json.JSONDecodeError:
                    continue

    # Try to find JSON object directly
    if candidate.startswith("{"):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Find the outermost balanced JSON object
    start = candidate.find("{")
    if start != -1:
        # Count braces to find matching end
        depth = 0
        end = -1
        for i, char in enumerate(candidate[start:], start):
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        if end != -1:
            json_str = candidate[start:end + 1]
            try:
                return json.loads(json_str)
            except json.JSONDecodeError:
                pass

    # Last resort: try finding last } and first {
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        json_str = candidate[start:end + 1]
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("Could not extract valid JSON from response", candidate, 0)


class AgentConversation:
    """
    Maintains full conversational context for ZEUS AI throughout the entire
    dataset fetching pipeline. This allows ZEUS AI to learn from successes,
    failures, and outputs across all operations.
    """
    
    def __init__(self, ctx: "FetchContext", job: "DatasetJobState"):
        self.ctx = ctx
        self.job = job
        self.messages: List[Dict[str, str]] = []
        self.system_prompt = self._build_system_prompt()
        self.completed_datasets: List[str] = []
        self.failed_datasets: List[str] = []
        self.total_commands_executed = 0
        self.api_key = _agent_api_key()
        
        if not self.api_key:
            raise RuntimeError("ZEUS AI unavailable (missing ANTHROPIC_API_KEY or agent disabled).")
        
        try:
            import anthropic  # type: ignore
            self.client = anthropic.Anthropic(api_key=self.api_key)
        except ImportError as exc:
            raise RuntimeError("ZEUS AI client library (anthropic) not installed on server.") from exc
    
    def _build_system_prompt(self) -> str:
        scripts_dir = self.ctx.project_path / "scripts"
        return dedent(
            f"""
            You are ZEUS AI, a fully autonomous geospatial data engineer with COMPLETE AGENCY to fetch 
            datasets for pipeline routing projects. You can execute ANY bash command and must use ALL 
            available means to acquire the requested data.
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            CORE MANDATE: FIND A WAY - ANY WAY - TO GET THE DATA
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            You are NOT limited to pre-built tools. You have full authority to:
            1. Write Python scripts to call ANY public API
            2. Scrape data from official government/agency websites
            3. Use STAC (SpatioTemporal Asset Catalog) APIs to discover datasets
            4. Query WMS/WFS/WCS services directly with GDAL
            5. Download from S3/Azure/GCS buckets if publicly accessible
            6. Create custom fetch tools and save them to {scripts_dir}/
            7. Chain multiple data sources together
            8. Parse HTML pages to find download links
            
            AUTONOMY LEVELS (try in order):
            Level 1: Use ZEUS CLI tools if they exist and work
            Level 2: Use direct API calls (curl, wget) to known endpoints
            Level 3: Query STAC catalogs to discover data (see STAC DISCOVERY below)
            Level 4: Write Python scripts to interact with complex APIs
            Level 5: Scrape official data portals to find download URLs
            Level 6: Use GDAL virtual file systems (/vsicurl/, /vsis3/) for cloud data
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            AVAILABLE TOOLS & CAPABILITIES
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            COMMAND EXECUTION:
            - All commands run via: /bin/bash -lc "<command>"
            - Working directory: {self.ctx.project_path}
            - You can write multi-line scripts using heredocs or echo to files
            
            BUILT-IN TOOLS:
            - ZEUS CLI: {ZEUS_BIN} (check available tools with: {ZEUS_BIN} tools --help)
            - GDAL/OGR: gdalwarp, gdal_translate, gdalinfo, gdalbuildvrt, ogr2ogr, ogrinfo, gdal_contour
            - Network: curl, wget, python3 (with requests, httpx if available)
            - Processing: jq (JSON), xmllint (XML), sed, awk, grep
            
            PYTHON SCRIPTING:
            You can write and execute Python scripts inline:
            ```
            python3 << 'EOF'
            import requests
            # Your code here
            EOF
            ```
            Or save persistent scripts to {scripts_dir}/ for reuse.
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            STAC DISCOVERY - USE THIS TO FIND DATA
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            STAC (SpatioTemporal Asset Catalog) is a standard for discovering geospatial data.
            Query these STAC endpoints to find datasets:
            
            - Microsoft Planetary Computer: https://planetarycomputer.microsoft.com/api/stac/v1
              Collections: cop-dem-glo-30, cop-dem-glo-90, nasadem, alos-dem, io-lulc, esa-worldcover
              
            - Earth Search (AWS): https://earth-search.aws.element84.com/v1
              Collections: cop-dem-glo-30, sentinel-2-l2a, landsat-c2-l2
              
            - USGS STAC: https://landsatlook.usgs.gov/stac-server
              
            Example STAC query:
            ```
            curl -s "https://earth-search.aws.element84.com/v1/search" \\
              -H "Content-Type: application/json" \\
              -d '{{"collections":["cop-dem-glo-30"],"bbox":[{self.ctx.bbox[0]},{self.ctx.bbox[1]},{self.ctx.bbox[2]},{self.ctx.bbox[3]}],"limit":10}}' | jq '.features[].assets'
            ```
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            DATA SOURCE CATALOG (by category)
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            DEM (Digital Elevation Models):
            ─────────────────────────────────
            • USGS 3DEP 1m LiDAR (USA - highest resolution):
              - OpenTopography API: https://portal.opentopography.org/API/globaldem?demtype=SRTMGL1&south=LAT&north=LAT&west=LON&east=LON&outputFormat=GTiff
              - TNM API: https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=WEST,SOUTH,EAST,NORTH
              - Direct tiles: https://prd-tnm.s3.amazonaws.com/index.html?prefix=StagedProducts/Elevation/1m/
            • Copernicus DEM GLO-30 (Global 30m):
              - S3: s3://copernicus-dem-30m/ (via /vsis3/ or direct HTTPS)
              - Tiles: {COPERNICUS_BASE_URL}/Copernicus_DSM_COG_10_NXX_00_EXXX_00_DEM/Copernicus_DSM_COG_10_NXX_00_EXXX_00_DEM.tif
            • Copernicus DEM EEA-10 (Europe 10m)
            • SRTM GL1 30m (Global): via OpenTopography or USGS
            • ALOS World 3D 30m: via JAXA or STAC
            • FABDEM (forest/building adjusted): https://data.bris.ac.uk/data/dataset/s5hqmjcdj8yo2ibzi9b4ew3sn
            
            LANDCOVER:
            ─────────────────────────────────
            • ESA WorldCover 10m (2020, 2021):
              - Direct: https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_NXX_EXXX_Map.tif
              - STAC: Planetary Computer "esa-worldcover" collection
            • Dynamic World (Google, 10m, near real-time): via Earth Engine or STAC
            • NLCD (USA 30m): https://www.mrlc.gov/data
            • CORINE (Europe): https://land.copernicus.eu/pan-european/corine-land-cover
            
            SOIL:
            ─────────────────────────────────
            • SoilGrids v2.0 (Global 250m):
              - WCS: https://maps.isric.org/mapserv?map=/map/soilgrids.map
              - Direct: https://files.isric.org/soilgrids/latest/data/
              Example WCS: gdal_translate "WCS:https://maps.isric.org/mapserv?map=/map/soilgrids.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=soc_0-5cm_mean&SUBSET=X({self.ctx.bbox[0]},{self.ctx.bbox[2]})&SUBSET=Y({self.ctx.bbox[1]},{self.ctx.bbox[3]})&FORMAT=image/tiff" output.tif
            • gNATSGO/gSSURGO (USA): https://nrcs.app.box.com/v/soils
            
            GEOHAZARDS:
            ─────────────────────────────────
            • GEM Global Seismic Hazard Map:
              - WMS: gdal_translate "WMS:https://maps.openquake.org/geoserver/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=gshm:pga_475&BBOX=BBOX&WIDTH=1024&HEIGHT=1024&SRS=EPSG:4326&FORMAT=image/geotiff" output.tif
              - Download: https://downloads.openquake.org/
              - Zenodo: https://zenodo.org/records/8409647
            • USGS Earthquake Hazards: https://earthquake.usgs.gov/hazards/
            • Global Landslide Susceptibility: NASA SEDAC
            
            INFRASTRUCTURE VECTORS (OSM and Other Sources):
            ─────────────────────────────────
            ⚠️ PRESERVE ALL ORIGINAL ATTRIBUTES - COMPUTED FIELDS ADDED AUTOMATICALLY ⚠️
            
            When fetching infrastructure data from ANY source (OSM, government datasets, commercial
            providers, etc.), you MUST preserve ALL original attributes from the source data.
            The processing pipeline will automatically ADD computed fields for PIRL compatibility
            without removing any existing attributes.
            
            For OSM data: Use Overpass API with [out:json] format and extract all available tags.
            For other sources: Download and convert to GeoPackage preserving the original schema.
            
            The following schemas show the MINIMUM required fields. Additional source-specific
            fields will be preserved automatically.
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            ROADS SCHEMA (layer name: "roads")
            ═══════════════════════════════════════════════════════════════════════════════════════════
            Required fields:
            • osm_id      (integer) - OSM way ID
            • name        (string)  - Road name from tags.name
            • highway     (string)  - Road type (motorway, trunk, primary, secondary, tertiary, etc.)
            • ref         (string)  - Road reference number (e.g., "I-95", "A1") from tags.ref
            • surface     (string)  - Surface type (paved, asphalt, gravel, etc.) from tags.surface
            • lanes       (string)  - Number of lanes from tags.lanes
            • maxspeed    (string)  - Speed limit from tags.maxspeed
            • oneway      (string)  - One-way flag (yes/no) from tags.oneway
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            RAILWAYS SCHEMA (layer name: "railways")
            ═══════════════════════════════════════════════════════════════════════════════════════════
            Required fields:
            • osm_id      (integer) - OSM way ID
            • name        (string)  - Railway name from tags.name
            • railway     (string)  - Railway type (rail, subway, tram, light_rail) from tags.railway
            • operator    (string)  - Railway operator from tags.operator
            • gauge       (string)  - Track gauge (e.g., "1435") from tags.gauge
            • electrified (string)  - Electrification type (contact_line, rail, yes, no) from tags.electrified
            • usage       (string)  - Usage type (main, branch, industrial) from tags.usage
            • service     (string)  - Service type (spur, yard, siding) from tags.service
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            WATERWAYS SCHEMA (layer name: "waterways")
            ═══════════════════════════════════════════════════════════════════════════════════════════
            Required fields:
            • osm_id           (integer) - OSM way ID
            • name             (string)  - Waterway name from tags.name
            • waterway         (string)  - Waterway type (river, stream, canal, drain, ditch)
            • width            (string)  - Raw width tag from tags.width
            • width_m          (float)   - Width in meters (COMPUTED - see logic below)
            • width_class      (string)  - Classification (COMPUTED: small/medium/large/major)
            • crossing_cost_cat(string)  - Cost category (COMPUTED: low/medium/high/very_high)
            • depth            (string)  - Depth from tags.depth
            • seasonal         (string)  - Seasonal flag from tags.seasonal
            • intermittent     (string)  - Intermittent flag from tags.intermittent
            • tunnel           (string)  - Tunnel flag from tags.tunnel
            
            WIDTH COMPUTATION LOGIC (MUST IMPLEMENT):
            ```python
            # Parse width from tag (e.g., "25 m" -> 25.0)
            width_m = None
            if width_raw:
                try:
                    width_m = float(width_raw.split()[0])
                except:
                    pass
            # Estimate from waterway type if not tagged
            if width_m is None:
                if waterway_type in ('stream', 'ditch'):
                    width_m = 2.0   # 1-3m typical
                elif waterway_type == 'drain':
                    width_m = 5.0   # 3-10m typical
                elif waterway_type == 'canal':
                    width_m = 15.0  # 10-50m typical
                else:  # river
                    width_m = 25.0  # default for rivers
            # Compute width_class and crossing_cost_cat
            if width_m < 3:
                width_class = 'small'
                crossing_cost_cat = 'low'      # $10K-20K open cut
            elif width_m < 10:
                width_class = 'medium'
                crossing_cost_cat = 'medium'   # $30K-70K open cut
            elif width_m < 50:
                width_class = 'large'
                crossing_cost_cat = 'high'     # $200K-400K HDD
            else:
                width_class = 'major'
                crossing_cost_cat = 'very_high' # $800K+ HDD
            ```
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            POWER LINES SCHEMA (layer name: "power_lines")
            ═══════════════════════════════════════════════════════════════════════════════════════════
            Required fields:
            • osm_id        (integer) - OSM way ID
            • name          (string)  - Line name from tags.name
            • power         (string)  - Power type (line, minor_line, cable) from tags.power
            • voltage       (string)  - Raw voltage tag from tags.voltage
            • voltage_v     (integer) - Voltage in volts (COMPUTED from voltage tag)
            • voltage_kv    (float)   - Voltage in kilovolts (COMPUTED: voltage_v / 1000)
            • voltage_class (string)  - Classification (COMPUTED: low/medium/high/extra_high)
            • cables        (string)  - Number of cables from tags.cables
            • operator      (string)  - Operator from tags.operator
            • frequency     (string)  - Frequency from tags.frequency
            • ref           (string)  - Reference from tags.ref
            • crossing_cost (string)  - Cost category (COMPUTED based on voltage_class)
            • location      (string)  - Location (underground, overhead) from tags.location
            
            VOLTAGE COMPUTATION LOGIC:
            ```python
            voltage_v = None
            if voltage_str:
                try:
                    voltage_v = int(voltage_str.replace('kV', '000').replace(' ', ''))
                except:
                    pass
            voltage_kv = voltage_v / 1000 if voltage_v else None
            if voltage_v:
                if voltage_v < 1000:
                    voltage_class = 'low'
                    crossing_cost = 'low'
                elif voltage_v < 50000:
                    voltage_class = 'medium'
                    crossing_cost = 'medium'
                elif voltage_v < 200000:
                    voltage_class = 'high'
                    crossing_cost = 'high'
                else:
                    voltage_class = 'extra_high'
                    crossing_cost = 'very_high'
            ```
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            PIPELINES SCHEMA (layer name: "pipelines")
            ═══════════════════════════════════════════════════════════════════════════════════════════
            Required fields:
            • osm_id      (integer) - OSM way ID
            • name        (string)  - Pipeline name from tags.name
            • man_made    (string)  - Should be "pipeline" from tags.man_made
            • substance   (string)  - Transported substance (gas, oil, water) from tags.substance
            • operator    (string)  - Pipeline operator from tags.operator
            • diameter    (string)  - Pipe diameter from tags.diameter
            • location    (string)  - Location (underground, overground) from tags.location
            • pressure    (string)  - Operating pressure from tags.pressure
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            OSM FETCH WORKFLOW
            ═══════════════════════════════════════════════════════════════════════════════════════════
            1. Query Overpass API with [out:json] format (NOT xml)
            2. Parse JSON response and extract way elements with geometry
            3. For each element, extract tags and compute derived fields per schema above
            4. Build GeoJSON FeatureCollection with proper properties
            5. Convert GeoJSON to GeoPackage with ogr2ogr, setting correct layer name
            6. Layer names MUST match: roads, railways, waterways, power_lines, pipelines
            
            Example Overpass query for roads:
            ```
            curl -s "https://overpass-api.de/api/interpreter" \\
              -d '[out:json][timeout:300];
                  (way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track"]({self.ctx.bbox[1]},{self.ctx.bbox[0]},{self.ctx.bbox[3]},{self.ctx.bbox[2]}););
                  out geom;' > roads.json
            ```
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            GDAL VIRTUAL FILE SYSTEMS - ACCESS CLOUD DATA DIRECTLY
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            /vsicurl/ - Access HTTP/HTTPS URLs directly:
              gdalinfo "/vsicurl/https://example.com/data.tif"
              
            /vsis3/ - Access AWS S3 (public buckets, no credentials needed for public data):
              gdalinfo "/vsis3/copernicus-dem-30m/Copernicus_DSM_COG_10_N44_00_W106_00_DEM/Copernicus_DSM_COG_10_N44_00_W106_00_DEM.tif"
              
            /vsigs/ - Access Google Cloud Storage
            /vsiaz/ - Access Azure Blob Storage
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            CRITICAL RULES
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            ABSOLUTELY FORBIDDEN:
            ✗ Creating synthetic/placeholder/fake data
            ✗ Generating constant-value rasters to pass validation
            ✗ Substituting lower resolution data without explicit instruction
            ✗ Claiming success when data was not actually fetched
            
            MANDATORY:
            ✓ Only use REAL data from authoritative sources
            ✓ If data is truly unavailable, FAIL with clear explanation of what was tried
            ✓ Validate outputs exist and contain actual data (not empty/corrupt)
            ✓ Follow the resolution/source requested by user
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            PROJECT CONTEXT
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            Project: {self.ctx.project}
            Project path: {self.ctx.project_path}
            Scripts directory: {scripts_dir} (save reusable scripts here)
            Target CRS: EPSG:{self.ctx.target_epsg} ({self.ctx.target_crs_name})
            AOI bbox (WGS84 minx,miny,maxx,maxy): {self.ctx.bbox_string}
            AOI bbox components: west={self.ctx.bbox[0]}, south={self.ctx.bbox[1]}, east={self.ctx.bbox[2]}, north={self.ctx.bbox[3]}
            Cutline file (for clipping): {self.ctx.cutline_path}
            Data directory: {self.ctx.project_path / "data"}
            
            ═══════════════════════════════════════════════════════════════════════════════════════════
            RESPONSE FORMAT
            ═══════════════════════════════════════════════════════════════════════════════════════════
            
            Always respond with valid JSON:
            {{
                "thinking": "Your analysis: what data is needed, which sources to try, strategy",
                "steps": [
                    {{"description": "Clear description of action", "command": "bash command to execute"}}
                ],
                "post_checks": [
                    {{"description": "Validation description", "command": "bash validation command"}}
                ]
            }}
            """
        ).strip()
    
    def _call_api(self, use_extended_thinking: bool = False) -> str:
        """Make API call with full conversation history.

        Args:
            use_extended_thinking: If True, use extended thinking for complex reasoning.
                                   This is especially useful for initial planning and
                                   error recovery scenarios.
        """
        try:
            api_params = {
                "model": AGENT_MODEL,
                "max_tokens": 16384,  # Increased for complex responses
                "system": self.system_prompt,
                "messages": self.messages,
            }

            # Use extended thinking for complex dataset operations
            # Extended thinking allows Claude to reason more thoroughly
            if use_extended_thinking:
                api_params["thinking"] = {
                    "type": "enabled",
                    "budget_tokens": 10000  # Allow up to 10k tokens for reasoning
                }
                # Extended thinking requires higher max_tokens
                api_params["max_tokens"] = 32000

            message = self.client.messages.create(**api_params)
        except Exception as exc:
            # Handle API errors gracefully with retry hint
            error_str = str(exc).lower()
            if "rate" in error_str or "limit" in error_str:
                raise RuntimeError(f"ZEUS AI rate limited. Please retry: {exc}") from exc
            if "timeout" in error_str:
                raise RuntimeError(f"ZEUS AI request timed out. Please retry: {exc}") from exc
            raise RuntimeError(f"ZEUS AI request failed: {exc}") from exc

        content = ""
        thinking_content = ""

        for block in message.content:
            # Extract thinking content if present (for logging/debugging)
            if hasattr(block, "thinking"):
                thinking_content += block.thinking
            if hasattr(block, "text"):
                content += block.text

        # Log thinking if present (useful for debugging complex failures)
        if thinking_content:
            # Store thinking for potential debugging
            self._last_thinking = thinking_content

        if not content:
            raise RuntimeError("ZEUS AI returned an empty response.")
        return content
    
    def add_user_message(self, content: str) -> None:
        """Add a user message to the conversation."""
        self.messages.append({"role": "user", "content": content})
    
    def add_assistant_message(self, content: str) -> None:
        """Add an assistant response to the conversation."""
        self.messages.append({"role": "assistant", "content": content})
    
    def request_plan(self, defn: "DatasetDefinition", override: Optional[str]) -> Dict[str, Any]:
        """Request initial plan for a dataset, with full context of previous operations.

        Uses extended thinking for complex dataset types (DEM with specific sources,
        high-resolution data, etc.) to improve reasoning quality.
        """
        protocol_blob = _load_protocol_text()
        metadata_blob = _load_project_metadata_blob(self.ctx)

        # Build context about previous datasets
        previous_context = ""
        if self.completed_datasets or self.failed_datasets:
            previous_context = f"""

            PREVIOUS OPERATIONS IN THIS SESSION:
            - Successfully completed: {', '.join(self.completed_datasets) or 'None yet'}
            - Failed (need alternative approach): {', '.join(self.failed_datasets) or 'None'}
            - Total commands executed so far: {self.total_commands_executed}
            """

        # Build source-specific guidance for DEM with 1m/high-res requests
        source_guidance = ""
        if defn.key == "dem" and override and _is_3dep_override(override):
            source_guidance = """

            ═══════════════════════════════════════════════════════════════════════════════════════════
            USGS 3DEP 1-METER LIDAR DEM - SPECIFIC INSTRUCTIONS
            ═══════════════════════════════════════════════════════════════════════════════════════════

            You are fetching HIGH-RESOLUTION 1-meter LiDAR DEM from USGS 3DEP. This is the highest
            quality elevation data available for the United States.

            STEP 1: Query TNM API to discover available tiles
            ```bash
            curl -sS "https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter&bbox=WEST,SOUTH,EAST,NORTH&outputFormat=JSON" > tnm_products.json
            ```

            STEP 2: Parse response and download tiles
            - Each item in "items" array has a "downloadURL" field
            - Download ALL tiles that intersect the AOI
            - Files are typically large (50-500MB each)
            - Use curl with timeouts: curl -sSfL --connect-timeout 60 --max-time 600

            STEP 3: Mosaic and reproject
            - 3DEP tiles are in various UTM projections (NAD83)
            - Use gdalwarp with -te_srs EPSG:4326 to specify bbox CRS
            - Mosaic multiple tiles in one gdalwarp call for efficiency

            FALLBACK: If 3DEP 1m is not available for this area:
            1. Check if 3DEP 10m is available (datasets=Digital%20Elevation%20Model%20(DEM)%2010%20meter)
            2. Fall back to Copernicus GLO-30 (30m global coverage)
            3. NEVER create placeholder/synthetic data

            CRITICAL: The user specifically requested 1-meter resolution. Prioritize finding
            3DEP 1m data. Only fall back to lower resolution if 1m is genuinely unavailable.
            """

        prompt = dedent(
            f"""
            NEW TASK: Fetch and process {defn.label} ({defn.key})

            Dataset details:
            - Type: {defn.dataset_type}
            - Preferred source/override: {override or "Use best available"}
            - Raw output path: {defn.raw_path(self.ctx, override)}
            - Processed output path: {defn.processed_path(self.ctx)}
            - Fetch tool (if available): {defn.fetch_tool}
            {previous_context}
            {source_guidance}

            Project metadata:
            {metadata_blob}

            Dataset Fetching Protocol (MUST follow):
            {protocol_blob}

            REQUIREMENTS:
            1. Fetch raw data covering the entire AOI bbox: {self.ctx.bbox_string}
            2. Save raw data to: {defn.raw_path(self.ctx, override)}
            3. Reproject to EPSG:{self.ctx.target_epsg} and clip to AOI using cutline: {self.ctx.cutline_path}
            4. Save processed data to: {defn.processed_path(self.ctx)}
            5. DO NOT create symlinks - the Layer Manager reads directly from /processed folders
            6. Validate outputs exist and are not empty

            Provide your plan as JSON with "thinking", "steps", and "post_checks".
            """
        ).strip()

        self.add_user_message(prompt)

        # Use extended thinking for complex dataset requests
        # Extended thinking helps with:
        # - Parsing complex API responses
        # - Choosing between multiple data sources
        # - Error recovery strategies
        use_thinking = (
            defn.key == "dem" and override and _is_3dep_override(override)
        ) or (
            len(self.failed_datasets) > 0  # Previous failures need careful reasoning
        )

        response = self._call_api(use_extended_thinking=use_thinking)
        self.add_assistant_message(response)

        try:
            return _extract_json_payload(response)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"ZEUS AI response was not valid JSON: {exc}") from exc
    
    def report_command_result(
        self,
        command: str,
        description: str,
        exit_code: int,
        output: str,
        request_next_steps: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Report the result of a command execution back to ZEUS AI.
        If the command failed and request_next_steps is True, ask for corrective action.

        Uses extended thinking for failed commands to improve error diagnosis
        and recovery strategy generation.
        """
        self.total_commands_executed += 1

        status = "SUCCESS" if exit_code == 0 else f"FAILED (exit code {exit_code})"

        # Truncate output if too long but keep important parts
        # Preserve more context for errors as they're more important
        max_output = 6000 if exit_code != 0 else 4000
        if len(output) > max_output:
            # For errors, keep more of the end (where error messages usually are)
            head_size = 1500 if exit_code == 0 else 2000
            tail_size = max_output - head_size - 50
            output = output[:head_size] + "\n\n... [truncated] ...\n\n" + output[-tail_size:]

        result_message = dedent(
            f"""
            COMMAND RESULT:
            - Description: {description}
            - Command: {command}
            - Status: {status}
            - Output:
            ```
            {output}
            ```
            """
        ).strip()

        if exit_code == 0:
            if not request_next_steps:
                # Just record the success, don't ask for more
                self.add_user_message(result_message + "\n\nCommand succeeded. Continuing with next step.")
                return None

            self.add_user_message(result_message + "\n\nCommand succeeded. Continue with the next step if any remain, or confirm completion.")
        else:
            self.add_user_message(
                result_message + dedent(
                    """

                    The command failed. Analyze the error THOROUGHLY and provide corrective steps.

                    DIAGNOSTIC CHECKLIST:
                    1. Is this a network/API error? (timeout, 404, rate limit)
                       - Try alternative endpoints or add retries
                    2. Is this a tool availability error?
                       - Check with 'which <tool>' or '<tool> --help'
                    3. Is this a data availability error?
                       - The requested data might not exist for this region
                       - Consider alternative data sources
                    4. Is this a path/permissions error?
                       - Ensure directories exist (mkdir -p)
                       - Check file permissions
                    5. Is this a format/parsing error?
                       - Validate input data format
                       - Check for corrupted downloads

                    CRITICAL: You MUST provide a concrete fix. Do NOT give up.
                    - If one API fails, try another
                    - If one data source is unavailable, find an alternative
                    - NEVER suggest creating placeholder/synthetic data

                    Respond with JSON containing:
                    - "analysis": Your detailed diagnosis of what went wrong
                    - "steps": Array of corrective commands to fix the issue
                    - "post_checks": Optional validation steps after the fix
                    """
                )
            )

        if not request_next_steps:
            return None

        # Use extended thinking for error recovery - complex reasoning helps
        # diagnose issues and find alternative approaches
        use_thinking = exit_code != 0

        response = self._call_api(use_extended_thinking=use_thinking)
        self.add_assistant_message(response)

        try:
            return _extract_json_payload(response)
        except json.JSONDecodeError:
            # If response isn't JSON, it might be a completion confirmation
            return None
    
    def mark_dataset_complete(self, defn: "DatasetDefinition", success: bool) -> None:
        """Record that a dataset has been completed or failed."""
        if success:
            self.completed_datasets.append(defn.label)
            self.add_user_message(f"✓ {defn.label} completed successfully and is ready for use.")
        else:
            self.failed_datasets.append(defn.label)
            self.add_user_message(f"✗ {defn.label} could not be completed after all retry attempts.")
    
    def get_summary(self) -> str:
        """Get a summary of the conversation for logging."""
        return (
            f"ZEUS AI Session Summary:\n"
            f"  - Messages exchanged: {len(self.messages)}\n"
            f"  - Commands executed: {self.total_commands_executed}\n"
            f"  - Datasets completed: {len(self.completed_datasets)}\n"
            f"  - Datasets failed: {len(self.failed_datasets)}"
        )


# Global conversation instance per job (keyed by job_id)
_AGENT_CONVERSATIONS: Dict[str, AgentConversation] = {}
_AGENT_CONV_LOCK = threading.Lock()


def _get_or_create_conversation(job: "DatasetJobState", ctx: "FetchContext") -> AgentConversation:
    """Get existing conversation for job or create new one."""
    with _AGENT_CONV_LOCK:
        if job.id not in _AGENT_CONVERSATIONS:
            _AGENT_CONVERSATIONS[job.id] = AgentConversation(ctx, job)
        return _AGENT_CONVERSATIONS[job.id]


def _cleanup_conversation(job_id: str) -> None:
    """Remove conversation from memory after job completes."""
    with _AGENT_CONV_LOCK:
        _AGENT_CONVERSATIONS.pop(job_id, None)


def _run_command_capture(cmd: List[str], cwd: Path, job: DatasetJobState, ctx: FetchContext, label: str) -> Tuple[int, str]:
    """Run command and return (exit_code, combined_output). Logs output but doesn't raise on failure."""
    display = " ".join(cmd)
    _log_to_job(job, ctx, f"{label}: {display}")
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert process.stdout is not None
    output_lines: List[str] = []
    for line in process.stdout:
        stripped = line.rstrip()
        output_lines.append(stripped)
        _log_to_job(job, ctx, f"{label}: {stripped}")
    rc = process.wait()
    return rc, "\n".join(output_lines)


def _run_agent_for_dataset(
    defn: DatasetDefinition,
    ctx: FetchContext,
    job: DatasetJobState,
    override: Optional[str],
    conversation: Optional[AgentConversation] = None,
) -> Optional[List[str]]:
    """
    Run ZEUS AI agent to fetch and process dataset with FULL CONTEXT RETENTION.
    
    The agent maintains complete memory of:
    - All previous datasets processed in this job
    - All commands executed (successes and failures)
    - All outputs from those commands
    - Its own analysis and reasoning
    
    This allows ZEUS AI to learn from errors and adapt its strategy across
    the entire pipeline, not just within a single dataset.
    """
    if not AGENT_ENABLED:
        return None
    
    # Get or create conversation with full context
    if conversation is None:
        try:
            conversation = _get_or_create_conversation(job, ctx)
        except RuntimeError as exc:
            _log_to_job(job, ctx, f"ZEUS AI unavailable: {exc}")
            return None
    
    _log_to_job(job, ctx, f"ZEUS AI engaged for {defn.label}.")
    if conversation.completed_datasets:
        _log_to_job(job, ctx, f"ZEUS AI · Context retained from: {', '.join(conversation.completed_datasets)}")
    
    # Get initial plan with full conversation context
    try:
        plan = conversation.request_plan(defn, override)
    except RuntimeError as exc:
        _log_to_job(job, ctx, f"ZEUS AI plan request failed: {exc}")
        conversation.mark_dataset_complete(defn, success=False)
        return None

    executed: List[str] = []
    retry_count = 0
    current_steps = plan.get("steps") or []
    post_checks = plan.get("post_checks") or []
    
    # Log ZEUS AI's thinking if provided
    thinking = plan.get("thinking")
    if thinking:
        _log_to_job(job, ctx, f"ZEUS AI thinking: {thinking[:500]}{'...' if len(thinking) > 500 else ''}")
    
    if not current_steps:
        _log_to_job(job, ctx, "ZEUS AI did not provide any executable steps in initial plan.")
        conversation.mark_dataset_complete(defn, success=False)
        return None

    # Execute steps with full context feedback loop
    step_idx = 0
    while step_idx < len(current_steps) and len(executed) < AGENT_MAX_STEPS:
        step = current_steps[step_idx]
        if not isinstance(step, dict):
            step_idx += 1
            continue
        
        command = (step.get("command") or "").strip()
        if not command:
            step_idx += 1
            continue
        
        description = (step.get("description") or f"{defn.label} step {step_idx + 1}").strip()
        label = f"ZEUS AI · {description}"
        
        # Execute command with output capture
        exit_code, output = _run_command_capture(
            ["/bin/bash", "-lc", command],
            ctx.project_path,
            job,
            ctx,
            label,
        )
        executed.append(command)
        
        # Report result back to ZEUS AI (this updates conversation context)
        is_last_step = step_idx == len(current_steps) - 1 and not post_checks
        
        if exit_code == 0:
            # Success - report to ZEUS AI and continue
            if not is_last_step:
                # Only ask for next steps if there might be more
                next_plan = conversation.report_command_result(
                    command=command,
                    description=description,
                    exit_code=exit_code,
                    output=output,
                    request_next_steps=False,  # Don't need new steps, just recording
                )
            step_idx += 1
            continue
        
        # Command failed - ask ZEUS AI to fix it with full context
        _log_to_job(job, ctx, f"ZEUS AI · Command failed (exit {exit_code}). Consulting ZEUS AI with full context...")
        
        if retry_count >= AGENT_MAX_RETRIES:
            _log_to_job(
                job,
                ctx,
                f"ZEUS AI · Max retries ({AGENT_MAX_RETRIES}) reached. Cannot complete {defn.label} autonomously.",
            )
            conversation.mark_dataset_complete(defn, success=False)
            raise RuntimeError(f"ZEUS AI exhausted retries for {defn.label}")
        
        retry_count += 1
        _log_to_job(job, ctx, f"ZEUS AI · Retry attempt {retry_count}/{AGENT_MAX_RETRIES}")
        
        try:
            fix_plan = conversation.report_command_result(
                command=command,
                description=description,
                exit_code=exit_code,
                output=output,
                request_next_steps=True,
            )
        except RuntimeError as fix_exc:
            _log_to_job(job, ctx, f"ZEUS AI · Failed to get fix from ZEUS AI: {fix_exc}")
            conversation.mark_dataset_complete(defn, success=False)
            raise RuntimeError(f"ZEUS AI could not recover from error: {fix_exc}")
        
        if not fix_plan:
            _log_to_job(job, ctx, "ZEUS AI · No fix plan returned. Cannot continue.")
            conversation.mark_dataset_complete(defn, success=False)
            raise RuntimeError("ZEUS AI could not provide corrective steps")
        
        analysis = fix_plan.get("analysis")
        if analysis:
            _log_to_job(job, ctx, f"ZEUS AI analysis: {analysis}")
        
        thinking = fix_plan.get("thinking")
        if thinking:
            _log_to_job(job, ctx, f"ZEUS AI thinking: {thinking[:300]}{'...' if len(thinking) > 300 else ''}")
        
        fix_steps = fix_plan.get("steps") or []
        if not fix_steps:
            _log_to_job(job, ctx, "ZEUS AI · No fix steps provided. Cannot continue.")
            conversation.mark_dataset_complete(defn, success=False)
            raise RuntimeError("ZEUS AI could not provide corrective steps")
        
        # Replace remaining steps with fix steps + remaining original steps
        remaining_original = current_steps[step_idx + 1:]
        current_steps = fix_steps + remaining_original
        step_idx = 0  # Start from the fix steps
        
        # Update post_checks if provided in fix
        fix_post_checks = fix_plan.get("post_checks")
        if fix_post_checks:
            post_checks = fix_post_checks + post_checks

    # Run post-check validations
    if post_checks and len(executed) < AGENT_MAX_STEPS:
        _log_to_job(job, ctx, "ZEUS AI · Running validation checks...")
        for check_idx, check in enumerate(post_checks):
            if len(executed) >= AGENT_MAX_STEPS:
                break
            if not isinstance(check, dict):
                continue
            command = (check.get("command") or "").strip()
            if not command:
                continue
            description = (check.get("description") or f"Validation {check_idx + 1}").strip()
            label = f"ZEUS AI · {description}"
            
            exit_code, output = _run_command_capture(
                ["/bin/bash", "-lc", command],
                ctx.project_path,
                job,
                ctx,
                label,
            )
            executed.append(command)
            
            # Report validation results to maintain context
            conversation.report_command_result(
                command=command,
                description=description,
                exit_code=exit_code,
                output=output,
                request_next_steps=False,
            )
            
            if exit_code != 0:
                _log_to_job(job, ctx, f"ZEUS AI · Validation warning: {description}")

    if len(executed) >= AGENT_MAX_STEPS:
        _log_to_job(job, ctx, f"ZEUS AI · Step limit reached ({AGENT_MAX_STEPS}).")

    if not executed:
        _log_to_job(job, ctx, "ZEUS AI · No commands were executed.")
        conversation.mark_dataset_complete(defn, success=False)
        return None
    
    # Mark success and log summary
    conversation.mark_dataset_complete(defn, success=True)
    _log_to_job(job, ctx, f"ZEUS AI · Completed {defn.label} with {len(executed)} commands ({retry_count} retries).")
    _log_to_job(job, ctx, f"ZEUS AI · Session: {conversation.total_commands_executed} total commands, {len(conversation.completed_datasets)} datasets done.")
    
    return executed


def _build_bbox_string(bbox: Tuple[float, float, float, float]) -> str:
    return ",".join(f"{value:.6f}" for value in bbox)


def _buffer_bbox(bbox: Tuple[float, float, float, float], ratio: float = 0.02) -> Tuple[float, float, float, float]:
    min_x, min_y, max_x, max_y = bbox
    width = max(max_x - min_x, 0.01)
    height = max(max_y - min_y, 0.01)
    expand_x = width * ratio
    expand_y = height * ratio
    return (
        max(-180.0, min_x - expand_x),
        max(-90.0, min_y - expand_y),
        min(180.0, max_x + expand_x),
        min(90.0, max_y + expand_y),
    )


def _parse_project_bbox(project_path: Path) -> Optional[Tuple[float, float, float, float]]:
    project_aoi = project_path / "aoi" / "project_aoi.json"
    if not project_aoi.exists():
        return None
    try:
        data = json.loads(project_aoi.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    start = data.get("start_point") or {}
    end = data.get("end_point") or {}
    if not all(k in start for k in ("latitude", "longitude")):
        return None
    if not all(k in end for k in ("latitude", "longitude")):
        return None
    min_lon = min(start["longitude"], end["longitude"])
    max_lon = max(start["longitude"], end["longitude"])
    min_lat = min(start["latitude"], end["latitude"])
    max_lat = max(start["latitude"], end["latitude"])
    return (float(min_lon), float(min_lat), float(max_lon), float(max_lat))


def _extent_from_cutline(path: Path) -> Optional[Tuple[float, float, float, float]]:
    if not path.exists():
        return None
    cmd = [
        OGR2OGR_BIN,
        "-f",
        "GeoJSON",
        "-t_srs",
        "EPSG:4326",
        "/vsistdout/",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ogr2ogr extent extraction failed: {result.stderr}")
        return None
    try:
        geojson = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]

    def _walk(coords):
        if not coords:
            return
        if isinstance(coords[0], (int, float)):
            x, y = coords[:2]
            bounds[0] = min(bounds[0], x)
            bounds[1] = min(bounds[1], y)
            bounds[2] = max(bounds[2], x)
            bounds[3] = max(bounds[3], y)
            return
        for part in coords:
            _walk(part)

    def _collect(geom):
        if not geom:
            return
        if geom.get("type") == "GeometryCollection":
            for g in geom.get("geometries", []):
                _collect(g)
        else:
            _walk(geom.get("coordinates"))

    if geojson.get("type") == "FeatureCollection":
        for feature in geojson.get("features", []):
            _collect(feature.get("geometry"))
    elif geojson.get("type") == "Feature":
        _collect(geojson.get("geometry"))
    else:
        _collect(geojson)

    if (
        float("inf") in bounds
        or float("-inf") in bounds
        or bounds[0] == bounds[2]
        or bounds[1] == bounds[3]
    ):
        return None

    return tuple(bounds)  # type: ignore[arg-type]


def _copernicus_tile_name(lat: int, lon: int) -> str:
    lat_hem = "N" if lat >= 0 else "S"
    lon_hem = "E" if lon >= 0 else "W"
    return f"{lat_hem}{abs(lat):02d}_00_{lon_hem}{abs(lon):03d}_00"


def _copernicus_fetch(ctx: FetchContext, raw_path: Path, job: DatasetJobState) -> Tuple[List[str], Dict[str, object]]:
    min_x, min_y, max_x, max_y = ctx.bbox
    lat_start = math.floor(min_y)
    lat_end = math.ceil(max_y)
    lon_start = math.floor(min_x)
    lon_end = math.ceil(max_x)

    tile_names = [
        _copernicus_tile_name(lat, lon)
        for lat in range(lat_start, lat_end)
        for lon in range(lon_start, lon_end)
    ]
    if not tile_names:
        raise RuntimeError("Unable to determine Copernicus DEM tiles for AOI")

    download_dir = Path(tempfile.mkdtemp(prefix=f"copdem_{job.id}_"))
    tile_paths: List[Path] = []
    try:
        for tile in tile_names:
            folder = f"{COPERNICUS_PRODUCT}_{tile}_DEM"
            filename = f"{COPERNICUS_PRODUCT}_{tile}_DEM.tif"
            url = f"{COPERNICUS_BASE_URL}/{folder}/{filename}"
            dest = download_dir / filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            cmd = [
                "curl",
                "-sSfL",
                url,
                "-o",
                str(dest),
            ]
            _log_to_job(job, ctx, f"Downloading Copernicus tile {tile} from {url}")
            _run_command(cmd, ctx.project_path, job, ctx, f"Copernicus {tile}")
            if not dest.exists() or dest.stat().st_size < 1024:
                raise RuntimeError(f"Failed to download Copernicus tile {tile}")
            tile_paths.append(dest)

        if not tile_paths:
            raise RuntimeError("No Copernicus DEM tiles were downloaded")

        temp_output = raw_path.with_suffix(".tmp.tif")
        if temp_output.exists():
            temp_output.unlink()
        warp_cmd = [
            GDALWARP_BIN,
            "-overwrite",
            "-of",
            "COG",
            "-t_srs",
            "EPSG:4326",
            "-te",
            str(min_x),
            str(min_y),
            str(max_x),
            str(max_y),
            "-tr",
            "0.0002777778",
            "0.0002777778",
            "-multi",
            "-r",
            "bilinear",
            *[str(path) for path in tile_paths],
            str(temp_output),
        ]
        _run_command(warp_cmd, ctx.project_path, job, ctx, "Copernicus mosaic")
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        if raw_path.exists():
            raw_path.unlink()
        temp_output.replace(raw_path)
        return ["copernicus_dem_fetch", f"tiles={len(tile_paths)}"], {"tiles_downloaded": tile_names}
    finally:
        shutil.rmtree(download_dir, ignore_errors=True)


def _opentopo_3dep_fetch(ctx: FetchContext, raw_path: Path, job: DatasetJobState) -> Tuple[List[str], Dict[str, object]]:
    """
    Fetch USGS 3DEP 1m LiDAR DEM from USGS TNM API.
    
    Downloads all tiles that intersect the AOI and mosaics them together.
    Falls back to OpenTopography SRTM if 3DEP 1m is not available.
    """
    west, south, east, north = ctx.bbox
    
    _log_to_job(job, ctx, f"Fetching USGS 3DEP 1m DEM for bbox: {ctx.bbox_string}")
    
    download_dir = Path(tempfile.mkdtemp(prefix=f"3dep_{job.id}_"))
    
    try:
        # Query USGS TNM API for 3DEP 1m products
        tnm_api_url = (
            f"https://tnmaccess.nationalmap.gov/api/v1/products"
            f"?datasets=Digital%20Elevation%20Model%20(DEM)%201%20meter"
            f"&bbox={west},{south},{east},{north}"
            f"&outputFormat=JSON"
        )
        
        _log_to_job(job, ctx, f"Querying USGS TNM API for 3DEP 1m products...")
        
        query_cmd = ["curl", "-sSfL", tnm_api_url, "-o", str(download_dir / "tnm_response.json")]
        _run_command(query_cmd, ctx.project_path, job, ctx, "TNM API query")
        
        response_file = download_dir / "tnm_response.json"
        if not response_file.exists():
            raise RuntimeError("TNM API query failed - no response file")
        
        import json as json_module
        with open(response_file) as f:
            tnm_data = json_module.load(f)
        
        items = tnm_data.get("items", [])
        if not items:
            _log_to_job(job, ctx, "No 3DEP 1m products found in TNM API for this AOI.")
            _log_to_job(job, ctx, "Trying OpenTopography SRTM as fallback (30m resolution)...")
            
            # Fallback to OpenTopography SRTM GL1
            opentopo_url = (
                f"https://portal.opentopography.org/API/globaldem"
                f"?demtype=SRTMGL1"
                f"&south={south}&north={north}&west={west}&east={east}"
                f"&outputFormat=GTiff"
                f"&API_Key=demoapikeyot2022"
            )
            
            dem_file = download_dir / "srtm_dem.tif"
            download_cmd = ["curl", "-sSfL", opentopo_url, "-o", str(dem_file)]
            _run_command(download_cmd, ctx.project_path, job, ctx, "OpenTopography SRTM download")
            
            if not dem_file.exists() or dem_file.stat().st_size < 1000:
                raise RuntimeError("OpenTopography SRTM download failed or returned empty file")
            
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(dem_file, raw_path)
            
            return ["opentopo_srtm_fetch"], {
                "source": "OpenTopography SRTM GL1",
                "resolution_m": 30,
                "note": "3DEP 1m not available for this AOI, using SRTM 30m"
            }
        
        # Download ALL tiles that intersect the AOI
        _log_to_job(job, ctx, f"Found {len(items)} 3DEP 1m tiles covering the AOI")
        
        tile_files: List[Path] = []
        for idx, item in enumerate(items):
            download_url = item.get("downloadURL")
            if not download_url:
                _log_to_job(job, ctx, f"Skipping tile {idx+1} - no download URL")
                continue
            
            title = item.get("title", f"tile_{idx}")
            _log_to_job(job, ctx, f"Downloading tile {idx+1}/{len(items)}: {title}")
            
            tile_file = download_dir / f"tile_{idx}.tif"
            download_cmd = ["curl", "-sSfL", "--connect-timeout", "30", "--max-time", "300", download_url, "-o", str(tile_file)]
            
            try:
                _run_command(download_cmd, ctx.project_path, job, ctx, f"3DEP tile {idx+1} download")
                if tile_file.exists() and tile_file.stat().st_size > 1000:
                    tile_files.append(tile_file)
                else:
                    _log_to_job(job, ctx, f"Tile {idx+1} download failed or empty")
            except RuntimeError as e:
                _log_to_job(job, ctx, f"Failed to download tile {idx+1}: {e}")
        
        if not tile_files:
            raise RuntimeError("No 3DEP tiles were successfully downloaded")
        
        _log_to_job(job, ctx, f"Successfully downloaded {len(tile_files)} tiles")
        
        # Mosaic tiles and clip to AOI in one step
        # Note: 3DEP tiles are in UTM (NAD83), so we need to specify -te_srs for the bbox
        mosaic_file = download_dir / "3dep_mosaic.tif"
        
        warp_cmd = [
            GDALWARP_BIN,
            "-overwrite",
            "-of", "GTiff",
            "-t_srs", "EPSG:4326",  # Output in WGS84 for consistency
            "-te", str(west), str(south), str(east), str(north),
            "-te_srs", "EPSG:4326",  # Bbox is in WGS84
            "-r", "bilinear",
            "-co", "COMPRESS=LZW",
            "-co", "TILED=YES",
        ] + [str(f) for f in tile_files] + [str(mosaic_file)]
        
        _run_command(warp_cmd, ctx.project_path, job, ctx, "3DEP mosaic and clip")
        
        if not mosaic_file.exists() or mosaic_file.stat().st_size < 1000:
            raise RuntimeError("3DEP mosaic/clip failed or produced empty file")
        
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        if raw_path.exists():
            raw_path.unlink()
        shutil.copy(mosaic_file, raw_path)
        
        _log_to_job(job, ctx, f"3DEP 1m DEM successfully fetched: {raw_path.stat().st_size} bytes")
        
        return ["usgs_3dep_1m_fetch"], {
            "source": "USGS 3DEP 1m LiDAR",
            "tiles_downloaded": len(tile_files),
            "product_titles": [item.get("title") for item in items[:len(tile_files)]],
            "resolution_m": 1,
        }
        
    finally:
        shutil.rmtree(download_dir, ignore_errors=True)


def _osm_overpass_fetch(dataset_key: str, ctx: FetchContext, raw_path: Path, job: DatasetJobState) -> Tuple[List[str], Dict[str, object]]:
    """
    Fetch OSM data with proper attribute expansion for PIRL compatibility.
    Uses JSON output format and Python processing to extract/compute all required fields.
    """
    filters = OSM_OVERPASS_FILTERS.get(dataset_key)
    if not filters:
        raise RuntimeError(f"No Overpass filters configured for dataset '{dataset_key}'")

    south, west, north, east = ctx.bbox[1], ctx.bbox[0], ctx.bbox[3], ctx.bbox[2]
    filter_body = "\n  ".join(f"{expr}({south},{west},{north},{east});" for expr in filters)
    
    # Use JSON format with geometry for proper attribute extraction
    query = f"""
[out:json][timeout:900];
(
  {filter_body}
);
out geom;
""".strip()

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"osm_{dataset_key}_{job.id}_"))
    json_file = tmp_dir / f"{dataset_key}.json"
    geojson_file = tmp_dir / f"{dataset_key}.geojson"
    
    try:
        # Download from Overpass API
        last_error: Optional[Exception] = None
        for endpoint in OVERPASS_ENDPOINTS:
            download_cmd = [
                "curl",
                "-sSfL",
                "-X",
                "POST",
                "-d",
                query,
                endpoint,
                "-o",
                str(json_file),
            ]
            try:
                _run_command(download_cmd, ctx.project_path, job, ctx, f"OSM {dataset_key} download")
                last_error = None
                break
            except RuntimeError as exc:  # noqa: BLE001
                last_error = exc
                _log_to_job(job, ctx, f"Overpass endpoint {endpoint} failed: {exc}")
                continue

        if last_error:
            raise RuntimeError(f"OSM {dataset_key} download failed: {last_error}")

        # Process JSON to GeoJSON with proper attribute schema
        _log_to_job(job, ctx, f"Processing OSM {dataset_key} with attribute expansion...")
        _process_osm_json_to_geojson(dataset_key, json_file, geojson_file, job, ctx)

        # Convert GeoJSON to GeoPackage
        layer_name = _get_osm_layer_name(dataset_key)
        convert_cmd = [
            OGR2OGR_BIN,
            "-f",
            "GPKG",
            "-overwrite",
            "-nln",
            layer_name,
            "-a_srs",
            "EPSG:4326",
            str(raw_path),
            str(geojson_file),
        ]
        _run_command(convert_cmd, ctx.project_path, job, ctx, f"OSM {dataset_key} conversion")
        return [f"osm_{dataset_key}_overpass_fetch"], {}
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _get_osm_layer_name(dataset_key: str) -> str:
    """Map dataset key to proper layer name."""
    layer_names = {
        "roads": "roads",
        "railways": "railways",
        "powerlines": "power_lines",
        "waterways": "waterways",
        "pipelines": "pipelines",
    }
    return layer_names.get(dataset_key, dataset_key)


def _process_osm_json_to_geojson(
    dataset_key: str,
    json_file: Path,
    geojson_file: Path,
    job: DatasetJobState,
    ctx: FetchContext,
) -> None:
    """
    Process Overpass JSON response to GeoJSON with proper attribute schema.
    Implements the same attribute expansion logic as ZEUS CLI tools.
    """
    with open(json_file, "r") as f:
        data = json.load(f)
    
    features = []
    for element in data.get("elements", []):
        if element.get("type") != "way" or "geometry" not in element:
            continue
        
        coords = [[pt["lon"], pt["lat"]] for pt in element["geometry"]]
        if len(coords) < 2:
            continue
        
        tags = element.get("tags", {})
        osm_id = element.get("id")
        
        # Build properties based on dataset type
        if dataset_key == "roads":
            properties = _build_roads_properties(osm_id, tags)
        elif dataset_key == "railways":
            properties = _build_railways_properties(osm_id, tags)
        elif dataset_key == "waterways":
            properties = _build_waterways_properties(osm_id, tags)
        elif dataset_key == "powerlines":
            properties = _build_powerlines_properties(osm_id, tags)
        elif dataset_key == "pipelines":
            properties = _build_pipelines_properties(osm_id, tags)
        else:
            properties = {"osm_id": osm_id, "name": tags.get("name", "")}
        
        feature = {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": properties,
        }
        features.append(feature)
    
    geojson = {"type": "FeatureCollection", "features": features}
    
    with open(geojson_file, "w") as f:
        json.dump(geojson, f)
    
    _log_to_job(job, ctx, f"Processed {len(features)} {dataset_key} features with expanded attributes")


def _build_roads_properties(osm_id: int, tags: Dict[str, str]) -> Dict[str, Any]:
    """Build roads properties with proper schema."""
    return {
        "osm_id": osm_id,
        "name": tags.get("name", ""),
        "highway": tags.get("highway", ""),
        "ref": tags.get("ref", ""),
        "surface": tags.get("surface", ""),
        "lanes": tags.get("lanes", ""),
        "maxspeed": tags.get("maxspeed", ""),
        "oneway": tags.get("oneway", ""),
    }


def _build_railways_properties(osm_id: int, tags: Dict[str, str]) -> Dict[str, Any]:
    """Build railways properties with proper schema."""
    return {
        "osm_id": osm_id,
        "name": tags.get("name", ""),
        "railway": tags.get("railway", ""),
        "operator": tags.get("operator", ""),
        "gauge": tags.get("gauge", ""),
        "electrified": tags.get("electrified", ""),
        "usage": tags.get("usage", ""),
        "service": tags.get("service", ""),
    }


def _build_waterways_properties(osm_id: int, tags: Dict[str, str]) -> Dict[str, Any]:
    """Build waterways properties with width computation logic."""
    waterway_type = tags.get("waterway", "")
    width_raw = tags.get("width", "")
    
    # Parse width from tag
    width_m: Optional[float] = None
    if width_raw:
        try:
            width_m = float(width_raw.split()[0])
        except (ValueError, IndexError):
            pass
    
    # Estimate from waterway type if not tagged
    if width_m is None:
        if waterway_type in ("stream", "ditch"):
            width_m = 2.0  # 1-3m typical
        elif waterway_type == "drain":
            width_m = 5.0  # 3-10m typical
        elif waterway_type == "canal":
            width_m = 15.0  # 10-50m typical
        else:  # river or other
            width_m = 25.0  # default for rivers
    
    # Compute width_class and crossing_cost_cat
    if width_m < 3:
        width_class = "small"
        crossing_cost_cat = "low"  # $10K-20K open cut
    elif width_m < 10:
        width_class = "medium"
        crossing_cost_cat = "medium"  # $30K-70K open cut
    elif width_m < 50:
        width_class = "large"
        crossing_cost_cat = "high"  # $200K-400K HDD
    else:
        width_class = "major"
        crossing_cost_cat = "very_high"  # $800K+ HDD
    
    return {
        "osm_id": osm_id,
        "name": tags.get("name", ""),
        "waterway": waterway_type,
        "width": width_raw,
        "width_m": width_m,
        "width_class": width_class,
        "crossing_cost_cat": crossing_cost_cat,
        "depth": tags.get("depth", ""),
        "seasonal": tags.get("seasonal", ""),
        "intermittent": tags.get("intermittent", ""),
        "tunnel": tags.get("tunnel", ""),
    }


def _build_powerlines_properties(osm_id: int, tags: Dict[str, str]) -> Dict[str, Any]:
    """Build power lines properties with voltage computation logic."""
    power_type = tags.get("power", "")
    voltage_str = tags.get("voltage", "")
    
    # Parse voltage
    voltage_v: Optional[int] = None
    if voltage_str:
        try:
            # Handle formats like "380000", "380 kV", "380kV"
            clean_v = voltage_str.lower().replace("kv", "000").replace(" ", "").replace(",", "")
            voltage_v = int(clean_v)
        except ValueError:
            pass
    
    voltage_kv: Optional[float] = voltage_v / 1000 if voltage_v else None
    
    # Compute voltage_class and crossing_cost
    voltage_class = ""
    crossing_cost = ""
    if voltage_v:
        if voltage_v < 1000:
            voltage_class = "low"
            crossing_cost = "low"
        elif voltage_v < 50000:
            voltage_class = "medium"
            crossing_cost = "medium"
        elif voltage_v < 200000:
            voltage_class = "high"
            crossing_cost = "high"
        else:
            voltage_class = "extra_high"
            crossing_cost = "very_high"
    
    return {
        "osm_id": osm_id,
        "name": tags.get("name", ""),
        "power": power_type,
        "voltage": voltage_str,
        "voltage_v": voltage_v,
        "voltage_kv": voltage_kv,
        "voltage_class": voltage_class,
        "cables": tags.get("cables", ""),
        "operator": tags.get("operator", ""),
        "frequency": tags.get("frequency", ""),
        "ref": tags.get("ref", ""),
        "crossing_cost": crossing_cost,
        "location": tags.get("location", ""),
    }


def _build_pipelines_properties(osm_id: int, tags: Dict[str, str]) -> Dict[str, Any]:
    """Build pipelines properties with proper schema."""
    return {
        "osm_id": osm_id,
        "name": tags.get("name", ""),
        "man_made": tags.get("man_made", ""),
        "substance": tags.get("substance", ""),
        "operator": tags.get("operator", ""),
        "diameter": tags.get("diameter", ""),
        "location": tags.get("location", ""),
        "pressure": tags.get("pressure", ""),
    }


def _overpass_placeholder_command(*_: Any) -> List[str]:
    raise RuntimeError("Overpass datasets must be handled via _osm_overpass_fetch.")


def _resolve_aoi_file(project_path: Path) -> Tuple[Path, Path]:
    candidates = [
        project_path / "data" / "vectors" / "aoi.gpkg",
        project_path / "aoi" / "aoi.gpkg",
        project_path / "aoi" / "aoi.geojson",
        project_path / "aoi" / "aoi.kmz",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate, candidate
    raise HTTPException(status_code=400, detail="AOI file not found (expected data/vectors/aoi.gpkg or aoi/aoi.kmz)")


def _ensure_command_available(path: Path) -> None:
    if not path.exists():
        raise HTTPException(status_code=400, detail=f"ZEUS binary not found at {path}")
    if not os.access(path, os.X_OK):
        raise HTTPException(status_code=400, detail=f"ZEUS binary at {path} is not executable")


def _load_project_context(project: str) -> FetchContext:
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        raise HTTPException(status_code=404, detail=f"Project '{project}' not found")

    metadata_path = project_path / "project_metadata.json"
    metadata = {}
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            metadata = {}

    # Support both nested crs object (new standard) and flat crs_epsg (legacy)
    crs_obj = metadata.get("crs")
    if isinstance(crs_obj, dict):
        target_epsg = crs_obj.get("epsg")
        target_crs_name = crs_obj.get("name")
    else:
        target_epsg = metadata.get("crs_epsg")
        target_crs_name = metadata.get("crs_name")
    
    if not isinstance(target_epsg, int):
        raise HTTPException(status_code=400, detail="project_metadata.json must define CRS (either 'crs.epsg' or legacy 'crs_epsg')")

    aoi_file, cutline_path = _resolve_aoi_file(project_path)
    bbox = _extent_from_cutline(cutline_path) or _parse_project_bbox(project_path)
    if not bbox:
        raise HTTPException(status_code=400, detail="Unable to infer AOI bounding box. Ensure project_aoi.json exists.")

    buffered_bbox = _buffer_bbox(bbox)

    logs_dir = project_path / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / "dataset_fetch.log"

    ctx = FetchContext(
        project=project,
        project_path=project_path,
        target_epsg=target_epsg,
        target_crs_name=target_crs_name,
        iso3=_infer_project_iso3(project_path),
        bbox=buffered_bbox,
        bbox_string=_build_bbox_string(buffered_bbox),
        aoi_file=aoi_file,
        cutline_path=cutline_path,
        log_dir=logs_dir,
        log_file=log_file,
    )
    return ctx


# ---------------------------------------------------------------------------
# Command builders
# ---------------------------------------------------------------------------


def _dem_command(ctx: FetchContext, raw_path: Path, _: Path, override: Optional[str] = None) -> List[str]:
    """
    Build DEM fetch command with proper resolution and provider handling.
    
    Supports:
    - USGS 3DEP 1m LiDAR (USA) via opentopo provider with --res 1m
    - Copernicus EEA 10m (Europe) via copernicus_eea10_fetch tool
    - Copernicus GLO-30 (Global) via copernicus provider with --res 30m
    - TINITALY 10m (Italy) via tinitaly provider
    - SRTM 30m (Global) via srtm provider
    """
    provider = "auto"
    resolution = "30m"  # Default resolution
    normalized = (override or "").lower()
    
    # Detect resolution from override
    if "1m" in normalized or "1-meter" in normalized or "lidar" in normalized:
        resolution = "1m"
    elif "10m" in normalized or "10-meter" in normalized:
        resolution = "10m"
    elif "30m" in normalized or "30-meter" in normalized:
        resolution = "30m"
    
    # Detect provider from override
    if "3dep" in normalized or "usgs" in normalized:
        # USGS 3DEP is accessed via opentopo for 1m LiDAR
        provider = "opentopo"
        if "1m" in normalized or "lidar" in normalized:
            resolution = "1m"
        elif "10m" in normalized:
            resolution = "10m"
        else:
            resolution = "1m"  # Default to 1m for 3DEP as that's its strength
    elif "tinitaly" in normalized:
        provider = "tinitaly"
        resolution = "10m"  # TINITALY is 10m
    elif "copernicus" in normalized or "cop30" in normalized or "glo-30" in normalized:
        provider = "copernicus"
        resolution = "30m"
    elif "eea" in normalized or "cop10" in normalized or "glo-10" in normalized:
        # Copernicus EEA 10m for Europe - use dedicated tool
        return [
            str(ZEUS_BIN),
            "tools",
            "copernicus_eea10_fetch",
            "--bbox",
            ctx.bbox_string,
            "-o",
            str(raw_path),
            "--overwrite",
        ]
    elif "srtm" in normalized:
        provider = "srtm"
        resolution = "30m"
    elif "opentopo" in normalized:
        provider = "opentopo"
        # opentopo supports multiple resolutions
    elif ctx.iso3 == "ITA":
        provider = "tinitaly"
        resolution = "10m"
    elif ctx.iso3 == "USA":
        # Default to 3DEP 1m for USA if no specific override
        provider = "opentopo"
        resolution = "1m"
    
    return [
        str(ZEUS_BIN),
        "tools",
        "dem_fetch",
        "--bbox",
        ctx.bbox_string,
        "--res",
        resolution,
        "--provider",
        provider,
        "-o",
        str(raw_path),
        "--overwrite",
    ]


def _landcover_command(ctx: FetchContext, raw_path: Path, _: Path, override: Optional[str] = None) -> List[str]:
    normalized = (override or "").lower()
    year = "2021"
    year_match = re.search(r"20\d{2}", normalized)
    if year_match:
        year = year_match.group(0)
    return [
        str(ZEUS_BIN),
        "tools",
        "esa_worldcover_fetch",
        "--bbox",
        ctx.bbox_string,
        "--year",
        year,
        "-o",
        str(raw_path),
        "--overwrite",
    ]


def _landcover_fallback_command(ctx: FetchContext, raw_path: Path) -> List[str]:
    return [
        str(ZEUS_BIN),
        "tools",
        "google_dynamicworld_fetch",
        "--bbox",
        ctx.bbox_string,
        "--date",
        "latest",
        "-o",
        str(raw_path),
        "--overwrite",
    ]


def _soil_command(ctx: FetchContext, raw_path: Path, _: Path, override: Optional[str] = None) -> List[str]:
    property_name = "soc"
    normalized = (override or "").lower()
    if "clay" in normalized:
        property_name = "clay"
    elif "sand" in normalized:
        property_name = "sand"
    return [
        str(ZEUS_BIN),
        "tools",
        "soilgrids_fetch",
        "--bbox",
        ctx.bbox_string,
        "--properties",
        property_name,
        "--depth",
        SOIL_DEFAULT_DEPTH,
        "-o",
        str(raw_path),
        "--overwrite",
    ]


def _geohazard_command(ctx: FetchContext, raw_path: Path, _: Path, override: Optional[str] = None) -> List[str]:
    product = "pga"
    normalized = (override or "").lower()
    if "sa1" in normalized or "1.0" in normalized:
        product = "sa1.0"
    return [
        str(ZEUS_BIN),
        "tools",
        "seismic_hazard_fetch",
        "--bbox",
        ctx.bbox_string,
        "--product",
        product,
        "-o",
        str(raw_path),
        "--overwrite",
    ]


DATASET_DEFINITIONS: Dict[str, DatasetDefinition] = {
    "dem": DatasetDefinition(
        key="dem",
        label="Digital Elevation Model (DEM)",
        dataset_type="raster",
        raw_filename="dem_global_30m_raw.tif",
        processed_basename="dem",
        processed_extension="tif",
        symlink_name="dem.tif",
        fetch_tool="dem_fetch",
        command_builder=_dem_command,
        resampling="bilinear",
        nodata=-32768.0,
        description="Core elevation surface used for slope, hydraulics and terrain costs.",
    ),
    "landcover": DatasetDefinition(
        key="landcover",
        label="Landcover (ESA WorldCover 10m)",
        dataset_type="raster",
        raw_filename="landcover_esa_worldcover_raw.tif",
        processed_basename="landcover",
        processed_extension="tif",
        symlink_name="landcover.tif",
        fetch_tool="esa_worldcover_fetch",
        command_builder=_landcover_command,
        resampling="near",
        nodata=0.0,
        description="10 m categorical landcover classes (agriculture, forest, urban, etc.).",
    ),
    "soil": DatasetDefinition(
        key="soil",
        label="Soil (SoilGrids v2.0)",
        dataset_type="raster",
        raw_filename="soil_soilgrids_250m_raw.tif",
        processed_basename="soil",
        processed_extension="tif",
        symlink_name="soil.tif",
        fetch_tool="soilgrids_fetch",
        command_builder=_soil_command,
        resampling="bilinear",
        nodata=-9999.0,
        description="ISRIC SoilGrids SOC 0-30 cm layer for corrosion + constructability.",
    ),
    "geohazard": DatasetDefinition(
        key="geohazard",
        label="Geohazards (GEM/USGS PGA)",
        dataset_type="raster",
        raw_filename="geohazards_gem_seismic_raw.tif",
        processed_basename="geohazards",
        processed_extension="tif",
        symlink_name="geohazards.tif",
        fetch_tool="seismic_hazard_fetch",
        command_builder=_geohazard_command,
        resampling="bilinear",
        nodata=-9999.0,
        description="Peak ground acceleration (PGA) map for seismic risk screening.",
    ),
    "roads": DatasetDefinition(
        key="roads",
        label="Roads (OSM)",
        dataset_type="vector",
        raw_filename="osm_roads_raw.gpkg",
        processed_basename="osm_roads",
        processed_extension="gpkg",
        symlink_name="roads.gpkg",
        fetch_tool="osm_roads_overpass",
        command_builder=_overpass_placeholder_command,
        description="OpenStreetMap road network (highways + local roads).",
    ),
    "railways": DatasetDefinition(
        key="railways",
        label="Railways (OSM)",
        dataset_type="vector",
        raw_filename="osm_railways_raw.gpkg",
        processed_basename="osm_railways",
        processed_extension="gpkg",
        symlink_name="railways.gpkg",
        fetch_tool="osm_railways_overpass",
        command_builder=_overpass_placeholder_command,
        description="OpenStreetMap rail corridors for crossing avoidance.",
    ),
    "powerlines": DatasetDefinition(
        key="powerlines",
        label="Power Lines (OSM)",
        dataset_type="vector",
        raw_filename="osm_power_lines_raw.gpkg",
        processed_basename="osm_power_lines",
        processed_extension="gpkg",
        symlink_name="power_lines.gpkg",
        fetch_tool="osm_power_overpass",
        command_builder=_overpass_placeholder_command,
        description="Transmission + distribution assets for clearance buffers.",
    ),
    "waterways": DatasetDefinition(
        key="waterways",
        label="Waterways (OSM)",
        dataset_type="vector",
        raw_filename="osm_waterways_raw.gpkg",
        processed_basename="osm_waterways",
        processed_extension="gpkg",
        symlink_name="waterways.gpkg",
        fetch_tool="osm_waterways_overpass",
        command_builder=_overpass_placeholder_command,
        description="Rivers + streams used for hydraulic constraints.",
    ),
    "pipelines": DatasetDefinition(
        key="pipelines",
        label="Pipelines (OSM)",
        dataset_type="vector",
        raw_filename="osm_pipelines_raw.gpkg",
        processed_basename="pipelines",
        processed_extension="gpkg",
        symlink_name="pipelines.gpkg",
        fetch_tool="osm_pipelines_overpass",
        command_builder=_overpass_placeholder_command,
        description="Existing pipelines for ROW alignment + crossings.",
    ),
}

REQUIRED_DATASETS = list(DATASET_DEFINITIONS.keys())

DATASET_METADATA_PROFILES: Dict[str, Dict[str, Dict[str, object]]] = {
    "dem": {
        "auto": {
            "dataset_name": "Global DEM 30m (Auto)",
            "source": "Copernicus DEM / NASA SRTM (auto-selected)",
            "provider": "ESA & NASA",
            "provider_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "coverage_date": "2021",
            "documentation_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "license": "Copernicus Data License / NASA SRTM Terms",
            "attribution": "Contains Copernicus DEM and NASA SRTM data.",
            "resolution_m": 30,
        },
        "3dep": {
            "dataset_name": "USGS 3DEP LiDAR DEM 1m",
            "source": "USGS 3D Elevation Program (3DEP) LiDAR",
            "provider": "U.S. Geological Survey",
            "provider_url": "https://www.usgs.gov/3d-elevation-program",
            "coverage_date": "Current (continuously updated)",
            "documentation_url": "https://www.usgs.gov/3d-elevation-program",
            "license": "Public Domain (US Government Work)",
            "attribution": "U.S. Geological Survey 3D Elevation Program (3DEP).",
            "resolution_m": 1,
            "notes": "Highest quality national elevation data for the US. LiDAR-derived bare-earth DEM with vertical accuracy typically better than 10cm RMSE.",
        },
        "eea10": {
            "dataset_name": "Copernicus DEM EEA-10",
            "source": "Copernicus DEM (EEA-10)",
            "provider": "European Space Agency (Copernicus)",
            "provider_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "coverage_date": "2021",
            "documentation_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "license": "Copernicus Data License",
            "attribution": "Contains modified Copernicus Sentinel data (2021) processed by ESA.",
            "resolution_m": 10,
            "notes": "10m resolution DEM available for European Economic Area.",
        },
        "copernicus": {
            "dataset_name": "Copernicus DEM GLO-30",
            "source": "Copernicus DEM (GLO-30)",
            "provider": "European Space Agency (Copernicus)",
            "provider_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "coverage_date": "2021",
            "documentation_url": "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
            "license": "Copernicus Data License",
            "attribution": "Contains modified Copernicus Sentinel data (2021) processed by ESA.",
            "resolution_m": 30,
        },
        "tinitaly": {
            "dataset_name": "TINITALY DEM 10m",
            "source": "TINITALY/01 square km Digital Elevation Model",
            "provider": "INGV - Istituto Nazionale di Geofisica e Vulcanologia",
            "provider_url": "https://tinitaly.pi.ingv.it/",
            "coverage_date": "2011",
            "documentation_url": "https://tinitaly.pi.ingv.it/Download_Area1.html",
            "license": "CC BY 4.0",
            "attribution": "TINITALY DEM © INGV.",
            "resolution_m": 10,
        },
        "srtm": {
            "dataset_name": "NASA SRTM GL1 30m",
            "source": "Shuttle Radar Topography Mission (SRTM) GL1",
            "provider": "NASA Jet Propulsion Laboratory",
            "provider_url": "https://www2.jpl.nasa.gov/srtm/",
            "coverage_date": "2000",
            "documentation_url": "https://www2.jpl.nasa.gov/srtm/",
            "license": "Public Domain",
            "attribution": "Contains NASA SRTM data.",
            "resolution_m": 30,
        },
    },
    "landcover": {
        "default": {
            "dataset_name": "ESA WorldCover 10m",
            "source": "ESA WorldCover",
            "provider": "European Space Agency / VITO",
            "provider_url": "https://worldcover2021.esa.int/",
            "coverage_date": "2021",
            "documentation_url": "https://worldcover2021.esa.int/",
            "license": "CC BY 4.0",
            "attribution": "© ESA WorldCover, produced by VITO.",
            "resolution_m": 10,
        }
    },
    "soil": {
        "default": {
            "dataset_name": "SoilGrids v2.0 (SOC 0-30cm)",
            "source": "ISRIC SoilGrids v2.0",
            "provider": "ISRIC - World Soil Information",
            "provider_url": "https://soilgrids.org/",
            "coverage_date": "2020",
            "documentation_url": "https://www.isric.org/explore/soilgrids",
            "license": "CC BY 4.0",
            "attribution": "Contains ISRIC SoilGrids data.",
            "resolution_m": 250,
        }
    },
    "geohazard": {
        "default": {
            "dataset_name": "GEM Global Seismic Hazard (PGA)",
            "source": "GEM / USGS Global Hazard Model",
            "provider": "Global Earthquake Model (GEM) Foundation",
            "provider_url": "https://hazard.openquake.org/",
            "coverage_date": "2018",
            "documentation_url": "https://hazard.openquake.org/",
            "license": "CC BY-NC-SA 4.0",
            "attribution": "Contains data © GEM Foundation.",
            "resolution_m": 1000,
        }
    },
    "roads": {
        "default": {
            "dataset_name": "OpenStreetMap Roads Extract",
            "source": "OpenStreetMap (highway)",
            "provider": "OpenStreetMap Contributors",
            "provider_url": "https://www.openstreetmap.org",
            "coverage_date": "Current (live OSM)",
            "documentation_url": "https://wiki.openstreetmap.org/wiki/Overpass_API",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors.",
            "resolution_m": None,
        }
    },
    "railways": {
        "default": {
            "dataset_name": "OpenStreetMap Railways Extract",
            "source": "OpenStreetMap (railway)",
            "provider": "OpenStreetMap Contributors",
            "provider_url": "https://www.openstreetmap.org",
            "coverage_date": "Current (live OSM)",
            "documentation_url": "https://wiki.openstreetmap.org/wiki/Overpass_API",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors.",
            "resolution_m": None,
        }
    },
    "powerlines": {
        "default": {
            "dataset_name": "OpenStreetMap Power Network Extract",
            "source": "OpenStreetMap (power)",
            "provider": "OpenStreetMap Contributors",
            "provider_url": "https://www.openstreetmap.org",
            "coverage_date": "Current (live OSM)",
            "documentation_url": "https://wiki.openstreetmap.org/wiki/Overpass_API",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors.",
            "resolution_m": None,
        }
    },
    "waterways": {
        "default": {
            "dataset_name": "OpenStreetMap Waterways Extract",
            "source": "OpenStreetMap (waterway)",
            "provider": "OpenStreetMap Contributors",
            "provider_url": "https://www.openstreetmap.org",
            "coverage_date": "Current (live OSM)",
            "documentation_url": "https://wiki.openstreetmap.org/wiki/Overpass_API",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors.",
            "resolution_m": None,
        }
    },
    "pipelines": {
        "default": {
            "dataset_name": "OpenStreetMap Pipelines Extract",
            "source": "OpenStreetMap (pipeline)",
            "provider": "OpenStreetMap Contributors",
            "provider_url": "https://www.openstreetmap.org",
            "coverage_date": "Current (live OSM)",
            "documentation_url": "https://wiki.openstreetmap.org/wiki/Overpass_API",
            "license": "ODbL 1.0",
            "attribution": "© OpenStreetMap contributors.",
            "resolution_m": None,
        }
    },
}

OSM_OVERPASS_FILTERS: Dict[str, List[str]] = {
    "roads": ['way["highway"]', 'relation["highway"]'],
    "railways": ['way["railway"]', 'relation["railway"]'],
    "powerlines": ['way["power"~"line|minor_line"]', 'relation["power"~"line|minor_line"]'],
    "waterways": ['way["waterway"]', 'relation["waterway"]'],
    "pipelines": [
        'way["man_made"="pipeline"]',
        'way["pipeline"]',
        'relation["man_made"="pipeline"]',
        'relation["pipeline"]',
    ],
}

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def _get_zeus_version() -> str:
    global _ZEUS_VERSION_CACHE
    if _ZEUS_VERSION_CACHE is not None:
        return _ZEUS_VERSION_CACHE
    if not ZEUS_BIN.exists():
        _ZEUS_VERSION_CACHE = "unavailable"
        return _ZEUS_VERSION_CACHE
    try:
        result = subprocess.run([str(ZEUS_BIN), "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            _ZEUS_VERSION_CACHE = lines[0] if lines else "unknown"
        else:
            _ZEUS_VERSION_CACHE = "unknown"
    except Exception:  # noqa: BLE001
        _ZEUS_VERSION_CACHE = "unknown"
    return _ZEUS_VERSION_CACHE


def _metadata_profile(category: str, profile_key: str) -> Dict[str, object]:
    profiles = DATASET_METADATA_PROFILES.get(category, {})
    base = profiles.get(profile_key) or profiles.get("default") or {}
    return copy.deepcopy(base)


def _normalize_override(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _is_copernicus_override(text: str) -> bool:
    normalized = (text or "").lower()
    return "copernicus" in normalized or "cop30" in normalized or "glo-30" in normalized


def _is_3dep_override(text: str) -> bool:
    """Check if the override requests USGS 3DEP / 1m LiDAR DEM.

    Enhanced to catch more variations including:
    - Direct mentions: 3dep, usgs, lidar, opentopo
    - Resolution mentions: 1m, 1-meter, 1 meter, one meter, 1-m
    - Quality mentions: high resolution, high-res, highest, best
    - Combined: usgs 1m, 3dep lidar, etc.
    """
    normalized = (text or "").lower().strip()
    if not normalized:
        return False

    # Direct source keywords
    direct_keywords = ["3dep", "usgs dem", "usgs 3d", "lidar", "opentopo", "national map", "tnm"]
    if any(kw in normalized for kw in direct_keywords):
        return True

    # Resolution-based detection (1 meter DEM)
    resolution_patterns = [
        "1m", "1-m", "1 m", "1meter", "1-meter", "1 meter",
        "one meter", "onemeter", "1 metre", "1-metre",
        "high res", "high-res", "highres", "highest res",
        "best resolution", "best quality", "finest"
    ]
    if any(pattern in normalized for pattern in resolution_patterns):
        return True

    # Check for "1" followed by "m" or "meter" with possible spaces/hyphens
    import re
    if re.search(r'\b1\s*[-]?\s*m(?:eter|etre)?\b', normalized):
        return True

    return False


def _resolve_profile_key(defn: DatasetDefinition, ctx: FetchContext, override_text: str) -> str:
    if defn.key == "dem":
        # Check for 3DEP/1m first (highest resolution)
        if _is_3dep_override(override_text):
            return "3dep"
        if "tinitaly" in override_text:
            return "tinitaly"
        if "eea" in override_text or "cop10" in override_text or "glo-10" in override_text:
            return "eea10"
        if _is_copernicus_override(override_text):
            return "copernicus"
        if "srtm" in override_text:
            return "srtm"
        # Country-specific defaults
        if ctx.iso3 == "ITA":
            return "tinitaly"
        if ctx.iso3 == "USA":
            return "3dep"  # Default to 3DEP 1m for USA
        return "auto"
    return "default"


def _extract_year_from_text(text: str) -> Optional[str]:
    match = re.search(r"(20\d{2})", text or "")
    return match.group(1) if match else None


def _build_metadata_context(
    defn: DatasetDefinition,
    ctx: FetchContext,
    override: Optional[str],
    fetch_info: Optional[Dict[str, object]] = None,
) -> Dict[str, object]:
    normalized = _normalize_override(override)
    profile_key = _resolve_profile_key(defn, ctx, normalized)
    metadata = _metadata_profile(defn.key, profile_key)
    metadata.setdefault("notes", defn.description)
    if "resolution_m" not in metadata:
        metadata["resolution_m"] = 30 if defn.dataset_type == "raster" else None
    metadata["category"] = defn.key
    metadata["project"] = ctx.project
    metadata["selected_override"] = override if override else None
    metadata.setdefault("tiles_downloaded", [])

    if fetch_info:
        if "tiles_downloaded" in fetch_info and fetch_info["tiles_downloaded"]:
            metadata["tiles_downloaded"] = fetch_info["tiles_downloaded"]  # type: ignore[assignment]
        for key in ("coverage_date", "notes"):
            if key in fetch_info and fetch_info[key]:
                metadata[key] = fetch_info[key]  # type: ignore[assignment]

    if defn.key == "landcover":
        dataset_variant = fetch_info.get("landcover_dataset") if fetch_info else None
        if dataset_variant == "google_dynamic_world":
            metadata["dataset_name"] = "Google Dynamic World 10m"
            metadata["source"] = "Google Dynamic World"
            metadata["provider"] = "Google / World Resources Institute"
            metadata["provider_url"] = "https://www.dynamicworld.app/"
            metadata["documentation_url"] = "https://www.dynamicworld.app/explore"
            metadata["license"] = "CC BY 4.0"
            metadata["attribution"] = "© Google, World Resources Institute"
            if fetch_info and fetch_info.get("coverage_date"):
                metadata["coverage_date"] = fetch_info["coverage_date"]
        else:
            year = _extract_year_from_text(normalized) or metadata.get("coverage_date") or "2021"
            metadata["coverage_date"] = str(year)
            metadata["dataset_name"] = f"ESA WorldCover {year}"
            metadata["source"] = f"ESA WorldCover {year}"
    elif defn.key == "soil":
        property_label = "SOC"
        if "clay" in normalized:
            property_label = "Clay"
        elif "sand" in normalized:
            property_label = "Sand"
        metadata["dataset_name"] = f"SoilGrids v2.0 ({property_label} {SOIL_DEFAULT_DEPTH})"
        metadata["coverage_depth"] = SOIL_DEFAULT_DEPTH
        metadata["notes"] = f"{defn.description} Property: {property_label} at {SOIL_DEFAULT_DEPTH}."
    elif defn.key == "geohazard":
        product = "PGA"
        if "sa1" in normalized or "1.0" in normalized:
            product = "SA(1.0s)"
        metadata["dataset_name"] = f"GEM Global Seismic Hazard ({product})"
        metadata["source"] = f"GEM hazard surface {product}"

    return metadata


def _extract_epsg_from_info(info: Dict[str, Any]) -> Optional[str]:
    cs = info.get("coordinateSystem") or {}
    wkt = cs.get("wkt")
    if not wkt:
        return None
    match = re.search(r'ID\["EPSG",\s*(\d+)\]', wkt)
    if match:
        return f"EPSG:{match.group(1)}"
    return None


def _collect_bounds_from_geojson(geom: Dict[str, Any]) -> Optional[Tuple[float, float, float, float]]:
    bounds = [float("inf"), float("inf"), float("-inf"), float("-inf")]

    def _walk(coords: Any) -> None:
        if coords is None:
            return
        if isinstance(coords, (list, tuple)):
            if coords and isinstance(coords[0], (int, float)):
                x, y = coords[:2]
                bounds[0] = min(bounds[0], float(x))
                bounds[1] = min(bounds[1], float(y))
                bounds[2] = max(bounds[2], float(x))
                bounds[3] = max(bounds[3], float(y))
            else:
                for part in coords:
                    _walk(part)

    def _collect(obj: Any) -> None:
        if obj is None:
            return
        geom_type = obj.get("type")
        if geom_type == "FeatureCollection":
            for feature in obj.get("features", []):
                _collect(feature.get("geometry"))
        elif geom_type == "Feature":
            _collect(obj.get("geometry"))
        elif geom_type == "GeometryCollection":
            for g in obj.get("geometries", []):
                _collect(g)
        else:
            _walk(obj.get("coordinates"))

    _collect(geom)
    if (
        float("inf") in bounds
        or float("-inf") in bounds
        or bounds[0] == bounds[2]
        or bounds[1] == bounds[3]
    ):
        return None
    return bounds[0], bounds[1], bounds[2], bounds[3]


def _extent_from_gdal_info(info: Dict[str, Any]) -> Optional[Dict[str, float]]:
    corners = info.get("cornerCoordinates")
    if not isinstance(corners, dict):
        return None
    xs = []
    ys = []
    for point in corners.values():
        if isinstance(point, (list, tuple)) and len(point) >= 2:
            xs.append(float(point[0]))
            ys.append(float(point[1]))
    if not xs or not ys:
        return None
    return {
        "minx": min(xs),
        "miny": min(ys),
        "maxx": max(xs),
        "maxy": max(ys),
        "crs": "EPSG:4326",
    }


def _bbox_from_wgs84_extent(extent_geom: Dict[str, Any]) -> Optional[Dict[str, float]]:
    bounds = _collect_bounds_from_geojson(extent_geom)
    if not bounds:
        return None
    minx, miny, maxx, maxy = bounds
    return {"west": minx, "south": miny, "east": maxx, "north": maxy, "crs": "EPSG:4326"}


def _bbox_dict_from_tuple(bbox: Tuple[float, float, float, float]) -> Dict[str, float]:
    minx, miny, maxx, maxy = bbox
    return {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy, "crs": "EPSG:4326"}


def _bbox_wgs84_from_tuple(bbox: Tuple[float, float, float, float]) -> Dict[str, float]:
    minx, miny, maxx, maxy = bbox
    return {"west": minx, "south": miny, "east": maxx, "north": maxy, "crs": "EPSG:4326"}


def _compute_file_sha256(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def _extract_raster_statistics(info: Dict[str, Any]) -> Optional[Dict[str, float]]:
    bands = info.get("bands")
    if not isinstance(bands, list) or not bands:
        return None
    band = bands[0]
    stats_meta = band.get("metadata", {}).get("", {})
    if not stats_meta:
        return None

    def _safe_float(value: Optional[str]) -> Optional[float]:
        try:
            return float(value) if value is not None else None
        except (TypeError, ValueError):
            return None

    stats = {
        "min": _safe_float(stats_meta.get("STATISTICS_MINIMUM")),
        "max": _safe_float(stats_meta.get("STATISTICS_MAXIMUM")),
        "mean": _safe_float(stats_meta.get("STATISTICS_MEAN")),
        "stddev": _safe_float(stats_meta.get("STATISTICS_STDDEV")),
        "valid_percent": _safe_float(stats_meta.get("STATISTICS_VALID_PERCENT")),
    }
    return {k: v for k, v in stats.items() if v is not None}


# ---------------------------------------------------------------------------
# Job state + registry
# ---------------------------------------------------------------------------


@dataclass
class DatasetJobState:
    id: str
    project: str
    categories: List[str]
    force: bool
    overrides: Dict[str, str] = field(default_factory=dict)
    cancel_requested: bool = False
    status: Literal["pending", "running", "succeeded", "failed"] = "pending"
    logs: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=_utc_now)
    started_at: Optional[datetime] = None
    updated_at: datetime = field(default_factory=_utc_now)
    completed_at: Optional[datetime] = None
    current_category: Optional[str] = None
    progress: float = 0.0
    error: Optional[str] = None
    category_states: Dict[str, Dict[str, Optional[str]]] = field(default_factory=dict)


JOB_REGISTRY: Dict[str, DatasetJobState] = {}
PROJECT_ACTIVE_JOBS: Dict[str, str] = {}
JOB_LOCK = threading.Lock()

# Stage names matching frontend expectations
STAGE_NAMES = [
    "prefetch_scan",     # Initial scan/setup
    "fetch",             # Data transfer
    "zeus_ai",           # AI agent operations
    "raw_metadata",      # Metadata extraction
    "validation",        # Integrity check
    "process",           # Geoprocessing
    "processed_metadata", # Indexing
    "layer_publish"      # Map publish
]


def _init_stages() -> Dict[str, Dict[str, Optional[str]]]:
    """Initialize all stages to queued status."""
    return {
        stage: {
            "status": "queued",
            "message": None,
            "started_at": None,
            "completed_at": None,
        }
        for stage in STAGE_NAMES
    }


def _init_category_state() -> Dict[str, Any]:
    """Create initial category state with stages."""
    return {
        "status": "queued",
        "message": None,
        "started_at": None,
        "completed_at": None,
        "stages": _init_stages(),
    }


def _update_stage(job: DatasetJobState, category: str, stage: str, status: str, message: Optional[str] = None) -> None:
    """Update a specific stage's status within a category."""
    with JOB_LOCK:
        cat_state = job.category_states.get(category)
        if not cat_state:
            return
        stages = cat_state.get("stages")
        if not stages or stage not in stages:
            return
        stage_state = stages[stage]
        stage_state["status"] = status
        if message:
            stage_state["message"] = message
        if status == "running" and not stage_state.get("started_at"):
            stage_state["started_at"] = _utc_iso()
        if status in ("succeeded", "failed", "skipped"):
            stage_state["completed_at"] = _utc_iso()
        job.updated_at = _utc_now()


def _log_to_job(job: DatasetJobState, ctx: FetchContext, message: str) -> None:
    timestamp = _utc_iso()
    line = f"[{timestamp}] [{job.project}] {message}"
    with JOB_LOCK:
        job.logs.append(line)
        if len(job.logs) > 800:
            job.logs = job.logs[-800:]
        job.updated_at = _utc_now()
    try:
        with ctx.log_file.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def _cancel_if_requested(job: DatasetJobState, ctx: FetchContext) -> bool:
    if not getattr(job, "cancel_requested", False):
        return False

    message = "Cancelled by user"
    now_iso = _utc_iso()
    with JOB_LOCK:
        for category, state in job.category_states.items():
            status = state.get("status")
            if status in (None, "queued", "running"):
                state["status"] = "cancelled"
                state["message"] = message
                state["completed_at"] = state.get("completed_at") or now_iso
                # Also cancel all stages that haven't completed
                stages = state.get("stages")
                if stages:
                    for stage_name, stage_state in stages.items():
                        s_status = stage_state.get("status")
                        if s_status in (None, "queued", "running"):
                            stage_state["status"] = "cancelled"
                            stage_state["message"] = message
                            stage_state["completed_at"] = stage_state.get("completed_at") or now_iso
        job.status = "failed"
        job.error = job.error or message
        job.current_category = None
        job.completed_at = _utc_now()
        job.updated_at = job.completed_at
    _log_to_job(job, ctx, "Cancellation request acknowledged; terminating job.")
    return True


def _run_command(cmd: List[str], cwd: Path, job: DatasetJobState, ctx: FetchContext, label: str) -> None:
    display = " ".join(cmd)
    _log_to_job(job, ctx, f"{label}: {display}")
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert process.stdout is not None
    for line in process.stdout:
        _log_to_job(job, ctx, f"{label}: {line.rstrip()}")
    rc = process.wait()
    if rc != 0:
        raise RuntimeError(f"{label} failed (exit code {rc})")


def _ensure_symlink(link_path: Path, target_path: Path) -> None:
    link_path.parent.mkdir(parents=True, exist_ok=True)
    if link_path.exists() or link_path.is_symlink():
        link_path.unlink()
    relative = os.path.relpath(target_path, link_path.parent)
    os.symlink(relative, link_path)


def _dataset_ready(defn: DatasetDefinition, ctx: FetchContext) -> bool:
    processed = defn.processed_path(ctx)
    meta = defn.processed_metadata_path(ctx)
    return processed.exists() and meta.exists() and processed.stat().st_size > 1024


def _gdal_info(path: Path) -> Optional[Dict]:
    result = subprocess.run([GDALINFO_BIN, "-json", "-stats", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def _ogr_info(path: Path) -> Optional[Dict]:
    result = subprocess.run([OGRINFO_BIN, "-al", "-so", "-q", "-json", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def _write_json(path: Path, payload: Dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _generate_processed_metadata(
    defn: DatasetDefinition,
    ctx: FetchContext,
    raw_path: Path,
    raw_meta: Path,
    processed_path: Path,
    metadata_overrides: Optional[Dict[str, object]] = None,
) -> None:
    base_meta: Dict[str, Any] = {
        "dataset_name": f"{defn.label} (Processed)",
        "category": defn.key,
        "project": ctx.project,
        "processing_date": _utc_iso(),
        "target_crs": f"EPSG:{ctx.target_epsg}",
        "target_crs_name": ctx.target_crs_name,
        "data_type": "Raster" if defn.dataset_type == "raster" else "Vector",
        "format": "GeoTIFF" if defn.dataset_type == "raster" else "GeoPackage",
        "processed_path": str(processed_path),
        "raw_path": str(raw_path),
        "raw_metadata_file": str(raw_meta),
        "source_files": [
            {
                "filename": raw_path.name,
                "metadata": raw_meta.name if raw_meta.exists() else None,
            }
        ],
        "operations_applied": [
            {
                "operation": "reproject",
                "tool": "gdalwarp" if defn.dataset_type == "raster" else "ogr2ogr",
                "target_epsg": ctx.target_epsg,
            },
            {"operation": "clip", "tool": "AOI cutline", "source": str(ctx.cutline_path)},
        ],
        "file_size_bytes": processed_path.stat().st_size if processed_path.exists() else 0,
        "validation_status": "passed",
        "validation_date": _utc_iso(),
        "protocol_reference": DATASET_FETCH_PROTOCOL,
        "protocol_version": PROTOCOL_VERSION,
        "zeus_version": _get_zeus_version(),
        "notes": defn.description,
    }

    dataset_name_override: Optional[str] = None
    if metadata_overrides:
        overrides = copy.deepcopy(metadata_overrides)
        dataset_name_override = overrides.get("dataset_name")
        overrides.pop("tiles_downloaded", None)
        for key, value in overrides.items():
            if value is not None:
                base_meta[key] = value
    if dataset_name_override:
        base_meta["dataset_name"] = f"{dataset_name_override} (Processed)"

    info = _gdal_info(processed_path) if defn.dataset_type == "raster" else _ogr_info(processed_path)
    if info:
        if defn.dataset_type == "raster":
            geo = info.get("geoTransform")
            if geo and isinstance(geo, list) and len(geo) >= 6:
                base_meta["resolution_m"] = {
                    "x": abs(float(geo[1])),
                    "y": abs(float(geo[5])),
                }
            if "size" in info:
                base_meta["dimensions"] = {"width": info["size"][0], "height": info["size"][1]}
            extent = _extent_from_gdal_info(info)
            if extent:
                base_meta["extent"] = extent
            wgs84 = info.get("wgs84Extent")
            if isinstance(wgs84, dict):
                bbox = _bbox_from_wgs84_extent(wgs84)
                if bbox:
                    base_meta["bbox_wgs84"] = bbox
            stats = _extract_raster_statistics(info)
            if stats:
                base_meta["statistics"] = stats
        else:
            layers = info.get("layers") or []
            if layers:
                layer = layers[0]
                extent = layer.get("extent")
                if extent:
                    base_meta["extent"] = {
                        "minx": extent["xmin"],
                        "maxx": extent["xmax"],
                        "miny": extent["ymin"],
                        "maxy": extent["ymax"],
                        "crs": layer.get("srs", f"EPSG:{ctx.target_epsg}"),
                    }
                    base_meta["bbox_wgs84"] = {
                        "west": extent["xmin"],
                        "east": extent["xmax"],
                        "south": extent["ymin"],
                        "north": extent["ymax"],
                        "crs": layer.get("srs", f"EPSG:{ctx.target_epsg}"),
                    }
                base_meta["feature_count"] = layer.get("featureCount")
    if defn.dataset_type == "vector":
        if not base_meta.get("extent"):
            base_meta["extent"] = _bbox_dict_from_tuple(ctx.bbox)
        if not base_meta.get("bbox_wgs84"):
            base_meta["bbox_wgs84"] = _bbox_wgs84_from_tuple(ctx.bbox)
        if base_meta.get("feature_count") is None:
            base_meta["feature_count"] = 0

    _write_json(defn.processed_metadata_path(ctx), base_meta)


def _generate_raw_metadata(
    defn: DatasetDefinition,
    ctx: FetchContext,
    raw_path: Path,
    raw_meta_path: Path,
    fetch_command: List[str],
    metadata_overrides: Optional[Dict[str, object]] = None,
) -> None:
    payload: Dict[str, Any] = {
        "dataset_name": defn.label,
        "category": defn.key,
        "project": ctx.project,
        "raw_path": str(raw_path),
        "fetch_tool": defn.fetch_tool,
        "fetch_command": " ".join(fetch_command),
        "fetch_date": _utc_iso(),
        "data_type": "Raster" if defn.dataset_type == "raster" else "Vector",
        "format": "GeoTIFF" if defn.dataset_type == "raster" else "GeoPackage",
        "file_size_bytes": raw_path.stat().st_size if raw_path.exists() else 0,
        "protocol_reference": DATASET_FETCH_PROTOCOL,
        "protocol_version": PROTOCOL_VERSION,
        "zeus_version": _get_zeus_version(),
        "tiles_downloaded": [],
        "notes": defn.description,
        "requested_bbox_wgs84": {
            "west": ctx.bbox[0],
            "south": ctx.bbox[1],
            "east": ctx.bbox[2],
            "north": ctx.bbox[3],
            "crs": "EPSG:4326",
        },
        "validation_status": "passed",
        "validation_date": _utc_iso(),
    }
    if defn.nodata is not None:
        payload["nodata_value"] = defn.nodata

    if metadata_overrides:
        overrides = copy.deepcopy(metadata_overrides)
        tiles = overrides.pop("tiles_downloaded", None)
        if tiles is not None:
            payload["tiles_downloaded"] = tiles
        for key, value in overrides.items():
            if value is not None:
                payload[key] = value

    info = _gdal_info(raw_path) if defn.dataset_type == "raster" else _ogr_info(raw_path)
    if info:
        payload["metadata"] = info
        epsg = _extract_epsg_from_info(info)
        if epsg:
            payload["raw_crs"] = epsg

        if defn.dataset_type == "raster":
            extent = _extent_from_gdal_info(info)
            if extent:
                payload["extent"] = extent
            wgs84 = info.get("wgs84Extent")
            if isinstance(wgs84, dict):
                bbox = _bbox_from_wgs84_extent(wgs84)
                if bbox:
                    payload["bbox_wgs84"] = bbox
            stats = _extract_raster_statistics(info)
            if stats:
                payload["statistics"] = stats
        else:
            layers = info.get("layers") or []
            target_layer: Optional[Dict[str, Any]] = None
            for layer in layers:
                if layer.get("name") == "lines":
                    target_layer = layer
                    break
            if not target_layer and layers:
                target_layer = layers[0]

            if target_layer:
                extent = target_layer.get("extent")
                if extent:
                    payload["extent"] = {
                        "minx": extent.get("xmin"),
                        "miny": extent.get("ymin"),
                        "maxx": extent.get("xmax"),
                        "maxy": extent.get("ymax"),
                        "crs": target_layer.get("srs", "EPSG:4326"),
                    }
                    payload["bbox_wgs84"] = {
                        "west": extent.get("xmin"),
                        "south": extent.get("ymin"),
                        "east": extent.get("xmax"),
                        "north": extent.get("ymax"),
                        "crs": target_layer.get("srs", "EPSG:4326"),
                    }
                payload["feature_count"] = target_layer.get("featureCount")
            if "feature_count" not in payload:
                payload["feature_count"] = 0

    if defn.dataset_type == "vector":
        if not payload.get("raw_crs"):
            payload["raw_crs"] = "EPSG:4326"
        if not payload.get("extent"):
            payload["extent"] = _bbox_dict_from_tuple(ctx.bbox)
        if not payload.get("bbox_wgs84"):
            payload["bbox_wgs84"] = _bbox_wgs84_from_tuple(ctx.bbox)
        if payload.get("feature_count") is None:
            payload["feature_count"] = 0

    checksum = _compute_file_sha256(raw_path)
    if checksum:
        payload["checksum_sha256"] = checksum

    _write_json(raw_meta_path, payload)


def _process_raster(defn: DatasetDefinition, ctx: FetchContext, raw_path: Path, job: DatasetJobState) -> None:
    processed_path = defn.processed_path(ctx)
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = processed_path.with_suffix(".tmp.tif")
    if tmp_path.exists():
        tmp_path.unlink()
    cmd = [
        GDALWARP_BIN,
        "-t_srs",
        f"EPSG:{ctx.target_epsg}",
        "-cutline",
        str(ctx.cutline_path),
        "-crop_to_cutline",
        "-of",
        "GTiff",
        "-co",
        "COMPRESS=LZW",
        "-co",
        "TILED=YES",
        "-wo",
        "NUM_THREADS=ALL_CPUS",
        "-multi",
        "-r",
        defn.resampling,
        str(raw_path),
        str(tmp_path),
    ]
    if defn.nodata is not None:
        cmd.extend(["-dstnodata", str(defn.nodata)])
    _run_command(cmd, ctx.project_path, job, ctx, f"{defn.label} reprojection")
    if processed_path.exists():
        processed_path.unlink()
    tmp_path.replace(processed_path)


def _process_vector(defn: DatasetDefinition, ctx: FetchContext, raw_path: Path, job: DatasetJobState) -> None:
    """
    Process vector data: reproject, clip to AOI, and enrich with computed fields.
    Preserves ALL original attributes from any source while adding standardized computed fields.
    """
    processed_path = defn.processed_path(ctx)
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = processed_path.with_suffix(".tmp.gpkg")
    if tmp_path.exists():
        tmp_path.unlink()
    
    # Step 1: Reproject and clip (preserves all original attributes)
    cmd = [
        OGR2OGR_BIN,
        "-f",
        "GPKG",
        "-t_srs",
        f"EPSG:{ctx.target_epsg}",
        "-clipsrc",
        str(ctx.cutline_path),
        "-makevalid",
        "-nlt",
        "PROMOTE_TO_MULTI",
        "-lco",
        "SPATIAL_INDEX=YES",
        "-overwrite",
        str(tmp_path),
        str(raw_path),
    ]
    _run_command(cmd, ctx.project_path, job, ctx, f"{defn.label} processing")
    
    # Step 2: Enrich with computed fields (non-destructive - adds fields, never removes)
    if defn.key in ("roads", "railways", "waterways", "powerlines", "pipelines"):
        _log_to_job(job, ctx, f"Enriching {defn.label} with computed attributes...")
        _enrich_vector_attributes(defn.key, tmp_path, job, ctx)
    
    if processed_path.exists():
        processed_path.unlink()
    tmp_path.replace(processed_path)


def _enrich_vector_attributes(dataset_key: str, gpkg_path: Path, job: DatasetJobState, ctx: FetchContext) -> None:
    """
    Enrich vector attributes with computed fields for PIRL compatibility.
    This is NON-DESTRUCTIVE: it preserves ALL original attributes and only ADDS new computed fields.
    Works with any source (OSM, government datasets, commercial data, etc.)
    """
    try:
        from osgeo import ogr, gdal
        gdal.UseExceptions()
    except ImportError:
        _log_to_job(job, ctx, "GDAL Python bindings not available, skipping attribute enrichment")
        return
    
    ds = ogr.Open(str(gpkg_path), update=1)
    if ds is None:
        _log_to_job(job, ctx, f"Could not open {gpkg_path} for attribute enrichment")
        return
    
    try:
        layer = ds.GetLayer(0)
        if layer is None:
            return
        
        layer_defn = layer.GetLayerDefn()
        existing_fields = {layer_defn.GetFieldDefn(i).GetName().lower() for i in range(layer_defn.GetFieldCount())}
        
        # Define computed fields based on dataset type
        if dataset_key == "waterways":
            _enrich_waterways(layer, existing_fields, job, ctx)
        elif dataset_key == "powerlines":
            _enrich_powerlines(layer, existing_fields, job, ctx)
        elif dataset_key == "roads":
            _enrich_roads(layer, existing_fields, job, ctx)
        elif dataset_key == "railways":
            _enrich_railways(layer, existing_fields, job, ctx)
        elif dataset_key == "pipelines":
            _enrich_pipelines(layer, existing_fields, job, ctx)
        
    finally:
        ds = None  # Close dataset


def _add_field_if_missing(layer, field_name: str, field_type, existing_fields: set) -> bool:
    """Add a field to layer if it doesn't already exist. Returns True if field was added."""
    from osgeo import ogr
    if field_name.lower() in existing_fields:
        return False
    field_defn = ogr.FieldDefn(field_name, field_type)
    layer.CreateField(field_defn)
    return True


def _enrich_waterways(layer, existing_fields: set, job: DatasetJobState, ctx: FetchContext) -> None:
    """Enrich waterways with width_m, width_class, crossing_cost_cat if not present."""
    from osgeo import ogr
    
    # Add computed fields if they don't exist
    added_width_m = _add_field_if_missing(layer, "width_m", ogr.OFTReal, existing_fields)
    added_width_class = _add_field_if_missing(layer, "width_class", ogr.OFTString, existing_fields)
    added_crossing_cost = _add_field_if_missing(layer, "crossing_cost_cat", ogr.OFTString, existing_fields)
    
    if not (added_width_m or added_width_class or added_crossing_cost):
        # All fields already exist, nothing to compute
        return
    
    layer_defn = layer.GetLayerDefn()
    
    # Find source fields (case-insensitive lookup)
    width_field_idx = -1
    waterway_field_idx = -1
    for i in range(layer_defn.GetFieldCount()):
        fname = layer_defn.GetFieldDefn(i).GetName().lower()
        if fname == "width":
            width_field_idx = i
        elif fname == "waterway":
            waterway_field_idx = i
    
    enriched_count = 0
    layer.ResetReading()
    feature = layer.GetNextFeature()
    while feature:
        # Get existing width_m if present, otherwise compute
        width_m = None
        if not added_width_m:
            width_m = feature.GetFieldAsDouble("width_m")
        
        if width_m is None or width_m == 0:
            # Try to parse from width field
            if width_field_idx >= 0:
                width_raw = feature.GetFieldAsString(width_field_idx)
                if width_raw:
                    try:
                        width_m = float(width_raw.split()[0])
                    except (ValueError, IndexError):
                        pass
            
            # Estimate from waterway type if still unknown
            if width_m is None or width_m == 0:
                waterway_type = ""
                if waterway_field_idx >= 0:
                    waterway_type = (feature.GetFieldAsString(waterway_field_idx) or "").lower()
                
                if waterway_type in ("stream", "ditch"):
                    width_m = 2.0
                elif waterway_type == "drain":
                    width_m = 5.0
                elif waterway_type == "canal":
                    width_m = 15.0
                else:  # river or unknown
                    width_m = 25.0
        
        # Compute classifications
        if width_m and width_m > 0:
            if width_m < 3:
                width_class = "small"
                crossing_cost_cat = "low"
            elif width_m < 10:
                width_class = "medium"
                crossing_cost_cat = "medium"
            elif width_m < 50:
                width_class = "large"
                crossing_cost_cat = "high"
            else:
                width_class = "major"
                crossing_cost_cat = "very_high"
            
            if added_width_m:
                feature.SetField("width_m", width_m)
            if added_width_class:
                feature.SetField("width_class", width_class)
            if added_crossing_cost:
                feature.SetField("crossing_cost_cat", crossing_cost_cat)
            
            layer.SetFeature(feature)
            enriched_count += 1
        
        feature = layer.GetNextFeature()
    
    _log_to_job(job, ctx, f"Enriched {enriched_count} waterway features with computed attributes")


def _enrich_powerlines(layer, existing_fields: set, job: DatasetJobState, ctx: FetchContext) -> None:
    """Enrich power lines with voltage_v, voltage_kv, voltage_class, crossing_cost if not present."""
    from osgeo import ogr
    
    added_voltage_v = _add_field_if_missing(layer, "voltage_v", ogr.OFTInteger, existing_fields)
    added_voltage_kv = _add_field_if_missing(layer, "voltage_kv", ogr.OFTReal, existing_fields)
    added_voltage_class = _add_field_if_missing(layer, "voltage_class", ogr.OFTString, existing_fields)
    added_crossing_cost = _add_field_if_missing(layer, "crossing_cost", ogr.OFTString, existing_fields)
    
    if not (added_voltage_v or added_voltage_kv or added_voltage_class or added_crossing_cost):
        return
    
    layer_defn = layer.GetLayerDefn()
    
    # Find voltage field
    voltage_field_idx = -1
    for i in range(layer_defn.GetFieldCount()):
        fname = layer_defn.GetFieldDefn(i).GetName().lower()
        if fname == "voltage":
            voltage_field_idx = i
            break
    
    enriched_count = 0
    layer.ResetReading()
    feature = layer.GetNextFeature()
    while feature:
        voltage_v = None
        
        # Try to get existing voltage_v
        if not added_voltage_v:
            voltage_v = feature.GetFieldAsInteger("voltage_v")
        
        # Parse from voltage string if needed
        if (voltage_v is None or voltage_v == 0) and voltage_field_idx >= 0:
            voltage_str = feature.GetFieldAsString(voltage_field_idx) or ""
            if voltage_str:
                try:
                    clean_v = voltage_str.lower().replace("kv", "000").replace(" ", "").replace(",", "")
                    voltage_v = int(clean_v)
                except ValueError:
                    pass
        
        if voltage_v and voltage_v > 0:
            voltage_kv = voltage_v / 1000.0
            
            if voltage_v < 1000:
                voltage_class = "low"
                crossing_cost = "low"
            elif voltage_v < 50000:
                voltage_class = "medium"
                crossing_cost = "medium"
            elif voltage_v < 200000:
                voltage_class = "high"
                crossing_cost = "high"
            else:
                voltage_class = "extra_high"
                crossing_cost = "very_high"
            
            if added_voltage_v:
                feature.SetField("voltage_v", voltage_v)
            if added_voltage_kv:
                feature.SetField("voltage_kv", voltage_kv)
            if added_voltage_class:
                feature.SetField("voltage_class", voltage_class)
            if added_crossing_cost:
                feature.SetField("crossing_cost", crossing_cost)
            
            layer.SetFeature(feature)
            enriched_count += 1
        
        feature = layer.GetNextFeature()
    
    _log_to_job(job, ctx, f"Enriched {enriched_count} power line features with computed attributes")


def _enrich_roads(layer, existing_fields: set, job: DatasetJobState, ctx: FetchContext) -> None:
    """Enrich roads with road_class, crossing_difficulty if not present."""
    from osgeo import ogr
    
    added_road_class = _add_field_if_missing(layer, "road_class", ogr.OFTString, existing_fields)
    added_crossing_diff = _add_field_if_missing(layer, "crossing_difficulty", ogr.OFTString, existing_fields)
    
    if not (added_road_class or added_crossing_diff):
        return
    
    layer_defn = layer.GetLayerDefn()
    
    # Find highway/road type field
    highway_field_idx = -1
    for i in range(layer_defn.GetFieldCount()):
        fname = layer_defn.GetFieldDefn(i).GetName().lower()
        if fname in ("highway", "road_type", "fclass", "type"):
            highway_field_idx = i
            break
    
    enriched_count = 0
    layer.ResetReading()
    feature = layer.GetNextFeature()
    while feature:
        highway_type = ""
        if highway_field_idx >= 0:
            highway_type = (feature.GetFieldAsString(highway_field_idx) or "").lower()
        
        # Classify road and crossing difficulty
        if highway_type in ("motorway", "motorway_link", "trunk", "trunk_link"):
            road_class = "major"
            crossing_difficulty = "high"
        elif highway_type in ("primary", "primary_link", "secondary", "secondary_link"):
            road_class = "arterial"
            crossing_difficulty = "medium"
        elif highway_type in ("tertiary", "tertiary_link", "unclassified", "residential"):
            road_class = "local"
            crossing_difficulty = "low"
        elif highway_type in ("service", "track", "path", "footway", "cycleway"):
            road_class = "minor"
            crossing_difficulty = "very_low"
        else:
            road_class = "unknown"
            crossing_difficulty = "medium"
        
        if added_road_class:
            feature.SetField("road_class", road_class)
        if added_crossing_diff:
            feature.SetField("crossing_difficulty", crossing_difficulty)
        
        layer.SetFeature(feature)
        enriched_count += 1
        
        feature = layer.GetNextFeature()
    
    _log_to_job(job, ctx, f"Enriched {enriched_count} road features with computed attributes")


def _enrich_railways(layer, existing_fields: set, job: DatasetJobState, ctx: FetchContext) -> None:
    """Enrich railways with rail_class, crossing_difficulty if not present."""
    from osgeo import ogr
    
    added_rail_class = _add_field_if_missing(layer, "rail_class", ogr.OFTString, existing_fields)
    added_crossing_diff = _add_field_if_missing(layer, "crossing_difficulty", ogr.OFTString, existing_fields)
    
    if not (added_rail_class or added_crossing_diff):
        return
    
    layer_defn = layer.GetLayerDefn()
    
    # Find railway type and usage fields
    railway_field_idx = -1
    usage_field_idx = -1
    for i in range(layer_defn.GetFieldCount()):
        fname = layer_defn.GetFieldDefn(i).GetName().lower()
        if fname in ("railway", "rail_type", "fclass", "type"):
            railway_field_idx = i
        elif fname == "usage":
            usage_field_idx = i
    
    enriched_count = 0
    layer.ResetReading()
    feature = layer.GetNextFeature()
    while feature:
        railway_type = ""
        usage = ""
        if railway_field_idx >= 0:
            railway_type = (feature.GetFieldAsString(railway_field_idx) or "").lower()
        if usage_field_idx >= 0:
            usage = (feature.GetFieldAsString(usage_field_idx) or "").lower()
        
        # Classify railway and crossing difficulty
        if railway_type == "rail":
            if usage == "main":
                rail_class = "mainline"
                crossing_difficulty = "very_high"
            elif usage in ("branch", "industrial"):
                rail_class = "branch"
                crossing_difficulty = "high"
            else:
                rail_class = "standard"
                crossing_difficulty = "high"
        elif railway_type in ("subway", "light_rail", "tram"):
            rail_class = "transit"
            crossing_difficulty = "medium"
        elif railway_type in ("narrow_gauge", "miniature"):
            rail_class = "narrow"
            crossing_difficulty = "low"
        elif railway_type in ("abandoned", "disused", "preserved"):
            rail_class = "inactive"
            crossing_difficulty = "very_low"
        else:
            rail_class = "unknown"
            crossing_difficulty = "medium"
        
        if added_rail_class:
            feature.SetField("rail_class", rail_class)
        if added_crossing_diff:
            feature.SetField("crossing_difficulty", crossing_difficulty)
        
        layer.SetFeature(feature)
        enriched_count += 1
        
        feature = layer.GetNextFeature()
    
    _log_to_job(job, ctx, f"Enriched {enriched_count} railway features with computed attributes")


def _enrich_pipelines(layer, existing_fields: set, job: DatasetJobState, ctx: FetchContext) -> None:
    """Enrich pipelines with pipeline_class, crossing_consideration if not present."""
    from osgeo import ogr
    
    added_pipe_class = _add_field_if_missing(layer, "pipeline_class", ogr.OFTString, existing_fields)
    added_crossing_consid = _add_field_if_missing(layer, "crossing_consideration", ogr.OFTString, existing_fields)
    
    if not (added_pipe_class or added_crossing_consid):
        return
    
    layer_defn = layer.GetLayerDefn()
    
    # Find substance and type fields
    substance_field_idx = -1
    type_field_idx = -1
    for i in range(layer_defn.GetFieldCount()):
        fname = layer_defn.GetFieldDefn(i).GetName().lower()
        if fname == "substance":
            substance_field_idx = i
        elif fname in ("type", "pipeline_type", "man_made"):
            type_field_idx = i
    
    enriched_count = 0
    layer.ResetReading()
    feature = layer.GetNextFeature()
    while feature:
        substance = ""
        if substance_field_idx >= 0:
            substance = (feature.GetFieldAsString(substance_field_idx) or "").lower()
        
        # Classify pipeline and crossing consideration
        if substance in ("gas", "natural_gas", "lng"):
            pipeline_class = "gas"
            crossing_consideration = "high"  # Safety and regulatory requirements
        elif substance in ("oil", "petroleum", "crude"):
            pipeline_class = "oil"
            crossing_consideration = "high"
        elif substance in ("water", "sewage", "wastewater"):
            pipeline_class = "water"
            crossing_consideration = "medium"
        elif substance in ("chemicals", "hazmat"):
            pipeline_class = "hazardous"
            crossing_consideration = "very_high"
        else:
            pipeline_class = "unknown"
            crossing_consideration = "medium"
        
        if added_pipe_class:
            feature.SetField("pipeline_class", pipeline_class)
        if added_crossing_consid:
            feature.SetField("crossing_consideration", crossing_consideration)
        
        layer.SetFeature(feature)
        enriched_count += 1
        
        feature = layer.GetNextFeature()
    
    _log_to_job(job, ctx, f"Enriched {enriched_count} pipeline features with computed attributes")


def _execute_dataset(defn: DatasetDefinition, ctx: FetchContext, job: DatasetJobState) -> None:
    category = defn.key

    # ========== STAGE: prefetch_scan ==========
    _update_stage(job, category, "prefetch_scan", "running", "Initializing dataset fetch")

    # Get override first so we can determine correct raw filename
    override = getattr(job, "overrides", {}).get(defn.key) if hasattr(job, "overrides") else None
    override_text = (override or "").lower()
    if override:
        _log_to_job(job, ctx, f"Applying override '{override}' for {defn.label}")

    # Now get paths with override for dynamic filename
    raw_path = defn.raw_path(ctx, override)
    raw_meta = defn.raw_metadata_path(ctx, override)
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    if raw_path.exists():
        raw_path.unlink()
    if raw_meta.exists():
        raw_meta.unlink()
    processed_path = defn.processed_path(ctx)
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    if processed_path.exists():
        processed_path.unlink()

    _update_stage(job, category, "prefetch_scan", "succeeded", "Paths configured")

    fetch_info: Dict[str, object] = {}
    fetch_cmd: List[str] = []
    agent_commands: Optional[List[str]] = None
    agent_completed_successfully = False

    # ========== STAGE: zeus_ai ==========
    # Try ZEUS AI agent first - it will persist and retry on errors
    if AGENT_ENABLED:
        _update_stage(job, category, "zeus_ai", "running", "ZEUS AI agent processing")
        try:
            agent_commands = _run_agent_for_dataset(defn, ctx, job, override)
            if agent_commands:
                agent_completed_successfully = True
                fetch_cmd = ["zeus_ai_agent"] + [cmd.strip() for cmd in agent_commands if cmd and cmd.strip()]
                _update_stage(job, category, "zeus_ai", "succeeded", "Agent completed successfully")
                # Mark fetch as succeeded since agent handled it
                _update_stage(job, category, "fetch", "succeeded", "Data transferred via AI agent")
        except RuntimeError as agent_exc:
            # Agent exhausted retries or explicitly failed - check if we should fall back
            error_msg = str(agent_exc)
            if "unavailable" in error_msg.lower() or "ANTHROPIC_API_KEY" in error_msg:
                # API not available - fall back to native pipeline
                _log_to_job(
                    job,
                    ctx,
                    f"ZEUS AI unavailable for {defn.label}; using native pipeline: {agent_exc}",
                )
                _update_stage(job, category, "zeus_ai", "skipped", "API unavailable, using native pipeline")
            else:
                # Agent tried but exhausted retries - this is a hard failure, don't fall back
                _log_to_job(
                    job,
                    ctx,
                    f"ZEUS AI failed to complete {defn.label} after retries: {agent_exc}",
                )
                _update_stage(job, category, "zeus_ai", "failed", str(agent_exc))
                raise RuntimeError(f"ZEUS AI could not complete {defn.label}: {agent_exc}")
    else:
        _update_stage(job, category, "zeus_ai", "skipped", "Agent disabled")

    # ========== STAGE: fetch ==========
    # Only use native pipeline if agent is not available (not if it failed after trying)
    if not agent_completed_successfully and not agent_commands:
        _update_stage(job, category, "fetch", "running", "Downloading data via native pipeline")
        _log_to_job(job, ctx, f"Using native pipeline for {defn.label}")

        try:
            if defn.key in OSM_OVERPASS_FILTERS:
                fetch_cmd, fetch_info = _osm_overpass_fetch(defn.key, ctx, raw_path, job)
            elif defn.key == "dem" and _is_3dep_override(override_text):
                # Use direct OpenTopography/TNM API fetch for 3DEP 1m requests
                _log_to_job(job, ctx, "Using direct OpenTopography/TNM API for USGS 3DEP 1m DEM")
                fetch_cmd, fetch_info = _opentopo_3dep_fetch(ctx, raw_path, job)
            elif defn.key == "dem" and _is_copernicus_override(override_text):
                # Use direct Copernicus fetch for Copernicus 30m
                fetch_cmd, fetch_info = _copernicus_fetch(ctx, raw_path, job)
            else:
                # Use the command builder which handles TINITALY, EEA10, etc.
                fetch_cmd = defn.command_builder(ctx, raw_path, raw_meta, override)
                _log_to_job(job, ctx, f"Executing: {' '.join(fetch_cmd)}")
                try:
                    _run_command(fetch_cmd, ctx.project_path, job, ctx, f"{defn.label} fetch")
                except RuntimeError as exc:  # noqa: BLE001
                    if defn.key == "landcover":
                        fallback_cmd = _landcover_fallback_command(ctx, raw_path)
                        _log_to_job(job, ctx, "ESA WorldCover unavailable, falling back to Google Dynamic World.")
                        _run_command(fallback_cmd, ctx.project_path, job, ctx, "Landcover fallback fetch")
                        fetch_cmd = fallback_cmd
                        fetch_info = {
                            "landcover_dataset": "google_dynamic_world",
                            "coverage_date": _utc_iso().split("T")[0],
                        }
                    elif defn.key == "dem":
                        # DEM fetch failed - try direct API as last resort
                        _log_to_job(job, ctx, f"ZEUS CLI DEM fetch failed: {exc}")
                        _log_to_job(job, ctx, "Attempting direct API fetch as fallback...")
                        try:
                            if _is_3dep_override(override_text) or ctx.iso3 == "USA":
                                fetch_cmd, fetch_info = _opentopo_3dep_fetch(ctx, raw_path, job)
                            else:
                                fetch_cmd, fetch_info = _copernicus_fetch(ctx, raw_path, job)
                        except RuntimeError as api_exc:
                            _log_to_job(job, ctx, f"Direct API fetch also failed: {api_exc}")
                            _log_to_job(job, ctx, f"Requested source: {override_text or 'auto'}")
                            _log_to_job(job, ctx, "NOTE: No automatic fallback to lower resolution DEM - user must explicitly select alternate source.")
                            _update_stage(job, category, "fetch", "failed", f"DEM fetch failed: {api_exc}")
                            raise RuntimeError(f"DEM fetch failed for '{override_text or 'auto'}': {exc}. Direct API also failed: {api_exc}")
                    else:
                        _update_stage(job, category, "fetch", "failed", str(exc))
                        raise

            if not raw_path.exists() or raw_path.stat().st_size == 0:
                _update_stage(job, category, "fetch", "failed", "Raw dataset missing or empty")
                raise RuntimeError("Raw dataset missing or empty after fetch")

            _update_stage(job, category, "fetch", "succeeded", "Data downloaded successfully")

            # ========== STAGE: process ==========
            _update_stage(job, category, "process", "running", "Geoprocessing data")
            if defn.dataset_type == "raster":
                _process_raster(defn, ctx, raw_path, job)
            else:
                _process_vector(defn, ctx, raw_path, job)
            _update_stage(job, category, "process", "succeeded", "Geoprocessing complete")

        except RuntimeError:
            raise
        except Exception as e:
            _update_stage(job, category, "fetch", "failed", str(e))
            raise

    # ========== STAGE: validation ==========
    _update_stage(job, category, "validation", "running", "Validating raw data")

    # Verify raw file exists
    if not raw_path.exists() or raw_path.stat().st_size == 0:
        _update_stage(job, category, "validation", "failed", "Raw dataset missing or empty")
        raise RuntimeError("Raw dataset missing or empty after fetch")

    # If agent completed but processed file is missing/empty, run processing as fallback
    if not processed_path.exists() or processed_path.stat().st_size == 0:
        _log_to_job(job, ctx, f"Processed file missing after agent completion, running native processing for {defn.label}")
        _update_stage(job, category, "process", "running", "Running native geoprocessing as fallback")
        if defn.dataset_type == "raster":
            _process_raster(defn, ctx, raw_path, job)
        else:
            _process_vector(defn, ctx, raw_path, job)
        _update_stage(job, category, "process", "succeeded", "Native geoprocessing complete")

    # Final validation
    if not processed_path.exists() or processed_path.stat().st_size == 0:
        _update_stage(job, category, "validation", "failed", "Processed dataset missing or empty")
        raise RuntimeError("Processed dataset missing or empty after processing")

    _update_stage(job, category, "validation", "succeeded", "Data integrity verified")

    # ========== STAGE: raw_metadata ==========
    _update_stage(job, category, "raw_metadata", "running", "Extracting raw metadata")
    metadata_context = _build_metadata_context(defn, ctx, override, fetch_info)
    _generate_raw_metadata(defn, ctx, raw_path, raw_meta, fetch_cmd, metadata_context)
    _update_stage(job, category, "raw_metadata", "succeeded", "Raw metadata generated")

    # ========== STAGE: processed_metadata ==========
    _update_stage(job, category, "processed_metadata", "running", "Indexing processed data")
    _generate_processed_metadata(defn, ctx, raw_path, raw_meta, processed_path, metadata_context)
    _update_stage(job, category, "processed_metadata", "succeeded", "Metadata indexed")

    # ========== STAGE: layer_publish ==========
    _update_stage(job, category, "layer_publish", "running", "Publishing to map layer")
    # NOTE: Symlinks are deprecated - the Layer Manager now reads directly from /processed folders
    _update_stage(job, category, "layer_publish", "succeeded", "Layer available in map")


def _execute_job(job: DatasetJobState) -> None:
    ctx = _load_project_context(job.project)
    with JOB_LOCK:
        job.status = "running"
        job.started_at = _utc_now()
        job.updated_at = job.started_at
        job.progress = 0.0
        # Initialize category states with nested stages
        job.category_states = {
            category: _init_category_state()
            for category in job.categories
        }

    total = len(job.categories)
    for index, category in enumerate(job.categories):
        if _cancel_if_requested(job, ctx):
            return
        defn = DATASET_DEFINITIONS.get(category)
        if not defn:
            raise RuntimeError(f"Unknown dataset category '{category}'")

        override_for_category = job.overrides.get(category) if hasattr(job, "overrides") else None

        with JOB_LOCK:
            job.current_category = category
            state = job.category_states[category]
            state["status"] = "running"
            state["started_at"] = _utc_iso()
            job.progress = index / total
            job.updated_at = _utc_now()

        _log_to_job(job, ctx, f"Starting {defn.label}")

        try:
            if not job.force and not override_for_category and _dataset_ready(defn, ctx):
                with JOB_LOCK:
                    state = job.category_states[category]
                    state["status"] = "skipped"
                    state["message"] = "Already satisfied"
                    state["completed_at"] = _utc_iso()
                    # Mark all stages as skipped
                    for stage_name in STAGE_NAMES:
                        state["stages"][stage_name]["status"] = "skipped"
                        state["stages"][stage_name]["completed_at"] = _utc_iso()
                    job.progress = (index + 1) / total
                _log_to_job(job, ctx, f"{defn.label} already processed — skipping fetch.")
                continue

            _execute_dataset(defn, ctx, job)

            if _cancel_if_requested(job, ctx):
                return

            with JOB_LOCK:
                state = job.category_states[category]
                state["status"] = "succeeded"
                state["message"] = "Completed"
                state["completed_at"] = _utc_iso()
                job.progress = (index + 1) / total
                job.updated_at = _utc_now()

            _log_to_job(job, ctx, f"Finished {defn.label}")
        except Exception as exc:  # noqa: BLE001
            with JOB_LOCK:
                state = job.category_states[category]
                state["status"] = "failed"
                state["message"] = str(exc)
                state["completed_at"] = _utc_iso()
                job.status = "failed"
                job.error = str(exc)
                job.progress = (index + 1) / total
                job.updated_at = _utc_now()
                job.completed_at = _utc_now()
            _log_to_job(job, ctx, f"{defn.label} failed: {exc}")
            return

    if _cancel_if_requested(job, ctx):
        return

    with JOB_LOCK:
        job.status = "succeeded"
        job.progress = 1.0
        job.current_category = None
        job.completed_at = _utc_now()
        job.updated_at = job.completed_at
    _log_to_job(job, ctx, "Dataset fetch pipeline completed successfully.")


def _job_thread(job_id: str) -> None:
    job = JOB_REGISTRY[job_id]
    try:
        _execute_job(job)
    finally:
        with JOB_LOCK:
            PROJECT_ACTIVE_JOBS.pop(job.project, None)
        # Clean up conversation memory
        _cleanup_conversation(job_id)


def _start_job(project: str, categories: List[str], force: bool, overrides: Optional[Dict[str, str]] = None) -> DatasetJobState:
    with JOB_LOCK:
        if project in PROJECT_ACTIVE_JOBS:
            existing = PROJECT_ACTIVE_JOBS[project]
            raise HTTPException(
                status_code=409,
                detail=f"A dataset fetch job ({existing}) is already running for project '{project}'.",
            )

    cleaned_overrides: Dict[str, str] = {}
    if overrides:
        for key, value in overrides.items():
            if key in categories and value:
                cleaned_overrides[key] = value

    job_id = uuid.uuid4().hex
    job = DatasetJobState(id=job_id, project=project, categories=categories, force=force, overrides=cleaned_overrides)
    with JOB_LOCK:
        JOB_REGISTRY[job.id] = job
        PROJECT_ACTIVE_JOBS[project] = job.id

    thread = threading.Thread(target=_job_thread, args=(job.id,), daemon=True)
    thread.start()
    return job


def _job_to_response(job: DatasetJobState) -> "DatasetJobResponse":
    return DatasetJobResponse(
        id=job.id,
        project=job.project,
        status=job.status,
        progress=job.progress,
        current_category=job.current_category,
        started_at=job.started_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
        categories=job.category_states,
        logs=job.logs,
        force=job.force,
        error=job.error,
        overrides=job.overrides,
    )


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------


class DatasetCategoryStatus(BaseModel):
    category: str
    label: str
    dataset_type: Literal["raster", "vector"]
    required: bool
    present: bool
    raw_path: Optional[str]
    processed_path: Optional[str]
    metadata_path: Optional[str]
    last_modified: Optional[str]
    description: Optional[str]


class DatasetStatusResponse(BaseModel):
    project: str
    target_epsg: int
    minimum_requirements_met: bool
    categories: List[DatasetCategoryStatus]
    protocol_reference: str = DATASET_FETCH_PROTOCOL


class DatasetFetchRequest(BaseModel):
    categories: List[str] = Field(..., description="Dataset category identifiers to fetch.")
    force: bool = Field(False, description="If true, refetch even if processed dataset already exists.")
    overrides: Optional[Dict[str, str]] = Field(default=None, description="Optional preferred dataset sources per category.")


class DatasetFetchJobResponse(BaseModel):
    job_id: str


class StageState(BaseModel):
    """State of a single processing stage."""
    status: str
    message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class CategoryState(BaseModel):
    """State of a dataset category with its stages."""
    status: str
    message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    stages: Dict[str, StageState]


class DatasetJobResponse(BaseModel):
    id: str
    project: str
    status: Literal["pending", "running", "succeeded", "failed"]
    progress: float
    current_category: Optional[str]
    started_at: Optional[datetime]
    updated_at: datetime
    completed_at: Optional[datetime]
    categories: Dict[str, CategoryState]
    logs: List[str]
    force: bool
    error: Optional[str]
    overrides: Optional[Dict[str, str]] = None


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@router.get("/projects/{project}/dataset-status", response_model=DatasetStatusResponse)
def get_dataset_status(project: str) -> DatasetStatusResponse:
    _ensure_command_available(ZEUS_BIN)
    ctx = _load_project_context(project)
    statuses: List[DatasetCategoryStatus] = []
    for key, defn in DATASET_DEFINITIONS.items():
        raw_path = defn.raw_path(ctx)
        processed_path = defn.processed_path(ctx)
        meta_path = defn.processed_metadata_path(ctx)
        present = processed_path.exists() and meta_path.exists()
        last_modified: Optional[str] = None
        if present:
            try:
                mtime = processed_path.stat().st_mtime
                last_modified = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            except OSError:
                last_modified = None
        statuses.append(
            DatasetCategoryStatus(
                category=key,
                label=defn.label,
                dataset_type=defn.dataset_type,
                required=defn.required,
                present=present,
                raw_path=str(raw_path) if raw_path.exists() else None,
                processed_path=str(processed_path) if processed_path.exists() else None,
                metadata_path=str(meta_path) if meta_path.exists() else None,
                last_modified=last_modified,
                description=defn.description,
            )
        )
    minimum_met = all(status.present for status in statuses if status.required)
    return DatasetStatusResponse(
        project=project,
        target_epsg=ctx.target_epsg,
        minimum_requirements_met=minimum_met,
        categories=statuses,
    )


@router.post("/projects/{project}/dataset-fetch", response_model=DatasetFetchJobResponse)
def trigger_dataset_fetch(project: str, request: DatasetFetchRequest) -> DatasetFetchJobResponse:
    _ensure_command_available(ZEUS_BIN)
    if not request.categories:
        raise HTTPException(status_code=400, detail="At least one dataset category must be specified.")

    invalid = [c for c in request.categories if c not in DATASET_DEFINITIONS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid dataset categories: {', '.join(invalid)}")

    deduped = []
    for cat in request.categories:
        if cat not in deduped:
            deduped.append(cat)

    job = _start_job(project, deduped, request.force, request.overrides)
    return DatasetFetchJobResponse(job_id=job.id)


@router.get("/dataset-jobs/{job_id}", response_model=DatasetJobResponse)
def get_dataset_job(job_id: str) -> DatasetJobResponse:
    job = JOB_REGISTRY.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _job_to_response(job)




@router.get("/dataset-jobs/{job_id}/stream")
async def stream_dataset_job(job_id: str):
    if job_id not in JOB_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    async def event_generator():
        last_serialized: Optional[str] = None
        while True:
            with JOB_LOCK:
                job = JOB_REGISTRY.get(job_id)
                snapshot = _job_to_response(job) if job else None
            if not snapshot:
                break
            payload = snapshot.model_dump(mode="json")
            serialized = json.dumps(payload)
            if serialized != last_serialized:
                yield f"data: {serialized}\n\n"
                last_serialized = serialized
            if snapshot.status in ("succeeded", "failed"):
                break
            await asyncio.sleep(1.0)

    # SSE requires specific headers to prevent buffering and enable real-time streaming
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Connection": "keep-alive",
        }
    )


@router.delete("/dataset-jobs/{job_id}", status_code=202)
def cancel_dataset_job(job_id: str):
    with JOB_LOCK:
        job = JOB_REGISTRY.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
        if job.status in ("succeeded", "failed"):
            return Response(status_code=204)
        job.cancel_requested = True
        job.error = job.error or "Cancelled by user"
        job.updated_at = _utc_now()
    return Response(status_code=202)
