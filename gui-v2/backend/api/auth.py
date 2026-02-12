"""
Authentication and Analytics API for AGRS ZEUS
Handles user login, session management, and comprehensive user activity tracking.
"""

import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Request, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
import threading
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session

router = APIRouter(tags=["auth"])

from .db import get_sessionmaker  # noqa: E402
from .db_models import User  # noqa: E402
from .security import verify_password, DUMMY_PASSWORD_HASH  # noqa: E402

# ============================================================================
# Configuration
# ============================================================================

# Demo users - in production, use a database
DEMO_USERS = {
    "admin": {
        "password_hash": None,
        "name": "AGRS Admin",
        "role": "admin",
        "company": "AGRS Global"
    },
    "rad_admin": {
        "password_hash": None,
        "name": "RAD Admin",
        "role": "admin",
        "company": "AGRS Global"
    }
}

# Session storage (in-memory, persisted to disk)
SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_LOCK = threading.Lock()
SESSION_EXPIRY_HOURS = 24

# Analytics storage
ANALYTICS_DIR = Path("/opt/agrs/analytics")
ANALYTICS_DIR.mkdir(parents=True, exist_ok=True)

security = HTTPBearer(auto_error=False)


# ============================================================================
# Models
# ============================================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    user: Optional[Dict[str, Any]] = None
    message: str


class AnalyticsEvent(BaseModel):
    event_type: str  # click, navigation, input, action, error
    component: Optional[str] = None  # Button, Input, Page, etc.
    action: Optional[str] = None  # What was done
    target: Optional[str] = None  # Element ID or identifier
    value: Optional[Any] = None  # Input value, selection, etc.
    page: Optional[str] = None  # Current page/route
    metadata: Optional[Dict[str, Any]] = None  # Additional context
    timestamp: Optional[str] = None  # Client timestamp
    session_duration: Optional[int] = None  # Seconds since session start


class AnalyticsEventBatch(BaseModel):
    events: List[AnalyticsEvent]


# ============================================================================
# Helper Functions
# ============================================================================

def _hash_password(password: str) -> str:
    """Hash password with salt."""
    salt = "agrs-zeus-2025"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()


def _init_users():
    """Initialize user passwords from environment or defaults."""
    admin_password = os.getenv("ADMIN_PASSWORD", "agrs-admin-2025")
    rad_admin_password = os.getenv("RAD_ADMIN_PASSWORD", "agrs_global_rad_admin")

    DEMO_USERS["admin"]["password_hash"] = _hash_password(admin_password)
    DEMO_USERS["rad_admin"]["password_hash"] = _hash_password(rad_admin_password)

    # Backward-compat: allow email-based login identifiers.
    # Some deployments historically used the RAD admin email as the login username.
    admin_email = (os.getenv("ADMIN_EMAIL") or os.getenv("INITIAL_ADMIN_EMAIL") or "").strip().lower()
    rad_admin_email = (os.getenv("RAD_ADMIN_EMAIL") or "radwan@agrsglobal.com").strip().lower()

    if admin_email:
        DEMO_USERS.setdefault(admin_email, DEMO_USERS["admin"])
    if rad_admin_email:
        DEMO_USERS.setdefault(rad_admin_email, DEMO_USERS["rad_admin"])


def _generate_token() -> str:
    """Generate a secure session token."""
    return secrets.token_urlsafe(32)


def _find_db_user(db: Session, identifier: str) -> Optional[User]:
    ident = (identifier or "").strip().lower()
    if not ident:
        return None
    # Accept either email or serial_number as login identifier.
    return db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == ident,
                func.lower(User.serial_number) == ident,
            )
        )
    ).scalar_one_or_none()


def _get_session(token: str) -> Optional[Dict[str, Any]]:
    """Get session by token if valid."""
    with SESSION_LOCK:
        session = SESSIONS.get(token)
        if not session:
            return None

        # Check expiry
        expires_at = datetime.fromisoformat(session["expires_at"])
        if datetime.utcnow() > expires_at:
            del SESSIONS[token]
            return None

        return session


def _save_sessions():
    """Persist sessions to disk."""
    sessions_file = ANALYTICS_DIR / "sessions.json"
    with SESSION_LOCK:
        with open(sessions_file, 'w') as f:
            json.dump(SESSIONS, f, indent=2, default=str)


def _load_sessions():
    """Load sessions from disk."""
    global SESSIONS
    sessions_file = ANALYTICS_DIR / "sessions.json"
    if sessions_file.exists():
        try:
            with open(sessions_file) as f:
                SESSIONS = json.load(f)
        except:
            SESSIONS = {}


def _get_real_client_ip(request: Request) -> str:
    """
    Extract the real client IP address from request headers.

    Architecture: User → OVH VPS (nginx) → WireGuard → Local Machine

    The nginx on VPS sets X-Real-IP and X-Forwarded-For to the visitor's real IP.
    But request.client.host will be 10.0.0.1 (WireGuard tunnel IP).
    We MUST use the forwarded headers to get the actual user IP.

    Priority order:
    1. CF-Connecting-IP (Cloudflare)
    2. X-Real-IP (nginx - this is what OVH VPS sets)
    3. X-Forwarded-For (first IP in chain = original client)
    4. request.client.host (fallback - only for local dev)
    """
    # Cloudflare
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()

    # nginx X-Real-IP - THIS IS THE KEY ONE for our VPS setup
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    # X-Forwarded-For: client, proxy1, proxy2, ...
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        # First IP is the original client
        ips = [ip.strip() for ip in forwarded_for.split(",")]
        if ips and ips[0]:
            return ips[0]

    # Fallback to direct connection IP (only for local development)
    return request.client.host if request.client else "unknown"


def _get_client_info(request: Request) -> Dict[str, Any]:
    """Extract client information from request."""
    # Capture all forwarding headers for debugging
    forwarding_headers = {
        "cf_connecting_ip": request.headers.get("cf-connecting-ip"),
        "x_real_ip": request.headers.get("x-real-ip"),
        "x_forwarded_for": request.headers.get("x-forwarded-for"),
        "true_client_ip": request.headers.get("true-client-ip"),  # Cloudflare Enterprise
        "x_client_ip": request.headers.get("x-client-ip"),
    }

    return {
        "ip": _get_real_client_ip(request),
        "user_agent": request.headers.get("user-agent", "unknown"),
        "referer": request.headers.get("referer"),
        "origin": request.headers.get("origin"),
        # Store all forwarding headers for debugging
        "proxy_ip": request.client.host if request.client else None,
        "forwarding_headers": {k: v for k, v in forwarding_headers.items() if v},
    }


def _log_analytics_event(
    session_id: str,
    username: str,
    event: AnalyticsEvent,
    client_info: Dict[str, Any]
):
    """Log an analytics event to disk."""
    # Create daily log file
    today = datetime.utcnow().strftime("%Y-%m-%d")
    log_file = ANALYTICS_DIR / f"events_{today}.jsonl"

    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "session_id": session_id,
        "username": username,
        "event": event.dict(),
        "client": client_info
    }

    with open(log_file, 'a') as f:
        f.write(json.dumps(record) + "\n")


def _log_session_event(
    session_id: str,
    username: str,
    event_type: str,
    client_info: Dict[str, Any],
    metadata: Dict[str, Any] = None
):
    """Log session-level events (login, logout, etc.)."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    log_file = ANALYTICS_DIR / f"sessions_{today}.jsonl"

    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "session_id": session_id,
        "username": username,
        "event_type": event_type,
        "client": client_info,
        "metadata": metadata or {}
    }

    with open(log_file, 'a') as f:
        f.write(json.dumps(record) + "\n")


# Initialize on module load
_init_users()
_load_sessions()


# ============================================================================
# Auth Dependency
# ============================================================================

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Optional[Dict[str, Any]]:
    """
    Dependency to get current authenticated user.
    Returns None if not authenticated (for optional auth).
    """
    if not credentials:
        return None

    session = _get_session(credentials.credentials)
    if not session:
        return None

    payload: Dict[str, Any] = {
        "username": session.get("username"),
        "name": session.get("name"),
        "role": session.get("role"),
        "company": session.get("company"),
        "session_id": credentials.credentials,
    }
    # Optional DB identity fields (present for DB-backed sessions)
    if session.get("id"):
        payload["id"] = session.get("id")
    if session.get("email"):
        payload["email"] = session.get("email")
    if session.get("serial_number"):
        payload["serial_number"] = session.get("serial_number")
    return payload


async def require_auth(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    Dependency that requires authentication.
    Raises 401 if not authenticated.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    session = _get_session(credentials.credentials)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    payload: Dict[str, Any] = {
        "username": session.get("username"),
        "name": session.get("name"),
        "role": session.get("role"),
        "company": session.get("company"),
        "session_id": credentials.credentials,
    }
    if session.get("id"):
        payload["id"] = session.get("id")
    if session.get("email"):
        payload["email"] = session.get("email")
    if session.get("serial_number"):
        payload["serial_number"] = session.get("serial_number")
    return payload


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/auth/login", response_model=LoginResponse)
async def login(request: Request, login_req: LoginRequest):
    """
    Authenticate user and create session.
    """
    username = login_req.username.lower().strip()
    password = login_req.password

    client_info = _get_client_info(request)

    # Prefer DB-backed auth when a matching DB user exists. This makes email login
    # first-class (not just an alias) and matches the admin/user management tables.
    SessionLocal = None
    try:
        SessionLocal = get_sessionmaker()
    except Exception:
        SessionLocal = None

    if SessionLocal is not None:
        with SessionLocal() as db:
            db_user = _find_db_user(db, username)
            # Always run password verification to reduce timing differences.
            stored_hash = db_user.password_hash if db_user else DUMMY_PASSWORD_HASH
            ok = verify_password(password, stored_hash)

            if db_user is not None:
                if not ok:
                    _log_session_event(
                        session_id="none",
                        username=username,
                        event_type="login_failed",
                        client_info=client_info,
                        metadata={"reason": "wrong_password"},
                    )
                    raise HTTPException(status_code=401, detail="Invalid credentials")

                if not bool(getattr(db_user, "is_active", True)):
                    _log_session_event(
                        session_id="none",
                        username=username,
                        event_type="login_failed",
                        client_info=client_info,
                        metadata={"reason": "inactive_user"},
                    )
                    raise HTTPException(status_code=401, detail="Invalid credentials")

                # Create session (still stored in-memory, but now tied to the DB identity)
                token = _generate_token()
                expires_at = datetime.utcnow() + timedelta(hours=SESSION_EXPIRY_HOURS)
                session = {
                    "id": str(db_user.id),
                    "email": db_user.email,
                    "serial_number": db_user.serial_number,
                    # Keep legacy keys used by frontend + other endpoints
                    "username": db_user.email,
                    "name": db_user.full_name,
                    "role": (db_user.role or "member"),
                    "company": (db_user.organization or "AGRS Global"),
                    "created_at": datetime.utcnow().isoformat(),
                    "expires_at": expires_at.isoformat(),
                    "client_info": client_info,
                }
                with SESSION_LOCK:
                    SESSIONS[token] = session
                _save_sessions()

                _log_session_event(
                    session_id=token[:16] + "...",
                    username=session["username"],
                    event_type="login_success",
                    client_info=client_info,
                )

                return LoginResponse(
                    success=True,
                    token=token,
                    user={
                        "username": session["username"],
                        "name": session["name"],
                        "role": session["role"],
                        "company": session["company"],
                    },
                    message=f"Welcome, {session['name']}!",
                )

    # Fall back to demo users (legacy mode) ONLY when no DB user matches.
    user = DEMO_USERS.get(username)
    if not user:
        _log_session_event(
            session_id="none",
            username=username,
            event_type="login_failed",
            client_info=client_info,
            metadata={"reason": "user_not_found"},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    password_hash = _hash_password(password)
    if password_hash != user["password_hash"]:
        _log_session_event(
            session_id="none",
            username=username,
            event_type="login_failed",
            client_info=client_info,
            metadata={"reason": "wrong_password"},
        )
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Create session (demo mode)
    token = _generate_token()
    expires_at = datetime.utcnow() + timedelta(hours=SESSION_EXPIRY_HOURS)

    session = {
        "username": username,
        "name": user["name"],
        "role": user["role"],
        "company": user["company"],
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": expires_at.isoformat(),
        "client_info": client_info,
    }

    with SESSION_LOCK:
        SESSIONS[token] = session

    _save_sessions()

    _log_session_event(
        session_id=token[:16] + "...",
        username=username,
        event_type="login_success",
        client_info=client_info
    )

    return LoginResponse(
        success=True,
        token=token,
        user={
            "username": username,
            "name": user["name"],
            "role": user["role"],
            "company": user["company"]
        },
        message=f"Welcome, {user['name']}!"
    )


@router.post("/auth/logout")
async def logout(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Logout and invalidate session.
    """
    if not user:
        return {"success": True, "message": "No active session"}

    token = user["session_id"]
    client_info = _get_client_info(request)

    with SESSION_LOCK:
        if token in SESSIONS:
            del SESSIONS[token]

    _save_sessions()

    _log_session_event(
        session_id=token[:16] + "...",
        username=user["username"],
        event_type="logout",
        client_info=client_info
    )

    return {"success": True, "message": "Logged out successfully"}


@router.get("/auth/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Get current user info.
    """
    if not user:
        return {"authenticated": False}

    return {
        "authenticated": True,
        "user": {
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "company": user["company"]
        }
    }


@router.post("/auth/verify")
async def verify_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Verify if a token is valid.
    """
    if not credentials:
        return {"valid": False}

    session = _get_session(credentials.credentials)
    return {"valid": session is not None}


# ============================================================================
# Analytics Endpoints
# ============================================================================

@router.post("/analytics/event")
async def track_event(
    request: Request,
    event: AnalyticsEvent,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Track a single analytics event.
    """
    client_info = _get_client_info(request)

    username = user["username"] if user else "anonymous"
    session_id = user["session_id"][:16] + "..." if user else "anonymous"

    _log_analytics_event(
        session_id=session_id,
        username=username,
        event=event,
        client_info=client_info
    )

    return {"success": True}


@router.post("/analytics/batch")
async def track_events_batch(
    request: Request,
    batch: AnalyticsEventBatch,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Track multiple analytics events in a batch.
    More efficient for high-frequency events.
    """
    client_info = _get_client_info(request)

    username = user["username"] if user else "anonymous"
    session_id = user["session_id"][:16] + "..." if user else "anonymous"

    for event in batch.events:
        _log_analytics_event(
            session_id=session_id,
            username=username,
            event=event,
            client_info=client_info
        )

    return {"success": True, "count": len(batch.events)}


@router.get("/analytics/summary")
async def get_analytics_summary(user: Dict[str, Any] = Depends(require_auth)):
    """
    Get analytics summary (admin only).
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # Count events and sessions
    event_files = list(ANALYTICS_DIR.glob("events_*.jsonl"))
    session_files = list(ANALYTICS_DIR.glob("sessions_*.jsonl"))

    total_events = 0
    total_sessions = 0

    for f in event_files:
        with open(f) as file:
            total_events += sum(1 for _ in file)

    for f in session_files:
        with open(f) as file:
            total_sessions += sum(1 for _ in file)

    return {
        "total_events": total_events,
        "total_session_events": total_sessions,
        "event_files": len(event_files),
        "active_sessions": len(SESSIONS),
        "analytics_dir": str(ANALYTICS_DIR)
    }


@router.get("/analytics/events/{date}")
async def get_events_for_date(
    date: str,
    user: Dict[str, Any] = Depends(require_auth)
):
    """
    Get all events for a specific date (admin only).
    Date format: YYYY-MM-DD
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    log_file = ANALYTICS_DIR / f"events_{date}.jsonl"

    if not log_file.exists():
        return {"date": date, "events": [], "count": 0}

    events = []
    with open(log_file) as f:
        for line in f:
            try:
                events.append(json.loads(line))
            except:
                continue

    return {"date": date, "events": events, "count": len(events)}
