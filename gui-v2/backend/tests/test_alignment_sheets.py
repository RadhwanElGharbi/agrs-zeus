import asyncio
import json
import os
import shutil
import sys
import unittest
from pathlib import Path


class TestAlignmentSheets(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

    def setUp(self) -> None:
        self.project_name = "ZZZ_TEST_ALIGNMENT_SHEETS"
        self.project_dir = Path("/opt/agrs/Projects") / self.project_name
        self.outputs_dir = self.project_dir / "PIRL" / "outputs"
        self.outputs_dir.mkdir(parents=True, exist_ok=True)

        # Minimal project metadata/specs (required by resolver and context)
        (self.project_dir / "project_metadata.json").write_text(
            json.dumps(
                {
                    "project_name": self.project_name,
                    "project_id": "TEST_001",
                    "organization": "AGRS",
                    "country": "Test",
                    "crs": {"epsg": 32613, "name": "WGS 84 / UTM zone 13N"},
                    # Explicitly mark as FEED to validate template auto-choice later
                    "deliverables_profile": "feed",
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        (self.project_dir / "pipeline_specs.json").write_text(
            json.dumps(
                {
                    "diameter_mm": 600.0,
                    "thickness_mm": 12.0,
                    "material": "Carbon Steel",
                    "pipeline_type": "Gas",
                    "depth_of_cover_m": 1.5,
                    "mop_bar": 70,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # A simple 2.5 km straight route in projected meters
        route_geojson = {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": "EPSG:32613"}},
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[0.0, 0.0], [2500.0, 0.0]],
                    },
                    "properties": {},
                }
            ],
        }
        (self.outputs_dir / "test_route.geojson").write_text(json.dumps(route_geojson), encoding="utf-8")

    def tearDown(self) -> None:
        # Clean up test project directory
        if self.project_dir.exists():
            shutil.rmtree(self.project_dir, ignore_errors=True)

    def test_stationing_format(self) -> None:
        from api.alignment_sheets.core import LinearReferencingSystem

        lrs = LinearReferencingSystem()
        self.assertEqual(lrs.measure_to_station(0.0), "KP 0+000")
        self.assertEqual(lrs.measure_to_station(1234.0), "KP 1+234")

    def test_sheet_cutting_by_chainage(self) -> None:
        from api.alignment_sheets.engine import AlignmentSheetEngine

        route_path = self.outputs_dir / "test_route.geojson"
        engine = AlignmentSheetEngine(
            self.project_dir,
            "test_route",
            "standard",
            route_path=route_path,
            template_id="feed_plan_profile_v1",
            base_map="vector",
        )
        sheets = engine._cut_sheets([], [], [])
        self.assertEqual(len(sheets), 3)
        self.assertAlmostEqual(float(sheets[0].start_m), 0.0, places=3)
        self.assertAlmostEqual(float(sheets[0].end_m), 1000.0, places=3)
        self.assertAlmostEqual(float(sheets[1].start_m), 1000.0, places=3)
        self.assertAlmostEqual(float(sheets[1].end_m), 2000.0, places=3)
        self.assertAlmostEqual(float(sheets[2].start_m), 2000.0, places=3)
        self.assertAlmostEqual(float(sheets[2].end_m), 2500.0, places=3)

    def test_preview_endpoint(self) -> None:
        from api.alignment_sheets.router import preview_alignment_sheets

        payload = asyncio.run(
            preview_alignment_sheets(
                self.project_name,
                "test_route",
                preset="standard",
                template_id="feed_plan_profile_v1",
                base_map="vector",
            )
        )
        self.assertIn("sheet_count", payload)
        self.assertIn("sheet_length_m", payload)
        self.assertEqual(payload["sheet_length_m"], 1000.0)
        self.assertEqual(payload["sheet_count"], 3)
        self.assertEqual(payload.get("template_id"), "feed_plan_profile_v1")

    def test_generate_endpoint_returns_pdf_bytes(self) -> None:
        from api.alignment_sheets.router import generate_alignment_sheets, GenerateRequest

        req = GenerateRequest(
            project=self.project_name,
            route="test_route",
            preset="standard",
            template_id="feed_plan_profile_v1",
            base_map="vector",
            persist=False,
        )

        async def run() -> bytes:
            resp = await generate_alignment_sheets(req)
            self.assertEqual(getattr(resp, "media_type", None), "application/pdf")
            chunks = []
            async for chunk in resp.body_iterator:  # type: ignore[attr-defined]
                chunks.append(chunk)
            return b"".join(chunks)

        pdf_bytes = asyncio.run(run())
        self.assertGreater(len(pdf_bytes), 1000)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()















