"""Caching layer for agent analysis responses.

This module provides caching functionality to store and retrieve agent
responses, reducing API calls for repeated segment analyses.
"""
import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional

from config.settings import Settings


logger = logging.getLogger(__name__)

# Default cache TTL in seconds (1 hour)
DEFAULT_CACHE_TTL = 3600


def _ensure_cache_dir() -> Path:
    """Ensure the cache directory exists.

    Returns:
        Path to the cache directory
    """
    cache_dir = Settings.CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def get_cache_key(segment_id: str, route_id: str) -> str:
    """Generate a deterministic cache key for a segment.

    Args:
        segment_id: Unique segment identifier
        route_id: Route identifier containing the segment

    Returns:
        SHA256 hash string as cache key
    """
    key_input = f"{route_id}:{segment_id}"
    return hashlib.sha256(key_input.encode()).hexdigest()


def _get_cache_file_path(cache_key: str) -> Path:
    """Get the file path for a cache entry.

    Args:
        cache_key: Hash key for the cached entry

    Returns:
        Path to the cache file
    """
    cache_dir = _ensure_cache_dir()
    return cache_dir / f"{cache_key}.json"


def get_cached_response(
    segment_id: str,
    route_id: str,
    ttl: int = DEFAULT_CACHE_TTL
) -> Optional[Dict[str, Any]]:
    """Retrieve a cached response if available and not expired.

    Args:
        segment_id: Unique segment identifier
        route_id: Route identifier containing the segment
        ttl: Time-to-live in seconds (default 1 hour)

    Returns:
        Cached response dict if available and valid, None otherwise
    """
    cache_key = get_cache_key(segment_id, route_id)
    cache_path = _get_cache_file_path(cache_key)

    if not cache_path.exists():
        logger.debug(f"Cache miss for segment {segment_id}: file not found")
        return None

    try:
        with cache_path.open("r", encoding="utf-8") as f:
            cache_entry = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"Cache read error for segment {segment_id}: {e}")
        return None

    # Check if cache is expired
    cached_at = cache_entry.get("_cached_at", 0)
    age = time.time() - cached_at

    if age > ttl:
        logger.debug(f"Cache expired for segment {segment_id} (age: {age:.0f}s, ttl: {ttl}s)")
        return None

    logger.debug(f"Cache hit for segment {segment_id} (age: {age:.0f}s)")
    response = cache_entry.get("response")

    # Add cache metadata to response
    if response:
        response["_from_cache"] = True
        response["_cache_age_seconds"] = age

    return response


def save_to_cache(
    segment_id: str,
    route_id: str,
    response: Dict[str, Any]
) -> bool:
    """Save a response to the cache.

    Args:
        segment_id: Unique segment identifier
        route_id: Route identifier containing the segment
        response: Analysis response to cache

    Returns:
        True if saved successfully, False otherwise
    """
    cache_key = get_cache_key(segment_id, route_id)
    cache_path = _get_cache_file_path(cache_key)

    cache_entry = {
        "segment_id": segment_id,
        "route_id": route_id,
        "_cached_at": time.time(),
        "response": response,
    }

    try:
        with cache_path.open("w", encoding="utf-8") as f:
            json.dump(cache_entry, f, indent=2, default=str)
        logger.debug(f"Cached response for segment {segment_id}")
        return True
    except IOError as e:
        logger.error(f"Cache write error for segment {segment_id}: {e}")
        return False


def clear_cache() -> int:
    """Remove all cached responses.

    Returns:
        Number of cache entries removed
    """
    cache_dir = _ensure_cache_dir()
    count = 0

    for cache_file in cache_dir.glob("*.json"):
        try:
            cache_file.unlink()
            count += 1
        except IOError as e:
            logger.error(f"Failed to remove cache file {cache_file}: {e}")

    logger.info(f"Cleared {count} cache entries")
    return count


def clear_segment_cache(segment_id: str, route_id: str) -> bool:
    """Remove the cache entry for a specific segment.

    Args:
        segment_id: Unique segment identifier
        route_id: Route identifier containing the segment

    Returns:
        True if removed successfully or didn't exist, False on error
    """
    cache_key = get_cache_key(segment_id, route_id)
    cache_path = _get_cache_file_path(cache_key)

    if not cache_path.exists():
        logger.debug(f"No cache entry to clear for segment {segment_id}")
        return True

    try:
        cache_path.unlink()
        logger.debug(f"Cleared cache for segment {segment_id}")
        return True
    except IOError as e:
        logger.error(f"Failed to clear cache for segment {segment_id}: {e}")
        return False


def get_cache_stats() -> Dict[str, Any]:
    """Get statistics about the current cache.

    Returns:
        Dict with cache statistics
    """
    cache_dir = _ensure_cache_dir()
    cache_files = list(cache_dir.glob("*.json"))

    total_size = 0
    oldest = None
    newest = None

    for cache_file in cache_files:
        try:
            stat = cache_file.stat()
            total_size += stat.st_size
            mtime = stat.st_mtime

            if oldest is None or mtime < oldest:
                oldest = mtime
            if newest is None or mtime > newest:
                newest = mtime
        except IOError:
            continue

    now = time.time()

    return {
        "entry_count": len(cache_files),
        "total_size_bytes": total_size,
        "total_size_mb": total_size / (1024 * 1024),
        "oldest_age_seconds": (now - oldest) if oldest else None,
        "newest_age_seconds": (now - newest) if newest else None,
        "cache_dir": str(cache_dir),
    }


def is_cached(segment_id: str, route_id: str, ttl: int = DEFAULT_CACHE_TTL) -> bool:
    """Check if a valid cache entry exists for a segment.

    Args:
        segment_id: Unique segment identifier
        route_id: Route identifier containing the segment
        ttl: Time-to-live in seconds

    Returns:
        True if valid cache entry exists
    """
    return get_cached_response(segment_id, route_id, ttl) is not None
