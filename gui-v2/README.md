# AGRS ZEUS GUI v2 - Enterprise Desktop Application

An AI-powered, enterprise-grade geospatial platform built with Electron, React, Next.js, and FastAPI.

## Architecture

- **Frontend**: Electron + React + Next.js + Tailwind CSS + shadcn/ui
- **Backend**: FastAPI (Python) REST API
- **Mapping**: Mapbox GL JS
- **Build**: Electron Builder for native executables

## Directory Structure

```
gui-v2/
├── frontend/          # Electron + React + Next.js application
├── backend/           # FastAPI REST API server
├── docs/              # Documentation
└── README.md
```

## Quick Start

### Option 1: Run Production Executable (Recommended)

The application has been pre-built and is ready to run:

```bash
# From the gui-v2 directory
./launch-gui.sh
```

**Or directly:**
```bash
./frontend/dist/"AGRS ZEUS GUI v2-2.0.0.AppImage"
```

### Option 2: Development Mode

```bash
# From the gui-v2 directory
./dev-start.sh
```

This will automatically:
- Install dependencies if needed
- Start the FastAPI backend
- Launch the Electron app with hot-reload

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- Mapbox access token (optional, for full map functionality)

### Manual Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Backend will run on http://localhost:8000
API docs: http://localhost:8000/api/docs

### Manual Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

This starts both the Next.js dev server and Electron app.

## Building Native Executable

```bash
cd frontend
npm run build
npm run electron-pack
```

Executable will be in `frontend/dist/`

The build creates:
- **AppImage**: `AGRS ZEUS GUI v2-2.0.0.AppImage` (~191 MB)
- **Unpacked directory**: `linux-unpacked/` (for development)

## Running the Application

### Production Mode
```bash
./launch-gui.sh
# or
./frontend/dist/"AGRS ZEUS GUI v2-2.0.0.AppImage"
```

### Development Mode
```bash
./dev-start.sh
# or manually:
# Terminal 1: cd backend && source venv/bin/activate && python main.py
# Terminal 2: cd frontend && npm run dev
```

## Features (Current Milestone)

- ✅ Enterprise-grade dark theme UI
- ✅ Sidebar navigation
- ✅ Interactive Mapbox GL JS map viewer
- ✅ Backend API health check
- ✅ Native desktop executable

## Roadmap

- Authentication and user management
- Integration with AGRS ZEUS C++ core
- PIRL training interface
- Project management
- Dataset visualization
- Real-time data processing

## Technology Stack

### Frontend
- **Electron**: Native desktop wrapper
- **React 18**: UI components
- **Next.js 14**: Framework with App Router
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Enterprise component library
- **Mapbox GL JS**: Professional mapping

### Backend
- **FastAPI**: High-performance Python web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Data validation

## License

Proprietary - Artemis Global Research Solutions Inc.

