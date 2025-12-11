#!/usr/bin/env python3
"""Entry point for running the Pipeline Route Optimization Agent API.

This script starts the uvicorn server with the FastAPI application.
"""
import uvicorn


def main():
    """Start the API server."""
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,  # Enable auto-reload for development
        log_level="info",
    )


if __name__ == "__main__":
    main()
