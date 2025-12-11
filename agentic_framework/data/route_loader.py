"""Route loader for GeoJSON files with caching support."""
import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from config.settings import settings

# Base projects directory
PROJECTS_BASE = Path("/opt/agrs/Projects")


def get_routes_dir(project: Optional[str] = None) -> Path:
    """Get the routes directory for a project.

    Args:
        project: Optional project name. If None, uses default from settings.

    Returns:
        Path to the routes directory
    """
    if project:
        return PROJECTS_BASE / project / "PIRL" / "outputs"
    return settings.ROUTES_DIR


class RouteNotFoundError(Exception):
    """Raised when a requested route file does not exist."""
    def __init__(self, route_id: str, project: Optional[str] = None):
        self.route_id = route_id
        self.project = project
        routes_dir = get_routes_dir(project)
        super().__init__(f"Route '{route_id}' not found at {routes_dir / f'{route_id}.geojson'}")


class InvalidRouteError(Exception):
    """Raised when a route file contains invalid JSON."""
    def __init__(self, route_id: str, original_error: Exception):
        self.route_id = route_id
        self.original_error = original_error
        super().__init__(f"Route '{route_id}' contains invalid JSON: {original_error}")


# Module-level cache for loaded routes
# Key format: "project:route_id" or just "route_id" for default project
_route_cache: Dict[str, Dict[str, Any]] = {}


def _cache_key(route_id: str, project: Optional[str] = None) -> str:
    """Generate cache key for route."""
    if project:
        return f"{project}:{route_id}"
    return route_id


def load_route(route_id: str, project: Optional[str] = None) -> Dict[str, Any]:
    """Load a GeoJSON route file by route ID.

    Args:
        route_id: The route identifier (filename without .geojson extension)
        project: Optional project name for project-specific routes

    Returns:
        The parsed GeoJSON as a dictionary

    Raises:
        RouteNotFoundError: If the route file does not exist
        InvalidRouteError: If the route file contains invalid JSON
    """
    cache_key = _cache_key(route_id, project)

    # Check cache first
    if cache_key in _route_cache:
        return _route_cache[cache_key]

    routes_dir = get_routes_dir(project)
    route_path = routes_dir / f"{route_id}.geojson"

    # Check if file exists
    if not route_path.exists():
        raise RouteNotFoundError(route_id, project)

    try:
        with open(route_path, 'r', encoding='utf-8') as f:
            route_data = json.load(f)
    except json.JSONDecodeError as e:
        raise InvalidRouteError(route_id, e)

    # Store in cache
    _route_cache[cache_key] = route_data

    return route_data


def get_route_ids(project: Optional[str] = None) -> List[str]:
    """Get list of all available route IDs.

    Args:
        project: Optional project name for project-specific routes

    Returns:
        List of route IDs (filenames without .geojson extension)
    """
    routes_dir = get_routes_dir(project)

    if not routes_dir.exists():
        return []

    route_files = routes_dir.glob("*.geojson")
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
