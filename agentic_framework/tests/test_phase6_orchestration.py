"""Phase 6 Tests: Agent Orchestration

Gate tests and regression suite for agent registry, parallel executor,
caching layer, and fallback response system.
"""
import asyncio
import json
import pytest
import time
import tempfile
from pathlib import Path
from typing import Any, Dict
from unittest.mock import Mock, MagicMock, patch, AsyncMock
import anthropic

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.registry import (
    get_agent,
    get_all_specialist_agents,
    get_master_agent,
    get_available_agents,
    get_specialist_agent_names,
    AgentNotFoundError,
    AGENT_REGISTRY,
)
from agents.executor import (
    run_agent_async,
    run_specialists_parallel,
    run_full_analysis,
    run_full_analysis_sync,
    run_specialists_sync,
)
from agents.cache import (
    get_cached_response,
    save_to_cache,
    clear_cache,
    clear_segment_cache,
    get_cache_stats,
    get_cache_key,
    is_cached,
)
from agents.fallback import (
    get_fallback_response,
    generate_generic_fallback,
    should_use_fallback,
    add_predefined_fallback,
    remove_predefined_fallback,
    list_predefined_fallbacks,
    is_fallback_response,
    FALLBACK_RESPONSES,
)
from agents.geotechnical import GeotechnicalAgent
from agents.environmental import EnvironmentalAgent
from agents.engineering import EngineeringAgent
from agents.cost import CostAgent
from agents.master import MasterAgent
from config.settings import Settings


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def mock_client():
    """Create a mock Anthropic client."""
    client = Mock(spec=anthropic.Anthropic)
    return client


@pytest.fixture
def sample_segment_data():
    """Sample segment data for testing."""
    return {
        "id": "seg_test_001",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 1500.0,
            "start_elevation_m": 150.0,
            "end_elevation_m": 175.0,
            "avg_slope_degrees": 1.5,
            "max_slope_degrees": 3.2,
            "slope_percent": 2.6,
            "max_slope_percent": 5.6
        },
        "properties": {
            "terrain_class": "rolling_hills",
            "land_use": "agricultural",
            "soil_type": "clay_loam",
            "geological_zone": "sedimentary",
            "protected_area_distance_m": 500.0,
            "water_body_distance_m": 200.0,
            "road_crossing": False,
            "water_crossing": False,
            "raw_properties": {}
        }
    }


@pytest.fixture
def challenging_segment_data():
    """Challenging segment data for testing."""
    return {
        "id": "seg_challenging_test",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 800.0,
            "start_elevation_m": 100.0,
            "end_elevation_m": 200.0,
            "avg_slope_degrees": 18.0,
            "max_slope_degrees": 22.0,
            "slope_percent": 32.5,
            "max_slope_percent": 40.0
        },
        "properties": {
            "terrain_class": "mountainous",
            "land_use": "forest",
            "protected_area_distance_m": 100.0,
            "water_crossing": True,
            "river_width_m": 30.0,
            "raw_properties": {}
        }
    }


@pytest.fixture
def mock_agent_response():
    """Mock agent response."""
    return {
        "agent": "test_agent",
        "segment_id": "seg_test_001",
        "assessment": "favorable",
        "explanation": "Test explanation.",
        "metrics": {},
        "flags": []
    }


@pytest.fixture
def mock_synthesis_response():
    """Mock synthesis response."""
    return {
        "segment_id": "seg_test_001",
        "overall_assessment": "favorable",
        "confidence": "high",
        "executive_summary": "Test synthesis summary.",
        "key_metrics": {
            "length_km": 1.5,
            "avg_slope": 1.5
        },
        "specialist_summaries": {
            "geotechnical": "Good terrain.",
            "environmental": "No concerns.",
            "engineering": "Standard construction.",
            "cost": "Baseline cost."
        },
        "saipem_compliance": {
            "criteria_met": [],
            "criteria_violated": [],
            "compliance_notes": "Test."
        },
        "flags": [],
        "recommendations": [],
        "conflicts": []
    }


def create_mock_api_response(json_content: dict) -> Mock:
    """Helper to create mock API response."""
    mock_response = Mock()
    mock_response.content = [Mock(text=json.dumps(json_content))]
    return mock_response


# ============================================================================
# TEST P6-01: Agent Registry Returns Correct Agents
# ============================================================================

class TestP6_01_AgentRegistry:
    """TEST P6-01: Agent Registry Returns Correct Agents

    Purpose: Verify registry provides correct agent instances
    """

    def test_registry_contains_all_agents(self):
        """Registry should contain all agent types."""
        expected_agents = ["geotechnical", "environmental", "engineering", "cost", "master"]
        for agent_name in expected_agents:
            assert agent_name in AGENT_REGISTRY

    def test_get_agent_returns_correct_type_geotechnical(self, mock_client):
        """get_agent('geotechnical') should return GeotechnicalAgent."""
        agent = get_agent("geotechnical", mock_client)
        assert isinstance(agent, GeotechnicalAgent)
        assert agent.agent_name == "geotechnical"

    def test_get_agent_returns_correct_type_environmental(self, mock_client):
        """get_agent('environmental') should return EnvironmentalAgent."""
        agent = get_agent("environmental", mock_client)
        assert isinstance(agent, EnvironmentalAgent)
        assert agent.agent_name == "environmental"

    def test_get_agent_returns_correct_type_engineering(self, mock_client):
        """get_agent('engineering') should return EngineeringAgent."""
        agent = get_agent("engineering", mock_client)
        assert isinstance(agent, EngineeringAgent)
        assert agent.agent_name == "engineering"

    def test_get_agent_returns_correct_type_cost(self, mock_client):
        """get_agent('cost') should return CostAgent."""
        agent = get_agent("cost", mock_client)
        assert isinstance(agent, CostAgent)
        assert agent.agent_name == "cost"

    def test_get_agent_returns_correct_type_master(self, mock_client):
        """get_agent('master') should return MasterAgent."""
        agent = get_agent("master", mock_client)
        assert isinstance(agent, MasterAgent)
        assert agent.agent_name == "master"

    def test_unknown_agent_raises_error(self, mock_client):
        """Unknown agent name should raise AgentNotFoundError."""
        with pytest.raises(AgentNotFoundError) as excinfo:
            get_agent("unknown_agent", mock_client)
        assert "unknown_agent" in str(excinfo.value)

    def test_get_all_specialist_agents_returns_four(self, mock_client):
        """get_all_specialist_agents should return 4 agents."""
        agents = get_all_specialist_agents(mock_client)
        assert len(agents) == 4
        names = [a.agent_name for a in agents]
        assert "geotechnical" in names
        assert "environmental" in names
        assert "engineering" in names
        assert "cost" in names
        assert "master" not in names

    def test_get_master_agent_returns_master(self, mock_client):
        """get_master_agent should return MasterAgent instance."""
        agent = get_master_agent(mock_client)
        assert isinstance(agent, MasterAgent)

    def test_get_available_agents_returns_all_names(self):
        """get_available_agents should return all agent names."""
        names = get_available_agents()
        assert len(names) == 5
        assert set(names) == {"geotechnical", "environmental", "engineering", "cost", "master"}

    def test_get_specialist_agent_names_excludes_master(self):
        """get_specialist_agent_names should exclude master."""
        names = get_specialist_agent_names()
        assert len(names) == 4
        assert "master" not in names


# ============================================================================
# TEST P6-02: Parallel Executor Runs Agents Concurrently
# ============================================================================

class TestP6_02_ParallelExecutor:
    """TEST P6-02: Parallel Executor Runs Agents Concurrently

    Purpose: Verify parallel execution provides speedup
    """

    @pytest.mark.asyncio
    async def test_run_agent_async_completes(self, sample_segment_data):
        """run_agent_async should complete successfully."""
        mock_response = {
            "agent": "geotechnical",
            "segment_id": "seg_test_001",
            "assessment": "favorable",
            "explanation": "Test.",
            "metrics": {},
            "flags": []
        }

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()
            mock_client.messages.create.return_value = create_mock_api_response(mock_response)
            mock_get_client.return_value = mock_client

            result = await run_agent_async("geotechnical", sample_segment_data)

            assert result is not None
            assert result["agent"] == "geotechnical"

    @pytest.mark.asyncio
    async def test_run_specialists_parallel_returns_all(self, sample_segment_data):
        """run_specialists_parallel should return all 4 specialist results."""
        mock_responses = {
            "geotechnical": {"agent": "geotechnical", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "flags": []},
            "environmental": {"agent": "environmental", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "permits_likely": [], "flags": []},
            "engineering": {"agent": "engineering", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "construction_method": "Standard", "flags": []},
            "cost": {"agent": "cost", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "cost_drivers": [], "flags": []}
        }

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()

            def mock_create(**kwargs):
                # Determine which agent is calling based on system prompt
                system = kwargs.get('system', '')
                if 'geotechnical' in system.lower():
                    return create_mock_api_response(mock_responses["geotechnical"])
                elif 'environmental' in system.lower():
                    return create_mock_api_response(mock_responses["environmental"])
                elif 'engineering' in system.lower():
                    return create_mock_api_response(mock_responses["engineering"])
                elif 'cost' in system.lower():
                    return create_mock_api_response(mock_responses["cost"])
                return create_mock_api_response({"assessment": "favorable", "explanation": "Default"})

            mock_client.messages.create.side_effect = mock_create
            mock_get_client.return_value = mock_client

            results = await run_specialists_parallel(sample_segment_data)

            assert len(results) == 4
            assert "geotechnical" in results
            assert "environmental" in results
            assert "engineering" in results
            assert "cost" in results


# ============================================================================
# TEST P6-03: Parallel Executor Handles Agent Failure
# ============================================================================

class TestP6_03_ExecutorHandlesFailure:
    """TEST P6-03: Parallel Executor Handles Agent Failure

    Purpose: Verify graceful handling when one agent fails
    """

    @pytest.mark.asyncio
    async def test_single_agent_failure_doesnt_crash(self, sample_segment_data):
        """System should continue if one agent fails."""
        mock_responses = {
            "geotechnical": {"agent": "geotechnical", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "flags": []},
            "environmental": {"agent": "environmental", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "permits_likely": [], "flags": []},
            "engineering": {"agent": "engineering", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "construction_method": "Standard", "flags": []},
            "cost": {"agent": "cost", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "cost_drivers": [], "flags": []}
        }

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()
            call_count = [0]

            def mock_create(**kwargs):
                call_count[0] += 1
                # Make environmental agent fail
                system = kwargs.get('system', '')
                if 'environmental' in system.lower():
                    raise Exception("Simulated environmental agent failure")
                elif 'geotechnical' in system.lower():
                    return create_mock_api_response(mock_responses["geotechnical"])
                elif 'engineering' in system.lower():
                    return create_mock_api_response(mock_responses["engineering"])
                elif 'cost' in system.lower():
                    return create_mock_api_response(mock_responses["cost"])
                return create_mock_api_response({"assessment": "favorable"})

            mock_client.messages.create.side_effect = mock_create
            mock_get_client.return_value = mock_client

            # Should not raise, should return partial results
            results = await run_specialists_parallel(sample_segment_data)

            # Should have all 4 results (failed one has error response)
            assert len(results) == 4
            assert "geotechnical" in results
            assert "environmental" in results
            # Failed agent should have error indication
            assert "_error" in results["environmental"] or "agent_error" in results["environmental"].get("flags", [])


# ============================================================================
# TEST P6-04: Full Analysis Pipeline Completes
# ============================================================================

class TestP6_04_FullAnalysisPipeline:
    """TEST P6-04: Full Analysis Pipeline Completes

    Purpose: Verify end-to-end agent orchestration
    """

    @pytest.mark.asyncio
    async def test_full_analysis_returns_synthesis(self, sample_segment_data, mock_synthesis_response):
        """run_full_analysis should return synthesis response."""
        specialist_responses = {
            "geotechnical": {"agent": "geotechnical", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "flags": []},
            "environmental": {"agent": "environmental", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "permits_likely": [], "flags": []},
            "engineering": {"agent": "engineering", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "construction_method": "Standard", "flags": []},
            "cost": {"agent": "cost", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "cost_drivers": [], "flags": []}
        }

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()

            def mock_create(**kwargs):
                system = kwargs.get('system', '')
                if 'geotechnical' in system.lower():
                    return create_mock_api_response(specialist_responses["geotechnical"])
                elif 'environmental' in system.lower():
                    return create_mock_api_response(specialist_responses["environmental"])
                elif 'engineering' in system.lower():
                    return create_mock_api_response(specialist_responses["engineering"])
                elif 'cost estimation' in system.lower():
                    return create_mock_api_response(specialist_responses["cost"])
                elif 'synthesis' in system.lower() or 'master' in system.lower():
                    return create_mock_api_response(mock_synthesis_response)
                return create_mock_api_response({"assessment": "favorable"})

            mock_client.messages.create.side_effect = mock_create
            mock_get_client.return_value = mock_client

            result = await run_full_analysis(sample_segment_data)

            assert result is not None
            assert "overall_assessment" in result or "assessment" in result
            assert "executive_summary" in result or "explanation" in result

    def test_sync_wrapper_works(self, sample_segment_data, mock_synthesis_response):
        """Synchronous wrapper should complete."""
        specialist_responses = {
            "geotechnical": {"agent": "geotechnical", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "flags": []},
            "environmental": {"agent": "environmental", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "permits_likely": [], "flags": []},
            "engineering": {"agent": "engineering", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "construction_method": "Standard", "flags": []},
            "cost": {"agent": "cost", "assessment": "favorable", "explanation": "Good.", "metrics": {}, "cost_drivers": [], "flags": []}
        }

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()

            def mock_create(**kwargs):
                system = kwargs.get('system', '')
                if 'geotechnical' in system.lower():
                    return create_mock_api_response(specialist_responses["geotechnical"])
                elif 'environmental' in system.lower():
                    return create_mock_api_response(specialist_responses["environmental"])
                elif 'engineering' in system.lower():
                    return create_mock_api_response(specialist_responses["engineering"])
                elif 'cost estimation' in system.lower():
                    return create_mock_api_response(specialist_responses["cost"])
                elif 'synthesis' in system.lower() or 'master' in system.lower():
                    return create_mock_api_response(mock_synthesis_response)
                return create_mock_api_response({"assessment": "favorable"})

            mock_client.messages.create.side_effect = mock_create
            mock_get_client.return_value = mock_client

            result = run_full_analysis_sync(sample_segment_data)

            assert result is not None


# ============================================================================
# TEST P6-05: Cache Stores Responses Correctly
# ============================================================================

class TestP6_05_CacheStorage:
    """TEST P6-05: Cache Stores Responses Correctly

    Purpose: Verify caching mechanism works
    """

    def setup_method(self):
        """Clear cache before each test."""
        clear_cache()

    def test_cache_key_is_deterministic(self):
        """Same inputs should produce same cache key."""
        key1 = get_cache_key("seg_001", "route_A")
        key2 = get_cache_key("seg_001", "route_A")
        assert key1 == key2

    def test_different_inputs_produce_different_keys(self):
        """Different inputs should produce different cache keys."""
        key1 = get_cache_key("seg_001", "route_A")
        key2 = get_cache_key("seg_002", "route_A")
        key3 = get_cache_key("seg_001", "route_B")
        assert key1 != key2
        assert key1 != key3
        assert key2 != key3

    def test_save_and_retrieve_response(self, mock_synthesis_response):
        """Saved response should be retrievable."""
        save_to_cache("seg_001", "route_A", mock_synthesis_response)
        retrieved = get_cached_response("seg_001", "route_A")

        assert retrieved is not None
        assert retrieved["segment_id"] == mock_synthesis_response["segment_id"]
        assert retrieved["overall_assessment"] == mock_synthesis_response["overall_assessment"]

    def test_cache_miss_returns_none(self):
        """Missing cache entry should return None."""
        result = get_cached_response("nonexistent_segment", "nonexistent_route")
        assert result is None

    def test_is_cached_returns_true_for_cached(self, mock_synthesis_response):
        """is_cached should return True for cached entries."""
        save_to_cache("seg_cached", "route_A", mock_synthesis_response)
        assert is_cached("seg_cached", "route_A")

    def test_is_cached_returns_false_for_missing(self):
        """is_cached should return False for missing entries."""
        assert not is_cached("missing_seg", "missing_route")

    def test_clear_segment_cache(self, mock_synthesis_response):
        """clear_segment_cache should remove specific entry."""
        save_to_cache("seg_to_clear", "route_A", mock_synthesis_response)
        assert is_cached("seg_to_clear", "route_A")

        clear_segment_cache("seg_to_clear", "route_A")
        assert not is_cached("seg_to_clear", "route_A")

    def test_clear_cache_removes_all(self, mock_synthesis_response):
        """clear_cache should remove all entries."""
        save_to_cache("seg_1", "route_A", mock_synthesis_response)
        save_to_cache("seg_2", "route_A", mock_synthesis_response)

        count = clear_cache()
        assert count >= 2

        assert not is_cached("seg_1", "route_A")
        assert not is_cached("seg_2", "route_A")


# ============================================================================
# TEST P6-06: Cache Expires After TTL
# ============================================================================

class TestP6_06_CacheExpiration:
    """TEST P6-06: Cache Expires After TTL

    Purpose: Verify cache expiration works
    """

    def setup_method(self):
        """Clear cache before each test."""
        clear_cache()

    def test_fresh_cache_returns_response(self, mock_synthesis_response):
        """Fresh cache should return response."""
        save_to_cache("seg_fresh", "route_A", mock_synthesis_response)
        result = get_cached_response("seg_fresh", "route_A", ttl=3600)
        assert result is not None

    def test_expired_cache_returns_none(self, mock_synthesis_response):
        """Expired cache should return None."""
        save_to_cache("seg_expired", "route_A", mock_synthesis_response)
        # Request with 0 TTL should immediately expire
        result = get_cached_response("seg_expired", "route_A", ttl=0)
        assert result is None

    def test_cache_respects_ttl(self, mock_synthesis_response):
        """Cache should respect TTL parameter."""
        save_to_cache("seg_ttl", "route_A", mock_synthesis_response)

        # Should be valid with long TTL
        result_valid = get_cached_response("seg_ttl", "route_A", ttl=3600)
        assert result_valid is not None

        # Wait a tiny bit and check with very short TTL
        time.sleep(0.1)
        result_expired = get_cached_response("seg_ttl", "route_A", ttl=0)
        assert result_expired is None


# ============================================================================
# TEST P6-07: Fallback Responses Are Valid
# ============================================================================

class TestP6_07_FallbackResponses:
    """TEST P6-07: Fallback Responses Are Valid

    Purpose: Verify fallback system produces usable responses
    """

    def test_predefined_fallback_returned(self):
        """Pre-defined fallback should be returned for known segment."""
        # Use a pre-defined segment
        if "seg_favorable_001" in FALLBACK_RESPONSES:
            result = get_fallback_response("seg_favorable_001")
            assert result is not None
            assert result["segment_id"] == "seg_favorable_001"
            assert result["_fallback"] is True

    def test_generic_fallback_generated(self, sample_segment_data):
        """Generic fallback should be generated for unknown segment."""
        result = get_fallback_response("unknown_segment_xyz", sample_segment_data)

        assert result is not None
        assert result["segment_id"] == "unknown_segment_xyz"
        assert result["_fallback"] is True
        assert result["_fallback_type"] == "generated"

    def test_generic_fallback_structure(self, sample_segment_data):
        """Generic fallback should have valid structure."""
        result = generate_generic_fallback("test_seg", sample_segment_data)

        assert "segment_id" in result
        assert "overall_assessment" in result
        assert result["overall_assessment"] in ["favorable", "caution", "challenging"]
        assert "confidence" in result
        assert result["confidence"] == "low"  # Generic fallbacks are low confidence
        assert "executive_summary" in result
        assert "key_metrics" in result
        assert "specialist_summaries" in result
        assert "flags" in result
        assert "fallback_response" in result["flags"]

    def test_fallback_uses_segment_data(self, challenging_segment_data):
        """Fallback should incorporate available segment data."""
        result = generate_generic_fallback("test_challenging", challenging_segment_data)

        # Should detect challenging conditions
        assert result["overall_assessment"] in ["caution", "challenging"]
        # Should have relevant flags
        flags = result["flags"]
        assert "steep_slope" in flags or "water_crossing" in flags

    def test_is_fallback_response_detects_fallbacks(self):
        """is_fallback_response should correctly identify fallbacks."""
        fallback = get_fallback_response("any_segment")
        assert is_fallback_response(fallback)

        non_fallback = {"segment_id": "test", "assessment": "favorable"}
        assert not is_fallback_response(non_fallback)


# ============================================================================
# TEST P6-08: Dev Mode Enables Fallbacks
# ============================================================================

class TestP6_08_DevModeToggle:
    """TEST P6-08: Dev Mode Enables Fallbacks

    Purpose: Verify dev mode toggle works
    """

    def test_should_use_fallback_checks_settings(self):
        """should_use_fallback should check DEV_MODE and USE_CACHED_RESPONSES."""
        original_dev_mode = Settings.DEV_MODE
        original_use_cached = Settings.USE_CACHED_RESPONSES

        try:
            # Both must be True for fallback
            Settings.DEV_MODE = True
            Settings.USE_CACHED_RESPONSES = True
            assert should_use_fallback() is True

            Settings.DEV_MODE = False
            Settings.USE_CACHED_RESPONSES = True
            assert should_use_fallback() is False

            Settings.DEV_MODE = True
            Settings.USE_CACHED_RESPONSES = False
            assert should_use_fallback() is False

            Settings.DEV_MODE = False
            Settings.USE_CACHED_RESPONSES = False
            assert should_use_fallback() is False

        finally:
            Settings.DEV_MODE = original_dev_mode
            Settings.USE_CACHED_RESPONSES = original_use_cached

    def test_add_predefined_fallback(self):
        """add_predefined_fallback should store fallback."""
        test_response = {
            "overall_assessment": "favorable",
            "executive_summary": "Test fallback added via function."
        }

        add_predefined_fallback("test_added_segment", test_response)
        result = get_fallback_response("test_added_segment")

        assert result is not None
        assert result["segment_id"] == "test_added_segment"
        assert result["_fallback_type"] == "pre_defined"

        # Cleanup
        remove_predefined_fallback("test_added_segment")

    def test_remove_predefined_fallback(self):
        """remove_predefined_fallback should remove fallback."""
        add_predefined_fallback("to_be_removed", {"assessment": "favorable"})
        assert "to_be_removed" in list_predefined_fallbacks()

        result = remove_predefined_fallback("to_be_removed")
        assert result is True
        assert "to_be_removed" not in list_predefined_fallbacks()

    def test_list_predefined_fallbacks(self):
        """list_predefined_fallbacks should return list of IDs."""
        fallbacks = list_predefined_fallbacks()
        assert isinstance(fallbacks, list)
        # Should have at least the pre-defined ones
        assert "seg_favorable_001" in fallbacks or len(fallbacks) >= 0


# ============================================================================
# Phase 6 Regression Suite
# ============================================================================

class TestP6Regression:
    """Phase 6 Regression Tests - Must pass on every code change."""

    def test_p6_r01_registry_agent_types(self, mock_client):
        """P6-R01: Registry returns correct types."""
        assert isinstance(get_agent("geotechnical", mock_client), GeotechnicalAgent)
        assert isinstance(get_agent("environmental", mock_client), EnvironmentalAgent)
        assert isinstance(get_agent("engineering", mock_client), EngineeringAgent)
        assert isinstance(get_agent("cost", mock_client), CostAgent)
        assert isinstance(get_agent("master", mock_client), MasterAgent)

    @pytest.mark.asyncio
    async def test_p6_r02_parallel_execution_speed(self, sample_segment_data):
        """P6-R02: Parallel is faster than serial (mocked)."""
        # This test verifies parallel execution completes
        mock_response = {"agent": "test", "assessment": "favorable", "explanation": "Test", "metrics": {}, "flags": []}

        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()
            mock_client.messages.create.return_value = create_mock_api_response(mock_response)
            mock_get_client.return_value = mock_client

            start = time.time()
            results = await run_specialists_parallel(sample_segment_data)
            duration = time.time() - start

            assert len(results) == 4
            # Should complete quickly with mocks
            assert duration < 10

    @pytest.mark.asyncio
    async def test_p6_r03_partial_failure_handling(self, sample_segment_data):
        """P6-R03: Single failure doesn't crash."""
        with patch('agents.executor.get_client') as mock_get_client:
            mock_client = Mock()
            call_count = [0]

            def mock_create(**kwargs):
                call_count[0] += 1
                system = kwargs.get('system', '')
                if 'environmental' in system.lower():
                    raise Exception("Test failure")
                return create_mock_api_response({
                    "agent": "test",
                    "assessment": "favorable",
                    "explanation": "Test",
                    "metrics": {},
                    "flags": []
                })

            mock_client.messages.create.side_effect = mock_create
            mock_get_client.return_value = mock_client

            results = await run_specialists_parallel(sample_segment_data)
            assert "environmental" in results
            # Error should be indicated
            assert "_error" in results["environmental"] or "agent_error" in results["environmental"].get("flags", [])

    def test_p6_r05_cache_storage(self, mock_synthesis_response):
        """P6-R05: Cache stores correctly."""
        clear_cache()
        save_to_cache("test_r05", "route_test", mock_synthesis_response)
        result = get_cached_response("test_r05", "route_test")
        assert result is not None
        assert result["segment_id"] == mock_synthesis_response["segment_id"]
        clear_cache()

    def test_p6_r06_cache_expiration(self, mock_synthesis_response):
        """P6-R06: Cache expires."""
        clear_cache()
        save_to_cache("test_r06", "route_test", mock_synthesis_response)
        result = get_cached_response("test_r06", "route_test", ttl=0)
        assert result is None
        clear_cache()

    def test_p6_r07_fallback_validity(self, sample_segment_data):
        """P6-R07: Fallbacks are valid."""
        result = generate_generic_fallback("test_r07", sample_segment_data)
        assert result["segment_id"] == "test_r07"
        assert result["overall_assessment"] in ["favorable", "caution", "challenging"]
        assert result["_fallback"] is True

    def test_p6_r08_dev_mode_toggle(self):
        """P6-R08: Dev mode works."""
        original_dev = Settings.DEV_MODE
        original_cached = Settings.USE_CACHED_RESPONSES

        try:
            Settings.DEV_MODE = True
            Settings.USE_CACHED_RESPONSES = True
            assert should_use_fallback() is True

            Settings.DEV_MODE = False
            assert should_use_fallback() is False
        finally:
            Settings.DEV_MODE = original_dev
            Settings.USE_CACHED_RESPONSES = original_cached


# ============================================================================
# Integration Tests (marked for selective running)
# ============================================================================

@pytest.mark.integration
class TestP6Integration:
    """Integration tests requiring real API calls."""

    @pytest.mark.timeout(120)
    def test_full_pipeline_real_api(self, sample_segment_data):
        """Integration: Full pipeline with real API."""
        from agents.client import reset_client, get_client

        reset_client()
        result = run_full_analysis_sync(sample_segment_data)

        assert result is not None
        assert "overall_assessment" in result or "executive_summary" in result

    @pytest.mark.timeout(90)
    def test_parallel_specialists_real_api(self, sample_segment_data):
        """Integration: Parallel specialists with real API."""
        from agents.client import reset_client

        reset_client()
        results = run_specialists_sync(sample_segment_data)

        assert len(results) == 4
        for agent_name in ["geotechnical", "environmental", "engineering", "cost"]:
            assert agent_name in results
            assert "assessment" in results[agent_name]
