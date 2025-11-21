#!/bin/bash
# AGRS ZEUS GUI v2 Development Launcher
# This script starts both backend and frontend in development mode

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=============================================="
echo "  AGRS ZEUS GUI v2 - Development Mode"
echo "=============================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 18+ first"
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    echo "Please install Python 3.11+ first"
    exit 1
fi

echo "✓ Node.js: $(node --version)"
echo "✓ Python: $(python3 --version)"
echo ""

# Check if frontend dependencies are installed
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd "$SCRIPT_DIR/frontend"
    npm install
    echo ""
fi

# Check if backend dependencies are installed
if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    echo "📦 Setting up Python virtual environment..."
    cd "$SCRIPT_DIR/backend"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    echo ""
fi

echo "Starting AGRS ZEUS GUI v2 in development mode..."
echo ""
echo "Backend API will be available at: http://localhost:8000"
echo "API Documentation: http://localhost:8000/api/docs"
echo ""
echo "Frontend will open in Electron window shortly..."
echo "Press Ctrl+C to stop both services"
echo ""
echo "=============================================="
echo ""

# Start frontend (which will auto-start backend via Electron)
cd "$SCRIPT_DIR/frontend"
npm run dev

