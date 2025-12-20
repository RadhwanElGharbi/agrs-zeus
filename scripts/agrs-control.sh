#!/bin/bash
# AGRS ZEUS Control Script
# Usage: agrs-control.sh [start|stop|restart|status]
# Robust control script with proper port management

BACKEND_DIR="/opt/agrs/gui-v2/backend"
FRONTEND_DIR="/opt/agrs/gui-v2/frontend"
AGENTIC_DIR="/opt/agrs/agentic_framework"
BACKEND_LOG="/tmp/backend.log"
FRONTEND_LOG="/tmp/next.log"
AGENTIC_LOG="/tmp/agentic.log"
BACKEND_PORT=8000
FRONTEND_PORT=3000
AGENTIC_PORT=8001

# Kill any process using a specific port
kill_port() {
    local port=$1
    local pids=$(lsof -t -i:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "Killing processes on port $port: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 1
    fi
}

# Check if port is in use (using ss which is more reliable)
is_port_in_use() {
    local port=$1
    ss -tlnp 2>/dev/null | grep -q ":$port "
    return $?
}

# Check if backend is actually running and responsive
is_backend_running() {
    if is_port_in_use $BACKEND_PORT; then
        # Verify it's actually responding
        curl -s --max-time 2 http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1
        return $?
    fi
    return 1
}

# Check if frontend is actually running
is_frontend_running() {
    is_port_in_use $FRONTEND_PORT
    return $?
}

start_backend() {
    echo "Starting backend..."

    # Kill anything on backend port first
    if is_port_in_use $BACKEND_PORT; then
        echo "Port $BACKEND_PORT is in use, cleaning up..."
        kill_port $BACKEND_PORT
        sleep 1
    fi

    # Also kill any stray uvicorn processes
    pkill -f "uvicorn main:app" 2>/dev/null
    sleep 1

    # Start backend
    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup "$BACKEND_DIR/venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT > "$BACKEND_LOG" 2>&1 &

    # Wait and verify
    sleep 3
    if is_backend_running; then
        echo "Backend started successfully on port $BACKEND_PORT"
        return 0
    else
        echo "Backend failed to start. Check $BACKEND_LOG for details."
        return 1
    fi
}

start_frontend() {
    echo "Starting frontend..."

    # Kill anything on frontend port first
    if is_port_in_use $FRONTEND_PORT; then
        echo "Port $FRONTEND_PORT is in use, cleaning up..."
        kill_port $FRONTEND_PORT
        sleep 1
    fi

    # Also kill any stray next processes
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    sleep 1

    # Start frontend
    cd "$FRONTEND_DIR"
    nohup npm run dev:next > "$FRONTEND_LOG" 2>&1 &

    # Wait and verify (Next.js takes longer to start)
    sleep 6
    if is_frontend_running; then
        echo "Frontend started successfully on port $FRONTEND_PORT"
        return 0
    else
        echo "Frontend failed to start. Check $FRONTEND_LOG for details."
        return 1
    fi
}

stop_backend() {
    echo "Stopping backend..."

    # Kill by port first (most reliable)
    kill_port $BACKEND_PORT

    # Also kill by process name as backup
    pkill -f "uvicorn main:app" 2>/dev/null

    sleep 1

    if ! is_port_in_use $BACKEND_PORT; then
        echo "Backend stopped"
        return 0
    else
        echo "Warning: Port $BACKEND_PORT still in use"
        return 1
    fi
}

stop_frontend() {
    echo "Stopping frontend..."

    # Kill by port first (most reliable)
    kill_port $FRONTEND_PORT

    # Also kill by process name as backup
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-server" 2>/dev/null

    sleep 1

    if ! is_port_in_use $FRONTEND_PORT; then
        echo "Frontend stopped"
        return 0
    else
        echo "Warning: Port $FRONTEND_PORT still in use"
        return 1
    fi
}

start_agentic() {
    echo "Starting agentic framework (AI Analysis)..."

    # Kill anything on agentic port first
    if is_port_in_use $AGENTIC_PORT; then
        echo "Port $AGENTIC_PORT is in use, cleaning up..."
        kill_port $AGENTIC_PORT
        sleep 1
    fi

    # Start agentic framework
    cd "$AGENTIC_DIR"
    source venv/bin/activate
    nohup "$AGENTIC_DIR/venv/bin/python" run.py > "$AGENTIC_LOG" 2>&1 &

    # Wait and verify
    sleep 3
    if is_port_in_use $AGENTIC_PORT; then
        echo "Agentic framework started successfully on port $AGENTIC_PORT"
        return 0
    else
        echo "Agentic framework failed to start. Check $AGENTIC_LOG for details."
        return 1
    fi
}

stop_agentic() {
    echo "Stopping agentic framework..."

    # Kill by port first (most reliable)
    kill_port $AGENTIC_PORT

    sleep 1

    if ! is_port_in_use $AGENTIC_PORT; then
        echo "Agentic framework stopped"
        return 0
    else
        echo "Warning: Port $AGENTIC_PORT still in use"
        return 1
    fi
}

status() {
    echo "=== AGRS ZEUS Status ==="

    if is_backend_running; then
        echo "Backend:  RUNNING (port $BACKEND_PORT)"
    elif is_port_in_use $BACKEND_PORT; then
        echo "Backend:  PORT IN USE (not responding)"
    else
        echo "Backend:  STOPPED"
    fi

    if is_frontend_running; then
        echo "Frontend: RUNNING (port $FRONTEND_PORT)"
    else
        echo "Frontend: STOPPED"
    fi

    # Agentic framework (AI Analysis)
    if is_port_in_use $AGENTIC_PORT; then
        echo "Agentic:  RUNNING (port $AGENTIC_PORT)"
    else
        echo "Agentic:  STOPPED"
    fi

    # Also show pixel streaming proxy status
    if is_port_in_use 8888; then
        echo "PixelStream: RUNNING (port 8888)"
    else
        echo "PixelStream: STOPPED"
    fi
}

case "$1" in
    start)
        start_backend
        start_agentic
        start_frontend
        echo ""
        status
        ;;
    stop)
        stop_frontend
        stop_agentic
        stop_backend
        echo ""
        status
        ;;
    restart)
        echo "=== Stopping all services ==="
        stop_frontend
        stop_agentic
        stop_backend
        sleep 2
        echo ""
        echo "=== Starting all services ==="
        start_backend
        start_agentic
        start_frontend
        echo ""
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
    start-agentic)
        start_agentic
        ;;
    stop-agentic)
        stop_agentic
        ;;
    *)
        echo "AGRS ZEUS Control Script"
        echo "Usage: $0 {start|stop|restart|status|start-backend|stop-backend|start-frontend|stop-frontend|start-agentic|stop-agentic}"
        echo ""
        echo "Commands:"
        echo "  start          - Start all services (backend, agentic, frontend)"
        echo "  stop           - Stop all services"
        echo "  restart        - Restart all services"
        echo "  status         - Show service status"
        echo "  start-backend  - Start only backend (port 8000)"
        echo "  stop-backend   - Stop only backend"
        echo "  start-frontend - Start only frontend (port 3000)"
        echo "  stop-frontend  - Stop only frontend"
        echo "  start-agentic  - Start only agentic AI framework (port 8001)"
        echo "  stop-agentic   - Stop only agentic AI framework"
        exit 1
        ;;
esac
