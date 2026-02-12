#!/usr/bin/env bash
# AGRS ZEUS Control Wrapper
#
# Goal: make desktop/GUI-triggered start/stop/restart operations reliable.
# - Desktop entries often run with a minimal environment (PATH, etc.)
# - Rapid clicks can spawn concurrent operations
# This wrapper adds:
# - A stable PATH
# - A lock (flock) to serialize operations
# - Persistent logging for debugging
# - Optional backend health verification for start/restart commands

set -euo pipefail

CONTROL_SCRIPT="/opt/agrs/scripts/agrs-control.sh"

if [ ! -f "$CONTROL_SCRIPT" ]; then
  echo "ERROR: Missing control script: $CONTROL_SCRIPT" >&2
  exit 127
fi

if [ ! -x "$CONTROL_SCRIPT" ]; then
  echo "ERROR: Control script is not executable: $CONTROL_SCRIPT" >&2
  echo "Fix: chmod +x $CONTROL_SCRIPT" >&2
  exit 126
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $(basename "$0") <command> [args...]" >&2
  exit 2
fi

# Ensure a sane PATH for GUI/desktop launches.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

# Logging (per-user).
HOME_DIR="${HOME:-/tmp}"
STATE_HOME="${XDG_STATE_HOME:-$HOME_DIR/.local/state}"
LOG_DIR="${STATE_HOME}/agrs"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/agrs-control.log"
LOCK_FILE="${LOG_DIR}/agrs-control.lock"

now_iso() { date -Is 2>/dev/null || date; }

echo "" >>"$LOG_FILE"
echo "[$(now_iso)] user=$(id -un 2>/dev/null || echo '?') cwd=$(pwd) cmd=$CONTROL_SCRIPT $*" >>"$LOG_FILE"

# Serialize operations to avoid overlapping restarts.
# Important: use `flock -o` so the lock FD is NOT inherited by long-lived services
# started by the control script (uvicorn / npm). Without -o, the lock can remain
# held forever and the desktop control panel will appear "stuck".
LOCK_WAIT_SECONDS="${AGRS_CONTROL_LOCK_WAIT_SECONDS:-120}"
FLOCK_CONFLICT_EXIT_CODE=77

echo "[$(now_iso)] waiting for lock: $LOCK_FILE" >>"$LOG_FILE"

set +e
if command -v flock >/dev/null 2>&1; then
  flock -o -w "$LOCK_WAIT_SECONDS" -E "$FLOCK_CONFLICT_EXIT_CODE" "$LOCK_FILE" "$CONTROL_SCRIPT" "$@" 2>&1 | tee -a "$LOG_FILE"
  rc=${PIPESTATUS[0]}
else
  echo "[$(now_iso)] WARNING: flock not found; running without lock" | tee -a "$LOG_FILE" >&2
  "$CONTROL_SCRIPT" "$@" 2>&1 | tee -a "$LOG_FILE"
  rc=${PIPESTATUS[0]}
fi
set -e

if [ "$rc" -eq "$FLOCK_CONFLICT_EXIT_CODE" ]; then
  echo "[$(now_iso)] ERROR: lock busy after ${LOCK_WAIT_SECONDS}s: $LOCK_FILE" | tee -a "$LOG_FILE" >&2
  echo "Another AGRS control operation is already running (or a previous run leaked the lock)." >&2
  echo "See log: $LOG_FILE" >&2
  exit 1
fi

# For commands expected to bring up the backend, verify health as final success criteria.
backend_expected=false
case "${1:-}" in
  start-backend|restart-backend|start-zeus-backend|restart-zeus-backend|start-zeus|restart-zeus|start|restart)
    backend_expected=true
    ;;
esac

if [ "$rc" -eq 0 ] && $backend_expected && command -v curl >/dev/null 2>&1; then
  echo "[$(now_iso)] verifying ZEUS backend health: http://localhost:8000/api/health" | tee -a "$LOG_FILE"
  ok=false
  for _ in {1..30}; do
    if curl -fsS --max-time 2 "http://localhost:8000/api/health" >/dev/null 2>&1; then
      ok=true
      break
    fi
    sleep 1
  done

  if ! $ok; then
    echo "[$(now_iso)] ERROR: ZEUS backend is not healthy after '${1:-}'" | tee -a "$LOG_FILE"
    echo "[$(now_iso)] Tail of /tmp/backend.log (if present):" | tee -a "$LOG_FILE"
    tail -n 120 /tmp/backend.log 2>/dev/null | tee -a "$LOG_FILE" || true
    rc=1
  else
    echo "[$(now_iso)] ZEUS backend health OK" | tee -a "$LOG_FILE"
  fi
fi

exit "$rc"


