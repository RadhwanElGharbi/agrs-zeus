# Digital Twin Implementation Context

**Last Updated:** December 1, 2025  
**Target Platform:** Windows 11 (UE5 Development)  
**VM Platform:** Ubuntu Linux (Backend API + Frontend GUI)

---

## Current Status: Phase 1 Complete ✅

The backend API infrastructure for the Digital Twin is **fully implemented and operational** on the Linux VM. The Windows 11 instance is now responsible for building the Unreal Engine 5 application that will consume these APIs.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AGRS ZEUS Platform                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐         ┌──────────────────────────────────┐ │
│  │   Linux VM       │         │      Windows 11 Host             │ │
│  │  192.168.0.126   │◄───────►│   (UE5 Development)              │ │
│  │                  │  HTTP   │                                  │ │
│  │  ┌────────────┐  │  REST   │  ┌────────────────────────────┐  │ │
│  │  │ FastAPI    │  │  WS     │  │  Unreal Engine 5 Project   │  │ │
│  │  │ Backend    │  │         │  │  - AGRSDigitalTwin         │  │ │
│  │  │ :8000      │  │         │  │  - Pixel Streaming Ready   │  │ │
│  │  └────────────┘  │         │  └────────────────────────────┘  │ │
│  │                  │         │                                  │ │
│  │  ┌────────────┐  │         │  Key Components to Build:        │ │
│  │  │ Next.js    │  │         │  - UAGRSBackendClient (HTTP)     │ │
│  │  │ Frontend   │  │         │  - Terrain Generator (DEM)       │ │
│  │  │ :3000      │  │         │  - Pipeline Spline Mesh          │ │
│  │  └────────────┘  │         │  - PCG (Landcover → Assets)      │ │
│  │                  │         │  - Sensor HUD (WebSocket)        │ │
│  └──────────────────┘         └──────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Backend API Endpoints (Ready to Consume)

**Base URL:** `http://192.168.0.126:8000/api/digital-twin`

### 1. Health Check
```
GET /api/digital-twin/health
```
Response:
```json
{"status": "ok", "service": "AGRS Digital Twin API", "timestamp": "..."}
```

### 2. Project Info
```
GET /api/digital-twin/{project}/info
```
Returns project metadata, pipeline specs, and available data layers.

### 3. Terrain Data (DEM)
```
GET /api/digital-twin/{project}/terrain
```
Returns:
- `heightmap_base64`: Base64-encoded float32 heightmap array
- `width`, `height`: Dimensions in pixels
- `min_elevation`, `max_elevation`: Elevation range in meters
- `meters_per_pixel`: Scale factor
- `origin_lat`, `origin_lon`: Geographic origin
- `crs`: Coordinate reference system

### 4. Pipeline Route
```
GET /api/digital-twin/{project}/pipeline
```
Returns:
- `segments[]`: Array of pipeline segments with:
  - `coordinates`: [[lon, lat, elevation], ...]
  - `diameter_mm`, `wall_thickness_mm`, `material`
  - `start_elevation`, `end_elevation`, `slope_percent`
  - `crossing_type`: road, railway, waterway, etc.

### 5. Landcover Classification
```
GET /api/digital-twin/{project}/landcover
```
Returns:
- `classification_base64`: Base64-encoded uint8 class IDs
- `classes[]`: Mapping of class_id → name, color, ue5_asset_hint
- ESA WorldCover classes (Tree cover, Shrubland, Grassland, Cropland, Built-up, Water, etc.)

### 6. Sensor Data (HTTP)
```
GET /api/digital-twin/{project}/sensors
```
Returns current sensor readings for all segments (simulated for now).

### 7. Sensor Data (WebSocket - Real-time)
```
WS /api/digital-twin/{project}/sensors/stream
```
Streams sensor updates at 1Hz:
```json
{
  "timestamp": "...",
  "readings": [
    {"segment_id": "...", "pressure_bar": 45.2, "flow_rate_m3h": 1200, "temperature_c": 18.5, "status": "normal"}
  ]
}
```

---

## Test Project Available

**Project Name:** `US_PIPELINE` (or `test_project2`)

This project has:
- ✅ DEM terrain data (processed GeoTIFF)
- ✅ Landcover classification (ESA WorldCover)
- ✅ PIRL-generated pipeline route (GeoJSON)
- ✅ Pipeline specifications (diameter, material, etc.)

---

## UE5 Implementation Roadmap

### Phase 1: Backend Client (C++) ← **START HERE**
Create `UAGRSBackendClient` class:
```cpp
// AGRSBackendClient.h
UCLASS()
class UAGRSBackendClient : public UObject
{
    GENERATED_BODY()
public:
    void Initialize(const FString& BaseUrl);
    void FetchProjectInfo(const FString& ProjectName, TFunction<void(FProjectInfo)> Callback);
    void FetchTerrain(const FString& ProjectName, TFunction<void(FTerrainData)> Callback);
    void FetchPipeline(const FString& ProjectName, TFunction<void(FPipelineData)> Callback);
    void FetchLandcover(const FString& ProjectName, TFunction<void(FLandcoverData)> Callback);
    void ConnectSensorStream(const FString& ProjectName);
    
    DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSensorUpdate, const FSensorReading&, Reading);
    FOnSensorUpdate OnSensorUpdate;
};
```

### Phase 2: Terrain Generation
- Decode base64 heightmap → UTexture2D
- Create ALandscape from heightmap
- Apply terrain materials based on slope/elevation

### Phase 3: Pipeline Visualization
- Convert coordinates to UE5 world space
- Generate spline from segment coordinates
- Apply spline mesh with pipe material
- Add crossing markers (road, water, etc.)

### Phase 4: Procedural Content (PCG)
- Parse landcover classification
- Map class IDs to foliage/building assets
- Use PCG graph to spawn instances

### Phase 5: Sensor HUD
- WebSocket connection to sensor stream
- Billboards on pipeline segments
- Color-coded status (green/yellow/red)
- Click to focus and show details

### Phase 6: Pixel Streaming
- Enable Pixel Streaming plugin
- Configure signaling server
- Integrate with AGRS frontend

---

## Build.cs Dependencies

```csharp
PublicDependencyModuleNames.AddRange(new string[] {
    "Core",
    "CoreUObject",
    "Engine",
    "HTTP",
    "Json",
    "JsonUtilities",
    "WebSockets",
    "Landscape",
    "ProceduralMeshComponent",
    "PCG"  // If using PCG plugin
});
```

---

## Git Branch

**Branch:** `feature/digital-twin`

All Digital Twin work should be committed to this branch. The VM and Windows host share the same repository.

```bash
# On Windows, after cloning:
git checkout feature/digital-twin
git pull origin feature/digital-twin
```

---

## Key Files on VM

| File | Purpose |
|------|---------|
| `gui-v2/backend/api/digital_twin.py` | All Digital Twin API endpoints |
| `gui-v2/backend/main.py` | FastAPI app registration |
| `gui-v2/frontend/src/components/DigitalTwin/DigitalTwinView.tsx` | Frontend placeholder (Pixel Streaming ready) |
| `gui-v2/frontend/src/lib/pixelStreaming.ts` | Pixel Streaming client library |
| `docs/DIGITAL_TWIN_UE5_IMPLEMENTATION.md` | Detailed UE5 implementation guide |
| `docs/DIGITAL_TWIN_WINDOWS_SETUP.md` | Windows environment setup |
| `docs/VM_CONTEXT_RESPONSE.md` | Full API documentation with examples |

---

## Quick Test Commands (Windows PowerShell)

```powershell
# Test API connectivity
Invoke-RestMethod -Uri "http://192.168.0.126:8000/api/digital-twin/health"

# Get project info
Invoke-RestMethod -Uri "http://192.168.0.126:8000/api/digital-twin/US_PIPELINE/info"

# Get terrain metadata (without heightmap for quick test)
$terrain = Invoke-RestMethod -Uri "http://192.168.0.126:8000/api/digital-twin/US_PIPELINE/terrain"
Write-Host "Terrain: $($terrain.width)x$($terrain.height), Elevation: $($terrain.min_elevation)m - $($terrain.max_elevation)m"
```

---

## Next Steps for Windows 11

1. **Clone/Pull Repository**
   ```bash
   git clone https://github.com/RadhwanElGharbi/agrs-zeus.git
   cd agrs-zeus
   git checkout feature/digital-twin
   ```

2. **Create UE5 Project**
   - New C++ project named `AGRSDigitalTwin`
   - Enable: Landscape, PCG, Pixel Streaming plugins

3. **Implement Backend Client**
   - Start with `FetchProjectInfo` and `FetchTerrain`
   - Test with US_PIPELINE project

4. **Build Terrain System**
   - Decode heightmap
   - Generate landscape

5. **Iterate and Test**
   - Pipeline visualization
   - Landcover PCG
   - Sensor HUD

---

## Contact Points

- **Backend API Issues:** Check VM logs at `/tmp/backend.log`
- **Frontend Issues:** Check VM logs at `/tmp/frontend.log`
- **API Docs:** http://192.168.0.126:8000/api/docs (Swagger UI)

---

*This document provides the context needed for autonomous UE5 development on Windows 11. The backend is stable and ready for consumption.*




