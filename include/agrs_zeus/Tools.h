#pragma once

#include <optional>
#include <string>
#include <CLI/CLI.hpp>

namespace agrs::tools {

struct ToolsOptions {
	CLI::App* cmdTools{nullptr};
	// Pipeline tools
	CLI::App* cmdPipelineGather{nullptr};
	CLI::App* cmdPipelineConstraints{nullptr};
	CLI::App* cmdPipelineOptimize{nullptr};
	CLI::App* cmdDemFetch{nullptr};
	CLI::App* cmdGpkgTranslate{nullptr};
	CLI::App* cmdRasterQuery{nullptr};
	CLI::App* cmdVectorQuery{nullptr};
	CLI::App* cmdRasterExtractBand{nullptr};
	CLI::App* cmdRasterRescaleIndex{nullptr};
	CLI::App* cmdRasterCalc{nullptr};
	CLI::App* cmdRasterSample{nullptr};
	CLI::App* cmdRasterAlign{nullptr};
	CLI::App* cmdRasterPolygonize{nullptr};
	CLI::App* cmdRasterWaterDetect{nullptr};
	CLI::App* cmdRasterCloudDetect{nullptr};
	CLI::App* cmdSentinel2Fetch{nullptr};
    CLI::App* cmdCopernicusFetch{nullptr};
    CLI::App* cmdSearch{nullptr};
    CLI::App* cmdMosaic{nullptr};
    CLI::App* cmdGeoAI{nullptr};
	CLI::App* cmdOsmWaterwaysFetch{nullptr};
	CLI::App* cmdOsmRoadsFetch{nullptr};
	CLI::App* cmdOsmRailwaysFetch{nullptr};
	CLI::App* cmdEsaWorldCoverFetch{nullptr};
	CLI::App* cmdTerrainSlope{nullptr};
	CLI::App* cmdTerrainAspect{nullptr};
	
	// GPKG Translate
	std::string gpkgInputPath;
	std::string gpkgOutputDir;
	bool gpkgSeparateLayers{false};
	std::string gpkgVectorFormat{"geojson"};
	std::string gpkgRasterFormat{"cog"};
	std::string gpkgTableFormat{"parquet"};
	std::string gpkgLayerFilter;
	bool gpkgIncludeMetadata{false};
	bool gpkgOverwrite{false};
	CLI::Option* gpkgLayerFilterOpt{nullptr};
	
	// Raster Query
	std::string rasterQueryPath;
	double rasterQueryLon{0.0};
	double rasterQueryLat{0.0};
	std::string rasterQueryFormat{"json"};
	
	// Vector Query
	std::string vectorQueryPath;
	double vectorQueryLon{0.0};
	double vectorQueryLat{0.0};
	std::string vectorQueryType{"nearest"};

	// Raster Extract Band
	std::string rasterExtractInput;
	int rasterExtractBand{1};
	std::string rasterExtractOutput;
	std::string rasterExtractUnit{"1"};
	bool rasterExtractCOG{true};
	bool rasterExtractOverwrite{false};

	// Raster Rescale Index
	std::string rasterRescaleInput;
	std::string rasterRescaleOutput;
	std::string rasterRescaleIndex{"custom"};
	bool rasterRescaleAuto{true};
	double rasterRescaleSrcMin{0.0};
	double rasterRescaleSrcMax{0.0};
	double rasterRescaleDstMin{-1.0};
	double rasterRescaleDstMax{1.0};
	bool rasterRescaleCOG{true};
	bool rasterRescaleOverwrite{false};
	CLI::Option* rasterRescaleSrcMinOpt{nullptr};
	CLI::Option* rasterRescaleSrcMaxOpt{nullptr};

	// Raster Calc
	std::vector<std::string> rasterCalcInputs;
	std::string rasterCalcOutput;
	std::string rasterCalcExpression;
	std::string rasterCalcDataType{"Float32"};
	bool rasterCalcOverwrite{false};

	// Raster Sample
	std::string rasterSampleInput;
	double rasterSampleLon{0.0};
	double rasterSampleLat{0.0};
	std::string rasterSampleFormat{"json"};

	// Raster Align
	std::string rasterAlignInput;
	std::string rasterAlignOutput;
	std::string rasterAlignReference;
	bool rasterAlignOverwrite{false};

	// Raster Polygonize
	std::string rasterPolygonizeInput;
	std::string rasterPolygonizeOutput;
	std::string rasterPolygonizeField{"pixel_val"};
	bool rasterPolygonizeOverwrite{false};

	// Raster Water Detect
	std::string rasterWaterInput;
	std::string rasterWaterOutput;
	double rasterWaterBlueThreshold{50000.0};
	double rasterWaterRedGreenMax{28000.0};
	bool rasterWaterOverwrite{false};

	// Raster Cloud Detect
	std::string rasterCloudInput;
	std::string rasterCloudOutput;
	double rasterCloudRedGreenMin{33000.0};
	double rasterCloudRedGreenMax{45000.0};
	double rasterCloudBlueMin{50000.0};
	bool rasterCloudOverwrite{false};

	// Sentinel-2 Fetch
	std::string sentinel2FetchBBox; // minx,miny,maxx,maxy EPSG:4326
	std::string sentinel2FetchDatetime; // ISO range e.g., 2024-10-01/2024-10-31
	int sentinel2FetchCloudMax{30};
	std::string sentinel2FetchBands; // comma-separated specific bands
	std::string sentinel2FetchBandGroups; // comma-separated band groups
	bool sentinel2FetchAllBands{false}; // fetch all 13 spectral bands
	std::string sentinel2FetchAuxiliary; // comma-separated auxiliary data
	std::string sentinel2FetchOutputDir; // output directory for bands
	bool sentinel2FetchOverwrite{false};


    // Copernicus Fetch
    std::string copernicusFetchBBox; // minx,miny,maxx,maxy EPSG:4326
    std::string copernicusFetchAOI; // optional vector path
    std::string copernicusFetchDatetime; // ISO range e.g., 2024-10-01/2024-10-31
    std::string copernicusFetchOutputDir; // where to place output
    std::string copernicusFetchProduct{"S1GRD"}; // S1GRD|S3OLCI|S3SLSTR|LANDCOVER
    std::string copernicusFetchUsername; // CDSE username
    std::string copernicusFetchPassword; // CDSE password
    bool copernicusFetchOverwrite{false};

    // Unified Search
    std::string searchAOI; // AOI vector path (GeoJSON/Shapefile)
    std::string searchBBox; // BBox minx,miny,maxx,maxy in EPSG:4326
    std::string searchDatetime; // ISO range e.g., 2024-10-01/2024-10-31
    std::string searchTheme{"imagery"}; // imagery|dem|landcover|protected|roads|hydro
    int searchCloudMax{30}; // Maximum cloud cover percentage
    std::string searchOutputDir; // Output directory for results
    bool searchOverwrite{false};

    // Mosaic
    std::vector<std::string> mosaicInputFiles; // Input raster files to mosaic
    std::string mosaicOutputFile; // Output mosaic file
    std::string mosaicBBox; // Optional bbox for clipping (minx,miny,maxx,maxy)
    std::string mosaicCutlinePath; // Optional cutline for clipping
    std::string mosaicTargetCRS{"EPSG:4326"}; // Target CRS
    std::string mosaicResampling{"bilinear"}; // Resampling method
    std::string mosaicDataType{"auto"}; // Output data type (auto|Byte|UInt16|Int16|UInt32|Int32|Float32|Float64)
    bool mosaicOutputCOG{true}; // Output as COG
    bool mosaicOverwrite{false};

    // GeoAI
    std::string geoAITask{"cloud_mask"}; // cloud_mask|water_detect|change_detect|landcover_seg
    std::string geoAIInput; // Input raster path
    std::string geoAIOutput; // Output path
    std::string geoAIModel{"s2cloudless"}; // Model to use
    bool geoAIOverwrite{false};

	// DEM Fetch
	std::string demFetchBBox; // minx,miny,maxx,maxy in EPSG:4326
	std::string demFetchAOI; // optional vector path
	std::string demFetchResolution{"30m"}; // 30m|10m|1m
	std::string demFetchProvider{"auto"}; // auto|opentopo|srtm|nasadem|copernicus
	std::string demFetchToCRS; // optional target CRS (e.g., EPSG:32640)
	std::string demFetchAlignTo; // optional reference raster for alignment
	std::string demFetchOutput;
	bool demFetchOverwrite{false};
	bool demFetchDryRun{false};

	// Intelligent Routing Fetch Tools
	CLI::App* cmdImageryFetch{nullptr};
	std::string imageryFetchBBox;
	std::string imageryFetchAOI;
	std::string imageryFetchDate{"2024-01-01/2024-12-31"};
	std::string imageryFetchOutput;
	bool imageryFetchOverwrite{false};

	CLI::App* cmdClimateFetch{nullptr};
	std::string climateFetchBBox;
	std::string climateFetchAOI;
	std::string climateFetchVariable{"all"};
	std::string climateFetchOutput;
	bool climateFetchOverwrite{false};

	CLI::App* cmdLandcoverFetch{nullptr};
	std::string landcoverFetchBBox;
	std::string landcoverFetchAOI;
	std::string landcoverFetchOutput;
	bool landcoverFetchOverwrite{false};

	CLI::App* cmdHydrologyFetch{nullptr};
	std::string hydrologyFetchBBox;
	std::string hydrologyFetchAOI;
	std::string hydrologyFetchOutput;
	bool hydrologyFetchOverwrite{false};

	CLI::App* cmdInfrastructureFetch{nullptr};
	std::string infrastructureFetchBBox;
	std::string infrastructureFetchAOI;
	std::string infrastructureFetchType{"all"};
	std::string infrastructureFetchOutput;
	bool infrastructureFetchOverwrite{false};

	CLI::App* cmdProtectedAreasFetch{nullptr};
	std::string protectedAreasFetchBBox;
	std::string protectedAreasFetchAOI;
	std::string protectedAreasFetchOutput;
	bool protectedAreasFetchOverwrite{false};

	CLI::App* cmdGeohazardsFetch{nullptr};
	std::string geohazardsFetchBBox;
	std::string geohazardsFetchAOI;
	std::string geohazardsFetchOutput;
	bool geohazardsFetchOverwrite{false};

	CLI::App* cmdAdministrativeFetch{nullptr};
	std::string administrativeFetchCountry;
	std::string administrativeFetchBBox;
	std::string administrativeFetchAOI;
	std::string administrativeFetchOutput;
	bool administrativeFetchOverwrite{false};

	CLI::App* cmdCadastreFetch{nullptr};
	std::string cadastreFetchBBox;
	std::string cadastreFetchAOI;
	std::string cadastreFetchOutput;
	bool cadastreFetchOverwrite{false};

	CLI::App* cmdSocioeconomicFetch{nullptr};
	std::string socioeconomicFetchBBox;
	std::string socioeconomicFetchAOI;
	std::string socioeconomicFetchOutput;
	bool socioeconomicFetchOverwrite{false};

	// Pipeline Gather options
	std::string pipelineAOI;
	std::string pipelineBBox;
	std::string pipelineDatetime;
	std::string pipelineOutputDir;
	std::string pipelineResolution{"10m"};
	bool pipelineOverwrite{false};

	// Pipeline Constraints options
	std::string pipelineDEM;
	std::string pipelineWater;
	std::string pipelineLandcover;
	std::string pipelineConstraintsOutput;
	double pipelineMaxSlope{15.0};
	double pipelineWaterBuffer{100.0};

	// Pipeline Optimize options
	std::string pipelineConstraintsDir;
	std::string pipelineStart; // lon,lat
	std::string pipelineEnd;   // lon,lat
	std::string pipelineRoutesOutput;
	int pipelineNumRoutes{1000};
	double pipelineWeightSlope{0.3};
	double pipelineWeightWater{0.4};
	double pipelineWeightDistance{0.3};

	// OSM Waterways Fetch
	std::string osmWaterwaysBBox;
	std::string osmWaterwaysAOI;
	std::string osmWaterwaysOutput;
	bool osmWaterwaysOverwrite{false};

	// OSM Roads Fetch
	std::string osmRoadsBBox;
	std::string osmRoadsAOI;
	std::string osmRoadsOutput;
	bool osmRoadsOverwrite{false};

	// OSM Power Lines Fetch
	CLI::App* cmdOsmPowerFetch{nullptr};
	std::string osmPowerBBox;
	std::string osmPowerAOI;
	std::string osmPowerOutput;
	bool osmPowerOverwrite{false};

	// OSM Railways Fetch
	std::string osmRailwaysBBox;
	std::string osmRailwaysAOI;
	std::string osmRailwaysOutput;
	bool osmRailwaysOverwrite{false};

	// ESA WorldCover Fetch
	std::string esaWorldCoverBBox;
	std::string esaWorldCoverAOI;
	std::string esaWorldCoverOutput;
	std::string esaWorldCoverYear;
	bool esaWorldCoverOverwrite{false};

	// Google Dynamic World Fetch
	CLI::App* cmdGoogleDynamicWorldFetch{nullptr};
	std::string googleDynamicWorldBBox;
	std::string googleDynamicWorldAOI;
	std::string googleDynamicWorldOutput;
	std::string googleDynamicWorldDate;
	bool googleDynamicWorldOverwrite{false};

	// Global Surface Water Fetch
	CLI::App* cmdGlobalSurfaceWaterFetch{nullptr};
	std::string globalSurfaceWaterBBox;
	std::string globalSurfaceWaterAOI;
	std::string globalSurfaceWaterOutput;
	std::string globalSurfaceWaterProduct{"occurrence"};
	bool globalSurfaceWaterOverwrite{false};

	// WorldPop Fetch
	CLI::App* cmdWorldPopFetch{nullptr};
	std::string worldPopCountry;
	std::string worldPopBBox;
	std::string worldPopAOI;
	std::string worldPopOutput;
	std::string worldPopYear{"2020"};
	bool worldPopConstrained{true};
	bool worldPopOverwrite{false};

	// WDPA Fetch
	CLI::App* cmdWDPAFetch{nullptr};
	std::string wdpaCountry;
	std::string wdpaBBox;
	std::string wdpaAOI;
	std::string wdpaOutput;
	bool wdpaOverwrite{false};

	// Natura 2000 Fetch
	CLI::App* cmdNatura2000Fetch{nullptr};
	std::string natura2000BBox;
	std::string natura2000AOI;
	std::string natura2000Output;
	std::string natura2000Country;
	bool natura2000Overwrite{false};

	// GADM Fetch
	CLI::App* cmdGADMFetch{nullptr};
	std::string gadmCountry;
	std::string gadmOutput;
	std::string gadmLevel{"all"};
	bool gadmOverwrite{false};

	// WorldClim Fetch
	CLI::App* cmdWorldClimFetch{nullptr};
	std::string worldClimBBox;
	std::string worldClimAOI;
	std::string worldClimOutput;
	std::string worldClimVariable{"bio"};
	std::string worldClimResolution{"10m"};
	bool worldClimOverwrite{false};

	// MODIS Fetch
	CLI::App* cmdMODISFetch{nullptr};
	std::string modisBBox;
	std::string modisAOI;
	std::string modisOutput;
	std::string modisProduct{"NDVI"};
	std::string modisStartDate;
	std::string modisEndDate;
	bool modisOverwrite{false};

	// HydroSHEDS Fetch (Note: Complex, may need manual download)
	CLI::App* cmdHydroSHEDSFetch{nullptr};
	std::string hydroshedsBBox;
	std::string hydroshedsAOI;
	std::string hydroshedsOutput;
	int hydroshedsLevel{6};  // Basin level 1-12
	bool hydroshedsOverwrite{false};

	// ISTAT Administrative Boundaries Fetch
	CLI::App* cmdISTATBoundariesFetch{nullptr};
	std::string istatBBox;
	std::string istatAOI;
	std::string istatOutput;
	std::string istatLevel{"comuni"};  // comuni|province|regioni
	bool istatOverwrite{false};

	// CORINE Land Cover Fetch
	CLI::App* cmdCORINEFetch{nullptr};
	std::string corineBBox;
	std::string corineAOI;
	std::string corineOutput;
	int corineYear{2018};  // 2018|2012|2006|2000
	bool corineOverwrite{false};

	// ERA5 Fetch (Note: Requires CDS API)
	CLI::App* cmdERA5Fetch{nullptr};
	std::string era5BBox;
	std::string era5AOI;
	std::string era5Output;
	std::string era5Variable{"temperature"};
	std::string era5StartDate;
	std::string era5EndDate;
	bool era5Overwrite{false};

	// FAO Soil Fetch
	CLI::App* cmdFAOSoilFetch{nullptr};
	std::string faoSoilBBox;
	std::string faoSoilAOI;
	std::string faoSoilOutput;
	bool faoSoilOverwrite{false};

	// Seismic Hazard Fetch
	CLI::App* cmdSeismicHazardFetch{nullptr};
	std::string seismicHazardBBox;
	std::string seismicHazardAOI;
	std::string seismicHazardOutput;
	std::string seismicHazardProduct{"pga"};
	bool seismicHazardOverwrite{false};

	// SoilGrids Fetch
	CLI::App* cmdSoilGridsFetch{nullptr};
	std::string soilGridsBBox;
	std::string soilGridsAOI;
	std::string soilGridsProperties{"soc,clay,sand,silt,ph,bdod,cec"};
	std::string soilGridsDepth{"0-5cm"};
	std::string soilGridsOutput;
	bool soilGridsOverwrite{false};

	// Flood Risk Fetch
	CLI::App* cmdFloodRiskFetch{nullptr};
	std::string floodRiskBBox;
	std::string floodRiskAOI;
	std::string floodRiskOutput;
	std::string floodRiskProduct{"baseline"};
	bool floodRiskOverwrite{false};

	// EUAP Italy Protected Areas Fetch
	CLI::App* cmdEUAPFetch{nullptr};
	std::string euapBBox;
	std::string euapAOI;
	std::string euapOutput;
	bool euapOverwrite{false};

	// ISPRA IFFI Landslide Fetch
	CLI::App* cmdIFFIFetch{nullptr};
	std::string iffiBBox;
	std::string iffiAOI;
	std::string iffiOutput;
	bool iffiOverwrite{false};

	// TINITALY DEM Fetch
	CLI::App* cmdTINITALYFetch{nullptr};
	std::string tinitalyBBox;
	std::string tinitalyAOI;
	std::string tinitalyOutput;
	bool tinitalyOverwrite{false};

	// INGV Seismic Hazard Fetch
	CLI::App* cmdINGVSeismicFetch{nullptr};
	std::string ingvSeismicBBox;
	std::string ingvSeismicAOI;
	std::string ingvSeismicOutput;
	std::string ingvSeismicProduct{"pga"};
	bool ingvSeismicOverwrite{false};

	// INGV Faults Database Fetch
	CLI::App* cmdINGVFaultsFetch{nullptr};
	std::string ingvFaultsBBox;
	std::string ingvFaultsAOI;
	std::string ingvFaultsOutput;
	bool ingvFaultsOverwrite{false};

	// EU-Hydro River Network Fetch
	CLI::App* cmdEUHydroFetch{nullptr};
	std::string euhydroBBox;
	std::string euhydroAOI;
	std::string euhydroOutput;
	bool euhydroOverwrite{false};

	// Italian Soil System Fetch
	CLI::App* cmdItalianSoilFetch{nullptr};
	std::string italianSoilOutput;
	bool italianSoilOverwrite{false};

	// CORINE Land Cover Italy Fetch
	CLI::App* cmdCORINEItalyFetch{nullptr};
	std::string corineItalyBBox;
	std::string corineItalyAOI;
	std::string corineItalyOutput;
	std::string corineItalyYear{"2018"};
	bool corineItalyOverwrite{false};

	// SciGRID_gas European Gas Pipelines Fetch
	CLI::App* cmdSciGRIDGasFetch{nullptr};
	std::string scigridGasBBox;
	std::string scigridGasAOI;
	std::string scigridGasOutput;
	std::string scigridGasCountry;
	bool scigridGasOverwrite{false};

	// GEE Tile Export (generic tiler/mosaicker)
	CLI::App* cmdGEETileExport{nullptr};
	std::string geeBBox;
	std::string geeAOI;
	std::string geeAsset; // Image or ImageCollection ID
	std::string geeBands; // comma-separated
	std::string geeDateStart;
	std::string geeDateEnd;
	std::string geeScale{"10"}; // meters
	std::string geeCRS{"EPSG:4326"};
	int geeTilePixels{2048};
	std::string geeOutput;
	bool geeOverwrite{false};

	// WMS Fetch
	CLI::App* cmdWMSFetch{nullptr};
	std::string wmsURL;
	std::string wmsLayers;
	std::string wmsBBox;
	std::string wmsAOI;
	std::string wmsSRS{"EPSG:4326"};
	int wmsWidth{4096};
	int wmsHeight{4096};
	std::string wmsFormat{"image/geotiff"};
	std::string wmsOutput;
	bool wmsOverwrite{false};

	// WFS Fetch (robust)
	CLI::App* cmdWFSFetch{nullptr};
	std::string wfsURL;
	std::string wfsTypeName;
	std::string wfsBBox;
	std::string wfsAOI;
	std::string wfsVersion{"2.0.0"};
	int wfsPageSize{1000};
	std::string wfsFilter; // optional WHERE/CQL
	std::string wfsOutput;
	bool wfsOverwrite{false};

	// KMZ/KML -> BBOX helper
	CLI::App* cmdKMLToBBox{nullptr};
	std::string kmlInput;
	std::string kmlBBoxOutput; // optional path to write bbox string

	// Copernicus EEA-10 DEM
	CLI::App* cmdCopernicusEEA10Fetch{nullptr};
	std::string copEEA10BBox;
	std::string copEEA10AOI;
	std::string copEEA10Collection{"COP-DEM_EEA-10-DGED"};
	std::string copEEA10Output;
	bool copEEA10Overwrite{false};

	// Terrain Slope
	std::string terrainSlopeInput;
	std::string terrainSlopeOutput;
	bool terrainSlopePercent{true};
	bool terrainSlopeComputeEdges{false};
	std::string terrainSlopeAlgorithm{"Horn"};
	bool terrainSlopeOverwrite{false};

	// Terrain Aspect
	std::string terrainAspectInput;
	std::string terrainAspectOutput;
	bool terrainAspectZeroForFlat{false};
	bool terrainAspectOverwrite{false};

	// Terrain Curvature
	CLI::App* cmdTerrainCurvature{nullptr};
	std::string terrainCurvatureInput;
	std::string terrainCurvatureOutput;
	std::string terrainCurvatureType{"profile"}; // profile|planform|total
	bool terrainCurvatureOverwrite{false};

	// Raster Threshold
	CLI::App* cmdRasterThreshold{nullptr};
	std::string rasterThresholdInput;
	std::string rasterThresholdOutput;
	double rasterThresholdValue{0.0};
	double rasterThresholdAbove{255.0};
	double rasterThresholdBelow{0.0};
	bool rasterThresholdInvert{false};
	bool rasterThresholdOverwrite{false};

	// Phase 3B: Critical Geospatial Tools
	CLI::App* cmdRasterReclassify{nullptr};
	std::string rasterReclassifyInput;
	std::string rasterReclassifyOutput;
	std::string rasterReclassifyRules;
	std::string rasterReclassifyType;
	bool rasterReclassifyOverwrite{false};

	CLI::App* cmdRasterBoolean{nullptr};
	std::string rasterBooleanInputs;
	std::string rasterBooleanOperation;
	std::string rasterBooleanOutput;
	bool rasterBooleanOverwrite{false};

	CLI::App* cmdVectorToRaster{nullptr};
	std::string vectorToRasterInput;
	std::string vectorToRasterOutput;
	std::string vectorToRasterAttribute;
	double vectorToRasterResolution{0.0};
	std::string vectorToRasterExtent;
	std::string vectorToRasterBurn;
	std::string vectorToRasterType;
	bool vectorToRasterOverwrite{false};

	CLI::App* cmdRasterProximity{nullptr};
	std::string rasterProximityInput;
	std::string rasterProximityOutput;
	std::string rasterProximityValues;
	double rasterProximityMaxDist{0.0};
	std::string rasterProximityUnits;
	bool rasterProximityOverwrite{false};

	// Phase 3C/3D: Additional Tools
	CLI::App* cmdVectorBuffer{nullptr};
	std::string vectorBufferInput;
	std::string vectorBufferOutput;
	double vectorBufferDistance{0.0};
	int vectorBufferSegments{30};
	std::string vectorBufferEndCap;
	bool vectorBufferDissolve{false};
	bool vectorBufferOverwrite{false};

	CLI::App* cmdRasterExtractByMask{nullptr};
	std::string rasterExtractMaskInput;
	std::string rasterExtractMaskVector;
	std::string rasterExtractMaskOutput;
	bool rasterExtractMaskCrop{false};
	bool rasterExtractMaskOverwrite{false};

	CLI::App* cmdRasterHillshade{nullptr};
	std::string rasterHillshadeInput;
	std::string rasterHillshadeOutput;
	double rasterHillshadeAzimuth{315.0};
	double rasterHillshadeAltitude{45.0};
	double rasterHillshadeZFactor{1.0};
	bool rasterHillshadeOverwrite{false};

	CLI::App* cmdRasterTRI{nullptr};
	std::string rasterTRIInput;
	std::string rasterTRIOutput;
	bool rasterTRIOverwrite{false};

	// Perplexity AI Search
	CLI::App* cmdPerplexitySearch{nullptr};
	std::string perplexityQuery;
	std::string perplexityLocation;
	std::string perplexityBBox;
	std::string perplexityPlace;
	std::string perplexityTopic;
	std::string perplexityDatasetResearch;
	std::string perplexityModel;
	int perplexityMaxTokens{4000};
	double perplexityTemperature{0.2};
	std::string perplexityRecency;
	std::string perplexityFormat{"markdown"};
	std::string perplexityOutput;
	bool perplexityCitations{true};
	
	// AI Operator (Cursor Agent)
	CLI::App* cmdAIOperator{nullptr};
	CLI::App* cmdAIAsk{nullptr};
	CLI::App* cmdAITask{nullptr};
	std::string aiPrompt;
	std::string aiTaskPrompt;
	std::string aiProjectPath;
	
	// Analyze Fetch Tools
	CLI::App* cmdAnalyzeFetchTools{nullptr};
	std::string analyzeFetchMode{"all"};
	std::string analyzeFetchCountry;
	double analyzeFetchLat{0.0};
	double analyzeFetchLon{0.0};
	std::string analyzeFetchOutput;
	bool analyzeFetchVerbose{false};
	
	// ============================================================================
	// PIRL (Physics-Informed Reinforcement Learning) Pipeline Routing
	// ============================================================================
	
	// PIRL CLI commands
	CLI::App* cmdPirlGenerateRoute{nullptr};
	CLI::App* cmdPirlTrainModel{nullptr};
	CLI::App* cmdPirlEvaluate{nullptr};
	CLI::App* cmdPirlGenerateCorridors{nullptr};
	CLI::App* cmdPirlCreateConfig{nullptr};
	CLI::App* cmdPirlResetEpisode{nullptr};
	CLI::App* cmdPirlStep{nullptr};
	CLI::App* cmdPirlGetRoute{nullptr};
	
	// PIRL options
	std::string pirlConfigPath;
	std::string pirlOutputDir;
	std::string pirlTrainingConfigPath;
	std::string pirlModelPath;
	std::string pirlTestDir;
	std::string pirlReportPath;
	std::string pirlProjectName;
	std::string pirlActionFile;
	std::string pirlRouteFile;
	int pirlNumEpisodes{10000};
	int pirlNumCorridors{5};
	bool pirlVisualize{false};
	bool pirlInteractive{false};
};

void register_tools_commands(CLI::App& cli, ToolsOptions& opts);
std::optional<int> handle_tools_commands(const ToolsOptions& opts);

// GPKG Translate function
int tools_gpkg_translate(const std::string& inputPath,
                        const std::string& outputDir,
                        bool separateLayers,
                        const std::string& vectorFormat,
                        const std::string& rasterFormat,
                        const std::string& tableFormat,
                        const std::string& layerFilter,
                        bool includeMetadata,
                        bool overwrite);

// Raster Query function
int tools_raster_query(const std::string& rasterPath,
                      double longitude,
                      double latitude,
                      const std::string& outputFormat);

// Vector Query function
int tools_vector_query(const std::string& vectorPath,
                      double longitude,
                      double latitude,
                      const std::string& queryType);

// Raster Rescale Index function
int tools_raster_rescale_index(const std::string& inputRaster,
                              const std::string& outputRaster,
                              const std::string& indexType,
                              bool autoDetect,
                              const std::optional<double>& srcMin,
                              const std::optional<double>& srcMax,
                              double dstMin,
                              double dstMax,
                              bool outputCOG,
                              bool overwrite);

// Raster Extract Band function
int tools_raster_extract_band(const std::string& inputRaster,
                             int bandIndex,
                             const std::string& outputRaster,
                             const std::string& unit,
                             bool outputCOG,
                             bool overwrite);

// Raster Calc function
int tools_raster_calc(const std::vector<std::string>& inputs,
                     const std::string& output,
                     const std::string& expression,
                     const std::string& dataType,
                     bool overwrite);

// Raster Sample function
int tools_raster_sample(const std::string& rasterPath,
                       double longitude,
                       double latitude,
                       const std::string& format);

// Raster Align function
int tools_raster_align(const std::string& inputPath,
                      const std::string& outputPath,
                      const std::string& referencePath,
                      bool overwrite);

// Raster Polygonize function
int tools_raster_polygonize(const std::string& rasterPath,
                           const std::string& vectorPath,
                           const std::string& fieldName,
                           bool overwrite);

// Raster Water Detect function
int tools_raster_water_detect(const std::string& rgbRasterPath,
                             const std::string& outputPath,
                             double blueThreshold,
                             double redGreenMax,
                             bool overwrite);

// Raster Cloud Detect function
int tools_raster_cloud_detect(const std::string& rgbRasterPath,
                             const std::string& outputPath,
                             double redGreenMin,
                             double redGreenMax,
                             double blueMin,
                             bool overwrite);

// DEM Fetch function
int tools_dem_fetch(const std::string& bbox,
                  const std::string& aoiPath,
                  const std::string& resolution,
                  const std::string& provider,
                  const std::string& toCRS,
                  const std::string& alignTo,
                  const std::string& outputPath,
                  bool overwrite,
                  bool dryRun);

// S2 Fetch function (downloads B03 and B08 COGs for an AOI/date)
int tools_sentinel2_fetch(const std::string& bbox,
                         const std::string& datetime,
                         int cloudMax,
                         const std::string& bands,
                         const std::string& bandGroups,
                         bool allBands,
                         const std::string& auxiliary,
                         const std::string& outputDir,
                         bool overwrite);


// Copernicus Fetch function
int tools_copernicus_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& datetime,
                        const std::string& outputDir,
                        const std::string& product,
                        const std::string& username,
                        const std::string& password,
                        bool overwrite);

// Unified Search function
int tools_search(const std::string& aoiPath,
                 const std::string& bbox,
                 const std::string& datetime,
                 const std::string& theme,
                 int cloudMax,
                 const std::string& outputDir,
                 bool overwrite);

// Mosaic function
int tools_mosaic(const std::vector<std::string>& inputFiles,
                 const std::string& outputFile,
                 const std::string& bbox,
                 const std::string& cutlinePath,
                 const std::string& targetCRS,
                 const std::string& resampling,
                 const std::string& dataType,
                 bool outputCOG,
                 bool overwrite);

// GeoAI function
int tools_geoai(const std::string& task,
                const std::string& inputPath,
                const std::string& outputPath,
                const std::string& model,
                bool overwrite);

// Pipeline functions
int tools_pipeline_gather(const std::string& aoiPath,
                        const std::string& bbox,
                        const std::string& datetime,
                        const std::string& outputDir,
                        const std::string& resolution,
                        bool overwrite);

int tools_pipeline_constraints(const std::string& demPath,
                             const std::string& waterPath,
                             const std::string& landcoverPath,
                             const std::string& outputDir,
                             double maxSlopeDeg,
                             double waterBufferMeters,
                             bool overwrite);

int tools_pipeline_optimize(const std::string& constraintsDir,
                          const std::string& startLonLat,
                          const std::string& endLonLat,
                          const std::string& outputDir,
                          int numRoutes,
                          double weightSlope,
                          double weightWater,
                          double weightDistance,
                          bool overwrite);

// OSM Fetch functions
int tools_osm_waterways_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              bool overwrite);

int tools_osm_roads_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite);

int tools_osm_power_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite);

int tools_osm_railways_fetch(const std::string& bbox,
                             const std::string& aoiPath,
                             const std::string& outputPath,
                             bool overwrite);

// ESA Fetch functions
int tools_esa_worldcover_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& year,
                               bool overwrite);

int tools_google_dynamicworld_fetch(const std::string& bbox,
                                    const std::string& aoiPath,
                                    const std::string& outputPath,
                                    const std::string& date,
                                    bool overwrite);

int tools_global_surface_water_fetch(const std::string& bbox,
                                      const std::string& aoiPath,
                                      const std::string& outputPath,
                                      const std::string& product,
                                      bool overwrite);

int tools_worldpop_fetch(const std::string& country,
                         const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         const std::string& year,
                         bool constrained,
                         bool overwrite);

int tools_wdpa_fetch(const std::string& country,
                     const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite);

int tools_natura2000_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& country,
                           bool overwrite);

int tools_gadm_fetch(const std::string& country,
                     const std::string& outputPath,
                     const std::string& level,
                     bool overwrite);

int tools_worldclim_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          const std::string& variable,
                          const std::string& resolution,
                          bool overwrite);

int tools_modis_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     const std::string& product,
                     const std::string& startDate,
                     const std::string& endDate,
                     bool overwrite);

int tools_hydrosheds_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           int level,
                           bool overwrite);

int tools_soilgrids_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& properties,
                          const std::string& depth,
                          const std::string& outputPath,
                          bool overwrite);

int tools_istat_boundaries_fetch(const std::string& bbox,
                                  const std::string& aoiPath,
                                  const std::string& outputPath,
                                  const std::string& level,
                                  bool overwrite);

int tools_corine_fetch(const std::string& bbox,
                       const std::string& aoiPath,
                       const std::string& outputPath,
                       int year,
                       bool overwrite);

int tools_era5_fetch(const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& outputPath,
                    const std::string& variable,
                    const std::string& startDate,
                    const std::string& endDate,
                    bool overwrite);

int tools_fao_soil_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        bool overwrite);

int tools_seismic_hazard_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& product,
                               bool overwrite);

int tools_flood_risk_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& product,
                           bool overwrite);

// Italy-specific Fetch functions
int tools_euap_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite);

int tools_iffi_fetch(const std::string& bbox,
                     const std::string& aoiPath,
                     const std::string& outputPath,
                     bool overwrite);

int tools_tinitaly_fetch(const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         bool overwrite);

int tools_ingv_seismic_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              const std::string& product,
                              bool overwrite);

// Additional Italy-specific Fetch functions (Priority 1 - Easy)
int tools_italian_soil_fetch(const std::string& outputPath,
                              bool overwrite);

int tools_istat_boundaries_fetch(const std::string& outputPath,
                                  const std::string& level,
                                  bool overwrite);

int tools_corine_italy_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              const std::string& year,
                              bool overwrite);

int tools_scigrid_gas_pipelines_fetch(const std::string& bbox,
                                       const std::string& aoiPath,
                                       const std::string& outputPath,
                                       const std::string& country,
                                       bool overwrite);

// New helper tools
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
                          bool overwrite);

int tools_wms_fetch(const std::string& url,
                    const std::string& layers,
                    const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& srs,
                    int width,
                    int height,
                    const std::string& format,
                    const std::string& outputPath,
                    bool overwrite);

int tools_wfs_fetch(const std::string& url,
                    const std::string& typeName,
                    const std::string& bbox,
                    const std::string& aoiPath,
                    const std::string& version,
                    int pageSize,
                    const std::string& filter,
                    const std::string& outputPath,
                    bool overwrite);

int tools_kml_to_bbox(const std::string& inputPath,
                      std::string& bboxOut);

int tools_copernicus_eea10_fetch(const std::string& bbox,
                                  const std::string& aoiPath,
                                  const std::string& collection,
                                  const std::string& outputPath,
                                  bool overwrite);

// Intelligent Dataset Routing Fetch Tools
int tools_landcover_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          const std::string& resolution,
                          bool overwrite);

int tools_hydrology_fetch(const std::string& bbox,
                          const std::string& aoiPath,
                          const std::string& outputPath,
                          bool overwrite);

int tools_infrastructure_fetch(const std::string& bbox,
                               const std::string& aoiPath,
                               const std::string& outputPath,
                               const std::string& infra_type,
                               bool overwrite);

int tools_protected_areas_fetch(const std::string& bbox,
                                const std::string& aoiPath,
                                const std::string& outputPath,
                                bool overwrite);

int tools_geohazards_fetch(const std::string& bbox,
                           const std::string& aoiPath,
                           const std::string& outputPath,
                           const std::string& hazard_type,
                           bool overwrite);

int tools_administrative_fetch(const std::string& country,
                               const std::string& outputPath,
                               int level,
                               bool overwrite);

int tools_cadastre_fetch(const std::string& bbox,
                         const std::string& aoiPath,
                         const std::string& outputPath,
                         bool overwrite);

int tools_socioeconomic_fetch(const std::string& bbox,
                              const std::string& aoiPath,
                              const std::string& outputPath,
                              bool overwrite);

int tools_climate_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        const std::string& variable,
                        bool overwrite);

int tools_imagery_fetch(const std::string& bbox,
                        const std::string& aoiPath,
                        const std::string& outputPath,
                        const std::string& date,
                        bool overwrite);

// Fetch Tool Availability Analyzer
int tools_analyze_fetch_tools(const std::string& mode,
                              const std::string& country,
                              const std::string& outputJson,
                              bool verbose);

// ============================================================================
// PIRL (Physics-Informed Reinforcement Learning) Pipeline Routing
// ============================================================================

// Generate optimal pipeline route using PIRL
int tools_pirl_generate_route(const std::string& project_config_yaml,
                              const std::string& output_dir,
                              bool visualize);

// Train PIRL model on project scenarios
int tools_pirl_train_model(const std::string& training_config_yaml,
                           const std::string& output_model_path,
                           int num_episodes);

// Evaluate trained PIRL model
int tools_pirl_evaluate(const std::string& model_path,
                       const std::string& test_projects_dir,
                       const std::string& output_report);

// Generate multiple alternative corridors
int tools_pirl_generate_corridors(const std::string& project_config_yaml,
                                  const std::string& output_dir,
                                  int num_corridors);

// Create project configuration template
int tools_pirl_create_config(const std::string& project_name,
                             const std::string& output_yaml,
                             bool interactive);

// ============================================================================
// PIRL PYTHON TRAINING INTERFACE COMMANDS
// ============================================================================

// Reset PIRL environment episode for Python training
int tools_pirl_reset_episode(const std::string& config_path,
                            const std::string& output_dir);

// Execute one step in PIRL environment for Python training
int tools_pirl_step(const std::string& config_path,
                   const std::string& action_file,
                   const std::string& output_dir);

// Get route from PIRL session (FIX FOR INFERENCE BUG)
int tools_pirl_get_route(const std::string& output_dir,
                        const std::string& route_output_file);

// Terrain Analysis functions  
int tools_terrain_slope(const std::string& inputDEM,
                       const std::string& outputSlope,
                       bool asPercent,
                       bool computeEdges,
                       const std::string& algorithm,
                       bool overwrite);

int tools_terrain_aspect(const std::string& inputDEM,
                        const std::string& outputAspect,
                        bool zeroForFlat,
                        bool overwrite);

int tools_terrain_curvature(const std::string& inputDEM,
                            const std::string& outputCurvature,
                            const std::string& curvatureType,
                            bool overwrite);

int tools_raster_threshold(const std::string& inputRaster,
                           const std::string& outputRaster,
                           double thresholdValue,
                           double aboveValue,
                           double belowValue,
                           bool invert,
                           bool overwrite);

// Phase 3B: Critical Geospatial Tools
int tools_raster_reclassify(const std::string& inputRaster,
                            const std::string& outputRaster,
                            const std::string& reclassRules,
                            const std::string& outputType,
                            bool overwrite);

int tools_raster_boolean(const std::string& inputsStr,
                        const std::string& operation,
                        const std::string& outputRaster,
                        bool overwrite);

int tools_vector_to_raster(const std::string& inputVector,
                           const std::string& outputRaster,
                           const std::string& attribute,
                           double resolution,
                           const std::string& extent,
                           const std::string& burnValue,
                           const std::string& outputType,
                           bool overwrite);

int tools_raster_proximity(const std::string& inputRaster,
                           const std::string& outputRaster,
                           const std::string& values,
                           double maxDistance,
                           const std::string& distUnits,
                           bool overwrite);

// Phase 3C: High Priority Tools
int tools_vector_buffer(const std::string& inputVector,
                       const std::string& outputVector,
                       double distance,
                       int segments,
                       const std::string& endCapStyle,
                       bool dissolve,
                       bool overwrite);

int tools_raster_extract_by_mask(const std::string& inputRaster,
                                 const std::string& maskVector,
                                 const std::string& outputRaster,
                                 bool crop,
                                 bool overwrite);

// Phase 3D: Medium Priority Tools
int tools_raster_hillshade(const std::string& inputDEM,
                           const std::string& outputRaster,
                           double azimuth,
                           double altitude,
                           double zFactor,
                           bool overwrite);

int tools_raster_tri(const std::string& inputDEM,
                    const std::string& outputRaster,
                    bool overwrite);

// Perplexity AI Integration
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
                            bool citations);

} // namespace agrs::tools


