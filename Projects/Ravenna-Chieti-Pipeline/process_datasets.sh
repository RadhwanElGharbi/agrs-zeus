#!/bin/bash
# Dataset processing for test_project2
# Following AGRS ZEUS protocols

PROJECT_DIR="/opt/agrs/Projects/test_project2"
TARGET_CRS="EPSG:32633"
AOI_EXTENT="13.454779 42.857057 13.938769 43.438886"  # WGS84

echo "=== Processing Rasters ==="

# 1. DEM
echo "Processing DEM..."
gdalwarp -s_srs EPSG:4326 -t_srs $TARGET_CRS \
  -te_srs EPSG:4326 -te $AOI_EXTENT \
  -r bilinear -co COMPRESS=LZW -co TILED=YES \
  "$PROJECT_DIR/data/rasters/raw/dem_tinitaly_10m_raw.tif" \
  "$PROJECT_DIR/data/rasters/processed/dem_epsg32633_processed.tif"

# 2. Land Cover  
echo "Processing Land Cover..."
gdalwarp -s_srs EPSG:4326 -t_srs $TARGET_CRS \
  -te_srs EPSG:4326 -te $AOI_EXTENT \
  -r near -co COMPRESS=LZW -co TILED=YES \
  "$PROJECT_DIR/data/rasters/raw/landcover_esa_worldcover_raw.tif" \
  "$PROJECT_DIR/data/rasters/processed/landcover_epsg32633_processed.tif"

# 3. Population
echo "Processing Population..."
gdalwarp -s_srs EPSG:4326 -t_srs $TARGET_CRS \
  -te_srs EPSG:4326 -te $AOI_EXTENT \
  -r bilinear -co COMPRESS=LZW -co TILED=YES \
  "$PROJECT_DIR/data/rasters/raw/population_worldpop_raw.tif" \
  "$PROJECT_DIR/data/rasters/processed/population_epsg32633_processed.tif"

# 4. Geohazards
echo "Processing Geohazards..."
gdalwarp -s_srs EPSG:4326 -t_srs $TARGET_CRS \
  -te_srs EPSG:4326 -te $AOI_EXTENT \
  -r bilinear -co COMPRESS=LZW -co TILED=YES \
  "$PROJECT_DIR/data/rasters/raw/geohazards_gem_seismic_raw.tif" \
  "$PROJECT_DIR/data/rasters/processed/geohazards_epsg32633_processed.tif"

echo "=== Processing Vectors ==="

# Convert AOI to EPSG:32633
echo "Processing AOI..."
ogr2ogr -f GPKG -t_srs $TARGET_CRS \
  "$PROJECT_DIR/data/vectors/processed/aoi_epsg32633_processed.gpkg" \
  "$PROJECT_DIR/aoi/aoi.kmz"

# Get AOI bounds in UTM for clipping
echo "Getting AOI bounds in UTM..."
AOI_BOUNDS=$(ogrinfo -al -so "$PROJECT_DIR/data/vectors/processed/aoi_epsg32633_processed.gpkg" | grep "Extent:" | sed 's/Extent: (\(.*\), \(.*\)) - (\(.*\), \(.*\))/\1 \2 \3 \4/')

echo "AOI bounds (UTM 33N): $AOI_BOUNDS"

# Process vector datasets with clipping to AOI
for vector in osm_roads osm_railways osm_waterways osm_power_lines admin_boundaries faults; do
  raw_file="$PROJECT_DIR/data/vectors/raw/${vector}_raw.gpkg"
  if [ -f "$raw_file" ]; then
    echo "Processing $vector..."
    ogr2ogr -f GPKG -t_srs $TARGET_CRS \
      -clipsrc "$PROJECT_DIR/data/vectors/processed/aoi_epsg32633_processed.gpkg" \
      "$PROJECT_DIR/data/vectors/processed/${vector}_epsg32633_processed.gpkg" \
      "$raw_file"
  fi
done

echo "=== Creating symlinks for PIRL ==="
cd "$PROJECT_DIR/data/rasters"
ln -sf processed/dem_epsg32633_processed.tif dem.tif
ln -sf processed/landcover_epsg32633_processed.tif landcover.tif
ln -sf processed/population_epsg32633_processed.tif population.tif
ln -sf processed/geohazards_epsg32633_processed.tif geohazards.tif

cd "$PROJECT_DIR/data/vectors"
ln -sf processed/aoi_epsg32633_processed.gpkg aoi.gpkg
ln -sf processed/osm_waterways_epsg32633_processed.gpkg water_bodies.gpkg
ln -sf processed/osm_roads_epsg32633_processed.gpkg roads.gpkg
ln -sf processed/osm_railways_epsg32633_processed.gpkg railways.gpkg
ln -sf processed/osm_power_lines_epsg32633_processed.gpkg power_lines.gpkg

echo "=== Processing Complete ==="
