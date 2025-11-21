#!/bin/bash
################################################################################
# USGS 3DEP DEM Fetcher for US_PIPELINE
# 
# Purpose: Fetch USGS 3D Elevation Program (3DEP) Digital Elevation Model
#          for Wyoming project area
#
# Data Source: USGS The National Map API / AWS Open Data
# Resolution: 1/3 arc-second (~10m) preferred, 1 arc-second (~30m) fallback
# Format: GeoTIFF
# Expected CRS: EPSG:32613 (UTM Zone 13N for Wyoming)
#
# Compliance: DATASET_FETCHING_PROTOCOLS.md
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project paths
PROJECT_DIR="/opt/agrs/Projects/US_PIPELINE"
RAW_DIR="$PROJECT_DIR/data/rasters/raw"
AOI_FILE="$PROJECT_DIR/aoi/aoi.kmz"
LOG_FILE="$PROJECT_DIR/data/fetch_log.txt"

# Output files
OUTPUT_FILE="$RAW_DIR/dem_usgs_3dep_10m_raw.tif"
METADATA_FILE="$OUTPUT_FILE.json"

# API endpoints (multiple options)
TNM_API="https://tnmaccess.nationalmap.gov/api/v1/products"
AWS_S3_BUCKET="s3://prd-tnm"  # USGS AWS public bucket

################################################################################
# Functions
################################################################################

log_message() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [INFO] $@" | tee -a "$LOG_FILE"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

################################################################################
# Main Fetch Logic
################################################################################

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}USGS 3DEP DEM Fetcher${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

log_message "Starting USGS 3DEP DEM fetch for US_PIPELINE"

# Check if already exists
if [ -f "$OUTPUT_FILE" ]; then
    print_error "DEM already exists: $OUTPUT_FILE"
    print_info "Delete the existing file to re-fetch"
    exit 1
fi

# Check AOI exists
if [ ! -f "$AOI_FILE" ]; then
    print_error "AOI file not found: $AOI_FILE"
    exit 1
fi

print_info "AOI: $AOI_FILE"
print_info "Output: $OUTPUT_FILE"
echo ""

################################################################################
# IMPLEMENTATION NOTE:
################################################################################
# 
# This is a placeholder implementation. The actual fetch can be done via:
#
# 1. USGS TNM API (recommended for automation):
#    - Query API with AOI bbox to find available tiles
#    - Download tiles programmatically
#    - Merge with gdal_merge.py
#    - Example: curl "$TNM_API?bbox=$BBOX&datasets=..."
#
# 2. AWS S3 (good for large downloads):
#    - Access USGS data via AWS S3 public bucket
#    - Use aws s3 cp to download tiles
#    - Requires AWS CLI installed
#
# 3. Manual download from The National Map Viewer:
#    - Visit: https://apps.nationalmap.gov/downloader/
#    - Draw AOI on map
#    - Select "1/3 arc-second DEM" (10m resolution)
#    - Download tiles manually
#    - Place in raw/ directory
#
# 4. GDAL Virtual Raster (on-the-fly):
#    - Use GDAL /vsicurl/ to access USGS tiles directly
#    - No local storage of full dataset
#    - Slower but space-efficient
#
################################################################################

print_error "USGS 3DEP fetch not yet fully implemented!"
echo ""
echo "📋 Manual fetch instructions:"
echo ""
echo "1. Visit: https://apps.nationalmap.gov/downloader/"
echo "2. Navigate to project area: Wyoming ~105°W, 44.5°N"
echo "3. Select 'Elevation Products (3DEP)' → '1/3 arc-second DEM'"
echo "4. Draw a box around the AOI (or upload aoi.kmz)"
echo "5. Download the DEM tile(s)"
echo "6. Save as: $OUTPUT_FILE"
echo ""
echo "Alternative (GDAL WMS):"
echo "  gdal_translate \\"
echo "    /vsicurl/https://elevation.nationalmap.gov/... \\"
echo "    -projwin \$minx \$miny \$maxx \$maxy \\"
echo "    $OUTPUT_FILE"
echo ""
echo "Alternative (AWS S3 - requires AWS CLI):"
echo "  aws s3 cp --recursive --no-sign-request \\"
echo "    s3://prd-tnm/StagedProducts/Elevation/13/TIFF/... \\"
echo "    $RAW_DIR/"
echo ""

log_message "USGS 3DEP fetch requires manual download or API implementation"

# Generate placeholder metadata
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

cat > "$METADATA_FILE" << EOF
{
  "dataset_name": "USGS 3DEP Digital Elevation Model",
  "source": "USGS 3D Elevation Program (3DEP)",
  "provider": "U.S. Geological Survey",
  "provider_url": "https://www.usgs.gov/3d-elevation-program",
  "coverage_date": "2019-2023",
  "fetch_date": "$TIMESTAMP",
  "fetch_tool": "usgs_3dep_fetch.sh (manual)",
  "raw_crs": "EPSG:32613",
  "resolution_m": 10.0,
  "data_type": "Raster",
  "format": "GeoTIFF",
  "nodata_value": -9999.0,
  "documentation_url": "https://www.usgs.gov/3d-elevation-program/about-3dep-products-services",
  "license": "Public Domain",
  "attribution": "U.S. Geological Survey",
  "notes": "Manual download required. Follow instructions in fetch script.",
  "fetch_status": "pending_manual_download"
}
EOF

print_info "Metadata template created: $METADATA_FILE"
print_info "Update metadata after manual download"

echo ""
print_error "Manual action required to complete fetch"

exit 1



