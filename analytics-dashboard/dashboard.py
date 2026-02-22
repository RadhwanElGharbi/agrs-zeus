#!/usr/bin/env python3
"""
AGRS ZEUS Analytics Dashboard
Standalone desktop application for monitoring user activity and system performance.

Run: python3 dashboard.py
"""

import sys
import os
import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict
from zoneinfo import ZoneInfo

# Timezone configuration
EST = ZoneInfo("America/New_York")


def to_est(timestamp_str: str) -> str:
    """Convert ISO timestamp string to EST formatted string."""
    if not timestamp_str:
        return "-"
    try:
        # Parse the timestamp (assuming UTC)
        if timestamp_str.endswith('Z'):
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        elif '+' in timestamp_str or timestamp_str.count('-') > 2:
            dt = datetime.fromisoformat(timestamp_str)
        else:
            # Assume UTC if no timezone info
            dt = datetime.fromisoformat(timestamp_str).replace(tzinfo=timezone.utc)

        # Convert to EST
        dt_est = dt.astimezone(EST)
        return dt_est.strftime("%Y-%m-%d %H:%M:%S")
    except:
        return timestamp_str[:19].replace("T", " ")


def now_est() -> str:
    """Get current time in EST formatted."""
    return datetime.now(EST).strftime("%H:%M:%S")

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QTableWidget, QTableWidgetItem, QHeaderView,
    QTabWidget, QScrollArea, QFrame, QProgressBar, QSplitter,
    QDialog, QTextEdit, QGridLayout, QGroupBox, QSizePolicy,
    QComboBox, QLineEdit
)
from PyQt6.QtCore import Qt, QTimer, QSize, QThread, pyqtSignal, QObject
from PyQt6.QtGui import QFont, QColor, QPalette, QIcon, QPainter, QBrush, QPen
from PyQt6.QtCharts import QChart, QChartView, QBarSeries, QBarSet, QLineSeries, QBarCategoryAxis, QValueAxis
import threading
import queue

# Configuration
ANALYTICS_DIR = Path("/opt/agrs/analytics")
IP_CACHE_FILE = ANALYTICS_DIR / "ip_locations_cache.json"

# In-memory IP location cache
_ip_location_cache = {}


# ============================================================================
# IP Geolocation Functions
# ============================================================================

def _load_ip_cache():
    """Load IP location cache from disk."""
    global _ip_location_cache
    if IP_CACHE_FILE.exists():
        try:
            with open(IP_CACHE_FILE) as f:
                _ip_location_cache = json.load(f)
        except:
            _ip_location_cache = {}

def _save_ip_cache():
    """Save IP location cache to disk."""
    try:
        with open(IP_CACHE_FILE, 'w') as f:
            json.dump(_ip_location_cache, f, indent=2)
    except:
        pass

def _is_private_ip(ip: str) -> bool:
    """Check if IP is private/local."""
    if not ip or ip == "unknown":
        return True
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


def geolocate_ip(ip: str) -> dict:
    """
    Get real geolocation for an IP address using free ip-api.com service.
    Returns city, region, country, lat, lng, isp, org info.
    Uses caching to avoid repeated API calls.
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
        cached_at = cached.get("cached_at", "")
        if cached_at:
            try:
                cache_time = datetime.fromisoformat(cached_at)
                if (datetime.now(timezone.utc).replace(tzinfo=None) - cache_time).days < 30:
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
                    "cached_at": datetime.now(timezone.utc).isoformat()
                }

                # Cache the result
                _ip_location_cache[ip] = location
                _save_ip_cache()

                return location
            else:
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
            "error": str(e)
        }


# Load IP cache on startup
_load_ip_cache()


# ============================================================================
# Data Processing Functions
# ============================================================================

def parse_user_agent(ua: str) -> dict:
    """Parse user agent string to extract real browser/OS info."""
    if not ua:
        return {"browser": "Unknown", "os": "Unknown", "device_type": "Unknown"}

    browser = "Unknown"
    os_name = "Unknown"
    device_type = "Desktop"

    # Browser detection
    if "Chrome" in ua and "Edg" not in ua and "OPR" not in ua:
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
    elif "curl" in ua:
        browser = "curl (CLI)"
        device_type = "CLI"

    # OS detection
    if "Windows NT 10" in ua:
        os_name = "Windows 10/11"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "Mac OS X" in ua:
        match = re.search(r'Mac OS X (\d+)[_.](\d+)', ua)
        if match:
            os_name = f"macOS {match.group(1)}.{match.group(2)}"
        else:
            os_name = "macOS"
    elif "Linux" in ua:
        os_name = "Linux"
    elif "Android" in ua:
        os_name = "Android"
        device_type = "Mobile"
    elif "iPhone" in ua:
        os_name = "iOS"
        device_type = "Mobile"
    elif "iPad" in ua:
        os_name = "iPadOS"
        device_type = "Tablet"

    return {"browser": browser, "os": os_name, "device_type": device_type}


def get_real_ip_from_event(client: dict) -> str:
    """
    Extract the real client IP from event client data.
    Handles both old events (where ip might be 10.0.0.1) and new events.
    Checks forwarding_headers for the real IP if the main ip is a proxy IP.
    """
    ip = client.get("ip", "unknown")

    # If IP is a known proxy/tunnel IP, try to get the real IP from headers
    if ip in ["10.0.0.1", "127.0.0.1", "unknown"] or ip.startswith("10.0.0."):
        headers = client.get("forwarding_headers", {})
        # Try x_real_ip first (nginx sets this)
        real_ip = headers.get("x_real_ip")
        if real_ip:
            return real_ip
        # Try x_forwarded_for
        forwarded = headers.get("x_forwarded_for")
        if forwarded:
            # Take first IP if it's a comma-separated list
            return forwarded.split(",")[0].strip()

    return ip


def get_source_from_origin(origin: str, referer: str) -> str:
    """Determine the actual source/origin of the connection."""
    if origin:
        if "agrsglobal.com" in origin:
            return "agrsglobal.com (Production)"
        elif "192.168." in origin or "localhost" in origin or "127.0.0.1" in origin:
            return "Local Network (Dev)"
        else:
            return origin
    elif referer:
        if "agrsglobal.com" in referer:
            return "agrsglobal.com (Production)"
        elif "192.168." in referer or "localhost" in referer:
            return "Local Network (Dev)"
        else:
            return referer
    return "Direct/Unknown"


def load_events(days: int = 7) -> list:
    """Load events for the past N days."""
    events = []
    for i in range(days):
        date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        event_file = ANALYTICS_DIR / f"events_{date}.jsonl"
        if event_file.exists():
            with open(event_file) as f:
                for line in f:
                    try:
                        events.append(json.loads(line))
                    except:
                        continue
    return events


def load_sessions() -> dict:
    """Load active sessions."""
    sessions_file = ANALYTICS_DIR / "sessions.json"
    if sessions_file.exists():
        with open(sessions_file) as f:
            return json.load(f)
    return {}


def load_operations(days: int = 2) -> list:
    """Load mirrored audit operation events for the past N days."""
    operations = []
    for i in range(days):
        date = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        op_file = ANALYTICS_DIR / f"operations_{date}.jsonl"
        if not op_file.exists():
            continue
        with open(op_file) as f:
            for line in f:
                try:
                    operations.append(json.loads(line))
                except:
                    continue
    operations.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return operations


def get_dashboard_data():
    """Generate comprehensive dashboard data with validated information only."""
    events = load_events(7)
    active_sessions = load_sessions()

    unique_users = set()
    unique_sessions = set()
    actions = defaultdict(int)
    hourly_activity = defaultdict(int)
    user_stats = defaultdict(lambda: {"events": 0, "clicks": 0, "sessions": set()})
    sources = defaultdict(int)
    daily_events = defaultdict(int)
    session_durations = []
    browsers = defaultdict(int)
    os_stats = defaultdict(int)
    device_types = defaultdict(int)

    # Track unique IPs for geolocation
    unique_ips = set()
    ip_event_counts = defaultdict(int)
    geographic_data = defaultdict(lambda: {"count": 0, "city": "", "country": "", "isp": ""})

    for event in events:
        username = event.get("username", "anonymous")
        session_id = event.get("session_id", "unknown")
        unique_users.add(username)
        unique_sessions.add(session_id)

        event_data = event.get("event", {})
        event_type = event_data.get("event_type", "unknown")
        action = event_data.get("action", "")

        # Only count meaningful actions
        if action and action not in ["visible", "hidden", "Unknown", ""]:
            actions[action] += 1

        user_stats[username]["events"] += 1
        user_stats[username]["sessions"].add(session_id)
        if event_type == "click":
            user_stats[username]["clicks"] += 1

        timestamp = event.get("timestamp", "")
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                hourly_activity[dt.hour] += 1
                daily_events[dt.strftime("%Y-%m-%d")] += 1
            except:
                pass

        session_duration = event_data.get("session_duration") or 0
        if session_duration and session_duration > 0:
            session_durations.append(session_duration)

        # Track client info - only real data
        client = event.get("client", {})
        ua = client.get("user_agent", "")
        origin = client.get("origin", "")
        referer = client.get("referer", "")
        ip = get_real_ip_from_event(client)

        # Track unique IPs for geolocation lookup
        if ip and ip != "unknown" and not _is_private_ip(ip):
            unique_ips.add(ip)
            ip_event_counts[ip] += 1

        # Track source/origin instead of fake location
        source = get_source_from_origin(origin, referer)
        sources[source] += 1

        if ua:
            ua_info = parse_user_agent(ua)
            if ua_info["browser"] != "Unknown":
                browsers[ua_info["browser"]] += 1
            if ua_info["os"] != "Unknown":
                os_stats[ua_info["os"]] += 1
            if ua_info["device_type"] != "Unknown":
                device_types[ua_info["device_type"]] += 1

    # Perform IP geolocation for unique IPs (with rate limiting)
    locations = defaultdict(lambda: {"count": 0, "ips": []})
    for ip in unique_ips:
        geo = geolocate_ip(ip)
        if geo.get("is_private"):
            loc_key = "Local Network"
        elif geo.get("city") and geo.get("city") != "Unknown":
            loc_key = f"{geo['city']}, {geo['country']}"
        elif geo.get("country") and geo.get("country") != "Unknown":
            loc_key = geo['country']
        else:
            loc_key = "Unknown Location"

        locations[loc_key]["count"] += ip_event_counts[ip]
        locations[loc_key]["ips"].append({
            "ip": ip,
            "events": ip_event_counts[ip],
            "city": geo.get("city", "Unknown"),
            "country": geo.get("country", "Unknown"),
            "isp": geo.get("isp", "Unknown"),
            "org": geo.get("org", "Unknown")
        })

    # Build session profiles with validated data only
    session_profiles = []
    session_events_map = defaultdict(list)

    for event in events:
        session_id = event.get("session_id", "unknown")
        session_events_map[session_id].append(event)

    for session_id, sess_events in session_events_map.items():
        if not sess_events:
            continue

        sess_events.sort(key=lambda x: x.get("timestamp", ""))
        first = sess_events[0]
        last = sess_events[-1]

        client = first.get("client", {})
        ua_info = parse_user_agent(client.get("user_agent", ""))
        ip = get_real_ip_from_event(client)
        origin = client.get("origin", "")
        referer = client.get("referer", "")

        # Get real location for this IP
        geo = geolocate_ip(ip) if ip and ip != "unknown" and not _is_private_ip(ip) else {}
        if geo.get("is_private"):
            location_str = "Local Network"
        elif geo.get("city") and geo.get("city") != "Unknown":
            location_str = f"{geo['city']}, {geo['country']}"
        elif geo.get("country") and geo.get("country") != "Unknown":
            location_str = geo['country']
        else:
            location_str = "Unknown"

        name = first.get("username", "Unknown")
        company = "Unknown"
        role = "unknown"

        # Match with active sessions for more info
        for token, sess in active_sessions.items():
            if token.startswith(session_id.replace("...", "")):
                name = sess.get("name", name)
                company = sess.get("company", "Unknown")
                role = sess.get("role", "unknown")
                break

        clicks = sum(1 for e in sess_events if e.get("event", {}).get("event_type") == "click")
        duration = last.get("event", {}).get("session_duration", 0)

        session_profiles.append({
            "session_id": session_id,
            "username": first.get("username", "anonymous"),
            "name": name,
            "company": company,
            "role": role,
            "ip": ip,
            "location": location_str,
            "isp": geo.get("isp", "Unknown"),
            "source": get_source_from_origin(origin, referer),
            "browser": ua_info["browser"],
            "os": ua_info["os"],
            "device": ua_info["device_type"],
            "started_at": first.get("timestamp", ""),
            "last_activity": last.get("timestamp", ""),
            "duration": duration,
            "events": len(sess_events),
            "clicks": clicks,
            "all_events": sess_events
        })

    session_profiles.sort(key=lambda x: x.get("last_activity", ""), reverse=True)

    avg_duration = sum(session_durations) / len(session_durations) if session_durations else 0

    # Build geographic distribution with real data
    geo_distribution = sorted([
        {"location": loc, "count": data["count"], "ips": data["ips"]}
        for loc, data in locations.items()
    ], key=lambda x: -x["count"])

    return {
        "summary": {
            "total_events": len(events),
            "total_sessions": len(unique_sessions),
            "active_sessions": len(active_sessions),
            "unique_users": len(unique_users),
            "avg_session_duration": round(avg_duration, 2),
            "total_clicks": sum(1 for e in events if e.get("event", {}).get("event_type") == "click"),
            "unique_ips": len(unique_ips)
        },
        "top_actions": sorted([{"action": a, "count": c} for a, c in actions.items()], key=lambda x: -x["count"])[:15],
        "hourly_activity": [{"hour": h, "count": hourly_activity.get(h, 0)} for h in range(24)],
        "daily_events": sorted([{"date": d, "count": c} for d, c in daily_events.items()], key=lambda x: x["date"]),
        "user_breakdown": sorted([
            {"username": u, "events": s["events"], "clicks": s["clicks"], "sessions": len(s["sessions"])}
            for u, s in user_stats.items()
        ], key=lambda x: -x["events"])[:10],
        "sources": sorted([{"source": s, "count": c} for s, c in sources.items()], key=lambda x: -x["count"]),
        "geographic": geo_distribution,
        "browsers": sorted([{"browser": b, "count": c} for b, c in browsers.items()], key=lambda x: -x["count"]),
        "os_stats": sorted([{"os": o, "count": c} for o, c in os_stats.items()], key=lambda x: -x["count"]),
        "device_types": sorted([{"device": d, "count": c} for d, c in device_types.items()], key=lambda x: -x["count"]),
        "sessions": session_profiles[:50]
    }


# ============================================================================
# Background Workers for Non-Blocking Data Loading
# ============================================================================

class DataWorker(QObject):
    """Worker for loading dashboard data in background thread."""
    finished = pyqtSignal(dict)
    error = pyqtSignal(str)

    def run(self):
        try:
            data = get_dashboard_data()
            self.finished.emit(data)
        except Exception as e:
            self.error.emit(str(e))


class LiveActivityWorker(QObject):
    """Worker for loading live activity data in background thread."""
    finished = pyqtSignal(list)
    error = pyqtSignal(str)

    def run(self):
        try:
            events = load_events(1)  # Just today
            events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            events = events[:200]

            # Pre-process location data using cache only (no API calls)
            processed = []
            for event in events:
                client = event.get("client", {})
                ip = get_real_ip_from_event(client)

                # Only use cached locations - don't make API calls
                if ip and ip != "unknown" and not _is_private_ip(ip):
                    if ip in _ip_location_cache:
                        geo = _ip_location_cache[ip]
                        if geo.get("city") and geo.get("city") != "Unknown":
                            location = f"{geo['city']}, {geo['country']}"
                        else:
                            location = geo.get("country", "Unknown")
                    else:
                        location = "Resolving..."
                elif _is_private_ip(ip):
                    location = "Local"
                else:
                    location = "Unknown"

                processed.append({
                    "event": event,
                    "location": location,
                    "ip": ip
                })

            self.finished.emit(processed)
        except Exception as e:
            self.error.emit(str(e))


class GeoLookupWorker(QObject):
    """Worker for resolving IP locations in background."""
    finished = pyqtSignal()

    def __init__(self, ips_to_resolve):
        super().__init__()
        self.ips = ips_to_resolve

    def run(self):
        for ip in self.ips:
            if ip not in _ip_location_cache:
                geolocate_ip(ip)  # This caches the result
        self.finished.emit()


# ============================================================================
# Custom Widgets
# ============================================================================

class StatCard(QFrame):
    """A card displaying a single statistic."""

    def __init__(self, title: str, value: str, color: str = "#ef4444"):
        super().__init__()
        self.setStyleSheet(f"""
            QFrame {{
                background-color: #0a0a0a;
                border: 1px solid #330000;
                border-radius: 4px;
                padding: 10px;
            }}
            QFrame:hover {{
                border-color: {color};
                background-color: #111111;
            }}
        """)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(15, 12, 15, 12)
        layout.setSpacing(4)

        title_label = QLabel(title)
        title_label.setStyleSheet("color: #888; font-size: 11px; font-weight: 500; text-transform: uppercase; font-family: Monospace;")

        self.value_label = QLabel(value)
        self.value_label.setStyleSheet(f"color: {color}; font-size: 24px; font-weight: bold; font-family: Monospace;")

        layout.addWidget(title_label)
        layout.addWidget(self.value_label)

    def set_value(self, value: str):
        self.value_label.setText(value)


class BarWidget(QFrame):
    """A horizontal bar showing a metric."""

    def __init__(self, label: str, value: int, max_value: int, color: str = "#ef4444"):
        super().__init__()
        self.setStyleSheet("background: transparent;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 2, 0, 2)
        layout.setSpacing(2)

        header = QHBoxLayout()
        label_widget = QLabel(label)
        label_widget.setStyleSheet("color: #ccc; font-size: 12px; font-family: Monospace;")
        label_widget.setMaximumWidth(250)

        value_widget = QLabel(str(value))
        value_widget.setStyleSheet("color: #888; font-size: 12px; font-family: Monospace;")
        value_widget.setAlignment(Qt.AlignmentFlag.AlignRight)

        header.addWidget(label_widget, 1)
        header.addWidget(value_widget)
        layout.addLayout(header)

        progress = QProgressBar()
        progress.setMaximum(max_value if max_value > 0 else 1)
        progress.setValue(value)
        progress.setTextVisible(False)
        progress.setFixedHeight(4)
        progress.setStyleSheet(f"""
            QProgressBar {{
                background-color: #1a1a1a;
                border: none;
                border-radius: 2px;
            }}
            QProgressBar::chunk {{
                background-color: {color};
                border-radius: 2px;
            }}
        """)
        layout.addWidget(progress)


class SessionDetailDialog(QDialog):
    """Dialog showing detailed session timeline."""

    def __init__(self, session: dict, parent=None):
        super().__init__(parent)
        self.setWindowTitle(f"Session: {session['username']}")
        self.setMinimumSize(900, 650)
        self.setStyleSheet("""
            QDialog {
                background-color: #000000;
            }
            QLabel {
                color: #ccc;
                font-family: Monospace;
            }
            QTextEdit {
                background-color: #0a0a0a;
                color: #ccc;
                border: 1px solid #330000;
                border-radius: 4px;
                font-family: Monospace;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(15)

        # Header info - only real validated data
        info_grid = QGridLayout()
        info_grid.setSpacing(10)

        labels = [
            ("User", session["name"]),
            ("Username", session["username"]),
            ("Company", session["company"]),
            ("Role", session["role"]),
            ("Location", session.get("location", "Unknown")),
            ("IP Address", session["ip"]),
            ("ISP", session.get("isp", "Unknown")),
            ("Browser", session["browser"]),
            ("OS", session["os"]),
            ("Device", session["device"]),
            ("Total Events", str(session["events"])),
            ("Total Clicks", str(session["clicks"])),
        ]

        for i, (label, value) in enumerate(labels):
            row, col = divmod(i, 4)
            label_widget = QLabel(f"<b>{label}:</b> {value}")
            label_widget.setStyleSheet("color: #aaa; font-size: 12px;")
            info_grid.addWidget(label_widget, row, col)

        layout.addLayout(info_grid)

        # Timeline
        timeline_label = QLabel("Event Timeline")
        timeline_label.setStyleSheet("color: #ef4444; font-size: 14px; font-weight: bold; text-transform: uppercase;")
        layout.addWidget(timeline_label)

        timeline = QTextEdit()
        timeline.setReadOnly(True)

        events = session.get("all_events", [])
        events.sort(key=lambda x: x.get("timestamp", ""))

        timeline_html = ""
        for event in events:
            event_data = event.get("event", {})
            timestamp = to_est(event.get("timestamp", ""))
            event_type = event_data.get("event_type", "unknown")
            action = event_data.get("action", "-")
            component = event_data.get("component", "-")
            page = event_data.get("page", "-")

            color = {
                "click": "#ef4444",
                "navigation": "#22c55e",
                "visibility": "#eab308",
                "focus": "#a855f7",
                "session_start": "#06b6d4",
                "error": "#ff0000"
            }.get(event_type, "#888")

            timeline_html += f"""
            <div style="margin-bottom: 8px; padding: 8px; background: #0a0a0a; border-radius: 2px; border-left: 2px solid {color};">
                <span style="color: {color}; font-weight: bold; font-family: monospace;">[{event_type}]</span>
                <span style="color: #666; font-size: 11px; font-family: monospace;"> {timestamp}</span><br/>
                <span style="color: #ccc; font-family: monospace;">Action: {action}</span><br/>
                <span style="color: #666; font-size: 11px; font-family: monospace;">Component: {component} | Page: {page}</span>
            </div>
            """

        timeline.setHtml(timeline_html)
        layout.addWidget(timeline, 1)

        # Close button
        close_btn = QPushButton("Close")
        close_btn.setStyleSheet("""
            QPushButton {
                background-color: #330000;
                color: #ef4444;
                border: 1px solid #ef4444;
                border-radius: 4px;
                padding: 8px 24px;
                font-weight: bold;
                font-family: Monospace;
                text-transform: uppercase;
            }
            QPushButton:hover {
                background-color: #ef4444;
                color: white;
            }
        """)
        close_btn.clicked.connect(self.close)
        layout.addWidget(close_btn, alignment=Qt.AlignmentFlag.AlignRight)


# ============================================================================
# Main Window
# ============================================================================

class AnalyticsDashboard(QMainWindow):
    """Main dashboard window."""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("AGRS ZEUS Analytics Dashboard")
        self.setMinimumSize(1400, 900)

        # Set window icon (shows in taskbar/sidebar)
        icon_path = Path(__file__).parent / "agrs-logo.png"
        if not icon_path.exists():
            # Check in dist folder (when running as compiled executable)
            icon_path = Path(sys._MEIPASS) / "agrs-logo.png" if hasattr(sys, '_MEIPASS') else icon_path
        if icon_path.exists():
            self.setWindowIcon(QIcon(str(icon_path)))
        self.setStyleSheet("""
            QMainWindow {
                background-color: #000000;
            }
            QTabWidget::pane {
                border: none;
                background-color: #000000;
            }
            QTabBar::tab {
                background-color: #0a0a0a;
                color: #666;
                padding: 10px 20px;
                margin-right: 2px;
                border-top-left-radius: 4px;
                border-top-right-radius: 4px;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
            QTabBar::tab:selected {
                background-color: #330000;
                color: #ef4444;
                border-bottom: 2px solid #ef4444;
            }
            QScrollArea {
                border: none;
                background-color: transparent;
            }
            QTableWidget {
                background-color: #0a0a0a;
                color: #ccc;
                border: 1px solid #330000;
                border-radius: 4px;
                gridline-color: #1a1a1a;
                font-family: Monospace;
                font-size: 12px;
            }
            QTableWidget::item {
                padding: 8px;
            }
            QTableWidget::item:selected {
                background-color: #330000;
                color: white;
            }
            QHeaderView::section {
                background-color: #111;
                color: #888;
                padding: 10px;
                border: none;
                font-weight: bold;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
        """)

        self.data = None
        self.setup_ui()

        # Auto-refresh timer (30 seconds)
        self.refresh_timer = QTimer()
        self.refresh_timer.timeout.connect(self.refresh_data)
        self.refresh_timer.start(30000)

        # Initial load
        self.refresh_data()

    def setup_ui(self):
        """Setup the user interface."""
        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(15)

        # Header
        header = QHBoxLayout()
        title = QLabel("AGRS ZEUS Analytics Dashboard")
        # Using a system font that looks technical if Cinzel isn't available
        title.setStyleSheet("color: #ef4444; font-size: 24px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; font-family: 'Courier New', Monospace;")

        self.status_label = QLabel("Loading...")
        self.status_label.setStyleSheet("color: #666; font-size: 11px; font-family: Monospace;")

        refresh_btn = QPushButton("REFRESH DATA")
        refresh_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #ef4444;
                border: 1px solid #ef4444;
                border-radius: 2px;
                padding: 6px 16px;
                font-weight: bold;
                font-family: Monospace;
                font-size: 11px;
            }
            QPushButton:hover {
                background-color: #ef4444;
                color: white;
            }
        """)
        refresh_btn.clicked.connect(self.refresh_data)

        header.addWidget(title)
        header.addStretch()
        header.addWidget(self.status_label)
        header.addWidget(refresh_btn)
        main_layout.addLayout(header)

        # Stats cards
        self.stats_layout = QHBoxLayout()
        self.stats_layout.setSpacing(10)

        self.stat_cards = {
            "total_events": StatCard("Total Events", "-", "#ef4444"),
            "total_sessions": StatCard("Sessions", "-", "#ef4444"),
            "active_sessions": StatCard("Active Now", "-", "#22c55e"),
            "unique_users": StatCard("Unique Users", "-", "#eab308"),
            "unique_ips": StatCard("Unique IPs", "-", "#f97316"),
            "total_clicks": StatCard("Total Clicks", "-", "#ec4899"),
            "avg_duration": StatCard("Avg Duration", "-", "#06b6d4"),
        }

        for card in self.stat_cards.values():
            self.stats_layout.addWidget(card)

        main_layout.addLayout(self.stats_layout)

        # Tabs
        tabs = QTabWidget()
        tabs.addTab(self.create_live_activity_tab(), "LIVE ACTIVITY")
        tabs.addTab(self.create_operations_tab(), "OPERATIONS")
        tabs.addTab(self.create_overview_tab(), "OVERVIEW")
        tabs.addTab(self.create_sessions_tab(), "SESSIONS")
        tabs.addTab(self.create_users_tab(), "USERS")
        main_layout.addWidget(tabs, 1)

    def create_live_activity_tab(self) -> QWidget:
        """Create the live activity stream tab."""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(10)

        # Header with auto-refresh indicator
        header = QHBoxLayout()
        title = QLabel("Real-Time Activity Stream")
        title.setStyleSheet("color: #22c55e; font-size: 14px; font-weight: bold;")

        self.live_status = QLabel("Auto-refreshing every 5s")
        self.live_status.setStyleSheet("color: #888; font-size: 11px;")

        header.addWidget(title)
        header.addStretch()
        header.addWidget(self.live_status)
        layout.addLayout(header)

        # Activity table
        self.activity_table = QTableWidget()
        self.activity_table.setColumnCount(7)
        self.activity_table.setHorizontalHeaderLabels([
            "Timestamp", "User", "Action", "Component", "Page", "Location", "IP"
        ])
        self.activity_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.activity_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.activity_table.setAlternatingRowColors(True)
        self.activity_table.setStyleSheet("""
            QTableWidget {
                background-color: #0a0a0a;
                alternate-background-color: #111;
                color: #ccc;
                border: 1px solid #222;
                gridline-color: #222;
            }
            QTableWidget::item {
                padding: 6px;
                border-bottom: 1px solid #222;
            }
            QTableWidget::item:selected {
                background-color: #1a3a1a;
            }
            QHeaderView::section {
                background-color: #111;
                color: #22c55e;
                padding: 8px;
                border: none;
                border-bottom: 1px solid #22c55e;
                font-weight: bold;
                text-transform: uppercase;
                font-size: 10px;
            }
        """)

        layout.addWidget(self.activity_table)

        # Set up faster refresh timer for live activity (5 seconds)
        self.live_timer = QTimer()
        self.live_timer.timeout.connect(self.refresh_live_activity)
        self.live_timer.start(5000)

        return widget

    def refresh_live_activity(self):
        """Refresh live activity in background thread."""
        # Prevent multiple simultaneous refreshes
        if hasattr(self, '_live_thread') and self._live_thread and self._live_thread.isRunning():
            return

        # Create worker and thread
        self._live_thread = QThread()
        self._live_worker = LiveActivityWorker()
        self._live_worker.moveToThread(self._live_thread)

        self._live_thread.started.connect(self._live_worker.run)
        self._live_worker.finished.connect(self._on_live_data_loaded)
        self._live_worker.error.connect(self._on_live_error)
        self._live_worker.finished.connect(self._live_thread.quit)
        self._live_worker.error.connect(self._live_thread.quit)

        self._live_thread.start()

    def _on_live_data_loaded(self, processed_events):
        """Handle live activity data loaded from background thread."""
        self.activity_table.setRowCount(len(processed_events))

        # Collect IPs that need geo lookup
        ips_to_resolve = set()

        for row, item in enumerate(processed_events):
            event = item["event"]
            location = item["location"]
            ip = item["ip"]

            if location == "Resolving...":
                ips_to_resolve.add(ip)

            timestamp = to_est(event.get("timestamp", ""))
            username = event.get("username", "anonymous")
            event_data = event.get("event", {})
            action = event_data.get("action", "-")
            component = event_data.get("component", "-")
            page = event_data.get("page", "-")
            event_type = event_data.get("event_type", "")

            # Color code by event type
            color = {
                "click": "#3b82f6",
                "navigation": "#22c55e",
                "visibility": "#666",
                "focus": "#a855f7",
                "session_start": "#06b6d4",
                "login_success": "#22c55e",
                "login_failed": "#ef4444",
                "error": "#ef4444",
                "test": "#eab308",
            }.get(event_type, "#888")

            # Create items
            timestamp_item = QTableWidgetItem(timestamp)
            timestamp_item.setForeground(QColor("#888"))

            user_item = QTableWidgetItem(username)
            user_item.setForeground(QColor("#22c55e") if username != "anonymous" else QColor("#666"))

            action_item = QTableWidgetItem(f"{event_type}: {action}" if action != "-" else event_type)
            action_item.setForeground(QColor(color))

            component_item = QTableWidgetItem(str(component) if component else "-")
            component_item.setForeground(QColor("#888"))

            page_item = QTableWidgetItem(str(page) if page else "-")
            page_item.setForeground(QColor("#06b6d4"))

            location_item = QTableWidgetItem(location)
            location_item.setForeground(QColor("#f97316") if location not in ["Resolving...", "Local", "Unknown"] else QColor("#666"))

            ip_item = QTableWidgetItem(ip)
            ip_item.setForeground(QColor("#666"))

            self.activity_table.setItem(row, 0, timestamp_item)
            self.activity_table.setItem(row, 1, user_item)
            self.activity_table.setItem(row, 2, action_item)
            self.activity_table.setItem(row, 3, component_item)
            self.activity_table.setItem(row, 4, page_item)
            self.activity_table.setItem(row, 5, location_item)
            self.activity_table.setItem(row, 6, ip_item)

        self.live_status.setText(f"Updated: {now_est()} | {len(processed_events)} events")

        # Start background geo lookup for unresolved IPs
        if ips_to_resolve:
            self._start_geo_lookup(ips_to_resolve)

    def _on_live_error(self, error_msg):
        """Handle error from live activity loading."""
        self.live_status.setText(f"Error: {error_msg}")

    def _start_geo_lookup(self, ips):
        """Start background geo lookup for IPs."""
        if hasattr(self, '_geo_thread') and self._geo_thread and self._geo_thread.isRunning():
            return

        self._geo_thread = QThread()
        self._geo_worker = GeoLookupWorker(list(ips))
        self._geo_worker.moveToThread(self._geo_thread)

        self._geo_thread.started.connect(self._geo_worker.run)
        self._geo_worker.finished.connect(self._geo_thread.quit)

        self._geo_thread.start()

    def update_live_activity(self):
        """Alias for refresh_live_activity for compatibility."""
        self.refresh_live_activity()

    def create_operations_tab(self) -> QWidget:
        """Create the operations feed tab (audit events)."""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(10)

        # Header with status
        header = QHBoxLayout()
        title = QLabel("Audit Operations Feed")
        title.setStyleSheet("color: #a855f7; font-size: 14px; font-weight: bold;")

        self.operations_status = QLabel("Auto-refreshing every 5s")
        self.operations_status.setStyleSheet("color: #888; font-size: 11px;")

        header.addWidget(title)
        header.addStretch()
        header.addWidget(self.operations_status)
        layout.addLayout(header)

        # Filters
        filters = QHBoxLayout()
        filters.setSpacing(8)

        user_label = QLabel("User")
        user_label.setStyleSheet("color: #888; font-size: 11px; font-family: Monospace;")
        self.operations_user_filter = QComboBox()
        self.operations_user_filter.setMinimumWidth(180)
        self.operations_user_filter.currentIndexChanged.connect(self._apply_operations_filters)

        project_label = QLabel("Project")
        project_label.setStyleSheet("color: #888; font-size: 11px; font-family: Monospace;")
        self.operations_project_filter = QComboBox()
        self.operations_project_filter.setMinimumWidth(220)
        self.operations_project_filter.currentIndexChanged.connect(self._apply_operations_filters)

        event_label = QLabel("Event Type")
        event_label.setStyleSheet("color: #888; font-size: 11px; font-family: Monospace;")
        self.operations_event_filter = QComboBox()
        self.operations_event_filter.setMinimumWidth(220)
        self.operations_event_filter.currentIndexChanged.connect(self._apply_operations_filters)

        search_label = QLabel("Search")
        search_label.setStyleSheet("color: #888; font-size: 11px; font-family: Monospace;")
        self.operations_search = QLineEdit()
        self.operations_search.setPlaceholderText("payload / summary contains...")
        self.operations_search.textChanged.connect(self._apply_operations_filters)

        refresh_btn = QPushButton("REFRESH")
        refresh_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #a855f7;
                border: 1px solid #a855f7;
                border-radius: 2px;
                padding: 4px 12px;
                font-weight: bold;
                font-family: Monospace;
                font-size: 10px;
            }
            QPushButton:hover {
                background-color: #a855f7;
                color: white;
            }
        """)
        refresh_btn.clicked.connect(self.refresh_operations_feed)

        for combo in (self.operations_user_filter, self.operations_project_filter, self.operations_event_filter):
            combo.setStyleSheet("""
                QComboBox {
                    background-color: #0a0a0a;
                    color: #ddd;
                    border: 1px solid #2a2a2a;
                    border-radius: 2px;
                    padding: 4px 8px;
                    font-family: Monospace;
                    font-size: 11px;
                }
            """)
            combo.addItem("All")

        self.operations_search.setStyleSheet("""
            QLineEdit {
                background-color: #0a0a0a;
                color: #ddd;
                border: 1px solid #2a2a2a;
                border-radius: 2px;
                padding: 4px 8px;
                font-family: Monospace;
                font-size: 11px;
            }
        """)

        filters.addWidget(user_label)
        filters.addWidget(self.operations_user_filter)
        filters.addWidget(project_label)
        filters.addWidget(self.operations_project_filter)
        filters.addWidget(event_label)
        filters.addWidget(self.operations_event_filter)
        filters.addWidget(search_label)
        filters.addWidget(self.operations_search, 1)
        filters.addWidget(refresh_btn)
        layout.addLayout(filters)

        # Operations table
        self.operations_table = QTableWidget()
        self.operations_table.setColumnCount(6)
        self.operations_table.setHorizontalHeaderLabels([
            "Timestamp", "User", "Project", "Event Type", "Summary", "Payload"
        ])
        self.operations_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.operations_table.setAlternatingRowColors(True)
        self.operations_table.setStyleSheet("""
            QTableWidget {
                background-color: #0a0a0a;
                alternate-background-color: #111;
                color: #ccc;
                border: 1px solid #222;
                gridline-color: #222;
            }
            QHeaderView::section {
                background-color: #111;
                color: #a855f7;
                padding: 8px;
                border: none;
                border-bottom: 1px solid #a855f7;
                font-weight: bold;
                text-transform: uppercase;
                font-size: 10px;
            }
        """)
        header_view = self.operations_table.horizontalHeader()
        header_view.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(3, QHeaderView.ResizeMode.ResizeToContents)
        header_view.setSectionResizeMode(4, QHeaderView.ResizeMode.Stretch)
        header_view.setSectionResizeMode(5, QHeaderView.ResizeMode.Stretch)
        layout.addWidget(self.operations_table)

        self._operations_rows = []

        self.operations_timer = QTimer()
        self.operations_timer.timeout.connect(self.refresh_operations_feed)
        self.operations_timer.start(5000)

        return widget

    def _refresh_operations_filter_options(self, operations: list):
        """Refresh operation filter combo values while preserving selections."""
        users = sorted({str(op.get("username") or "unknown") for op in operations}, key=lambda v: v.lower())
        projects = sorted({str(op.get("project_name") or "-") for op in operations}, key=lambda v: v.lower())
        event_types = sorted({str(op.get("event_type") or "-") for op in operations}, key=lambda v: v.lower())

        def refill(combo: QComboBox, values: list):
            current = combo.currentText()
            combo.blockSignals(True)
            combo.clear()
            combo.addItem("All")
            for value in values:
                combo.addItem(value)
            idx = combo.findText(current)
            combo.setCurrentIndex(idx if idx >= 0 else 0)
            combo.blockSignals(False)

        refill(self.operations_user_filter, users)
        refill(self.operations_project_filter, projects)
        refill(self.operations_event_filter, event_types)

    def _operation_summary(self, operation: dict) -> str:
        """Build a short summary from event_type + key payload fields."""
        event_type = str(operation.get("event_type") or "-")
        payload = operation.get("payload")
        if not isinstance(payload, dict) or not payload:
            return event_type

        focus_keys = [
            "route_id",
            "segment_id",
            "sortie_id",
            "entry_id",
            "job_id",
            "dataset",
            "code",
            "visibility",
            "folder_id",
        ]
        parts = []
        for key in focus_keys:
            value = payload.get(key)
            if value in (None, "", [], {}):
                continue
            parts.append(f"{key}={value}")
            if len(parts) >= 2:
                break
        if parts:
            return f"{event_type} | {' | '.join(parts)}"
        return event_type

    def _operation_payload_preview(self, payload: dict) -> str:
        if not payload:
            return "-"
        try:
            text = json.dumps(payload, default=str)
        except Exception:
            text = str(payload)
        if len(text) > 220:
            return text[:217] + "..."
        return text

    def _apply_operations_filters(self):
        """Apply selected operation filters to the table."""
        if not hasattr(self, "operations_table"):
            return
        operations = getattr(self, "_operations_rows", [])

        user_filter = self.operations_user_filter.currentText() if hasattr(self, "operations_user_filter") else "All"
        project_filter = self.operations_project_filter.currentText() if hasattr(self, "operations_project_filter") else "All"
        event_filter = self.operations_event_filter.currentText() if hasattr(self, "operations_event_filter") else "All"
        search = (self.operations_search.text().strip().lower() if hasattr(self, "operations_search") else "")

        filtered = []
        for op in operations:
            username = str(op.get("username") or "unknown")
            project_name = str(op.get("project_name") or "-")
            event_type = str(op.get("event_type") or "-")

            if user_filter != "All" and username != user_filter:
                continue
            if project_filter != "All" and project_name != project_filter:
                continue
            if event_filter != "All" and event_type != event_filter:
                continue

            if search:
                summary = self._operation_summary(op)
                payload_text = self._operation_payload_preview(op.get("payload") if isinstance(op.get("payload"), dict) else {})
                haystack = f"{username} {project_name} {event_type} {summary} {payload_text}".lower()
                if search not in haystack:
                    continue

            filtered.append(op)

        self.operations_table.setRowCount(len(filtered))
        for row, op in enumerate(filtered):
            username = str(op.get("username") or "unknown")
            project_name = str(op.get("project_name") or "-")
            event_type = str(op.get("event_type") or "-")
            summary = self._operation_summary(op)
            payload = op.get("payload") if isinstance(op.get("payload"), dict) else {}
            payload_text = self._operation_payload_preview(payload)

            ts_item = QTableWidgetItem(to_est(str(op.get("timestamp") or "")))
            ts_item.setForeground(QColor("#888"))
            user_item = QTableWidgetItem(username)
            user_item.setForeground(QColor("#22c55e"))
            project_item = QTableWidgetItem(project_name)
            project_item.setForeground(QColor("#06b6d4"))

            event_item = QTableWidgetItem(event_type)
            et = event_type.lower()
            if "create" in et or et.endswith(".start"):
                event_item.setForeground(QColor("#22c55e"))
            elif "update" in et or "set" in et:
                event_item.setForeground(QColor("#eab308"))
            elif "delete" in et or "archive" in et or "remove" in et:
                event_item.setForeground(QColor("#ef4444"))
            else:
                event_item.setForeground(QColor("#a855f7"))

            summary_item = QTableWidgetItem(summary)
            summary_item.setForeground(QColor("#ddd"))
            payload_item = QTableWidgetItem(payload_text)
            payload_item.setForeground(QColor("#777"))

            self.operations_table.setItem(row, 0, ts_item)
            self.operations_table.setItem(row, 1, user_item)
            self.operations_table.setItem(row, 2, project_item)
            self.operations_table.setItem(row, 3, event_item)
            self.operations_table.setItem(row, 4, summary_item)
            self.operations_table.setItem(row, 5, payload_item)

    def refresh_operations_feed(self):
        """Refresh operations feed from mirrored audit JSONL files."""
        if not hasattr(self, "operations_table"):
            return
        try:
            operations = load_operations(2)[:600]
            self._operations_rows = operations
            self._refresh_operations_filter_options(operations)
            self._apply_operations_filters()
            shown = self.operations_table.rowCount()
            self.operations_status.setText(f"Updated: {now_est()} | {shown}/{len(operations)} ops")
        except Exception as e:
            self.operations_status.setText(f"Error: {e}")

    def create_overview_tab(self) -> QWidget:
        """Create the overview tab."""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(15)

        # Charts row
        charts_layout = QHBoxLayout()

        # Hourly activity chart
        hourly_group = QGroupBox("Hourly Activity (Last 7 Days)")
        hourly_group.setStyleSheet("""
            QGroupBox {
                color: #ef4444;
                font-weight: bold;
                border: 1px solid #330000;
                border-radius: 4px;
                margin-top: 10px;
                padding-top: 10px;
                background-color: #0a0a0a;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
        """)
        hourly_layout = QVBoxLayout(hourly_group)
        self.hourly_chart_view = QChartView()
        self.hourly_chart_view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.hourly_chart_view.setStyleSheet("background: transparent;")
        hourly_layout.addWidget(self.hourly_chart_view)
        charts_layout.addWidget(hourly_group)

        layout.addLayout(charts_layout)

        # Bottom row: Actions, Sources, and Tech
        bottom_layout = QHBoxLayout()

        # Top actions
        actions_group = QGroupBox("Top Actions")
        actions_group.setStyleSheet("""
            QGroupBox {
                color: #ef4444;
                font-weight: bold;
                border: 1px solid #330000;
                border-radius: 4px;
                margin-top: 10px;
                padding-top: 10px;
                background-color: #0a0a0a;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
        """)
        actions_layout = QVBoxLayout(actions_group)
        self.actions_scroll = QScrollArea()
        self.actions_scroll.setWidgetResizable(True)
        self.actions_container = QWidget()
        self.actions_container_layout = QVBoxLayout(self.actions_container)
        self.actions_container_layout.setSpacing(8)
        self.actions_scroll.setWidget(self.actions_container)
        actions_layout.addWidget(self.actions_scroll)
        bottom_layout.addWidget(actions_group)

        # Geographic Distribution (real IP geolocation)
        geo_group = QGroupBox("Geographic Distribution")
        geo_group.setStyleSheet("""
            QGroupBox {
                color: #ef4444;
                font-weight: bold;
                border: 1px solid #330000;
                border-radius: 4px;
                margin-top: 10px;
                padding-top: 10px;
                background-color: #0a0a0a;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
        """)
        geo_layout = QVBoxLayout(geo_group)
        self.geo_scroll = QScrollArea()
        self.geo_scroll.setWidgetResizable(True)
        self.geo_container = QWidget()
        self.geo_container_layout = QVBoxLayout(self.geo_container)
        self.geo_container_layout.setSpacing(8)
        self.geo_scroll.setWidget(self.geo_container)
        geo_layout.addWidget(self.geo_scroll)
        bottom_layout.addWidget(geo_group)

        # Browser/OS stats
        tech_group = QGroupBox("Technology Stats")
        tech_group.setStyleSheet("""
            QGroupBox {
                color: #ef4444;
                font-weight: bold;
                border: 1px solid #330000;
                border-radius: 4px;
                margin-top: 10px;
                padding-top: 10px;
                background-color: #0a0a0a;
                font-family: Monospace;
                text-transform: uppercase;
                font-size: 11px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
        """)
        tech_layout = QVBoxLayout(tech_group)
        self.tech_scroll = QScrollArea()
        self.tech_scroll.setWidgetResizable(True)
        self.tech_container = QWidget()
        self.tech_container_layout = QVBoxLayout(self.tech_container)
        self.tech_container_layout.setSpacing(8)
        self.tech_scroll.setWidget(self.tech_container)
        tech_layout.addWidget(self.tech_scroll)
        bottom_layout.addWidget(tech_group)

        layout.addLayout(bottom_layout, 1)
        return widget

    def create_sessions_tab(self) -> QWidget:
        """Create the sessions tab."""
        widget = QWidget()
        layout = QVBoxLayout(widget)

        self.sessions_table = QTableWidget()
        self.sessions_table.setColumnCount(10)
        self.sessions_table.setHorizontalHeaderLabels([
            "User", "Company", "Location", "IP Address", "Browser", "OS", "Duration", "Events", "Clicks", "Last Active"
        ])
        self.sessions_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.sessions_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        self.sessions_table.doubleClicked.connect(self.show_session_detail)

        layout.addWidget(self.sessions_table)
        return widget

    def create_users_tab(self) -> QWidget:
        """Create the users tab."""
        widget = QWidget()
        layout = QVBoxLayout(widget)

        self.users_table = QTableWidget()
        self.users_table.setColumnCount(4)
        self.users_table.setHorizontalHeaderLabels(["Username", "Sessions", "Events", "Clicks"])
        self.users_table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)

        layout.addWidget(self.users_table)
        return widget

    def refresh_data(self):
        """Refresh all dashboard data in background thread."""
        # Prevent multiple simultaneous refreshes
        if hasattr(self, '_data_thread') and self._data_thread and self._data_thread.isRunning():
            return

        self.status_label.setText("LOADING...")

        # Create worker and thread for dashboard data
        self._data_thread = QThread()
        self._data_worker = DataWorker()
        self._data_worker.moveToThread(self._data_thread)

        self._data_thread.started.connect(self._data_worker.run)
        self._data_worker.finished.connect(self._on_data_loaded)
        self._data_worker.error.connect(self._on_data_error)
        self._data_worker.finished.connect(self._data_thread.quit)
        self._data_worker.error.connect(self._data_thread.quit)

        self._data_thread.start()

        # Also refresh live activity
        self.refresh_live_activity()
        self.refresh_operations_feed()

    def _on_data_loaded(self, data):
        """Handle dashboard data loaded from background thread."""
        self.data = data
        self.update_ui()
        self.status_label.setText(f"UPDATED: {now_est()}")

    def _on_data_error(self, error_msg):
        """Handle error from background data loading."""
        self.status_label.setText(f"ERROR: {error_msg}")

    def update_ui(self):
        """Update all UI elements with new data."""
        if not self.data:
            return

        summary = self.data["summary"]

        # Update stat cards
        self.stat_cards["total_events"].set_value(f"{summary['total_events']:,}")
        self.stat_cards["total_sessions"].set_value(f"{summary['total_sessions']:,}")
        self.stat_cards["active_sessions"].set_value(str(summary['active_sessions']))
        self.stat_cards["unique_users"].set_value(str(summary['unique_users']))
        self.stat_cards["unique_ips"].set_value(str(summary.get('unique_ips', 0)))
        self.stat_cards["total_clicks"].set_value(f"{summary['total_clicks']:,}")

        duration = summary.get('avg_session_duration') or 0
        if duration < 60:
            dur_str = f"{int(duration)}s"
        elif duration < 3600:
            dur_str = f"{int(duration // 60)}m"
        else:
            dur_str = f"{int(duration // 3600)}h {int((duration % 3600) // 60)}m"
        self.stat_cards["avg_duration"].set_value(dur_str)

        # Update hourly chart
        self.update_hourly_chart()

        # Update action bars
        self.update_bar_list(
            self.actions_container_layout,
            [(a["action"], a["count"]) for a in self.data["top_actions"]],
            "#ef4444"
        )

        # Update geographic distribution (real IP geolocation data)
        self.update_bar_list(
            self.geo_container_layout,
            [(g["location"], g["count"]) for g in self.data.get("geographic", [])],
            "#ef4444"
        )

        # Update tech bars
        tech_items = []
        for b in self.data["browsers"]:
            tech_items.append((f"Browser: {b['browser']}", b["count"]))
        for o in self.data["os_stats"]:
            tech_items.append((f"OS: {o['os']}", o["count"]))
        for d in self.data["device_types"]:
            tech_items.append((f"Device: {d['device']}", d["count"]))
        self.update_bar_list(self.tech_container_layout, tech_items, "#ef4444")

        # Update sessions table
        self.update_sessions_table()

        # Update users table
        self.update_users_table()

    def update_hourly_chart(self):
        """Update the hourly activity bar chart."""
        chart = QChart()
        chart.setBackgroundBrush(QBrush(QColor("#0a0a0a")))
        chart.setTitleBrush(QBrush(QColor("white")))
        chart.legend().hide()

        series = QBarSeries()
        bar_set = QBarSet("Events")
        bar_set.setColor(QColor("#ef4444"))
        bar_set.setBorderColor(QColor("#7f1d1d"))

        hourly = self.data.get("hourly_activity", [])
        max_val = max((h["count"] for h in hourly), default=1)

        for h in hourly:
            bar_set.append(h["count"])

        series.append(bar_set)
        chart.addSeries(series)

        # X axis
        axis_x = QBarCategoryAxis()
        axis_x.append([f"{h}:00" for h in range(24)])
        axis_x.setLabelsColor(QColor("#888"))
        axis_x.setGridLineVisible(False)
        chart.addAxis(axis_x, Qt.AlignmentFlag.AlignBottom)
        series.attachAxis(axis_x)

        # Y axis
        axis_y = QValueAxis()
        axis_y.setRange(0, max_val * 1.1)
        axis_y.setLabelsColor(QColor("#888"))
        axis_y.setGridLineColor(QColor("#330000"))
        chart.addAxis(axis_y, Qt.AlignmentFlag.AlignLeft)
        series.attachAxis(axis_y)

        self.hourly_chart_view.setChart(chart)

    def update_bar_list(self, layout: QVBoxLayout, items: list, color: str):
        """Update a list of bar widgets."""
        # Clear existing
        while layout.count():
            child = layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        if not items:
            return

        max_val = max(v for _, v in items) if items else 1

        for label, value in items:
            bar = BarWidget(label, value, max_val, color)
            layout.addWidget(bar)

        layout.addStretch()

    def update_sessions_table(self):
        """Update the sessions table."""
        sessions = self.data.get("sessions", [])
        self.sessions_table.setRowCount(len(sessions))

        for row, session in enumerate(sessions):
            self.sessions_table.setItem(row, 0, QTableWidgetItem(session["name"]))
            self.sessions_table.setItem(row, 1, QTableWidgetItem(session["company"]))
            self.sessions_table.setItem(row, 2, QTableWidgetItem(session.get("location", "Unknown")))
            self.sessions_table.setItem(row, 3, QTableWidgetItem(session["ip"]))
            self.sessions_table.setItem(row, 4, QTableWidgetItem(session["browser"]))
            self.sessions_table.setItem(row, 5, QTableWidgetItem(session["os"]))

            duration = session.get("duration") or 0
            if duration < 60:
                dur_str = f"{int(duration)}s"
            elif duration < 3600:
                dur_str = f"{int(duration // 60)}m"
            else:
                dur_str = f"{int(duration // 3600)}h {int((duration % 3600) // 60)}m"
            self.sessions_table.setItem(row, 6, QTableWidgetItem(dur_str))

            self.sessions_table.setItem(row, 7, QTableWidgetItem(str(session["events"])))
            self.sessions_table.setItem(row, 8, QTableWidgetItem(str(session["clicks"])))

            last_active = to_est(session.get("last_activity", ""))
            self.sessions_table.setItem(row, 9, QTableWidgetItem(last_active))

    def update_users_table(self):
        """Update the users table."""
        users = self.data.get("user_breakdown", [])
        self.users_table.setRowCount(len(users))

        for row, user in enumerate(users):
            self.users_table.setItem(row, 0, QTableWidgetItem(user["username"]))
            self.users_table.setItem(row, 1, QTableWidgetItem(str(user["sessions"])))
            self.users_table.setItem(row, 2, QTableWidgetItem(str(user["events"])))
            self.users_table.setItem(row, 3, QTableWidgetItem(str(user["clicks"])))

    def show_session_detail(self):
        """Show session detail dialog."""
        row = self.sessions_table.currentRow()
        if row >= 0 and self.data:
            sessions = self.data.get("sessions", [])
            if row < len(sessions):
                dialog = SessionDetailDialog(sessions[row], self)
                dialog.exec()


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    """Start the dashboard application."""
    # Set app name and desktop file name BEFORE creating QApplication
    # This is critical for Linux taskbar icon matching
    app = QApplication(sys.argv)

    # Set application metadata for desktop integration
    app.setApplicationName("AGRS-Analytics")
    app.setApplicationDisplayName("AGRS Analytics")
    app.setDesktopFileName("AGRS-Analytics")  # Must match .desktop file name

    # Set application-wide icon
    icon_path = Path(__file__).parent / "agrs-logo.png"
    if not icon_path.exists() and hasattr(sys, '_MEIPASS'):
        icon_path = Path(sys._MEIPASS) / "agrs-logo.png"
    if icon_path.exists():
        app.setWindowIcon(QIcon(str(icon_path)))

    app.setStyle("Fusion")

    # Dark palette
    palette = QPalette()
    palette.setColor(QPalette.ColorRole.Window, QColor("#000000"))
    palette.setColor(QPalette.ColorRole.WindowText, QColor("white"))
    palette.setColor(QPalette.ColorRole.Base, QColor("#0a0a0a"))
    palette.setColor(QPalette.ColorRole.AlternateBase, QColor("#111111"))
    palette.setColor(QPalette.ColorRole.Text, QColor("white"))
    palette.setColor(QPalette.ColorRole.Button, QColor("#330000"))
    palette.setColor(QPalette.ColorRole.ButtonText, QColor("white"))
    palette.setColor(QPalette.ColorRole.Highlight, QColor("#ef4444"))
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor("white"))
    app.setPalette(palette)

    window = AnalyticsDashboard()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
