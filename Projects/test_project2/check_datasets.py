#!/usr/bin/env python3
"""Quick dataset inventory check."""
from pathlib import Path

project_dir = Path(".")
print("=" * 70)
print("PIRL REQUIRED DATASETS - Inventory Check")
print("=" * 70)

# PIRL requires 12 datasets total:
# 5 rasters: DEM, land cover, geohazards, soil, population
# 7 vectors: AOI, protected areas, water bodies, roads, railways, power lines, pipelines

rasters_processed = project_dir / "data/rasters/processed"
vectors_processed = project_dir / "data/vectors/processed"

print("\n📊 RASTER DATASETS (5 required):")
print("-" * 70)

raster_files = {
    "DEM": "dem_epsg32633_processed.tif",
    "Land Cover": "landcover_epsg32633_processed.tif",
    "Geohazards": "geohazards_epsg32633_processed.tif",
    "Soil": "soil_epsg32633_processed.tif",
    "Population": "population_epsg32633_processed.tif",
}

raster_count = 0
for name, filename in raster_files.items():
    filepath = rasters_processed / filename
    if filepath.exists():
        print(f"  ✅ {name:15} {filename}")
        raster_count += 1
    else:
        print(f"  ❌ {name:15} {filename} [MISSING]")

print(f"\nRaster Status: {raster_count}/5 present")

print("\n📍 VECTOR DATASETS (7 required):")
print("-" * 70)

vector_files = {
    "AOI": "aoi_epsg32633_processed.gpkg",
    "Protected Areas": "protected_areas_epsg32633_processed.gpkg",
    "Water Bodies": "osm_waterways_epsg32633_processed.gpkg",
    "Roads": "osm_roads_epsg32633_processed.gpkg",
    "Railways": "osm_railways_epsg32633_processed.gpkg",
    "Power Lines": "osm_power_lines_epsg32633_processed.gpkg",
    "Pipelines": "pipelines_epsg32633_processed.gpkg",
}

vector_count = 0
for name, filename in vector_files.items():
    filepath = vectors_processed / filename
    if filepath.exists():
        # Check if not empty
        import subprocess
        result = subprocess.run(['ogrinfo', '-so', str(filepath)], 
                              capture_output=True, text=True)
        if 'Layer name:' in result.stdout or 'features' in result.stdout.lower():
            print(f"  ✅ {name:18} {filename}")
            vector_count += 1
        else:
            print(f"  ⚠️  {name:18} {filename} [EXISTS BUT EMPTY]")
    else:
        print(f"  ❌ {name:18} {filename} [MISSING]")

print(f"\nVector Status: {vector_count}/7 present")

print("\n" + "=" * 70)
total_count = raster_count + vector_count
print(f"TOTAL: {total_count}/12 datasets present")

if total_count == 12:
    print("✅ ALL REQUIRED DATASETS PRESENT - Ready for training!")
else:
    print(f"❌ MISSING {12 - total_count} datasets - Need to fetch/process")
print("=" * 70)
