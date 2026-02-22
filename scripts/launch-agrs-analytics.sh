#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_ROOT="/opt/agrs/analytics-dashboard"
DASHBOARD_BIN="$DASHBOARD_ROOT/dist/AGRS-Analytics"
DASHBOARD_PY="$DASHBOARD_ROOT/dashboard.py"
CONTROL_SCRIPT="/opt/agrs/scripts/agrs-control.sh"
ANALYTICS_DIR="/opt/agrs/analytics"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/agrs-analytics"
LOG_FILE="$STATE_DIR/launcher.log"
MODE="${1:---dashboard}"

mkdir -p "$STATE_DIR" "$ANALYTICS_DIR"
touch "$LOG_FILE"

log() {
  printf '%s [%s] %s\n' "$(date -Iseconds)" "${MODE#--}" "$*" >>"$LOG_FILE"
}

backend_healthy() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 2 "http://127.0.0.1:8000/api/health" >/dev/null 2>&1
    return $?
  fi

  # Fallback when curl is unavailable: simple TCP port check.
  ss -H -tln 2>/dev/null | awk '{print $4}' | awk -F: '$NF==8000 { ok=1 } END { exit(ok ? 0 : 1) }'
}

ensure_analytics_files() {
  local sessions_file="$ANALYTICS_DIR/sessions.json"
  local today_file="$ANALYTICS_DIR/events_$(date +%F).jsonl"
  local operations_file="$ANALYTICS_DIR/operations_$(date +%F).jsonl"

  if [[ ! -f "$sessions_file" ]]; then
    printf '{}\n' >"$sessions_file"
    log "Created missing sessions.json scaffold."
  fi

  touch "$today_file"
  touch "$operations_file"
}

start_backend_if_needed() {
  if backend_healthy; then
    log "Backend healthy."
    return 0
  fi

  if [[ ! -x "$CONTROL_SCRIPT" ]]; then
    log "Control script missing or not executable: $CONTROL_SCRIPT"
    return 1
  fi

  log "Backend not healthy; attempting auto-heal with start-backend."
  "$CONTROL_SCRIPT" start-backend >>"$LOG_FILE" 2>&1 || true

  local waited=0
  while [[ $waited -lt 45 ]]; do
    if backend_healthy; then
      log "Backend recovered after auto-heal."
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  log "Backend still unhealthy after auto-heal attempt."
  return 1
}

launch_dashboard() {
  ensure_analytics_files
  start_backend_if_needed || log "Continuing without healthy backend; dashboard will show stale/static data."

  if [[ -x "$DASHBOARD_BIN" ]]; then
    log "Launching packaged dashboard binary."
    cd "$DASHBOARD_ROOT/dist"
    exec "$DASHBOARD_BIN"
  fi

  if [[ -f "$DASHBOARD_PY" ]]; then
    log "Packaged binary not found; falling back to Python dashboard.py."
    cd "$DASHBOARD_ROOT"
    if [[ -x "$DASHBOARD_ROOT/venv/bin/python3" ]]; then
      exec "$DASHBOARD_ROOT/venv/bin/python3" "$DASHBOARD_PY"
    fi
    exec python3 "$DASHBOARD_PY"
  fi

  log "Dashboard launch failed: no binary or Python entrypoint found."
  exit 1
}

open_live_feed_terminal() {
  ensure_analytics_files
  start_backend_if_needed || log "Live feed opened while backend is unhealthy."

  local today_file="$ANALYTICS_DIR/events_$(date +%F).jsonl"
  local operations_file="$ANALYTICS_DIR/operations_$(date +%F).jsonl"
  local sessions_file="$ANALYTICS_DIR/sessions.json"
  local tail_cmd="
echo 'AGRS Live Feed'
echo 'Files:'
echo '  $today_file'
echo '  $operations_file'
echo '  $sessions_file'
echo
tail -n 200 -F '$today_file' '$operations_file' '$sessions_file'
"

  if command -v gnome-terminal >/dev/null 2>&1; then
    log "Opening live feed in gnome-terminal."
    nohup gnome-terminal --title="AGRS Live Feed" -- bash -lc "$tail_cmd" >/dev/null 2>&1 &
    exit 0
  fi

  if command -v x-terminal-emulator >/dev/null 2>&1; then
    log "Opening live feed in x-terminal-emulator."
    nohup x-terminal-emulator -e bash -lc "$tail_cmd" >/dev/null 2>&1 &
    exit 0
  fi

  log "No terminal emulator found; falling back to dashboard launch."
  launch_dashboard
}

open_analytics_dir() {
  ensure_analytics_files
  if command -v xdg-open >/dev/null 2>&1; then
    log "Opening analytics directory in file manager."
    nohup xdg-open "$ANALYTICS_DIR" >/dev/null 2>&1 &
    exit 0
  fi
  log "xdg-open unavailable; cannot open analytics directory."
  exit 1
}

case "$MODE" in
  --dashboard)
    launch_dashboard
    ;;
  --live-feed)
    open_live_feed_terminal
    ;;
  --open-folder)
    open_analytics_dir
    ;;
  *)
    log "Unknown mode: $MODE (falling back to --dashboard)"
    launch_dashboard
    ;;
esac
