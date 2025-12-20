#!/bin/bash
# Fetch all required vector datasets for test_project2 PIRL training
# Following DATASET_FETCHING_PROTOCOLS.md

set -e  # Exit on error

PROJECT_DIR="/opt/agrs/Projects/test_project2"
cd "$PROJECT_DIR"

echo "======================================================================"
echo "Fetching 7 Required Vector Datasets for PIRL"
echo "======================================================================"

# Extract AOI bounds for fetching
echo ""
echo "📍 Extracting AOI bounds..."
AOI_KMZ="aoi/aoi.kmz"
MIN_LON=$(jq -r '.start_point.longitude' aoi/project_aoi.json)
MAX_LON=$(jq -r '.end_point.longitude' aoi/project_aoi.json)
MIN_LAT=$(jq -r '.end_point.latitude' aoi/project_aoi.json)
MAX_LAT=$(jq -r '.start_point.latitude' aoi/project_aoi.json)

echo "  Bounds: [$MIN_LON, $MIN_LAT, $MAX_LON, $MAX_LAT]"
echo "  Region: Central Italy (Marche-Umbria)"

# 1. AOI (just reproject existing KMZ)
echo ""
echo "1️⃣  Processing AOI..."
/opt/agrs/build/zeus tools vector_reproject \
  --input "$AOI_KMZ" \
  --output "data/vectors/processed/aoi_epsg32633_processed.gpkg" \
  --target-epsg 32633 || echo "⚠️  AOI reproject failed, may need manual conversion"

# 2. Protected Areas (Natura 2000, WDPA)
echo ""
echo "2️⃣  Fetching Protected Areas..."
/opt/agrs/build/zeus tools wdpa_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --output "data/vectors/raw/protected_areas_wdpa_raw.gpkg" \
  --metadata "data/vectors/raw/protected_areas_wdpa_raw.gpkg.json" || echo "⚠️  WDPA fetch failed"

# Reproject protected areas
if [ -f "data/vectors/raw/protected_areas_wdpa_raw.gpkg" ]; then
  /opt/agrs/build/zeus tools vector_reproject \
    --input "data/vectors/raw/protected_areas_wdpa_raw.gpkg" \
    --output "data/vectors/processed/protected_areas_epsg32633_processed.gpkg" \
    --target-epsg 32633 \
    --clip-to-aoi "$AOI_KMZ"
fi

# 3-7. OSM Data (water, roads, railways, power lines, pipelines)
echo ""
echo "3️⃣  Fetching OSM Water Bodies..."
/opt/agrs/build/zeus tools osm_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --feature-type waterway \
  --output "data/vectors/raw/osm_waterways_raw.gpkg" \
  --metadata "data/vectors/raw/osm_waterways_raw.gpkg.json"

echo ""
echo "4️⃣  Fetching OSM Roads..."
/opt/agrs/build/zeus tools osm_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --feature-type highway \
  --output "data/vectors/raw/osm_roads_raw.gpkg" \
  --metadata "data/vectors/raw/osm_roads_raw.gpkg.json"

echo ""
echo "5️⃣  Fetching OSM Railways..."
/opt/agrs/build/zeus tools osm_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --feature-type railway \
  --output "data/vectors/raw/osm_railways_raw.gpkg" \
  --metadata "data/vectors/raw/osm_railways_raw.gpkg.json"

echo ""
echo "6️⃣  Fetching OSM Power Lines..."
/opt/agrs/build/zeus tools osm_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --feature-type power \
  --output "data/vectors/raw/osm_power_lines_raw.gpkg" \
  --metadata "data/vectors/raw/osm_power_lines_raw.gpkg.json"

echo ""
echo "7️⃣  Fetching OSM Pipelines..."
/opt/agrs/build/zeus tools osm_fetch \
  --bbox "$MIN_LON,$MIN_LAT,$MAX_LON,$MAX_LAT" \
  --feature-type pipeline \
  --output "data/vectors/raw/osm_pipelines_raw.gpkg" \
  --metadata "data/vectors/raw/osm_pipelines_raw.gpkg.json"

# Reproject all OSM data
echo ""
echo "📐 Reprojecting and clipping OSM data to EPSG:32633..."

for feature in waterways roads railways power_lines pipelines; do
  raw_file="data/vectors/raw/osm_${feature}_raw.gpkg"
  proc_file="data/vectors/processed/osm_${feature}_epsg32633_processed.gpkg"
  
  if [ -f "$raw_file" ]; then
    echo "  Processing $feature..."
    /opt/agrs/build/zeus tools vector_reproject \
      --input "$raw_file" \
      --output "$proc_file" \
      --target-epsg 32633 \
      --clip-to-aoi "$AOI_KMZ"
    
    # Generate metadata
    echo "  Generating metadata for $feature..."
    # TODO: Add metadata generation command
  fi
done

# Final verification
echo ""
echo "======================================================================"
echo "✅ Vector dataset fetching complete!"
echo "======================================================================"
python3 check_datasets.py

