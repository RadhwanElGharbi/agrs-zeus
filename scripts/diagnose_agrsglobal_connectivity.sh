#!/usr/bin/env bash
set -euo pipefail

# Diagnose common reasons some networks/users can't reach agrsglobal.com:
# - DNS issues (wrong/stale A/AAAA records)
# - IPv4 routing blocked / no IPv4 connectivity
# - IPv6-only networks + no AAAA record (no DNS64/NAT64 when using custom DNS/DoH)
# - TLS/certificate validation problems
#
# Usage:
#   ./scripts/diagnose_agrsglobal_connectivity.sh
#   ./scripts/diagnose_agrsglobal_connectivity.sh agrsglobal.com api.agrsglobal.com
#
# Output:
#   Writes a timestamped log file in the current directory and prints its path.

DOMAIN="${1:-agrsglobal.com}"
API_DOMAIN="${2:-api.agrsglobal.com}"
WWW_DOMAIN="www.${DOMAIN#www.}"

TS_UTC="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="agrsglobal-connectivity-${TS_UTC}.log"

have() { command -v "$1" >/dev/null 2>&1; }

log() {
  # shellcheck disable=SC2129
  echo "$*" | tee -a "$OUT"
}

run() {
  local title="$1"
  shift
  log ""
  log "=== ${title} ==="
  if "$@" 2>&1 | tee -a "$OUT"; then
    return 0
  else
    log "(command failed: $*)"
    return 0
  fi
}

rm -f "$OUT"

log "AGRS Global connectivity diagnostic"
log "timestamp_utc: ${TS_UTC}"
log "domain: ${DOMAIN}"
log "www_domain: ${WWW_DOMAIN}"
log "api_domain: ${API_DOMAIN}"

run "System" uname -a
if [[ -f /etc/os-release ]]; then
  run "/etc/os-release" cat /etc/os-release
fi

if have ip; then
  run "IP addresses (brief)" ip -br addr
  run "IPv4 routes" ip -4 route
  run "IPv6 routes" ip -6 route
fi

if have resolvectl; then
  run "DNS resolver status" resolvectl status
elif have systemd-resolve; then
  run "DNS resolver status" systemd-resolve --status
fi

if have dig; then
  run "DNS (local resolver) - A/AAAA" bash -lc "dig +time=2 +tries=1 +short \"$DOMAIN\" A; dig +time=2 +tries=1 +short \"$DOMAIN\" AAAA; dig +time=2 +tries=1 +short \"$WWW_DOMAIN\" A; dig +time=2 +tries=1 +short \"$WWW_DOMAIN\" AAAA; dig +time=2 +tries=1 +short \"$API_DOMAIN\" A; dig +time=2 +tries=1 +short \"$API_DOMAIN\" AAAA"
  run "DNS (1.1.1.1) - A/AAAA" bash -lc "dig @1.1.1.1 +time=2 +tries=1 +short \"$DOMAIN\" A; dig @1.1.1.1 +time=2 +tries=1 +short \"$DOMAIN\" AAAA"
  run "DNS (8.8.8.8) - A/AAAA" bash -lc "dig @8.8.8.8 +time=2 +tries=1 +short \"$DOMAIN\" A; dig @8.8.8.8 +time=2 +tries=1 +short \"$DOMAIN\" AAAA"
elif have nslookup; then
  run "DNS (nslookup)" bash -lc "nslookup \"$DOMAIN\"; nslookup \"$WWW_DOMAIN\"; nslookup \"$API_DOMAIN\""
elif have host; then
  run "DNS (host)" bash -lc "host \"$DOMAIN\"; host \"$WWW_DOMAIN\"; host \"$API_DOMAIN\""
else
  log ""
  log "=== DNS checks ==="
  log "No dig/nslookup/host available on this system."
fi

if have ping; then
  run "Ping (IPv4) domain" ping -4 -c 3 "$DOMAIN"
  run "Ping (IPv4) VPS IP (if resolvable)" bash -lc "ip4=$(getent ahostsv4 \"$DOMAIN\" 2>/dev/null | awk 'NR==1{print $1}'); if [ -n \"$ip4\" ]; then echo \"Resolved IPv4: $ip4\"; ping -c 3 \"$ip4\"; else echo \"No IPv4 resolved\"; fi"
  run "Ping (IPv6) domain (will fail if no AAAA)" ping -6 -c 3 "$DOMAIN"
fi

if have curl; then
  run "HTTP redirect (port 80)" curl -I --max-time 15 "http://${DOMAIN}/"
  run "HTTPS HEAD (default)" curl -Iv --max-time 20 "https://${DOMAIN}/"
  run "HTTPS HEAD (IPv4 forced)" curl -4 -Iv --max-time 20 "https://${DOMAIN}/"
  run "HTTPS HEAD (IPv6 forced - will fail if no AAAA)" curl -6 -Iv --max-time 20 "https://${DOMAIN}/"

  run "API GET" curl -sS --max-time 20 "https://${API_DOMAIN}/api/auth/me"
else
  log ""
  log "=== curl checks ==="
  log "curl is not available on this system."
fi

if have openssl; then
  run "TLS handshake (TLS 1.2)" bash -lc "echo | openssl s_client -connect \"${DOMAIN}:443\" -servername \"${DOMAIN}\" -tls1_2 -brief"
  run "TLS certificate SANs" bash -lc "echo | openssl s_client -connect \"${DOMAIN}:443\" -servername \"${DOMAIN}\" 2>/dev/null | openssl x509 -noout -text | sed -n '/Subject Alternative Name/,+2p'"
fi

if have traceroute; then
  run "Traceroute (IPv4)" traceroute -4 -n -w 2 -q 1 "$DOMAIN"
elif have tracepath; then
  run "Tracepath (IPv4)" tracepath -n "$DOMAIN"
fi

log ""
log "Wrote: ${OUT}"
log "Share this file back for analysis."



















