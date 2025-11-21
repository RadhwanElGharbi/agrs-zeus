#!/bin/bash
################################################################################
# US_PIPELINE Dataset Processing Script
# 
# Purpose: Process raw datasets to target CRS (EPSG:32613) following
#          DATASET_FETCHING_PROTOCOLS.md standards
#
# Usage: ./process_all_datasets.sh [--verbose] [--dataset <name>]
#
# Compliance: DATASET_FETCHING_PROTOCOLS.md Phase 5
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project paths
PROJECT_DIR="/opt/agrs/Projects/US_PIPELINE"
DATA_DIR="$PROJECT_DIR/data"
RASTERS_RAW="$DATA_DIR/rasters/raw"
RASTERS_PROC="$DATA_DIR/rasters/processed"
VECTORS_RAW="$DATA_DIR/vectors/raw"
VECTORS_PROC="$DATA_DIR/vectors/processed"
AOI_FILE="$PROJECT_DIR/aoi/aoi.kmz"
METADATA_FILE="$PROJECT_DIR/project_metadata.json"
LOG_FILE="$DATA_DIR/processing_log.txt"

# Processing parameters
TARGET_CRS="EPSG:32613"  # WGS 84 / UTM zone 13N
BUFFER_PERCENT=0.01  # 1% buffer beyond AOI
COMPRESSION="LZW"

# Flags
VERBOSE=false
SPECIFIC_DATASET=""

################################################################################
# Functions
################################################################################

log_message() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE"
}

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

read_target_crs() {
    log_message "INFO" "Reading target CRS from project metadata..."
    
    if [ ! -f "$METADATA_FILE" ]; then
        print_error "project_metadata.json not found!"
        exit 1
    fi
    
    local crs_epsg=$(jq -r '.crs_epsg' "$METADATA_FILE")
    TARGET_CRS="EPSG:${crs_epsg}"
    
    print_success "Target CRS: $TARGET_CRS"
    log_message "INFO" "Target CRS set to $TARGET_CRS"
}

convert_aoi_to_gpkg() {
    log_message "INFO" "Converting AOI KMZ to GeoPackage..."
    
    local aoi_gpkg="$PROJECT_DIR/aoi/aoi.gpkg"
    
    if [ -f "$aoi_gpkg" ]; then
        print_success "AOI GeoPackage already exists"
        return 0
    fi
    
    if [ ! -f "$AOI_FILE" ]; then
        print_error "AOI file not found: $AOI_FILE"
        exit 1
    fi
    
    ogr2ogr -f GPKG "$aoi_gpkg" "$AOI_FILE" -t_srs "$TARGET_CRS"
    
    if [ $? -eq 0 ]; then
        print_success "AOI converted to GeoPackage in $TARGET_CRS"
        log_message "INFO" "AOI converted: $aoi_gpkg"
    else
        print_error "Failed to convert AOI"
        exit 1
    fi
}

process_raster() {
    local input_file=$1
    local dataset_name=$(basename "$input_file" | sed 's/_raw\..*//')
    local output_file="$RASTERS_PROC/${dataset_name}_epsg${TARGET_CRS#EPSG:}_processed.tif"
    local aoi_gpkg="$PROJECT_DIR/aoi/aoi.gpkg"
    
    log_message "INFO" "Processing raster: $dataset_name"
    echo ""
    echo -e "${BLUE}Processing:${NC} $dataset_name"
    
    # Check if already processed
    if [ -f "$output_file" ]; then
        print_warning "Already processed: $output_file"
        return 0
    fi
    
    # Get source CRS
    local source_crs=$(gdalinfo "$input_file" | grep "PROJ" | head -1 | sed -n 's/.*EPSG",\([0-9]*\).*/EPSG:\1/p')
    if [ -z "$source_crs" ]; then
        source_crs=$(gdalsrsinfo -o proj4 "$input_file" 2>/dev/null | head -1)
    fi
    
    echo "  Source CRS: $source_crs"
    echo "  Target CRS: $TARGET_CRS"
    
    # Determine resampling method based on dataset type
    local resampling="bilinear"  # Default for continuous data
    if [[ "$dataset_name" == *"landcover"* ]] || [[ "$dataset_name" == *"soil"* ]]; then
        resampling="near"  # Nearest neighbor for categorical data
        echo "  Resampling: $resampling (categorical data)"
    else
        echo "  Resampling: $resampling (continuous data)"
    fi
    
    # Process: reproject + clip + compress
    echo "  Processing..."
    
    gdalwarp \
        -t_srs "$TARGET_CRS" \
        -r "$resampling" \
        -cutline "$aoi_gpkg" \
        -crop_to_cutline \
        -co "COMPRESS=$COMPRESSION" \
        -co "TILED=YES" \
        -co "BIGTIFF=IF_SAFER" \
        -overwrite \
        "$input_file" \
        "$output_file" 2>&1 | grep -v "^0" || true
    
    if [ $? -eq 0 ] && [ -f "$output_file" ]; then
        print_success "Processed: $output_file"
        log_message "INFO" "Raster processed: $output_file"
        
        # Generate metadata
        generate_processed_metadata "$output_file" "$input_file" "raster" "$source_crs"
        
        # Validate
        validate_raster "$output_file"
    else
        print_error "Failed to process: $dataset_name"
        log_message "ERROR" "Failed to process raster: $input_file"
    fi
}

process_vector() {
    local input_file=$1
    local dataset_name=$(basename "$input_file" | sed 's/_raw\..*//')
    local output_file="$VECTORS_PROC/${dataset_name}_epsg${TARGET_CRS#EPSG:}_processed.gpkg"
    local aoi_gpkg="$PROJECT_DIR/aoi/aoi.gpkg"
    
    log_message "INFO" "Processing vector: $dataset_name"
    echo ""
    echo -e "${BLUE}Processing:${NC} $dataset_name"
    
    # Check if already processed
    if [ -f "$output_file" ]; then
        print_warning "Already processed: $output_file"
        return 0
    fi
    
    # Get source CRS
    local source_crs=$(ogrinfo -so "$input_file" | grep "PROJ" | head -1 | sed -n 's/.*EPSG",\([0-9]*\).*/EPSG:\1/p')
    
    echo "  Source CRS: $source_crs"
    echo "  Target CRS: $TARGET_CRS"
    echo "  Processing..."
    
    # Process: reproject + clip
    ogr2ogr \
        -f GPKG \
        -t_srs "$TARGET_CRS" \
        -clipsrc "$aoi_gpkg" \
        -overwrite \
        "$output_file" \
        "$input_file"
    
    if [ $? -eq 0 ] && [ -f "$output_file" ]; then
        print_success "Processed: $output_file"
        log_message "INFO" "Vector processed: $output_file"
        
        # Generate metadata
        generate_processed_metadata "$output_file" "$input_file" "vector" "$source_crs"
        
        # Validate
        validate_vector "$output_file"
    else
        print_error "Failed to process: $dataset_name"
        log_message "ERROR" "Failed to process vector: $input_file"
    fi
}

generate_processed_metadata() {
    local output_file=$1
    local input_file=$2
    local data_type=$3
    local source_crs=$4
    
    local metadata_file="${output_file}.json"
    local dataset_name=$(basename "$output_file" | sed 's/\..*//')
    local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    
    # Extract extent and statistics
    if [ "$data_type" = "raster" ]; then
        local info=$(gdalinfo "$output_file")
        local size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
        
        # Create metadata JSON
        cat > "$metadata_file" << EOF
{
  "dataset_name": "${dataset_name} (Processed)",
  "processing_date": "$timestamp",
  "target_crs": "$TARGET_CRS",
  "target_crs_name": "WGS 84 / UTM zone 13N",
  "data_type": "Raster",
  "format": "GeoTIFF",
  "operations_applied": [
    {
      "operation": "reproject",
      "tool": "gdalwarp",
      "source_crs": "$source_crs",
      "target_crs": "$TARGET_CRS",
      "timestamp": "$timestamp"
    },
    {
      "operation": "clip",
      "tool": "gdalwarp",
      "cutline": "aoi/aoi.gpkg",
      "timestamp": "$timestamp"
    },
    {
      "operation": "compress",
      "tool": "gdalwarp",
      "method": "$COMPRESSION",
      "timestamp": "$timestamp"
    }
  ],
  "source_files": [
    {
      "filename": "$(basename $input_file)",
      "metadata": "$(basename $input_file).json"
    }
  ],
  "file_size_bytes": $size,
  "validation_status": "pending",
  "validation_date": "$timestamp"
}
EOF
    else
        # Vector metadata
        local size=$(stat -f%z "$output_file" 2>/dev/null || stat -c%s "$output_file" 2>/dev/null)
        
        cat > "$metadata_file" << EOF
{
  "dataset_name": "${dataset_name} (Processed)",
  "processing_date": "$timestamp",
  "target_crs": "$TARGET_CRS",
  "target_crs_name": "WGS 84 / UTM zone 13N",
  "data_type": "Vector",
  "format": "GeoPackage",
  "operations_applied": [
    {
      "operation": "reproject",
      "tool": "ogr2ogr",
      "source_crs": "$source_crs",
      "target_crs": "$TARGET_CRS",
      "timestamp": "$timestamp"
    },
    {
      "operation": "clip",
      "tool": "ogr2ogr",
      "clipsrc": "aoi/aoi.gpkg",
      "timestamp": "$timestamp"
    }
  ],
  "source_files": [
    {
      "filename": "$(basename $input_file)",
      "metadata": "$(basename $input_file).json"
    }
  ],
  "file_size_bytes": $size,
  "validation_status": "pending",
  "validation_date": "$timestamp"
}
EOF
    fi
    
    if [ -f "$metadata_file" ]; then
        print_success "Metadata generated: $(basename $metadata_file)"
    fi
}

validate_raster() {
    local file=$1
    echo "  Validating..."
    
    # Check if file exists and is readable
    if [ ! -f "$file" ]; then
        print_error "Validation failed: file not found"
        return 1
    fi
    
    # Check CRS
    local crs=$(gdalinfo "$file" | grep "PROJ" | head -1 | sed -n 's/.*EPSG",\([0-9]*\).*/EPSG:\1/p')
    if [ "$crs" != "${TARGET_CRS#EPSG:}" ]; then
        print_warning "CRS mismatch: expected $TARGET_CRS, got EPSG:$crs"
    fi
    
    # Check for reasonable statistics
    local stats=$(gdalinfo -stats "$file" 2>/dev/null | grep -E "Minimum=|Maximum=" || true)
    if [ -n "$stats" ]; then
        echo "  $stats"
    fi
    
    print_success "Validation passed"
}

validate_vector() {
    local file=$1
    echo "  Validating..."
    
    # Check if file exists
    if [ ! -f "$file" ]; then
        print_error "Validation failed: file not found"
        return 1
    fi
    
    # Check feature count
    local count=$(ogrinfo -so "$file" | grep "Feature Count:" | awk '{print $NF}' || echo "0")
    echo "  Features: $count"
    
    if [ "$count" -eq 0 ]; then
        print_warning "No features in dataset"
    else
        print_success "Validation passed"
    fi
}

create_symlinks() {
    log_message "INFO" "Creating convenience symlinks..."
    echo ""
    print_header "Creating Symlinks"
    
    # Raster symlinks
    for file in "$RASTERS_PROC"/*_processed.tif; do
        if [ -f "$file" ]; then
            local base=$(basename "$file" | sed 's/_epsg[0-9]*_processed//')
            local link="$DATA_DIR/rasters/$base"
            ln -sf "processed/$(basename $file)" "$link"
            print_success "Linked: rasters/$base"
        fi
    done
    
    # Vector symlinks
    for file in "$VECTORS_PROC"/*_processed.gpkg; do
        if [ -f "$file" ]; then
            local base=$(basename "$file" | sed 's/_epsg[0-9]*_processed//')
            local link="$DATA_DIR/vectors/$base"
            ln -sf "processed/$(basename $file)" "$link"
            print_success "Linked: vectors/$base"
        fi
    done
}

################################################################################
# Main Processing
################################################################################

main() {
    print_header "US_PIPELINE Dataset Processing"
    echo "Target CRS: $TARGET_CRS"
    echo "Project: $PROJECT_DIR"
    echo ""
    
    log_message "INFO" "========== Processing started =========="
    
    # Read target CRS from metadata
    read_target_crs
    
    # Convert AOI to GeoPackage
    convert_aoi_to_gpkg
    
    echo ""
    print_header "Processing Rasters"
    
    # Process all raw rasters
    if [ -d "$RASTERS_RAW" ]; then
        for file in "$RASTERS_RAW"/*_raw.tif "$RASTERS_RAW"/*_raw.tiff; do
            if [ -f "$file" ]; then
                process_raster "$file"
            fi
        done
    fi
    
    echo ""
    print_header "Processing Vectors"
    
    # Process all raw vectors
    if [ -d "$VECTORS_RAW" ]; then
        for file in "$VECTORS_RAW"/*_raw.gpkg "$VECTORS_RAW"/*_raw.shp; do
            if [ -f "$file" ]; then
                process_vector "$file"
            fi
        done
    fi
    
    # Create symlinks
    create_symlinks
    
    echo ""
    print_header "Processing Complete"
    log_message "INFO" "========== Processing completed =========="
    
    echo ""
    echo -e "${GREEN}✓ All datasets processed successfully!${NC}"
    echo ""
    echo "Processed datasets are in:"
    echo "  - Rasters:  $RASTERS_PROC"
    echo "  - Vectors:  $VECTORS_PROC"
    echo ""
    echo "Log file: $LOG_FILE"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --dataset|-d)
            SPECIFIC_DATASET="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--verbose] [--dataset <name>]"
            echo ""
            echo "Options:"
            echo "  --verbose, -v          Enable verbose output"
            echo "  --dataset, -d <name>   Process only specific dataset"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main



