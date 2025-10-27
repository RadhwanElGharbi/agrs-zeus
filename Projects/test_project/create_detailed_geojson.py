#!/usr/bin/env python3
"""
Create detailed GeoJSON with full segment attributes from analysis
"""

import json
import sys
from pathlib import Path
from osgeo import ogr, osr

def create_detailed_geojson(analysis_file, route_file, output_file):
    """Create GeoJSON with detailed segment attributes"""
    
    # Load analysis
    with open(analysis_file) as f:
        analysis = json.load(f)
        
    segments = analysis['segments']
    summary = analysis['route_summary']
    
    print(f"📊 Creating detailed GeoJSON with {len(segments)} segments...")
    
    # Create driver
    driver = ogr.GetDriverByName('GeoJSON')
    
    # Create output datasource
    if Path(output_file).exists():
        driver.DeleteDataSource(str(output_file))
        
    ds = driver.CreateDataSource(str(output_file))
    
    # Create SRS (UTM Zone 33N)
    srs = osr.SpatialReference()
    srs.ImportFromEPSG(32633)
    
    # Create layer
    layer = ds.CreateLayer('route_segments', srs, ogr.wkbLineString)
    
    # Create fields (10-section detailed schema)
    fields = [
        # Identification
        ('seg_id', ogr.OFTInteger),
        ('route_name', ogr.OFTString),
        
        # Geometry
        ('start_x', ogr.OFTReal),
        ('start_y', ogr.OFTReal),
        ('end_x', ogr.OFTReal),
        ('end_y', ogr.OFTReal),
        ('length_m', ogr.OFTReal),
        ('azimuth_deg', ogr.OFTReal),
        
        # Elevation & Terrain
        ('elev_start', ogr.OFTReal),
        ('elev_end', ogr.OFTReal),
        ('elev_change', ogr.OFTReal),
        ('slope_deg', ogr.OFTReal),
        ('terrain', ogr.OFTString),
        ('landcover', ogr.OFTInteger),
        
        # Crossings
        ('road_cross', ogr.OFTInteger),
        ('water_cross', ogr.OFTInteger),
        ('rail_cross', ogr.OFTInteger),
        ('power_cross', ogr.OFTInteger),
        
        # Construction
        ('const_method', ogr.OFTString),
        ('trench_depth', ogr.OFTReal),
        ('pipe_diam_in', ogr.OFTReal),
        ('coating_type', ogr.OFTString),
        
        # Costs
        ('linear_cost', ogr.OFTReal),
        ('cross_cost', ogr.OFTReal),
        ('total_cost', ogr.OFTReal),
        ('cost_per_m', ogr.OFTReal),
        ('terrain_mult', ogr.OFTReal),
        ('slope_mult', ogr.OFTReal),
        
        # Engineering
        ('bend_angle', ogr.OFTReal),
        ('curvature', ogr.OFTReal),
        ('soil_type', ogr.OFTString),
        ('rock_pct', ogr.OFTReal),
        
        # Environmental
        ('env_class', ogr.OFTString),
        ('protected', ogr.OFTInteger),
        ('wetland', ogr.OFTInteger),
        
        # Regulatory
        ('permit_type', ogr.OFTString),
        ('row_width_m', ogr.OFTReal),
        ('access_road', ogr.OFTInteger),
        
        # Schedule
        ('duration_days', ogr.OFTReal),
        ('crew_size', ogr.OFTInteger),
        ('season', ogr.OFTString)
    ]
    
    for field_name, field_type in fields:
        field_defn = ogr.FieldDefn(field_name, field_type)
        if field_type == ogr.OFTReal:
            field_defn.SetWidth(12)
            field_defn.SetPrecision(2)
        layer.CreateField(field_defn)
        
    # Create features
    for seg in segments:
        feature = ogr.Feature(layer.GetLayerDefn())
        
        # Create geometry
        line = ogr.Geometry(ogr.wkbLineString)
        line.AddPoint(seg['start_x'], seg['start_y'])
        line.AddPoint(seg['end_x'], seg['end_y'])
        feature.SetGeometry(line)
        
        # Set basic attributes
        feature.SetField('seg_id', seg['segment_id'])
        feature.SetField('route_name', 'PIRL_Optimal_Route')
        feature.SetField('start_x', seg['start_x'])
        feature.SetField('start_y', seg['start_y'])
        feature.SetField('end_x', seg['end_x'])
        feature.SetField('end_y', seg['end_y'])
        feature.SetField('length_m', seg['length_m'])
        
        # Elevation
        feature.SetField('elev_start', seg['elevation_start_m'])
        feature.SetField('elev_end', seg['elevation_end_m'])
        feature.SetField('elev_change', seg['elevation_change_m'])
        feature.SetField('slope_deg', seg['slope_deg'])
        feature.SetField('terrain', seg['terrain_class'])
        feature.SetField('landcover', seg['landcover_class'])
        
        # Crossings
        feature.SetField('road_cross', seg['road_crossings'])
        feature.SetField('water_cross', seg['waterway_crossings'])
        feature.SetField('rail_cross', seg['railway_crossings'])
        feature.SetField('power_cross', seg['power_crossings'])
        
        # Construction
        feature.SetField('const_method', seg['construction_method'])
        feature.SetField('trench_depth', 2.5)  # meters - standard depth
        feature.SetField('pipe_diam_in', 24.0)  # 24" pipe
        feature.SetField('coating_type', '3LPE')  # 3-Layer Polyethylene
        
        # Costs
        feature.SetField('linear_cost', seg['linear_cost_usd'])
        feature.SetField('cross_cost', seg['crossing_costs_usd'])
        feature.SetField('total_cost', seg['total_cost_usd'])
        feature.SetField('cost_per_m', seg['cost_per_m_usd'])
        feature.SetField('terrain_mult', seg['terrain_multiplier'])
        feature.SetField('slope_mult', seg['slope_multiplier'])
        
        # Engineering (calculated)
        feature.SetField('bend_angle', 0.0)  # TODO: Calculate from segments
        feature.SetField('curvature', 0.0)
        feature.SetField('soil_type', 'medium')
        feature.SetField('rock_pct', min(seg['slope_deg'] * 2, 100))
        
        # Environmental
        if seg['landcover_class'] in [10, 20]:  # Tree cover
            env_class = 'forest'
        elif seg['landcover_class'] in [30, 40]:  # Shrubs, grassland
            env_class = 'grassland'
        elif seg['landcover_class'] in [50]:  # Cropland
            env_class = 'agricultural'
        elif seg['landcover_class'] in [60, 70, 80, 90]:  # Urban, barren, water, wetland
            env_class = 'other'
        else:
            env_class = 'unknown'
            
        feature.SetField('env_class', env_class)
        feature.SetField('protected', 0)
        feature.SetField('wetland', 0)
        
        # Regulatory
        permit_type = 'federal' if seg['waterway_crossings'] + seg['railway_crossings'] > 0 else 'local'
        feature.SetField('permit_type', permit_type)
        feature.SetField('row_width_m', 30.0)  # Standard ROW width
        feature.SetField('access_road', 1 if seg['road_crossings'] > 0 else 0)
        
        # Schedule (estimated)
        # Base: 100m/day for open trench, 50m/day for HDD
        if seg['construction_method'] == 'open_trench':
            rate = 100.0
        else:
            rate = 50.0
            
        duration = seg['length_m'] / rate
        feature.SetField('duration_days', round(duration, 2))
        feature.SetField('crew_size', 15)  # Standard crew
        feature.SetField('season', 'summer')  # Optimal season
        
        layer.CreateFeature(feature)
        feature = None
        
    ds = None
    
    print(f"✅ Detailed GeoJSON created: {output_file}")
    print(f"   {len(segments)} segments with full attributes")
    
    return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python create_detailed_geojson.py <analysis_json>")
        return 1
        
    analysis_file = Path(sys.argv[1])
    if not analysis_file.exists():
        print(f"❌ Analysis file not found: {analysis_file}")
        return 1
        
    route_file = analysis_file.parent / "pirl_route.geojson"
    output_file = analysis_file.parent / "pirl_route_detailed.geojson"
    
    success = create_detailed_geojson(analysis_file, route_file, output_file)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())

