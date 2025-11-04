#!/usr/bin/env python3
"""
Fetch coastline data from multiple sources for PIRL projects
Supports: EEA, GSHHG, NOAA, OSM with automatic source selection
"""

import argparse
import requests
import json
import sys
from pathlib import Path
from datetime import datetime

SOURCES = {
    'eea': {
        'name': 'European Environment Agency',
        'coverage': 'Europe',
        'accuracy': '±5-10m',
        'url': 'https://www.eea.europa.eu/data-and-maps/data/eea-coastline-for-analysis-2'
    },
    'gshhg': {
        'name': 'GSHHG (Global Shoreline)',
        'coverage': 'Worldwide',
        'accuracy': '±100m',
        'url': 'https://www.ngdc.noaa.gov/mgg/shorelines/'
    },
    'noaa': {
        'name': 'NOAA Digital Vector Shoreline',
        'coverage': 'USA',
        'accuracy': '±10-50m',
        'url': 'https://www.ngdc.noaa.gov/mgg/shorelines/data/noaa/'
    },
    'osm': {
        'name': 'OpenStreetMap',
        'coverage': 'Worldwide',
        'accuracy': '±10-50m (variable)',
        'api': 'Overpass API'
    }
}

def auto_select_source(bbox):
    """
    Automatically select best coastline source based on bbox location
    
    Args:
        bbox: (min_lon, min_lat, max_lon, max_lat)
    
    Returns:
        str: Recommended source ('eea', 'gshhg', 'noaa', or 'osm')
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    
    # Europe bbox check (roughly -10W to 40E, 35N to 71N)
    if -10 <= min_lon <= 40 and 35 <= min_lat <= 71:
        print(f"📍 Location: Europe → Recommending EEA (±5-10m accuracy)")
        return 'eea'
    
    # USA bbox check (roughly -125W to -67W, 25N to 49N)
    if -125 <= min_lon <= -67 and 25 <= min_lat <= 49:
        print(f"📍 Location: USA → Recommending NOAA (nautical chart quality)")
        return 'noaa'
    
    # Global fallback
    print(f"📍 Location: Global → Recommending GSHHG (worldwide coverage)")
    return 'gshhg'


def fetch_osm_coastline(bbox, output_path):
    """Fetch coastline from OpenStreetMap using Overpass API"""
    overpass_url = "https://overpass-api.de/api/interpreter"
    
    query = f"""
    [out:json][timeout:60];
    (
      way["natural"="coastline"]({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
    );
    out geom;
    """
    
    print(f"🌐 Fetching OSM coastline for bbox: {bbox}")
    try:
        response = requests.post(overpass_url, data={"data": query}, timeout=120)
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error: {e}")
        return False
    
    if response.status_code == 200:
        osm_data = response.json()
        features = []
        
        for element in osm_data.get("elements", []):
            if element["type"] == "way":
                coords = [[node["lon"], node["lat"]] for node in element.get("geometry", [])]
                if len(coords) >= 2:  # Valid linestring
                    features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": coords
                        },
                        "properties": {
                            "osm_id": element["id"],
                            "source": "OpenStreetMap",
                            "natural": "coastline",
                            "accuracy": "±10-50m (variable)"
                        }
                    })
        
        geojson = {
            "type": "FeatureCollection",
            "features": features,
            "crs": {
                "type": "name",
                "properties": {"name": "EPSG:4326"}
            },
            "metadata": {
                "source": "OpenStreetMap Overpass API",
                "query_bbox": bbox,
                "feature_count": len(features),
                "download_date": datetime.now().strftime("%Y-%m-%d"),
                "license": "ODbL 1.0"
            }
        }
        
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(geojson, f, indent=2)
        
        print(f"✅ Fetched {len(features)} coastline segments from OSM")
        print(f"📁 Saved to: {output_path}")
        
        # Create metadata
        create_metadata(output_path, 'osm', bbox, len(features))
        return True
    else:
        print(f"❌ Failed to fetch from OSM: HTTP {response.status_code}")
        return False


def fetch_eea_coastline(output_path):
    """Provide instructions for EEA manual download"""
    print("\n" + "="*80)
    print("📥 EEA COASTLINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n⭐ RECOMMENDED for European projects (±5-10m accuracy)\n")
    print("Steps:")
    print("1. Visit: https://www.eea.europa.eu/data-and-maps/data/eea-coastline-for-analysis-2")
    print("2. Click 'Download' button")
    print("3. Select 'EEA Coastline Polyline' GeoPackage format")
    print("4. Save to your project directory")
    print(f"5. Clip to your AOI using ogr2ogr:")
    print(f"\n   ogr2ogr -clipsrc <minx> <miny> <maxx> <maxy> \\")
    print(f"           {output_path} \\")
    print(f"           /path/to/eea_coastline.gpkg\n")
    print("Format: GeoPackage, Shapefile, or GML")
    print("CRS: ETRS89 / LAEA Europe (EPSG:3035) - requires reprojection to project CRS")
    print("="*80 + "\n")
    return False  # Manual download required


def fetch_gshhg_coastline(bbox, resolution, output_path):
    """Provide instructions for GSHHG download"""
    print("\n" + "="*80)
    print("📥 GSHHG COASTLINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n🌍 GLOBAL coverage (±100m accuracy at 'full' resolution)\n")
    print("Steps:")
    print("1. Download GSHHG shapefiles:")
    print("   Primary: https://www.ngdc.noaa.gov/mgg/shorelines/")
    print("   Mirror: https://www.soest.hawaii.edu/pwessel/gshhg/")
    print(f"2. Select resolution: {resolution} (crude/low/intermediate/high/full)")
    print("3. Extract to local directory")
    print(f"4. Clip to bbox {bbox} using ogr2ogr:")
    print(f"\n   ogr2ogr -clipsrc {bbox[0]} {bbox[1]} {bbox[2]} {bbox[3]} \\")
    print(f"           {output_path} \\")
    print(f"           GSHHS_{resolution[0]}_L1.shp\n")
    print("Hierarchical levels:")
    print("  L1: Land/ocean boundaries (use this for coastline)")
    print("  L2: Lakes")
    print("  L3: Islands within lakes")
    print("  L4: Ponds within islands")
    print("="*80 + "\n")
    return False  # Manual download required


def fetch_noaa_coastline(output_path):
    """Provide instructions for NOAA download"""
    print("\n" + "="*80)
    print("📥 NOAA SHORELINE DOWNLOAD INSTRUCTIONS")
    print("="*80)
    print("\n🇺🇸 USA coverage only (±10-50m nautical chart quality)\n")
    print("Steps:")
    print("1. Visit: https://www.ngdc.noaa.gov/mgg/shorelines/data/noaa/")
    print("2. Select region (e.g., 'Gulf of Mexico', 'East Coast', 'West Coast')")
    print("3. Download shapefile format")
    print(f"4. Clip to your AOI:")
    print(f"\n   ogr2ogr -clipsrc <minx> <miny> <maxx> <maxy> \\")
    print(f"           {output_path} \\")
    print(f"           noaa_shoreline.shp\n")
    print("Resolution: ~1:80,000 scale (medium resolution)")
    print("="*80 + "\n")
    return False  # Manual download required


def create_metadata(output_path, source, bbox, feature_count):
    """Create metadata JSON for coastline dataset"""
    metadata_path = Path(output_path).parent / (Path(output_path).stem + '.json')
    
    metadata = {
        "dataset_name": "coastline",
        "source": SOURCES[source],
        "query_bbox": {
            "min_lon": bbox[0],
            "min_lat": bbox[1],
            "max_lon": bbox[2],
            "max_lat": bbox[3]
        },
        "geometry_type": "LineString",
        "feature_count": feature_count,
        "crs": "EPSG:4326",
        "download_date": datetime.now().strftime("%Y-%m-%d"),
        "description": "Coastline boundary for offshore routing constraint in PIRL"
    }
    
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"📝 Created metadata: {metadata_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Fetch coastline data for PIRL projects',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Auto-select source based on location
  python fetch_coastline.py --bbox 13.5,42.9,14.0,43.4 --output coastline.geojson

  # Explicitly use OSM (fastest, programmatic)
  python fetch_coastline.py --source osm --bbox 13.5,42.9,14.0,43.4 --output coastline.geojson

  # Get EEA instructions (best for Europe)
  python fetch_coastline.py --source eea --bbox 13.5,42.9,14.0,43.4 --output coastline.gpkg

  # Get GSHHG instructions (global)
  python fetch_coastline.py --source gshhg --bbox -10,30,40,60 --output coastline.shp
        """
    )
    
    parser.add_argument('--source', 
                       choices=['auto', 'eea', 'gshhg', 'noaa', 'osm'],
                       default='auto',
                       help='Coastline data source (default: auto-select based on location)')
    
    parser.add_argument('--bbox', 
                       required=True,
                       help='Bounding box: min_lon,min_lat,max_lon,max_lat (e.g., 13.5,42.9,14.0,43.4)')
    
    parser.add_argument('--output', 
                       required=True,
                       help='Output file path (e.g., data/vectors/raw/coastline_raw.geojson)')
    
    parser.add_argument('--resolution',
                       choices=['crude', 'low', 'intermediate', 'high', 'full'],
                       default='full',
                       help='GSHHG resolution level (only applicable for GSHHG source)')
    
    args = parser.parse_args()
    
    # Parse bbox
    try:
        bbox = tuple(map(float, args.bbox.split(',')))
        if len(bbox) != 4:
            raise ValueError("Bbox must have 4 values")
    except:
        print(f"❌ Invalid bbox format. Use: min_lon,min_lat,max_lon,max_lat")
        sys.exit(1)
    
    # Auto-select source if requested
    source = args.source
    if source == 'auto':
        source = auto_select_source(bbox)
        print(f"💡 Auto-selected source: {source.upper()}")
        print(f"    Override with: --source <eea|gshhg|noaa|osm>\n")
    
    # Fetch coastline
    if source == 'osm':
        success = fetch_osm_coastline(bbox, args.output)
        if not success:
            sys.exit(1)
    
    elif source == 'eea':
        fetch_eea_coastline(args.output)
        sys.exit(0)  # Manual download, not an error
    
    elif source == 'gshhg':
        fetch_gshhg_coastline(bbox, args.resolution, args.output)
        sys.exit(0)  # Manual download, not an error
    
    elif source == 'noaa':
        fetch_noaa_coastline(args.output)
        sys.exit(0)  # Manual download, not an error
    
    print("\n✅ Next steps:")
    print("1. Reproject to project CRS (e.g., EPSG:32633 for Italy):")
    print(f"   ogr2ogr -t_srs EPSG:<your_crs> \\")
    print(f"           data/vectors/processed/coastline_epsg<crs>_processed.gpkg \\")
    print(f"           {args.output}")
    print("\n2. Enable coastline constraint in training config:")
    print("   coastline:")
    print("     enabled: true")
    print("     enforce_as_boundary: true")

