# GDAL Binaries for AGRS ZEUS Desktop

Place platform-specific GDAL binaries here for bundling with the Electron installer.

## Required tools
- `gdalwarp` / `gdalwarp.exe`
- `ogr2ogr` / `ogr2ogr.exe`
- `gdal_translate` / `gdal_translate.exe`

## Directory structure
```
gdal/
  linux/     <- Linux x64 binaries (from system or conda-forge)
  win32/     <- Windows x64 binaries + DLLs (from OSGeo4W or conda-forge)
```

## Windows (win32/)
Download from OSGeo4W (https://trac.osgeo.org/osgeo4w/) or conda-forge:
```
conda create -n gdal-minimal -c conda-forge gdal --no-deps
```
Copy `gdalwarp.exe`, `ogr2ogr.exe`, `gdal_translate.exe` and all required DLLs.

## Linux (linux/)
The AppImage typically uses system GDAL. If bundling:
```
cp /usr/bin/gdalwarp /usr/bin/ogr2ogr /usr/bin/gdal_translate linux/
```
Note: Linux binaries are dynamically linked; ensure libgdal is available on target systems
or use a statically-linked build from conda-forge.

## If GDAL is not bundled
The Electron app will fall back to searching the system PATH for GDAL tools.
If not found, local tile rendering will be disabled and a warning shown to the user.
