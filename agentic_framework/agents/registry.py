"""Agent Registry for agent instantiation and management.

This module provides a centralized registry for creating and accessing
agent instances by name.
"""
from typing import Dict, List, Type

import anthropic

from agents.base import BaseAgent
from agents.geotechnical import GeotechnicalAgent
from agents.environmental import EnvironmentalAgent
from agents.engineering import EngineeringAgent
from agents.cost import CostAgent
from agents.master import MasterAgent


# Agent registry mapping names to classes
AGENT_REGISTRY: Dict[str, Type[BaseAgent]] = {
    "geotechnical": GeotechnicalAgent,
    "environmental": EnvironmentalAgent,
    "engineering": EngineeringAgent,
    "cost": CostAgent,
    "master": MasterAgent,
}

# Specialist agents (excludes master)
SPECIALIST_AGENTS = ["geotechnical", "environmental", "engineering", "cost"]


class AgentNotFoundError(Exception):
    """Raised when an unknown agent name is requested."""

    def __init__(self, agent_name: str):
        self.agent_name = agent_name
        available = ", ".join(AGENT_REGISTRY.keys())
        super().__init__(
            f"Unknown agent: '{agent_name}'. Available agents: {available}"
        )


def get_agent(name: str, client: anthropic.Anthropic) -> BaseAgent:
    """Get an agent instance by name.

    Args:
        name: Agent name (e.g., "geotechnical", "environmental")
        client: Anthropic client instance for the agent to use

    Returns:
        Instantiated agent of the requested type

    Raises:
        AgentNotFoundError: If the agent name is not recognized
    """
    if name not in AGENT_REGISTRY:
        raise AgentNotFoundError(name)

    agent_class = AGENT_REGISTRY[name]
    return agent_class(client)


def get_all_specialist_agents(client: anthropic.Anthropic) -> List[BaseAgent]:
    """Get instances of all specialist agents.

    Creates instances of geotechnical, environmental, engineering, and cost
    agents (excludes master synthesis agent).

    Args:
        client: Anthropic client instance for agents to use

    Returns:
        List of specialist agent instances
    """
    return [get_agent(name, client) for name in SPECIALIST_AGENTS]


def get_master_agent(client: anthropic.Anthropic) -> MasterAgent:
    """Get the master synthesis agent instance.

    Args:
        client: Anthropic client instance for the agent to use

    Returns:
        MasterAgent instance
    """
    return MasterAgent(client)


def get_available_agents() -> List[str]:
    """Get list of available agent names.

    Returns:
        List of registered agent names
    """
    return list(AGENT_REGISTRY.keys())


def get_specialist_agent_names() -> List[str]:
    """Get list of specialist agent names (excludes master).

    Returns:
        List of specialist agent names
    """
    return SPECIALIST_AGENTS.copy()
