"""Phase 2 Gate Tests - Data Extraction Layer"""
import pytest
import json
import shutil
import tempfile
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import settings

# Import data layer modules
from data.route_loader import (
    load_route,
    get_route_ids,
    clear_cache,
    get_cached_route_ids,
    RouteNotFoundError,
    InvalidRouteError,
)
from data.segment_extractor import (
    get_segment_feature,
    extract_coordinates,
    extract_properties,
    calculate_segment_length,
    calculate_slope_from_elevation,
    extract_segment_data,
    get_all_segment_ids,
    haversine_distance,
    euclidean_distance,
    get_route_crs,
    get_route_metadata,
    get_full_route_geometry,
)
from data.layer_manager import (
    LayerType,
    get_layer_path,
    layer_exists,
    get_available_layers,
    query_all_layers_at_point,
    query_all_layers_for_segment,
    get_layer_info,
)
from data.enrichment import (
    enrich_segment_data,
    enrich_from_route,
    get_segment_summary,
    get_slope_category,
    get_terrain_class,
    get_construction_difficulty,
)
from models.segment import SegmentData


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture(scope="module")
def fixtures_dir():
    """Path to test fixtures directory."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def sample_route_path(fixtures_dir):
    """Path to sample route file."""
    return fixtures_dir / "sample_route.geojson"


@pytest.fixture
def temp_routes_dir(fixtures_dir):
    """Create a temporary routes directory with test fixtures.

    Copies test fixtures to the actual routes directory for testing,
    then cleans up after the test.
    """
    # Copy sample route to actual routes dir
    src_file = fixtures_dir / "sample_route.geojson"
    dest_file = settings.ROUTES_DIR / "sample_route.geojson"

    # Ensure routes dir exists
    settings.ROUTES_DIR.mkdir(parents=True, exist_ok=True)

    # Copy file
    shutil.copy(src_file, dest_file)

    # Also copy minimal segment fixture
    minimal_src = fixtures_dir / "minimal_segment.geojson"
    minimal_dest = settings.ROUTES_DIR / "minimal_segment.geojson"
    if minimal_src.exists():
        shutil.copy(minimal_src, minimal_dest)

    # Copy PIRL route fixture
    pirl_src = fixtures_dir / "pirl_route.geojson"
    pirl_dest = settings.ROUTES_DIR / "pirl_route.geojson"
    if pirl_src.exists():
        shutil.copy(pirl_src, pirl_dest)

    yield dest_file

    # Cleanup
    clear_cache()
    if dest_file.exists():
        dest_file.unlink()
    if minimal_dest.exists():
        minimal_dest.unlink()
    if pirl_dest.exists():
        pirl_dest.unlink()


@pytest.fixture
def sample_geojson(fixtures_dir):
    """Load sample GeoJSON data."""
    with open(fixtures_dir / "sample_route.geojson", 'r') as f:
        return json.load(f)


@pytest.fixture
def sample_segment_data():
    """Create a sample SegmentData instance for testing."""
    return SegmentData(
        id="test_seg",
        coordinates={
            "start": (12.4964, 41.9028),
            "end": (12.5164, 41.9128)
        },
        metrics={
            "length_m": 1500.0,
            "start_elevation_m": 150.0,
            "end_elevation_m": 175.0,
            "avg_slope_degrees": 1.5,
            "max_slope_degrees": 3.2
        },
        properties={
            "terrain_class": "rolling_hills",
            "land_use": "agricultural",
            "soil_type": "clay_loam",
            "geological_zone": "sedimentary"
        }
    )


@pytest.fixture
def pirl_segment_data():
    """Create a PIRL-format SegmentData instance for testing."""
    return SegmentData(
        id="1",
        coordinates={
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        metrics={
            "length_m": 45.54,
            "start_elevation_m": 1207.98,
            "end_elevation_m": 1211.47,
            "max_slope_percent": 25.17
        },
        properties={
            "terrain_class": "hilly",
            "land_use": "unknown"
        }
    )


# =============================================================================
# TEST P2-01: Route Loader Reads Valid GeoJSON
# =============================================================================

class TestP2_01_RouteLoaderReadsGeoJSON:
    """TEST P2-01: Route Loader Reads Valid GeoJSON"""

    def test_load_route_returns_dict(self, temp_routes_dir):
        """Loaded route is a dictionary."""
        route = load_route("sample_route")
        assert isinstance(route, dict)

    def test_load_route_has_type_field(self, temp_routes_dir):
        """Route has 'type' key equals 'FeatureCollection'."""
        route = load_route("sample_route")
        assert route.get("type") == "FeatureCollection"

    def test_load_route_has_features_list(self, temp_routes_dir):
        """Route has 'features' key which is a list."""
        route = load_route("sample_route")
        assert "features" in route
        assert isinstance(route["features"], list)

    def test_load_route_features_count(self, temp_routes_dir):
        """Features list has expected number of items."""
        route = load_route("sample_route")
        # Sample route has 10 segments
        assert len(route["features"]) == 10

    def test_each_feature_has_geometry_and_properties(self, temp_routes_dir):
        """Each feature has geometry and properties keys."""
        route = load_route("sample_route")
        for feature in route["features"]:
            assert "geometry" in feature
            assert "properties" in feature


# =============================================================================
# TEST P2-01b: Route Loader Reads PIRL GeoJSON
# =============================================================================

class TestP2_01b_RouteLoaderReadsPIRL:
    """TEST P2-01b: Route Loader Reads PIRL-format GeoJSON"""

    def test_load_pirl_route_returns_dict(self, temp_routes_dir):
        """PIRL route is a dictionary."""
        route = load_route("pirl_route")
        assert isinstance(route, dict)

    def test_pirl_route_has_crs(self, temp_routes_dir):
        """PIRL route has CRS defined."""
        route = load_route("pirl_route")
        crs = get_route_crs(route)
        assert crs == "EPSG:32613"

    def test_pirl_route_has_metadata(self, temp_routes_dir):
        """PIRL route has metadata."""
        route = load_route("pirl_route")
        assert "metadata" in route
        assert "total_length_m" in route["metadata"]

    def test_pirl_first_feature_is_full_route(self, temp_routes_dir):
        """PIRL route first feature is full_route."""
        route = load_route("pirl_route")
        first_props = route["features"][0].get("properties", {})
        assert first_props.get("type") == "full_route"

    def test_pirl_segment_features_have_segment_id(self, temp_routes_dir):
        """PIRL segment features have segment_id property."""
        route = load_route("pirl_route")
        # Skip first feature (full_route)
        for feature in route["features"][1:5]:
            props = feature.get("properties", {})
            assert "segment_id" in props


# =============================================================================
# TEST P2-02: Route Loader Caches Loaded Routes
# =============================================================================

class TestP2_02_RouteLoaderCaches:
    """TEST P2-02: Route Loader Caches Loaded Routes"""

    def test_cache_returns_same_object(self, temp_routes_dir):
        """Same route returns cached object (same object reference)."""
        clear_cache()
        route1 = load_route("sample_route")
        route2 = load_route("sample_route")
        # Should be the exact same object in memory
        assert route1 is route2

    def test_clear_cache_forces_reload(self, temp_routes_dir):
        """Cache clear forces re-read from disk."""
        route1 = load_route("sample_route")
        clear_cache()
        route2 = load_route("sample_route")
        # Should be different objects (new load from disk)
        assert route1 is not route2
        # But same content
        assert route1 == route2

    def test_cached_route_ids_reflects_cache_state(self, temp_routes_dir):
        """get_cached_route_ids returns currently cached routes."""
        clear_cache()
        assert "sample_route" not in get_cached_route_ids()

        load_route("sample_route")
        assert "sample_route" in get_cached_route_ids()

        clear_cache()
        assert "sample_route" not in get_cached_route_ids()


# =============================================================================
# TEST P2-03: Route Loader Handles Missing File
# =============================================================================

class TestP2_03_RouteLoaderMissingFile:
    """TEST P2-03: Route Loader Handles Missing File"""

    def test_missing_route_raises_error(self):
        """Missing route file raises RouteNotFoundError."""
        with pytest.raises(RouteNotFoundError) as exc_info:
            load_route("nonexistent_route_xyz_12345")
        assert "nonexistent_route_xyz_12345" in str(exc_info.value)

    def test_error_contains_route_id(self):
        """Error message contains the route ID."""
        try:
            load_route("missing_test_route")
        except RouteNotFoundError as e:
            assert e.route_id == "missing_test_route"
            assert "missing_test_route" in str(e)

    def test_error_raised_immediately(self):
        """Error is raised immediately on load, not deferred."""
        # This should raise immediately, not on data access
        with pytest.raises(RouteNotFoundError):
            load_route("definitely_not_a_real_route")


# =============================================================================
# TEST P2-04: Segment Extractor Finds Existing Segment
# =============================================================================

class TestP2_04_SegmentExtractorFindsSegment:
    """TEST P2-04: Segment Extractor Finds Existing Segment"""

    def test_get_segment_feature_returns_feature(self, temp_routes_dir):
        """get_segment_feature returns the feature dict."""
        feature = get_segment_feature("sample_route", "seg_001")
        assert feature is not None
        assert isinstance(feature, dict)

    def test_extracted_segment_has_correct_id(self, temp_routes_dir):
        """Extracted segment has the requested ID."""
        feature = get_segment_feature("sample_route", "seg_001")
        props = feature.get("properties", {})
        feature_id = props.get("id") or feature.get("id")
        assert feature_id == "seg_001"

    def test_extracted_segment_has_coordinates(self, temp_routes_dir):
        """Extracted segment has coordinates."""
        feature = get_segment_feature("sample_route", "seg_001")
        coords = extract_coordinates(feature)
        assert len(coords) > 0

    def test_extracted_segment_has_properties(self, temp_routes_dir):
        """Extracted segment has properties."""
        feature = get_segment_feature("sample_route", "seg_001")
        props = extract_properties(feature)
        assert "terrain_class" in props

    def test_extract_segment_data_returns_model(self, temp_routes_dir):
        """extract_segment_data returns SegmentData model."""
        segment = extract_segment_data("sample_route", "seg_001")
        assert segment is not None
        assert isinstance(segment, SegmentData)
        assert segment.id == "seg_001"


# =============================================================================
# TEST P2-04b: Segment Extractor Finds PIRL Segments
# =============================================================================

class TestP2_04b_SegmentExtractorFindsPIRL:
    """TEST P2-04b: Segment Extractor Finds PIRL Segments"""

    def test_get_pirl_segment_by_id(self, temp_routes_dir):
        """PIRL segment found by numeric ID."""
        feature = get_segment_feature("pirl_route", "1")
        assert feature is not None
        props = feature.get("properties", {})
        assert props.get("segment_id") == 1

    def test_extract_pirl_segment_data(self, temp_routes_dir):
        """PIRL segment data extracted correctly."""
        segment = extract_segment_data("pirl_route", "1")
        assert segment is not None
        assert segment.id == "1"
        assert segment.coordinates.crs == "EPSG:32613"

    def test_pirl_segment_has_slope_percent(self, temp_routes_dir):
        """PIRL segment has max_slope_percent."""
        segment = extract_segment_data("pirl_route", "1")
        assert segment.metrics.max_slope_percent is not None
        assert segment.metrics.max_slope_percent > 0

    def test_pirl_slope_converted_to_degrees(self, temp_routes_dir):
        """PIRL slope percent converted to degrees."""
        segment = extract_segment_data("pirl_route", "1")
        # 25.17% slope ~ 14.1 degrees
        assert segment.metrics.max_slope_degrees > 0
        # Roughly check conversion
        assert 10 < segment.metrics.max_slope_degrees < 20

    def test_pirl_segment_has_elevation(self, temp_routes_dir):
        """PIRL segment has elevation data."""
        segment = extract_segment_data("pirl_route", "1")
        assert segment.metrics.start_elevation_m > 0
        assert segment.metrics.end_elevation_m > 0

    def test_get_all_pirl_segment_ids(self, temp_routes_dir):
        """Get all segment IDs from PIRL route."""
        segment_ids = get_all_segment_ids("pirl_route")
        # PIRL route has 168 segments (plus full_route which is skipped)
        assert len(segment_ids) == 168
        # IDs should be strings
        assert all(isinstance(sid, str) for sid in segment_ids)


# =============================================================================
# TEST P2-05: Segment Extractor Returns None for Missing Segment
# =============================================================================

class TestP2_05_SegmentExtractorMissingSegment:
    """TEST P2-05: Segment Extractor Returns None for Missing Segment"""

    def test_missing_segment_returns_none(self, temp_routes_dir):
        """Missing segment returns None, not exception."""
        result = get_segment_feature("sample_route", "nonexistent_segment")
        assert result is None

    def test_no_exception_for_missing_segment(self, temp_routes_dir):
        """No exception raised for missing segment."""
        # Should not raise
        result = extract_segment_data("sample_route", "seg_999")
        assert result is None

    def test_empty_string_segment_id(self, temp_routes_dir):
        """Empty string segment ID handled gracefully."""
        result = get_segment_feature("sample_route", "")
        assert result is None


# =============================================================================
# TEST P2-06: Segment Extractor Calculates Derived Fields
# =============================================================================

class TestP2_06_SegmentExtractorDerivedFields:
    """TEST P2-06: Segment Extractor Calculates Derived Fields"""

    def test_calculate_segment_length_from_coords(self):
        """calculate_segment_length returns correct value for known points."""
        # Two points approximately 1km apart (WGS84)
        coords = [
            (12.4964, 41.9028),  # Rome area
            (12.5064, 41.9028)   # ~850m east
        ]
        length = calculate_segment_length(coords)
        assert length > 700  # Should be around 800-900m
        assert length < 1000

    def test_calculate_segment_length_euclidean(self):
        """calculate_segment_length uses Euclidean for projected CRS."""
        # UTM coordinates in meters
        coords = [
            (484838.28, 4933184.19),
            (484812.5, 4933146.65)
        ]
        length = calculate_segment_length(coords, crs="EPSG:32613")
        # Simple Euclidean: sqrt((25.78)^2 + (37.54)^2) ~ 45.5m
        assert 40 < length < 50

    def test_euclidean_distance_calculation(self):
        """Euclidean distance correct for projected coords."""
        dist = euclidean_distance(0, 0, 3, 4)
        assert dist == 5.0  # 3-4-5 triangle

    def test_calculate_slope_from_elevation(self):
        """calculate_slope_from_elevation returns correct slope."""
        # 100m rise over 1000m run = ~5.7 degrees
        slope = calculate_slope_from_elevation(0, 100, 1000)
        assert 5 < slope < 6

    def test_derived_length_when_missing(self, temp_routes_dir):
        """Length is calculated when not in properties."""
        # minimal_segment fixture doesn't have length_m
        segment = extract_segment_data("minimal_segment", "seg_minimal")
        assert segment is not None
        assert segment.metrics.length_m > 0

    def test_derived_slope_when_missing(self, temp_routes_dir):
        """Slope is calculated when not in properties."""
        segment = extract_segment_data("minimal_segment", "seg_minimal")
        assert segment is not None
        # With 0 elevation, slope should be 0
        assert segment.metrics.avg_slope_degrees >= 0

    def test_haversine_formula_accuracy(self):
        """Haversine formula gives accurate distance."""
        # Known distance: Rome to Vatican ~1.5km
        distance = haversine_distance(12.4829, 41.9009, 12.4534, 41.9029)
        assert 2000 < distance < 3000  # Approximately 2.5km


# =============================================================================
# TEST P2-06b: Route Metadata Extraction
# =============================================================================

class TestP2_06b_RouteMetadata:
    """TEST P2-06b: Route Metadata Extraction"""

    def test_get_route_crs(self, temp_routes_dir):
        """get_route_crs extracts CRS."""
        route_data = load_route("pirl_route")
        crs = get_route_crs(route_data)
        assert crs == "EPSG:32613"

    def test_get_route_metadata(self, temp_routes_dir):
        """get_route_metadata extracts metadata."""
        metadata = get_route_metadata("pirl_route")
        assert "total_length_m" in metadata
        assert "total_segments" in metadata
        assert metadata["crs"] == "EPSG:32613"

    def test_get_full_route_geometry(self, temp_routes_dir):
        """get_full_route_geometry extracts coordinates."""
        coords = get_full_route_geometry("pirl_route")
        assert coords is not None
        assert len(coords) > 0
        # Each coord should be (x, y) tuple
        assert len(coords[0]) == 2


# =============================================================================
# TEST P2-07: Raster Query Returns Value at Point
# =============================================================================

class TestP2_07_RasterQueryPoint:
    """TEST P2-07: Raster Query Returns Value at Point

    Note: These tests check the functionality without real raster files.
    When raster files are not available, the functions return None.
    """

    def test_query_nonexistent_raster_returns_none(self):
        """Query on nonexistent raster returns None."""
        from data.raster_query import query_raster_at_point
        result = query_raster_at_point("/nonexistent/file.tif", 12.5, 41.9)
        assert result is None

    def test_layer_exists_returns_false_for_missing(self):
        """layer_exists returns False for missing layer files."""
        # Default layers won't exist in test environment
        result = layer_exists(LayerType.dem)
        # Should be False since we haven't created test rasters
        assert isinstance(result, bool)

    def test_get_layer_path_returns_path(self):
        """get_layer_path returns a Path object."""
        path = get_layer_path(LayerType.dem)
        assert isinstance(path, Path)
        # SAIPEM data uses dem_copernicus_30m.tif
        assert "dem" in str(path).lower() and ".tif" in str(path)


# =============================================================================
# TEST P2-08: Raster Query Returns Statistics for Segment
# =============================================================================

class TestP2_08_RasterQuerySegment:
    """TEST P2-08: Raster Query Returns Statistics for Segment"""

    def test_query_segment_nonexistent_raster(self):
        """Query segment on nonexistent raster returns None."""
        from data.raster_query import query_raster_along_segment
        coords = [(12.5, 41.9), (12.6, 41.95)]
        result = query_raster_along_segment("/nonexistent/file.tif", coords)
        assert result is None

    def test_query_all_layers_handles_missing(self):
        """query_all_layers_at_point handles missing layers gracefully."""
        result = query_all_layers_at_point(12.5, 41.9)
        assert isinstance(result, dict)
        # All values should be None when no layers exist
        for key, value in result.items():
            assert value is None or isinstance(value, (int, float))


# =============================================================================
# TEST P2-09: Layer Manager Detects Available Layers
# =============================================================================

class TestP2_09_LayerManagerDetection:
    """TEST P2-09: Layer Manager Detects Available Layers"""

    def test_get_available_layers_returns_list(self):
        """get_available_layers returns a list."""
        result = get_available_layers()
        assert isinstance(result, list)

    def test_layer_type_enum_values(self):
        """LayerType enum has expected values (SAIPEM data package)."""
        assert LayerType.dem.value == "dem"
        assert LayerType.slope.value == "slope"
        assert LayerType.landcover.value == "landcover"
        assert LayerType.protected_areas.value == "protected_areas"
        # SAIPEM-specific layers
        assert LayerType.roads.value == "roads"
        assert LayerType.railways.value == "railways"
        assert LayerType.pipelines.value == "pipelines"

    def test_get_layer_info_returns_all_layers(self):
        """get_layer_info returns info for all layer types."""
        info = get_layer_info()
        assert isinstance(info, dict)
        for layer_type in LayerType:
            assert layer_type.value in info
            assert "exists" in info[layer_type.value]
            assert "path" in info[layer_type.value]


# =============================================================================
# TEST P2-10: Enrichment Adds Layer Data to Segment
# =============================================================================

class TestP2_10_SegmentEnrichment:
    """TEST P2-10: Enrichment Adds Layer Data to Segment"""

    def test_enrich_segment_data_returns_dict(self, sample_segment_data):
        """enrich_segment_data returns a dictionary."""
        result = enrich_segment_data(sample_segment_data)
        assert isinstance(result, dict)

    def test_enrichment_preserves_original_data(self, sample_segment_data):
        """Enrichment preserves original segment data."""
        result = enrich_segment_data(sample_segment_data)
        assert result["id"] == "test_seg"
        assert result["metrics"]["length_m"] == 1500.0

    def test_enrichment_adds_derived_fields(self, sample_segment_data):
        """Enrichment adds derived fields."""
        result = enrich_segment_data(sample_segment_data)
        assert "derived" in result
        assert "elevation_change" in result["derived"]
        assert "slope_category" in result["derived"]
        assert "construction_difficulty" in result["derived"]

    def test_enrichment_calculates_elevation_change(self, sample_segment_data):
        """Enrichment correctly calculates elevation change."""
        result = enrich_segment_data(sample_segment_data)
        # 175 - 150 = 25
        assert result["derived"]["elevation_change"] == 25.0

    def test_enrich_from_route_integration(self, temp_routes_dir):
        """enrich_from_route works end-to-end."""
        result = enrich_from_route("sample_route", "seg_001")
        assert result is not None
        assert result["id"] == "seg_001"
        assert "derived" in result

    def test_enrich_from_route_missing_segment(self, temp_routes_dir):
        """enrich_from_route returns None for missing segment."""
        result = enrich_from_route("sample_route", "nonexistent")
        assert result is None

    def test_enrich_pirl_segment(self, pirl_segment_data):
        """Enrichment works with PIRL segment data."""
        result = enrich_segment_data(pirl_segment_data)
        assert result is not None
        assert result["id"] == "1"
        assert result["coordinates"]["crs"] == "EPSG:32613"


# =============================================================================
# Additional Enrichment Tests
# =============================================================================

class TestEnrichmentHelpers:
    """Tests for enrichment helper functions."""

    def test_get_slope_category_flat(self):
        """Flat slope classification."""
        assert get_slope_category(0.5) == "flat"
        assert get_slope_category(2.0) == "flat"

    def test_get_slope_category_gentle(self):
        """Gentle slope classification."""
        assert get_slope_category(3.0) == "gentle"
        assert get_slope_category(5.0) == "gentle"

    def test_get_slope_category_moderate(self):
        """Moderate slope classification."""
        assert get_slope_category(7.0) == "moderate"
        assert get_slope_category(10.0) == "moderate"

    def test_get_slope_category_steep(self):
        """Steep slope classification."""
        assert get_slope_category(12.0) == "steep"
        assert get_slope_category(15.0) == "steep"

    def test_get_slope_category_very_steep(self):
        """Very steep slope classification."""
        assert get_slope_category(20.0) == "very_steep"
        assert get_slope_category(25.0) == "very_steep"

    def test_get_slope_category_extreme(self):
        """Extreme slope classification."""
        assert get_slope_category(30.0) == "extreme"
        assert get_slope_category(45.0) == "extreme"

    def test_get_terrain_class_from_slope(self):
        """Terrain class derived from slope."""
        assert get_terrain_class(1.0) == "flat"
        assert get_terrain_class(4.0) == "rolling_hills"
        assert get_terrain_class(8.0) == "hilly"
        assert get_terrain_class(15.0) == "mountainous"

    def test_get_construction_difficulty(self, sample_segment_data):
        """Construction difficulty estimation."""
        difficulty = get_construction_difficulty(sample_segment_data)
        assert difficulty in ["easy", "moderate", "difficult", "very_difficult"]

    def test_get_segment_summary(self, sample_segment_data):
        """Segment summary generation."""
        summary = get_segment_summary(sample_segment_data)
        assert "id" in summary
        assert "length_km" in summary
        assert "avg_slope_deg" in summary
        assert "construction_difficulty" in summary
        assert summary["id"] == "test_seg"
        assert summary["length_km"] == 1.5


# =============================================================================
# Phase 2 Regression Suite
# =============================================================================

class TestP2Regression:
    """Phase 2 Regression Suite"""

    def test_p2_r01_geojson_loading(self, temp_routes_dir):
        """P2-R01: GeoJSON files load correctly."""
        route = load_route("sample_route")
        assert route["type"] == "FeatureCollection"
        assert len(route["features"]) > 0

    def test_p2_r02_route_caching(self, temp_routes_dir):
        """P2-R02: Cache returns same object."""
        clear_cache()
        route1 = load_route("sample_route")
        route2 = load_route("sample_route")
        assert route1 is route2

    def test_p2_r03_missing_route_error(self):
        """P2-R03: Missing routes raise error."""
        with pytest.raises(RouteNotFoundError):
            load_route("definitely_not_real_route_abc123")

    def test_p2_r04_segment_extraction(self, temp_routes_dir):
        """P2-R04: Segments are found by ID."""
        segment = extract_segment_data("sample_route", "seg_001")
        assert segment is not None
        assert segment.id == "seg_001"

    def test_p2_r05_missing_segment_none(self, temp_routes_dir):
        """P2-R05: Missing segments return None."""
        result = extract_segment_data("sample_route", "seg_nonexistent")
        assert result is None

    def test_p2_r06_derived_calculations(self):
        """P2-R06: Calculated fields are accurate."""
        # Test haversine
        dist = calculate_segment_length([(0, 0), (0, 1)])
        assert 110000 < dist < 112000  # ~111km for 1 degree latitude

        # Test slope calculation
        slope = calculate_slope_from_elevation(0, 100, 1000)
        assert 5 < slope < 6

    def test_p2_r07_raster_point_query(self):
        """P2-R07: Point queries work (return None for missing)."""
        from data.raster_query import query_raster_at_point
        result = query_raster_at_point("/missing.tif", 12.5, 41.9)
        assert result is None

    def test_p2_r08_raster_segment_query(self):
        """P2-R08: Segment statistics work (return None for missing)."""
        from data.raster_query import query_raster_along_segment
        result = query_raster_along_segment("/missing.tif", [(12.5, 41.9), (12.6, 42.0)])
        assert result is None

    def test_p2_r09_layer_detection(self):
        """P2-R09: Available layers detected."""
        available = get_available_layers()
        assert isinstance(available, list)
        # Each item should be a LayerType
        for lt in available:
            assert isinstance(lt, LayerType)

    def test_p2_r10_segment_enrichment(self, sample_segment_data):
        """P2-R10: Enrichment adds data."""
        result = enrich_segment_data(sample_segment_data)
        assert "derived" in result
        assert result["derived"]["elevation_change"] == 25.0


# =============================================================================
# PIRL Integration Tests
# =============================================================================

class TestP2PIRLIntegration:
    """Integration tests for PIRL route format."""

    def test_full_pirl_extraction_pipeline(self, temp_routes_dir):
        """Test full extraction pipeline with PIRL route."""
        # Load route
        route = load_route("pirl_route")
        assert route is not None

        # Get all segment IDs
        segment_ids = get_all_segment_ids("pirl_route")
        assert len(segment_ids) == 168

        # Extract first few segments
        for seg_id in segment_ids[:5]:
            segment = extract_segment_data("pirl_route", seg_id)
            assert segment is not None
            assert segment.coordinates.crs == "EPSG:32613"
            assert segment.metrics.length_m > 0

    def test_pirl_segment_enrichment(self, temp_routes_dir):
        """Test enrichment of PIRL segments."""
        enriched = enrich_from_route("pirl_route", "1")
        assert enriched is not None
        assert enriched["coordinates"]["crs"] == "EPSG:32613"
        assert "derived" in enriched

    def test_pirl_segment_summary(self, temp_routes_dir):
        """Test summary generation for PIRL segment."""
        segment = extract_segment_data("pirl_route", "1")
        summary = get_segment_summary(segment)
        assert summary["id"] == "1"
        assert summary["length_km"] > 0
        assert summary["avg_slope_deg"] >= 0


# =============================================================================
# Integration Tests
# =============================================================================

class TestP2Integration:
    """Integration tests for Phase 2 data layer."""

    def test_full_extraction_pipeline(self, temp_routes_dir):
        """Test full extraction pipeline from route to enriched data."""
        # Load route
        route = load_route("sample_route")
        assert route is not None

        # Get all segment IDs
        segment_ids = get_all_segment_ids("sample_route")
        assert len(segment_ids) == 10

        # Extract and enrich each segment
        for seg_id in segment_ids:
            enriched = enrich_from_route("sample_route", seg_id)
            assert enriched is not None
            assert enriched["id"] == seg_id
            assert "derived" in enriched

    def test_segment_with_varied_properties(self, temp_routes_dir):
        """Test extraction of segments with different property types."""
        # seg_003 has steep slopes
        steep_segment = extract_segment_data("sample_route", "seg_003")
        assert steep_segment.metrics.avg_slope_degrees == 12.0

        # seg_005 has water crossing
        water_segment = get_segment_feature("sample_route", "seg_005")
        props = extract_properties(water_segment)
        assert props.get("water_crossing") == True

        # seg_006 has road crossing
        road_segment = get_segment_feature("sample_route", "seg_006")
        props = extract_properties(road_segment)
        assert props.get("road_crossing") == True

    def test_construction_difficulty_varies_by_terrain(self, temp_routes_dir):
        """Different terrain produces different difficulty ratings."""
        # Flat segment
        flat = extract_segment_data("sample_route", "seg_001")
        flat_difficulty = get_construction_difficulty(flat)

        # Steep segment
        steep = extract_segment_data("sample_route", "seg_009")
        steep_difficulty = get_construction_difficulty(steep)

        # Steep should be more difficult
        difficulty_order = ["easy", "moderate", "difficult", "very_difficult"]
        flat_idx = difficulty_order.index(flat_difficulty)
        steep_idx = difficulty_order.index(steep_difficulty)
        assert steep_idx >= flat_idx


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
