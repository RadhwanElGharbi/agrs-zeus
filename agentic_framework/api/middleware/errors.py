"""Error Handling Middleware for API.

This module provides custom exception handlers for AgentErrors
and other exceptions, returning structured error responses.
"""
import logging
import traceback
from typing import Union

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from agents.exceptions import (
    AgentError,
    PromptLoadError,
    APICallError,
    ResponseParseError,
    AgentTimeoutError,
)
from data.route_loader import RouteNotFoundError, InvalidRouteError


logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers with the FastAPI app.

    Args:
        app: FastAPI application instance
    """

    @app.exception_handler(RouteNotFoundError)
    async def route_not_found_handler(
        request: Request, exc: RouteNotFoundError
    ) -> JSONResponse:
        """Handle RouteNotFoundError."""
        logger.warning(f"Route not found: {exc.route_id}")
        return JSONResponse(
            status_code=404,
            content={
                "error": "route_not_found",
                "detail": str(exc),
                "route_id": exc.route_id,
            }
        )

    @app.exception_handler(InvalidRouteError)
    async def invalid_route_handler(
        request: Request, exc: InvalidRouteError
    ) -> JSONResponse:
        """Handle InvalidRouteError."""
        logger.error(f"Invalid route: {exc.route_id} - {exc.original_error}")
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_route",
                "detail": str(exc),
                "route_id": exc.route_id,
            }
        )

    @app.exception_handler(PromptLoadError)
    async def prompt_load_error_handler(
        request: Request, exc: PromptLoadError
    ) -> JSONResponse:
        """Handle PromptLoadError."""
        logger.error(f"Prompt load error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "prompt_load_error",
                "detail": str(exc),
            }
        )

    @app.exception_handler(APICallError)
    async def api_call_error_handler(
        request: Request, exc: APICallError
    ) -> JSONResponse:
        """Handle APICallError."""
        logger.error(f"Anthropic API call error: {exc}")
        return JSONResponse(
            status_code=502,
            content={
                "error": "api_call_error",
                "detail": "External AI service error. Please try again.",
            }
        )

    @app.exception_handler(ResponseParseError)
    async def response_parse_error_handler(
        request: Request, exc: ResponseParseError
    ) -> JSONResponse:
        """Handle ResponseParseError."""
        logger.error(f"Response parse error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "response_parse_error",
                "detail": "Failed to parse agent response.",
            }
        )

    @app.exception_handler(AgentTimeoutError)
    async def agent_timeout_error_handler(
        request: Request, exc: AgentTimeoutError
    ) -> JSONResponse:
        """Handle AgentTimeoutError."""
        logger.error(f"Agent timeout: {exc}")
        return JSONResponse(
            status_code=504,
            content={
                "error": "agent_timeout",
                "detail": "Agent analysis timed out. Please try again.",
            }
        )

    @app.exception_handler(AgentError)
    async def agent_error_handler(
        request: Request, exc: AgentError
    ) -> JSONResponse:
        """Handle generic AgentError."""
        logger.error(f"Agent error: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error": "agent_error",
                "detail": str(exc),
            }
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(
        request: Request, exc: ValueError
    ) -> JSONResponse:
        """Handle ValueError (validation errors)."""
        logger.warning(f"Validation error: {exc}")
        return JSONResponse(
            status_code=400,
            content={
                "error": "validation_error",
                "detail": str(exc),
            }
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Handle unexpected exceptions."""
        logger.error(f"Unexpected error: {exc}")
        logger.error(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal_error",
                "detail": "An unexpected error occurred. Please try again.",
            }
        )


class SegmentNotFoundError(Exception):
    """Raised when a requested segment is not found in a route."""

    def __init__(self, segment_id: str, route_id: str):
        self.segment_id = segment_id
        self.route_id = route_id
        super().__init__(
            f"Segment '{segment_id}' not found in route '{route_id}'"
        )
