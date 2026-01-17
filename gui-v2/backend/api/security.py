"""
Security helpers (password hashing, etc.) for AGRS ZEUS GUI v2.
"""

from __future__ import annotations

from passlib.context import CryptContext


PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Used to reduce user enumeration timing differences during login.
DUMMY_PASSWORD_HASH = PWD_CONTEXT.hash("agrs_dummy_password_for_timing")


def hash_password(password: str) -> str:
    return PWD_CONTEXT.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return PWD_CONTEXT.verify(password, password_hash)
    except Exception:
        return False





