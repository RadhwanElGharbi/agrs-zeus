#!/usr/bin/env python3
"""
Extract sea polygon from ESA WorldCover land cover data.
The largest water polygon is assumed to be the sea/ocean.
"""

import rasterio
import rasterio.features
from shapely.geometry import shape
import geopandas as gpd
import sys
import argparse

def extract_sea_polygon(landcover_path, output_path, min_area_km2=1.0):
    """
    Extract largest water polygon from land cover raster.
    
    Args:
        landcover_path: Path to land cover GeoTIFF
        output_path: Output path for sea polygon GeoPackage
        min_area_km2: Minimum area to consider as sea (default 1 km²)
    
    Returns:
        True if sea polygon found and saved, False otherwise
    """
    print(f"🌊 Extracting sea polygon from: {landcover_path}")
    
    with rasterio.open(landcover_path) as src:
        # Read land cover data
        landcover = src.read(1)
        transform = src.transform
        crs = src.crs
        
        print(f"   Raster size: {src.width} x {src.height}")
        print(f"   CRS: {crs}")
        
        # Create mask for water bodies (LC=80)
        water_mask = (landcover == 80).astype('uint8')
        water_pixel_count = (water_mask == 1).sum()
        pixel_area_m2 = abs(transform[0] * transform[4])  # pixel width * height
        
        print(f"   Water pixels: {water_pixel_count:,}")
        print(f"   Total water area: {water_pixel_count * pixel_area_m2 / 1_000_000:.2f} km²")
        
        # Extract water polygons
        print(f"   Extracting water polygons...")
        water_shapes = []
        for geom, value in rasterio.features.shapes(water_mask, transform=transform):
            if value == 1:  # Water
                poly = shape(geom)
                # Only keep polygons larger than 10,000 m² (0.01 km²)
                if poly.area > 10000:
                    water_shapes.append(poly)
        
        print(f"   Found {len(water_shapes)} water polygons (>0.01 km²)")
        
        if not water_shapes:
            print("   ⚠️  No significant water bodies found")
            return False
        
        # Find largest polygon
        water_shapes.sort(key=lambda p: p.area, reverse=True)
        
        # Show top 5 largest
        print(f"\n   Top 5 largest water bodies:")
        for i, poly in enumerate(water_shapes[:5], 1):
            area_km2 = poly.area / 1_000_000
            print(f"      {i}. {area_km2:.2f} km²")
        
        largest_poly = water_shapes[0]
        largest_area_km2 = largest_poly.area / 1_000_000
        
        if largest_area_km2 < min_area_km2:
            print(f"\n   ℹ️  Largest water body ({largest_area_km2:.2f} km²) < {min_area_km2} km² threshold")
            print(f"      This appears to be an inland project (no sea)")
            return False
        
        # Save as GeoPackage
        gdf = gpd.GeoDataFrame(
            {
                'type': ['sea'],
                'area_km2': [largest_area_km2],
                'exclusion_zone_m': [1000]
            },
            geometry=[largest_poly],
            crs=crs
        )
        
        gdf.to_file(output_path, driver='GPKG', layer='sea_polygon')
        
        print(f"\n   ✅ Sea polygon saved to: {output_path}")
        print(f"      Type: {'sea'}")
        print(f"      Area: {largest_area_km2:.2f} km²")
        print(f"      Exclusion zone: 1000 m (1 km)")
        print(f"      Bounds: {largest_poly.bounds}")
        print(f"\n   🔒 PIRL will enforce 1 km exclusion zone around this polygon")
        
        return True

def main():
    parser = argparse.ArgumentParser(
        description='Extract sea polygon from ESA WorldCover land cover data'
    )
    parser.add_argument(
        'landcover',
        help='Path to land cover GeoTIFF (processed, clipped to AOI)'
    )
    parser.add_argument(
        'output',
        help='Output path for sea polygon GeoPackage'
    )
    parser.add_argument(
        '--min-area',
        type=float,
        default=1.0,
        help='Minimum area in km² to consider as sea (default: 1.0)'
    )
    
    args = parser.parse_args()
    
    try:
        success = extract_sea_polygon(args.landcover, args.output, args.min_area)
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()




