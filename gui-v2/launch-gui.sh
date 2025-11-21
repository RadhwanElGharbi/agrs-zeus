#!/bin/bash
# AGRS ZEUS GUI v2 Launcher
# This script launches the GUI v2 application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPIMAGE="$SCRIPT_DIR/frontend/dist/AGRS ZEUS GUI v2-2.0.0.AppImage"

echo "=============================================="
echo "  AGRS ZEUS GUI v2 Launcher"
echo "=============================================="
echo ""

# Check if AppImage exists
if [ ! -f "$APPIMAGE" ]; then
    echo "❌ Error: AppImage not found!"
    echo "Expected location: $APPIMAGE"
    echo ""
    echo "Please build the application first:"
    echo "  cd frontend"
    echo "  npm run build"
    echo "  npm run electron-pack"
    exit 1
fi

# Make executable if not already
chmod +x "$APPIMAGE"

echo "✓ Found AppImage: $(basename "$APPIMAGE")"
echo "✓ Size: $(du -h "$APPIMAGE" | cut -f1)"
echo ""
echo "Starting application..."
echo ""

# Launch the AppImage
"$APPIMAGE" "$@"

