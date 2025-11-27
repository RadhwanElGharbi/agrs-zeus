#!/usr/bin/env python3
"""
Dataset fetching validation harness.

Runs end-to-end fetch jobs through the FastAPI backend and verifies
that protocol-mandated metadata fields exist for each dataset category.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from api.dataset_fetch import DATASET_DEFINITIONS, _load_project_context  # noqa: E402
from api.dataset_fetch import FetchContext  # noqa: E402


TEST_MATRIX: Dict[str, Dict[str, Any]] = {
    "test_project2": {
        "categories": list(DATASET_DEFINITIONS.keys()),
        "overrides": {
            "dem": "Copernicus 30m",
            "landcover": "ESA WorldCover 2021",
            "soil": "SOC 0-30cm",
            "geohazard": "PGA",
            "roads": "OSM",
            "railways": "OSM",
            "powerlines": "OSM",
            "waterways": "OSM",
            "pipelines": "OSM",
        },
    },
    "US_PIPELINE": {
        "categories": ["dem", "landcover", "soil", "geohazard", "roads", "waterways", "pipelines"],
        "overrides": {
            "dem": "Copernicus 30m",
            "landcover": "ESA WorldCover 2021",
            "soil": "SOC 0-30cm",
            "geohazard": "PGA",
            "roads": "OSM",
            "waterways": "OSM",
            "pipelines": "OSM",
        },
    },
}


RAW_COMMON_FIELDS = [
    "dataset_name",
    "source",
    "provider",
    "provider_url",
    "coverage_date",
    "fetch_date",
    "fetch_tool",
    "data_type",
    "format",
    "file_size_bytes",
    "protocol_reference",
    "protocol_version",
    "zeus_version",
    "documentation_url",
    "license",
    "attribution",
    "checksum_sha256",
    "project",
    "category",
    "notes",
    "validation_status",
    "validation_date",
]

RAW_RASTER_FIELDS = RAW_COMMON_FIELDS + [
    "raw_crs",
    "resolution_m",
    "nodata_value",
    "extent",
    "bbox_wgs84",
]

RAW_VECTOR_FIELDS = RAW_COMMON_FIELDS + [
    "raw_crs",
    "extent",
    "bbox_wgs84",
    "feature_count",
]

PROCESSED_COMMON_FIELDS = [
    "dataset_name",
    "category",
    "project",
    "processing_date",
    "target_crs",
    "target_crs_name",
    "data_type",
    "format",
    "processed_path",
    "raw_path",
    "raw_metadata_file",
    "file_size_bytes",
    "protocol_reference",
    "protocol_version",
    "zeus_version",
    "validation_status",
    "validation_date",
    "operations_applied",
]

PROCESSED_RASTER_FIELDS = PROCESSED_COMMON_FIELDS + [
    "resolution_m",
    "extent",
    "bbox_wgs84",
    "statistics",
]

PROCESSED_VECTOR_FIELDS = PROCESSED_COMMON_FIELDS + [
    "extent",
    "bbox_wgs84",
    "feature_count",
]


def _http_json(method: str, url: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    data: Optional[bytes] = None
    headers = {"Content-Type": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        text = exc.read().decode("utf-8")
        raise RuntimeError(f"HTTP {exc.code} {exc.reason}: {text}") from exc


def _start_job(base_url: str, project: str, categories: List[str], overrides: Dict[str, str], force: bool) -> str:
    payload = {"categories": categories, "overrides": overrides, "force": force}
    response = _http_json("POST", f"{base_url}/projects/{project}/dataset-fetch", payload)
    return response["job_id"]


def _wait_for_job(base_url: str, job_id: str, timeout: int = 7200) -> Dict[str, Any]:
    start = time.time()
    while True:
        job = _http_json("GET", f"{base_url}/dataset-jobs/{job_id}")
        status = job["status"]
        if status in ("succeeded", "failed"):
            job["duration_sec"] = time.time() - start
            return job
        if time.time() - start > timeout:
            raise TimeoutError(f"Job {job_id} timed out after {timeout} seconds")
        time.sleep(5)


def _field_missing(data: Dict[str, Any], field: str) -> bool:
    if field not in data:
        return True
    value = data[field]
    if value in (None, "", []):
        return True
    return False


def _validate_metadata(ctx: FetchContext, categories: List[str]) -> Dict[str, Dict[str, List[str]]]:
    results: Dict[str, Dict[str, List[str]]] = {}
    for category in categories:
        defn = DATASET_DEFINITIONS[category]
        raw_meta_path = defn.raw_metadata_path(ctx)
        processed_meta_path = defn.processed_metadata_path(ctx)
        raw_data = json.loads(raw_meta_path.read_text(encoding="utf-8"))
        processed_data = json.loads(processed_meta_path.read_text(encoding="utf-8"))

        if defn.dataset_type == "raster":
            raw_requirements = RAW_RASTER_FIELDS
            processed_requirements = PROCESSED_RASTER_FIELDS
        else:
            raw_requirements = RAW_VECTOR_FIELDS
            processed_requirements = PROCESSED_VECTOR_FIELDS

        raw_missing = [field for field in raw_requirements if _field_missing(raw_data, field)]
        processed_missing = [field for field in processed_requirements if _field_missing(processed_data, field)]

        results[category] = {
            "raw_missing": raw_missing,
            "processed_missing": processed_missing,
        }
    return results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate dataset fetch workflow against protocol requirements.")
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000/api",
        help="Base URL for the FastAPI backend (default: %(default)s)",
    )
    parser.add_argument(
        "--project",
        help="Limit validation to a single project (must exist in the test matrix).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force refetch even if datasets already exist.",
    )
    parser.add_argument(
        "--output",
        default=str(Path(__file__).with_name("reports").joinpath("dataset_fetch_validation.json")),
        help="Path to write the validation summary JSON.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    projects = [args.project] if args.project else list(TEST_MATRIX.keys())

    summary: Dict[str, Any] = {}
    failures: List[str] = []

    for project in projects:
        if project not in TEST_MATRIX:
            raise SystemExit(f"Project '{project}' is not defined in the validation matrix.")

        plan = TEST_MATRIX[project]
        categories: List[str] = plan["categories"]
        overrides: Dict[str, str] = plan["overrides"]

        status = _http_json("GET", f"{args.base_url}/projects/{project}/dataset-status")
        print(f"[INFO] {project}: target_epsg={status['target_epsg']} minimum_met={status['minimum_requirements_met']}")

        print(f"[INFO] Starting dataset job for {project} ({len(categories)} categories)")
        job_id = _start_job(args.base_url, project, categories, overrides, args.force)
        job = _wait_for_job(args.base_url, job_id)
        print(f"[INFO] Job {job_id} completed with status={job['status']} duration={job['duration_sec']:.1f}s")

        ctx = _load_project_context(project)
        metadata_results = _validate_metadata(ctx, categories)

        summary[project] = {
            "job_id": job_id,
            "status": job["status"],
            "duration_sec": job["duration_sec"],
            "categories": metadata_results,
        }

        for category, result in metadata_results.items():
            missing = result["raw_missing"] + result["processed_missing"]
            if missing:
                failures.append(f"{project}/{category}: missing {missing}")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[INFO] Validation summary written to {output_path}")

    if failures:
        print("[ERROR] Missing required metadata fields detected:")
        for failure in failures:
            print(f" - {failure}")
        raise SystemExit(1)

    print("[INFO] All datasets include required metadata fields.")


if __name__ == "__main__":
    main()


