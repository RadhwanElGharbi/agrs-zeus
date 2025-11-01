#!/bin/bash
PROJECT_DIR="/opt/agrs/Projects/test_project2"

# Create soil raster (placeholder with constant value 50)
echo "Creating soil raster..."
gdal_translate -b 1 -scale 0 255 50 50 \
  -co COMPRESS=LZW -co TILED=YES \
  "$PROJECT_DIR/data/rasters/processed/dem_epsg32633_processed.tif" \
  "$PROJECT_DIR/data/rasters/processed/soil_epsg32633_processed.tif"

# Create placeholder protected areas (empty)
echo "Creating protected areas placeholder..."
ogr2ogr -f GPKG -t_srs EPSG:32633 \
  -sql "SELECT * FROM aoi LIMIT 0" \
  "$PROJECT_DIR/data/vectors/processed/protected_areas_epsg32633_processed.gpkg" \
  "$PROJECT_DIR/data/vectors/processed/aoi_epsg32633_processed.gpkg"

# Create placeholder pipelines (empty)
echo "Creating pipelines placeholder..."
ogr2ogr -f GPKG -t_srs EPSG:32633 \
  -sql "SELECT * FROM aoi LIMIT 0" \
  "$PROJECT_DIR/data/vectors/processed/pipelines_epsg32633_processed.gpkg" \
  "$PROJECT_DIR/data/vectors/processed/aoi_epsg32633_processed.gpkg"

# Create additional symlinks
cd "$PROJECT_DIR/data/rasters"
ln -sf processed/soil_epsg32633_processed.tif soil.tif

cd "$PROJECT_DIR/data/vectors"
ln -sf processed/protected_areas_epsg32633_processed.gpkg protected_areas.gpkg
ln -sf processed/pipelines_epsg32633_processed.gpkg pipelines.gpkg

echo "Missing datasets created"
