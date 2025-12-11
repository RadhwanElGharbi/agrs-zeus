#!/bin/bash
# AGRS ZEUS Control Script
# Usage: agrs-control.sh [start|stop|restart|status]

BACKEND_DIR="/opt/agrs/gui-v2/backend"
FRONTEND_DIR="/opt/agrs/gui-v2/frontend"
BACKEND_LOG="/tmp/backend.log"
FRONTEND_LOG="/tmp/next.log"

start_backend() {
    echo "Starting backend..."
    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup python -m uvicorn main:app --host 0.0.0.0 --port 8000 > "$BACKEND_LOG" 2>&1 &
    sleep 2
    if pgrep -f "uvicorn main:app" > /dev/null; then
        echo "Backend started successfully"
        return 0
    else
        echo "Backend failed to start"
        return 1
    fi
}

start_frontend() {
    echo "Starting frontend..."
    cd "$FRONTEND_DIR"
    nohup npm run dev:next > "$FRONTEND_LOG" 2>&1 &
    sleep 4
    if pgrep -f "next dev" > /dev/null; then
        echo "Frontend started successfully"
        return 0
    else
        echo "Frontend failed to start"
        return 1
    fi
}

stop_backend() {
    echo "Stopping backend..."
    pkill -9 -f "uvicorn main:app" 2>/dev/null
    sleep 1
    echo "Backend stopped"
}

stop_frontend() {
    echo "Stopping frontend..."
    pkill -9 -f "next dev" 2>/dev/null
    sleep 1
    echo "Frontend stopped"
}

status() {
    echo "=== AGRS ZEUS Status ==="
    if pgrep -f "uvicorn main:app" > /dev/null; then
        echo "Backend:  RUNNING"
    else
        echo "Backend:  STOPPED"
    fi
    if pgrep -f "next dev" > /dev/null; then
        echo "Frontend: RUNNING"
    else
        echo "Frontend: STOPPED"
    fi
}

case "$1" in
    start)
        start_backend
        start_frontend
        status
        ;;
    stop)
        stop_frontend
        stop_backend
        status
        ;;
    restart)
        stop_frontend
        stop_backend
        sleep 2
        start_backend
        start_frontend
        status
        ;;
    status)
        status
        ;;
    start-backend)
        start_backend
        ;;
    stop-backend)
        stop_backend
        ;;
    start-frontend)
        start_frontend
        ;;
    stop-frontend)
        stop_frontend
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|start-backend|stop-backend|start-frontend|stop-frontend}"
        exit 1
        ;;
esac
