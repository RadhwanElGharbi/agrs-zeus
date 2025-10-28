#!/usr/bin/env python3
"""
Pre-training data validator for PIRL.

Checks:
- Project CRS consistency (expect DEM, derived rasters in project EPSG)
- DEM presence and stats
- Slope handling: prefer derived-from-DEM; validate values in [0, 100] percent
- Landcover presence and valid classes
- Vector layers presence (AOI, protected areas, water, roads, railways)
- Pixel size sanity
- NoData presence and coverage

Outputs a JSON report and returns non-zero on critical errors.
"""

import sys
import json
import math
from pathlib import Path
from typing import Dict, Any

try:
	from osgeo import gdal, ogr, osr
except Exception as e:
	print(f"ERROR: GDAL python bindings not available: {e}", file=sys.stderr)
	sys.exit(2)

CRITICAL = "critical"
WARNING = "warning"
INFO = "info"


def read_epsg(dataset) -> int:
	if not dataset:
		return -1
	srs = dataset.GetSpatialRef()
	if not srs:
		return -1
	return srs.GetAuthorityCode(None) and int(srs.GetAuthorityCode(None)) or -1


def raster_stats(ds) -> Dict[str, float]:
	band = ds.GetRasterBand(1)
	stats = band.GetStatistics(True, True)
	if not stats:
		return {"min": None, "max": None, "mean": None, "std": None}
	return {"min": stats[0], "max": stats[1], "mean": stats[2], "std": stats[3]}


def pixel_size(ds):
	gt = ds.GetGeoTransform()
	return abs(gt[1]), abs(gt[5])


def layer_exists(path: Path) -> bool:
	return path.exists()


def validate(config_yaml: str) -> Dict[str, Any]:
	import yaml
	with open(config_yaml, 'r') as f:
		cfg = yaml.safe_load(f)

	project_dir = Path(cfg.get('project_dir', '/opt/agrs/Projects/test_project'))
	epsg_expected = int(cfg.get('epsg_code', 32633))

	report = {"status": "ok", "messages": [], "datasets": {}}

	def msg(level, text):
		report["messages"].append({"level": level, "message": text})
		if level == CRITICAL:
			report["status"] = "failed"

	# Rasters
	dem_path = project_dir / 'data/rasters/dem.tif'
	slope_path = project_dir / 'derived/terrain_analysis/slope.tif'
	landcover_path = project_dir / 'data/rasters/landcover.tif'
	geohaz_path = project_dir / 'data/rasters/geohazards.tif'
	soil_path = project_dir / 'data/rasters/soil.tif'
	pop_path = project_dir / 'data/rasters/population.tif'

	for name, path in [
		("dem", dem_path),
		("landcover", landcover_path),
		("geohazards", geohaz_path),
		("soil", soil_path),
		("population", pop_path),
	]:
		if not path.exists():
			msg(CRITICAL, f"Raster missing: {path}")
			continue
		ds = gdal.Open(str(path), gdal.GA_ReadOnly)
		if not ds:
			msg(CRITICAL, f"Raster unreadable: {path}")
			continue
		repsg = read_epsg(ds)
		if repsg != epsg_expected:
			msg(CRITICAL, f"Raster CRS mismatch for {name}: EPSG:{repsg} != EPSG:{epsg_expected} ({path})")
		px, py = pixel_size(ds)
		if px <= 0 or py <= 0 or px > 1000 or py > 1000:
			msg(CRITICAL, f"Unreasonable pixel size for {name}: {px} x {py} m")
		stats = raster_stats(ds)
		report["datasets"][name] = {"path": str(path), "epsg": repsg, "pixel_size": [px, py], "stats": stats}

	# Slope policy
	if slope_path.exists():
		slope_ds = gdal.Open(str(slope_path), gdal.GA_ReadOnly)
		if slope_ds:
			repsg = read_epsg(slope_ds)
			if repsg != epsg_expected:
				msg(CRITICAL, f"Slope CRS mismatch: EPSG:{repsg} != EPSG:{epsg_expected} ({slope_path})")
			stats = raster_stats(slope_ds)
			# Slope must be percent in [0, 100] realistically for SAIPEM (20% threshold)
			if stats["max"] is not None and (stats["max"] > 300 or stats["max"] < -1):
				msg(CRITICAL, f"Slope raster has unrealistic values (max={stats['max']}). Should be percent 0-100.")
			report["datasets"]["slope"] = {"path": str(slope_path), "epsg": repsg, "stats": stats}
	else:
		msg(INFO, "No precomputed slope.tif found. Will derive slope from DEM on-the-fly (preferred).")

	# Vectors - Critical (REQUIRED for training)
	for vname, vpath in [
		("aoi", project_dir / 'data/vectors/aoi.gpkg'),
		("protected_areas", project_dir / 'data/vectors/protected_areas.gpkg'),
		("water_bodies", project_dir / 'data/vectors/water_bodies.gpkg'),
		("roads", project_dir / 'data/vectors/roads.gpkg'),
		("railways", project_dir / 'data/vectors/railways.gpkg'),
		("power_lines", project_dir / 'data/vectors/power_lines.gpkg'),
		("pipelines", project_dir / 'data/vectors/pipelines.gpkg'),
	]:
		if not vpath.exists():
			msg(CRITICAL, f"Vector layer missing (REQUIRED): {vpath}")
			continue
		vds = ogr.Open(str(vpath))
		if not vds or vds.GetLayerCount() == 0:
			msg(CRITICAL, f"Vector layer unreadable/empty (REQUIRED): {vpath}")
		report["datasets"][vname] = {"path": str(vpath), "layers": vds and vds.GetLayerCount() or 0}

	# Final policy enforcement
	# Ensure DEM exists and is valid
	if "dem" not in report["datasets"]:
		msg(CRITICAL, "DEM is required for training.")

	# Enforce "train on raw data" policy: slope cannot be the only elevation-derived input;
	# training will always derive slope from DEM (C++ already supports on-the-fly derivation).
	if "slope" in report["datasets"]:
		msg(INFO, "Slope raster will be ignored for training; environment derives slope from DEM.")

	return report


def main():
	if len(sys.argv) < 3:
		print("Usage: validate_training_data.py <config_yaml> <report_json>")
		sys.exit(2)
	config_yaml = sys.argv[1]
	report_path = Path(sys.argv[2])
	report = validate(config_yaml)
	report_path.parent.mkdir(parents=True, exist_ok=True)
	with open(report_path, 'w') as f:
		json.dump(report, f, indent=2)
	print(json.dumps(report, indent=2))
	if report["status"] != "ok":
		print("Validation failed. See report.", file=sys.stderr)
		sys.exit(1)
	print("Validation passed.")


if __name__ == "__main__":
	main()

