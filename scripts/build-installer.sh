#!/usr/bin/env bash
# Build AGRS ZEUS Desktop installers for Windows (.exe) and Linux (AppImage).
#
# Usage:
#   ./scripts/build-installer.sh              # Build both platforms
#   ./scripts/build-installer.sh linux        # Linux AppImage only
#   ./scripts/build-installer.sh win          # Windows .exe only
#
# Prerequisites:
#   - Node.js and npm
#   - For Windows build: wine (or skip with linux-only)
#   - GDAL system tools (for Linux bundling)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
FRONTEND_DIR="$PROJECT_ROOT/gui-v2/frontend"
BACKEND_DIR="$PROJECT_ROOT/gui-v2/backend"

BUILD_TARGET="${1:-all}"  # all | linux | win

cd "$FRONTEND_DIR"

VERSION=$(node -p "require('./package.json').version")
echo "=== Building AGRS ZEUS v${VERSION} ==="
echo "Target: $BUILD_TARGET"
echo ""

# Step 1: Prepare GDAL binaries
echo "--- Step 1: Prepare GDAL binaries ---"
if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "win" ]; then
    echo "Preparing Windows GDAL..."
    bash "$SCRIPT_DIR/prepare-gdal-win64.sh"
fi

if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "linux" ]; then
    echo "Preparing Linux GDAL..."
    GDAL_LINUX_DIR="$FRONTEND_DIR/electron/gdal/linux"
    mkdir -p "$GDAL_LINUX_DIR"
    for tool in gdalwarp ogr2ogr gdal_translate gdalinfo; do
        if command -v "$tool" >/dev/null 2>&1; then
            cp "$(which "$tool")" "$GDAL_LINUX_DIR/"
            echo "  + $tool"
        else
            echo "  WARNING: $tool not found on system"
        fi
    done
fi
echo ""

# Step 2: Build Next.js static export
echo "--- Step 2: Next.js build ---"
npm run build
echo ""

# Step 3: Build Electron packages
echo "--- Step 3: Electron build ---"

# Clean up problematic win-unpacked if it has permission issues
if [ -d "dist/win-unpacked" ]; then
    if ! rm -rf "dist/win-unpacked" 2>/dev/null; then
        echo "WARNING: Cannot clean dist/win-unpacked (permission issue)."
        echo "Attempting to build to a separate output dir..."
    fi
fi

if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "win" ]; then
    echo "Building Windows installer..."
    if command -v wine >/dev/null 2>&1 || command -v wine64 >/dev/null 2>&1; then
        npx electron-builder --win --x64
    else
        echo "WARNING: wine not found. Windows NSIS installer requires wine for cross-compilation."
        echo "Attempting build anyway (may fail)..."
        npx electron-builder --win --x64 || {
            echo ""
            echo "Windows build failed (wine is required for NSIS on Linux)."
            echo "Options:"
            echo "  1. Install wine: sudo apt install wine64"
            echo "  2. Build on a Windows machine: npm run build:electron:win"
            echo "  3. Use the app.asar update method instead"
        }
    fi
    echo ""
fi

if [ "$BUILD_TARGET" = "all" ] || [ "$BUILD_TARGET" = "linux" ]; then
    echo "Building Linux AppImage..."
    npx electron-builder --linux --x64
    echo ""
fi

# Step 4: Update app_version.json
echo "--- Step 4: Update version manifest ---"
WIN_EXE="AGRS-ZEUS-Setup-${VERSION}.exe"
LINUX_APPIMAGE="AGRS-ZEUS-${VERSION}-linux.AppImage"

DOWNLOADS="["
has_item=false

if [ -f "dist/$WIN_EXE" ]; then
    DOWNLOADS="$DOWNLOADS"'{"platform":"windows","label":"Windows Installer (.exe)","url":"/api/app/downloads/'"$WIN_EXE"'","filename":"'"$WIN_EXE"'"}'
    has_item=true
    echo "  Windows: dist/$WIN_EXE ($(du -sh "dist/$WIN_EXE" | cut -f1))"
fi

if [ -f "dist/$LINUX_APPIMAGE" ]; then
    if $has_item; then DOWNLOADS="$DOWNLOADS,"; fi
    DOWNLOADS="$DOWNLOADS"'{"platform":"linux","label":"Linux AppImage","url":"/api/app/downloads/'"$LINUX_APPIMAGE"'","filename":"'"$LINUX_APPIMAGE"'"}'
    has_item=true
    echo "  Linux: dist/$LINUX_APPIMAGE ($(du -sh "dist/$LINUX_APPIMAGE" | cut -f1))"
fi

# Check for old-style artifact names too
for alt in "AGRS ZEUS GUI v2-${VERSION}.AppImage"; do
    if [ -f "dist/$alt" ] && [ ! -f "dist/$LINUX_APPIMAGE" ]; then
        if $has_item; then DOWNLOADS="$DOWNLOADS,"; fi
        DOWNLOADS="$DOWNLOADS"'{"platform":"linux","label":"Linux AppImage","url":"/api/app/downloads/'"$alt"'","filename":"'"$alt"'"}'
        has_item=true
        echo "  Linux (alt): dist/$alt ($(du -sh "dist/$alt" | cut -f1))"
    fi
done

DOWNLOADS="$DOWNLOADS]"

cat > "$BACKEND_DIR/app_version.json" << EOF
{
  "version": "${VERSION}",
  "release_date": "$(date +%Y-%m-%d)",
  "release_notes": "AGRS ZEUS v${VERSION} with client-side local data cache, GDAL bundled for local rendering, Project Controls, and background drift detection.",
  "downloads": ${DOWNLOADS}
}
EOF

echo ""
echo "  Updated: $BACKEND_DIR/app_version.json"
echo ""
echo "=== Build complete ==="
echo "Artifacts in: $FRONTEND_DIR/dist/"
ls -lh dist/*.exe dist/*.AppImage dist/*.appimage 2>/dev/null || echo "(no installers found)"
