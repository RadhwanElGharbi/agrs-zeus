"""Phase 1 Gate Tests - Data Models"""
import pytest
import json
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from pydantic import ValidationError

from models.segment import (
    SegmentCoordinates,
    SegmentMetrics,
    SegmentProperties,
    SegmentData,
    slope_percent_to_degrees,
    slope_degrees_to_percent,
)
from models.agent_response import (
    AssessmentLevel,
    BaseAgentResponse,
    GeotechnicalResponse,
    EnvironmentalResponse,
    EngineeringResponse,
    CostResponse,
)
from models.synthesis import (
    KeyMetrics,
    SpecialistSummaries,
    SynthesisResponse,
)
from models.api import (
    ExplainRequest,
    ExplainResponse,
    HealthResponse,
    ErrorResponse,
)


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def valid_segment_data():
    """Valid segment data for testing (legacy format with degrees)."""
    return {
        "id": "seg_001",
        "coordinates": {
            "start": (12.4964, 41.9028),
            "end": (12.5164, 41.9128)
        },
        "metrics": {
            "length_m": 1500.0,
            "start_elevation_m": 150.0,
            "end_elevation_m": 175.0,
            "avg_slope_degrees": 1.5,
            "max_slope_degrees": 3.2
        },
        "properties": {
            "terrain_class": "rolling_hills",
            "land_use": "agricultural",
            "soil_type": "clay_loam",
            "geological_zone": "sedimentary"
        }
    }


@pytest.fixture
def pirl_segment_data():
    """Valid segment data in PIRL format (slope in percent, UTM coords)."""
    return {
        "id": "1",
        "coordinates": {
            "start": (484838.28, 4933184.19),
            "end": (484812.5, 4933146.65),
            "crs": "EPSG:32613"
        },
        "metrics": {
            "length_m": 45.54,
            "start_elevation_m": 1207.98,
            "end_elevation_m": 1211.47,
            "max_slope_percent": 25.17
        },
        "properties": {
            "terrain_class": "hilly",
            "land_use": "unknown"
        }
    }


@pytest.fixture
def valid_base_response():
    """Valid base agent response data."""
    return {
        "agent": "geotechnical",
        "segment_id": "seg_001",
        "assessment": AssessmentLevel.favorable,
        "explanation": "Terrain is suitable for standard pipeline construction.",
        "flags": [],
        "metrics": {"slope": 1.5, "elevation_change": 25}
    }


@pytest.fixture
def valid_synthesis_data():
    """Valid synthesis response data."""
    return {
        "segment_id": "seg_001",
        "overall_assessment": AssessmentLevel.favorable,
        "confidence": "high",
        "executive_summary": "This segment presents favorable conditions for pipeline construction with minimal environmental constraints and standard engineering requirements.",
        "key_metrics": {
            "length_km": 1.5,
            "avg_slope": 1.5,
            "terrain": "rolling_hills",
            "land_use": "agricultural",
            "construction_method": "trenching",
            "estimated_cost": "€1.2M - €1.5M"
        },
        "specialist_summaries": {
            "geotechnical": "Favorable terrain with moderate slopes suitable for standard excavation.",
            "environmental": "No protected areas nearby; standard permits required.",
            "engineering": "Standard trenching recommended with no special crossings.",
            "cost": "Estimated at €1.2M-1.5M with standard terrain multipliers."
        },
        "flags": [],
        "recommendations": ["Proceed with standard construction approach"]
    }


# =============================================================================
# TEST P1-01: SegmentData Model Accepts Valid Data
# =============================================================================

class TestP1_01_SegmentDataValid:
    """TEST P1-01: SegmentData Model Accepts Valid Data"""

    def test_segment_data_instantiates_with_valid_data(self, valid_segment_data):
        """SegmentData instantiates with valid data"""
        segment = SegmentData(**valid_segment_data)
        assert segment is not None
        assert segment.id == "seg_001"

    def test_segment_data_fields_accessible(self, valid_segment_data):
        """All fields are accessible on the instance"""
        segment = SegmentData(**valid_segment_data)
        assert segment.id == "seg_001"
        assert segment.coordinates.start == (12.4964, 41.9028)
        assert segment.coordinates.end == (12.5164, 41.9128)
        assert segment.metrics.length_m == 1500.0
        assert segment.metrics.avg_slope_degrees == 1.5
        assert segment.properties.terrain_class == "rolling_hills"

    def test_segment_data_values_stored_correctly(self, valid_segment_data):
        """Field values match input values"""
        segment = SegmentData(**valid_segment_data)
        assert segment.metrics.start_elevation_m == 150.0
        assert segment.metrics.end_elevation_m == 175.0
        assert segment.properties.land_use == "agricultural"
        assert segment.properties.soil_type == "clay_loam"

    def test_segment_elevation_change_method(self, valid_segment_data):
        """get_elevation_change method returns expected value"""
        segment = SegmentData(**valid_segment_data)
        elevation_change = segment.get_elevation_change()
        assert elevation_change == 25.0  # 175 - 150

    def test_segment_midpoint_method(self, valid_segment_data):
        """get_midpoint method returns expected coordinates"""
        segment = SegmentData(**valid_segment_data)
        midpoint = segment.get_midpoint()
        expected_lon = (12.4964 + 12.5164) / 2
        expected_lat = (41.9028 + 41.9128) / 2
        assert midpoint == (expected_lon, expected_lat)


# =============================================================================
# TEST P1-01b: SegmentData Model Accepts PIRL Format
# =============================================================================

class TestP1_01b_SegmentDataPIRL:
    """TEST P1-01b: SegmentData Model Accepts PIRL Format"""

    def test_pirl_segment_instantiates(self, pirl_segment_data):
        """PIRL format segment instantiates correctly"""
        segment = SegmentData(**pirl_segment_data)
        assert segment is not None
        assert segment.id == "1"

    def test_pirl_segment_has_crs(self, pirl_segment_data):
        """PIRL segment has CRS set"""
        segment = SegmentData(**pirl_segment_data)
        assert segment.coordinates.crs == "EPSG:32613"

    def test_pirl_slope_percent_converted(self, pirl_segment_data):
        """Slope percent is converted to degrees"""
        segment = SegmentData(**pirl_segment_data)
        # 25.17% slope = atan(0.2517) = ~14.1 degrees
        assert segment.metrics.max_slope_percent == 25.17
        assert 14.0 < segment.metrics.max_slope_degrees < 14.2

    def test_pirl_segment_get_slope_percent(self, pirl_segment_data):
        """get_slope_percent returns original percent value"""
        segment = SegmentData(**pirl_segment_data)
        assert segment.get_slope_percent() == 25.17


# =============================================================================
# TEST P1-02: SegmentData Model Rejects Invalid Slope
# =============================================================================

class TestP1_02_SegmentDataInvalidSlope:
    """TEST P1-02: SegmentData Model Rejects Invalid Slope"""

    def test_rejects_slope_over_90(self, valid_segment_data):
        """Slope > 90 raises ValidationError"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = 95
        valid_segment_data["metrics"]["max_slope_degrees"] = 95
        with pytest.raises(ValidationError) as exc_info:
            SegmentData(**valid_segment_data)
        assert "avg_slope_degrees" in str(exc_info.value) or "less than or equal to 90" in str(exc_info.value)

    def test_rejects_negative_slope(self, valid_segment_data):
        """Negative slope raises ValidationError"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = -5
        with pytest.raises(ValidationError) as exc_info:
            SegmentData(**valid_segment_data)
        assert "avg_slope_degrees" in str(exc_info.value) or "greater than or equal to 0" in str(exc_info.value)

    def test_accepts_boundary_slope_0(self, valid_segment_data):
        """Slope = 0 is valid"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = 0
        valid_segment_data["metrics"]["max_slope_degrees"] = 0
        segment = SegmentData(**valid_segment_data)
        assert segment.metrics.avg_slope_degrees == 0

    def test_accepts_boundary_slope_45(self, valid_segment_data):
        """Slope = 45 is valid"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = 45
        valid_segment_data["metrics"]["max_slope_degrees"] = 45
        segment = SegmentData(**valid_segment_data)
        assert segment.metrics.avg_slope_degrees == 45

    def test_accepts_boundary_slope_90(self, valid_segment_data):
        """Slope = 90 is valid"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = 90
        valid_segment_data["metrics"]["max_slope_degrees"] = 90
        segment = SegmentData(**valid_segment_data)
        assert segment.metrics.avg_slope_degrees == 90


# =============================================================================
# TEST P1-03: SegmentData Model Rejects Negative Length
# =============================================================================

class TestP1_03_SegmentDataInvalidLength:
    """TEST P1-03: SegmentData Model Rejects Negative Length"""

    def test_rejects_negative_length(self, valid_segment_data):
        """Negative length raises ValidationError"""
        valid_segment_data["metrics"]["length_m"] = -100
        with pytest.raises(ValidationError) as exc_info:
            SegmentData(**valid_segment_data)
        assert "length_m" in str(exc_info.value) or "greater than" in str(exc_info.value)

    def test_rejects_zero_length(self, valid_segment_data):
        """Zero length raises ValidationError (gt=0 constraint)"""
        valid_segment_data["metrics"]["length_m"] = 0
        with pytest.raises(ValidationError) as exc_info:
            SegmentData(**valid_segment_data)
        assert "length_m" in str(exc_info.value)

    def test_accepts_large_length(self, valid_segment_data):
        """Large length value is handled"""
        valid_segment_data["metrics"]["length_m"] = 1000000
        segment = SegmentData(**valid_segment_data)
        assert segment.metrics.length_m == 1000000


# =============================================================================
# TEST P1-04: AssessmentLevel Enum Contains Required Values
# =============================================================================

class TestP1_04_AssessmentLevelEnum:
    """TEST P1-04: AssessmentLevel Enum Contains Required Values"""

    def test_favorable_exists(self):
        """AssessmentLevel.favorable exists"""
        assert AssessmentLevel.favorable is not None
        assert AssessmentLevel.favorable.value == "favorable"

    def test_caution_exists(self):
        """AssessmentLevel.caution exists"""
        assert AssessmentLevel.caution is not None
        assert AssessmentLevel.caution.value == "caution"

    def test_challenging_exists(self):
        """AssessmentLevel.challenging exists"""
        assert AssessmentLevel.challenging is not None
        assert AssessmentLevel.challenging.value == "challenging"

    def test_enum_has_exactly_three_members(self):
        """Enum has exactly 3 members"""
        assert len(AssessmentLevel) == 3

    def test_string_values_correct(self):
        """String representations are correct"""
        assert str(AssessmentLevel.favorable) == "AssessmentLevel.favorable"
        assert AssessmentLevel.favorable.value == "favorable"
        assert AssessmentLevel.caution.value == "caution"
        assert AssessmentLevel.challenging.value == "challenging"


# =============================================================================
# TEST P1-05: BaseAgentResponse Accepts Valid Response
# =============================================================================

class TestP1_05_BaseAgentResponse:
    """TEST P1-05: BaseAgentResponse Accepts Valid Response"""

    def test_instantiates_with_valid_data(self, valid_base_response):
        """Model instantiates with valid data"""
        response = BaseAgentResponse(**valid_base_response)
        assert response is not None
        assert response.agent == "geotechnical"

    def test_accepts_enum_assessment(self, valid_base_response):
        """Assessment field accepts AssessmentLevel enum value"""
        response = BaseAgentResponse(**valid_base_response)
        assert response.assessment == AssessmentLevel.favorable

    def test_accepts_string_assessment(self, valid_base_response):
        """Assessment field accepts string value that matches enum"""
        valid_base_response["assessment"] = "caution"
        response = BaseAgentResponse(**valid_base_response)
        assert response.assessment == AssessmentLevel.caution

    def test_accepts_empty_flags_list(self, valid_base_response):
        """Flags field accepts empty list"""
        response = BaseAgentResponse(**valid_base_response)
        assert response.flags == []

    def test_accepts_populated_flags_list(self, valid_base_response):
        """Flags field accepts list with string items"""
        valid_base_response["flags"] = ["steep_slope", "unstable_soil"]
        response = BaseAgentResponse(**valid_base_response)
        assert response.flags == ["steep_slope", "unstable_soil"]


# =============================================================================
# TEST P1-06: SynthesisResponse Contains All Required Fields
# =============================================================================

class TestP1_06_SynthesisResponse:
    """TEST P1-06: SynthesisResponse Contains All Required Fields"""

    def test_instantiates_with_complete_data(self, valid_synthesis_data):
        """Complete data creates valid instance"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert response is not None
        assert response.segment_id == "seg_001"

    def test_key_metrics_has_expected_fields(self, valid_synthesis_data):
        """key_metrics field contains expected sub-fields"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert response.key_metrics.length_km == 1.5
        assert response.key_metrics.avg_slope == 1.5
        assert response.key_metrics.terrain == "rolling_hills"
        assert response.key_metrics.land_use == "agricultural"
        assert response.key_metrics.construction_method == "trenching"
        assert response.key_metrics.estimated_cost == "€1.2M - €1.5M"

    def test_specialist_summaries_has_all_agents(self, valid_synthesis_data):
        """specialist_summaries contains all four agent keys"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert hasattr(response.specialist_summaries, "geotechnical")
        assert hasattr(response.specialist_summaries, "environmental")
        assert hasattr(response.specialist_summaries, "engineering")
        assert hasattr(response.specialist_summaries, "cost")

    def test_flags_is_list(self, valid_synthesis_data):
        """flags is a list type"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert isinstance(response.flags, list)

    def test_recommendations_is_list(self, valid_synthesis_data):
        """recommendations is a list type"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert isinstance(response.recommendations, list)

    def test_missing_required_field_raises_error(self, valid_synthesis_data):
        """Missing truly required field (segment_id) raises ValidationError"""
        del valid_synthesis_data["segment_id"]
        with pytest.raises(ValidationError):
            SynthesisResponse(**valid_synthesis_data)

    def test_confidence_validation(self, valid_synthesis_data):
        """Confidence field validates correctly"""
        # Valid values
        for conf in ["high", "medium", "low"]:
            valid_synthesis_data["confidence"] = conf
            response = SynthesisResponse(**valid_synthesis_data)
            assert response.confidence == conf

    def test_invalid_confidence_raises_error(self, valid_synthesis_data):
        """Invalid confidence value raises error"""
        valid_synthesis_data["confidence"] = "very_high"
        with pytest.raises(ValidationError):
            SynthesisResponse(**valid_synthesis_data)

    def test_to_dict_method(self, valid_synthesis_data):
        """to_dict returns JSON-serializable dict"""
        response = SynthesisResponse(**valid_synthesis_data)
        result = response.to_dict()
        assert isinstance(result, dict)
        # Should be JSON serializable
        json_str = json.dumps(result)
        assert json_str is not None

    def test_has_flags_method(self, valid_synthesis_data):
        """has_flags method works correctly"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert response.has_flags() is False

        valid_synthesis_data["flags"] = ["steep_slope"]
        response2 = SynthesisResponse(**valid_synthesis_data)
        assert response2.has_flags() is True

    def test_is_problematic_method(self, valid_synthesis_data):
        """is_problematic method works correctly"""
        # Favorable with no flags = not problematic
        response = SynthesisResponse(**valid_synthesis_data)
        assert response.is_problematic() is False

        # Challenging assessment = problematic
        valid_synthesis_data["overall_assessment"] = AssessmentLevel.challenging
        response2 = SynthesisResponse(**valid_synthesis_data)
        assert response2.is_problematic() is True

        # Favorable with flags = problematic
        valid_synthesis_data["overall_assessment"] = AssessmentLevel.favorable
        valid_synthesis_data["flags"] = ["concern"]
        response3 = SynthesisResponse(**valid_synthesis_data)
        assert response3.is_problematic() is True


# =============================================================================
# TEST P1-07: API Request Model Validates Segment IDs
# =============================================================================

class TestP1_07_APIRequestValidation:
    """TEST P1-07: API Request Model Validates Segment IDs"""

    def test_rejects_empty_segment_ids(self):
        """Empty segment_ids list raises ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            ExplainRequest(route_id="route_001", segment_ids=[])
        assert "segment_ids" in str(exc_info.value)

    def test_accepts_valid_segment_ids(self):
        """Valid segment_ids list is accepted"""
        request = ExplainRequest(route_id="route_001", segment_ids=["seg_001"])
        assert request.segment_ids == ["seg_001"]

    def test_accepts_single_segment_id(self):
        """Single segment ID is accepted"""
        request = ExplainRequest(route_id="route_001", segment_ids=["seg_001"])
        assert len(request.segment_ids) == 1

    def test_accepts_multiple_segment_ids(self):
        """Multiple segment IDs are accepted"""
        request = ExplainRequest(
            route_id="route_001",
            segment_ids=["seg_001", "seg_002", "seg_003"]
        )
        assert len(request.segment_ids) == 3

    def test_rejects_empty_route_id(self):
        """Empty route_id raises ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            ExplainRequest(route_id="", segment_ids=["seg_001"])
        assert "route_id" in str(exc_info.value)

    def test_rejects_whitespace_route_id(self):
        """Whitespace-only route_id raises ValidationError"""
        with pytest.raises(ValidationError) as exc_info:
            ExplainRequest(route_id="   ", segment_ids=["seg_001"])
        assert "route_id" in str(exc_info.value)

    def test_include_agents_optional(self):
        """include_agents field is optional"""
        request = ExplainRequest(route_id="route_001", segment_ids=["seg_001"])
        assert request.include_agents is None

        request2 = ExplainRequest(
            route_id="route_001",
            segment_ids=["seg_001"],
            include_agents=["geotechnical", "environmental"]
        )
        assert request2.include_agents == ["geotechnical", "environmental"]


# =============================================================================
# TEST P1-08: Models Are JSON Serializable
# =============================================================================

class TestP1_08_JSONSerialization:
    """TEST P1-08: Models Are JSON Serializable"""

    def test_segment_data_serializable(self, valid_segment_data):
        """SegmentData serializes to JSON"""
        segment = SegmentData(**valid_segment_data)
        json_str = segment.model_dump_json()
        assert json_str is not None
        # Parse back
        parsed = json.loads(json_str)
        assert parsed["id"] == "seg_001"

    def test_pirl_segment_serializable(self, pirl_segment_data):
        """PIRL SegmentData serializes to JSON"""
        segment = SegmentData(**pirl_segment_data)
        json_str = segment.model_dump_json()
        assert json_str is not None
        parsed = json.loads(json_str)
        assert parsed["id"] == "1"
        assert parsed["coordinates"]["crs"] == "EPSG:32613"

    def test_base_agent_response_serializable(self, valid_base_response):
        """BaseAgentResponse serializes to JSON"""
        response = BaseAgentResponse(**valid_base_response)
        json_str = response.model_dump_json()
        assert json_str is not None
        parsed = json.loads(json_str)
        assert parsed["agent"] == "geotechnical"

    def test_synthesis_response_serializable(self, valid_synthesis_data):
        """SynthesisResponse serializes to JSON"""
        response = SynthesisResponse(**valid_synthesis_data)
        json_str = response.model_dump_json()
        assert json_str is not None
        parsed = json.loads(json_str)
        assert parsed["segment_id"] == "seg_001"

    def test_nested_models_serialize(self, valid_segment_data):
        """Nested structures serialize correctly"""
        segment = SegmentData(**valid_segment_data)
        json_str = segment.model_dump_json()
        parsed = json.loads(json_str)
        assert "coordinates" in parsed
        assert "metrics" in parsed
        assert "properties" in parsed

    def test_enum_values_serialize_to_strings(self, valid_base_response):
        """Enum values serialize to strings"""
        response = BaseAgentResponse(**valid_base_response)
        json_str = response.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["assessment"] == "favorable"

    def test_api_models_serializable(self):
        """API models serialize correctly"""
        # ExplainRequest
        request = ExplainRequest(route_id="route_001", segment_ids=["seg_001"])
        json_str = request.model_dump_json()
        assert json_str is not None

        # HealthResponse
        health = HealthResponse(
            status="ok",
            version="1.0.0",
            agents_available=["geotechnical", "environmental"]
        )
        json_str = health.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["status"] == "ok"

        # ErrorResponse
        error = ErrorResponse(
            error="not_found",
            detail="Segment not found",
            segment_id="seg_999"
        )
        json_str = error.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["error"] == "not_found"


# =============================================================================
# Specialist Response Tests
# =============================================================================

class TestSpecialistResponses:
    """Tests for specialist agent response models."""

    def test_environmental_response_permits_field(self):
        """EnvironmentalResponse has permits_likely field"""
        response = EnvironmentalResponse(
            agent="environmental",
            segment_id="seg_001",
            assessment=AssessmentLevel.caution,
            explanation="Protected area nearby requires special permits.",
            permits_likely=["Environmental Impact Assessment", "Water Crossing Permit"]
        )
        assert response.permits_likely == [
            "Environmental Impact Assessment",
            "Water Crossing Permit"
        ]

    def test_engineering_response_construction_method(self):
        """EngineeringResponse has construction_method field"""
        response = EngineeringResponse(
            agent="engineering",
            segment_id="seg_001",
            assessment=AssessmentLevel.favorable,
            explanation="Standard trenching suitable for this terrain.",
            construction_method="trenching"
        )
        assert response.construction_method == "trenching"

    def test_cost_response_fields(self):
        """CostResponse has cost_drivers and optimization_notes fields"""
        response = CostResponse(
            agent="cost",
            segment_id="seg_001",
            assessment=AssessmentLevel.favorable,
            explanation="Standard construction costs apply.",
            cost_drivers=["terrain", "length"],
            optimization_notes="Consider bulk material procurement"
        )
        assert response.cost_drivers == ["terrain", "length"]
        assert response.optimization_notes == "Consider bulk material procurement"

    def test_cost_response_optional_optimization_notes(self):
        """CostResponse optimization_notes is optional"""
        response = CostResponse(
            agent="cost",
            segment_id="seg_001",
            assessment=AssessmentLevel.favorable,
            explanation="Standard costs.",
            cost_drivers=[]
        )
        assert response.optimization_notes is None


# =============================================================================
# Slope Conversion Tests
# =============================================================================

class TestSlopeConversions:
    """Tests for slope percent <-> degrees conversions."""

    def test_slope_percent_to_degrees_zero(self):
        """0% slope = 0 degrees"""
        assert slope_percent_to_degrees(0) == 0.0

    def test_slope_percent_to_degrees_100(self):
        """100% slope = 45 degrees"""
        result = slope_percent_to_degrees(100)
        assert 44.9 < result < 45.1

    def test_slope_percent_to_degrees_25(self):
        """25% slope ~ 14 degrees"""
        result = slope_percent_to_degrees(25)
        assert 14.0 < result < 14.1

    def test_slope_degrees_to_percent_zero(self):
        """0 degrees = 0%"""
        assert slope_degrees_to_percent(0) == 0.0

    def test_slope_degrees_to_percent_45(self):
        """45 degrees = 100%"""
        result = slope_degrees_to_percent(45)
        assert 99.9 < result < 100.1

    def test_roundtrip_conversion(self):
        """Percent -> degrees -> percent preserves value"""
        original = 25.0
        degrees = slope_percent_to_degrees(original)
        back = slope_degrees_to_percent(degrees)
        assert abs(back - original) < 0.01


# =============================================================================
# Phase 1 Regression Suite
# =============================================================================

class TestP1Regression:
    """Phase 1 Regression Suite"""

    def test_p1_r01_segment_data_valid_instantiation(self, valid_segment_data):
        """P1-R01: SegmentData accepts valid data"""
        segment = SegmentData(**valid_segment_data)
        assert segment is not None

    def test_p1_r02_segment_data_slope_validation(self, valid_segment_data):
        """P1-R02: Slope validation works"""
        valid_segment_data["metrics"]["avg_slope_degrees"] = 95
        valid_segment_data["metrics"]["max_slope_degrees"] = 95
        with pytest.raises(ValidationError):
            SegmentData(**valid_segment_data)

    def test_p1_r03_segment_data_length_validation(self, valid_segment_data):
        """P1-R03: Length validation works"""
        valid_segment_data["metrics"]["length_m"] = -100
        with pytest.raises(ValidationError):
            SegmentData(**valid_segment_data)

    def test_p1_r04_assessment_enum_values(self):
        """P1-R04: Enum has correct values"""
        assert len(AssessmentLevel) == 3
        assert AssessmentLevel.favorable.value == "favorable"

    def test_p1_r05_agent_response_structure(self, valid_base_response):
        """P1-R05: Agent responses have required fields"""
        response = BaseAgentResponse(**valid_base_response)
        assert hasattr(response, "agent")
        assert hasattr(response, "segment_id")
        assert hasattr(response, "assessment")
        assert hasattr(response, "explanation")
        assert hasattr(response, "flags")

    def test_p1_r06_synthesis_response_structure(self, valid_synthesis_data):
        """P1-R06: Synthesis has all components"""
        response = SynthesisResponse(**valid_synthesis_data)
        assert hasattr(response, "executive_summary")
        assert hasattr(response, "key_metrics")
        assert hasattr(response, "specialist_summaries")

    def test_p1_r07_api_models_validation(self):
        """P1-R07: API models validate correctly"""
        # Valid request works
        request = ExplainRequest(route_id="route_001", segment_ids=["seg_001"])
        assert request is not None

        # Invalid request fails
        with pytest.raises(ValidationError):
            ExplainRequest(route_id="", segment_ids=[])

    def test_p1_r08_models_json_serializable(self, valid_segment_data, valid_synthesis_data):
        """P1-R08: All models convert to JSON"""
        segment = SegmentData(**valid_segment_data)
        assert segment.model_dump_json() is not None

        synthesis = SynthesisResponse(**valid_synthesis_data)
        assert synthesis.model_dump_json() is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
