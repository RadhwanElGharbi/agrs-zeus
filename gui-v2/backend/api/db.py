"""
Database utilities (SQLAlchemy) for AGRS ZEUS GUI v2 backend.

This module provides:
- Engine/sessionmaker creation from DATABASE_URL
- A FastAPI dependency `get_db` for request-scoped sessions

Note: We intentionally do not hard-fail at import time if DATABASE_URL is missing
so that non-DB code paths/tests can still import the backend package. We fail
fast when a DB connection is actually requested.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


def _get_database_url() -> str:
    """
    Return the configured DB URL.

    Production uses DATABASE_URL. We also accept SQLALCHEMY_DATABASE_URL as a
    compatibility fallback.
    """

    url = (os.getenv("DATABASE_URL") or "").strip()
    if url:
        return url
    return (os.getenv("SQLALCHEMY_DATABASE_URL") or "").strip()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """
    Cached SQLAlchemy Engine.
    """

    url = _get_database_url()
    if not url:
        raise RuntimeError("DATABASE_URL is not set (required for DB-backed features).")

    connect_args = {}
    if url.startswith("sqlite"):
        # Needed for SQLite when used in multi-threaded servers (e.g., FastAPI/uvicorn).
        connect_args = {"check_same_thread": False}

    return create_engine(
        url,
        pool_pre_ping=True,
        future=True,
        connect_args=connect_args,
    )


@lru_cache(maxsize=1)
def get_sessionmaker() -> sessionmaker:
    """
    Cached sessionmaker bound to the Engine.
    """

    return sessionmaker(
        bind=get_engine(),
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
    )


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a DB session and closes it afterwards.
    """

    SessionLocal = get_sessionmaker()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
