CREATE TABLE protected_areas (
  fid INTEGER PRIMARY KEY,
  geom POLYGON,
  name TEXT,
  protection_type TEXT
);
SELECT InitSpatialMetadata(1);
SELECT AddGeometryColumn('protected_areas', 'geom', 32633, 'POLYGON', 'XY');
