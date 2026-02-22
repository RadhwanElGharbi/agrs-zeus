"""Dataset Fetch Orchestration – execution pipeline & API endpoints.

Contains the 8-stage per-dataset pipeline, job lifecycle helpers, and all
FastAPI route handlers that were previously in the monolithic dataset_fetch.py.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import json
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..audit import write_audit_event
from ..auth import require_auth
from ..db import get_db
from ..project_utils import resolve_project_path

from .constants import AGENT_ENABLED, ZEUS_BIN, DATASET_FETCH_PROTOCOL
from .models import (
    DatasetDefinition,
    FetchContext,
    DATASET_DEFINITIONS,
    DatasetCategoryStatus,
    DatasetStatusResponse,
    DatasetFetchRequest,
    DatasetFetchJobResponse,
    ActiveDatasetJobInfo,
    ActiveDatasetJobsResponse,
    _is_3dep_override,
    _is_copernicus_override,
    _override_requests_osm,
    _build_metadata_context,
    _landcover_fallback_command,
)
from .job_state import (
    DatasetJobState,
    JOB_REGISTRY,
    PROJECT_ACTIVE_JOBS,
    JOB_LOCK,
    JOB_LOCK_TIMEOUT_S,
    STAGE_NAMES,
    _init_category_state,
    _update_stage,
    _log_to_job,
    _cancel_if_requested,
    _run_command,
    _dataset_ready,
    _job_to_response,
    _get_job_snapshot_sync,
    _persist_job,
    recover_orphaned_jobs,
)
from .utils import _utc_now, _utc_iso, _load_project_context, _ensure_command_available, _write_json
from .agent import _run_agent_for_dataset, _cleanup_conversation
from .processing import _process_raster, _process_vector
from .validation import _validate_raster_file, _validate_vector_file
from .metadata import _generate_raw_metadata, _generate_processed_metadata
from .fetchers import (
    _copernicus_fetch,
    _opentopo_3dep_fetch,
    _zeus_osm_fetch,
    _osm_overpass_fetch,
    _cer_pipelines_fetch,
    _nhn_waterways_fetch,
    _can_indigenous_lands_fetch,
    _cpcad_protected_areas_fetch,
)

# ---------------------------------------------------------------------------
# Project-level pub/sub for multi-user SSE broadcasting
# ---------------------------------------------------------------------------

PROJECT_SUBSCRIBERS: Dict[str, List[asyncio.Queue]] = {}
_SUBSCRIBERS_LOCK = threading.Lock()


def broadcast_project_event(project: str, event: Dict[str, Any]) -> None:
    """Push an event to all SSE subscribers for a project."""
    with _SUBSCRIBERS_LOCK:
        queues = PROJECT_SUBSCRIBERS.get(project, [])
        dead: List[asyncio.Queue] = []
        for q in queues:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            queues.remove(q)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(tags=["dataset_fetch"])

MAX_PARALLEL_CATEGORIES = int(os.getenv("DATASET_FETCH_PARALLEL", "3"))

_CATEGORY_SIZE_ESTIMATES_MB = {
    "dem": 1500,
    "landcover": 500,
    "soil": 200,
    "geohazard": 100,
    "roads": 100,
    "railways": 50,
    "powerlines": 50,
    "waterways": 100,
    "pipelines": 50,
    "protected_areas": 50,
    "indigenous_lands": 30,
}


def _check_disk_space(project_path: Path, categories: List[str]) -> None:
    """Raise HTTPException if insufficient disk space for the requested categories."""
    estimated_mb = sum(_CATEGORY_SIZE_ESTIMATES_MB.get(c, 100) for c in categories)
    estimated_bytes = estimated_mb * 1024 * 1024
    try:
        usage = shutil.disk_usage(str(project_path))
        if usage.free < estimated_bytes * 1.5:
            free_gb = usage.free / (1024 ** 3)
            needed_gb = (estimated_bytes * 1.5) / (1024 ** 3)
            raise HTTPException(
                status_code=413,
                detail=f"Insufficient disk space: {free_gb:.1f}GB free, ~{needed_gb:.1f}GB needed for {len(categories)} dataset(s).",
            )
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Execution helpers
# ---------------------------------------------------------------------------


def _execute_dataset(defn: DatasetDefinition, ctx: FetchContext, job: DatasetJobState) -> None:
    category = defn.key

    # ========== STAGE: prefetch_scan ==========
    _update_stage(job, category, "prefetch_scan", "running", "Initializing dataset fetch")

    # Get override first so we can determine correct raw filename
    override = getattr(job, "overrides", {}).get(defn.key) if hasattr(job, "overrides") else None
    override_text = (override or "").lower()
    if override:
        _log_to_job(job, ctx, f"Applying override '{override}' for {defn.label}")

    # Compute FINAL paths (canonical locations in the project tree)
    final_raw_path = defn.raw_path(ctx, override)
    final_raw_meta = defn.raw_metadata_path(ctx, override)
    final_processed_path = defn.processed_path(ctx, override)
    final_processed_meta = defn.processed_metadata_path(ctx, override)
    # Track when this category started so we can tell whether canonical artifacts
    # were produced by the current run.
    dataset_started_at = _utc_now()

    final_raw_path.parent.mkdir(parents=True, exist_ok=True)
    final_processed_path.parent.mkdir(parents=True, exist_ok=True)

    # Non-destructive staging:
    # Write new artifacts into a staging directory first, then atomically swap into place
    # after successful fetch+process+validation+metadata generation.
    staging_dir = ctx.project_path / "data" / ".staging" / job.id / defn.key
    staging_dir.mkdir(parents=True, exist_ok=True)

    raw_path = staging_dir / final_raw_path.name
    raw_meta = staging_dir / final_raw_meta.name
    processed_path = staging_dir / final_processed_path.name
    processed_meta = staging_dir / final_processed_meta.name

    def _fresh_artifact(path: Path) -> bool:
        try:
            if not path.exists() or path.stat().st_size <= 0:
                return False
            # Filesystems may round mtimes (e.g., 1-second granularity), so allow
            # a tiny tolerance to avoid false negatives when AI writes quickly.
            return path.stat().st_mtime >= (dataset_started_at.timestamp() - 2.0)
        except OSError:
            return False

    # Clean any stale staging artifacts for this dataset.
    #
    # NOTE: For DEM we allow resuming from an existing raw mosaic / processed output in the
    # same staging dir (e.g., if a previous run failed during validation/metadata/publish).
    if defn.key == "dem":
        stale_paths: List[Path] = [raw_meta, processed_meta]
        # Delete empty artifacts only (safe resume)
        for p in (raw_path, processed_path):
            try:
                if p.exists() and p.stat().st_size == 0:
                    stale_paths.insert(0, p)
            except OSError:
                stale_paths.insert(0, p)
    else:
        stale_paths = [raw_path, raw_meta, processed_path, processed_meta]

    for path in stale_paths:
        if path.exists():
            try:
                path.unlink()
            except OSError:
                pass

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
            # Canada-first authoritative sources (open/free)
            if defn.key == "pipelines" and ctx.covers_country("CAN") and not _override_requests_osm(override_text):
                fetch_cmd, fetch_info = _cer_pipelines_fetch(ctx, raw_path, job)
            elif defn.key == "waterways" and ctx.covers_country("CAN") and not _override_requests_osm(override_text):
                fetch_cmd, fetch_info = _nhn_waterways_fetch(ctx, raw_path, job)
            elif defn.key == "protected_areas":
                if not ctx.covers_country("CAN"):
                    raise RuntimeError("protected_areas fetch is currently implemented for Canada (CPCAD) only.")
                fetch_cmd, fetch_info = _cpcad_protected_areas_fetch(ctx, raw_path, job)
            elif defn.key == "indigenous_lands":
                if not ctx.covers_country("CAN"):
                    raise RuntimeError("indigenous_lands fetch is currently implemented for Canada (CLSS) only.")
                fetch_cmd, fetch_info = _can_indigenous_lands_fetch(ctx, raw_path, job)
            # OSM (global) — prefer compiled ZEUS tools; fall back to Overpass API
            elif defn.key in ("roads", "railways", "powerlines", "waterways"):
                try:
                    fetch_cmd, fetch_info = _zeus_osm_fetch(defn.key, ctx, raw_path, job)
                except RuntimeError as zeus_exc:
                    _log_to_job(job, ctx, f"ZEUS CLI {defn.key} fetch failed: {zeus_exc}")
                    _log_to_job(job, ctx, f"Falling back to Overpass API for {defn.label}")
                    fetch_cmd, fetch_info = _osm_overpass_fetch(defn.key, ctx, raw_path, job)
            elif defn.key == "pipelines":
                # No ZEUS osm_pipelines_fetch tool exists today; keep Overpass fallback (explicitly lower confidence).
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
                            if _is_3dep_override(override_text) or ctx.covers_country("USA"):
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
                # DEM can be huge; support resuming if a valid processed raster is already present.
                if defn.key == "dem" and processed_path.exists() and processed_path.stat().st_size > 1024:
                    _log_to_job(job, ctx, f"Processed DEM already present; skipping reprojection: {processed_path}")
                else:
                    _process_raster(defn, ctx, raw_path, job, output_path=processed_path)
            else:
                _process_vector(defn, ctx, raw_path, job, output_path=processed_path)
            _update_stage(job, category, "process", "succeeded", "Geoprocessing complete")

        except RuntimeError:
            raise
        except Exception as e:
            _update_stage(job, category, "fetch", "failed", str(e))
            raise

    # ZEUS AI commands run from project root and are prompted to write canonical paths.
    # If the agent produced fresh canonical artifacts, validate/publish those instead
    # of expecting staging files.
    if agent_completed_successfully:
        if _fresh_artifact(final_raw_path):
            raw_path = final_raw_path
            raw_meta = final_raw_meta
            _log_to_job(job, ctx, f"Using ZEUS AI canonical raw output: {raw_path}")
        if _fresh_artifact(final_processed_path):
            processed_path = final_processed_path
            processed_meta = final_processed_meta
            _log_to_job(job, ctx, f"Using ZEUS AI canonical processed output: {processed_path}")

    # ========== STAGE: validation ==========
    _update_stage(job, category, "validation", "running", "Validating raw + processed data (protocol checks)")

    validation_errors: List[str] = []
    validation_warnings: List[str] = []

    # ---- Raw validation (integrity + coverage sanity) ----
    if defn.dataset_type == "raster":
        status, errors, warnings = _validate_raster_file(raw_path, ctx, require_covers_aoi_bbox=True)
    else:
        require_nonempty = defn.key in ("roads", "railways", "powerlines", "waterways")
        status, errors, warnings = _validate_vector_file(raw_path, ctx, require_nonempty=require_nonempty)
    validation_errors.extend(errors)
    validation_warnings.extend(warnings)

    if errors:
        _update_stage(job, category, "validation", "failed", "; ".join(errors[:2]))
        raise RuntimeError(f"Raw validation failed: {'; '.join(errors)}")

    # If agent completed but processed file is missing/empty, run processing as fallback
    if not processed_path.exists() or processed_path.stat().st_size == 0:
        _log_to_job(job, ctx, f"Processed file missing after agent completion, running native processing for {defn.label}")
        _update_stage(job, category, "process", "running", "Running native geoprocessing as fallback")
        if defn.dataset_type == "raster":
            _process_raster(defn, ctx, raw_path, job, output_path=processed_path)
        else:
            _process_vector(defn, ctx, raw_path, job, output_path=processed_path)
        _update_stage(job, category, "process", "succeeded", "Native geoprocessing complete")

    # ---- Processed validation (target CRS + integrity + AOI clip sanity) ----
    if defn.dataset_type == "raster":
        p_status, p_errors, p_warnings = _validate_raster_file(
            processed_path,
            ctx,
            expect_epsg=f"EPSG:{ctx.target_epsg}",
            require_within_aoi_bbox=True,
        )
    else:
        require_nonempty = defn.key in ("roads", "railways", "powerlines", "waterways")
        p_status, p_errors, p_warnings = _validate_vector_file(
            processed_path,
            ctx,
            expect_epsg=f"EPSG:{ctx.target_epsg}",
            require_nonempty=require_nonempty,
        )
    validation_errors.extend(p_errors)
    validation_warnings.extend(p_warnings)

    if p_errors:
        _update_stage(job, category, "validation", "failed", "; ".join(p_errors[:2]))
        raise RuntimeError(f"Processed validation failed: {'; '.join(p_errors)}")

    # Record warnings in logs but do not fail the job
    for warning in validation_warnings:
        _log_to_job(job, ctx, f"Validation warning: {warning}")

    validation_status = "passed_with_warnings" if validation_warnings else "passed"
    if validation_status == "passed_with_warnings":
        _update_stage(job, category, "validation", "succeeded", f"Passed with {len(validation_warnings)} warning(s)")
    else:
        _update_stage(job, category, "validation", "succeeded", "Passed")

    # ========== STAGE: raw_metadata ==========
    _update_stage(job, category, "raw_metadata", "running", "Extracting raw metadata")
    metadata_context = _build_metadata_context(defn, ctx, override, fetch_info)
    # Protocol-required validation fields in metadata
    metadata_context["validation_status"] = validation_status
    metadata_context["validation_errors"] = validation_errors
    if validation_warnings:
        metadata_context["validation_warnings"] = validation_warnings
    _generate_raw_metadata(defn, ctx, raw_path, raw_meta, fetch_cmd, metadata_context)
    _update_stage(job, category, "raw_metadata", "succeeded", "Raw metadata generated")

    # ========== STAGE: processed_metadata ==========
    _update_stage(job, category, "processed_metadata", "running", "Indexing processed data")
    _generate_processed_metadata(defn, ctx, raw_path, raw_meta, processed_path, metadata_context, processed_meta_path=processed_meta)
    _update_stage(job, category, "processed_metadata", "succeeded", "Metadata indexed")

    # ========== STAGE: layer_publish ==========
    _update_stage(job, category, "layer_publish", "running", "Publishing to map layer")

    # Commit staged artifacts to canonical locations (atomic replace)
    def _safe_replace(src: Path, dst: Path) -> None:
        if src == dst:
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        src.replace(dst)

    _safe_replace(raw_path, final_raw_path)
    _safe_replace(raw_meta, final_raw_meta)
    _safe_replace(processed_path, final_processed_path)
    _safe_replace(processed_meta, final_processed_meta)

    # Best-effort: rewrite embedded path fields in metadata to reference canonical paths.
    try:
        raw_payload = json.loads(final_raw_meta.read_text(encoding="utf-8"))
        if isinstance(raw_payload, dict):
            raw_payload["raw_path"] = str(final_raw_path)
            _write_json(final_raw_meta, raw_payload)
    except Exception:  # noqa: BLE001
        pass

    try:
        proc_payload = json.loads(final_processed_meta.read_text(encoding="utf-8"))
        if isinstance(proc_payload, dict):
            proc_payload["processed_path"] = str(final_processed_path)
            proc_payload["raw_path"] = str(final_raw_path)
            proc_payload["raw_metadata_file"] = str(final_raw_meta)
            _write_json(final_processed_meta, proc_payload)
    except Exception:  # noqa: BLE001
        pass

    # Cleanup staging directory (best-effort)
    try:
        shutil.rmtree(staging_dir, ignore_errors=True)
    except Exception:  # noqa: BLE001
        pass

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
    completed_count = 0
    progress_lock = threading.Lock()

    def _run_single_category(category: str) -> None:
        nonlocal completed_count
        defn = None
        try:
            defn = DATASET_DEFINITIONS.get(category)
            if not defn:
                raise RuntimeError(f"Unknown dataset category '{category}'")

            override_for_category = job.overrides.get(category) if hasattr(job, "overrides") else None

            with JOB_LOCK:
                job.current_category = category
                state = job.category_states[category]
                state["status"] = "running"
                state["started_at"] = _utc_iso()
                job.updated_at = _utc_now()

            _log_to_job(job, ctx, f"Starting {defn.label}")

            if not job.force and not override_for_category and _dataset_ready(defn, ctx):
                with JOB_LOCK:
                    state = job.category_states[category]
                    state["status"] = "skipped"
                    state["message"] = "Already satisfied"
                    state["completed_at"] = _utc_iso()
                    for stage_name in STAGE_NAMES:
                        state["stages"][stage_name]["status"] = "skipped"
                        state["stages"][stage_name]["completed_at"] = _utc_iso()
                _log_to_job(job, ctx, f"{defn.label} already processed — skipping fetch.")
                return

            _execute_dataset(defn, ctx, job)

            if _cancel_if_requested(job, ctx):
                return

            with JOB_LOCK:
                state = job.category_states[category]
                state["status"] = "succeeded"
                state["message"] = "Completed"
                state["completed_at"] = _utc_iso()
                job.updated_at = _utc_now()

            _log_to_job(job, ctx, f"Finished {defn.label}")
        except Exception as exc:  # noqa: BLE001
            label = defn.label if defn else category
            with JOB_LOCK:
                state = job.category_states[category]
                state["status"] = "failed"
                state["message"] = str(exc)
                state["completed_at"] = _utc_iso()
                if not hasattr(job, "failed_categories"):
                    job.failed_categories = []
                job.failed_categories.append(category)
                job.updated_at = _utc_now()
            _log_to_job(job, ctx, f"{label} failed: {exc}")
            _log_to_job(job, ctx, "Continuing with remaining datasets...")
        finally:
            with progress_lock:
                completed_count += 1
            with JOB_LOCK:
                job.progress = completed_count / total
                job.updated_at = _utc_now()

    with ThreadPoolExecutor(max_workers=MAX_PARALLEL_CATEGORIES) as executor:
        futures = {}
        for category in job.categories:
            if _cancel_if_requested(job, ctx):
                return
            futures[executor.submit(_run_single_category, category)] = category

        for future in as_completed(futures):
            future.result()

    if _cancel_if_requested(job, ctx):
        return

    # Determine final job status based on category results
    with JOB_LOCK:
        failed_count = len(getattr(job, "failed_categories", []))
        succeeded_count = sum(
            1 for cat_state in job.category_states.values()
            if cat_state.get("status") == "succeeded"
        )
        skipped_count = sum(
            1 for cat_state in job.category_states.values()
            if cat_state.get("status") == "skipped"
        )

        if failed_count == 0:
            # All datasets succeeded or were skipped
            job.status = "succeeded"
            _log_to_job(job, ctx, "Dataset fetch pipeline completed successfully.")
        elif succeeded_count > 0 or skipped_count > 0:
            # Partial success - some datasets failed but others succeeded
            job.status = "partial"
            job.error = f"{failed_count} dataset(s) failed: {', '.join(getattr(job, 'failed_categories', []))}"
            _log_to_job(job, ctx, f"Dataset fetch pipeline completed with partial success. {failed_count} failed, {succeeded_count} succeeded, {skipped_count} skipped.")
        else:
            # All datasets failed
            job.status = "failed"
            job.error = f"All datasets failed: {', '.join(getattr(job, 'failed_categories', []))}"
            _log_to_job(job, ctx, f"Dataset fetch pipeline failed. All {failed_count} dataset(s) failed.")

        job.progress = 1.0
        job.current_category = None
        job.completed_at = _utc_now()
        job.updated_at = job.completed_at

    broadcast_project_event(job.project, {
        "type": "dataset_job_completed",
        "job_id": job.id,
        "status": job.status,
    })


def _job_thread(job_id: str) -> None:
    job = JOB_REGISTRY[job_id]
    try:
        _execute_job(job)
    finally:
        with JOB_LOCK:
            PROJECT_ACTIVE_JOBS.pop(job.project, None)
        _persist_job(job)
        _cleanup_conversation(job_id)


def _start_job(project: str, categories: List[str], force: bool, overrides: Optional[Dict[str, str]] = None) -> DatasetJobState:
    cleaned_overrides: Dict[str, str] = {}
    if overrides:
        for key, value in overrides.items():
            if key in categories and value:
                cleaned_overrides[key] = value

    if not JOB_LOCK.acquire(timeout=JOB_LOCK_TIMEOUT_S):
        raise HTTPException(
            status_code=503,
            detail=(
                "Dataset fetch pipeline is busy or unresponsive (job lock timeout). "
                "Restart the backend server and try again."
            ),
        )
    try:
        if project in PROJECT_ACTIVE_JOBS:
            existing = PROJECT_ACTIVE_JOBS[project]
            existing_job = JOB_REGISTRY.get(existing)
            # Self-heal stale "active job" entries:
            # - If the referenced job is missing (e.g., registry reset / inconsistent state)
            # - If the referenced job is already terminal (succeeded/failed/partial)
            # then clear the active marker and allow a new job to start.
            if existing_job is None or getattr(existing_job, "status", None) in ("succeeded", "failed", "partial"):
                PROJECT_ACTIVE_JOBS.pop(project, None)
            else:
                raise HTTPException(
                    status_code=409,
                    detail=f"A dataset fetch job ({existing}) is already running for project '{project}'.",
                )

        job_id = uuid.uuid4().hex
        job = DatasetJobState(id=job_id, project=project, categories=categories, force=force, overrides=cleaned_overrides)
        JOB_REGISTRY[job.id] = job
        PROJECT_ACTIVE_JOBS[project] = job.id
    finally:
        try:
            JOB_LOCK.release()
        except RuntimeError:
            pass

    _persist_job(job)

    thread = threading.Thread(target=_job_thread, args=(job.id,), daemon=True)
    thread.start()
    return job


# ---------------------------------------------------------------------------
# Protocol migration
# ---------------------------------------------------------------------------


def _migrate_project_protocol(ctx: FetchContext, target_version: str = "1.0") -> Dict[str, Any]:
    """Upgrade project dataset metadata to the target protocol version.

    Currently handles:
    - Adding missing required fields with sensible defaults
    - Stamping protocol_version in all metadata files
    """
    from .constants import PROTOCOL_VERSION
    migrated: List[str] = []
    errors: List[str] = []

    for data_type in ("rasters", "vectors"):
        processed_dir = ctx.project_path / "data" / data_type / "processed"
        if not processed_dir.exists():
            continue
        for meta_file in processed_dir.glob("*.json"):
            try:
                payload = json.loads(meta_file.read_text(encoding="utf-8"))
                if not isinstance(payload, dict):
                    continue
                changed = False
                if payload.get("protocol_version") != PROTOCOL_VERSION:
                    payload["protocol_version"] = PROTOCOL_VERSION
                    changed = True
                if "validation_status" not in payload:
                    payload["validation_status"] = "not_validated"
                    changed = True
                if "validation_date" not in payload:
                    payload["validation_date"] = None
                    changed = True
                if changed:
                    meta_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
                    migrated.append(str(meta_file.name))
            except Exception as e:
                errors.append(f"{meta_file.name}: {e}")

    pm_path = ctx.project_path / "project_metadata.json"
    if pm_path.exists():
        try:
            pm = json.loads(pm_path.read_text(encoding="utf-8"))
            if isinstance(pm, dict):
                pm["dataset_protocol_version"] = PROTOCOL_VERSION
                pm_path.write_text(json.dumps(pm, indent=2), encoding="utf-8")
        except Exception:
            pass

    return {"migrated": migrated, "errors": errors, "target_version": PROTOCOL_VERSION}


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------


@router.get("/projects/{project}/dataset-status", response_model=DatasetStatusResponse)
def get_dataset_status(project: str) -> DatasetStatusResponse:
    _ensure_command_available(ZEUS_BIN)
    ctx = _load_project_context(project)
    statuses: List[DatasetCategoryStatus] = []
    for key, defn in DATASET_DEFINITIONS.items():
        # Resolve raw path (prefer canonical, but surface legacy if that's what exists on disk)
        raw_candidates: List[Path] = [defn.raw_path(ctx)]
        for legacy_raw in getattr(defn, "legacy_raw_filenames", []) or []:
            raw_candidates.append(defn._base_dir(ctx) / "raw" / legacy_raw)
        raw_existing = next((p for p in raw_candidates if p.exists()), None)

        # Resolve processed path + sidecar (prefer canonical, but support legacy naming)
        processed_candidates: List[Path] = [defn.processed_path(ctx)]
        for base in getattr(defn, "legacy_processed_basenames", []) or []:
            processed_name = f"{base}_epsg{ctx.target_epsg}_processed.{defn.processed_extension}"
            processed_candidates.append(defn._base_dir(ctx) / "processed" / processed_name)
        processed_existing = None
        meta_existing = None
        for p in processed_candidates:
            m = p.with_suffix(p.suffix + ".json")
            if p.exists() and m.exists():
                processed_existing = p
                meta_existing = m
                break

        processed_path = processed_existing or defn.processed_path(ctx)
        meta_path = meta_existing or defn.processed_metadata_path(ctx)
        present = processed_existing is not None and meta_existing is not None
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
                raw_path=str(raw_existing) if raw_existing else None,
                processed_path=str(processed_path) if present else None,
                metadata_path=str(meta_path) if present else None,
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
def trigger_dataset_fetch(
    project: str,
    request: DatasetFetchRequest,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
) -> DatasetFetchJobResponse:
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

    ctx = _load_project_context(project)
    _check_disk_space(ctx.project_path, deduped)

    job = _start_job(project, deduped, request.force, request.overrides)

    write_audit_event(
        db,
        project_name=project,
        actor=actor,
        event_type="dataset_fetch.start",
        payload={
            "job_id": job.id,
            "categories": deduped,
            "force": bool(request.force),
            "overrides": request.overrides or {},
        },
        required=True,
    )

    broadcast_project_event(project, {"type": "dataset_job_started", "job_id": job.id})

    return DatasetFetchJobResponse(job_id=job.id)


@router.get("/dataset-jobs/active", response_model=ActiveDatasetJobsResponse)
def get_active_dataset_jobs() -> ActiveDatasetJobsResponse:
    """
    Return currently active dataset fetch jobs keyed by project.

    This is a lightweight endpoint used by the frontend to reflect backgrounded jobs and
    to avoid stale UI state after navigation/reload.
    """
    active: Dict[str, ActiveDatasetJobInfo] = {}
    with JOB_LOCK:
        # Self-heal any stale active markers while we're here.
        for project, job_id in list(PROJECT_ACTIVE_JOBS.items()):
            job = JOB_REGISTRY.get(job_id)
            if job is None or getattr(job, "status", None) in ("succeeded", "failed", "partial"):
                PROJECT_ACTIVE_JOBS.pop(project, None)
                continue
            active[project] = ActiveDatasetJobInfo(
                job_id=job.id,
                status=job.status,
                progress=float(job.progress or 0.0),
                current_category=job.current_category,
            )
    return ActiveDatasetJobsResponse(active_jobs=active)


@router.get("/projects/{project_name}/events/stream")
async def stream_project_events(project_name: str):
    """Stream project-level events (job updates, dataset changes) to all connected clients via SSE."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    with _SUBSCRIBERS_LOCK:
        PROJECT_SUBSCRIBERS.setdefault(project_name, []).append(queue)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(event, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                except asyncio.CancelledError:
                    break
        finally:
            with _SUBSCRIBERS_LOCK:
                subs = PROJECT_SUBSCRIBERS.get(project_name, [])
                if queue in subs:
                    subs.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )


@router.get("/dataset-jobs/{job_id}")
def get_dataset_job(job_id: str) -> Dict[str, Any]:
    """Get the current state of a dataset fetch job."""
    job = JOB_REGISTRY.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    return _job_to_response(job)


@router.get("/dataset-jobs/{job_id}/stream")
async def stream_dataset_job(job_id: str):
    """Stream real-time updates for a dataset fetch job via SSE.

    Uses asyncio.to_thread to avoid blocking the event loop when acquiring locks.
    Sends keep-alive comments every 15 seconds to prevent connection timeouts.
    """
    # Initial check - use to_thread to avoid blocking
    initial_snapshot = await asyncio.to_thread(_get_job_snapshot_sync, job_id)
    if initial_snapshot is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    async def event_generator():
        last_serialized: Optional[str] = None
        keepalive_counter = 0

        while True:
            try:
                # Use asyncio.to_thread to run lock acquisition in thread pool
                # This prevents blocking the event loop
                snapshot = await asyncio.to_thread(_get_job_snapshot_sync, job_id)

                if not snapshot:
                    # Job was removed from registry
                    yield f"data: {json.dumps({'status': 'not_found', 'error': 'Job no longer exists'})}\n\n"
                    break

                # Serialize and check for changes
                serialized = json.dumps(snapshot, default=str)

                if serialized != last_serialized:
                    yield f"data: {serialized}\n\n"
                    last_serialized = serialized
                    keepalive_counter = 0  # Reset keepalive counter on actual data
                else:
                    # Send keep-alive comment every 15 iterations (15 seconds at 1s interval)
                    keepalive_counter += 1
                    if keepalive_counter >= 15:
                        yield f": keepalive {int(asyncio.get_event_loop().time())}\n\n"
                        keepalive_counter = 0

                # Check for terminal states
                status = snapshot.get("status")
                if status in ("succeeded", "failed", "partial"):
                    # Send final state and close
                    break

                # Short sleep for responsive updates
                await asyncio.sleep(0.5)

            except asyncio.CancelledError:
                # Client disconnected
                break
            except Exception as e:
                # Log error but try to continue
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                await asyncio.sleep(1.0)

    # SSE requires specific headers to prevent buffering and enable real-time streaming
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream; charset=utf-8",
            "Transfer-Encoding": "chunked",
        }
    )


@router.delete("/dataset-jobs/{job_id}", status_code=202)
def cancel_dataset_job(
    job_id: str,
    cleanup: bool = True,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """
    Cancel a running dataset fetch job.

    Args:
        job_id: The job ID to cancel
        cleanup: If True, attempts to delete incomplete/partial downloads
    """
    project: Optional[str] = None
    categories_to_cleanup: List[str] = []
    noop = False
    terminal = False

    with JOB_LOCK:
        job = JOB_REGISTRY.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
        project = job.project
        if job.status in ("succeeded", "failed", "partial"):
            noop = True
            terminal = True
        else:
            job.cancel_requested = True
            job.error = job.error or "Cancelled by user"
            job.status = "failed"  # Mark as failed immediately
            job.completed_at = _utc_now()
            job.updated_at = job.completed_at

            # Store cleanup info before releasing lock
            if cleanup:
                for category, state in job.category_states.items():
                    status = state.get("status")
                    if status in ("running", "queued", None):
                        state["status"] = "cancelled"
                        state["message"] = "Cancelled by user"
                        state["completed_at"] = _utc_iso()
                        categories_to_cleanup.append(category)
                        # Also mark stages as cancelled
                        stages = state.get("stages")
                        if stages:
                            for stage_state in stages.values():
                                if stage_state.get("status") in ("running", "queued", None):
                                    stage_state["status"] = "cancelled"
                                    stage_state["message"] = "Cancelled by user"
                                    stage_state["completed_at"] = _utc_iso()

            # CRITICAL: Remove from active jobs so new jobs can start
            PROJECT_ACTIVE_JOBS.pop(project, None)

    # Audit after releasing lock (DB I/O)
    if project:
        write_audit_event(
            db,
            project_name=project,
            actor=actor,
            event_type="dataset_fetch.cancel",
            payload={
                "job_id": job_id,
                "cleanup": bool(cleanup),
                "categories_to_cleanup": categories_to_cleanup,
                "noop": bool(noop),
            },
            required=True,
        )
        if not noop:
            broadcast_project_event(project, {"type": "dataset_job_cancelled", "job_id": job_id})

    if terminal:
        return Response(status_code=204)

    # Cleanup incomplete downloads outside of lock
    if cleanup and categories_to_cleanup:
        try:
            _cleanup_incomplete_downloads(project, categories_to_cleanup)
        except Exception as e:
            # Log but don't fail the cancel operation
            print(f"[DatasetFetch] Cleanup failed for job {job_id}: {e}")

    # Cleanup conversation memory
    _cleanup_conversation(job_id)

    return Response(status_code=202)


@router.get("/dataset-jobs/{job_id}/report")
def get_dataset_job_report(job_id: str):
    """Serve the per-dataset JSON report for a completed job."""
    job = JOB_REGISTRY.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")
    ctx = _load_project_context(job.project)
    report_path = ctx.project_path / "logs" / f"dataset_fetch_report_{job_id}.json"
    if not report_path.exists():
        raise HTTPException(status_code=404, detail="Report not yet generated for this job.")
    return json.loads(report_path.read_text(encoding="utf-8"))


@router.post("/projects/{project}/migrate-protocol")
def migrate_project_protocol(
    project: str,
    actor: Dict[str, Any] = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Migrate project dataset metadata to the current protocol version."""
    ctx = _load_project_context(project)
    result = _migrate_project_protocol(ctx)

    write_audit_event(
        db,
        project_name=project,
        actor=actor,
        event_type="dataset_protocol.migrate",
        payload=result,
        required=False,
    )
    return result


def _cleanup_incomplete_downloads(project: str, categories: List[str]) -> None:
    """
    Clean up incomplete/partial downloads for cancelled job categories.

    Removes:
    - Temporary files (.tmp.*)
    - Partial raw files that may be incomplete
    - Download staging directories
    """
    project_path = resolve_project_path(project)
    if not project_path or not project_path.exists():
        return

    data_path = project_path / "data"
    if not data_path.exists():
        return

    # Get dataset definitions to find paths
    for category in categories:
        defn = DATASET_DEFINITIONS.get(category)
        if not defn:
            continue

        base_dir = data_path / ("rasters" if defn.dataset_type == "raster" else "vectors")
        raw_dir = base_dir / "raw"
        processed_dir = base_dir / "processed"

        # Clean up temp files
        for pattern in ["*.tmp.*", "*.partial", "*.downloading"]:
            for tmp_file in raw_dir.glob(pattern):
                try:
                    tmp_file.unlink()
                    print(f"[Cleanup] Removed temp file: {tmp_file}")
                except OSError:
                    pass
            for tmp_file in processed_dir.glob(pattern):
                try:
                    tmp_file.unlink()
                    print(f"[Cleanup] Removed temp file: {tmp_file}")
                except OSError:
                    pass

        # Clean up download staging directories (used by some fetchers)
        staging_dir = raw_dir / f"{category}_download"
        if staging_dir.exists():
            try:
                shutil.rmtree(staging_dir)
                print(f"[Cleanup] Removed staging dir: {staging_dir}")
            except OSError:
                pass

        # Clean up tile download directories (used by DEM fetchers)
        for tile_dir in raw_dir.glob(f"*_tiles"):
            try:
                shutil.rmtree(tile_dir)
                print(f"[Cleanup] Removed tile dir: {tile_dir}")
            except OSError:
                pass
