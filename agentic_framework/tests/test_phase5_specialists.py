"""Phase 5 Tests: Specialist Agents

Gate tests and regression suite for specialist agents (Geotechnical,
Environmental, Engineering, Cost) and Master Synthesis Agent.
"""
import json
import pytest
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import Mock, MagicMock, patch
import anthropic

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.geotechnical import GeotechnicalAgent
from agents.environmental import EnvironmentalAgent
from agents.engineering import EngineeringAgent
from agents.cost import CostAgent
from agents.master import MasterAgent
from agents.client import get_client, reset_client
from agents.exceptions import APICallError, AgentTimeoutError
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
    """Sample segment data with complete structure for testing."""
    return {
        "id": "seg_001",
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
def steep_segment_data():
    """Segment with steep slope for testing flagging behavior."""
    return {
        "id": "seg_steep",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 500.0,
            "start_elevation_m": 100.0,
            "end_elevation_m": 200.0,
            "avg_slope_degrees": 20.0,
            "max_slope_degrees": 25.0,
            "slope_percent": 36.4,
            "max_slope_percent": 46.6
        },
        "properties": {
            "terrain_class": "steep_slope",
            "land_use": "forest",
            "soil_type": "rocky",
            "geological_zone": "volcanic",
            "raw_properties": {}
        }
    }


@pytest.fixture
def protected_area_segment():
    """Segment near protected area for testing environmental flagging."""
    return {
        "id": "seg_protected",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 800.0,
            "start_elevation_m": 120.0,
            "end_elevation_m": 125.0,
            "avg_slope_degrees": 0.5,
            "max_slope_degrees": 1.0
        },
        "properties": {
            "terrain_class": "flat",
            "land_use": "wetland",
            "protected_area_distance_m": 50.0,
            "water_body_distance_m": 10.0,
            "water_crossing": True,
            "river_width_m": 15.0,
            "raw_properties": {
                "wetland": True,
                "habitat_sensitivity": "high"
            }
        }
    }


@pytest.fixture
def crossing_segment_data():
    """Segment with crossings for testing engineering assessment."""
    return {
        "id": "seg_crossings",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484912.5, 4933246.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 1000.0,
            "start_elevation_m": 110.0,
            "end_elevation_m": 115.0,
            "avg_slope_degrees": 0.5,
            "max_slope_degrees": 1.5
        },
        "properties": {
            "terrain_class": "flat",
            "land_use": "industrial",
            "road_crossing": True,
            "water_crossing": True,
            "river_width_m": 25.0,
            "raw_properties": {
                "railway_crossing": True,
                "road_type": "asphalt",
                "crossing_angle": 85,
                "existing_row": True
            }
        }
    }


@pytest.fixture
def mock_geotechnical_response():
    """Mock response from geotechnical agent."""
    return {
        "agent": "geotechnical",
        "segment_id": "seg_001",
        "assessment": "favorable",
        "explanation": "Terrain is suitable for standard pipeline construction with 2.6% slope.",
        "metrics": {
            "slope_percent": 2.6,
            "slope_degrees": 1.5,
            "elevation_change_m": 25.0,
            "terrain_class": "rolling_hills",
            "soil_stability": "stable"
        },
        "flags": []
    }


@pytest.fixture
def mock_environmental_response():
    """Mock response from environmental agent."""
    return {
        "agent": "environmental",
        "segment_id": "seg_001",
        "assessment": "favorable",
        "explanation": "Agricultural land with adequate distance from protected areas (500m).",
        "metrics": {
            "protected_area_distance_m": 500.0,
            "land_use_class": "agricultural",
            "water_body_proximity_m": 200.0,
            "habitat_sensitivity": "low"
        },
        "permits_likely": ["Standard EIA"],
        "flags": []
    }


@pytest.fixture
def mock_engineering_response():
    """Mock response from engineering agent."""
    return {
        "agent": "engineering",
        "segment_id": "seg_001",
        "assessment": "favorable",
        "explanation": "Standard trenching applicable, no special crossings required.",
        "metrics": {
            "length_m": 1500.0,
            "slope_percent": 2.6,
            "crossing_count": 0,
            "access_rating": "good"
        },
        "construction_method": "Standard Trenching",
        "crossings": [],
        "flags": []
    }


@pytest.fixture
def mock_cost_response():
    """Mock response from cost agent."""
    return {
        "agent": "cost",
        "segment_id": "seg_001",
        "assessment": "favorable",
        "explanation": "Cost estimate at baseline due to favorable terrain and no crossings.",
        "metrics": {
            "base_cost_per_km": 1000000,
            "terrain_multiplier": 1.0,
            "length_km": 1.5,
            "subtotal_terrain": 1500000,
            "crossing_adders": 0,
            "other_adders": 0,
            "total_estimate": 1500000,
            "cost_per_km_adjusted": 1000000
        },
        "cost_drivers": ["Standard terrain"],
        "optimization_notes": "No optimization required for favorable conditions.",
        "confidence": "high",
        "flags": []
    }


@pytest.fixture
def all_agent_responses(mock_geotechnical_response, mock_environmental_response,
                        mock_engineering_response, mock_cost_response):
    """All agent responses for master synthesis testing."""
    return {
        "geotechnical": mock_geotechnical_response,
        "environmental": mock_environmental_response,
        "engineering": mock_engineering_response,
        "cost": mock_cost_response
    }


def create_mock_api_response(json_content: dict) -> Mock:
    """Helper to create mock API response."""
    mock_response = Mock()
    mock_response.content = [Mock(text=json.dumps(json_content))]
    return mock_response


# ============================================================================
# TEST P5-01: Geotechnical Agent Returns Valid Response
# ============================================================================

class TestP5_01_GeotechnicalAgentResponse:
    """TEST P5-01: Geotechnical Agent Returns Valid Response

    Purpose: Verify geotechnical agent produces correct output
    """

    def test_agent_name_is_geotechnical(self, mock_client):
        """Agent name should be 'geotechnical'."""
        agent = GeotechnicalAgent(mock_client)
        assert agent.agent_name == "geotechnical"

    def test_prompt_file_is_correct(self, mock_client):
        """Prompt file should be geotechnical.txt."""
        agent = GeotechnicalAgent(mock_client)
        assert agent.prompt_file == "geotechnical.txt"

    def test_response_contains_required_fields(self, mock_client, sample_segment_data):
        """Response should contain all required fields."""
        mock_response_data = {
            "agent": "geotechnical",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Good terrain conditions.",
            "metrics": {
                "slope_percent": 2.6,
                "slope_degrees": 1.5,
                "elevation_change_m": 25,
                "terrain_class": "rolling_hills",
                "soil_stability": "stable"
            },
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = GeotechnicalAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert result["agent"] == "geotechnical"
        assert result["assessment"] in ["favorable", "caution", "challenging"]
        assert "explanation" in result
        assert len(result["explanation"]) > 0
        assert "metrics" in result
        assert "flags" in result
        assert isinstance(result["flags"], list)

    def test_user_message_contains_segment_data(self, mock_client, sample_segment_data):
        """User message should contain segment information."""
        agent = GeotechnicalAgent(mock_client)
        message = agent._build_user_message(sample_segment_data)

        assert "seg_001" in message
        assert "1500" in message  # length
        assert "150" in message  # elevation
        assert "rolling_hills" in message


# ============================================================================
# TEST P5-02: Geotechnical Agent Flags Steep Slopes
# ============================================================================

class TestP5_02_GeotechnicalAgentFlagsSteepSlopes:
    """TEST P5-02: Geotechnical Agent Flags Steep Slopes

    Purpose: Verify agent identifies problematic terrain
    """

    def test_steep_slope_flagged_as_challenging(self, mock_client, steep_segment_data):
        """Steep slope should result in caution or challenging assessment."""
        mock_response_data = {
            "agent": "geotechnical",
            "segment_id": "seg_steep",
            "assessment": "challenging",
            "explanation": "Slope of 36.4% exceeds maximum allowable 20%. Special equipment required.",
            "metrics": {
                "slope_percent": 36.4,
                "slope_degrees": 20.0,
                "elevation_change_m": 100,
                "terrain_class": "steep_slope",
                "soil_stability": "unstable"
            },
            "flags": ["SLOPE_EXCEEDS_20_PERCENT"]
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = GeotechnicalAgent(mock_client)
        result = agent.analyze(steep_segment_data)

        assert result["assessment"] in ["caution", "challenging"]

    def test_gentle_slope_favorable(self, mock_client, sample_segment_data):
        """Gentle slope should result in favorable assessment."""
        mock_response_data = {
            "agent": "geotechnical",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Gentle slope of 2.6% suitable for standard construction.",
            "metrics": {},
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = GeotechnicalAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert result["assessment"] == "favorable"

    def test_user_message_includes_slope_data(self, mock_client, steep_segment_data):
        """User message should contain slope information for flagging."""
        agent = GeotechnicalAgent(mock_client)
        message = agent._build_user_message(steep_segment_data)

        # Should include slope percentage or degrees
        assert "20" in message or "36" in message


# ============================================================================
# TEST P5-03: Environmental Agent Returns Valid Response
# ============================================================================

class TestP5_03_EnvironmentalAgentResponse:
    """TEST P5-03: Environmental Agent Returns Valid Response

    Purpose: Verify environmental agent produces correct output
    """

    def test_agent_name_is_environmental(self, mock_client):
        """Agent name should be 'environmental'."""
        agent = EnvironmentalAgent(mock_client)
        assert agent.agent_name == "environmental"

    def test_prompt_file_is_correct(self, mock_client):
        """Prompt file should be environmental.txt."""
        agent = EnvironmentalAgent(mock_client)
        assert agent.prompt_file == "environmental.txt"

    def test_response_contains_permits_likely(self, mock_client, sample_segment_data):
        """Response should contain permits_likely field."""
        mock_response_data = {
            "agent": "environmental",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Standard agricultural land, minimal environmental concerns.",
            "metrics": {},
            "permits_likely": ["Standard EIA", "Agricultural Land Conversion"],
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EnvironmentalAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert "permits_likely" in result
        assert isinstance(result["permits_likely"], list)


# ============================================================================
# TEST P5-04: Environmental Agent Flags Protected Areas
# ============================================================================

class TestP5_04_EnvironmentalAgentFlagsProtectedAreas:
    """TEST P5-04: Environmental Agent Flags Protected Areas

    Purpose: Verify agent identifies environmental concerns
    """

    def test_close_protected_area_flagged(self, mock_client, protected_area_segment):
        """Close proximity to protected area should be flagged."""
        mock_response_data = {
            "agent": "environmental",
            "segment_id": "seg_protected",
            "assessment": "challenging",
            "explanation": "Segment is within 50m of protected area, likely requiring Natura 2000 assessment.",
            "metrics": {
                "protected_area_distance_m": 50.0,
                "habitat_sensitivity": "high"
            },
            "permits_likely": ["Natura 2000 Appropriate Assessment", "EIA", "Wetland Mitigation Permit"],
            "flags": ["PROTECTED_AREA_BUFFER", "WETLAND_IMPACT", "HABITAT_DISRUPTION"]
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EnvironmentalAgent(mock_client)
        result = agent.analyze(protected_area_segment)

        assert result["assessment"] in ["caution", "challenging"]

    def test_user_message_includes_environmental_data(self, mock_client, protected_area_segment):
        """User message should include environmental distance data."""
        agent = EnvironmentalAgent(mock_client)
        message = agent._build_user_message(protected_area_segment)

        assert "50" in message  # protected area distance
        assert "wetland" in message.lower() or "water" in message.lower()


# ============================================================================
# TEST P5-05: Engineering Agent Returns Valid Response
# ============================================================================

class TestP5_05_EngineeringAgentResponse:
    """TEST P5-05: Engineering Agent Returns Valid Response

    Purpose: Verify engineering agent produces correct output
    """

    def test_agent_name_is_engineering(self, mock_client):
        """Agent name should be 'engineering'."""
        agent = EngineeringAgent(mock_client)
        assert agent.agent_name == "engineering"

    def test_prompt_file_is_correct(self, mock_client):
        """Prompt file should be engineering.txt."""
        agent = EngineeringAgent(mock_client)
        assert agent.prompt_file == "engineering.txt"

    def test_response_contains_construction_method(self, mock_client, sample_segment_data):
        """Response should contain construction_method field."""
        mock_response_data = {
            "agent": "engineering",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Standard trenching applicable.",
            "metrics": {},
            "construction_method": "Standard Trenching",
            "crossings": [],
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EngineeringAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert "construction_method" in result
        assert isinstance(result["construction_method"], str)


# ============================================================================
# TEST P5-06: Engineering Agent Recommends Appropriate Methods
# ============================================================================

class TestP5_06_EngineeringAgentMethodSelection:
    """TEST P5-06: Engineering Agent Recommends Appropriate Methods

    Purpose: Verify agent recommends sensible construction approaches
    """

    def test_river_crossing_gets_special_method(self, mock_client, crossing_segment_data):
        """River crossing should get HDD or special method recommendation."""
        mock_response_data = {
            "agent": "engineering",
            "segment_id": "seg_crossings",
            "assessment": "caution",
            "explanation": "Multiple crossings require specialized methods. Railway requires HDD.",
            "metrics": {
                "crossing_count": 3
            },
            "construction_method": "Mixed Methods",
            "crossings": [
                {"type": "railway", "method": "HDD", "notes": "Mandatory trenchless"},
                {"type": "road", "method": "Thrust Boring", "notes": "Asphalt road"},
                {"type": "river", "method": "HDD", "notes": "25m width"}
            ],
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EngineeringAgent(mock_client)
        result = agent.analyze(crossing_segment_data)

        assert "construction_method" in result

    def test_simple_segment_gets_standard_method(self, mock_client, sample_segment_data):
        """Simple flat segment should get standard trenching."""
        mock_response_data = {
            "agent": "engineering",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Standard trenching applicable for flat terrain.",
            "metrics": {},
            "construction_method": "Standard Trenching",
            "crossings": [],
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EngineeringAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert "trenching" in result.get("construction_method", "").lower() or \
               "standard" in result.get("construction_method", "").lower()

    def test_user_message_includes_crossing_info(self, mock_client, crossing_segment_data):
        """User message should include crossing information."""
        agent = EngineeringAgent(mock_client)
        message = agent._build_user_message(crossing_segment_data)

        # Should mention crossings
        assert "crossing" in message.lower() or "road" in message.lower()


# ============================================================================
# TEST P5-07: Cost Agent Receives Context from Other Agents
# ============================================================================

class TestP5_07_CostAgentUsesContext:
    """TEST P5-07: Cost Agent Receives Context from Other Agents

    Purpose: Verify cost agent uses specialist context
    """

    def test_cost_agent_accepts_context(self, mock_client, sample_segment_data,
                                        mock_geotechnical_response, mock_environmental_response,
                                        mock_engineering_response):
        """Cost agent should accept and use context from other agents."""
        context = {
            "geotechnical": mock_geotechnical_response,
            "environmental": mock_environmental_response,
            "engineering": mock_engineering_response
        }

        mock_response_data = {
            "agent": "cost",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Cost at baseline due to favorable specialist assessments.",
            "metrics": {
                "total_estimate": 1500000
            },
            "cost_drivers": ["Standard terrain", "No crossings"],
            "optimization_notes": "",
            "confidence": "high",
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = CostAgent(mock_client)
        result = agent.analyze(sample_segment_data, context=context)

        assert result is not None
        assert "metrics" in result

    def test_user_message_includes_other_agent_data(self, mock_client, sample_segment_data,
                                                    mock_geotechnical_response,
                                                    mock_engineering_response):
        """User message should include summaries from other agents."""
        context = {
            "geotechnical": mock_geotechnical_response,
            "engineering": mock_engineering_response
        }

        agent = CostAgent(mock_client)
        message = agent._build_user_message(sample_segment_data, context)

        # Should include references to other agent assessments
        assert "geotechnical" in message.lower()
        assert "engineering" in message.lower()

    def test_cost_estimate_is_numeric(self, mock_client, sample_segment_data):
        """Cost estimate should be numeric."""
        mock_response_data = {
            "agent": "cost",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Standard cost estimate.",
            "metrics": {
                "total_estimate": 1500000,
                "cost_per_km_adjusted": 1000000
            },
            "cost_drivers": [],
            "confidence": "high",
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = CostAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        total_estimate = result.get("metrics", {}).get("total_estimate")
        assert total_estimate is not None
        assert isinstance(total_estimate, (int, float))


# ============================================================================
# TEST P5-08: Cost Agent Provides Optimization Notes
# ============================================================================

class TestP5_08_CostAgentOptimization:
    """TEST P5-08: Cost Agent Provides Optimization Notes

    Purpose: Verify cost agent suggests improvements
    """

    def test_optimization_notes_present_for_issues(self, mock_client, steep_segment_data):
        """Problematic segments should get optimization suggestions."""
        context = {
            "geotechnical": {
                "assessment": "challenging",
                "flags": ["SLOPE_EXCEEDS_20_PERCENT"],
                "explanation": "Steep slope requiring special equipment"
            },
            "engineering": {
                "assessment": "challenging",
                "construction_method": "Special Equipment",
                "flags": ["SLOPE_EXCEEDS_LIMIT"]
            }
        }

        mock_response_data = {
            "agent": "cost",
            "segment_id": "seg_steep",
            "assessment": "challenging",
            "explanation": "High cost due to steep terrain requiring special equipment.",
            "metrics": {
                "total_estimate": 2400000,
                "terrain_multiplier": 1.6
            },
            "cost_drivers": ["Steep terrain", "Special equipment"],
            "optimization_notes": "Consider route realignment to avoid steepest section.",
            "confidence": "medium",
            "flags": ["HIGH_COST_SEGMENT", "TERRAIN_COST_IMPACT"]
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = CostAgent(mock_client)
        result = agent.analyze(steep_segment_data, context=context)

        # Optimization notes may be present for problematic segments
        assert "optimization_notes" in result or "cost_drivers" in result


# ============================================================================
# TEST P5-09: Master Agent Synthesizes All Inputs
# ============================================================================

class TestP5_09_MasterAgentSynthesis:
    """TEST P5-09: Master Agent Synthesizes All Inputs

    Purpose: Verify master creates comprehensive synthesis
    """

    def test_master_agent_name(self, mock_client):
        """Agent name should be 'master'."""
        agent = MasterAgent(mock_client)
        assert agent.agent_name == "master"

    def test_master_uses_master_model(self, mock_client):
        """Master agent should use the master model."""
        agent = MasterAgent(mock_client)
        assert agent.model == Settings.ANTHROPIC_MODEL_MASTER

    def test_synthesis_contains_all_specialist_summaries(
            self, mock_client, sample_segment_data, all_agent_responses):
        """Synthesis should contain summaries from all specialists."""
        mock_response_data = {
            "segment_id": "seg_001",
            "overall_assessment": "favorable",
            "confidence": "high",
            "executive_summary": "Segment shows favorable conditions across all domains.",
            "key_metrics": {
                "length_km": 1.5,
                "avg_slope": "2.6%",
                "terrain": "rolling_hills",
                "land_use": "agricultural",
                "construction_method": "Standard Trenching",
                "estimated_cost": "€1,500,000",
                "crossing_count": 0
            },
            "specialist_summaries": {
                "geotechnical": "Terrain suitable for standard construction.",
                "environmental": "Agricultural land with adequate buffer from protected areas.",
                "engineering": "Standard trenching applicable, no crossings.",
                "cost": "Cost at baseline, no significant adders."
            },
            "saipem_compliance": {
                "criteria_met": [1, 2, 3, 6, 8],
                "criteria_violated": [],
                "compliance_notes": "Segment meets all applicable criteria."
            },
            "flags": [],
            "recommendations": [
                "Proceed with standard construction approach.",
                "Verify land access agreements with property owners."
            ],
            "conflicts": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = MasterAgent(mock_client)
        result = agent.synthesize(sample_segment_data, all_agent_responses)

        assert "specialist_summaries" in result
        assert "geotechnical" in result["specialist_summaries"]
        assert "environmental" in result["specialist_summaries"]
        assert "engineering" in result["specialist_summaries"]
        assert "cost" in result["specialist_summaries"]

    def test_synthesis_has_executive_summary(
            self, mock_client, sample_segment_data, all_agent_responses):
        """Synthesis should have executive summary."""
        mock_response_data = {
            "segment_id": "seg_001",
            "overall_assessment": "favorable",
            "confidence": "high",
            "executive_summary": "Favorable segment with good terrain and no significant concerns.",
            "key_metrics": {},
            "specialist_summaries": {
                "geotechnical": "",
                "environmental": "",
                "engineering": "",
                "cost": ""
            },
            "flags": [],
            "recommendations": [],
            "conflicts": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = MasterAgent(mock_client)
        result = agent.synthesize(sample_segment_data, all_agent_responses)

        assert "executive_summary" in result
        assert len(result["executive_summary"]) > 0

    def test_synthesis_has_recommendations(
            self, mock_client, sample_segment_data, all_agent_responses):
        """Synthesis should have recommendations list."""
        mock_response_data = {
            "segment_id": "seg_001",
            "overall_assessment": "favorable",
            "confidence": "high",
            "executive_summary": "Good segment.",
            "key_metrics": {},
            "specialist_summaries": {},
            "flags": [],
            "recommendations": ["Proceed with construction", "Monitor water levels"],
            "conflicts": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = MasterAgent(mock_client)
        result = agent.synthesize(sample_segment_data, all_agent_responses)

        assert "recommendations" in result
        assert isinstance(result["recommendations"], list)


# ============================================================================
# TEST P5-10: Master Agent Resolves Conflicting Assessments
# ============================================================================

class TestP5_10_MasterAgentConflictResolution:
    """TEST P5-10: Master Agent Resolves Conflicting Assessments

    Purpose: Verify master handles disagreement between agents
    """

    def test_conflicting_assessments_handled(self, mock_client, sample_segment_data):
        """Master should handle conflicting specialist assessments."""
        conflicting_responses = {
            "geotechnical": {
                "agent": "geotechnical",
                "assessment": "favorable",
                "explanation": "Good terrain conditions.",
                "flags": []
            },
            "environmental": {
                "agent": "environmental",
                "assessment": "challenging",
                "explanation": "Protected area impact likely.",
                "flags": ["PROTECTED_AREA_BUFFER"]
            },
            "engineering": {
                "agent": "engineering",
                "assessment": "caution",
                "explanation": "Some crossings require special methods.",
                "flags": []
            },
            "cost": {
                "agent": "cost",
                "assessment": "caution",
                "explanation": "Elevated cost due to environmental mitigation.",
                "flags": []
            }
        }

        mock_response_data = {
            "segment_id": "seg_001",
            "overall_assessment": "challenging",  # Should be worst case
            "confidence": "medium",
            "executive_summary": "Mixed assessments with environmental challenges dominating.",
            "key_metrics": {},
            "specialist_summaries": {
                "geotechnical": "Favorable terrain.",
                "environmental": "Challenging due to protected area.",
                "engineering": "Moderate complexity.",
                "cost": "Elevated cost."
            },
            "flags": [
                {
                    "code": "PROTECTED_AREA_BUFFER",
                    "severity": "high",
                    "source": "environmental",
                    "description": "Route within buffer of protected area"
                }
            ],
            "recommendations": [
                "Conduct detailed environmental assessment",
                "Consider route realignment"
            ],
            "conflicts": [
                {
                    "issue": "Geotechnical favorable but environmental challenging",
                    "resolution": "Environmental concerns take precedence for permitting"
                }
            ]
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = MasterAgent(mock_client)
        result = agent.synthesize(sample_segment_data, conflicting_responses)

        # Overall assessment should exist
        assert "overall_assessment" in result
        # Should have executive summary addressing conflicts
        assert "executive_summary" in result

    def test_user_message_includes_all_agent_responses(
            self, mock_client, sample_segment_data, all_agent_responses):
        """User message should include full responses from all agents."""
        agent = MasterAgent(mock_client)
        message = agent._build_user_message(sample_segment_data, all_agent_responses)

        # Should include each agent's response
        assert "geotechnical" in message.lower()
        assert "environmental" in message.lower()
        assert "engineering" in message.lower()
        assert "cost" in message.lower()


# ============================================================================
# Integration Tests (marked for selective running)
# ============================================================================

@pytest.mark.integration
class TestP5Integration:
    """Integration tests requiring real API calls."""

    @pytest.mark.timeout(60)
    def test_geotechnical_real_api(self, sample_segment_data):
        """Integration: Real geotechnical API call."""
        reset_client()
        client = get_client()

        agent = GeotechnicalAgent(client)
        result = agent.analyze(sample_segment_data)

        assert result is not None
        assert "assessment" in result
        assert result["assessment"] in ["favorable", "caution", "challenging"]

    @pytest.mark.timeout(60)
    def test_environmental_real_api(self, sample_segment_data):
        """Integration: Real environmental API call."""
        reset_client()
        client = get_client()

        agent = EnvironmentalAgent(client)
        result = agent.analyze(sample_segment_data)

        assert result is not None
        assert "assessment" in result

    @pytest.mark.timeout(60)
    def test_engineering_real_api(self, sample_segment_data):
        """Integration: Real engineering API call."""
        reset_client()
        client = get_client()

        agent = EngineeringAgent(client)
        result = agent.analyze(sample_segment_data)

        assert result is not None
        assert "assessment" in result

    @pytest.mark.timeout(120)
    def test_cost_real_api_with_context(self, sample_segment_data):
        """Integration: Real cost API call with mock context."""
        reset_client()
        client = get_client()

        context = {
            "geotechnical": {"assessment": "favorable", "flags": []},
            "environmental": {"assessment": "favorable", "flags": []},
            "engineering": {"assessment": "favorable", "construction_method": "Standard Trenching"}
        }

        agent = CostAgent(client)
        result = agent.analyze(sample_segment_data, context=context)

        assert result is not None
        assert "assessment" in result


# ============================================================================
# Phase 5 Regression Suite
# ============================================================================

class TestP5Regression:
    """Phase 5 Regression Tests - Must pass on every code change."""

    def test_p5_r01_geo_agent_response_structure(self, mock_client, sample_segment_data):
        """P5-R01: Geotechnical returns valid structure."""
        mock_response_data = {
            "agent": "geotechnical",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Good.",
            "metrics": {},
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = GeotechnicalAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert result["agent"] == "geotechnical"
        assert "assessment" in result
        assert "explanation" in result

    def test_p5_r02_geo_agent_slope_detection(self, mock_client, steep_segment_data):
        """P5-R02: Steep slopes are flagged."""
        # User message should contain slope data for flagging
        agent = GeotechnicalAgent(mock_client)
        message = agent._build_user_message(steep_segment_data)
        assert "20" in message or "36" in message  # slope values

    def test_p5_r03_env_agent_response_structure(self, mock_client, sample_segment_data):
        """P5-R03: Environmental returns valid structure."""
        mock_response_data = {
            "agent": "environmental",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Good.",
            "metrics": {},
            "permits_likely": [],
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EnvironmentalAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert result["agent"] == "environmental"
        assert "permits_likely" in result

    def test_p5_r04_env_agent_protected_areas(self, mock_client, protected_area_segment):
        """P5-R04: Protected areas are flagged."""
        agent = EnvironmentalAgent(mock_client)
        message = agent._build_user_message(protected_area_segment)
        assert "50" in message  # protected area distance

    def test_p5_r05_eng_agent_response_structure(self, mock_client, sample_segment_data):
        """P5-R05: Engineering returns valid structure."""
        mock_response_data = {
            "agent": "engineering",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Good.",
            "metrics": {},
            "construction_method": "Standard Trenching",
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = EngineeringAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        assert result["agent"] == "engineering"
        assert "construction_method" in result

    def test_p5_r06_eng_agent_method_selection(self, mock_client, crossing_segment_data):
        """P5-R06: Appropriate methods recommended."""
        agent = EngineeringAgent(mock_client)
        message = agent._build_user_message(crossing_segment_data)
        assert "crossing" in message.lower() or "road" in message.lower()

    def test_p5_r07_cost_agent_uses_context(self, mock_client, sample_segment_data):
        """P5-R07: Cost uses other agent data."""
        context = {
            "geotechnical": {"assessment": "favorable"},
            "engineering": {"construction_method": "Standard Trenching"}
        }

        agent = CostAgent(mock_client)
        message = agent._build_user_message(sample_segment_data, context)

        assert "geotechnical" in message.lower()
        assert "engineering" in message.lower()

    def test_p5_r08_cost_agent_optimization(self, mock_client, sample_segment_data):
        """P5-R08: Cost provides suggestions."""
        mock_response_data = {
            "agent": "cost",
            "segment_id": "seg_001",
            "assessment": "favorable",
            "explanation": "Good.",
            "metrics": {},
            "cost_drivers": [],
            "optimization_notes": "No optimization needed.",
            "confidence": "high",
            "flags": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = CostAgent(mock_client)
        result = agent.analyze(sample_segment_data)

        # Should have optimization notes or cost drivers
        assert "optimization_notes" in result or "cost_drivers" in result

    def test_p5_r09_master_synthesis_complete(
            self, mock_client, sample_segment_data, all_agent_responses):
        """P5-R09: Master includes all agents."""
        mock_response_data = {
            "segment_id": "seg_001",
            "overall_assessment": "favorable",
            "confidence": "high",
            "executive_summary": "Good segment.",
            "key_metrics": {},
            "specialist_summaries": {
                "geotechnical": "Good.",
                "environmental": "Good.",
                "engineering": "Good.",
                "cost": "Good."
            },
            "flags": [],
            "recommendations": [],
            "conflicts": []
        }
        mock_client.messages.create.return_value = create_mock_api_response(mock_response_data)

        agent = MasterAgent(mock_client)
        result = agent.synthesize(sample_segment_data, all_agent_responses)

        assert "specialist_summaries" in result
        assert len(result["specialist_summaries"]) == 4

    def test_p5_r10_master_conflict_resolution(self, mock_client, sample_segment_data):
        """P5-R10: Master handles disagreements."""
        agent = MasterAgent(mock_client)

        # Validate synthesis is called correctly
        conflicting = {
            "geotechnical": {"assessment": "favorable"},
            "environmental": {"assessment": "challenging"}
        }

        message = agent._build_user_message(sample_segment_data, conflicting)
        assert "geotechnical" in message.lower()
        assert "environmental" in message.lower()
