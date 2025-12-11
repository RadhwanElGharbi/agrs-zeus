"""Phase 4 Tests: Base Agent Implementation

Gate tests and regression suite for base agent class, client wrapper,
and exception handling.
"""
import json
import pytest
from pathlib import Path
from typing import Any, Dict, Optional
from unittest.mock import Mock, MagicMock, patch
import anthropic

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from agents.base import BaseAgent
from agents.client import get_client, reset_client, test_connection
from agents.exceptions import (
    AgentError,
    PromptLoadError,
    APICallError,
    ResponseParseError,
    AgentTimeoutError
)
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
        "id": "seg_001",
        "length_m": 1500.0,
        "start_elevation_m": 150.0,
        "end_elevation_m": 175.0,
        "avg_slope_degrees": 1.5,
        "max_slope_degrees": 3.2,
        "terrain_class": "rolling_hills",
        "land_use": "agricultural",
        "soil_type": "clay_loam",
        "geological_zone": "sedimentary",
        "coordinates": [[12.4964, 41.9028], [12.5064, 41.9078]]
    }


@pytest.fixture
def test_prompt_file(tmp_path):
    """Create a temporary test prompt file."""
    prompt_content = """You are a test agent.
Analyze the data and return JSON with:
{
    "agent": "test",
    "segment_id": "<id>",
    "assessment": "favorable|caution|challenging",
    "explanation": "<text>",
    "metrics": {},
    "flags": []
}
"""
    prompt_file = tmp_path / "test_agent.txt"
    prompt_file.write_text(prompt_content, encoding='utf-8')
    return prompt_file


class TestableAgent(BaseAgent):
    """Concrete implementation of BaseAgent for testing."""

    def __init__(self, client, prompt_path: Path = None):
        self._prompt_path = prompt_path
        super().__init__(client)

    @property
    def agent_name(self) -> str:
        return "test"

    @property
    def prompt_file(self) -> str:
        return "test_agent.txt" if self._prompt_path is None else self._prompt_path.name

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        return f"Analyze segment: {json.dumps(segment_data)}"


class GeotechnicalTestAgent(BaseAgent):
    """Test implementation using the real geotechnical prompt."""

    @property
    def agent_name(self) -> str:
        return "geotechnical"

    @property
    def prompt_file(self) -> str:
        return "geotechnical.txt"

    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        return f"""Analyze this pipeline segment:

Segment ID: {segment_data.get('id', 'unknown')}
Length: {segment_data.get('length_m', 'N/A')} meters
Elevation: {segment_data.get('start_elevation_m', 'N/A')}m to {segment_data.get('end_elevation_m', 'N/A')}m
Average Slope: {segment_data.get('avg_slope_degrees', 'N/A')} degrees
Maximum Slope: {segment_data.get('max_slope_degrees', 'N/A')} degrees
Terrain Class: {segment_data.get('terrain_class', 'unknown')}
Soil Type: {segment_data.get('soil_type', 'unknown')}
Geological Zone: {segment_data.get('geological_zone', 'unknown')}

Respond with JSON only.
"""


# ============================================================================
# TEST P4-01: Base Agent Loads Prompt Successfully
# ============================================================================

class TestP4_01_BaseAgentLoadsPrompt:
    """TEST P4-01: Base Agent Loads Prompt Successfully

    Purpose: Verify prompt loading mechanism works
    """

    def test_agent_loads_prompt_from_file(self, mock_client, test_prompt_file):
        """Agent should load prompt content from the prompts directory."""
        # Patch the prompts directory to use our temp dir
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            assert agent.system_prompt is not None
            assert len(agent.system_prompt) > 0
            assert "test agent" in agent.system_prompt.lower()

    def test_agent_name_property_returns_correct_value(self, mock_client, test_prompt_file):
        """Agent name property should return the expected value."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)
            assert agent.agent_name == "test"

    def test_real_geotechnical_prompt_loads(self, mock_client):
        """Should load the real geotechnical.txt prompt file."""
        agent = GeotechnicalTestAgent(mock_client)

        assert agent.system_prompt is not None
        assert len(agent.system_prompt) > 100
        assert "geotechnical" in agent.system_prompt.lower()
        assert "slope" in agent.system_prompt.lower()


# ============================================================================
# TEST P4-02: Base Agent Handles Missing Prompt File
# ============================================================================

class TestP4_02_BaseAgentHandlesMissingPrompt:
    """TEST P4-02: Base Agent Handles Missing Prompt File

    Purpose: Verify appropriate error for missing prompts
    """

    def test_missing_prompt_raises_prompt_load_error(self, mock_client):
        """Missing prompt file should raise PromptLoadError."""
        class MissingPromptAgent(BaseAgent):
            @property
            def agent_name(self) -> str:
                return "missing"

            @property
            def prompt_file(self) -> str:
                return "nonexistent_prompt.txt"

            def _build_user_message(self, segment_data, context=None):
                return ""

        with pytest.raises(PromptLoadError) as exc_info:
            MissingPromptAgent(mock_client)

        assert "nonexistent_prompt.txt" in str(exc_info.value)

    def test_error_raised_during_init(self, mock_client):
        """PromptLoadError should be raised during __init__, not later."""
        class MissingPromptAgent(BaseAgent):
            @property
            def agent_name(self) -> str:
                return "missing"

            @property
            def prompt_file(self) -> str:
                return "does_not_exist.txt"

            def _build_user_message(self, segment_data, context=None):
                return ""

        # Error should occur during construction
        with pytest.raises(PromptLoadError):
            agent = MissingPromptAgent(mock_client)

    def test_error_includes_agent_name(self, mock_client):
        """PromptLoadError should include the agent name."""
        class TestAgent(BaseAgent):
            @property
            def agent_name(self) -> str:
                return "my_test_agent"

            @property
            def prompt_file(self) -> str:
                return "missing.txt"

            def _build_user_message(self, segment_data, context=None):
                return ""

        with pytest.raises(PromptLoadError) as exc_info:
            TestAgent(mock_client)

        assert exc_info.value.agent_name == "my_test_agent"


# ============================================================================
# TEST P4-03: Response Parser Extracts Valid JSON
# ============================================================================

class TestP4_03_ResponseParserExtractsJSON:
    """TEST P4-03: Response Parser Extracts Valid JSON

    Purpose: Verify JSON extraction from Claude responses
    """

    def test_parses_direct_json(self, mock_client, test_prompt_file):
        """Should parse response that is just JSON."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '{"agent": "test", "assessment": "favorable"}'
            result = agent._parse_response(response)

            assert result["agent"] == "test"
            assert result["assessment"] == "favorable"

    def test_parses_json_with_text_before(self, mock_client, test_prompt_file):
        """Should extract JSON when text appears before it."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = 'Here is my analysis:\n{"agent": "test", "assessment": "caution"}'
            result = agent._parse_response(response)

            assert result["assessment"] == "caution"

    def test_parses_json_with_text_after(self, mock_client, test_prompt_file):
        """Should extract JSON when text appears after it."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '{"agent": "test", "assessment": "challenging"}\n\nI hope this helps!'
            result = agent._parse_response(response)

            assert result["assessment"] == "challenging"

    def test_parses_json_surrounded_by_text(self, mock_client, test_prompt_file):
        """Should extract JSON when surrounded by text."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '''Here is my analysis:
{"agent": "test", "segment_id": "seg_001", "assessment": "favorable", "explanation": "Good conditions", "metrics": {}, "flags": []}
Let me know if you need more details.'''
            result = agent._parse_response(response)

            assert result["segment_id"] == "seg_001"
            assert result["assessment"] == "favorable"

    def test_parses_pretty_printed_json(self, mock_client, test_prompt_file):
        """Should parse JSON with newlines and indentation."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '''{
    "agent": "test",
    "segment_id": "seg_002",
    "assessment": "caution",
    "explanation": "Some concerns",
    "metrics": {
        "slope": 15.0
    },
    "flags": ["HIGH_SLOPE"]
}'''
            result = agent._parse_response(response)

            assert result["assessment"] == "caution"
            assert result["metrics"]["slope"] == 15.0
            assert "HIGH_SLOPE" in result["flags"]

    def test_parses_json_in_markdown_code_block(self, mock_client, test_prompt_file):
        """Should extract JSON from markdown code blocks."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '''Here's the analysis:

```json
{"agent": "test", "assessment": "favorable"}
```

This concludes my assessment.'''
            result = agent._parse_response(response)

            assert result["assessment"] == "favorable"


# ============================================================================
# TEST P4-04: Response Parser Handles Invalid JSON
# ============================================================================

class TestP4_04_ResponseParserHandlesInvalidJSON:
    """TEST P4-04: Response Parser Handles Invalid JSON

    Purpose: Verify graceful handling of non-JSON responses
    """

    def test_no_json_returns_fallback(self, mock_client, test_prompt_file):
        """Response with no JSON should return fallback structure."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = "I couldn't analyze this segment due to missing data."
            result = agent._parse_response(response)

            assert "explanation" in result
            assert "flags" in result
            assert "parse_error" in result["flags"]

    def test_malformed_json_returns_fallback(self, mock_client, test_prompt_file):
        """Malformed JSON should return fallback structure."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = '{"agent": "test", "assessment": "favorable"'  # Missing closing brace
            result = agent._parse_response(response)

            # Should get a fallback response, not crash
            assert isinstance(result, dict)
            assert "flags" in result

    def test_no_exception_raised_for_invalid_json(self, mock_client, test_prompt_file):
        """Invalid JSON should not raise exception."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            # Various invalid inputs
            invalid_responses = [
                "Just plain text",
                "{{invalid: json}}",
                "[1, 2, 3]",  # Array, not object
                "",
                None
            ]

            for response in invalid_responses:
                try:
                    if response is not None:
                        result = agent._parse_response(response)
                        assert isinstance(result, dict)
                except Exception as e:
                    pytest.fail(f"Unexpected exception for response '{response}': {e}")

    def test_fallback_has_parse_error_flag(self, mock_client, test_prompt_file):
        """Fallback response should have parse_error flag."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            response = "This is not JSON at all"
            result = agent._parse_response(response)

            assert "_parse_error" in result or "parse_error" in result.get("flags", [])


# ============================================================================
# TEST P4-05: Base Agent Makes API Call Successfully
# ============================================================================

class TestP4_05_BaseAgentMakesAPICall:
    """TEST P4-05: Base Agent Makes API Call Successfully

    Purpose: Verify Claude API integration works
    """

    def test_api_call_with_mock_returns_response(self, mock_client, test_prompt_file, sample_segment_data):
        """API call with mock client should return parsed response."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            # Configure mock response
            mock_response = Mock()
            mock_response.content = [Mock(text='{"agent": "test", "assessment": "favorable", "explanation": "Good", "metrics": {}, "flags": []}')]
            mock_client.messages.create.return_value = mock_response

            agent = TestableAgent(mock_client, test_prompt_file)
            result = agent.analyze(sample_segment_data)

            assert result is not None
            assert isinstance(result, dict)
            assert result["assessment"] == "favorable"

    def test_api_call_uses_correct_model(self, mock_client, test_prompt_file, sample_segment_data):
        """API call should use the configured model."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_response = Mock()
            mock_response.content = [Mock(text='{"agent": "test", "assessment": "favorable"}')]
            mock_client.messages.create.return_value = mock_response

            agent = TestableAgent(mock_client, test_prompt_file)
            agent.analyze(sample_segment_data)

            call_args = mock_client.messages.create.call_args
            assert call_args.kwargs['model'] == Settings.ANTHROPIC_MODEL

    def test_api_call_includes_system_prompt(self, mock_client, test_prompt_file, sample_segment_data):
        """API call should include the system prompt."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_response = Mock()
            mock_response.content = [Mock(text='{"agent": "test", "assessment": "favorable"}')]
            mock_client.messages.create.return_value = mock_response

            agent = TestableAgent(mock_client, test_prompt_file)
            agent.analyze(sample_segment_data)

            call_args = mock_client.messages.create.call_args
            assert 'system' in call_args.kwargs
            assert len(call_args.kwargs['system']) > 0

    @pytest.mark.integration
    @pytest.mark.timeout(60)
    def test_real_api_call_returns_valid_response(self, sample_segment_data):
        """Integration test: Real API call should return valid response."""
        reset_client()  # Ensure fresh client
        client = get_client()

        agent = GeotechnicalTestAgent(client)
        result = agent.analyze(sample_segment_data)

        assert result is not None
        assert isinstance(result, dict)
        assert "assessment" in result
        assert result["assessment"] in ["favorable", "caution", "challenging"]
        assert "explanation" in result
        assert len(result["explanation"]) > 0


# ============================================================================
# TEST P4-06: Base Agent Handles API Timeout
# ============================================================================

class TestP4_06_BaseAgentHandlesTimeout:
    """TEST P4-06: Base Agent Handles API Timeout

    Purpose: Verify timeout handling works
    """

    def test_timeout_raises_timeout_error(self, mock_client, test_prompt_file, sample_segment_data):
        """API timeout should raise AgentTimeoutError."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.APITimeoutError(request=Mock())

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(AgentTimeoutError) as exc_info:
                agent.analyze(sample_segment_data)

            assert exc_info.value.agent_name == "test"

    def test_timeout_error_includes_timeout_duration(self, mock_client, test_prompt_file, sample_segment_data):
        """AgentTimeoutError should include the timeout duration."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.APITimeoutError(request=Mock())

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(AgentTimeoutError) as exc_info:
                agent.analyze(sample_segment_data)

            assert exc_info.value.timeout_seconds == Settings.API_TIMEOUT


# ============================================================================
# TEST P4-07: Base Agent Handles API Errors
# ============================================================================

class TestP4_07_BaseAgentHandlesAPIErrors:
    """TEST P4-07: Base Agent Handles API Errors

    Purpose: Verify error handling for API failures
    """

    def test_auth_error_raises_api_call_error(self, mock_client, test_prompt_file, sample_segment_data):
        """Authentication error should raise APICallError."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.AuthenticationError(
                message="Invalid API key",
                body=None,
                response=Mock(status_code=401)
            )

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(APICallError) as exc_info:
                agent.analyze(sample_segment_data)

            assert exc_info.value.status_code == 401
            assert "authentication" in str(exc_info.value).lower()

    def test_rate_limit_error_retries(self, mock_client, test_prompt_file, sample_segment_data):
        """Rate limit error should retry before failing."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            # First calls fail with rate limit, last succeeds
            mock_response = Mock()
            mock_response.content = [Mock(text='{"agent": "test", "assessment": "favorable"}')]

            mock_client.messages.create.side_effect = [
                anthropic.RateLimitError(
                    message="Rate limited",
                    body=None,
                    response=Mock(status_code=429)
                ),
                mock_response  # Success on retry
            ]

            agent = TestableAgent(mock_client, test_prompt_file)

            with patch('agents.base.time.sleep'):  # Skip actual sleep
                result = agent.analyze(sample_segment_data)

            assert result["assessment"] == "favorable"
            assert mock_client.messages.create.call_count == 2

    def test_rate_limit_exhausted_raises_error(self, mock_client, test_prompt_file, sample_segment_data):
        """Exhausted rate limit retries should raise APICallError."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.RateLimitError(
                message="Rate limited",
                body=None,
                response=Mock(status_code=429)
            )

            agent = TestableAgent(mock_client, test_prompt_file)

            with patch('agents.base.time.sleep'):  # Skip actual sleep
                with pytest.raises(APICallError) as exc_info:
                    agent.analyze(sample_segment_data)

            assert exc_info.value.status_code == 429

    def test_api_error_preserves_original_error(self, mock_client, test_prompt_file, sample_segment_data):
        """APICallError should preserve the original exception."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            original_error = anthropic.AuthenticationError(
                message="Invalid key",
                body=None,
                response=Mock(status_code=401)
            )
            mock_client.messages.create.side_effect = original_error

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(APICallError) as exc_info:
                agent.analyze(sample_segment_data)

            assert exc_info.value.cause is original_error


# ============================================================================
# TEST P4-08: Client Wrapper Creates Valid Client
# ============================================================================

class TestP4_08_ClientWrapper:
    """TEST P4-08: Client Wrapper Creates Valid Client

    Purpose: Verify Anthropic client wrapper works
    """

    def test_get_client_returns_anthropic_client(self):
        """get_client should return an Anthropic client instance."""
        reset_client()
        client = get_client()

        assert client is not None
        assert isinstance(client, anthropic.Anthropic)

    def test_get_client_returns_singleton(self):
        """get_client should return the same instance on repeated calls."""
        reset_client()
        client1 = get_client()
        client2 = get_client()

        assert client1 is client2

    def test_reset_client_clears_singleton(self):
        """reset_client should clear the singleton so a new client is created."""
        reset_client()
        client1 = get_client()
        reset_client()
        client2 = get_client()

        # After reset, should be a new instance
        assert client1 is not client2

    @pytest.mark.integration
    @pytest.mark.timeout(30)
    def test_connection_succeeds_with_valid_key(self):
        """test_connection should return True with valid API key."""
        reset_client()
        result = test_connection()
        assert result is True


# ============================================================================
# TEST Exceptions Module
# ============================================================================

class TestExceptionsModule:
    """Tests for the exceptions module."""

    def test_agent_error_base_class(self):
        """AgentError should work as base exception."""
        error = AgentError("Test error", agent_name="test_agent")
        assert "test_agent" in str(error)
        assert "Test error" in str(error)

    def test_prompt_load_error_includes_filename(self):
        """PromptLoadError should include prompt filename."""
        error = PromptLoadError("test.txt", agent_name="test")
        assert "test.txt" in str(error)

    def test_api_call_error_includes_status_code(self):
        """APICallError should include status code when provided."""
        error = APICallError("Error", agent_name="test", status_code=500)
        assert error.status_code == 500
        assert "500" in str(error)

    def test_response_parse_error_stores_raw_response(self):
        """ResponseParseError should store raw response."""
        error = ResponseParseError("Parse failed", raw_response="invalid json")
        assert error.raw_response == "invalid json"

    def test_agent_timeout_error_includes_duration(self):
        """AgentTimeoutError should include timeout duration."""
        error = AgentTimeoutError(30.0, agent_name="test")
        assert error.timeout_seconds == 30.0
        assert "30" in str(error)


# ============================================================================
# Phase 4 Regression Suite
# ============================================================================

class TestP4Regression:
    """Phase 4 Regression Tests - Must pass on every code change."""

    def test_p4_r01_prompt_loading(self, mock_client):
        """P4-R01: Prompts load from files."""
        agent = GeotechnicalTestAgent(mock_client)
        assert agent.system_prompt is not None
        assert len(agent.system_prompt) > 100

    def test_p4_r02_missing_prompt_error(self, mock_client):
        """P4-R02: Missing prompts error clearly."""
        class MissingAgent(BaseAgent):
            @property
            def agent_name(self) -> str:
                return "missing"

            @property
            def prompt_file(self) -> str:
                return "does_not_exist.txt"

            def _build_user_message(self, segment_data, context=None):
                return ""

        with pytest.raises(PromptLoadError):
            MissingAgent(mock_client)

    def test_p4_r03_json_extraction(self, mock_client, test_prompt_file):
        """P4-R03: JSON parsed from responses."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)

            # Test various JSON formats
            test_cases = [
                '{"key": "value"}',
                'Text before {"key": "value"}',
                '{"key": "value"} text after',
            ]

            for response in test_cases:
                result = agent._parse_response(response)
                assert "key" in result

    def test_p4_r04_invalid_json_fallback(self, mock_client, test_prompt_file):
        """P4-R04: Invalid JSON handled gracefully."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            agent = TestableAgent(mock_client, test_prompt_file)
            result = agent._parse_response("Not JSON at all")

            assert isinstance(result, dict)
            assert "flags" in result

    def test_p4_r05_api_integration(self, mock_client, test_prompt_file, sample_segment_data):
        """P4-R05: API calls succeed (mocked)."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_response = Mock()
            mock_response.content = [Mock(text='{"assessment": "favorable"}')]
            mock_client.messages.create.return_value = mock_response

            agent = TestableAgent(mock_client, test_prompt_file)
            result = agent.analyze(sample_segment_data)

            assert result is not None

    def test_p4_r06_timeout_handling(self, mock_client, test_prompt_file, sample_segment_data):
        """P4-R06: Timeouts are caught."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.APITimeoutError(request=Mock())

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(AgentTimeoutError):
                agent.analyze(sample_segment_data)

    def test_p4_r07_api_error_handling(self, mock_client, test_prompt_file, sample_segment_data):
        """P4-R07: API errors handled."""
        with patch.object(Settings, 'PROMPTS_DIR', test_prompt_file.parent):
            mock_client.messages.create.side_effect = anthropic.AuthenticationError(
                message="Invalid", body=None, response=Mock(status_code=401)
            )

            agent = TestableAgent(mock_client, test_prompt_file)

            with pytest.raises(APICallError):
                agent.analyze(sample_segment_data)

    def test_p4_r08_client_singleton(self):
        """P4-R08: Client reused correctly."""
        reset_client()
        c1 = get_client()
        c2 = get_client()
        assert c1 is c2
