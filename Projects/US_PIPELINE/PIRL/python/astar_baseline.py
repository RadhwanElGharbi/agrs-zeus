#!/usr/bin/env python3
"""
A* Baseline Route Generator for US_PIPELINE PIRL

Generates an optimal baseline route using A* pathfinding on the DEM.
Used as quality floor for RL route comparison.
"""

import argparse
import heapq
import json
import logging
import numpy as np
import yaml
from pathlib import Path
from datetime import datetime
from typing import Tuple, List, Dict, Optional

import rasterio
from rasterio.transform import rowcol, xy
from scipy.ndimage import sobel

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class AStarRouter:
    """A* pathfinding on DEM raster with slope-based costs."""
    
    def __init__(self, dem_path: str, aoi_path: Optional[str] = None):
        """
        Initialize router with DEM.
        
        Args:
            dem_path: Path to DEM GeoTIFF
            aoi_path: Optional path to AOI GeoPackage for boundary constraints
        """
        logger.info(f"Loading DEM: {dem_path}")
        with rasterio.open(dem_path) as src:
            self.dem = src.read(1)
            self.transform = src.transform
            self.crs = src.crs
            self.nodata = src.nodata
            self.res_x = src.res[0]
            self.res_y = abs(src.res[1])
        
        logger.info(f"DEM shape: {self.dem.shape}, resolution: {self.res_x:.1f}m x {self.res_y:.1f}m")
        
        # Compute slope grid
        logger.info("Computing slope grid...")
        self.slope = self._compute_slope()
        logger.info(f"Slope range: {np.nanmin(self.slope):.1f}% - {np.nanmax(self.slope):.1f}%")
        
        # Load AOI if provided
        self.aoi_mask = None
        if aoi_path:
            self._load_aoi(aoi_path)
    
    def _compute_slope(self) -> np.ndarray:
        """Compute slope percentage from DEM using Sobel filter."""
        # Handle nodata
        dem_filled = np.where(self.dem == self.nodata, np.nan, self.dem) if self.nodata else self.dem
        
        # Compute gradients
        dx = sobel(dem_filled, axis=1) / (8 * self.res_x)
        dy = sobel(dem_filled, axis=0) / (8 * self.res_y)
        
        # Slope as percentage
        slope_rad = np.arctan(np.sqrt(dx**2 + dy**2))
        slope_pct = np.tan(slope_rad) * 100
        
        return slope_pct
    
    def _load_aoi(self, aoi_path: str):
        """Load AOI boundary for masking."""
        try:
            import geopandas as gpd
            from rasterio.features import geometry_mask
            
            logger.info(f"Loading AOI: {aoi_path}")
            aoi = gpd.read_file(aoi_path)
            
            # Reproject if needed
            if aoi.crs != self.crs:
                aoi = aoi.to_crs(self.crs)
            
            # Create mask (True = outside AOI)
            self.aoi_mask = geometry_mask(
                aoi.geometry,
                out_shape=self.dem.shape,
                transform=self.transform,
                invert=False  # True = outside geometry
            )
            logger.info(f"AOI mask created: {np.sum(~self.aoi_mask)} valid cells")
        except Exception as e:
            logger.warning(f"Could not load AOI: {e}")
    
    def coord_to_pixel(self, x: float, y: float) -> Tuple[int, int]:
        """Convert UTM coordinates to pixel row, col."""
        row, col = rowcol(self.transform, x, y)
        return int(row), int(col)
    
    def pixel_to_coord(self, row: int, col: int) -> Tuple[float, float]:
        """Convert pixel row, col to UTM coordinates."""
        x, y = xy(self.transform, row, col)
        return x, y
    
    def get_neighbors(self, row: int, col: int) -> List[Tuple[int, int, float]]:
        """Get 8-connected neighbors with distances."""
        neighbors = []
        for dr in [-1, 0, 1]:
            for dc in [-1, 0, 1]:
                if dr == 0 and dc == 0:
                    continue
                nr, nc = row + dr, col + dc
                
                # Bounds check
                if 0 <= nr < self.dem.shape[0] and 0 <= nc < self.dem.shape[1]:
                    # Distance (diagonal = sqrt(2))
                    dist = np.sqrt(dr**2 + dc**2) * self.res_x
                    neighbors.append((nr, nc, dist))
        
        return neighbors
    
    def compute_cost(self, row: int, col: int, dist: float, 
                     slope_weight: float = 1.0, 
                     max_slope: float = 50.0) -> float:
        """
        Compute traversal cost for a cell.
        
        Cost = distance * (1 + slope_penalty)
        """
        # Check if valid cell
        if self.dem[row, col] == self.nodata if self.nodata else False:
            return float('inf')
        
        # Check AOI boundary
        if self.aoi_mask is not None and self.aoi_mask[row, col]:
            return float('inf')
        
        # Get slope
        slope = self.slope[row, col]
        if np.isnan(slope):
            return float('inf')
        
        # Hard constraint: reject if over max slope
        if slope > max_slope:
            return float('inf')
        
        # Slope penalty: exponential increase for steeper slopes
        slope_penalty = slope_weight * (slope / 10.0) ** 2
        
        return dist * (1.0 + slope_penalty)
    
    def heuristic(self, row: int, col: int, goal_row: int, goal_col: int) -> float:
        """Euclidean distance heuristic (admissible)."""
        dr = (goal_row - row) * self.res_y
        dc = (goal_col - col) * self.res_x
        return np.sqrt(dr**2 + dc**2)
    
    def find_path(self, start: Tuple[float, float], goal: Tuple[float, float],
                  slope_weight: float = 1.0, max_slope: float = 50.0) -> Optional[Dict]:
        """
        Find optimal path using A*.
        
        Args:
            start: (x, y) UTM coordinates
            goal: (x, y) UTM coordinates
            slope_weight: Weight for slope penalty in cost
            max_slope: Maximum allowed slope (hard constraint)
        
        Returns:
            Dict with route info or None if no path found
        """
        start_row, start_col = self.coord_to_pixel(start[0], start[1])
        goal_row, goal_col = self.coord_to_pixel(goal[0], goal[1])
        
        logger.info(f"Start pixel: ({start_row}, {start_col})")
        logger.info(f"Goal pixel: ({goal_row}, {goal_col})")
        
        # Priority queue: (f_score, g_score, row, col)
        open_set = [(0, 0, start_row, start_col)]
        came_from = {}
        g_score = {(start_row, start_col): 0}
        f_score = {(start_row, start_col): self.heuristic(start_row, start_col, goal_row, goal_col)}
        
        visited = set()
        iterations = 0
        max_iterations = self.dem.shape[0] * self.dem.shape[1] * 3
        
        logger.info("Starting A* search...")
        
        while open_set:
            iterations += 1
            if iterations % 10000 == 0:
                logger.info(f"  Iteration {iterations}, open set size: {len(open_set)}")
            
            if iterations > max_iterations:
                logger.error("Max iterations reached")
                return None
            
            _, current_g, current_row, current_col = heapq.heappop(open_set)
            current = (current_row, current_col)
            
            if current in visited:
                continue
            visited.add(current)
            
            # Goal check
            if current_row == goal_row and current_col == goal_col:
                logger.info(f"Path found! Iterations: {iterations}, visited: {len(visited)}")
                return self._reconstruct_path(came_from, current, start, goal)
            
            # Expand neighbors
            for nr, nc, dist in self.get_neighbors(current_row, current_col):
                neighbor = (nr, nc)
                if neighbor in visited:
                    continue
                
                cost = self.compute_cost(nr, nc, dist, slope_weight, max_slope)
                if cost == float('inf'):
                    continue
                
                tentative_g = g_score[current] + cost
                
                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f = tentative_g + self.heuristic(nr, nc, goal_row, goal_col)
                    f_score[neighbor] = f
                    heapq.heappush(open_set, (f, tentative_g, nr, nc))
        
        logger.error("No path found!")
        return None
    
    def _reconstruct_path(self, came_from: Dict, current: Tuple[int, int],
                          start: Tuple[float, float], goal: Tuple[float, float]) -> Dict:
        """Reconstruct path and compute statistics."""
        path_pixels = [current]
        while current in came_from:
            current = came_from[current]
            path_pixels.append(current)
        path_pixels.reverse()
        
        # Convert to coordinates and compute stats
        coordinates = []
        slopes = []
        elevations = []
        total_length = 0
        
        for i, (row, col) in enumerate(path_pixels):
            x, y = self.pixel_to_coord(row, col)
            coordinates.append([x, y])
            slopes.append(float(self.slope[row, col]))
            elevations.append(float(self.dem[row, col]))
            
            if i > 0:
                prev_row, prev_col = path_pixels[i-1]
                prev_x, prev_y = self.pixel_to_coord(prev_row, prev_col)
                segment_length = np.sqrt((x - prev_x)**2 + (y - prev_y)**2)
                total_length += segment_length
        
        # Compute straight-line distance
        straight_line = np.sqrt((goal[0] - start[0])**2 + (goal[1] - start[1])**2)
        
        return {
            'coordinates': coordinates,
            'total_length_m': total_length,
            'straight_line_m': straight_line,
            'length_efficiency': straight_line / total_length if total_length > 0 else 0,
            'num_points': len(coordinates),
            'slopes': slopes,
            'elevations': elevations,
            'avg_slope': np.mean(slopes),
            'max_slope': np.max(slopes),
            'min_elevation': np.min(elevations),
            'max_elevation': np.max(elevations),
            'elevation_gain': sum(max(0, elevations[i+1] - elevations[i]) for i in range(len(elevations)-1)),
        }


def generate_geojson(route: Dict, config: Dict, output_path: str):
    """Generate ArcGIS-compliant GeoJSON from A* route."""
    epsg = config.get('epsg_code', 32613)
    
    # Build segment features
    features = []
    coords = route['coordinates']
    
    for i in range(len(coords) - 1):
        feature = {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [coords[i], coords[i+1]]
            },
            "properties": {
                "segment_id": i + 1,
                "slope_percent": round(route['slopes'][i+1], 2),
                "elevation_start_m": round(route['elevations'][i], 2),
                "elevation_end_m": round(route['elevations'][i+1], 2),
            }
        }
        features.append(feature)
    
    # Full route feature
    full_route = {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coords
        },
        "properties": {
            "type": "full_route",
            "method": "A* baseline",
            "total_length_m": round(route['total_length_m'], 2),
            "straight_line_m": round(route['straight_line_m'], 2),
            "length_efficiency": round(route['length_efficiency'], 4),
            "num_segments": len(coords) - 1,
            "avg_slope_percent": round(route['avg_slope'], 2),
            "max_slope_percent": round(route['max_slope'], 2),
            "elevation_gain_m": round(route['elevation_gain'], 2),
            "generation_timestamp": datetime.now().isoformat(),
        }
    }
    features.insert(0, full_route)
    
    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": f"EPSG:{epsg}"}
        },
        "metadata": {
            "title": "A* Baseline Route",
            "description": "Optimal path using A* on slope-weighted DEM",
            "total_length_m": round(route['total_length_m'], 2),
            "avg_slope_percent": round(route['avg_slope'], 2),
            "max_slope_percent": round(route['max_slope'], 2),
        },
        "features": features
    }
    
    with open(output_path, 'w') as f:
        json.dump(geojson, f, indent=2)
    
    logger.info(f"GeoJSON saved: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Generate A* baseline route")
    parser.add_argument("--config", required=True, help="Path to training config YAML")
    parser.add_argument("--output", default="astar_baseline.geojson", help="Output GeoJSON path")
    parser.add_argument("--slope-weight", type=float, default=1.0, help="Slope penalty weight")
    parser.add_argument("--max-slope", type=float, default=50.0, help="Maximum allowed slope")
    
    args = parser.parse_args()
    
    # Load config
    with open(args.config) as f:
        config = yaml.safe_load(f)
    
    # Paths
    project_dir = Path(config['project_dir'])
    dem_path = project_dir / "data" / "rasters" / "dem.tif"
    aoi_path = project_dir / "aoi" / "aoi.gpkg"
    
    # Start/goal
    start = (config['start_point']['x'], config['start_point']['y'])
    goal = (config['end_point']['x'], config['end_point']['y'])
    
    logger.info("=" * 60)
    logger.info("A* Baseline Route Generator")
    logger.info("=" * 60)
    logger.info(f"Start: {start}")
    logger.info(f"Goal:  {goal}")
    logger.info(f"DEM:   {dem_path}")
    logger.info(f"AOI:   {aoi_path}")
    logger.info("=" * 60)
    
    # Create router
    router = AStarRouter(str(dem_path), str(aoi_path) if aoi_path.exists() else None)
    
    # Find path
    route = router.find_path(start, goal, args.slope_weight, args.max_slope)
    
    if route:
        logger.info("\n" + "=" * 60)
        logger.info("ROUTE STATISTICS")
        logger.info("=" * 60)
        logger.info(f"Total Length:      {route['total_length_m']:.1f} m ({route['total_length_m']/1000:.2f} km)")
        logger.info(f"Straight Line:     {route['straight_line_m']:.1f} m ({route['straight_line_m']/1000:.2f} km)")
        logger.info(f"Efficiency:        {route['length_efficiency']*100:.1f}%")
        logger.info(f"Segments:          {route['num_points'] - 1}")
        logger.info(f"Average Slope:     {route['avg_slope']:.1f}%")
        logger.info(f"Maximum Slope:     {route['max_slope']:.1f}%")
        logger.info(f"Elevation Gain:    {route['elevation_gain']:.1f} m")
        logger.info("=" * 60)
        
        # Generate GeoJSON
        generate_geojson(route, config, args.output)
        
        # Print comparison info
        print(f"\n✅ A* baseline generated: {args.output}")
        print(f"   Length: {route['total_length_m']/1000:.2f} km")
        print(f"   Avg slope: {route['avg_slope']:.1f}%")
        print(f"   Max slope: {route['max_slope']:.1f}%")
    else:
        print("\n❌ No path found!")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
