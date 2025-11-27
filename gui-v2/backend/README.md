# AGRS ZEUS GUI v2 - Backend API

FastAPI-based REST API providing access to AGRS ZEUS core functionality.

## Tech Stack

- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Data validation

## Getting Started

### Prerequisites

- Python 3.11+
- pip

### Installation

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### Running

```bash
# Development mode (with auto-reload)
python main.py

# Production mode
API_RELOAD=false python main.py
```

Server will start on http://localhost:8000

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc

## Endpoints

### Health Check
```
GET /api/health
```

Returns API status and service health.

### Projects
```
GET /api/projects
GET /api/projects/{project_id}
```

List and retrieve project information.

### Configuration
```
GET /api/config
```

Get application configuration.

## Project Structure

```
backend/
├── api/
│   ├── __init__.py
│   └── routes.py       # API endpoints
├── core/
│   ├── __init__.py
│   └── bridge.py       # C++ core integration
├── main.py             # FastAPI app
└── requirements.txt    # Dependencies
```

## Configuration

Environment variables (optional):
```bash
API_HOST=127.0.0.1
API_PORT=8000
API_RELOAD=true
AGRS_TILE_CACHE_DIR=/opt/agrs/gui-v2/backend/.tile_cache
```

`AGRS_TILE_CACHE_DIR` controls where the persistent raster/vector tile cache is stored. Cached tiles are reused across process restarts to eliminate repeated `gdalwarp`/`ogr2ogr` work. Call `DELETE /api/data/cache` (or remove the directory manually) whenever you need to flush the cache after updating source datasets.

## Pre-rendering Tiles

To match ArcGIS-like performance, pre-generate raster or terrain tiles ahead of time:

```bash
cd backend
source venv/bin/activate
python scripts/precache_tiles.py \
  --project test_project2 \
  --layer soil \
  --min-zoom 8 \
  --max-zoom 14

# Terrain tiles (Mapbox Terrain-RGB):
python scripts/precache_tiles.py \
  --project test_project2 \
  --layer dem \
  --min-zoom 8 \
  --max-zoom 14 \
  --terrain
```

The script writes PNGs into `AGRS_TILE_CACHE_DIR`. On subsequent map loads, the API serves those cached files instantly with no GDAL processing. Re-run the script after underlying rasters change or when you expand zoom coverage.

## Development

### Adding New Endpoints

1. Define route in `api/routes.py`
2. Add Pydantic models for request/response
3. Test via Swagger UI

### C++ Core Integration

The `core/bridge.py` module provides interface to AGRS ZEUS C++ core:

```python
from core.bridge import zeus_bridge

# Use bridge methods
projects = zeus_bridge.get_projects()
```

**Note**: C++ integration is planned for future phase.

## Testing

```bash
# Run with pytest (when tests are added)
pytest
```

## CORS

CORS is configured for Electron app (localhost:3000). To add additional origins, update `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://your-origin"],
    ...
)
```

## License

Proprietary - Artemis Global Research Solutions Inc.



