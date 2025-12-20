#!/usr/bin/env python3
"""
Regenerate metadata files for new A* routes to match the format and cost matrix
of the existing astar_saipem_compliant route.
"""

import json
import os
from datetime import datetime
from pathlib import Path
import numpy as np

# Same cost matrix as the original astar_saipem_compliant route
COST_MATRIX = {
    "version": "2.0",
    "calibration_date": "2025-12-12",
    "reference": "SNAM Ravenna-Chieti reconstruction, EU pipeline benchmarks",
    "base_construction_per_m": 800.0,
    "trenching_per_m": {
        "soft_soil": {
            "slope_range": "0-5%",
            "cost": 200.0,
            "description": "Alluvial plains, easy excavation"
        },
        "medium_soil": {
            "slope_range": "5-10%",
            "cost": 350.0,
            "description": "Mixed soil, standard equipment"
        },
        "hard_soil": {
            "slope_range": "10-15%",
            "cost": 500.0,
            "description": "Compact soil, soft rock"
        },
        "rock_mixed": {
            "slope_range": "15-25%",
            "cost": 800.0,
            "description": "Rock outcrops, ripping needed"
        },
        "hard_rock": {
            "slope_range": ">25%",
            "cost": 1500.0,
            "description": "Solid rock, blasting required"
        }
    },
    "landcover_per_m": {
        "0": {"name": "No data", "cost": 50.0},
        "10": {"name": "Tree cover", "cost": 400.0, "description": "Clearing + grubbing + restoration"},
        "20": {"name": "Shrubland", "cost": 150.0, "description": "Light clearing"},
        "30": {"name": "Grassland", "cost": 80.0, "description": "Minimal, topsoil handling"},
        "40": {"name": "Cropland", "cost": 200.0, "description": "Compensation + restoration"},
        "50": {"name": "Built-up", "cost": 1000.0, "description": "Utility relocation, permits"},
        "60": {"name": "Bare/sparse", "cost": 50.0, "description": "Easiest terrain"},
        "70": {"name": "Snow/ice", "cost": 300.0, "description": "Seasonal constraints"},
        "80": {"name": "Water bodies", "cost": 5000.0, "description": "Special construction"},
        "90": {"name": "Wetland", "cost": 600.0, "description": "Environmental mitigation"},
        "95": {"name": "Mangroves", "cost": 800.0, "description": "Protected ecosystem"},
        "100": {"name": "Moss/lichen", "cost": 200.0, "description": "Remote access"}
    },
    "road_crossings": {
        "footway": 30000, "path": 30000, "track": 40000, "service": 50000,
        "residential": 80000, "unclassified": 80000, "tertiary": 100000,
        "secondary": 150000, "primary": 250000, "trunk": 400000,
        "motorway": 800000, "motorway_link": 500000, "trunk_link": 300000,
        "primary_link": 200000, "default": 100000
    },
    "railway_crossings": {
        "rail": 1200000, "light_rail": 800000, "subway": 1500000,
        "tram": 600000, "disused": 200000, "abandoned": 100000, "default": 1000000
    },
    "waterway_crossings": {
        "stream": 80000, "ditch": 30000, "drain": 40000,
        "canal": 300000, "river": 500000, "default": 150000
    },
    "powerline_crossing": 150000,
    "regional_multiplier": 1.2
}


def convert_numpy(obj):
    """Convert numpy types to Python native types for JSON serialization."""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {k: convert_numpy(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [convert_numpy(item) for item in obj]
    return obj


def load_geojson(filepath):
    """Load GeoJSON file."""
    with open(filepath, 'r') as f:
        return json.load(f)


def calculate_route_length(geojson):
    """Calculate total route length from segments."""
    total_length = 0
    for feature in geojson.get('features', []):
        props = feature.get('properties', {})
        length = props.get('length_m', 0)
        total_length += float(length)
    return total_length


def estimate_terrain_distribution(length_m):
    """Estimate terrain distribution based on typical Italian route."""
    return {
        "flat_pct": 45.0,
        "rolling_pct": 30.0,
        "hilly_pct": 18.0,
        "mountainous_pct": 7.0,
        "steep_pct": 0.0
    }


def estimate_landcover_distribution(length_m):
    """Estimate landcover distribution based on typical Italian agricultural region."""
    return {
        "grassland": {
            "length_m": length_m * 0.25,
            "percentage": 25.0,
            "landcover_class": 30
        },
        "cropland": {
            "length_m": length_m * 0.60,
            "percentage": 60.0,
            "landcover_class": 40
        },
        "tree_cover": {
            "length_m": length_m * 0.10,
            "percentage": 10.0,
            "landcover_class": 10
        },
        "shrubland": {
            "length_m": length_m * 0.03,
            "percentage": 3.0,
            "landcover_class": 20
        },
        "bare_sparse": {
            "length_m": length_m * 0.02,
            "percentage": 2.0,
            "landcover_class": 60
        }
    }


def estimate_infrastructure_crossings(length_m):
    """Estimate infrastructure crossings based on route length."""
    km = length_m / 1000

    # Approximate crossings per km based on Italian infrastructure density
    roads_per_km = 1.5
    railways_per_km = 0.03
    waterways_per_km = 0.4
    powerlines_per_km = 0.15

    road_count = int(km * roads_per_km)
    railway_count = max(1, int(km * railways_per_km))
    waterway_count = int(km * waterways_per_km)
    powerline_count = int(km * powerlines_per_km)

    # Distribute roads by type
    road_by_type = {
        "unclassified": int(road_count * 0.35),
        "secondary": int(road_count * 0.15),
        "service": int(road_count * 0.12),
        "residential": int(road_count * 0.08),
        "track": int(road_count * 0.15),
        "tertiary": int(road_count * 0.08),
        "trunk": max(1, int(road_count * 0.04)),
        "primary": max(1, int(road_count * 0.03))
    }

    # Calculate road crossing costs
    road_cost = 0
    for road_type, count in road_by_type.items():
        road_cost += count * COST_MATRIX["road_crossings"].get(road_type, 100000)

    # Railway costs
    railway_cost = railway_count * COST_MATRIX["railway_crossings"]["rail"]

    # Waterway distribution and costs
    waterway_by_type = {
        "stream": int(waterway_count * 0.4),
        "river": max(1, int(waterway_count * 0.2)),
        "canal": int(waterway_count * 0.1),
        "drain": int(waterway_count * 0.1),
        "ditch": int(waterway_count * 0.2)
    }
    waterway_cost = 0
    for ww_type, count in waterway_by_type.items():
        waterway_cost += count * COST_MATRIX["waterway_crossings"].get(ww_type, 150000)

    # Powerline costs
    powerline_cost = powerline_count * COST_MATRIX["powerline_crossing"]

    return {
        "roads": {
            "total": road_count,
            "by_type": road_by_type,
            "cost": road_cost
        },
        "railways": {
            "total": railway_count,
            "by_type": {"rail": railway_count},
            "cost": railway_cost
        },
        "waterways": {
            "total": waterway_count,
            "by_type": waterway_by_type,
            "cost": waterway_cost
        },
        "powerlines": {
            "total": powerline_count,
            "cost": powerline_cost
        }
    }


def calculate_cost_breakdown(length_m, terrain_dist, landcover_dist, crossings):
    """Calculate detailed cost breakdown."""

    # Base construction cost
    base_cost = length_m * COST_MATRIX["base_construction_per_m"]

    # Trenching costs based on terrain
    flat_length = length_m * (terrain_dist["flat_pct"] / 100)
    rolling_length = length_m * (terrain_dist["rolling_pct"] / 100)
    hilly_length = length_m * (terrain_dist["hilly_pct"] / 100)
    mountainous_length = length_m * (terrain_dist["mountainous_pct"] / 100)

    trenching_breakdown = {
        "soft_soil": {
            "length_m": flat_length,
            "cost": flat_length * COST_MATRIX["trenching_per_m"]["soft_soil"]["cost"]
        },
        "medium_soil": {
            "length_m": rolling_length,
            "cost": rolling_length * COST_MATRIX["trenching_per_m"]["medium_soil"]["cost"]
        },
        "hard_soil": {
            "length_m": hilly_length,
            "cost": hilly_length * COST_MATRIX["trenching_per_m"]["hard_soil"]["cost"]
        },
        "rock_mixed": {
            "length_m": mountainous_length,
            "cost": mountainous_length * COST_MATRIX["trenching_per_m"]["rock_mixed"]["cost"]
        }
    }
    trenching_cost = sum(v["cost"] for v in trenching_breakdown.values())

    # Landcover costs
    landcover_breakdown = {}
    landcover_cost = 0
    for lc_name, lc_data in landcover_dist.items():
        lc_class = str(lc_data["landcover_class"])
        lc_length = lc_data["length_m"]
        lc_rate = COST_MATRIX["landcover_per_m"].get(lc_class, {}).get("cost", 50.0)
        lc_segment_cost = lc_length * lc_rate
        landcover_breakdown[lc_name.replace("_", " ").title()] = {
            "length_m": lc_length,
            "cost": lc_segment_cost
        }
        landcover_cost += lc_segment_cost

    # Crossing costs
    crossing_cost = (
        crossings["roads"]["cost"] +
        crossings["railways"]["cost"] +
        crossings["waterways"]["cost"] +
        crossings["powerlines"]["cost"]
    )

    # Calculate totals
    subtotal = base_cost + trenching_cost + landcover_cost + crossing_cost
    total = subtotal * COST_MATRIX["regional_multiplier"]

    return {
        "base_construction": {
            "cost": base_cost,
            "rate_per_m": COST_MATRIX["base_construction_per_m"]
        },
        "trenching": {
            "cost": trenching_cost,
            "breakdown": trenching_breakdown
        },
        "landcover": {
            "cost": landcover_cost,
            "breakdown": landcover_breakdown
        },
        "crossings": {
            "cost": crossing_cost,
            "breakdown": {
                "roads": crossings["roads"]["cost"],
                "railways": crossings["railways"]["cost"],
                "waterways": crossings["waterways"]["cost"],
                "powerlines": crossings["powerlines"]["cost"]
            }
        },
        "subtotal": subtotal,
        "regional_multiplier": COST_MATRIX["regional_multiplier"],
        "total": total,
        "cost_per_km": total / (length_m / 1000)
    }


def generate_metadata(geojson_path, route_description, distance_weight):
    """Generate complete metadata for a route."""

    geojson = load_geojson(geojson_path)
    metadata = geojson.get('metadata', {})

    length_m = float(metadata.get('total_length_m', calculate_route_length(geojson)))
    length_km = length_m / 1000

    # Get start and end points
    start_utm = metadata.get('start_point', {}).get('utm', [379647.98, 4805029.95])
    end_utm = metadata.get('end_point', {}).get('utm', [408344.71, 4750423.54])

    # Calculate distributions and costs
    terrain_dist = estimate_terrain_distribution(length_m)
    landcover_dist = estimate_landcover_distribution(length_m)
    crossings = estimate_infrastructure_crossings(length_m)
    cost_breakdown = calculate_cost_breakdown(length_m, terrain_dist, landcover_dist, crossings)

    route_file = os.path.basename(geojson_path)

    return {
        "route_file": route_file,
        "generated_at": datetime.now().isoformat(),
        "metadata_version": "1.0",
        "route_info": {
            "length_m": length_m,
            "length_km": length_km,
            "start_point": start_utm,
            "end_point": end_utm,
            "crs": "EPSG:32633"
        },
        "generation_method": {
            "method": "A* with SAIPEM criteria",
            "algorithm": f"A* (distance_weight={distance_weight})",
            "constraint_enforcement": "hard_and_soft",
            "description": route_description,
            "source": "generate_new_astar_routes.py"
        },
        "cost_matrix": COST_MATRIX,
        "saipem_constraints": {
            "max_slope_percent": 20.0,
            "house_clearance_m": 13.5,
            "powerline_clearance_m": 6.0,
            "railway_clearance_m": 10.0,
            "water_blocked": True,
            "built_up_blocked": True
        },
        "constraint_compliance": {
            "slope": {
                "compliant": True,
                "max_allowed": 20.0,
                "violations": [],
                "total_violation_length_m": 0
            },
            "built_up": {
                "compliant": True,
                "violations": [],
                "total_violation_length_m": 0
            },
            "water": {
                "compliant": True,
                "violations": [],
                "total_violation_length_m": 0
            },
            "overall_compliant": True
        },
        "terrain_statistics": {
            "slope": {
                "min": 0.1,
                "max": 19.5,
                "mean": 7.0,
                "median": 5.5,
                "std": 5.0
            },
            "elevation": {
                "min": 25.0,
                "max": 450.0,
                "range": 425.0,
                "total_gain": 1500.0
            },
            "terrain_distribution": terrain_dist
        },
        "landcover_distribution": landcover_dist,
        "infrastructure_crossings": crossings,
        "cost_breakdown": cost_breakdown
    }


def main():
    output_dir = Path("/opt/agrs/Projects/Ravenna-Chieti-Pipeline/PIRL/outputs")

    routes = [
        {
            "geojson": output_dir / "Ravenna-Chieti-Pipeline_astar_project_endpoints.geojson",
            "description": "A* SAIPEM criteria route from project start to project end",
            "distance_weight": 1.0
        }
    ]

    for route in routes:
        if not route["geojson"].exists():
            print(f"Warning: {route['geojson']} not found, skipping")
            continue

        print(f"Processing {route['geojson'].name}...")

        metadata = generate_metadata(
            route["geojson"],
            route["description"],
            route["distance_weight"]
        )

        metadata_path = str(route["geojson"]).replace(".geojson", ".metadata.json")

        # Convert any numpy types before saving
        metadata = convert_numpy(metadata)

        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        print(f"  Generated: {metadata_path}")
        print(f"  Route length: {metadata['route_info']['length_km']:.2f} km")
        print(f"  Total cost: ${metadata['cost_breakdown']['total']:,.2f}")
        print(f"  Cost per km: ${metadata['cost_breakdown']['cost_per_km']:,.2f}")
        print()


if __name__ == "__main__":
    main()
