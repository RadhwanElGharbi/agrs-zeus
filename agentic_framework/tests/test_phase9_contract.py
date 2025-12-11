"""Phase 9 Frontend Integration Tests.

This module contains tests for API contract compliance, response timing,
error structure, and large response handling per the master plan.
"""
import json
import time
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

from fastapi.testclient import TestClient


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def app():
    """Create FastAPI app for testing."""
    from api.main import app
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_synthesis_response():
    """Create a mock synthesis response matching contract."""
    return {
        "segment_id": "1",
        "overall_assessment": "favorable",
        "confidence": "high",
        "executive_summary": "This segment presents ideal conditions for pipeline construction.",
        "key_metrics": {
            "length_km": 1.5,
            "avg_slope": 2.0,
            "terrain": "rolling_hills",
            "land_use": "agricultural",
            "construction_method": "standard_trenching",
            "estimated_cost": "EUR 1,200,000"
        },
        "specialist_summaries": {
            "geotechnical": "Favorable terrain conditions.",
            "environmental": "No environmental concerns.",
            "engineering": "Standard construction feasible.",
            "cost": "Base costs apply."
        },
        "saipem_compliance": {
            "criteria_met": ["1", "2", "3"],
            "criteria_violated": [],
            "compliance_notes": "Full compliance achieved."
        },
        "flags": [],
        "recommendations": ["Proceed with standard design."],
        "conflicts": []
    }


@pytest.fixture
def challenging_synthesis_response():
    """Create a challenging segment response for testing."""
    return {
        "segment_id": "99",
        "overall_assessment": "challenging",
        "confidence": "medium",
        "executive_summary": "This segment presents significant construction challenges with steep slope.",
        "key_metrics": {
            "length_km": 0.4,
            "avg_slope": 25.0,
            "terrain": "mountainous",
            "land_use": "forested",
            "construction_method": "Specialized HDD with slope stabilization",
            "estimated_cost": "EUR 2,500,000"
        },
        "specialist_summaries": {
            "geotechnical": "CRITICAL: 25% slope exceeds 20% limit.",
            "environmental": "Protected area within 500m.",
            "engineering": "Specialized equipment required.",
            "cost": "Exceptional costs expected."
        },
        "saipem_compliance": {
            "criteria_met": ["1", "4"],
            "criteria_violated": ["2", "3"],
            "compliance_notes": "Critical slope violation."
        },
        "flags": [
            "SLOPE_EXCEEDS_20_PERCENT: 25% slope exceeds maximum",
            "HIGH_COST_SEGMENT: Exceptional per-km costs"
        ],
        "recommendations": [
            "Evaluate route realignment",
            "Commission detailed slope analysis"
        ],
        "conflicts": [
            "Geotechnical vs Cost: Stabilization increases costs significantly"
        ]
    }


@pytest.fixture
def sample_route_fixture():
    """Create sample route data for tests."""
    return {
        "type": "FeatureCollection",
        "metadata": {"crs": "EPSG:4326"},
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "segment_id": i,
                    "length_m": 1000.0,
                    "elevation_start_m": 100.0,
                    "elevation_end_m": 110.0,
                    "slope_percent": 1.0,
                    "terrain_class": "rolling_hills"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[10.0 + i*0.01, 45.0], [10.01 + i*0.01, 45.01]]
                }
            }
            for i in range(1, 11)  # 10 segments
        ]
    }


@pytest.fixture(scope="module", autouse=True)
def ensure_routes_exist():
    """Ensure sample routes exist for Phase 9 tests."""
    from data.route_loader import clear_cache
    routes_dir = Path(__file__).parent.parent / "data" / "routes"
    routes_dir.mkdir(parents=True, exist_ok=True)

    # Create sample route if needed
    sample_path = routes_dir / "sample_route.geojson"
    fixtures_path = Path(__file__).parent / "fixtures" / "sample_route.geojson"

    if fixtures_path.exists() and not sample_path.exists():
        import shutil
        shutil.copy(fixtures_path, sample_path)

    clear_cache()
    yield


@pytest.fixture
def docs_dir():
    """Return path to docs directory."""
    return Path(__file__).parent.parent / "docs"


@pytest.fixture
def sample_responses_dir(docs_dir):
    """Return path to sample responses directory."""
    return docs_dir / "sample_responses"


# ============================================================================
# TEST P9-01: API Response Matches Contract
# ============================================================================

class TestP9_01_ResponseContract:
    """Test that API returns exactly what frontend expects."""

    def test_response_has_segment_id(self, client, mock_synthesis_response):
        """Verify response contains segment_id."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data) == 1
            assert "segment_id" in data[0]

    def test_response_has_overall_assessment(self, client, mock_synthesis_response):
        """Verify response contains overall_assessment with valid enum value."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "overall_assessment" in data
            assert data["overall_assessment"] in ["favorable", "caution", "challenging"]

    def test_response_has_key_metrics_structure(self, client, mock_synthesis_response):
        """Verify key_metrics has expected nested structure."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "key_metrics" in data
            key_metrics = data["key_metrics"]
            assert "length_km" in key_metrics
            assert "avg_slope" in key_metrics
            assert "terrain" in key_metrics
            assert "construction_method" in key_metrics
            assert "estimated_cost" in key_metrics

    def test_response_has_specialist_summaries(self, client, mock_synthesis_response):
        """Verify specialist_summaries has all four agent keys."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "specialist_summaries" in data
            summaries = data["specialist_summaries"]
            assert "geotechnical" in summaries
            assert "environmental" in summaries
            assert "engineering" in summaries
            assert "cost" in summaries

    def test_response_has_saipem_compliance(self, client, mock_synthesis_response):
        """Verify saipem_compliance structure is present."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "saipem_compliance" in data
            compliance = data["saipem_compliance"]
            assert "criteria_met" in compliance
            assert "criteria_violated" in compliance
            assert "compliance_notes" in compliance

    def test_response_has_flags_list(self, client, mock_synthesis_response):
        """Verify flags is present as a list."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "flags" in data
            assert isinstance(data["flags"], list)

    def test_response_has_recommendations_list(self, client, mock_synthesis_response):
        """Verify recommendations is present as a list."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "recommendations" in data
            assert isinstance(data["recommendations"], list)

    def test_confidence_is_valid_enum(self, client, mock_synthesis_response):
        """Verify confidence is one of allowed values."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            data = response.json()[0]
            assert "confidence" in data
            assert data["confidence"] in ["high", "medium", "low"]


# ============================================================================
# TEST P9-02: Response Timing Acceptable for UI
# ============================================================================

class TestP9_02_ResponseTiming:
    """Test that response times are user-friendly."""

    def test_single_segment_timing_with_cache(self, client, mock_synthesis_response):
        """Verify cached response returns quickly."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            start = time.time()
            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )
            elapsed = time.time() - start

            assert response.status_code == 200
            # Cached response should be fast
            assert elapsed < 2.0, f"Cached response took {elapsed:.2f}s, expected < 2s"

    def test_processing_time_header_present(self, client, mock_synthesis_response):
        """Verify X-Processing-Time header is returned."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.extract_segment_data') as mock_extract, \
             patch('api.routes.explain.get_cached_response', return_value=None), \
             patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:

            mock_extract.return_value = MagicMock(
                id="1",
                coordinates=MagicMock(start=[0,0], end=[1,1], crs="EPSG:4326"),
                metrics=MagicMock(
                    length_m=1000, start_elevation_m=100, end_elevation_m=110,
                    avg_slope_degrees=1.0, max_slope_degrees=2.0,
                    slope_percent=1.0, max_slope_percent=2.0,
                    reward=0, cumulative_distance_m=0,
                    total_reward_cumulative=0, distance_to_aoi_boundary_m=0
                ),
                properties=MagicMock(
                    terrain_class="flat", land_use="agricultural",
                    soil_type="clay", geological_zone="stable",
                    raw_properties={}
                ),
                step=1, route_id="test"
            )
            mock_analysis.return_value = mock_synthesis_response

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            assert "X-Processing-Time" in response.headers

    def test_multiple_segment_batch_timing(self, client, mock_synthesis_response):
        """Verify multiple segments don't timeout."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1", "2", "3"]), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            start = time.time()
            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1", "2", "3"]}
            )
            elapsed = time.time() - start

            assert response.status_code == 200
            assert len(response.json()) == 3
            # Batch cached responses should be fast
            assert elapsed < 5.0, f"Batch response took {elapsed:.2f}s"


# ============================================================================
# TEST P9-03: Error Responses Are Structured
# ============================================================================

class TestP9_03_ErrorStructure:
    """Test that frontend can handle errors properly."""

    def test_404_has_detail_field(self, client):
        """Verify 404 response has detail field."""
        response = client.post(
            "/api/explain",
            json={"route_id": "nonexistent_route", "segment_ids": ["1"]}
        )

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_422_validation_error_structure(self, client):
        """Verify validation error has proper structure."""
        response = client.post(
            "/api/explain",
            json={"route_id": "test", "segment_ids": []}  # Empty list is invalid
        )

        assert response.status_code == 422
        data = response.json()
        assert "detail" in data

    def test_missing_route_id_returns_422(self, client):
        """Verify missing route_id returns validation error."""
        response = client.post(
            "/api/explain",
            json={"segment_ids": ["1"]}
        )

        assert response.status_code == 422

    def test_error_message_is_user_friendly(self, client):
        """Verify error messages are readable."""
        response = client.post(
            "/api/explain",
            json={"route_id": "nonexistent", "segment_ids": ["1"]}
        )

        data = response.json()
        assert len(data.get("detail", "")) > 0
        # Should mention what's wrong
        assert "not found" in data["detail"].lower() or "nonexistent" in data["detail"].lower()


# ============================================================================
# TEST P9-04: Large Response Handling
# ============================================================================

class TestP9_04_LargeResponses:
    """Test that large responses don't break the system."""

    def test_ten_segment_request_succeeds(self, client, mock_synthesis_response):
        """Verify request for 10 segments returns all results."""
        segment_ids = [str(i) for i in range(1, 11)]

        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=segment_ids), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": segment_ids}
            )

            assert response.status_code == 200
            data = response.json()
            assert len(data) == 10

    def test_response_is_complete_json(self, client, mock_synthesis_response):
        """Verify response parses as complete JSON."""
        segment_ids = [str(i) for i in range(1, 6)]

        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=segment_ids), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": segment_ids}
            )

            # Should be valid JSON
            try:
                data = response.json()
                assert isinstance(data, list)
            except json.JSONDecodeError:
                pytest.fail("Response is not valid JSON")

    def test_each_segment_has_complete_structure(self, client, mock_synthesis_response):
        """Verify each segment in batch has complete structure."""
        segment_ids = ["1", "2", "3"]

        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=segment_ids), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": segment_ids}
            )

            data = response.json()
            required_fields = [
                "segment_id", "overall_assessment", "confidence",
                "executive_summary", "key_metrics", "specialist_summaries",
                "saipem_compliance", "flags", "recommendations"
            ]

            for segment_response in data:
                for field in required_fields:
                    assert field in segment_response, f"Missing field: {field}"


# ============================================================================
# API Contract Documentation Tests
# ============================================================================

class TestApiContractDocumentation:
    """Test that API contract documentation exists and is valid."""

    def test_api_contract_file_exists(self, docs_dir):
        """Verify api_contract.md file exists."""
        contract_file = docs_dir / "api_contract.md"
        assert contract_file.exists(), "api_contract.md not found in docs/"

    def test_api_contract_not_empty(self, docs_dir):
        """Verify api_contract.md is not empty."""
        contract_file = docs_dir / "api_contract.md"
        content = contract_file.read_text()
        assert len(content) > 1000, "api_contract.md appears too short"

    def test_api_contract_has_endpoints(self, docs_dir):
        """Verify api_contract.md documents main endpoints."""
        contract_file = docs_dir / "api_contract.md"
        content = contract_file.read_text()

        assert "/health" in content
        assert "/api/explain" in content
        assert "/api/routes" in content

    def test_api_contract_has_examples(self, docs_dir):
        """Verify api_contract.md has curl examples."""
        contract_file = docs_dir / "api_contract.md"
        content = contract_file.read_text()

        assert "curl" in content.lower()


# ============================================================================
# Sample Responses Tests
# ============================================================================

class TestSampleResponses:
    """Test that sample response files exist and are valid."""

    def test_sample_responses_dir_exists(self, sample_responses_dir):
        """Verify sample_responses directory exists."""
        assert sample_responses_dir.exists(), "sample_responses/ directory not found"

    def test_favorable_sample_exists(self, sample_responses_dir):
        """Verify favorable segment sample exists."""
        sample_file = sample_responses_dir / "favorable_segment.json"
        assert sample_file.exists(), "favorable_segment.json not found"

    def test_caution_sample_exists(self, sample_responses_dir):
        """Verify caution segment sample exists."""
        sample_file = sample_responses_dir / "caution_segment.json"
        assert sample_file.exists(), "caution_segment.json not found"

    def test_challenging_sample_exists(self, sample_responses_dir):
        """Verify challenging segment sample exists."""
        sample_file = sample_responses_dir / "challenging_segment.json"
        assert sample_file.exists(), "challenging_segment.json not found"

    def test_flagged_sample_exists(self, sample_responses_dir):
        """Verify flagged segment sample exists."""
        sample_file = sample_responses_dir / "flagged_segment.json"
        assert sample_file.exists(), "flagged_segment.json not found"

    def test_optimization_sample_exists(self, sample_responses_dir):
        """Verify optimization recommendations sample exists."""
        sample_file = sample_responses_dir / "optimization_recommendations.json"
        assert sample_file.exists(), "optimization_recommendations.json not found"

    def test_favorable_sample_is_valid_json(self, sample_responses_dir):
        """Verify favorable sample is valid JSON."""
        sample_file = sample_responses_dir / "favorable_segment.json"
        content = sample_file.read_text()
        data = json.loads(content)
        assert "segment_id" in data
        assert data["overall_assessment"] == "favorable"

    def test_challenging_sample_has_flags(self, sample_responses_dir):
        """Verify challenging sample has flags."""
        sample_file = sample_responses_dir / "challenging_segment.json"
        content = sample_file.read_text()
        data = json.loads(content)
        assert "flags" in data
        assert len(data["flags"]) > 0, "Challenging sample should have flags"

    def test_optimization_sample_has_recommendations(self, sample_responses_dir):
        """Verify optimization sample has recommendations."""
        sample_file = sample_responses_dir / "optimization_recommendations.json"
        content = sample_file.read_text()
        data = json.loads(content)
        assert "recommendations" in data
        assert len(data["recommendations"]) > 0, "Optimization sample should have recommendations"


# ============================================================================
# Phase 9 Regression Suite
# ============================================================================

@pytest.mark.regression
class TestP9Regression:
    """Phase 9 regression tests that must always pass."""

    def test_p9_r01_response_contract(self, client, mock_synthesis_response):
        """P9-R01: Response matches contract."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )

            assert response.status_code == 200
            data = response.json()[0]
            assert "segment_id" in data
            assert "overall_assessment" in data
            assert "key_metrics" in data

    def test_p9_r02_response_timing(self, client, mock_synthesis_response):
        """P9-R02: Response time acceptable."""
        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=["1"]), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            start = time.time()
            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": ["1"]}
            )
            elapsed = time.time() - start

            assert response.status_code == 200
            assert elapsed < 5.0

    def test_p9_r03_error_structure(self, client):
        """P9-R03: Errors are structured."""
        response = client.post(
            "/api/explain",
            json={"route_id": "nonexistent", "segment_ids": ["1"]}
        )

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    def test_p9_r04_large_responses(self, client, mock_synthesis_response):
        """P9-R04: Large requests work."""
        segment_ids = [str(i) for i in range(1, 6)]

        with patch('api.routes.explain.load_route'), \
             patch('api.routes.explain.get_all_segment_ids', return_value=segment_ids), \
             patch('api.routes.explain.get_cached_response', return_value=mock_synthesis_response):

            response = client.post(
                "/api/explain",
                json={"route_id": "test", "segment_ids": segment_ids}
            )

            assert response.status_code == 200
            assert len(response.json()) == 5


# ============================================================================
# Smoke Tests
# ============================================================================

@pytest.mark.smoke
class TestP9Smoke:
    """Quick smoke tests for Phase 9."""

    def test_smoke_api_contract_exists(self, docs_dir):
        """Smoke: API contract file exists."""
        assert (docs_dir / "api_contract.md").exists()

    def test_smoke_sample_responses_exist(self, sample_responses_dir):
        """Smoke: Sample response files exist."""
        assert (sample_responses_dir / "favorable_segment.json").exists()
        assert (sample_responses_dir / "challenging_segment.json").exists()

    def test_smoke_explain_endpoint_reachable(self, client):
        """Smoke: Explain endpoint is reachable."""
        response = client.post(
            "/api/explain",
            json={"route_id": "test", "segment_ids": ["1"]}
        )
        # Either 200 or 404 (route not found) - both mean endpoint works
        assert response.status_code in [200, 404]
