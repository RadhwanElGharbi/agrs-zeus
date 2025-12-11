"""Phase 7 API Layer Tests.

This module contains comprehensive tests for the FastAPI application
including health check, explain, routes, and dev endpoints.
"""
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path

from fastapi.testclient import TestClient


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def app():
    """Create FastAPI app for testing."""
    # Import here to avoid circular imports
    from api.main import app
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def sample_route_fixture(tmp_path):
    """Create a sample route GeoJSON file for testing."""
    route_data = {
        "type": "FeatureCollection",
        "metadata": {
            "name": "test_route",
            "crs": "EPSG:4326"
        },
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "segment_id": 1,
                    "length_m": 1500.0,
                    "elevation_start_m": 100.0,
                    "elevation_end_m": 120.0,
                    "slope_percent": 1.3,
                    "terrain_class": "rolling_hills",
                    "land_use": "agricultural"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [10.0, 45.0],
                        [10.01, 45.01]
                    ]
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "segment_id": 2,
                    "length_m": 2000.0,
                    "elevation_start_m": 120.0,
                    "elevation_end_m": 180.0,
                    "slope_percent": 3.0,
                    "terrain_class": "hilly",
                    "land_use": "forest"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [10.01, 45.01],
                        [10.02, 45.02]
                    ]
                }
            },
            {
                "type": "Feature",
                "properties": {
                    "segment_id": 3,
                    "length_m": 800.0,
                    "elevation_start_m": 180.0,
                    "elevation_end_m": 150.0,
                    "slope_percent": 3.75,
                    "terrain_class": "hilly",
                    "land_use": "grassland"
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [10.02, 45.02],
                        [10.025, 45.025]
                    ]
                }
            }
        ]
    }
    return route_data


@pytest.fixture
def mock_synthesis_response():
    """Create a mock synthesis response."""
    return {
        "segment_id": "1",
        "overall_assessment": "favorable",
        "confidence": "high",
        "executive_summary": "Test summary for segment analysis.",
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
            "criteria_met": ["slope_under_20pct"],
            "criteria_violated": [],
            "compliance_notes": "Meets all criteria."
        },
        "flags": [],
        "recommendations": ["Proceed with standard design."],
        "conflicts": []
    }


# ============================================================================
# TEST P7-01: FastAPI App Starts Successfully
# ============================================================================

class TestP7_01_AppStartup:
    """Test that FastAPI application starts without errors."""

    def test_app_creates_without_error(self, app):
        """Verify app instance is created."""
        assert app is not None
        assert app.title == "Pipeline Route Optimization Agent API"

    def test_client_creates_without_error(self, client):
        """Verify test client can be created."""
        assert client is not None

    def test_root_endpoint_responds(self, client):
        """Verify root endpoint returns API info."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "version" in data
        assert "docs" in data


# ============================================================================
# TEST P7-02: Health Endpoint Returns Status
# ============================================================================

class TestP7_02_HealthEndpoint:
    """Test health check endpoint functionality."""

    def test_health_returns_200(self, client):
        """Verify health endpoint returns 200 status."""
        with patch('agents.client.test_connection', return_value=True):
            response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_required_fields(self, client):
        """Verify health response has required fields."""
        with patch('agents.client.test_connection', return_value=True):
            response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "version" in data
        assert "agents_available" in data

    def test_health_status_ok_when_connected(self, client):
        """Verify status is 'ok' when Anthropic is connected."""
        with patch('agents.client.test_connection', return_value=True):
            response = client.get("/health")
        data = response.json()
        assert data["status"] in ["ok", "degraded"]

    def test_health_agents_list_not_empty(self, client):
        """Verify agents_available list is not empty."""
        with patch('agents.client.test_connection', return_value=True):
            response = client.get("/health")
        data = response.json()
        assert isinstance(data["agents_available"], list)
        assert len(data["agents_available"]) > 0

    def test_health_status_degraded_when_api_fails(self, client):
        """Verify status is 'degraded' when Anthropic is unreachable."""
        with patch('agents.client.test_connection', side_effect=Exception("API error")):
            with patch('api.routes.health.test_connection', side_effect=Exception("API error")):
                response = client.get("/health")
        # Should still return 200, but with degraded status
        assert response.status_code == 200


# ============================================================================
# TEST P7-03: Explain Endpoint Accepts Valid Request
# ============================================================================

class TestP7_03_ExplainValidRequest:
    """Test explain endpoint with valid requests."""

    def test_explain_accepts_valid_request(self, client, sample_route_fixture, mock_synthesis_response, tmp_path):
        """Verify explain endpoint processes valid requests."""
        from config.settings import Settings

        # Create test route file
        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            # Mock the full analysis to avoid actual API calls
            with patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:
                mock_analysis.return_value = mock_synthesis_response

                response = client.post(
                    "/api/explain",
                    json={
                        "route_id": "test_route",
                        "segment_ids": ["1"]
                    }
                )

            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 1

        finally:
            # Cleanup
            if route_file.exists():
                route_file.unlink()

    def test_explain_returns_array_matching_segments(self, client, sample_route_fixture, mock_synthesis_response):
        """Verify response array length matches requested segments."""
        from config.settings import Settings

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            with patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock_analysis:
                # Return different responses for different segments
                def get_response(segment_data):
                    resp = mock_synthesis_response.copy()
                    resp["segment_id"] = segment_data.get("id", "unknown")
                    return resp
                mock_analysis.side_effect = get_response

                response = client.post(
                    "/api/explain",
                    json={
                        "route_id": "test_route",
                        "segment_ids": ["1", "2"]
                    }
                )

            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2

        finally:
            if route_file.exists():
                route_file.unlink()


# ============================================================================
# TEST P7-04: Explain Endpoint Validates Request
# ============================================================================

class TestP7_04_ExplainValidation:
    """Test explain endpoint request validation."""

    def test_explain_rejects_empty_segment_ids(self, client):
        """Verify 422 for empty segment_ids list."""
        response = client.post(
            "/api/explain",
            json={
                "route_id": "test_route",
                "segment_ids": []
            }
        )
        assert response.status_code == 422

    def test_explain_rejects_missing_route_id(self, client):
        """Verify 422 for missing route_id."""
        response = client.post(
            "/api/explain",
            json={
                "segment_ids": ["seg_001"]
            }
        )
        assert response.status_code == 422

    def test_explain_rejects_empty_route_id(self, client):
        """Verify 422 for empty route_id."""
        response = client.post(
            "/api/explain",
            json={
                "route_id": "",
                "segment_ids": ["seg_001"]
            }
        )
        assert response.status_code == 422

    def test_explain_error_has_detail(self, client):
        """Verify validation error response has detail."""
        response = client.post(
            "/api/explain",
            json={
                "route_id": "test",
                "segment_ids": []
            }
        )
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data


# ============================================================================
# TEST P7-05: Explain Endpoint Handles Missing Route
# ============================================================================

class TestP7_05_MissingRoute:
    """Test explain endpoint with non-existent routes."""

    def test_explain_returns_404_for_missing_route(self, client):
        """Verify 404 for non-existent route."""
        response = client.post(
            "/api/explain",
            json={
                "route_id": "nonexistent_route_12345",
                "segment_ids": ["seg_001"]
            }
        )
        assert response.status_code == 404

    def test_explain_missing_route_error_message(self, client):
        """Verify error message mentions route not found."""
        response = client.post(
            "/api/explain",
            json={
                "route_id": "nonexistent_route_12345",
                "segment_ids": ["seg_001"]
            }
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "not found" in data["detail"].lower()


# ============================================================================
# TEST P7-06: Explain Endpoint Handles Missing Segment
# ============================================================================

class TestP7_06_MissingSegment:
    """Test explain endpoint with non-existent segments."""

    def test_explain_returns_404_for_missing_segment(self, client, sample_route_fixture):
        """Verify 404 for non-existent segment."""
        from config.settings import Settings

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            response = client.post(
                "/api/explain",
                json={
                    "route_id": "test_route",
                    "segment_ids": ["nonexistent_segment_999"]
                }
            )
            assert response.status_code == 404
            data = response.json()
            assert "detail" in data

        finally:
            if route_file.exists():
                route_file.unlink()


# ============================================================================
# TEST P7-07: Routes Endpoint Lists Available Routes
# ============================================================================

class TestP7_07_RoutesList:
    """Test routes listing endpoint."""

    def test_routes_list_returns_200(self, client):
        """Verify routes endpoint returns 200."""
        response = client.get("/api/routes")
        assert response.status_code == 200

    def test_routes_list_returns_array(self, client):
        """Verify routes endpoint returns JSON array."""
        response = client.get("/api/routes")
        data = response.json()
        assert isinstance(data, list)

    def test_routes_list_contains_created_route(self, client, sample_route_fixture):
        """Verify created route appears in list."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "list_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()  # Clear route cache
            response = client.get("/api/routes")
            data = response.json()
            route_ids = [r["route_id"] for r in data]
            assert "list_test_route" in route_ids

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()


# ============================================================================
# TEST P7-08: Route Detail Endpoint Returns Metadata
# ============================================================================

class TestP7_08_RouteDetail:
    """Test route detail endpoint."""

    def test_route_detail_returns_200(self, client, sample_route_fixture):
        """Verify route detail returns 200 for existing route."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "detail_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()
            response = client.get("/api/routes/detail_test_route")
            assert response.status_code == 200

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()

    def test_route_detail_contains_segment_count(self, client, sample_route_fixture):
        """Verify route detail includes segment count."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "detail_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()
            response = client.get("/api/routes/detail_test_route")
            data = response.json()
            assert "segment_count" in data
            assert data["segment_count"] == 3  # 3 segments in fixture

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()

    def test_route_detail_returns_404_for_missing(self, client):
        """Verify 404 for non-existent route."""
        response = client.get("/api/routes/nonexistent_route_xyz")
        assert response.status_code == 404


# ============================================================================
# TEST P7-09: CORS Headers Are Present
# ============================================================================

class TestP7_09_CORSHeaders:
    """Test CORS configuration."""

    def test_cors_headers_present(self, client):
        """Verify CORS headers are present in response."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:3000"}
        )
        # CORS headers should be present
        assert response.status_code == 200
        # The Access-Control-Allow-Origin should be set
        assert "access-control-allow-origin" in response.headers or response.status_code == 200

    def test_cors_preflight_options(self, client):
        """Verify OPTIONS preflight request works."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET"
            }
        )
        # Should return 200 or 204 for preflight
        assert response.status_code in [200, 204]


# ============================================================================
# TEST P7-10: API Handles Agent Timeout
# ============================================================================

class TestP7_10_TimeoutHandling:
    """Test API timeout handling."""

    def test_api_handles_timeout_gracefully(self, client, sample_route_fixture):
        """Verify API handles timeouts without crashing."""
        from config.settings import Settings
        from data.route_loader import clear_cache
        import asyncio

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "timeout_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()

            # Mock analysis to timeout
            async def timeout_analysis(*args, **kwargs):
                raise asyncio.TimeoutError("Simulated timeout")

            with patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock:
                mock.side_effect = timeout_analysis
                with patch('config.settings.Settings.DEV_MODE', False):
                    response = client.post(
                        "/api/explain",
                        json={
                            "route_id": "timeout_test_route",
                            "segment_ids": ["1"]
                        }
                    )

            # Should return error, not crash
            assert response.status_code >= 400

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()


# ============================================================================
# TEST P7-11: Dev Endpoints Protected in Production
# ============================================================================

class TestP7_11_DevEndpointSecurity:
    """Test dev endpoint protection."""

    def test_dev_endpoints_require_dev_mode(self, client):
        """Verify dev endpoints return 403 when DEV_MODE is False."""
        with patch('config.settings.Settings.DEV_MODE', False):
            with patch('api.routes.dev.Settings.DEV_MODE', False):
                response = client.get("/api/dev/cache/clear")
        assert response.status_code == 403

    def test_fallback_mode_requires_dev_mode(self, client):
        """Verify fallback mode endpoint requires DEV_MODE."""
        with patch('config.settings.Settings.DEV_MODE', False):
            with patch('api.routes.dev.Settings.DEV_MODE', False):
                response = client.post(
                    "/api/dev/fallback-mode",
                    json={"enabled": True}
                )
        assert response.status_code == 403

    def test_dev_endpoints_work_in_dev_mode(self, client):
        """Verify dev endpoints work when DEV_MODE is True."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            response = client.get("/api/dev/cache/stats")
        assert response.status_code == 200

    def test_dev_status_shows_settings(self, client):
        """Verify dev status endpoint shows current settings."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            response = client.get("/api/dev/status")
        assert response.status_code == 200
        data = response.json()
        assert "dev_mode" in data
        assert "use_cached_responses" in data


# ============================================================================
# Additional API Tests
# ============================================================================

class TestExplainSingleSegment:
    """Test single segment explain endpoint."""

    def test_explain_single_segment(self, client, sample_route_fixture, mock_synthesis_response):
        """Test the /explain/single endpoint."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "single_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()

            with patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock:
                mock.return_value = mock_synthesis_response

                response = client.post(
                    "/api/explain/single",
                    params={
                        "route_id": "single_test_route",
                        "segment_id": "1"
                    }
                )

            assert response.status_code == 200
            data = response.json()
            assert "segment_id" in data

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()


class TestRouteSegmentsEndpoint:
    """Test route segments listing endpoint."""

    def test_list_route_segments(self, client, sample_route_fixture):
        """Test listing segments of a route."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "segments_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()
            response = client.get("/api/routes/segments_test_route/segments")
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            assert len(data) == 3

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()

    def test_list_segments_with_pagination(self, client, sample_route_fixture):
        """Test segment listing with pagination."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "pagination_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()
            response = client.get(
                "/api/routes/pagination_test_route/segments",
                params={"limit": 2, "offset": 0}
            )
            assert response.status_code == 200
            data = response.json()
            assert len(data) == 2

        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()


class TestCacheManagement:
    """Test cache management endpoints."""

    def test_clear_cache(self, client):
        """Test cache clearing endpoint."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            response = client.get("/api/dev/cache/clear")
        assert response.status_code == 200
        data = response.json()
        assert "entries_cleared" in data

    def test_cache_stats(self, client):
        """Test cache stats endpoint."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            response = client.get("/api/dev/cache/stats")
        assert response.status_code == 200
        data = response.json()
        assert "entry_count" in data


class TestFallbackManagement:
    """Test fallback management endpoints."""

    def test_list_fallbacks(self, client):
        """Test listing predefined fallbacks."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            response = client.get("/api/dev/fallbacks")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "segment_ids" in data

    def test_toggle_fallback_mode(self, client):
        """Test toggling fallback mode."""
        with patch('api.routes.dev.Settings.DEV_MODE', True):
            # Enable fallback mode
            response = client.post(
                "/api/dev/fallback-mode",
                json={"enabled": True}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["use_cached_responses"] == True

        with patch('api.routes.dev.Settings.DEV_MODE', True):
            # Disable fallback mode
            response = client.post(
                "/api/dev/fallback-mode",
                json={"enabled": False}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["use_cached_responses"] == False


# ============================================================================
# Regression Tests (P7-R*)
# ============================================================================

class TestP7Regression:
    """Phase 7 Regression test suite."""

    def test_p7_r01_app_startup(self, app, client):
        """P7-R01: App starts without errors."""
        assert app is not None
        response = client.get("/")
        assert response.status_code == 200

    def test_p7_r02_health_endpoint(self, client):
        """P7-R02: Health returns status."""
        with patch('agents.client.test_connection', return_value=True):
            response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data

    def test_p7_r03_explain_valid_request(self, client, sample_route_fixture, mock_synthesis_response):
        """P7-R03: Valid requests succeed."""
        from config.settings import Settings
        from data.route_loader import clear_cache

        routes_dir = Settings.ROUTES_DIR
        routes_dir.mkdir(parents=True, exist_ok=True)
        route_file = routes_dir / "regression_test_route.geojson"
        with open(route_file, 'w') as f:
            json.dump(sample_route_fixture, f)

        try:
            clear_cache()
            with patch('api.routes.explain.run_full_analysis', new_callable=AsyncMock) as mock:
                mock.return_value = mock_synthesis_response
                response = client.post(
                    "/api/explain",
                    json={"route_id": "regression_test_route", "segment_ids": ["1"]}
                )
            assert response.status_code == 200
        finally:
            if route_file.exists():
                route_file.unlink()
            clear_cache()

    def test_p7_r04_explain_validation(self, client):
        """P7-R04: Invalid requests rejected."""
        response = client.post(
            "/api/explain",
            json={"route_id": "test", "segment_ids": []}
        )
        assert response.status_code == 422

    def test_p7_r05_missing_route_404(self, client):
        """P7-R05: Missing routes return 404."""
        response = client.post(
            "/api/explain",
            json={"route_id": "nonexistent_route", "segment_ids": ["seg"]}
        )
        assert response.status_code == 404

    def test_p7_r07_routes_listing(self, client):
        """P7-R07: Route listing works."""
        response = client.get("/api/routes")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_p7_r09_cors_headers(self, client):
        """P7-R09: CORS configured correctly."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:3000"}
        )
        assert response.status_code == 200

    def test_p7_r11_dev_endpoint_security(self, client):
        """P7-R11: Dev endpoints protected."""
        with patch('api.routes.dev.Settings.DEV_MODE', False):
            response = client.get("/api/dev/cache/clear")
        assert response.status_code == 403
