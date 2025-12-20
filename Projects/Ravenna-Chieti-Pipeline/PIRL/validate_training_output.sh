#!/bin/bash
# Validate outputs after training completes

if [ -z "$1" ]; then
    echo "Usage: $0 <path_to_geojson>"
    exit 1
fi

GEOJSON_PATH="$1"

echo "=========================================="
echo "POST-TRAINING OUTPUT VALIDATION"
echo "=========================================="
echo ""

cd /opt/agrs/Projects/test_project2/PIRL

# Validate GeoJSON
echo "1. Validating GeoJSON output..."
python3 tests/test_geojson_output.py "$GEOJSON_PATH"
if [ $? -ne 0 ]; then
    echo "   ❌ GeoJSON validation failed"
    exit 1
fi
echo ""

# Check model file
echo "2. Checking model file..."
if [ -f "models/pirl_2M_production.zip" ]; then
    SIZE=$(stat -c %s "models/pirl_2M_production.zip")
    echo "   Model size: $(($SIZE / 1024 / 1024))MB"
    echo "   ✅ Model file exists"
else
    echo "   ❌ Model file not found"
    exit 1
fi
echo ""

# Check VecNormalize
echo "3. Checking VecNormalize statistics..."
if [ -f "models/pirl_2M_production_vecnormalize.pkl" ]; then
    echo "   ✅ VecNormalize file exists"
else
    echo "   ⚠️  WARNING: VecNormalize file not found"
fi
echo ""

echo "=========================================="
echo "✅ VALIDATION COMPLETE"
echo "=========================================="

