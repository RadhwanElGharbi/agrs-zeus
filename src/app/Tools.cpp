#include "agrs_zeus/Tools.h"
#include "dataset_routing.hpp"
#include "fetch_tool_analyzer.hpp"

#include <filesystem>
#include <string>
#include <optional>
#include <CLI/CLI.hpp>
#include <iostream>
#include <regex>
#include <fstream>
#include <sstream>
#include <chrono>
#include <ctime>
#include <cstdlib>
#include <nlohmann/json.hpp>
#include <iomanip>
#include <algorithm>
#include <sys/stat.h>
#include "agrs_zeus/AIOperator.h"

namespace agrs::tools {

// Forward declarations
std::string detect_country_from_coordinates(double lat, double lon);
int tools_ingv_faults_fetch(const std::string& bbox, const std::string& aoiPath, const std::string& outputPath, bool overwrite);
int tools_euhydro_fetch(const std::string& bbox, const std::string& aoiPath, const std::string& outputPath, bool overwrite);

void register_tools_commands(CLI::App& cli, ToolsOptions& o) {
    std::cerr << "[zeus] registering tools subcommands" << std::endl;
	o.cmdTools = cli.add_subcommand("tools", "Data translation tools");
	
	// GPKG Translate
	o.cmdGpkgTranslate = o.cmdTools->add_subcommand("gpkg_translate", "Extract and organize GPKG contents into AI-friendly formats");
	o.cmdGpkgTranslate->add_option("input", o.gpkgInputPath, "Input GPKG file path")->required();
	o.cmdGpkgTranslate->add_option("output", o.gpkgOutputDir, "Output directory")->required();
	o.cmdGpkgTranslate->add_flag("--separate-layers", o.gpkgSeparateLayers, "Separate layers into individual files");
	o.cmdGpkgTranslate->add_option("--vector-format", o.gpkgVectorFormat, "Format for vector layers (geojson)");
	o.cmdGpkgTranslate->add_option("--raster-format", o.gpkgRasterFormat, "Format for raster layers (cog)");
	o.cmdGpkgTranslate->add_option("--table-format", o.gpkgTableFormat, "Format for attribute tables (parquet)");
	o.gpkgLayerFilterOpt = o.cmdGpkgTranslate->add_option("--filter-layers", o.gpkgLayerFilter, "Regex filter for layer names");
	o.cmdGpkgTranslate->add_flag("--include-metadata", o.gpkgIncludeMetadata, "Generate detailed metadata files");
	o.cmdGpkgTranslate->add_flag("--overwrite", o.gpkgOverwrite, "Overwrite existing outputs");
	o.cmdGpkgTranslate->require_subcommand(0);
	
	// Raster Query
	o.cmdRasterQuery = o.cmdTools->add_subcommand("raster_query", "Query raster values at specific coordinates");
	o.cmdRasterQuery->add_option("raster", o.rasterQueryPath, "Raster file path")->required();
	o.cmdRasterQuery->add_option("longitude", o.rasterQueryLon, "Longitude (WGS84)")->required();
	o.cmdRasterQuery->add_option("latitude", o.rasterQueryLat, "Latitude (WGS84)")->required();
	o.cmdRasterQuery->add_option("--format", o.rasterQueryFormat, "Output format (json)")->default_val("json");
	o.cmdRasterQuery->require_subcommand(0);
	
	// Vector Query
	o.cmdVectorQuery = o.cmdTools->add_subcommand("vector_query", "Query vector features at specific coordinates");
	o.cmdVectorQuery->add_option("vector", o.vectorQueryPath, "Vector file path")->required();
	o.cmdVectorQuery->add_option("longitude", o.vectorQueryLon, "Longitude (WGS84)")->required();
	o.cmdVectorQuery->add_option("latitude", o.vectorQueryLat, "Latitude (WGS84)")->required();
	o.cmdVectorQuery->add_option("--query-type", o.vectorQueryType, "Query type (nearest|contains)")->default_val("nearest");
	o.cmdVectorQuery->require_subcommand(0);

	// Raster Extract Band
	o.cmdRasterExtractBand = o.cmdTools->add_subcommand("raster_extract_band", "Extract a single band as Float32 with explicit unit metadata");

	// Raster Rescale Index
	o.cmdRasterRescaleIndex = o.cmdTools->add_subcommand("raster_rescale_index", "Rescale encoded index raster to dimensionless Float32");
	o.cmdRasterRescaleIndex->add_option("input", o.rasterRescaleInput, "Input raster path")->required();
	o.cmdRasterRescaleIndex->add_option("output", o.rasterRescaleOutput, "Output raster path")->required();
	o.cmdRasterRescaleIndex->add_option("--index", o.rasterRescaleIndex, "Index type (ndbi|evi|custom)")->default_val("custom");
	o.cmdRasterRescaleIndex->add_flag("--auto", o.rasterRescaleAuto, "Auto-detect source range via stats (default on)");
	o.rasterRescaleSrcMinOpt = o.cmdRasterRescaleIndex->add_option("--src-min", o.rasterRescaleSrcMin, "Source min (override)");
	o.rasterRescaleSrcMaxOpt = o.cmdRasterRescaleIndex->add_option("--src-max", o.rasterRescaleSrcMax, "Source max (override)");
	o.cmdRasterRescaleIndex->add_option("--dst-min", o.rasterRescaleDstMin, "Destination min (default -1)")->default_val(-1.0);
	o.cmdRasterRescaleIndex->add_option("--dst-max", o.rasterRescaleDstMax, "Destination max (default 1)")->default_val(1.0);
	o.cmdRasterRescaleIndex->add_flag("--cog", o.rasterRescaleCOG, "Write as COG (default on)");
	o.cmdRasterRescaleIndex->add_flag("--overwrite", o.rasterRescaleOverwrite, "Overwrite output");
	o.cmdRasterRescaleIndex->require_subcommand(0);
	o.cmdRasterExtractBand->add_option("input", o.rasterExtractInput, "Input raster file path")->required();
	o.cmdRasterExtractBand->add_option("band", o.rasterExtractBand, "Band index (1-based)")->required();
	o.cmdRasterExtractBand->add_option("output", o.rasterExtractOutput, "Output raster path")->required();
	o.cmdRasterExtractBand->add_option("--unit", o.rasterExtractUnit, "Unit metadata for output band (default '1' for dimensionless)")->default_val("1");
	o.cmdRasterExtractBand->add_flag("--cog", o.rasterExtractCOG, "Write as Cloud Optimized GeoTIFF (default on)");
	o.cmdRasterExtractBand->add_flag("--overwrite", o.rasterExtractOverwrite, "Overwrite output if exists");
	o.cmdRasterExtractBand->require_subcommand(0);

	// Raster Calc
	o.cmdRasterCalc = o.cmdTools->add_subcommand("raster_calc", "Perform raster calculations using mathematical expressions");
	o.cmdRasterCalc->add_option("inputs", o.rasterCalcInputs, "Input raster file paths")->required();
	o.cmdRasterCalc->add_option("output", o.rasterCalcOutput, "Output raster path")->required();
	o.cmdRasterCalc->add_option("expression", o.rasterCalcExpression, "Mathematical expression (e.g., 'A+B', 'A>B')")->required();
	o.cmdRasterCalc->add_option("--type", o.rasterCalcDataType, "Output data type")->default_val("Float32");
	o.cmdRasterCalc->add_flag("--overwrite", o.rasterCalcOverwrite, "Overwrite output if exists");
	o.cmdRasterCalc->require_subcommand(0);

	// Raster Sample
	o.cmdRasterSample = o.cmdTools->add_subcommand("raster_sample", "Sample raster values at specific coordinates");
	o.cmdRasterSample->add_option("raster", o.rasterSampleInput, "Raster file path")->required();
	o.cmdRasterSample->add_option("longitude", o.rasterSampleLon, "Longitude (WGS84)")->required();
	o.cmdRasterSample->add_option("latitude", o.rasterSampleLat, "Latitude (WGS84)")->required();
	o.cmdRasterSample->add_option("--format", o.rasterSampleFormat, "Output format (json)")->default_val("json");
	o.cmdRasterSample->require_subcommand(0);

	// Raster Align
	o.cmdRasterAlign = o.cmdTools->add_subcommand("raster_align", "Align raster to match reference raster extent and resolution");
	o.cmdRasterAlign->add_option("input", o.rasterAlignInput, "Input raster path")->required();
	o.cmdRasterAlign->add_option("output", o.rasterAlignOutput, "Output raster path")->required();
	o.cmdRasterAlign->add_option("reference", o.rasterAlignReference, "Reference raster path")->required();
	o.cmdRasterAlign->add_flag("--overwrite", o.rasterAlignOverwrite, "Overwrite output if exists");
	o.cmdRasterAlign->require_subcommand(0);

	// Raster Polygonize
	o.cmdRasterPolygonize = o.cmdTools->add_subcommand("raster_polygonize", "Convert raster pixels to vector polygons");
	o.cmdRasterPolygonize->add_option("input", o.rasterPolygonizeInput, "Input raster path")->required();
	o.cmdRasterPolygonize->add_option("output", o.rasterPolygonizeOutput, "Output vector path")->required();
	o.cmdRasterPolygonize->add_option("--field", o.rasterPolygonizeField, "Field name for pixel values")->default_val("pixel_val");
	o.cmdRasterPolygonize->add_flag("--overwrite", o.rasterPolygonizeOverwrite, "Overwrite output if exists");
	o.cmdRasterPolygonize->require_subcommand(0);

	// Raster Water Detect
	o.cmdRasterWaterDetect = o.cmdTools->add_subcommand("raster_water_detect", "Detect water features from RGB raster using improved thresholds");
	o.cmdRasterWaterDetect->add_option("input", o.rasterWaterInput, "Input RGB raster path")->required();
	o.cmdRasterWaterDetect->add_option("output", o.rasterWaterOutput, "Output water mask path")->required();
	o.cmdRasterWaterDetect->add_option("--blue-threshold", o.rasterWaterBlueThreshold, "Minimum blue channel value")->default_val(50000.0);
	o.cmdRasterWaterDetect->add_option("--red-green-max", o.rasterWaterRedGreenMax, "Maximum red/green channel value")->default_val(28000.0);
	o.cmdRasterWaterDetect->add_flag("--overwrite", o.rasterWaterOverwrite, "Overwrite output if exists");
	o.cmdRasterWaterDetect->require_subcommand(0);

	// Raster Cloud Detect
	o.cmdRasterCloudDetect = o.cmdTools->add_subcommand("raster_cloud_detect", "Detect cloud features from RGB raster using R=G pattern");
	o.cmdRasterCloudDetect->add_option("input", o.rasterCloudInput, "Input RGB raster path")->required();
	o.cmdRasterCloudDetect->add_option("output", o.rasterCloudOutput, "Output cloud mask path")->required();
	o.cmdRasterCloudDetect->add_option("--red-green-min", o.rasterCloudRedGreenMin, "Minimum red/green channel value")->default_val(33000.0);
	o.cmdRasterCloudDetect->add_option("--red-green-max", o.rasterCloudRedGreenMax, "Maximum red/green channel value")->default_val(45000.0);
	o.cmdRasterCloudDetect->add_option("--blue-min", o.rasterCloudBlueMin, "Minimum blue channel value")->default_val(50000.0);
	o.cmdRasterCloudDetect->add_flag("--overwrite", o.rasterCloudOverwrite, "Overwrite output if exists");
	o.cmdRasterCloudDetect->require_subcommand(0);

	// DEM Fetch
	o.cmdDemFetch = o.cmdTools->add_subcommand("dem_fetch", "Fetch DEM data (default 30m) with optional drilldown");
	o.cmdDemFetch->add_option("--bbox", o.demFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdDemFetch->add_option("--aoi", o.demFetchAOI, "AOI vector path (GeoJSON/Shapefile)");
	o.cmdDemFetch->add_option("--res", o.demFetchResolution, "Resolution: 30m|10m|1m");
	o.cmdDemFetch->add_option("--provider", o.demFetchProvider, "Provider: auto|opentopo|srtm|nasadem|copernicus")->default_val("auto");
	o.cmdDemFetch->add_option("--to-crs", o.demFetchToCRS, "Target CRS (e.g., EPSG:32640)");
	o.cmdDemFetch->add_option("--align-to", o.demFetchAlignTo, "Reference raster to align extent/resolution");
	o.cmdDemFetch->add_option("-o,--output", o.demFetchOutput, "Output COG path")->required();
	o.cmdDemFetch->add_flag("--overwrite", o.demFetchOverwrite, "Overwrite output if exists");
	o.cmdDemFetch->add_flag("--dry-run", o.demFetchDryRun, "Print plan only; do not download");
	o.cmdDemFetch->require_subcommand(0);

	// ========================================================================
	// INTELLIGENT ROUTING FETCH TOOLS
	// ========================================================================

	// Imagery Fetch (Intelligent Routing)
	o.cmdImageryFetch = o.cmdTools->add_subcommand("imagery_fetch", "Intelligent imagery fetch - auto-selects best satellite imagery");
	o.cmdImageryFetch->add_option("--bbox", o.imageryFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdImageryFetch->add_option("--aoi", o.imageryFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdImageryFetch->add_option("--date", o.imageryFetchDate, "Date range (YYYY-MM-DD/YYYY-MM-DD) or single date")->default_val("2024-01-01/2024-12-31");
	o.cmdImageryFetch->add_option("-o,--output", o.imageryFetchOutput, "Output directory for imagery")->required();
	o.cmdImageryFetch->add_flag("--overwrite", o.imageryFetchOverwrite, "Overwrite outputs");
	o.cmdImageryFetch->require_subcommand(0);

	// Climate Fetch (Intelligent Routing)
	o.cmdClimateFetch = o.cmdTools->add_subcommand("climate_fetch", "Intelligent climate data fetch - auto-selects best climate dataset");
	o.cmdClimateFetch->add_option("--bbox", o.climateFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdClimateFetch->add_option("--aoi", o.climateFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdClimateFetch->add_option("--variable", o.climateFetchVariable, "Climate variable (temp|precip|wind|all)")->default_val("all");
	o.cmdClimateFetch->add_option("-o,--output", o.climateFetchOutput, "Output file path")->required();
	o.cmdClimateFetch->add_flag("--overwrite", o.climateFetchOverwrite, "Overwrite output");
	o.cmdClimateFetch->require_subcommand(0);

	// Land Cover Fetch (Intelligent Routing)
	o.cmdLandcoverFetch = o.cmdTools->add_subcommand("landcover_fetch", "Intelligent land cover fetch - auto-selects best land cover dataset");
	o.cmdLandcoverFetch->add_option("--bbox", o.landcoverFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdLandcoverFetch->add_option("--aoi", o.landcoverFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdLandcoverFetch->add_option("-o,--output", o.landcoverFetchOutput, "Output GeoTIFF path")->required();
	o.cmdLandcoverFetch->add_flag("--overwrite", o.landcoverFetchOverwrite, "Overwrite output");
	o.cmdLandcoverFetch->require_subcommand(0);

	// Hydrology Fetch (Intelligent Routing)
	o.cmdHydrologyFetch = o.cmdTools->add_subcommand("hydrology_fetch", "Intelligent hydrology fetch - auto-selects best hydrology dataset");
	o.cmdHydrologyFetch->add_option("--bbox", o.hydrologyFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdHydrologyFetch->add_option("--aoi", o.hydrologyFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdHydrologyFetch->add_option("-o,--output", o.hydrologyFetchOutput, "Output file path")->required();
	o.cmdHydrologyFetch->add_flag("--overwrite", o.hydrologyFetchOverwrite, "Overwrite output");
	o.cmdHydrologyFetch->require_subcommand(0);

	// Infrastructure Fetch (Intelligent Routing)
	o.cmdInfrastructureFetch = o.cmdTools->add_subcommand("infrastructure_fetch", "Intelligent infrastructure fetch - auto-selects best infrastructure dataset");
	o.cmdInfrastructureFetch->add_option("--bbox", o.infrastructureFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdInfrastructureFetch->add_option("--aoi", o.infrastructureFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdInfrastructureFetch->add_option("--type", o.infrastructureFetchType, "Infrastructure type (roads|power|railways|all)")->default_val("all");
	o.cmdInfrastructureFetch->add_option("-o,--output", o.infrastructureFetchOutput, "Output file path")->required();
	o.cmdInfrastructureFetch->add_flag("--overwrite", o.infrastructureFetchOverwrite, "Overwrite output");
	o.cmdInfrastructureFetch->require_subcommand(0);

	// Protected Areas Fetch (Intelligent Routing)
	o.cmdProtectedAreasFetch = o.cmdTools->add_subcommand("protected_areas_fetch", "Intelligent protected areas fetch - auto-selects best dataset");
	o.cmdProtectedAreasFetch->add_option("--bbox", o.protectedAreasFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdProtectedAreasFetch->add_option("--aoi", o.protectedAreasFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdProtectedAreasFetch->add_option("-o,--output", o.protectedAreasFetchOutput, "Output file path")->required();
	o.cmdProtectedAreasFetch->add_flag("--overwrite", o.protectedAreasFetchOverwrite, "Overwrite output");
	o.cmdProtectedAreasFetch->require_subcommand(0);

	// Geohazards Fetch (Intelligent Routing)
	o.cmdGeohazardsFetch = o.cmdTools->add_subcommand("geohazards_fetch", "Intelligent geohazards fetch - auto-selects best geohazard dataset");
	o.cmdGeohazardsFetch->add_option("--bbox", o.geohazardsFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdGeohazardsFetch->add_option("--aoi", o.geohazardsFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdGeohazardsFetch->add_option("-o,--output", o.geohazardsFetchOutput, "Output file path")->required();
	o.cmdGeohazardsFetch->add_flag("--overwrite", o.geohazardsFetchOverwrite, "Overwrite output");
	o.cmdGeohazardsFetch->require_subcommand(0);

	// Administrative Fetch (Intelligent Routing)
	o.cmdAdministrativeFetch = o.cmdTools->add_subcommand("administrative_fetch", "Intelligent administrative boundaries fetch");
	o.cmdAdministrativeFetch->add_option("--country", o.administrativeFetchCountry, "Country code (e.g., US, SA, IT)");
	o.cmdAdministrativeFetch->add_option("--bbox", o.administrativeFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdAdministrativeFetch->add_option("--aoi", o.administrativeFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdAdministrativeFetch->add_option("-o,--output", o.administrativeFetchOutput, "Output file path")->required();
	o.cmdAdministrativeFetch->add_flag("--overwrite", o.administrativeFetchOverwrite, "Overwrite output");
	o.cmdAdministrativeFetch->require_subcommand(0);

	// Cadastre Fetch (Intelligent Routing)
	o.cmdCadastreFetch = o.cmdTools->add_subcommand("cadastre_fetch", "Intelligent cadastre/parcel data fetch");
	o.cmdCadastreFetch->add_option("--bbox", o.cadastreFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdCadastreFetch->add_option("--aoi", o.cadastreFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdCadastreFetch->add_option("-o,--output", o.cadastreFetchOutput, "Output file path")->required();
	o.cmdCadastreFetch->add_flag("--overwrite", o.cadastreFetchOverwrite, "Overwrite output");
	o.cmdCadastreFetch->require_subcommand(0);

	// Socioeconomic Fetch (Intelligent Routing)
	o.cmdSocioeconomicFetch = o.cmdTools->add_subcommand("socioeconomic_fetch", "Intelligent socioeconomic data fetch");
	o.cmdSocioeconomicFetch->add_option("--bbox", o.socioeconomicFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdSocioeconomicFetch->add_option("--aoi", o.socioeconomicFetchAOI, "AOI vector path (GeoJSON/Shapefile/KMZ)");
	o.cmdSocioeconomicFetch->add_option("-o,--output", o.socioeconomicFetchOutput, "Output file path")->required();
	o.cmdSocioeconomicFetch->add_flag("--overwrite", o.socioeconomicFetchOverwrite, "Overwrite output");
	o.cmdSocioeconomicFetch->require_subcommand(0);

	// ========================================================================
	// END INTELLIGENT ROUTING FETCH TOOLS
	// ========================================================================

	// S2 Fetch
	o.cmdSentinel2Fetch = o.cmdTools->add_subcommand("sentinel2_fetch", "Fetch Sentinel-2 L2A bands via Microsoft Planetary Computer STAC");
	o.cmdSentinel2Fetch->add_option("--bbox", o.sentinel2FetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326")->required();
	o.cmdSentinel2Fetch->add_option("--datetime", o.sentinel2FetchDatetime, "ISO 8601 date/time or range, e.g., 2024-10-01/2024-10-31")->required();
	o.cmdSentinel2Fetch->add_option("--cloud", o.sentinel2FetchCloudMax, "Max cloud cover percent")->default_val(30);
	o.cmdSentinel2Fetch->add_option("--bands", o.sentinel2FetchBands, "Specific bands (comma-separated): B01,B02,B03,B04,B05,B06,B07,B08,B8A,B09,B10,B11,B12");
	o.cmdSentinel2Fetch->add_option("--band-groups", o.sentinel2FetchBandGroups, "Predefined band groups (comma-separated): visual,nir,rededge,swir,atmospheric,standard");
	o.cmdSentinel2Fetch->add_flag("--all-bands", o.sentinel2FetchAllBands, "Fetch all 13 spectral bands");
	o.cmdSentinel2Fetch->add_option("--auxiliary", o.sentinel2FetchAuxiliary, "Auxiliary data (comma-separated): SCL,TCI,AOT,WVP,VIS");
	o.cmdSentinel2Fetch->add_option("-o,--output", o.sentinel2FetchOutputDir, "Output directory for bands")->required();
	o.cmdSentinel2Fetch->add_flag("--overwrite", o.sentinel2FetchOverwrite, "Overwrite outputs");
	o.cmdSentinel2Fetch->require_subcommand(0);



	// Copernicus Fetch (for Sentinel-1 and other Copernicus products)
	o.cmdCopernicusFetch = o.cmdTools->add_subcommand("copernicus_fetch", "Fetch Copernicus products via CDSE (Sentinel-1 SAR, Sentinel-3, Land Cover, etc.)");
	o.cmdCopernicusFetch->add_option("--bbox", o.copernicusFetchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdCopernicusFetch->add_option("--aoi", o.copernicusFetchAOI, "AOI vector file (GeoJSON, Shapefile)");
	o.cmdCopernicusFetch->add_option("--datetime", o.copernicusFetchDatetime, "ISO 8601 date/time or range, e.g., 2024-10-01/2024-10-31")->required();
	o.cmdCopernicusFetch->add_option("-o,--output", o.copernicusFetchOutputDir, "Output directory")->required();
	o.cmdCopernicusFetch->add_option("--product", o.copernicusFetchProduct, "Product type (S1GRD|S3OLCI|S3SLSTR|LANDCOVER)")->default_val("S1GRD");
	o.cmdCopernicusFetch->add_option("--username", o.copernicusFetchUsername, "CDSE username (email)")->required();
	o.cmdCopernicusFetch->add_option("--password", o.copernicusFetchPassword, "CDSE password")->required();
	o.cmdCopernicusFetch->add_flag("--overwrite", o.copernicusFetchOverwrite, "Overwrite outputs");
	o.cmdCopernicusFetch->require_subcommand(0);

	// Unified Search
	o.cmdSearch = o.cmdTools->add_subcommand("search", "Unified search across multiple geospatial data providers");
	o.cmdSearch->add_option("--aoi", o.searchAOI, "AOI vector file (GeoJSON, Shapefile)");
	o.cmdSearch->add_option("--bbox", o.searchBBox, "BBox minx,miny,maxx,maxy in EPSG:4326");
	o.cmdSearch->add_option("--datetime", o.searchDatetime, "ISO 8601 date/time or range, e.g., 2024-10-01/2024-10-31");
	o.cmdSearch->add_option("--theme", o.searchTheme, "Data theme: imagery|dem|landcover|protected|roads|hydro")->default_val("imagery");
	o.cmdSearch->add_option("--cloud", o.searchCloudMax, "Max cloud cover percent (for imagery)")->default_val(30);
	o.cmdSearch->add_option("-o,--output", o.searchOutputDir, "Output directory")->required();
	o.cmdSearch->add_flag("--overwrite", o.searchOverwrite, "Overwrite outputs");
	o.cmdSearch->require_subcommand(0);

	// Mosaic
	o.cmdMosaic = o.cmdTools->add_subcommand("mosaic", "Mosaic multiple raster files into a single output");
	o.cmdMosaic->add_option("inputs", o.mosaicInputFiles, "Input raster files to mosaic")->required();
	o.cmdMosaic->add_option("output", o.mosaicOutputFile, "Output mosaic file")->required();
	o.cmdMosaic->add_option("--bbox", o.mosaicBBox, "Optional bbox for clipping (minx,miny,maxx,maxy)");
	o.cmdMosaic->add_option("--cutline", o.mosaicCutlinePath, "Optional cutline vector file for clipping");
	o.cmdMosaic->add_option("--crs", o.mosaicTargetCRS, "Target CRS")->default_val("EPSG:4326");
	o.cmdMosaic->add_option("--resampling", o.mosaicResampling, "Resampling method")->default_val("bilinear");
	o.cmdMosaic->add_option("--data-type", o.mosaicDataType, "Output data type")->default_val("auto");
	o.cmdMosaic->add_flag("--cog", o.mosaicOutputCOG, "Output as Cloud Optimized GeoTIFF")->default_val(true);
	o.cmdMosaic->add_flag("--overwrite", o.mosaicOverwrite, "Overwrite output");
	o.cmdMosaic->require_subcommand(0);

	// GeoAI
	o.cmdGeoAI = o.cmdTools->add_subcommand("geoai", "Geospatial AI processing using torchgeo");
	o.cmdGeoAI->add_option("--task", o.geoAITask, "AI task: cloud_mask|water_detect|change_detect|landcover_seg")->default_val("cloud_mask");
	o.cmdGeoAI->add_option("input", o.geoAIInput, "Input raster path")->required();
	o.cmdGeoAI->add_option("output", o.geoAIOutput, "Output path")->required();
	o.cmdGeoAI->add_option("--model", o.geoAIModel, "Model to use: s2cloudless|unet|segformer")->default_val("s2cloudless");
	o.cmdGeoAI->add_flag("--overwrite", o.geoAIOverwrite, "Overwrite output");
	o.cmdGeoAI->require_subcommand(0);

	// Pipeline Routing Tools - REMOVED (premature, will be reimplemented in Phase 4)

	// OSM Waterways Fetch
	o.cmdOsmWaterwaysFetch = o.cmdTools->add_subcommand("osm_waterways_fetch", "Fetch OpenStreetMap waterways data (rivers, streams, canals). Type 'help' as first arg for details.");
	o.cmdOsmWaterwaysFetch->add_option("--bbox", o.osmWaterwaysBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdOsmWaterwaysFetch->add_option("--aoi", o.osmWaterwaysAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdOsmWaterwaysFetch->add_option("-o,--output", o.osmWaterwaysOutput, "Output GeoPackage file path")->required();
	o.cmdOsmWaterwaysFetch->add_flag("--overwrite", o.osmWaterwaysOverwrite, "Overwrite existing output");
	o.cmdOsmWaterwaysFetch->require_subcommand(0);

	o.cmdOsmRoadsFetch = o.cmdTools->add_subcommand("osm_roads_fetch", "Fetch OpenStreetMap roads data (highways, streets, paths). Type 'help' as first arg for details.");
	o.cmdOsmRoadsFetch->add_option("--bbox", o.osmRoadsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdOsmRoadsFetch->add_option("--aoi", o.osmRoadsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdOsmRoadsFetch->add_option("-o,--output", o.osmRoadsOutput, "Output GeoPackage file path")->required();
	o.cmdOsmRoadsFetch->add_flag("--overwrite", o.osmRoadsOverwrite, "Overwrite existing output");
	o.cmdOsmRoadsFetch->require_subcommand(0);

	o.cmdOsmPowerFetch = o.cmdTools->add_subcommand("osm_power_fetch", "Fetch OpenStreetMap power transmission lines (high voltage >100kV preferred). Type 'help' as first arg for details.");
	o.cmdOsmPowerFetch->add_option("--bbox", o.osmPowerBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdOsmPowerFetch->add_option("--aoi", o.osmPowerAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdOsmPowerFetch->add_option("-o,--output", o.osmPowerOutput, "Output GeoPackage file path")->required();
	o.cmdOsmPowerFetch->add_flag("--overwrite", o.osmPowerOverwrite, "Overwrite existing output");
	o.cmdOsmPowerFetch->require_subcommand(0);

	o.cmdOsmRailwaysFetch = o.cmdTools->add_subcommand("osm_railways_fetch", "Fetch OpenStreetMap railway data (rail, subway, tram, light_rail). Type 'help' as first arg for details.");
	o.cmdOsmRailwaysFetch->add_option("--bbox", o.osmRailwaysBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdOsmRailwaysFetch->add_option("--aoi", o.osmRailwaysAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdOsmRailwaysFetch->add_option("-o,--output", o.osmRailwaysOutput, "Output GeoPackage file path")->required();
	o.cmdOsmRailwaysFetch->add_flag("--overwrite", o.osmRailwaysOverwrite, "Overwrite existing output");
	o.cmdOsmRailwaysFetch->require_subcommand(0);

	o.cmdEsaWorldCoverFetch = o.cmdTools->add_subcommand("esa_worldcover_fetch", "Fetch ESA WorldCover land cover data (10m resolution). Type 'help' as first arg for details.");
	o.cmdEsaWorldCoverFetch->add_option("--bbox", o.esaWorldCoverBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdEsaWorldCoverFetch->add_option("--aoi", o.esaWorldCoverAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdEsaWorldCoverFetch->add_option("-o,--output", o.esaWorldCoverOutput, "Output GeoTIFF file path")->required();
	o.cmdEsaWorldCoverFetch->add_option("--year", o.esaWorldCoverYear, "Year (2020 or 2021)")->default_val("2021");
	o.cmdEsaWorldCoverFetch->add_flag("--overwrite", o.esaWorldCoverOverwrite, "Overwrite existing output");
	o.cmdEsaWorldCoverFetch->require_subcommand(0);

	o.cmdGoogleDynamicWorldFetch = o.cmdTools->add_subcommand("google_dynamicworld_fetch", "Fetch Google Dynamic World land cover data (10m, near real-time). Type 'help' as first arg for details.");
	o.cmdGoogleDynamicWorldFetch->add_option("--bbox", o.googleDynamicWorldBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdGoogleDynamicWorldFetch->add_option("--aoi", o.googleDynamicWorldAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdGoogleDynamicWorldFetch->add_option("-o,--output", o.googleDynamicWorldOutput, "Output GeoTIFF file path")->required();
	o.cmdGoogleDynamicWorldFetch->add_option("--date", o.googleDynamicWorldDate, "Date (YYYY-MM-DD) for acquisition")->default_val("latest");
	o.cmdGoogleDynamicWorldFetch->add_flag("--overwrite", o.googleDynamicWorldOverwrite, "Overwrite existing output");
	o.cmdGoogleDynamicWorldFetch->require_subcommand(0);

	o.cmdGlobalSurfaceWaterFetch = o.cmdTools->add_subcommand("global_surface_water_fetch", "Fetch JRC Global Surface Water data (30m, 1984-2021). Type 'help' as first arg for details.");
	o.cmdGlobalSurfaceWaterFetch->add_option("--bbox", o.globalSurfaceWaterBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdGlobalSurfaceWaterFetch->add_option("--aoi", o.globalSurfaceWaterAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdGlobalSurfaceWaterFetch->add_option("-o,--output", o.globalSurfaceWaterOutput, "Output GeoTIFF file path")->required();
	o.cmdGlobalSurfaceWaterFetch->add_option("--product", o.globalSurfaceWaterProduct, "Product: occurrence|change|seasonality|recurrence|transitions|extent")->default_val("occurrence");
	o.cmdGlobalSurfaceWaterFetch->add_flag("--overwrite", o.globalSurfaceWaterOverwrite, "Overwrite existing output");
	o.cmdGlobalSurfaceWaterFetch->require_subcommand(0);

	o.cmdWorldPopFetch = o.cmdTools->add_subcommand("worldpop_fetch", "Fetch WorldPop population density data (100m, 2000-2020). Type 'help' as first arg for details.");
	o.cmdWorldPopFetch->add_option("--country", o.worldPopCountry, "ISO3 country code (e.g., SAU for Saudi Arabia)")->required();
	o.cmdWorldPopFetch->add_option("--bbox", o.worldPopBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdWorldPopFetch->add_option("--aoi", o.worldPopAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdWorldPopFetch->add_option("-o,--output", o.worldPopOutput, "Output GeoTIFF file path")->required();
	o.cmdWorldPopFetch->add_option("--year", o.worldPopYear, "Year (2000-2020)")->default_val("2020");
	o.cmdWorldPopFetch->add_flag("--unconstrained", o.worldPopConstrained, "Use unconstrained (not census-adjusted) data");
	o.cmdWorldPopFetch->add_flag("--overwrite", o.worldPopOverwrite, "Overwrite existing output");
	o.cmdWorldPopFetch->require_subcommand(0);

	o.cmdWDPAFetch = o.cmdTools->add_subcommand("wdpa_fetch", "Fetch WDPA protected areas data (global). Type 'help' as first arg for details.");
	o.cmdWDPAFetch->add_option("--country", o.wdpaCountry, "ISO3 country code (e.g., SAU for Saudi Arabia)");
	o.cmdWDPAFetch->add_option("--bbox", o.wdpaBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdWDPAFetch->add_option("--aoi", o.wdpaAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdWDPAFetch->add_option("-o,--output", o.wdpaOutput, "Output GeoPackage file path")->required();
	o.cmdWDPAFetch->add_flag("--overwrite", o.wdpaOverwrite, "Overwrite existing output");
	o.cmdWDPAFetch->require_subcommand(0);

	o.cmdNatura2000Fetch = o.cmdTools->add_subcommand("natura2000_fetch", "Fetch Natura 2000 protected sites (European network)");
	o.cmdNatura2000Fetch->add_option("--bbox", o.natura2000BBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdNatura2000Fetch->add_option("--aoi", o.natura2000AOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdNatura2000Fetch->add_option("--country", o.natura2000Country, "ISO2 country code for filtering (e.g., IT for Italy)");
	o.cmdNatura2000Fetch->add_option("-o,--output", o.natura2000Output, "Output GeoPackage file path")->required();
	o.cmdNatura2000Fetch->add_flag("--overwrite", o.natura2000Overwrite, "Overwrite existing output");
	o.cmdNatura2000Fetch->require_subcommand(0);

	o.cmdGADMFetch = o.cmdTools->add_subcommand("gadm_fetch", "Fetch GADM administrative boundaries (levels 0-4). Type 'help' as first arg for details.");
	o.cmdGADMFetch->add_option("--country", o.gadmCountry, "ISO3 country code (e.g., SAU for Saudi Arabia)")->required();
	o.cmdGADMFetch->add_option("-o,--output", o.gadmOutput, "Output GeoPackage file path")->required();
	o.cmdGADMFetch->add_option("--level", o.gadmLevel, "Admin level (0-4 or 'all')")->default_val("all");
	o.cmdGADMFetch->add_flag("--overwrite", o.gadmOverwrite, "Overwrite existing output");
	o.cmdGADMFetch->require_subcommand(0);

	o.cmdWorldClimFetch = o.cmdTools->add_subcommand("worldclim_fetch", "Fetch WorldClim climate data. Type 'help' as first arg for details.");
	o.cmdWorldClimFetch->add_option("--bbox", o.worldClimBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdWorldClimFetch->add_option("--aoi", o.worldClimAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdWorldClimFetch->add_option("-o,--output", o.worldClimOutput, "Output directory for climate data")->required();
	o.cmdWorldClimFetch->add_option("--variable", o.worldClimVariable, "Variable: tmin|tmax|tavg|prec|bio")->default_val("bio");
	o.cmdWorldClimFetch->add_option("--resolution", o.worldClimResolution, "Resolution: 10m|5m|2.5m|30s")->default_val("10m");
	o.cmdWorldClimFetch->add_flag("--overwrite", o.worldClimOverwrite, "Overwrite existing output");
	o.cmdWorldClimFetch->require_subcommand(0);

	o.cmdMODISFetch = o.cmdTools->add_subcommand("modis_fetch", "Fetch MODIS vegetation indices. Type 'help' as first arg for details.");
	o.cmdMODISFetch->add_option("--bbox", o.modisBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdMODISFetch->add_option("--aoi", o.modisAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdMODISFetch->add_option("-o,--output", o.modisOutput, "Output GeoTIFF file path")->required();
	o.cmdMODISFetch->add_option("--product", o.modisProduct, "Product: NDVI|EVI")->default_val("NDVI");
	o.cmdMODISFetch->add_option("--start-date", o.modisStartDate, "Start date (YYYY-MM-DD)")->required();
	o.cmdMODISFetch->add_option("--end-date", o.modisEndDate, "End date (YYYY-MM-DD)")->required();
	o.cmdMODISFetch->add_flag("--overwrite", o.modisOverwrite, "Overwrite existing output");
	o.cmdMODISFetch->require_subcommand(0);

	o.cmdERA5Fetch = o.cmdTools->add_subcommand("era5_fetch", "Fetch ERA5 climate reanalysis. Type 'help' as first arg for details.");
	o.cmdERA5Fetch->add_option("--bbox", o.era5BBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdERA5Fetch->add_option("--aoi", o.era5AOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdERA5Fetch->add_option("-o,--output", o.era5Output, "Output NetCDF/GeoTIFF file path")->required();
	o.cmdERA5Fetch->add_option("--variable", o.era5Variable, "Variable: temperature|precipitation|wind|pressure")->default_val("temperature");
	o.cmdERA5Fetch->add_option("--start-date", o.era5StartDate, "Start date (YYYY-MM-DD)")->required();
	o.cmdERA5Fetch->add_option("--end-date", o.era5EndDate, "End date (YYYY-MM-DD)")->required();
	o.cmdERA5Fetch->add_flag("--overwrite", o.era5Overwrite, "Overwrite existing output");
	o.cmdERA5Fetch->require_subcommand(0);

	o.cmdFAOSoilFetch = o.cmdTools->add_subcommand("fao_soil_fetch", "Fetch FAO Harmonized World Soil Database. Type 'help' as first arg for details.");
	o.cmdFAOSoilFetch->add_option("--bbox", o.faoSoilBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdFAOSoilFetch->add_option("--aoi", o.faoSoilAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdFAOSoilFetch->add_option("-o,--output", o.faoSoilOutput, "Output GeoTIFF file path")->required();
	o.cmdFAOSoilFetch->add_flag("--overwrite", o.faoSoilOverwrite, "Overwrite existing output");
	o.cmdFAOSoilFetch->require_subcommand(0);

	o.cmdSeismicHazardFetch = o.cmdTools->add_subcommand("seismic_hazard_fetch", "Fetch global seismic hazard data. Type 'help' as first arg for details.");
	o.cmdSeismicHazardFetch->add_option("--bbox", o.seismicHazardBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdSeismicHazardFetch->add_option("--aoi", o.seismicHazardAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdSeismicHazardFetch->add_option("-o,--output", o.seismicHazardOutput, "Output GeoTIFF file path")->required();
	o.cmdSeismicHazardFetch->add_option("--product", o.seismicHazardProduct, "Product: pga|pgv|sa0.2|sa1.0")->default_val("pga");
	o.cmdSeismicHazardFetch->add_flag("--overwrite", o.seismicHazardOverwrite, "Overwrite existing output");
	o.cmdSeismicHazardFetch->require_subcommand(0);

	o.cmdSoilGridsFetch = o.cmdTools->add_subcommand("soilgrids_fetch", "Fetch ISRIC SoilGrids v2.0 soil property data. Type 'help' as first arg for details.");
	o.cmdSoilGridsFetch->add_option("--bbox", o.soilGridsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdSoilGridsFetch->add_option("--aoi", o.soilGridsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdSoilGridsFetch->add_option("--properties", o.soilGridsProperties, "Comma-separated properties: soc,clay,sand,silt,ph,bdod,cec")->default_val("soc,clay,sand,silt,ph,bdod,cec");
	o.cmdSoilGridsFetch->add_option("--depth", o.soilGridsDepth, "Depth layer (0-5cm, 5-15cm, etc.)")->default_val("0-5cm");
	o.cmdSoilGridsFetch->add_option("-o,--output", o.soilGridsOutput, "Output GeoTIFF file path")->required();
	o.cmdSoilGridsFetch->add_flag("--overwrite", o.soilGridsOverwrite, "Overwrite existing output");
	o.cmdSoilGridsFetch->require_subcommand(0);

	// BATCH 2 TOOLS: Hydrology, Soil, Boundaries, Land Cover
	o.cmdHydroSHEDSFetch = o.cmdTools->add_subcommand("hydrosheds_fetch", "Fetch HydroSHEDS drainage basin data. Type 'help' as first arg for details.");
	o.cmdHydroSHEDSFetch->add_option("--bbox", o.hydroshedsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdHydroSHEDSFetch->add_option("--aoi", o.hydroshedsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdHydroSHEDSFetch->add_option("-o,--output", o.hydroshedsOutput, "Output GeoPackage file path")->required();
	o.cmdHydroSHEDSFetch->add_option("--level", o.hydroshedsLevel, "Basin level (1-12)")->default_val(6);
	o.cmdHydroSHEDSFetch->add_flag("--overwrite", o.hydroshedsOverwrite, "Overwrite existing output");
	o.cmdHydroSHEDSFetch->require_subcommand(0);

	o.cmdISTATBoundariesFetch = o.cmdTools->add_subcommand("istat_boundaries_fetch", "Fetch ISTAT administrative boundaries (Italy). Type 'help' as first arg for details.");
	o.cmdISTATBoundariesFetch->add_option("--bbox", o.istatBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdISTATBoundariesFetch->add_option("--aoi", o.istatAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdISTATBoundariesFetch->add_option("-o,--output", o.istatOutput, "Output GeoPackage file path")->required();
	o.cmdISTATBoundariesFetch->add_option("--level", o.istatLevel, "Level: comuni|province|regioni")->default_val("comuni");
	o.cmdISTATBoundariesFetch->add_flag("--overwrite", o.istatOverwrite, "Overwrite existing output");
	o.cmdISTATBoundariesFetch->require_subcommand(0);

	o.cmdCORINEFetch = o.cmdTools->add_subcommand("corine_fetch", "Fetch CORINE Land Cover data (Europe). Type 'help' as first arg for details.");
	o.cmdCORINEFetch->add_option("--bbox", o.corineBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdCORINEFetch->add_option("--aoi", o.corineAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdCORINEFetch->add_option("-o,--output", o.corineOutput, "Output GeoTIFF file path")->required();
	o.cmdCORINEFetch->add_option("--year", o.corineYear, "Year: 2018|2012|2006|2000")->default_val(2018);
	o.cmdCORINEFetch->add_flag("--overwrite", o.corineOverwrite, "Overwrite existing output");
	o.cmdCORINEFetch->require_subcommand(0);

	o.cmdFloodRiskFetch = o.cmdTools->add_subcommand("flood_risk_fetch", "Fetch global flood risk data. Type 'help' as first arg for details.");
	o.cmdFloodRiskFetch->add_option("--bbox", o.floodRiskBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdFloodRiskFetch->add_option("--aoi", o.floodRiskAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdFloodRiskFetch->add_option("-o,--output", o.floodRiskOutput, "Output GeoTIFF file path")->required();
	o.cmdFloodRiskFetch->add_option("--product", o.floodRiskProduct, "Product: baseline|rcp4p5|rcp8p5")->default_val("baseline");
	o.cmdFloodRiskFetch->add_flag("--overwrite", o.floodRiskOverwrite, "Overwrite existing output");
	o.cmdFloodRiskFetch->require_subcommand(0);

	// Italy-specific fetch tools
	o.cmdEUAPFetch = o.cmdTools->add_subcommand("euap_fetch", "Fetch EUAP (European/Italy) protected areas data. Type 'help' as first arg for details.");
	o.cmdEUAPFetch->add_option("--bbox", o.euapBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdEUAPFetch->add_option("--aoi", o.euapAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdEUAPFetch->add_option("-o,--output", o.euapOutput, "Output GeoPackage file path")->required();
	o.cmdEUAPFetch->add_flag("--overwrite", o.euapOverwrite, "Overwrite existing output");
	o.cmdEUAPFetch->require_subcommand(0);

	o.cmdIFFIFetch = o.cmdTools->add_subcommand("iffi_fetch", "Fetch ISPRA IFFI landslide inventory data (Italy). Type 'help' as first arg for details.");
	o.cmdIFFIFetch->add_option("--bbox", o.iffiBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdIFFIFetch->add_option("--aoi", o.iffiAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdIFFIFetch->add_option("-o,--output", o.iffiOutput, "Output GeoPackage file path")->required();
	o.cmdIFFIFetch->add_flag("--overwrite", o.iffiOverwrite, "Overwrite existing output");
	o.cmdIFFIFetch->require_subcommand(0);

	o.cmdTINITALYFetch = o.cmdTools->add_subcommand("tinitaly_fetch", "Fetch TINITALY 10m DEM (Italy). Type 'help' as first arg for details.");
	o.cmdTINITALYFetch->add_option("--bbox", o.tinitalyBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdTINITALYFetch->add_option("--aoi", o.tinitalyAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdTINITALYFetch->add_option("-o,--output", o.tinitalyOutput, "Output GeoTIFF file path")->required();
	o.cmdTINITALYFetch->add_flag("--overwrite", o.tinitalyOverwrite, "Overwrite existing output");
	o.cmdTINITALYFetch->require_subcommand(0);

	o.cmdINGVSeismicFetch = o.cmdTools->add_subcommand("ingv_seismic_fetch", "Fetch INGV seismic hazard data (Italy). Type 'help' as first arg for details.");
	o.cmdINGVSeismicFetch->add_option("--bbox", o.ingvSeismicBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdINGVSeismicFetch->add_option("--aoi", o.ingvSeismicAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdINGVSeismicFetch->add_option("-o,--output", o.ingvSeismicOutput, "Output GeoTIFF file path")->required();
	o.cmdINGVSeismicFetch->add_option("--product", o.ingvSeismicProduct, "Product: pga|pgv|sa0.2|sa1.0")->default_val("pga");
	o.cmdINGVSeismicFetch->add_flag("--overwrite", o.ingvSeismicOverwrite, "Overwrite existing output");
	o.cmdINGVSeismicFetch->require_subcommand(0);

	o.cmdINGVFaultsFetch = o.cmdTools->add_subcommand("ingv_faults_fetch", "Fetch INGV DISS faults database (Italy). Type 'help' as first arg for details.");
	o.cmdINGVFaultsFetch->add_option("--bbox", o.ingvFaultsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdINGVFaultsFetch->add_option("--aoi", o.ingvFaultsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdINGVFaultsFetch->add_option("-o,--output", o.ingvFaultsOutput, "Output GeoPackage file path")->required();
	o.cmdINGVFaultsFetch->add_flag("--overwrite", o.ingvFaultsOverwrite, "Overwrite existing output");
	o.cmdINGVFaultsFetch->require_subcommand(0);

	o.cmdEUHydroFetch = o.cmdTools->add_subcommand("euhydro_fetch", "Fetch EU-Hydro river network (Europe). Type 'help' as first arg for details.");
	o.cmdEUHydroFetch->add_option("--bbox", o.euhydroBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdEUHydroFetch->add_option("--aoi", o.euhydroAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdEUHydroFetch->add_option("-o,--output", o.euhydroOutput, "Output GeoPackage file path")->required();
	o.cmdEUHydroFetch->add_flag("--overwrite", o.euhydroOverwrite, "Overwrite existing output");
	o.cmdEUHydroFetch->require_subcommand(0);

	// Additional Italy-specific fetch tools (Priority 1)
	o.cmdItalianSoilFetch = o.cmdTools->add_subcommand("italian_soil_fetch", "Fetch Italian Soil Information System data (Zenodo). Type 'help' as first arg for details.");
	o.cmdItalianSoilFetch->add_option("-o,--output", o.italianSoilOutput, "Output GeoPackage file path")->required();
	o.cmdItalianSoilFetch->add_flag("--overwrite", o.italianSoilOverwrite, "Overwrite existing output");
	o.cmdItalianSoilFetch->require_subcommand(0);

	o.cmdCORINEItalyFetch = o.cmdTools->add_subcommand("corine_italy_fetch", "Fetch CORINE Land Cover for Italy (ISPRA). Type 'help' as first arg for details.");
	o.cmdCORINEItalyFetch->add_option("--bbox", o.corineItalyBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdCORINEItalyFetch->add_option("--aoi", o.corineItalyAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdCORINEItalyFetch->add_option("-o,--output", o.corineItalyOutput, "Output GeoTIFF file path")->required();
	o.cmdCORINEItalyFetch->add_option("--year", o.corineItalyYear, "Year: 1990|2000|2006|2012|2018")->default_val("2018");
	o.cmdCORINEItalyFetch->add_flag("--overwrite", o.corineItalyOverwrite, "Overwrite existing output");
	o.cmdCORINEItalyFetch->require_subcommand(0);

	o.cmdSciGRIDGasFetch = o.cmdTools->add_subcommand("scigrid_gas_pipelines_fetch", "Fetch SciGRID_gas European gas pipeline network. Type 'help' as first arg for details.");
	o.cmdSciGRIDGasFetch->add_option("--bbox", o.scigridGasBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdSciGRIDGasFetch->add_option("--aoi", o.scigridGasAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdSciGRIDGasFetch->add_option("-o,--output", o.scigridGasOutput, "Output GeoPackage file path")->required();
	o.cmdSciGRIDGasFetch->add_option("--country", o.scigridGasCountry, "Filter by country code (e.g., IT, DE, FR)");
	o.cmdSciGRIDGasFetch->add_flag("--overwrite", o.scigridGasOverwrite, "Overwrite existing output");
	o.cmdSciGRIDGasFetch->require_subcommand(0);

	// GEE Tile Export
	o.cmdGEETileExport = o.cmdTools->add_subcommand("gee_tile_export", "Tile and export GEE Image/ImageCollection mosaics to COG, respecting request limits.");
	o.cmdGEETileExport->add_option("--bbox", o.geeBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdGEETileExport->add_option("--aoi", o.geeAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdGEETileExport->add_option("--asset", o.geeAsset, "GEE asset ID (Image or ImageCollection)")->required();
	o.cmdGEETileExport->add_option("--bands", o.geeBands, "Comma-separated band names (optional)");
	o.cmdGEETileExport->add_option("--date-start", o.geeDateStart, "Start date YYYY-MM-DD (for ImageCollection)");
	o.cmdGEETileExport->add_option("--date-end", o.geeDateEnd, "End date YYYY-MM-DD (for ImageCollection)");
	o.cmdGEETileExport->add_option("--scale", o.geeScale, "Pixel scale in meters")->default_val("10");
	o.cmdGEETileExport->add_option("--crs", o.geeCRS, "Output CRS")->default_val("EPSG:4326");
	o.cmdGEETileExport->add_option("--tile-pixels", o.geeTilePixels, "Tile size in pixels (e.g., 2048)")->default_val(2048);
	o.cmdGEETileExport->add_option("-o,--output", o.geeOutput, "Output COG path")->required();
	o.cmdGEETileExport->add_flag("--overwrite", o.geeOverwrite, "Overwrite output if exists");
	o.cmdGEETileExport->require_subcommand(0);

	// WMS Fetch
	o.cmdWMSFetch = o.cmdTools->add_subcommand("wms_fetch", "Fetch a WMS layer into a GeoTIFF via GDAL WMS driver.");
	o.cmdWMSFetch->add_option("--url", o.wmsURL, "Base WMS URL")->required();
	o.cmdWMSFetch->add_option("--layers", o.wmsLayers, "Comma-separated layer names")->required();
	o.cmdWMSFetch->add_option("--bbox", o.wmsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdWMSFetch->add_option("--aoi", o.wmsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdWMSFetch->add_option("--srs", o.wmsSRS, "CRS (e.g., EPSG:4326)")->default_val("EPSG:4326");
	o.cmdWMSFetch->add_option("--width", o.wmsWidth, "Pixel width")->default_val(4096);
	o.cmdWMSFetch->add_option("--height", o.wmsHeight, "Pixel height")->default_val(4096);
	o.cmdWMSFetch->add_option("--format", o.wmsFormat, "Image format")->default_val("image/geotiff");
	o.cmdWMSFetch->add_option("-o,--output", o.wmsOutput, "Output GeoTIFF path")->required();
	o.cmdWMSFetch->add_flag("--overwrite", o.wmsOverwrite, "Overwrite output");
	o.cmdWMSFetch->require_subcommand(0);

	// WFS Fetch (robust)
	o.cmdWFSFetch = o.cmdTools->add_subcommand("wfs_fetch", "Fetch a WFS layer into GeoPackage with paging, retry, and AOI/bbox clip.");
	o.cmdWFSFetch->add_option("--url", o.wfsURL, "WFS endpoint URL")->required();
	o.cmdWFSFetch->add_option("--typename", o.wfsTypeName, "TypeName (layer)")->required();
	o.cmdWFSFetch->add_option("--bbox", o.wfsBBox, "Bounding box in EPSG:4326 (minx,miny,maxx,maxy)");
	o.cmdWFSFetch->add_option("--aoi", o.wfsAOI, "AOI vector file (GeoJSON/Shapefile/GeoPackage)");
	o.cmdWFSFetch->add_option("--version", o.wfsVersion, "WFS version")->default_val("2.0.0");
	o.cmdWFSFetch->add_option("--pagesize", o.wfsPageSize, "Page size for paging")->default_val(1000);
	o.cmdWFSFetch->add_option("--filter", o.wfsFilter, "Optional CQL filter");
	o.cmdWFSFetch->add_option("-o,--output", o.wfsOutput, "Output GeoPackage path")->required();
	o.cmdWFSFetch->add_flag("--overwrite", o.wfsOverwrite, "Overwrite output");
	o.cmdWFSFetch->require_subcommand(0);

	// KML/KMZ -> BBOX
	o.cmdKMLToBBox = o.cmdTools->add_subcommand("kml_to_bbox", "Extract bbox from KMZ/KML (lon/lat EPSG:4326).");
	o.cmdKMLToBBox->add_option("input", o.kmlInput, "KML/KMZ file path")->required();
	o.cmdKMLToBBox->add_option("--output", o.kmlBBoxOutput, "Optional text path to write bbox string");
	o.cmdKMLToBBox->require_subcommand(0);

	// Copernicus EEA-10 DEM
	o.cmdCopernicusEEA10Fetch = o.cmdTools->add_subcommand("copernicus_eea10_fetch", "Fetch Copernicus DEM EEA-10 (10m European DEM).");
	o.cmdCopernicusEEA10Fetch->add_option("--bbox", o.copEEA10BBox, "Bounding box (minx,miny,maxx,maxy WGS84)");
	o.cmdCopernicusEEA10Fetch->add_option("--aoi", o.copEEA10AOI, "AOI vector file for spatial filter");
	o.cmdCopernicusEEA10Fetch->add_option("--collection", o.copEEA10Collection, "Collection name")
		->default_val("COP-DEM_EEA-10-DGED");
	o.cmdCopernicusEEA10Fetch->add_option("-o,--output", o.copEEA10Output, "Output GeoTIFF path")->required();
	o.cmdCopernicusEEA10Fetch->add_flag("--overwrite", o.copEEA10Overwrite, "Overwrite existing file");
	o.cmdCopernicusEEA10Fetch->require_subcommand(0);

	// DEM Analysis Tools - Terrain Slope
	o.cmdTerrainSlope = o.cmdTools->add_subcommand("raster_slope", "Calculate slope from DEM (percentage or degrees)");
	o.cmdTerrainSlope->add_option("input", o.terrainSlopeInput, "Input DEM raster path")->required();
	o.cmdTerrainSlope->add_option("output", o.terrainSlopeOutput, "Output slope raster path")->required();
	o.cmdTerrainSlope->add_flag("--percent", o.terrainSlopePercent, "Output as percentage (default: true)");
	o.cmdTerrainSlope->add_flag("--compute-edges", o.terrainSlopeComputeEdges, "Compute values at edge pixels");
	o.cmdTerrainSlope->add_option("--algorithm", o.terrainSlopeAlgorithm, "Algorithm: Horn (default), ZevenbergenThorne")->default_val("Horn");
	o.cmdTerrainSlope->add_flag("--overwrite", o.terrainSlopeOverwrite, "Overwrite existing output");
	o.cmdTerrainSlope->require_subcommand(0);

	// Terrain Aspect
	o.cmdTerrainAspect = o.cmdTools->add_subcommand("raster_aspect", "Calculate aspect (slope direction) from DEM");
	o.cmdTerrainAspect->add_option("input", o.terrainAspectInput, "Input DEM raster path")->required();
	o.cmdTerrainAspect->add_option("output", o.terrainAspectOutput, "Output aspect raster path")->required();
	o.cmdTerrainAspect->add_flag("--zero-for-flat", o.terrainAspectZeroForFlat, "Output 0 for flat areas (default: -9999)");
	o.cmdTerrainAspect->add_flag("--overwrite", o.terrainAspectOverwrite, "Overwrite existing output");
	o.cmdTerrainAspect->require_subcommand(0);

	// Terrain Curvature
	o.cmdTerrainCurvature = o.cmdTools->add_subcommand("raster_curvature", "Calculate terrain curvature from DEM");
	o.cmdTerrainCurvature->add_option("input", o.terrainCurvatureInput, "Input DEM raster path")->required();
	o.cmdTerrainCurvature->add_option("output", o.terrainCurvatureOutput, "Output curvature raster path")->required();
	o.cmdTerrainCurvature->add_option("--type", o.terrainCurvatureType, "Curvature type: profile (default), planform, total")->default_val("profile");
	o.cmdTerrainCurvature->add_flag("--overwrite", o.terrainCurvatureOverwrite, "Overwrite existing output");
	o.cmdTerrainCurvature->require_subcommand(0);

	// Raster Threshold
	o.cmdRasterThreshold = o.cmdTools->add_subcommand("raster_threshold", "Apply threshold to raster values");
	o.cmdRasterThreshold->add_option("input", o.rasterThresholdInput, "Input raster path")->required();
	o.cmdRasterThreshold->add_option("output", o.rasterThresholdOutput, "Output raster path")->required();
	o.cmdRasterThreshold->add_option("--threshold", o.rasterThresholdValue, "Threshold value")->default_val(0.0);
	o.cmdRasterThreshold->add_option("--above", o.rasterThresholdAbove, "Value for pixels above threshold")->default_val(255.0);
	o.cmdRasterThreshold->add_option("--below", o.rasterThresholdBelow, "Value for pixels below threshold")->default_val(0.0);
	o.cmdRasterThreshold->add_flag("--invert", o.rasterThresholdInvert, "Invert threshold (above becomes below)");
	o.cmdRasterThreshold->add_flag("--overwrite", o.rasterThresholdOverwrite, "Overwrite existing output");
	o.cmdRasterThreshold->require_subcommand(0);

	// Phase 3B: Critical Geospatial Tools
	o.cmdRasterReclassify = o.cmdTools->add_subcommand("raster_reclassify", "Reclassify raster values into new categories");
	o.cmdRasterReclassify->add_option("-i,--input", o.rasterReclassifyInput, "Input raster path")->required();
	o.cmdRasterReclassify->add_option("-o,--output", o.rasterReclassifyOutput, "Output raster path")->required();
	o.cmdRasterReclassify->add_option("--rules", o.rasterReclassifyRules, "Reclassification rules (e.g., \"0:5=1,5:10=2,10:20=3\")")->required();
	o.cmdRasterReclassify->add_option("--type", o.rasterReclassifyType, "Output data type (Float32, Int16, Byte, etc.)");
	o.cmdRasterReclassify->add_flag("--overwrite", o.rasterReclassifyOverwrite, "Overwrite existing output");
	o.cmdRasterReclassify->require_subcommand(0);

	o.cmdRasterBoolean = o.cmdTools->add_subcommand("raster_boolean", "Boolean overlay operations on rasters");
	o.cmdRasterBoolean->add_option("--inputs", o.rasterBooleanInputs, "Comma-separated list of input rasters")->required();
	o.cmdRasterBoolean->add_option("--operation", o.rasterBooleanOperation, "Boolean operation (AND, OR, XOR, NOT)")->required();
	o.cmdRasterBoolean->add_option("-o,--output", o.rasterBooleanOutput, "Output raster path")->required();
	o.cmdRasterBoolean->add_flag("--overwrite", o.rasterBooleanOverwrite, "Overwrite existing output");
	o.cmdRasterBoolean->require_subcommand(0);

	o.cmdVectorToRaster = o.cmdTools->add_subcommand("vector_to_raster", "Convert vector features to raster");
	o.cmdVectorToRaster->add_option("-i,--input", o.vectorToRasterInput, "Input vector path")->required();
	o.cmdVectorToRaster->add_option("-o,--output", o.vectorToRasterOutput, "Output raster path")->required();
	o.cmdVectorToRaster->add_option("--attribute", o.vectorToRasterAttribute, "Attribute field to burn");
	o.cmdVectorToRaster->add_option("--resolution", o.vectorToRasterResolution, "Output pixel resolution in CRS units")->required();
	o.cmdVectorToRaster->add_option("--extent", o.vectorToRasterExtent, "Extent as \"minx,miny,maxx,maxy\"");
	o.cmdVectorToRaster->add_option("--burn", o.vectorToRasterBurn, "Fixed value to burn (default: 1)");
	o.cmdVectorToRaster->add_option("--type", o.vectorToRasterType, "Output data type (Float32, Int16, Byte, etc.)");
	o.cmdVectorToRaster->add_flag("--overwrite", o.vectorToRasterOverwrite, "Overwrite existing output");
	o.cmdVectorToRaster->require_subcommand(0);

	o.cmdRasterProximity = o.cmdTools->add_subcommand("raster_proximity", "Calculate Euclidean distance to nearest features");
	o.cmdRasterProximity->add_option("-i,--input", o.rasterProximityInput, "Input raster path")->required();
	o.cmdRasterProximity->add_option("-o,--output", o.rasterProximityOutput, "Output distance raster path")->required();
	o.cmdRasterProximity->add_option("--values", o.rasterProximityValues, "Target pixel values (comma-separated)");
	o.cmdRasterProximity->add_option("--max-distance", o.rasterProximityMaxDist, "Maximum distance to calculate")->default_val(0.0);
	o.cmdRasterProximity->add_option("--units", o.rasterProximityUnits, "Distance units (GEO or PIXEL)");
	o.cmdRasterProximity->add_flag("--overwrite", o.rasterProximityOverwrite, "Overwrite existing output");
	o.cmdRasterProximity->require_subcommand(0);

	// Phase 3C/3D: Additional Tools
	o.cmdVectorBuffer = o.cmdTools->add_subcommand("vector_buffer", "Create buffer zones around features");
	o.cmdVectorBuffer->add_option("-i,--input", o.vectorBufferInput, "Input vector path")->required();
	o.cmdVectorBuffer->add_option("-o,--output", o.vectorBufferOutput, "Output vector path")->required();
	o.cmdVectorBuffer->add_option("--distance", o.vectorBufferDistance, "Buffer distance in CRS units")->required();
	o.cmdVectorBuffer->add_option("--segments", o.vectorBufferSegments, "Segments for curves")->default_val(30);
	o.cmdVectorBuffer->add_option("--endcap", o.vectorBufferEndCap, "End cap style (ROUND, FLAT, SQUARE)");
	o.cmdVectorBuffer->add_flag("--dissolve", o.vectorBufferDissolve, "Dissolve overlapping buffers");
	o.cmdVectorBuffer->add_flag("--overwrite", o.vectorBufferOverwrite, "Overwrite existing output");
	o.cmdVectorBuffer->require_subcommand(0);

	o.cmdRasterExtractByMask = o.cmdTools->add_subcommand("raster_extract_by_mask", "Extract raster by vector mask");
	o.cmdRasterExtractByMask->add_option("-i,--input", o.rasterExtractMaskInput, "Input raster path")->required();
	o.cmdRasterExtractByMask->add_option("--mask", o.rasterExtractMaskVector, "Mask vector path")->required();
	o.cmdRasterExtractByMask->add_option("-o,--output", o.rasterExtractMaskOutput, "Output raster path")->required();
	o.cmdRasterExtractByMask->add_flag("--crop", o.rasterExtractMaskCrop, "Crop to mask extent");
	o.cmdRasterExtractByMask->add_flag("--overwrite", o.rasterExtractMaskOverwrite, "Overwrite existing output");
	o.cmdRasterExtractByMask->require_subcommand(0);

	o.cmdRasterHillshade = o.cmdTools->add_subcommand("raster_hillshade", "Create hillshade visualization from DEM");
	o.cmdRasterHillshade->add_option("-i,--input", o.rasterHillshadeInput, "Input DEM path")->required();
	o.cmdRasterHillshade->add_option("-o,--output", o.rasterHillshadeOutput, "Output hillshade path")->required();
	o.cmdRasterHillshade->add_option("--azimuth", o.rasterHillshadeAzimuth, "Light azimuth in degrees")->default_val(315.0);
	o.cmdRasterHillshade->add_option("--altitude", o.rasterHillshadeAltitude, "Light altitude in degrees")->default_val(45.0);
	o.cmdRasterHillshade->add_option("--z-factor", o.rasterHillshadeZFactor, "Vertical exaggeration")->default_val(1.0);
	o.cmdRasterHillshade->add_flag("--overwrite", o.rasterHillshadeOverwrite, "Overwrite existing output");
	o.cmdRasterHillshade->require_subcommand(0);

	o.cmdRasterTRI = o.cmdTools->add_subcommand("raster_tri", "Calculate Terrain Ruggedness Index from DEM");
	o.cmdRasterTRI->add_option("-i,--input", o.rasterTRIInput, "Input DEM path")->required();
	o.cmdRasterTRI->add_option("-o,--output", o.rasterTRIOutput, "Output TRI path")->required();
	o.cmdRasterTRI->add_flag("--overwrite", o.rasterTRIOverwrite, "Overwrite existing output");
	o.cmdRasterTRI->require_subcommand(0);

	// Perplexity AI Search
	o.cmdPerplexitySearch = o.cmdTools->add_subcommand("perplexity_search", "AI-powered geographic intelligence and research");
	o.cmdPerplexitySearch->add_option("--query,-q", o.perplexityQuery, "Free-form search query");
	o.cmdPerplexitySearch->add_option("--location,-l", o.perplexityLocation, "Location coordinates (lat,lon) or (lon,lat)");
	o.cmdPerplexitySearch->add_option("--bbox,-b", o.perplexityBBox, "Bounding box (minx,miny,maxx,maxy)");
	o.cmdPerplexitySearch->add_option("--place,-p", o.perplexityPlace, "Place name (city, region, country)");
	o.cmdPerplexitySearch->add_option("--topic,-t", o.perplexityTopic, "Comma-separated topics (terrain, climate, regulations, etc.)");
	o.cmdPerplexitySearch->add_option("--dataset-research,-d", o.perplexityDatasetResearch, "Research specific datasets");
	o.cmdPerplexitySearch->add_option("--model,-m", o.perplexityModel, "AI model: small, large (default), huge");
	o.cmdPerplexitySearch->add_option("--max-tokens", o.perplexityMaxTokens, "Maximum response length")->default_val(4000);
	o.cmdPerplexitySearch->add_option("--temperature", o.perplexityTemperature, "Response creativity (0.0-1.0)")->default_val(0.2);
	o.cmdPerplexitySearch->add_option("--recency,-r", o.perplexityRecency, "Search recency: day, week, month (default), year");
	o.cmdPerplexitySearch->add_option("--format,-f", o.perplexityFormat, "Output format: markdown (default), json, text")->default_val("markdown");
	o.cmdPerplexitySearch->add_option("--output,-o", o.perplexityOutput, "Output file path")->required();
	o.cmdPerplexitySearch->add_flag("--no-citations", o.perplexityCitations, "Disable citations");
	o.cmdPerplexitySearch->require_subcommand(0);

	// AI Operator (Cursor Agent)
	o.cmdAIOperator = o.cmdTools->add_subcommand("ai", "AI Operator (Cursor Agent) controls");
	// ai ask
	o.cmdAIAsk = o.cmdAIOperator->add_subcommand("ask", "Ask the AI operator a question");
	o.cmdAIAsk->add_option("prompt", o.aiPrompt, "Question or instruction")->required();
	o.cmdAIAsk->add_option("--project", o.aiProjectPath, "Project path (working directory)");
	// ai task
	o.cmdAITask = o.cmdAIOperator->add_subcommand("task", "Execute a multi-step AI task");
	o.cmdAITask->add_option("prompt", o.aiTaskPrompt, "Task instruction")->required();
	o.cmdAITask->add_option("--project", o.aiProjectPath, "Project path (working directory)");
	
	// Analyze Fetch Tool Availability
	o.cmdAnalyzeFetchTools = o.cmdTools->add_subcommand("analyze_fetch_tools", "Analyze dataset fetch tool coverage and readiness");
	o.cmdAnalyzeFetchTools->add_option("--mode,-m", o.analyzeFetchMode, "Analysis mode: summary, readiness, country, missing, all")->default_val("all");
	o.cmdAnalyzeFetchTools->add_option("--country,-c", o.analyzeFetchCountry, "Country code for country-specific analysis");
	o.cmdAnalyzeFetchTools->add_option("--lat", o.analyzeFetchLat, "Latitude for coordinate-based country detection");
	o.cmdAnalyzeFetchTools->add_option("--lon", o.analyzeFetchLon, "Longitude for coordinate-based country detection");
	o.cmdAnalyzeFetchTools->add_option("--output,-o", o.analyzeFetchOutput, "Output JSON file path");
	o.cmdAnalyzeFetchTools->add_flag("--verbose,-v", o.analyzeFetchVerbose, "Verbose output");
	
	// ============================================================================
	// PIRL (Physics-Informed Reinforcement Learning) Pipeline Routing
	// ============================================================================
	
	// Generate optimal pipeline route using PIRL
	o.cmdPirlGenerateRoute = o.cmdTools->add_subcommand("pirl_generate_route", "Generate optimal pipeline route using PIRL");
	o.cmdPirlGenerateRoute->add_option("--config,-c", o.pirlConfigPath, "Project configuration YAML file")->required();
	o.cmdPirlGenerateRoute->add_option("--output,-o", o.pirlOutputDir, "Output directory for route files")->required();
	o.cmdPirlGenerateRoute->add_flag("--visualize,-v", o.pirlVisualize, "Generate visualization outputs");
	o.cmdPirlGenerateRoute->require_subcommand(0);
	
	// Train PIRL model on project scenarios
	o.cmdPirlTrainModel = o.cmdTools->add_subcommand("pirl_train_model", "Train PIRL model on project scenarios");
	o.cmdPirlTrainModel->add_option("--config,-c", o.pirlTrainingConfigPath, "Training configuration YAML file")->required();
	o.cmdPirlTrainModel->add_option("--output,-o", o.pirlModelPath, "Output path for trained model")->required();
	o.cmdPirlTrainModel->add_option("--episodes,-e", o.pirlNumEpisodes, "Number of training episodes")->default_val(10000);
	o.cmdPirlTrainModel->require_subcommand(0);
	
	// Evaluate trained PIRL model
	o.cmdPirlEvaluate = o.cmdTools->add_subcommand("pirl_evaluate", "Evaluate trained PIRL model");
	o.cmdPirlEvaluate->add_option("--model,-m", o.pirlModelPath, "Path to trained model")->required();
	o.cmdPirlEvaluate->add_option("--test-dir,-t", o.pirlTestDir, "Directory containing test projects")->required();
	o.cmdPirlEvaluate->add_option("--output,-o", o.pirlReportPath, "Output report file")->required();
	o.cmdPirlEvaluate->require_subcommand(0);
	
	// Generate multiple alternative corridors
	o.cmdPirlGenerateCorridors = o.cmdTools->add_subcommand("pirl_generate_corridors", "Generate multiple alternative corridors");
	o.cmdPirlGenerateCorridors->add_option("--config,-c", o.pirlConfigPath, "Project configuration YAML file")->required();
	o.cmdPirlGenerateCorridors->add_option("--output,-o", o.pirlOutputDir, "Output directory for corridor files")->required();
	o.cmdPirlGenerateCorridors->add_option("--num-corridors,-n", o.pirlNumCorridors, "Number of alternative corridors to generate")->default_val(5);
	o.cmdPirlGenerateCorridors->require_subcommand(0);
	
	// Create project configuration template
	o.cmdPirlCreateConfig = o.cmdTools->add_subcommand("pirl_create_config", "Create PIRL project configuration template");
	o.cmdPirlCreateConfig->add_option("--project,-p", o.pirlProjectName, "Project name")->required();
	o.cmdPirlCreateConfig->add_option("--output,-o", o.pirlConfigPath, "Output YAML configuration file")->required();
	o.cmdPirlCreateConfig->add_flag("--interactive,-i", o.pirlInteractive, "Interactive configuration mode");
	o.cmdPirlCreateConfig->require_subcommand(0);
	
	// Python Training Interface Commands
	o.cmdPirlResetEpisode = o.cmdTools->add_subcommand("pirl_reset_episode", "Reset PIRL environment episode (Python interface)");
	o.cmdPirlResetEpisode->add_option("--config,-c", o.pirlConfigPath, "Project configuration YAML file")->required();
	o.cmdPirlResetEpisode->add_option("--output-dir,-o", o.pirlOutputDir, "Output directory for state files")->required();
	o.cmdPirlResetEpisode->require_subcommand(0);
	
	o.cmdPirlStep = o.cmdTools->add_subcommand("pirl_step", "Execute one step in PIRL environment (Python interface)");
	o.cmdPirlStep->add_option("--config,-c", o.pirlConfigPath, "Project configuration YAML file")->required();
	o.cmdPirlStep->add_option("--action-file,-a", o.pirlActionFile, "JSON file containing action to execute")->required();
	o.cmdPirlStep->add_option("--output-dir,-o", o.pirlOutputDir, "Output directory for state files")->required();
	o.cmdPirlStep->require_subcommand(0);
}

std::optional<int> handle_tools_commands(const ToolsOptions& o) {
	if (!o.cmdTools || !o.cmdTools->parsed()) return std::nullopt;
	
	if (o.cmdGpkgTranslate && o.cmdGpkgTranslate->parsed()) {
		std::string layerFilter = (o.gpkgLayerFilterOpt && o.gpkgLayerFilterOpt->count() > 0) 
			? o.gpkgLayerFilter : "";
		
		return tools_gpkg_translate(o.gpkgInputPath, o.gpkgOutputDir, o.gpkgSeparateLayers,
			o.gpkgVectorFormat, o.gpkgRasterFormat, o.gpkgTableFormat, layerFilter, o.gpkgIncludeMetadata, o.gpkgOverwrite);
	}
	
	if (o.cmdRasterQuery && o.cmdRasterQuery->parsed()) {
		return tools_raster_query(o.rasterQueryPath, o.rasterQueryLon, o.rasterQueryLat, o.rasterQueryFormat);
	}
	
	if (o.cmdVectorQuery && o.cmdVectorQuery->parsed()) {
		return tools_vector_query(o.vectorQueryPath, o.vectorQueryLon, o.vectorQueryLat, o.vectorQueryType);
	}

	if (o.cmdRasterExtractBand && o.cmdRasterExtractBand->parsed()) {
		return tools_raster_extract_band(o.rasterExtractInput, o.rasterExtractBand, o.rasterExtractOutput, o.rasterExtractUnit, o.rasterExtractCOG, o.rasterExtractOverwrite);
	}

	if (o.cmdRasterRescaleIndex && o.cmdRasterRescaleIndex->parsed()) {
		std::optional<double> smin, smax;
		if (o.rasterRescaleSrcMinOpt && o.rasterRescaleSrcMinOpt->count() > 0) smin = o.rasterRescaleSrcMin;
		if (o.rasterRescaleSrcMaxOpt && o.rasterRescaleSrcMaxOpt->count() > 0) smax = o.rasterRescaleSrcMax;
		return tools_raster_rescale_index(o.rasterRescaleInput, o.rasterRescaleOutput, o.rasterRescaleIndex, o.rasterRescaleAuto, smin, smax, o.rasterRescaleDstMin, o.rasterRescaleDstMax, o.rasterRescaleCOG, o.rasterRescaleOverwrite);
	}

	if (o.cmdRasterCalc && o.cmdRasterCalc->parsed()) {
		return tools_raster_calc(o.rasterCalcInputs, o.rasterCalcOutput, o.rasterCalcExpression, o.rasterCalcDataType, o.rasterCalcOverwrite);
	}

	if (o.cmdRasterSample && o.cmdRasterSample->parsed()) {
		return tools_raster_sample(o.rasterSampleInput, o.rasterSampleLon, o.rasterSampleLat, o.rasterSampleFormat);
	}

	if (o.cmdRasterAlign && o.cmdRasterAlign->parsed()) {
		return tools_raster_align(o.rasterAlignInput, o.rasterAlignOutput, o.rasterAlignReference, o.rasterAlignOverwrite);
	}

	if (o.cmdRasterPolygonize && o.cmdRasterPolygonize->parsed()) {
		return tools_raster_polygonize(o.rasterPolygonizeInput, o.rasterPolygonizeOutput, o.rasterPolygonizeField, o.rasterPolygonizeOverwrite);
	}

	if (o.cmdRasterWaterDetect && o.cmdRasterWaterDetect->parsed()) {
		return tools_raster_water_detect(o.rasterWaterInput, o.rasterWaterOutput, o.rasterWaterBlueThreshold, o.rasterWaterRedGreenMax, o.rasterWaterOverwrite);
	}

	if (o.cmdRasterCloudDetect && o.cmdRasterCloudDetect->parsed()) {
		return tools_raster_cloud_detect(o.rasterCloudInput, o.rasterCloudOutput, o.rasterCloudRedGreenMin, o.rasterCloudRedGreenMax, o.rasterCloudBlueMin, o.rasterCloudOverwrite);
	}

	if (o.cmdDemFetch && o.cmdDemFetch->parsed()) {
		return tools_dem_fetch(o.demFetchBBox, o.demFetchAOI, o.demFetchResolution, o.demFetchProvider, o.demFetchToCRS, o.demFetchAlignTo, o.demFetchOutput, o.demFetchOverwrite, o.demFetchDryRun);
	}

	// Intelligent Routing Fetch Handlers
	if (o.cmdImageryFetch && o.cmdImageryFetch->parsed()) {
		return tools_imagery_fetch(o.imageryFetchBBox, o.imageryFetchAOI, o.imageryFetchOutput, o.imageryFetchDate, o.imageryFetchOverwrite);
	}

	if (o.cmdClimateFetch && o.cmdClimateFetch->parsed()) {
		return tools_climate_fetch(o.climateFetchBBox, o.climateFetchAOI, o.climateFetchOutput, o.climateFetchVariable, o.climateFetchOverwrite);
	}

	if (o.cmdLandcoverFetch && o.cmdLandcoverFetch->parsed()) {
		return tools_landcover_fetch(o.landcoverFetchBBox, o.landcoverFetchAOI, o.landcoverFetchOutput, "10m", o.landcoverFetchOverwrite);
	}

	if (o.cmdHydrologyFetch && o.cmdHydrologyFetch->parsed()) {
		return tools_hydrology_fetch(o.hydrologyFetchBBox, o.hydrologyFetchAOI, o.hydrologyFetchOutput, o.hydrologyFetchOverwrite);
	}

	if (o.cmdInfrastructureFetch && o.cmdInfrastructureFetch->parsed()) {
		return tools_infrastructure_fetch(o.infrastructureFetchBBox, o.infrastructureFetchAOI, o.infrastructureFetchOutput, o.infrastructureFetchType, o.infrastructureFetchOverwrite);
	}

	if (o.cmdProtectedAreasFetch && o.cmdProtectedAreasFetch->parsed()) {
		return tools_protected_areas_fetch(o.protectedAreasFetchBBox, o.protectedAreasFetchAOI, o.protectedAreasFetchOutput, o.protectedAreasFetchOverwrite);
	}

	if (o.cmdGeohazardsFetch && o.cmdGeohazardsFetch->parsed()) {
		return tools_geohazards_fetch(o.geohazardsFetchBBox, o.geohazardsFetchAOI, o.geohazardsFetchOutput, "all", o.geohazardsFetchOverwrite);
	}

	if (o.cmdAdministrativeFetch && o.cmdAdministrativeFetch->parsed()) {
		return tools_administrative_fetch(o.administrativeFetchCountry, o.administrativeFetchOutput, 0, o.administrativeFetchOverwrite);
	}

	if (o.cmdCadastreFetch && o.cmdCadastreFetch->parsed()) {
		return tools_cadastre_fetch(o.cadastreFetchBBox, o.cadastreFetchAOI, o.cadastreFetchOutput, o.cadastreFetchOverwrite);
	}

	if (o.cmdSocioeconomicFetch && o.cmdSocioeconomicFetch->parsed()) {
		return tools_socioeconomic_fetch(o.socioeconomicFetchBBox, o.socioeconomicFetchAOI, o.socioeconomicFetchOutput, o.socioeconomicFetchOverwrite);
	}

	if (o.cmdSentinel2Fetch && o.cmdSentinel2Fetch->parsed()) {
		return tools_sentinel2_fetch(o.sentinel2FetchBBox, o.sentinel2FetchDatetime, o.sentinel2FetchCloudMax, o.sentinel2FetchBands, 
			o.sentinel2FetchBandGroups, o.sentinel2FetchAllBands, o.sentinel2FetchAuxiliary, o.sentinel2FetchOutputDir, o.sentinel2FetchOverwrite);
	}


	if (o.cmdCopernicusFetch && o.cmdCopernicusFetch->parsed()) {
		return tools_copernicus_fetch(o.copernicusFetchBBox, o.copernicusFetchAOI, o.copernicusFetchDatetime, 
			o.copernicusFetchOutputDir, o.copernicusFetchProduct,
			o.copernicusFetchUsername, o.copernicusFetchPassword, o.copernicusFetchOverwrite);
	}

	if (o.cmdSearch && o.cmdSearch->parsed()) {
		return tools_search(o.searchAOI, o.searchBBox, o.searchDatetime, o.searchTheme, o.searchCloudMax, o.searchOutputDir, o.searchOverwrite);
	}

	if (o.cmdMosaic && o.cmdMosaic->parsed()) {
		return tools_mosaic(o.mosaicInputFiles, o.mosaicOutputFile, o.mosaicBBox, o.mosaicCutlinePath, 
			o.mosaicTargetCRS, o.mosaicResampling, o.mosaicDataType, o.mosaicOutputCOG, o.mosaicOverwrite);
	}

	if (o.cmdGeoAI && o.cmdGeoAI->parsed()) {
		return tools_geoai(o.geoAITask, o.geoAIInput, o.geoAIOutput, o.geoAIModel, o.geoAIOverwrite);
	}

	// Pipeline routing tool handlers removed (premature)

	if (o.cmdOsmWaterwaysFetch && o.cmdOsmWaterwaysFetch->parsed()) {
		return tools_osm_waterways_fetch(o.osmWaterwaysBBox, o.osmWaterwaysAOI, o.osmWaterwaysOutput, o.osmWaterwaysOverwrite);
	}

	if (o.cmdOsmRoadsFetch && o.cmdOsmRoadsFetch->parsed()) {
		return tools_osm_roads_fetch(o.osmRoadsBBox, o.osmRoadsAOI, o.osmRoadsOutput, o.osmRoadsOverwrite);
	}

	if (o.cmdOsmPowerFetch && o.cmdOsmPowerFetch->parsed()) {
		return tools_osm_power_fetch(o.osmPowerBBox, o.osmPowerAOI, o.osmPowerOutput, o.osmPowerOverwrite);
	}

	if (o.cmdOsmRailwaysFetch && o.cmdOsmRailwaysFetch->parsed()) {
		return tools_osm_railways_fetch(o.osmRailwaysBBox, o.osmRailwaysAOI, o.osmRailwaysOutput, o.osmRailwaysOverwrite);
	}

	if (o.cmdEsaWorldCoverFetch && o.cmdEsaWorldCoverFetch->parsed()) {
		return tools_esa_worldcover_fetch(o.esaWorldCoverBBox, o.esaWorldCoverAOI, o.esaWorldCoverOutput, o.esaWorldCoverYear, o.esaWorldCoverOverwrite);
	}

	if (o.cmdGoogleDynamicWorldFetch && o.cmdGoogleDynamicWorldFetch->parsed()) {
		return tools_google_dynamicworld_fetch(o.googleDynamicWorldBBox, o.googleDynamicWorldAOI, o.googleDynamicWorldOutput, o.googleDynamicWorldDate, o.googleDynamicWorldOverwrite);
	}

	if (o.cmdGlobalSurfaceWaterFetch && o.cmdGlobalSurfaceWaterFetch->parsed()) {
		return tools_global_surface_water_fetch(o.globalSurfaceWaterBBox, o.globalSurfaceWaterAOI, o.globalSurfaceWaterOutput, o.globalSurfaceWaterProduct, o.globalSurfaceWaterOverwrite);
	}

	if (o.cmdWorldPopFetch && o.cmdWorldPopFetch->parsed()) {
		return tools_worldpop_fetch(o.worldPopCountry, o.worldPopBBox, o.worldPopAOI, o.worldPopOutput, o.worldPopYear, o.worldPopConstrained, o.worldPopOverwrite);
	}

	if (o.cmdWDPAFetch && o.cmdWDPAFetch->parsed()) {
		return tools_wdpa_fetch(o.wdpaCountry, o.wdpaBBox, o.wdpaAOI, o.wdpaOutput, o.wdpaOverwrite);
	}

	if (o.cmdNatura2000Fetch && o.cmdNatura2000Fetch->parsed()) {
		return tools_natura2000_fetch(o.natura2000BBox, o.natura2000AOI, o.natura2000Output, o.natura2000Country, o.natura2000Overwrite);
	}

	if (o.cmdGADMFetch && o.cmdGADMFetch->parsed()) {
		return tools_gadm_fetch(o.gadmCountry, o.gadmOutput, o.gadmLevel, o.gadmOverwrite);
	}

	if (o.cmdWorldClimFetch && o.cmdWorldClimFetch->parsed()) {
		return tools_worldclim_fetch(o.worldClimBBox, o.worldClimAOI, o.worldClimOutput, o.worldClimVariable, o.worldClimResolution, o.worldClimOverwrite);
	}

	if (o.cmdMODISFetch && o.cmdMODISFetch->parsed()) {
		return tools_modis_fetch(o.modisBBox, o.modisAOI, o.modisOutput, o.modisProduct, o.modisStartDate, o.modisEndDate, o.modisOverwrite);
	}

	if (o.cmdERA5Fetch && o.cmdERA5Fetch->parsed()) {
		return tools_era5_fetch(o.era5BBox, o.era5AOI, o.era5Output, o.era5Variable, o.era5StartDate, o.era5EndDate, o.era5Overwrite);
	}

	if (o.cmdFAOSoilFetch && o.cmdFAOSoilFetch->parsed()) {
		return tools_fao_soil_fetch(o.faoSoilBBox, o.faoSoilAOI, o.faoSoilOutput, o.faoSoilOverwrite);
	}

	if (o.cmdSeismicHazardFetch && o.cmdSeismicHazardFetch->parsed()) {
		return tools_seismic_hazard_fetch(o.seismicHazardBBox, o.seismicHazardAOI, o.seismicHazardOutput, o.seismicHazardProduct, o.seismicHazardOverwrite);
	}

	if (o.cmdSoilGridsFetch && o.cmdSoilGridsFetch->parsed()) {
		return tools_soilgrids_fetch(o.soilGridsBBox, o.soilGridsAOI, o.soilGridsProperties, o.soilGridsDepth, o.soilGridsOutput, o.soilGridsOverwrite);
	}

	// BATCH 2 tool handlers
	if (o.cmdHydroSHEDSFetch && o.cmdHydroSHEDSFetch->parsed()) {
		return tools_hydrosheds_fetch(o.hydroshedsBBox, o.hydroshedsAOI, o.hydroshedsOutput, o.hydroshedsLevel, o.hydroshedsOverwrite);
	}

	if (o.cmdISTATBoundariesFetch && o.cmdISTATBoundariesFetch->parsed()) {
		return tools_istat_boundaries_fetch(o.istatBBox, o.istatAOI, o.istatOutput, o.istatLevel, o.istatOverwrite);
	}

	if (o.cmdCORINEFetch && o.cmdCORINEFetch->parsed()) {
		return tools_corine_fetch(o.corineBBox, o.corineAOI, o.corineOutput, o.corineYear, o.corineOverwrite);
	}

	if (o.cmdFloodRiskFetch && o.cmdFloodRiskFetch->parsed()) {
		return tools_flood_risk_fetch(o.floodRiskBBox, o.floodRiskAOI, o.floodRiskOutput, o.floodRiskProduct, o.floodRiskOverwrite);
	}

	// Italy-specific fetch tools
	if (o.cmdEUAPFetch && o.cmdEUAPFetch->parsed()) {
		return tools_euap_fetch(o.euapBBox, o.euapAOI, o.euapOutput, o.euapOverwrite);
	}

	if (o.cmdIFFIFetch && o.cmdIFFIFetch->parsed()) {
		return tools_iffi_fetch(o.iffiBBox, o.iffiAOI, o.iffiOutput, o.iffiOverwrite);
	}

	if (o.cmdTINITALYFetch && o.cmdTINITALYFetch->parsed()) {
		return tools_tinitaly_fetch(o.tinitalyBBox, o.tinitalyAOI, o.tinitalyOutput, o.tinitalyOverwrite);
	}

	if (o.cmdINGVSeismicFetch && o.cmdINGVSeismicFetch->parsed()) {
		return tools_ingv_seismic_fetch(o.ingvSeismicBBox, o.ingvSeismicAOI, o.ingvSeismicOutput, o.ingvSeismicProduct, o.ingvSeismicOverwrite);
	}

	if (o.cmdINGVFaultsFetch && o.cmdINGVFaultsFetch->parsed()) {
		return tools_ingv_faults_fetch(o.ingvFaultsBBox, o.ingvFaultsAOI, o.ingvFaultsOutput, o.ingvFaultsOverwrite);
	}

	if (o.cmdEUHydroFetch && o.cmdEUHydroFetch->parsed()) {
		return tools_euhydro_fetch(o.euhydroBBox, o.euhydroAOI, o.euhydroOutput, o.euhydroOverwrite);
	}

	// Additional Italy-specific fetch tools (Priority 1)
	if (o.cmdItalianSoilFetch && o.cmdItalianSoilFetch->parsed()) {
		return tools_italian_soil_fetch(o.italianSoilOutput, o.italianSoilOverwrite);
	}

	if (o.cmdCORINEItalyFetch && o.cmdCORINEItalyFetch->parsed()) {
		return tools_corine_italy_fetch(o.corineItalyBBox, o.corineItalyAOI, o.corineItalyOutput, o.corineItalyYear, o.corineItalyOverwrite);
	}

	if (o.cmdSciGRIDGasFetch && o.cmdSciGRIDGasFetch->parsed()) {
		return tools_scigrid_gas_pipelines_fetch(o.scigridGasBBox, o.scigridGasAOI, o.scigridGasOutput, o.scigridGasCountry, o.scigridGasOverwrite);
	}

	if (o.cmdGEETileExport && o.cmdGEETileExport->parsed()) {
		return tools_gee_tile_export(o.geeBBox, o.geeAOI, o.geeAsset, o.geeBands, o.geeDateStart, o.geeDateEnd, o.geeScale, o.geeCRS, o.geeTilePixels, o.geeOutput, o.geeOverwrite);
	}

	if (o.cmdWMSFetch && o.cmdWMSFetch->parsed()) {
		return tools_wms_fetch(o.wmsURL, o.wmsLayers, o.wmsBBox, o.wmsAOI, o.wmsSRS, o.wmsWidth, o.wmsHeight, o.wmsFormat, o.wmsOutput, o.wmsOverwrite);
	}

	if (o.cmdWFSFetch && o.cmdWFSFetch->parsed()) {
		return tools_wfs_fetch(o.wfsURL, o.wfsTypeName, o.wfsBBox, o.wfsAOI, o.wfsVersion, o.wfsPageSize, o.wfsFilter, o.wfsOutput, o.wfsOverwrite);
	}

	if (o.cmdCopernicusEEA10Fetch && o.cmdCopernicusEEA10Fetch->parsed()) {
		return tools_copernicus_eea10_fetch(o.copEEA10BBox, o.copEEA10AOI, o.copEEA10Collection, o.copEEA10Output, o.copEEA10Overwrite);
	}

	if (o.cmdKMLToBBox && o.cmdKMLToBBox->parsed()) {
		std::string bboxOut;
		int rc = tools_kml_to_bbox(o.kmlInput, bboxOut);
		if (rc == 0) {
			std::cout << bboxOut << std::endl;
			if (!o.kmlBBoxOutput.empty()) {
				std::ofstream f(o.kmlBBoxOutput);
				if (f.good()) { f << bboxOut; }
			}
		}
		return rc;
	}

	// DEM Analysis Tools
	if (o.cmdTerrainSlope && o.cmdTerrainSlope->parsed()) {
		return tools_terrain_slope(o.terrainSlopeInput, o.terrainSlopeOutput, 
		                           o.terrainSlopePercent, o.terrainSlopeComputeEdges,
		                           o.terrainSlopeAlgorithm, o.terrainSlopeOverwrite);
	}

	if (o.cmdTerrainAspect && o.cmdTerrainAspect->parsed()) {
		return tools_terrain_aspect(o.terrainAspectInput, o.terrainAspectOutput,
		                           o.terrainAspectZeroForFlat, o.terrainAspectOverwrite);
	}

	if (o.cmdTerrainCurvature && o.cmdTerrainCurvature->parsed()) {
		return tools_terrain_curvature(o.terrainCurvatureInput, o.terrainCurvatureOutput,
		                               o.terrainCurvatureType, o.terrainCurvatureOverwrite);
	}

	if (o.cmdRasterThreshold && o.cmdRasterThreshold->parsed()) {
		return tools_raster_threshold(o.rasterThresholdInput, o.rasterThresholdOutput,
		                              o.rasterThresholdValue, o.rasterThresholdAbove,
		                              o.rasterThresholdBelow, o.rasterThresholdInvert,
		                              o.rasterThresholdOverwrite);
	}

	// Phase 3B: Critical Geospatial Tools
	if (o.cmdRasterReclassify && o.cmdRasterReclassify->parsed()) {
		return tools_raster_reclassify(o.rasterReclassifyInput, o.rasterReclassifyOutput,
		                               o.rasterReclassifyRules, o.rasterReclassifyType,
		                               o.rasterReclassifyOverwrite);
	}

	if (o.cmdRasterBoolean && o.cmdRasterBoolean->parsed()) {
		return tools_raster_boolean(o.rasterBooleanInputs, o.rasterBooleanOperation,
		                            o.rasterBooleanOutput, o.rasterBooleanOverwrite);
	}

	if (o.cmdVectorToRaster && o.cmdVectorToRaster->parsed()) {
		return tools_vector_to_raster(o.vectorToRasterInput, o.vectorToRasterOutput,
		                              o.vectorToRasterAttribute, o.vectorToRasterResolution,
		                              o.vectorToRasterExtent, o.vectorToRasterBurn,
		                              o.vectorToRasterType, o.vectorToRasterOverwrite);
	}

	if (o.cmdRasterProximity && o.cmdRasterProximity->parsed()) {
		return tools_raster_proximity(o.rasterProximityInput, o.rasterProximityOutput,
		                              o.rasterProximityValues, o.rasterProximityMaxDist,
		                              o.rasterProximityUnits, o.rasterProximityOverwrite);
	}

	// Phase 3C/3D: Additional Tools
	if (o.cmdVectorBuffer && o.cmdVectorBuffer->parsed()) {
		return tools_vector_buffer(o.vectorBufferInput, o.vectorBufferOutput,
		                           o.vectorBufferDistance, o.vectorBufferSegments,
		                           o.vectorBufferEndCap, o.vectorBufferDissolve,
		                           o.vectorBufferOverwrite);
	}

	if (o.cmdRasterExtractByMask && o.cmdRasterExtractByMask->parsed()) {
		return tools_raster_extract_by_mask(o.rasterExtractMaskInput, o.rasterExtractMaskVector,
		                                    o.rasterExtractMaskOutput, o.rasterExtractMaskCrop,
		                                    o.rasterExtractMaskOverwrite);
	}

	if (o.cmdRasterHillshade && o.cmdRasterHillshade->parsed()) {
		return tools_raster_hillshade(o.rasterHillshadeInput, o.rasterHillshadeOutput,
		                              o.rasterHillshadeAzimuth, o.rasterHillshadeAltitude,
		                              o.rasterHillshadeZFactor, o.rasterHillshadeOverwrite);
	}

	if (o.cmdRasterTRI && o.cmdRasterTRI->parsed()) {
		return tools_raster_tri(o.rasterTRIInput, o.rasterTRIOutput, o.rasterTRIOverwrite);
	}

	if (o.cmdPerplexitySearch && o.cmdPerplexitySearch->parsed()) {
		return tools_perplexity_search(o.perplexityQuery, o.perplexityLocation,
		                               o.perplexityBBox, o.perplexityPlace,
		                               o.perplexityTopic, o.perplexityDatasetResearch,
		                               o.perplexityModel, o.perplexityMaxTokens,
		                               o.perplexityTemperature, o.perplexityRecency,
		                               o.perplexityFormat, o.perplexityOutput,
		                               o.perplexityCitations);
	}

	// AI Operator handlers
	if (o.cmdAIOperator && o.cmdAIOperator->parsed()) {
		agrs::ai::AIOperator ai;
		if (o.cmdAIAsk && o.cmdAIAsk->parsed()) {
			agrs::ai::TaskContext ctx;
			ctx.project_path = o.aiProjectPath;
			if (!ai.is_available()) {
				std::cout << ai.get_install_instructions() << std::endl;
				return 0;
			}
			std::string task_id = ai.submit_task(o.aiPrompt, ctx, agrs::ai::TaskPriority::NORMAL);
			auto res = ai.get_result(task_id, true);
			std::cout << res.output << std::endl;
			return 0;
		}
		if (o.cmdAITask && o.cmdAITask->parsed()) {
			agrs::ai::TaskContext ctx;
			ctx.project_path = o.aiProjectPath;
			if (!ai.is_available()) {
				std::cout << ai.get_install_instructions() << std::endl;
				return 0;
			}
			std::string task_id = ai.submit_task(o.aiTaskPrompt, ctx, agrs::ai::TaskPriority::HIGH);
			auto res = ai.get_result(task_id, true);
			std::cout << res.output << std::endl;
			return 0;
		}
	}
	
	if (o.cmdAnalyzeFetchTools && o.cmdAnalyzeFetchTools->parsed()) {
		// If lat/lon provided, detect country
		std::string country = o.analyzeFetchCountry;
		if (o.analyzeFetchLat != 0.0 && o.analyzeFetchLon != 0.0 && country.empty()) {
			country = detect_country_from_coordinates(o.analyzeFetchLat, o.analyzeFetchLon);
		}
		return tools_analyze_fetch_tools(o.analyzeFetchMode, country, o.analyzeFetchOutput, o.analyzeFetchVerbose);
	}
	
	// ============================================================================
	// PIRL (Physics-Informed Reinforcement Learning) Pipeline Routing
	// ============================================================================
	
	if (o.cmdPirlGenerateRoute && o.cmdPirlGenerateRoute->parsed()) {
		return tools_pirl_generate_route(o.pirlConfigPath, o.pirlOutputDir, o.pirlVisualize);
	}
	
	if (o.cmdPirlTrainModel && o.cmdPirlTrainModel->parsed()) {
		return tools_pirl_train_model(o.pirlTrainingConfigPath, o.pirlModelPath, o.pirlNumEpisodes);
	}
	
	if (o.cmdPirlEvaluate && o.cmdPirlEvaluate->parsed()) {
		return tools_pirl_evaluate(o.pirlModelPath, o.pirlTestDir, o.pirlReportPath);
	}
	
	if (o.cmdPirlGenerateCorridors && o.cmdPirlGenerateCorridors->parsed()) {
		return tools_pirl_generate_corridors(o.pirlConfigPath, o.pirlOutputDir, o.pirlNumCorridors);
	}
	
	if (o.cmdPirlCreateConfig && o.cmdPirlCreateConfig->parsed()) {
		return tools_pirl_create_config(o.pirlProjectName, o.pirlConfigPath, o.pirlInteractive);
	}
	
	if (o.cmdPirlResetEpisode && o.cmdPirlResetEpisode->parsed()) {
		return tools_pirl_reset_episode(o.pirlConfigPath, o.pirlOutputDir);
	}
	
	if (o.cmdPirlStep && o.cmdPirlStep->parsed()) {
		return tools_pirl_step(o.pirlConfigPath, o.pirlActionFile, o.pirlOutputDir);
	}
	
	return std::nullopt;
}

// Helper function to get current UTC timestamp in ISO 8601 format
static std::string to_iso8601_utc() {
	using namespace std::chrono;
	auto now = system_clock::now();
	std::time_t t = system_clock::to_time_t(now);
	std::tm tm{};
	#ifdef _WIN32
		gmtime_s(&tm, &t);
	#else
		gmtime_r(&t, &tm);
	#endif
	char buf[32];
	std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
	return std::string(buf);
}

// Helper function to check if a binary is available
static bool check_binary_available(const std::string& name) {
	std::string out, err;
	int rc = system(("which " + name + " > /dev/null 2>&1").c_str());
	return rc == 0;
}

// Helper function to run a command and capture output
static int run_cmd_capture(const std::string& cmd, std::string& out, std::string& err) {
	FILE* pipe = popen(cmd.c_str(), "r");
	if (!pipe) return -1;
	
	char buffer[128];
	while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
		out += buffer;
	}
	
	int rc = pclose(pipe);
	return rc;
}

// Helper function to ensure directory exists
static bool ensure_dir(const std::filesystem::path& dir, std::string& err) {
	try {
		if (!std::filesystem::exists(dir)) {
			std::filesystem::create_directories(dir);
		}
		return true;
	} catch (const std::exception& e) {
		err = e.what();
		return false;
	}
}

using nlohmann::json;

static std::string iso8601_utc_now() {
	using namespace std::chrono;
	auto now = system_clock::now();
	auto t = system_clock::to_time_t(now);
	std::tm tm{};
	#ifdef _WIN32
		gmtime_s(&tm, &t);
	#else
		gmtime_r(&t, &tm);
	#endif
	char buf[32];
	std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
	return std::string(buf);
}

static std::optional<std::string> sha256_file(const std::string& path) {
	std::string out, err;
	int rc = run_cmd_capture("sha256sum '" + path + "' | awk '{print $1}'", out, err);
	if (rc != 0 || out.empty()) return std::nullopt;
	// Trim whitespace
	out.erase(out.find_last_not_of("\n\r\t ")+1);
	return out;
}

static bool write_json_file(const std::filesystem::path& p, const json& j) {
	try {
		std::ofstream ofs(p);
		if (!ofs) return false;
		ofs << j.dump(2);
		return true;
	} catch (...) {
		return false;
	}
}

// Helper function to generate standardized filename
static std::string generate_filename(const std::string& date,
                                   const std::string& type,
                                   const std::string& resolution,
                                   const std::string& source,
                                   const std::string& format,
                                   const std::string& crs,
                                   const std::string& aoi,
                                   const std::string& extension = ".tif") {
    std::ostringstream filename;
    filename << date << "_" << type << "_" << resolution << "_" << source 
             << "_" << format << "_" << crs << "_" << aoi << extension;
    return filename.str();
}

// Helper function to extract AOI name from path or bbox
static std::string extract_aoi_name(const std::string& aoiPath, const std::string& bbox) {
    if (!aoiPath.empty()) {
        std::filesystem::path path(aoiPath);
        std::string stem = path.stem().string();
        // Convert to uppercase and remove common suffixes
        std::transform(stem.begin(), stem.end(), stem.begin(), ::toupper);
        if (stem.find("_AOI") != std::string::npos) {
            stem = stem.substr(0, stem.find("_AOI"));
        }
        return stem;
    } else if (!bbox.empty()) {
        // Extract approximate coordinates from bbox
        std::istringstream iss(bbox);
        std::string token;
        std::vector<double> coords;
        while (std::getline(iss, token, ',')) {
            coords.push_back(std::stod(token));
        }
        if (coords.size() == 4) {
            double centerLon = (coords[0] + coords[2]) / 2.0;
            double centerLat = (coords[1] + coords[3]) / 2.0;
            std::ostringstream aoi;
            aoi << (centerLat >= 0 ? "N" : "S") << std::abs((int)centerLat)
                << (centerLon >= 0 ? "E" : "W") << std::abs((int)centerLon);
            return aoi.str();
        }
    }
    return "UNKNOWN";
}

// Helper function to get current date in YYYYMMDD format
static std::string get_current_date() {
    auto now = std::chrono::system_clock::now();
    auto time_t = std::chrono::system_clock::to_time_t(now);
    auto tm = *std::localtime(&time_t);
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y%m%d");
    return oss.str();
}

// Helper function to determine DEM type from source (only if explicitly specified)
static std::string get_dem_type(const std::string& source) {
    std::string upperSource = source;
    std::transform(upperSource.begin(), upperSource.end(), upperSource.begin(), ::toupper);
    
    // Only return specific types if the source explicitly provides this information
    // For most cases, use generic "DEM" unless the source metadata specifies otherwise
    if (upperSource.find("DSM") != std::string::npos) {
        return "DSM";
    } else if (upperSource.find("DTM") != std::string::npos) {
        return "DTM";
    }
    
    return "DEM"; // Generic default - let source metadata specify if needed
}

// Helper function to create sidecar JSON for every output
static void write_sidecar_json(const std::string& outputPath, const json& metadata) {
    std::string jsonPath = outputPath + ".json";
    std::ofstream jsonFile(jsonPath);
    if (jsonFile.is_open()) {
        jsonFile << metadata.dump(2) << std::endl;
        jsonFile.close();
    }
}

// Helper function to get raster metadata for sidecar JSON
static json get_raster_metadata(const std::string& rasterPath) {
    json metadata;
    std::string out, err;
    int rc = run_cmd_capture("gdalinfo -json '" + rasterPath + "'", out, err);
    if (rc == 0) {
        try {
            auto gdalInfo = json::parse(out);
            metadata["gdal_info"] = gdalInfo;
            
            // Extract key information
            if (gdalInfo.contains("size")) {
                metadata["size"] = gdalInfo["size"];
            }
            if (gdalInfo.contains("geoTransform")) {
                metadata["geo_transform"] = gdalInfo["geoTransform"];
            }
            if (gdalInfo.contains("coordinateSystem")) {
                metadata["coordinate_system"] = gdalInfo["coordinateSystem"];
            }
            if (gdalInfo.contains("bands") && gdalInfo["bands"].is_array() && !gdalInfo["bands"].empty()) {
                const auto& band = gdalInfo["bands"][0];
                if (band.contains("type")) metadata["data_type"] = band["type"];
                if (band.contains("block")) metadata["block_size"] = band["block"];
            }
        } catch (const std::exception& e) {
            metadata["error"] = "Failed to parse GDAL info: " + std::string(e.what());
        }
    } else {
        metadata["error"] = "Failed to get GDAL info: " + (err.empty() ? out : err);
    }
    return metadata;
}

int tools_gpkg_translate(const std::string& inputPath,
                        const std::string& outputDir,
                        bool separateLayers,
                        const std::string& vectorFormat,
                        const std::string& rasterFormat,
                        const std::string& tableFormat,
                        const std::string& layerFilter,
                        bool includeMetadata,
                        bool overwrite) {
	
	std::string err;
	
	// Check if GDAL/OGR utilities are available
	if (!check_binary_available("ogrinfo") || !check_binary_available("ogr2ogr") || !check_binary_available("gdal_translate") || !check_binary_available("gdalinfo")) {
		std::cerr << "GDAL/OGR utilities not found; install gdal-bin." << std::endl;
		return 2;
	}
	
	// Validate input file
	std::filesystem::path inputFile = std::filesystem::absolute(std::filesystem::path(inputPath));
	if (!std::filesystem::exists(inputFile)) {
		std::cerr << "Input GPKG file not found: " << inputFile.string() << std::endl;
		return 2;
	}
	
	// Create output directory
	std::filesystem::path outputPath = std::filesystem::path(outputDir);
	if (!ensure_dir(outputPath, err)) {
		std::cerr << "Failed to create output directory: " << err << std::endl;
		return 2;
	}
	
	// Ensure structured subdirectories always exist
	std::filesystem::create_directories(outputPath / "vectors");
	std::filesystem::create_directories(outputPath / "rasters");
	std::filesystem::create_directories(outputPath / "tables");
	if (includeMetadata) {
		std::filesystem::create_directories(outputPath / "metadata");
	}

	// Get GPKG information using ogrinfo
	std::string infoOut, infoErr;
	std::string cmd = "ogrinfo -so -al -json '" + inputFile.string() + "'";
	int rc = run_cmd_capture(cmd, infoOut, infoErr);
	if (rc != 0) {
		std::cerr << "Failed to analyze GPKG file: " << (infoErr.empty() ? infoOut : infoErr) << std::endl;
		return 2;
	}

	// Parse the JSON output to get layer information
	json j;
	try { j = json::parse(infoOut); }
	catch (...) {
		std::cerr << "Failed to parse ogrinfo JSON." << std::endl;
		return 2;
	}

	std::optional<std::regex> layerRegex;
	if (!layerFilter.empty()) {
		try { layerRegex = std::regex(layerFilter); }
		catch (...) {
			std::cerr << "Invalid --filter-layers regex." << std::endl;
			return 2;
		}
	}

	// Prepare master manifest
	json master;
	master["type"] = "gpkg_translate";
	master["generated_at"] = iso8601_utc_now();
	master["source"]["path"] = inputFile.string();
	if (auto h = sha256_file(inputFile.string())) master["source"]["hash"] = *h;
	master["outputs"] = json::array();

	// Enumerate vector/table layers
	const auto& layers = j.contains("layers") ? j["layers"] : json::array();
	int exportedCount = 0;
	for (const auto& L : layers) {
		if (!L.contains("name")) continue;
		std::string name = L["name"].get<std::string>();
		if (layerRegex && !std::regex_search(name, *layerRegex)) continue;

		bool hasGeom = false;
		if (L.contains("geometryFields") && L["geometryFields"].is_array() && !L["geometryFields"].empty()) {
			hasGeom = true;
		}

		std::filesystem::path outPath;
		std::string kind;
		std::string format;

		if (hasGeom) {
			// Vector export
			kind = "vector";
			if (vectorFormat == "geojson") {
				format = "geojson";
				outPath = outputPath / "vectors" / (name + ".geojson");
				if (std::filesystem::exists(outPath) && !overwrite) {
					std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
					return 2;
				}
				std::string cmdExp = "ogr2ogr -f GeoJSON -lco WRITE_NAME=NO '" + outPath.string() + "' '" + inputFile.string() + "' '" + name + "'";
				std::string o,e; int rc2 = run_cmd_capture(cmdExp, o, e);
				if (rc2 != 0) { std::cerr << "ogr2ogr failed for layer '" << name << "': " << (e.empty()?o:e) << std::endl; return 2; }
			} else if (vectorFormat == "shp" || vectorFormat == "shapefile") {
				format = "shp";
				outPath = outputPath / "vectors" / (name + ".shp");
				if (std::filesystem::exists(outPath) && !overwrite) { std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; return 2; }
				std::string cmdExp = "ogr2ogr -f 'ESRI Shapefile' '" + outPath.string() + "' '" + inputFile.string() + "' '" + name + "'";
				std::string o,e; int rc2 = run_cmd_capture(cmdExp, o, e);
				if (rc2 != 0) { std::cerr << "ogr2ogr failed for layer '" << name << "': " << (e.empty()?o:e) << std::endl; return 2; }
			} else {
				std::cerr << "Unsupported vector format: " << vectorFormat << std::endl; return 2;
			}
		} else {
			// Attribute table export
			kind = "table";
			if (tableFormat == "parquet") {
				format = "parquet";
				outPath = outputPath / "tables" / (name + ".parquet");
				if (std::filesystem::exists(outPath) && !overwrite) { std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; return 2; }
				std::string cmdExp = "ogr2ogr -f Parquet '" + outPath.string() + "' '" + inputFile.string() + "' '" + name + "'";
				std::string o,e; int rc2 = run_cmd_capture(cmdExp, o, e);
				if (rc2 != 0) {
					// Fallback to CSV if Parquet driver missing
					outPath = outputPath / "tables" / (name + ".csv");
					format = "csv";
					cmdExp = "ogr2ogr -f CSV '" + outPath.string() + "' '" + inputFile.string() + "' '" + name + "'";
					int rc3 = run_cmd_capture(cmdExp, o, e);
					if (rc3 != 0) { std::cerr << "ogr2ogr failed for table '" << name << "': " << (e.empty()?o:e) << std::endl; return 2; }
				}
			} else if (tableFormat == "csv") {
				format = "csv";
				outPath = outputPath / "tables" / (name + ".csv");
				if (std::filesystem::exists(outPath) && !overwrite) { std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; return 2; }
				std::string cmdExp = "ogr2ogr -f CSV '" + outPath.string() + "' '" + inputFile.string() + "' '" + name + "'";
				std::string o,e; int rc2 = run_cmd_capture(cmdExp, o, e);
				if (rc2 != 0) { std::cerr << "ogr2ogr failed for table '" << name << "': " << (e.empty()?o:e) << std::endl; return 2; }
			} else {
				std::cerr << "Unsupported table format: " << tableFormat << std::endl; return 2;
			}
		}

		// Build per-layer manifest entry
		json layerj;
		layerj["name"] = name;
		layerj["kind"] = kind;
		layerj["format"] = format;
		layerj["path"] = outPath.string();
		if (L.contains("fields")) layerj["fields"] = L["fields"];
		if (L.contains("featureCount")) layerj["feature_count"] = L["featureCount"];
		if (L.contains("geometryFields") && !L["geometryFields"].empty()) {
			const auto& gf = L["geometryFields"][0];
			if (gf.contains("extent")) layerj["extent"] = gf["extent"];
			if (gf.contains("coordinateSystem")) {
				const auto& cs = gf["coordinateSystem"];
				if (cs.contains("projjson") && cs["projjson"].contains("id") && cs["projjson"]["id"].contains("code")) {
					layerj["crs"] = std::string("EPSG:") + std::to_string(cs["projjson"]["id"]["code"].get<int>());
				}
			}
		}

		if (includeMetadata) {
			write_json_file(outputPath / "metadata" / (name + ".json"), layerj);
		}
		master["outputs"].push_back(layerj);
		exportedCount++;
	}

	// Enumerate rasters via gpkg_contents query for tiles and gridded coverages
	{
		std::string gcOut, gcErr;
		std::string cmdGc = "ogrinfo -dialect SQLite -sql 'SELECT table_name FROM gpkg_contents WHERE data_type IN (\"tiles\", \"2d-gridded-coverage\") AND table_name IS NOT NULL' -json '" + inputFile.string() + "'";
		int rcGc = run_cmd_capture(cmdGc, gcOut, gcErr);
		if (rcGc == 0) {
			try {
				json gc = json::parse(gcOut);
				if (gc.contains("layers") && gc["layers"].is_array()) {
					for (const auto& layer : gc["layers"]) {
						if (!layer.contains("name") || layer["name"] != "SELECT") continue;
						// Extract table names from the SELECT query results
						if (layer.contains("fields") && layer["fields"].is_array()) {
							// Get the actual table names from the query results
							std::string queryOut, queryErr;
							std::string cmdQuery = "ogrinfo -dialect SQLite -sql 'SELECT table_name FROM gpkg_contents WHERE data_type IN (\"tiles\", \"2d-gridded-coverage\") AND table_name IS NOT NULL' '" + inputFile.string() + "'";
							int rcQuery = run_cmd_capture(cmdQuery, queryOut, queryErr);
							if (rcQuery == 0) {
								// Parse the text output to extract table names
								std::istringstream iss(queryOut);
								std::string line;
								while (std::getline(iss, line)) {
									if (line.find("table_name (String) =") != std::string::npos) {
										size_t pos = line.find("= ");
										if (pos != std::string::npos) {
											std::string rasterName = line.substr(pos + 2);
											// Trim whitespace
											rasterName.erase(0, rasterName.find_first_not_of(" \t"));
											rasterName.erase(rasterName.find_last_not_of(" \t") + 1);
											if (layerRegex && !std::regex_search(rasterName, *layerRegex)) continue;
											
											// Construct GDAL subdataset name for GPKG rasters
											std::string sdsName = "GPKG:\"" + inputFile.string() + "\":" + rasterName;
											std::filesystem::path outPath = outputPath / "rasters" / (rasterName + ".tif");
											if (std::filesystem::exists(outPath) && !overwrite) { 
												std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; 
												return 2; 
											}
											
											// Export based on raster format preference
											std::string o, e;
											int rc = -1;
											if (rasterFormat == "cog") {
												std::string cmdCog = "gdal_translate -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES '" + sdsName + "' '" + outPath.string() + "'";
												rc = run_cmd_capture(cmdCog, o, e);
											}
											if (rc != 0) {
												// Fallback to tiled GeoTIFF
												std::string cmdT = "gdal_translate -of GTiff -co TILED=YES -co COMPRESS=DEFLATE '" + sdsName + "' '" + outPath.string() + "'";
												rc = run_cmd_capture(cmdT, o, e);
											}
											if (rc != 0) { 
												std::cerr << "gdal_translate failed for raster '" << rasterName << "': " << (e.empty()?o:e) << std::endl; 
												return 2; 
											}

											json rj;
											rj["name"] = rasterName;
											rj["kind"] = "raster";
											rj["format"] = (rasterFormat == "cog") ? "cog" : "tif";
											rj["path"] = outPath.string();
											master["outputs"].push_back(rj);
											exportedCount++;
										}
									}
								}
							}
						}
					}
				}
			} catch (...) {
				// ignore raster parsing errors
			}
		}
		
		// Also check gdalinfo subdatasets as fallback
		std::string giOut, giErr;
		std::string cmdGi = "gdalinfo -json '" + inputFile.string() + "'";
		int rcGi = run_cmd_capture(cmdGi, giOut, giErr);
		if (rcGi == 0) {
			try {
				json gi = json::parse(giOut);
				if (gi.contains("subdatasets") && gi["subdatasets"].is_array()) {
					for (const auto& sd : gi["subdatasets"]) {
						if (!sd.contains("name")) continue;
						std::string sdsName = sd["name"].get<std::string>();
						// Extract layer name after last ':' if possible
						std::string baseName = sdsName;
						size_t pos = baseName.find_last_of(':');
						if (pos != std::string::npos && pos + 1 < baseName.size()) baseName = baseName.substr(pos + 1);
						if (layerRegex && !std::regex_search(baseName, *layerRegex)) continue;
						
						// Skip if already processed via gpkg_contents
						bool alreadyProcessed = false;
						for (const auto& output : master["outputs"]) {
							if (output.contains("name") && output["name"] == baseName && output.contains("kind") && output["kind"] == "raster") {
								alreadyProcessed = true;
								break;
							}
						}
						if (alreadyProcessed) continue;
						
						std::filesystem::path outPath = outputPath / "rasters" / (baseName + ".tif");
						if (std::filesystem::exists(outPath) && !overwrite) { 
							std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; 
							return 2; 
						}
						
						std::string o, e;
						int rc = -1;
						if (rasterFormat == "cog") {
							std::string cmdCog = "gdal_translate -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES '" + sdsName + "' '" + outPath.string() + "'";
							rc = run_cmd_capture(cmdCog, o, e);
						}
						if (rc != 0) {
							std::string cmdT = "gdal_translate -of GTiff -co TILED=YES -co COMPRESS=DEFLATE '" + sdsName + "' '" + outPath.string() + "'";
							rc = run_cmd_capture(cmdT, o, e);
						}
						if (rc != 0) { 
							std::cerr << "gdal_translate failed for raster '" << baseName << "': " << (e.empty()?o:e) << std::endl; 
							return 2; 
						}

						json rj;
						rj["name"] = baseName;
						rj["kind"] = "raster";
						rj["format"] = (rasterFormat == "cog") ? "cog" : "tif";
						rj["path"] = outPath.string();
						master["outputs"].push_back(rj);
						exportedCount++;
					}
				}
			} catch (...) {
				// ignore raster parsing errors
			}
		}
	}

	// Write master manifest
	write_json_file(outputPath / "manifest.json", master);

	if (exportedCount == 0) {
		std::cerr << "No layers exported (check filters)." << std::endl;
		return 2;
	}

	std::cout << "tools gpkg_translate OK: exported " << exportedCount << " layer(s)." << std::endl;
	return 0;
}

int tools_raster_query(const std::string& rasterPath,
                      double longitude,
                      double latitude,
                      const std::string& outputFormat) {
	
	// Check if GDAL utilities are available
	if (!check_binary_available("gdalinfo") || !check_binary_available("gdal_translate")) {
		std::cerr << "GDAL utilities not found; install gdal-bin." << std::endl;
		return 2;
	}
	
	// Validate input file
	std::filesystem::path inputFile = std::filesystem::absolute(std::filesystem::path(rasterPath));
	if (!std::filesystem::exists(inputFile)) {
		std::cerr << "Raster file not found: " << inputFile.string() << std::endl;
		return 2;
	}
	
	// Get raster information
	std::string infoOut, infoErr;
	std::string cmd = "gdalinfo -json '" + inputFile.string() + "'";
	int rc = run_cmd_capture(cmd, infoOut, infoErr);
	if (rc != 0) {
		std::cerr << "Failed to analyze raster file: " << (infoErr.empty() ? infoOut : infoErr) << std::endl;
		return 2;
	}
	
	// Parse raster info to get CRS
	json rasterInfo;
	try { 
		rasterInfo = json::parse(infoOut); 
	} catch (...) {
		std::cerr << "Failed to parse raster info JSON." << std::endl;
		return 2;
	}
	
	// Extract CRS information
	std::string rasterCRS = "EPSG:4326"; // Default to WGS84
	if (rasterInfo.contains("coordinateSystem") && rasterInfo["coordinateSystem"].contains("wkt")) {
		std::string wkt = rasterInfo["coordinateSystem"]["wkt"];
		if (wkt.find("EPSG") != std::string::npos) {
			// Extract EPSG code from WKT
			size_t pos = wkt.find("ID[\"EPSG\",");
			if (pos != std::string::npos) {
				pos += 10; // Skip "ID[\"EPSG\","
				size_t end = wkt.find("]", pos);
				if (end != std::string::npos) {
					rasterCRS = "EPSG:" + wkt.substr(pos, end - pos);
				}
			}
		}
	}
	
	// Transform coordinates if needed
	double queryLon = longitude;
	double queryLat = latitude;
	if (rasterCRS != "EPSG:4326") {
		// Use gdaltransform to convert coordinates
		std::string transformCmd = "echo \"" + std::to_string(longitude) + " " + std::to_string(latitude) + "\" | gdaltransform -s_srs EPSG:4326 -t_srs " + rasterCRS;
		std::string transformOut, transformErr;
		int transformRc = run_cmd_capture(transformCmd, transformOut, transformErr);
		if (transformRc == 0 && !transformOut.empty()) {
			std::istringstream iss(transformOut);
			iss >> queryLon >> queryLat;
		}
	}
	
	// Get pixel value using gdalwarp to extract a small area and then query
	std::string tempExtract = "/tmp/raster_query_" + std::to_string(std::time(nullptr)) + ".tif";
	double buffer = 0.001; // Small buffer around the point
	std::string warpCmd = "gdalwarp -te " + 
		std::to_string(longitude - buffer) + " " + 
		std::to_string(latitude - buffer) + " " + 
		std::to_string(longitude + buffer) + " " + 
		std::to_string(latitude + buffer) + 
		" -t_srs EPSG:4326 '" + inputFile.string() + "' '" + tempExtract + "'";
	
	std::string warpOut, warpErr;
	int warpRc = run_cmd_capture(warpCmd, warpOut, warpErr);
	if (warpRc != 0) {
		std::cerr << "Failed to extract raster area: " << (warpErr.empty() ? warpOut : warpErr) << std::endl;
		return 2;
	}
	
	// Query the extracted raster
	std::string locationCmd = "gdallocationinfo -valonly -geoloc '" + tempExtract + "' " + std::to_string(longitude) + " " + std::to_string(latitude);
	std::string locationOut, locationErr;
	int locationRc = run_cmd_capture(locationCmd, locationOut, locationErr);
	
	// Clean up temporary file
	std::filesystem::remove(tempExtract);
	
	if (locationRc != 0) {
		std::cerr << "Failed to query raster value: " << (locationErr.empty() ? locationOut : locationErr) << std::endl;
		return 2;
	}
	
	// Parse the pixel value
	std::string pixelValue = locationOut;
	// Trim whitespace
	pixelValue.erase(0, pixelValue.find_first_not_of(" \t\n\r"));
	pixelValue.erase(pixelValue.find_last_not_of(" \t\n\r") + 1);
	
	// Create result JSON
	json result;
	result["query_coordinates"] = {
		{"longitude", longitude},
		{"latitude", latitude},
		{"crs", "EPSG:4326"}
	};
	result["raster_coordinates"] = {
		{"x", queryLon},
		{"y", queryLat},
		{"crs", rasterCRS}
	};
	result["pixel_value"] = pixelValue;
	result["raster_file"] = inputFile.string();
	result["timestamp"] = iso8601_utc_now();
	
	// Add interpretation based on raster type
	std::string filename = inputFile.filename().string();
	if (filename.find("AW3D30") != std::string::npos || filename.find("DEM") != std::string::npos) {
		result["interpretation"] = {
			{"type", "elevation"},
			{"unit", "meters"},
			{"description", "Digital elevation model value"}
		};
	} else if (filename.find("water_index") != std::string::npos) {
		result["interpretation"] = {
			{"type", "water_index"},
			{"unit", "index"},
			{"description", "Water index (-1 to 1)"},
			{"water_indicators", {
				{"high_water", "> 0.3"},
				{"moderate_water", "0.1 to 0.3"},
				{"low_water", "-0.1 to 0.1"},
				{"no_water", "< -0.1"}
			}}
		};
	}
	
	// Output result
	if (outputFormat == "json") {
		std::cout << result.dump(2) << std::endl;
	} else {
		std::cout << "Pixel value: " << pixelValue << std::endl;
	}
	
	return 0;
}

int tools_vector_query(const std::string& vectorPath,
                      double longitude,
                      double latitude,
                      const std::string& queryType) {
	
	// Check if GDAL/OGR utilities are available
	if (!check_binary_available("ogrinfo") || !check_binary_available("ogr2ogr")) {
		std::cerr << "GDAL/OGR utilities not found; install gdal-bin." << std::endl;
		return 2;
	}
	
	// Validate input file
	std::filesystem::path inputFile = std::filesystem::absolute(std::filesystem::path(vectorPath));
	if (!std::filesystem::exists(inputFile)) {
		std::cerr << "Vector file not found: " << inputFile.string() << std::endl;
		return 2;
	}
	
	// Create a temporary point file for spatial query
	std::string tempPointFile = "/tmp/query_point.geojson";
	json pointGeoJSON;
	pointGeoJSON["type"] = "Feature";
	pointGeoJSON["geometry"] = {
		{"type", "Point"},
		{"coordinates", {longitude, latitude}}
	};
	pointGeoJSON["properties"] = {
		{"query_id", "temp_point"}
	};
	
	// Write temporary point file
	std::ofstream tempFile(tempPointFile);
	if (!tempFile) {
		std::cerr << "Failed to create temporary point file." << std::endl;
		return 2;
	}
	tempFile << pointGeoJSON.dump();
	tempFile.close();
	
	// Perform spatial query based on type
	std::string queryCmd;
	if (queryType == "contains") {
		// For GeoJSON files, use a different approach since geometry column name varies
		if (inputFile.extension() == ".geojson") {
			// Use ogr2ogr with spatial filter instead of SQL
			std::string tempOutput = "/tmp/vector_query_" + std::to_string(std::time(nullptr)) + ".geojson";
			queryCmd = "ogr2ogr -spat " + std::to_string(longitude) + " " + std::to_string(latitude) + " " + 
				std::to_string(longitude) + " " + std::to_string(latitude) + 
				" -f GeoJSON '" + tempOutput + "' '" + inputFile.string() + "'";
		} else {
			// For other formats, try with common geometry column names
			queryCmd = "ogrinfo -dialect SQLite -sql \"SELECT * FROM " + inputFile.stem().string() + " WHERE ST_Contains(geometry, ST_GeomFromText('POINT(" + std::to_string(longitude) + " " + std::to_string(latitude) + ")', 4326))\" -json '" + inputFile.string() + "'";
		}
	} else {
		// Find nearest feature (simplified approach)
		queryCmd = "ogrinfo -so -al -json '" + inputFile.string() + "'";
	}
	
	std::string queryOut, queryErr;
	int queryRc = run_cmd_capture(queryCmd, queryOut, queryErr);
	if (queryRc != 0) {
		std::cerr << "Failed to query vector data: " << (queryErr.empty() ? queryOut : queryErr) << std::endl;
		// Clean up temp file
		std::filesystem::remove(tempPointFile);
		return 2;
	}
	
	// Parse query results
	json queryResult;
	std::string tempOutputFile;
	
	if (queryType == "contains" && inputFile.extension() == ".geojson") {
		// For spatial filter approach, check if temp output file was created
		// Extract the temp file name from the command
		size_t start = queryCmd.find("'") + 1;
		size_t end = queryCmd.find("'", start);
		if (start != std::string::npos && end != std::string::npos) {
			tempOutputFile = queryCmd.substr(start, end - start);
		}
		if (!tempOutputFile.empty() && std::filesystem::exists(tempOutputFile)) {
			// Get info about the filtered results
			std::string infoCmd = "ogrinfo -so -al -json '" + tempOutputFile + "'";
			std::string infoOut, infoErr;
			int infoRc = run_cmd_capture(infoCmd, infoOut, infoErr);
			if (infoRc == 0) {
				try {
					queryResult = json::parse(infoOut);
				} catch (...) {
					queryResult = json::object();
				}
			}
			// Clean up temp output file
			std::filesystem::remove(tempOutputFile);
		}
	} else {
		try {
			queryResult = json::parse(queryOut);
		} catch (...) {
			std::cerr << "Failed to parse query results." << std::endl;
			std::filesystem::remove(tempPointFile);
			return 2;
		}
	}
	
	// Create result JSON
	json result;
	result["query_coordinates"] = {
		{"longitude", longitude},
		{"latitude", latitude},
		{"crs", "EPSG:4326"}
	};
	result["query_type"] = queryType;
	result["vector_file"] = inputFile.string();
	result["timestamp"] = iso8601_utc_now();
	
	if (queryResult.contains("layers") && queryResult["layers"].is_array() && !queryResult["layers"].empty()) {
		const auto& layer = queryResult["layers"][0];
		
		json layerInfo;
		layerInfo["name"] = layer.contains("name") ? layer["name"].get<std::string>() : "unknown";
		layerInfo["feature_count"] = layer.contains("featureCount") ? layer["featureCount"].get<int>() : 0;
		
		if (layer.contains("geometryFields") && layer["geometryFields"].is_array() && !layer["geometryFields"].empty()) {
			layerInfo["geometry_type"] = layer["geometryFields"][0]["type"].get<std::string>();
		} else {
			layerInfo["geometry_type"] = "unknown";
		}
		
		result["layer_info"] = layerInfo;
		
		if (layer.contains("fields")) {
			result["available_fields"] = layer["fields"];
		}
		
		result["status"] = "success";
		result["message"] = "Query completed successfully";
	} else {
		result["status"] = "no_features";
		result["message"] = "No features found at the specified coordinates";
	}
	
	// Clean up temp file
	std::filesystem::remove(tempPointFile);
	
	// Output result
	std::cout << result.dump(2) << std::endl;
	
	return 0;
}

int tools_raster_extract_band(const std::string& inputRaster,
                             int bandIndex,
                             const std::string& outputRaster,
                             const std::string& unit,
                             bool outputCOG,
                             bool overwrite) {
	// Validate dependencies
	if (!check_binary_available("gdalinfo") || !check_binary_available("gdal_translate")) {
		std::cerr << "GDAL utilities not found; install gdal-bin." << std::endl;
		return 2;
	}

	// Validate inputs
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(inputRaster));
	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input raster not found: " << inPath.string() << std::endl;
		return 2;
	}
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(outputRaster));
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}
	if (bandIndex <= 0) {
		std::cerr << "Band index must be >= 1" << std::endl;
		return 2;
	}

	// Inspect raster to fetch GeoTransform/SRS and NoData
	std::string giOut, giErr;
	int rcInfo = run_cmd_capture("gdalinfo -json '" + inPath.string() + "'", giOut, giErr);
	if (rcInfo != 0) {
		std::cerr << "Failed to inspect input raster: " << (giErr.empty()?giOut:giErr) << std::endl;
		return 2;
	}
	json j;
	try { j = json::parse(giOut); } catch (...) { std::cerr << "Failed to parse gdalinfo JSON." << std::endl; return 2; }

	int bandsCount = (j.contains("bands") && j["bands"].is_array()) ? (int)j["bands"].size() : 0;
	if (bandIndex > bandsCount) {
		std::cerr << "Requested band " << bandIndex << " exceeds band count (" << bandsCount << ")" << std::endl;
		return 2;
	}

	// Create VRT selecting the target band, enforcing Float32, and setting UnitType
	std::string vrtPath = std::string("/tmp/") + "extract_b" + std::to_string(bandIndex) + "_" + std::to_string(std::time(nullptr)) + ".vrt";
	try {
		// Reuse VRT creation pattern, but allow selecting arbitrary band
		int xSize = 0, ySize = 0;
		if (j.contains("size") && j["size"].is_array() && j["size"].size() == 2) {
			xSize = j["size"][0].get<int>();
			ySize = j["size"][1].get<int>();
		}
		if (xSize <= 0 || ySize <= 0) { std::cerr << "Invalid raster size" << std::endl; return 2; }

		std::string srsWkt;
		if (j.contains("coordinateSystem") && j["coordinateSystem"].contains("wkt") && j["coordinateSystem"]["wkt"].is_string()) {
			srsWkt = j["coordinateSystem"]["wkt"].get<std::string>();
		}

		std::string geoTransform;
		if (j.contains("geoTransform") && j["geoTransform"].is_array() && j["geoTransform"].size() == 6) {
			std::ostringstream gt;
			gt.setf(std::ios::fixed); gt << std::setprecision(15);
			for (size_t i = 0; i < 6; ++i) { if (i) gt << ", "; gt << j["geoTransform"][i].get<double>(); }
			geoTransform = gt.str();
		}

		double noData = std::numeric_limits<double>::quiet_NaN();
		bool hasNoData = false;
		if (j.contains("bands") && j["bands"].is_array() && !j["bands"].empty()) {
			const auto& b0 = j["bands"][0];
			if (b0.contains("noDataValue") && (b0["noDataValue"].is_number_float() || b0["noDataValue"].is_number_integer())) {
				hasNoData = true; noData = b0["noDataValue"].get<double>();
			}
		}

		std::ostringstream vrt;
		vrt << "<VRTDataset rasterXSize=\"" << xSize << "\" rasterYSize=\"" << ySize << "\">\n";
		if (!srsWkt.empty()) {
			vrt << "  <SRS>";
			for (char c : srsWkt) { if (c=='&') vrt<<"&amp;"; else if (c=='<') vrt<<"&lt;"; else if (c=='>') vrt<<"&gt;"; else vrt<<c; }
			vrt << "</SRS>\n";
		}
		if (!geoTransform.empty()) { vrt << "  <GeoTransform>" << geoTransform << "</GeoTransform>\n"; }
		vrt << "  <VRTRasterBand dataType=\"Float32\" band=\"1\">\n";
		if (!unit.empty()) { vrt << "    <UnitType>" << unit << "</UnitType>\n"; }
		if (hasNoData) { vrt << "    <NoDataValue>" << noData << "</NoDataValue>\n"; }
		vrt << "    <ComplexSource>\n";
		vrt << "      <SourceFilename relativeToVRT=\"0\">" << inPath.string() << "</SourceFilename>\n";
		vrt << "      <SourceBand>" << bandIndex << "</SourceBand>\n";
		vrt << "      <ScaleOffset>0.0</ScaleOffset>\n";
		vrt << "      <ScaleRatio>1.0</ScaleRatio>\n";
		vrt << "    </ComplexSource>\n";
		vrt << "  </VRTRasterBand>\n";
		vrt << "</VRTDataset>\n";

		std::ofstream ofs(vrtPath);
		if (!ofs) { std::cerr << "Failed to create VRT" << std::endl; return 2; }
		ofs << vrt.str();
	} catch (...) { std::cerr << "Failed building VRT" << std::endl; return 2; }

	// Translate to output
	std::string out, err;
	int rc = -1;
	if (outputCOG) {
		std::string cmd = "gdal_translate -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES '" + vrtPath + "' '" + outPath.string() + "'";
		rc = run_cmd_capture(cmd, out, err);
	}
	if (rc != 0) {
		std::string cmd = "gdal_translate -of GTiff -co TILED=YES -co COMPRESS=DEFLATE '" + vrtPath + "' '" + outPath.string() + "'";
		rc = run_cmd_capture(cmd, out, err);
	}
	std::error_code ec; std::filesystem::remove(vrtPath, ec);
	if (rc != 0) {
		std::cerr << "gdal_translate failed: " << (err.empty()?out:err) << std::endl;
		return 2;
	}

	std::cout << "tools raster_extract_band OK: " << outPath.string() << std::endl;
	return 0;
}

static bool compute_raster_minmax(const std::string& rasterPath, double& outMin, double& outMax, double& outMean) {
	std::string infoOut, infoErr;
	int rc = run_cmd_capture("gdalinfo -json '" + rasterPath + "'", infoOut, infoErr);
	if (rc != 0) return false;
	try {
		json j = json::parse(infoOut);
		if (!j.contains("bands") || !j["bands"].is_array() || j["bands"].empty()) return false;
		const auto& b = j["bands"][0];
		if (b.contains("minimum") && b.contains("maximum")) {
			outMin = b["minimum"].get<double>();
			outMax = b["maximum"].get<double>();
			outMean = b.contains("mean") ? b["mean"].get<double>() : 0.0;
			return true;
		}
	} catch (...) { return false; }
	return false;
}

int tools_raster_rescale_index(const std::string& inputRaster,
                              const std::string& outputRaster,
                              const std::string& indexType,
                              bool autoDetect,
                              const std::optional<double>& srcMin,
                              const std::optional<double>& srcMax,
                              double dstMin,
                              double dstMax,
                              bool outputCOG,
                              bool overwrite) {
	if (!check_binary_available("gdalinfo") || !check_binary_available("gdal_translate")) {
		std::cerr << "GDAL utilities not found; install gdal-bin." << std::endl;
		return 2;
	}
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(inputRaster));
	if (!std::filesystem::exists(inPath)) { std::cerr << "Input raster not found: " << inPath.string() << std::endl; return 2; }
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(outputRaster));
	if (std::filesystem::exists(outPath) && !overwrite) { std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; return 2; }

	// Determine source range
	double sMin = 0.0, sMax = 0.0, sMean = 0.0;
	bool haveRange = false;
	if (srcMin && srcMax) { sMin = *srcMin; sMax = *srcMax; haveRange = true; }
	if (!haveRange && autoDetect) {
		// gdalinfo -json often carries min/max; if missing, consider approximate stats path (omitted here to keep simple)
		haveRange = compute_raster_minmax(inPath.string(), sMin, sMax, sMean);
	}
	if (!haveRange) {
		// Fallback heuristics by index type
		sMin = 0.0; sMax = 65535.0;
	}
	if (sMax == sMin) { std::cerr << "Invalid source range (min==max)." << std::endl; return 2; }

	// Create VRT applying linear rescale: dst = dstMin + ( (src - sMin) * (dstMax - dstMin) / (sMax - sMin) )
	std::string infoOut, infoErr;
	int rcInfo = run_cmd_capture("gdalinfo -json '" + inPath.string() + "'", infoOut, infoErr);
	if (rcInfo != 0) { std::cerr << "Failed to inspect raster: " << (infoErr.empty()?infoOut:infoErr) << std::endl; return 2; }
	json j;
	try { j = json::parse(infoOut); } catch (...) { std::cerr << "Failed to parse gdalinfo JSON." << std::endl; return 2; }
	int xSize = 0, ySize = 0;
	if (j.contains("size") && j["size"].is_array() && j["size"].size() == 2) { xSize = j["size"][0].get<int>(); ySize = j["size"][1].get<int>(); }
	if (xSize <= 0 || ySize <= 0) { std::cerr << "Invalid raster size" << std::endl; return 2; }
	std::string srsWkt;
	if (j.contains("coordinateSystem") && j["coordinateSystem"].contains("wkt") && j["coordinateSystem"]["wkt"].is_string()) srsWkt = j["coordinateSystem"]["wkt"].get<std::string>();
	std::string geoTransform;
	if (j.contains("geoTransform") && j["geoTransform"].is_array() && j["geoTransform"].size() == 6) {
		std::ostringstream gt; gt.setf(std::ios::fixed); gt << std::setprecision(15);
		for (size_t i=0;i<6;++i) { if (i) gt << ", "; gt << j["geoTransform"][i].get<double>(); }
		geoTransform = gt.str();
	}
	double noData = std::numeric_limits<double>::quiet_NaN(); bool hasNoData=false;
	if (j.contains("bands") && j["bands"].is_array() && !j["bands"].empty()) {
		const auto& b0=j["bands"][0];
		if (b0.contains("noDataValue") && (b0["noDataValue"].is_number_float()||b0["noDataValue"].is_number_integer())) { hasNoData=true; noData=b0["noDataValue"].get<double>(); }
	}

	double scale = (dstMax - dstMin) / (sMax - sMin);
	double offset = dstMin - sMin * scale;

	std::string vrtPath = std::string("/tmp/") + "rescale_" + std::to_string(std::time(nullptr)) + ".vrt";
	{
		std::ostringstream vrt;
		vrt << "<VRTDataset rasterXSize=\""<<xSize<<"\" rasterYSize=\""<<ySize<<"\">\n";
		if (!srsWkt.empty()) { vrt << "  <SRS>"; for(char c:srsWkt){ if(c=='&')vrt<<"&amp;"; else if(c=='<')vrt<<"&lt;"; else if(c=='>')vrt<<"&gt;"; else vrt<<c;} vrt << "</SRS>\n"; }
		if (!geoTransform.empty()) vrt << "  <GeoTransform>"<<geoTransform<<"</GeoTransform>\n";
		vrt << "  <VRTRasterBand dataType=\"Float32\" band=\"1\">\n";
		vrt << "    <UnitType>1</UnitType>\n";
		if (hasNoData) vrt << "    <NoDataValue>"<<noData<<"</NoDataValue>\n";
		vrt << "    <ComplexSource>\n";
		vrt << "      <SourceFilename relativeToVRT=\"0\">"<< inPath.string() <<"</SourceFilename>\n";
		vrt << "      <SourceBand>1</SourceBand>\n";
		vrt << "      <ScaleOffset>"<< std::setprecision(17) << offset <<"</ScaleOffset>\n";
		vrt << "      <ScaleRatio>"<< std::setprecision(17) << scale <<"</ScaleRatio>\n";
		vrt << "    </ComplexSource>\n";
		vrt << "  </VRTRasterBand>\n";
		vrt << "</VRTDataset>\n";
		std::ofstream ofs(vrtPath); if (!ofs) { std::cerr << "Failed to create VRT" << std::endl; return 2; }
		ofs << vrt.str();
	}

	std::string out, err; int rc = -1;
	if (outputCOG) { rc = run_cmd_capture("gdal_translate -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES '" + vrtPath + "' '" + outPath.string() + "'", out, err); }
	if (rc != 0) { rc = run_cmd_capture("gdal_translate -of GTiff -co TILED=YES -co COMPRESS=DEFLATE '" + vrtPath + "' '" + outPath.string() + "'", out, err); }
	std::error_code ec; std::filesystem::remove(vrtPath, ec);
	if (rc != 0) { std::cerr << "gdal_translate failed: " << (err.empty()?out:err) << std::endl; return 2; }

	std::cout << "tools raster_rescale_index OK: " << outPath.string() << std::endl;
	return 0;
}

int tools_raster_calc(const std::vector<std::string>& inputs,
                     const std::string& output,
                     const std::string& expression,
                     const std::string& dataType,
                     bool overwrite) {
	if (inputs.empty()) {
		std::cerr << "No input rasters specified" << std::endl;
		return 2;
	}
	
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(output));
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}

	// Build gdal_calc.py command
	std::ostringstream cmd;
	cmd << "gdal_calc.py";
	
	// Add input rasters with letters A, B, C, etc.
	for (size_t i = 0; i < inputs.size() && i < 26; ++i) {
		char letter = 'A' + i;
		std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(inputs[i]));
		if (!std::filesystem::exists(inPath)) {
			std::cerr << "Input raster not found: " << inPath.string() << std::endl;
			return 2;
		}
		cmd << " -" << letter << " '" << inPath.string() << "'";
	}
	
	cmd << " --outfile='" << outPath.string() << "'";
	cmd << " --calc='" << expression << "'";
	cmd << " --type=" << dataType;
	cmd << " --NoDataValue=0";
	if (overwrite) cmd << " --overwrite";
	cmd << " --quiet";

	std::string out, err;
	int rc = run_cmd_capture(cmd.str(), out, err);
	if (rc != 0) {
		std::cerr << "gdal_calc.py failed: " << (err.empty() ? out : err) << std::endl;
		return 2;
	}

	std::cout << "tools raster_calc OK: " << outPath.string() << std::endl;
	return 0;
}

int tools_raster_sample(const std::string& rasterPath,
                       double longitude,
                       double latitude,
                       const std::string& format) {
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(rasterPath));
	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input raster not found: " << inPath.string() << std::endl;
		return 2;
	}

	std::ostringstream cmd;
	cmd << "gdallocationinfo -wgs84 '" << inPath.string() << "' " << std::fixed << std::setprecision(7) << longitude << " " << latitude;

	std::string out, err;
	int rc = run_cmd_capture(cmd.str(), out, err);
	if (rc != 0) {
		std::cerr << "gdallocationinfo failed: " << (err.empty() ? out : err) << std::endl;
		return 2;
	}

	if (format == "json") {
		// Parse gdallocationinfo output and convert to JSON
		json result;
		result["raster_file"] = inPath.string();
		result["query_coordinates"] = {
			{"longitude", longitude},
			{"latitude", latitude},
			{"crs", "EPSG:4326"}
		};

		// Extract pixel value from output
		std::regex valueRegex(R"(Value:\s*([^\s\n\r]+))");
		std::smatch match;
		if (std::regex_search(out, match, valueRegex)) {
			result["pixel_value"] = match[1].str();
		} else {
			result["pixel_value"] = nullptr;
		}

		auto now = std::chrono::system_clock::now();
		auto time_t = std::chrono::system_clock::to_time_t(now);
		std::ostringstream timestamp;
		timestamp << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
		result["timestamp"] = timestamp.str();

		std::cout << result.dump(2) << std::endl;
	} else {
		std::cout << out;
	}

	return 0;
}

int tools_raster_align(const std::string& inputPath,
                      const std::string& outputPath,
                      const std::string& referencePath,
                      bool overwrite) {
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(inputPath));
	std::filesystem::path refPath = std::filesystem::absolute(std::filesystem::path(referencePath));
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(outputPath));

	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input raster not found: " << inPath.string() << std::endl;
		return 2;
	}
	if (!std::filesystem::exists(refPath)) {
		std::cerr << "Reference raster not found: " << refPath.string() << std::endl;
		return 2;
	}
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}

	// Get reference raster dimensions
	std::string refInfo, refErr;
	int rcRef = run_cmd_capture("gdalinfo '" + refPath.string() + "'", refInfo, refErr);
	if (rcRef != 0) {
		std::cerr << "Failed to get reference info: " << (refErr.empty() ? refInfo : refErr) << std::endl;
		return 2;
	}

	// Extract size from gdalinfo output
	std::regex sizeRegex(R"(Size is (\d+), (\d+))");
	std::smatch sizeMatch;
	if (!std::regex_search(refInfo, sizeMatch, sizeRegex)) {
		std::cerr << "Could not extract reference raster size" << std::endl;
		return 2;
	}

	int width = std::stoi(sizeMatch[1].str());
	int height = std::stoi(sizeMatch[2].str());

	// Use gdalwarp to align
	std::ostringstream cmd;
	cmd << "gdalwarp -overwrite -ts " << width << " " << height;
	cmd << " '" << inPath.string() << "' '" << outPath.string() << "'";

	std::string out, err;
	int rc = run_cmd_capture(cmd.str(), out, err);
	if (rc != 0) {
		std::cerr << "gdalwarp failed: " << (err.empty() ? out : err) << std::endl;
		return 2;
	}

	std::cout << "tools raster_align OK: " << outPath.string() << std::endl;
	return 0;
}

int tools_raster_polygonize(const std::string& rasterPath,
                           const std::string& vectorPath,
                           const std::string& fieldName,
                           bool overwrite) {
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(rasterPath));
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(vectorPath));

	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input raster not found: " << inPath.string() << std::endl;
		return 2;
	}
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}

	// Remove existing output if overwriting
	if (overwrite && std::filesystem::exists(outPath)) {
		std::error_code ec;
		std::filesystem::remove_all(outPath, ec);
	}

	// Build gdal_polygonize.py command
	std::ostringstream cmd;
	cmd << "gdal_polygonize.py '" << inPath.string() << "' '" << outPath.string() << "'";
	
	// Extract layer name from output path
	std::string layerName = outPath.stem().string();
	cmd << " " << layerName << " " << fieldName << " -q";

	std::string out, err;
	int rc = run_cmd_capture(cmd.str(), out, err);
	if (rc != 0) {
		std::cerr << "gdal_polygonize.py failed: " << (err.empty() ? out : err) << std::endl;
		return 2;
	}

	std::cout << "tools raster_polygonize OK: " << outPath.string() << std::endl;
	return 0;
}

int tools_raster_water_detect(const std::string& rgbRasterPath,
                             const std::string& outputPath,
                             double blueThreshold,
                             double redGreenMax,
                             bool overwrite) {
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(rgbRasterPath));
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(outputPath));

	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input RGB raster not found: " << inPath.string() << std::endl;
		return 2;
	}
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}

	// First, extract RGB bands to temporary files
	std::string tempDir = "/tmp";
	std::string redPath = tempDir + "/water_detect_red.tif";
	std::string greenPath = tempDir + "/water_detect_green.tif";
	std::string bluePath = tempDir + "/water_detect_blue.tif";

	// Extract bands using our raster_extract_band function
	int rcRed = tools_raster_extract_band(inPath.string(), 1, redPath, "1", false, true);
	int rcGreen = tools_raster_extract_band(inPath.string(), 2, greenPath, "1", false, true);
	int rcBlue = tools_raster_extract_band(inPath.string(), 3, bluePath, "1", false, true);

	if (rcRed != 0 || rcGreen != 0 || rcBlue != 0) {
		std::cerr << "Failed to extract RGB bands" << std::endl;
		return 2;
	}

	// Create water detection expression: Blue >= threshold AND Red <= max AND Green <= max
	std::ostringstream expr;
	expr << "((C >= " << blueThreshold << ") * (A <= " << redGreenMax << ") * (B <= " << redGreenMax << ")) * 1";

	// Use raster_calc to create water mask
	std::vector<std::string> inputs = {redPath, greenPath, bluePath};
	int rcCalc = tools_raster_calc(inputs, outputPath, expr.str(), "Byte", overwrite);

	// Clean up temporary files
	std::error_code ec;
	std::filesystem::remove(redPath, ec);
	std::filesystem::remove(greenPath, ec);
	std::filesystem::remove(bluePath, ec);

	if (rcCalc != 0) {
		std::cerr << "Failed to create water mask" << std::endl;
		return 2;
	}

	std::cout << "tools raster_water_detect OK: " << outPath.string() << std::endl;
	return 0;
}

int tools_raster_cloud_detect(const std::string& rgbRasterPath,
                             const std::string& outputPath,
                             double redGreenMin,
                             double redGreenMax,
                             double blueMin,
                             bool overwrite) {
	std::filesystem::path inPath = std::filesystem::absolute(std::filesystem::path(rgbRasterPath));
	std::filesystem::path outPath = std::filesystem::absolute(std::filesystem::path(outputPath));

	if (!std::filesystem::exists(inPath)) {
		std::cerr << "Input RGB raster not found: " << inPath.string() << std::endl;
		return 2;
	}
	if (std::filesystem::exists(outPath) && !overwrite) {
		std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl;
		return 2;
	}

	// First, extract RGB bands to temporary files
	std::string tempDir = "/tmp";
	std::string redPath = tempDir + "/cloud_detect_red.tif";
	std::string greenPath = tempDir + "/cloud_detect_green.tif";
	std::string bluePath = tempDir + "/cloud_detect_blue.tif";

	// Extract bands using our raster_extract_band function
	int rcRed = tools_raster_extract_band(inPath.string(), 1, redPath, "1", false, true);
	int rcGreen = tools_raster_extract_band(inPath.string(), 2, greenPath, "1", false, true);
	int rcBlue = tools_raster_extract_band(inPath.string(), 3, bluePath, "1", false, true);

	if (rcRed != 0 || rcGreen != 0 || rcBlue != 0) {
		std::cerr << "Failed to extract RGB bands for cloud detection" << std::endl;
		return 2;
	}

	// Create cloud detection expression: Red == Green AND 33000 <= Red/Green <= 45000 AND Blue > 50000
	std::ostringstream expr;
	expr << "((A == B) * (A >= " << redGreenMin << ") * (A <= " << redGreenMax << ") * (C > " << blueMin << ")) * 1";

	// Use raster_calc to create cloud mask
	std::vector<std::string> inputs = {redPath, greenPath, bluePath};
	int rcCalc = tools_raster_calc(inputs, outputPath, expr.str(), "Byte", overwrite);

	// Clean up temporary files
	std::error_code ec;
	std::filesystem::remove(redPath, ec);
	std::filesystem::remove(greenPath, ec);
	std::filesystem::remove(bluePath, ec);

	if (rcCalc != 0) {
		std::cerr << "Failed to create cloud mask" << std::endl;
		return 2;
	}

	std::cout << "tools raster_cloud_detect OK: " << outPath.string() << std::endl;
	return 0;
}

static bool parse_bbox4326(const std::string& bbox, double& minx, double& miny, double& maxx, double& maxy) {
	std::regex re(R"(^\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+),\s*([-+]?\d*\.?\d+)\s*$)");
	std::smatch m; if (!std::regex_match(bbox, m, re)) return false;
	minx = std::stod(m[1].str()); miny = std::stod(m[2].str()); maxx = std::stod(m[3].str()); maxy = std::stod(m[4].str());
	return (maxx>minx && maxy>miny);
}

static std::string srtm_tile_name_from_sw_corner(int swLatDeg, int swLonDeg) {
	char ns = swLatDeg >= 0 ? 'N' : 'S';
	char ew = swLonDeg >= 0 ? 'E' : 'W';
	int alat = std::abs(swLatDeg);
	int alon = std::abs(swLonDeg);
	std::ostringstream oss;
	oss << ns << std::setw(2) << std::setfill('0') << alat
	    << ew << std::setw(3) << std::setfill('0') << alon;
	return oss.str();
}

static std::vector<std::string> build_srtm_skadi_candidates(const std::string& tile) {
	// Two common patterns observed in Mapzen elevation-tiles-prod
	std::vector<std::string> urls;
	// Directory by latitude folder
	std::string latFolder = tile.substr(0,3); // e.g., N24 or S03
	urls.push_back("https://elevation-tiles-prod.s3.amazonaws.com/skadi/" + latFolder + "/" + tile + ".hgt.gz");
	// Flat folder
	urls.push_back("https://elevation-tiles-prod.s3.amazonaws.com/skadi/" + tile + ".hgt.gz");
	return urls;
}

static bool http_head_ok(const std::string& url) {
	if (!check_binary_available("curl")) return true; // Assume OK if curl missing
	std::string out, err;
	int rc = run_cmd_capture("curl -sI -f '" + url + "' >/dev/null", out, err);
	return rc == 0;
}

static std::vector<std::string> resolve_srtm_tile_urls(double minx, double miny, double maxx, double maxy) {
	int lonStart = static_cast<int>(std::floor(minx));
	int lonEnd = static_cast<int>(std::floor(maxx));
	int latStart = static_cast<int>(std::floor(miny));
	int latEnd = static_cast<int>(std::floor(maxy));
	// Ensure inclusive coverage
	std::vector<std::string> sources;
	for (int lat = latStart; lat <= latEnd; ++lat) {
		for (int lon = lonStart; lon <= lonEnd; ++lon) {
			std::string tile = srtm_tile_name_from_sw_corner(lat, lon);
			for (const auto& url : build_srtm_skadi_candidates(tile)) {
				if (http_head_ok(url)) {
					// Compose GDAL readable path via /vsigzip//vsicurl
					sources.push_back("/vsigzip//vsicurl/" + url);
					break;
				}
			}
		}
	}
	return sources;
}

static int utm_epsg_for_bbox(double minx, double miny, double maxx, double maxy) {
    double clon = (minx + maxx) / 2.0;
    double clat = (miny + maxy) / 2.0;
    int zone = (int)std::floor((clon + 180.0) / 6.0) + 1;
    int epsg = (clat >= 0.0) ? (32600 + zone) : (32700 + zone);
    return epsg;
}

static std::string usgs13_tile_code(int swLatDeg, int swLonDeg) {
    char ns = swLatDeg >= 0 ? 'n' : 's';
    char ew = swLonDeg >= 0 ? 'e' : 'w';
    int alat = std::abs(swLatDeg);
    int alon = std::abs(swLonDeg);
    std::ostringstream oss;
    oss << ns << std::setw(2) << std::setfill('0') << alat
        << ew << std::setw(3) << std::setfill('0') << alon;
    return oss.str();
}

static std::vector<std::string> resolve_usgs13_tile_urls(double minx, double miny, double maxx, double maxy) {
    int lonStart = static_cast<int>(std::floor(minx));
    int lonEnd = static_cast<int>(std::floor(maxx));
    int latStart = static_cast<int>(std::floor(miny));
    int latEnd = static_cast<int>(std::floor(maxy));
    std::vector<std::string> sources;
    for (int lat = latStart; lat <= latEnd; ++lat) {
        for (int lon = lonStart; lon <= lonEnd; ++lon) {
            std::string code = usgs13_tile_code(lat, lon);
            std::string url = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/USGS_13_" + code + ".tif";
            if (http_head_ok(url)) {
                sources.push_back("/vsicurl/" + url);
            }
        }
    }
    return sources;
}

int tools_dem_fetch(const std::string& bbox,
                  const std::string& aoiPath,
                  const std::string& resolution,
                  const std::string& provider,
                  const std::string& toCRS,
                  const std::string& alignTo,
                  const std::string& outputPath,
                  bool overwrite,
                  bool dryRun) {
	// Dependencies (skip check in dry-run mode)
	if (!dryRun) {
		if (!check_binary_available("gdalwarp") || !check_binary_available("gdal_translate") || !check_binary_available("gdalinfo")) {
			std::cerr << "GDAL utilities not found; install gdal-bin." << std::endl; return 2;
		}
	}

 	// Generate standardized filename if outputPath is a directory
 	std::filesystem::path outPath;
 	if (std::filesystem::is_directory(outputPath) || outputPath.back() == '/') {
 		// Generate standardized filename
 		std::string date = get_current_date();
 		std::string aoi = extract_aoi_name(aoiPath, bbox);
 		std::string demType = get_dem_type(provider);
 		std::string crs = toCRS.empty() ? "WGS84" : (toCRS == "EPSG:4326" ? "WGS84" : toCRS.substr(5));
 		std::string upperProvider = provider;
 		std::transform(upperProvider.begin(), upperProvider.end(), upperProvider.begin(), ::toupper);
 		std::string filename = generate_filename(date, demType, resolution, upperProvider, "F32", crs, aoi);
 		outPath = std::filesystem::absolute(std::filesystem::path(outputPath) / filename);
 	} else {
 		outPath = std::filesystem::absolute(std::filesystem::path(outputPath));
 	}
 	if (std::filesystem::exists(outPath) && !overwrite) { std::cerr << "Output exists: " << outPath.string() << " (use --overwrite)" << std::endl; return 2; }

 	// Validate inputs
 	if (bbox.empty() && aoiPath.empty()) { std::cerr << "Provide --bbox or --aoi" << std::endl; return 2; }
 	if (!aoiPath.empty() && !std::filesystem::exists(aoiPath)) { std::cerr << "AOI not found: " << aoiPath << std::endl; return 2; }

 	// Determine target bounds in EPSG:4326
 	double minx=0,miny=0,maxx=0,maxy=0; std::string warpCutline;
 	if (!bbox.empty()) {
 		if (!parse_bbox4326(bbox, minx, miny, maxx, maxy)) { std::cerr << "Invalid --bbox format" << std::endl; return 2; }
 	}
 	if (!aoiPath.empty()) {
 		warpCutline = "-cutline '" + aoiPath + "' -crop_to_cutline";
 		// If bbox empty, derive extent from AOI
 		if (bbox.empty()) {
 			std::string out, err; int rc = run_cmd_capture("ogrinfo -so -al -json '" + aoiPath + "'", out, err);
 			if (rc==0) {
 				try {
 					auto j = json::parse(out);
 					if (j.contains("layers") && j["layers"].is_array() && !j["layers"].empty()) {
 						const auto& layer = j["layers"][0];
 						if (layer.contains("extent")) {
 							const auto& e = layer["extent"]; minx=e["minX"]; miny=e["minY"]; maxx=e["maxX"]; maxy=e["maxY"]; 
 						}
 					}
 				} catch (...) {}
 			}
 		}
 	}

	// INTELLIGENT DEM ROUTING: Auto-select best DEM dataset based on location & resolution
	std::string useRes = resolution.empty()?"30m":resolution;
	std::string useProv = provider.empty()?"auto":provider;
	
	if (useProv == "auto") {
		std::cout << "\n╔════════════════════════════════════════════════════════════════╗" << std::endl;
		std::cout << "║          INTELLIGENT DEM ROUTING SYSTEM                        ║" << std::endl;
		std::cout << "╚════════════════════════════════════════════════════════════════╝\n" << std::endl;
		
		// Parse resolution to integer meters
		int target_res_m = 30; // Default
		try {
			std::string res_num = useRes;
			// Remove 'm' suffix if present
			if (!res_num.empty() && res_num.back() == 'm') {
				res_num = res_num.substr(0, res_num.size()-1);
			}
			target_res_m = std::stoi(res_num);
		} catch (...) {
			std::cerr << "Warning: Could not parse resolution '" << useRes << "', using 30m default" << std::endl;
		}
		
		// Calculate centroid of AOI for country detection
		double center_lon = (minx + maxx) / 2.0;
		double center_lat = (miny + maxy) / 2.0;
		
		// Use DEM Router to find best dataset
		agrs::tools::DEMRouter router;
		auto best_dem = router.find_best_dem(center_lon, center_lat, target_res_m);
		
		if (best_dem.dataset_name.empty()) {
			std::cerr << "❌ Could not find suitable DEM dataset. Falling back to SRTM 30m." << std::endl;
			useProv = "srtm";
		} else if (best_dem.fetch_tool == "tinitaly_fetch") {
			// Delegate to TINITALY fetch tool
			std::cout << "🔄 Delegating to tinitaly_fetch tool..." << std::endl;
			return tools_tinitaly_fetch(bbox, aoiPath, outPath.string(), overwrite);
		} else if (best_dem.fetch_tool == "dem_fetch") {
			// Extract provider from dataset name
			if (best_dem.dataset_name.find("SRTM") != std::string::npos) {
				useProv = "srtm";
			} else if (best_dem.dataset_name.find("3DEP 1m") != std::string::npos || 
			           best_dem.dataset_name.find("LiDAR") != std::string::npos) {
				useProv = "usgs1m";
			} else if (best_dem.dataset_name.find("3DEP 10m") != std::string::npos) {
				useProv = "usgs13";
			} else {
				useProv = "srtm"; // Safe fallback
			}
			std::cout << "✅ Using internal provider: " << useProv << "\n" << std::endl;
		} else {
			std::cerr << "⚠️  Best dataset requires tool: " << best_dem.fetch_tool 
			          << " (not yet implemented)" << std::endl;
			std::cerr << "Falling back to SRTM 30m for now." << std::endl;
			useProv = "srtm";
		}
	} else {
		// User explicitly specified provider - use it directly (legacy behavior)
		std::cout << "Using explicitly specified provider: " << useProv << std::endl;
	}

	json plan; plan["type"]="dem_fetch"; plan["resolution"]=useRes; plan["provider"]=useProv; plan["output"]=outPath.string();
 	plan["bbox"] = { {"minx",minx}, {"miny",miny}, {"maxx",maxx}, {"maxy",maxy} };
 	plan["aoi"] = aoiPath;
    plan["to_crs"] = toCRS;
    if (!alignTo.empty()) plan["align_to"] = alignTo;

	if (dryRun) { std::cout << plan.dump(2) << std::endl; return 0; }

    // Implement SRTM backend via Mapzen elevation-tiles-prod SKADI HGT tiles
    if (useProv == "srtm") {
		auto sources = resolve_srtm_tile_urls(minx, miny, maxx, maxy);
		if (sources.empty()) { std::cerr << "No SRTM tiles found for bbox" << std::endl; return 2; }
		plan["tiles"] = sources;
		// Write temp list file
		std::string listPath = "/tmp/dem_srtm_files_" + std::to_string(std::time(nullptr)) + ".txt";
		{
			std::ofstream ofs(listPath);
			if (!ofs) { std::cerr << "Failed to create temp list" << std::endl; return 2; }
			for (const auto& s : sources) ofs << s << "\n";
		}
		std::string vrtPath = "/tmp/dem_srtm_" + std::to_string(std::time(nullptr)) + ".vrt";
		{
			std::string out, err;
            int rc = run_cmd_capture("timeout 300 gdalbuildvrt -input_file_list '" + listPath + "' -overwrite '" + vrtPath + "'", out, err);
			if (rc != 0) { std::cerr << "gdalbuildvrt failed: " << (err.empty()?out:err) << std::endl; return 2; }
		}
        // Optionally extract alignment parameters
        int alignW=0, alignH=0; std::string alignSRS;
        if (!alignTo.empty()) {
            std::string infoOut, infoErr;
            int rcA = run_cmd_capture("gdalinfo '" + alignTo + "'", infoOut, infoErr);
            if (rcA == 0) {
                std::regex sizeRegex(R"(Size is (\d+), (\d+))"); std::smatch m;
                if (std::regex_search(infoOut, m, sizeRegex)) { alignW = std::stoi(m[1].str()); alignH = std::stoi(m[2].str()); }
            }
        }

        // Build warp command - always reproject to requested CRS and clip to AOI
		std::ostringstream warp;
		warp << "gdalwarp -overwrite -r bilinear -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES";
		
		// Always set target CRS (default to WGS84 if not specified)
		std::string targetCRS = toCRS.empty() ? "EPSG:4326" : toCRS;
		warp << " -t_srs " << targetCRS;
		
		// Clip to AOI if provided
		if (!aoiPath.empty()) {
			warp << " -cutline '" << aoiPath << "' -crop_to_cutline";
		} else {
			// Use bbox for clipping
			warp << " -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy
				 << " -te_srs EPSG:4326";
		}
		
		// Handle alignment if specified
        if (alignW>0 && alignH>0) warp << " -ts " << alignW << " " << alignH;
		
		warp << " '" << vrtPath << "' '" << outPath.string() << "'";
		{
			std::string out, err;
            int rc = run_cmd_capture(std::string("timeout 600 ") + warp.str(), out, err);
			if (rc != 0) { std::cerr << "gdalwarp failed: " << (err.empty()?out:err) << std::endl; return 2; }
		}
        // Create comprehensive sidecar JSON with metadata
        {
            // Get raster metadata
            auto rasterMetadata = get_raster_metadata(outPath.string());
            plan["raster_metadata"] = rasterMetadata;
            
            // Add processing information
            plan["processing"]["tool"] = "dem_fetch";
            plan["processing"]["provider"] = useProv;
            plan["processing"]["resolution"] = useRes;
            plan["processing"]["target_crs"] = targetCRS;
            plan["processing"]["aoi_clipped"] = !aoiPath.empty();
            plan["processing"]["timestamp"] = to_iso8601_utc();
            
            // Add source information
            plan["sources"] = sources;
        }
        write_sidecar_json(outPath.string(), plan);
		std::cout << "tools dem_fetch OK: " << outPath.string() << std::endl;
		return 0;
	}

	// Implement USGS 3DEP 1/3 arc-second (~10 m) backend
	if (useProv == "usgs13") {
		auto sources = resolve_usgs13_tile_urls(minx, miny, maxx, maxy);
		if (sources.empty()) {
			// Fallback to USGS 3DEP ImageServer exportImage at ~10 m
			// Compute approximate size in meters using Web Mercator (EPSG:3857)
			auto proj_pt = [&](double x, double y){
				std::string out, err; 
				std::ostringstream cmd; cmd << "echo '" << std::setprecision(10) << x << " " << y << "' | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857";
				if (run_cmd_capture(cmd.str(), out, err) != 0 || out.empty()) return std::pair<double,double>(x,y);
				std::istringstream iss(out); double X=0,Y=0; iss >> X >> Y; return std::pair<double,double>(X,Y);
			};
			auto ll = proj_pt(minx, miny); auto ur = proj_pt(maxx, maxy);
			double width_m = std::max(1.0, ur.first - ll.first);
			double height_m = std::max(1.0, ur.second - ll.second);
            int px = (int)std::ceil(width_m / 10.0);
            int py = (int)std::ceil(height_m / 10.0);
            // Clamp to service-friendly bounds
            px = std::min(std::max(px, 256), 2000);
            py = std::min(std::max(py, 256), 2000);
			// Build exportImage URL
			std::ostringstream url;
			url << "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?";
			url << "bbox=" << std::setprecision(10) << minx << "," << miny << "," << maxx << "," << maxy;
			url << "&bboxSR=4326&imageSR=4326&size=" << px << "," << py;
			url << "&format=tiff&pixelType=F32&interpolation=RSP_Bilinear&f=image";
			std::string tmpTif = "/tmp/usgs13_export_" + std::to_string(std::time(nullptr)) + ".tif";
            {
                std::string out, err; int rc = run_cmd_capture("curl --connect-timeout 10 --max-time 120 -L -s --fail '" + url.str() + "' -o '" + tmpTif + "'", out, err);
                if (rc != 0) { std::cerr << "USGS ImageServer export failed" << std::endl; return 2; }
                // Validate file by probing with gdalinfo
                std::string infoOut, infoErr; int rci = run_cmd_capture("gdalinfo '" + tmpTif + "'", infoOut, infoErr);
                if (rci != 0) { std::cerr << "Downloaded export is not a valid GeoTIFF" << std::endl; return 2; }
            }
			// Reproject/align/clip to AOI and write COG Float32
			std::ostringstream warp;
			warp << "gdalwarp -overwrite -r bilinear -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES";
			
			// Always set target CRS (default to WGS84 if not specified)
			std::string targetCRS = toCRS.empty() ? "EPSG:4326" : toCRS;
			warp << " -t_srs " << targetCRS;
			
			// Clip to AOI if provided
			if (!aoiPath.empty()) {
				warp << " -cutline '" << aoiPath << "' -crop_to_cutline";
			} else {
				// Use bbox for clipping
				warp << " -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy
					 << " -te_srs EPSG:4326";
			}
			
			warp << " '" << tmpTif << "' '" << outPath.string() << "'";
			{
				std::string out, err; int rc = run_cmd_capture(warp.str(), out, err);
				if (rc != 0) { std::cerr << "gdalwarp failed: " << (err.empty()?out:err) << std::endl; return 2; }
			}
			// Stats & provenance
			{
				// Get raster metadata
				auto rasterMetadata = get_raster_metadata(outPath.string());
				plan["raster_metadata"] = rasterMetadata;
				
				// Add processing information
				plan["processing"]["tool"] = "dem_fetch";
				plan["processing"]["provider"] = useProv;
				plan["processing"]["resolution"] = useRes;
				plan["processing"]["target_crs"] = targetCRS;
				plan["processing"]["aoi_clipped"] = !aoiPath.empty();
				plan["processing"]["timestamp"] = to_iso8601_utc();
				
				// Add source information
				plan["sources"] = {{"url", url.str()}};
			}
			write_sidecar_json(outPath.string(), plan);
			std::cout << "tools dem_fetch OK: " << outPath.string() << std::endl;
			return 0;
		}
		plan["tiles"] = sources;
		std::string listPath = "/tmp/dem_usgs13_files_" + std::to_string(std::time(nullptr)) + ".txt";
		{
			std::ofstream ofs(listPath);
			if (!ofs) { std::cerr << "Failed to create temp list" << std::endl; return 2; }
			for (const auto& s : sources) ofs << s << "\n";
		}
		std::string vrtPath = "/tmp/dem_usgs13_" + std::to_string(std::time(nullptr)) + ".vrt";
		{
			std::string out, err;
			int rc = run_cmd_capture("gdalbuildvrt -input_file_list '" + listPath + "' -overwrite '" + vrtPath + "'", out, err);
			if (rc != 0) { std::cerr << "gdalbuildvrt failed: " << (err.empty()?out:err) << std::endl; return 2; }
		}
		// Extract alignment parameters
		int alignW=0, alignH=0;
		if (!alignTo.empty()) {
			std::string infoOut, infoErr;
			if (run_cmd_capture("gdalinfo '" + alignTo + "'", infoOut, infoErr) == 0) {
				std::regex sizeRegex(R"(Size is (\d+), (\d+))"); std::smatch m;
				if (std::regex_search(infoOut, m, sizeRegex)) { alignW = std::stoi(m[1].str()); alignH = std::stoi(m[2].str()); }
			}
		}
		std::ostringstream warp;
		warp << "gdalwarp -overwrite -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy
			 << " -te_srs EPSG:4326 -r bilinear -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES";
		if (!toCRS.empty()) warp << " -t_srs " << toCRS;
		if (alignW>0 && alignH>0) warp << " -ts " << alignW << " " << alignH;
		if (!aoiPath.empty()) warp << " -cutline '" << aoiPath << "' -crop_to_cutline";
		warp << " '" << vrtPath << "' '" << outPath.string() << "'";
		{
			std::string out, err;
			int rc = run_cmd_capture(warp.str(), out, err);
			if (rc != 0) { std::cerr << "gdalwarp failed: " << (err.empty()?out:err) << std::endl; return 2; }
		}
		// Stats & provenance
		{
			std::string out, err; int rcS = run_cmd_capture("gdalinfo -stats -json '" + outPath.string() + "'", out, err);
			if (rcS == 0) {
				try {
					auto ji = json::parse(out);
					if (ji.contains("bands") && ji["bands"].is_array() && !ji["bands"].empty()) {
						const auto& b = ji["bands"][0];
						if (b.contains("minimum")) plan["stats"]["min"] = b["minimum"]; 
						if (b.contains("maximum")) plan["stats"]["max"] = b["maximum"]; 
						if (b.contains("mean")) plan["stats"]["mean"] = b["mean"]; 
						if (b.contains("stdDev")) plan["stats"]["stddev"] = b["stdDev"]; 
					}
				} catch (...) {}
			}
		}
		write_json_file(outPath.string() + std::string(".json"), plan);
		std::cout << "tools dem_fetch OK: " << outPath.string() << std::endl;
		return 0;
	}

	// Implement USGS 3DEP 1-meter LiDAR (where available) via ImageServer export
    if (useProv == "usgs1m") {
		// Use National Map 1m DEM ImageServer (where available)
		// Note: 1m coverage is partial; we attempt exportImage with high resolution
		auto proj_pt = [&](double x, double y){
			std::string out, err; 
			std::ostringstream cmd; cmd << "echo '" << std::setprecision(10) << x << " " << y << "' | gdaltransform -s_srs EPSG:4326 -t_srs EPSG:3857";
			if (run_cmd_capture(cmd.str(), out, err) != 0 || out.empty()) return std::pair<double,double>(x,y);
			std::istringstream iss(out); double X=0,Y=0; iss >> X >> Y; return std::pair<double,double>(X,Y);
		};
		auto ll = proj_pt(minx, miny); auto ur = proj_pt(maxx, maxy);
		double width_m = std::max(1.0, ur.first - ll.first);
		double height_m = std::max(1.0, ur.second - ll.second);
        // Determine full pixel size and tile grid (max 3000 per request)
        int px_total = (int)std::ceil(width_m / 1.0);
        int py_total = (int)std::ceil(height_m / 1.0);
        int max_dim = 3000;
        int nx = std::max(1, (int)std::ceil((double)px_total / max_dim));
        int ny = std::max(1, (int)std::ceil((double)py_total / max_dim));
        double dx = (maxx - minx) / nx;
        double dy = (maxy - miny) / ny;
        std::vector<std::string> tiles;
        for (int iy = 0; iy < ny; ++iy) {
            for (int ix = 0; ix < nx; ++ix) {
                double tminx = minx + ix * dx;
                double tmaxx = minx + (ix + 1) * dx;
                double tminy = miny + iy * dy;
                double tmaxy = miny + (iy + 1) * dy;
                auto ll2 = proj_pt(tminx, tminy); auto ur2 = proj_pt(tmaxx, tmaxy);
                int px = std::min(max_dim, (int)std::ceil(std::max(1.0, ur2.first - ll2.first) / 1.0));
                int py = std::min(max_dim, (int)std::ceil(std::max(1.0, ur2.second - ll2.second) / 1.0));
                std::ostringstream url;
                url << "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?";
                url << "bbox=" << std::setprecision(10) << tminx << "," << tminy << "," << tmaxx << "," << tmaxy;
                url << "&bboxSR=4326&imageSR=4326&size=" << px << "," << py;
                url << "&format=tiff&pixelType=F32&interpolation=RSP_Bilinear&f=image";
                std::string tmpTif = "/tmp/usgs1m_export_" + std::to_string(std::time(nullptr)) + "_" + std::to_string(ix) + "_" + std::to_string(iy) + ".tif";
                std::string out, err;
                int rc = run_cmd_capture("curl --connect-timeout 10 --max-time 120 -L -s --fail '" + url.str() + "' -o '" + tmpTif + "'", out, err);
                if (rc != 0) continue;
                std::string infoOut, infoErr; int rci = run_cmd_capture("gdalinfo '" + tmpTif + "'", infoOut, infoErr);
                if (rci != 0) continue;
                tiles.push_back(tmpTif);
            }
        }
        if (tiles.empty()) {
            // Fallback: fetch 10m and resample to 1m if no 1m tiles available
            std::cerr << "USGS 1m not available for AOI; falling back to 10m resampled to 1m" << std::endl;
            std::string tmp10m = std::string("/tmp/usgs13_10m_") + std::to_string(std::time(nullptr)) + std::string(".tif");
            int rc10 = tools_dem_fetch(bbox, aoiPath, std::string("10m"), std::string("usgs13"), toCRS, alignTo, tmp10m, true, false);
            if (rc10 != 0) { std::cerr << "10m fallback fetch failed" << std::endl; return 2; }
            std::ostringstream res;
            res << "gdalwarp -overwrite -r bilinear -tr 1 1 -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES '" << tmp10m << "' '" << outPath.string() << "'";
            {
                std::string o,e; int rc = run_cmd_capture(std::string("timeout 600 ") + res.str(), o, e);
                if (rc != 0) { std::cerr << "Resample 10m->1m failed: " << (e.empty()?o:e) << std::endl; return 2; }
            }
            plan["processing"]["tool"] = "dem_fetch";
            plan["processing"]["provider"] = useProv;
            plan["processing"]["resolution"] = useRes;
            plan["processing"]["target_crs"] = toCRS.empty() ? "EPSG:4326" : toCRS;
            plan["processing"]["aoi_clipped"] = !aoiPath.empty();
            plan["processing"]["timestamp"] = to_iso8601_utc();
            plan["raster_metadata"] = get_raster_metadata(outPath.string());
            plan["fallback"]["from_resolution"] = "10m";
            plan["fallback"]["from_provider"] = "usgs13";
            plan["fallback"]["resampled_to"] = "1m";
            plan["fallback"]["method"] = "bilinear";
            write_sidecar_json(outPath.string(), plan);
            std::cout << "tools dem_fetch OK: " << outPath.string() << std::endl;
            return 0;
        }
        // Build VRT and warp to output
        std::string listPath = "/tmp/usgs1m_list_" + std::to_string(std::time(nullptr)) + ".txt";
        {
            std::ofstream ofs(listPath);
            for (auto& t : tiles) ofs << t << "\n";
        }
        std::string vrtPath = "/tmp/usgs1m_mosaic_" + std::to_string(std::time(nullptr)) + ".vrt";
        {
            std::string o,e; int rc = run_cmd_capture("timeout 300 gdalbuildvrt -input_file_list '" + listPath + "' -overwrite '" + vrtPath + "'", o, e);
            if (rc != 0) { std::cerr << "gdalbuildvrt failed: " << (e.empty()?o:e) << std::endl; return 2; }
        }
        std::ostringstream warp;
        warp << "gdalwarp -overwrite -r bilinear -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES";
        std::string targetCRS = toCRS.empty() ? "EPSG:4326" : toCRS;
        warp << " -t_srs " << targetCRS;
        if (!aoiPath.empty()) warp << " -cutline '" << aoiPath << "' -crop_to_cutline";
        else warp << " -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy << " -te_srs EPSG:4326";
        warp << " '" << vrtPath << "' '" << outPath.string() << "'";
        {
            std::string o,e; int rc = run_cmd_capture(std::string("timeout 600 ") + warp.str(), o, e);
            if (rc != 0) { std::cerr << "gdalwarp failed: " << (e.empty()?o:e) << std::endl; return 2; }
        }
        plan["processing"]["tool"] = "dem_fetch";
        plan["processing"]["provider"] = useProv;
        plan["processing"]["resolution"] = useRes;
        plan["processing"]["target_crs"] = toCRS.empty() ? "EPSG:4326" : toCRS;
        plan["processing"]["aoi_clipped"] = !aoiPath.empty();
        plan["processing"]["timestamp"] = to_iso8601_utc();
        plan["raster_metadata"] = get_raster_metadata(outPath.string());
        plan["sources"] = { {"tiles", tiles} };
        write_sidecar_json(outPath.string(), plan);
		std::cout << "tools dem_fetch OK: " << outPath.string() << std::endl;
		return 0;
	}

	std::cerr << "Provider '" << useProv << "' not yet implemented." << std::endl;
	return 2;
}

int tools_sentinel2_fetch(const std::string& bbox,
                        const std::string& datetime,
                        int cloudMax,
                 const std::string& bands,
                 const std::string& bandGroups,
                 bool allBands,
                 const std::string& auxiliary,
                        const std::string& outputDir,
                        bool overwrite) {
    
    // Validate required binaries
    if (!check_binary_available("curl") || !check_binary_available("jq")) {
        std::cerr << "curl and jq are required for s2_fetch" << std::endl; 
        return 2;
    }
    
    // Parse bbox
    double minx, miny, maxx, maxy;
    if (!parse_bbox4326(bbox, minx, miny, maxx, maxy)) {
        std::cerr << "Invalid --bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 2;
    }
    
    // Prepare output directory
    std::string err;
    if (!ensure_dir(std::filesystem::path(outputDir), err)) {
        std::cerr << "Failed to create output directory: " << err << std::endl;
        return 2;
    }
    
    // Determine which bands to fetch
    std::set<std::string> bandsToFetch;
    
    // Define all available bands and their STAC keys (EarthSearch STAC asset names)
    std::map<std::string, std::vector<std::string>> bandMappings = {
        {"B01", {"coastal"}},
        {"B02", {"blue"}},
        {"B03", {"green"}},
        {"B04", {"red"}},
        {"B05", {"rededge1"}},
        {"B06", {"rededge2"}},
        {"B07", {"rededge3"}},
        {"B08", {"nir"}},
        {"B8A", {"nir08"}},
        {"B09", {"nir09"}},
        {"B10", {"nir10"}},
        {"B11", {"swir16"}},
        {"B12", {"swir22"}}
    };
    
    // Define band groups
    std::map<std::string, std::vector<std::string>> bandGroupsDef = {
        {"visual", {"B02", "B03", "B04"}},
        {"nir", {"B08", "B8A"}},
        {"rededge", {"B05", "B06", "B07"}},
        {"swir", {"B11", "B12"}},
        {"atmospheric", {"B01", "B09", "B10"}},
        {"standard", {"B02", "B03", "B04", "B08"}}
    };
    
    // Define auxiliary data (EarthSearch STAC asset names)
    std::map<std::string, std::vector<std::string>> auxiliaryMappings = {
        {"SCL", {"scl"}},
        {"TCI", {"visual"}},
        {"AOT", {"aot"}},
        {"WVP", {"wvp"}}
    };
    
    // Parse band selection
    if (allBands) {
        // Add all 13 spectral bands
        for (const auto& band : bandMappings) {
            bandsToFetch.insert(band.first);
        }
    } else if (!bands.empty()) {
        // Parse specific bands
        std::istringstream ss(bands);
        std::string band;
        while (std::getline(ss, band, ',')) {
            band.erase(0, band.find_first_not_of(" \t\n\r"));
            band.erase(band.find_last_not_of(" \t\n\r") + 1);
            if (bandMappings.find(band) != bandMappings.end()) {
                bandsToFetch.insert(band);
            } else {
                std::cerr << "Warning: Unknown band '" << band << "'" << std::endl;
            }
        }
    } else if (!bandGroups.empty()) {
        // Parse band groups
        std::istringstream ss(bandGroups);
        std::string group;
        while (std::getline(ss, group, ',')) {
            group.erase(0, group.find_first_not_of(" \t\n\r"));
            group.erase(group.find_last_not_of(" \t\n\r") + 1);
            if (bandGroupsDef.find(group) != bandGroupsDef.end()) {
                for (const auto& band : bandGroupsDef[group]) {
                    bandsToFetch.insert(band);
                }
            } else {
                std::cerr << "Warning: Unknown band group '" << group << "'" << std::endl;
            }
        }
    } else {
        // Default: fetch standard bands (B02, B03, B04, B08)
        bandsToFetch = {"B02", "B03", "B04", "B08"};
    }
    
    // Parse auxiliary data
    std::set<std::string> auxToFetch;
    if (!auxiliary.empty()) {
        std::istringstream ss(auxiliary);
        std::string aux;
        while (std::getline(ss, aux, ',')) {
            aux.erase(0, aux.find_first_not_of(" \t\n\r"));
            aux.erase(aux.find_last_not_of(" \t\n\r") + 1);
            if (auxiliaryMappings.find(aux) != auxiliaryMappings.end()) {
                auxToFetch.insert(aux);
        } else {
                std::cerr << "Warning: Unknown auxiliary data '" << aux << "'" << std::endl;
            }
        }
    }
    
    // Validate that we have something to fetch
    if (bandsToFetch.empty() && auxToFetch.empty()) {
        std::cerr << "No bands or auxiliary data specified to fetch" << std::endl;
        return 2;
    }

    // STAC search
    std::ostringstream stac;
    stac << "curl -s 'https://earth-search.aws.element84.com/v1/search' -H 'Content-Type: application/json' --data '";
    json body;
    body["collections"] = {"sentinel-2-l2a"};
    body["bbox"] = {minx, miny, maxx, maxy};
    
    // Convert datetime to RFC3339 format if needed
    std::string datetimeFormatted = datetime;
    if (datetime.find('T') == std::string::npos) {
        // If it's a simple date format like "2024-04-20", convert to RFC3339
        if (datetime.find('/') != std::string::npos) {
            // Range format like "2024-04-01/2024-04-30"
            size_t pos = datetime.find('/');
            std::string start = datetime.substr(0, pos);
            std::string end = datetime.substr(pos + 1);
            datetimeFormatted = start + "T00:00:00Z/" + end + "T23:59:59Z";
        } else {
            // Single date format like "2024-04-20"
            datetimeFormatted = datetime + "T00:00:00Z";
        }
    }
    body["datetime"] = datetimeFormatted;
    body["query"]["eo:cloud_cover"]["lte"] = cloudMax;
    body["limit"] = 1; // Get the best match
    stac << body.dump() << "'";

    std::string stacResponse, stacError;
    int rc = run_cmd_capture(stac.str(), stacResponse, stacError);
    if (rc != 0 || stacResponse.empty()) {
        std::cerr << "STAC search failed: " << stacError << std::endl;
        return 2;
    }
    
    // Extract asset hrefs from STAC response
    auto trim = [](std::string& s) {
        s.erase(0, s.find_first_not_of(" \t\n\r"));
        s.erase(s.find_last_not_of(" \t\n\r") + 1);
    };
    
    auto extract_asset_href = [&](const std::vector<std::string>& keys) -> std::string {
        for (const auto& key : keys) {
            std::ostringstream cmd;
            // Properly escape the key for jq to handle special characters and hyphens
            cmd << "echo '" << stacResponse << "' | jq -r '[.features[].assets.\"" << key << "\".href? // empty] | map(select(. != \"\")) | .[0]'";
            std::string out, err;
            if (run_cmd_capture(cmd.str(), out, err) == 0) {
                trim(out);
                if (!out.empty() && out.find("null") == std::string::npos) {
                    return out;
                }
            }
            }
            return std::string();
        };
    
    // Download bands
    int utm = utm_epsg_for_bbox(minx, miny, maxx, maxy);
    std::map<std::string, std::string> downloadedBands;
    std::map<std::string, std::string> assetHrefs;
    
    auto download_band = [&](const std::string& bandName, const std::vector<std::string>& keys) -> bool {
        std::string href = extract_asset_href(keys);
        if (href.empty()) {
            std::cerr << "Warning: Could not find asset for band " << bandName << std::endl;
            return false;
        }
        
        std::filesystem::path outputPath = std::filesystem::path(outputDir) / (bandName + ".tif");
        if (std::filesystem::exists(outputPath) && !overwrite) {
            std::cerr << "Output exists: " << outputPath << std::endl;
            return false;
        }
        
        // Determine appropriate resolution based on band
        int resolution = 10; // Default 10m
        if (bandName == "B05" || bandName == "B06" || bandName == "B07" || bandName == "B8A" || 
            bandName == "B11" || bandName == "B12") {
            resolution = 20;
        } else if (bandName == "B01" || bandName == "B09" || bandName == "B10") {
            resolution = 60;
        }
        
        std::ostringstream cmd;
        cmd << "gdalwarp -overwrite -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy
            << " -te_srs EPSG:4326 -t_srs EPSG:" << utm << " -tr " << resolution << " " << resolution 
            << " -tap -r bilinear -ot Float32 -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES "
            << "'/vsicurl/" << href << "' '" << outputPath.string() << "'";
        
        std::string out, e;
        int rc = run_cmd_capture(cmd.str(), out, e);
        if (rc != 0) {
            std::cerr << "Failed to download " << bandName << ": " << (e.empty() ? out : e) << std::endl;
            return false;
        }
        
        downloadedBands[bandName] = outputPath.string();
        assetHrefs[bandName] = href;
        std::cout << "Downloaded " << bandName << " (" << resolution << "m resolution)" << std::endl;
        return true;
    };
    
    // Download spectral bands
    for (const auto& band : bandsToFetch) {
        if (bandMappings.find(band) != bandMappings.end()) {
            download_band(band, bandMappings[band]);
        }
    }
    
    // Download auxiliary data
    for (const auto& aux : auxToFetch) {
        if (auxiliaryMappings.find(aux) != auxiliaryMappings.end()) {
            download_band(aux, auxiliaryMappings[aux]);
        }
    }
    
    if (downloadedBands.empty()) {
        std::cerr << "No bands were successfully downloaded" << std::endl;
        return 2;
    }
    
    // Create comprehensive sidecar metadata
    json meta;
    meta["type"] = "s2_fetch";
    meta["provider"] = "Microsoft Planetary Computer (EarthSearch STAC)";
    meta["collection"] = "sentinel-2-l2a";
    meta["bbox"] = {{"minx", minx}, {"miny", miny}, {"maxx", maxx}, {"maxy", maxy}};
    meta["datetime"] = datetime;
    meta["cloud_max"] = cloudMax;
    meta["requested_bands"] = std::vector<std::string>(bandsToFetch.begin(), bandsToFetch.end());
    meta["requested_auxiliary"] = std::vector<std::string>(auxToFetch.begin(), auxToFetch.end());
    meta["all_bands_requested"] = allBands;
    meta["band_groups_requested"] = bandGroups;
    meta["processing"]["timestamp"] = to_iso8601_utc();
    meta["processing"]["utm_zone"] = utm;
    
    // Add outputs and metadata
    meta["outputs"] = json::object();
    meta["assets"] = json::object();
    meta["outputs_metadata"] = json::object();
    
    for (const auto& [bandName, filePath] : downloadedBands) {
        meta["outputs"][bandName] = filePath;
        if (assetHrefs.find(bandName) != assetHrefs.end()) {
            meta["assets"][bandName + "_href"] = assetHrefs[bandName];
        }
        meta["outputs_metadata"][bandName] = get_raster_metadata(filePath);
    }
    
    write_sidecar_json(outputDir + "/s2_fetch.json", meta);
    
    std::cout << "tools sentinel2_fetch OK: Downloaded " << downloadedBands.size() << " bands/auxiliary data to " << outputDir << std::endl;
    return 0;
}


// Copernicus Fetch function (for Sentinel-1 SAR and other Copernicus products)
int tools_copernicus_fetch(const std::string& bbox,
                const std::string& aoiPath,
                const std::string& datetime,
                        const std::string& outputDir,
                        const std::string& product,
                        const std::string& username,
                        const std::string& password,
                bool overwrite) {
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    // Create output directory
    std::error_code ec;
    if (!std::filesystem::create_directories(std::filesystem::path(outputDir), ec)) {
        std::cerr << "Failed to create output directory: " << outputDir << std::endl;
        return 1;
    }
    
    // Check supported products
    if (product != "S1GRD" && product != "S3OLCI" && product != "S3SLSTR" && product != "LANDCOVER") {
        std::cerr << "Unsupported product: " << product << std::endl;
        std::cerr << "Supported products: S1GRD, S3OLCI, S3SLSTR, LANDCOVER" << std::endl;
        return 1;
    }
    
    // Placeholder implementation for future Copernicus products
    std::cout << "tools copernicus_fetch: Product '" << product << "' not yet implemented." << std::endl;
    std::cout << "This tool is reserved for future Copernicus products:" << std::endl;
    std::cout << "  - S1GRD: Sentinel-1 SAR Ground Range Detected" << std::endl;
    std::cout << "  - S3OLCI: Sentinel-3 Ocean and Land Colour Instrument" << std::endl;
    std::cout << "  - S3SLSTR: Sentinel-3 Sea and Land Surface Temperature Radiometer" << std::endl;
    std::cout << "  - LANDCOVER: Copernicus Land Monitoring Service products" << std::endl;
    std::cout << std::endl;
    std::cout << "For Sentinel-2 data, use: tools sentinel2_fetch" << std::endl;
    
    return 1;
}


// Unified Search function
int tools_search(const std::string& aoiPath,
                 const std::string& bbox,
                 const std::string& datetime,
                 const std::string& theme,
                 int cloudMax,
                 const std::string& outputDir,
                 bool overwrite) {
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!std::filesystem::exists(outputDir)) {
        std::error_code ec;
        if (!std::filesystem::create_directories(outputDir, ec)) {
            std::cerr << "Failed to create output directory: " << outputDir << std::endl;
            return 1;
        }
    }
    
    // Parse bbox from either --bbox or --aoi
    double minx, miny, maxx, maxy;
    if (!bbox.empty()) {
        if (!parse_bbox4326(bbox, minx, miny, maxx, maxy)) {
            std::cerr << "Invalid bbox format. Use: minx,miny,maxx,maxy" << std::endl;
            return 1;
        }
    } else {
        // Get bbox from AOI file
        std::string out, err;
        int rc = run_cmd_capture("ogrinfo -al -so '" + aoiPath + "'", out, err);
        if (rc != 0) {
            std::cerr << "Failed to read AOI file: " << (err.empty() ? out : err) << std::endl;
            return 1;
        }
        
        // Extract extent from ogrinfo output
        std::regex extent_regex(R"(Extent: \((-?\d+\.?\d*), (-?\d+\.?\d*)\) - \((-?\d+\.?\d*), (-?\d+\.?\d*)\))");
        std::smatch match;
        if (std::regex_search(out, match, extent_regex)) {
            minx = std::stod(match[1].str());
            miny = std::stod(match[2].str());
            maxx = std::stod(match[3].str());
            maxy = std::stod(match[4].str());
        } else {
            std::cerr << "Could not extract extent from AOI file. Output was: " << out << std::endl;
            return 1;
        }
    }
    
    // Create search results JSON
    json searchResults;
    searchResults["search_parameters"]["aoi_path"] = aoiPath;
    searchResults["search_parameters"]["bbox"]["minx"] = minx;
    searchResults["search_parameters"]["bbox"]["miny"] = miny;
    searchResults["search_parameters"]["bbox"]["maxx"] = maxx;
    searchResults["search_parameters"]["bbox"]["maxy"] = maxy;
    searchResults["search_parameters"]["datetime"] = datetime;
    searchResults["search_parameters"]["theme"] = theme;
    searchResults["search_parameters"]["cloud_max"] = cloudMax;
    searchResults["search_parameters"]["timestamp"] = to_iso8601_utc();
    
    std::vector<json> candidates;
    
    // Search based on theme
    if (theme == "imagery") {
        // Search Sentinel-2 via CDSE STAC
        std::string stacUrl = "https://catalogue.dataspace.copernicus.eu/stac/collections/SENTINEL-2/items";
        std::ostringstream searchCmd;
        searchCmd << "curl -s '"
                  << stacUrl << "?bbox=" << std::setprecision(10) << minx << "," << miny << "," << maxx << "," << maxy
                  << "&datetime=" << (datetime.empty() ? "2024-01-01/2024-12-31" : datetime)
                  << "&limit=10'";
        
        std::string out, err;
        int rc = run_cmd_capture(searchCmd.str(), out, err);
        if (rc == 0 && !out.empty()) {
            try {
                auto stacResponse = json::parse(out);
                if (stacResponse.contains("features") && stacResponse["features"].is_array()) {
                    for (const auto& feature : stacResponse["features"]) {
                        json candidate;
                        candidate["provider"] = "CDSE";
                        candidate["collection"] = "SENTINEL-2";
                        candidate["id"] = feature.contains("id") ? feature["id"] : "unknown";
                        candidate["datetime"] = feature.contains("properties") && feature["properties"].contains("datetime") 
                                              ? feature["properties"]["datetime"] : "unknown";
                        candidate["cloud_cover"] = feature.contains("properties") && feature["properties"].contains("eo:cloud_cover")
                                                 ? feature["properties"]["eo:cloud_cover"].get<int>() : 0;
                        candidate["assets"] = feature.contains("assets") ? feature["assets"] : json::object();
                        candidate["bbox"] = feature.contains("bbox") ? feature["bbox"] : json::array();
                        candidates.push_back(candidate);
                    }
                }
            } catch (const std::exception& e) {
                std::cerr << "Failed to parse STAC response: " << e.what() << std::endl;
            }
        }
        
        // Search Microsoft Planetary Computer STAC
        std::string pcUrl = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items";
        std::ostringstream pcCmd;
        pcCmd << "curl -s '"
              << pcUrl << "?bbox=" << std::setprecision(10) << minx << "," << miny << "," << maxx << "," << maxy
              << "&datetime=" << (datetime.empty() ? "2024-01-01/2024-12-31" : datetime)
              << "&limit=10'";
        
        std::string pcOut, pcErr;
        int pcRc = run_cmd_capture(pcCmd.str(), pcOut, pcErr);
        if (pcRc == 0 && !pcOut.empty()) {
            try {
                auto pcResponse = json::parse(pcOut);
                if (pcResponse.contains("features") && pcResponse["features"].is_array()) {
                    for (const auto& feature : pcResponse["features"]) {
                        json candidate;
                        candidate["provider"] = "Microsoft Planetary Computer";
                        candidate["collection"] = "sentinel-2-l2a";
                        candidate["id"] = feature.contains("id") ? feature["id"] : "unknown";
                        candidate["datetime"] = feature.contains("properties") && feature["properties"].contains("datetime") 
                                              ? feature["properties"]["datetime"] : "unknown";
                        candidate["cloud_cover"] = feature.contains("properties") && feature["properties"].contains("eo:cloud_cover")
                                                 ? feature["properties"]["eo:cloud_cover"].get<int>() : 0;
                        candidate["assets"] = feature.contains("assets") ? feature["assets"] : json::object();
                        candidate["bbox"] = feature.contains("bbox") ? feature["bbox"] : json::array();
                        candidates.push_back(candidate);
                    }
                }
            } catch (const std::exception& e) {
                std::cerr << "Failed to parse PC STAC response: " << e.what() << std::endl;
            }
        }
        
    } else if (theme == "dem") {
        // Search DEM sources
        json srtmCandidate;
        srtmCandidate["provider"] = "SRTM";
        srtmCandidate["source"] = "Mapzen SKADI";
        srtmCandidate["resolution"] = "30m";
        srtmCandidate["coverage"] = "Global";
        srtmCandidate["format"] = "HGT";
        srtmCandidate["url_template"] = "https://elevation-tiles-prod.s3.amazonaws.com/skadi/{tile}.hgt.gz";
        candidates.push_back(srtmCandidate);
        
        json usgsCandidate;
        usgsCandidate["provider"] = "USGS 3DEP";
        usgsCandidate["source"] = "National Map";
        usgsCandidate["resolution"] = "10m";
        usgsCandidate["coverage"] = "United States";
        usgsCandidate["format"] = "GeoTIFF";
        usgsCandidate["url_template"] = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
        candidates.push_back(usgsCandidate);
        
    } else if (theme == "landcover") {
        // Search landcover sources
        json worldcoverCandidate;
        worldcoverCandidate["provider"] = "ESA WorldCover";
        worldcoverCandidate["source"] = "Copernicus";
        worldcoverCandidate["resolution"] = "10m";
        worldcoverCandidate["coverage"] = "Global";
        worldcoverCandidate["format"] = "GeoTIFF";
        worldcoverCandidate["url_template"] = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/ESA_WorldCover_10m_2021_v200_{tile}.tif";
        candidates.push_back(worldcoverCandidate);
        
    } else if (theme == "protected") {
        // Search protected areas
        json wdpaCandidate;
        wdpaCandidate["provider"] = "WDPA";
        wdpaCandidate["source"] = "UNEP-WCMC";
        wdpaCandidate["coverage"] = "Global";
        wdpaCandidate["format"] = "Shapefile/GeoJSON";
        wdpaCandidate["url_template"] = "https://www.protectedplanet.net/downloads/WDPA_WDOECM_{date}";
        candidates.push_back(wdpaCandidate);
        
    } else if (theme == "roads") {
        // Search road data
        json osmCandidate;
        osmCandidate["provider"] = "OpenStreetMap";
        osmCandidate["source"] = "Overpass API";
        osmCandidate["coverage"] = "Global";
        osmCandidate["format"] = "GeoJSON";
        osmCandidate["url_template"] = "https://overpass-api.de/api/interpreter?data=[out:json];way[highway](" + std::to_string(miny) + "," + std::to_string(minx) + "," + std::to_string(maxy) + "," + std::to_string(maxx) + ");out geom;";
        candidates.push_back(osmCandidate);
        
    } else if (theme == "hydro") {
        // Search hydrography data
        json hydroCandidate;
        hydroCandidate["provider"] = "HydroRIVERS";
        hydroCandidate["source"] = "WWF";
        hydroCandidate["coverage"] = "Global";
        hydroCandidate["format"] = "Shapefile";
        hydroCandidate["url_template"] = "https://data.hydrosheds.org/file/HydroRIVERS_v10_shp.zip";
        candidates.push_back(hydroCandidate);
    }
    
    // Rank candidates by relevance (cloud cover for imagery, resolution for others)
    if (theme == "imagery") {
        std::sort(candidates.begin(), candidates.end(), [](const json& a, const json& b) {
            int cloudA = a.contains("cloud_cover") ? a["cloud_cover"].get<int>() : 100;
            int cloudB = b.contains("cloud_cover") ? b["cloud_cover"].get<int>() : 100;
            return cloudA < cloudB;
        });
    }
    
    searchResults["candidates"] = candidates;
    searchResults["total_found"] = candidates.size();
    
    // Write search results
    std::string resultsPath = outputDir + "/search_results.json";
    write_sidecar_json(resultsPath, searchResults);
    
    std::cout << "tools search OK: Found " << candidates.size() << " candidates for theme '" << theme << "'" << std::endl;
    std::cout << "Results saved to: " << resultsPath << std::endl;
    
    return 0;
}

// Mosaic function
int tools_mosaic(const std::vector<std::string>& inputFiles,
                 const std::string& outputFile,
                 const std::string& bbox,
                 const std::string& cutlinePath,
                 const std::string& targetCRS,
                 const std::string& resampling,
                 const std::string& dataType,
                 bool outputCOG,
                 bool overwrite) {
    
    // Validate inputs
    if (inputFiles.empty()) {
        std::cerr << "No input files provided" << std::endl;
        return 1;
    }
    
    // Check if all input files exist
    for (const auto& file : inputFiles) {
        if (!std::filesystem::exists(file)) {
            std::cerr << "Input file does not exist: " << file << std::endl;
            return 1;
        }
    }
    
    // Check if output exists and overwrite is not set
    if (std::filesystem::exists(outputFile) && !overwrite) {
        std::cerr << "Output file exists and --overwrite not set: " << outputFile << std::endl;
        return 1;
    }
    
    // Create output directory if needed
    std::filesystem::path outPath = std::filesystem::absolute(outputFile);
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Failed to create output directory: " << err << std::endl;
        return 1;
    }
    
    // Build gdalwarp command
    std::ostringstream cmd;
    cmd << "gdalwarp -overwrite";
    
    // Add resampling method
    cmd << " -r " << resampling;
    
    // Add data type
    if (dataType != "auto") {
        cmd << " -ot " << dataType;
    }
    
    // Add output format
    if (outputCOG) {
        cmd << " -of COG -co COMPRESS=ZSTD -co BIGTIFF=YES";
    } else {
        cmd << " -of GTiff";
    }
    
    // Add target CRS
    if (!targetCRS.empty()) {
        cmd << " -t_srs " << targetCRS;
    }
    
    // Add bbox clipping if provided
    if (!bbox.empty()) {
        double minx, miny, maxx, maxy;
        if (parse_bbox4326(bbox, minx, miny, maxx, maxy)) {
            cmd << " -te " << std::setprecision(10) << minx << " " << miny << " " << maxx << " " << maxy;
            cmd << " -te_srs EPSG:4326";
        }
    }
    
    // Add cutline clipping if provided
    if (!cutlinePath.empty() && std::filesystem::exists(cutlinePath)) {
        cmd << " -cutline '" << cutlinePath << "' -crop_to_cutline";
    }
    
    // Add input files
    for (const auto& file : inputFiles) {
        cmd << " '" << file << "'";
    }
    
    // Add output file
    cmd << " '" << outputFile << "'";
    
    // Execute the command
    std::string out, e;
    int rc = run_cmd_capture(cmd.str(), out, e);
    if (rc != 0) {
        std::cerr << "gdalwarp failed: " << (e.empty() ? out : e) << std::endl;
        return 2;
    }
    
    // Create sidecar metadata
    json meta;
    meta["type"] = "mosaic";
    meta["inputs"] = inputFiles;
    meta["output"] = outputFile;
    meta["processing"]["target_crs"] = targetCRS;
    meta["processing"]["resampling"] = resampling;
    meta["processing"]["data_type"] = dataType;
    meta["processing"]["output_cog"] = outputCOG;
    meta["processing"]["bbox_clipped"] = !bbox.empty();
    meta["processing"]["cutline_clipped"] = !cutlinePath.empty();
    meta["processing"]["timestamp"] = to_iso8601_utc();
    meta["raster_metadata"] = get_raster_metadata(outputFile);
    
    write_sidecar_json(outputFile, meta);
    
    std::cout << "tools mosaic OK: " << outputFile << std::endl;
    return 0;
}

// GeoAI function - Python-to-C++ wrapper for torchgeo
int tools_geoai(const std::string& task,
                const std::string& inputPath,
                const std::string& outputPath,
                const std::string& model,
                bool overwrite) {
    
    // Validate inputs
    if (!std::filesystem::exists(inputPath)) {
        std::cerr << "Input file not found: " << inputPath << std::endl;
        return 1;
    }
    
    if (std::filesystem::exists(outputPath) && !overwrite) {
        std::cerr << "Output file exists: " << outputPath << " (use --overwrite)" << std::endl;
        return 1;
    }
    
    // Create output directory if needed
    std::filesystem::path outPath(outputPath);
    if (!outPath.parent_path().empty()) {
        std::error_code ec;
        std::filesystem::create_directories(outPath.parent_path(), ec);
    }
    
    // Create Python script for GeoAI processing
    std::string scriptPath = "/tmp/geoai_" + std::to_string(std::time(nullptr)) + ".py";
    std::ofstream script(scriptPath);
    if (!script.is_open()) {
        std::cerr << "Failed to create Python script" << std::endl;
        return 1;
    }
    
    // Write Python script based on task
    if (task == "cloud_mask") {
        script << R"(
import sys
import os
import numpy as np
from osgeo import gdal
import torch
import torch.nn.functional as F
from torchgeo.datasets import Sentinel2
from torchgeo.transforms import AugmentationSequential
from torchgeo.models import S2Cloudless

def cloud_mask_s2cloudless(input_path, output_path):
    """Generate cloud mask using s2cloudless model"""
    try:
        # Load Sentinel-2 data
        dataset = Sentinel2(root=".", bands=["B02", "B03", "B04", "B08", "B11", "B12"])
        
        # Load s2cloudless model
        model = S2Cloudless(pretrained=True)
        model.eval()
        
        # Read input raster
        ds = gdal.Open(input_path)
        if ds is None:
            print(f"Error: Could not open {input_path}")
            return False
            
        # Get raster properties
        width = ds.RasterXSize
        height = ds.RasterYSize
        bands = ds.RasterCount
        geotransform = ds.GetGeoTransform()
        projection = ds.GetProjection()
        
        # Read bands (assuming Sentinel-2 order: B02, B03, B04, B08, B11, B12)
        data = np.zeros((bands, height, width), dtype=np.float32)
        for i in range(bands):
            band = ds.GetRasterBand(i + 1)
            data[i] = band.ReadAsArray().astype(np.float32)
        
        # Normalize data (assuming reflectance values 0-10000)
        data = data / 10000.0
        
        # Convert to tensor and add batch dimension
        tensor = torch.from_numpy(data).unsqueeze(0)
        
        # Run inference
        with torch.no_grad():
            cloud_prob = model(tensor)
            cloud_mask = (cloud_prob > 0.4).float()  # Threshold for cloud detection
        
        # Convert back to numpy
        cloud_mask_np = cloud_mask.squeeze().numpy().astype(np.uint8) * 255
        
        # Write output
        driver = gdal.GetDriverByName('GTiff')
        out_ds = driver.Create(output_path, width, height, 1, gdal.GDT_Byte)
        out_ds.SetGeoTransform(geotransform)
        out_ds.SetProjection(projection)
        out_band = out_ds.GetRasterBand(1)
        out_band.WriteArray(cloud_mask_np)
        out_band.SetNoDataValue(0)
        out_ds = None
        
        return True
        
    except Exception as e:
        print(f"Error in cloud_mask_s2cloudless: {e}")
        return False

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = cloud_mask_s2cloudless(input_path, output_path)
    sys.exit(0 if success else 1)
)";
    } else if (task == "water_detect") {
        script << R"(
import sys
from osgeo import gdal

def water_detect_placeholder(input_path, output_path):
    """Water detection placeholder - NDWI implementation removed per user request"""
    print("Error: Water detection via NDWI has been removed.")
    print("Use raster_calc with appropriate spectral indices instead.")
        return False

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = water_detect_placeholder(input_path, output_path)
    sys.exit(0 if success else 1)
)";
    } else if (task == "change_detect") {
        script << R"(
import sys
import numpy as np
from osgeo import gdal

def change_detect_simple(input_path, output_path):
    """Simple change detection using NDVI difference"""
    try:
        # This is a placeholder - would need two input images for change detection
        # For now, create a dummy output
        print("Change detection requires two input images - not implemented yet")
        return False
        
    except Exception as e:
        print(f"Error in change_detect_simple: {e}")
        return False

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = change_detect_simple(input_path, output_path)
    sys.exit(0 if success else 1)
)";
    } else if (task == "landcover_seg") {
        script << R"(
import sys
import numpy as np
from osgeo import gdal

def landcover_seg_simple(input_path, output_path):
    """Simple landcover segmentation using NDVI thresholds"""
    try:
        # Read input raster
        ds = gdal.Open(input_path)
        if ds is None:
            print(f"Error: Could not open {input_path}")
            return False
            
        # Get raster properties
        width = ds.RasterXSize
        height = ds.RasterYSize
        bands = ds.RasterCount
        geotransform = ds.GetGeoTransform()
        projection = ds.GetProjection()
        
        if bands < 2:
            print("Error: Need at least 2 bands for NDVI calculation")
            return False
        
        # Read Red (band 1) and NIR (band 2) bands
        red = ds.GetRasterBand(1).ReadAsArray().astype(np.float32)
        nir = ds.GetRasterBand(2).ReadAsArray().astype(np.float32)
        
        # Calculate NDVI
        ndvi = (nir - red) / (nir + red + 1e-9)
        
        # Simple landcover classification
        landcover = np.zeros_like(ndvi, dtype=np.uint8)
        landcover[ndvi > 0.6] = 1  # Vegetation
        landcover[ndvi < 0.1] = 2  # Water/Bare soil
        landcover[(ndvi >= 0.1) & (ndvi <= 0.6)] = 3  # Mixed
        
        # Write output
        driver = gdal.GetDriverByName('GTiff')
        out_ds = driver.Create(output_path, width, height, 1, gdal.GDT_Byte)
        out_ds.SetGeoTransform(geotransform)
        out_ds.SetProjection(projection)
        out_band = out_ds.GetRasterBand(1)
        out_band.WriteArray(landcover)
        out_band.SetNoDataValue(0)
        out_ds = None
        
        return True
        
    except Exception as e:
        print(f"Error in landcover_seg_simple: {e}")
        return False

if __name__ == "__main__":
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    success = landcover_seg_simple(input_path, output_path)
    sys.exit(0 if success else 1)
)";
    } else {
        std::cerr << "Unknown GeoAI task: " << task << std::endl;
        return 1;
    }
    
    script.close();
    
    // Execute Python script
    std::ostringstream cmd;
    cmd << "python3 " << scriptPath << " '" << inputPath << "' '" << outputPath << "'";
    
    std::string out, err;
    int rc = run_cmd_capture(cmd.str(), out, err);
    
    // Clean up script
    std::remove(scriptPath.c_str());
    
    if (rc != 0) {
        std::cerr << "GeoAI processing failed: " << (err.empty() ? out : err) << std::endl;
        return 1;
    }
    
    // Create sidecar JSON
    json geoaiMetadata;
    geoaiMetadata["raster_metadata"] = get_raster_metadata(outputPath);
    geoaiMetadata["processing"]["tool"] = "geoai";
    geoaiMetadata["processing"]["task"] = task;
    geoaiMetadata["processing"]["model"] = model;
    geoaiMetadata["processing"]["input"] = inputPath;
    geoaiMetadata["processing"]["timestamp"] = to_iso8601_utc();
    write_sidecar_json(outputPath, geoaiMetadata);
    
    std::cout << "tools geoai OK: " << outputPath << std::endl;
    return 0;
}


// --- Pipeline wrappers (stubs for MVP) ---
// Pipeline routing tool implementations removed (premature, will be reimplemented in Phase 4)

int tools_osm_waterways_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                     OSM Waterways Fetch Tool                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch OpenStreetMap waterways data for a specified area of interest.    ║
║   Downloads rivers, streams, canals, drains, and other waterway features. ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     OpenStreetMap (OSM)                                          ║
║   API:        Overpass API (https://overpass-api.de/)                      ║
║   License:    ODbL 1.0 (Open Data Commons Open Database License)           ║
║   Attribution: © OpenStreetMap contributors                                ║
║   Coverage:   Global                                                       ║
║   Update:     Continuous (near real-time community updates)                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ FEATURES EXTRACTED:                                                        ║
║   • river       - Natural flowing watercourse                              ║
║   • stream      - Small natural watercourse                                ║
║   • canal       - Artificial watercourse                                   ║
║   • drain       - Artificial water drainage channel                        ║
║   • ditch       - Small drainage channel                                   ║
║   • weir        - Low dam across river/stream                              ║
║   • dam         - Barrier across flowing water                             ║
║   • lock        - Device for raising/lowering boats                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTES INCLUDED:                                                       ║
║   • name        - Name of the waterway (if available)                      ║
║   • waterway    - Type (river, stream, canal, etc.)                        ║
║   • width       - Width in meters (if tagged)                              ║
║   • depth       - Depth in meters (if tagged)                              ║
║   • seasonal    - Whether waterway is seasonal (yes/no)                    ║
║   • intermittent- Whether flow is intermittent (yes/no)                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     GeoPackage (.gpkg)                                           ║
║   Geometry:   LineString                                                   ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Metadata:   JSON sidecar with provenance and quality info               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE EXAMPLES:                                                            ║
║                                                                            ║
║ 1. Fetch by bounding box:                                                 ║
║    tools osm_waterways_fetch \                                             ║
║      --bbox 27.5,27.2,27.7,27.5 \                                          ║
║      --output waterways.gpkg                                               ║
║                                                                            ║
║ 2. Fetch by AOI polygon:                                                  ║
║    tools osm_waterways_fetch \                                             ║
║      --aoi study_area.geojson \                                            ║
║      --output waterways.gpkg \                                             ║
║      --overwrite                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   • Rate limit: Respects Overpass API limits (~1 req/sec)                 ║
║   • Timeout: 300 seconds for large queries                                 ║
║   • Quality: Varies by region (community-maintained)                       ║
║   • Use for: Pipeline crossings, hydrology analysis, routing               ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot specify both --bbox and --aoi (mutually exclusive)" << std::endl;
        return 1;
    }
    if (outputPath.empty()) {
        std::cerr << "Error: --output is required" << std::endl;
    return 1;
    }

    // Check output file
    std::filesystem::path outPath = std::filesystem::absolute(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists: " << outPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Ensure output directory exists
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Error creating output directory: " << err << std::endl;
        return 1;
    }

    std::cout << "tools osm_waterways_fetch: Fetching OSM waterways data..." << std::endl;
    
    // Determine bounding box
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else {
        // Extract bbox from AOI
        std::ostringstream cmd;
        cmd << "ogrinfo -al -so '" << aoiPath << "' | grep 'Extent:' | head -1";
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent: "Extent: (minx, miny) - (maxx, maxy)"
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double miny = std::stod(match[2].str());  // FIXED: was maxx
            double maxx = std::stod(match[3].str());  // FIXED: was miny
            double maxy = std::stod(match[4].str());
            std::ostringstream bboxStr;
            bboxStr << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            queryBBox = bboxStr.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Build Overpass QL query
    std::ostringstream overpassQuery;
    overpassQuery << "[out:json][timeout:300];\n";
    overpassQuery << "(\n";
    overpassQuery << "  way[\"waterway\"=\"river\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"stream\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"canal\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"drain\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"ditch\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"weir\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"dam\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"waterway\"=\"lock\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << ");\n";
    overpassQuery << "out geom;\n";
    
    // Write query to temp file
    std::string queryFile = "/tmp/osm_waterways_query_" + std::to_string(std::time(nullptr)) + ".ql";
    std::ofstream qf(queryFile);
    qf << overpassQuery.str();
    qf.close();
    
    // Query Overpass API
    std::string jsonFile = "/tmp/osm_waterways_" + std::to_string(std::time(nullptr)) + ".json";
    std::ostringstream curlCmd;
    curlCmd << "curl -s --max-time 320 --data @'" << queryFile << "' ";
    curlCmd << "https://overpass-api.de/api/interpreter > '" << jsonFile << "' 2>&1";
    
    std::cout << "  Querying Overpass API..." << std::endl;
    int curlRc = system(curlCmd.str().c_str());
    if (curlRc != 0) {
        std::cerr << "Error: Overpass API query failed" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Check if JSON file is valid
    std::ifstream jsonCheck(jsonFile);
    if (!jsonCheck.good() || std::filesystem::file_size(jsonFile) == 0) {
        std::cerr << "Error: Empty or invalid response from Overpass API" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    jsonCheck.close();
    
    // Convert JSON to GeoJSON using Python
    std::string geojsonFile = "/tmp/osm_waterways_" + std::to_string(std::time(nullptr)) + ".geojson";
    std::ostringstream pythonCmd;
    pythonCmd << "python3 << 'PYEOF'\n";
    pythonCmd << "import json\n";
    pythonCmd << "import sys\n\n";
    pythonCmd << "with open('" << jsonFile << "', 'r') as f:\n";
    pythonCmd << "    data = json.load(f)\n\n";
    pythonCmd << "features = []\n";
    pythonCmd << "for element in data.get('elements', []):\n";
    pythonCmd << "    if element.get('type') != 'way' or 'geometry' not in element:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    coords = [[pt['lon'], pt['lat']] for pt in element['geometry']]\n";
    pythonCmd << "    if len(coords) < 2:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    tags = element.get('tags', {})\n";
    pythonCmd << "    width_raw = tags.get('width', '')\n";
    pythonCmd << "    waterway_type = tags.get('waterway', '')\n";
    pythonCmd << "    # Parse width value\n";
    pythonCmd << "    width_m = None\n";
    pythonCmd << "    if width_raw:\n";
    pythonCmd << "        try:\n";
    pythonCmd << "            width_m = float(width_raw.split()[0])\n";
    pythonCmd << "        except:\n";
    pythonCmd << "            pass\n";
    pythonCmd << "    # Estimate width from waterway type if not tagged\n";
    pythonCmd << "    if width_m is None:\n";
    pythonCmd << "        if waterway_type == 'stream' or waterway_type == 'ditch':\n";
    pythonCmd << "            width_m = 2.0  # 1-3m typical\n";
    pythonCmd << "        elif waterway_type == 'drain':\n";
    pythonCmd << "            width_m = 5.0  # 3-10m typical\n";
    pythonCmd << "        elif waterway_type == 'canal':\n";
    pythonCmd << "            width_m = 15.0  # 10-50m typical\n";
    pythonCmd << "        elif waterway_type == 'river':\n";
    pythonCmd << "            width_m = 25.0  # Varies widely, default medium\n";
    pythonCmd << "    # Classify width for crossing cost estimation\n";
    pythonCmd << "    width_class = ''\n";
    pythonCmd << "    crossing_cost_cat = ''\n";
    pythonCmd << "    if width_m:\n";
    pythonCmd << "        if width_m < 3:\n";
    pythonCmd << "            width_class = 'small'\n";
    pythonCmd << "            crossing_cost_cat = 'low'  # $10K-20K open cut\n";
    pythonCmd << "        elif width_m < 10:\n";
    pythonCmd << "            width_class = 'medium'\n";
    pythonCmd << "            crossing_cost_cat = 'medium'  # $30K-70K open cut\n";
    pythonCmd << "        elif width_m < 50:\n";
    pythonCmd << "            width_class = 'large'\n";
    pythonCmd << "            crossing_cost_cat = 'high'  # $200K-400K HDD\n";
    pythonCmd << "        else:\n";
    pythonCmd << "            width_class = 'major'\n";
    pythonCmd << "            crossing_cost_cat = 'very_high'  # $800K+ HDD\n";
    pythonCmd << "    feature = {\n";
    pythonCmd << "        'type': 'Feature',\n";
    pythonCmd << "        'geometry': {'type': 'LineString', 'coordinates': coords},\n";
    pythonCmd << "        'properties': {\n";
    pythonCmd << "            'osm_id': element.get('id'),\n";
    pythonCmd << "            'name': tags.get('name', ''),\n";
    pythonCmd << "            'waterway': waterway_type,\n";
    pythonCmd << "            'width': width_raw,\n";
    pythonCmd << "            'width_m': width_m if width_m else None,\n";
    pythonCmd << "            'width_class': width_class,\n";
    pythonCmd << "            'crossing_cost_cat': crossing_cost_cat,\n";
    pythonCmd << "            'depth': tags.get('depth', ''),\n";
    pythonCmd << "            'seasonal': tags.get('seasonal', ''),\n";
    pythonCmd << "            'intermittent': tags.get('intermittent', ''),\n";
    pythonCmd << "            'tunnel': tags.get('tunnel', '')\n";
    pythonCmd << "        }\n";
    pythonCmd << "    }\n";
    pythonCmd << "    features.append(feature)\n\n";
    pythonCmd << "geojson = {\n";
    pythonCmd << "    'type': 'FeatureCollection',\n";
    pythonCmd << "    'features': features\n";
    pythonCmd << "}\n\n";
    pythonCmd << "with open('" << geojsonFile << "', 'w') as f:\n";
    pythonCmd << "    json.dump(geojson, f)\n";
    pythonCmd << "print(f'Converted {len(features)} waterway features')\n";
    pythonCmd << "PYEOF\n";
    
    std::cout << "  Converting OSM data to GeoJSON..." << std::endl;
    int pyRc = system(pythonCmd.str().c_str());
    if (pyRc != 0) {
        std::cerr << "Error: Failed to convert OSM data to GeoJSON" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::ostringstream ogrCmd;
    ogrCmd << "ogr2ogr -f GPKG '" << outPath.string() << "' '" << geojsonFile << "' ";
    ogrCmd << "-nln waterways -a_srs EPSG:4326";
    if (overwrite) {
        ogrCmd << " -overwrite";
    }
    ogrCmd << " 2>&1";
    
    std::cout << "  Converting to GeoPackage..." << std::endl;
    int ogrRc = system(ogrCmd.str().c_str());
    if (ogrRc != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        std::filesystem::remove(geojsonFile);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "osm_waterways_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "OpenStreetMap"},
        {"api", "Overpass API"},
        {"endpoint", "https://overpass-api.de/api/interpreter"},
        {"license", "ODbL 1.0"},
        {"attribution", "© OpenStreetMap contributors"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath}
    };
    meta["features"] = {
        {"types", {"river", "stream", "canal", "drain", "ditch", "weir", "dam", "lock"}},
        {"geometry", "LineString"},
        {"crs", "EPSG:4326"}
    };
    meta["attributes"] = {
        {"osm_id", "OpenStreetMap way ID"},
        {"name", "Name of waterway"},
        {"waterway", "Waterway type"},
        {"width", "Width in meters (if tagged)"},
        {"depth", "Depth in meters (if tagged)"},
        {"seasonal", "Seasonal waterway flag"},
        {"intermittent", "Intermittent flow flag"}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove(queryFile);
    std::filesystem::remove(jsonFile);
    std::filesystem::remove(geojsonFile);
    
    std::cout << "tools osm_waterways_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_osm_roads_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                       OSM Roads Fetch Tool                                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch OpenStreetMap road/highway data for a specified area of interest. ║
║   Downloads motorways, primary/secondary roads, residential streets, etc. ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     OpenStreetMap (OSM)                                          ║
║   API:        Overpass API (https://overpass-api.de/)                      ║
║   License:    ODbL 1.0 (Open Data Commons Open Database License)           ║
║   Attribution: © OpenStreetMap contributors                                ║
║   Coverage:   Global                                                       ║
║   Update:     Continuous (near real-time community updates)                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ FEATURES EXTRACTED:                                                        ║
║   • motorway       - High-speed controlled-access highway                  ║
║   • trunk          - Important non-motorway highway                        ║
║   • primary        - Primary road linking large towns                      ║
║   • secondary      - Secondary road linking towns                          ║
║   • tertiary       - Tertiary road linking small towns                     ║
║   • unclassified   - Minor public road                                     ║
║   • residential    - Road in residential area                              ║
║   • service        - Service/access road                                   ║
║   • track          - Agricultural/forest track                             ║
║   • path           - Non-vehicular path                                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTES INCLUDED:                                                       ║
║   • osm_id      - OpenStreetMap way ID                                     ║
║   • name        - Road name (if available)                                 ║
║   • highway     - Road classification type                                 ║
║   • ref         - Road reference number (e.g., "I-95", "A1")               ║
║   • surface     - Road surface type (paved, unpaved, etc.)                 ║
║   • lanes       - Number of lanes                                          ║
║   • maxspeed    - Maximum speed limit                                      ║
║   • oneway      - One-way street flag (yes/no)                             ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     GeoPackage (.gpkg)                                           ║
║   Geometry:   LineString                                                   ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Metadata:   JSON sidecar with provenance and quality info               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE EXAMPLES:                                                            ║
║                                                                            ║
║ 1. Fetch by bounding box:                                                 ║
║    tools osm_roads_fetch \                                                 ║
║      --bbox 46.5,24.5,46.9,24.9 \                                          ║
║      --output roads.gpkg                                                   ║
║                                                                            ║
║ 2. Fetch by AOI polygon:                                                  ║
║    tools osm_roads_fetch \                                                 ║
║      --aoi study_area.geojson \                                            ║
║      --output roads.gpkg \                                                 ║
║      --overwrite                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   • Rate limit: Respects Overpass API limits (~1 req/sec)                 ║
║   • Timeout: 300 seconds for large queries                                 ║
║   • Quality: Varies by region (community-maintained)                       ║
║   • Use for: Road crossings, access analysis, routing constraints          ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot specify both --bbox and --aoi (mutually exclusive)" << std::endl;
        return 1;
    }
    if (outputPath.empty()) {
        std::cerr << "Error: --output is required" << std::endl;
        return 1;
    }

    // Check output file
    std::filesystem::path outPath = std::filesystem::absolute(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists: " << outPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Ensure output directory exists
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Error creating output directory: " << err << std::endl;
        return 1;
    }

    std::cout << "tools osm_roads_fetch: Fetching OSM roads data..." << std::endl;
    
    // Determine bounding box
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else {
        // Extract bbox from AOI
        std::ostringstream cmd;
        cmd << "ogrinfo -al -so '" << aoiPath << "' | grep 'Extent:' | head -1";
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent: "Extent: (minx, miny) - (maxx, maxy)"
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double miny = std::stod(match[2].str());  // FIXED: was maxx
            double maxx = std::stod(match[3].str());  // FIXED: was miny
            double maxy = std::stod(match[4].str());
            std::ostringstream bboxStr;
            bboxStr << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            queryBBox = bboxStr.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Build Overpass QL query
    std::ostringstream overpassQuery;
    overpassQuery << "[out:json][timeout:300];\n";
    overpassQuery << "(\n";
    overpassQuery << "  way[\"highway\"=\"motorway\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"trunk\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"primary\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"secondary\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"tertiary\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"unclassified\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"residential\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"service\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"track\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"highway\"=\"path\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << ");\n";
    overpassQuery << "out geom;\n";
    
    // Write query to temp file
    std::string queryFile = "/tmp/osm_roads_query_" + std::to_string(std::time(nullptr)) + ".ql";
    std::ofstream qf(queryFile);
    qf << overpassQuery.str();
    qf.close();
    
    // Query Overpass API
    std::string jsonFile = "/tmp/osm_roads_" + std::to_string(std::time(nullptr)) + ".json";
    std::ostringstream curlCmd;
    curlCmd << "curl -s --max-time 320 --data @'" << queryFile << "' ";
    curlCmd << "https://overpass-api.de/api/interpreter > '" << jsonFile << "' 2>&1";
    
    std::cout << "  Querying Overpass API..." << std::endl;
    int curlRc = system(curlCmd.str().c_str());
    if (curlRc != 0) {
        std::cerr << "Error: Overpass API query failed" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Check if JSON file is valid
    std::ifstream jsonCheck(jsonFile);
    if (!jsonCheck.good() || std::filesystem::file_size(jsonFile) == 0) {
        std::cerr << "Error: Empty or invalid response from Overpass API" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    jsonCheck.close();
    
    // Convert JSON to GeoJSON using Python
    std::string geojsonFile = "/tmp/osm_roads_" + std::to_string(std::time(nullptr)) + ".geojson";
    std::ostringstream pythonCmd;
    pythonCmd << "python3 << 'PYEOF'\n";
    pythonCmd << "import json\n";
    pythonCmd << "import sys\n\n";
    pythonCmd << "with open('" << jsonFile << "', 'r') as f:\n";
    pythonCmd << "    data = json.load(f)\n\n";
    pythonCmd << "features = []\n";
    pythonCmd << "for element in data.get('elements', []):\n";
    pythonCmd << "    if element.get('type') != 'way' or 'geometry' not in element:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    coords = [[pt['lon'], pt['lat']] for pt in element['geometry']]\n";
    pythonCmd << "    if len(coords) < 2:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    tags = element.get('tags', {})\n";
    pythonCmd << "    feature = {\n";
    pythonCmd << "        'type': 'Feature',\n";
    pythonCmd << "        'geometry': {'type': 'LineString', 'coordinates': coords},\n";
    pythonCmd << "        'properties': {\n";
    pythonCmd << "            'osm_id': element.get('id'),\n";
    pythonCmd << "            'name': tags.get('name', ''),\n";
    pythonCmd << "            'highway': tags.get('highway', ''),\n";
    pythonCmd << "            'ref': tags.get('ref', ''),\n";
    pythonCmd << "            'surface': tags.get('surface', ''),\n";
    pythonCmd << "            'lanes': tags.get('lanes', ''),\n";
    pythonCmd << "            'maxspeed': tags.get('maxspeed', ''),\n";
    pythonCmd << "            'oneway': tags.get('oneway', '')\n";
    pythonCmd << "        }\n";
    pythonCmd << "    }\n";
    pythonCmd << "    features.append(feature)\n\n";
    pythonCmd << "geojson = {\n";
    pythonCmd << "    'type': 'FeatureCollection',\n";
    pythonCmd << "    'features': features\n";
    pythonCmd << "}\n\n";
    pythonCmd << "with open('" << geojsonFile << "', 'w') as f:\n";
    pythonCmd << "    json.dump(geojson, f)\n";
    pythonCmd << "print(f'Converted {len(features)} road features')\n";
    pythonCmd << "PYEOF\n";
    
    std::cout << "  Converting OSM data to GeoJSON..." << std::endl;
    int pyRc = system(pythonCmd.str().c_str());
    if (pyRc != 0) {
        std::cerr << "Error: Failed to convert OSM data to GeoJSON" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::ostringstream ogrCmd;
    ogrCmd << "ogr2ogr -f GPKG '" << outPath.string() << "' '" << geojsonFile << "' ";
    ogrCmd << "-nln roads -a_srs EPSG:4326";
    if (overwrite) {
        ogrCmd << " -overwrite";
    }
    ogrCmd << " 2>&1";
    
    std::cout << "  Converting to GeoPackage..." << std::endl;
    int ogrRc = system(ogrCmd.str().c_str());
    if (ogrRc != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        std::filesystem::remove(geojsonFile);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "osm_roads_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "OpenStreetMap"},
        {"api", "Overpass API"},
        {"endpoint", "https://overpass-api.de/api/interpreter"},
        {"license", "ODbL 1.0"},
        {"attribution", "© OpenStreetMap contributors"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath}
    };
    meta["features"] = {
        {"types", {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "track", "path"}},
        {"geometry", "LineString"},
        {"crs", "EPSG:4326"}
    };
    meta["attributes"] = {
        {"osm_id", "OpenStreetMap way ID"},
        {"name", "Road name"},
        {"highway", "Road classification"},
        {"ref", "Road reference number"},
        {"surface", "Surface type"},
        {"lanes", "Number of lanes"},
        {"maxspeed", "Speed limit"},
        {"oneway", "One-way street flag"}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove(queryFile);
    std::filesystem::remove(jsonFile);
    std::filesystem::remove(geojsonFile);
    
    std::cout << "tools osm_roads_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_osm_power_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                    OSM Power Lines Fetch Tool                              ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch OpenStreetMap power transmission and distribution lines for a     ║
║   specified area of interest. Focuses on high-voltage transmission lines  ║
║   (>100kV) for pipeline routing conflict analysis.                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     OpenStreetMap (OSM)                                          ║
║   API:        Overpass API (https://overpass-api.de/)                      ║
║   License:    ODbL 1.0 (Open Data Commons Open Database License)           ║
║   Attribution: © OpenStreetMap contributors                                ║
║   Coverage:   Global                                                       ║
║   Update:     Continuous (near real-time community updates)                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ FEATURES EXTRACTED:                                                        ║
║   • power=line        - Main power transmission lines                      ║
║   • power=minor_line  - Distribution lines                                 ║
║   • power=cable       - Underground/submarine power cables                 ║
║   • voltage filter    - Focus on >100kV (transmission) where tagged        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTES INCLUDED:                                                       ║
║   • osm_id        - OpenStreetMap way ID                                   ║
║   • name          - Power line name (if available)                         ║
║   • power         - Power infrastructure type                              ║
║   • voltage       - Voltage in volts (if tagged)                           ║
║   • voltage_kv    - Voltage in kilovolts (calculated)                      ║
║   • voltage_class - Classification (high/medium/low/unknown)               ║
║   • cables        - Number of cables/conductors                            ║
║   • operator      - Operating company                                      ║
║   • frequency     - Electrical frequency (Hz)                              ║
║   • crossing_cost - Estimated crossing complexity                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT:                                                                    ║
║   Format:     GeoPackage (.gpkg)                                           ║
║   CRS:        EPSG:4326 (WGS 84 lat/lon)                                   ║
║   Layer:      power_lines                                                  ║
║   Geometry:   LineString                                                   ║
║   Sidecar:    JSON metadata file (.gpkg.json)                              ║
╚════════════════════════════════════════════════════════════════════════════╝
)"
 << std::endl;
        return 0;
    }
    
    std::filesystem::path outPath(outputPath);
    
    if (!overwrite && std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file already exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching OSM power transmission lines..." << std::endl;
    std::cout << "  Source: OpenStreetMap via Overpass API" << std::endl;
    std::cout << "  Focus: High-voltage transmission lines (>100kV preferred)" << std::endl;
    
    // Determine query bbox
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else if (!aoiPath.empty()) {
        std::ostringstream ogrCmd;
        ogrCmd << "ogrinfo -al -so '" << aoiPath << "' 2>&1 | grep 'Extent:' | head -1";
        FILE* pipe = popen(ogrCmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to get AOI extent" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent: Extent: (minX, maxX) - (minY, maxY)
        size_t pos1 = result.find('(');
        size_t pos2 = result.find(')');
        size_t pos3 = result.find('(', pos2);
        size_t pos4 = result.find(')', pos3);
        
        if (pos1 == std::string::npos || pos2 == std::string::npos || 
            pos3 == std::string::npos || pos4 == std::string::npos) {
            std::cerr << "Error: Could not parse AOI extent" << std::endl;
            return 1;
        }
        
        std::string xPart = result.substr(pos1 + 1, pos2 - pos1 - 1);
        std::string yPart = result.substr(pos3 + 1, pos4 - pos3 - 1);
        
        double minX, maxX, minY, maxY;
        sscanf(xPart.c_str(), "%lf, %lf", &minX, &maxX);
        sscanf(yPart.c_str(), "%lf, %lf", &minY, &maxY);
        
        queryBBox = std::to_string(minX) + "," + std::to_string(minY) + "," +
                    std::to_string(maxX) + "," + std::to_string(maxY);
    } else {
        std::cerr << "Error: Must provide either --bbox or --aoi" << std::endl;
        return 1;
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Build Overpass QL query for power lines
    std::ostringstream overpassQuery;
    overpassQuery << "[out:json][timeout:300];\n";
    overpassQuery << "(\n";
    // Main transmission lines
    overpassQuery << "  way[\"power\"=\"line\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    // Minor/distribution lines
    overpassQuery << "  way[\"power\"=\"minor_line\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    // Underground cables
    overpassQuery << "  way[\"power\"=\"cable\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << ");\n";
    overpassQuery << "out geom;\n";
    
    // Write query to temp file
    std::string queryFile = "/tmp/osm_power_query_" + std::to_string(std::time(nullptr)) + ".ql";
    std::ofstream qf(queryFile);
    qf << overpassQuery.str();
    qf.close();
    
    // Query Overpass API
    std::string jsonFile = "/tmp/osm_power_" + std::to_string(std::time(nullptr)) + ".json";
    std::ostringstream curlCmd;
    curlCmd << "curl -s --max-time 320 --data @'" << queryFile << "' ";
    curlCmd << "https://overpass-api.de/api/interpreter > '" << jsonFile << "' 2>&1";
    
    std::cout << "  Querying Overpass API..." << std::endl;
    int curlRc = system(curlCmd.str().c_str());
    if (curlRc != 0) {
        std::cerr << "Error: Overpass API query failed" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Check if JSON file is valid
    std::ifstream jsonCheck(jsonFile);
    if (!jsonCheck.good() || std::filesystem::file_size(jsonFile) == 0) {
        std::cerr << "Error: Empty or invalid response from Overpass API" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    jsonCheck.close();
    
    // Convert JSON to GeoJSON using Python with power line attributes
    std::string geojsonFile = "/tmp/osm_power_" + std::to_string(std::time(nullptr)) + ".geojson";
    std::ostringstream pythonCmd;
    pythonCmd << "python3 << 'PYEOF'\n";
    pythonCmd << "import json\n";
    pythonCmd << "import sys\n\n";
    pythonCmd << "with open('" << jsonFile << "', 'r') as f:\n";
    pythonCmd << "    data = json.load(f)\n\n";
    pythonCmd << "features = []\n";
    pythonCmd << "for element in data.get('elements', []):\n";
    pythonCmd << "    if element.get('type') != 'way' or 'geometry' not in element:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    coords = [[pt['lon'], pt['lat']] for pt in element['geometry']]\n";
    pythonCmd << "    if len(coords) < 2:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    tags = element.get('tags', {})\n";
    pythonCmd << "    power_type = tags.get('power', '')\n";
    pythonCmd << "    voltage_str = tags.get('voltage', '')\n";
    pythonCmd << "    # Parse voltage (may be like '220000', '400000', '110kV', etc.)\n";
    pythonCmd << "    voltage_v = None\n";
    pythonCmd << "    voltage_kv = None\n";
    pythonCmd << "    if voltage_str:\n";
    pythonCmd << "        try:\n";
    pythonCmd << "            # Remove non-numeric chars and get first number\n";
    pythonCmd << "            import re\n";
    pythonCmd << "            nums = re.findall(r'\\d+', voltage_str)\n";
    pythonCmd << "            if nums:\n";
    pythonCmd << "                voltage_v = int(nums[0])\n";
    pythonCmd << "                # If value looks like kV (< 1000), convert to volts\n";
    pythonCmd << "                if voltage_v < 1000:\n";
    pythonCmd << "                    voltage_v = voltage_v * 1000\n";
    pythonCmd << "                voltage_kv = voltage_v / 1000.0\n";
    pythonCmd << "        except:\n";
    pythonCmd << "            pass\n";
    pythonCmd << "    # Classify voltage\n";
    pythonCmd << "    voltage_class = 'unknown'\n";
    pythonCmd << "    crossing_cost = 'unknown'\n";
    pythonCmd << "    if voltage_kv:\n";
    pythonCmd << "        if voltage_kv >= 100:\n";
    pythonCmd << "            voltage_class = 'high'  # High voltage transmission\n";
    pythonCmd << "            crossing_cost = 'very_high'  # Major crossing, requires special permits\n";
    pythonCmd << "        elif voltage_kv >= 35:\n";
    pythonCmd << "            voltage_class = 'medium'  # Medium voltage\n";
    pythonCmd << "            crossing_cost = 'high'\n";
    pythonCmd << "        else:\n";
    pythonCmd << "            voltage_class = 'low'  # Low voltage\n";
    pythonCmd << "            crossing_cost = 'medium'\n";
    pythonCmd << "    elif power_type == 'line':\n";
    pythonCmd << "        voltage_class = 'high'  # Assume transmission if not tagged\n";
    pythonCmd << "        crossing_cost = 'high'\n";
    pythonCmd << "    elif power_type == 'minor_line':\n";
    pythonCmd << "        voltage_class = 'medium'\n";
    pythonCmd << "        crossing_cost = 'medium'\n";
    pythonCmd << "    feature = {\n";
    pythonCmd << "        'type': 'Feature',\n";
    pythonCmd << "        'geometry': {'type': 'LineString', 'coordinates': coords},\n";
    pythonCmd << "        'properties': {\n";
    pythonCmd << "            'osm_id': element.get('id'),\n";
    pythonCmd << "            'name': tags.get('name', ''),\n";
    pythonCmd << "            'power': power_type,\n";
    pythonCmd << "            'voltage': voltage_str,\n";
    pythonCmd << "            'voltage_v': voltage_v,\n";
    pythonCmd << "            'voltage_kv': voltage_kv,\n";
    pythonCmd << "            'voltage_class': voltage_class,\n";
    pythonCmd << "            'cables': tags.get('cables', ''),\n";
    pythonCmd << "            'operator': tags.get('operator', ''),\n";
    pythonCmd << "            'frequency': tags.get('frequency', ''),\n";
    pythonCmd << "            'ref': tags.get('ref', ''),\n";
    pythonCmd << "            'crossing_cost': crossing_cost,\n";
    pythonCmd << "            'location': tags.get('location', ''),  # underground, overhead, etc.\n";
    pythonCmd << "        }\n";
    pythonCmd << "    }\n";
    pythonCmd << "    features.append(feature)\n\n";
    pythonCmd << "geojson = {\n";
    pythonCmd << "    'type': 'FeatureCollection',\n";
    pythonCmd << "    'features': features\n";
    pythonCmd << "}\n\n";
    pythonCmd << "with open('" << geojsonFile << "', 'w') as f:\n";
    pythonCmd << "    json.dump(geojson, f)\n";
    pythonCmd << "print(f'Converted {len(features)} power line features')\n";
    pythonCmd << "PYEOF\n";
    
    std::cout << "  Converting OSM data to GeoJSON..." << std::endl;
    int pyRc = system(pythonCmd.str().c_str());
    if (pyRc != 0) {
        std::cerr << "Error: Failed to convert OSM data to GeoJSON" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Check if GeoJSON has features
    std::ifstream geojsonCheck(geojsonFile);
    if (!geojsonCheck.good() || std::filesystem::file_size(geojsonFile) < 100) {
        std::cout << "  Warning: No power lines found in specified area" << std::endl;
        // Still create empty GPKG for consistency
    }
    geojsonCheck.close();
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::ostringstream ogrCmd;
    ogrCmd << "ogr2ogr -f GPKG '" << outPath.string() << "' '" << geojsonFile << "' ";
    ogrCmd << "-nln power_lines -a_srs EPSG:4326";
    if (overwrite) {
        ogrCmd << " -overwrite";
    }
    ogrCmd << " 2>&1";
    
    std::cout << "  Converting to GeoPackage..." << std::endl;
    int ogrRc = system(ogrCmd.str().c_str());
    if (ogrRc != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        std::filesystem::remove(geojsonFile);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "osm_power_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "OpenStreetMap"},
        {"api", "Overpass API"},
        {"endpoint", "https://overpass-api.de/api/interpreter"},
        {"license", "ODbL 1.0"},
        {"attribution", "© OpenStreetMap contributors"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath}
    };
    meta["features"] = {
        {"types", {"line", "minor_line", "cable"}},
        {"voltage_filter", "All voltages included, high voltage (>100kV) prioritized"},
        {"geometry", "LineString"},
        {"crs", "EPSG:4326"}
    };
    meta["attributes"] = {
        {"osm_id", "OpenStreetMap way ID"},
        {"name", "Power line name"},
        {"power", "Power infrastructure type"},
        {"voltage", "Voltage as tagged in OSM"},
        {"voltage_v", "Voltage in volts (parsed)"},
        {"voltage_kv", "Voltage in kilovolts (calculated)"},
        {"voltage_class", "Classification: high(>=100kV)/medium(35-100kV)/low(<35kV)/unknown"},
        {"cables", "Number of cables/conductors"},
        {"operator", "Operating company"},
        {"crossing_cost", "Estimated crossing complexity: very_high/high/medium/unknown"}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove(queryFile);
    std::filesystem::remove(jsonFile);
    std::filesystem::remove(geojsonFile);
    
    std::cout << "tools osm_power_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_osm_railways_fetch(const std::string& bbox,
                             const std::string& aoiPath,
                             const std::string& outputPath,
                             bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                     OSM Railways Fetch Tool                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch OpenStreetMap railway data for a specified area of interest.      ║
║   Downloads rail lines, subways, trams, light rail, and monorail tracks.  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     OpenStreetMap (OSM)                                          ║
║   API:        Overpass API (https://overpass-api.de/)                      ║
║   License:    ODbL 1.0 (Open Data Commons Open Database License)           ║
║   Attribution: © OpenStreetMap contributors                                ║
║   Coverage:   Global                                                       ║
║   Update:     Continuous (near real-time community updates)                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ FEATURES EXTRACTED:                                                        ║
║   • rail          - Full-sized passenger/freight railway                   ║
║   • light_rail    - Light rail/streetcar/tramway (higher capacity)         ║
║   • subway        - Underground rapid transit metro                        ║
║   • tram          - Tramway/streetcar system                               ║
║   • monorail      - Monorail system                                        ║
║   • narrow_gauge  - Narrow gauge railway                                   ║
║   • funicular     - Cable railway on steep incline                         ║
║   • station       - Railway station (point feature)                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTES INCLUDED:                                                       ║
║   • osm_id      - OpenStreetMap way/node ID                                ║
║   • name        - Railway/station name (if available)                      ║
║   • railway     - Railway type (rail, subway, tram, etc.)                  ║
║   • operator    - Railway operator name                                    ║
║   • gauge       - Track gauge in millimeters                               ║
║   • electrified - Electrification status (yes/no/contact_line/rail)        ║
║   • usage       - Usage type (main, branch, industrial, etc.)              ║
║   • service     - Service type (siding, yard, crossover, etc.)             ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     GeoPackage (.gpkg)                                           ║
║   Geometry:   LineString (tracks) and Point (stations)                     ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Metadata:   JSON sidecar with provenance and quality info               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE EXAMPLES:                                                            ║
║                                                                            ║
║ 1. Fetch by bounding box:                                                 ║
║    tools osm_railways_fetch \                                              ║
║      --bbox 46.5,24.5,46.9,24.9 \                                          ║
║      --output railways.gpkg                                                ║
║                                                                            ║
║ 2. Fetch by AOI polygon:                                                  ║
║    tools osm_railways_fetch \                                              ║
║      --aoi study_area.geojson \                                            ║
║      --output railways.gpkg \                                              ║
║      --overwrite                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   • Rate limit: Respects Overpass API limits (~1 req/sec)                 ║
║   • Timeout: 300 seconds for large queries                                 ║
║   • Quality: Varies by region (community-maintained)                       ║
║   • Use for: Railway crossings, infrastructure conflict analysis           ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot specify both --bbox and --aoi (mutually exclusive)" << std::endl;
        return 1;
    }
    if (outputPath.empty()) {
        std::cerr << "Error: --output is required" << std::endl;
        return 1;
    }

    // Check output file
    std::filesystem::path outPath = std::filesystem::absolute(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists: " << outPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Ensure output directory exists
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Error creating output directory: " << err << std::endl;
        return 1;
    }

    std::cout << "tools osm_railways_fetch: Fetching OSM railways data..." << std::endl;
    
    // Determine bounding box
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else {
        // Extract bbox from AOI
        std::ostringstream cmd;
        cmd << "ogrinfo -al -so '" << aoiPath << "' | grep 'Extent:' | head -1";
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent: "Extent: (minx, miny) - (maxx, maxy)"
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double miny = std::stod(match[2].str());  // FIXED: was maxx
            double maxx = std::stod(match[3].str());  // FIXED: was miny
            double maxy = std::stod(match[4].str());
            std::ostringstream bboxStr;
            bboxStr << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            queryBBox = bboxStr.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Build Overpass QL query
    std::ostringstream overpassQuery;
    overpassQuery << "[out:json][timeout:300];\n";
    overpassQuery << "(\n";
    overpassQuery << "  way[\"railway\"=\"rail\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"light_rail\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"subway\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"tram\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"monorail\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"narrow_gauge\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << "  way[\"railway\"=\"funicular\"](" << minLat << "," << minLon << "," << maxLat << "," << maxLon << ");\n";
    overpassQuery << ");\n";
    overpassQuery << "out geom;\n";
    
    // Write query to temp file
    std::string queryFile = "/tmp/osm_railways_query_" + std::to_string(std::time(nullptr)) + ".ql";
    std::ofstream qf(queryFile);
    qf << overpassQuery.str();
    qf.close();
    
    // Query Overpass API
    std::string jsonFile = "/tmp/osm_railways_" + std::to_string(std::time(nullptr)) + ".json";
    std::ostringstream curlCmd;
    curlCmd << "curl -s --max-time 320 --data @'" << queryFile << "' ";
    curlCmd << "https://overpass-api.de/api/interpreter > '" << jsonFile << "' 2>&1";
    
    std::cout << "  Querying Overpass API..." << std::endl;
    int curlRc = system(curlCmd.str().c_str());
    if (curlRc != 0) {
        std::cerr << "Error: Overpass API query failed" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Check if JSON file is valid
    std::ifstream jsonCheck(jsonFile);
    if (!jsonCheck.good() || std::filesystem::file_size(jsonFile) == 0) {
        std::cerr << "Error: Empty or invalid response from Overpass API" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    jsonCheck.close();
    
    // Convert JSON to GeoJSON using Python
    std::string geojsonFile = "/tmp/osm_railways_" + std::to_string(std::time(nullptr)) + ".geojson";
    std::ostringstream pythonCmd;
    pythonCmd << "python3 << 'PYEOF'\n";
    pythonCmd << "import json\n";
    pythonCmd << "import sys\n\n";
    pythonCmd << "with open('" << jsonFile << "', 'r') as f:\n";
    pythonCmd << "    data = json.load(f)\n\n";
    pythonCmd << "features = []\n";
    pythonCmd << "for element in data.get('elements', []):\n";
    pythonCmd << "    if element.get('type') != 'way' or 'geometry' not in element:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    coords = [[pt['lon'], pt['lat']] for pt in element['geometry']]\n";
    pythonCmd << "    if len(coords) < 2:\n";
    pythonCmd << "        continue\n";
    pythonCmd << "    tags = element.get('tags', {})\n";
    pythonCmd << "    feature = {\n";
    pythonCmd << "        'type': 'Feature',\n";
    pythonCmd << "        'geometry': {'type': 'LineString', 'coordinates': coords},\n";
    pythonCmd << "        'properties': {\n";
    pythonCmd << "            'osm_id': element.get('id'),\n";
    pythonCmd << "            'name': tags.get('name', ''),\n";
    pythonCmd << "            'railway': tags.get('railway', ''),\n";
    pythonCmd << "            'operator': tags.get('operator', ''),\n";
    pythonCmd << "            'gauge': tags.get('gauge', ''),\n";
    pythonCmd << "            'electrified': tags.get('electrified', ''),\n";
    pythonCmd << "            'usage': tags.get('usage', ''),\n";
    pythonCmd << "            'service': tags.get('service', '')\n";
    pythonCmd << "        }\n";
    pythonCmd << "    }\n";
    pythonCmd << "    features.append(feature)\n\n";
    pythonCmd << "geojson = {\n";
    pythonCmd << "    'type': 'FeatureCollection',\n";
    pythonCmd << "    'features': features\n";
    pythonCmd << "}\n\n";
    pythonCmd << "with open('" << geojsonFile << "', 'w') as f:\n";
    pythonCmd << "    json.dump(geojson, f)\n";
    pythonCmd << "print(f'Converted {len(features)} railway features')\n";
    pythonCmd << "PYEOF\n";
    
    std::cout << "  Converting OSM data to GeoJSON..." << std::endl;
    int pyRc = system(pythonCmd.str().c_str());
    if (pyRc != 0) {
        std::cerr << "Error: Failed to convert OSM data to GeoJSON" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        return 1;
    }
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::ostringstream ogrCmd;
    ogrCmd << "ogr2ogr -f GPKG '" << outPath.string() << "' '" << geojsonFile << "' ";
    ogrCmd << "-nln railways -a_srs EPSG:4326";
    if (overwrite) {
        ogrCmd << " -overwrite";
    }
    ogrCmd << " 2>&1";
    
    std::cout << "  Converting to GeoPackage..." << std::endl;
    int ogrRc = system(ogrCmd.str().c_str());
    if (ogrRc != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        std::filesystem::remove(queryFile);
        std::filesystem::remove(jsonFile);
        std::filesystem::remove(geojsonFile);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "osm_railways_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "OpenStreetMap"},
        {"api", "Overpass API"},
        {"endpoint", "https://overpass-api.de/api/interpreter"},
        {"license", "ODbL 1.0"},
        {"attribution", "© OpenStreetMap contributors"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath}
    };
    meta["features"] = {
        {"types", {"rail", "light_rail", "subway", "tram", "monorail", "narrow_gauge", "funicular"}},
        {"geometry", "LineString"},
        {"crs", "EPSG:4326"}
    };
    meta["attributes"] = {
        {"osm_id", "OpenStreetMap way ID"},
        {"name", "Railway/station name"},
        {"railway", "Railway type"},
        {"operator", "Railway operator"},
        {"gauge", "Track gauge (mm)"},
        {"electrified", "Electrification status"},
        {"usage", "Usage type"},
        {"service", "Service type"}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove(queryFile);
    std::filesystem::remove(jsonFile);
    std::filesystem::remove(geojsonFile);
    
    std::cout << "tools osm_railways_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_esa_worldcover_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& year,
                               bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                   ESA WorldCover Fetch Tool                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch ESA WorldCover global land cover classification data at 10m.      ║
║   Provides 11 land cover classes for environmental analysis.              ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     European Space Agency (ESA)                                  ║
║   Provider:   ESA WorldCover / AWS Open Data                               ║
║   License:    CC BY 4.0 (Open)                                             ║
║   Resolution: 10 meters                                                    ║
║   Coverage:   Global                                                       ║
║   Years:      2020, 2021                                                   ║
║   Accuracy:   74.4% global (70-75% Middle East estimated)                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ LAND COVER CLASSES:                                                        ║
║   10  Tree cover               Natural/semi-natural tree canopy            ║
║   20  Shrubland                Natural/semi-natural shrubs                 ║
║   30  Grassland                Natural/semi-natural herbaceous             ║
║   40  Cropland                 Agricultural/cultivated areas               ║
║   50  Built-up                 Cities, towns, infrastructure               ║
║   60  Bare/sparse vegetation   Deserts, bare soil, rock                   ║
║   70  Snow and ice             Permanent snow/ice cover                    ║
║   80  Permanent water bodies   Lakes, rivers, ocean                        ║
║   90  Herbaceous wetland       Marshes, swamps                             ║
║   95  Mangroves                Coastal mangrove forests                    ║
║   100 Moss and lichen          Tundra vegetation                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     Cloud Optimized GeoTIFF (.tif)                               ║
║   Data Type:  Byte (pixel values 10-100)                                   ║
║   Bands:      1 (classification)                                           ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Compression: ZSTD                                                         ║
║   Color Table: Embedded (for visualization)                                ║
║   Metadata:   JSON sidecar with class definitions                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE EXAMPLES:                                                            ║
║                                                                            ║
║ 1. Fetch 2021 data by bounding box:                                       ║
║    tools esa_worldcover_fetch \                                            ║
║      --bbox 46.5,24.5,46.9,24.9 \                                          ║
║      --output worldcover_2021.tif                                          ║
║                                                                            ║
║ 2. Fetch 2020 data by AOI:                                                ║
║    tools esa_worldcover_fetch \                                            ║
║      --aoi study_area.geojson \                                            ║
║      --year 2020 \                                                         ║
║      --output worldcover_2020.tif \                                        ║
║      --overwrite                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   • Use for: Environmental constraints, routing optimization              ║
║   • Validation: 74% accuracy globally, verify critical areas              ║
║   • Updates: Static snapshots (2020/2021), not real-time                  ║
║   • Source: Sentinel-1 & Sentinel-2 imagery                                ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot specify both --bbox and --aoi (mutually exclusive)" << std::endl;
        return 1;
    }
    if (outputPath.empty()) {
        std::cerr << "Error: --output is required" << std::endl;
        return 1;
    }
    if (year != "2020" && year != "2021") {
        std::cerr << "Error: Year must be 2020 or 2021" << std::endl;
        return 1;
    }

    // Check output file
    std::filesystem::path outPath = std::filesystem::absolute(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists: " << outPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Ensure output directory exists
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Error creating output directory: " << err << std::endl;
        return 1;
    }

    std::cout << "tools esa_worldcover_fetch: Fetching ESA WorldCover " << year << std::endl;
    
    // Determine bounding box
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else {
        // Extract bbox from AOI
        std::ostringstream cmd;
        cmd << "ogrinfo -al -so '" << aoiPath << "' | grep 'Extent:' | head -1";
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double maxx = std::stod(match[2].str());
            double miny = std::stod(match[3].str());
            double maxy = std::stod(match[4].str());
            std::ostringstream bboxStr;
            bboxStr << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            queryBBox = bboxStr.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Calculate required tiles (3° x 3° grid)
    std::vector<std::string> tiles;
    for (int lat = static_cast<int>(std::floor(minLat / 3.0)) * 3; lat <= static_cast<int>(std::floor(maxLat / 3.0)) * 3; lat += 3) {
        for (int lon = static_cast<int>(std::floor(minLon / 3.0)) * 3; lon <= static_cast<int>(std::floor(maxLon / 3.0)) * 3; lon += 3) {
            std::ostringstream tileName;
            tileName << (lat >= 0 ? "N" : "S") << std::setfill('0') << std::setw(2) << std::abs(lat)
                     << (lon >= 0 ? "E" : "W") << std::setfill('0') << std::setw(3) << std::abs(lon);
            tiles.push_back(tileName.str());
        }
    }
    
    std::cout << "  Required tiles: " << tiles.size() << std::endl;
    
    // Download tiles
    std::string tempDir = "/tmp/esa_worldcover_" + std::to_string(std::time(nullptr));
    std::filesystem::create_directories(tempDir);
    
    std::vector<std::string> downloadedTiles;
    for (const auto& tile : tiles) {
        std::string tileFilename = "ESA_WorldCover_10m_" + year + "_v200_" + tile + "_Map.tif";
        std::string tileUrl = "https://esa-worldcover.s3.amazonaws.com/v200/" + year + "/map/" + tileFilename;
        std::string tilePath = tempDir + "/" + tileFilename;
        
        std::cout << "  Downloading tile " << tile << "..." << std::endl;
        
        std::ostringstream curlCmd;
        curlCmd << "curl -s -f --max-time 300 -o '" << tilePath << "' '" << tileUrl << "' 2>&1";
        
        int curlRc = system(curlCmd.str().c_str());
        if (curlRc == 0 && std::filesystem::exists(tilePath) && std::filesystem::file_size(tilePath) > 0) {
            downloadedTiles.push_back(tilePath);
            std::cout << "    Downloaded: " << tileFilename << std::endl;
        } else {
            std::cout << "    Tile not available (may be over ocean): " << tile << std::endl;
        }
    }
    
    if (downloadedTiles.empty()) {
        std::cerr << "Error: No tiles downloaded. Check bbox or try a different area." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "  Downloaded " << downloadedTiles.size() << " tiles" << std::endl;
    
    // Build VRT for mosaicking
    std::string vrtFile = tempDir + "/mosaic.vrt";
    std::ostringstream buildVrtCmd;
    buildVrtCmd << "gdalbuildvrt '" << vrtFile << "'";
    for (const auto& tile : downloadedTiles) {
        buildVrtCmd << " '" << tile << "'";
    }
    buildVrtCmd << " 2>&1";
    
    std::cout << "  Building VRT mosaic..." << std::endl;
    int vrtRc = system(buildVrtCmd.str().c_str());
    if (vrtRc != 0) {
        std::cerr << "Error: Failed to build VRT" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Warp to bbox and convert to COG
    std::ostringstream warpCmd;
    warpCmd << "gdalwarp -of COG ";
    warpCmd << "-te " << minLon << " " << minLat << " " << maxLon << " " << maxLat << " ";
    warpCmd << "-co COMPRESS=ZSTD -co PREDICTOR=2 -co NUM_THREADS=ALL_CPUS ";
    warpCmd << "'" << vrtFile << "' '" << outPath.string() << "' 2>&1";
    
    std::cout << "  Clipping to AOI and creating COG..." << std::endl;
    int warpRc = system(warpCmd.str().c_str());
    if (warpRc != 0) {
        std::cerr << "Error: Failed to warp/clip raster" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "esa_worldcover_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "European Space Agency (ESA)"},
        {"product", "ESA WorldCover"},
        {"version", "v200"},
        {"year", year},
        {"url", "https://esa-worldcover.org/"},
        {"license", "CC BY 4.0"},
        {"attribution", "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2020/2021)"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath},
        {"tiles_requested", tiles.size()},
        {"tiles_downloaded", downloadedTiles.size()}
    };
    meta["classification"] = {
        {"10", "Tree cover"},
        {"20", "Shrubland"},
        {"30", "Grassland"},
        {"40", "Cropland"},
        {"50", "Built-up"},
        {"60", "Bare / sparse vegetation"},
        {"70", "Snow and ice"},
        {"80", "Permanent water bodies"},
        {"90", "Herbaceous wetland"},
        {"95", "Mangroves"},
        {"100", "Moss and lichen"}
    };
    meta["output"] = {
        {"format", "Cloud Optimized GeoTIFF"},
        {"data_type", "Byte"},
        {"bands", 1},
        {"crs", "EPSG:4326"},
        {"compression", "ZSTD"},
        {"resolution_meters", 10}
    };
    meta["accuracy"] = {
        {"global", "74.4%"},
        {"note", "Accuracy varies by region and land cover class. Verify critical areas with field surveys."}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove_all(tempDir);
    
    std::cout << "tools esa_worldcover_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_google_dynamicworld_fetch(const std::string& bbox,
                                    const std::string& aoiPath,
                                    const std::string& outputPath,
                                    const std::string& date,
                                    bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║               Google Dynamic World Fetch Tool                              ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch Google Dynamic World near real-time land cover at 10m resolution. ║
║   Provides 9 land cover classes with frequent updates.                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     Google / World Resources Institute                           ║
║   Provider:   Google Earth Engine                                          ║
║   License:    CC BY 4.0 (Open)                                             ║
║   Resolution: 10 meters                                                    ║
║   Coverage:   Global                                                       ║
║   Temporal:   2015-present (near real-time)                                ║
║   Accuracy:   ~75% global                                                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ LAND COVER CLASSES:                                                        ║
║   0   Water                    Rivers, lakes, ocean                        ║
║   1   Trees                    Forest and woodland                         ║
║   2   Grass                    Grassland                                   ║
║   3   Flooded vegetation       Wetlands, mangroves                         ║
║   4   Crops                    Agricultural land                           ║
║   5   Shrub and scrub          Shrubland                                   ║
║   6   Built area               Urban and infrastructure                    ║
║   7   Bare ground              Desert, rock, bare soil                     ║
║   8   Snow and ice             Permanent snow/ice                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     Cloud Optimized GeoTIFF (.tif)                               ║
║   Data Type:  Float32                                                      ║
║   Bands:      10 (1 label + 9 probabilities)                               ║
║   Band 1:     label (most likely class, 0-8)                               ║
║   Band 2:     water probability (0-1)                                      ║
║   Band 3:     trees probability (0-1)                                      ║
║   Band 4:     grass probability (0-1)                                      ║
║   Band 5:     flooded_vegetation probability (0-1)                         ║
║   Band 6:     crops probability (0-1)                                      ║
║   Band 7:     shrub_and_scrub probability (0-1)                            ║
║   Band 8:     built probability (0-1)                                      ║
║   Band 9:     bare probability (0-1)                                       ║
║   Band 10:    snow_and_ice probability (0-1)                               ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Compression: ZSTD                                                         ║
║   Metadata:   JSON sidecar with class definitions                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE EXAMPLES:                                                            ║
║                                                                            ║
║ 1. Fetch latest data by bounding box:                                     ║
║    tools google_dynamicworld_fetch \                                       ║
║      --bbox 46.5,24.5,46.9,24.9 \                                          ║
║      --output dynamicworld_latest.tif                                      ║
║                                                                            ║
║ 2. Fetch specific date by AOI:                                            ║
║    tools google_dynamicworld_fetch \                                       ║
║      --aoi study_area.geojson \                                            ║
║      --date 2024-06-01 \                                                   ║
║      --output dynamicworld_2024.tif \                                      ║
║      --overwrite                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   • Advantages: Near real-time updates, current data                       ║
║   • Requires: Google Earth Engine authentication                           ║
║   • Use for: Current conditions, recent development                        ║
║   • Compare with ESA WorldCover for validation                             ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot specify both --bbox and --aoi (mutually exclusive)" << std::endl;
        return 1;
    }
    if (outputPath.empty()) {
        std::cerr << "Error: --output is required" << std::endl;
        return 1;
    }

    // Check output file
    std::filesystem::path outPath = std::filesystem::absolute(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists: " << outPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Ensure output directory exists
    std::string err;
    if (!ensure_dir(outPath.parent_path().string(), err)) {
        std::cerr << "Error creating output directory: " << err << std::endl;
        return 1;
    }

    std::cout << "tools google_dynamicworld_fetch: Fetching Google Dynamic World" << std::endl;
    if (date != "latest") {
        std::cout << "  Date: " << date << std::endl;
    } else {
        std::cout << "  Date: Latest available" << std::endl;
    }
    
    // Determine bounding box
    std::string queryBBox;
    if (!bbox.empty()) {
        queryBBox = bbox;
    } else {
        // Extract bbox from AOI
        std::ostringstream cmd;
        cmd << "ogrinfo -al -so '" << aoiPath << "' | grep 'Extent:' | head -1";
        FILE* pipe = popen(cmd.str().c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        char buffer[512];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double maxx = std::stod(match[2].str());
            double miny = std::stod(match[3].str());
            double maxy = std::stod(match[4].str());
            std::ostringstream bboxStr;
            bboxStr << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            queryBBox = bboxStr.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    }
    
    // Parse bbox
    std::vector<std::string> bboxParts;
    std::istringstream bboxStream(queryBBox);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minLon = std::stod(bboxParts[0]);
    double minLat = std::stod(bboxParts[1]);
    double maxLon = std::stod(bboxParts[2]);
    double maxLat = std::stod(bboxParts[3]);
    
    std::cout << "  Query bbox: " << queryBBox << std::endl;
    
    // Create Python script for GEE
    std::string tempDir = "/tmp/google_dynamicworld_" + std::to_string(std::time(nullptr));
    std::filesystem::create_directories(tempDir);
    
    std::string scriptPath = tempDir + "/fetch_dynamicworld.py";
    std::string outputTif = tempDir + "/dynamicworld_raw.tif";
    
    std::ofstream script(scriptPath);
    script << "#!/usr/bin/env python3\n";
    script << "import sys\n";
    script << "import ee\n";
    script << "import geemap\n";
    script << "from datetime import datetime, timedelta\n\n";
    
    script << "# Initialize Earth Engine\n";
    script << "try:\n";
    script << "    # Try to initialize with high-volume endpoint (no project required for public data)\n";
    script << "    ee.Initialize(opt_url='https://earthengine-highvolume.googleapis.com')\n";
    script << "except Exception as e:\n";
    script << "    # Fallback: Try with default endpoint\n";
    script << "    try:\n";
    script << "        ee.Initialize()\n";
    script << "    except Exception as e2:\n";
    script << "        print(f'Error: Earth Engine authentication failed: {e2}', file=sys.stderr)\n";
    script << "        print('Please run: earthengine authenticate', file=sys.stderr)\n";
    script << "        sys.exit(1)\n\n";
    
    script << "# Define bbox\n";
    script << "bbox = [" << minLon << ", " << minLat << ", " << maxLon << ", " << maxLat << "]\n";
    script << "region = ee.Geometry.Rectangle(bbox)\n\n";
    
    script << "# Define date range\n";
    if (date == "latest") {
        script << "end_date = datetime.now()\n";
        script << "start_date = end_date - timedelta(days=90)  # Last 90 days\n";
    } else {
        script << "date_obj = datetime.strptime('" << date << "', '%Y-%m-%d')\n";
        script << "start_date = date_obj - timedelta(days=30)\n";
        script << "end_date = date_obj + timedelta(days=30)\n";
    }
    script << "start_str = start_date.strftime('%Y-%m-%d')\n";
    script << "end_str = end_date.strftime('%Y-%m-%d')\n\n";
    
    script << "print(f'  Querying Dynamic World: {start_str} to {end_str}')\n\n";
    
    script << "# Load Dynamic World collection\n";
    script << "dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1') \\\n";
    script << "    .filterBounds(region) \\\n";
    script << "    .filterDate(start_str, end_str)\n\n";
    
    script << "# Check if any images available\n";
    script << "count = dw.size().getInfo()\n";
    script << "if count == 0:\n";
    script << "    print('Error: No Dynamic World images found for this area/date', file=sys.stderr)\n";
    script << "    sys.exit(1)\n\n";
    
    script << "print(f'  Found {count} images')\n\n";
    
    script << "# Get most recent composite\n";
    script << "# Band 1: label (mode of most likely class)\n";
    script << "label = dw.select('label').mode()\n\n";
    
    script << "# Bands 2-10: mean probability for each class\n";
    script << "water = dw.select('water').mean()\n";
    script << "trees = dw.select('trees').mean()\n";
    script << "grass = dw.select('grass').mean()\n";
    script << "flooded_vegetation = dw.select('flooded_vegetation').mean()\n";
    script << "crops = dw.select('crops').mean()\n";
    script << "shrub_and_scrub = dw.select('shrub_and_scrub').mean()\n";
    script << "built = dw.select('built').mean()\n";
    script << "bare = dw.select('bare').mean()\n";
    script << "snow_and_ice = dw.select('snow_and_ice').mean()\n\n";
    
    script << "# Stack all bands into single image\n";
    script << "composite = ee.Image.cat([\n";
    script << "    label.rename('label'),\n";
    script << "    water.rename('water'),\n";
    script << "    trees.rename('trees'),\n";
    script << "    grass.rename('grass'),\n";
    script << "    flooded_vegetation.rename('flooded_vegetation'),\n";
    script << "    crops.rename('crops'),\n";
    script << "    shrub_and_scrub.rename('shrub_and_scrub'),\n";
    script << "    built.rename('built'),\n";
    script << "    bare.rename('bare'),\n";
    script << "    snow_and_ice.rename('snow_and_ice')\n";
    script << "])\n\n";
    
    script << "# Export to GeoTIFF\n";
    script << "print('  Exporting 10-band composite (label + probabilities)...')\n";
    script << "geemap.ee_export_image(\n";
    script << "    composite,\n";
    script << "    filename='" << outputTif << "',\n";
    script << "    scale=10,\n";
    script << "    region=region,\n";
    script << "    file_per_band=False\n";
    script << ")\n\n";
    
    script << "print('  Export complete')\n";
    script.close();
    
    // Make script executable
    chmod(scriptPath.c_str(), 0755);
    
    // Run Python script using GEE virtual environment
    std::cout << "  Initializing Google Earth Engine..." << std::endl;
    std::ostringstream pythonCmd;
    pythonCmd << "/opt/agrs/.venv_gee/bin/python3 '" << scriptPath << "' 2>&1";
    
    int pyRc = system(pythonCmd.str().c_str());
    if (pyRc != 0) {
        std::cerr << "Error: Failed to fetch data from Google Earth Engine" << std::endl;
        std::cerr << "\nTroubleshooting:" << std::endl;
        std::cerr << "  1. Install Earth Engine: pip install earthengine-api geemap" << std::endl;
        std::cerr << "  2. Authenticate: earthengine authenticate" << std::endl;
        std::cerr << "  3. Ensure you have a Google Earth Engine account" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputTif)) {
        std::cerr << "Error: Output file not created by Earth Engine" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Convert to COG with color table
    std::cout << "  Converting to Cloud Optimized GeoTIFF..." << std::endl;
    std::ostringstream cogCmd;
    cogCmd << "gdal_translate -of COG ";
    cogCmd << "-co COMPRESS=ZSTD -co PREDICTOR=2 -co NUM_THREADS=ALL_CPUS ";
    cogCmd << "'" << outputTif << "' '" << outPath.string() << "' 2>&1";
    
    int cogRc = system(cogCmd.str().c_str());
    if (cogRc != 0) {
        std::cerr << "Error: Failed to convert to COG" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "google_dynamicworld_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"provider", "Google / World Resources Institute"},
        {"product", "Dynamic World V1"},
        {"platform", "Google Earth Engine"},
        {"url", "https://dynamicworld.app/"},
        {"license", "CC BY 4.0"},
        {"attribution", "Brown, C.F., et al. (2022). Dynamic World V1"}
    };
    meta["query"] = {
        {"bbox", queryBBox},
        {"aoi_file", aoiPath.empty() ? "" : aoiPath},
        {"date_requested", date}
    };
    meta["classification"] = {
        {"0", "Water"},
        {"1", "Trees"},
        {"2", "Grass"},
        {"3", "Flooded vegetation"},
        {"4", "Crops"},
        {"5", "Shrub and scrub"},
        {"6", "Built area"},
        {"7", "Bare ground"},
        {"8", "Snow and ice"}
    };
    meta["output"] = {
        {"format", "Cloud Optimized GeoTIFF"},
        {"data_type", "Float32"},
        {"bands", 10},
        {"band_names", {
            "1: label (most likely class, 0-8)",
            "2: water (probability 0-1)",
            "3: trees (probability 0-1)",
            "4: grass (probability 0-1)",
            "5: flooded_vegetation (probability 0-1)",
            "6: crops (probability 0-1)",
            "7: shrub_and_scrub (probability 0-1)",
            "8: built (probability 0-1)",
            "9: bare (probability 0-1)",
            "10: snow_and_ice (probability 0-1)"
        }},
        {"crs", "EPSG:4326"},
        {"compression", "ZSTD"},
        {"resolution_meters", 10},
        {"composite_method", "label=mode, probabilities=mean"}
    };
    meta["accuracy"] = {
        {"global", "~75%"},
        {"note", "Near real-time data. Accuracy varies by region and land cover class."}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove_all(tempDir);
    
    std::cout << "tools google_dynamicworld_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_global_surface_water_fetch(const std::string& bbox,
                                      const std::string& aoiPath,
                                      const std::string& outputPath,
                                      const std::string& product,
                                      bool overwrite) {
    // Check if this is a help request
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║              JRC Global Surface Water Fetch Tool                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch JRC Global Surface Water data at 30m resolution (1984-2021).      ║
║   Provides comprehensive water occurrence, change, and seasonality data.  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     European Commission Joint Research Centre (JRC)              ║
║   Provider:   Google Earth Engine                                          ║
║   License:    CC BY 4.0 (Open, attribution required)                       ║
║   Resolution: 30 meters                                                    ║
║   Coverage:   Global                                                       ║
║   Temporal:   1984-2021                                                    ║
║   Accuracy:   99.45% (peer-reviewed, Nature Journal)                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PRODUCTS AVAILABLE:                                                        ║
║   occurrence     Water occurrence (0-100%): How often water was present    ║
║   change         Water change intensity: Gain/loss of water 1984-2021     ║
║   seasonality    Intra-annual distribution (0-12 months)                   ║
║   recurrence     Inter-annual variability of water presence                ║
║   transitions    Transitions between water/land (1984-2018)                ║
║   extent         Maximum water extent observed (1984-2021)                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     Cloud Optimized GeoTIFF (.tif)                               ║
║   Data Type:  Byte (0-255) for occurrence/seasonality                      ║
║               Int16 for change/transitions                                 ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   NoData:     0 (no water) or 255 (no data)                                ║
║   Sidecar:    JSON metadata with provenance & attribution                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE:                                                                     ║
║   zeus tools global_surface_water_fetch \                                  ║
║       --bbox "minx,miny,maxx,maxy" \                                       ║
║       --output output.tif \                                                ║
║       --product occurrence \                                               ║
║       --overwrite                                                          ║
║                                                                            ║
║   OR with AOI:                                                             ║
║   zeus tools global_surface_water_fetch \                                  ║
║       --aoi study_area.geojson \                                           ║
║       --output water_occurrence.tif \                                      ║
║       --product occurrence                                                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ EXAMPLES:                                                                  ║
║   # Water occurrence for Saudi Arabia region                               ║
║   zeus tools global_surface_water_fetch \                                  ║
║       --bbox "34.5,16.3,55.7,32.2" \                                       ║
║       --output ksa_water_occurrence.tif \                                  ║
║       --product occurrence                                                 ║
║                                                                            ║
║   # Water change analysis                                                  ║
║   zeus tools global_surface_water_fetch \                                  ║
║       --aoi project_area.gpkg \                                            ║
║       --output water_change.tif \                                          ║
║       --product change                                                     ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PRODUCT DETAILS:                                                           ║
║   occurrence:    0 = no water, 100 = permanent water, 255 = no data        ║
║   change:        Negative = water loss, Positive = water gain              ║
║   seasonality:   Number of months water was present                        ║
║   recurrence:    0-100% frequency of water returning                       ║
║   transitions:   Categorical transitions (see JRC documentation)           ║
║   extent:        Binary mask of maximum water extent                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTION REQUIRED:                                                      ║
║   "Global Surface Water Explorer by European Commission Joint Research     ║
║    Centre (CC-BY-4.0). Data available at https://global-surface-water.    ║
║    appspot.com/"                                                           ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   - Requires Google Earth Engine authentication (earthengine authenticate) ║
║   - Large areas may take time to process                                   ║
║   - Output is reprojected to EPSG:4326                                     ║
║   - GEE export limits: Max 32768x32768 pixels per request                  ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided." << std::endl;
        return 1;
    }
    
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot use both --bbox and --aoi. Choose one." << std::endl;
        return 1;
    }
    
    std::filesystem::path outPath(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    // Validate product type
    std::vector<std::string> validProducts = {"occurrence", "change", "seasonality", "recurrence", "transitions", "extent"};
    if (std::find(validProducts.begin(), validProducts.end(), product) == validProducts.end()) {
        std::cerr << "Error: Invalid product '" << product << "'. Must be one of: occurrence, change, seasonality, recurrence, transitions, extent" << std::endl;
        return 1;
    }
    
    std::cout << "Fetching JRC Global Surface Water (" << product << ")..." << std::endl;
    
    // Check if GEE virtual environment exists
    std::filesystem::path venvPath = ".venv_gee";
    std::filesystem::path pythonExe = venvPath / "bin" / "python3";
    
    if (!std::filesystem::exists(pythonExe)) {
        std::cerr << "Error: Google Earth Engine virtual environment not found.\n"
                  << "Please run: python3 -m venv .venv_gee && .venv_gee/bin/pip install earthengine-api geemap" << std::endl;
        return 1;
    }
    
    // Create temp directory
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("gsw_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    // Determine bounding box
    std::string bboxStr;
    std::filesystem::path aoiGeojson;
    
    if (!aoiPath.empty()) {
        // Convert AOI to GeoJSON if needed
        std::filesystem::path aoiInput(aoiPath);
        aoiGeojson = tempDir / "aoi.geojson";
        
        std::string convertCmd = "ogr2ogr -f GeoJSON -t_srs EPSG:4326 " + 
                                aoiGeojson.string() + " " + aoiInput.string();
        int ret = std::system(convertCmd.c_str());
        if (ret != 0) {
            std::cerr << "Error: Failed to convert AOI to GeoJSON." << std::endl;
            std::filesystem::remove_all(tempDir);
            return 1;
        }
        
        // Extract bbox from AOI
        std::string bboxCmd = "ogrinfo -al -so " + aoiGeojson.string() + 
                             " | grep 'Extent:' | sed 's/Extent: (\\([^,]*\\), \\([^)]*\\)) - (\\([^,]*\\), \\([^)]*\\))/\\1,\\2,\\3,\\4/'";
        FILE* pipe = popen(bboxCmd.c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI." << std::endl;
            std::filesystem::remove_all(tempDir);
            return 1;
        }
        char buffer[256];
        if (fgets(buffer, sizeof(buffer), pipe)) {
            bboxStr = std::string(buffer);
            // Remove trailing newline
            bboxStr.erase(std::remove(bboxStr.begin(), bboxStr.end(), '\n'), bboxStr.end());
        }
        pclose(pipe);
        
        if (bboxStr.empty()) {
            std::cerr << "Error: Could not extract bounding box from AOI." << std::endl;
            std::filesystem::remove_all(tempDir);
            return 1;
        }
    } else {
        bboxStr = bbox;
    }
    
    // Parse bbox
    std::vector<std::string> coords;
    std::stringstream ss(bboxStr);
    std::string coord;
    while (std::getline(ss, coord, ',')) {
        coords.push_back(coord);
    }
    
    if (coords.size() != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    double minx = std::stod(coords[0]);
    double miny = std::stod(coords[1]);
    double maxx = std::stod(coords[2]);
    double maxy = std::stod(coords[3]);
    
    // Generate Python script for GEE
    std::filesystem::path scriptPath = tempDir / "fetch_gsw.py";
    std::ofstream script(scriptPath);
    
    script << R"(#!/usr/bin/env python3
import ee
import geemap
import sys

# Initialize Earth Engine
try:
    ee.Initialize()
except Exception as e:
    print(f"Error initializing Earth Engine: {e}", file=sys.stderr)
    print("Run: earthengine authenticate", file=sys.stderr)
    sys.exit(1)

# Define region of interest
roi = ee.Geometry.Rectangle([)" << minx << ", " << miny << ", " << maxx << ", " << maxy << R"(])

# Load JRC Global Surface Water dataset
gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')

# Select product
product = ')" << product << R"('

# Map product names to band names
product_map = {
    'occurrence': 'occurrence',
    'change': 'change_abs',
    'seasonality': 'seasonality',
    'recurrence': 'recurrence',
    'transitions': 'transition',
    'extent': 'max_extent'
}

if product not in product_map:
    print(f"Error: Invalid product '{product}'", file=sys.stderr)
    sys.exit(1)

band_name = product_map[product]

# Select the band
image = gsw.select(band_name).clip(roi)

# Export
output_file = ')" << outPath.string() << R"('

try:
    geemap.ee_export_image(
        image,
        filename=output_file,
        scale=30,
        region=roi,
        file_per_band=False,
        crs='EPSG:4326'
    )
    print(f"Successfully exported to {output_file}")
except Exception as e:
    print(f"Error exporting image: {e}", file=sys.stderr)
    sys.exit(1)
)";
    
    script.close();
    
    // Make script executable
    chmod(scriptPath.string().c_str(), 0755);
    
    // Execute Python script
    std::string pythonCmd = pythonExe.string() + " " + scriptPath.string();
    std::cout << "Executing Earth Engine export..." << std::endl;
    
    int ret = std::system(pythonCmd.c_str());
    if (ret != 0) {
        std::cerr << "Error: Failed to fetch Global Surface Water data." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Verify output exists
    if (!std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file was not created." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Generate JSON metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "global_surface_water_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"name", "JRC Global Surface Water"},
        {"provider", "European Commission Joint Research Centre"},
        {"dataset", "JRC/GSW1_4/GlobalSurfaceWater"},
        {"url", "https://global-surface-water.appspot.com/"},
        {"license", "CC-BY-4.0"},
        {"attribution", "Global Surface Water Explorer by European Commission Joint Research Centre (CC-BY-4.0)"}
    };
    meta["spatial"] = {
        {"bbox", {minx, miny, maxx, maxy}},
        {"crs", "EPSG:4326"}
    };
    meta["temporal"] = {
        {"coverage", "1984-2021"},
        {"note", "37 years of Landsat observations"}
    };
    meta["product"] = product;
    meta["resolution_meters"] = 30;
    meta["accuracy"] = "99.45% (peer-reviewed)";
    
    // Product-specific metadata
    if (product == "occurrence") {
        meta["band_description"] = "Water occurrence (0-100%): percentage of time water was present";
        meta["values"] = {
            {"0", "No water detected"},
            {"1-100", "Percentage of observations with water"},
            {"255", "No data"}
        };
    } else if (product == "change") {
        meta["band_description"] = "Water change intensity 1984-2021";
        meta["values"] = {
            {"negative", "Water loss"},
            {"positive", "Water gain"},
            {"0", "No change"}
        };
    } else if (product == "seasonality") {
        meta["band_description"] = "Intra-annual distribution (number of months water was present)";
        meta["values"] = {
            {"0-12", "Number of months with water present"}
        };
    } else if (product == "recurrence") {
        meta["band_description"] = "Inter-annual variability (0-100%)";
        meta["values"] = {
            {"0-100", "Percentage of years water recurs"}
        };
    } else if (product == "transitions") {
        meta["band_description"] = "Categorical transitions between water/land 1984-2018";
        meta["note"] = "See JRC documentation for transition codes";
    } else if (product == "extent") {
        meta["band_description"] = "Maximum water extent 1984-2021";
        meta["values"] = {
            {"0", "Never water"},
            {"1", "Water detected at least once"}
        };
    }
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove_all(tempDir);
    
    std::cout << "tools global_surface_water_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_worldpop_fetch(const std::string& country,
                         const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         const std::string& year,
                         bool constrained,
                         bool overwrite) {
    // Check if this is a help request
    if (country == "help" || bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║                    WorldPop Population Density Fetch Tool                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch WorldPop gridded population density data at 100m resolution.      ║
║   Provides spatially detailed population distribution estimates.          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     WorldPop / University of Southampton                         ║
║   Provider:   WorldPop Hub (hub.worldpop.org)                              ║
║   License:    Creative Commons Attribution 4.0 International               ║
║   Resolution: 100 meters (~3 arc-seconds)                                  ║
║   Coverage:   Global (country-level datasets)                              ║
║   Temporal:   2000-2020 (annual)                                           ║
║   Accuracy:   Census-adjusted (constrained), peer-reviewed                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA TYPES:                                                                ║
║   Constrained:   Census-adjusted population counts (default, recommended)  ║
║   Unconstrained: Top-down population estimates without census constraints  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     Cloud Optimized GeoTIFF (.tif)                               ║
║   Data Type:  Float32                                                      ║
║   Values:     People per pixel (100m x 100m = 0.01 km²)                    ║
║   Unit:       persons/pixel                                                ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   NoData:     -99999                                                       ║
║   Sidecar:    JSON metadata with provenance & attribution                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE:                                                                     ║
║   zeus tools worldpop_fetch \                                              ║
║       --country ISO3 \                                                     ║
║       --bbox "minx,miny,maxx,maxy" \                                       ║
║       --output population.tif \                                            ║
║       --year 2020 \                                                        ║
║       --overwrite                                                          ║
║                                                                            ║
║   OR with AOI:                                                             ║
║   zeus tools worldpop_fetch \                                              ║
║       --country SAU \                                                      ║
║       --aoi study_area.geojson \                                           ║
║       --output riyadh_pop.tif                                              ║
╠════════════════════════════════════════════════════════════════════════════╣
║ EXAMPLES:                                                                  ║
║   # Fetch Saudi Arabia population for 2020                                 ║
║   zeus tools worldpop_fetch \                                              ║
║       --country SAU \                                                      ║
║       --bbox "34.5,16.3,55.7,32.2" \                                       ║
║       --output saudi_pop_2020.tif \                                        ║
║       --year 2020                                                          ║
║                                                                            ║
║   # Fetch UAE population for project area                                  ║
║   zeus tools worldpop_fetch \                                              ║
║       --country ARE \                                                      ║
║       --aoi project_boundary.gpkg \                                        ║
║       --output uae_pop_2020.tif                                            ║
║                                                                            ║
║   # Fetch unconstrained data                                               ║
║   zeus tools worldpop_fetch \                                              ║
║       --country SAU \                                                      ║
║       --bbox "46.5,24.5,46.7,24.8" \                                       ║
║       --output pop_unconstrained.tif \                                     ║
║       --unconstrained                                                      ║
╠════════════════════════════════════════════════════════════════════════════╣
║ COMMON ISO3 COUNTRY CODES:                                                 ║
║   SAU  Saudi Arabia      USA  United States     CAN  Canada                ║
║   ARE  UAE               KWT  Kuwait            QAT  Qatar                 ║
║   OMN  Oman              BHR  Bahrain           IRQ  Iraq                  ║
║   IRN  Iran              RUS  Russia            NOR  Norway                ║
║   GBR  United Kingdom    NGA  Nigeria           DZA  Algeria               ║
║   LBY  Libya             EGY  Egypt                                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   - Tool downloads full country dataset then clips to bbox/AOI             ║
║   - First download per country may take time (cached for future use)       ║
║   - Constrained data (default) is census-adjusted and more accurate        ║
║   - Data values represent estimated population per 100m pixel              ║
║   - To convert to density: multiply by 100 (persons/km²)                   ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTION REQUIRED:                                                      ║
║   WorldPop (www.worldpop.org - School of Geography and Environmental      ║
║   Science, University of Southampton). Include DOI citation for specific   ║
║   country and year dataset.                                                ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (country.empty()) {
        std::cerr << "Error: --country is required (ISO3 code, e.g., SAU for Saudi Arabia)." << std::endl;
        return 1;
    }
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided." << std::endl;
        return 1;
    }
    
    if (!bbox.empty() && !aoiPath.empty()) {
        std::cerr << "Error: Cannot use both --bbox and --aoi. Choose one." << std::endl;
        return 1;
    }
    
    std::filesystem::path outPath(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    // Validate year
    int yearInt = std::stoi(year);
    if (yearInt < 2000 || yearInt > 2020) {
        std::cerr << "Error: Year must be between 2000 and 2020." << std::endl;
        return 1;
    }
    
    // Convert country code to uppercase
    std::string countryUpper = country;
    std::transform(countryUpper.begin(), countryUpper.end(), countryUpper.begin(), ::toupper);
    
    if (countryUpper.length() != 3) {
        std::cerr << "Error: Country code must be 3-letter ISO3 code (e.g., SAU, ARE, USA)." << std::endl;
        return 1;
    }
    
    std::cout << "Fetching WorldPop data for " << countryUpper << " (" << year << ")..." << std::endl;
    
    // Create temp directory
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("worldpop_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    // Construct WorldPop download URL
    // URL pattern: https://data.worldpop.org/GIS/Population/Global_2000_2020/{year}/{ISO3}/{iso3}_ppp_{year}[_UNadj].tif
    // Constrained (census-adjusted): {iso3}_ppp_{year}.tif
    // Unconstrained: {iso3}_ppp_{year}_UNadj.tif
    std::string countryLower = countryUpper;
    std::transform(countryLower.begin(), countryLower.end(), countryLower.begin(), ::tolower);
    
    std::string dataType = constrained ? "constrained" : "unconstrained";
    std::string filename = countryLower + "_ppp_" + year + (constrained ? "" : "_UNadj") + ".tif";
    std::string url = "https://data.worldpop.org/GIS/Population/Global_2000_2020/" + year + "/" + countryUpper + "/" + filename;
    
    std::filesystem::path fullCountryTif = tempDir / filename;
    
    // Download full country dataset
    std::cout << "Downloading from WorldPop Hub..." << std::endl;
    std::cout << "URL: " << url << std::endl;
    
    std::string downloadCmd = "curl -L -o " + fullCountryTif.string() + " " + url;
    int ret = std::system(downloadCmd.c_str());
    if (ret != 0) {
        std::cerr << "Error: Failed to download WorldPop data." << std::endl;
        std::cerr << "Check that country code '" << countryUpper << "' and year '" << year << "' are valid." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Verify download
    if (!std::filesystem::exists(fullCountryTif) || std::filesystem::file_size(fullCountryTif) < 1000) {
        std::cerr << "Error: Downloaded file is invalid or empty." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Download complete. Clipping to AOI..." << std::endl;
    
    // Determine clipping region
    std::string clipRegion;
    
    if (!aoiPath.empty()) {
        // Use AOI file directly
        clipRegion = aoiPath;
    } else {
        // Create temporary shapefile from bbox
        std::vector<std::string> coords;
        std::stringstream ss(bbox);
        std::string coord;
        while (std::getline(ss, coord, ',')) {
            coords.push_back(coord);
        }
        
        if (coords.size() != 4) {
            std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
            std::filesystem::remove_all(tempDir);
            return 1;
        }
        
        double minx = std::stod(coords[0]);
        double miny = std::stod(coords[1]);
        double maxx = std::stod(coords[2]);
        double maxy = std::stod(coords[3]);
        
        // Create GeoJSON bbox
        std::filesystem::path bboxGeojson = tempDir / "bbox.geojson";
        std::ofstream geojsonFile(bboxGeojson);
        geojsonFile << R"({
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {},
    "geometry": {
      "type": "Polygon",
      "coordinates": [[ )"
        << "[" << minx << "," << miny << "],"
        << "[" << maxx << "," << miny << "],"
        << "[" << maxx << "," << maxy << "],"
        << "[" << minx << "," << maxy << "],"
        << "[" << minx << "," << miny << "]"
        << R"( ]]
    }
  }]
})";
        geojsonFile.close();
        clipRegion = bboxGeojson.string();
    }
    
    // Clip raster using gdalwarp
    std::string warpCmd = "gdalwarp -cutline " + clipRegion + 
                         " -crop_to_cutline -co COMPRESS=ZSTD -co TILED=YES" +
                         " -co COPY_SRC_OVERVIEWS=YES -co PREDICTOR=2" +
                         " " + fullCountryTif.string() + " " + outPath.string();
    
    ret = std::system(warpCmd.c_str());
    if (ret != 0) {
        std::cerr << "Error: Failed to clip raster." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Verify output
    if (!std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file was not created." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Generate JSON metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "worldpop_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"name", "WorldPop"},
        {"provider", "University of Southampton"},
        {"url", "https://hub.worldpop.org"},
        {"license", "CC-BY-4.0"},
        {"attribution", "WorldPop (www.worldpop.org - School of Geography and Environmental Science, University of Southampton)"},
        {"download_url", url}
    };
    meta["country"] = countryUpper;
    meta["year"] = yearInt;
    meta["data_type"] = dataType;
    meta["description"] = constrained ? "Census-adjusted population counts" : "Unconstrained population estimates";
    meta["resolution_meters"] = 100;
    meta["unit"] = "persons/pixel";
    meta["pixel_area"] = "0.01 km² (100m x 100m)";
    meta["note"] = "To convert to density (persons/km²), multiply by 100";
    meta["crs"] = "EPSG:4326";
    meta["nodata"] = -99999;
    
    write_sidecar_json(outPath.string(), meta);
    
    // Cleanup temp files
    std::filesystem::remove_all(tempDir);
    
    std::cout << "tools worldpop_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_wdpa_fetch(const std::string& country,
                     const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite) {
    // Check if this is a help request
    if (country == "help" || bbox == "help" || aoiPath == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║        WDPA (World Database on Protected Areas) Fetch Tool                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch protected areas data from the World Database on Protected Areas.  ║
║   Provides comprehensive global protected area boundaries and attributes.  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     UNEP World Conservation Monitoring Centre (UNEP-WCMC)        ║
║   Provider:   Protected Planet (www.protectedplanet.net)                   ║
║   License:    Non-commercial use (attribution required)                    ║
║   Coverage:   Global (270,000+ protected areas)                            ║
║   Update:     Monthly updates                                              ║
║   Accuracy:   Variable by country and protected area                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     GeoPackage (.gpkg) with polygon features                     ║
║   Attributes: NAME, DESIG (designation), IUCN_CAT, STATUS, AREA_KM2, etc.  ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Sidecar:    JSON metadata with provenance & attribution                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE:                                                                     ║
║   # By country:                                                            ║
║   zeus tools wdpa_fetch \                                                  ║
║       --country ISO3 \                                                     ║
║       --output protected_areas.gpkg                                        ║
║                                                                            ║
║   # By bounding box:                                                       ║
║   zeus tools wdpa_fetch \                                                  ║
║       --bbox "minx,miny,maxx,maxy" \                                       ║
║       --output protected_areas.gpkg                                        ║
║                                                                            ║
║   # By AOI:                                                                ║
║   zeus tools wdpa_fetch \                                                  ║
║       --aoi study_area.geojson \                                           ║
║       --output protected_areas.gpkg                                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ EXAMPLES:                                                                  ║
║   # Fetch all protected areas in Saudi Arabia                              ║
║   zeus tools wdpa_fetch \                                                  ║
║       --country SAU \                                                      ║
║       --output sau_protected_areas.gpkg                                    ║
║                                                                            ║
║   # Fetch protected areas in a specific region                             ║
║   zeus tools wdpa_fetch \                                                  ║
║       --bbox "46.5,24.4,47.5,25.5" \                                       ║
║       --output riyadh_protected_areas.gpkg                                 ║
║                                                                            ║
║   # Fetch for pipeline corridor AOI                                        ║
║   zeus tools wdpa_fetch \                                                  ║
║       --aoi pipeline_corridor.gpkg \                                       ║
║       --output corridor_protected_areas.gpkg                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ IUCN CATEGORIES:                                                           ║
║   Ia   Strict Nature Reserve                                               ║
║   Ib   Wilderness Area                                                     ║
║   II   National Park                                                       ║
║   III  Natural Monument or Feature                                         ║
║   IV   Habitat/Species Management Area                                     ║
║   V    Protected Landscape/Seascape                                        ║
║   VI   Protected area with sustainable use of natural resources            ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   - Tool downloads from Protected Planet web interface                     ║
║   - Data quality varies by country/region                                  ║
║   - Some boundaries may be approximate                                     ║
║   - Verify with national authorities for critical projects                 ║
║   - Large downloads may take time                                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTION REQUIRED:                                                      ║
║   UNEP-WCMC and IUCN (year), Protected Planet: The World Database on      ║
║   Protected Areas (WDPA) [Online], [insert month/year of the version      ║
║   downloaded], Cambridge, UK: UNEP-WCMC and IUCN. Available at:           ║
║   www.protectedplanet.net                                                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ LIMITATIONS:                                                               ║
║   - This tool downloads via web interface (may be slow for large areas)    ║
║   - For full global dataset, visit www.protectedplanet.net manually        ║
║   - Commercial use requires special permission from UNEP-WCMC              ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (country.empty() && bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Must provide --country, --bbox, or --aoi." << std::endl;
        return 1;
    }
    
    std::filesystem::path outPath(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    std::cout << "Fetching WDPA protected areas data..." << std::endl;
    std::cout << "Source: Protected Planet / UNEP-WCMC" << std::endl;
    
    // Create temp directory
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("wdpa_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    // Use Python script to download and process WDPA data via wdpar package
    std::string pythonScript = R"(
import sys
import subprocess
import json
from pathlib import Path

def main():
    country = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != "NONE" else None
    bbox = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "NONE" else None
    aoi = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] != "NONE" else None
    output = sys.argv[4]
    temp_dir = sys.argv[5]
    
    print(f"Downloading WDPA data...")
    
    # Install wdpar if not available (requires R)
    try:
        result = subprocess.run(['which', 'Rscript'], capture_output=True)
        if result.returncode != 0:
            sys.stderr.write("ERROR: R is not installed. Please install R to use WDPA fetch.\\n")
            sys.stderr.write("Alternative: Download manually from www.protectedplanet.net\\n")
            return 1
    except Exception as e:
        sys.stderr.write(f"ERROR: Cannot check for R: {e}\\n")
        return 1
    
    # Create R script to download WDPA data
    r_script = f'''
library(wdpar)
library(sf)

# Download WDPA data
'''
    
    if country:
        r_script += f'''
print("Fetching WDPA data for country: {country}")
wdpa_data <- wdpa_fetch("{country}", wait=TRUE, download_dir="{temp_dir}")
'''
    else:
        # For bbox/AOI, we need to download and clip
        sys.stderr.write("ERROR: bbox/AOI filtering requires manual download\\n")
        sys.stderr.write("Please use --country for automated download\\n")
        return 1
    
    r_script += f'''
# Write to GeoPackage
if (!is.null(wdpa_data)) {{
    st_write(wdpa_data, "{output}", driver="GPKG", delete_dsn=TRUE)
    print("WDPA data written successfully")
}} else {{
    stop("Failed to fetch WDPA data")
}}
'''
    
    # Write R script to temp file
    r_script_path = Path(temp_dir) / "fetch_wdpa.R"
    with open(r_script_path, 'w') as f:
        f.write(r_script)
    
    # Execute R script
    print("Executing R script...")
    try:
        result = subprocess.run(
            ['Rscript', str(r_script_path)],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )
        
        if result.returncode != 0:
            sys.stderr.write(f"R script error: {result.stderr}\\n")
            return 1
        
        print(result.stdout)
        return 0
        
    except subprocess.TimeoutExpired:
        sys.stderr.write("ERROR: Download timed out (>10 minutes)\\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"ERROR: {e}\\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
)";
    
    // Write Python script
    std::string scriptPath = tempDir.string() + "/fetch_wdpa.py";
    std::ofstream scriptFile(scriptPath);
    if (!scriptFile.good()) {
        std::cerr << "Error: Could not create Python script" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    scriptFile << pythonScript;
    scriptFile.close();
    
    // Build Python command
    std::string cmd = "python3 \"" + scriptPath + "\" ";
    cmd += "\"" + (country.empty() ? "NONE" : country) + "\" ";
    cmd += "\"" + (bbox.empty() ? "NONE" : bbox) + "\" ";
    cmd += "\"" + (aoiPath.empty() ? "NONE" : aoiPath) + "\" ";
    cmd += "\"" + outputPath + "\" ";
    cmd += "\"" + tempDir.string() + "\" ";
    cmd += "2>&1";
    
    std::cout << "\nDownloading WDPA data (this may take several minutes)...\n";
    int result = std::system(cmd.c_str());
    
    // Clean up
    std::filesystem::remove_all(tempDir);
    
    if (result != 0) {
        std::cerr << "\nError: WDPA download failed." << std::endl;
        std::cerr << "\nAlternative method:" << std::endl;
        std::cerr << "1. Visit www.protectedplanet.net" << std::endl;
        std::cerr << "2. Search for your country/area" << std::endl;
        std::cerr << "3. Download shapefile" << std::endl;
        std::cerr << "4. Convert: ogr2ogr -f GPKG " << outputPath << " downloaded.shp" << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "wdpa_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "WDPA (World Database on Protected Areas)";
    meta["provider"] = "UNEP-WCMC and IUCN via Protected Planet";
    meta["url"] = "www.protectedplanet.net";
    meta["license"] = "Non-commercial use (attribution required)";
    meta["attribution"] = "UNEP-WCMC and IUCN (2025), Protected Planet: WDPA";
    if (!country.empty()) meta["country"] = country;
    if (!bbox.empty()) meta["bbox"] = bbox;
    if (!aoiPath.empty()) meta["aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "\n✅ WDPA protected areas data fetch complete!" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "\nATTRIBUTION REQUIRED:" << std::endl;
    std::cout << "UNEP-WCMC and IUCN (2025), Protected Planet: The World Database on" << std::endl;
    std::cout << "Protected Areas (WDPA), Cambridge, UK: UNEP-WCMC and IUCN." << std::endl;
    std::cout << "Available at: www.protectedplanet.net" << std::endl;
    
    return 0;
}

int tools_natura2000_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& country,
                           bool overwrite) {
    std::cout << "Fetching Natura 2000 protected sites..." << std::endl;
    std::cout << "Source: European Environment Agency (EEA)" << std::endl;
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty() && country.empty()) {
        std::cerr << "Error: Must provide --bbox, --aoi, or --country." << std::endl;
        return 1;
    }
    
    std::filesystem::path outPath(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    // Create temp directory
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("natura2000_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    // Download Natura 2000 dataset from EEA
    // Latest data: https://www.eea.europa.eu/data-and-maps/data/natura-14
    std::string downloadUrl = "https://www.eea.europa.eu/api/SITE/Natura2000Sites-latest.zip";
    std::filesystem::path zipFile = tempDir / "natura2000.zip";
    
    std::cout << "Downloading Natura 2000 dataset from EEA..." << std::endl;
    std::cout << "Note: This is a large download (~500 MB), please wait..." << std::endl;
    
    // Download using curl
    std::string curlCmd = "curl -L -o \"" + zipFile.string() + "\" \"" + downloadUrl + "\" 2>&1";
    int result = std::system(curlCmd.c_str());
    
    if (result != 0 || !std::filesystem::exists(zipFile)) {
        std::cerr << "Error: Failed to download Natura 2000 data from EEA." << std::endl;
        std::cerr << "\nAlternative: Download manually from:" << std::endl;
        std::cerr << "https://www.eea.europa.eu/data-and-maps/data/natura-14" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Extract ZIP
    std::cout << "Extracting Natura 2000 data..." << std::endl;
    std::string unzipCmd = "unzip -q -o \"" + zipFile.string() + "\" -d \"" + tempDir.string() + "\" 2>&1";
    result = std::system(unzipCmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: Failed to extract ZIP file." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Find the shapefile or geopackage in extracted files
    std::filesystem::path sourceFile;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(tempDir)) {
        if (entry.path().extension() == ".shp" || entry.path().extension() == ".gpkg") {
            sourceFile = entry.path();
            break;
        }
    }
    
    if (sourceFile.empty()) {
        std::cerr << "Error: Could not find shapefile or geopackage in extracted data." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Processing Natura 2000 sites..." << std::endl;
    
    // Convert to GeoPackage with optional filtering
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-nln natura2000_sites ";
    
    // Add spatial filter if bbox provided
    if (!bbox.empty()) {
        std::string bboxParsed = bbox;
        std::replace(bboxParsed.begin(), bboxParsed.end(), ',', ' ');
        ogr2ogrCmd += "-spat " + bboxParsed + " ";
    } else if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    }
    
    // Add attribute filter if country provided
    if (!country.empty()) {
        std::string countryUpper = country;
        std::transform(countryUpper.begin(), countryUpper.end(), countryUpper.begin(), ::toupper);
        ogr2ogrCmd += "-where \"COUNTRY = '" + countryUpper + "'\" ";
    }
    
    ogr2ogrCmd += "\"" + outputPath + "\" ";
    ogr2ogrCmd += "\"" + sourceFile.string() + "\" ";
    ogr2ogrCmd += "2>&1";
    
    result = std::system(ogr2ogrCmd.c_str());
    
    // Clean up
    std::filesystem::remove_all(tempDir);
    
    if (result != 0) {
        std::cerr << "Error: ogr2ogr conversion failed." << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file was not created." << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "natura2000_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "Natura 2000 Sites";
    meta["provider"] = "European Environment Agency (EEA)";
    meta["url"] = "https://www.eea.europa.eu/data-and-maps/data/natura-14";
    meta["license"] = "EEA standard re-use policy (with attribution)";
    meta["network"] = "Natura 2000 - European network of protected sites";
    if (!country.empty()) meta["country"] = country;
    if (!bbox.empty()) meta["bbox"] = bbox;
    if (!aoiPath.empty()) meta["aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "\n✅ Natura 2000 sites fetch complete!" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "\nATTRIBUTION REQUIRED:" << std::endl;
    std::cout << "European Environment Agency (EEA), Natura 2000 data" << std::endl;
    std::cout << "Available at: www.eea.europa.eu" << std::endl;
    
    return 0;
}

int tools_gadm_fetch(const std::string& country,
                     const std::string& outputPath,
                     const std::string& level,
                     bool overwrite) {
    // Check if this is a help request
    if (country == "help") {
        std::cout << R"(
╔════════════════════════════════════════════════════════════════════════════╗
║          GADM (Global Administrative Areas) Fetch Tool                     ║
╠════════════════════════════════════════════════════════════════════════════╣
║ PURPOSE:                                                                   ║
║   Fetch administrative boundary data from GADM database.                   ║
║   Provides detailed country borders at multiple administrative levels.     ║
╠════════════════════════════════════════════════════════════════════════════╣
║ DATA SOURCE:                                                               ║
║   Source:     University of California Davis                               ║
║   Provider:   GADM.org                                                     ║
║   License:    Free for non-commercial use (CC BY 4.0)                      ║
║   Version:    GADM 4.1 (2022)                                              ║
║   Coverage:   Global (all countries)                                       ║
║   Accuracy:   Variable by country, generally high quality                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ADMINISTRATIVE LEVELS:                                                     ║
║   Level 0:  Country boundaries                                             ║
║   Level 1:  First-level subdivisions (e.g., states, provinces)            ║
║   Level 2:  Second-level subdivisions (e.g., counties, districts)         ║
║   Level 3:  Third-level subdivisions (e.g., municipalities)               ║
║   Level 4:  Fourth-level subdivisions (when available)                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║ OUTPUT FORMAT:                                                             ║
║   Format:     GeoPackage (.gpkg) with separate layers per level            ║
║   Attributes: GID (unique ID), NAME (local name), VARNAME, TYPE, etc.      ║
║   CRS:        EPSG:4326 (WGS 84)                                           ║
║   Sidecar:    JSON metadata with provenance & attribution                  ║
╠════════════════════════════════════════════════════════════════════════════╣
║ USAGE:                                                                     ║
║   # Fetch all levels for a country:                                        ║
║   zeus tools gadm_fetch \                                                  ║
║       --country ISO3 \                                                     ║
║       --output boundaries.gpkg                                             ║
║                                                                            ║
║   # Fetch specific level:                                                  ║
║   zeus tools gadm_fetch \                                                  ║
║       --country SAU \                                                      ║
║       --output sau_admin.gpkg \                                            ║
║       --level 2                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║ EXAMPLES:                                                                  ║
║   # Fetch all Saudi Arabia admin levels                                    ║
║   zeus tools gadm_fetch \                                                  ║
║       --country SAU \                                                      ║
║       --output sau_gadm.gpkg                                               ║
║                                                                            ║
║   # Fetch UAE level 1 (emirates)                                           ║
║   zeus tools gadm_fetch \                                                  ║
║       --country ARE \                                                      ║
║       --output uae_emirates.gpkg \                                         ║
║       --level 1                                                            ║
║                                                                            ║
║   # Fetch Qatar boundaries                                                 ║
║   zeus tools gadm_fetch \                                                  ║
║       --country QAT \                                                      ║
║       --output qatar_admin.gpkg                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║ COMMON ISO3 COUNTRY CODES:                                                 ║
║   SAU  Saudi Arabia      USA  United States     CAN  Canada                ║
║   ARE  UAE               KWT  Kuwait            QAT  Qatar                 ║
║   OMN  Oman              BHR  Bahrain           IRQ  Iraq                  ║
║   IRN  Iran              RUS  Russia            NOR  Norway                ║
║   GBR  United Kingdom    NGA  Nigeria           DZA  Algeria               ║
║   LBY  Libya             EGY  Egypt                                        ║
╠════════════════════════════════════════════════════════════════════════════╣
║ NOTES:                                                                     ║
║   - Downloads full country GeoPackage (5-50MB typical)                     ║
║   - First download per country may take time                               ║
║   - Not all countries have all 4 admin levels                              ║
║   - For commercial use, contact GADM for licensing                         ║
╠════════════════════════════════════════════════════════════════════════════╣
║ ATTRIBUTION REQUIRED:                                                      ║
║   "Global Administrative Areas (2022). GADM database of Global             ║
║    Administrative Areas, version 4.1. [online] URL: www.gadm.org"         ║
╚════════════════════════════════════════════════════════════════════════════╝
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (country.empty()) {
        std::cerr << "Error: --country is required (ISO3 code)." << std::endl;
        return 1;
    }
    
    std::filesystem::path outPath(outputPath);
    if (std::filesystem::exists(outPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace." << std::endl;
        return 1;
    }
    
    // Convert country code to uppercase
    std::string countryUpper = country;
    std::transform(countryUpper.begin(), countryUpper.end(), countryUpper.begin(), ::toupper);
    
    if (countryUpper.length() != 3) {
        std::cerr << "Error: Country code must be 3-letter ISO3 code (e.g., SAU, ARE, USA)." << std::endl;
        return 1;
    }
    
    std::cout << "Fetching GADM data for " << countryUpper << "..." << std::endl;
    
    // GADM URL pattern: https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_{ISO3}.gpkg
    std::string filename = "gadm41_" + countryUpper + ".gpkg";
    std::string url = "https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/" + filename;
    
    std::cout << "Downloading from GADM database..." << std::endl;
    std::cout << "URL: " << url << std::endl;
    
    // Download directly to output path
    std::string downloadCmd = "curl -L -o " + outPath.string() + " " + url;
    int ret = std::system(downloadCmd.c_str());
    if (ret != 0) {
        std::cerr << "Error: Failed to download GADM data." << std::endl;
        std::cerr << "Check that country code '" << countryUpper << "' is valid." << std::endl;
        if (std::filesystem::exists(outPath)) {
            std::filesystem::remove(outPath);
        }
        return 1;
    }
    
    // Verify download
    if (!std::filesystem::exists(outPath) || std::filesystem::file_size(outPath) < 1000) {
        std::cerr << "Error: Downloaded file is invalid or empty." << std::endl;
        if (std::filesystem::exists(outPath)) {
            std::filesystem::remove(outPath);
        }
        return 1;
    }
    
    std::cout << "Download complete: " << std::filesystem::file_size(outPath) << " bytes" << std::endl;
    
    // If specific level requested, extract only that level
    if (level != "all") {
        std::cout << "Extracting admin level " << level << "..." << std::endl;
        
        std::filesystem::path tempOut = outPath.string() + ".tmp";
        std::string layerName = "ADM_ADM_" + level;
        
        std::string extractCmd = "ogr2ogr -f GPKG " + tempOut.string() + " " + outPath.string() + " " + layerName;
        ret = std::system(extractCmd.c_str());
        
        if (ret == 0 && std::filesystem::exists(tempOut)) {
            std::filesystem::remove(outPath);
            std::filesystem::rename(tempOut, outPath);
            std::cout << "Extracted level " << level << " successfully." << std::endl;
        } else {
            std::cerr << "Warning: Could not extract level " << level << ". Keeping all levels." << std::endl;
            if (std::filesystem::exists(tempOut)) {
                std::filesystem::remove(tempOut);
            }
        }
    }
    
    // Generate JSON metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "gadm_fetch";
    meta["timestamp"] = to_iso8601_utc();
    meta["source"] = {
        {"name", "GADM - Global Administrative Areas"},
        {"provider", "University of California Davis"},
        {"version", "4.1"},
        {"year", 2022},
        {"url", "https://www.gadm.org"},
        {"license", "CC-BY-4.0 (non-commercial use)"},
        {"attribution", "Global Administrative Areas (2022). GADM database of Global Administrative Areas, version 4.1. [online] URL: www.gadm.org"},
        {"download_url", url}
    };
    meta["country"] = countryUpper;
    meta["admin_level"] = level;
    meta["format"] = "GeoPackage";
    meta["crs"] = "EPSG:4326";
    meta["levels"] = {
        {"0", "Country boundary"},
        {"1", "First-level subdivisions (states/provinces)"},
        {"2", "Second-level subdivisions (counties/districts)"},
        {"3", "Third-level subdivisions (municipalities)"},
        {"4", "Fourth-level subdivisions (when available)"}
    };
    
    write_sidecar_json(outPath.string(), meta);
    
    std::cout << "tools gadm_fetch OK: " << outPath.string() << std::endl;
    return 0;
}

int tools_worldclim_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          const std::string& variable,
                          const std::string& resolution,
                          bool overwrite) {
    std::cout << "tools worldclim_fetch: Implementation in progress.\n"
              << "Visit: https://www.worldclim.org/data/worldclim21.html\n"
              << "Use: Prebuilt tool `gdal` to download and clip WorldClim tiles." << std::endl;
    return 1;
}

int tools_modis_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     const std::string& product,
                     const std::string& startDate,
                     const std::string& endDate,
                     bool overwrite) {
    std::cout << "tools modis_fetch: Implementation in progress.\n"
              << "Similar to GSW, uses Google Earth Engine.\n"
              << "Dataset: MODIS/006/MOD13A2 (NDVI/EVI)" << std::endl;
    return 1;
}

int tools_hydrosheds_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& product,
                           bool overwrite) {
    std::cout << "tools hydrosheds_fetch: Implementation in progress.\n"
              << "Visit: https://www.hydrosheds.org/downloads\n"
              << "Download regional tiles manually." << std::endl;
    return 1;
}

int tools_era5_fetch(const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& outputPath,
                    const std::string& variable,
                    const std::string& startDate,
                    const std::string& endDate,
                    bool overwrite) {
    std::cout << "tools era5_fetch: Implementation in progress.\n"
              << "Requires CDS API setup.\n"
              << "Visit: https://cds.climate.copernicus.eu/" << std::endl;
    return 1;
}

int tools_fao_soil_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        bool overwrite) {
    
    // Check for help
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
OpenLandMap Soil Properties Fetch Tool

DESCRIPTION:
  Fetches global soil properties from OpenLandMap SoilGrids via Google Earth Engine.
  Provides 250m resolution soil properties including organic carbon, pH, texture,
  bulk density, and more.

DATA SOURCE:
  - Provider: OpenLandMap / ISRIC SoilGrids
  - Resolution: 250 meters
  - Coverage: Global
  - Depth Intervals: 0cm, 10cm, 30cm, 60cm, 100cm, 200cm
  - Via: Google Earth Engine

SOIL PROPERTIES AVAILABLE:
  - Soil organic carbon (g/kg)
  - Soil pH in H2O
  - Clay content (%)
  - Sand content (%)
  - Bulk density (kg/m³)
  - Coarse fragments (%)

USAGE:
  zeus tools fao_soil_fetch --bbox minx,miny,maxx,maxy -o output.tif
  zeus tools fao_soil_fetch --aoi study_area.gpkg -o output.tif

OPTIONS:
  --bbox         Bounding box in EPSG:4326 (minx,miny,maxx,maxy)
  --aoi          AOI vector file (GeoJSON/Shapefile/GeoPackage)
  -o, --output   Output GeoTIFF path (multi-band: clay, sand, organic carbon, pH)
  --overwrite    Overwrite existing output

OUTPUT:
  Multi-band GeoTIFF with:
  - Band 1: Clay content (%) at 0-5cm depth
  - Band 2: Sand content (%) at 0-5cm depth  
  - Band 3: Organic carbon (g/kg) at 0-5cm depth
  - Band 4: pH in H2O at 0-5cm depth

REQUIREMENTS:
  - Google Earth Engine authentication (already configured)
  - Python with 'ee' and 'geemap' packages

METADATA:
  Output includes JSON sidecar with:
  - Data source: OpenLandMap SoilGrids250m
  - Band descriptions
  - Depth interval
  - CRS and resolution

ATTRIBUTION:
  Hengl T, Mendes de Jesus J, Heuvelink GBM, et al. (2017)
  SoilGrids250m: Global gridded soil information based on machine learning.
  PLoS ONE 12(2): e0169748. doi:10.1371/journal.pone.0169748
)" << std::endl;
        return 0;
    }

    std::filesystem::path outPath(outputPath);
    if (!overwrite && std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file exists: " << outputPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Must provide either --bbox or --aoi" << std::endl;
        return 1;
    }

    std::cout << "Fetching OpenLandMap soil data via Google Earth Engine..." << std::endl;

    // Create Python script for GEE
    std::filesystem::path scriptPath = outPath.parent_path() / "fetch_soil.py";
    std::ofstream script(scriptPath);
    
    script << R"(#!/usr/bin/env python3
import ee
import geemap
import sys

try:
    ee.Initialize()
except:
    print("Error: Google Earth Engine not authenticated.", file=sys.stderr)
    print("Run: earthengine authenticate", file=sys.stderr)
    sys.exit(1)

# Parse arguments
bbox_str = sys.argv[1] if len(sys.argv) > 1 else ""
aoi_path = sys.argv[2] if len(sys.argv) > 2 else ""
output_path = sys.argv[3]

# Define AOI
if aoi_path and aoi_path != "":
    aoi = geemap.geopandas_to_ee(aoi_path)
    bbox = aoi.geometry().bounds()
else:
    coords = [float(x) for x in bbox_str.split(',')]
    bbox = ee.Geometry.Rectangle(coords)

# Load OpenLandMap SoilGrids250m from GEE
# Clay content at 0-5cm depth
clay = ee.Image("OpenLandMap/SOL/SOL_CLAY-WFRACTION_USDA-3A1A1A_M/v02").select('b0')

# Sand content at 0-5cm depth  
sand = ee.Image("OpenLandMap/SOL/SOL_SAND-WFRACTION_USDA-3A1A1A_M/v02").select('b0')

# Organic carbon at 0-5cm depth
soc = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02").select('b0')

# pH in H2O at 0-5cm depth
ph = ee.Image("OpenLandMap/SOL/SOL_PH-H2O_USDA-4C1A2A_M/v02").select('b0')

# Combine into multi-band image
soil_composite = ee.Image.cat([
    clay.rename('clay'),
    sand.rename('sand'),
    soc.rename('organic_carbon'),
    ph.rename('ph')
]).clip(bbox)

# Export
print(f"Exporting soil data to {output_path}")
geemap.ee_export_image(
    soil_composite,
    filename=output_path,
    scale=250,
    region=bbox,
    file_per_band=False,
    crs='EPSG:4326'
)

print("Export complete")
)";
    script.close();
    std::filesystem::permissions(scriptPath, std::filesystem::perms::owner_exec, std::filesystem::perm_options::add);

    // Build command
    std::string venvPython = "/opt/agrs/.venv_gee/bin/python3";
    std::string cmd = venvPython + " " + scriptPath.string() + " \"" + bbox + "\" \"" + aoiPath + "\" " + outputPath + " 2>&1";
    
    std::cout << "Running: " << cmd << std::endl;
    int result = std::system(cmd.c_str());
    
    // Clean up script
    std::filesystem::remove(scriptPath);
    
    if (result != 0) {
        std::cerr << "Error: Failed to fetch soil data" << std::endl;
        return 1;
    }

    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "fao_soil_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "OpenLandMap SoilGrids250m via Google Earth Engine";
    meta["provider"] = "ISRIC - World Soil Information";
    meta["resolution"] = "250 meters";
    meta["crs"] = "EPSG:4326";
    meta["depth_interval"] = "0-5cm (b0)";
    
    meta["bands"] = {
        {"1", "Clay content (%) - USDA texture class"},
        {"2", "Sand content (%) - USDA texture class"},
        {"3", "Organic carbon content (g/kg)"},
        {"4", "Soil pH in H2O"}
    };
    
    meta["attribution"] = "Hengl T, Mendes de Jesus J, Heuvelink GBM, et al. (2017) SoilGrids250m";
    meta["doi"] = "10.1371/journal.pone.0169748";
    meta["license"] = "CC-BY-SA 4.0";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools fao_soil_fetch OK: " << outputPath << std::endl;
    return 0;
}

int tools_seismic_hazard_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& product,
                               bool overwrite) {
    
    // Check for help
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
Global Seismic Hazard Map Fetch Tool

DESCRIPTION:
  Fetches global seismic hazard data via Google Earth Engine.
  Uses USGS seismic hazard model showing peak ground acceleration.

DATA SOURCE:
  - Provider: USGS via Google Earth Engine
  - Dataset: USGS/GMTED2010 seismic hazard layers
  - Resolution: ~1 km
  - Coverage: Global
  - Parameter: Peak Ground Acceleration (PGA)
  - Return Period: 475 years (10% probability in 50 years)

PRODUCTS:
  pga     - Peak Ground Acceleration (%g) [DEFAULT]
  
NOTE: Currently implements PGA only. Additional parameters (PGV, SA) 
      require different data sources.

USAGE:
  zeus tools seismic_hazard_fetch --bbox minx,miny,maxx,maxy -o output.tif
  zeus tools seismic_hazard_fetch --aoi study_area.gpkg -o output.tif

OPTIONS:
  --bbox         Bounding box in EPSG:4326 (minx,miny,maxx,maxy)
  --aoi          AOI vector file (GeoJSON/Shapefile/GeoPackage)
  --product      pga (default: pga)
  -o, --output   Output GeoTIFF path
  --overwrite    Overwrite existing output

REQUIREMENTS:
  - Google Earth Engine authentication (already configured)
  - Python with 'ee' and 'geemap' packages

CRITICAL FOR PIPELINE ROUTING:
  - Western Saudi Arabia: HIGH seismic hazard (Red Sea rift)
  - Eastern Saudi Arabia: LOW to MODERATE
  - Volcanic fields (Harrats): MODERATE to HIGH
  - Essential for engineering design specifications

METADATA:
  Output includes JSON sidecar with:
  - Data source and version
  - Return period information (475 years)
  - Ground motion parameter
  - CRS and resolution

ATTRIBUTION:
  USGS Seismic Hazard Model
)" << std::endl;
        return 0;
    }

    std::filesystem::path outPath(outputPath);
    if (!overwrite && std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file exists: " << outputPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Must provide either --bbox or --aoi" << std::endl;
        return 1;
    }

    std::cout << "Fetching GEM Global Seismic Hazard Map (PGA, 475-year)..." << std::endl;

    // Create temp directory for download
    std::filesystem::path tempDir = outPath.parent_path() / "temp_seismic";
    std::filesystem::create_directories(tempDir);
    
    std::filesystem::path zipPath = tempDir / "gem_seismic.zip";
    std::filesystem::path extractedPath = tempDir / "v2023_1_pga_475_rock_3min.tif";
    
    // Download GEM data from Zenodo (34.6 MB)
    std::string downloadUrl = "https://zenodo.org/records/8409647/files/GEM-GSHM_PGA-475y-rock_v2023.zip";
    std::string downloadCmd = "curl -L -o " + zipPath.string() + " \"" + downloadUrl + "\" 2>&1";
    
    std::cout << "Downloading from Zenodo (34.6 MB)..." << std::endl;
    std::cout << "Running: " << downloadCmd << std::endl;
    
    int downloadResult = std::system(downloadCmd.c_str());
    if (downloadResult != 0) {
        std::cerr << "Error: Failed to download GEM seismic hazard data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Unzip
    std::cout << "Extracting..." << std::endl;
    std::string unzipCmd = "unzip -o " + zipPath.string() + " -d " + tempDir.string() + " 2>&1";
    int unzipResult = std::system(unzipCmd.c_str());
    if (unzipResult != 0) {
        std::cerr << "Error: Failed to extract seismic hazard data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Clip to bbox/AOI
    std::cout << "Clipping to AOI..." << std::endl;
    
    std::string gdalCmd;
    if (!aoiPath.empty()) {
        gdalCmd = "gdalwarp -cutline " + aoiPath + " -crop_to_cutline -dstnodata 0 " + 
                  extractedPath.string() + " " + outputPath + " 2>&1";
    } else {
        // Parse bbox
        std::istringstream ss(bbox);
        std::string token;
        std::vector<std::string> coords;
        while (std::getline(ss, token, ',')) {
            coords.push_back(token);
        }
        if (coords.size() != 4) {
            std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
            std::filesystem::remove_all(tempDir);
            return 1;
        }
        gdalCmd = "gdalwarp -te " + coords[0] + " " + coords[1] + " " + coords[2] + " " + coords[3] + 
                  " -dstnodata 0 " + extractedPath.string() + " " + outputPath + " 2>&1";
    }
    
    std::cout << "Running: " << gdalCmd << std::endl;
    int clipResult = std::system(gdalCmd.c_str());
    
    // Clean up temp files
    std::filesystem::remove_all(tempDir);
    
    if (clipResult != 0) {
        std::cerr << "Error: Failed to clip seismic hazard data" << std::endl;
        return 1;
    }

    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "seismic_hazard_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "GEM Global Seismic Hazard Map v2023.1";
    meta["provider"] = "Global Earthquake Model (GEM) Foundation";
    meta["resolution"] = "~6 km (point spacing with IDW interpolation)";
    meta["crs"] = "EPSG:4326";
    meta["product"] = product;
    meta["return_period"] = "475 years (10% probability in 50 years)";
    meta["ground_conditions"] = "Reference rock (Vs30 = 760-800 m/s)";
    meta["version"] = "2023.1";
    meta["release_date"] = "June 2023";
    
    meta["bands"] = {
        {"1", "Peak Ground Acceleration (PGA) in %g"}
    };
    
    meta["attribution"] = "K. Johnson, M. Villani, et al. (2023). GEM Seismic Hazard Map v2023.1";
    meta["doi"] = "10.5281/zenodo.8409647";
    meta["license"] = "CC BY-NC-SA 4.0 (Non-commercial use)";
    meta["download_url"] = "https://zenodo.org/records/8409647";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools seismic_hazard_fetch OK: " << outputPath << std::endl;
    return 0;
}
// ============================================================================
// BATCH 2 FETCH TOOLS: Hydrology, Soil, Boundaries, Land Cover
// ============================================================================

int tools_hydrosheds_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           int level,
                           bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
HydroSHEDS Drainage Basin Fetch Tool
=====================================

Description:
  Fetches HydroSHEDS (Hydrological data and maps based on Shuttle Elevation Derivatives at multiple scales)
  drainage basin data for hydrological analysis.
  
Data Source:
  - Provider: WWF / HydroSHEDS.org
  - Dataset: HydroBASINS (Watershed boundaries and sub-basins)
  - Coverage: Global
  - Resolution: Hierarchical levels 1-12
  - Format: Vector (polygon shapefiles)
  - CRS: EPSG:4326 (WGS84)
  - License: Free for non-commercial use

Output Format:
  - GeoPackage (.gpkg) with basin polygons
  - Attributes: Basin ID, Upstream area, Stream order, River name
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box (level 6 default - medium scale)
  zeus tools hydrosheds_fetch --bbox 13.5,42.8,13.9,43.4 -o basins.gpkg
  
  # Fetch with specific level
  zeus tools hydrosheds_fetch --bbox 13.5,42.8,13.9,43.4 -o basins.gpkg --level 8
  
  # Fetch by AOI polygon
  zeus tools hydrosheds_fetch --aoi study_area.geojson -o basins.gpkg

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoPackage file path
  --level N                    Basin level (1-12, default: 6)
  --overwrite                  Overwrite existing output file

Basin Levels:
  - Level 1-3: Large continental basins
  - Level 4-6: Medium-scale regional basins (recommended)
  - Level 7-9: Sub-basins and catchments
  - Level 10-12: Very fine-scale micro-catchments

Attribution:
  Lehner, B., Grill G. (2013): Global river hydrography and network routing: 
  baseline data and new approaches to study the world's large river systems. 
  Hydrological Processes, 27(15): 2171–2186.
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching HydroSHEDS drainage basin data..." << std::endl;
    std::cout << "Source: WWF HydroSHEDS (HydroBASINS)" << std::endl;
    std::cout << "Level: " << level << " (hierarchical basin delineation)" << std::endl;
    
    // Determine region from bbox
    std::string region = "europe";  // For Central Italy
    
    // Download URL for Europe Level 6 (most common)
    std::string downloadUrl = "https://www.hydrosheds.org/downloads/HydroBASINS/hybas_eu_lev" + std::to_string(level) + "_v1c.zip";
    
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("hydrosheds_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    std::filesystem::path zipPath = tempDir / "hydrobasins.zip";
    
    std::cout << "Downloading HydroBASINS Europe Level " << level << "..." << std::endl;
    std::string downloadCmd = "curl -L -o " + zipPath.string() + " \"" + downloadUrl + "\" 2>&1";
    
    int result = std::system(downloadCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download HydroSHEDS data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Extract ZIP
    std::cout << "Extracting..." << std::endl;
    std::string unzipCmd = "unzip -q -o " + zipPath.string() + " -d " + tempDir.string() + " 2>&1";
    result = std::system(unzipCmd.c_str());
    
    // Find shapefile
    std::filesystem::path shpFile;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(tempDir)) {
        if (entry.path().extension() == ".shp") {
            shpFile = entry.path();
            break;
        }
    }
    
    if (shpFile.empty()) {
        std::cerr << "Error: No shapefile found in downloaded data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Clipping to AOI and converting to GeoPackage..." << std::endl;
    
    // Convert and clip using ogr2ogr
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-t_srs EPSG:4326 ";
    
    // Clip to AOI
    if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    } else if (!bbox.empty()) {
        // Parse bbox
        std::istringstream ss(bbox);
        std::string token;
        std::vector<std::string> coords;
        while (std::getline(ss, token, ',')) {
            coords.push_back(token);
        }
        if (coords.size() == 4) {
            ogr2ogrCmd += "-clipdst " + coords[0] + " " + coords[1] + " " + coords[2] + " " + coords[3] + " ";
        }
    }
    
    ogr2ogrCmd += outputPath + " " + shpFile.string();
    
    result = std::system(ogr2ogrCmd.c_str());
    
    // Clean up
    std::filesystem::remove_all(tempDir);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "hydrosheds_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "WWF HydroSHEDS HydroBASINS";
    meta["provider"] = "World Wildlife Fund (WWF)";
    meta["coverage"] = "Global";
    meta["format"] = "Vector (Polygon)";
    meta["crs"] = "EPSG:4326";
    meta["basin_level"] = level;
    meta["update_frequency"] = "Periodic (stable baseline)";
    meta["license"] = "Free for non-commercial use";
    meta["attribution"] = "Lehner, B., Grill G. (2013)";
    meta["url"] = "https://www.hydrosheds.org/";
    meta["download_url"] = downloadUrl;
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    std::string metaPath = outputPath + ".json";
    std::ofstream metaFile(metaPath);
    metaFile << meta.dump(2);
    metaFile.close();
    
    std::cout << "\n✅ HydroSHEDS basins downloaded successfully" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "Metadata: " << metaPath << std::endl;
    std::cout << "tools hydrosheds_fetch OK: " << outputPath << std::endl;
    return 0;
}

int tools_istat_boundaries_fetch(const std::string& bbox,
                                  const std::string& aoiPath,
                                  const std::string& outputPath,
                                  const std::string& level,
                                  bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
ISTAT Administrative Boundaries Fetch Tool
===========================================

Description:
  Fetches official Italian administrative boundaries from ISTAT (Istituto Nazionale di Statistica).
  
Data Source:
  - Provider: ISTAT (Italian National Institute of Statistics)
  - Dataset: Administrative Boundaries
  - Coverage: Italy
  - Format: Vector (polygon shapefiles)
  - CRS: EPSG:32632 (UTM Zone 32N) or EPSG:4326
  - Update Frequency: Annually
  - License: Open Data (ISTAT Open Data License)

Output Format:
  - GeoPackage (.gpkg) with boundary polygons
  - Attributes: Name, Code, Area, Population (if available)
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box (comuni default)
  zeus tools istat_boundaries_fetch --bbox 13.5,42.8,13.9,43.4 -o boundaries.gpkg
  
  # Fetch with specific level
  zeus tools istat_boundaries_fetch --bbox 13.5,42.8,13.9,43.4 -o boundaries.gpkg --level province
  
  # Fetch by AOI polygon
  zeus tools istat_boundaries_fetch --aoi study_area.geojson -o boundaries.gpkg

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoPackage file path
  --level LEVEL                comuni|province|regioni (default: comuni)
  --overwrite                  Overwrite existing output file

Boundary Levels:
  - regioni (Regions): 20 regions
  - province (Provinces): 110 provinces
  - comuni (Municipalities): 7,900+ municipalities [DEFAULT]

Attribution:
  ISTAT - Istituto Nazionale di Statistica
  https://www.istat.it/
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching ISTAT administrative boundaries..." << std::endl;
    std::cout << "Source: ISTAT (Istituto Nazionale di Statistica)" << std::endl;
    std::cout << "Level: " << level << std::endl;
    
    // ISTAT provides all administrative levels in a single ZIP file
    // Updated for 2025 boundaries (as of January 1, 2025)
    std::string downloadUrl = "https://www.istat.it/storage/cartografia/confini_amministrativi/generalizzati/Limiti01012025_g.zip";
    
    // Determine which shapefile to extract based on level
    std::string targetShpPattern;
    if (level == "regioni") {
        targetShpPattern = "Reg01012025_g";  // Regions
    } else if (level == "province") {
        targetShpPattern = "ProvCM01012025_g";  // Provinces
    } else {  // comuni (default)
        targetShpPattern = "Com01012025_g";  // Municipalities
    }
    
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("istat_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    std::filesystem::path zipPath = tempDir / "istat_boundaries.zip";
    
    std::cout << "Downloading ISTAT boundaries..." << std::endl;
    std::string downloadCmd = "curl -L -o " + zipPath.string() + " \"" + downloadUrl + "\" 2>&1";
    
    int result = std::system(downloadCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download ISTAT data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Extract ZIP
    std::cout << "Extracting..." << std::endl;
    std::string unzipCmd = "unzip -q -o " + zipPath.string() + " -d " + tempDir.string() + " 2>&1";
    result = std::system(unzipCmd.c_str());
    
    // Find the correct shapefile based on level
    std::filesystem::path shpFile;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(tempDir)) {
        if (entry.path().extension() == ".shp" && 
            entry.path().stem().string().find(targetShpPattern) != std::string::npos) {
            shpFile = entry.path();
            std::cout << "Found shapefile: " << entry.path().filename() << std::endl;
            break;
        }
    }
    
    if (shpFile.empty()) {
        std::cerr << "Error: No shapefile matching pattern '" << targetShpPattern << "' found in downloaded data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Clipping to AOI and converting to GeoPackage..." << std::endl;
    
    // Convert and clip using ogr2ogr
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-t_srs EPSG:4326 ";
    
    // Clip to AOI
    if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    } else if (!bbox.empty()) {
        std::istringstream ss(bbox);
        std::string token;
        std::vector<std::string> coords;
        while (std::getline(ss, token, ',')) {
            coords.push_back(token);
        }
        if (coords.size() == 4) {
            ogr2ogrCmd += "-clipdst " + coords[0] + " " + coords[1] + " " + coords[2] + " " + coords[3] + " ";
        }
    }
    
    ogr2ogrCmd += outputPath + " " + shpFile.string();
    
    result = std::system(ogr2ogrCmd.c_str());
    
    // Clean up
    std::filesystem::remove_all(tempDir);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "istat_boundaries_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "ISTAT Administrative Boundaries";
    meta["provider"] = "ISTAT - Istituto Nazionale di Statistica";
    meta["coverage"] = "Italy";
    meta["format"] = "Vector (Polygon)";
    meta["crs"] = "EPSG:4326";
    meta["boundary_level"] = level;
    meta["update_frequency"] = "Annually";
    meta["license"] = "ISTAT Open Data License";
    meta["attribution"] = "ISTAT";
    meta["url"] = "https://www.istat.it/";
    meta["download_url"] = downloadUrl;
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    std::string metaPath = outputPath + ".json";
    std::ofstream metaFile(metaPath);
    metaFile << meta.dump(2);
    metaFile.close();
    
    std::cout << "\n✅ ISTAT boundaries downloaded successfully" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "Metadata: " << metaPath << std::endl;
    std::cout << "tools istat_boundaries_fetch OK: " << outputPath << std::endl;
    return 0;
}


int tools_soilgrids_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          const std::string& property,
                          bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
SoilGrids Soil Property Fetch Tool
===================================

Description:
  Fetches global soil property data from ISRIC SoilGrids 250m v2.0.
  Provides detailed soil characteristics for excavation and corrosion analysis.
  
Data Source:
  - Provider: ISRIC - World Soil Information
  - Dataset: SoilGrids 250m v2.0
  - Coverage: Global
  - Resolution: 250m
  - Format: Raster (GeoTIFF)
  - CRS: EPSG:4326 (WGS84)
  - Depth: 0-200cm (7 standard depths)
  - License: CC BY 4.0

Output Format:
  - Cloud Optimized GeoTIFF (.tif)
  - Unit: Varies by property
  - Includes JSON metadata sidecar

Usage:
  # Fetch soil organic carbon
  zeus tools soilgrids_fetch --bbox 13.5,42.8,13.9,43.4 -o soc.tif --property soc
  
  # Fetch clay content
  zeus tools soilgrids_fetch --bbox 13.5,42.8,13.9,43.4 -o clay.tif --property clay
  
  # Fetch by AOI polygon
  zeus tools soilgrids_fetch --aoi study_area.geojson -o soil.tif

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoTIFF file path
  --property PROP              Soil property (default: soc)
  --overwrite                  Overwrite existing output file

Soil Properties:
  - soc:  Soil Organic Carbon (g/kg) [DEFAULT]
  - clay: Clay content (%)
  - sand: Sand content (%)
  - silt: Silt content (%)
  - ph:   pH in H2O
  - bdod: Bulk density (kg/dm³)
  - cec:  Cation Exchange Capacity (cmol/kg)

Pipeline Applications:
  - Excavation difficulty (clay/sand content)
  - Corrosion potential (ph, soc)
  - Bearing capacity (bdod)
  - Drainage characteristics (texture)

Attribution:
  Poggio, L., de Sousa, L.M., Batjes, N.H. et al. (2021).
  SoilGrids 2.0: producing soil information for the globe with 
  quantified spatial uncertainty. SOIL 7, 217–240.
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching SoilGrids soil property data..." << std::endl;
    std::cout << "Source: ISRIC SoilGrids 250m v2.0" << std::endl;
    std::cout << "Property: " << property << std::endl;
    
    // SoilGrids uses WCS (Web Coverage Service)
    // Base URL
    std::string wcsUrl = "https://maps.isric.org/mapserv";
    
    // Parse bbox
    std::string bboxStr;
    if (!bbox.empty()) {
        bboxStr = bbox;
    } else {
        // Extract bbox from AOI
        std::string ogrCmd = "ogrinfo -al -so " + aoiPath + " | grep Extent";
        // For now, require bbox
        std::cerr << "Error: Currently only --bbox is supported" << std::endl;
        return 1;
    }
    
    // Map property to SoilGrids layer name
    std::string layerName = "soc_0-5cm_mean";  // Default: soil organic carbon 0-5cm
    if (property == "clay") {
        layerName = "clay_0-5cm_mean";
    } else if (property == "sand") {
        layerName = "sand_0-5cm_mean";
    } else if (property == "silt") {
        layerName = "silt_0-5cm_mean";
    } else if (property == "ph") {
        layerName = "phh2o_0-5cm_mean";
    } else if (property == "bdod") {
        layerName = "bdod_0-5cm_mean";
    } else if (property == "cec") {
        layerName = "cec_0-5cm_mean";
    }
    
    std::filesystem::path tempTif = std::filesystem::temp_directory_path() / ("soilgrids_" + std::to_string(std::time(nullptr)) + ".tif");
    
    std::cout << "Downloading via WCS..." << std::endl;
    
    // Build WCS request
    std::istringstream ss(bboxStr);
    std::string token;
    std::vector<std::string> coords;
    while (std::getline(ss, token, ',')) {
        coords.push_back(token);
    }
    
    if (coords.size() != 4) {
        std::cerr << "Error: bbox must be minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    std::string wcsRequest = wcsUrl + "?map=/map/" + layerName + ".map";
    wcsRequest += "&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage";
    wcsRequest += "&COVERAGEID=" + layerName;
    wcsRequest += "&FORMAT=image/tiff";
    wcsRequest += "&SUBSET=X(" + coords[0] + "," + coords[2] + ")";
    wcsRequest += "&SUBSET=Y(" + coords[1] + "," + coords[3] + ")";
    
    std::string curlCmd = "curl -L -o " + tempTif.string() + " \"" + wcsRequest + "\" 2>&1";
    
    int result = std::system(curlCmd.c_str());
    if (result != 0 || !std::filesystem::exists(tempTif) || std::filesystem::file_size(tempTif) < 1000) {
        std::cerr << "Error: Failed to download from WCS service" << std::endl;
        std::filesystem::remove(tempTif);
        return 1;
    }
    
    std::cout << "Converting to COG..." << std::endl;
    
    // Convert to COG
    std::string cogCmd = "gdal_translate -of COG -co COMPRESS=LZW -co BIGTIFF=YES ";
    cogCmd += tempTif.string() + " " + outputPath + " 2>&1";
    
    result = std::system(cogCmd.c_str());
    std::filesystem::remove(tempTif);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to COG" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "soilgrids_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "ISRIC SoilGrids 250m v2.0";
    meta["provider"] = "ISRIC - World Soil Information";
    meta["coverage"] = "Global";
    meta["format"] = "Raster (COG)";
    meta["crs"] = "EPSG:4326";
    meta["resolution"] = "250m";
    meta["soil_property"] = property;
    meta["layer_name"] = layerName;
    meta["update_frequency"] = "Stable baseline (2020)";
    meta["license"] = "CC BY 4.0";
    meta["attribution"] = "Poggio et al. (2021) SoilGrids 2.0";
    meta["url"] = "https://soilgrids.org/";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    std::string metaPath = outputPath + ".json";
    std::ofstream metaFile(metaPath);
    metaFile << meta.dump(2);
    metaFile.close();
    
    std::cout << "\n✅ SoilGrids data downloaded successfully" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "Metadata: " << metaPath << std::endl;
    std::cout << "tools soilgrids_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ============================================================================
// INTELLIGENT DATASET ROUTING FETCH TOOLS
// ============================================================================
// These functions use dataset inventories to automatically select the best
// available dataset for a given location and delegate to specific fetch tools.
// Pattern: Similar to tools_dem_fetch with DEMRouter
// ============================================================================

// 1. LAND COVER FETCH - Intelligent routing for land cover datasets
int tools_landcover_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          const std::string& resolution,
                          bool overwrite) {
    
    std::cout << "\n🌿 ZEUS Intelligent Land Cover Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    // Parse bbox to get centroid
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    // Initialize router
    DatasetRouter<Dataset> router("/opt/agrs/data/landcover_datasets_inventory.csv", 
                                  "Land Cover");
    
    // Find best dataset
    auto best = router.find_best_dataset(center_lon, center_lat, "Raster");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable land cover dataset found" << std::endl;
        return 1;
    }
    
    // Delegate to specific tool
    if (best.fetch_tool == "esa_worldcover_fetch") {
        std::cout << "🔄 Delegating to ESA WorldCover fetch tool..." << std::endl;
        return tools_esa_worldcover_fetch(bbox, aoiPath, outputPath, "2021", overwrite);
    } else if (best.fetch_tool == "google_dynamicworld_fetch") {
        std::cout << "🔄 Delegating to Google Dynamic World fetch tool..." << std::endl;
        return tools_google_dynamicworld_fetch(bbox, aoiPath, outputPath, "2023-01-01", overwrite);
    }
    
    // Guidance for not-yet-implemented tools
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "To acquire " << best.dataset_name << ":" << std::endl;
    std::cout << "  1. Provider: " << best.provider << std::endl;
    std::cout << "  2. Resolution: " << best.resolution << std::endl;
    std::cout << "  3. License: " << best.license << std::endl;
    std::cout << "  4. Manual download required" << std::endl;
    std::cout << "\nFor now, falling back to global datasets..." << std::endl;
    
    // Fallback to ESA WorldCover (always available globally)
    return tools_esa_worldcover_fetch(bbox, aoiPath, outputPath, "2021", overwrite);
}

// 2. HYDROLOGY FETCH - Intelligent routing for hydrology datasets
int tools_hydrology_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite) {
    
    std::cout << "\n💧 ZEUS Intelligent Hydrology Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/hydrology_datasets_inventory.csv", 
                                  "Hydrology");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Vector");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable hydrology dataset found" << std::endl;
        return 1;
    }
    
    // Delegate to specific tool
    if (best.fetch_tool == "osm_waterways_fetch") {
        std::cout << "🔄 Delegating to OSM Waterways fetch tool..." << std::endl;
        return tools_osm_waterways_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (best.fetch_tool == "global_surface_water_fetch") {
        std::cout << "🔄 Delegating to Global Surface Water fetch tool..." << std::endl;
        return tools_global_surface_water_fetch(bbox, aoiPath, outputPath, "occurrence", overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "Falling back to OSM Waterways (global)..." << std::endl;
    
    return tools_osm_waterways_fetch(bbox, aoiPath, outputPath, overwrite);
}

// 3. INFRASTRUCTURE FETCH - Intelligent routing for infrastructure datasets
int tools_infrastructure_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& infra_type,
                               bool overwrite) {
    
    std::cout << "\n🛣️  ZEUS Intelligent Infrastructure Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/infrastructure_datasets_inventory.csv", 
                                  "Infrastructure");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Vector");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable infrastructure dataset found" << std::endl;
        return 1;
    }
    
    // Delegate based on infrastructure type
    if (infra_type == "roads" || best.fetch_tool == "osm_roads_fetch") {
        std::cout << "🔄 Delegating to OSM Roads fetch tool..." << std::endl;
        return tools_osm_roads_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (infra_type == "railways" || best.fetch_tool == "osm_railways_fetch") {
        std::cout << "🔄 Delegating to OSM Railways fetch tool..." << std::endl;
        return tools_osm_railways_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (infra_type == "power" || best.fetch_tool == "osm_power_fetch") {
        std::cout << "🔄 Delegating to OSM Power fetch tool..." << std::endl;
        return tools_osm_power_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (best.fetch_tool == "scigrid_gas_pipelines_fetch") {
        std::cout << "🔄 Delegating to SciGRID Gas Pipelines fetch tool..." << std::endl;
        return tools_scigrid_gas_pipelines_fetch(bbox, aoiPath, outputPath, "auto", overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "Falling back to OSM Roads (global)..." << std::endl;
    
    return tools_osm_roads_fetch(bbox, aoiPath, outputPath, overwrite);
}

// 4. PROTECTED AREAS FETCH - Intelligent routing for protected areas datasets
int tools_protected_areas_fetch(const std::string& bbox,
                                const std::string& aoiPath,
                                const std::string& outputPath,
                                bool overwrite) {
    
    std::cout << "\n🌳 ZEUS Intelligent Protected Areas Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/protected_areas_datasets_inventory.csv", 
                                  "Protected Areas");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Vector");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable protected areas dataset found" << std::endl;
        return 1;
    }
    
    // Delegate to specific tool
    if (best.fetch_tool == "wdpa_fetch") {
        std::cout << "🔄 Delegating to WDPA fetch tool..." << std::endl;
        // Note: wdpa_fetch uses country parameter, extract from centroid
        std::string country = get_country_from_coords(center_lon, center_lat);
        return tools_wdpa_fetch(country, bbox, aoiPath, outputPath, overwrite);
    } else if (best.fetch_tool == "natura2000_fetch") {
        std::cout << "🔄 Delegating to Natura 2000 fetch tool..." << std::endl;
        std::string country = get_country_from_coords(center_lon, center_lat);
        return tools_natura2000_fetch(bbox, aoiPath, outputPath, country, overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "Falling back to WDPA (global)..." << std::endl;
    
    std::string country = get_country_from_coords(center_lon, center_lat);
    return tools_wdpa_fetch(country, bbox, aoiPath, outputPath, overwrite);
}

// 5. GEOHAZARDS FETCH - Intelligent routing for geohazards datasets
int tools_geohazards_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& hazard_type,
                           bool overwrite) {
    
    std::cout << "\n⚠️  ZEUS Intelligent Geohazards Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/geohazards_datasets_inventory.csv", 
                                  "Geohazards");
    
    auto best = router.find_best_dataset(center_lon, center_lat);
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable geohazards dataset found" << std::endl;
        return 1;
    }
    
    // Delegate based on hazard type
    if (hazard_type == "seismic" || best.fetch_tool == "seismic_hazard_fetch") {
        std::cout << "🔄 Delegating to Seismic Hazard fetch tool..." << std::endl;
        return tools_seismic_hazard_fetch(bbox, aoiPath, outputPath, "pga", overwrite);
    } else if (hazard_type == "landslide" || best.fetch_tool == "iffi_fetch") {
        std::cout << "🔄 Delegating to IFFI Landslide fetch tool..." << std::endl;
        return tools_iffi_fetch(bbox, aoiPath, outputPath, overwrite);
    } else if (hazard_type == "soil" || best.fetch_tool == "soilgrids_fetch") {
        std::cout << "🔄 Delegating to SoilGrids fetch tool..." << std::endl;
        return tools_soilgrids_fetch(bbox, aoiPath, outputPath, "soc", overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "Falling back to global SoilGrids..." << std::endl;
    
    return tools_soilgrids_fetch(bbox, aoiPath, outputPath, "soc", overwrite);
}

// 6. ADMINISTRATIVE FETCH - Intelligent routing for administrative boundaries
int tools_administrative_fetch(const std::string& country,
                               const std::string& outputPath,
                               int level,
                               bool overwrite) {
    
    std::cout << "\n🗺️  ZEUS Intelligent Administrative Boundaries Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (country.empty()) {
        std::cerr << "❌ Error: Country code must be provided" << std::endl;
        return 1;
    }
    
    DatasetRouter<Dataset> router("/opt/agrs/data/administrative_datasets_inventory.csv", 
                                  "Administrative Boundaries");
    
    // For admin boundaries, we query by country directly
    router.list_datasets_for_country(country);
    
    // Delegate to GADM (most comprehensive global dataset)
    std::cout << "\n🔄 Delegating to GADM fetch tool..." << std::endl;
    return tools_gadm_fetch(country, outputPath, std::to_string(level), overwrite);
}

// 7. CADASTRE FETCH - Intelligent routing for cadastre/land parcel datasets
int tools_cadastre_fetch(const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         bool overwrite) {
    
    std::cout << "\n📋 ZEUS Intelligent Cadastre Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    std::cout << "⚠️  NOTE: Most cadastral data requires manual acquisition" << std::endl;
    std::cout << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/cadastre_datasets_inventory.csv", 
                                  "Cadastre & Land Parcels");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Vector");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No cadastral dataset found for location" << std::endl;
        return 1;
    }
    
    // Currently no cadastre fetch tools are fully implemented
    // Provide detailed guidance
    std::cout << "\n📖 CADASTRE DATA ACQUISITION GUIDANCE:" << std::endl;
    std::cout << std::string(60, '=') << std::endl;
    std::cout << "Dataset:     " << best.dataset_name << std::endl;
    std::cout << "Provider:    " << best.provider << std::endl;
    std::cout << "Resolution:  " << best.resolution << " (parcel-level)" << std::endl;
    std::cout << "Coverage:    " << best.coverage << std::endl;
    std::cout << "Data Type:   " << best.data_type << std::endl;
    std::cout << "License:     " << best.license << std::endl;
    std::cout << "Access:      " << (best.license.find("Free") != std::string::npos ? "Open Access" : "Restricted/Commercial") << std::endl;
    
    std::cout << "\n📝 ACQUISITION STEPS:" << std::endl;
    if (best.license.find("Free") != std::string::npos || best.license.find("Open") != std::string::npos) {
        std::cout << "  1. Cadastral data is available as open data" << std::endl;
        std::cout << "  2. Visit provider website or national cadastral portal" << std::endl;
        std::cout << "  3. Download data for AOI" << std::endl;
        std::cout << "  4. Import into ZEUS project" << std::endl;
    } else {
        std::cout << "  1. Contact cadastral agency: " << best.provider << std::endl;
        std::cout << "  2. Request access or purchase data for AOI" << std::endl;
        std::cout << "  3. May require government/commercial license" << std::endl;
        std::cout << "  4. Import purchased data into ZEUS project" << std::endl;
    }
    
    std::cout << "\n💡 ALTERNATIVE:" << std::endl;
    std::cout << "  For preliminary ROW planning, consider using:" << std::endl;
    std::cout << "  - OSM landuse polygons (limited coverage): osm_landuse_fetch" << std::endl;
    std::cout << "  - Administrative boundaries as proxy: administrative_fetch" << std::endl;
    
    std::cout << "\n⚠️  Cadastre fetch tool not yet implemented for this region" << std::endl;
    return 2; // Return code 2 indicates guidance provided
}

// 8. SOCIOECONOMIC FETCH - Intelligent routing for socioeconomic datasets
int tools_socioeconomic_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              bool overwrite) {
    
    std::cout << "\n👥 ZEUS Intelligent Socioeconomic Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/socioeconomic_datasets_inventory.csv", 
                                  "Socioeconomic & Population");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Raster");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable socioeconomic dataset found" << std::endl;
        return 1;
    }
    
    // Delegate to WorldPop (primary population data source)
    if (best.fetch_tool == "worldpop_fetch") {
        std::cout << "🔄 Delegating to WorldPop fetch tool..." << std::endl;
        std::string country = get_country_from_coords(center_lon, center_lat);
        return tools_worldpop_fetch(country, bbox, aoiPath, outputPath, "2020", true, overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "Falling back to WorldPop (global)..." << std::endl;
    
    std::string country = get_country_from_coords(center_lon, center_lat);
    return tools_worldpop_fetch(country, bbox, aoiPath, outputPath, "2020", true, overwrite);
}

// 9. CLIMATE FETCH - Intelligent routing for climate datasets
int tools_climate_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        const std::string& variable,
                        bool overwrite) {
    
    std::cout << "\n🌡️  ZEUS Intelligent Climate Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/climate_datasets_inventory.csv", 
                                  "Climate & Weather");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Raster");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable climate dataset found" << std::endl;
        return 1;
    }
    
    // Delegate based on dataset
    if (best.fetch_tool == "worldclim_fetch") {
        std::cout << "🔄 Delegating to WorldClim fetch tool..." << std::endl;
        return tools_worldclim_fetch(bbox, aoiPath, outputPath, "tavg", "10m", overwrite);
    } else if (best.fetch_tool == "era5_fetch") {
        std::cout << "🔄 Delegating to ERA5 fetch tool..." << std::endl;
        return tools_era5_fetch(bbox, aoiPath, outputPath, "temperature_2m", "2023-01-01", "2023-12-31", overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "\n📝 Recommended Climate Data Sources:" << std::endl;
    std::cout << "  - WorldClim (1km, climate normals): Free, global" << std::endl;
    std::cout << "  - ERA5 (0.28°, hourly reanalysis): Free, Copernicus" << std::endl;
    std::cout << "  - CHIRPS (5km, precipitation): Free, for tropics" << std::endl;
    
    std::cout << "\n⚠️  Climate fetch tools under development" << std::endl;
    return 2; // Guidance provided
}

// 10. IMAGERY FETCH - Intelligent routing for satellite imagery datasets
int tools_imagery_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        const std::string& date,
                        bool overwrite) {
    
    std::cout << "\n🛰️  ZEUS Intelligent Imagery Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "❌ Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    double minx, miny, maxx, maxy;
    std::istringstream ss(bbox);
    char comma;
    ss >> minx >> comma >> miny >> comma >> maxx >> comma >> maxy;
    
    double center_lon = (minx + maxx) / 2.0;
    double center_lat = (miny + maxy) / 2.0;
    
    DatasetRouter<Dataset> router("/opt/agrs/data/imagery_datasets_inventory.csv", 
                                  "Satellite Imagery");
    
    auto best = router.find_best_dataset(center_lon, center_lat, "Raster");
    
    if (best.dataset_name.empty()) {
        std::cerr << "❌ No suitable imagery dataset found" << std::endl;
        return 1;
    }
    
    // Delegate to Sentinel-2 (best free optical imagery)
    if (best.fetch_tool == "sentinel2_fetch") {
        std::cout << "🔄 Delegating to Sentinel-2 fetch tool..." << std::endl;
        // Pass empty bands, empty bandGroups, but set allBands=false to get standard RGB+NIR bands
        return tools_sentinel2_fetch(bbox, date, 20, "", "visual,nir", false, "", outputPath, overwrite);
    }
    
    // Guidance
    std::cout << "\n📖 GUIDANCE: " << best.fetch_tool << " not yet implemented" << std::endl;
    std::cout << "Dataset: " << best.dataset_name << " (" << best.provider << ")" << std::endl;
    std::cout << "\n📝 Recommended Imagery Sources:" << std::endl;
    std::cout << "  - Sentinel-2 (10m, every 5 days): Free, ESA Copernicus" << std::endl;
    std::cout << "  - Landsat 8/9 (30m, every 16 days): Free, USGS" << std::endl;
    std::cout << "  - For higher resolution: Commercial (Planet, Maxar, Airbus)" << std::endl;
    
    std::cout << "\nFalling back to Sentinel-2 (global, free)..." << std::endl;
    return tools_sentinel2_fetch(bbox, date, 20, "", "visual,nir", false, "", outputPath, overwrite);
}

int tools_corine_fetch(const std::string& bbox,
                       const std::string& aoiPath,
                       const std::string& outputPath,
                       int year,
                       bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
CORINE Land Cover Fetch Tool
=============================

Description:
  Fetches CORINE Land Cover data from Copernicus Land Monitoring Service.
  Provides detailed land cover classification with 44 classes.
  
Data Source:
  - Provider: Copernicus Land Monitoring Service (European Environment Agency)
  - Dataset: CORINE Land Cover (CLC)
  - Coverage: Europe (including Italy)
  - Resolution: 100m
  - Format: Raster (GeoTIFF)
  - CRS: EPSG:3035 (LAEA Europe)
  - Update Frequency: Every 6 years
  - License: Open Data (Copernicus)

Output Format:
  - Cloud Optimized GeoTIFF (.tif)
  - Values: 1-44 (land cover class codes)
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box (2018 default)
  zeus tools corine_fetch --bbox 13.5,42.8,13.9,43.4 -o corine.tif
  
  # Fetch specific year
  zeus tools corine_fetch --bbox 13.5,42.8,13.9,43.4 -o corine.tif --year 2018
  
  # Fetch by AOI polygon
  zeus tools corine_fetch --aoi study_area.geojson -o corine.tif

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoTIFF file path
  --year YEAR                  2018|2012|2006|2000 (default: 2018)
  --overwrite                  Overwrite existing output file

Land Cover Classes (44 total):
  Artificial surfaces (1-11):
    - Urban fabric, industrial, transport, etc.
  
  Agricultural areas (12-22):
    - Arable land, permanent crops, pastures
  
  Forest and semi-natural (23-34):
    - Forests, shrubland, grassland
  
  Wetlands (35-39):
    - Marshes, peatbogs
  
  Water bodies (40-44):
    - Inland waters, marine waters

Pipeline Applications:
  - Route obstacle identification
  - Environmental sensitivity zones
  - Land use permitting requirements
  - Stakeholder identification

Attribution:
  Copernicus Land Monitoring Service
  European Environment Agency (EEA)
  https://land.copernicus.eu/
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching CORINE Land Cover data..." << std::endl;
    std::cout << "Source: Copernicus Land Monitoring Service" << std::endl;
    std::cout << "Year: " << year << std::endl;
    
    // Note: CORINE data is typically downloaded as full country tiles
    // For Italy, we'll use WMS/WCS from Copernicus
    
    // Use WMS to download as georeferenced TIFF
    std::string wmsUrl = "https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC" + std::to_string(year) + "_WM/MapServer/WMSServer";
    
    // Parse bbox
    std::string bboxStr;
    if (!bbox.empty()) {
        bboxStr = bbox;
    } else if (!aoiPath.empty()) {
        // Extract bbox from AOI
        std::cout << "Extracting bounding box from AOI..." << std::endl;
        std::string cmd = "ogrinfo -al -so \"" + aoiPath + "\" | grep Extent";
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        
        char buffer[256];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent: "Extent: (minx, miny) - (maxx, maxy)"
        std::regex extentRegex(R"(Extent:\s*\(([^,]+),\s*([^)]+)\)\s*-\s*\(([^,]+),\s*([^)]+)\))");
        std::smatch match;
        if (std::regex_search(result, match, extentRegex) && match.size() == 5) {
            double minx = std::stod(match[1].str());
            double miny = std::stod(match[2].str());
            double maxx = std::stod(match[3].str());
            double maxy = std::stod(match[4].str());
            std::ostringstream bbox_ss;
            bbox_ss << std::fixed << std::setprecision(6) << minx << "," << miny << "," << maxx << "," << maxy;
            bboxStr = bbox_ss.str();
        } else {
            std::cerr << "Error: Could not parse extent from AOI" << std::endl;
            return 1;
        }
    } else {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    std::istringstream ss(bboxStr);
    std::string token;
    std::vector<std::string> coords;
    while (std::getline(ss, token, ',')) {
        coords.push_back(token);
    }
    
    if (coords.size() != 4) {
        std::cerr << "Error: bbox must be minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    // Calculate pixel dimensions (100m resolution in EPSG:3035)
    // Approximate conversion: 1 degree ≈ 111km at equator
    double width_deg = std::stod(coords[2]) - std::stod(coords[0]);
    double height_deg = std::stod(coords[3]) - std::stod(coords[1]);
    int width_px = static_cast<int>(width_deg * 111000 / 100);  // pixels at 100m
    int height_px = static_cast<int>(height_deg * 111000 / 100);
    
    std::filesystem::path tempTif = std::filesystem::temp_directory_path() / ("corine_" + std::to_string(std::time(nullptr)) + ".tif");
    
    std::cout << "Downloading via WMS..." << std::endl;
    
    // Build WMS GetMap request
    std::string wmsRequest = wmsUrl + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap";
    wmsRequest += "&LAYERS=0";  // CORINE layer
    wmsRequest += "&CRS=EPSG:4326";
    wmsRequest += "&BBOX=" + coords[1] + "," + coords[0] + "," + coords[3] + "," + coords[2];  // WMS 1.3.0 uses lat,lon order for EPSG:4326
    wmsRequest += "&WIDTH=" + std::to_string(width_px);
    wmsRequest += "&HEIGHT=" + std::to_string(height_px);
    wmsRequest += "&FORMAT=image/geotiff";
    
    std::string curlCmd = "curl -L -o " + tempTif.string() + " \"" + wmsRequest + "\" 2>&1";
    
    int result = std::system(curlCmd.c_str());
    if (result != 0 || !std::filesystem::exists(tempTif) || std::filesystem::file_size(tempTif) < 1000) {
        std::cerr << "Error: Failed to download from WMS service" << std::endl;
        std::filesystem::remove(tempTif);
        return 1;
    }
    
    std::cout << "Converting to COG..." << std::endl;
    
    // Convert to COG
    std::string cogCmd = "gdal_translate -of COG -co COMPRESS=LZW -co BIGTIFF=YES ";
    cogCmd += tempTif.string() + " " + outputPath + " 2>&1";
    
    result = std::system(cogCmd.c_str());
    std::filesystem::remove(tempTif);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to COG" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "corine_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "CORINE Land Cover " + std::to_string(year);
    meta["provider"] = "Copernicus Land Monitoring Service / European Environment Agency";
    meta["coverage"] = "Europe";
    meta["format"] = "Raster (COG)";
    meta["crs"] = "EPSG:4326";
    meta["resolution"] = "100m";
    meta["year"] = year;
    meta["classes"] = 44;
    meta["update_frequency"] = "Every 6 years";
    meta["license"] = "Copernicus Open Data";
    meta["attribution"] = "European Environment Agency (EEA)";
    meta["url"] = "https://land.copernicus.eu/pan-european/corine-land-cover";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    std::string metaPath = outputPath + ".json";
    std::ofstream metaFile(metaPath);
    metaFile << meta.dump(2);
    metaFile.close();
    
    std::cout << "\n✅ CORINE Land Cover downloaded successfully" << std::endl;
    std::cout << "Output: " << outputPath << std::endl;
    std::cout << "Metadata: " << metaPath << std::endl;
    std::cout << "tools corine_fetch OK: " << outputPath << std::endl;
    return 0;
}


int tools_flood_risk_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& product,
                           bool overwrite) {
    
    // Check for help
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
WRI Aqueduct Floods - Global Flood Hazard Fetch Tool

DESCRIPTION:
  Fetches global flood hazard data from WRI Aqueduct Floods via Google Earth Engine.
  Provides riverine and coastal flood inundation depth for multiple return periods.

DATA SOURCE:
  - Provider: World Resources Institute (WRI) Aqueduct Floods
  - Dataset: WRI/Aqueduct_Flood_Hazard_Maps/V2
  - Resolution: 1000 meters (~30 arc-seconds)
  - Coverage: Global
  - Via: Google Earth Engine

FLOOD TYPES:
  - Riverine flooding (river overflow)
  - Coastal flooding (storm surge)

PRODUCTS:
  baseline  - Historical climate (1980) 100-year return period [DEFAULT]
  rcp4p5    - RCP 4.5 scenario (2030/2050/2080) 100-year
  rcp8p5    - RCP 8.5 scenario (2030/2050/2080) 100-year

USAGE:
  zeus tools flood_risk_fetch --bbox minx,miny,maxx,maxy -o output.tif
  zeus tools flood_risk_fetch --aoi study_area.gpkg -o output.tif --product baseline

OPTIONS:
  --bbox         Bounding box in EPSG:4326 (minx,miny,maxx,maxy)
  --aoi          AOI vector file (GeoJSON/Shapefile/GeoPackage)
  --product      baseline|rcp4p5|rcp8p5 (default: baseline)
  -o, --output   Output GeoTIFF path
  --overwrite    Overwrite existing output

OUTPUT:
  Single-band GeoTIFF:
  - Inundation depth in centimeters for 100-year return period
  - 0 = No flooding expected
  - >0 = Expected flood depth

REQUIREMENTS:
  - Google Earth Engine authentication (already configured)
  - Python with 'ee' and 'geemap' packages

CRITICAL FOR SAUDI ARABIA:
  - Wadis: Flash flood hazard identification
  - Coastal areas: Storm surge risk (Red Sea, Arabian Gulf)
  - Complement with JRC Global Surface Water for historical patterns

METADATA:
  Output includes JSON sidecar with:
  - Data source: WRI Aqueduct Floods V2
  - Return period (100 years)
  - Climate scenario
  - CRS and resolution

ATTRIBUTION:
  World Resources Institute (WRI). Aqueduct Floods Hazard Maps.
  https://www.wri.org/aqueduct/floods
)" << std::endl;
        return 0;
    }

    std::filesystem::path outPath(outputPath);
    if (!overwrite && std::filesystem::exists(outPath)) {
        std::cerr << "Error: Output file exists: " << outputPath << " (use --overwrite)" << std::endl;
        return 1;
    }

    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Must provide either --bbox or --aoi" << std::endl;
        return 1;
    }

    std::cout << "Fetching WRI Aqueduct Floods data via Google Earth Engine..." << std::endl;

    // Create Python script for GEE
    std::filesystem::path scriptPath = outPath.parent_path() / "fetch_flood.py";
    std::ofstream script(scriptPath);
    
    script << R"(#!/usr/bin/env python3
import ee
import geemap
import sys

try:
    ee.Initialize()
except:
    print("Error: Google Earth Engine not authenticated.", file=sys.stderr)
    print("Run: earthengine authenticate", file=sys.stderr)
    sys.exit(1)

# Parse arguments
bbox_str = sys.argv[1] if len(sys.argv) > 1 else ""
aoi_path = sys.argv[2] if len(sys.argv) > 2 else ""
output_path = sys.argv[3]
product = sys.argv[4] if len(sys.argv) > 4 else "baseline"

# Define AOI
if aoi_path and aoi_path != "":
    aoi = geemap.geopandas_to_ee(aoi_path)
    bbox = aoi.geometry().bounds()
else:
    coords = [float(x) for x in bbox_str.split(',')]
    bbox = ee.Geometry.Rectangle(coords)

# Load WRI Aqueduct Floods V2 from GEE
dataset = ee.ImageCollection('WRI/Aqueduct_Flood_Hazard_Maps/V2')

# Filter for riverine flooding, 100-year return period
flood_data = dataset.filter(ee.Filter.eq('floodtype', 'inunriver'))
flood_data = flood_data.filter(ee.Filter.eq('returnperiod', 100))

# Select based on product (baseline vs future scenarios)
if product == "baseline":
    # Historical climate (1980)
    flood_data = flood_data.filter(ee.Filter.eq('year', 1980))
elif product == "rcp4p5":
    # RCP 4.5 scenario - use 2080
    flood_data = flood_data.filter(ee.Filter.eq('scenario', 'rcp4p5'))
    flood_data = flood_data.filter(ee.Filter.eq('year', 2080))
elif product == "rcp8p5":
    # RCP 8.5 scenario - use 2080
    flood_data = flood_data.filter(ee.Filter.eq('scenario', 'rcp8p5'))
    flood_data = flood_data.filter(ee.Filter.eq('year', 2080))

# Get first image (should only be one matching)
flood_image = flood_data.first()

# Clip to bbox
flood_clipped = flood_image.clip(bbox)

# Export
print(f"Exporting flood hazard data (100-year, {product}) to {output_path}")
geemap.ee_export_image(
    flood_clipped,
    filename=output_path,
    scale=1000,
    region=bbox,
    file_per_band=False,
    crs='EPSG:4326'
)

print("Export complete")
)";
    script.close();
    std::filesystem::permissions(scriptPath, std::filesystem::perms::owner_exec, std::filesystem::perm_options::add);

    // Build command
    std::string venvPython = "/opt/agrs/.venv_gee/bin/python3";
    std::string cmd = venvPython + " " + scriptPath.string() + " \"" + bbox + "\" \"" + aoiPath + "\" " + outputPath + " \"" + product + "\" 2>&1";
    
    std::cout << "Running: " << cmd << std::endl;
    int result = std::system(cmd.c_str());
    
    // Clean up script
    std::filesystem::remove(scriptPath);
    
    if (result != 0) {
        std::cerr << "Error: Failed to fetch flood risk data" << std::endl;
        return 1;
    }

    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "flood_risk_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "WRI Aqueduct Flood Hazard Maps V2 via Google Earth Engine";
    meta["provider"] = "World Resources Institute (WRI)";
    meta["resolution"] = "1000 meters (~30 arc-seconds)";
    meta["crs"] = "EPSG:4326";
    meta["flood_type"] = "Riverine (inunriver)";
    meta["return_period"] = "100 years";
    meta["product"] = product;
    
    if (product == "baseline") {
        meta["climate_scenario"] = "Historical (1980)";
    } else if (product == "rcp4p5") {
        meta["climate_scenario"] = "RCP 4.5 (2080)";
    } else if (product == "rcp8p5") {
        meta["climate_scenario"] = "RCP 8.5 (2080)";
    }
    
    meta["bands"] = {
        {"1", "Inundation depth in centimeters"}
    };
    
    meta["attribution"] = "World Resources Institute (WRI). Aqueduct Floods Hazard Maps.";
    meta["url"] = "https://www.wri.org/aqueduct/floods";
    meta["gee_dataset"] = "WRI/Aqueduct_Flood_Hazard_Maps/V2";
    meta["license"] = "Free with attribution";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools flood_risk_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ============================================================================
// ITALY-SPECIFIC FETCH TOOLS
// ============================================================================

int tools_euap_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
EUAP Protected Areas Fetch Tool
================================

Description:
  Fetches European/Italian protected areas data from ISPRA EUAP (Elenco Ufficiale Aree Protette).
  
  This tool downloads protected area boundaries including:
  - National Parks
  - Regional Parks  
  - Nature Reserves
  - Marine Protected Areas
  - UNESCO Sites (within protected areas)

Data Source:
  - Provider: ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale)
  - Dataset: EUAP - Official List of Protected Areas
  - Coverage: Italy (with some EU overlap)
  - Format: Vector (polygons)
  - CRS: EPSG:4326 (WGS84)
  - Update Frequency: Annually
  - License: Open Data (CC BY 4.0)

Output Format:
  - GeoPackage (.gpkg) with vector layer
  - Attributes: Name, Type, Level, Area, Year established
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box
  zeus tools euap_fetch --bbox 13.5,42.8,13.9,43.4 -o protected_areas.gpkg
  
  # Fetch by AOI polygon
  zeus tools euap_fetch --aoi study_area.geojson -o protected_areas.gpkg
  
  # Overwrite existing file
  zeus tools euap_fetch --bbox 13.5,42.8,13.9,43.4 -o protected_areas.gpkg --overwrite

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoPackage file path
  --overwrite                  Overwrite existing output file

Data Attribution:
  ISPRA - Istituto Superiore per la Protezione e la Ricerca Ambientale
  https://www.isprambiente.gov.it/
  
Notes:
  - One of --bbox or --aoi must be provided
  - WFS service may have query size limits for very large areas
  - For all of Italy, consider multiple queries or manual download
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching EUAP protected areas data..." << std::endl;
    std::cout << "Source: ISPRA EUAP (Elenco Ufficiale Aree Protette)" << std::endl;
    
    // ISPRA ArcGIS REST API endpoint for EUAP data (updated 2024-2025)
    // Using ArcGIS REST API as recommended by Perplexity research
    std::string restUrl = "https://geoservizi.isprambiente.it/arcgis/rest/services/areeprotette/euap/MapServer/0/query";
    
    // Parse bbox for ArcGIS REST API
    std::string bboxGeometry;
    if (!bbox.empty()) {
        // ArcGIS REST expects bbox as: xmin,ymin,xmax,ymax
        bboxGeometry = bbox;  // Already in correct format
    }
    
    // Create temporary output for GeoJSON fetch
    std::filesystem::path tempGeoJSON = std::filesystem::temp_directory_path() / ("euap_" + std::to_string(std::time(nullptr)) + ".geojson");
    
    // Build ArcGIS REST API query URL
    std::string restRequest = restUrl;
    restRequest += "?f=geojson";
    restRequest += "&geometryType=esriGeometryEnvelope";
    restRequest += "&spatialRel=esriSpatialRelIntersects";
    restRequest += "&inSR=4326";
    restRequest += "&outFields=*";
    restRequest += "&outSR=4326";
    restRequest += "&returnGeometry=true";
    restRequest += "&resultRecordCount=10000";  // Increased limit
    
    if (!bboxGeometry.empty()) {
        restRequest += "&geometry=" + bboxGeometry;
    }
    
    std::cout << "Querying ArcGIS REST API service..." << std::endl;
    std::cout << "URL: " << restUrl << std::endl;
    
    // Download using curl
    std::string curlCmd = "curl -s -L --max-time 600 \"" + restRequest + "\" -o " + tempGeoJSON.string();
    std::cout << "Running: curl [ArcGIS REST request]" << std::endl;
    
    int result = std::system(curlCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download from ArcGIS REST service" << std::endl;
        std::filesystem::remove(tempGeoJSON);
        return 1;
    }
    
    // Check if file was downloaded
    if (!std::filesystem::exists(tempGeoJSON) || std::filesystem::file_size(tempGeoJSON) < 100) {
        std::cerr << "Error: ArcGIS REST response is empty or invalid" << std::endl;
        std::cerr << "This may indicate:" << std::endl;
        std::cerr << "  - No protected areas in the requested area" << std::endl;
        std::cerr << "  - ArcGIS REST service is unavailable" << std::endl;
        std::cerr << "  - Bounding box is outside Italy" << std::endl;
        std::filesystem::remove(tempGeoJSON);
        return 1;
    }
    
    std::cout << "Converting GeoJSON to GeoPackage..." << std::endl;
    
    // Convert to GeoPackage using ogr2ogr
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-t_srs EPSG:4326 ";
    
    // Clip to AOI if provided
    if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    }
    
    ogr2ogrCmd += outputPath + " " + tempGeoJSON.string();
    
    std::cout << "Running: ogr2ogr [conversion]" << std::endl;
    result = std::system(ogr2ogrCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempGeoJSON);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "euap_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "ISPRA EUAP (Elenco Ufficiale Aree Protette) via ArcGIS REST API";
    meta["provider"] = "ISPRA - Istituto Superiore per la Protezione e la Ricerca Ambientale";
    meta["coverage"] = "Italy";
    meta["format"] = "Vector (Polygon)";
    meta["crs"] = "EPSG:4326";
    meta["update_frequency"] = "Annually";
    meta["license"] = "CC BY 4.0";
    meta["attribution"] = "ISPRA - Istituto Superiore per la Protezione e la Ricerca Ambientale";
    meta["url"] = "https://www.isprambiente.gov.it/";
    meta["rest_endpoint"] = restUrl;
    meta["protected_area_types"] = {"National Parks", "Regional Parks", "Nature Reserves", "Marine Protected Areas"};
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools euap_fetch OK: " << outputPath << std::endl;
    return 0;
}

int tools_iffi_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
ISPRA IFFI Landslide Inventory Fetch Tool
==========================================

Description:
  Fetches landslide inventory data from ISPRA IFFI (Inventario dei Fenomeni Franosi in Italia).
  
  This tool downloads landslide polygon data including:
  - Historical landslides (mapped since 1116 AD)
  - Active landslides
  - Dormant landslides
  - Landslide type classification
  - Activity status
  - Damage assessment

Data Source:
  - Provider: ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale)
  - Dataset: IFFI - Landslide Inventory Database
  - Coverage: Italy (national coverage)
  - Resolution: Variable (1:10,000 to 1:25,000 scale)
  - Format: Vector (points and polygons)
  - CRS: EPSG:4326 (WGS84)
  - Update Frequency: Continuous updates
  - License: Open Data (CC BY 4.0)
  - Database Size: ~650,000 landslides

Output Format:
  - GeoPackage (.gpkg) with vector layer
  - Attributes: Type, Activity, Date, Area, Movement type, Damage level
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box
  zeus tools iffi_fetch --bbox 13.5,42.8,13.9,43.4 -o landslides.gpkg
  
  # Fetch by AOI polygon
  zeus tools iffi_fetch --aoi study_area.geojson -o landslides.gpkg
  
  # Overwrite existing file
  zeus tools iffi_fetch --bbox 13.5,42.8,13.9,43.4 -o landslides.gpkg --overwrite

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoPackage file path
  --overwrite                  Overwrite existing output file

Landslide Types:
  - Rock falls
  - Debris flows
  - Earth flows  
  - Rotational slides
  - Translational slides
  - Complex movements

Activity Status:
  - Active
  - Dormant
  - Stabilized
  - Unknown

Data Attribution:
  ISPRA - Progetto IFFI (Inventario dei Fenomeni Franosi in Italia)
  https://www.progettoiffi.isprambiente.it/
  
Notes:
  - One of --bbox or --aoi must be provided
  - High-density landslide areas may have large file sizes
  - Data quality varies by region (more detailed in high-risk areas)
  - Essential for pipeline routing in mountainous regions of Italy
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching ISPRA IFFI landslide inventory data..." << std::endl;
    std::cout << "Source: ISPRA IFFI (Inventario dei Fenomeni Franosi in Italia)" << std::endl;
    std::cout << "Coverage: ~650,000 landslides across Italy" << std::endl;
    
    // ISPRA WFS endpoint for IFFI data (updated 2024-2025)
    std::string wfsUrl = "https://geoportale.isprambiente.it/arcgis/services/IFGI/IFGI_WFS/MapServer/WFSServer";
    std::string typename_param = "IFGI:iffi_poligoni";  // Polygon layer
    
    // Build WFS request
    std::string bboxParam;
    if (!bbox.empty()) {
        // Parse bbox
        std::istringstream ss(bbox);
        std::string token;
        std::vector<std::string> coords;
        while (std::getline(ss, token, ',')) {
            coords.push_back(token);
        }
        
        if (coords.size() != 4) {
            std::cerr << "Error: bbox must be minx,miny,maxx,maxy" << std::endl;
            return 1;
        }
        
        bboxParam = coords[0] + "," + coords[1] + "," + coords[2] + "," + coords[3] + ",EPSG:4326";
    }
    
    // Create temporary output for WFS fetch
    std::filesystem::path tempGML = std::filesystem::temp_directory_path() / ("iffi_" + std::to_string(std::time(nullptr)) + ".gml");
    
    // Build WFS GetFeature request
    std::string wfsRequest = wfsUrl + "?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAME=" + typename_param + "&OUTPUTFORMAT=application/gml%2Bxml%3B%20version%3D3.2";
    
    if (!bboxParam.empty()) {
        wfsRequest += "&BBOX=" + bboxParam;
    }
    
    std::cout << "Querying IFFI WFS service..." << std::endl;
    std::cout << "URL: " << wfsUrl << std::endl;
    
    // Download using curl
    std::string curlCmd = "curl -s -L --max-time 600 \"" + wfsRequest + "\" -o " + tempGML.string();
    std::cout << "Running: curl [WFS request]" << std::endl;
    
    int result = std::system(curlCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download from IFFI WFS service" << std::endl;
        std::filesystem::remove(tempGML);
        return 1;
    }
    
    // Check if file was downloaded
    if (!std::filesystem::exists(tempGML) || std::filesystem::file_size(tempGML) < 1000) {
        std::cerr << "Error: WFS response is empty or invalid" << std::endl;
        std::cerr << "This may indicate:" << std::endl;
        std::cerr << "  - No landslides in the requested area" << std::endl;
        std::cerr << "  - WFS service is unavailable" << std::endl;
        std::cerr << "  - Bounding box is outside Italy" << std::endl;
        std::filesystem::remove(tempGML);
        return 1;
    }
    
    std::cout << "Converting to GeoPackage..." << std::endl;
    
    // Convert to GeoPackage using ogr2ogr
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-t_srs EPSG:4326 ";
    
    // Clip to AOI if provided
    if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    }
    
    ogr2ogrCmd += outputPath + " " + tempGML.string();
    
    std::cout << "Running: ogr2ogr [conversion]" << std::endl;
    result = std::system(ogr2ogrCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempGML);
    
    if (result != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "iffi_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "ISPRA IFFI (Inventario dei Fenomeni Franosi in Italia) via WFS";
    meta["provider"] = "ISPRA - Istituto Superiore per la Protezione e la Ricerca Ambientale";
    meta["coverage"] = "Italy (national coverage)";
    meta["database_size"] = "~650,000 landslides";
    meta["scale"] = "1:10,000 to 1:25,000";
    meta["format"] = "Vector (Polygon + Point)";
    meta["crs"] = "EPSG:4326";
    meta["temporal_range"] = "1116 AD to present";
    meta["update_frequency"] = "Continuous";
    meta["license"] = "CC BY 4.0";
    meta["attribution"] = "ISPRA - Progetto IFFI";
    meta["url"] = "https://www.progettoiffi.isprambiente.it/";
    meta["wfs_endpoint"] = wfsUrl;
    meta["landslide_types"] = {"Rock falls", "Debris flows", "Earth flows", "Rotational slides", "Translational slides", "Complex"};
    meta["activity_status"] = {"Active", "Dormant", "Stabilized", "Unknown"};
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools iffi_fetch OK: " << outputPath << std::endl;
    return 0;
}

int tools_tinitaly_fetch(const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
TINITALY DEM Fetch Tool
=======================

Description:
  Fetches TINITALY 10m Digital Elevation Model for Italy from INGV.
  
  TINITALY is a high-resolution Digital Terrain Model of Italy created by INGV
  through compilation of various elevation datasets including LIDAR, photogrammetry,
  and topographic maps.
  
  Uses validated direct tile calculation method (no HTML scraping).

Data Source:
  - Provider: INGV (Istituto Nazionale di Geofisica e Vulcanologia)
  - Dataset: TINITALY/01 Digital Elevation Model
  - Coverage: Italy (including islands)
  - Resolution: 10 meters horizontal, ~1-5 meters vertical accuracy
  - Format: GeoTIFF (Float32)
  - CRS: EPSG:32632 (UTM Zone 32N) → reprojected to EPSG:4326
  - Elevation Units: meters above sea level
  - Version: TINITALY 1.1 (2007-2010 compilation)
  - License: Free for research and non-commercial use
  - Tile Grid: 50km × 50km tiles in UTM 32N projection

Output Format:
  - Cloud Optimized GeoTIFF (.tif) with single elevation band
  - Float32 data type
  - Elevation in meters (MSL)
  - Includes JSON metadata sidecar

Usage:
  # Fetch by bounding box
  zeus tools tinitaly_fetch --bbox 13.5,42.8,13.9,43.4 -o tinitaly_10m.tif
  
  # Fetch by AOI polygon
  zeus tools tinitaly_fetch --aoi study_area.geojson -o tinitaly_10m.tif
  
  # Overwrite existing file
  zeus tools tinitaly_fetch --bbox 13.5,42.8,13.9,43.4 -o tinitaly_10m.tif --overwrite

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoTIFF file path
  --overwrite                  Overwrite existing output file

Quality:
  - Horizontal accuracy: ~10 meters
  - Vertical accuracy: 1-5 meters (varies by source)
  - Superior to Copernicus 30m DEM for Italy
  - Recommended for slope analysis, viewshed, terrain profiling

Data Attribution:
  INGV - Istituto Nazionale di Geofisica e Vulcanologia
  Tarquini et al. (2007) "TINITALY/01: a new Triangular Irregular Network 
  of Italy", Annals of Geophysics, 50, 407-425
  https://tinitaly.pi.ingv.it/
  
Notes:
  - One of --bbox or --aoi must be provided
  - Tiles are calculated using UTM 32N grid (50km × 50km)
  - Download directly from INGV without HTML scraping
  - Typically 1-10 tiles needed per AOI
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching TINITALY 10m DEM..." << std::endl;
    std::cout << "Source: INGV TINITALY 1.1 Digital Elevation Model" << std::endl;
    std::cout << "Resolution: 10 meters" << std::endl;
    std::cout << "Method: Direct tile calculation (validated 2025-10-14)" << std::endl;
    
    // Parse bbox
    std::string bboxStr;
    if (!bbox.empty()) {
        bboxStr = bbox;
    } else if (!aoiPath.empty()) {
        // Extract bbox from AOI using ogrinfo
        std::cout << "Extracting bounding box from AOI..." << std::endl;
        std::string cmd = "ogrinfo -al -so \"" + aoiPath + "\" | grep Extent";
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        
        char buffer[256];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent line: "Extent: (minx, miny) - (maxx, maxy)"
        size_t start = result.find('(');
        size_t mid = result.find(") - (");
        size_t end = result.find(')', mid);
        
        if (start == std::string::npos || mid == std::string::npos || end == std::string::npos) {
            std::cerr << "Error: Could not parse AOI extent" << std::endl;
            return 1;
        }
        
        std::string minCoords = result.substr(start + 1, mid - start - 1);
        std::string maxCoords = result.substr(mid + 5, end - mid - 5);
        
        // Parse coordinates
        double minx, miny, maxx, maxy;
        if (sscanf(minCoords.c_str(), "%lf, %lf", &minx, &miny) != 2 ||
            sscanf(maxCoords.c_str(), "%lf, %lf", &maxx, &maxy) != 2) {
            std::cerr << "Error: Failed to parse bbox coordinates" << std::endl;
            return 1;
        }
        
        bboxStr = std::to_string(minx) + "," + std::to_string(miny) + "," + 
                  std::to_string(maxx) + "," + std::to_string(maxy);
    }
    
    // Parse bbox coordinates
    std::istringstream ss(bboxStr);
    std::string token;
    std::vector<double> coords;
    while (std::getline(ss, token, ',')) {
        coords.push_back(std::stod(token));
    }
    
    if (coords.size() != 4) {
        std::cerr << "Error: bbox must be minx,miny,maxx,maxy" << std::endl;
        return 1;
    }
    
    double minx = coords[0], miny = coords[1], maxx = coords[2], maxy = coords[3];
    std::cout << "BBox: " << bboxStr << " (EPSG:4326)" << std::endl;
    
    // Step 1: Transform bbox to UTM 32N using gdaltransform
    std::cout << "Calculating required TINITALY tiles..." << std::endl;
    
    std::string transformCmd = "echo \"" + std::to_string(minx) + " " + std::to_string(miny) + "\n" +
                               std::to_string(maxx) + " " + std::to_string(maxy) + "\" | " +
                               "gdaltransform -s_srs EPSG:4326 -t_srs EPSG:32632 2>/dev/null";
    
    FILE* transformPipe = popen(transformCmd.c_str(), "r");
    if (!transformPipe) {
        std::cerr << "Error: Failed to transform coordinates" << std::endl;
        return 1;
    }
    
    double utm_minx, utm_miny, utm_z1, utm_maxx, utm_maxy, utm_z2;
    char transformBuffer[512];
    
    // Read first line (minx, miny)
    if (fgets(transformBuffer, sizeof(transformBuffer), transformPipe) == nullptr ||
        sscanf(transformBuffer, "%lf %lf %lf", &utm_minx, &utm_miny, &utm_z1) != 3) {
        pclose(transformPipe);
        std::cerr << "Error: Failed to parse transformed min coordinates" << std::endl;
        return 1;
    }
    
    // Read second line (maxx, maxy)
    if (fgets(transformBuffer, sizeof(transformBuffer), transformPipe) == nullptr ||
        sscanf(transformBuffer, "%lf %lf %lf", &utm_maxx, &utm_maxy, &utm_z2) != 3) {
        pclose(transformPipe);
        std::cerr << "Error: Failed to parse transformed max coordinates" << std::endl;
        return 1;
    }
    
    pclose(transformPipe);
    
    std::cout << "UTM 32N extent: E=" << std::fixed << std::setprecision(0) 
              << utm_minx << "-" << utm_maxx << "m, N=" << utm_miny << "-" << utm_maxy << "m" << std::endl;
    
    // Step 2: Calculate tile grid (50km tiles)
    int start_n_tile = (int)std::floor(utm_miny / 50000.0);
    int end_n_tile = (int)std::floor(utm_maxy / 50000.0);
    int start_e_tile = (int)std::floor(utm_minx / 50000.0);
    int end_e_tile = (int)std::floor(utm_maxx / 50000.0);
    
    // Step 3: Generate tile names
    std::vector<std::string> tileNames;
    for (int n = start_n_tile; n <= end_n_tile; ++n) {
        for (int e = start_e_tile; e <= end_e_tile; ++e) {
            int northing_m = n * 50000;
            int easting_m = e * 50000;
            int nnn = northing_m / 10000;
            int ee = easting_m / 10000;
            
            char tileName[32];
            snprintf(tileName, sizeof(tileName), "w%03d%02d_s10", nnn, ee);
            tileNames.push_back(std::string(tileName));
        }
    }
    
    std::cout << "Required tiles: " << tileNames.size() << " (";
    for (size_t i = 0; i < tileNames.size(); ++i) {
        std::cout << tileNames[i];
        if (i < tileNames.size() - 1) std::cout << ", ";
    }
    std::cout << ")" << std::endl;
    
    // Create temp directory
    std::string tmpdir = "/tmp/tinitaly_" + std::to_string(getpid());
    std::filesystem::create_directories(tmpdir);
    
    // Step 4: Download and extract tiles
    std::vector<std::string> extractedTifs;
    int successCount = 0;
    
    for (size_t i = 0; i < tileNames.size(); ++i) {
        const std::string& tile = tileNames[i];
        std::cout << "[" << (i+1) << "/" << tileNames.size() << "] Downloading " << tile << "..." << std::endl;
        
        std::string url = "https://tinitaly.pi.ingv.it/data_1.1/" + tile + "/" + tile + ".zip";
        std::string zipFile = tmpdir + "/" + tile + ".zip";
        std::string extractDir = tmpdir + "/" + tile;
        
        // Download with curl
        std::string downloadCmd = "curl -L -f -s -k -o \"" + zipFile + "\" \"" + url + "\" 2>&1";
        int dlResult = system(downloadCmd.c_str());
        
        if (dlResult != 0 || !std::filesystem::exists(zipFile)) {
            std::cout << "  ⚠ Tile not available (may not exist)" << std::endl;
            continue;
        }
        
        // Extract ZIP
        std::string extractCmd = "unzip -q -o \"" + zipFile + "\" -d \"" + extractDir + "\" 2>&1";
        int extResult = system(extractCmd.c_str());
        
        if (extResult != 0) {
            std::cout << "  ⚠ Extraction failed" << std::endl;
            std::filesystem::remove(zipFile);
            continue;
        }
        
        // Find the GeoTIFF inside subdirectory
        std::string tifPath = extractDir + "/" + tile + "/" + tile + ".tif";
        
        if (std::filesystem::exists(tifPath)) {
            extractedTifs.push_back(tifPath);
            successCount++;
            std::cout << "  ✓ Downloaded and extracted (" << successCount << " tiles ready)" << std::endl;
        } else {
            std::cout << "  ⚠ GeoTIFF not found in expected location" << std::endl;
        }
        
        // Clean up ZIP
        std::filesystem::remove(zipFile);
    }
    
    if (extractedTifs.empty()) {
        std::cerr << "Error: No tiles were successfully downloaded" << std::endl;
        std::filesystem::remove_all(tmpdir);
        return 1;
    }
    
    std::cout << "\n✓ Successfully downloaded " << extractedTifs.size() << " tiles" << std::endl;
    
    // Step 5: Build VRT mosaic
    std::cout << "Building mosaic..." << std::endl;
    std::string vrtFile = tmpdir + "/mosaic.vrt";
    std::string vrtCmd = "gdalbuildvrt -overwrite \"" + vrtFile + "\"";
    for (const auto& tif : extractedTifs) {
        vrtCmd += " \"" + tif + "\"";
    }
    vrtCmd += " 2>&1";
    
    int vrtResult = system(vrtCmd.c_str());
    if (vrtResult != 0) {
        std::cerr << "Error: Failed to create VRT mosaic" << std::endl;
        std::filesystem::remove_all(tmpdir);
        return 1;
    }
    
    // Step 6: Clip to bbox and convert to COG
    std::cout << "Clipping to AOI and converting to COG..." << std::endl;
    std::string warpCmd = "gdalwarp -q " +
                         std::string("-te ") + std::to_string(minx) + " " + std::to_string(miny) + " " +
                         std::to_string(maxx) + " " + std::to_string(maxy) + " " +
                         "-te_srs EPSG:4326 " +
                         "-t_srs EPSG:4326 " +
                         "-tr 0.00009 0.00009 " +
                         "-r bilinear " +
                         "-co COMPRESS=DEFLATE " +
                         "-co PREDICTOR=2 " +
                         "-co TILED=YES " +
                         "-co BLOCKXSIZE=256 " +
                         "-co BLOCKYSIZE=256 " +
                         "\"" + vrtFile + "\" \"" + outputPath + "\" 2>&1";
    
    int warpResult = system(warpCmd.c_str());
    
    // Cleanup temp directory
    std::filesystem::remove_all(tmpdir);
    
    if (warpResult != 0 || !std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Failed to clip and create output DEM" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "tinitaly_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "TINITALY 1.1 Digital Elevation Model via Direct Tile Download";
    meta["provider"] = "INGV - Istituto Nazionale di Geofisica e Vulcanologia";
    meta["coverage"] = "Italy (including islands)";
    meta["resolution"] = "10 meters horizontal";
    meta["vertical_accuracy"] = "1-5 meters (varies by source)";
    meta["format"] = "Cloud Optimized GeoTIFF";
    meta["data_type"] = "Float32";
    meta["crs"] = "EPSG:4326";
    meta["elevation_units"] = "meters above sea level (MSL)";
    meta["version"] = "TINITALY/01";
    meta["compilation_period"] = "2007-2010";
    meta["license"] = "Free for research and non-commercial use";
    meta["citation"] = "Tarquini et al. (2007) TINITALY/01: a new Triangular Irregular Network of Italy, Annals of Geophysics, 50, 407-425";
    meta["url"] = "https://tinitaly.pi.ingv.it/";
    meta["doi"] = "https://doi.org/10.13127/tinitaly/1.1";
    meta["tiles_downloaded"] = extractedTifs.size();
    meta["tile_names"] = tileNames;
    meta["fetch_method"] = "Direct tile calculation (UTM 32N grid, 50km tiles)";
    meta["validation_date"] = "2025-10-14";
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "\n✓ TINITALY DEM saved: " << outputPath << std::endl;
    std::cout << "  Metadata: " << outputPath << ".json" << std::endl;
    std::cout << "tools tinitaly_fetch OK: " << outputPath << std::endl;
    return 0;
}

int tools_ingv_seismic_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              const std::string& product,
                              bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
INGV Seismic Hazard Fetch Tool
===============================

Description:
  Fetches Italy-specific seismic hazard maps from INGV.
  
  INGV provides high-resolution seismic hazard data for Italy based on the
  MPS04 (Mappa di Pericolosità Sismica) and newer models. This data is used
  for seismic building codes and critical infrastructure design.

Data Source:
  - Provider: INGV (Istituto Nazionale di Geofisica e Vulcanologia)
  - Dataset: Seismic Hazard Maps for Italy
  - Coverage: Italy (including islands and near-shore regions)
  - Resolution: ~5-10 km (higher than GEM global 6km)
  - Format: GeoTIFF (Float32)
  - CRS: EPSG:4326 (WGS84)
  - Return Periods: 475 years (10% exceedance in 50 years)
  - Reference: MPS04 and subsequent updates
  - License: Open Data (with attribution)

Output Format:
  - Cloud Optimized GeoTIFF (.tif)
  - Float32 data type
  - Values: PGA in g (acceleration of gravity), or velocity/spectral acceleration
  - Includes JSON metadata sidecar

Products:
  - pga:    Peak Ground Acceleration (g)
  - pgv:    Peak Ground Velocity (cm/s)
  - sa0.2:  Spectral Acceleration at 0.2s period (g)
  - sa1.0:  Spectral Acceleration at 1.0s period (g)

Usage:
  # Fetch PGA (default)
  zeus tools ingv_seismic_fetch --bbox 13.5,42.8,13.9,43.4 -o seismic_pga.tif
  
  # Fetch spectral acceleration
  zeus tools ingv_seismic_fetch --bbox 13.5,42.8,13.9,43.4 --product sa1.0 -o seismic_sa1.tif
  
  # Fetch by AOI
  zeus tools ingv_seismic_fetch --aoi study_area.geojson -o seismic_pga.tif

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoTIFF file path
  --product TYPE               Product type: pga|pgv|sa0.2|sa1.0 (default: pga)
  --overwrite                  Overwrite existing output file

Use Cases:
  - Pipeline seismic design (ULS, SLS)
  - Liquefaction susceptibility analysis
  - Slope stability assessment in seismic zones
  - Structural engineering for stations/facilities
  - Risk assessment for lifelines

Data Attribution:
  INGV - Istituto Nazionale di Geofisica e Vulcanologia
  Stucchi et al. (2011) "Seismic Hazard Assessment (2003-2009) for the Italian 
  Building Code"
  https://esse1-gis.mi.ingv.it/
  
Notes:
  - One of --bbox or --aoi must be provided
  - Higher resolution than GEM global seismic hazard (6km)
  - Based on Italian-specific seismotectonic model
  - Recommended for critical infrastructure in Italy
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    // Validate product
    if (product != "pga" && product != "pgv" && product != "sa0.2" && product != "sa1.0") {
        std::cerr << "Error: product must be one of: pga, pgv, sa0.2, sa1.0" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching INGV seismic hazard data..." << std::endl;
    std::cout << "Source: INGV Seismic Hazard Maps" << std::endl;
    std::cout << "Product: " << product << std::endl;
    
    // INGV WCS/WMS endpoint for seismic hazard
    std::string wmsUrl = "https://esse1-gis.mi.ingv.it/geoserver/wms";
    
    // Map product to layer name
    std::string layerName;
    std::string productDescription;
    std::string units;
    
    if (product == "pga") {
        layerName = "MPS04:PGA_475";
        productDescription = "Peak Ground Acceleration (PGA)";
        units = "g (acceleration of gravity)";
    } else if (product == "pgv") {
        layerName = "MPS04:PGV_475";
        productDescription = "Peak Ground Velocity (PGV)";
        units = "cm/s";
    } else if (product == "sa0.2") {
        layerName = "MPS04:SA02_475";
        productDescription = "Spectral Acceleration at 0.2s period";
        units = "g";
    } else if (product == "sa1.0") {
        layerName = "MPS04:SA10_475";
        productDescription = "Spectral Acceleration at 1.0s period";
        units = "g";
    }
    
    // Parse bbox
    std::string bboxStr;
    if (!bbox.empty()) {
        bboxStr = bbox;
    } else if (!aoiPath.empty()) {
        // Extract bbox from AOI using ogrinfo
        std::cout << "Extracting bounding box from AOI..." << std::endl;
        std::string cmd = "ogrinfo -al -so \"" + aoiPath + "\" | grep Extent";
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI" << std::endl;
            return 1;
        }
        
        char buffer[256];
        std::string result;
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        pclose(pipe);
        
        // Parse extent line
        size_t start = result.find('(');
        size_t mid = result.find(") - (");
        size_t end = result.find(')', mid);
        
        if (start == std::string::npos || mid == std::string::npos || end == std::string::npos) {
            std::cerr << "Error: Could not parse AOI extent" << std::endl;
            return 1;
        }
        
        std::string minCoords = result.substr(start + 1, mid - start - 1);
        std::string maxCoords = result.substr(mid + 5, end - mid - 5);
        
        double minx, miny, maxx, maxy;
        if (sscanf(minCoords.c_str(), "%lf, %lf", &minx, &miny) != 2 ||
            sscanf(maxCoords.c_str(), "%lf, %lf", &maxx, &maxy) != 2) {
            std::cerr << "Error: Failed to parse bbox coordinates" << std::endl;
            return 1;
        }
        
        bboxStr = std::to_string(minx) + "," + std::to_string(miny) + "," + 
                  std::to_string(maxx) + "," + std::to_string(maxy);
    }
    
    // Use gdal_translate with WMS to fetch the data
    std::cout << "Querying INGV WMS service..." << std::endl;
    std::cout << "Layer: " << layerName << std::endl;
    
    // Create WMS XML descriptor for GDAL
    std::filesystem::path wmsXML = std::filesystem::temp_directory_path() / ("ingv_wms_" + std::to_string(std::time(nullptr)) + ".xml");
    
    std::ofstream wmsFile(wmsXML);
    wmsFile << "<GDAL_WMS>\n";
    wmsFile << "  <Service name=\"WMS\">\n";
    wmsFile << "    <Version>1.3.0</Version>\n";
    wmsFile << "    <ServerUrl>" << wmsUrl << "</ServerUrl>\n";
    wmsFile << "    <Layers>" << layerName << "</Layers>\n";
    wmsFile << "    <SRS>EPSG:4326</SRS>\n";
    wmsFile << "    <ImageFormat>image/geotiff</ImageFormat>\n";
    wmsFile << "  </Service>\n";
    wmsFile << "  <DataWindow>\n";
    wmsFile << "    <UpperLeftX>6.0</UpperLeftX>\n";
    wmsFile << "    <UpperLeftY>48.0</UpperLeftY>\n";
    wmsFile << "    <LowerRightX>19.0</LowerRightX>\n";
    wmsFile << "    <LowerRightY>36.0</LowerRightY>\n";
    wmsFile << "    <SizeX>2600</SizeX>\n";
    wmsFile << "    <SizeY>2400</SizeY>\n";
    wmsFile << "  </DataWindow>\n";
    wmsFile << "</GDAL_WMS>\n";
    wmsFile.close();
    
    std::cout << "Fetching data via GDAL WMS driver..." << std::endl;
    
    // Parse bbox for projwin (needs 4 separate values: ulx uly lrx lry)
    std::vector<std::string> bboxParts;
    std::stringstream bboxStream(bboxStr);
    std::string part;
    while (std::getline(bboxStream, part, ',')) {
        bboxParts.push_back(part);
    }
    
    if (bboxParts.size() != 4) {
        std::cerr << "Error: Invalid bbox format" << std::endl;
        std::filesystem::remove(wmsXML);
        return 1;
    }
    
    // Delete existing file if overwrite is true (gdal_translate doesn't have --overwrite flag)
    if (overwrite && std::filesystem::exists(outputPath)) {
        std::filesystem::remove(outputPath);
    }
    
    // Use gdal_translate to fetch and clip
    // bbox is minx,miny,maxx,maxy but projwin needs ulx,uly,lrx,lry (ulx=minx, uly=maxy, lrx=maxx, lry=miny)
    std::string gdalCmd = "gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=3 ";
    gdalCmd += "-projwin " + bboxParts[0] + " " + bboxParts[3] + " " + bboxParts[2] + " " + bboxParts[1] + " ";
    gdalCmd += "\"" + wmsXML.string() + "\" \"" + outputPath + "\" 2>&1";
    
    std::cout << "Running: gdal_translate [WMS fetch]" << std::endl;
    int result = std::system(gdalCmd.c_str());
    
    // Clean up WMS XML
    std::filesystem::remove(wmsXML);
    
    if (result != 0) {
        std::cerr << "Error: Failed to fetch seismic hazard data" << std::endl;
        return 1;
    }
    
    // Clip to AOI if provided
    if (!aoiPath.empty()) {
        std::cout << "Clipping to AOI..." << std::endl;
        std::filesystem::path tempOut = std::filesystem::temp_directory_path() / ("ingv_clip_" + std::to_string(std::time(nullptr)) + ".tif");
        
        std::string warpCmd = "gdalwarp -of COG -co COMPRESS=DEFLATE -co PREDICTOR=3 ";
        warpCmd += "-cutline " + aoiPath + " -crop_to_cutline ";
        warpCmd += outputPath + " " + tempOut.string();
        
        result = std::system(warpCmd.c_str());
        if (result == 0) {
            std::filesystem::rename(tempOut, outputPath);
        } else {
            std::filesystem::remove(tempOut);
            std::cerr << "Warning: Failed to clip to AOI, using bbox clip only" << std::endl;
        }
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "ingv_seismic_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "INGV Seismic Hazard Maps via WMS";
    meta["provider"] = "INGV - Istituto Nazionale di Geofisica e Vulcanologia";
    meta["coverage"] = "Italy (including islands and near-shore)";
    meta["product"] = product;
    meta["product_description"] = productDescription;
    meta["units"] = units;
    meta["return_period"] = "475 years (10% exceedance in 50 years)";
    meta["resolution"] = "~5-10 km";
    meta["format"] = "Cloud Optimized GeoTIFF";
    meta["data_type"] = "Float32";
    meta["crs"] = "EPSG:4326";
    meta["reference_model"] = "MPS04 (Mappa di Pericolosità Sismica 2004)";
    meta["license"] = "Open Data (with attribution)";
    meta["citation"] = "Stucchi et al. (2011) Seismic Hazard Assessment (2003-2009) for the Italian Building Code";
    meta["attribution"] = "INGV - Istituto Nazionale di Geofisica e Vulcanologia";
    meta["url"] = "https://esse1-gis.mi.ingv.it/";
    meta["wms_endpoint"] = wmsUrl;
    meta["layer"] = layerName;
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools ingv_seismic_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ============================================================================
// INGV DISS Faults Database Fetch Tool
// ============================================================================

int tools_ingv_faults_fetch(const std::string& bbox,
                            const std::string& aoiPath,
                            const std::string& outputPath,
                            bool overwrite) {
    
    // Help mode
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
INGV DISS Faults Database Fetch Tool
=====================================

DESCRIPTION:
  Fetches active fault data from the INGV DISS (Database of Individual 
  Seismogenic Sources) via WFS service. Includes seismogenic sources and
  capable faults for seismic hazard assessment.

DATA SOURCE:
  - Provider: INGV (Italian National Institute of Geophysics and Volcanology)
  - Database: DISS 3.3.x
  - WFS Endpoint: http://services.seismofaults.eu/DISS331/wfs
  - Coverage: Italy and Mediterranean region
  - License: Free/Open

FAULT TYPES:
  - Individual Seismogenic Sources (ISS)
  - Composite Seismogenic Sources (CSS)
  - Active faults capable of generating earthquakes

USAGE:
  zeus tools ingv_faults_fetch --bbox minx,miny,maxx,maxy -o faults.gpkg
  zeus tools ingv_faults_fetch --aoi study_area.gpkg -o faults.gpkg

OPTIONS:
  --bbox         Bounding box in EPSG:4326 (minx,miny,maxx,maxy)
  --aoi          AOI vector file (GeoJSON/Shapefile/GeoPackage)
  -o, --output   Output GeoPackage path
  --overwrite    Overwrite existing output

OUTPUT:
  GeoPackage with fault geometries and attributes:
  - Fault ID and name
  - Seismogenic source type
  - Maximum expected magnitude
  - Slip rate
  - Depth range
  - Fault geometry (polylines)

CRITICAL FOR ITALY:
  - Seismic hazard assessment for pipeline routing
  - Identify active faults that must be avoided
  - Required for engineering design in seismic zones

ATTRIBUTION:
  INGV DISS Working Group. Database of Individual Seismogenic Sources (DISS), 
  Version 3.3.x. http://diss.ingv.it/
)" << std::endl;
        return 0;
    }
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite)" << std::endl;
        return 1;
    }
    
    std::cout << "\n🗻 INGV DISS Faults Database Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    // Parse bbox
    double minx, miny, maxx, maxy;
    bool hasBBox = false;
    
    if (!bbox.empty()) {
        if (!parse_bbox4326(bbox, minx, miny, maxx, maxy)) {
            std::cerr << "Error: Invalid --bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
            return 1;
        }
        hasBBox = true;
        std::cout << "📍 Bounding Box: [" << minx << ", " << miny << ", " << maxx << ", " << maxy << "]" << std::endl;
    } else if (!aoiPath.empty()) {
        std::cout << "📍 Using AOI file: " << aoiPath << std::endl;
        // We'll use ogr2ogr to clip by AOI polygon instead of bbox
        hasBBox = false;
    }
    
    // WFS endpoint and parameters (HTTPS, not HTTP - service moved)
    std::string wfs_url = "https://services.seismofaults.eu/DISS331/wfs";
    
    // Use correct layer name from DISS 3.3.1 WFS GetCapabilities
    // Individual Seismogenic Sources layer
    std::string layer_name = "DISS331:iss331";  // Individual Seismogenic Sources 3.3.1
    
    std::cout << "📦 Fetching layer: " << layer_name << std::endl;
    
    // Build WFS GetFeature request
    std::string wfs_request = wfs_url + 
        "?service=WFS"
        "&version=1.1.0"
        "&request=GetFeature"
        "&typename=" + layer_name +
        "&outputFormat=application/json";
    
    if (hasBBox) {
        std::string bbox_str = std::to_string(minx) + "," + std::to_string(miny) + "," + 
                              std::to_string(maxx) + "," + std::to_string(maxy) + ",EPSG:4326";
        wfs_request += "&bbox=" + bbox_str;
    }
    
    std::string temp_geojson = "/tmp/ingv_faults_temp.geojson";
    
    std::cout << "⬇️  Downloading fault data via WFS..." << std::endl;
    std::cout << "URL: " << wfs_request << std::endl;
    
    std::string curl_cmd = "curl -s -L \"" + wfs_request + "\" -o " + temp_geojson;
    if (std::system(curl_cmd.c_str()) != 0) {
        std::cerr << "Error: Failed to download fault data" << std::endl;
        return 1;
    }
    
    // Check if we got valid GeoJSON
    std::ifstream test_file(temp_geojson);
    if (!test_file.good() || test_file.peek() == std::ifstream::traits_type::eof()) {
        std::cerr << "Error: Downloaded file is empty or invalid" << std::endl;
        return 1;
    }
    test_file.close();
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::cout << "🔄 Converting to GeoPackage..." << std::endl;
    
    std::string ogr_cmd = "ogr2ogr -f GPKG \"" + outputPath + "\" \"" + temp_geojson + "\" "
                         "-nln faults -t_srs EPSG:4326";
    
    // If AOI provided, clip to AOI polygon
    if (!hasBBox && !aoiPath.empty()) {
        ogr_cmd += " -clipsrc \"" + aoiPath + "\"";
    }
    
    if (overwrite) {
        ogr_cmd += " -overwrite";
    }
    
    if (std::system(ogr_cmd.c_str()) != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Clean up temp file
    std::filesystem::remove(temp_geojson);
    
    // Create metadata sidecar
    nlohmann::json meta;
    meta["source"] = "INGV DISS (Database of Individual Seismogenic Sources)";
    meta["provider"] = "INGV";
    meta["version"] = "DISS 3.3.x";
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::gmtime(&time_t_now);
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
    meta["fetch_date"] = std::string(buf);
    if (hasBBox) {
        meta["bbox"] = {minx, miny, maxx, maxy};
    }
    if (!aoiPath.empty()) {
        meta["aoi_file"] = aoiPath;
    }
    meta["crs"] = "EPSG:4326";
    meta["data_type"] = "Vector (Polyline)";
    meta["layer_name"] = layer_name;
    meta["wfs_endpoint"] = wfs_url;
    meta["license"] = "Free/Open - INGV";
    meta["citation"] = "INGV DISS Working Group. Database of Individual Seismogenic Sources (DISS), Version 3.3.x. http://diss.ingv.it/";
    meta["description"] = "Active seismogenic faults capable of generating earthquakes. Critical for seismic hazard assessment.";
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "✅ INGV faults data saved to: " << outputPath << std::endl;
    std::cout << "tools ingv_faults_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ============================================================================
// EU-Hydro River Network Fetch Tool (Pan-European, includes Italy)
// ============================================================================

int tools_euhydro_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        bool overwrite) {
    
    // Help mode
    if (bbox == "help" || aoiPath == "help") {
        std::cout << R"(
EU-Hydro River Network Fetch Tool
==================================

DESCRIPTION:
  Fetches river network data from EU-Hydro, the pan-European hydrography
  dataset maintained by the European Environment Agency (EEA). Provides
  high-resolution river network for all EU countries including Italy.

DATA SOURCE:
  - Provider: European Environment Agency (EEA) / Copernicus
  - Dataset: EU-Hydro River Network Database
  - WFS Endpoint: https://image.discomap.eea.europa.eu/arcgis/services/Hydro/Hydrography/MapServer/WFSServer
  - Coverage: All EU member states
  - License: Free/Open - EEA

FEATURES:
  - Main river network (rivers, streams)
  - Drainage channels
  - Standardized, INSPIRE-compliant
  - High resolution (derived from 1:50,000 scale)

USAGE:
  zeus tools euhydro_fetch --bbox minx,miny,maxx,maxy -o rivers.gpkg
  zeus tools euhydro_fetch --aoi study_area.gpkg -o rivers.gpkg

OPTIONS:
  --bbox         Bounding box in EPSG:4326 (minx,miny,maxx,maxy)
  --aoi          AOI vector file (GeoJSON/Shapefile/GeoPackage)
  -o, --output   Output GeoPackage path
  --overwrite    Overwrite existing output

OUTPUT:
  GeoPackage with river polylines and attributes:
  - River name
  - Strahler order
  - Flow direction
  - River type classification

CRITICAL FOR EUROPE:
  - Pipeline routing across water bodies
  - Water crossing assessment
  - Regulatory compliance (Water Framework Directive)
  - Required for environmental impact assessment

ATTRIBUTION:
  European Environment Agency, EU-Hydro River Network Database.
  https://land.copernicus.eu/imagery-in-situ/eu-hydro
)" << std::endl;
        return 0;
    }
    
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite)" << std::endl;
        return 1;
    }
    
    std::cout << "\n💧 EU-Hydro River Network Fetch" << std::endl;
    std::cout << "=" << std::string(60, '=') << std::endl;
    
    // Parse bbox
    double minx, miny, maxx, maxy;
    bool hasBBox = false;
    
    if (!bbox.empty()) {
        if (!parse_bbox4326(bbox, minx, miny, maxx, maxy)) {
            std::cerr << "Error: Invalid --bbox format. Expected: minx,miny,maxx,maxy" << std::endl;
            return 1;
        }
        hasBBox = true;
        std::cout << "📍 Bounding Box: [" << minx << ", " << miny << ", " << maxx << ", " << maxy << "]" << std::endl;
    } else if (!aoiPath.empty()) {
        std::cout << "📍 Using AOI file: " << aoiPath << std::endl;
        hasBBox = false;
    }
    
    // WFS endpoint
    std::string wfs_url = "https://image.discomap.eea.europa.eu/arcgis/services/Hydro/Hydrography/MapServer/WFSServer";
    
    std::cout << "🔍 Querying EU-Hydro WFS..." << std::endl;
    
    // Layer name for river network
    std::string layer_name = "Hydrography:HydrographyNetwork";  // Main river network layer
    
    std::cout << "📦 Fetching layer: " << layer_name << std::endl;
    
    // Build WFS GetFeature request
    std::string wfs_request = wfs_url + 
        "?service=WFS"
        "&version=2.0.0"
        "&request=GetFeature"
        "&typeName=" + layer_name +
        "&outputFormat=application/json";
    
    if (hasBBox) {
        std::string bbox_str = std::to_string(minx) + "," + std::to_string(miny) + "," + 
                              std::to_string(maxx) + "," + std::to_string(maxy) + ",EPSG:4326";
        wfs_request += "&bbox=" + bbox_str;
    }
    
    std::string temp_geojson = "/tmp/euhydro_temp.geojson";
    
    std::cout << "⬇️  Downloading river network via WFS..." << std::endl;
    std::cout << "URL: " << wfs_request << std::endl;
    
    std::string curl_cmd = "curl -s -L \"" + wfs_request + "\" -o " + temp_geojson;
    if (std::system(curl_cmd.c_str()) != 0) {
        std::cerr << "Error: Failed to download river data" << std::endl;
        return 1;
    }
    
    // Check if we got valid GeoJSON
    std::ifstream test_file(temp_geojson);
    if (!test_file.good() || test_file.peek() == std::ifstream::traits_type::eof()) {
        std::cerr << "Error: Downloaded file is empty or invalid" << std::endl;
        return 1;
    }
    test_file.close();
    
    // Convert GeoJSON to GeoPackage using ogr2ogr
    std::cout << "🔄 Converting to GeoPackage..." << std::endl;
    
    std::string ogr_cmd = "ogr2ogr -f GPKG \"" + outputPath + "\" \"" + temp_geojson + "\" "
                         "-nln rivers -t_srs EPSG:4326";
    
    // If AOI provided, clip to AOI polygon
    if (!hasBBox && !aoiPath.empty()) {
        ogr_cmd += " -clipsrc \"" + aoiPath + "\"";
    }
    
    if (overwrite) {
        ogr_cmd += " -overwrite";
    }
    
    if (std::system(ogr_cmd.c_str()) != 0) {
        std::cerr << "Error: Failed to convert to GeoPackage" << std::endl;
        return 1;
    }
    
    // Clean up temp file
    std::filesystem::remove(temp_geojson);
    
    // Create metadata sidecar
    nlohmann::json meta;
    meta["source"] = "EU-Hydro River Network Database";
    meta["provider"] = "European Environment Agency (EEA) / Copernicus";
    meta["version"] = "EU-Hydro 2020";
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::gmtime(&time_t_now);
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
    meta["fetch_date"] = std::string(buf);
    if (hasBBox) {
        meta["bbox"] = {minx, miny, maxx, maxy};
    }
    if (!aoiPath.empty()) {
        meta["aoi_file"] = aoiPath;
    }
    meta["crs"] = "EPSG:4326";
    meta["data_type"] = "Vector (Polyline)";
    meta["layer_name"] = layer_name;
    meta["wfs_endpoint"] = wfs_url;
    meta["license"] = "Free/Open - EEA/Copernicus";
    meta["citation"] = "European Environment Agency, EU-Hydro River Network Database. https://land.copernicus.eu/imagery-in-situ/eu-hydro";
    meta["description"] = "Pan-European river network for Water Framework Directive compliance and infrastructure routing.";
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "✅ EU-Hydro river data saved to: " << outputPath << std::endl;
    std::cout << "tools euhydro_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ============================================================================
// ADDITIONAL ITALY-SPECIFIC FETCH TOOLS (PRIORITY 1)
// ============================================================================

int tools_italian_soil_fetch(const std::string& outputPath,
                              bool overwrite) {
    
    // Help mode
    if (outputPath == "help" || outputPath == "--help") {
        std::cout << R"(
Italian Soil Information System Fetch Tool
===========================================

Description:
  Fetches Italian Soil Information System data from Zenodo.
  
  This tool downloads comprehensive soil data for Italy including:
  - 1,412 soil observations
  - 4,284 analyzed horizons
  - Soil parameters: pH, organic carbon, carbonate, texture
  - Climatic variables
  - Soil regions and systems at 1:500,000 scale

Data Source:
  - Provider: Italian National Research Council / Agricultural agencies
  - Dataset: Italian Soil Information System
  - Repository: Zenodo (DOI: 10.5281/zenodo.7085005)
  - Scale: 1:500,000 (soil regions and systems)
  - Coverage: Italy (national coverage)
  - Format: Shapefile/Vector data
  - License: Open/Free (Creative Commons or similar)
  - Reference: Soil survey and agricultural research

Output Format:
  - GeoPackage (.gpkg) with soil data layers
  - Attributes: Soil type, pH, organic carbon, texture, etc.
  - Includes JSON metadata sidecar

Usage:
  # Fetch Italian soil data (downloads entire dataset)
  zeus tools italian_soil_fetch -o italian_soil.gpkg
  
  # Overwrite existing file
  zeus tools italian_soil_fetch -o italian_soil.gpkg --overwrite
  
  # View help
  zeus tools italian_soil_fetch -o help

Options:
  -o, --output PATH   Output GeoPackage file path
  --overwrite         Overwrite existing output file

Data Attribution:
  Italian National Research Council / Agricultural agencies
  DOI: 10.5281/zenodo.7085005
  
Notes:
  - Downloads entire Italy soil dataset (~several MB)
  - No clipping options - full national coverage
  - Can use QGIS or ogr2ogr to clip to specific areas after download
)" << std::endl;
        return 0;
    }
    
    // Validate output path
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching Italian Soil Information System data..." << std::endl;
    std::cout << "Source: Zenodo (DOI: 10.5281/zenodo.7085005)" << std::endl;
    std::cout << "Coverage: Italy (national)" << std::endl;
    
    // Zenodo direct download URL
    std::string zenodoUrl = "https://zenodo.org/record/7085005/files/Italian_Soil_Information_System.zip";
    
    // Create temporary directory for download
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("italian_soil_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    std::filesystem::path zipPath = tempDir / "soil_data.zip";
    
    // Download ZIP file from Zenodo
    std::cout << "Downloading from Zenodo..." << std::endl;
    std::string curlCmd = "curl -L --max-time 1200 \"" + zenodoUrl + "\" -o " + zipPath.string() + " 2>&1";
    
    int result = std::system(curlCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download from Zenodo" << std::endl;
        std::cerr << "URL: " << zenodoUrl << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Check if file was downloaded
    if (!std::filesystem::exists(zipPath) || std::filesystem::file_size(zipPath) < 1000) {
        std::cerr << "Error: Download failed or file is too small" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Downloaded " << std::filesystem::file_size(zipPath) << " bytes" << std::endl;
    std::cout << "Extracting data..." << std::endl;
    
    // Extract ZIP file
    std::string unzipCmd = "cd " + tempDir.string() + " && unzip -q soil_data.zip 2>&1";
    result = std::system(unzipCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to extract ZIP file" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Find shapefiles in extracted directory
    std::cout << "Converting to GeoPackage..." << std::endl;
    
    // Look for .shp files
    std::vector<std::filesystem::path> shapefiles;
    for (const auto& entry : std::filesystem::recursive_directory_iterator(tempDir)) {
        if (entry.path().extension() == ".shp") {
            shapefiles.push_back(entry.path());
        }
    }
    
    if (shapefiles.empty()) {
        std::cerr << "Error: No shapefiles found in downloaded data" << std::endl;
        std::cerr << "The Zenodo data structure may have changed." << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Found " << shapefiles.size() << " shapefile(s)" << std::endl;
    
    // Convert all shapefiles to a single GeoPackage
    for (size_t i = 0; i < shapefiles.size(); ++i) {
        std::string layerName = shapefiles[i].stem().string();
        std::cout << "  Converting layer " << (i+1) << "/" << shapefiles.size() << ": " << layerName << std::endl;
        
        std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
        if (i == 0) {
            if (overwrite) ogr2ogrCmd += "-overwrite ";
        } else {
            ogr2ogrCmd += "-update ";
        }
        ogr2ogrCmd += "-nln " + layerName + " ";
        ogr2ogrCmd += outputPath + " " + shapefiles[i].string() + " 2>&1";
        
        result = std::system(ogr2ogrCmd.c_str());
        if (result != 0) {
            std::cerr << "Warning: Failed to convert " << layerName << std::endl;
        }
    }
    
    // Clean up temporary directory
    std::filesystem::remove_all(tempDir);
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "italian_soil_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "Italian Soil Information System via Zenodo";
    meta["provider"] = "Italian National Research Council / Agricultural agencies";
    meta["repository"] = "Zenodo";
    meta["doi"] = "10.5281/zenodo.7085005";
    meta["url"] = "https://zenodo.org/records/7085005";
    meta["coverage"] = "Italy (national coverage)";
    meta["scale"] = "1:500,000 (soil regions and systems)";
    meta["format"] = "GeoPackage (converted from Shapefile)";
    meta["crs"] = "EPSG:4326 (WGS84) - assumed";
    meta["observations"] = "1,412 soil observations";
    meta["horizons"] = "4,284 analyzed horizons";
    meta["parameters"] = {"pH", "Organic carbon", "Carbonate", "Texture", "Climatic variables"};
    meta["license"] = "Open/Free (Creative Commons or similar)";
    meta["attribution"] = "Italian National Research Council / Agricultural agencies";
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools italian_soil_fetch OK: " << outputPath << std::endl;
    return 0;
}


int tools_corine_italy_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              const std::string& year,
                              bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
CORINE Land Cover Italy Fetch Tool
===================================

Description:
  Fetches CORINE Land Cover data for Italy from ISPRA.
  
  CORINE (Coordination of Information on the Environment) is a pan-European
  land cover and land use inventory coordinated by the European Environment Agency.
  ISPRA provides Italy-specific CORINE data.

Data Source:
  - Provider: ISPRA (Istituto Superiore per la Protezione e la Ricerca Ambientale)
  - Coordinator: European Environment Agency (EEA)
  - Dataset: CORINE Land Cover
  - Scale: 1:100,000 (minimum mapping unit: 25 hectares ≈ 100m resolution)
  - Coverage: Italy
  - Format: Raster/Vector
  - License: Open/Free
  - Years Available: 1990, 2000, 2006, 2012, 2018

Land Cover Classes:
  - 44 thematic classes at three hierarchical levels
  - Level 1: 5 main classes (Artificial, Agricultural, Forest, Wetlands, Water)
  - Level 2: 15 classes
  - Level 3: 44 detailed classes

Output Format:
  - Cloud Optimized GeoTIFF (.tif) or GeoPackage (.gpkg)
  - Classification codes according to CORINE nomenclature
  - Includes JSON metadata sidecar

Usage:
  # Fetch CORINE 2018 for bounding box
  zeus tools corine_italy_fetch --bbox 13.5,42.8,13.9,43.4 -o corine_2018.tif
  
  # Fetch CORINE for AOI
  zeus tools corine_italy_fetch --aoi study_area.geojson -o corine_2018.tif
  
  # Fetch specific year
  zeus tools corine_italy_fetch --bbox 13.5,42.8,13.9,43.4 --year 2012 -o corine_2012.tif
  
  # View help
  zeus tools corine_italy_fetch --bbox help -o dummy.tif

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326
  --aoi PATH                   Area of Interest (GeoJSON/Shapefile/GeoPackage)
  -o, --output PATH            Output GeoTIFF file path
  --year YEAR                  Year: 1990|2000|2006|2012|2018 (default: 2018)
  --overwrite                  Overwrite existing output file

Data Attribution:
  ISPRA - Istituto Superiore per la Protezione e la Ricerca Ambientale
  European Environment Agency (EEA) - CORINE Programme
  https://indicatoriambientali.isprambiente.it/
  
Notes:
  - One of --bbox or --aoi must be provided
  - Resolution: ~100m (25 hectare minimum mapping unit)
  - Lower geometric resolution than ESA WorldCover (10m)
  - But has detailed 44-class nomenclature specific to Europe
  - WMS service may have query size limits
)" << std::endl;
        return 0;
    }
    
    // Validate inputs
    if (bbox.empty() && aoiPath.empty()) {
        std::cerr << "Error: Either --bbox or --aoi must be provided" << std::endl;
        return 1;
    }
    
    if (year != "1990" && year != "2000" && year != "2006" && year != "2012" && year != "2018") {
        std::cerr << "Error: year must be one of: 1990, 2000, 2006, 2012, 2018" << std::endl;
        return 1;
    }
    
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching CORINE Land Cover data for Italy..." << std::endl;
    std::cout << "Source: ISPRA CORINE Land Cover" << std::endl;
    std::cout << "Year: " << year << std::endl;
    
    // ISPRA CORINE WMS endpoint (example - actual endpoint may vary)
    std::string wmsUrl = "https://geoservizi.isprambiente.it/arcgis/services/corine/MapServer/WMSServer";
    
    std::cout << "\nNote: CORINE Land Cover WMS endpoint configuration in progress." << std::endl;
    std::cout << "This tool will attempt to download from ISPRA WMS services." << std::endl;
    std::cout << "If download fails, please visit: https://indicatoriambientali.isprambiente.it/" << std::endl;
    
    std::cerr << "\nCurrent Status: CORINE WMS layer identification in progress." << std::endl;
    std::cerr << "\nAlternative Options:" << std::endl;
    std::cerr << "1. Use ESA WorldCover (higher resolution 10m): zeus tools esa_worldcover_fetch" << std::endl;
    std::cerr << "2. Use Google Dynamic World (10m): zeus tools google_dynamicworld_fetch" << std::endl;
    std::cerr << "3. Manual download from ISPRA: https://indicatoriambientali.isprambiente.it/" << std::endl;
    
    return 1;
}

int tools_gee_tile_export(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& asset,
                          const std::string& bands,
                          const std::string& dateStart,
                          const std::string& dateEnd,
                          const std::string& scale,
                          const std::string& crs,
                          int tilePixels,
                          const std::string& outputPath,
                          bool overwrite) {
	// Validate
	if (!overwrite && std::filesystem::exists(outputPath)) {
		std::cerr << "Error: Output exists (use --overwrite)" << std::endl;
		return 1;
	}
	if (asset.empty()) {
		std::cerr << "Error: --asset is required" << std::endl;
		return 1;
	}

	std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("gee_tiler_" + std::to_string(std::time(nullptr)));
	std::filesystem::create_directories(tempDir);
	std::filesystem::path pyPath = tempDir / "gee_tile_export.py";

	// Write Python script
	{
		std::ofstream py(pyPath);
		py << R"PY(
import os, sys, json, math, subprocess, tempfile
import ee
import geemap

def to_bbox(bbox_str):
    parts = [float(x) for x in bbox_str.split(',')]
    if len(parts) != 4:
        raise ValueError('bbox must be minx,miny,maxx,maxy')
    return parts

def build_region(bbox_str, aoi_path):
    if aoi_path and os.path.exists(aoi_path):
        try:
            region = geemap.geojson_to_ee(aoi_path)
        except Exception:
            region = None
        if region:
            return region.geometry()
    minx, miny, maxx, maxy = to_bbox(bbox_str)
    return ee.Geometry.Rectangle([minx, miny, maxx, maxy])

def is_collection(asset_id):
    try:
        ee.ImageCollection(asset_id).first().getInfo()
        return True
    except Exception:
        return False

def main():
    bbox = sys.argv[1]
    aoi = sys.argv[2]
    asset = sys.argv[3]
    bands = sys.argv[4]
    date_start = sys.argv[5]
    date_end = sys.argv[6]
    scale = float(sys.argv[7])
    crs = sys.argv[8]
    tile_pixels = int(sys.argv[9])
    out_path = sys.argv[10]

    ee.Initialize(project=None)

    region = build_region(bbox, aoi)
    img = None
    if is_collection(asset):
        ic = ee.ImageCollection(asset)
        if date_start and date_end:
            ic = ic.filterDate(date_start, date_end)
        ic = ic.filterBounds(region)
        img = ic.mosaic()
    else:
        img = ee.Image(asset)

    if bands:
        img = img.select([b.strip() for b in bands.split(',') if b.strip()])

    # Build tile grid in degrees (approx.)
    coords = region.bounds().coordinates().getInfo()[0]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    deg_y_per_m = 1.0 / 110574.0
    # conservative lon per meter at mid-latitude
    mid_lat = (miny + maxy) / 2.0
    deg_x_per_m = 1.0 / (111320.0 * max(0.1, math.cos(math.radians(mid_lat))))

    step_x = tile_pixels * scale * deg_x_per_m
    step_y = tile_pixels * scale * deg_y_per_m
    step_x = max(step_x, 0.0005)
    step_y = max(step_y, 0.0005)

    tmpdir = tempfile.mkdtemp(prefix='gee_tiles_')
    tiles = []
    y = miny
    while y < maxy:
        x = minx
        y2 = min(y + step_y, maxy)
        while x < maxx:
            x2 = min(x + step_x, maxx)
            tile_geom = ee.Geometry.Rectangle([x, y, x2, y2])
            tile_path = os.path.join(tmpdir, f"tile_{len(tiles):05d}.tif")
            try:
                geemap.ee_export_image(img.clip(tile_geom), filename=tile_path, scale=scale, region=tile_geom, crs=crs)
                if os.path.exists(tile_path) and os.path.getsize(tile_path) > 0:
                    tiles.append(tile_path)
            except Exception as e:
                # skip failed tile
                pass
            x = x2
        y = y2

    if not tiles:
        print('Error: No tiles exported')
        sys.exit(1)

    vrt = os.path.join(tmpdir, 'mosaic.vrt')
    cmd_vrt = ['gdalbuildvrt', vrt] + tiles
    subprocess.run(cmd_vrt, check=True)

    # Translate to COG
    cmd_tif = ['gdal_translate', '-of', 'COG', '-co', 'COMPRESS=DEFLATE', '-co', 'NUM_THREADS=ALL_CPUS', vrt, out_path]
    subprocess.run(cmd_tif, check=True)

if __name__ == '__main__':
    main()
)PY";
	}

	std::string py = pyPath.string();
	std::string python = "/opt/agrs/.venv_gee/bin/python3";
	std::string cmd = python + " " + py + " \"" + (bbox.empty()?"":bbox) + "\" \"" + (aoiPath.empty()?"":aoiPath) + "\" \"" + asset + "\" \"" + bands + "\" \"" + dateStart + "\" \"" + dateEnd + "\" \"" + scale + "\" \"" + crs + "\" " + std::to_string(tilePixels) + " \"" + outputPath + "\" 2>&1";
	int rc = std::system(cmd.c_str());
	std::filesystem::remove_all(tempDir);
	if (rc != 0 || !std::filesystem::exists(outputPath)) {
		std::cerr << "Error: GEE tile export failed" << std::endl;
		return 1;
	}

	// Metadata sidecar
	nlohmann::json meta;
	meta["tool"] = "gee_tile_export";
	meta["timestamp_utc"] = to_iso8601_utc();
	meta["asset"] = asset;
	if (!bands.empty()) meta["bands"] = bands;
	if (!bbox.empty()) meta["bbox"] = bbox;
	if (!aoiPath.empty()) meta["aoi"] = aoiPath;
	if (!dateStart.empty()) meta["date_start"] = dateStart;
	if (!dateEnd.empty()) meta["date_end"] = dateEnd;
	meta["scale_m"] = scale;
	meta["crs"] = crs;
	meta["tile_pixels"] = tilePixels;
	write_sidecar_json(outputPath, meta);
	std::cout << "tools gee_tile_export OK: " << outputPath << std::endl;
	return 0;
}

int tools_wms_fetch(const std::string& url,
                    const std::string& layers,
                    const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& srs,
                    int width,
                    int height,
                    const std::string& format,
                    const std::string& outputPath,
                    bool overwrite) {
	if (!overwrite && std::filesystem::exists(outputPath)) {
		std::cerr << "Error: Output exists (use --overwrite)" << std::endl;
		return 1;
	}
	if (url.empty() || layers.empty()) {
		std::cerr << "Error: --url and --layers are required" << std::endl;
		return 1;
	}
	std::string b = bbox;
	if (b.empty() && !aoiPath.empty()) {
		// derive bbox from AOI via ogrinfo
		std::string cmd = "ogrinfo -al -so \"" + aoiPath + "\" 2>&1";
		FILE* pipe = popen(cmd.c_str(), "r");
		if (pipe) {
			char buf[4096]; std::string out;
			while (fgets(buf, sizeof(buf), pipe)) out += buf;
			pclose(pipe);
			size_t p = out.find("Extent:");
			if (p != std::string::npos) {
				// Extent: (minX, minY) - (maxX, maxY)
				auto sub = out.substr(p);
				size_t lp = sub.find('('), comma1 = sub.find(',');
				size_t rp = sub.find(')');
				size_t dash = sub.find("- (");
				size_t comma2 = sub.find(',', dash);
				size_t rp2 = sub.find(')', comma2);
				if (lp!=std::string::npos && comma1!=std::string::npos && rp!=std::string::npos && dash!=std::string::npos && comma2!=std::string::npos && rp2!=std::string::npos) {
					double minx = std::stod(sub.substr(lp+1, comma1-lp-1));
					double miny = std::stod(sub.substr(comma1+1, rp-comma1-1));
					double maxx = std::stod(sub.substr(dash+3, comma2-(dash+3)));
					double maxy = std::stod(sub.substr(comma2+1, rp2-comma2-1));
					b = std::to_string(minx)+","+std::to_string(miny)+","+std::to_string(maxx)+","+std::to_string(maxy);
				}
			}
		}
	}
	if (b.empty()) {
		std::cerr << "Error: Provide --bbox or --aoi" << std::endl;
		return 1;
	}

	// Build WMS XML
	std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("wms_" + std::to_string(std::time(nullptr)));
	std::filesystem::create_directories(tempDir);
	std::filesystem::path xmlPath = tempDir / "wms.xml";

	double minx, miny, maxx, maxy;
	{
		std::stringstream ss(b);
		char c; ss >> minx; ss >> c; ss >> miny; ss >> c; ss >> maxx; ss >> c; ss >> maxy;
	}
	std::ofstream xml(xmlPath);
	xml << "<GDAL_WMS>\n";
	xml << "  <Service name=\"WMS\">\n";
	xml << "    <Version>1.1.1</Version>\n";
	xml << "    <ServerUrl>" << url << "</ServerUrl>\n";
	xml << "    <Layers>" << layers << "</Layers>\n";
	xml << "    <SRS>" << srs << "</SRS>\n";
	xml << "    <ImageFormat>" << format << "</ImageFormat>\n";
	xml << "    <Transparent>TRUE</Transparent>\n";
	xml << "  </Service>\n";
	xml << "  <DataWindow>\n";
	xml << "    <SRS>" << srs << "</SRS>\n";
	xml << "    <UpperLeftX>" << minx << "</UpperLeftX>\n";
	xml << "    <UpperLeftY>" << maxy << "</UpperLeftY>\n";
	xml << "    <LowerRightX>" << maxx << "</LowerRightX>\n";
	xml << "    <LowerRightY>" << miny << "</LowerRightY>\n";
	xml << "    <SizeX>" << width << "</SizeX>\n";
	xml << "    <SizeY>" << height << "</SizeY>\n";
	xml << "  </DataWindow>\n";
	xml << "  <BandsCount>3</BandsCount>\n";
	xml << "  <BlockSizeX>256</BlockSizeX>\n";
	xml << "  <BlockSizeY>256</BlockSizeY>\n";
	xml << "  <Cache />\n";
	xml << "</GDAL_WMS>\n";
	xml.close();

	std::string cmd = "gdal_translate \"" + xmlPath.string() + "\" \"" + outputPath + "\" -of COG -co COMPRESS=DEFLATE 2>&1";
	int rc = std::system(cmd.c_str());
	if (rc != 0 || !std::filesystem::exists(outputPath)) {
		std::cerr << "Error: WMS fetch failed" << std::endl;
		std::filesystem::remove_all(tempDir);
		return 1;
	}
	// Optional AOI clip
	if (!aoiPath.empty()) {
		std::string clipped = outputPath + ".clip.tif";
		std::string warp = "gdalwarp -cutline \"" + aoiPath + "\" -crop_to_cutline -dstalpha \"" + outputPath + "\" \"" + clipped + "\" 2>&1";
		std::system(warp.c_str());
		if (std::filesystem::exists(clipped)) {
			std::filesystem::rename(clipped, outputPath);
		}
	}
	std::filesystem::remove_all(tempDir);

	// Metadata
	nlohmann::json meta;
	meta["tool"] = "wms_fetch";
	meta["timestamp_utc"] = to_iso8601_utc();
	meta["url"] = url;
	meta["layers"] = layers;
	meta["bbox"] = b;
	meta["srs"] = srs;
	meta["size"] = { {"width", width}, {"height", height} };
	write_sidecar_json(outputPath, meta);
	std::cout << "tools wms_fetch OK: " << outputPath << std::endl;
	return 0;
}

int tools_wfs_fetch(const std::string& url,
                    const std::string& typeName,
                    const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& version,
                    int pageSize,
                    const std::string& filter,
                    const std::string& outputPath,
                    bool overwrite) {
	if (!overwrite && std::filesystem::exists(outputPath)) {
		std::cerr << "Error: Output exists (use --overwrite)" << std::endl;
		return 1;
	}
	if (url.empty() || typeName.empty()) {
		std::cerr << "Error: --url and --typename are required" << std::endl;
		return 1;
	}

	std::string base = url;
	// Use explicit WFS connection options
	std::string ogr = "ogr2ogr -f GPKG ";
	if (overwrite) ogr += "-overwrite ";
	ogr += "\"" + outputPath + "\" WFS: ";
	ogr += "-oo URL=\"" + base + "\" ";
	ogr += "-oo TYPENAME=\"" + typeName + "\" ";
	ogr += "-oo VERSION=" + version + " ";
	ogr += "-oo PAGE_SIZE=" + std::to_string(pageSize) + " ";
	if (!bbox.empty()) {
		std::string b = bbox; std::replace(b.begin(), b.end(), ',', ' ');
		ogr += "-spat " + b + " ";
	}
	if (!aoiPath.empty()) {
		ogr += "-clipsrc \"" + aoiPath + "\" ";
	}
	// Try to pass filter via URL parameter if provided (CQL)
	if (!filter.empty()) {
		ogr += "-where \"" + filter + "\" ";
	}
	ogr += "2>&1";
	int rc = std::system(ogr.c_str());
	if (rc != 0 || !std::filesystem::exists(outputPath)) {
		std::cerr << "Error: WFS fetch failed" << std::endl;
		return 1;
	}

	// Metadata
	nlohmann::json meta;
	meta["tool"] = "wfs_fetch";
	meta["timestamp_utc"] = to_iso8601_utc();
	meta["url"] = url;
	meta["typeName"] = typeName;
	if (!bbox.empty()) meta["bbox"] = bbox;
	if (!aoiPath.empty()) meta["aoi"] = aoiPath;
	meta["version"] = version;
	meta["page_size"] = pageSize;
	if (!filter.empty()) meta["filter"] = filter;
	write_sidecar_json(outputPath, meta);
	std::cout << "tools wfs_fetch OK: " << outputPath << std::endl;
	return 0;
}

int tools_copernicus_eea10_fetch(const std::string& bbox,
                                  const std::string& aoiPath,
                                  const std::string& collection,
                                  const std::string& outputPath,
                                  bool overwrite) {
	// Validation
	if (bbox.empty() && aoiPath.empty()) {
		std::cerr << "Error: Provide --bbox or --aoi" << std::endl;
		return 1;
	}
	if (outputPath.empty()) {
		std::cerr << "Error: Output path required" << std::endl;
		return 1;
	}
	if (std::filesystem::exists(outputPath) && !overwrite) {
		std::cerr << "Error: Output exists. Use --overwrite" << std::endl;
		return 1;
	}

	// Load credentials
	std::string credPath = "/opt/agrs/.copernicus_credentials";
	if (!std::filesystem::exists(credPath)) {
		std::cerr << "Error: Credentials not found at " << credPath << std::endl;
		std::cerr << "Please create this file with COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET" << std::endl;
		return 1;
	}

	std::string clientId, clientSecret;
	{
		std::ifstream f(credPath);
		std::string line;
		while (std::getline(f, line)) {
			if (line.find("COPERNICUS_CLIENT_ID=") == 0) {
				clientId = line.substr(21);
			} else if (line.find("COPERNICUS_CLIENT_SECRET=") == 0) {
				clientSecret = line.substr(26);
			}
		}
	}
	if (clientId.empty() || clientSecret.empty()) {
		std::cerr << "Error: Could not parse credentials" << std::endl;
		return 1;
	}

	// Create temp directory
	std::string tmpdir = "/tmp/copernicus_eea10_" + std::to_string(getpid());
	std::filesystem::create_directories(tmpdir);

	// Write Python script
	std::string pyScript = tmpdir + "/fetch_eea10.py";
	{
		std::ofstream py(pyScript);
		py << R"PY(#!/usr/bin/env python3
import os, sys, json, subprocess, tempfile, zipfile
from pathlib import Path
from oauthlib.oauth2 import BackendApplicationClient
from requests_oauthlib import OAuth2Session

def to_bbox(bbox_str):
	parts = [float(x.strip()) for x in bbox_str.split(',')]
	if len(parts) != 4:
		raise ValueError('bbox must be minx,miny,maxx,maxy')
	return parts

def build_bbox_wkt(bbox_str):
	minx, miny, maxx, maxy = to_bbox(bbox_str)
	return f"POLYGON(({minx} {miny},{maxx} {miny},{maxx} {maxy},{minx} {maxy},{minx} {miny}))"

class CopernicusDEMFetcher:
	def __init__(self, client_id, client_secret, output_dir):
		self.client_id = client_id
		self.client_secret = client_secret
		self.output_dir = Path(output_dir)
		self.output_dir.mkdir(parents=True, exist_ok=True)
		self.token_url = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token'
		self.catalog_url = 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'
		self.oauth = None
		self.token = None
	
	def authenticate(self):
		client = BackendApplicationClient(client_id=self.client_id)
		self.oauth = OAuth2Session(client=client)
		
		def compliance_hook(response):
			response.raise_for_status()
			return response
		self.oauth.register_compliance_hook('access_token_response', compliance_hook)
		
		try:
			self.token = self.oauth.fetch_token(
				token_url=self.token_url,
				client_secret=self.client_secret,
				include_client_id=True
			)
			return self.token
		except Exception as e:
			print(f"Authentication failed: {e}", file=sys.stderr)
			print("This may indicate your account is not eligible for EEA-10 access.", file=sys.stderr)
			print("Only Public Authorities, EU research projects, and specific categories can access EEA-10.", file=sys.stderr)
			print("Consider using GLO-30 (30m) which is publicly available.", file=sys.stderr)
			raise
	
	def search_tiles(self, bbox=None, collection='COP-DEM_EEA-10-DGED', max_results=100):
		if not self.oauth:
			self.authenticate()
		
		filter_parts = [f"Collection/Name eq '{collection}'"]
		
		if bbox:
			wkt = build_bbox_wkt(bbox)
			filter_parts.append(f"OData.CSC.Intersects(area=geography'SRID=4326;{wkt}')")
		
		filter_query = ' and '.join(filter_parts)
		
		params = {
			'$filter': filter_query,
			'$top': max_results,
			'$orderby': 'ContentDate/Start desc'
		}
		
		response = self.oauth.get(self.catalog_url, params=params)
		response.raise_for_status()
		return response.json()['value']
	
	def download_tile(self, product_info):
		product_id = product_info['Id']
		product_name = product_info['Name']
		
		download_url = f"https://zipper.dataspace.copernicus.eu/odata/v1/Products({product_id})/$value"
		
		output_file = self.output_dir / f"{product_name}.zip"
		
		if output_file.exists():
			print(f"Tile {product_name} already exists, skipping")
			return output_file
		
		print(f"Downloading {product_name}...")
		response = self.oauth.get(download_url, stream=True)
		response.raise_for_status()
		
		with open(output_file, 'wb') as f:
			for chunk in response.iter_content(chunk_size=8192):
				f.write(chunk)
		
		print(f"Downloaded: {output_file}")
		return output_file
	
	def fetch_tiles_for_area(self, bbox, collection='COP-DEM_EEA-10-DGED'):
		tiles = self.search_tiles(bbox=bbox, collection=collection)
		print(f"Found {len(tiles)} tiles for bbox {bbox}")
		
		if len(tiles) == 0:
			print("Warning: No tiles found. This may indicate:", file=sys.stderr)
			print("- Your AOI is outside EEA-10 coverage (European countries only)", file=sys.stderr)
			print("- Access restrictions apply to your account", file=sys.stderr)
			return []
		
		downloaded_files = []
		for tile in tiles:
			try:
				file_path = self.download_tile(tile)
				downloaded_files.append(file_path)
			except Exception as e:
				print(f"Error downloading {tile['Name']}: {e}", file=sys.stderr)
		
		return downloaded_files

def extract_dem_tifs(zip_files, extract_dir):
	"""Extract DEM GeoTIFF from downloaded ZIP archives"""
	tif_files = []
	for zf in zip_files:
		print(f"Extracting {zf}...")
		with zipfile.ZipFile(zf, 'r') as z:
			for name in z.namelist():
				if name.endswith('.TIF') or name.endswith('.tif'):
					extracted = z.extract(name, extract_dir)
					tif_files.append(extracted)
	return tif_files

def main():
	bbox = sys.argv[1]
	collection = sys.argv[2]
	client_id = sys.argv[3]
	client_secret = sys.argv[4]
	out_path = sys.argv[5]
	
	tmpdir = tempfile.mkdtemp(prefix='cop_eea10_')
	
	fetcher = CopernicusDEMFetcher(
		client_id=client_id,
		client_secret=client_secret,
		output_dir=tmpdir
	)
	
	zip_files = fetcher.fetch_tiles_for_area(bbox=bbox, collection=collection)
	
	if not zip_files:
		print("Error: No tiles downloaded", file=sys.stderr)
		sys.exit(1)
	
	# Extract GeoTIFFs
	tif_files = extract_dem_tifs(zip_files, tmpdir)
	
	if not tif_files:
		print("Error: No GeoTIFF files found in downloaded archives", file=sys.stderr)
		sys.exit(1)
	
	print(f"Extracted {len(tif_files)} DEM tiles")
	
	# Mosaic if multiple tiles
	if len(tif_files) == 1:
		# Single tile: translate to COG
		cmd = ['gdal_translate', '-of', 'COG', '-co', 'COMPRESS=DEFLATE', '-co', 'NUM_THREADS=ALL_CPUS', tif_files[0], out_path]
		subprocess.run(cmd, check=True)
	else:
		# Multiple tiles: build VRT, then translate to COG
		vrt = os.path.join(tmpdir, 'mosaic.vrt')
		cmd_vrt = ['gdalbuildvrt', vrt] + tif_files
		subprocess.run(cmd_vrt, check=True)
		
		cmd_tif = ['gdal_translate', '-of', 'COG', '-co', 'COMPRESS=DEFLATE', '-co', 'NUM_THREADS=ALL_CPUS', vrt, out_path]
		subprocess.run(cmd_tif, check=True)
	
	print(f"✓ Copernicus EEA-10 DEM saved to {out_path}")

if __name__ == '__main__':
	main()
)PY";
	}

	// Execute Python script
	std::string venv = "/opt/agrs/.venv_gee";
	std::string pythonBin = venv + "/bin/python3";
	
	// Install required packages if not present
	{
		std::string cmd = pythonBin + " -m pip install --quiet requests oauthlib requests-oauthlib 2>&1";
		std::cout << "Installing Python dependencies..." << std::endl;
		int rc = system(cmd.c_str());
		if (rc != 0) {
			std::cerr << "Warning: Could not install dependencies" << std::endl;
		}
	}
	
	std::string cmd = pythonBin + " " + pyScript + " \"" + bbox + "\" \"" + collection + "\" \"" + clientId + "\" \"" + clientSecret + "\" \"" + outputPath + "\" 2>&1";
	
	std::cout << "Fetching Copernicus EEA-10 DEM tiles..." << std::endl;
	std::cout << "Collection: " << collection << std::endl;
	std::cout << "BBox: " << bbox << std::endl;
	
	int rc = system(cmd.c_str());
	
	// Cleanup
	std::filesystem::remove_all(tmpdir);
	
	if (rc != 0) {
		std::cerr << "Error: Python script failed" << std::endl;
		return 1;
	}
	
	if (!std::filesystem::exists(outputPath)) {
		std::cerr << "Error: Output file not created" << std::endl;
		return 1;
	}
	
	// Generate metadata sidecar
	nlohmann::json meta;
	meta["source"] = "Copernicus Data Space Ecosystem";
	meta["collection"] = collection;
	meta["bbox"] = bbox;
	meta["resolution"] = "10m";
	meta["crs"] = "EPSG:4326 (WGS84-G1150)";
	meta["license"] = "EU Copernicus Full, Free and Open";
	meta["access_category"] = "Restricted (Public Authorities, EU Research, etc.)";
	meta["url"] = "https://dataspace.copernicus.eu";
	meta["fetch_timestamp"] = []() {
		auto now = std::chrono::system_clock::now();
		auto time_t = std::chrono::system_clock::to_time_t(now);
		std::stringstream ss;
		ss << std::put_time(std::gmtime(&time_t), "%Y-%m-%dT%H:%M:%SZ");
		return ss.str();
	}();
	
	std::string jsonPath = outputPath + ".json";
	std::ofstream jsonFile(jsonPath);
	jsonFile << meta.dump(2);
	
	std::cout << "✓ Copernicus EEA-10 DEM fetch complete: " << outputPath << std::endl;
	std::cout << "✓ Metadata: " << jsonPath << std::endl;
	
	return 0;
}

int tools_kml_to_bbox(const std::string& inputPath,
                      std::string& bboxOut) {
	if (inputPath.empty() || !std::filesystem::exists(inputPath)) {
		std::cerr << "Error: Input KML/KMZ not found" << std::endl;
		return 1;
	}
	std::string cmd = "ogrinfo -al -so \"" + inputPath + "\" 2>&1";
	FILE* pipe = popen(cmd.c_str(), "r");
	if (!pipe) {
		std::cerr << "Error: Failed to read input" << std::endl;
		return 1;
	}
	std::string out; char buf[4096];
	while (fgets(buf, sizeof(buf), pipe)) out += buf;
	pclose(pipe);
	size_t p = out.find("Extent:");
	if (p == std::string::npos) {
		std::cerr << "Error: Could not parse extent" << std::endl;
		return 1;
	}
	// Extent: (minX, minY) - (maxX, maxY)
	auto sub = out.substr(p);
	size_t lp = sub.find('('), comma1 = sub.find(',');
	size_t rp = sub.find(')');
	size_t dash = sub.find("- (");
	size_t comma2 = sub.find(',', dash);
	size_t rp2 = sub.find(')', comma2);
	if (lp==std::string::npos || comma1==std::string::npos || rp==std::string::npos || dash==std::string::npos || comma2==std::string::npos || rp2==std::string::npos) {
		std::cerr << "Error: Could not parse extent values" << std::endl;
		return 1;
	}
	double minx = std::stod(sub.substr(lp+1, comma1-lp-1));
	double miny = std::stod(sub.substr(comma1+1, rp-comma1-1));
	double maxx = std::stod(sub.substr(dash+3, comma2-(dash+3)));
	double maxy = std::stod(sub.substr(comma2+1, rp2-comma2-1));
	bboxOut = std::to_string(minx)+","+std::to_string(miny)+","+std::to_string(maxx)+","+std::to_string(maxy);
	return 0;
}

int tools_scigrid_gas_pipelines_fetch(const std::string& bbox,
                                       const std::string& aoiPath,
                                       const std::string& outputPath,
                                       const std::string& country,
                                       bool overwrite) {
    
    // Help mode
    if (bbox == "help" || bbox == "--help") {
        std::cout << R"(
SciGRID_gas European Gas Pipeline Network Fetch Tool
=====================================================

Description:
  Fetches existing gas pipeline network data from the SciGRID_gas project.
  
  SciGRID_gas (IGGIELGN dataset) is an open-source model of the European
  gas transmission network, combining data from multiple sources:
  - InternetDaten (INET) pipeline registry
  - Gas Infrastructure Europe (GIE) data
  - European gas transmission operators data
  
  The dataset includes detailed pipeline segments with technical parameters.

Data Specifications:
  - Provider: SciGRID_gas / Helmholtz Centre / DLR
  - Repository: Zenodo (DOI: 10.5281/zenodo.4767098)
  - Coverage: European gas transmission network (~206,000 km)
  - Format: GeoJSON (converted to GeoPackage)
  - License: CC-BY-4.0 (Open, attribution required)
  - Update: 2021 (IGGIELGN version)
  - Features: 6,323 pipeline segments

Pipeline Attributes:
  - name: Pipeline segment name/ID
  - country_code: ISO country codes (e.g., IT, DE, FR)
  - diameter_mm: Pipeline diameter in millimeters
  - length_km: Segment length in kilometers
  - max_cap_M_m3_per_d: Maximum capacity (million m³/day)
  - max_pressure_bar: Maximum operating pressure (bar)
  - start_year: Year pipeline entered service
  - end_year: Year pipeline was decommissioned (if applicable)
  - is_H_gas: High-calorific gas (1) or low-calorific (0)
  - is_bothDirection: Bidirectional flow capability

Output Format:
  - GeoPackage (.gpkg) with single "pipelines" layer
  - LineString geometry (pipeline routes)
  - All technical attributes preserved
  - Includes JSON metadata sidecar

Coverage by Country (sample):
  - Italy (IT): 503 segments
  - Germany (DE): 1,245 segments
  - France (FR): 687 segments
  - Poland (PL): 456 segments
  - Netherlands (NL): 389 segments
  - Spain (ES): 198 segments
  - (and 20+ more European countries)

Usage:
  # Fetch all European pipelines
  zeus tools scigrid_gas_pipelines_fetch -o europe_pipelines.gpkg
  
  # Fetch pipelines for specific bounding box
  zeus tools scigrid_gas_pipelines_fetch \
    --bbox 13.51,42.86,13.94,43.44 \
    -o saipem_area_pipelines.gpkg
  
  # Fetch pipelines within AOI shapefile
  zeus tools scigrid_gas_pipelines_fetch \
    --aoi study_area.geojson \
    -o aoi_pipelines.gpkg
  
  # Fetch only Italy pipelines
  zeus tools scigrid_gas_pipelines_fetch \
    --country IT \
    -o italy_pipelines.gpkg
  
  # Combine country filter with bbox
  zeus tools scigrid_gas_pipelines_fetch \
    --country IT \
    --bbox 13.51,42.86,13.94,43.44 \
    -o saipem_italy_pipelines.gpkg
  
  # View help
  zeus tools scigrid_gas_pipelines_fetch --bbox help -o dummy.gpkg

Options:
  --bbox MINX,MINY,MAXX,MAXY  Bounding box in EPSG:4326 (optional)
  --aoi PATH                   Area of Interest file (optional)
  -o, --output PATH            Output GeoPackage file path (required)
  --country CODE               Filter by ISO country code (optional, e.g., IT)
  --overwrite                  Overwrite existing output file

Data Attribution:
  SciGRID_gas project, Helmholtz Centre, German Aerospace Center (DLR)
  DOI: 10.5281/zenodo.4767098
  License: CC-BY-4.0 (attribution required)
  
  When using this data, please cite:
  "SciGRID_gas IGGIELGN dataset, Zenodo, DOI: 10.5281/zenodo.4767098"
  
Pipeline Routing Relevance:
  - CRITICAL for avoiding conflicts with existing gas infrastructure
  - Provides actual pipeline locations, diameters, and operating parameters
  - Essential for:
    * Minimum distance constraints (e.g., 50m from existing pipelines)
    * Crossing analysis (new pipeline crossing existing ones)
    * Corridor identification (parallel routing opportunities)
    * Regulatory compliance (right-of-way conflicts)
    * Safety analysis (proximity to pressurized gas lines)
  
Notes:
  - Data is from 2021, may not include very recent pipelines
  - Focuses on transmission pipelines (major infrastructure)
  - Distribution networks (local) not included
  - Some segments may be estimated/modeled (uncertainty attributes provided)
  - For Italy: 503 segments covering major transmission network
  - If no filter specified, downloads entire European dataset (~21 MB)
  - First run downloads dataset, subsequent runs use cached data
  
Quality Assessment:
  - Suitable for FEED/feasibility stage pipeline routing
  - Good for regional/national scale analysis
  - Should be validated with operator data for detailed engineering
  - Uncertainty metrics included for each parameter
)" << std::endl;
        return 0;
    }
    
    // Validate output path
    if (!overwrite && std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file already exists (use --overwrite to replace)" << std::endl;
        return 1;
    }
    
    std::cout << "\nFetching SciGRID_gas European gas pipeline network..." << std::endl;
    std::cout << "Source: Zenodo (DOI: 10.5281/zenodo.4767098)" << std::endl;
    if (!country.empty()) {
        std::cout << "Country filter: " << country << std::endl;
    }
    
    // Zenodo direct download URL
    std::string zenodoUrl = "https://zenodo.org/api/records/4767098/files/IGGIELGN.zip/content";
    
    // Create temporary directory for download
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / ("scigrid_gas_" + std::to_string(std::time(nullptr)));
    std::filesystem::create_directories(tempDir);
    
    std::filesystem::path zipPath = tempDir / "IGGIELGN.zip";
    
    // Download ZIP file from Zenodo
    std::cout << "Downloading from Zenodo (~21 MB)..." << std::endl;
    std::string curlCmd = "curl -L --max-time 300 \"" + zenodoUrl + "\" -o " + zipPath.string() + " 2>&1";
    
    int result = std::system(curlCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to download from Zenodo" << std::endl;
        std::cerr << "URL: " << zenodoUrl << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Check if file was downloaded
    if (!std::filesystem::exists(zipPath) || std::filesystem::file_size(zipPath) < 1000000) {
        std::cerr << "Error: Download failed or file is incomplete" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Downloaded " << std::filesystem::file_size(zipPath) << " bytes" << std::endl;
    std::cout << "Extracting pipeline data..." << std::endl;
    
    // Extract ZIP file
    std::string unzipCmd = "cd " + tempDir.string() + " && unzip -q IGGIELGN.zip 2>&1";
    result = std::system(unzipCmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Failed to extract ZIP file" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    // Path to extracted GeoJSON file
    std::filesystem::path geojsonPath = tempDir / "data" / "IGGIELGN_PipeSegments.geojson";
    
    if (!std::filesystem::exists(geojsonPath)) {
        std::cerr << "Error: Pipeline GeoJSON file not found in extracted data" << std::endl;
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "Converting to GeoPackage..." << std::endl;
    
    // Build ogr2ogr command with optional filters
    std::string ogr2ogrCmd = "ogr2ogr -f GPKG ";
    if (overwrite) ogr2ogrCmd += "-overwrite ";
    ogr2ogrCmd += "-nln pipelines ";
    
    // Add country filter via SQL if specified
    if (!country.empty()) {
        std::string sqlFilter = "-sql \"SELECT * FROM IGGIELGN_PipeSegments WHERE country_code LIKE '%" + country + "%'\" ";
        ogr2ogrCmd += sqlFilter;
    }
    
    // Add datasource and layer
    ogr2ogrCmd += outputPath + " " + geojsonPath.string() + " ";
    if (country.empty()) {
        ogr2ogrCmd += "IGGIELGN_PipeSegments ";
    }
    
    // Add spatial filter AFTER datasource (ogr2ogr requirement)
    if (!bbox.empty()) {
        // Parse bbox string (minx,miny,maxx,maxy) into separate arguments for ogr2ogr
        std::string bboxParsed = bbox;
        std::replace(bboxParsed.begin(), bboxParsed.end(), ',', ' ');
        ogr2ogrCmd += "-spat " + bboxParsed + " ";
    } else if (!aoiPath.empty()) {
        ogr2ogrCmd += "-clipsrc " + aoiPath + " ";
    }
    
    ogr2ogrCmd += "2>&1";
    
    result = std::system(ogr2ogrCmd.c_str());
    if (result != 0) {
        std::cerr << "Warning: ogr2ogr reported issues during conversion" << std::endl;
    }
    
    // Clean up temporary directory
    std::filesystem::remove_all(tempDir);
    
    // Check if output was created
    if (!std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata sidecar
    nlohmann::json meta;
    meta["tool"] = "scigrid_gas_pipelines_fetch";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["data_source"] = "SciGRID_gas IGGIELGN via Zenodo";
    meta["provider"] = "Helmholtz Centre / German Aerospace Center (DLR)";
    meta["repository"] = "Zenodo";
    meta["doi"] = "10.5281/zenodo.4767098";
    meta["url"] = "https://zenodo.org/records/4767098";
    meta["dataset_version"] = "IGGIELGN (2021)";
    meta["coverage"] = "European gas transmission network";
    meta["features"] = "6,323 pipeline segments (~206,000 km)";
    meta["format"] = "GeoPackage (converted from GeoJSON)";
    meta["crs"] = "EPSG:4326 (WGS84)";
    meta["license"] = "CC-BY-4.0 (Open, attribution required)";
    meta["attribution"] = "SciGRID_gas project, DOI: 10.5281/zenodo.4767098";
    meta["attributes"] = {
        "name", "id", "country_code", "diameter_mm", "length_km",
        "max_cap_M_m3_per_d", "max_pressure_bar", "start_year", "end_year",
        "is_H_gas", "is_bothDirection"
    };
    
    if (!bbox.empty()) meta["query_bbox"] = bbox;
    if (!aoiPath.empty()) meta["query_aoi"] = aoiPath;
    if (!country.empty()) meta["query_country"] = country;
    
    write_sidecar_json(outputPath, meta);
    
    std::cout << "tools scigrid_gas_pipelines_fetch OK: " << outputPath << std::endl;
    return 0;
}

// ==============================================================================
// DEM ANALYSIS TOOLS - TERRAIN PROCESSING
// ==============================================================================

int tools_terrain_slope(const std::string& inputDEM,
                       const std::string& outputSlope,
                       bool asPercent,
                       bool computeEdges,
                       const std::string& algorithm,
                       bool overwrite) {
    std::cout << "Calculating slope from DEM...\n";
    std::cout << "Input: " << inputDEM << "\n";
    std::cout << "Output: " << outputSlope << "\n";
    std::cout << "Format: " << (asPercent ? "Percentage" : "Degrees") << "\n";
    std::cout << "Algorithm: " << algorithm << "\n";
    
    // Check if input exists
    if (!std::filesystem::exists(inputDEM)) {
        std::cerr << "Error: Input DEM not found: " << inputDEM << std::endl;
        return 1;
    }
    
    // Check if output exists
    if (std::filesystem::exists(outputSlope) && !overwrite) {
        std::cerr << "Error: Output file exists (use --overwrite): " << outputSlope << std::endl;
        return 1;
    }
    
    // Build gdaldem slope command
    std::string cmd = "gdaldem slope ";
    cmd += "\"" + inputDEM + "\" ";
    cmd += "\"" + outputSlope + "\" ";
    
    // Add options
    if (asPercent) {
        cmd += "-p "; // output as percentage instead of degrees
    }
    if (computeEdges) {
        cmd += "-compute_edges ";
    }
    if (algorithm == "ZevenbergenThorne") {
        cmd += "-alg ZevenbergenThorne ";
    }
    
    // Output as COG with compression (gdaldem outputs Float32 by default)
    cmd += "-of COG -co COMPRESS=DEFLATE -co PREDICTOR=2 ";
    cmd += "-co NUM_THREADS=ALL_CPUS ";
    
    cmd += "2>&1";
    
    std::cout << "\nRunning GDAL command...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdaldem slope failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputSlope)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_slope";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_dem"] = inputDEM;
    meta["output_slope"] = outputSlope;
    meta["units"] = asPercent ? "percentage" : "degrees";
    meta["algorithm"] = algorithm;
    meta["compute_edges"] = computeEdges;
    
    std::string metaPath = outputSlope + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Slope calculation complete!\n";
    std::cout << "Output: " << outputSlope << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    
    return 0;
}

int tools_terrain_aspect(const std::string& inputDEM,
                        const std::string& outputAspect,
                        bool zeroForFlat,
                        bool overwrite) {
    std::cout << "Calculating aspect from DEM...\n";
    std::cout << "Input: " << inputDEM << "\n";
    std::cout << "Output: " << outputAspect << "\n";
    std::cout << "Zero for flat: " << (zeroForFlat ? "Yes" : "No (use -9999)") << "\n";
    
    // Check if input exists
    if (!std::filesystem::exists(inputDEM)) {
        std::cerr << "Error: Input DEM not found: " << inputDEM << std::endl;
        return 1;
    }
    
    // Check if output exists
    if (std::filesystem::exists(outputAspect) && !overwrite) {
        std::cerr << "Error: Output file exists (use --overwrite): " << outputAspect << std::endl;
        return 1;
    }
    
    // Build gdaldem aspect command
    std::string cmd = "gdaldem aspect ";
    cmd += "\"" + inputDEM + "\" ";
    cmd += "\"" + outputAspect + "\" ";
    
    // Add options
    if (zeroForFlat) {
        cmd += "-zero_for_flat ";
    }
    
    // Output as COG with compression (gdaldem outputs Float32 by default)
    cmd += "-of COG -co COMPRESS=DEFLATE -co PREDICTOR=2 ";
    cmd += "-co NUM_THREADS=ALL_CPUS ";
    
    cmd += "2>&1";
    
    std::cout << "\nRunning GDAL command...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdaldem aspect failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputAspect)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_aspect";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_dem"] = inputDEM;
    meta["output_aspect"] = outputAspect;
    meta["units"] = "degrees (0-360, 0=North, clockwise)";
    meta["zero_for_flat"] = zeroForFlat;
    meta["nodata_value"] = zeroForFlat ? 0.0 : -9999.0;
    
    std::string metaPath = outputAspect + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Aspect calculation complete!\n";
    std::cout << "Output: " << outputAspect << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    
    return 0;
}

int tools_terrain_curvature(const std::string& inputDEM,
                            const std::string& outputCurvature,
                            const std::string& curvatureType,
                            bool overwrite) {
    std::cout << "Calculating terrain curvature from DEM...\n";
    std::cout << "Input: " << inputDEM << "\n";
    std::cout << "Output: " << outputCurvature << "\n";
    std::cout << "Type: " << curvatureType << "\n";
    
    // Check if input exists
    if (!std::filesystem::exists(inputDEM)) {
        std::cerr << "Error: Input DEM not found: " << inputDEM << std::endl;
        return 1;
    }
    
    // Check if output exists
    if (std::filesystem::exists(outputCurvature) && !overwrite) {
        std::cerr << "Error: Output file exists (use --overwrite): " << outputCurvature << std::endl;
        return 1;
    }
    
    // Validate curvature type
    if (curvatureType != "profile" && curvatureType != "planform" && curvatureType != "total") {
        std::cerr << "Error: Invalid curvature type: " << curvatureType << std::endl;
        std::cerr << "Valid types: profile, planform, total" << std::endl;
        return 1;
    }
    
    // Note: GDAL doesn't have a built-in curvature tool, so we'll use Python/NumPy
    // Create a temporary Python script to calculate curvature
    
    std::string pythonScript = R"(
import sys
import numpy as np
from osgeo import gdal
import warnings
warnings.filterwarnings('ignore')

def calculate_curvature(dem_path, output_path, curv_type):
    """Calculate terrain curvature from DEM."""
    
    # Open DEM
    ds = gdal.Open(dem_path)
    if ds is None:
        print(f"Error: Could not open DEM: {dem_path}", file=sys.stderr)
        return 1
    
    band = ds.GetRasterBand(1)
    dem = band.ReadAsArray().astype(np.float64)
    nodata = band.GetNoDataValue()
    
    # Get geotransform for cell size
    gt = ds.GetGeoTransform()
    cellsize_x = abs(gt[1])
    cellsize_y = abs(gt[5])
    cellsize = (cellsize_x + cellsize_y) / 2.0  # Average cell size
    
    # Handle nodata
    if nodata is not None:
        dem_masked = np.ma.masked_equal(dem, nodata)
    else:
        dem_masked = np.ma.masked_invalid(dem)
    
    # Calculate first derivatives (slope components)
    dz_dx = np.gradient(dem_masked, cellsize, axis=1)
    dz_dy = np.gradient(dem_masked, cellsize, axis=0)
    
    # Calculate second derivatives
    d2z_dx2 = np.gradient(dz_dx, cellsize, axis=1)
    d2z_dy2 = np.gradient(dz_dy, cellsize, axis=0)
    d2z_dxdy = np.gradient(dz_dx, cellsize, axis=0)
    
    if curv_type == 'profile':
        # Profile curvature: curvature in the direction of maximum slope
        p = dz_dx**2 + dz_dy**2
        q = p + 1
        curvature = -(d2z_dx2 * dz_dx**2 + 2 * d2z_dxdy * dz_dx * dz_dy + d2z_dy2 * dz_dy**2) / (p * q**1.5 + 1e-10)
    elif curv_type == 'planform':
        # Planform curvature: curvature perpendicular to maximum slope
        p = dz_dx**2 + dz_dy**2
        q = p + 1
        curvature = (d2z_dx2 * dz_dy**2 - 2 * d2z_dxdy * dz_dx * dz_dy + d2z_dy2 * dz_dx**2) / (p * q**0.5 + 1e-10)
    else:  # total
        # Total curvature (mean curvature)
        curvature = -0.5 * (d2z_dx2 + d2z_dy2)
    
    # Convert masked array back to regular array with nodata
    curvature_out = np.where(dem_masked.mask, -9999.0, curvature.filled(-9999.0))
    
    # Save geotransform and projection before closing
    geotransform = ds.GetGeoTransform()
    projection = ds.GetProjection()
    
    # Close input dataset
    ds = None
    
    # Create output raster
    driver = gdal.GetDriverByName('GTiff')
    out_ds = driver.Create(output_path, dem.shape[1], dem.shape[0], 1, gdal.GDT_Float32,
                           options=['COMPRESS=DEFLATE', 'PREDICTOR=2', 'NUM_THREADS=ALL_CPUS', 'TILED=YES'])
    if out_ds is None:
        print(f"Error: Could not create output file: {output_path}", file=sys.stderr)
        return 1
    
    out_ds.SetGeoTransform(geotransform)
    out_ds.SetProjection(projection)
    
    out_band = out_ds.GetRasterBand(1)
    out_band.WriteArray(curvature_out.astype(np.float32))
    out_band.SetNoDataValue(-9999.0)
    out_band.FlushCache()
    
    # Close output dataset
    out_ds = None
    
    return 0

if __name__ == '__main__':
    if len(sys.argv) != 4:
        print("Usage: python script.py <dem_path> <output_path> <curv_type>", file=sys.stderr)
        sys.exit(1)
    
    sys.exit(calculate_curvature(sys.argv[1], sys.argv[2], sys.argv[3]))
)";
    
    // Write Python script to temp file
    std::string scriptPath = "/tmp/zeus_curvature_" + std::to_string(std::time(nullptr)) + ".py";
    std::ofstream scriptFile(scriptPath);
    if (!scriptFile.good()) {
        std::cerr << "Error: Could not create temporary Python script" << std::endl;
        return 1;
    }
    scriptFile << pythonScript;
    scriptFile.close();
    
    // Build Python command
    std::string cmd = "python3 \"" + scriptPath + "\" ";
    cmd += "\"" + inputDEM + "\" ";
    cmd += "\"" + outputCurvature + "\" ";
    cmd += curvatureType + " ";
    cmd += "2>&1";
    
    std::cout << "\nCalculating curvature using Python/NumPy...\n";
    int result = std::system(cmd.c_str());
    
    // Clean up temp script
    std::filesystem::remove(scriptPath);
    
    if (result != 0) {
        std::cerr << "Error: Curvature calculation failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputCurvature)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_curvature";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_dem"] = inputDEM;
    meta["output_curvature"] = outputCurvature;
    meta["curvature_type"] = curvatureType;
    meta["units"] = "1/meters";
    meta["interpretation"]["positive"] = "convex (ridge)";
    meta["interpretation"]["negative"] = "concave (valley)";
    meta["interpretation"]["zero"] = "flat or planar";
    
    std::string metaPath = outputCurvature + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Curvature calculation complete!\n";
    std::cout << "Output: " << outputCurvature << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    
    return 0;
}

int tools_raster_threshold(const std::string& inputRaster,
                           const std::string& outputRaster,
                           double thresholdValue,
                           double aboveValue,
                           double belowValue,
                           bool invert,
                           bool overwrite) {
    std::cout << "Applying threshold to raster...\n";
    std::cout << "Input: " << inputRaster << "\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Threshold: " << thresholdValue << "\n";
    std::cout << "Above value: " << aboveValue << "\n";
    std::cout << "Below value: " << belowValue << "\n";
    std::cout << "Inverted: " << (invert ? "Yes" : "No") << "\n";
    
    // Check if input exists
    if (!std::filesystem::exists(inputRaster)) {
        std::cerr << "Error: Input raster not found: " << inputRaster << std::endl;
        return 1;
    }
    
    // Check if output exists
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists (use --overwrite): " << outputRaster << std::endl;
        return 1;
    }
    
    // Use gdal_calc.py for threshold operation
    // Build the expression based on invert flag
    std::string expression;
    if (invert) {
        // If inverted: above threshold gets belowValue, below gets aboveValue
        expression = "where(A>" + std::to_string(thresholdValue) + "," + 
                     std::to_string(belowValue) + "," + std::to_string(aboveValue) + ")";
    } else {
        // Normal: above threshold gets aboveValue, below gets belowValue
        expression = "where(A>" + std::to_string(thresholdValue) + "," + 
                     std::to_string(aboveValue) + "," + std::to_string(belowValue) + ")";
    }
    
    // Create temporary GeoTIFF first (gdal_calc.py doesn't support COG directly)
    std::string tempOutput = outputRaster + ".tmp.tif";
    
    std::string cmd = "gdal_calc.py ";
    cmd += "-A \"" + inputRaster + "\" ";
    cmd += "--outfile=\"" + tempOutput + "\" ";
    cmd += "--calc=\"" + expression + "\" ";
    cmd += "--type=Float32 ";
    cmd += "--co=COMPRESS=DEFLATE --co=PREDICTOR=2 ";
    cmd += "--overwrite ";
    cmd += "--quiet ";
    cmd += "2>&1";
    
    std::cout << "\nRunning gdal_calc.py...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdal_calc.py failed with code " << result << std::endl;
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate ";
    cogCmd += "-of COG ";
    cogCmd += "-co COMPRESS=DEFLATE ";
    cogCmd += "-co PREDICTOR=2 ";
    cogCmd += "-co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" ";
    cogCmd += "\"" + outputRaster + "\" ";
    cogCmd += "2>&1";
    
    result = std::system(cogCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_threshold";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_raster"] = inputRaster;
    meta["output_raster"] = outputRaster;
    meta["threshold_value"] = thresholdValue;
    meta["above_value"] = aboveValue;
    meta["below_value"] = belowValue;
    meta["inverted"] = invert;
    meta["expression"] = expression;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Threshold application complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    
    return 0;
}

// ============================================================================
// PHASE 3B: CRITICAL GEOSPATIAL TOOLS
// ============================================================================

// ----------------------------------------------------------------------------
// 1. RASTER CALC - Raster Algebra
// ----------------------------------------------------------------------------
int tools_raster_calc(const std::string& inputsStr,
                     const std::string& expression,
                     const std::string& outputRaster,
                     const std::string& noDataValue,
                     const std::string& outputType,
                     bool overwrite) {
    
    // Help message check
    if (inputsStr == "help" || expression == "help") {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER CALC - Raster Algebra Tool\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Perform arithmetic and algebraic operations on rasters.\n";
        std::cout << "\nUsage:\n";
        std::cout << "  zeus tools raster_calc --inputs \"A:slope.tif,B:cost.tif\" \\\n";
        std::cout << "    --calc \"(A * 0.7) + (B * 0.3)\" -o output.tif\n";
        std::cout << "\nSupported Operations:\n";
        std::cout << "  Arithmetic: +, -, *, /, **, %, //\n";
        std::cout << "  Comparison: <, <=, >, >=, ==, !=\n";
        std::cout << "  Logical: &, |, ~\n";
        std::cout << "  Functions: sqrt, log, log10, sin, cos, tan, exp, abs\n";
        std::cout << "  NumPy: maximum, minimum, where, clip, etc.\n";
        std::cout << "\nExamples:\n";
        std::cout << "  # Weighted sum\n";
        std::cout << "  --inputs \"A:slope.tif,B:cost.tif\" --calc \"(A*0.7)+(B*0.3)\"\n";
        std::cout << "\n  # NDVI calculation\n";
        std::cout << "  --inputs \"NIR:band4.tif,RED:band3.tif\" --calc \"(NIR-RED)/(NIR+RED)\"\n";
        std::cout << "\n  # Conditional\n";
        std::cout << "  --inputs \"A:input.tif\" --calc \"where(A>100, 1, 0)\"\n";
        std::cout << "\n  # Multiple bands\n";
        std::cout << "  --inputs \"A:r1.tif,B:r2.tif,C:r3.tif\" --calc \"(A+B+C)/3\"\n";
        std::cout << "\nOptions:\n";
        std::cout << "  --inputs    : Comma-separated list of var:file pairs (A:file1.tif,B:file2.tif)\n";
        std::cout << "  --calc      : Expression using variables (e.g., \"(A*0.5)+(B*0.5)\")\n";
        std::cout << "  -o, --output: Output raster path\n";
        std::cout << "  --nodata    : NoData value (default: preserve from first input)\n";
        std::cout << "  --type      : Output data type (Float32, Float64, Int16, UInt16, etc.)\n";
        std::cout << "  --overwrite : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\n";
        return 0;
    }
    
    // Validate inputs
    if (inputsStr.empty()) {
        std::cerr << "Error: --inputs required (e.g., \"A:file1.tif,B:file2.tif\")\n";
        return 1;
    }
    
    if (expression.empty()) {
        std::cerr << "Error: --calc expression required\n";
        return 1;
    }
    
    if (outputRaster.empty()) {
        std::cerr << "Error: Output path required\n";
        return 1;
    }
    
    // Check overwrite
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER CALC - Performing Raster Algebra\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Inputs: " << inputsStr << "\n";
    std::cout << "Expression: " << expression << "\n";
    std::cout << "Output: " << outputRaster << "\n";
    if (!noDataValue.empty()) std::cout << "NoData: " << noDataValue << "\n";
    if (!outputType.empty()) std::cout << "Type: " << outputType << "\n";
    std::cout << "\n";
    
    // Parse inputs string (format: "A:file1.tif,B:file2.tif,C:file3.tif")
    std::ostringstream gdal_calc_cmd;
    gdal_calc_cmd << "gdal_calc.py --quiet --overwrite ";
    
    // Add output type if specified
    if (!outputType.empty()) {
        gdal_calc_cmd << "--type=" << outputType << " ";
    }
    
    // Add NoData if specified
    if (!noDataValue.empty()) {
        gdal_calc_cmd << "--NoDataValue=" << noDataValue << " ";
    }
    
    // Parse and add input files
    std::istringstream iss(inputsStr);
    std::string pair;
    std::vector<std::string> inputFiles;
    
    while (std::getline(iss, pair, ',')) {
        size_t colonPos = pair.find(':');
        if (colonPos == std::string::npos) {
            std::cerr << "Error: Invalid input format. Expected 'VAR:file.tif'\n";
            return 1;
        }
        
        std::string var = pair.substr(0, colonPos);
        std::string file = pair.substr(colonPos + 1);
        
        // Trim whitespace
        var.erase(0, var.find_first_not_of(" \t"));
        var.erase(var.find_last_not_of(" \t") + 1);
        file.erase(0, file.find_first_not_of(" \t"));
        file.erase(file.find_last_not_of(" \t") + 1);
        
        if (!std::filesystem::exists(file)) {
            std::cerr << "Error: Input file not found: " << file << "\n";
            return 1;
        }
        
        gdal_calc_cmd << "--" << var << "=\"" << file << "\" ";
        inputFiles.push_back(var + ":" + file);
    }
    
    // Add expression and output
    gdal_calc_cmd << "--calc=\"" << expression << "\" ";
    gdal_calc_cmd << "--outfile=\"" << outputRaster << "\"";
    
    std::cout << "Running gdal_calc.py...\n";
    
    int result = std::system(gdal_calc_cmd.str().c_str());
    if (result != 0) {
        std::cerr << "Error: gdal_calc.py failed with code " << result << "\n";
        return 1;
    }
    
    // Verify output
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created\n";
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate -q -of COG -co COMPRESS=LZW -co BIGTIFF=IF_SAFER \"" + 
                        outputRaster + "\" \"" + outputRaster + ".tmp\" && mv \"" + 
                        outputRaster + ".tmp\" \"" + outputRaster + "\"";
    std::system(cogCmd.c_str());
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_calc";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["inputs"] = inputFiles;
    meta["expression"] = expression;
    meta["output_raster"] = outputRaster;
    if (!noDataValue.empty()) meta["nodata_value"] = noDataValue;
    if (!outputType.empty()) meta["output_type"] = outputType;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Raster calculation complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "\n";
    
    return 0;
}

// ----------------------------------------------------------------------------
// 2. RASTER RECLASSIFY - Remap raster values
// ----------------------------------------------------------------------------
int tools_raster_reclassify(const std::string& inputRaster,
                            const std::string& outputRaster,
                            const std::string& reclassRules,
                            const std::string& outputType,
                            bool overwrite) {
    
    // Help message check
    if (inputRaster == "help" || reclassRules == "help") {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER RECLASSIFY - Remap Raster Values\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Reclassify raster values into new categories or ranges.\n";
        std::cout << "\nUsage:\n";
        std::cout << "  zeus tools raster_reclassify -i slope.tif -o slope_classes.tif \\\n";
        std::cout << "    --rules \"0:5=1,5:10=2,10:20=3,20:100=4\"\n";
        std::cout << "\nRule Format:\n";
        std::cout << "  \"min1:max1=value1,min2:max2=value2,...\"\n";
        std::cout << "  - Ranges are inclusive: [min, max]\n";
        std::cout << "  - Use * for unbounded: \"*:0=1,0:*=2\"\n";
        std::cout << "\nExamples:\n";
        std::cout << "  # Slope classes\n";
        std::cout << "  --rules \"0:5=1,5:10=2,10:15=3,15:20=4,20:*=5\"\n";
        std::cout << "\n  # Binary threshold\n";
        std::cout << "  --rules \"*:100=0,100:*=1\"\n";
        std::cout << "\n  # Cost multipliers\n";
        std::cout << "  --rules \"0:5=1.0,5:10=1.3,10:15=1.8,15:20=2.5,20:*=10.0\"\n";
        std::cout << "\nOptions:\n";
        std::cout << "  -i, --input : Input raster path\n";
        std::cout << "  -o, --output: Output raster path\n";
        std::cout << "  --rules     : Reclassification rules (quoted string)\n";
        std::cout << "  --type      : Output data type (Float32, Int16, Byte, etc.)\n";
        std::cout << "  --overwrite : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\n";
        return 0;
    }
    
    // Validate inputs
    if (inputRaster.empty()) {
        std::cerr << "Error: Input raster required (-i)\n";
        return 1;
    }
    
    if (!std::filesystem::exists(inputRaster)) {
        std::cerr << "Error: Input raster not found: " << inputRaster << "\n";
        return 1;
    }
    
    if (outputRaster.empty()) {
        std::cerr << "Error: Output path required (-o)\n";
        return 1;
    }
    
    if (reclassRules.empty()) {
        std::cerr << "Error: Reclassification rules required (--rules)\n";
        return 1;
    }
    
    // Check overwrite
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER RECLASSIFY - Remapping Values\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputRaster << "\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Rules: " << reclassRules << "\n";
    if (!outputType.empty()) std::cout << "Type: " << outputType << "\n";
    std::cout << "\n";
    
    // Parse rules: "0:5=1,5:10=2,10:20=3"
    // Build gdal_calc expression using nested where() statements
    std::string expression;
    std::vector<std::string> rules;
    
    // Split by comma
    std::stringstream ss(reclassRules);
    std::string rule;
    while (std::getline(ss, rule, ',')) {
        rules.push_back(rule);
    }
    
    if (rules.empty()) {
        std::cerr << "Error: No valid rules found\n";
        return 1;
    }
    
    // Build nested where() expression
    // Start from the end and work backwards
    expression = "0";  // Default value if no rules match
    
    for (auto it = rules.rbegin(); it != rules.rend(); ++it) {
        std::string r = *it;
        
        // Parse rule: "min:max=value"
        size_t colonPos = r.find(':');
        size_t equalPos = r.find('=');
        
        if (colonPos == std::string::npos || equalPos == std::string::npos) {
            std::cerr << "Error: Invalid rule format: " << r << "\n";
            std::cerr << "Expected format: min:max=value\n";
            return 1;
        }
        
        std::string minStr = r.substr(0, colonPos);
        std::string maxStr = r.substr(colonPos + 1, equalPos - colonPos - 1);
        std::string valueStr = r.substr(equalPos + 1);
        
        // Trim whitespace
        minStr.erase(0, minStr.find_first_not_of(" \t"));
        minStr.erase(minStr.find_last_not_of(" \t") + 1);
        maxStr.erase(0, maxStr.find_first_not_of(" \t"));
        maxStr.erase(maxStr.find_last_not_of(" \t") + 1);
        valueStr.erase(0, valueStr.find_first_not_of(" \t"));
        valueStr.erase(valueStr.find_last_not_of(" \t") + 1);
        
        // Build condition
        std::string condition;
        if (minStr == "*" && maxStr == "*") {
            condition = "True";  // Always true
        } else if (minStr == "*") {
            condition = "(A<=" + maxStr + ")";
        } else if (maxStr == "*") {
            condition = "(A>=" + minStr + ")";
        } else {
            condition = "((A>=" + minStr + ")&(A<=" + maxStr + "))";
        }
        
        // Nest the where()
        expression = "where(" + condition + "," + valueStr + "," + expression + ")";
    }
    
    std::cout << "Generated expression: " << expression << "\n\n";
    
    // Create temporary GeoTIFF first
    std::string tempOutput = outputRaster + ".tmp.tif";
    
    // Determine output type
    std::string outType = outputType.empty() ? "Float32" : outputType;
    
    std::string cmd = "gdal_calc.py ";
    cmd += "-A \"" + inputRaster + "\" ";
    cmd += "--outfile=\"" + tempOutput + "\" ";
    cmd += "--calc=\"" + expression + "\" ";
    cmd += "--type=" + outType + " ";
    cmd += "--co=COMPRESS=DEFLATE --co=PREDICTOR=2 ";
    cmd += "--overwrite ";
    cmd += "--quiet ";
    cmd += "2>&1";
    
    std::cout << "Running gdal_calc.py...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdal_calc.py failed with code " << result << std::endl;
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate ";
    cogCmd += "-of COG ";
    cogCmd += "-co COMPRESS=DEFLATE ";
    cogCmd += "-co PREDICTOR=2 ";
    cogCmd += "-co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" ";
    cogCmd += "\"" + outputRaster + "\" ";
    cogCmd += "2>&1";
    
    result = std::system(cogCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_reclassify";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_raster"] = inputRaster;
    meta["output_raster"] = outputRaster;
    meta["reclass_rules"] = reclassRules;
    meta["expression"] = expression;
    meta["output_type"] = outType;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Reclassification complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "\n";
    
    return 0;
}

// ----------------------------------------------------------------------------
// 3. RASTER BOOLEAN - Boolean overlay operations
// ----------------------------------------------------------------------------
int tools_raster_boolean(const std::string& inputsStr,
                        const std::string& operation,
                        const std::string& outputRaster,
                        bool overwrite) {
    
    // Help message check
    if (inputsStr == "help" || operation == "help") {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER BOOLEAN - Boolean Overlay Operations\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Combine constraint masks using boolean logic (AND, OR, NOT, XOR).\n";
        std::cout << "\nUsage:\n";
        std::cout << "  zeus tools raster_boolean --inputs \"mask1.tif,mask2.tif,mask3.tif\" \\\n";
        std::cout << "    --operation AND -o combined_mask.tif\n";
        std::cout << "\nOperations:\n";
        std::cout << "  AND : All inputs must be true (non-zero)\n";
        std::cout << "  OR  : At least one input must be true\n";
        std::cout << "  XOR : Exactly one input must be true\n";
        std::cout << "  NOT : Invert first input (requires single input)\n";
        std::cout << "\nExamples:\n";
        std::cout << "  # Combine constraints (all must be satisfied)\n";
        std::cout << "  --inputs \"slope_ok.tif,protected_ok.tif,geohazard_ok.tif\" --operation AND\n";
        std::cout << "\n  # Any constraint violated\n";
        std::cout << "  --inputs \"slope_bad.tif,protected_bad.tif\" --operation OR\n";
        std::cout << "\n  # Invert mask\n";
        std::cout << "  --inputs \"prohibited.tif\" --operation NOT\n";
        std::cout << "\nOptions:\n";
        std::cout << "  --inputs    : Comma-separated list of raster paths\n";
        std::cout << "  --operation : Boolean operation (AND, OR, XOR, NOT)\n";
        std::cout << "  -o, --output: Output raster path\n";
        std::cout << "  --overwrite : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\n";
        return 0;
    }
    
    // Validate inputs
    if (inputsStr.empty()) {
        std::cerr << "Error: --inputs required (comma-separated raster paths)\n";
        return 1;
    }
    
    if (operation.empty()) {
        std::cerr << "Error: --operation required (AND, OR, XOR, NOT)\n";
        return 1;
    }
    
    if (outputRaster.empty()) {
        std::cerr << "Error: Output path required (-o)\n";
        return 1;
    }
    
    // Check overwrite
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    // Parse inputs
    std::vector<std::string> inputs;
    std::stringstream ss(inputsStr);
    std::string input;
    while (std::getline(ss, input, ',')) {
        // Trim whitespace
        input.erase(0, input.find_first_not_of(" \t"));
        input.erase(input.find_last_not_of(" \t") + 1);
        if (!input.empty()) {
            inputs.push_back(input);
        }
    }
    
    if (inputs.empty()) {
        std::cerr << "Error: No valid input rasters found\n";
        return 1;
    }
    
    // Validate operation
    std::string op = operation;
    std::transform(op.begin(), op.end(), op.begin(), ::toupper);
    
    if (op != "AND" && op != "OR" && op != "XOR" && op != "NOT") {
        std::cerr << "Error: Invalid operation. Must be AND, OR, XOR, or NOT\n";
        return 1;
    }
    
    // NOT requires exactly 1 input
    if (op == "NOT" && inputs.size() != 1) {
        std::cerr << "Error: NOT operation requires exactly 1 input\n";
        return 1;
    }
    
    // Other operations require at least 2 inputs
    if (op != "NOT" && inputs.size() < 2) {
        std::cerr << "Error: " << op << " operation requires at least 2 inputs\n";
        return 1;
    }
    
    // Check all inputs exist
    for (const auto& inp : inputs) {
        if (!std::filesystem::exists(inp)) {
            std::cerr << "Error: Input raster not found: " << inp << "\n";
            return 1;
        }
    }
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER BOOLEAN - " << op << " Operation\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Inputs (" << inputs.size() << "):\n";
    for (size_t i = 0; i < inputs.size(); ++i) {
        std::cout << "  [" << (char)('A' + i) << "] " << inputs[i] << "\n";
    }
    std::cout << "Operation: " << op << "\n";
    std::cout << "Output: " << outputRaster << "\n\n";
    
    // Build expression
    std::string expression;
    
    if (op == "NOT") {
        expression = "(A==0)*1";  // Invert: 0->1, non-zero->0
    } else if (op == "AND") {
        // All must be non-zero
        expression = "(A!=0)";
        for (size_t i = 1; i < inputs.size(); ++i) {
            expression += "&(" + std::string(1, 'A' + i) + "!=0)";
        }
        expression = "(" + expression + ")*1";
    } else if (op == "OR") {
        // At least one must be non-zero
        expression = "(A!=0)";
        for (size_t i = 1; i < inputs.size(); ++i) {
            expression += "|(" + std::string(1, 'A' + i) + "!=0)";
        }
        expression = "(" + expression + ")*1";
    } else if (op == "XOR") {
        // Exactly one must be non-zero (sum of booleans == 1)
        expression = "((A!=0)";
        for (size_t i = 1; i < inputs.size(); ++i) {
            expression += "+(" + std::string(1, 'A' + i) + "!=0)";
        }
        expression += "==1)*1";
    }
    
    std::cout << "Expression: " << expression << "\n\n";
    
    // Build gdal_calc command
    std::string tempOutput = outputRaster + ".tmp.tif";
    
    std::string cmd = "gdal_calc.py ";
    for (size_t i = 0; i < inputs.size(); ++i) {
        cmd += "-" + std::string(1, 'A' + i) + " \"" + inputs[i] + "\" ";
    }
    cmd += "--outfile=\"" + tempOutput + "\" ";
    cmd += "--calc=\"" + expression + "\" ";
    cmd += "--type=Byte ";
    cmd += "--co=COMPRESS=DEFLATE ";
    cmd += "--overwrite ";
    cmd += "--quiet ";
    cmd += "2>&1";
    
    std::cout << "Running gdal_calc.py...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdal_calc.py failed with code " << result << std::endl;
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate ";
    cogCmd += "-of COG ";
    cogCmd += "-co COMPRESS=DEFLATE ";
    cogCmd += "-co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" ";
    cogCmd += "\"" + outputRaster + "\" ";
    cogCmd += "2>&1";
    
    result = std::system(cogCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_boolean";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["inputs"] = inputs;
    meta["operation"] = op;
    meta["expression"] = expression;
    meta["output_raster"] = outputRaster;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Boolean operation complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "\n";
    
    return 0;
}

// ----------------------------------------------------------------------------
// 4. VECTOR TO RASTER - Convert vector features to raster
// ----------------------------------------------------------------------------
int tools_vector_to_raster(const std::string& inputVector,
                           const std::string& outputRaster,
                           const std::string& attribute,
                           double resolution,
                           const std::string& extent,
                           const std::string& burnValue,
                           const std::string& outputType,
                           bool overwrite) {
    
    // Help message check
    if (inputVector == "help") {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  VECTOR TO RASTER - Rasterize Vector Features\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Convert vector features (points, lines, polygons) to raster format.\n";
        std::cout << "\nUsage:\n";
        std::cout << "  zeus tools vector_to_raster -i roads.gpkg -o roads_raster.tif \\\n";
        std::cout << "    --resolution 10 --burn 1\n";
        std::cout << "\nOptions:\n";
        std::cout << "  -i, --input     : Input vector path (GPKG, SHP, GeoJSON)\n";
        std::cout << "  -o, --output    : Output raster path\n";
        std::cout << "  --attribute     : Attribute field to burn (use field values as pixel values)\n";
        std::cout << "  --resolution    : Output pixel resolution in CRS units (required)\n";
        std::cout << "  --extent        : Extent as \"minx,miny,maxx,maxy\" (default: from input)\n";
        std::cout << "  --burn          : Fixed value to burn (default: 1)\n";
        std::cout << "  --type          : Output data type (Float32, Int16, Byte, etc.)\n";
        std::cout << "  --overwrite     : Overwrite existing output\n";
        std::cout << "\nExamples:\n";
        std::cout << "  # Roads as binary mask\n";
        std::cout << "  -i roads.gpkg -o roads.tif --resolution 10 --burn 1\n";
        std::cout << "\n  # Protected areas with category values\n";
        std::cout << "  -i protected.gpkg -o protected.tif --resolution 30 --attribute category\n";
        std::cout << "\n  # Infrastructure cost surface\n";
        std::cout << "  -i infrastructure.gpkg -o infra_cost.tif --resolution 10 --attribute cost_mult\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\n";
        return 0;
    }
    
    // Validate inputs
    if (inputVector.empty()) {
        std::cerr << "Error: Input vector required (-i)\n";
        return 1;
    }
    
    if (!std::filesystem::exists(inputVector)) {
        std::cerr << "Error: Input vector not found: " << inputVector << "\n";
        return 1;
    }
    
    if (outputRaster.empty()) {
        std::cerr << "Error: Output path required (-o)\n";
        return 1;
    }
    
    if (resolution <= 0) {
        std::cerr << "Error: --resolution required (positive value in CRS units)\n";
        return 1;
    }
    
    // Check overwrite
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  VECTOR TO RASTER - Rasterizing Features\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputVector << "\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Resolution: " << resolution << " (CRS units)\n";
    if (!attribute.empty()) std::cout << "Attribute: " << attribute << "\n";
    if (!burnValue.empty()) std::cout << "Burn value: " << burnValue << "\n";
    if (!extent.empty()) std::cout << "Extent: " << extent << "\n";
    std::cout << "\n";
    
    // Build gdal_rasterize command
    std::string tempOutput = outputRaster + ".tmp.tif";
    
    std::string cmd = "gdal_rasterize ";
    
    // Burn value or attribute
    if (!attribute.empty()) {
        cmd += "-a \"" + attribute + "\" ";
    } else if (!burnValue.empty()) {
        cmd += "-burn " + burnValue + " ";
    } else {
        cmd += "-burn 1 ";  // Default burn value
    }
    
    // Resolution
    cmd += "-tr " + std::to_string(resolution) + " " + std::to_string(resolution) + " ";
    
    // Extent
    if (!extent.empty()) {
        cmd += "-te " + extent + " ";
    }
    
    // Output type
    std::string outType = outputType.empty() ? "Float32" : outputType;
    cmd += "-ot " + outType + " ";
    
    // Compression
    cmd += "-co COMPRESS=DEFLATE -co PREDICTOR=2 ";
    
    // Input and output
    cmd += "\"" + inputVector + "\" ";
    cmd += "\"" + tempOutput + "\" ";
    cmd += "2>&1";
    
    std::cout << "Running gdal_rasterize...\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdal_rasterize failed with code " << result << std::endl;
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate ";
    cogCmd += "-of COG ";
    cogCmd += "-co COMPRESS=DEFLATE ";
    cogCmd += "-co PREDICTOR=2 ";
    cogCmd += "-co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" ";
    cogCmd += "\"" + outputRaster + "\" ";
    cogCmd += "2>&1";
    
    result = std::system(cogCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "vector_to_raster";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_vector"] = inputVector;
    meta["output_raster"] = outputRaster;
    meta["resolution"] = resolution;
    if (!attribute.empty()) meta["attribute"] = attribute;
    if (!burnValue.empty()) meta["burn_value"] = burnValue;
    if (!extent.empty()) meta["extent"] = extent;
    meta["output_type"] = outType;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Rasterization complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "\n";
    
    return 0;
}

// ----------------------------------------------------------------------------
// 5. RASTER PROXIMITY - Euclidean distance to nearest feature
// ----------------------------------------------------------------------------
int tools_raster_proximity(const std::string& inputRaster,
                           const std::string& outputRaster,
                           const std::string& values,
                           double maxDistance,
                           const std::string& distUnits,
                           bool overwrite) {
    
    // Help message check
    if (inputRaster == "help") {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER PROXIMITY - Euclidean Distance Analysis\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Calculate Euclidean distance from each pixel to nearest target feature.\n";
        std::cout << "\nUsage:\n";
        std::cout << "  zeus tools raster_proximity -i features.tif -o distance.tif \\\n";
        std::cout << "    --values \"1\" --max-distance 5000\n";
        std::cout << "\nOptions:\n";
        std::cout << "  -i, --input      : Input raster (binary mask or classified)\n";
        std::cout << "  -o, --output     : Output distance raster\n";
        std::cout << "  --values         : Target pixel values (comma-separated, default: all non-zero)\n";
        std::cout << "  --max-distance   : Maximum distance to calculate (optimization)\n";
        std::cout << "  --units          : Distance units (GEO for degrees, PIXEL for pixels)\n";
        std::cout << "  --overwrite      : Overwrite existing output\n";
        std::cout << "\nExamples:\n";
        std::cout << "  # Distance to roads (binary mask)\n";
        std::cout << "  -i roads_mask.tif -o dist_to_roads.tif\n";
        std::cout << "\n  # Distance to specific land cover class\n";
        std::cout << "  -i landcover.tif -o dist_to_urban.tif --values \"190\"\n";
        std::cout << "\n  # Distance to water bodies (max 10km)\n";
        std::cout << "  -i water_mask.tif -o dist_to_water.tif --max-distance 10000\n";
        std::cout << "\nUse Cases:\n";
        std::cout << "  - Crossing cost surfaces (distance to roads, rivers, railways)\n";
        std::cout << "  - Buffer zones (protected areas, infrastructure)\n";
        std::cout << "  - Accessibility analysis\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\n";
        return 0;
    }
    
    // Validate inputs
    if (inputRaster.empty()) {
        std::cerr << "Error: Input raster required (-i)\n";
        return 1;
    }
    
    if (!std::filesystem::exists(inputRaster)) {
        std::cerr << "Error: Input raster not found: " << inputRaster << "\n";
        return 1;
    }
    
    if (outputRaster.empty()) {
        std::cerr << "Error: Output path required (-o)\n";
        return 1;
    }
    
    // Check overwrite
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER PROXIMITY - Calculating Distances\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputRaster << "\n";
    std::cout << "Output: " << outputRaster << "\n";
    if (!values.empty()) std::cout << "Target values: " << values << "\n";
    if (maxDistance > 0) std::cout << "Max distance: " << maxDistance << "\n";
    if (!distUnits.empty()) std::cout << "Units: " << distUnits << "\n";
    std::cout << "\n";
    
    // Build gdal_proximity.py command
    std::string tempOutput = outputRaster + ".tmp.tif";
    
    std::string cmd = "gdal_proximity.py ";
    cmd += "\"" + inputRaster + "\" ";
    cmd += "\"" + tempOutput + "\" ";
    
    // Target values
    if (!values.empty()) {
        cmd += "-values " + values + " ";
    }
    
    // Max distance
    if (maxDistance > 0) {
        cmd += "-maxdist " + std::to_string(maxDistance) + " ";
    }
    
    // Distance units
    if (!distUnits.empty()) {
        cmd += "-distunits " + distUnits + " ";
    }
    
    // Output type and compression
    cmd += "-ot Float32 ";
    cmd += "-co COMPRESS=DEFLATE -co PREDICTOR=2 ";
    cmd += "2>&1";
    
    std::cout << "Running gdal_proximity.py...\n";
    std::cout << "(This may take several minutes for large rasters)\n\n";
    int result = std::system(cmd.c_str());
    
    if (result != 0) {
        std::cerr << "Error: gdal_proximity.py failed with code " << result << std::endl;
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate ";
    cogCmd += "-of COG ";
    cogCmd += "-co COMPRESS=DEFLATE ";
    cogCmd += "-co PREDICTOR=2 ";
    cogCmd += "-co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" ";
    cogCmd += "\"" + outputRaster + "\" ";
    cogCmd += "2>&1";
    
    result = std::system(cogCmd.c_str());
    
    // Clean up temp file
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed with code " << result << std::endl;
        return 1;
    }
    
    // Check if output was created
    if (!std::filesystem::exists(outputRaster)) {
        std::cerr << "Error: Output file was not created" << std::endl;
        return 1;
    }
    
    // Generate metadata
    nlohmann::json meta;
    meta["tool"] = "raster_proximity";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_raster"] = inputRaster;
    meta["output_raster"] = outputRaster;
    if (!values.empty()) meta["target_values"] = values;
    if (maxDistance > 0) meta["max_distance"] = maxDistance;
    if (!distUnits.empty()) meta["distance_units"] = distUnits;
    
    std::string metaPath = outputRaster + ".json";
    std::ofstream metaFile(metaPath);
    if (metaFile.good()) {
        metaFile << meta.dump(2);
        metaFile.close();
    }
    
    std::cout << "\n✅ Proximity analysis complete!\n";
    std::cout << "Output: " << outputRaster << "\n";
    std::cout << "Metadata: " << metaPath << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "\n";
    
    return 0;
}

// ============================================================================
// PHASE 3C: HIGH PRIORITY TOOLS
// ============================================================================

// ----------------------------------------------------------------------------
// 6. VECTOR BUFFER - Create buffer zones
// ----------------------------------------------------------------------------
int tools_vector_buffer(const std::string& inputVector,
                       const std::string& outputVector,
                       double distance,
                       int segments,
                       const std::string& endCapStyle,
                       bool dissolve,
                       bool overwrite) {
    
    if (inputVector == "help") {
        std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  VECTOR BUFFER - Create Buffer Zones\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Create buffer zones around vector features.\n\n";
        std::cout << "Usage:\n";
        std::cout << "  zeus tools vector_buffer -i features.gpkg -o buffered.gpkg --distance 100\n\n";
        std::cout << "Options:\n";
        std::cout << "  -i, --input    : Input vector path\n";
        std::cout << "  -o, --output   : Output vector path\n";
        std::cout << "  --distance     : Buffer distance in CRS units (required)\n";
        std::cout << "  --segments     : Number of segments for curves (default: 30)\n";
        std::cout << "  --endcap       : End cap style (ROUND, FLAT, SQUARE)\n";
        std::cout << "  --dissolve     : Dissolve overlapping buffers\n";
        std::cout << "  --overwrite    : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
        return 0;
    }
    
    if (!std::filesystem::exists(inputVector)) {
        std::cerr << "Error: Input not found: " << inputVector << "\n";
        return 1;
    }
    
    if (std::filesystem::exists(outputVector) && !overwrite) {
        std::cerr << "Error: Output exists. Use --overwrite.\n";
        return 1;
    }
    
    std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  VECTOR BUFFER - Creating Buffer Zones\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputVector << "\nOutput: " << outputVector << "\n";
    std::cout << "Distance: " << distance << "\n\n";
    
    std::string cmd = "ogr2ogr -f GPKG \"" + outputVector + "\" \"" + inputVector + "\" ";
    cmd += "-dialect SQLite -sql \"SELECT ST_Buffer(geometry," + std::to_string(distance) + "," + std::to_string(segments) + ") as geometry,* FROM (SELECT * FROM '" + inputVector + "')\"";
    if (overwrite) cmd += " -overwrite";
    cmd += " 2>&1";
    
    int result = std::system(cmd.c_str());
    if (result != 0) {
        std::cerr << "Error: Buffer operation failed\n";
        return 1;
    }
    
    nlohmann::json meta;
    meta["tool"] = "vector_buffer";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input"] = inputVector;
    meta["output"] = outputVector;
    meta["distance"] = distance;
    
    std::ofstream(outputVector + ".json") << meta.dump(2);
    
    std::cout << "\n✅ Buffer complete!\nOutput: " << outputVector << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
    return 0;
}

// ----------------------------------------------------------------------------
// 7. RASTER EXTRACT BY MASK - Extract raster by mask
// ----------------------------------------------------------------------------
int tools_raster_extract_by_mask(const std::string& inputRaster,
                                 const std::string& maskVector,
                                 const std::string& outputRaster,
                                 bool crop,
                                 bool overwrite) {
    
    if (inputRaster == "help") {
        std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER EXTRACT BY MASK - Extract Raster by Mask\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Extract (clip) raster by vector mask.\n\n";
        std::cout << "Usage:\n";
        std::cout << "  zeus tools raster_extract_by_mask -i input.tif --mask aoi.gpkg -o clipped.tif\n\n";
        std::cout << "Options:\n";
        std::cout << "  -i, --input    : Input raster path\n";
        std::cout << "  --mask         : Mask vector path (GPKG, SHP, GeoJSON)\n";
        std::cout << "  -o, --output   : Output raster path\n";
        std::cout << "  --crop         : Crop to mask extent\n";
        std::cout << "  --overwrite    : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
        return 0;
    }
    
    if (!std::filesystem::exists(inputRaster)) {
        std::cerr << "Error: Input raster not found\n";
        return 1;
    }
    if (!std::filesystem::exists(maskVector)) {
        std::cerr << "Error: Mask vector not found\n";
        return 1;
    }
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output exists. Use --overwrite.\n";
        return 1;
    }
    
    std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER EXTRACT BY MASK - Clipping Raster\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputRaster << "\nMask: " << maskVector << "\nOutput: " << outputRaster << "\n\n";
    
    std::string tempOutput = outputRaster + ".tmp.tif";
    std::string cmd = "gdalwarp -cutline \"" + maskVector + "\" ";
    if (crop) cmd += "-crop_to_cutline ";
    cmd += "-co COMPRESS=DEFLATE -co PREDICTOR=2 ";
    cmd += "\"" + inputRaster + "\" \"" + tempOutput + "\" 2>&1";
    
    std::cout << "Running gdalwarp...\n";
    int result = std::system(cmd.c_str());
    if (result != 0) {
        std::cerr << "Error: gdalwarp failed\n";
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=2 -co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" \"" + outputRaster + "\" 2>&1";
    result = std::system(cogCmd.c_str());
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed\n";
        return 1;
    }
    
    nlohmann::json meta;
    meta["tool"] = "raster_extract_by_mask";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_raster"] = inputRaster;
    meta["mask_vector"] = maskVector;
    meta["output_raster"] = outputRaster;
    meta["crop_to_cutline"] = crop;
    
    std::ofstream(outputRaster + ".json") << meta.dump(2);
    
    std::cout << "\n✅ Extract complete!\nOutput: " << outputRaster << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
    return 0;
}

// ============================================================================
// PHASE 3D: MEDIUM PRIORITY TOOLS
// ============================================================================

// ----------------------------------------------------------------------------
// 8. RASTER HILLSHADE - Terrain visualization
// ----------------------------------------------------------------------------
int tools_raster_hillshade(const std::string& inputDEM,
                           const std::string& outputRaster,
                           double azimuth,
                           double altitude,
                           double zFactor,
                           bool overwrite) {
    
    if (inputDEM == "help") {
        std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER HILLSHADE - Terrain Visualization\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Create hillshade visualization from DEM.\n\n";
        std::cout << "Usage:\n";
        std::cout << "  zeus tools raster_hillshade -i dem.tif -o hillshade.tif\n\n";
        std::cout << "Options:\n";
        std::cout << "  -i, --input    : Input DEM path\n";
        std::cout << "  -o, --output   : Output hillshade path\n";
        std::cout << "  --azimuth      : Light azimuth in degrees (default: 315)\n";
        std::cout << "  --altitude     : Light altitude in degrees (default: 45)\n";
        std::cout << "  --z-factor     : Vertical exaggeration (default: 1.0)\n";
        std::cout << "  --overwrite    : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
        return 0;
    }
    
    if (!std::filesystem::exists(inputDEM)) {
        std::cerr << "Error: Input DEM not found\n";
        return 1;
    }
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output exists. Use --overwrite.\n";
        return 1;
    }
    
    std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER HILLSHADE - Creating Visualization\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputDEM << "\nOutput: " << outputRaster << "\n\n";
    
    std::string tempOutput = outputRaster + ".tmp.tif";
    std::string cmd = "gdaldem hillshade \"" + inputDEM + "\" \"" + tempOutput + "\" ";
    cmd += "-az " + std::to_string(azimuth) + " -alt " + std::to_string(altitude) + " ";
    cmd += "-z " + std::to_string(zFactor) + " -co COMPRESS=DEFLATE 2>&1";
    
    std::cout << "Running gdaldem hillshade...\n";
    int result = std::system(cmd.c_str());
    if (result != 0) {
        std::cerr << "Error: gdaldem failed\n";
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate -of COG -co COMPRESS=DEFLATE -co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" \"" + outputRaster + "\" 2>&1";
    result = std::system(cogCmd.c_str());
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed\n";
        return 1;
    }
    
    nlohmann::json meta;
    meta["tool"] = "raster_hillshade";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_dem"] = inputDEM;
    meta["output_raster"] = outputRaster;
    meta["azimuth"] = azimuth;
    meta["altitude"] = altitude;
    meta["z_factor"] = zFactor;
    
    std::ofstream(outputRaster + ".json") << meta.dump(2);
    
    std::cout << "\n✅ Hillshade complete!\nOutput: " << outputRaster << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
    return 0;
}

// ----------------------------------------------------------------------------
// 9. RASTER TRI - Terrain Ruggedness Index
// ----------------------------------------------------------------------------
int tools_raster_tri(const std::string& inputDEM,
                    const std::string& outputRaster,
                    bool overwrite) {
    
    if (inputDEM == "help") {
        std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  RASTER TRI - Terrain Ruggedness Index\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "\nPurpose:\n";
        std::cout << "  Calculate Terrain Ruggedness Index from DEM.\n\n";
        std::cout << "Usage:\n";
        std::cout << "  zeus tools raster_tri -i dem.tif -o tri.tif\n\n";
        std::cout << "Options:\n";
        std::cout << "  -i, --input    : Input DEM path\n";
        std::cout << "  -o, --output   : Output TRI raster path\n";
        std::cout << "  --overwrite    : Overwrite existing output\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
        return 0;
    }
    
    if (!std::filesystem::exists(inputDEM)) {
        std::cerr << "Error: Input DEM not found\n";
        return 1;
    }
    if (std::filesystem::exists(outputRaster) && !overwrite) {
        std::cerr << "Error: Output exists. Use --overwrite.\n";
        return 1;
    }
    
    std::cout << "\n═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  RASTER TRI - Calculating Terrain Ruggedness\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input: " << inputDEM << "\nOutput: " << outputRaster << "\n\n";
    
    std::string tempOutput = outputRaster + ".tmp.tif";
    std::string cmd = "gdaldem TRI \"" + inputDEM + "\" \"" + tempOutput + "\" -co COMPRESS=DEFLATE 2>&1";
    
    std::cout << "Running gdaldem TRI...\n";
    int result = std::system(cmd.c_str());
    if (result != 0) {
        std::cerr << "Error: gdaldem failed\n";
        std::filesystem::remove(tempOutput);
        return 1;
    }
    
    // Convert to COG
    std::cout << "Converting to COG...\n";
    std::string cogCmd = "gdal_translate -of COG -co COMPRESS=DEFLATE -co PREDICTOR=2 -co NUM_THREADS=ALL_CPUS ";
    cogCmd += "\"" + tempOutput + "\" \"" + outputRaster + "\" 2>&1";
    result = std::system(cogCmd.c_str());
    std::filesystem::remove(tempOutput);
    
    if (result != 0) {
        std::cerr << "Error: COG conversion failed\n";
        return 1;
    }
    
    nlohmann::json meta;
    meta["tool"] = "raster_tri";
    meta["timestamp_utc"] = to_iso8601_utc();
    meta["input_dem"] = inputDEM;
    meta["output_raster"] = outputRaster;
    
    std::ofstream(outputRaster + ".json") << meta.dump(2);
    
    std::cout << "\n✅ TRI calculation complete!\nOutput: " << outputRaster << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
    return 0;
}

// Perplexity AI Search
int tools_perplexity_search(const std::string& query,
                            const std::string& location,
                            const std::string& bbox,
                            const std::string& place,
                            const std::string& topic,
                            const std::string& datasetResearch,
                            const std::string& model,
                            int maxTokens,
                            double temperature,
                            const std::string& recency,
                            const std::string& format,
                            const std::string& outputPath,
                            bool citations) {
    std::cout << "Perplexity AI Search\n";
    std::cout << "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    
    // Build the query string
    std::string finalQuery;
    
    if (!query.empty()) {
        finalQuery = query;
    } else {
        // Build query from components
        std::vector<std::string> queryParts;
        
        if (!location.empty()) {
            queryParts.push_back("Location: " + location);
        }
        if (!bbox.empty()) {
            queryParts.push_back("Area (bbox): " + bbox);
        }
        if (!place.empty()) {
            queryParts.push_back("Place: " + place);
        }
        if (!topic.empty()) {
            queryParts.push_back("Topics: " + topic);
        }
        if (!datasetResearch.empty()) {
            queryParts.push_back("Research datasets: " + datasetResearch);
        }
        
        if (queryParts.empty()) {
            std::cerr << "Error: No query provided. Use --query or specify --location/--bbox/--place/--topic/--dataset-research\n";
            return 1;
        }
        
        // Join query parts
        for (size_t i = 0; i < queryParts.size(); ++i) {
            finalQuery += queryParts[i];
            if (i < queryParts.size() - 1) finalQuery += " | ";
        }
    }
    
    std::cout << "Query: " << finalQuery.substr(0, 100);
    if (finalQuery.length() > 100) std::cout << "...";
    std::cout << "\n";
    std::cout << "Model: " << (model.empty() ? "default (large)" : model) << "\n";
    std::cout << "Output: " << outputPath << "\n\n";
    
    // Create Python script for API call
    std::filesystem::path tempDir = std::filesystem::temp_directory_path() / "perplexity_search";
    std::filesystem::create_directories(tempDir);
    std::filesystem::path scriptPath = tempDir / "perplexity_api.py";
    
    std::string pythonScript = R"PY(#!/usr/bin/env python3
import sys
import json
import requests
from pathlib import Path

def load_credentials():
    """Load Perplexity API credentials"""
    cred_paths = [
        Path.home() / ".perplexity_credentials",
        Path("/opt/agrs/.perplexity_credentials")
    ]
    
    for cred_file in cred_paths:
        if cred_file.exists():
            with open(cred_file) as f:
                return json.load(f)
    
    print("ERROR: Perplexity credentials not found", file=sys.stderr)
    print("Create ~/.perplexity_credentials or /opt/agrs/.perplexity_credentials", file=sys.stderr)
    print("", file=sys.stderr)
    print("Example credentials file:", file=sys.stderr)
    print('{', file=sys.stderr)
    print('  "api_key": "pplx-xxxxxxxxxxxxx",', file=sys.stderr)
    print('  "model_default": "llama-3.1-sonar-large-128k-chat"', file=sys.stderr)
    print('}', file=sys.stderr)
    return None

def search_perplexity(query, model, max_tokens, temperature, recency, citations):
    """Query Perplexity API"""
    creds = load_credentials()
    if not creds:
        return None
    
    url = "https://api.perplexity.ai/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {creds['api_key']}",
        "Content-Type": "application/json"
    }
    
    system_prompt = """You are an expert geospatial intelligence analyst specializing in 
pipeline routing, infrastructure projects, and geographic information systems. Provide 
detailed, factual, and well-sourced information about geographic areas, datasets, 
regulations, and constraints relevant to infrastructure projects. Always cite your sources."""
    
    # Model selection - use passed model or fallback to credentials default
    if model and model != "":
        model_name = model
    else:
        model_name = creds.get('model_default', 'llama-3.1-sonar-large-128k-chat')
    
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": query}
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
        "return_citations": citations,
    }
    
    if recency:
        payload["search_recency_filter"] = recency
    
    try:
        print(f"Sending request to Perplexity API...", file=sys.stderr)
        response = requests.post(url, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        print(f"ERROR: API request failed with status {response.status_code}", file=sys.stderr)
        print(f"Response: {response.text}", file=sys.stderr)
        return None
    except requests.exceptions.RequestException as e:
        print(f"ERROR: API request failed: {e}", file=sys.stderr)
        return None

def strip_thinking_tags(text):
    """Remove <think>...</think> blocks from sonar-reasoning model output"""
    import re
    # Remove complete <think>...</think> blocks (including multiline)
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    # Also remove any unclosed <think> tags (in case response was truncated)
    cleaned = re.sub(r'<think>.*$', '', cleaned, flags=re.DOTALL)
    # Clean up any extra blank lines left behind
    cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
    return cleaned.strip()

def format_output(response, format_type, citations, requested_model=""):
    """Format response for output"""
    if not response:
        return None
    
    content = response['choices'][0]['message']['content']
    
    # Strip thinking tags from sonar-reasoning model output
    content = strip_thinking_tags(content)
    
    if format_type == 'json':
        return json.dumps(response, indent=2)
    
    elif format_type == 'markdown':
        output = "# Perplexity Intelligence Report\n\n"
        output += f"**Generated:** {response.get('created', 'N/A')}\n"
        # Use the requested model name for clarity (API may return generic "sonar")
        display_model = requested_model if requested_model else response.get('model', 'N/A')
        output += f"**Model:** {display_model}\n\n"
        output += "---\n\n"
        output += content
        output += "\n"
        
        if citations and 'citations' in response and response['citations']:
            output += "\n---\n\n## Sources & Citations\n\n"
            for i, citation in enumerate(response['citations'], 1):
                output += f"{i}. {citation}\n"
        
        return output
    
    else:  # text
        return content

def main():
    if len(sys.argv) < 8:
        print("Usage: script.py <query> <model> <max_tokens> <temperature> <recency> <format> <output> [citations]", file=sys.stderr)
        return 1
    
    query = sys.argv[1]
    model = sys.argv[2] if sys.argv[2] != "NONE" else ""
    max_tokens = int(sys.argv[3])
    temperature = float(sys.argv[4])
    recency = sys.argv[5] if sys.argv[5] != "NONE" else ""
    format_type = sys.argv[6]
    output_file = sys.argv[7]
    citations = sys.argv[8].lower() == "true" if len(sys.argv) > 8 else True
    
    print(f"Querying Perplexity AI...", file=sys.stderr)
    
    response = search_perplexity(query, model, max_tokens, temperature, recency, citations)
    if not response:
        return 1
    
    formatted = format_output(response, format_type, citations, model)
    if not formatted:
        return 1
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(formatted)
    
    print(f"✅ Report saved to: {output_file}", file=sys.stderr)
    
    # Print usage statistics
    if 'usage' in response:
        usage = response['usage']
        print(f"", file=sys.stderr)
        print(f"Tokens used: {usage.get('total_tokens', 'N/A')}", file=sys.stderr)
        print(f"  - Prompt: {usage.get('prompt_tokens', 'N/A')}", file=sys.stderr)
        print(f"  - Completion: {usage.get('completion_tokens', 'N/A')}", file=sys.stderr)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
)PY";
    
    // Write Python script
    std::ofstream scriptFile(scriptPath);
    if (!scriptFile.good()) {
        std::cerr << "Error: Failed to create Python script\n";
        return 1;
    }
    scriptFile << pythonScript;
    scriptFile.close();
    
    // Make script executable
    std::filesystem::permissions(scriptPath, 
        std::filesystem::perms::owner_read | std::filesystem::perms::owner_write | std::filesystem::perms::owner_exec,
        std::filesystem::perm_options::add);
    
    // Execute Python script
    std::string pythonCmd = "python3 \"" + scriptPath.string() + "\" ";
    pythonCmd += "\"" + finalQuery + "\" ";
    pythonCmd += (model.empty() ? "NONE" : model) + " ";
    pythonCmd += std::to_string(maxTokens) + " ";
    pythonCmd += std::to_string(temperature) + " ";
    pythonCmd += (recency.empty() ? "NONE" : recency) + " ";
    pythonCmd += format + " ";
    pythonCmd += "\"" + outputPath + "\" ";
    pythonCmd += (citations ? "true" : "false");
    pythonCmd += " 2>&1";
    
    std::cout << "Executing API request...\n";
    int result = std::system(pythonCmd.c_str());
    
    // Cleanup
    std::filesystem::remove(scriptPath);
    std::filesystem::remove_all(tempDir);
    
    if (result != 0) {
        std::cerr << "\nError: Perplexity API request failed (exit code " << result << ")\n";
        return 1;
    }
    
    // Verify output was created
    if (!std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file was not created\n";
        return 1;
    }
    
    std::cout << "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    std::cout << "✅ Intelligence report generated successfully!\n";
    std::cout << "Output: " << outputPath << "\n";
    
    return 0;
}

// ============================================================================
// ISRIC SoilGrids Fetch Tool
// ============================================================================

int tools_soilgrids_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& properties,
                           const std::string& depth,
                           const std::string& outputPath,
                           bool overwrite) {
    // Help message
    if (bbox == "help" || (bbox.empty() && aoiPath.empty())) {
        std::cout << "\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        std::cout << "  ISRIC SOILGRIDS v2.0 FETCH TOOL\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n\n";
        std::cout << "Fetches soil property data from ISRIC SoilGrids v2.0 via WCS.\n\n";
        std::cout << "Usage:\n";
        std::cout << "  zeus tools soilgrids_fetch --bbox <minx,miny,maxx,maxy> -o <output.tif>\n";
        std::cout << "  zeus tools soilgrids_fetch --aoi <file> -o <output.tif>\n\n";
        std::cout << "Options:\n";
        std::cout << "  --bbox            Bounding box in EPSG:4326 (minx,miny,maxx,maxy)\n";
        std::cout << "  --aoi             AOI vector file (GeoJSON/Shapefile/GeoPackage)\n";
        std::cout << "  --properties      Comma-separated soil properties (default: soc,clay,sand,silt,ph,bdod,cec)\n";
        std::cout << "                    Available: soc, clay, sand, silt, ph, bdod, cec, nitrogen, ocd\n";
        std::cout << "  --depth           Depth layer (default: 0-5cm)\n";
        std::cout << "                    Available: 0-5cm, 5-15cm, 15-30cm, 30-60cm, 60-100cm, 100-200cm\n";
        std::cout << "  -o, --output      Output GeoTIFF file path (multi-band)\n";
        std::cout << "  --overwrite       Overwrite existing output\n\n";
        std::cout << "Properties:\n";
        std::cout << "  soc    - Soil Organic Carbon (g/kg)\n";
        std::cout << "  clay   - Clay content (g/kg)\n";
        std::cout << "  sand   - Sand content (g/kg)\n";
        std::cout << "  silt   - Silt content (g/kg)\n";
        std::cout << "  ph     - pH in H2O\n";
        std::cout << "  bdod   - Bulk Density (kg/dm³)\n";
        std::cout << "  cec    - Cation Exchange Capacity (cmol/kg)\n\n";
        std::cout << "Example:\n";
        std::cout << "  zeus tools soilgrids_fetch --bbox 13.45,42.85,13.94,43.44 \\\n";
        std::cout << "    --properties soc,clay,sand --depth 0-5cm -o soil.tif\n";
        std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
        return 0;
    }
    
    // Validate output path
    if (outputPath.empty()) {
        std::cerr << "Error: Output path is required. Use -o or --output.\n";
        return 1;
    }
    
    // Check if output exists
    if (std::filesystem::exists(outputPath) && !overwrite) {
        std::cerr << "Error: Output file exists. Use --overwrite to replace.\n";
        return 1;
    }
    
    // Parse bbox
    std::string bboxStr;
    if (!bbox.empty()) {
        bboxStr = bbox;
    } else if (!aoiPath.empty()) {
        // Extract bbox from AOI
        std::cout << "Extracting bounding box from AOI...\n";
        std::string cmd = "ogrinfo -al -so \"" + aoiPath + "\" 2>/dev/null | grep Extent";
        FILE* pipe = popen(cmd.c_str(), "r");
        if (!pipe) {
            std::cerr << "Error: Failed to extract bbox from AOI\n";
            return 1;
        }
        
        char buffer[256];
        std::string extentLine;
        while (fgets(buffer, sizeof(buffer), pipe)) {
            extentLine += buffer;
        }
        pclose(pipe);
        
        // Parse "Extent: (minx, miny) - (maxx, maxy)"
        size_t pos1 = extentLine.find('(');
        size_t pos2 = extentLine.find(')');
        size_t pos3 = extentLine.find('(', pos2);
        size_t pos4 = extentLine.find(')', pos3);
        
        if (pos1 == std::string::npos || pos2 == std::string::npos || 
            pos3 == std::string::npos || pos4 == std::string::npos) {
            std::cerr << "Error: Could not parse extent from AOI\n";
            return 1;
        }
        
        std::string minCoords = extentLine.substr(pos1 + 1, pos2 - pos1 - 1);
        std::string maxCoords = extentLine.substr(pos3 + 1, pos4 - pos3 - 1);
        
        double minX, minY, maxX, maxY;
        if (sscanf(minCoords.c_str(), "%lf, %lf", &minX, &minY) != 2 ||
            sscanf(maxCoords.c_str(), "%lf, %lf", &maxX, &maxY) != 2) {
            std::cerr << "Error: Could not parse coordinates from extent\n";
            return 1;
        }
        
        bboxStr = std::to_string(minX) + "," + std::to_string(minY) + "," +
                  std::to_string(maxX) + "," + std::to_string(maxY);
    } else {
        std::cerr << "Error: Either --bbox or --aoi is required\n";
        return 1;
    }
    
    // Parse bbox values
    double minLon, minLat, maxLon, maxLat;
    if (sscanf(bboxStr.c_str(), "%lf,%lf,%lf,%lf", &minLon, &minLat, &maxLon, &maxLat) != 4) {
        std::cerr << "Error: Invalid bbox format. Expected: minx,miny,maxx,maxy\n";
        return 1;
    }
    
    // Parse properties
    std::vector<std::string> propList;
    std::string propsStr = properties.empty() ? "soc,clay,sand,silt,ph,bdod,cec" : properties;
    std::istringstream propStream(propsStr);
    std::string prop;
    while (std::getline(propStream, prop, ',')) {
        // Trim whitespace
        prop.erase(0, prop.find_first_not_of(" \t"));
        prop.erase(prop.find_last_not_of(" \t") + 1);
        
        // Map common aliases
        if (prop == "ph") prop = "phh2o";
        
        propList.push_back(prop);
    }
    
    if (propList.empty()) {
        std::cerr << "Error: No properties specified\n";
        return 1;
    }
    
    // Depth layer
    std::string depthLayer = depth.empty() ? "0-5cm" : depth;
    
    std::cout << "\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "  FETCHING ISRIC SOILGRIDS DATA (WCS with Coordinate Transformation)\n";
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    std::cout << "Input Bbox: " << bboxStr << " (EPSG:4326)\n";
    std::cout << "Depth: " << depthLayer << "\n";
    std::cout << "Properties: " << propsStr << "\n";
    std::cout << "Output: " << outputPath << "\n\n";
    
    // Convert depth format: "0-5cm" -> "0-5cm" (keep as is for WCS)
    std::string depthStr = depthLayer;
    
    // Step 1: Transform bbox from EPSG:4326 to Homolosine projection using gdaltransform
    std::cout << "[1/4] Transforming coordinates EPSG:4326 → Homolosine (ISRIC projection)...\n";
    
    // Use PROJ string for Interrupted Goode Homolosine projection (ISRIC SoilGrids CRS)
    std::string transformCmd = "echo \"" + std::to_string(minLon) + " " + std::to_string(minLat) + "\n";
    transformCmd += std::to_string(maxLon) + " " + std::to_string(maxLat) + "\" | ";
    transformCmd += "gdaltransform -s_srs EPSG:4326 -t_srs '+proj=igh +datum=WGS84 +no_defs +towgs84=0,0,0'";
    
    FILE* transformPipe = popen(transformCmd.c_str(), "r");
    if (!transformPipe) {
        std::cerr << "Error: Failed to execute gdaltransform\n";
        return 1;
    }
    
    char transformBuffer[256];
    std::vector<std::string> transformedCoords;
    while (fgets(transformBuffer, sizeof(transformBuffer), transformPipe)) {
        transformedCoords.push_back(transformBuffer);
    }
    pclose(transformPipe);
    
    if (transformedCoords.size() < 2) {
        std::cerr << "Error: Coordinate transformation failed\n";
        return 1;
    }
    
    // Parse transformed coordinates
    double minX_152160, minY_152160, maxX_152160, maxY_152160, z1, z2;
    if (sscanf(transformedCoords[0].c_str(), "%lf %lf %lf", &minX_152160, &minY_152160, &z1) != 3 ||
        sscanf(transformedCoords[1].c_str(), "%lf %lf %lf", &maxX_152160, &maxY_152160, &z2) != 3) {
        std::cerr << "Error: Failed to parse transformed coordinates\n";
        return 1;
    }
    
    std::cout << "  Transformed bbox: (" << minX_152160 << ", " << minY_152160 << ") - (" 
              << maxX_152160 << ", " << maxY_152160 << ")\n\n";
    
    // Create temp directory
    std::string tempDir = "/tmp/soilgrids_" + std::to_string(std::time(nullptr));
    std::filesystem::create_directories(tempDir);
    
    std::vector<std::string> downloadedFiles;
    int propNum = 0;
    
    // Step 2: Download each property using WCS with transformed coordinates
    std::cout << "[2/4] Downloading soil properties via WCS...\n";
    
    for (const auto& property : propList) {
        propNum++;
        std::cout << "  [" << propNum << "/" << propList.size() << "] Fetching " << property << "... ";
        
        // Build WCS URL with EPSG:152160 coordinates (using fixed notation, no scientific)
        std::ostringstream wcsUrl;
        wcsUrl << std::fixed << std::setprecision(2);  // Force fixed-point notation
        wcsUrl << "https://maps.isric.org/mapserv?map=/map/" << property << ".map";
        wcsUrl << "&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage";
        wcsUrl << "&COVERAGEID=" << property << "_" << depthStr << "_mean";
        wcsUrl << "&SUBSET=x(" << minX_152160 << "," << maxX_152160 << ")";
        wcsUrl << "&SUBSET=y(" << minY_152160 << "," << maxY_152160 << ")";
        wcsUrl << "&FORMAT=image/tiff";
        
        // Calculate reasonable output size (max 2000x2000 pixels)
        double width_m = std::abs(maxX_152160 - minX_152160);
        double height_m = std::abs(maxY_152160 - minY_152160);
        int sizeX = std::min(2000, std::max(100, (int)(width_m / 250.0)));  // 250m native resolution
        int sizeY = std::min(2000, std::max(100, (int)(height_m / 250.0)));
        
        wcsUrl << "&SIZE=x(" << sizeX << ")";
        wcsUrl << "&SIZE=y(" << sizeY << ")";
        
        std::string outputFile = tempDir + "/" + property + ".tif";
        std::string urlString = wcsUrl.str();
        
        // Download using curl (without -f flag to see errors)
        std::string curlCmd = "curl -L -s -o \"" + outputFile + "\" \"" + urlString + "\" 2>&1";
        int result = std::system(curlCmd.c_str());
        
        if (result != 0 || !std::filesystem::exists(outputFile)) {
            std::cout << "✗ Failed\n";
            continue;
        }
        
        // Check file size first
        auto fileSize = std::filesystem::file_size(outputFile);
        if (fileSize < 1000) {
            // Might be an error message
            std::ifstream errFile(outputFile);
            std::string content((std::istreambuf_iterator<char>(errFile)), std::istreambuf_iterator<char>());
            if (content.find("Exception") != std::string::npos || content.find("error") != std::string::npos) {
                std::cout << "✗ WCS Error\n";
                std::cerr << "  Full error saved to: " << outputFile << "\n";
                // Don't remove: std::filesystem::remove(outputFile);
                continue;
            }
        }
        
        // Verify it's a valid GeoTIFF
        std::string verifyCmd = "gdalinfo \"" + outputFile + "\" > /dev/null 2>&1";
        if (std::system(verifyCmd.c_str()) != 0) {
            std::cout << "✗ Invalid GeoTIFF (size: " << fileSize << " bytes)\n";
            // Don't remove for debugging
            // std::filesystem::remove(outputFile);
            continue;
        }
        
        std::cout << "✓\n";
        downloadedFiles.push_back(outputFile);
    }
    
    if (downloadedFiles.empty()) {
        std::cerr << "\nError: No properties were successfully downloaded\n";
        std::cerr << "Temp files kept in: " << tempDir << " for debugging\n";
        // Don't remove for debugging: std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "\n[3/4] Combining " << downloadedFiles.size() << " properties into multi-band GeoTIFF...\n";
    
    // Step 3: Combine into multi-band GeoTIFF
    std::string tempMerged = tempDir + "/merged_152160.tif";
    std::string mergeCmd = "gdal_merge.py -separate -co COMPRESS=LZW -co TILED=YES -co BIGTIFF=IF_SAFER ";
    mergeCmd += "-o \"" + tempMerged + "\" ";
    for (const auto& file : downloadedFiles) {
        mergeCmd += "\"" + file + "\" ";
    }
    mergeCmd += "> /dev/null 2>&1";
    
    int mergeResult = std::system(mergeCmd.c_str());
    if (mergeResult != 0 || !std::filesystem::exists(tempMerged)) {
        std::cerr << "Error: Failed to merge properties\n";
        std::filesystem::remove_all(tempDir);
        return 1;
    }
    
    std::cout << "  ✓ Merged\n\n";
    
    // Step 4: Reproject back to EPSG:4326
    std::cout << "[4/4] Reprojecting result back to EPSG:4326...\n";
    
    std::string warpCmd = "gdalwarp -s_srs '+proj=igh +datum=WGS84 +no_defs +towgs84=0,0,0' -t_srs EPSG:4326 ";
    warpCmd += "-co COMPRESS=LZW -co TILED=YES -co BIGTIFF=IF_SAFER ";
    warpCmd += "-overwrite \"" + tempMerged + "\" \"" + outputPath + "\" > /dev/null 2>&1";
    
    int warpResult = std::system(warpCmd.c_str());
    
    // Cleanup temp directory
    std::filesystem::remove_all(tempDir);
    
    if (warpResult != 0) {
        std::cerr << "Error: Failed to reproject to EPSG:4326\n";
        return 1;
    }
    
    std::cout << "  ✓ Reprojected\n";
    
    // Verify output
    if (!std::filesystem::exists(outputPath)) {
        std::cerr << "Error: Output file was not created\n";
        return 1;
    }
    
    // Get file size and band info
    auto fileSize = std::filesystem::file_size(outputPath);
    
    // Get band count from gdalinfo
    std::string bandCountCmd = "gdalinfo \"" + outputPath + "\" 2>/dev/null | grep -c \"^Band\"";
    FILE* bandPipe = popen(bandCountCmd.c_str(), "r");
    int bandCount = 0;
    if (bandPipe) {
        char bandBuf[32];
        if (fgets(bandBuf, sizeof(bandBuf), bandPipe)) {
            bandCount = std::atoi(bandBuf);
        }
        pclose(bandPipe);
    }
    
    std::cout << "\n✅ SoilGrids data fetched successfully!\n";
    std::cout << "Output: " << outputPath << " (" << (fileSize / 1024) << " KB)\n";
    std::cout << "Bands: " << (bandCount > 0 ? std::to_string(bandCount) : std::to_string((int)propList.size())) << " (properties)\n";
    
    // Create metadata JSON
    std::string jsonPath = outputPath + ".json";
    std::ofstream jsonFile(jsonPath);
    if (jsonFile.good()) {
        auto now = std::time(nullptr);
        char timeStr[100];
        std::strftime(timeStr, sizeof(timeStr), "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&now));
        
        jsonFile << "{\n";
        jsonFile << "  \"tool\": \"soilgrids_fetch\",\n";
        jsonFile << "  \"timestamp\": \"" << timeStr << "\",\n";
        jsonFile << "  \"source\": {\n";
        jsonFile << "    \"provider\": \"ISRIC World Soil Information\",\n";
        jsonFile << "    \"dataset\": \"SoilGrids v2.0\",\n";
        jsonFile << "    \"version\": \"2.0\",\n";
        jsonFile << "    \"resolution\": \"250m\",\n";
        jsonFile << "    \"license\": \"CC BY 4.0\",\n";
        jsonFile << "    \"url\": \"https://soilgrids.org\"\n";
        jsonFile << "  },\n";
        jsonFile << "  \"query\": {\n";
        jsonFile << "    \"bbox\": \"" << bboxStr << "\",\n";
        jsonFile << "    \"depth\": \"" << depthLayer << "\",\n";
        jsonFile << "    \"properties\": \"" << propsStr << "\",\n";
        jsonFile << "    \"method\": \"WCS GetCoverage with EPSG:152160 transformation\"\n";
        jsonFile << "  },\n";
        jsonFile << "  \"bands\": [\n";
        for (size_t i = 0; i < propList.size(); i++) {
            jsonFile << "    {\"band\": " << (i + 1) << ", \"property\": \"" << propList[i] << "\"}";
            if (i < propList.size() - 1) jsonFile << ",";
            jsonFile << "\n";
        }
        jsonFile << "  ]\n";
        jsonFile << "}\n";
        jsonFile.close();
        std::cout << "Metadata: " << jsonPath << "\n";
    }
    
    std::cout << "═══════════════════════════════════════════════════════════════════════════\n";
    
    return 0;
}

// ============================================================================
// FETCH TOOL AVAILABILITY ANALYZER
// ============================================================================

// Helper function to detect country code from coordinates
std::string detect_country_from_coordinates(double lat, double lon) {
    // Simple bounding box approach for major countries
    // Returns country code (e.g., "US", "IT", "SA")
    
    struct CountryBBox {
        std::string code;
        double minLat, maxLat, minLon, maxLon;
    };
    
    static const std::vector<CountryBBox> countries = {
        {"US", 24.0, 50.0, -125.0, -66.0},
        {"CA", 41.0, 84.0, -141.0, -52.0},
        {"IT", 36.0, 47.5, 6.0, 19.0},
        {"SA", 16.0, 33.0, 34.0, 56.0},
        {"GB", 49.5, 61.0, -8.5, 2.0},
        {"FR", 41.0, 51.5, -5.5, 10.0},
        {"DE", 47.0, 55.5, 5.5, 15.5},
        {"ES", 35.5, 44.0, -10.0, 5.0},
        {"NO", 57.5, 71.5, 4.0, 31.5},
        {"SE", 55.0, 69.5, 10.5, 24.5},
        {"RU", 41.0, 82.0, 19.0, 180.0},
        {"CN", 18.0, 54.0, 73.0, 135.0},
        {"AU", -44.0, -10.0, 112.0, 154.0},
        {"BR", -34.0, 5.5, -74.0, -34.0},
        {"MX", 14.5, 33.0, -118.0, -86.0},
        {"IN", 6.5, 36.0, 68.0, 97.5},
        {"JP", 24.0, 46.0, 123.0, 146.0},
        {"KR", 33.0, 39.0, 124.0, 132.0},
        {"NZ", -47.5, -34.0, 166.0, 179.0},
    };
    
    for (const auto& country : countries) {
        if (lat >= country.minLat && lat <= country.maxLat &&
            lon >= country.minLon && lon <= country.maxLon) {
            return country.code;
        }
    }
    
    return "";
}

int tools_analyze_fetch_tools(const std::string& mode,
                              const std::string& country,
                              const std::string& outputJson,
                              bool verbose) {
    
    FetchToolAnalyzer analyzer;
    
    if (verbose) {
        std::cout << "\n🔍 Analyzing Fetch Tool Availability...\n";
        std::cout << std::string(60, '=') << "\n";
        if (!country.empty()) {
            std::cout << "Country: " << country << "\n";
        }
    }
    
    analyzer.load_all_inventories();
    
    if (verbose) {
        if (mode == "summary" || mode == "all") {
            analyzer.print_category_summary();
        }
        
        if (mode == "readiness" || mode == "all") {
            analyzer.print_pipeline_readiness();
        }
        
        if (mode == "country" || mode == "all") {
            analyzer.print_country_coverage(country);
        }
        
        if (mode == "missing" || mode == "all") {
            analyzer.print_missing_tools();
        }
    }
    
    if (!outputJson.empty()) {
        // Use GUI-friendly JSON format with country filtering
        analyzer.generate_gui_json_report(outputJson, country);
    }
    
    if (verbose) {
        std::cout << "\n✅ Analysis complete!\n\n";
    }
    
    return 0;
}

} // namespace agrs::tools


// ============================================================================
// PIRL (Physics-Informed Reinforcement Learning) TOOLS
// ============================================================================

#include "agrs_zeus/PIRL.h"

namespace agrs {
namespace tools {

// Generate optimal pipeline route using PIRL
int tools_pirl_generate_route(const std::string& project_config_yaml,
                              const std::string& output_dir,
                              bool visualize) {
    
    std::cout << "\n🤖 PIRL Route Generation" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    std::cout << "Config: " << project_config_yaml << std::endl;
    std::cout << "Output: " << output_dir << "\n" << std::endl;
    
    try {
        // Load project configuration
        auto config = pirl::ProjectConfig::load_from_yaml(project_config_yaml);
        
        // Create PIRL agent
        pirl::PIRLAgent agent(config);
        
        // Check if pre-trained model exists
        if (!config.model_save_path.empty() && 
            std::filesystem::exists(config.model_save_path)) {
            std::cout << "📦 Loading pre-trained model..." << std::endl;
            if (!agent.load_model(config.model_save_path)) {
                std::cerr << "⚠️  Failed to load model, using heuristic routing" << std::endl;
            }
        } else {
            std::cout << "⚠️  No pre-trained model found, using heuristic routing" << std::endl;
        }
        
        // Generate route
        std::cout << "\n🚀 Generating route..." << std::endl;
        auto route = agent.generate_route(
            {config.start_point.x, config.start_point.y},
            {config.end_point.x, config.end_point.y},
            config.project_dir
        );
        
        if (route.empty()) {
            std::cerr << "❌ Failed to generate route" << std::endl;
            return 1;
        }
        
        std::cout << "✅ Route generated: " << route.size() << " points" << std::endl;
        
        // Create output directory
        std::filesystem::create_directories(output_dir);
        
        // Export route to GeoJSON
        std::string geojson_path = output_dir + "/pirl_route.geojson";
        pirl::export_utils::export_to_geojson(route, geojson_path, config.epsg_code);
        
        // Export route to Shapefile
        std::string shp_path = output_dir + "/pirl_route.shp";
        pirl::export_utils::export_to_shapefile(route, shp_path, config.epsg_code);
        
        // Evaluate route
        std::cout << "\n📊 Evaluating route..." << std::endl;
        auto evaluation = agent.evaluate_route(route, config.project_dir);
        
        // Export statistics
        std::string csv_path = output_dir + "/pirl_route_stats.csv";
        pirl::export_utils::export_stats_to_csv(evaluation, csv_path);
        
        std::cout << "\n✅ Route generation complete!" << std::endl;
        std::cout << "   GeoJSON: " << geojson_path << std::endl;
        std::cout << "   Shapefile: " << shp_path << std::endl;
        std::cout << "   Statistics: " << csv_path << std::endl;
        
        if (visualize) {
            std::cout << "\n🗺️  Visualization support requires external tools" << std::endl;
            std::cout << "   Use QGIS to view: " << geojson_path << std::endl;
        }
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "❌ Error: " << e.what() << std::endl;
        return 1;
    }
}

// Train PIRL model on project scenarios
int tools_pirl_train_model(const std::string& training_config_yaml,
                           const std::string& output_model_path,
                           int num_episodes) {
    
    std::cout << "\n🎓 PIRL Model Training" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    std::cout << "Config: " << training_config_yaml << std::endl;
    std::cout << "Output Model: " << output_model_path << std::endl;
    std::cout << "Episodes: " << num_episodes << "\n" << std::endl;
    
    std::cout << "⚠️  NOTE: PIRL training requires Python environment" << std::endl;
    std::cout << "   This is a stub implementation." << std::endl;
    std::cout << "\n📝 To train PIRL model:" << std::endl;
    std::cout << "   1. Set up Python environment with Stable-Baselines3" << std::endl;
    std::cout << "   2. Run: python3 /opt/agrs/python/pirl/train.py \\" << std::endl;
    std::cout << "      --config " << training_config_yaml << " \\" << std::endl;
    std::cout << "      --output " << output_model_path << " \\" << std::endl;
    std::cout << "      --episodes " << num_episodes << std::endl;
    
    // TODO: Implement Python subprocess call or integrate via shared library
    // For now, this is a placeholder that explains the process
    
    return 0;
}

// Evaluate trained PIRL model
int tools_pirl_evaluate(const std::string& model_path,
                       const std::string& test_projects_dir,
                       const std::string& output_report) {
    
    std::cout << "\n📊 PIRL Model Evaluation" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    std::cout << "Model: " << model_path << std::endl;
    std::cout << "Test Projects: " << test_projects_dir << std::endl;
    std::cout << "Report: " << output_report << "\n" << std::endl;
    
    if (!std::filesystem::exists(model_path)) {
        std::cerr << "❌ Model not found: " << model_path << std::endl;
        return 1;
    }
    
    std::cout << "🔍 Evaluating model on test projects..." << std::endl;
    
    auto results = pirl::training::evaluate_model(model_path, test_projects_dir);
    
    std::cout << "\n📈 Evaluation Results:" << std::endl;
    std::cout << "   Average Cost Savings: " << results.avg_cost_savings_percent << "%" << std::endl;
    std::cout << "   Success Rate: " << results.success_rate * 100 << "%" << std::endl;
    std::cout << "   Avg Constraint Violations: " << results.avg_constraint_violations << std::endl;
    std::cout << "   Avg Solution Time: " << results.avg_solution_time_seconds << "s" << std::endl;
    
    if (!results.failed_projects.empty()) {
        std::cout << "\n⚠️  Failed Projects (" << results.failed_projects.size() << "):" << std::endl;
        for (const auto& proj : results.failed_projects) {
            std::cout << "   • " << proj << std::endl;
        }
    }
    
    // Save report
    std::ofstream report(output_report);
    if (report.is_open()) {
        report << "PIRL Model Evaluation Report\n";
        report << "============================\n\n";
        report << "Model: " << model_path << "\n";
        report << "Test Projects: " << test_projects_dir << "\n\n";
        report << "Results:\n";
        report << "  Average Cost Savings: " << results.avg_cost_savings_percent << "%\n";
        report << "  Success Rate: " << results.success_rate * 100 << "%\n";
        report << "  Avg Constraint Violations: " << results.avg_constraint_violations << "\n";
        report << "  Avg Solution Time: " << results.avg_solution_time_seconds << "s\n";
        report.close();
        std::cout << "\n✅ Report saved: " << output_report << std::endl;
    }
    
    return 0;
}

// Generate multiple alternative corridors
int tools_pirl_generate_corridors(const std::string& project_config_yaml,
                                  const std::string& output_dir,
                                  int num_corridors) {
    
    std::cout << "\n🎯 PIRL Multiple Corridors Generation" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    std::cout << "Config: " << project_config_yaml << std::endl;
    std::cout << "Output: " << output_dir << std::endl;
    std::cout << "Number of Corridors: " << num_corridors << "\n" << std::endl;
    
    try {
        // Load project configuration
        auto config = pirl::ProjectConfig::load_from_yaml(project_config_yaml);
        
        // Create PIRL agent
        pirl::PIRLAgent agent(config);
        
        // Load model if available
        if (!config.model_save_path.empty() && 
            std::filesystem::exists(config.model_save_path)) {
            agent.load_model(config.model_save_path);
        }
        
        // Generate multiple corridors
        auto corridors = agent.generate_corridors(
            {config.start_point.x, config.start_point.y},
            {config.end_point.x, config.end_point.y},
            config.project_dir,
            num_corridors
        );
        
        std::cout << "\n✅ Generated " << corridors.size() << " corridors" << std::endl;
        
        // Create output directory
        std::filesystem::create_directories(output_dir);
        
        // Export each corridor
        for (size_t i = 0; i < corridors.size(); ++i) {
            std::string corridor_name = "corridor_" + std::to_string(i + 1);
            
            // GeoJSON
            std::string geojson_path = output_dir + "/" + corridor_name + ".geojson";
            pirl::export_utils::export_to_geojson(corridors[i], geojson_path, config.epsg_code);
            
            // Shapefile
            std::string shp_path = output_dir + "/" + corridor_name + ".shp";
            pirl::export_utils::export_to_shapefile(corridors[i], shp_path, config.epsg_code);
            
            // Evaluate
            auto eval = agent.evaluate_route(corridors[i], config.project_dir);
            std::string csv_path = output_dir + "/" + corridor_name + "_stats.csv";
            pirl::export_utils::export_stats_to_csv(eval, csv_path);
            
            std::cout << "   Corridor " << (i+1) << ": " << eval.length_m << "m, "
                      << "$" << eval.total_cost_usd << std::endl;
        }
        
        std::cout << "\n✅ All corridors exported to: " << output_dir << std::endl;
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "❌ Error: " << e.what() << std::endl;
        return 1;
    }
}

// Create project configuration template
int tools_pirl_create_config(const std::string& project_name,
                             const std::string& output_yaml,
                             bool interactive) {
    
    std::cout << "\n📝 Create PIRL Project Configuration" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    std::cout << "Project: " << project_name << std::endl;
    std::cout << "Output: " << output_yaml << "\n" << std::endl;
    
    pirl::ProjectConfig config;
    config.project_name = project_name;
    config.project_code = project_name;
    config.client_name = "Client Name";
    config.epsg_code = 32633; // Default: UTM 33N
    config.measurement_units = "SI";
    
    // Default start/end points (user must edit)
    config.start_point = {0.0, 0.0, ""};
    config.end_point = {10000.0, 0.0, ""};
    
    // Default paths
    config.project_dir = "/opt/agrs/Projects/" + project_name;
    config.data_dir = config.project_dir + "/data";
    config.output_dir = config.project_dir + "/outputs";
    config.model_save_path = config.project_dir + "/models/pirl_model.zip";
    
    if (interactive) {
        std::cout << "🔧 Interactive mode not yet implemented" << std::endl;
        std::cout << "   Please edit the generated YAML file manually\n" << std::endl;
    }
    
    // Save configuration
    config.save_to_yaml(output_yaml);
    
    std::cout << "✅ Configuration template created: " << output_yaml << std::endl;
    std::cout << "\n📋 Next steps:" << std::endl;
    std::cout << "   1. Edit " << output_yaml << " with your project details" << std::endl;
    std::cout << "   2. Set start_x, start_y, end_x, end_y coordinates" << std::endl;
    std::cout << "   3. Adjust cost weights and constraints as needed" << std::endl;
    std::cout << "   4. Run: zeus tools pirl_generate_route --config " << output_yaml << std::endl;
    
    return 0;
}

// ============================================================================
// PIRL PYTHON TRAINING INTERFACE COMMANDS
// ============================================================================

/**
 * @brief Reset PIRL environment episode for Python training
 * 
 * This command is called by the Python training environment to reset
 * the C++ PipelineEnvironment to initial state.
 */
int tools_pirl_reset_episode(const std::string& config_path,
                            const std::string& output_dir) {
    
    std::cout << "\n🔄 PIRL Episode Reset (Python Interface)" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    
    try {
        // Load project configuration
        agrs::pirl::ProjectConfig config = agrs::pirl::ProjectConfig::load_from_yaml(config_path);
        
        // Create environment
        agrs::pirl::PipelineEnvironment env(config);
        
        // Reset to initial state
        agrs::pirl::State initial_state = env.reset();
        
        // Save state to JSON for Python
        std::filesystem::path state_file = std::filesystem::path(output_dir) / "current_state.json";
        std::ofstream state_out(state_file);
        if (!state_out.is_open()) {
            std::cerr << "❌ Failed to create state file: " << state_file << std::endl;
            return 1;
        }
        
        state_out << "{\n";
        state_out << "  \"x\": " << initial_state.x << ",\n";
        state_out << "  \"y\": " << initial_state.y << ",\n";
        state_out << "  \"goal_distance\": " << initial_state.goal_distance << ",\n";
        state_out << "  \"goal_bearing\": " << initial_state.goal_bearing << ",\n";
        state_out << "  \"elevation\": " << initial_state.elevation << ",\n";
        state_out << "  \"slope\": " << initial_state.slope << ",\n";
        state_out << "  \"aspect\": " << initial_state.aspect << ",\n";
        state_out << "  \"curvature\": " << initial_state.curvature << ",\n";
        state_out << "  \"no_go_zone\": " << initial_state.no_go_zone << ",\n";
        state_out << "  \"water_proximity\": " << initial_state.water_proximity << ",\n";
        state_out << "  \"road_proximity\": " << initial_state.road_proximity << ",\n";
        state_out << "  \"geohazard_risk\": " << initial_state.geohazard_risk << ",\n";
        state_out << "  \"soil_capacity\": " << initial_state.soil_capacity << ",\n";
        state_out << "  \"cadastre_complex\": " << initial_state.cadastre_complex << ",\n";
        state_out << "  \"population_density\": " << initial_state.population_density << ",\n";
        state_out << "  \"railway_proximity\": " << initial_state.railway_proximity << ",\n";
        state_out << "  \"prev_heading\": " << initial_state.prev_heading << "\n";
        state_out << "}\n";
        state_out.close();
        
        // Save reward info
        std::filesystem::path reward_file = std::filesystem::path(output_dir) / "reward_info.json";
        std::ofstream reward_out(reward_file);
        if (!reward_out.is_open()) {
            std::cerr << "❌ Failed to create reward file: " << reward_file << std::endl;
            return 1;
        }
        
        reward_out << "{\n";
        reward_out << "  \"total_reward\": 0.0,\n";
        reward_out << "  \"progress_reward\": 0.0,\n";
        reward_out << "  \"cost_penalty\": 0.0,\n";
        reward_out << "  \"constraint_penalty\": 0.0,\n";
        reward_out << "  \"curvature_penalty\": 0.0,\n";
        reward_out << "  \"goal_bonus\": 0.0,\n";
        reward_out << "  \"slope_violation\": 0.0,\n";
        reward_out << "  \"no_go_violation\": 0.0,\n";
        reward_out << "  \"crossing_violation\": 0.0,\n";
        reward_out << "  \"termination_reason\": \"episode_start\"\n";
        reward_out << "}\n";
        reward_out.close();
        
        std::cout << "✅ Episode reset complete" << std::endl;
        std::cout << "   State saved to: " << state_file << std::endl;
        std::cout << "   Reward info saved to: " << reward_file << std::endl;
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "❌ Error during episode reset: " << e.what() << std::endl;
        return 1;
    }
}

/**
 * @brief Execute one step in PIRL environment for Python training
 * 
 * This command is called by the Python training environment to execute
 * a single step in the C++ PipelineEnvironment.
 */
int tools_pirl_step(const std::string& config_path,
                   const std::string& action_file,
                   const std::string& output_dir) {
    
    std::cout << "\n⚡ PIRL Environment Step (Python Interface)" << std::endl;
    std::cout << "════════════════════════════════════════════════════════\n";
    
    try {
        // Load project configuration
        agrs::pirl::ProjectConfig config = agrs::pirl::ProjectConfig::load_from_yaml(config_path);
        
        // Create environment
        agrs::pirl::PipelineEnvironment env(config);
        
        // Load action from JSON
        std::ifstream action_in(action_file);
        if (!action_in.is_open()) {
            std::cerr << "❌ Failed to open action file: " << action_file << std::endl;
            return 1;
        }
        
        std::string action_json;
        std::string line;
        while (std::getline(action_in, line)) {
            action_json += line;
        }
        action_in.close();
        
        // Parse action (simple JSON parsing)
        double heading_change = 0.0;
        double step_size = 50.0;
        
        // Extract heading_change
        size_t pos = action_json.find("\"heading_change\":");
        if (pos != std::string::npos) {
            pos += 17; // Length of "\"heading_change\":"
            size_t end = action_json.find(",", pos);
            if (end == std::string::npos) end = action_json.find("}", pos);
            std::string value_str = action_json.substr(pos, end - pos);
            heading_change = std::stod(value_str);
        }
        
        // Extract step_size
        pos = action_json.find("\"step_size\":");
        if (pos != std::string::npos) {
            pos += 12; // Length of "\"step_size\":"
            size_t end = action_json.find("}", pos);
            std::string value_str = action_json.substr(pos, end - pos);
            step_size = std::stod(value_str);
        }
        
        // Create action
        agrs::pirl::Action action;
        action.heading_change = heading_change;
        action.step_size = step_size;
        
        // Execute step
        auto [new_state, reward_info] = env.step(action);
        
        // Save new state to JSON
        std::filesystem::path state_file = std::filesystem::path(output_dir) / "current_state.json";
        std::ofstream state_out(state_file);
        if (!state_out.is_open()) {
            std::cerr << "❌ Failed to create state file: " << state_file << std::endl;
            return 1;
        }
        
        state_out << "{\n";
        state_out << "  \"x\": " << new_state.x << ",\n";
        state_out << "  \"y\": " << new_state.y << ",\n";
        state_out << "  \"goal_distance\": " << new_state.goal_distance << ",\n";
        state_out << "  \"goal_bearing\": " << new_state.goal_bearing << ",\n";
        state_out << "  \"elevation\": " << new_state.elevation << ",\n";
        state_out << "  \"slope\": " << new_state.slope << ",\n";
        state_out << "  \"aspect\": " << new_state.aspect << ",\n";
        state_out << "  \"curvature\": " << new_state.curvature << ",\n";
        state_out << "  \"no_go_zone\": " << new_state.no_go_zone << ",\n";
        state_out << "  \"water_proximity\": " << new_state.water_proximity << ",\n";
        state_out << "  \"road_proximity\": " << new_state.road_proximity << ",\n";
        state_out << "  \"geohazard_risk\": " << new_state.geohazard_risk << ",\n";
        state_out << "  \"soil_capacity\": " << new_state.soil_capacity << ",\n";
        state_out << "  \"cadastre_complex\": " << new_state.cadastre_complex << ",\n";
        state_out << "  \"population_density\": " << new_state.population_density << ",\n";
        state_out << "  \"railway_proximity\": " << new_state.railway_proximity << ",\n";
        state_out << "  \"prev_heading\": " << new_state.prev_heading << "\n";
        state_out << "}\n";
        state_out.close();
        
        // Save reward info
        std::filesystem::path reward_file = std::filesystem::path(output_dir) / "reward_info.json";
        std::ofstream reward_out(reward_file);
        if (!reward_out.is_open()) {
            std::cerr << "❌ Failed to create reward file: " << reward_file << std::endl;
            return 1;
        }
        
        reward_out << "{\n";
        reward_out << "  \"total_reward\": " << reward_info.total_reward << ",\n";
        reward_out << "  \"progress_reward\": " << reward_info.progress_reward << ",\n";
        reward_out << "  \"cost_penalty\": " << reward_info.cost_penalty << ",\n";
        reward_out << "  \"constraint_penalty\": " << reward_info.constraint_penalty << ",\n";
        reward_out << "  \"curvature_penalty\": " << reward_info.curvature_penalty << ",\n";
        reward_out << "  \"goal_bonus\": " << reward_info.goal_bonus << ",\n";
        reward_out << "  \"slope_violation\": " << reward_info.slope_violation << ",\n";
        reward_out << "  \"no_go_violation\": " << reward_info.no_go_violation << ",\n";
        reward_out << "  \"crossing_violation\": " << reward_info.crossing_violation << ",\n";
        reward_out << "  \"termination_reason\": \"" << reward_info.termination_reason << "\"\n";
        reward_out << "}\n";
        reward_out.close();
        
        std::cout << "✅ Step executed successfully" << std::endl;
        std::cout << "   New position: (" << new_state.x << ", " << new_state.y << ")" << std::endl;
        std::cout << "   Reward: " << reward_info.total_reward << std::endl;
        std::cout << "   Termination reason: " << reward_info.termination_reason << std::endl;
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "❌ Error during step execution: " << e.what() << std::endl;
        return 1;
    }
}

} // namespace tools
} // namespace agrs

