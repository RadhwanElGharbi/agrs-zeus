#!/bin/bash
# AGRS ZEUS GUI v2 - Web Browser Version
# This launches the app in your default web browser (more stable)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=============================================="
echo "  AGRS ZEUS GUI v2 - Web Browser Version"
echo "=============================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed"
    exit 1
fi

# Start backend
echo "Starting FastAPI backend..."
cd "$SCRIPT_DIR/backend"
source venv/bin/activate

# Start backend in background
python main.py &
BACKEND_PID=$!

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 3

# Check if backend is running
if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "✓ Backend is running"
else
    echo "❌ Backend failed to start"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo ""
echo "✅ Backend API: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/api/docs"
echo ""

# Start frontend dev server
echo "Starting Next.js frontend..."
cd "$SCRIPT_DIR/frontend"

echo ""
echo "================================================"
echo "  AGRS ZEUS GUI v2 is starting..."
echo "================================================"
echo ""
echo "  Frontend will be available at:"
echo "  http://localhost:3000"
echo ""
echo "  The app will open in your browser shortly."
echo ""
echo "  Press Ctrl+C to stop both services"
echo "================================================"
echo ""

# This will open the browser automatically when ready
npm run dev:next

# Cleanup
kill $BACKEND_PID 2>/dev/null || true



