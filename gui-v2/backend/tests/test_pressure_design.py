import asyncio
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class TestPressureDesignEndpoint(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

    def test_pressure_design_returns_result(self) -> None:
        from api.engineering.pressure_design import PressureDesignRequest, pressure_design

        req = PressureDesignRequest(
            mode="thickness_from_pressure",
            inputs={
                "outside_diameter_value": 762,
                "outside_diameter_unit": "mm",
                "design_pressure_value": 100,
                "design_pressure_unit": "bar",
                "smys_value": 483,
                "smys_unit": "MPa",
                "design_factor": 0.72,
                "joint_factor": 1.0,
                "temperature_derating_factor": 1.0,
            },
            save=False,
        )

        resp = asyncio.run(pressure_design(req))
        self.assertIn("result", resp)
        self.assertIn("required_nominal_thickness_mm", resp["result"])
        self.assertGreater(float(resp["result"]["required_nominal_thickness_mm"]), 0.0)

    def test_pressure_design_can_save_artifact(self) -> None:
        from api.engineering.pressure_design import PressureDesignRequest, pressure_design

        with tempfile.TemporaryDirectory() as tmp:
            project_dir = Path(tmp)
            # Patch resolve_project_path so we don't depend on a real /opt/agrs/Projects project existing.
            with patch("api.engineering.pressure_design.resolve_project_path", return_value=project_dir):
                req = PressureDesignRequest(
                    mode="thickness_from_pressure",
                    inputs={
                        "outside_diameter_value": 762,
                        "outside_diameter_unit": "mm",
                        "design_pressure_value": 100,
                        "design_pressure_unit": "bar",
                        "smys_value": 483,
                        "smys_unit": "MPa",
                        "design_factor": 0.72,
                        "joint_factor": 1.0,
                        "temperature_derating_factor": 1.0,
                    },
                    project="TEST_PROJECT",
                    save=True,
                )

                resp = asyncio.run(pressure_design(req))
                self.assertTrue(resp.get("saved"))
                artifact_path = Path(resp["artifact_path"])
                self.assertTrue(artifact_path.exists())

                payload = json.loads(artifact_path.read_text(encoding="utf-8"))
                self.assertEqual(payload["project"], "TEST_PROJECT")
                self.assertEqual(payload["mode"], "thickness_from_pressure")
                self.assertIn("result", payload)


if __name__ == "__main__":
    unittest.main()


