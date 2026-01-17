#!/bin/bash
# AGRS ZEUS Control Script
# Usage: agrs-control.sh [start|stop|restart|status]
# Robust control script with proper port management

BACKEND_DIR="/opt/agrs/gui-v2/backend"
FRONTEND_DIR="/opt/agrs/gui-v2/frontend"
WEBSITE_DIR="/opt/agrs/website"
AGENTIC_DIR="/opt/agrs/agentic_framework"
BACKEND_LOG="/tmp/backend.log"
BACKEND_MIGRATIONS_LOG="/tmp/backend_migrations.log"
FRONTEND_LOG="/tmp/next.log"
WEBSITE_LOG="/tmp/website.log"
AGENTIC_LOG="/tmp/agentic.log"
BACKEND_PORT=8000
# NOTE: GUI-v2 Next.js dev server is configured to run on 3001 (see gui-v2/frontend/package.json)
FRONTEND_PORT=3001
WEBSITE_PORT=3000
AGENTIC_PORT=8001

# Postgres defaults for local development (used by backend)
POSTGRES_PORT=5432
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-agrs_postgres}"
DEFAULT_DB_USER="${DEFAULT_DB_USER:-agrs}"
DEFAULT_DB_PASSWORD="${DEFAULT_DB_PASSWORD:-agrs}"
DEFAULT_DB_NAME="${DEFAULT_DB_NAME:-agrs}"
DEFAULT_DATABASE_URL="${DEFAULT_DATABASE_URL:-postgresql+psycopg2://${DEFAULT_DB_USER}:${DEFAULT_DB_PASSWORD}@localhost:${POSTGRES_PORT}/${DEFAULT_DB_NAME}}"

# Set RUN_DB_MIGRATIONS=false to skip running alembic on startup
RUN_DB_MIGRATIONS_DEFAULT="${RUN_DB_MIGRATIONS_DEFAULT:-true}"

has_cmd() { command -v "$1" >/dev/null 2>&1; }

wait_for_port() {
    local port=$1
    local timeout=${2:-45}
    local waited=0
    while [ $waited -lt $timeout ]; do
        if is_port_in_use "$port"; then
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done
    return 1
}

ensure_database_url() {
    if [ -z "${DATABASE_URL:-}" ]; then
        export DATABASE_URL="$DEFAULT_DATABASE_URL"
        echo "DATABASE_URL not set; defaulting to local Postgres (localhost:${POSTGRES_PORT})."
    fi
}

is_local_postgres_url() {
    local url="${1:-}"
    [[ "$url" == postgres* ]] || return 1
    [[ "$url" == *"@localhost"* || "$url" == *"@127.0.0.1"* ]] || return 1
    return 0
}

wait_for_postgres_ready() {
    local timeout=${1:-45}
    local waited=0

    # Prefer a true readiness check if the container exists.
    if has_cmd docker && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$POSTGRES_CONTAINER"; then
        while [ $waited -lt $timeout ]; do
            if docker exec "$POSTGRES_CONTAINER" pg_isready -U "$DEFAULT_DB_USER" -d "$DEFAULT_DB_NAME" >/dev/null 2>&1; then
                return 0
            fi
            sleep 1
            waited=$((waited + 1))
        done
        return 1
    fi

    # Fallback: best-effort TCP check (port open).
    wait_for_port "$POSTGRES_PORT" "$timeout"
}

ensure_local_postgres_running() {
    ensure_database_url

    if ! is_local_postgres_url "$DATABASE_URL"; then
        # Remote DB or non-postgres URL; don't try to manage local postgres.
        return 0
    fi

    if is_port_in_use "$POSTGRES_PORT"; then
        return 0
    fi

    if ! has_cmd docker; then
        echo "ERROR: Postgres is required for the backend but port ${POSTGRES_PORT} is not in use, and Docker is not available."
        echo "       Start Postgres (or set DATABASE_URL to a reachable DB), then retry."
        return 1
    fi

    if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$POSTGRES_CONTAINER"; then
        echo "Starting Postgres container: ${POSTGRES_CONTAINER} ..."
        docker start "$POSTGRES_CONTAINER" >/dev/null 2>&1 || {
            echo "ERROR: Failed to start container ${POSTGRES_CONTAINER}."
            return 1
        }
    else
        echo "ERROR: Postgres is not running and Docker container '${POSTGRES_CONTAINER}' was not found."
        echo "       Create one (example):"
        echo "         docker run -d --name ${POSTGRES_CONTAINER} \\"
        echo "           -e POSTGRES_USER=${DEFAULT_DB_USER} -e POSTGRES_PASSWORD=${DEFAULT_DB_PASSWORD} -e POSTGRES_DB=${DEFAULT_DB_NAME} \\"
        echo "           -p ${POSTGRES_PORT}:5432 pgvector/pgvector:pg16"
        return 1
    fi

    if ! wait_for_postgres_ready 60; then
        echo "ERROR: Postgres did not become ready within 60s."
        return 1
    fi

    return 0
}

run_backend_migrations() {
    local run_migrations="${RUN_DB_MIGRATIONS:-$RUN_DB_MIGRATIONS_DEFAULT}"
    if [ "$run_migrations" = "false" ]; then
        return 0
    fi

    if [ ! -f "$BACKEND_DIR/alembic.ini" ] || [ ! -x "$BACKEND_DIR/venv/bin/alembic" ]; then
        # Backend may not use alembic in this environment; don't hard fail.
        return 0
    fi

    echo "Running backend DB migrations..."
    (cd "$BACKEND_DIR" && DATABASE_URL="$DATABASE_URL" "$BACKEND_DIR/venv/bin/alembic" upgrade head) > "$BACKEND_MIGRATIONS_LOG" 2>&1
    local rc=$?
    if [ $rc -ne 0 ]; then
        echo "Backend migrations failed (rc=$rc). Check $BACKEND_MIGRATIONS_LOG for details."
        return 1
    fi
    return 0
}

# Kill any process using a specific port
kill_port() {
    local port=$1
    local pids=""

    # Prefer fuser (more reliable than lsof in some constrained environments)
    if command -v fuser >/dev/null 2>&1; then
        pids=$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ')
        pids="${pids%% }"
    fi

    # Fallback to ss PID extraction
    if [ -z "$pids" ]; then
        pids=$(
            ss -H -tlnp 2>/dev/null | grep -E ":${port} " | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u | tr '\n' ' '
        )
        pids="${pids%% }"
    fi

    if [ -n "$pids" ]; then
        echo "Killing processes on port $port: $pids"
        echo "$pids" | tr ' ' '\n' | xargs -r kill -9 2>/dev/null
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
        # Verify it's actually responding (fallback to port check if curl isn't available)
        if has_cmd curl; then
            curl -s --max-time 2 http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1
            return $?
        fi
        return 0
    fi
    return 1
}

# Check if frontend is actually running
is_frontend_running() {
    is_port_in_use $FRONTEND_PORT
    return $?
}

is_website_running() {
    is_port_in_use $WEBSITE_PORT
    return $?
}

start_zeus_stack() {
    # ZEUS stack = backend API + agentic AI + ZEUS UI
    rc=0
    start_backend || rc=1
    start_agentic || rc=1
    start_frontend || rc=1
    return $rc
}

stop_zeus_stack() {
    # Stop in reverse order
    rc=0
    stop_frontend || rc=1
    stop_agentic || rc=1
    stop_backend || rc=1
    return $rc
}

restart_zeus_stack() {
    rc=0
    stop_zeus_stack || rc=1
    sleep 2
    start_zeus_stack || rc=1
    return $rc
}

restart_website_stack() {
    rc=0
    stop_website || rc=1
    sleep 1
    start_website || rc=1
    return $rc
}

restart_backend() {
    rc=0
    stop_backend || rc=1
    sleep 1
    start_backend || rc=1
    return $rc
}

restart_frontend() {
    rc=0
    stop_frontend || rc=1
    sleep 1
    start_frontend || rc=1
    return $rc
}

restart_agentic() {
    rc=0
    stop_agentic || rc=1
    sleep 1
    start_agentic || rc=1
    return $rc
}

start_backend() {
    echo "Starting backend..."

    if [ ! -d "$BACKEND_DIR" ]; then
        echo "Backend directory not found: $BACKEND_DIR"
        return 1
    fi
    if [ ! -x "$BACKEND_DIR/venv/bin/python" ]; then
        echo "Backend virtualenv not found at: $BACKEND_DIR/venv"
        echo "Hint: create it and install deps from $BACKEND_DIR/requirements.txt"
        return 1
    fi

    # Ensure DB is available for FastAPI startup (main.py fails fast if DB is unreachable)
    ensure_local_postgres_running || return 1
    run_backend_migrations || return 1

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
    DATABASE_URL="$DATABASE_URL" nohup "$BACKEND_DIR/venv/bin/python" -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT > "$BACKEND_LOG" 2>&1 &

    # Wait and verify (API can take a bit to initialize depending on DB/bootstrap)
    local timeout=45
    local waited=0
    while [ $waited -lt $timeout ]; do
        if is_backend_running; then
            echo "Backend started successfully on port $BACKEND_PORT"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    echo "Backend failed to start within ${timeout}s. Check $BACKEND_LOG for details."
    return 1
}

start_frontend() {
    echo "Starting frontend..."

    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "Frontend directory not found: $FRONTEND_DIR"
        return 1
    fi
    if ! has_cmd npm; then
        echo "npm not found in PATH; cannot start frontend."
        return 1
    fi

    # Kill anything on frontend port first
    if is_port_in_use $FRONTEND_PORT; then
        echo "Port $FRONTEND_PORT is in use, cleaning up..."
        kill_port $FRONTEND_PORT
        sleep 1
    fi

    # Start frontend
    cd "$FRONTEND_DIR"
    nohup npm run dev:next > "$FRONTEND_LOG" 2>&1 &

    # Wait and verify (Next.js takes longer to start)
    if wait_for_port "$FRONTEND_PORT" 60; then
        echo "Frontend started successfully on port $FRONTEND_PORT"
        return 0
    else
        echo "Frontend failed to start. Check $FRONTEND_LOG for details."
        return 1
    fi
}

start_website() {
    echo "Starting website..."

    if [ ! -d "$WEBSITE_DIR" ]; then
        echo "Website directory not found: $WEBSITE_DIR"
        return 1
    fi
    if ! has_cmd npm; then
        echo "npm not found in PATH; cannot start website."
        return 1
    fi

    # Kill anything on website port first
    if is_port_in_use $WEBSITE_PORT; then
        echo "Port $WEBSITE_PORT is in use, cleaning up..."
        kill_port $WEBSITE_PORT
        sleep 1
    fi

    # Start marketing website (bind 0.0.0.0; default port 3000)
    cd "$WEBSITE_DIR"
    PORT=$WEBSITE_PORT nohup npm run dev > "$WEBSITE_LOG" 2>&1 &

    # Wait and verify
    if wait_for_port "$WEBSITE_PORT" 60; then
        echo "Website started successfully on port $WEBSITE_PORT"
        return 0
    else
        echo "Website failed to start. Check $WEBSITE_LOG for details."
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

    sleep 1

    if ! is_port_in_use $FRONTEND_PORT; then
        echo "Frontend stopped"
        return 0
    else
        echo "Warning: Port $FRONTEND_PORT still in use"
        return 1
    fi
}

stop_website() {
    echo "Stopping website..."

    kill_port $WEBSITE_PORT

    sleep 1

    if ! is_port_in_use $WEBSITE_PORT; then
        echo "Website stopped"
        return 0
    else
        echo "Warning: Port $WEBSITE_PORT still in use"
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

    # Wait and verify (agentic can take a bit to initialize)
    local timeout=20
    local waited=0
    while [ $waited -lt $timeout ]; do
        if is_port_in_use $AGENTIC_PORT; then
            echo "Agentic framework started successfully on port $AGENTIC_PORT"
            return 0
        fi
        sleep 1
        waited=$((waited + 1))
    done

    echo "Agentic framework failed to start within ${timeout}s. Check $AGENTIC_LOG for details."
    return 1
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

    if is_website_running; then
        echo "Website:  RUNNING (port $WEBSITE_PORT)"
    else
        echo "Website:  STOPPED"
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
        rc=0
        start_backend || rc=1
        start_agentic || rc=1
        start_frontend || rc=1
        start_website || rc=1
        echo ""
        status
        exit $rc
        ;;
    stop)
        rc=0
        stop_website || rc=1
        stop_frontend || rc=1
        stop_agentic || rc=1
        stop_backend || rc=1
        echo ""
        status
        exit $rc
        ;;
    restart)
        rc=0
        echo "=== Stopping all services ==="
        stop_website || rc=1
        stop_frontend || rc=1
        stop_agentic || rc=1
        stop_backend || rc=1
        sleep 2
        echo ""
        echo "=== Starting all services ==="
        start_backend || rc=1
        start_agentic || rc=1
        start_frontend || rc=1
        start_website || rc=1
        echo ""
        status
        exit $rc
        ;;
    status)
        status
        exit 0
        ;;
    start-zeus)
        start_zeus_stack
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    stop-zeus)
        stop_zeus_stack
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    restart-zeus)
        restart_zeus_stack
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    start-website)
        start_website
        exit $?
        ;;
    stop-website)
        stop_website
        exit $?
        ;;
    restart-website)
        restart_website_stack
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    restart-backend)
        restart_backend
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    restart-frontend)
        restart_frontend
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    restart-agentic)
        restart_agentic
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    # Domain-friendly aliases (same underlying services)
    start-zeus-backend)
        start_backend
        exit $?
        ;;
    stop-zeus-backend)
        stop_backend
        exit $?
        ;;
    restart-zeus-backend)
        restart_backend
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    start-zeus-frontend)
        start_frontend
        exit $?
        ;;
    stop-zeus-frontend)
        stop_frontend
        exit $?
        ;;
    restart-zeus-frontend)
        restart_frontend
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    start-website-backend)
        # Website backend is implemented as Next.js API routes inside the website server (port 3000).
        start_website
        exit $?
        ;;
    stop-website-backend)
        stop_website
        exit $?
        ;;
    restart-website-backend)
        restart_website_stack
        rc=$?
        echo ""
        status
        exit $rc
        ;;
    start-backend)
        start_backend
        exit $?
        ;;
    stop-backend)
        stop_backend
        exit $?
        ;;
    start-frontend)
        start_frontend
        exit $?
        ;;
    stop-frontend)
        stop_frontend
        exit $?
        ;;
    start-agentic)
        start_agentic
        exit $?
        ;;
    stop-agentic)
        stop_agentic
        exit $?
        ;;
    *)
        echo "AGRS ZEUS Control Script"
        echo "Usage: $0 {start|stop|restart|status|start-zeus|stop-zeus|restart-zeus|start-website|stop-website|restart-website|restart-backend|restart-frontend|restart-agentic|start-zeus-backend|stop-zeus-backend|restart-zeus-backend|start-zeus-frontend|stop-zeus-frontend|restart-zeus-frontend|start-website-backend|stop-website-backend|restart-website-backend|start-backend|stop-backend|start-frontend|stop-frontend|start-agentic|stop-agentic}"
        echo ""
        echo "Commands:"
        echo "  start          - Start all services (backend, agentic, frontend)"
        echo "  stop           - Stop all services"
        echo "  restart        - Restart all services"
        echo "  status         - Show service status"
        echo "  start-zeus     - Start ZEUS stack (backend + agentic + ZEUS UI)"
        echo "  stop-zeus      - Stop ZEUS stack"
        echo "  restart-zeus   - Restart ZEUS stack"
        echo "  start-website  - Start only marketing site (port 3000)"
        echo "  stop-website   - Stop only marketing site"
        echo "  restart-website - Restart only marketing site"
        echo "  restart-backend - Restart backend API (port 8000)"
        echo "  restart-frontend - Restart ZEUS UI (port 3001)"
        echo "  restart-agentic - Restart agentic AI framework (port 8001)"
        echo "  start-zeus-backend / stop-zeus-backend / restart-zeus-backend - ZEUS backend controls (alias of backend)"
        echo "  start-zeus-frontend / stop-zeus-frontend / restart-zeus-frontend - ZEUS UI controls (alias of frontend)"
        echo "  start-website-backend / stop-website-backend / restart-website-backend - Website backend controls (alias of website)"
        echo "  start-backend  - Start only backend (port 8000)"
        echo "  stop-backend   - Stop only backend"
        echo "  start-frontend - Start only frontend (port 3001)"
        echo "  stop-frontend  - Stop only frontend"
        echo "  start-agentic  - Start only agentic AI framework (port 8001)"
        echo "  stop-agentic   - Stop only agentic AI framework"
        exit 1
        ;;
esac
