#!/bin/bash
# Create empty protected areas
ogr2ogr -f GPKG -nlt POLYGON -t_srs EPSG:32633 \
  -sql "SELECT Name as name, 'protected_area' as protection_type, geometry FROM 'STUDY_AREA.kmz' WHERE 1=0" \
  data/vectors/processed/protected_areas_epsg32633_processed.gpkg \
  data/vectors/processed/aoi_epsg32633_processed.gpkg \
  -nln protected_areas

# Create empty pipelines
ogr2ogr -f GPKG -nlt LINESTRING -t_srs EPSG:32633 \
  -sql "SELECT Name as name, 'pipeline' as pipeline_type, CAST(26.0 AS REAL) as diameter, geometry FROM 'STUDY_AREA.kmz' WHERE 1=0" \
  data/vectors/processed/pipelines_epsg32633_processed.gpkg \
  data/vectors/processed/aoi_epsg32633_processed.gpkg \
  -nln pipelines

echo "Empty datasets created"
