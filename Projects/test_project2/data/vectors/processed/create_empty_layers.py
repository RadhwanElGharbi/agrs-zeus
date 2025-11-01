import fiona
from fiona.crs import from_epsg

# Create empty protected areas
schema_pa = {
    'geometry': 'Polygon',
    'properties': {'name': 'str', 'protection_type': 'str'}
}

with fiona.open('protected_areas_epsg32633_processed.gpkg', 'w', driver='GPKG',
                crs=from_epsg(32633), schema=schema_pa, layer='protected_areas') as dst:
    pass  # Create empty layer

# Create empty pipelines
schema_pl = {
    'geometry': 'LineString',
    'properties': {'name': 'str', 'pipeline_type': 'str', 'diameter': 'float'}
}

with fiona.open('pipelines_epsg32633_processed.gpkg', 'w', driver='GPKG',
                crs=from_epsg(32633), schema=schema_pl, layer='pipelines') as dst:
    pass  # Create empty layer

print("Empty layers created")
