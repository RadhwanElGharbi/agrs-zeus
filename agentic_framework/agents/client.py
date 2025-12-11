"""Anthropic client wrapper with singleton pattern.

This module provides a configured Anthropic client for agent use,
implementing the singleton pattern to reuse client instances.
"""
import anthropic
from typing import Optional

from config.settings import Settings


# Singleton client instance
_client_instance: Optional[anthropic.Anthropic] = None


def get_client() -> anthropic.Anthropic:
    """Get the Anthropic client instance (singleton).

    Creates a new client on first call, returns the same instance
    on subsequent calls.

    Returns:
        anthropic.Anthropic: Configured Anthropic client

    Raises:
        ValueError: If API key is not configured
    """
    global _client_instance

    if _client_instance is None:
        Settings.validate()  # Raises if API key invalid
        _client_instance = anthropic.Anthropic(
            api_key=Settings.ANTHROPIC_API_KEY
        )

    return _client_instance


def reset_client() -> None:
    """Reset the singleton client instance.

    Useful for testing or when API key changes.
    """
    global _client_instance
    _client_instance = None


def test_connection() -> bool:
    """Test that the Anthropic API connection works.

    Makes a minimal API call to verify credentials are valid.

    Returns:
        bool: True if connection successful

    Raises:
        anthropic.AuthenticationError: If API key is invalid
        anthropic.APIError: If API call fails
    """
    client = get_client()
    try:
        response = client.messages.create(
            model=Settings.ANTHROPIC_MODEL,
            max_tokens=10,
            messages=[{"role": "user", "content": "Say 'OK'"}]
        )
        return response.content is not None and len(response.content) > 0
    except anthropic.AuthenticationError:
        raise
    except anthropic.APIError:
        raise
