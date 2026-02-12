import asyncio
import json
import shutil
import sys
import unittest
from pathlib import Path
from uuid import uuid4


class TestDatasetCoverageIsoInference(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

        cls.project_name = f"ZZZ_DATASET_COVERAGE_{uuid4().hex[:10]}"
        cls.project_dir = Path("/opt/agrs/Projects") / cls.project_name
        (cls.project_dir / "aoi").mkdir(parents=True, exist_ok=False)

        # Intentionally omit iso3/country to ensure backend infers it from AOI geometry.
        metadata = {
            "project_name": cls.project_name,
            "project_id": f"AGRS_{cls.project_name}_TST_2026_001",
            "date_created": "2026-01-10T00:00:00Z",
            "status": "active",
            "project_creator": "Unit Test",
            "organization": "AGRS",
            "measurement_system": "SI",
            "crs": {"epsg": 4326, "name": "WGS 84"},
            "aoi": {"file": "aoi/project_aoi.json"},
        }
        (cls.project_dir / "project_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        (cls.project_dir / "pipeline_specs.json").write_text(
            json.dumps({"product": "Test", "measurement_system": "SI"}, indent=2),
            encoding="utf-8",
        )

        # Abu Dhabi point (UAE) in WGS84.
        aoi_fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Point", "coordinates": [54.3773, 24.4539]},
                }
            ],
        }
        (cls.project_dir / "aoi" / "project_aoi.json").write_text(json.dumps(aoi_fc), encoding="utf-8")

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.project_dir, ignore_errors=True)

    def test_dataset_coverage_infers_iso3_from_aoi(self) -> None:
        try:
            from api.projects import get_project_dataset_coverage
        except ModuleNotFoundError as exc:
            # Some CI/dev environments running these lightweight unit tests may not have
            # FastAPI installed even though the full backend runtime does.
            if str(getattr(exc, "name", "")) == "fastapi":
                raise unittest.SkipTest("fastapi is not installed; skipping DatasetCoverage API import.")
            raise

        resp = asyncio.run(get_project_dataset_coverage(self.project_name))

        # Expect UAE ISO3 (ARE) inferred from AOI point.
        self.assertEqual(getattr(resp, "iso3", None), "ARE")

        entries = list(getattr(resp, "entries", []) or [])
        self.assertGreater(len(entries), 0)

        # Ensure we have at least one non-global entry (ISO3-specific rows).
        self.assertTrue(any((not getattr(e, "applies_globally", True)) for e in entries))

        # Sanity-check that a known UAE-specific dataset is present in the local table.
        names = {getattr(e, "dataset", ""): getattr(e, "applies_globally", True) for e in entries}
        self.assertIn("Abu Dhabi Spatial Data Infrastructure (AD-SDI) DEM", names)
        self.assertFalse(names["Abu Dhabi Spatial Data Infrastructure (AD-SDI) DEM"])


class TestDatasetCoverageIncludesTinitaly(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

        cls.project_name = f"ZZZ_DATASET_COVERAGE_ITA_{uuid4().hex[:10]}"
        cls.project_dir = Path("/opt/agrs/Projects") / cls.project_name
        (cls.project_dir / "aoi").mkdir(parents=True, exist_ok=False)

        # Intentionally omit iso3/country to ensure backend infers it from AOI geometry.
        metadata = {
            "project_name": cls.project_name,
            "project_id": f"AGRS_{cls.project_name}_TST_2026_002",
            "date_created": "2026-01-10T00:00:00Z",
            "status": "active",
            "project_creator": "Unit Test",
            "organization": "AGRS",
            "measurement_system": "SI",
            "crs": {"epsg": 4326, "name": "WGS 84"},
            "aoi": {"file": "aoi/project_aoi.json"},
        }
        (cls.project_dir / "project_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        (cls.project_dir / "pipeline_specs.json").write_text(
            json.dumps({"product": "Test", "measurement_system": "SI"}, indent=2),
            encoding="utf-8",
        )

        # Rome, Italy point (WGS84).
        aoi_fc = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "Point", "coordinates": [12.4964, 41.9028]},
                }
            ],
        }
        (cls.project_dir / "aoi" / "project_aoi.json").write_text(json.dumps(aoi_fc), encoding="utf-8")

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.project_dir, ignore_errors=True)

    def test_dataset_coverage_includes_tinitaly_for_italy(self) -> None:
        try:
            from api.projects import get_project_dataset_coverage
        except ModuleNotFoundError as exc:
            if str(getattr(exc, "name", "")) == "fastapi":
                raise unittest.SkipTest("fastapi is not installed; skipping DatasetCoverage API import.")
            raise

        resp = asyncio.run(get_project_dataset_coverage(self.project_name))
        self.assertEqual(getattr(resp, "iso3", None), "ITA")

        entries = list(getattr(resp, "entries", []) or [])
        self.assertGreater(len(entries), 0)
        self.assertTrue(any(("tinitaly" in (getattr(e, "dataset", "") or "").lower()) for e in entries))


if __name__ == "__main__":
    unittest.main()


