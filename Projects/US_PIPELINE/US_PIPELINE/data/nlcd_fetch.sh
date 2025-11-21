#!/bin/bash
################################################################################
# NLCD Land Cover Fetcher for US_PIPELINE
# 
# Purpose: Fetch National Land Cover Database (NLCD) for Wyoming project area
#
# Data Source: USGS Multi-Resolution Land Characteristics (MRLC) Consortium
# Resolution: 30m
# Format: GeoTIFF
# Native CRS: EPSG:5070 (Albers Equal Area Conic)
# Years Available: 2001, 2004, 2006, 2008, 2011, 2013, 2016, 2019, 2021
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
OUTPUT_FILE="$RAW_DIR/landcover_nlcd_30m_raw.tif"
METADATA_FILE="$OUTPUT_FILE.json"

# NLCD parameters
NLCD_YEAR="2021"  # Most recent
NLCD_URL="https://s3-us-west-2.amazonaws.com/mrlc/nlcd_${NLCD_YEAR}_land_cover_l48_20230630.zip"

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
echo -e "${BLUE}NLCD Land Cover Fetcher${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

log_message "Starting NLCD land cover fetch for US_PIPELINE"

# Check if already exists
if [ -f "$OUTPUT_FILE" ]; then
    print_error "NLCD already exists: $OUTPUT_FILE"
    print_info "Delete the existing file to re-fetch"
    exit 1
fi

# Check AOI exists
if [ ! -f "$AOI_FILE" ]; then
    print_error "AOI file not found: $AOI_FILE"
    exit 1
fi

print_info "Dataset: NLCD $NLCD_YEAR"
print_info "AOI: $AOI_FILE"
print_info "Output: $OUTPUT_FILE"
echo ""

################################################################################
# IMPLEMENTATION NOTE:
################################################################################
# 
# This is a placeholder implementation. The actual fetch can be done via:
#
# 1. Direct download from MRLC (recommended):
#    - CONUS-wide dataset: ~2-5 GB compressed
#    - URL: https://www.mrlc.gov/data
#    - Download full national coverage
#    - Clip to AOI extent after download
#
# 2. MRLC Viewer with custom extent:
#    - Visit: https://www.mrlc.gov/viewer/
#    - Draw AOI on map
#    - Download clipped extent
#    - Smaller file size, faster download
#
# 3. GDAL Virtual Raster (on-the-fly):
#    - Use GDAL /vsicurl/ to access MRLC tiles
#    - No local storage of full dataset
#    - Slower but space-efficient
#
################################################################################

print_error "NLCD fetch not yet fully implemented!"
echo ""
echo "📋 Manual fetch instructions:"
echo ""
echo "Option 1 - Full national coverage (recommended for multiple projects):"
echo "  1. Visit: https://www.mrlc.gov/data/nlcd-${NLCD_YEAR}-land-cover-conus"
echo "  2. Download: 'NLCD ${NLCD_YEAR} Land Cover (CONUS)'"
echo "  3. File size: ~2-5 GB compressed"
echo "  4. Extract and save as: $OUTPUT_FILE"
echo ""
echo "Option 2 - Custom extent (faster, smaller):"
echo "  1. Visit: https://www.mrlc.gov/viewer/"
echo "  2. Navigate to Wyoming (~105°W, 44.5°N)"
echo "  3. Draw AOI or upload KMZ"
echo "  4. Select 'NLCD $NLCD_YEAR Land Cover'"
echo "  5. Download and save as: $OUTPUT_FILE"
echo ""
echo "Option 3 - Command line (requires wget/curl):"
echo "  wget -O /tmp/nlcd_${NLCD_YEAR}.zip \\"
echo "    '$NLCD_URL'"
echo "  unzip /tmp/nlcd_${NLCD_YEAR}.zip -d /tmp/nlcd/"
echo "  gdalwarp -cutline $AOI_FILE -crop_to_cutline \\"
echo "    /tmp/nlcd/nlcd_${NLCD_YEAR}_land_cover_l48_*.img \\"
echo "    $OUTPUT_FILE"
echo ""

log_message "NLCD fetch requires manual download or API implementation"

# Generate placeholder metadata
TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

cat > "$METADATA_FILE" << EOF
{
  "dataset_name": "National Land Cover Database (NLCD) $NLCD_YEAR",
  "source": "USGS Multi-Resolution Land Characteristics Consortium",
  "provider": "U.S. Geological Survey",
  "provider_url": "https://www.mrlc.gov/",
  "coverage_date": "$NLCD_YEAR",
  "fetch_date": "$TIMESTAMP",
  "fetch_tool": "nlcd_fetch.sh (manual)",
  "raw_crs": "EPSG:5070",
  "resolution_m": 30.0,
  "data_type": "Raster",
  "format": "GeoTIFF",
  "nodata_value": 0,
  "documentation_url": "https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description",
  "license": "Public Domain",
  "attribution": "U.S. Geological Survey",
  "notes": "Manual download required. Land cover classes: 11-95 (categorical). Requires reprojection to EPSG:32613.",
  "fetch_status": "pending_manual_download",
  "land_cover_classes": {
    "11": "Open Water",
    "21": "Developed, Open Space",
    "22": "Developed, Low Intensity",
    "23": "Developed, Medium Intensity",
    "24": "Developed, High Intensity",
    "31": "Barren Land",
    "41": "Deciduous Forest",
    "42": "Evergreen Forest",
    "43": "Mixed Forest",
    "52": "Shrub/Scrub",
    "71": "Grassland/Herbaceous",
    "81": "Pasture/Hay",
    "82": "Cultivated Crops",
    "90": "Woody Wetlands",
    "95": "Emergent Herbaceous Wetlands"
  }
}
EOF

print_info "Metadata template created: $METADATA_FILE"
print_info "Update metadata after manual download"

echo ""
print_error "Manual action required to complete fetch"

exit 1



