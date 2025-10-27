#!/usr/bin/env python3
"""
PIRL Route Post-Processor
Analyzes route and generates detailed segment attributes with cost calculations
"""

import json
import math
import sys
from pathlib import Path
from osgeo import gdal, ogr, osr
import numpy as np

# Enable GDAL exceptions
gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()

class RouteProcessor:
    def __init__(self, project_dir):
        self.project_dir = Path(project_dir)
        self.data_dir = self.project_dir / "data"
        
        # Load datasets
        self.dem = None
        self.slope = None
        self.landcover = None
        self.soil = None
        
        # Load vectors
        self.roads = []
        self.waterways = []
        self.railways = []
        self.power_lines = []
        self.protected_areas = []
        
        print("📊 Loading GIS datasets...")
        self.load_datasets()
        
    def load_datasets(self):
        """Load all GIS datasets"""
        # Rasters
        dem_path = self.data_dir / "rasters" / "dem.tif"
        if dem_path.exists():
            self.dem = gdal.Open(str(dem_path))
            print(f"  ✅ DEM loaded: {dem_path.name}")
            
        slope_path = self.data_dir / "rasters" / "slope.tif"
        if slope_path.exists():
            self.slope = gdal.Open(str(slope_path))
            print(f"  ✅ Slope loaded: {slope_path.name}")
            
        landcover_path = self.data_dir / "rasters" / "landcover.tif"
        if landcover_path.exists():
            self.landcover = gdal.Open(str(landcover_path))
            print(f"  ✅ Land cover loaded: {landcover_path.name}")
            
        soil_path = self.data_dir / "rasters" / "soil.tif"
        if soil_path.exists():
            self.soil = gdal.Open(str(soil_path))
            print(f"  ✅ Soil loaded: {soil_path.name}")
        
        # Vectors
        vectors_dir = self.data_dir / "vectors"
        
        # Load roads
        for road_file in vectors_dir.glob("*road*.gpkg"):
            ds = ogr.Open(str(road_file))
            if ds:
                self.roads.append(ds)
                print(f"  ✅ Roads loaded: {road_file.name}")
                
        # Load waterways
        for water_file in vectors_dir.glob("*water*.gpkg"):
            ds = ogr.Open(str(water_file))
            if ds:
                self.waterways.append(ds)
                print(f"  ✅ Waterways loaded: {water_file.name}")
                
        # Load railways
        for rail_file in vectors_dir.glob("*rail*.gpkg"):
            ds = ogr.Open(str(rail_file))
            if ds:
                self.railways.append(ds)
                print(f"  ✅ Railways loaded: {rail_file.name}")
                
        # Load power lines
        for power_file in vectors_dir.glob("*power*.gpkg"):
            ds = ogr.Open(str(power_file))
            if ds:
                self.power_lines.append(ds)
                print(f"  ✅ Power lines loaded: {power_file.name}")
                
    def sample_raster(self, dataset, x, y):
        """Sample raster value at given coordinates"""
        if not dataset:
            return 0.0
            
        gt = dataset.GetGeoTransform()
        inv_gt = gdal.InvGeoTransform(gt)
        px, py = gdal.ApplyGeoTransform(inv_gt, x, y)
        
        px, py = int(px), int(py)
        
        if px < 0 or py < 0 or px >= dataset.RasterXSize or py >= dataset.RasterYSize:
            return 0.0
            
        band = dataset.GetRasterBand(1)
        value = band.ReadAsArray(px, py, 1, 1)
        
        return float(value[0, 0]) if value is not None else 0.0
        
    def detect_crossings(self, segment_geom, datasets):
        """Detect if segment crosses any linear features"""
        crossings = {
            'roads': 0,
            'waterways': 0,
            'railways': 0,
            'power_lines': 0
        }
        
        # Check each dataset
        for ds in self.roads:
            layer = ds.GetLayer(0)
            layer.SetSpatialFilter(segment_geom)
            crossings['roads'] += layer.GetFeatureCount()
            layer.SetSpatialFilter(None)
            
        for ds in self.waterways:
            layer = ds.GetLayer(0)
            layer.SetSpatialFilter(segment_geom)
            crossings['waterways'] += layer.GetFeatureCount()
            layer.SetSpatialFilter(None)
            
        for ds in self.railways:
            layer = ds.GetLayer(0)
            layer.SetSpatialFilter(segment_geom)
            crossings['railways'] += layer.GetFeatureCount()
            layer.SetSpatialFilter(None)
            
        for ds in self.power_lines:
            layer = ds.GetLayer(0)
            layer.SetSpatialFilter(segment_geom)
            crossings['power_lines'] += layer.GetFeatureCount()
            layer.SetSpatialFilter(None)
            
        return crossings
        
    def calculate_segment_cost(self, segment):
        """Calculate detailed cost for a segment"""
        # Segment properties
        length_m = segment['length_m']
        slope_deg = segment['slope_deg']
        terrain_class = segment['terrain_class']
        
        # Base cost per meter ($/m)
        base_cost_per_m = 500.0  # $500/m for standard pipeline
        
        # Terrain difficulty multiplier
        terrain_multipliers = {
            'flat': 1.0,
            'rolling': 1.2,
            'hilly': 1.5,
            'mountainous': 2.0,
            'steep': 2.5
        }
        
        terrain_mult = terrain_multipliers.get(terrain_class, 1.2)
        
        # Slope adjustment
        if slope_deg < 10:
            slope_mult = 1.0
        elif slope_deg < 20:
            slope_mult = 1.3
        elif slope_deg < 30:
            slope_mult = 1.7
        else:
            slope_mult = 2.2
            
        # Construction method
        if slope_deg < 15 and terrain_class in ['flat', 'rolling']:
            construction_method = 'open_trench'
            method_mult = 1.0
        elif slope_deg < 25:
            construction_method = 'directional_drill'
            method_mult = 1.5
        else:
            construction_method = 'horizontal_drill'
            method_mult = 2.0
            
        # Crossing costs
        crossing_costs = 0.0
        if segment['road_crossings'] > 0:
            crossing_costs += segment['road_crossings'] * 50000  # $50k per road crossing
        if segment['waterway_crossings'] > 0:
            crossing_costs += segment['waterway_crossings'] * 150000  # $150k per waterway
        if segment['railway_crossings'] > 0:
            crossing_costs += segment['railway_crossings'] * 200000  # $200k per railway
        if segment['power_crossings'] > 0:
            crossing_costs += segment['power_crossings'] * 75000  # $75k per power line
            
        # Calculate total segment cost
        linear_cost = length_m * base_cost_per_m * terrain_mult * slope_mult * method_mult
        total_cost = linear_cost + crossing_costs
        
        return {
            'linear_cost_usd': round(linear_cost, 2),
            'crossing_costs_usd': round(crossing_costs, 2),
            'total_cost_usd': round(total_cost, 2),
            'cost_per_m_usd': round(total_cost / length_m, 2),
            'construction_method': construction_method,
            'terrain_multiplier': terrain_mult,
            'slope_multiplier': slope_mult
        }
        
    def classify_terrain(self, slope_deg):
        """Classify terrain based on slope"""
        if slope_deg < 5:
            return 'flat'
        elif slope_deg < 15:
            return 'rolling'
        elif slope_deg < 25:
            return 'hilly'
        elif slope_deg < 35:
            return 'mountainous'
        else:
            return 'steep'
            
    def process_route(self, route_file, output_file):
        """Process route and generate detailed attributes"""
        print(f"\n🔍 Processing route: {route_file}")
        
        # Load route
        ds = ogr.Open(str(route_file))
        if not ds:
            print(f"❌ Failed to open route file")
            return False
            
        layer = ds.GetLayer(0)
        feature = layer.GetNextFeature()
        
        if not feature:
            print(f"❌ No features in route file")
            return False
            
        geom = feature.GetGeometryRef()
        
        if geom.GetGeometryType() != ogr.wkbLineString:
            print(f"❌ Route must be a LineString")
            return False
            
        # Extract points
        points = []
        for i in range(geom.GetPointCount()):
            x, y = geom.GetPoint(i)[:2]
            points.append((x, y))
            
        print(f"  📍 Route has {len(points)} points")
        
        # Create segments
        segments = []
        total_cost = 0.0
        
        print(f"  🔄 Analyzing {len(points)-1} segments...")
        
        for i in range(len(points) - 1):
            x1, y1 = points[i]
            x2, y2 = points[i + 1]
            
            # Calculate segment properties
            length_m = math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
            
            # Sample terrain data at midpoint
            mid_x = (x1 + x2) / 2
            mid_y = (y1 + y2) / 2
            
            elevation_start = self.sample_raster(self.dem, x1, y1)
            elevation_end = self.sample_raster(self.dem, x2, y2)
            slope_deg = self.sample_raster(self.slope, mid_x, mid_y)
            
            landcover_class = int(self.sample_raster(self.landcover, mid_x, mid_y))
            
            # Create segment geometry for crossing detection
            segment_line = ogr.Geometry(ogr.wkbLineString)
            segment_line.AddPoint(x1, y1)
            segment_line.AddPoint(x2, y2)
            
            # Detect crossings
            crossings = self.detect_crossings(segment_line, [])
            
            # Classify terrain
            terrain_class = self.classify_terrain(slope_deg)
            
            # Create segment data
            segment = {
                'segment_id': i + 1,
                'start_x': round(x1, 2),
                'start_y': round(y1, 2),
                'end_x': round(x2, 2),
                'end_y': round(y2, 2),
                'length_m': round(length_m, 2),
                'elevation_start_m': round(elevation_start, 2),
                'elevation_end_m': round(elevation_end, 2),
                'elevation_change_m': round(elevation_end - elevation_start, 2),
                'slope_deg': round(slope_deg, 2),
                'terrain_class': terrain_class,
                'landcover_class': landcover_class,
                'road_crossings': crossings['roads'],
                'waterway_crossings': crossings['waterways'],
                'railway_crossings': crossings['railways'],
                'power_crossings': crossings['power_lines']
            }
            
            # Calculate costs
            cost_data = self.calculate_segment_cost(segment)
            segment.update(cost_data)
            
            segments.append(segment)
            total_cost += segment['total_cost_usd']
            
        print(f"  ✅ Processed {len(segments)} segments")
        print(f"  💰 Total cost: ${total_cost:,.2f}")
        
        # Calculate statistics
        total_length = sum(s['length_m'] for s in segments)
        total_crossings = {
            'roads': sum(s['road_crossings'] for s in segments),
            'waterways': sum(s['waterway_crossings'] for s in segments),
            'railways': sum(s['railway_crossings'] for s in segments),
            'power_lines': sum(s['power_crossings'] for s in segments)
        }
        
        # Create output
        output = {
            'route_summary': {
                'total_length_m': round(total_length, 2),
                'total_length_km': round(total_length / 1000, 2),
                'total_cost_usd': round(total_cost, 2),
                'cost_per_km_usd': round(total_cost / (total_length / 1000), 2),
                'num_segments': len(segments),
                'crossings': total_crossings
            },
            'segments': segments
        }
        
        # Write output
        with open(output_file, 'w') as f:
            json.dump(output, f, indent=2)
            
        print(f"\n✅ Detailed route analysis saved to: {output_file}")
        print(f"\n📊 Summary:")
        print(f"   Total Length: {output['route_summary']['total_length_km']} km")
        print(f"   Total Cost: ${output['route_summary']['total_cost_usd']:,.0f}")
        print(f"   Cost per km: ${output['route_summary']['cost_per_km_usd']:,.0f}/km")
        print(f"   Segments: {len(segments)}")
        print(f"   Crossings: {total_crossings['roads']} roads, {total_crossings['waterways']} waterways, {total_crossings['railways']} railways, {total_crossings['power_lines']} power lines")
        
        return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python process_route_detailed.py <route_geojson>")
        return 1
        
    route_file = Path(sys.argv[1])
    if not route_file.exists():
        print(f"❌ Route file not found: {route_file}")
        return 1
        
    # Determine project directory
    project_dir = Path("/opt/agrs/Projects/test_project")
    
    # Output file
    output_file = route_file.parent / "route_detailed_analysis.json"
    
    # Process
    processor = RouteProcessor(project_dir)
    success = processor.process_route(route_file, output_file)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())

