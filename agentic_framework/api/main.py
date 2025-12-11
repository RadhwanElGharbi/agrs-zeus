"""FastAPI Application Setup for Pipeline Route Optimization Agent System.

This module creates and configures the FastAPI application with CORS,
routers, and event handlers.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import Settings
from agents.client import test_connection, reset_client
from agents.executor import shutdown_executor

from api.routes import health, explain, routes, dev
from api.middleware.errors import register_exception_handlers


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Application version
APP_VERSION = "1.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    logger.info("Starting Pipeline Route Optimization Agent API...")
    logger.info(f"Version: {APP_VERSION}")
    logger.info(f"DEV_MODE: {Settings.DEV_MODE}")

    # Verify Anthropic connection
    try:
        if test_connection():
            logger.info("Anthropic API connection verified")
            app.state.anthropic_connected = True
        else:
            logger.warning("Anthropic API connection returned unexpected result")
            app.state.anthropic_connected = False
    except Exception as e:
        logger.error(f"Failed to connect to Anthropic API: {e}")
        app.state.anthropic_connected = False

    yield

    # Shutdown
    logger.info("Shutting down Pipeline Route Optimization Agent API...")
    shutdown_executor()
    reset_client()
    logger.info("Shutdown complete")


# Create FastAPI application
app = FastAPI(
    title="Pipeline Route Optimization Agent API",
    description="AI-powered pipeline route segment analysis using specialized agents",
    version=APP_VERSION,
    lifespan=lifespan,
)

# Configure CORS middleware
# In production, restrict origins to specific domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register exception handlers
register_exception_handlers(app)

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(explain.router, prefix="/api", tags=["Analysis"])
app.include_router(routes.router, prefix="/api", tags=["Routes"])
app.include_router(dev.router, prefix="/api/dev", tags=["Development"])


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Pipeline Route Optimization Agent API",
        "version": APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }
