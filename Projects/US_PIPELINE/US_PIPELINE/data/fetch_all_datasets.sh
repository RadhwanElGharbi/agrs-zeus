#!/bin/bash
################################################################################
# US_PIPELINE Master Dataset Fetching Script
# 
# Purpose: Orchestrate all dataset fetching operations following
#          DATASET_FETCHING_PROTOCOLS.md standards
#
# Usage: ./fetch_all_datasets.sh [--dry-run] [--priority <level>]
#
# Compliance: DATASET_FETCHING_PROTOCOLS.md Phase 6
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Project paths
PROJECT_DIR="/opt/agrs/Projects/US_PIPELINE"
DATA_DIR="$PROJECT_DIR/data"
ZEUS_DIR="/opt/agrs"
LOG_FILE="$DATA_DIR/fetch_log.txt"

# Flags
DRY_RUN=false
PRIORITY_FILTER="all"  # all, critical, high, medium

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
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
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

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_existing_dataset() {
    local dataset_name=$1
    local search_pattern=$2
    local data_type=$3  # raster or vector
    
    local raw_dir="$DATA_DIR/${data_type}s/raw"
    local proc_dir="$DATA_DIR/${data_type}s/processed"
    
    # Check raw directory
    if ls "$raw_dir"/${search_pattern}_raw.* 1> /dev/null 2>&1; then
        return 0  # Exists
    fi
    
    # Check processed directory
    if ls "$proc_dir"/${search_pattern}_epsg*_processed.* 1> /dev/null 2>&1; then
        return 0  # Exists
    fi
    
    return 1  # Does not exist
}

fetch_dataset() {
    local priority=$1
    local dataset_name=$2
    local fetch_command=$3
    local search_pattern=$4
    local data_type=$5  # raster or vector
    
    # Filter by priority if specified
    if [ "$PRIORITY_FILTER" != "all" ] && [ "$priority" != "$PRIORITY_FILTER" ]; then
        return 0
    fi
    
    echo ""
    echo -e "${MAGENTA}■${NC} ${dataset_name}"
    echo -e "  Priority: ${priority}"
    echo -e "  Command: ${fetch_command}"
    
    # Check if already exists
    if check_existing_dataset "$dataset_name" "$search_pattern" "$data_type"; then
        print_success "Already exists - skipping"
        log_message "INFO" "$dataset_name: Already exists, skipping fetch"
        return 0
    fi
    
    if [ "$DRY_RUN" = true ]; then
        print_info "DRY RUN: Would fetch $dataset_name"
        return 0
    fi
    
    # Execute fetch command
    log_message "INFO" "Fetching $dataset_name..."
    echo -e "  ${BLUE}Fetching...${NC}"
    
    if eval "$fetch_command"; then
        print_success "Fetch completed"
        log_message "INFO" "$dataset_name: Fetch successful"
    else
        print_error "Fetch failed"
        log_message "ERROR" "$dataset_name: Fetch failed"
        return 1
    fi
}

print_summary() {
    print_header "Fetch Summary"
    
    echo "Critical Datasets:"
    check_summary "DEM" "dem" "raster"
    check_summary "Land Cover" "landcover" "raster"
    check_summary "Roads" "roads" "vector"
    check_summary "Railways" "railways" "vector"
    check_summary "Powerlines" "powerlines" "vector"
    check_summary "Hydrology" "hydrology" "vector"
    
    echo ""
    echo "High Priority Datasets:"
    check_summary "Protected Areas" "protected" "vector"
    check_summary "Buildings" "buildings" "vector"
    check_summary "Soil Data" "soil" "raster"
    check_summary "Boundaries" "boundaries" "vector"
    
    echo ""
    echo "Medium Priority Datasets:"
    check_summary "Population" "population" "raster"
    check_summary "Seismic Hazard" "seismic" "raster"
    check_summary "Landslide" "landslide" "raster"
    check_summary "Climate" "climate" "raster"
}

check_summary() {
    local name=$1
    local pattern=$2
    local type=$3
    
    if check_existing_dataset "$name" "$pattern" "$type"; then
        echo -e "  ${GREEN}✓${NC} $name"
    else
        echo -e "  ${RED}✗${NC} $name"
    fi
}

################################################################################
# Main Fetching Sequence
################################################################################

main() {
    print_header "US_PIPELINE Dataset Fetching"
    
    if [ "$DRY_RUN" = true ]; then
        print_warning "DRY RUN MODE - No actual downloads"
    fi
    
    if [ "$PRIORITY_FILTER" != "all" ]; then
        print_info "Filtering by priority: $PRIORITY_FILTER"
    fi
    
    echo ""
    echo "Project: $PROJECT_DIR"
    echo "Location: Wyoming, USA (EPSG:32613)"
    echo "Log file: $LOG_FILE"
    
    log_message "INFO" "========== Fetch operation started =========="
    
    # Pre-scan report
    print_header "Pre-Fetch Scan"
    print_info "Checking for existing datasets..."
    print_summary
    
    #---------------------------------------------------------------------------
    # PHASE 1: CRITICAL DATASETS (Must have before PIRL training)
    #---------------------------------------------------------------------------
    
    print_header "Phase 1: Critical Datasets"
    
    # 1. DEM (USGS 3DEP)
    fetch_dataset \
        "CRITICAL" \
        "DEM - USGS 3DEP" \
        "echo 'TODO: Implement usgs_3dep_fetch.sh'" \
        "dem" \
        "raster"
    
    # 2. Land Cover (NLCD or ESA WorldCover)
    fetch_dataset \
        "CRITICAL" \
        "Land Cover - NLCD" \
        "echo 'TODO: Implement nlcd_fetch.sh'" \
        "landcover" \
        "raster"
    
    # 3. Roads (OSM)
    fetch_dataset \
        "CRITICAL" \
        "Roads - OpenStreetMap" \
        "$ZEUS_DIR/build/zeus tools osm_roads_fetch --aoi $PROJECT_DIR/aoi/aoi.kmz --output $DATA_DIR/vectors/raw/osm_roads_raw.gpkg --overwrite" \
        "roads" \
        "vector"
    
    # 4. Railways (OSM + FRA)
    fetch_dataset \
        "CRITICAL" \
        "Railways - OpenStreetMap" \
        "$ZEUS_DIR/build/zeus tools osm_railways_fetch --aoi $PROJECT_DIR/aoi/aoi.kmz --output $DATA_DIR/vectors/raw/osm_railways_raw.gpkg --overwrite" \
        "railways" \
        "vector"
    
    # 5. Powerlines (OSM + HIFLD)
    fetch_dataset \
        "CRITICAL" \
        "Powerlines - OpenStreetMap" \
        "$ZEUS_DIR/build/zeus tools osm_power_fetch --aoi $PROJECT_DIR/aoi/aoi.kmz --output $DATA_DIR/vectors/raw/osm_powerlines_raw.gpkg --overwrite" \
        "powerlines" \
        "vector"
    
    # 6. Hydrology/Waterways (OSM + NHD)
    fetch_dataset \
        "CRITICAL" \
        "Waterways - OpenStreetMap" \
        "$ZEUS_DIR/build/zeus tools osm_waterways_fetch --aoi $PROJECT_DIR/aoi/aoi.kmz --output $DATA_DIR/vectors/raw/osm_waterways_raw.gpkg --overwrite" \
        "waterways" \
        "vector"
    
    #---------------------------------------------------------------------------
    # PHASE 2: HIGH PRIORITY DATASETS
    #---------------------------------------------------------------------------
    
    if [ "$PRIORITY_FILTER" = "all" ] || [ "$PRIORITY_FILTER" = "high" ]; then
        print_header "Phase 2: High Priority Datasets"
        
        # 7. Protected Areas (PAD-US)
        fetch_dataset \
            "HIGH" \
            "Protected Areas - PAD-US" \
            "echo 'TODO: Implement padus_fetch.sh'" \
            "protected" \
            "vector"
        
        # 8. Buildings (OSM)
        fetch_dataset \
            "HIGH" \
            "Buildings - OpenStreetMap" \
            "$ZEUS_DIR/build/zeus osm-buildings-fetch --project-dir $PROJECT_DIR" \
            "buildings" \
            "vector"
        
        # 9. Soil Data (SSURGO)
        fetch_dataset \
            "HIGH" \
            "Soil - SSURGO" \
            "echo 'TODO: Implement ssurgo_fetch.sh'" \
            "soil" \
            "raster"
        
        # 10. Administrative Boundaries (TIGER)
        fetch_dataset \
            "HIGH" \
            "Boundaries - TIGER" \
            "echo 'TODO: Implement tiger_boundaries_fetch.sh'" \
            "boundaries" \
            "vector"
    fi
    
    #---------------------------------------------------------------------------
    # PHASE 3: MEDIUM PRIORITY DATASETS
    #---------------------------------------------------------------------------
    
    if [ "$PRIORITY_FILTER" = "all" ] || [ "$PRIORITY_FILTER" = "medium" ]; then
        print_header "Phase 3: Medium Priority Datasets"
        
        # 11. Population (LandScan)
        fetch_dataset \
            "MEDIUM" \
            "Population - LandScan" \
            "echo 'TODO: Implement landscan_fetch.sh'" \
            "population" \
            "raster"
        
        # 12. Seismic Hazard (USGS)
        fetch_dataset \
            "MEDIUM" \
            "Seismic Hazard - USGS" \
            "echo 'TODO: Implement usgs_seismic_fetch.sh'" \
            "seismic" \
            "raster"
        
        # 13. Landslide Susceptibility (USGS)
        fetch_dataset \
            "MEDIUM" \
            "Landslide - USGS" \
            "echo 'TODO: Implement usgs_landslide_fetch.sh'" \
            "landslide" \
            "raster"
        
        # 14. Climate (PRISM)
        fetch_dataset \
            "MEDIUM" \
            "Climate - PRISM" \
            "echo 'TODO: Implement prism_fetch.sh'" \
            "climate" \
            "raster"
    fi
    
    #---------------------------------------------------------------------------
    # Post-Fetch Summary
    #---------------------------------------------------------------------------
    
    print_header "Fetch Operation Complete"
    log_message "INFO" "========== Fetch operation completed =========="
    
    print_summary
    
    echo ""
    if [ "$DRY_RUN" = false ]; then
        print_info "Next step: Run ./process_all_datasets.sh to process raw data"
    fi
    
    echo ""
    echo -e "${GREEN}✓ Fetch operation complete!${NC}"
    echo ""
}

################################################################################
# Command Line Argument Parsing
################################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --priority|-p)
            PRIORITY_FILTER="$2"
            if [ "$PRIORITY_FILTER" != "all" ] && [ "$PRIORITY_FILTER" != "critical" ] && \
               [ "$PRIORITY_FILTER" != "high" ] && [ "$PRIORITY_FILTER" != "medium" ]; then
                echo "Error: Priority must be 'all', 'critical', 'high', or 'medium'"
                exit 1
            fi
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run              Show what would be downloaded without fetching"
            echo "  --priority, -p LEVEL   Fetch only datasets with specified priority"
            echo "                         (all, critical, high, medium)"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                     # Fetch all datasets"
            echo "  $0 --dry-run           # Preview what will be fetched"
            echo "  $0 --priority critical # Fetch only critical datasets"
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

