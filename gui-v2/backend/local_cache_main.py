"""
AGRS ZEUS - Local cache API entrypoint.

This app is intentionally lightweight and filesystem-focused. It avoids DB
startup checks and serves project/map data from an env-configurable projects
root so the desktop client can render mirrored local datasets quickly.
"""

from __future__ import annotations

import os

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.creator import router as creator_router
from api.data import router as data_router
from api.projects import router as projects_router
from api.project_utils import get_projects_root


API_ENV = os.getenv("API_ENV", "development").lower()
API_ENABLE_DOCS = os.getenv(
    "API_ENABLE_DOCS",
    "true" if API_ENV in ("dev", "development", "local") else "false",
).lower() == "true"


app = FastAPI(
    title="AGRS ZEUS Local Cache API",
    description="Filesystem-backed local cache API for project data rendering",
    version="1.0.0",
    docs_url="/api/docs" if API_ENABLE_DOCS else None,
    redoc_url="/api/redoc" if API_ENABLE_DOCS else None,
    openapi_url="/api/openapi.json" if API_ENABLE_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Filesystem-backed routes used by map/project rendering
app.include_router(projects_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(creator_router, prefix="/api")


@app.get("/")
async def root():
    projects_root = get_projects_root()
    return {
        "name": "AGRS ZEUS Local Cache API",
        "status": "operational",
        "projects_root": str(projects_root),
        "projects_root_exists": projects_root.exists(),
    }


@app.get("/health")
async def health():
    projects_root = get_projects_root()
    return {
        "status": "ok",
        "projects_root": str(projects_root),
        "projects_root_exists": projects_root.exists(),
    }


if __name__ == "__main__":
    host = os.getenv("LOCAL_CACHE_API_HOST", "127.0.0.1")
    port = int(os.getenv("LOCAL_CACHE_API_PORT", "8011"))
    uvicorn.run(
        "local_cache_main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )
