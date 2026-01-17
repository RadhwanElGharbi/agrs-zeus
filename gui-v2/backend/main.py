"""
AGRS ZEUS GUI v2 - FastAPI Backend
Main application entry point
"""

import os
from pathlib import Path

# Load .env file if present
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from api.routes import router
from api.projects import router as projects_router
from api.pirl import router as pirl_router
from api.data import router as data_router
from api.dataset_fetch import router as dataset_router
from api.alignment_sheets.router import router as alignment_sheets_router
from api.suppliers import router as suppliers_router
from api.auth import router as auth_router
from api.analytics import router as analytics_router
from api.agentic import router as agentic_router
from api.creator import router as creator_router
from api.engineering.pressure_design import router as engineering_router
from api.audit_routes import router as audit_router
from api.sorties import router as sorties_router
from api.users import router as users_router, bootstrap_initial_admin, bootstrap_rad_admin
from api.db import get_engine, get_sessionmaker

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
app.include_router(audit_router, prefix="/api")
app.include_router(agentic_router, prefix="/api")
app.include_router(creator_router, prefix="/api")
app.include_router(engineering_router, prefix="/api")
app.include_router(sorties_router, prefix="/api")

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

