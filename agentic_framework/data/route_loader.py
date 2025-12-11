"""Route loader for GeoJSON files with caching support."""
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from config.settings import settings


class RouteNotFoundError(Exception):
    """Raised when a requested route file does not exist."""
    def __init__(self, route_id: str):
        self.route_id = route_id
        super().__init__(f"Route '{route_id}' not found at {settings.ROUTES_DIR / f'{route_id}.geojson'}")


class InvalidRouteError(Exception):
    """Raised when a route file contains invalid JSON."""
    def __init__(self, route_id: str, original_error: Exception):
        self.route_id = route_id
        self.original_error = original_error
        super().__init__(f"Route '{route_id}' contains invalid JSON: {original_error}")


# Module-level cache for loaded routes
_route_cache: Dict[str, Dict[str, Any]] = {}


def load_route(route_id: str) -> Dict[str, Any]:
    """Load a GeoJSON route file by route ID.

    Args:
        route_id: The route identifier (filename without .geojson extension)

    Returns:
        The parsed GeoJSON as a dictionary

    Raises:
        RouteNotFoundError: If the route file does not exist
        InvalidRouteError: If the route file contains invalid JSON
    """
    # Check cache first
    if route_id in _route_cache:
        return _route_cache[route_id]

    route_path = settings.ROUTES_DIR / f"{route_id}.geojson"

    # Check if file exists
    if not route_path.exists():
        raise RouteNotFoundError(route_id)

    try:
        with open(route_path, 'r', encoding='utf-8') as f:
            route_data = json.load(f)
    except json.JSONDecodeError as e:
        raise InvalidRouteError(route_id, e)

    # Store in cache
    _route_cache[route_id] = route_data

    return route_data


def get_route_ids() -> List[str]:
    """Get list of all available route IDs.

    Returns:
        List of route IDs (filenames without .geojson extension)
    """
    if not settings.ROUTES_DIR.exists():
        return []

    route_files = settings.ROUTES_DIR.glob("*.geojson")
    return [f.stem for f in route_files]


def clear_cache() -> None:
    """Clear the route cache."""
    global _route_cache
    _route_cache = {}


def get_cached_route_ids() -> List[str]:
    """Get list of currently cached route IDs.

    Returns:
        List of route IDs currently in cache
    """
    return list(_route_cache.keys())
