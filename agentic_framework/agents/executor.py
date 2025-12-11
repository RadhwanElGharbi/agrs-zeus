"""Parallel Agent Executor for concurrent agent analysis.

This module provides asynchronous execution capabilities for running
multiple agents in parallel, improving overall analysis performance.
"""
import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from agents.client import get_client
from agents.registry import (
    get_agent,
    get_master_agent,
    get_specialist_agent_names,
    SPECIALIST_AGENTS,
)
from agents.exceptions import AgentError


logger = logging.getLogger(__name__)

# Thread pool for running synchronous agent calls concurrently
_executor = ThreadPoolExecutor(max_workers=4)


async def run_agent_async(
    agent_name: str,
    segment_data: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Run an agent asynchronously.

    Wraps the synchronous agent.analyze() method to run in a thread pool.

    Args:
        agent_name: Name of the agent to run
        segment_data: Segment data to analyze
        context: Optional context for agents that need it (e.g., cost)

    Returns:
        Dict containing the agent's analysis result

    Raises:
        AgentError: If the agent fails
    """
    loop = asyncio.get_event_loop()
    client = get_client()
    agent = get_agent(agent_name, client)

    def _run():
        return agent.analyze(segment_data, context)

    return await loop.run_in_executor(_executor, _run)


async def run_specialists_parallel(
    segment_data: Dict[str, Any]
) -> Dict[str, Dict[str, Any]]:
    """Run all specialist agents in parallel.

    Executes geotechnical, environmental, and engineering agents concurrently,
    then runs the cost agent with the results as context.

    Args:
        segment_data: Segment data to analyze

    Returns:
        Dict mapping agent names to their analysis results
    """
    start_time = time.time()
    results: Dict[str, Dict[str, Any]] = {}
    errors: Dict[str, str] = {}

    # Run geo, env, eng in parallel (they don't depend on each other)
    parallel_agents = ["geotechnical", "environmental", "engineering"]

    async def run_with_error_handling(agent_name: str) -> tuple:
        """Run agent and catch errors."""
        try:
            result = await run_agent_async(agent_name, segment_data)
            return agent_name, result, None
        except AgentError as e:
            logger.error(f"[{agent_name}] Agent error: {e}")
            return agent_name, None, str(e)
        except Exception as e:
            logger.error(f"[{agent_name}] Unexpected error: {e}")
            return agent_name, None, str(e)

    # Run parallel agents
    parallel_tasks = [run_with_error_handling(name) for name in parallel_agents]
    parallel_results = await asyncio.gather(*parallel_tasks)

    # Process parallel results
    for agent_name, result, error in parallel_results:
        if result:
            results[agent_name] = result
        if error:
            errors[agent_name] = error
            # Create error response for failed agent
            results[agent_name] = {
                "agent": agent_name,
                "segment_id": segment_data.get("id", "unknown"),
                "assessment": "caution",
                "explanation": f"Analysis failed: {error}",
                "metrics": {},
                "flags": ["agent_error"],
                "_error": error
            }

    parallel_time = time.time() - start_time
    logger.debug(f"Parallel agents completed in {parallel_time:.2f}s")

    # Run cost agent with context from other agents
    cost_start = time.time()
    try:
        cost_context = {
            "geotechnical": results.get("geotechnical", {}),
            "environmental": results.get("environmental", {}),
            "engineering": results.get("engineering", {}),
        }
        cost_result = await run_agent_async("cost", segment_data, cost_context)
        results["cost"] = cost_result
    except AgentError as e:
        logger.error(f"[cost] Agent error: {e}")
        errors["cost"] = str(e)
        results["cost"] = {
            "agent": "cost",
            "segment_id": segment_data.get("id", "unknown"),
            "assessment": "caution",
            "explanation": f"Cost analysis failed: {e}",
            "metrics": {},
            "flags": ["agent_error"],
            "_error": str(e)
        }
    except Exception as e:
        logger.error(f"[cost] Unexpected error: {e}")
        errors["cost"] = str(e)
        results["cost"] = {
            "agent": "cost",
            "segment_id": segment_data.get("id", "unknown"),
            "assessment": "caution",
            "explanation": f"Cost analysis failed: {e}",
            "metrics": {},
            "flags": ["agent_error"],
            "_error": str(e)
        }

    cost_time = time.time() - cost_start
    total_time = time.time() - start_time

    logger.info(
        f"All specialists completed in {total_time:.2f}s "
        f"(parallel: {parallel_time:.2f}s, cost: {cost_time:.2f}s)"
    )

    if errors:
        logger.warning(f"Errors during specialist analysis: {list(errors.keys())}")

    return results


async def run_full_analysis(
    segment_data: Dict[str, Any]
) -> Dict[str, Any]:
    """Run complete analysis pipeline including synthesis.

    Executes all specialist agents and then runs the master synthesis
    agent to produce a comprehensive assessment.

    Args:
        segment_data: Segment data to analyze

    Returns:
        Dict containing the master synthesis response with all fields
    """
    start_time = time.time()

    # Run all specialists
    specialist_results = await run_specialists_parallel(segment_data)

    # Run master synthesis
    synthesis_start = time.time()
    try:
        client = get_client()
        master = get_master_agent(client)
        synthesis = master.synthesize(segment_data, specialist_results)
    except AgentError as e:
        logger.error(f"[master] Synthesis error: {e}")
        # Create fallback synthesis
        synthesis = _create_fallback_synthesis(segment_data, specialist_results, str(e))
    except Exception as e:
        logger.error(f"[master] Unexpected synthesis error: {e}")
        synthesis = _create_fallback_synthesis(segment_data, specialist_results, str(e))

    synthesis_time = time.time() - synthesis_start
    total_time = time.time() - start_time

    logger.info(
        f"Full analysis completed in {total_time:.2f}s "
        f"(specialists: {synthesis_start - start_time:.2f}s, synthesis: {synthesis_time:.2f}s)"
    )

    # Add timing metadata
    synthesis["_timing"] = {
        "total_seconds": total_time,
        "specialists_seconds": synthesis_start - start_time,
        "synthesis_seconds": synthesis_time,
    }

    return synthesis


def _create_fallback_synthesis(
    segment_data: Dict[str, Any],
    specialist_results: Dict[str, Dict[str, Any]],
    error: str
) -> Dict[str, Any]:
    """Create a fallback synthesis when master agent fails.

    Args:
        segment_data: Original segment data
        specialist_results: Results from specialist agents
        error: Error message from failed synthesis

    Returns:
        Dict containing fallback synthesis response
    """
    segment_id = segment_data.get("id", "unknown")

    # Aggregate assessments
    assessments = []
    flags = []
    for agent_name, result in specialist_results.items():
        if result:
            assessment = result.get("assessment", "caution")
            assessments.append(assessment)
            agent_flags = result.get("flags", [])
            flags.extend([f"{agent_name}: {f}" for f in agent_flags])

    # Determine overall assessment from aggregation
    if "challenging" in assessments:
        overall = "challenging"
    elif "caution" in assessments:
        overall = "caution"
    else:
        overall = "favorable"

    # Build specialist summaries
    specialist_summaries = {}
    for agent_name, result in specialist_results.items():
        if result:
            summary = result.get("explanation", "Assessment completed.")
            specialist_summaries[agent_name] = summary[:200]  # Truncate
        else:
            specialist_summaries[agent_name] = "No analysis available."

    return {
        "segment_id": segment_id,
        "overall_assessment": overall,
        "confidence": "low",
        "executive_summary": (
            f"Analysis completed for segment {segment_id} but synthesis failed. "
            f"Specialist assessments: {', '.join(assessments)}. "
            f"Error: {error}"
        ),
        "key_metrics": {
            "length_km": segment_data.get("metrics", {}).get("length_m", 0) / 1000.0,
            "avg_slope": segment_data.get("metrics", {}).get("avg_slope_degrees", 0),
        },
        "specialist_summaries": specialist_summaries,
        "saipem_compliance": {
            "criteria_met": [],
            "criteria_violated": [],
            "compliance_notes": "Compliance check unavailable due to synthesis error."
        },
        "flags": flags + ["synthesis_error"],
        "recommendations": ["Review specialist analyses individually due to synthesis failure."],
        "conflicts": [],
        "_synthesis_error": error,
        "_fallback": True,
    }


def run_full_analysis_sync(segment_data: Dict[str, Any]) -> Dict[str, Any]:
    """Synchronous wrapper for run_full_analysis.

    Convenience function for non-async contexts.

    Args:
        segment_data: Segment data to analyze

    Returns:
        Dict containing the master synthesis response
    """
    return asyncio.run(run_full_analysis(segment_data))


def run_specialists_sync(segment_data: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Synchronous wrapper for run_specialists_parallel.

    Convenience function for non-async contexts.

    Args:
        segment_data: Segment data to analyze

    Returns:
        Dict mapping agent names to their analysis results
    """
    return asyncio.run(run_specialists_parallel(segment_data))


def shutdown_executor():
    """Shutdown the thread pool executor.

    Should be called when the application is shutting down.
    """
    _executor.shutdown(wait=True)
