#!/usr/bin/env bash
# Download and extract minimal GDAL Windows x64 binaries for bundling with Electron.
#
# Source: GISInternals GDAL 3.8.4 SDK (release-1930-x64)
# Only extracts the CLI tools + core DLLs needed for tile rendering.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../gui-v2/frontend"
GDAL_WIN_DIR="$FRONTEND_DIR/electron/gdal/win32"
CACHE_DIR="${GDAL_CACHE_DIR:-/tmp/gdal-build-cache}"

SDK_URL="https://download.gisinternals.com/sdk/downloads/release-1930-x64-gdal-3-8-4-mapserver-8-0-1.zip"
SDK_ZIP="$CACHE_DIR/gdal-sdk-win64.zip"
SDK_EXTRACT="$CACHE_DIR/gdal-sdk-extracted"

echo "=== Preparing GDAL Win64 binaries ==="
echo "Target: $GDAL_WIN_DIR"

mkdir -p "$CACHE_DIR" "$GDAL_WIN_DIR"

# Download if not cached
if [ ! -f "$SDK_ZIP" ]; then
    echo "Downloading GDAL SDK (~53MB)..."
    curl -L --progress-bar -o "$SDK_ZIP" "$SDK_URL"
    echo "Download complete."
else
    echo "Using cached SDK: $SDK_ZIP"
fi

# Extract to temp dir
echo "Extracting SDK..."
rm -rf "$SDK_EXTRACT"
mkdir -p "$SDK_EXTRACT"
unzip -q -o "$SDK_ZIP" -d "$SDK_EXTRACT"

# Find the GDAL apps directory (tools are under bin/gdal/apps/)
SDK_APPS=""
for candidate in \
    "$SDK_EXTRACT"/bin/gdal/apps \
    "$SDK_EXTRACT"/release-*/bin/gdal/apps \
    "$SDK_EXTRACT"/bin \
    "$SDK_EXTRACT"/release-*/bin; do
    if [ -d "$candidate" ] && [ -f "$candidate/gdalwarp.exe" ]; then
        SDK_APPS="$candidate"
        break
    fi
done

if [ -z "$SDK_APPS" ]; then
    echo "ERROR: Could not find gdalwarp.exe in extracted SDK."
    echo "Searching..."
    find "$SDK_EXTRACT" -name "gdalwarp.exe" 2>/dev/null
    exit 1
fi

echo "Found GDAL apps: $SDK_APPS"

# The DLLs are in the top-level bin/ directory
SDK_BIN="$SDK_EXTRACT/bin"
echo "Found SDK bin (DLLs): $SDK_BIN"

# Clean target
rm -rf "$GDAL_WIN_DIR"/*

# Copy CLI tools from apps directory
echo "Copying CLI tools..."
for tool in gdalwarp.exe ogr2ogr.exe gdal_translate.exe gdalinfo.exe; do
    if [ -f "$SDK_APPS/$tool" ]; then
        cp "$SDK_APPS/$tool" "$GDAL_WIN_DIR/"
        echo "  + $tool"
    else
        echo "  WARNING: $tool not found in $SDK_APPS"
    fi
done

# Copy required DLLs (core GDAL + dependencies)
echo "Copying DLLs..."
dll_count=0
for pattern in \
    "gdal*.dll" \
    "proj*.dll" \
    "geos*.dll" \
    "sqlite3.dll" \
    "tiff*.dll" \
    "geotiff*.dll" \
    "jpeg*.dll" \
    "openjp2*.dll" \
    "png*.dll" \
    "zlib*.dll" \
    "z.dll" \
    "libcurl*.dll" \
    "libcrypto*.dll" \
    "libssl*.dll" \
    "iconv*.dll" \
    "liblzma*.dll" \
    "libxml2*.dll" \
    "libexpat*.dll" \
    "xerces*.dll" \
    "hdf*.dll" \
    "netcdf*.dll" \
    "libpq*.dll" \
    "spatialite*.dll" \
    "freexl*.dll" \
    "cfitsio*.dll" \
    "ogdi*.dll" \
    "libmysql*.dll" \
    "msvcp*.dll" \
    "vcruntime*.dll" \
    "concrt*.dll" \
    ; do
    for dll in "$SDK_BIN"/$pattern; do
        if [ -f "$dll" ]; then
            cp "$dll" "$GDAL_WIN_DIR/"
            dll_count=$((dll_count + 1))
        fi
    done
done
echo "  Copied $dll_count DLLs"

# Also copy proj.db and gdal data files if available
GDAL_DATA=""
for candidate in "$SDK_EXTRACT"/bin/gdal-data "$SDK_EXTRACT"/release-*/bin/gdal-data "$SDK_EXTRACT"/data "$SDK_EXTRACT"/share/gdal; do
    if [ -d "$candidate" ]; then
        GDAL_DATA="$candidate"
        break
    fi
done

if [ -n "$GDAL_DATA" ]; then
    echo "Copying GDAL data files..."
    mkdir -p "$GDAL_WIN_DIR/gdal-data"
    cp -r "$GDAL_DATA"/* "$GDAL_WIN_DIR/gdal-data/" 2>/dev/null || true
    echo "  Copied GDAL data to gdal-data/"
fi

PROJ_DATA=""
for candidate in "$SDK_EXTRACT"/bin/proj-data "$SDK_EXTRACT"/release-*/bin/proj-data "$SDK_EXTRACT"/share/proj; do
    if [ -d "$candidate" ]; then
        PROJ_DATA="$candidate"
        break
    fi
done

if [ -n "$PROJ_DATA" ]; then
    echo "Copying PROJ data files..."
    mkdir -p "$GDAL_WIN_DIR/proj-data"
    cp -r "$PROJ_DATA"/* "$GDAL_WIN_DIR/proj-data/" 2>/dev/null || true
    echo "  Copied PROJ data to proj-data/"
fi

# Summary
total_size=$(du -sh "$GDAL_WIN_DIR" | cut -f1)
file_count=$(find "$GDAL_WIN_DIR" -type f | wc -l)
echo ""
echo "=== GDAL Win64 preparation complete ==="
echo "  Directory: $GDAL_WIN_DIR"
echo "  Files: $file_count"
echo "  Total size: $total_size"
echo ""
echo "CLI tools:"
ls -lh "$GDAL_WIN_DIR"/*.exe 2>/dev/null || echo "  (none)"
