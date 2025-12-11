# Pipeline Route Optimization Agent API Contract

## Overview

This document defines the API contract for the Pipeline Route Optimization Agent System. The API provides AI-powered analysis of pipeline route segments using specialized agents for geotechnical, environmental, engineering, and cost assessments.

**Base URL:** `http://localhost:8000`
**API Version:** 1.0.0

---

## Authentication

Currently, the API does not require authentication. Authentication will be added in production deployments.

---

## Endpoints

### Health Check

#### GET /health

Check system health and connectivity.

**Response Model:** `HealthResponse`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "agents_available": ["geotechnical", "environmental", "engineering", "cost", "master"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` or `"degraded"` |
| `version` | string | API version |
| `agents_available` | string[] | List of available agent names |

**Status Codes:**
- `200 OK` - Health check successful

**curl Example:**
```bash
curl http://localhost:8000/health
```

---

#### GET /health/detailed

Get detailed health information including component status.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "components": {
    "anthropic_api": {
      "connected": true,
      "model": "claude-sonnet-4-20250514"
    },
    "cache": {
      "count": 5,
      "total_size_bytes": 12345
    },
    "routes": {
      "available_count": 2,
      "route_ids": ["sample_route", "saipem_aoi"]
    }
  },
  "config": {
    "dev_mode": true,
    "use_cached_responses": false
  },
  "agents_available": ["geotechnical", "environmental", "engineering", "cost", "master"]
}
```

---

### Segment Analysis

#### POST /api/explain

Analyze one or more pipeline route segments using AI agents.

**Request Model:** `ExplainRequest`

```json
{
  "route_id": "saipem_aoi",
  "segment_ids": ["1", "5", "10"],
  "include_agents": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `route_id` | string | Yes | Route identifier |
| `segment_ids` | string[] | Yes | List of segment IDs (cannot be empty) |
| `include_agents` | string[] | No | Filter agents (default: all) |

**Response Model:** `ExplainResponse[]`

Returns array of `ExplainResponse` objects (one per segment).

```json
[
  {
    "segment_id": "1",
    "overall_assessment": "challenging",
    "confidence": "medium",
    "executive_summary": "This 46-meter segment presents significant construction challenges...",
    "key_metrics": {
      "length_km": 0.046,
      "avg_slope": 25.17,
      "terrain": "rolling_hills",
      "land_use": "unknown",
      "construction_method": "Specialized trenching with slope stabilization",
      "estimated_cost": "$224,000 USD"
    },
    "specialist_summaries": {
      "geotechnical": "Steep 25.17% slope substantially exceeds limits...",
      "environmental": "Limited data availability with unknown land use...",
      "engineering": "Slope exceeds maximum allowable limit...",
      "cost": "Exceptional per-kilometer costs of $4.87M..."
    },
    "saipem_compliance": {
      "criteria_met": ["1"],
      "criteria_violated": ["2"],
      "compliance_notes": "Critical violation of maximum 20% slope requirement"
    },
    "flags": [
      "SLOPE_EXCEEDS_20_PERCENT: 25.17% slope exceeds 20% maximum",
      "HIGH_COST_SEGMENT: Exceptional costs of $4.87M per kilometer"
    ],
    "recommendations": [
      "Strongly consider route realignment to avoid the 25.17% slope",
      "Conduct detailed geotechnical investigation"
    ],
    "conflicts": []
  }
]
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `segment_id` | string | Segment identifier |
| `overall_assessment` | enum | `"favorable"`, `"caution"`, or `"challenging"` |
| `confidence` | enum | `"high"`, `"medium"`, or `"low"` |
| `executive_summary` | string | 2-3 sentence summary covering all domains |
| `key_metrics` | object | Key metrics from all analyses |
| `specialist_summaries` | object | One-sentence summary from each specialist |
| `saipem_compliance` | object | SAIPEM criteria compliance status |
| `flags` | string[] | Prioritized concern flags |
| `recommendations` | string[] | Actionable recommendations |
| `conflicts` | string[] | Conflicts between specialist assessments |

**KeyMetrics Object:**

| Field | Type | Description |
|-------|------|-------------|
| `length_km` | float | Segment length in kilometers |
| `avg_slope` | float | Average slope (degrees or percent) |
| `terrain` | string | Terrain classification |
| `land_use` | string | Primary land use type |
| `construction_method` | string | Recommended construction method |
| `estimated_cost` | string | Cost estimate (e.g., "$1.2M - $1.5M") |

**SpecialistSummaries Object:**

| Field | Type | Description |
|-------|------|-------------|
| `geotechnical` | string | Summary of geotechnical analysis |
| `environmental` | string | Summary of environmental analysis |
| `engineering` | string | Summary of engineering analysis |
| `cost` | string | Summary of cost analysis |

**SaipemCompliance Object:**

| Field | Type | Description |
|-------|------|-------------|
| `criteria_met` | string[] | List of met SAIPEM criteria |
| `criteria_violated` | string[] | List of violated criteria |
| `compliance_notes` | string | Notes on compliance |

**Response Headers:**
- `X-Processing-Time`: Total processing time (e.g., "12.34s")

**Status Codes:**
- `200 OK` - Analysis successful
- `404 Not Found` - Route or segment not found
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Analysis failed

**curl Example:**
```bash
curl -X POST http://localhost:8000/api/explain \
  -H "Content-Type: application/json" \
  -d '{
    "route_id": "saipem_aoi",
    "segment_ids": ["1", "5", "10"]
  }'
```

---

#### POST /api/explain/single

Analyze a single pipeline route segment.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `route_id` | string | Yes | Route identifier |
| `segment_id` | string | Yes | Segment identifier |
| `skip_cache` | bool | No | Bypass cache (default: false) |

**Response Model:** `ExplainResponse`

Same structure as single item in `/api/explain` response array.

**Response Headers:**
- `X-Cache`: `"HIT"` or `"MISS"`
- `X-Processing-Time`: Processing time (e.g., "8.45s")

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/explain/single?route_id=saipem_aoi&segment_id=1"
```

---

### Route Management

#### GET /api/routes

List all available routes.

**Response Model:** `RouteListItem[]`

```json
[
  {
    "route_id": "sample_route",
    "segment_count": 10
  },
  {
    "route_id": "saipem_aoi",
    "segment_count": 168
  }
]
```

**curl Example:**
```bash
curl http://localhost:8000/api/routes
```

---

#### GET /api/routes/{route_id}

Get detailed information about a route.

**Path Parameters:**
- `route_id` - Route identifier

**Response Model:** `RouteDetail`

```json
{
  "route_id": "saipem_aoi",
  "segment_count": 168,
  "metadata": {
    "crs": "EPSG:32633",
    "total_length_m": 7845.23,
    "total_reward": -12.45
  },
  "bounds": {
    "min_x": 456789.0,
    "min_y": 4567890.0,
    "max_x": 467890.0,
    "max_y": 4578901.0
  }
}
```

**Status Codes:**
- `200 OK` - Success
- `404 Not Found` - Route not found

**curl Example:**
```bash
curl http://localhost:8000/api/routes/saipem_aoi
```

---

#### GET /api/routes/{route_id}/segments

List segments in a route with basic info.

**Path Parameters:**
- `route_id` - Route identifier

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | int | No | Maximum segments to return |
| `offset` | int | No | Segments to skip (default: 0) |

**Response Model:** `SegmentListItem[]`

```json
[
  {
    "segment_id": "1",
    "length_m": 46.12,
    "start_coord": [456789.0, 4567890.0],
    "end_coord": [456835.0, 4567912.0]
  }
]
```

**curl Example:**
```bash
curl "http://localhost:8000/api/routes/saipem_aoi/segments?limit=10&offset=0"
```

---

#### GET /api/routes/{route_id}/segments/{segment_id}

Get detailed information about a specific segment.

**Response:**
```json
{
  "segment_id": "1",
  "route_id": "saipem_aoi",
  "coordinates": {
    "start": [456789.0, 4567890.0],
    "end": [456835.0, 4567912.0],
    "crs": "EPSG:32633"
  },
  "metrics": {
    "length_m": 46.12,
    "start_elevation_m": 150.5,
    "end_elevation_m": 162.3,
    "avg_slope_degrees": 14.32,
    "max_slope_degrees": 16.45,
    "slope_percent": 25.17,
    "max_slope_percent": 29.12
  },
  "properties": {
    "terrain_class": "rolling_hills",
    "land_use": "agricultural",
    "soil_type": "clay_loam",
    "geological_zone": "sedimentary"
  },
  "step": 1
}
```

**curl Example:**
```bash
curl http://localhost:8000/api/routes/saipem_aoi/segments/1
```

---

#### GET /api/routes/{route_id}/geometry

Get the full route geometry as GeoJSON.

**Response:**
```json
{
  "type": "Feature",
  "properties": {
    "crs": "EPSG:32633",
    "total_length_m": 7845.23
  },
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [456789.0, 4567890.0],
      [456835.0, 4567912.0]
    ]
  }
}
```

**curl Example:**
```bash
curl http://localhost:8000/api/routes/saipem_aoi/geometry
```

---

### Development Endpoints

> **Note:** These endpoints require `DEV_MODE=true` and return `403 Forbidden` in production.

#### POST /api/dev/fallback-mode

Enable or disable fallback mode.

**Request:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "message": "Fallback mode enabled",
  "use_cached_responses": true
}
```

**curl Example:**
```bash
curl -X POST http://localhost:8000/api/dev/fallback-mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

#### GET /api/dev/fallback-mode

Get current fallback mode status.

**Response:**
```json
{
  "use_cached_responses": false,
  "dev_mode": true
}
```

---

#### GET /api/dev/cache/clear

Clear all cached responses.

**Response:**
```json
{
  "message": "Cache cleared: 5 entries removed",
  "entries_cleared": 5
}
```

**curl Example:**
```bash
curl http://localhost:8000/api/dev/cache/clear
```

---

#### DELETE /api/dev/cache/{route_id}/{segment_id}

Clear cached response for a specific segment.

**curl Example:**
```bash
curl -X DELETE http://localhost:8000/api/dev/cache/saipem_aoi/1
```

---

#### GET /api/dev/cache/stats

Get cache statistics.

**Response:**
```json
{
  "count": 5,
  "total_size_bytes": 12345,
  "oldest_age_seconds": 3600,
  "newest_age_seconds": 60
}
```

---

#### GET /api/dev/status

Get development mode status and configuration.

**Response Model:** `DevStatusResponse`

```json
{
  "dev_mode": true,
  "use_cached_responses": false,
  "cache_stats": {
    "count": 5,
    "total_size_bytes": 12345
  },
  "predefined_fallbacks": ["seg_favorable_001", "seg_challenging_001"]
}
```

---

#### GET /api/dev/fallbacks

List all pre-defined fallback responses.

**Response:**
```json
{
  "count": 2,
  "segment_ids": ["seg_favorable_001", "seg_challenging_001"]
}
```

---

#### POST /api/dev/fallbacks/{segment_id}

Add a pre-defined fallback response for a segment.

**Request Body:** Full `ExplainResponse` JSON

**curl Example:**
```bash
curl -X POST http://localhost:8000/api/dev/fallbacks/my_segment \
  -H "Content-Type: application/json" \
  -d '{"segment_id": "my_segment", "overall_assessment": "favorable", ...}'
```

---

#### DELETE /api/dev/fallbacks/{segment_id}

Remove a pre-defined fallback response.

**curl Example:**
```bash
curl -X DELETE http://localhost:8000/api/dev/fallbacks/my_segment
```

---

#### POST /api/dev/settings

Update development settings.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `dev_mode` | bool | Cannot be changed at runtime |
| `use_cached_responses` | bool | Enable/disable cached responses |

**curl Example:**
```bash
curl -X POST "http://localhost:8000/api/dev/settings?use_cached_responses=true"
```

---

## Error Responses

All error responses follow the `ErrorResponse` model:

```json
{
  "error": "not_found",
  "detail": "Route 'nonexistent' not found",
  "segment_id": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | Error type/code |
| `detail` | string | Detailed error message |
| `segment_id` | string | Segment ID if error is segment-specific |

**Common HTTP Status Codes:**

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid input |
| `403` | Forbidden - DEV_MODE required |
| `404` | Not Found - Route/segment not found |
| `422` | Validation Error - Invalid request body |
| `500` | Internal Server Error |
| `502` | Bad Gateway - External API error |
| `504` | Gateway Timeout - Agent timeout |

---

## Assessment Levels

The `overall_assessment` field uses these values:

| Value | Description |
|-------|-------------|
| `favorable` | Segment has no significant concerns |
| `caution` | Segment has moderate concerns requiring attention |
| `challenging` | Segment has significant concerns requiring mitigation |

---

## Common Flags

Analysis may generate these flags:

**Geotechnical:**
- `SLOPE_EXCEEDS_20_PERCENT` - Slope exceeds SAIPEM 20% limit
- `LANDSLIDE_ZONE` - Risk of landslide
- `SIDE_SLOPE_ROUTE` - Route follows side slope
- `UNSTABLE_SOIL` - Soil stability concerns

**Environmental:**
- `PROTECTED_AREA_CROSSING` - Route crosses protected area
- `WETLAND_IMPACT` - Potential wetland impact
- `NO_ROW_ACCESS` - No existing right-of-way
- `WATER_BODY_PROXIMITY` - Close to water bodies

**Engineering:**
- `RAILWAY_CROSSING_NOT_TRENCHLESS` - Railway crossing requires HDD
- `NON_ORTHOGONAL_CROSSING` - Crossing angle not perpendicular
- `MULTIPLE_CROSSINGS` - Multiple infrastructure crossings

**Cost:**
- `HIGH_COST_SEGMENT` - Exceptional per-km costs
- `COST_UNCERTAINTY` - High uncertainty in estimate

---

## Running the Server

```bash
cd agentic_framework
source .venv/bin/activate
python run.py
```

Server starts at `http://localhost:8000`

---

## Quick Start Examples

**1. Check API health:**
```bash
curl http://localhost:8000/health
```

**2. List available routes:**
```bash
curl http://localhost:8000/api/routes
```

**3. Analyze a single segment:**
```bash
curl -X POST "http://localhost:8000/api/explain/single?route_id=saipem_aoi&segment_id=1"
```

**4. Analyze multiple segments:**
```bash
curl -X POST http://localhost:8000/api/explain \
  -H "Content-Type: application/json" \
  -d '{"route_id": "saipem_aoi", "segment_ids": ["1", "5", "10", "50", "100"]}'
```

**5. Enable fallback mode (dev only):**
```bash
curl -X POST http://localhost:8000/api/dev/fallback-mode \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

## Frontend Integration Notes

### Segment Click Handler
When a segment is clicked on the map:
1. Get `segment_id` from feature properties
2. Show loading state in explanation panel
3. Call `POST /api/explain/single?route_id={route_id}&segment_id={segment_id}`
4. Parse response and populate UI components

### Response Display Mapping
- `overall_assessment` → Colored badge (green/yellow/red)
- `executive_summary` → Main text panel
- `key_metrics` → Grid of key values
- `specialist_summaries` → Expandable sections
- `flags` → Warning alert badges
- `recommendations` → Action item list

### Error Handling
- Check `X-Cache` header to show cache status
- Use `X-Processing-Time` for user feedback
- Handle 404 for missing segments gracefully
- Implement loading timeout (recommended: 30s) with retry option

### Loading States
- Single segment: expect 5-15 seconds
- Multiple segments: expect 5-15 seconds per segment
- Cached responses: near-instant (<1 second)
