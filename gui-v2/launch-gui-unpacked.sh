#!/bin/bash
# AGRS ZEUS GUI v2 Launcher (Unpacked Version)
# Alternative launcher using the unpacked directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNPACKED="$SCRIPT_DIR/frontend/dist/linux-unpacked/agrs-zeus-gui-v2"

echo "=============================================="
echo "  AGRS ZEUS GUI v2 Launcher (Unpacked)"
echo "=============================================="
echo ""

# Check if unpacked executable exists
if [ ! -f "$UNPACKED" ]; then
    echo "❌ Error: Unpacked executable not found!"
    echo "Expected location: $UNPACKED"
    echo ""
    echo "The unpacked version should be available after building."
    exit 1
fi

# Make executable if not already
chmod +x "$UNPACKED"

echo "✓ Found executable: $(basename "$UNPACKED")"
echo ""
echo "Starting application..."
echo ""

# Launch the unpacked executable
"$UNPACKED" "$@"




