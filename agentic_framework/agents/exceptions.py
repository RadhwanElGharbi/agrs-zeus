"""Agent exception classes for error handling.

This module defines custom exceptions for agent-related errors including
prompt loading, API calls, response parsing, and timeouts.
"""


class AgentError(Exception):
    """Base exception class for all agent-related errors."""

    def __init__(self, message: str, agent_name: str = None):
        self.agent_name = agent_name
        self.message = message
        super().__init__(f"[{agent_name}] {message}" if agent_name else message)


class PromptLoadError(AgentError):
    """Raised when a prompt file cannot be loaded.

    This occurs when:
    - The prompt file does not exist
    - The file cannot be read
    - The file encoding is invalid
    """

    def __init__(self, prompt_file: str, agent_name: str = None, cause: Exception = None):
        self.prompt_file = prompt_file
        self.cause = cause
        message = f"Failed to load prompt file '{prompt_file}'"
        if cause:
            message += f": {cause}"
        super().__init__(message, agent_name)


class APICallError(AgentError):
    """Raised when an Anthropic API call fails.

    This wraps errors from the Anthropic API including:
    - Authentication errors (invalid API key)
    - Rate limit errors
    - Server errors
    - Network errors
    """

    def __init__(
        self,
        message: str,
        agent_name: str = None,
        cause: Exception = None,
        status_code: int = None
    ):
        self.cause = cause
        self.status_code = status_code
        if status_code:
            message = f"API error (status {status_code}): {message}"
        super().__init__(message, agent_name)


class ResponseParseError(AgentError):
    """Raised when an agent response cannot be parsed.

    This occurs when:
    - The response is not valid JSON
    - The JSON structure is missing required fields
    - The response format is unexpected
    """

    def __init__(
        self,
        message: str,
        agent_name: str = None,
        raw_response: str = None
    ):
        self.raw_response = raw_response
        super().__init__(message, agent_name)


class AgentTimeoutError(AgentError):
    """Raised when an API call times out.

    This occurs when the Anthropic API does not respond
    within the configured timeout period.
    """

    def __init__(
        self,
        timeout_seconds: float,
        agent_name: str = None
    ):
        self.timeout_seconds = timeout_seconds
        message = f"API call timed out after {timeout_seconds} seconds"
        super().__init__(message, agent_name)
