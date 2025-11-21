#!/bin/bash
################################################################################
# Automated SRTM DEM Fetch from AWS Public Dataset
# Source: AWS Terrain Tiles (SRTM 30m)
################################################################################

set -e

PROJECT_DIR="/opt/agrs/Projects/US_PIPELINE"
OUTPUT_DIR="$PROJECT_DIR/data/rasters/raw"
OUTPUT_FILE="$OUTPUT_DIR/dem_srtm_30m_raw.tif"
TEMP_DIR="/tmp/us_pipeline_dem_$$"

# Create temp directory
mkdir -p "$TEMP_DIR"

echo "Fetching SRTM 30m DEM from AWS..."
echo "AOI: Wyoming, USA (44.5°N, 105°W)"
echo ""

# SRTM tiles covering Wyoming area around -105°W, 44.5°N
# Tiles are in format: N44W106.hgt
TILES="N44W106 N45W106"

cd "$TEMP_DIR"

for tile in $TILES; do
    echo "Downloading tile: $tile..."
    # Try AWS public dataset
    aws s3 cp --no-sign-request \
        "s3://raster/SRTM30/${tile}.hgt" \
        "${tile}.hgt" 2>/dev/null || \
    # Fallback to direct URL
    wget -q "https://srtm.csi.cgiar.org/wp-content/uploads/files/srtm_5x5/TIFF/${tile}.zip" && \
    unzip -q "${tile}.zip" && rm "${tile}.zip" || \
    echo "  Failed to download $tile (may not exist)"
done

# Build VRT from all tiles
echo ""
echo "Merging tiles..."
gdalbuildvrt -q dem_merged.vrt *.hgt 2>/dev/null || gdalbuildvrt -q dem_merged.vrt *.tif 2>/dev/null || true

# Clip to AOI
echo "Clipping to AOI..."
gdalwarp -q \
    -cutline "$PROJECT_DIR/aoi/aoi.kmz" \
    -crop_to_cutline \
    -co "COMPRESS=LZW" \
    -co "TILED=YES" \
    -co "BIGTIFF=IF_SAFER" \
    dem_merged.vrt \
    "$OUTPUT_FILE"

# Cleanup
cd /
rm -rf "$TEMP_DIR"

if [ -f "$OUTPUT_FILE" ]; then
    echo ""
    echo "✓ DEM successfully fetched: $OUTPUT_FILE"
    ls -lh "$OUTPUT_FILE"
else
    echo ""
    echo "✗ Failed to fetch DEM"
    exit 1
fi


