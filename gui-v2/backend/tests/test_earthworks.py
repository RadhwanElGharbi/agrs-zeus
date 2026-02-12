import json
import sys
import unittest
import asyncio


class TestEarthworksEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

    def test_earthworks_returns_valid_response_for_pirl_route(self) -> None:
        from api.data import get_earthworks_analysis

        project = "Ravenna-Chieti-Pipeline-TEST"
        route = "Ravenna-Chieti-Pipeline_PIRL_saipem_compliant.geojson"

        resp = asyncio.run(
            get_earthworks_analysis(
                project,
                route,
                row_width=20.0,
                section_spacing=50.0,
                grading_slope=10.0,
                batter_cut_angle=45.0,
                batter_fill_angle=35.0,
            )
        )

        self.assertEqual(getattr(resp, "status_code", None), 200)
        payload = json.loads(resp.body.decode("utf-8"))

        self.assertIn("route", payload)
        self.assertIn("parameters", payload)
        self.assertIn("summary", payload)
        self.assertIn("cross_sections", payload)
        self.assertIn("mass_haul_diagram", payload)

        summary = payload["summary"]
        cross_sections = payload["cross_sections"]
        mass_haul = payload["mass_haul_diagram"]

        self.assertIsInstance(cross_sections, list)
        self.assertGreater(len(cross_sections), 10)
        self.assertEqual(len(cross_sections), summary["num_sections"])

        # Basic expected shape of a section
        first = cross_sections[0]
        self.assertIn("chainage", first)
        self.assertIn("transect_offsets", first)
        self.assertIn("transect_elevations", first)
        self.assertIn("cut_area", first)
        self.assertIn("fill_area", first)
        self.assertIn("cut_volume", first)
        self.assertIn("fill_volume", first)
        self.assertIn("mass_haul", first)

        # With incremental volumes, the first section volume should be zero
        self.assertAlmostEqual(first["cut_volume"], 0.0, places=6)
        self.assertAlmostEqual(first["fill_volume"], 0.0, places=6)

        # Totals should roughly match sum of incremental volumes (rounding tolerance)
        total_cut = sum(float(s.get("cut_volume", 0.0)) for s in cross_sections)
        total_fill = sum(float(s.get("fill_volume", 0.0)) for s in cross_sections)
        self.assertAlmostEqual(total_cut, float(summary["total_cut_m3"]), delta=2.0)
        self.assertAlmostEqual(total_fill, float(summary["total_fill_m3"]), delta=2.0)

        # Mass haul end-balance should match summary
        self.assertGreater(len(mass_haul), 2)
        self.assertAlmostEqual(
            float(mass_haul[-1]["balance"]),
            float(summary["mass_haul_balance_m3"]),
            delta=2.0,
        )

    def test_earthworks_handles_segmented_route_features(self) -> None:
        from api.data import get_earthworks_analysis

        project = "Ravenna-Chieti-Pipeline"
        # This route is stored as many segment LineString features with ordering keys
        route = "Ravenna-Chieti-Pipeline_existing_snam_pipeline.geojson"

        resp = asyncio.run(
            get_earthworks_analysis(
                project,
                route,
                row_width=20.0,
                section_spacing=50.0,
                grading_slope=10.0,
            )
        )

        self.assertEqual(getattr(resp, "status_code", None), 200)
        payload = json.loads(resp.body.decode("utf-8"))
        self.assertIn("summary", payload)
        self.assertIn("cross_sections", payload)
        self.assertGreater(payload["summary"]["num_sections"], 10)
        self.assertEqual(len(payload["cross_sections"]), payload["summary"]["num_sections"])

    def test_earthworks_validates_parameters(self) -> None:
        from api.data import get_earthworks_analysis
        from fastapi import HTTPException

        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(
                get_earthworks_analysis(
                    "Ravenna-Chieti-Pipeline-TEST",
                    "Ravenna-Chieti-Pipeline_PIRL_saipem_compliant.geojson",
                    row_width=0.0,
                )
            )
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()


















