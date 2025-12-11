"""Agent implementations for pipeline route analysis.

This package contains:
- Base agent class with common functionality
- Specialist agents (Geotechnical, Environmental, Engineering, Cost)
- Master synthesis agent
- Anthropic client wrapper
- Custom exceptions
- Agent registry for instantiation
- Parallel executor for concurrent analysis
- Caching layer for response caching
- Fallback system for error handling
"""
from agents.base import BaseAgent
from agents.client import get_client, reset_client, test_connection
from agents.exceptions import (
    AgentError,
    PromptLoadError,
    APICallError,
    ResponseParseError,
    AgentTimeoutError
)

# Specialist agents
from agents.geotechnical import GeotechnicalAgent
from agents.environmental import EnvironmentalAgent
from agents.engineering import EngineeringAgent
from agents.cost import CostAgent
from agents.master import MasterAgent

# Registry
from agents.registry import (
    get_agent,
    get_all_specialist_agents,
    get_master_agent,
    get_available_agents,
    get_specialist_agent_names,
    AgentNotFoundError,
    AGENT_REGISTRY,
)

# Executor
from agents.executor import (
    run_agent_async,
    run_specialists_parallel,
    run_full_analysis,
    run_full_analysis_sync,
    run_specialists_sync,
    shutdown_executor,
)

# Cache
from agents.cache import (
    get_cached_response,
    save_to_cache,
    clear_cache,
    clear_segment_cache,
    get_cache_stats,
    get_cache_key,
    is_cached,
)

# Fallback
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

__all__ = [
    # Base
    "BaseAgent",
    # Client
    "get_client",
    "reset_client",
    "test_connection",
    # Exceptions
    "AgentError",
    "PromptLoadError",
    "APICallError",
    "ResponseParseError",
    "AgentTimeoutError",
    # Specialist Agents
    "GeotechnicalAgent",
    "EnvironmentalAgent",
    "EngineeringAgent",
    "CostAgent",
    "MasterAgent",
    # Registry
    "get_agent",
    "get_all_specialist_agents",
    "get_master_agent",
    "get_available_agents",
    "get_specialist_agent_names",
    "AgentNotFoundError",
    "AGENT_REGISTRY",
    # Executor
    "run_agent_async",
    "run_specialists_parallel",
    "run_full_analysis",
    "run_full_analysis_sync",
    "run_specialists_sync",
    "shutdown_executor",
    # Cache
    "get_cached_response",
    "save_to_cache",
    "clear_cache",
    "clear_segment_cache",
    "get_cache_stats",
    "get_cache_key",
    "is_cached",
    # Fallback
    "get_fallback_response",
    "generate_generic_fallback",
    "should_use_fallback",
    "add_predefined_fallback",
    "remove_predefined_fallback",
    "list_predefined_fallbacks",
    "is_fallback_response",
    "FALLBACK_RESPONSES",
]
