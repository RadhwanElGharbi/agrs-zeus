# Large AOI Handling - Implementation Plan

**Document Version:** 1.0
**Created:** December 6, 2025
**Status:** Planned
**Priority:** High

## Executive Summary

The current dataset fetching pipeline is optimized for small to medium AOIs (typically < 500 km²). When processing large pipeline corridor AOIs such as the Keystone XL project (~101,186 km²), the pipeline encounters several critical limitations including API timeouts, memory exhaustion, and lack of resumability.

This document outlines the implementation plan for supporting large-scale AOI processing.

---

## Problem Analysis

### Test Case: Keystone XL Pipeline Corridor
- **AOI Area:** ~101,186 km²
- **Length:** 1,897 km (Hardisty, Alberta to Steele City, Nebraska)
- **Estimated Dataset Size:** 10.7 GB - 13.5 GB (excluding satellite imagery)

### Current Limitations

| Component | Limitation | Impact |
|-----------|------------|--------|
| Overpass API (OSM) | 900s timeout, no chunking | Query fails for large areas |
| WCS Services | Single-request size limits | Cannot fetch large DEM areas |
| Memory | Loads all data before mosaicking | OOM for large tile counts |
| Progress | No checkpointing | Full restart on failure |
| Parallelism | Sequential downloads | Slow for many tiles |

---

## Implementation Plan

### Phase 1: Spatial Chunking Infrastructure

**Priority:** Critical
**Estimated Complexity:** Medium

#### 1.1 Grid Cell Decomposition

Create a utility module that decomposes large AOIs into manageable grid cells.

**File:** `/opt/agrs/gui-v2/backend/utils/spatial_chunking.py`

```python
"""
Spatial chunking utilities for large AOI processing.
"""
from shapely.geometry import box, Polygon
from shapely.ops import unary_union
import math
from typing import List, Tuple, Generator
import json

DEFAULT_CHUNK_SIZE_KM = 50  # 50 km x 50 km chunks

def calculate_optimal_chunk_size(aoi_area_km2: float) -> float:
    """
    Calculate optimal chunk size based on AOI area.

    - Small AOIs (< 1,000 km²): No chunking needed
    - Medium AOIs (1,000 - 10,000 km²): 100 km chunks
    - Large AOIs (10,000 - 100,000 km²): 50 km chunks
    - Very Large AOIs (> 100,000 km²): 25 km chunks
    """
    if aoi_area_km2 < 1000:
        return None  # No chunking
    elif aoi_area_km2 < 10000:
        return 100.0
    elif aoi_area_km2 < 100000:
        return 50.0
    else:
        return 25.0

def create_grid_chunks(
    aoi_geometry: Polygon,
    chunk_size_km: float = DEFAULT_CHUNK_SIZE_KM
) -> Generator[Tuple[int, int, Polygon], None, None]:
    """
    Decompose AOI into grid cells.

    Yields: (row, col, chunk_polygon) for each cell that intersects AOI
    """
    bounds = aoi_geometry.bounds  # (minx, miny, maxx, maxy)
    minx, miny, maxx, maxy = bounds

    # Convert km to degrees (approximate at this latitude)
    avg_lat = (miny + maxy) / 2
    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * math.cos(math.radians(avg_lat))

    chunk_deg_lat = chunk_size_km / km_per_deg_lat
    chunk_deg_lon = chunk_size_km / km_per_deg_lon

    row = 0
    y = miny
    while y < maxy:
        col = 0
        x = minx
        while x < maxx:
            chunk_box = box(x, y, x + chunk_deg_lon, y + chunk_deg_lat)

            # Only yield chunks that intersect the AOI
            if chunk_box.intersects(aoi_geometry):
                # Clip to actual AOI boundary
                clipped = chunk_box.intersection(aoi_geometry)
                if not clipped.is_empty:
                    yield (row, col, clipped)

            x += chunk_deg_lon
            col += 1
        y += chunk_deg_lat
        row += 1

def get_chunk_count(aoi_geometry: Polygon, chunk_size_km: float) -> int:
    """Get total number of chunks for progress tracking."""
    return sum(1 for _ in create_grid_chunks(aoi_geometry, chunk_size_km))
```

#### 1.2 Chunk State Management

**File:** `/opt/agrs/gui-v2/backend/utils/chunk_state.py`

```python
"""
Chunk processing state management with checkpointing.
"""
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Dict, Optional, List
from datetime import datetime
from enum import Enum

class ChunkStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class ChunkState:
    row: int
    col: int
    status: ChunkStatus
    dataset_type: str
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    retry_count: int = 0

class ChunkStateManager:
    """Manages chunk processing state with file-based persistence."""

    def __init__(self, project_dir: Path, dataset_type: str):
        self.state_file = project_dir / f".chunk_state_{dataset_type}.json"
        self.states: Dict[str, ChunkState] = {}
        self._load_state()

    def _chunk_key(self, row: int, col: int) -> str:
        return f"{row}_{col}"

    def _load_state(self):
        if self.state_file.exists():
            with open(self.state_file) as f:
                data = json.load(f)
                for key, state_dict in data.items():
                    state_dict['status'] = ChunkStatus(state_dict['status'])
                    self.states[key] = ChunkState(**state_dict)

    def _save_state(self):
        data = {}
        for key, state in self.states.items():
            state_dict = asdict(state)
            state_dict['status'] = state.status.value
            data[key] = state_dict

        with open(self.state_file, 'w') as f:
            json.dump(data, f, indent=2)

    def initialize_chunks(self, chunks: List[tuple], dataset_type: str):
        """Initialize state for all chunks."""
        for row, col, _ in chunks:
            key = self._chunk_key(row, col)
            if key not in self.states:
                self.states[key] = ChunkState(
                    row=row, col=col,
                    status=ChunkStatus.PENDING,
                    dataset_type=dataset_type
                )
        self._save_state()

    def mark_in_progress(self, row: int, col: int):
        key = self._chunk_key(row, col)
        self.states[key].status = ChunkStatus.IN_PROGRESS
        self.states[key].started_at = datetime.now().isoformat()
        self._save_state()

    def mark_completed(self, row: int, col: int, output_path: str):
        key = self._chunk_key(row, col)
        self.states[key].status = ChunkStatus.COMPLETED
        self.states[key].output_path = output_path
        self.states[key].completed_at = datetime.now().isoformat()
        self._save_state()

    def mark_failed(self, row: int, col: int, error: str):
        key = self._chunk_key(row, col)
        self.states[key].status = ChunkStatus.FAILED
        self.states[key].error_message = error
        self.states[key].retry_count += 1
        self._save_state()

    def get_pending_chunks(self) -> List[ChunkState]:
        """Get chunks that need processing (pending or failed with retries left)."""
        MAX_RETRIES = 3
        return [
            s for s in self.states.values()
            if s.status == ChunkStatus.PENDING or
               (s.status == ChunkStatus.FAILED and s.retry_count < MAX_RETRIES)
        ]

    def get_progress(self) -> dict:
        """Get processing progress summary."""
        total = len(self.states)
        completed = sum(1 for s in self.states.values() if s.status == ChunkStatus.COMPLETED)
        failed = sum(1 for s in self.states.values() if s.status == ChunkStatus.FAILED)
        in_progress = sum(1 for s in self.states.values() if s.status == ChunkStatus.IN_PROGRESS)

        return {
            "total": total,
            "completed": completed,
            "failed": failed,
            "in_progress": in_progress,
            "pending": total - completed - failed - in_progress,
            "percent_complete": (completed / total * 100) if total > 0 else 0
        }
```

---

### Phase 2: Parallel Tile Downloads

**Priority:** High
**Estimated Complexity:** Medium

#### 2.1 Async Download Manager

**File:** `/opt/agrs/gui-v2/backend/utils/parallel_downloader.py`

```python
"""
Parallel download manager for tile-based datasets.
"""
import asyncio
import aiohttp
from pathlib import Path
from typing import List, Callable, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

@dataclass
class DownloadTask:
    url: str
    output_path: Path
    chunk_id: str
    headers: Optional[dict] = None

class ParallelDownloader:
    """
    Manages parallel downloads with connection pooling and rate limiting.
    """

    def __init__(
        self,
        max_concurrent: int = 8,
        max_retries: int = 3,
        timeout_seconds: int = 300,
        rate_limit_per_second: float = 10.0
    ):
        self.max_concurrent = max_concurrent
        self.max_retries = max_retries
        self.timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        self.rate_limit = rate_limit_per_second
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self._last_request_time = 0

    async def _rate_limit(self):
        """Enforce rate limiting between requests."""
        now = asyncio.get_event_loop().time()
        min_interval = 1.0 / self.rate_limit
        elapsed = now - self._last_request_time
        if elapsed < min_interval:
            await asyncio.sleep(min_interval - elapsed)
        self._last_request_time = asyncio.get_event_loop().time()

    async def _download_one(
        self,
        session: aiohttp.ClientSession,
        task: DownloadTask,
        progress_callback: Optional[Callable] = None
    ) -> bool:
        """Download a single file with retries."""
        async with self.semaphore:
            for attempt in range(self.max_retries):
                try:
                    await self._rate_limit()

                    async with session.get(
                        task.url,
                        headers=task.headers,
                        timeout=self.timeout
                    ) as response:
                        if response.status == 200:
                            task.output_path.parent.mkdir(parents=True, exist_ok=True)

                            with open(task.output_path, 'wb') as f:
                                async for chunk in response.content.iter_chunked(8192):
                                    f.write(chunk)

                            if progress_callback:
                                progress_callback(task.chunk_id, "completed")
                            return True
                        else:
                            logger.warning(
                                f"Download failed for {task.chunk_id}: "
                                f"HTTP {response.status}"
                            )

                except asyncio.TimeoutError:
                    logger.warning(f"Timeout downloading {task.chunk_id}, attempt {attempt + 1}")
                except Exception as e:
                    logger.error(f"Error downloading {task.chunk_id}: {e}")

                # Exponential backoff
                await asyncio.sleep(2 ** attempt)

            if progress_callback:
                progress_callback(task.chunk_id, "failed")
            return False

    async def download_all(
        self,
        tasks: List[DownloadTask],
        progress_callback: Optional[Callable] = None
    ) -> dict:
        """
        Download all tasks in parallel.

        Returns: {"succeeded": [...], "failed": [...]}
        """
        connector = aiohttp.TCPConnector(limit=self.max_concurrent)
        async with aiohttp.ClientSession(connector=connector) as session:
            results = await asyncio.gather(*[
                self._download_one(session, task, progress_callback)
                for task in tasks
            ])

        succeeded = [t for t, r in zip(tasks, results) if r]
        failed = [t for t, r in zip(tasks, results) if not r]

        return {"succeeded": succeeded, "failed": failed}
```

---

### Phase 3: Streaming Mosaic Processing

**Priority:** High
**Estimated Complexity:** High

#### 3.1 Incremental Mosaic Builder

Instead of loading all tiles into memory, process tiles incrementally using GDAL VRT (Virtual Raster).

**File:** `/opt/agrs/gui-v2/backend/utils/streaming_mosaic.py`

```python
"""
Streaming mosaic processor for large tile collections.
"""
from pathlib import Path
from typing import List, Optional
import subprocess
import tempfile
from osgeo import gdal

gdal.UseExceptions()

class StreamingMosaicBuilder:
    """
    Build mosaics incrementally without loading all data into memory.
    Uses GDAL VRT for memory-efficient processing.
    """

    def __init__(self, output_path: Path, target_crs: str = "EPSG:4326"):
        self.output_path = output_path
        self.target_crs = target_crs
        self.tile_paths: List[Path] = []

    def add_tile(self, tile_path: Path):
        """Add a tile to the mosaic."""
        if tile_path.exists():
            self.tile_paths.append(tile_path)

    def build_vrt(self, vrt_path: Optional[Path] = None) -> Path:
        """
        Build a VRT (Virtual Raster) from all tiles.
        VRT is a lightweight XML file that references tiles without copying data.
        """
        if vrt_path is None:
            vrt_path = self.output_path.with_suffix('.vrt')

        # Create VRT using gdalbuildvrt
        vrt_options = gdal.BuildVRTOptions(
            resampleAlg='bilinear',
            addAlpha=False,
            srcNodata=None,
            VRTNodata=None
        )

        gdal.BuildVRT(
            str(vrt_path),
            [str(p) for p in self.tile_paths],
            options=vrt_options
        )

        return vrt_path

    def build_cog(
        self,
        vrt_path: Path,
        compress: str = "LZW",
        block_size: int = 512
    ) -> Path:
        """
        Convert VRT to Cloud-Optimized GeoTIFF (COG).
        Uses streaming translation to minimize memory usage.
        """
        cog_path = self.output_path.with_suffix('.tif')

        translate_options = gdal.TranslateOptions(
            format='COG',
            creationOptions=[
                f'COMPRESS={compress}',
                f'BLOCKSIZE={block_size}',
                'BIGTIFF=YES',
                'NUM_THREADS=ALL_CPUS'
            ],
            callback=gdal.TermProgress_nocb
        )

        gdal.Translate(
            str(cog_path),
            str(vrt_path),
            options=translate_options
        )

        return cog_path

    def build(self, keep_vrt: bool = False) -> Path:
        """
        Build the final mosaic.

        1. Create VRT from tiles (lightweight, no data copying)
        2. Convert VRT to COG (streaming, memory-efficient)
        """
        if not self.tile_paths:
            raise ValueError("No tiles added to mosaic")

        # Build VRT
        vrt_path = self.build_vrt()

        # Convert to COG
        output = self.build_cog(vrt_path)

        # Cleanup
        if not keep_vrt:
            vrt_path.unlink()

        return output
```

---

### Phase 4: Overpass API Chunking

**Priority:** Critical
**Estimated Complexity:** Medium

#### 4.1 Recursive OSM Query Chunking

**File:** `/opt/agrs/gui-v2/backend/utils/overpass_chunked.py`

```python
"""
Chunked Overpass API queries for large AOIs.
"""
import requests
import time
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import json
from typing import List, Generator, Optional
import logging

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
MAX_BBOX_AREA_DEG2 = 4.0  # Maximum bounding box area in square degrees
RATE_LIMIT_SECONDS = 2.0  # Minimum time between requests

class ChunkedOverpassQuery:
    """
    Execute Overpass queries on large AOIs by splitting into chunks.
    """

    def __init__(self, timeout: int = 300):
        self.timeout = timeout
        self._last_request_time = 0

    def _rate_limit(self):
        """Enforce rate limiting to avoid API blocks."""
        elapsed = time.time() - self._last_request_time
        if elapsed < RATE_LIMIT_SECONDS:
            time.sleep(RATE_LIMIT_SECONDS - elapsed)
        self._last_request_time = time.time()

    def _split_bbox(self, bbox: tuple) -> List[tuple]:
        """
        Recursively split bounding box if too large.
        bbox: (south, west, north, east)
        """
        south, west, north, east = bbox
        width = east - west
        height = north - south
        area = width * height

        if area <= MAX_BBOX_AREA_DEG2:
            return [bbox]

        # Split along longer axis
        if width > height:
            mid = (west + east) / 2
            return (
                self._split_bbox((south, west, north, mid)) +
                self._split_bbox((south, mid, north, east))
            )
        else:
            mid = (south + north) / 2
            return (
                self._split_bbox((south, west, mid, east)) +
                self._split_bbox((mid, west, north, east))
            )

    def _build_query(self, bbox: tuple, tags: List[str]) -> str:
        """Build Overpass QL query for a bbox."""
        south, west, north, east = bbox
        bbox_str = f"{south},{west},{north},{east}"

        tag_queries = []
        for tag in tags:
            tag_queries.append(f'  way["{tag}"]({bbox_str});')
            tag_queries.append(f'  relation["{tag}"]({bbox_str});')

        return f"""
[out:json][timeout:{self.timeout}];
(
{chr(10).join(tag_queries)}
);
out body;
>;
out skel qt;
"""

    def _execute_query(self, query: str) -> Optional[dict]:
        """Execute a single Overpass query."""
        self._rate_limit()

        try:
            response = requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=self.timeout + 30
            )

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                logger.warning("Rate limited by Overpass, waiting 60s...")
                time.sleep(60)
                return self._execute_query(query)  # Retry
            else:
                logger.error(f"Overpass error: {response.status_code}")
                return None

        except requests.Timeout:
            logger.error("Overpass query timed out")
            return None
        except Exception as e:
            logger.error(f"Overpass query failed: {e}")
            return None

    def query_chunked(
        self,
        aoi_geometry: Polygon,
        tags: List[str],
        progress_callback: Optional[callable] = None
    ) -> dict:
        """
        Execute chunked query over large AOI.

        Args:
            aoi_geometry: Shapely Polygon defining the AOI
            tags: List of OSM tags to query (e.g., ["pipeline", "man_made=pipeline"])
            progress_callback: Optional callback(current, total)

        Returns:
            Combined GeoJSON FeatureCollection
        """
        bounds = aoi_geometry.bounds  # (minx, miny, maxx, maxy)
        bbox = (bounds[1], bounds[0], bounds[3], bounds[2])  # Convert to (s,w,n,e)

        chunks = self._split_bbox(bbox)
        total_chunks = len(chunks)

        logger.info(f"Querying {total_chunks} chunks for AOI")

        all_elements = []
        node_ids = set()
        way_ids = set()

        for i, chunk_bbox in enumerate(chunks):
            if progress_callback:
                progress_callback(i + 1, total_chunks)

            query = self._build_query(chunk_bbox, tags)
            result = self._execute_query(query)

            if result and "elements" in result:
                for element in result["elements"]:
                    # Deduplicate elements by ID
                    if element["type"] == "node":
                        if element["id"] not in node_ids:
                            node_ids.add(element["id"])
                            all_elements.append(element)
                    elif element["type"] == "way":
                        if element["id"] not in way_ids:
                            way_ids.add(element["id"])
                            all_elements.append(element)
                    else:
                        all_elements.append(element)

        return {
            "version": 0.6,
            "elements": all_elements,
            "chunk_count": total_chunks
        }
```

---

### Phase 5: Progress Checkpointing & Resume

**Priority:** High
**Estimated Complexity:** Medium

#### 5.1 Dataset Fetch Job Manager

**File:** `/opt/agrs/gui-v2/backend/utils/fetch_job_manager.py`

```python
"""
Job manager for resumable dataset fetching.
"""
import json
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum
import hashlib

class JobStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"

@dataclass
class DatasetJob:
    dataset_type: str
    status: JobStatus
    total_chunks: int
    completed_chunks: int
    failed_chunks: int
    output_files: List[str]
    error_messages: List[str]
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    paused_at: Optional[str] = None

class FetchJobManager:
    """
    Manages dataset fetching jobs with persistence for resume capability.
    """

    def __init__(self, project_dir: Path):
        self.project_dir = project_dir
        self.state_file = project_dir / ".fetch_job_state.json"
        self.jobs: Dict[str, DatasetJob] = {}
        self._load_state()

    def _generate_job_id(self, dataset_type: str, aoi_hash: str) -> str:
        """Generate unique job ID."""
        return f"{dataset_type}_{aoi_hash[:8]}"

    def _load_state(self):
        if self.state_file.exists():
            with open(self.state_file) as f:
                data = json.load(f)
                for job_id, job_dict in data.get("jobs", {}).items():
                    job_dict['status'] = JobStatus(job_dict['status'])
                    self.jobs[job_id] = DatasetJob(**job_dict)

    def _save_state(self):
        data = {"jobs": {}}
        for job_id, job in self.jobs.items():
            job_dict = asdict(job)
            job_dict['status'] = job.status.value
            data["jobs"][job_id] = job_dict

        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.state_file, 'w') as f:
            json.dump(data, f, indent=2)

    def create_job(
        self,
        dataset_type: str,
        aoi_geojson: dict,
        total_chunks: int
    ) -> str:
        """Create a new fetch job."""
        aoi_hash = hashlib.md5(
            json.dumps(aoi_geojson, sort_keys=True).encode()
        ).hexdigest()

        job_id = self._generate_job_id(dataset_type, aoi_hash)

        # Check for existing job
        if job_id in self.jobs:
            existing = self.jobs[job_id]
            if existing.status in [JobStatus.COMPLETED]:
                # Job already done
                return job_id
            elif existing.status in [JobStatus.IN_PROGRESS, JobStatus.PAUSED]:
                # Resume existing job
                return job_id

        # Create new job
        self.jobs[job_id] = DatasetJob(
            dataset_type=dataset_type,
            status=JobStatus.PENDING,
            total_chunks=total_chunks,
            completed_chunks=0,
            failed_chunks=0,
            output_files=[],
            error_messages=[],
            started_at=datetime.now().isoformat()
        )
        self._save_state()
        return job_id

    def update_progress(
        self,
        job_id: str,
        completed: int,
        failed: int,
        output_file: Optional[str] = None,
        error: Optional[str] = None
    ):
        """Update job progress."""
        if job_id not in self.jobs:
            return

        job = self.jobs[job_id]
        job.status = JobStatus.IN_PROGRESS
        job.completed_chunks = completed
        job.failed_chunks = failed

        if output_file:
            job.output_files.append(output_file)
        if error:
            job.error_messages.append(error)

        self._save_state()

    def complete_job(self, job_id: str, success: bool = True):
        """Mark job as completed."""
        if job_id not in self.jobs:
            return

        job = self.jobs[job_id]
        job.status = JobStatus.COMPLETED if success else JobStatus.FAILED
        job.completed_at = datetime.now().isoformat()
        self._save_state()

    def pause_job(self, job_id: str):
        """Pause a running job."""
        if job_id not in self.jobs:
            return

        job = self.jobs[job_id]
        job.status = JobStatus.PAUSED
        job.paused_at = datetime.now().isoformat()
        self._save_state()

    def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get current job status."""
        if job_id not in self.jobs:
            return None

        job = self.jobs[job_id]
        return {
            "job_id": job_id,
            "dataset_type": job.dataset_type,
            "status": job.status.value,
            "progress": {
                "total": job.total_chunks,
                "completed": job.completed_chunks,
                "failed": job.failed_chunks,
                "percent": (job.completed_chunks / job.total_chunks * 100)
                          if job.total_chunks > 0 else 0
            },
            "output_files": job.output_files,
            "errors": job.error_messages[-5:] if job.error_messages else [],
            "started_at": job.started_at,
            "completed_at": job.completed_at
        }

    def can_resume(self, job_id: str) -> bool:
        """Check if a job can be resumed."""
        if job_id not in self.jobs:
            return False

        job = self.jobs[job_id]
        return job.status in [JobStatus.PAUSED, JobStatus.IN_PROGRESS, JobStatus.FAILED]
```

---

### Phase 6: API Integration

**Priority:** Medium
**Estimated Complexity:** Medium

#### 6.1 Updated Dataset Fetch Endpoint

Update `/opt/agrs/gui-v2/backend/api/datasets.py` to use the new chunking infrastructure:

```python
@router.post("/projects/{project_id}/datasets/fetch")
async def fetch_datasets_chunked(
    project_id: str,
    request: DatasetFetchRequest,
    background_tasks: BackgroundTasks
):
    """
    Fetch datasets with automatic chunking for large AOIs.
    """
    project = get_project(project_id)
    aoi_geometry = shape(project.aoi_geojson)
    aoi_area_km2 = calculate_geodesic_area(aoi_geometry)

    # Determine if chunking is needed
    chunk_size = calculate_optimal_chunk_size(aoi_area_km2)

    if chunk_size is None:
        # Small AOI - use existing single-request method
        return await fetch_datasets_simple(project_id, request)

    # Large AOI - use chunked processing
    job_manager = FetchJobManager(project.directory)
    chunks = list(create_grid_chunks(aoi_geometry, chunk_size))

    job_id = job_manager.create_job(
        dataset_type=request.dataset_type,
        aoi_geojson=project.aoi_geojson,
        total_chunks=len(chunks)
    )

    # Check if resuming existing job
    if job_manager.can_resume(job_id):
        # Get already completed chunks and skip them
        pass

    # Start background processing
    background_tasks.add_task(
        process_chunks_background,
        job_id=job_id,
        project=project,
        chunks=chunks,
        dataset_type=request.dataset_type,
        job_manager=job_manager
    )

    return {
        "job_id": job_id,
        "status": "started",
        "total_chunks": len(chunks),
        "message": f"Processing {len(chunks)} chunks for {aoi_area_km2:.0f} km² AOI"
    }


@router.get("/projects/{project_id}/datasets/jobs/{job_id}")
async def get_fetch_job_status(project_id: str, job_id: str):
    """Get status of a dataset fetch job."""
    project = get_project(project_id)
    job_manager = FetchJobManager(project.directory)

    status = job_manager.get_job_status(job_id)
    if not status:
        raise HTTPException(404, "Job not found")

    return status


@router.post("/projects/{project_id}/datasets/jobs/{job_id}/pause")
async def pause_fetch_job(project_id: str, job_id: str):
    """Pause a running fetch job."""
    project = get_project(project_id)
    job_manager = FetchJobManager(project.directory)
    job_manager.pause_job(job_id)
    return {"status": "paused"}


@router.post("/projects/{project_id}/datasets/jobs/{job_id}/resume")
async def resume_fetch_job(
    project_id: str,
    job_id: str,
    background_tasks: BackgroundTasks
):
    """Resume a paused or failed fetch job."""
    project = get_project(project_id)
    job_manager = FetchJobManager(project.directory)

    if not job_manager.can_resume(job_id):
        raise HTTPException(400, "Job cannot be resumed")

    # Resume processing
    background_tasks.add_task(
        resume_job_background,
        job_id=job_id,
        project=project,
        job_manager=job_manager
    )

    return {"status": "resumed"}
```

---

## Frontend Integration

### WebSocket Progress Updates

Add real-time progress updates via WebSocket:

**File:** `/opt/agrs/gui-v2/frontend/src/hooks/useFetchProgress.ts`

```typescript
import { useState, useEffect } from 'react';

interface FetchProgress {
  jobId: string;
  datasetType: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  progress: {
    total: number;
    completed: number;
    failed: number;
    percent: number;
  };
  currentChunk?: string;
}

export function useFetchProgress(projectId: string, jobId: string) {
  const [progress, setProgress] = useState<FetchProgress | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `ws://${window.location.host}/api/ws/fetch-progress/${projectId}/${jobId}`
    );

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
    };

    return () => ws.close();
  }, [projectId, jobId]);

  return progress;
}
```

### Progress UI Component

```typescript
// FetchProgressCard.tsx
export function FetchProgressCard({ progress }: { progress: FetchProgress }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fetching {progress.datasetType}</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress.progress.percent} />
        <div className="text-sm text-muted-foreground mt-2">
          {progress.progress.completed} / {progress.progress.total} chunks completed
          {progress.progress.failed > 0 && (
            <span className="text-red-500">
              ({progress.progress.failed} failed)
            </span>
          )}
        </div>
        {progress.status === 'paused' && (
          <Button onClick={handleResume}>Resume</Button>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Testing Strategy

### Unit Tests

```python
# tests/test_spatial_chunking.py
def test_grid_chunking_coverage():
    """Ensure chunks fully cover the AOI."""
    aoi = create_test_aoi(area_km2=10000)
    chunks = list(create_grid_chunks(aoi, chunk_size_km=50))

    combined = unary_union([c[2] for c in chunks])
    assert aoi.difference(combined).area < 0.0001  # Fully covered

def test_chunk_count_estimation():
    """Verify chunk count calculation is accurate."""
    aoi = create_test_aoi(area_km2=10000)
    expected_chunks = get_chunk_count(aoi, 50)
    actual_chunks = len(list(create_grid_chunks(aoi, 50)))
    assert expected_chunks == actual_chunks
```

### Integration Tests

```python
# tests/test_large_aoi_fetch.py
@pytest.mark.integration
async def test_chunked_dem_fetch():
    """Test DEM fetching with chunking."""
    # Create 5000 km² test AOI
    aoi = create_corridor_aoi(length_km=500, width_km=10)

    result = await fetch_dem_chunked(aoi)

    assert result["status"] == "completed"
    assert Path(result["output_file"]).exists()
```

---

## Deployment Checklist

- [ ] Create new utility modules in `/opt/agrs/gui-v2/backend/utils/`
- [ ] Add asyncio and aiohttp dependencies to requirements.txt
- [ ] Update dataset fetch endpoints in API
- [ ] Add WebSocket endpoint for progress updates
- [ ] Create frontend progress components
- [ ] Write unit tests for chunking logic
- [ ] Write integration tests for full pipeline
- [ ] Test with Keystone XL AOI as benchmark
- [ ] Document API changes in OpenAPI spec
- [ ] Update user documentation

---

## Performance Targets

| Metric | Current | Target |
|--------|---------|--------|
| Max AOI Size | ~500 km² | 500,000+ km² |
| DEM Fetch Time (100K km²) | Fails | < 4 hours |
| OSM Fetch Time (100K km²) | Fails | < 2 hours |
| Memory Usage (100K km²) | OOM | < 4 GB |
| Resume Capability | None | Full checkpoint |

---

## References

- [GDAL VRT Documentation](https://gdal.org/drivers/raster/vrt.html)
- [Cloud-Optimized GeoTIFF Spec](https://www.cogeo.org/)
- [Overpass API Rate Limits](https://wiki.openstreetmap.org/wiki/Overpass_API#Rate_limiting)
- [Copernicus DEM Access](https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model)
