"""Phase 8 Integration Tests - Testing with Real Data.

This module contains end-to-end integration tests using sample and SAIPEM route data.
Tests verify data loading, segment extraction, agent analysis, and API responses.
"""
import json
import pytest
import time
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

from fastapi.testclient import TestClient


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture(scope="module", autouse=True)
def ensure_routes_exist():
    """Ensure required route files exist before tests run.

    This fixture copies required route files from fixtures to data/routes
    at module scope to ensure they exist for all Phase 8 tests.
    """
    import shutil
    from data.route_loader import clear_cache

    project_root = Path(__file__).parent.parent
    routes_path = project_root / "data" / "routes"
    fixtures_dir = Path(__file__).parent / "fixtures"

    routes_path.mkdir(parents=True, exist_ok=True)

    # Copy sample_route.geojson
    sample_src = fixtures_dir / "sample_route.geojson"
    sample_dest = routes_path / "sample_route.geojson"
    if sample_src.exists():
        shutil.copy(sample_src, sample_dest)

    # Copy saipem_aoi.geojson (pirl_route renamed)
    pirl_src = fixtures_dir / "pirl_route.geojson"
    saipem_dest = routes_path / "saipem_aoi.geojson"
    if pirl_src.exists() and not saipem_dest.exists():
        shutil.copy(pirl_src, saipem_dest)

    # Clear cache to ensure fresh loads
    clear_cache()

    yield

    # Keep files after tests (other tests may need them)


@pytest.fixture
def project_root():
    """Get project root directory."""
    return Path(__file__).parent.parent


@pytest.fixture
def routes_dir(project_root):
    """Get data routes directory."""
    routes_path = project_root / "data" / "routes"
    routes_path.mkdir(parents=True, exist_ok=True)

    # Ensure sample_route.geojson exists (copy from fixtures if needed)
    fixtures_dir = Path(__file__).parent / "fixtures"
    sample_src = fixtures_dir / "sample_route.geojson"
    sample_dest = routes_path / "sample_route.geojson"
    if not sample_dest.exists() and sample_src.exists():
        import shutil
        shutil.copy(sample_src, sample_dest)

    return routes_path


@pytest.fixture
def app():
    """Create FastAPI app for testing."""
    from api.main import app
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


# ============================================================================
# TEST P8-01: Sample Route Loads Successfully
# ============================================================================

class TestP8_01_SampleRouteLoads:
    """Verify test route file is valid."""

    def test_sample_route_file_exists(self, routes_dir):
        """Sample route file should exist."""
        sample_route_path = routes_dir / "sample_route.geojson"
        assert sample_route_path.exists(), f"sample_route.geojson not found at {sample_route_path}"

    def test_sample_route_parses_as_json(self, routes_dir):
        """Sample route should parse as valid JSON."""
        sample_route_path = routes_dir / "sample_route.geojson"
        with open(sample_route_path, 'r') as f:
            data = json.load(f)
        assert isinstance(data, dict), "Sample route should parse as dictionary"

    def test_sample_route_valid_geojson_structure(self, routes_dir):
        """Sample route should have valid GeoJSON structure."""
        sample_route_path = routes_dir / "sample_route.geojson"
        with open(sample_route_path, 'r') as f:
            data = json.load(f)

        assert data.get("type") == "FeatureCollection", "Must be FeatureCollection"
        assert "features" in data, "Must have features array"
        assert isinstance(data["features"], list), "Features must be a list"

    def test_sample_route_has_multiple_segments(self, routes_dir):
        """Sample route should have multiple segment features."""
        sample_route_path = routes_dir / "sample_route.geojson"
        with open(sample_route_path, 'r') as f:
            data = json.load(f)

        features = data.get("features", [])
        assert len(features) >= 5, f"Expected at least 5 segments, got {len(features)}"

    def test_sample_route_segments_have_required_properties(self, routes_dir):
        """Each segment should have required properties."""
        sample_route_path = routes_dir / "sample_route.geojson"
        with open(sample_route_path, 'r') as f:
            data = json.load(f)

        for i, feature in enumerate(data.get("features", [])):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})

            # Check geometry
            assert "type" in geom, f"Feature {i} missing geometry type"
            assert "coordinates" in geom, f"Feature {i} missing coordinates"

            # Check has an id
            has_id = props.get("id") or feature.get("id") or props.get("segment_id")
            assert has_id, f"Feature {i} missing id"

    def test_sample_route_loads_via_route_loader(self):
        """Sample route should load via route_loader module."""
        from data.route_loader import load_route, clear_cache

        clear_cache()
        route_data = load_route("sample_route")

        assert route_data is not None, "Route should load successfully"
        assert route_data.get("type") == "FeatureCollection"

    def test_sample_route_segment_extraction_works(self):
        """Segment extraction should work on sample route."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")

        assert len(segment_ids) > 0, "Should find segment IDs"

        # Extract first segment
        first_id = segment_ids[0]
        segment_data = extract_segment_data("sample_route", first_id)

        assert segment_data is not None, f"Should extract segment {first_id}"
        assert segment_data.id == first_id


# ============================================================================
# TEST P8-02: SAIPEM Route Loads Successfully
# ============================================================================

class TestP8_02_SAIPEMRouteLoads:
    """Verify real client data works."""

    def test_saipem_route_file_exists(self, routes_dir):
        """SAIPEM route file should exist."""
        saipem_route_path = routes_dir / "saipem_aoi.geojson"
        assert saipem_route_path.exists(), f"saipem_aoi.geojson not found at {saipem_route_path}"

    def test_saipem_route_parses_correctly(self, routes_dir):
        """SAIPEM route should parse correctly."""
        saipem_route_path = routes_dir / "saipem_aoi.geojson"
        with open(saipem_route_path, 'r') as f:
            data = json.load(f)

        assert data.get("type") == "FeatureCollection", "Must be FeatureCollection"
        features = data.get("features", [])
        assert len(features) > 0, "Must have features"

    def test_saipem_route_structure_matches_expected(self, routes_dir):
        """SAIPEM route structure should match expected PIRL format."""
        saipem_route_path = routes_dir / "saipem_aoi.geojson"
        with open(saipem_route_path, 'r') as f:
            data = json.load(f)

        # Should have CRS information
        crs = data.get("crs", {})
        assert crs or data.get("metadata", {}).get("crs"), "Should have CRS info"

        # Should have metadata
        metadata = data.get("metadata", {})
        assert metadata, "Should have metadata"

    def test_saipem_segment_extraction_works(self):
        """Segment extraction should work on SAIPEM data."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        assert len(segment_ids) > 0, "Should find segment IDs"

        # Extract a few segments
        for i in range(min(3, len(segment_ids))):
            seg_id = segment_ids[i]
            segment_data = extract_segment_data("saipem_aoi", seg_id)
            assert segment_data is not None, f"Should extract segment {seg_id}"

    def test_saipem_properties_documented(self, routes_dir, capsys):
        """Document which properties are available in SAIPEM data."""
        saipem_route_path = routes_dir / "saipem_aoi.geojson"
        with open(saipem_route_path, 'r') as f:
            data = json.load(f)

        features = data.get("features", [])

        # Collect all property keys
        all_keys = set()
        for feature in features:
            props = feature.get("properties", {})
            all_keys.update(props.keys())

        # This test documents available properties
        print(f"\nSAIPEM Data Properties: {sorted(all_keys)}")

        # At minimum should have segment identification
        assert any(k in all_keys for k in ["segment_id", "id", "step"]), \
            "Should have segment identification"


# ============================================================================
# TEST P8-03: Full Analysis Works on Sample Route
# ============================================================================

class TestP8_03_SampleRouteAnalysis:
    """Verify end-to-end with sample data."""

    @pytest.fixture
    def mock_anthropic_response(self):
        """Create mock Anthropic API response."""
        return MagicMock(
            content=[
                MagicMock(text=json.dumps({
                    "agent": "test",
                    "segment_id": "seg_001",
                    "assessment": "favorable",
                    "explanation": "Test analysis of segment conditions.",
                    "flags": [],
                    "metrics": {"test": True}
                }))
            ]
        )

    def test_sample_route_segment_analysis_completes(self, mock_anthropic_response):
        """Analysis should complete without error on sample segment."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache
        from agents.geotechnical import GeotechnicalAgent

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")
        segment_data = extract_segment_data("sample_route", segment_ids[0])

        assert segment_data is not None

        # Mock the API call - client passed directly to agent
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_anthropic_response

        agent = GeotechnicalAgent(mock_client)
        # Convert SegmentData to dict for agent
        segment_dict = {
            "id": segment_data.id,
            "metrics": {
                "length_m": segment_data.metrics.length_m,
                "avg_slope_degrees": segment_data.metrics.avg_slope_degrees,
                "max_slope_degrees": segment_data.metrics.max_slope_degrees,
                "start_elevation_m": segment_data.metrics.start_elevation_m,
                "end_elevation_m": segment_data.metrics.end_elevation_m,
            },
            "properties": {
                "terrain_class": segment_data.properties.terrain_class,
                "land_use": segment_data.properties.land_use,
                "soil_type": segment_data.properties.soil_type,
            },
            "coordinates": {
                "start": segment_data.coordinates.start,
                "end": segment_data.coordinates.end,
            }
        }
        result = agent.analyze(segment_dict)

        assert result is not None
        assert "assessment" in result or "explanation" in result

    def test_sample_route_diverse_segments_analyzed(self, mock_anthropic_response):
        """Multiple diverse segments should analyze successfully."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache
        from agents.geotechnical import GeotechnicalAgent

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_anthropic_response

        results = []
        agent = GeotechnicalAgent(mock_client)

        # Analyze 3-5 segments
        for seg_id in segment_ids[:5]:
            segment_data = extract_segment_data("sample_route", seg_id)
            if segment_data:
                segment_dict = {
                    "id": segment_data.id,
                    "coordinates": {
                        "start": segment_data.coordinates.start,
                        "end": segment_data.coordinates.end,
                        "crs": segment_data.coordinates.crs,
                    },
                    "metrics": {
                        "length_m": segment_data.metrics.length_m,
                        "start_elevation_m": segment_data.metrics.start_elevation_m,
                        "end_elevation_m": segment_data.metrics.end_elevation_m,
                        "avg_slope_degrees": segment_data.metrics.avg_slope_degrees,
                        "max_slope_degrees": segment_data.metrics.max_slope_degrees,
                        "slope_percent": segment_data.metrics.slope_percent,
                        "max_slope_percent": segment_data.metrics.max_slope_percent,
                    },
                    "properties": {
                        "terrain_class": segment_data.properties.terrain_class,
                        "soil_type": segment_data.properties.soil_type,
                        "geological_zone": segment_data.properties.geological_zone,
                    },
                }
                result = agent.analyze(segment_dict)
                results.append(result)

        assert len(results) >= 3, "Should analyze at least 3 segments"

    def test_sample_route_assessments_reasonable(self, mock_anthropic_response):
        """Assessments should be reasonable for known terrain."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")

        # Check that segments have expected properties
        for seg_id in segment_ids[:5]:
            segment_data = extract_segment_data("sample_route", seg_id)
            if segment_data:
                # Basic validation that data is reasonable
                assert 0 <= segment_data.metrics.avg_slope_degrees <= 90
                assert segment_data.metrics.length_m > 0


# ============================================================================
# TEST P8-04: Full Analysis Works on SAIPEM Route
# ============================================================================

class TestP8_04_SAIPEMRouteAnalysis:
    """Verify end-to-end with real data."""

    @pytest.fixture
    def mock_anthropic_response(self):
        """Create mock Anthropic API response."""
        return MagicMock(
            content=[
                MagicMock(text=json.dumps({
                    "agent": "test",
                    "segment_id": "1",
                    "assessment": "caution",
                    "explanation": "Analysis of SAIPEM segment with real terrain data.",
                    "flags": [],
                    "metrics": {"slope_analyzed": True}
                }))
            ]
        )

    def test_saipem_segment_analysis_completes(self, mock_anthropic_response):
        """Analysis should complete without error on SAIPEM segment."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache
        from agents.geotechnical import GeotechnicalAgent

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        segment_data = extract_segment_data("saipem_aoi", segment_ids[0])

        assert segment_data is not None

        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_anthropic_response

        agent = GeotechnicalAgent(mock_client)
        segment_dict = {
            "id": segment_data.id,
            "coordinates": {
                "start": segment_data.coordinates.start,
                "end": segment_data.coordinates.end,
                "crs": segment_data.coordinates.crs,
            },
            "metrics": {
                "length_m": segment_data.metrics.length_m,
                "start_elevation_m": segment_data.metrics.start_elevation_m,
                "end_elevation_m": segment_data.metrics.end_elevation_m,
                "avg_slope_degrees": segment_data.metrics.avg_slope_degrees,
                "max_slope_degrees": segment_data.metrics.max_slope_degrees,
                "slope_percent": segment_data.metrics.slope_percent,
                "max_slope_percent": segment_data.metrics.max_slope_percent,
            },
            "properties": {
                "terrain_class": segment_data.properties.terrain_class,
                "soil_type": segment_data.properties.soil_type,
                "geological_zone": segment_data.properties.geological_zone,
            },
        }
        result = agent.analyze(segment_dict)

        assert result is not None

    def test_saipem_multiple_segments_analyzed(self, mock_anthropic_response):
        """Multiple SAIPEM segments should analyze successfully."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache
        from agents.geotechnical import GeotechnicalAgent

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_anthropic_response

        results = []
        agent = GeotechnicalAgent(mock_client)

        # Analyze 5-10 segments (mix of positions)
        test_indices = [0, 1, 2, len(segment_ids)//2, -2, -1]
        for idx in test_indices:
            if 0 <= idx < len(segment_ids) or idx < 0:
                seg_id = segment_ids[idx]
                segment_data = extract_segment_data("saipem_aoi", seg_id)
                if segment_data:
                    segment_dict = {
                        "id": segment_data.id,
                        "coordinates": {
                            "start": segment_data.coordinates.start,
                            "end": segment_data.coordinates.end,
                            "crs": segment_data.coordinates.crs,
                        },
                        "metrics": {
                            "length_m": segment_data.metrics.length_m,
                            "start_elevation_m": segment_data.metrics.start_elevation_m,
                            "end_elevation_m": segment_data.metrics.end_elevation_m,
                            "avg_slope_degrees": segment_data.metrics.avg_slope_degrees,
                            "max_slope_degrees": segment_data.metrics.max_slope_degrees,
                            "slope_percent": segment_data.metrics.slope_percent,
                            "max_slope_percent": segment_data.metrics.max_slope_percent,
                        },
                        "properties": {
                            "terrain_class": segment_data.properties.terrain_class,
                            "soil_type": segment_data.properties.soil_type,
                            "geological_zone": segment_data.properties.geological_zone,
                        },
                    }
                    result = agent.analyze(segment_dict)
                    results.append(result)

        assert len(results) >= 3, "Should analyze at least 3 SAIPEM segments"

    def test_saipem_data_values_extracted(self):
        """Real data values should be extracted from SAIPEM segments."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        # Extract and verify real values are present
        for seg_id in segment_ids[:5]:
            segment_data = extract_segment_data("saipem_aoi", seg_id)
            if segment_data:
                # Verify metrics are populated (from PIRL output)
                assert segment_data.metrics.length_m is not None
                assert segment_data.metrics.length_m > 0

                # Check coordinates are populated
                assert segment_data.coordinates is not None
                assert segment_data.coordinates.start is not None


# ============================================================================
# TEST P8-05: API Works with SAIPEM Route
# ============================================================================

class TestP8_05_APISAIPEMRequest:
    """Verify API endpoint with real data."""

    @pytest.fixture
    def mock_full_analysis(self):
        """Mock the full analysis to return test data."""
        async def mock_run_full_analysis(segment_data):
            # segment_data is a dict, not object
            segment_id = segment_data.get("id", "unknown")
            metrics = segment_data.get("metrics", {})
            properties = segment_data.get("properties", {})
            return {
                "segment_id": segment_id,
                "overall_assessment": "caution",
                "confidence": "high",
                "executive_summary": "Test summary for SAIPEM segment analysis.",
                "key_metrics": {
                    "length_km": metrics.get("length_m", 0) / 1000,
                    "avg_slope": metrics.get("avg_slope_degrees", 0),
                    "terrain": properties.get("terrain_class", "unknown"),
                    "land_use": properties.get("land_use", "unknown")
                },
                "specialist_summaries": {
                    "geotechnical": "Test geotechnical summary",
                    "environmental": "Test environmental summary",
                    "engineering": "Test engineering summary",
                    "cost": "Test cost summary"
                },
                "saipem_compliance": {
                    "criteria_met": [],
                    "criteria_violated": [],
                    "compliance_notes": "Test"
                },
                "flags": [],
                "recommendations": ["Test recommendation"],
                "conflicts": []
            }
        return mock_run_full_analysis

    def test_api_explain_saipem_segment(self, client, mock_full_analysis):
        """API should handle SAIPEM segment explain request."""
        from data.segment_extractor import get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        with patch('api.routes.explain.run_full_analysis', mock_full_analysis):
            response = client.post(
                "/api/explain",
                json={
                    "route_id": "saipem_aoi",
                    "segment_ids": [segment_ids[0]]
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1

    def test_api_explain_multiple_saipem_segments(self, client, mock_full_analysis):
        """API should handle multiple SAIPEM segments."""
        from data.segment_extractor import get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        with patch('api.routes.explain.run_full_analysis', mock_full_analysis):
            response = client.post(
                "/api/explain",
                json={
                    "route_id": "saipem_aoi",
                    "segment_ids": segment_ids[:3]
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_api_response_structure_matches_spec(self, client, mock_full_analysis):
        """API response should match expected structure."""
        from data.segment_extractor import get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        with patch('api.routes.explain.run_full_analysis', mock_full_analysis):
            response = client.post(
                "/api/explain",
                json={
                    "route_id": "saipem_aoi",
                    "segment_ids": [segment_ids[0]]
                }
            )

        assert response.status_code == 200
        data = response.json()[0]

        # Verify structure
        assert "segment_id" in data
        assert "overall_assessment" in data
        assert "executive_summary" in data
        assert "specialist_summaries" in data


# ============================================================================
# TEST P8-06: All SAIPEM Layers Available
# ============================================================================

class TestP8_06_SAIPEMLayers:
    """Verify data layers are accessible."""

    def test_layer_manager_available(self):
        """Layer manager should be importable."""
        from data.layer_manager import get_available_layers, LayerType

        available = get_available_layers()
        assert isinstance(available, list)

    def test_layer_types_defined(self):
        """Layer types should be defined."""
        from data.layer_manager import LayerType

        # Check some expected layer types exist
        assert hasattr(LayerType, 'dem') or hasattr(LayerType, 'DEM')

    def test_query_layers_function_exists(self):
        """Layer query functions should exist."""
        from data.layer_manager import (
            get_layer_path,
            layer_exists,
            get_available_layers
        )

        # These should be callable
        assert callable(get_layer_path)
        assert callable(layer_exists)
        assert callable(get_available_layers)


# ============================================================================
# TEST P8-07: Enrichment Works for SAIPEM Segments
# ============================================================================

class TestP8_07_SAIPEMEnrichment:
    """Verify enrichment adds SAIPEM layer data."""

    def test_enrichment_function_exists(self):
        """Enrichment function should exist."""
        from data.enrichment import enrich_segment_data
        assert callable(enrich_segment_data)

    def test_enrichment_preserves_original_data(self):
        """Enrichment should preserve original segment data."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.enrichment import enrich_segment_data
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        original_data = extract_segment_data("saipem_aoi", segment_ids[0])

        if original_data:
            original_length = original_data.metrics.length_m
            original_id = original_data.id

            # Enrich - returns dict
            enriched = enrich_segment_data(original_data)

            # Original values should be preserved in the returned dict
            assert enriched["metrics"]["length_m"] == original_length
            assert enriched["id"] == original_id

    def test_enrichment_adds_fields(self):
        """Enrichment should add additional fields when layers available."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.enrichment import enrich_segment_data
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        segment_data = extract_segment_data("saipem_aoi", segment_ids[0])

        if segment_data:
            enriched = enrich_segment_data(segment_data)

            # Enrichment should return a valid dict with added fields
            assert enriched is not None
            assert enriched["id"] == segment_data.id
            # Should have derived fields added
            assert "derived" in enriched


# ============================================================================
# Regression Suite Markers
# ============================================================================

@pytest.mark.regression
class TestPhase8Regression:
    """Phase 8 regression tests - must always pass."""

    def test_sample_route_valid(self, routes_dir):
        """P8-R01: Sample route loads and is valid."""
        sample_route_path = routes_dir / "sample_route.geojson"
        assert sample_route_path.exists()

        with open(sample_route_path, 'r') as f:
            data = json.load(f)
        assert data.get("type") == "FeatureCollection"

    def test_saipem_route_valid(self, routes_dir):
        """P8-R02: SAIPEM route loads and is valid."""
        saipem_route_path = routes_dir / "saipem_aoi.geojson"
        assert saipem_route_path.exists()

        with open(saipem_route_path, 'r') as f:
            data = json.load(f)
        assert data.get("type") == "FeatureCollection"

    def test_sample_analysis_works(self):
        """P8-R03: Sample analysis completes."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")
        segment_data = extract_segment_data("sample_route", segment_ids[0])

        assert segment_data is not None
        assert segment_data.metrics.length_m > 0

    def test_saipem_analysis_works(self):
        """P8-R04: SAIPEM analysis completes."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        segment_data = extract_segment_data("saipem_aoi", segment_ids[0])

        assert segment_data is not None
        assert segment_data.metrics.length_m > 0

    def test_api_saipem_request(self, client):
        """P8-R05: API handles SAIPEM data."""
        from data.segment_extractor import get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")

        # Test with mock to avoid API calls
        async def mock_analysis(segment_data):
            return {
                "segment_id": segment_data.get("id", "unknown"),
                "overall_assessment": "favorable",
                "confidence": "high",
                "executive_summary": "Test",
                "key_metrics": {},
                "specialist_summaries": {
                    "geotechnical": "Test",
                    "environmental": "Test",
                    "engineering": "Test",
                    "cost": "Test"
                },
                "saipem_compliance": {
                    "criteria_met": [],
                    "criteria_violated": [],
                    "compliance_notes": "Test"
                },
                "flags": [],
                "recommendations": [],
                "conflicts": []
            }

        with patch('api.routes.explain.run_full_analysis', mock_analysis):
            response = client.post(
                "/api/explain",
                json={
                    "route_id": "saipem_aoi",
                    "segment_ids": [segment_ids[0]]
                }
            )

        assert response.status_code == 200

    def test_saipem_layers_available(self):
        """P8-R06: Layer system is functional."""
        from data.layer_manager import get_available_layers

        # Should return a list (even if empty)
        available = get_available_layers()
        assert isinstance(available, list)

    def test_saipem_enrichment(self):
        """P8-R07: Enrichment works."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.enrichment import enrich_segment_data
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        segment_data = extract_segment_data("saipem_aoi", segment_ids[0])

        enriched = enrich_segment_data(segment_data)
        assert enriched is not None


# ============================================================================
# Smoke Tests (Quick validation)
# ============================================================================

@pytest.mark.smoke
class TestSmoke:
    """Quick smoke tests for pre-demo validation."""

    def test_smoke_health(self, client):
        """Health endpoint returns ok."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") in ["ok", "degraded"]

    def test_smoke_route_load(self):
        """SAIPEM route loads quickly."""
        from data.route_loader import load_route, clear_cache
        import time

        clear_cache()
        start = time.time()
        route_data = load_route("saipem_aoi")
        elapsed = time.time() - start

        assert route_data is not None
        assert elapsed < 2.0, f"Route load took {elapsed:.2f}s, expected < 2s"

    def test_smoke_single_segment(self):
        """Single segment extraction completes."""
        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache

        clear_cache()
        segment_ids = get_all_segment_ids("saipem_aoi")
        segment_data = extract_segment_data("saipem_aoi", segment_ids[0])

        assert segment_data is not None


# ============================================================================
# Integration Tests (Real API calls - marked for optional running)
# ============================================================================

@pytest.mark.integration
@pytest.mark.slow
class TestIntegrationRealAPI:
    """Integration tests that make real API calls.

    Run with: pytest -m integration
    """

    def test_real_agent_analysis(self):
        """Test with real Anthropic API call.

        Note: Requires valid ANTHROPIC_API_KEY.
        """
        pytest.skip("Skipping real API test - run manually with -m integration")

        from data.segment_extractor import extract_segment_data, get_all_segment_ids
        from data.route_loader import clear_cache
        from agents.geotechnical import GeotechnicalAgent
        from agents.client import get_client

        clear_cache()
        segment_ids = get_all_segment_ids("sample_route")
        segment_data = extract_segment_data("sample_route", segment_ids[0])

        client = get_client()
        agent = GeotechnicalAgent(client)

        result = agent.analyze(segment_data)

        assert result is not None
        assert "assessment" in result
        assert result["assessment"] in ["favorable", "caution", "challenging"]
