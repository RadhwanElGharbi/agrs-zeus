"""Base agent class for all specialist agents.

This module provides the abstract base class that all agents inherit from,
implementing common functionality for prompt loading, API calls, and
response parsing.
"""
import json
import logging
import re
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, Optional

import anthropic

from config.settings import Settings
from agents.exceptions import (
    AgentError,
    PromptLoadError,
    APICallError,
    ResponseParseError,
    AgentTimeoutError
)


logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract base class for all specialist agents.

    Provides common functionality for:
    - Loading system prompts from files
    - Making API calls to Claude
    - Parsing JSON responses
    - Error handling and retry logic

    Subclasses must implement:
    - agent_name property
    - prompt_file property
    - _build_user_message method
    """

    # Retry configuration
    MAX_RETRIES = 3
    RETRY_BACKOFF_BASE = 2  # Exponential backoff base (seconds)

    def __init__(self, client: anthropic.Anthropic):
        """Initialize the agent with an Anthropic client.

        Args:
            client: Configured Anthropic client instance

        Raises:
            PromptLoadError: If the prompt file cannot be loaded
        """
        self.client = client
        self.system_prompt = self._load_prompt()

    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Return the unique name identifier for this agent.

        Example: "geotechnical", "environmental", etc.
        """
        pass

    @property
    @abstractmethod
    def prompt_file(self) -> str:
        """Return the prompt filename (without path).

        Example: "geotechnical.txt"
        """
        pass

    @property
    def model(self) -> str:
        """Return the model to use for this agent.

        Can be overridden by subclasses (e.g., master agent uses different model).
        """
        return Settings.ANTHROPIC_MODEL

    def _load_prompt(self) -> str:
        """Load the system prompt from the prompts directory.

        Returns:
            str: Contents of the prompt file

        Raises:
            PromptLoadError: If the file cannot be read
        """
        prompt_path = Settings.PROMPTS_DIR / self.prompt_file

        if not prompt_path.exists():
            raise PromptLoadError(
                self.prompt_file,
                agent_name=self.agent_name,
                cause=FileNotFoundError(f"Prompt file not found: {prompt_path}")
            )

        try:
            return prompt_path.read_text(encoding='utf-8')
        except IOError as e:
            raise PromptLoadError(
                self.prompt_file,
                agent_name=self.agent_name,
                cause=e
            )

    @abstractmethod
    def _build_user_message(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build the user message for the API call.

        Args:
            segment_data: Dictionary containing segment information
            context: Optional additional context (e.g., other agent responses)

        Returns:
            str: Formatted user message
        """
        pass

    def _parse_response(self, response_text: str) -> Dict[str, Any]:
        """Parse JSON from the agent's response.

        Handles cases where JSON is embedded in surrounding text.

        Args:
            response_text: Raw response text from Claude

        Returns:
            Dict containing parsed response data

        Note:
            If parsing fails, returns a fallback dict with the original
            text and error flags rather than raising an exception.
        """
        # First try: direct JSON parse
        try:
            parsed = json.loads(response_text.strip())
            if isinstance(parsed, dict):
                return parsed
            # If valid JSON but not a dict (e.g., array), fall through to fallback
        except json.JSONDecodeError:
            pass

        # Second try: extract JSON from markdown code blocks first
        # This is the most common format from Claude
        code_block_patterns = [
            r'```json\s*([\s\S]*?)\s*```',  # JSON code block
            r'```\s*([\s\S]*?)\s*```',  # Generic code block
        ]

        for pattern in code_block_patterns:
            matches = re.findall(pattern, response_text)
            for match in matches:
                try:
                    content = match.strip()
                    if content.startswith('{'):
                        parsed = json.loads(content)
                        if isinstance(parsed, dict):
                            return parsed
                except json.JSONDecodeError:
                    continue

        # Third try: find raw JSON object in text
        # Find the first { and try to find matching }
        brace_start = response_text.find('{')
        if brace_start != -1:
            # Try to find matching closing brace by parsing increasingly longer substrings
            for end_pos in range(len(response_text), brace_start, -1):
                candidate = response_text[brace_start:end_pos]
                if candidate.rstrip().endswith('}'):
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        continue

        # Fallback: return structured error response
        logger.warning(
            f"[{self.agent_name}] Failed to parse JSON from response. "
            f"First 200 chars: {response_text[:200]}"
        )

        return {
            "agent": self.agent_name,
            "segment_id": "unknown",
            "assessment": "caution",
            "explanation": response_text[:500] if response_text else "No response received",
            "metrics": {},
            "flags": ["parse_error"],
            "_parse_error": True,
            "_raw_response": response_text[:1000] if response_text else ""
        }

    def _make_api_call(self, user_message: str) -> str:
        """Make the API call to Claude with retry logic.

        Args:
            user_message: The formatted user message

        Returns:
            str: The response text from Claude

        Raises:
            APICallError: If the API call fails after retries
            AgentTimeoutError: If the call times out
        """
        last_error = None

        for attempt in range(self.MAX_RETRIES):
            try:
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=Settings.MAX_TOKENS,
                    system=self.system_prompt,
                    messages=[{"role": "user", "content": user_message}],
                    timeout=Settings.API_TIMEOUT
                )

                # Extract text from response
                if response.content and len(response.content) > 0:
                    return response.content[0].text

                raise APICallError(
                    "Empty response received from API",
                    agent_name=self.agent_name
                )

            except anthropic.APITimeoutError as e:
                raise AgentTimeoutError(
                    Settings.API_TIMEOUT,
                    agent_name=self.agent_name
                )

            except anthropic.AuthenticationError as e:
                raise APICallError(
                    "Authentication failed - check API key",
                    agent_name=self.agent_name,
                    cause=e,
                    status_code=401
                )

            except anthropic.RateLimitError as e:
                last_error = e
                if attempt < self.MAX_RETRIES - 1:
                    wait_time = self.RETRY_BACKOFF_BASE ** (attempt + 1)
                    logger.warning(
                        f"[{self.agent_name}] Rate limited, waiting {wait_time}s before retry"
                    )
                    time.sleep(wait_time)
                    continue
                raise APICallError(
                    "Rate limit exceeded after retries",
                    agent_name=self.agent_name,
                    cause=e,
                    status_code=429
                )

            except anthropic.APIError as e:
                last_error = e
                if attempt < self.MAX_RETRIES - 1:
                    wait_time = self.RETRY_BACKOFF_BASE ** (attempt + 1)
                    logger.warning(
                        f"[{self.agent_name}] API error, waiting {wait_time}s before retry: {e}"
                    )
                    time.sleep(wait_time)
                    continue
                raise APICallError(
                    str(e),
                    agent_name=self.agent_name,
                    cause=e
                )

        # Should not reach here, but safety fallback
        raise APICallError(
            f"API call failed after {self.MAX_RETRIES} retries",
            agent_name=self.agent_name,
            cause=last_error
        )

    def analyze(
        self,
        segment_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyze a segment and return structured assessment.

        This is the main entry point for using an agent.

        Args:
            segment_data: Dictionary containing segment information
            context: Optional additional context (other agent responses, etc.)

        Returns:
            Dict containing the agent's analysis with standard fields:
            - agent: Agent name
            - segment_id: ID of analyzed segment
            - assessment: "favorable", "caution", or "challenging"
            - explanation: Technical explanation
            - metrics: Domain-specific metrics
            - flags: List of concern flags

        Raises:
            APICallError: If the API call fails
            AgentTimeoutError: If the call times out
        """
        logger.debug(f"[{self.agent_name}] Starting analysis for segment")

        # Build the user message
        user_message = self._build_user_message(segment_data, context)

        # Make API call
        response_text = self._make_api_call(user_message)

        # Parse and return response
        result = self._parse_response(response_text)

        # Ensure agent name is set correctly
        result["agent"] = self.agent_name

        logger.debug(f"[{self.agent_name}] Analysis complete: {result.get('assessment', 'unknown')}")

        return result
