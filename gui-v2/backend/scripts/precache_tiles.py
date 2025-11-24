#!/usr/bin/env python3
"""
Pre-render raster or terrain tiles into the persistent cache.

Usage:
  python scripts/precache_tiles.py --project test_project2 --layer soil --min-zoom 8 --max-zoom 12
  python scripts/precache_tiles.py --project test_project2 --layer dem --min-zoom 8 --max-zoom 12 --terrain
"""

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.data import precache_tiles  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pre-render raster/terrain tiles into the cache.")
    parser.add_argument("--project", required=True, help="Project folder name (e.g., test_project2)")
    parser.add_argument("--layer", required=True, help="Raster layer name (without .tif)")
    parser.add_argument("--min-zoom", type=int, required=True, help="Minimum zoom level (inclusive)")
    parser.add_argument("--max-zoom", type=int, required=True, help="Maximum zoom level (inclusive)")
    parser.add_argument("--terrain", action="store_true", help="Render as terrain (Mapbox Terrain-RGB)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    precache_tiles(
        project=args.project,
        layer=args.layer,
        min_zoom=args.min_zoom,
        max_zoom=args.max_zoom,
        terrain=args.terrain,
    )


if __name__ == "__main__":
    main()

