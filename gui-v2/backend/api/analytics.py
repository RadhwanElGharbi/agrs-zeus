"""
AGRS ZEUS Analytics Dashboard API
Provides comprehensive analytics data for the monitoring dashboard.
"""

import os
import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(tags=["analytics-dashboard"])

# Analytics storage directory
ANALYTICS_DIR = Path("/opt/agrs/analytics")

# ============================================================================
# Models
# ============================================================================

class SessionProfile(BaseModel):
    session_id: str
    username: str
    name: str
    company: str
    role: str
    ip_address: str
    location: Optional[Dict[str, Any]] = None
    user_agent: str
    browser: str
    os: str
    device_type: str
    started_at: str
    last_activity: str
    duration_seconds: int
    page_views: int
    clicks: int
    api_calls: int
    events: List[Dict[str, Any]]


class DashboardSummary(BaseModel):
    total_sessions: int
    active_sessions: int
    total_events: int
    unique_users: int
    avg_session_duration: float
    top_pages: List[Dict[str, Any]]
    top_actions: List[Dict[str, Any]]
    hourly_activity: List[Dict[str, Any]]
    user_breakdown: List[Dict[str, Any]]
    geographic_breakdown: List[Dict[str, Any]]


# ============================================================================
# Helper Functions
# ============================================================================

def parse_user_agent(ua: str) -> Dict[str, str]:
    """Parse user agent to extract browser, OS, and device type."""
    browser = "Unknown"
    os_name = "Unknown"
    device_type = "Desktop"

    # Browser detection
    if "Chrome" in ua and "Edg" not in ua:
        match = re.search(r'Chrome/(\d+)', ua)
        browser = f"Chrome {match.group(1)}" if match else "Chrome"
    elif "Firefox" in ua:
        match = re.search(r'Firefox/(\d+)', ua)
        browser = f"Firefox {match.group(1)}" if match else "Firefox"
    elif "Safari" in ua and "Chrome" not in ua:
        match = re.search(r'Version/(\d+)', ua)
        browser = f"Safari {match.group(1)}" if match else "Safari"
    elif "Edg" in ua:
        match = re.search(r'Edg/(\d+)', ua)
        browser = f"Edge {match.group(1)}" if match else "Edge"

    # OS detection
    if "Windows NT 10" in ua:
        os_name = "Windows 10/11"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "Mac OS X" in ua:
        match = re.search(r'Mac OS X (\d+[._]\d+)', ua)
        if match:
            os_name = f"macOS {match.group(1).replace('_', '.')}"
        else:
            os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    elif "Android" in ua:
        os_name = "Android"
        device_type = "Mobile"
    elif "iPhone" in ua or "iPad" in ua:
        os_name = "iOS"
        device_type = "Mobile" if "iPhone" in ua else "Tablet"

    return {
        "browser": browser,
        "os": os_name,
        "device_type": device_type
    }


# Cache for IP geolocation to avoid repeated API calls
_ip_location_cache: Dict[str, Dict[str, Any]] = {}
_ip_cache_file = ANALYTICS_DIR / "ip_locations_cache.json"

def _load_ip_cache():
    """Load IP location cache from disk."""
    global _ip_location_cache
    if _ip_cache_file.exists():
        try:
            with open(_ip_cache_file) as f:
                _ip_location_cache = json.load(f)
        except:
            _ip_location_cache = {}

def _save_ip_cache():
    """Save IP location cache to disk."""
    try:
        with open(_ip_cache_file, 'w') as f:
            json.dump(_ip_location_cache, f, indent=2)
    except:
        pass

# Load cache on module init
_load_ip_cache()


def _is_private_ip(ip: str) -> bool:
    """Check if IP is private/local."""
    if not ip or ip == "unknown":
        return True
    # Private IP ranges
    private_prefixes = [
        "10.", "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
        "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
        "172.30.", "172.31.", "192.168.", "127.", "0.", "169.254."
    ]
    for prefix in private_prefixes:
        if ip.startswith(prefix):
            return True
    return ip in ["localhost", "::1"]


def geolocate_ip(ip: str) -> Dict[str, Any]:
    """
    Get real geolocation for an IP address using free ip-api.com service.
    Returns city, region, country, lat, lng, isp, org info.

    Uses caching to avoid repeated API calls for the same IP.
    """
    # Check if private/local IP
    if _is_private_ip(ip):
        return {
            "city": "Local Network",
            "region": "Local",
            "country": "Local",
            "country_code": "LOCAL",
            "lat": 0,
            "lng": 0,
            "isp": "Local Network",
            "org": "Local",
            "is_private": True
        }

    # Check cache first
    if ip in _ip_location_cache:
        cached = _ip_location_cache[ip]
        # Cache entries older than 30 days should be refreshed
        cached_at = cached.get("cached_at", "")
        if cached_at:
            try:
                cache_time = datetime.fromisoformat(cached_at)
                if (datetime.utcnow() - cache_time).days < 30:
                    return cached
            except:
                pass

    # Query ip-api.com (free, no API key needed, 45 requests/minute limit)
    try:
        url = f"http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,isp,org"
        req = urllib.request.Request(url, headers={"User-Agent": "AGRS-Analytics/1.0"})

        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())

            if data.get("status") == "success":
                location = {
                    "city": data.get("city", "Unknown"),
                    "region": data.get("regionName", "Unknown"),
                    "country": data.get("country", "Unknown"),
                    "country_code": data.get("countryCode", ""),
                    "lat": data.get("lat", 0),
                    "lng": data.get("lon", 0),
                    "isp": data.get("isp", "Unknown"),
                    "org": data.get("org", "Unknown"),
                    "is_private": False,
                    "cached_at": datetime.utcnow().isoformat()
                }

                # Cache the result
                _ip_location_cache[ip] = location
                _save_ip_cache()

                return location
            else:
                # API returned an error (e.g., reserved IP range)
                return {
                    "city": "Unknown",
                    "region": "Unknown",
                    "country": "Unknown",
                    "country_code": "",
                    "lat": 0,
                    "lng": 0,
                    "isp": "Unknown",
                    "org": "Unknown",
                    "is_private": False,
                    "error": data.get("message", "Lookup failed")
                }

    except urllib.error.URLError as e:
        return {
            "city": "Unknown",
            "region": "Unknown",
            "country": "Unknown",
            "country_code": "",
            "lat": 0,
            "lng": 0,
            "isp": "Unknown",
            "org": "Unknown",
            "is_private": False,
            "error": f"Network error: {str(e)}"
        }
    except Exception as e:
        return {
            "city": "Unknown",
            "region": "Unknown",
            "country": "Unknown",
            "country_code": "",
            "lat": 0,
            "lng": 0,
            "isp": "Unknown",
            "org": "Unknown",
            "is_private": False,
            "error": f"Lookup error: {str(e)}"
        }


# Keep old function name for backward compatibility
def estimate_location_from_ip(ip: str) -> Dict[str, Any]:
    """Wrapper for backward compatibility - uses real geolocation."""
    return geolocate_ip(ip)


def load_events_for_date(date_str: str) -> List[Dict[str, Any]]:
    """Load all events for a specific date."""
    events = []
    event_file = ANALYTICS_DIR / f"events_{date_str}.jsonl"

    if event_file.exists():
        with open(event_file) as f:
            for line in f:
                try:
                    events.append(json.loads(line))
                except:
                    continue

    return events


def load_sessions_for_date(date_str: str) -> List[Dict[str, Any]]:
    """Load all session events for a specific date."""
    sessions = []
    session_file = ANALYTICS_DIR / f"sessions_{date_str}.jsonl"

    if session_file.exists():
        with open(session_file) as f:
            for line in f:
                try:
                    sessions.append(json.loads(line))
                except:
                    continue

    return sessions


def load_active_sessions() -> Dict[str, Dict[str, Any]]:
    """Load active sessions from sessions.json."""
    sessions_file = ANALYTICS_DIR / "sessions.json"
    if sessions_file.exists():
        with open(sessions_file) as f:
            return json.load(f)
    return {}


def get_date_range(days: int = 7) -> List[str]:
    """Get list of date strings for the past N days."""
    dates = []
    for i in range(days):
        date = datetime.utcnow() - timedelta(days=i)
        dates.append(date.strftime("%Y-%m-%d"))
    return dates


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/dashboard/summary")
async def get_dashboard_summary(days: int = Query(default=7, ge=1, le=30)):
    """
    Get comprehensive dashboard summary.
    """
    dates = get_date_range(days)
    all_events = []

    for date in dates:
        all_events.extend(load_events_for_date(date))

    # Aggregate statistics
    unique_users = set()
    unique_sessions = set()
    page_views = defaultdict(int)
    actions = defaultdict(int)
    hourly_activity = defaultdict(int)
    user_stats = defaultdict(lambda: {"events": 0, "sessions": set()})
    ip_locations = defaultdict(lambda: {"count": 0, "location": None})
    session_durations = []

    for event in all_events:
        username = event.get("username", "anonymous")
        session_id = event.get("session_id", "unknown")
        unique_users.add(username)
        unique_sessions.add(session_id)

        event_data = event.get("event", {})
        event_type = event_data.get("event_type", "unknown")
        page = event_data.get("page", "/")
        action = event_data.get("action", "unknown")
        session_duration = event_data.get("session_duration", 0)

        # Track page views
        if event_type == "navigation" or event_type == "page_view":
            page_views[page] += 1

        # Track actions
        if action and action != "unknown":
            actions[action] += 1

        # Track hourly activity
        timestamp = event.get("timestamp", "")
        if timestamp:
            try:
                hour = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).hour
                hourly_activity[hour] += 1
            except:
                pass

        # Track user stats
        user_stats[username]["events"] += 1
        user_stats[username]["sessions"].add(session_id)

        # Track session durations
        if session_duration > 0:
            session_durations.append(session_duration)

        # Track geographic distribution
        client = event.get("client", {})
        ip = client.get("ip", "unknown")
        if ip != "unknown":
            ip_locations[ip]["count"] += 1
            if not ip_locations[ip]["location"]:
                ip_locations[ip]["location"] = estimate_location_from_ip(ip)

    # Load active sessions count
    active_sessions = load_active_sessions()

    # Build response
    top_pages = [{"page": p, "count": c} for p, c in sorted(page_views.items(), key=lambda x: -x[1])[:10]]
    top_actions = [{"action": a, "count": c} for a, c in sorted(actions.items(), key=lambda x: -x[1])[:15]]
    hourly = [{"hour": h, "count": hourly_activity.get(h, 0)} for h in range(24)]

    user_breakdown = []
    for username, stats in user_stats.items():
        user_breakdown.append({
            "username": username,
            "events": stats["events"],
            "sessions": len(stats["sessions"])
        })
    user_breakdown.sort(key=lambda x: -x["events"])

    geo_breakdown = []
    for ip, data in ip_locations.items():
        loc = data["location"] or {}
        geo_breakdown.append({
            "ip": ip,
            "city": loc.get("city", "Unknown"),
            "country": loc.get("country", "Unknown"),
            "count": data["count"]
        })
    geo_breakdown.sort(key=lambda x: -x["count"])

    avg_duration = sum(session_durations) / len(session_durations) if session_durations else 0

    return {
        "total_sessions": len(unique_sessions),
        "active_sessions": len(active_sessions),
        "total_events": len(all_events),
        "unique_users": len(unique_users),
        "avg_session_duration": round(avg_duration, 2),
        "top_pages": top_pages,
        "top_actions": top_actions,
        "hourly_activity": hourly,
        "user_breakdown": user_breakdown[:10],
        "geographic_breakdown": geo_breakdown[:10],
        "date_range": {
            "start": dates[-1] if dates else None,
            "end": dates[0] if dates else None,
            "days": days
        }
    }


@router.get("/dashboard/sessions")
async def get_all_sessions(
    days: int = Query(default=7, ge=1, le=30),
    username: Optional[str] = None
):
    """
    Get detailed session profiles.
    """
    dates = get_date_range(days)
    all_events = []

    for date in dates:
        all_events.extend(load_events_for_date(date))

    # Group events by session
    session_events = defaultdict(list)
    session_metadata = {}

    for event in all_events:
        session_id = event.get("session_id", "unknown")
        uname = event.get("username", "anonymous")

        if username and uname != username:
            continue

        session_events[session_id].append(event)

        if session_id not in session_metadata:
            client = event.get("client", {})
            ua_info = parse_user_agent(client.get("user_agent", ""))
            ip = client.get("ip", "unknown")

            session_metadata[session_id] = {
                "username": uname,
                "ip_address": ip,
                "location": estimate_location_from_ip(ip),
                "user_agent": client.get("user_agent", ""),
                "browser": ua_info["browser"],
                "os": ua_info["os"],
                "device_type": ua_info["device_type"],
                "origin": client.get("origin", ""),
                "referer": client.get("referer", "")
            }

    # Build session profiles
    sessions = []
    active_sessions = load_active_sessions()

    for session_id, events in session_events.items():
        if not events:
            continue

        meta = session_metadata.get(session_id, {})
        events.sort(key=lambda x: x.get("timestamp", ""))

        # Calculate statistics
        clicks = sum(1 for e in events if e.get("event", {}).get("event_type") == "click")
        page_views = sum(1 for e in events if e.get("event", {}).get("event_type") in ["navigation", "page_view"])
        api_calls = sum(1 for e in events if e.get("event", {}).get("event_type") == "api_call")

        first_event = events[0]
        last_event = events[-1]

        started_at = first_event.get("timestamp", "")
        last_activity = last_event.get("timestamp", "")

        # Calculate duration
        duration = 0
        last_event_data = last_event.get("event", {})
        if "session_duration" in last_event_data:
            duration = last_event_data["session_duration"]

        # Get name/company from active sessions if available
        active_session = None
        for token, sess in active_sessions.items():
            if token.startswith(session_id.replace("...", "")):
                active_session = sess
                break

        name = active_session.get("name", meta.get("username", "Unknown")) if active_session else meta.get("username", "Unknown")
        company = active_session.get("company", "Unknown") if active_session else "Unknown"
        role = active_session.get("role", "unknown") if active_session else "unknown"

        sessions.append({
            "session_id": session_id,
            "username": meta.get("username", "anonymous"),
            "name": name,
            "company": company,
            "role": role,
            "ip_address": meta.get("ip_address", "unknown"),
            "location": meta.get("location"),
            "user_agent": meta.get("user_agent", ""),
            "browser": meta.get("browser", "Unknown"),
            "os": meta.get("os", "Unknown"),
            "device_type": meta.get("device_type", "Desktop"),
            "origin": meta.get("origin", ""),
            "started_at": started_at,
            "last_activity": last_activity,
            "duration_seconds": duration,
            "page_views": page_views,
            "clicks": clicks,
            "api_calls": api_calls,
            "total_events": len(events)
        })

    # Sort by last activity
    sessions.sort(key=lambda x: x.get("last_activity", ""), reverse=True)

    return {
        "sessions": sessions,
        "total": len(sessions)
    }


@router.get("/dashboard/session/{session_id}")
async def get_session_detail(session_id: str, days: int = Query(default=7, ge=1, le=30)):
    """
    Get detailed events for a specific session.
    """
    dates = get_date_range(days)
    session_events = []

    for date in dates:
        events = load_events_for_date(date)
        for event in events:
            if event.get("session_id", "").startswith(session_id.replace("...", "")):
                session_events.append(event)

    if not session_events:
        raise HTTPException(status_code=404, detail="Session not found")

    session_events.sort(key=lambda x: x.get("timestamp", ""))

    # Get metadata from first event
    first_event = session_events[0]
    client = first_event.get("client", {})
    ua_info = parse_user_agent(client.get("user_agent", ""))
    ip = client.get("ip", "unknown")

    # Build event timeline
    timeline = []
    for event in session_events:
        event_data = event.get("event", {})
        timeline.append({
            "timestamp": event.get("timestamp"),
            "event_type": event_data.get("event_type"),
            "component": event_data.get("component"),
            "action": event_data.get("action"),
            "page": event_data.get("page"),
            "value": event_data.get("value"),
            "metadata": event_data.get("metadata"),
            "session_duration": event_data.get("session_duration")
        })

    return {
        "session_id": session_id,
        "username": first_event.get("username", "anonymous"),
        "ip_address": ip,
        "location": estimate_location_from_ip(ip),
        "browser": ua_info["browser"],
        "os": ua_info["os"],
        "device_type": ua_info["device_type"],
        "user_agent": client.get("user_agent", ""),
        "origin": client.get("origin", ""),
        "referer": client.get("referer", ""),
        "started_at": session_events[0].get("timestamp"),
        "last_activity": session_events[-1].get("timestamp"),
        "total_events": len(session_events),
        "timeline": timeline
    }


@router.get("/dashboard/realtime")
async def get_realtime_stats():
    """
    Get real-time statistics for the current day.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    events = load_events_for_date(today)

    # Get last hour events
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent_events = []

    for event in events:
        timestamp = event.get("timestamp", "")
        try:
            event_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if event_time.replace(tzinfo=None) > one_hour_ago:
                recent_events.append(event)
        except:
            continue

    # Active users in last hour
    active_users = set(e.get("username", "anonymous") for e in recent_events)
    active_sessions = set(e.get("session_id", "unknown") for e in recent_events)

    # Events per minute for the last hour
    events_per_minute = defaultdict(int)
    for event in recent_events:
        timestamp = event.get("timestamp", "")
        try:
            event_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            minute_key = event_time.strftime("%H:%M")
            events_per_minute[minute_key] += 1
        except:
            continue

    # Recent activity feed
    recent_activity = []
    for event in sorted(recent_events, key=lambda x: x.get("timestamp", ""), reverse=True)[:20]:
        event_data = event.get("event", {})
        client = event.get("client", {})
        recent_activity.append({
            "timestamp": event.get("timestamp"),
            "username": event.get("username", "anonymous"),
            "event_type": event_data.get("event_type"),
            "action": event_data.get("action"),
            "page": event_data.get("page"),
            "ip": client.get("ip", "unknown")
        })

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "active_users_last_hour": len(active_users),
        "active_sessions_last_hour": len(active_sessions),
        "events_last_hour": len(recent_events),
        "events_today": len(events),
        "events_per_minute": [{"minute": m, "count": c} for m, c in sorted(events_per_minute.items())],
        "recent_activity": recent_activity
    }


@router.get("/dashboard/performance")
async def get_performance_metrics(days: int = Query(default=7, ge=1, le=30)):
    """
    Get website performance metrics.
    """
    dates = get_date_range(days)

    # Aggregate daily statistics
    daily_stats = []

    for date in dates:
        events = load_events_for_date(date)

        unique_users = set(e.get("username", "anonymous") for e in events)
        unique_sessions = set(e.get("session_id", "unknown") for e in events)

        clicks = sum(1 for e in events if e.get("event", {}).get("event_type") == "click")
        page_views = sum(1 for e in events if e.get("event", {}).get("event_type") in ["navigation", "page_view", "visibility"])
        errors = sum(1 for e in events if e.get("event", {}).get("event_type") == "error")

        daily_stats.append({
            "date": date,
            "total_events": len(events),
            "unique_users": len(unique_users),
            "unique_sessions": len(unique_sessions),
            "clicks": clicks,
            "page_views": page_views,
            "errors": errors
        })

    daily_stats.reverse()  # Oldest first

    return {
        "daily_stats": daily_stats,
        "summary": {
            "total_events": sum(d["total_events"] for d in daily_stats),
            "avg_daily_users": round(sum(d["unique_users"] for d in daily_stats) / len(daily_stats), 1) if daily_stats else 0,
            "avg_daily_sessions": round(sum(d["unique_sessions"] for d in daily_stats) / len(daily_stats), 1) if daily_stats else 0,
            "total_clicks": sum(d["clicks"] for d in daily_stats),
            "total_errors": sum(d["errors"] for d in daily_stats)
        }
    }


@router.get("/dashboard/user/{username}")
async def get_user_profile(username: str, days: int = Query(default=30, ge=1, le=90)):
    """
    Get detailed profile for a specific user.
    """
    dates = get_date_range(days)
    user_events = []

    for date in dates:
        events = load_events_for_date(date)
        for event in events:
            if event.get("username") == username:
                user_events.append(event)

    if not user_events:
        raise HTTPException(status_code=404, detail="User not found")

    # Aggregate user statistics
    sessions = set(e.get("session_id") for e in user_events)
    ips = set(e.get("client", {}).get("ip") for e in user_events)
    user_agents = set(e.get("client", {}).get("user_agent") for e in user_events)

    actions = defaultdict(int)
    pages = defaultdict(int)

    for event in user_events:
        event_data = event.get("event", {})
        action = event_data.get("action")
        page = event_data.get("page")

        if action:
            actions[action] += 1
        if page:
            pages[page] += 1

    # Get first and last seen
    user_events.sort(key=lambda x: x.get("timestamp", ""))
    first_seen = user_events[0].get("timestamp")
    last_seen = user_events[-1].get("timestamp")

    # Parse user agents for device info
    devices = []
    for ua in user_agents:
        if ua:
            ua_info = parse_user_agent(ua)
            devices.append(ua_info)

    # Get IP locations
    locations = []
    for ip in ips:
        if ip and ip != "unknown":
            loc = estimate_location_from_ip(ip)
            locations.append({"ip": ip, **loc})

    return {
        "username": username,
        "first_seen": first_seen,
        "last_seen": last_seen,
        "total_events": len(user_events),
        "total_sessions": len(sessions),
        "ip_addresses": list(ips),
        "locations": locations,
        "devices": devices,
        "top_actions": [{"action": a, "count": c} for a, c in sorted(actions.items(), key=lambda x: -x[1])[:10]],
        "top_pages": [{"page": p, "count": c} for p, c in sorted(pages.items(), key=lambda x: -x[1])[:10]]
    }


@router.get("/dashboard/export")
async def export_analytics_data(
    date: Optional[str] = None,
    format: str = Query(default="json", regex="^(json|csv)$")
):
    """
    Export analytics data for a specific date or all data.
    """
    if date:
        events = load_events_for_date(date)
        filename = f"analytics_{date}"
    else:
        # Export last 7 days
        dates = get_date_range(7)
        events = []
        for d in dates:
            events.extend(load_events_for_date(d))
        filename = f"analytics_export_{datetime.utcnow().strftime('%Y%m%d')}"

    if format == "csv":
        # Convert to CSV format
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "timestamp", "session_id", "username", "event_type",
            "component", "action", "page", "ip", "user_agent"
        ])

        for event in events:
            event_data = event.get("event", {})
            client = event.get("client", {})
            writer.writerow([
                event.get("timestamp"),
                event.get("session_id"),
                event.get("username"),
                event_data.get("event_type"),
                event_data.get("component"),
                event_data.get("action"),
                event_data.get("page"),
                client.get("ip"),
                client.get("user_agent")
            ])

        return {
            "filename": f"{filename}.csv",
            "content": output.getvalue(),
            "content_type": "text/csv"
        }

    return {
        "filename": f"{filename}.json",
        "content": events,
        "content_type": "application/json",
        "count": len(events)
    }
