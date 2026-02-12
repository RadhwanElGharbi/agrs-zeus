import sys
import unittest
from pathlib import Path
from unittest.mock import patch


class TestPirlCrossingsIntersectionPoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Ensure backend package imports work when running via unittest discovery
        sys.path.insert(0, "/opt/agrs/gui-v2/backend")

    def _compute(self, vector_features):
        from api import pirl

        # Simple route: horizontal line (0,0) -> (10,0)
        route_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {"type": "LineString", "coordinates": [[0, 0], [10, 0]]},
                }
            ],
        }

        layers = [
            {
                "category": "roads",
                "display_name": "roads_test",
                "file_path": "/dev/null",
                "metadata": {},
            }
        ]

        with patch("api.pirl._list_crossing_vector_layers", return_value=layers), patch(
            "api.data._load_vector_geojson",
            return_value={"type": "FeatureCollection", "features": vector_features},
        ):
            result = pirl._compute_route_crossings(
                project="TEST_PROJECT",
                project_path=Path("/tmp"),
                route_geojson=route_geojson,
                allow_categories={"roads"},
            )
        return result

    def test_point_intersection_emits_exact_point(self) -> None:
        # Vertical line crossing at (5,0)
        vector_features = [
            {
                "type": "Feature",
                "properties": {"name": "crossing_line"},
                "geometry": {"type": "LineString", "coordinates": [[5, -1], [5, 1]]},
            }
        ]

        out = self._compute(vector_features)
        crossings = out.get("crossings") or []
        self.assertEqual(len(crossings), 1)
        pt = crossings[0]["point"]
        self.assertAlmostEqual(pt[0], 5.0, places=6)
        self.assertAlmostEqual(pt[1], 0.0, places=6)
        self.assertEqual(crossings[0]["intersection"]["type"], "Point")

    def test_overlap_intersection_emits_boundary_endpoints(self) -> None:
        # Overlap segment between x=2..8 along y=0
        vector_features = [
            {
                "type": "Feature",
                "properties": {"name": "overlap"},
                "geometry": {"type": "LineString", "coordinates": [[2, 0], [8, 0]]},
            }
        ]

        out = self._compute(vector_features)
        crossings = out.get("crossings") or []
        self.assertEqual(len(crossings), 2)

        pts = {(round(c["point"][0], 6), round(c["point"][1], 6)) for c in crossings}
        self.assertEqual(pts, {(2.0, 0.0), (8.0, 0.0)})

        # Non-point intersection geometry should be preserved as a LineString
        for c in crossings:
            self.assertEqual(c["intersection"]["type"], "LineString")

    def test_polygon_intersection_emits_boundary_crossing_points(self) -> None:
        # Polygon that the route passes through: expect entry/exit points at x=4 and x=6.
        vector_features = [
            {
                "type": "Feature",
                "properties": {"name": "polygon"},
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [[4, -1], [6, -1], [6, 1], [4, 1], [4, -1]]
                    ],
                },
            }
        ]

        out = self._compute(vector_features)
        crossings = out.get("crossings") or []
        self.assertEqual(len(crossings), 2)

        pts = {(round(c["point"][0], 6), round(c["point"][1], 6)) for c in crossings}
        self.assertEqual(pts, {(4.0, 0.0), (6.0, 0.0)})

        # Ensure we are not using a representative point (which would be around (5,0)).
        self.assertNotIn((5.0, 0.0), pts)


if __name__ == "__main__":
    unittest.main()
















