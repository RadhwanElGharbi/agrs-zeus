"""
AGRS ZEUS GUI v2 - FastAPI Backend
Main application entry point
"""

import os
from pathlib import Path

def _load_env_file(path: Path) -> None:
    """
    Lightweight .env loader (keeps deps minimal and avoids override surprises).

    - Supports lines like: KEY=value
    - Supports lines like: export KEY=value
    - Strips surrounding single/double quotes from values
    - Uses setdefault() so process env / service manager env wins
    """

    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[len("export ") :].lstrip()
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            if key:
                os.environ.setdefault(key, value)


# Load environment files if present.
# We load `.env` (local/dev) and also `.env.production` to pick up prod-only keys
# like ADMIN_PASSWORD, without overriding anything already provided by the OS.
_load_env_file(Path(__file__).parent / ".env")
_load_env_file(Path(__file__).parent / ".env.production")

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from api.routes import router
from api.projects import router as projects_router
from api.pirl import router as pirl_router
from api.data import router as data_router
from api.dataset_fetch import router as dataset_router, recover_orphaned_jobs, cleanup_orphaned_staging
from api.alignment_sheets.router import router as alignment_sheets_router
from api.suppliers import router as suppliers_router
from api.auth import router as auth_router
from api.analytics import router as analytics_router
from api.agentic import router as agentic_router
from api.creator import router as creator_router
from api.engineering.pressure_design import router as engineering_router
from api.sorties import router as sorties_router
from api.settings import router as settings_router
from api.project_data_sync import router as project_data_sync_router
from api.app_updates import router as app_updates_router
from api.project_folders import router as project_folders_router
from api.users import router as users_router, bootstrap_initial_admin, bootstrap_rad_admin
from api.db import get_engine, get_sessionmaker

# Optional: audit routes (may not be present in some deployments)
try:
    from api.audit_routes import router as audit_router  # type: ignore
except ModuleNotFoundError:
    audit_router = None

# Deployment / security toggles
# - API docs (Swagger/ReDoc/OpenAPI) should not be exposed in remote/prod deployments.
# - Default behaviour:
#   - development: enabled
#   - production: disabled
API_ENV = os.getenv("API_ENV", "development").lower()
API_ENABLE_DOCS = os.getenv(
    "API_ENABLE_DOCS",
    "true" if API_ENV in ("dev", "development", "local") else "false",
).lower() == "true"

# Create FastAPI app
app = FastAPI(
    title="AGRS ZEUS API",
    description="REST API for AGRS ZEUS GUI v2",
    version="2.0.0",
    docs_url="/api/docs" if API_ENABLE_DOCS else None,
    redoc_url="/api/redoc" if API_ENABLE_DOCS else None,
    openapi_url="/api/openapi.json" if API_ENABLE_DOCS else None,
)


@app.on_event("startup")
def _startup_db_healthcheck() -> None:
    """
    Fail fast if DATABASE_URL is missing or the database is unreachable.
    """
    engine = get_engine()
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))

    # Optional bootstrap admin (if env vars are provided)
    SessionLocal = get_sessionmaker()
    with SessionLocal() as db:
        bootstrap_initial_admin(db)
        bootstrap_rad_admin(db)

    recovered = recover_orphaned_jobs()
    if recovered:
        print(f"[Startup] Recovered {len(recovered)} orphaned dataset fetch job(s): {recovered}")

    from api.project_utils import get_projects_root
    cleaned = cleanup_orphaned_staging(get_projects_root())
    if cleaned:
        print(f"[Startup] Cleaned {len(cleaned)} orphaned staging dir(s): {cleaned}")

# Configure CORS for Electron app and external access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "http://192.168.0.126:3000",
        "http://192.168.0.126:*",
        "*"  # Allow all origins for development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(pirl_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(dataset_router, prefix="/api")
app.include_router(alignment_sheets_router, prefix="/api")
app.include_router(suppliers_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(analytics_router, prefix="/api")
if audit_router is not None:
    app.include_router(audit_router, prefix="/api")
app.include_router(agentic_router, prefix="/api")
app.include_router(creator_router, prefix="/api")
app.include_router(engineering_router, prefix="/api")
app.include_router(sorties_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(project_folders_router, prefix="/api")
app.include_router(project_data_sync_router, prefix="/api")
app.include_router(app_updates_router, prefix="/api")

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "AGRS ZEUS API",
        "version": "2.0.0",
        "status": "operational"
    }

if __name__ == "__main__":
    # Get configuration from environment
    # Use 0.0.0.0 to allow access from host machine
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    reload = os.getenv("API_RELOAD", "true").lower() == "true"
    
    print(f"🚀 Starting AGRS ZEUS API Server on http://{host}:{port}")
    if API_ENABLE_DOCS:
        print(f"📚 API Documentation: http://{host}:{port}/api/docs")
    print(f"🌐 Access from host machine: http://192.168.0.126:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )

