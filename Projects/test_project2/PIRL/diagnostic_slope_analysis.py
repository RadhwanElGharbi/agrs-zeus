#!/usr/bin/env python3
"""
PIRL Diagnostic: Slope Analysis
Analyzes terrain slope profile from start to goal to verify 20% constraint is achievable.
"""

import sys
import numpy as np
import matplotlib.pyplot as plt
from osgeo import gdal, osr
import yaml

def load_config(config_path):
    """Load project configuration."""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)

def sample_dem_slope(dem_path, points_utm, epsg_code=32633):
    """Sample DEM elevations and calculate slopes."""
    # Open DEM
    dem_ds = gdal.Open(dem_path, gdal.GA_ReadOnly)
    if not dem_ds:
        raise FileNotFoundError(f"Could not open DEM: {dem_path}")
    
    dem_band = dem_ds.GetRasterBand(1)
    geotransform = dem_ds.GetGeoTransform()
    
    # Sample elevations
    elevations = []
    for x, y in points_utm:
        # Convert UTM to pixel coordinates
        px = int((x - geotransform[0]) / geotransform[1])
        py = int((y - geotransform[3]) / geotransform[5])
        
        # Check bounds
        if 0 <= px < dem_ds.RasterXSize and 0 <= py < dem_ds.RasterYSize:
            # Read single pixel value using RasterIO
            elev_data = dem_band.ReadRaster(px, py, 1, 1, buf_type=gdal.GDT_Float32)
            if elev_data:
                import struct
                elev = struct.unpack('f', elev_data)[0]
                elevations.append(float(elev))
            else:
                elevations.append(np.nan)
        else:
            elevations.append(np.nan)
    
    dem_ds = None
    
    # Calculate slopes using Horn's method (3x3 kernel)
    slopes = []
    cell_size = abs(geotransform[1])  # meters
    
    for i, (x, y) in enumerate(points_utm):
        if np.isnan(elevations[i]):
            slopes.append(np.nan)
            continue
        
        # Sample 3x3 neighborhood
        dem_ds = gdal.Open(dem_path, gdal.GA_ReadOnly)
        dem_band = dem_ds.GetRasterBand(1)
        
        px = int((x - geotransform[0]) / geotransform[1])
        py = int((y - geotransform[3]) / geotransform[5])
        
        # Read 3x3 window
        try:
            import struct
            window_data = dem_band.ReadRaster(px-1, py-1, 3, 3, buf_type=gdal.GDT_Float32)
            if window_data and len(window_data) == 36:  # 9 floats * 4 bytes
                window = struct.unpack('9f', window_data)
                # Horn gradient (window is flattened row-major)
                z1, z2, z3, z4, z5, z6, z7, z8, z9 = window
                dzdx = ((z3 + 2*z6 + z9) - (z1 + 2*z4 + z7)) / (8 * cell_size)
                dzdy = ((z7 + 2*z8 + z9) - (z1 + 2*z2 + z3)) / (8 * cell_size)
                
                gradient = np.sqrt(dzdx**2 + dzdy**2)
                slope_percent = gradient * 100.0
                slopes.append(slope_percent)
            else:
                slopes.append(np.nan)
        except Exception as e:
            slopes.append(np.nan)
        
        dem_ds = None
    
    return elevations, slopes

def main():
    print("=" * 80)
    print("PIRL DIAGNOSTIC: SLOPE ANALYSIS")
    print("=" * 80)
    
    # Load configuration
    config_path = sys.argv[1] if len(sys.argv) > 1 else 'pirl_training_config_production.yaml'
    print(f"\nLoading config: {config_path}")
    config = load_config(config_path)
    
    # Extract coordinates
    start_x = config['start_x']
    start_y = config['start_y']
    end_x = config['end_x']
    end_y = config['end_y']
    epsg_code = config['epsg_code']
    
    print(f"\nStart: ({start_x:.1f}, {start_y:.1f})")
    print(f"End:   ({end_x:.1f}, {end_y:.1f})")
    
    # Calculate straight-line distance
    distance = np.sqrt((end_x - start_x)**2 + (end_y - start_y)**2)
    print(f"Straight-line distance: {distance:.1f} m ({distance/1000:.2f} km)")
    
    # Generate sample points along straight line
    num_samples = 200
    t = np.linspace(0, 1, num_samples)
    sample_x = start_x + t * (end_x - start_x)
    sample_y = start_y + t * (end_y - start_y)
    points_utm = list(zip(sample_x, sample_y))
    
    # Sample DEM
    dem_path = f"{config['project_dir']}/data/rasters/dem.tif"
    print(f"\nSampling DEM: {dem_path}")
    
    try:
        elevations, slopes = sample_dem_slope(dem_path, points_utm, epsg_code)
    except Exception as e:
        print(f"❌ Error sampling DEM: {e}")
        return 1
    
    # Filter out NaN values
    valid_mask = ~np.isnan(slopes)
    valid_slopes = np.array(slopes)[valid_mask]
    valid_elevations = np.array(elevations)[valid_mask]
    
    if len(valid_slopes) == 0:
        print("❌ No valid slope samples!")
        return 1
    
    # Statistics
    print("\n" + "=" * 80)
    print("SLOPE STATISTICS")
    print("=" * 80)
    print(f"Valid samples: {len(valid_slopes)}/{num_samples}")
    print(f"\nSlope (%):")
    print(f"  Min:    {np.min(valid_slopes):.2f}%")
    print(f"  Mean:   {np.mean(valid_slopes):.2f}%")
    print(f"  Median: {np.median(valid_slopes):.2f}%")
    print(f"  Max:    {np.max(valid_slopes):.2f}%")
    print(f"  Std:    {np.std(valid_slopes):.2f}%")
    
    print(f"\nPercentiles:")
    for p in [25, 50, 75, 90, 95, 99]:
        print(f"  {p}th: {np.percentile(valid_slopes, p):.2f}%")
    
    # Check constraint
    max_slope_constraint = config['constraints']['max_slope_percent']
    violations = valid_slopes > max_slope_constraint
    num_violations = np.sum(violations)
    pct_violations = (num_violations / len(valid_slopes)) * 100
    
    print(f"\n20% Slope Constraint Analysis:")
    print(f"  Constraint: {max_slope_constraint}%")
    print(f"  Violations: {num_violations}/{len(valid_slopes)} ({pct_violations:.1f}%)")
    print(f"  Max violation: {np.max(valid_slopes):.2f}%")
    
    if pct_violations > 50:
        print(f"\n⚠️  WARNING: {pct_violations:.1f}% of straight-line path violates 20% constraint")
        print("   Agent will need to find alternative route")
    elif pct_violations > 10:
        print(f"\n⚠️  CAUTION: {pct_violations:.1f}% of path has >20% slope")
        print("   Detours will be necessary")
    else:
        print(f"\n✅ GOOD: Only {pct_violations:.1f}% of path exceeds 20% slope")
        print("   Constraint appears achievable")
    
    # Elevation profile
    print(f"\nElevation (m):")
    print(f"  Start: {valid_elevations[0]:.1f} m")
    print(f"  End:   {valid_elevations[-1]:.1f} m")
    print(f"  Min:   {np.min(valid_elevations):.1f} m")
    print(f"  Max:   {np.max(valid_elevations):.1f} m")
    print(f"  Range: {np.max(valid_elevations) - np.min(valid_elevations):.1f} m")
    
    # Generate visualization
    print("\nGenerating visualization...")
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 8))
    
    # Elevation profile
    distances_km = np.linspace(0, distance/1000, len(valid_elevations))
    ax1.plot(distances_km, valid_elevations, 'b-', linewidth=1.5)
    ax1.set_xlabel('Distance (km)')
    ax1.set_ylabel('Elevation (m)')
    ax1.set_title('Elevation Profile: Start → Goal (Straight Line)')
    ax1.grid(True, alpha=0.3)
    
    # Slope profile
    ax2.plot(distances_km, valid_slopes, 'g-', linewidth=1.5, label='Slope')
    ax2.axhline(y=20, color='r', linestyle='--', linewidth=2, label='20% Constraint')
    ax2.fill_between(distances_km, 0, valid_slopes, 
                     where=(valid_slopes > 20), color='red', alpha=0.3, label='Violations')
    ax2.set_xlabel('Distance (km)')
    ax2.set_ylabel('Slope (%)')
    ax2.set_title('Slope Profile Along Route')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_path = 'slope_analysis_profile.png'
    plt.savefig(output_path, dpi=150)
    print(f"✅ Saved visualization: {output_path}")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    if np.max(valid_slopes) <= max_slope_constraint:
        print("✅ PASS: All slopes along straight line are ≤20%")
        print("   Goal is directly reachable without slope violations")
        return 0
    elif pct_violations < 10:
        print("⚠️  MARGINAL: Some slopes >20% but mostly achievable")
        print("   Agent should be able to route around problem areas")
        return 0
    else:
        print("❌ CONCERN: Significant portions have >20% slope")
        print("   Agent will need substantial detours")
        print("   Consider if 20% constraint is realistic for this terrain")
        return 0  # Not a failure, just flagging concern
    
if __name__ == "__main__":
    sys.exit(main())

