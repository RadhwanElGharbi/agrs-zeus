# agrsglobal.com connectivity troubleshooting

This repo’s public deployment (per `/home/radwan-el-gharbi/Desktop/AGRS-ZEUS-Deployment-Guide.md`) is:

- `agrsglobal.com` / `www.agrsglobal.com` → OVH VPS (Nginx + TLS) → WireGuard tunnel → local machine frontend (`10.0.0.2:3000`)
- `api.agrsglobal.com` → OVH VPS (Nginx + TLS) → WireGuard tunnel → local machine API (`10.0.0.2:8000`)

## Known-good reference (as of 2026-01-04)

- **A record**: `agrsglobal.com` / `www` / `api` → `57.131.34.131`
- **AAAA record**: none (IPv4-only DNS)
- **TLS**: valid Let’s Encrypt cert with SANs for `agrsglobal.com`, `www.agrsglobal.com`, `api.agrsglobal.com`
- **HTTP**: port 80 redirects to HTTPS

## Why “some users can’t connect” (most common causes)

- **IPv6-only networks**: if a user is on an IPv6-only network *without* DNS64/NAT64 (or they force custom DNS/DoH that bypasses DNS64), an IPv4-only site can fail to load.
  - Fix: add proper **IPv6 support** on the VPS (Nginx `listen [::]:443` + DNS **AAAA** records) or use a CDN/proxy that provides IPv6.
- **Provider/ASN blocking**: some corporate networks/DNS filters block datacenter ASNs (this IP is **OVH AS16276**).
  - Fix: serve through a CDN/proxy (e.g., Cloudflare) or move to a different provider/IP range.
- **Stale DNS**: some resolvers cache old records longer than expected.
  - Fix: verify `nslookup agrsglobal.com` returns `57.131.34.131`; wait for TTL expiry or switch resolver.
- **Intermittent tunnel/upstream**: if WireGuard drops or the local services (frontend/backend) stop, Nginx on the VPS will return 502/504.
  - Fix: ensure `wg-quick@wg0`, backend, and frontend are running persistently; add monitoring/alerts and a maintenance page.

## Collect diagnostics from an affected user

Have them run:

```bash
cd /opt/agrs
chmod +x ./scripts/diagnose_agrsglobal_connectivity.sh
./scripts/diagnose_agrsglobal_connectivity.sh
```

They should send back the generated `agrsglobal-connectivity-*.log`.






