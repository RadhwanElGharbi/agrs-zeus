#!/usr/bin/env python3
"""
OPEX (Operating Expenses) Comparison for Pipeline Routes

Compares ongoing operational costs between existing pipeline and A* generated route.
OPEX factors include:
- Maintenance (routine inspections, repairs, ROW maintenance)
- Pigging/inspection runs
- Compression/pumping energy costs
- Leak detection and monitoring
- Terrain difficulty impact on maintenance access
- Crossing maintenance (special inspection requirements)
- Insurance and risk costs
"""

import numpy as np
import json
from pathlib import Path

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')

# ==============================================================================
# OPEX COST MATRIX - Based on Industry Data
# ==============================================================================
# Sources: INGAA Foundation, PHMSA data, European gas transmission operators
#
# Natural gas transmission pipeline OPEX typically ranges:
# - US average: $3,000 - $8,000 per km per year
# - EU average: €4,000 - €10,000 per km per year (~$4,400 - $11,000)
# - Difficult terrain can increase by 50-200%
# ==============================================================================

OPEX_MATRIX = {
    # Base OPEX per km per year (26" gas transmission pipeline)
    'base_opex_per_km_year': 6000.0,  # $6,000/km/year baseline

    # Terrain difficulty multipliers (harder terrain = more maintenance)
    'terrain_multipliers': {
        'flat': 1.0,        # Standard access, easy maintenance
        'rolling': 1.15,    # Slightly harder access
        'hilly': 1.35,      # Difficult access, erosion control
        'mountainous': 1.6, # Very difficult access, landslide risk
        'extreme': 2.0,     # Specialized equipment needed
    },

    # Landcover impact on ROW maintenance
    'landcover_multipliers': {
        0: 1.0,       # No data
        10: 1.4,      # Tree cover - vegetation management
        20: 1.2,      # Shrubland - moderate clearing
        30: 1.0,      # Grassland - easy maintenance
        40: 1.1,      # Cropland - coordination with farmers
        50: 1.5,      # Built-up - urban access issues
        60: 0.9,      # Bare/sparse - easiest maintenance
        70: 1.3,      # Snow/ice - seasonal access
        80: 1.8,      # Water bodies - special monitoring
        90: 1.5,      # Wetland - environmental monitoring
        95: 1.6,      # Mangroves - protected area compliance
        100: 1.2,     # Moss/lichen - remote access
    },

    # Crossing maintenance costs (annual per crossing)
    # Crossings require special inspections, permits, coordination
    'crossing_annual_costs': {
        'road': 2500.0,       # Traffic control, pavement monitoring
        'railway': 8000.0,    # Railroad coordination, special inspections
        'powerline': 3000.0,  # Clearance monitoring, coordination
        'waterway': 5000.0,   # Scour monitoring, environmental compliance
    },

    # Compression/pumping costs (energy for gas flow)
    # Longer pipelines need more compression energy
    'compression_cost_per_km_year': 1500.0,  # $1,500/km/year for energy

    # Elevation gain impact (more compression needed for uphill flow)
    'elevation_gain_cost_per_m_year': 50.0,  # $50 per meter of elevation gain

    # Pigging/inspection costs (smart pig runs)
    # Typically every 5-7 years, ~$1000-2000/km per run
    'pigging_cost_per_km_year': 250.0,  # Amortized annual cost

    # Insurance and risk (longer pipeline = more exposure)
    'insurance_per_km_year': 800.0,  # $800/km/year

    # Geohazard monitoring costs
    'geohazard_monitoring': {
        0: 0.0,       # No data
        1: 0.0,       # Low risk - standard monitoring
        2: 500.0,     # Medium risk - enhanced monitoring
        3: 1500.0,    # High risk - frequent inspections
        4: 3000.0,    # Very high risk - continuous monitoring
    },

    # Analysis period for NPV calculation
    'analysis_years': 30,
    'discount_rate': 0.05,  # 5% discount rate
}


def calculate_opex(route_name, length_km, terrain_breakdown, landcover_breakdown,
                   crossings, elevation_gain, geohazard_breakdown):
    """Calculate annual OPEX for a pipeline route."""

    print(f"\n{'='*70}")
    print(f"OPEX ANALYSIS: {route_name}")
    print(f"{'='*70}")
    print(f"Route Length: {length_km:.2f} km")

    # 1. Base maintenance OPEX
    base_opex = OPEX_MATRIX['base_opex_per_km_year'] * length_km
    print(f"\n1. BASE MAINTENANCE")
    print(f"   Rate: ${OPEX_MATRIX['base_opex_per_km_year']:,.0f}/km/year")
    print(f"   Annual: ${base_opex:,.0f}")

    # 2. Terrain difficulty adjustment
    terrain_weighted_opex = 0
    print(f"\n2. TERRAIN DIFFICULTY ADJUSTMENT")
    print(f"   {'Category':<15} {'Multiplier':>10} {'Distance (km)':>15} {'Weighted OPEX':>15}")
    print(f"   {'-'*55}")

    for cat, data in terrain_breakdown.items():
        dist_km = data['distance'] / 1000
        mult = OPEX_MATRIX['terrain_multipliers'].get(cat, 1.0)
        weighted = OPEX_MATRIX['base_opex_per_km_year'] * dist_km * mult
        terrain_weighted_opex += weighted
        print(f"   {cat:<15} {mult:>10.2f}x {dist_km:>15.2f} ${weighted:>14,.0f}")

    terrain_adjustment = terrain_weighted_opex - base_opex
    print(f"   {'ADJUSTMENT':<15} {'':<10} {'':<15} ${terrain_adjustment:>+14,.0f}")

    # 3. Landcover ROW maintenance adjustment
    landcover_weighted_opex = 0
    print(f"\n3. LANDCOVER ROW MAINTENANCE ADJUSTMENT")

    lc_names = {
        0: 'No data', 10: 'Tree cover', 20: 'Shrubland', 30: 'Grassland',
        40: 'Cropland', 50: 'Built-up', 60: 'Bare/sparse', 70: 'Snow/ice',
        80: 'Water bodies', 90: 'Wetland', 95: 'Mangroves', 100: 'Moss/lichen'
    }

    for lc_code, data in landcover_breakdown.items():
        dist_km = data['distance'] / 1000
        mult = OPEX_MATRIX['landcover_multipliers'].get(lc_code, 1.0)
        # Apply multiplier to base rate for this segment
        weighted = OPEX_MATRIX['base_opex_per_km_year'] * dist_km * (mult - 1.0)  # Just the adder
        landcover_weighted_opex += weighted

    print(f"   Additional ROW maintenance: ${landcover_weighted_opex:,.0f}/year")

    # 4. Crossing maintenance
    crossing_opex = 0
    print(f"\n4. CROSSING MAINTENANCE")
    print(f"   {'Type':<20} {'Count':>10} {'Cost/Year':>15} {'Total':>15}")
    print(f"   {'-'*60}")

    crossing_types = [
        ('Road', 'road', crossings.get('road', 0)),
        ('Railway', 'railway', crossings.get('railway', 0)),
        ('Powerline', 'powerline', crossings.get('powerline', 0)),
        ('Waterway', 'waterway', crossings.get('waterway', 0)),
    ]

    for name, key, count in crossing_types:
        cost = OPEX_MATRIX['crossing_annual_costs'][key]
        total = cost * count
        crossing_opex += total
        print(f"   {name:<20} {count:>10} ${cost:>14,.0f} ${total:>14,.0f}")

    print(f"   {'TOTAL':<20} {sum(crossings.values()):>10} {'':<15} ${crossing_opex:>14,.0f}")

    # 5. Compression/pumping energy
    compression_opex = OPEX_MATRIX['compression_cost_per_km_year'] * length_km
    elevation_opex = OPEX_MATRIX['elevation_gain_cost_per_m_year'] * elevation_gain
    energy_opex = compression_opex + elevation_opex

    print(f"\n5. COMPRESSION/PUMPING ENERGY")
    print(f"   Distance-based: ${compression_opex:,.0f}/year")
    print(f"   Elevation gain ({elevation_gain:.0f}m): ${elevation_opex:,.0f}/year")
    print(f"   Total energy: ${energy_opex:,.0f}/year")

    # 6. Pigging/inspection
    pigging_opex = OPEX_MATRIX['pigging_cost_per_km_year'] * length_km
    print(f"\n6. PIGGING/INSPECTION")
    print(f"   Annual (amortized): ${pigging_opex:,.0f}/year")

    # 7. Insurance
    insurance_opex = OPEX_MATRIX['insurance_per_km_year'] * length_km
    print(f"\n7. INSURANCE")
    print(f"   Annual premium: ${insurance_opex:,.0f}/year")

    # 8. Geohazard monitoring
    geohazard_opex = 0
    for gh_code, data in geohazard_breakdown.items():
        dist_km = data['distance'] / 1000
        cost = OPEX_MATRIX['geohazard_monitoring'].get(gh_code, 0)
        geohazard_opex += cost * dist_km

    print(f"\n8. GEOHAZARD MONITORING")
    print(f"   Annual monitoring: ${geohazard_opex:,.0f}/year")

    # Total annual OPEX
    total_annual_opex = (
        base_opex +
        terrain_adjustment +
        landcover_weighted_opex +
        crossing_opex +
        energy_opex +
        pigging_opex +
        insurance_opex +
        geohazard_opex
    )

    opex_per_km = total_annual_opex / length_km

    print(f"\n{'='*70}")
    print(f"ANNUAL OPEX SUMMARY")
    print(f"{'='*70}")
    print(f"   Base maintenance:           ${base_opex:>14,.0f}")
    print(f"   Terrain adjustment:         ${terrain_adjustment:>+14,.0f}")
    print(f"   Landcover ROW maintenance:  ${landcover_weighted_opex:>+14,.0f}")
    print(f"   Crossing maintenance:       ${crossing_opex:>14,.0f}")
    print(f"   Compression/energy:         ${energy_opex:>14,.0f}")
    print(f"   Pigging/inspection:         ${pigging_opex:>14,.0f}")
    print(f"   Insurance:                  ${insurance_opex:>14,.0f}")
    print(f"   Geohazard monitoring:       ${geohazard_opex:>14,.0f}")
    print(f"   {'-'*50}")
    print(f"   TOTAL ANNUAL OPEX:          ${total_annual_opex:>14,.0f}")
    print(f"   OPEX per km:                ${opex_per_km:>14,.0f}")

    # NPV of OPEX over analysis period
    years = OPEX_MATRIX['analysis_years']
    rate = OPEX_MATRIX['discount_rate']

    # NPV = Annual × [(1 - (1+r)^-n) / r]
    npv_factor = (1 - (1 + rate) ** -years) / rate
    npv_opex = total_annual_opex * npv_factor

    print(f"\n   NPV of OPEX ({years} years @ {rate*100:.0f}%): ${npv_opex:>14,.0f}")

    return {
        'annual_opex': total_annual_opex,
        'opex_per_km': opex_per_km,
        'npv_opex': npv_opex,
        'breakdown': {
            'base': base_opex,
            'terrain_adjustment': terrain_adjustment,
            'landcover': landcover_weighted_opex,
            'crossings': crossing_opex,
            'energy': energy_opex,
            'pigging': pigging_opex,
            'insurance': insurance_opex,
            'geohazard': geohazard_opex,
        }
    }


def main():
    print("=" * 70)
    print("PIPELINE OPEX COMPARISON")
    print("Existing Pipeline vs A* Generated Route")
    print("=" * 70)

    # Data from the CAPEX comparison (compare_routes.py output)
    # Existing Pipeline (38.31 km)
    existing = {
        'length_km': 38.31,
        'terrain_breakdown': {
            'flat': {'distance': 23530},
            'rolling': {'distance': 9920},
            'hilly': {'distance': 3210},
            'mountainous': {'distance': 750},
            'extreme': {'distance': 560},
        },
        'landcover_breakdown': {
            40: {'distance': 27160},  # Cropland
            10: {'distance': 3340},   # Tree cover
            50: {'distance': 580},    # Built-up
            80: {'distance': 50},     # Water bodies
            30: {'distance': 6190},   # Grassland
            20: {'distance': 660},    # Shrubland
        },
        'crossings': {
            'road': 70,
            'railway': 1,
            'powerline': 10,
            'waterway': 23,
        },
        'elevation_gain': 1369,
        'geohazard_breakdown': {
            0: {'distance': 37970},
        },
        'capex': 112230542,
    }

    # A* Generated Route (64.15 km truncated)
    astar = {
        'length_km': 64.15,
        'terrain_breakdown': {
            'flat': {'distance': 36500},
            'rolling': {'distance': 21070},
            'hilly': {'distance': 4000},
            'mountainous': {'distance': 960},
            'extreme': {'distance': 440},
        },
        'landcover_breakdown': {
            40: {'distance': 33010},  # Cropland
            10: {'distance': 15850},  # Tree cover
            50: {'distance': 730},    # Built-up
            30: {'distance': 11180},  # Grassland
            20: {'distance': 1860},   # Shrubland
            60: {'distance': 350},    # Bare/sparse
        },
        'crossings': {
            'road': 63,
            'railway': 1,
            'powerline': 7,
            'waterway': 19,
        },
        'elevation_gain': 1934,
        'geohazard_breakdown': {
            0: {'distance': 62980},
        },
        'capex': 169772184,
    }

    # Calculate OPEX for both routes
    existing_opex = calculate_opex(
        "EXISTING PIPELINE",
        existing['length_km'],
        existing['terrain_breakdown'],
        existing['landcover_breakdown'],
        existing['crossings'],
        existing['elevation_gain'],
        existing['geohazard_breakdown']
    )

    astar_opex = calculate_opex(
        "A* GENERATED ROUTE",
        astar['length_km'],
        astar['terrain_breakdown'],
        astar['landcover_breakdown'],
        astar['crossings'],
        astar['elevation_gain'],
        astar['geohazard_breakdown']
    )

    # Comparison summary
    print(f"\n{'='*70}")
    print("OPEX COMPARISON SUMMARY")
    print(f"{'='*70}")

    print(f"\n{'Metric':<35} {'Existing':>18} {'A* Route':>18}")
    print("-" * 75)
    print(f"{'Route Length (km)':<35} {existing['length_km']:>18.2f} {astar['length_km']:>18.2f}")
    print(f"{'Annual OPEX ($)':<35} {existing_opex['annual_opex']:>18,.0f} {astar_opex['annual_opex']:>18,.0f}")
    print(f"{'OPEX per km ($/km/year)':<35} {existing_opex['opex_per_km']:>18,.0f} {astar_opex['opex_per_km']:>18,.0f}")
    print(f"{'NPV of OPEX (30 years, $)':<35} {existing_opex['npv_opex']:>18,.0f} {astar_opex['npv_opex']:>18,.0f}")

    # CAPEX + OPEX Total Cost of Ownership
    print(f"\n{'='*70}")
    print("TOTAL COST OF OWNERSHIP (CAPEX + 30-Year NPV OPEX)")
    print(f"{'='*70}")

    existing_tco = existing['capex'] + existing_opex['npv_opex']
    astar_tco = astar['capex'] + astar_opex['npv_opex']

    print(f"\n{'Component':<35} {'Existing':>18} {'A* Route':>18}")
    print("-" * 75)
    print(f"{'CAPEX ($)':<35} {existing['capex']:>18,.0f} {astar['capex']:>18,.0f}")
    print(f"{'NPV OPEX (30 years, $)':<35} {existing_opex['npv_opex']:>18,.0f} {astar_opex['npv_opex']:>18,.0f}")
    print(f"{'-'*75}")
    print(f"{'TOTAL COST OF OWNERSHIP ($)':<35} {existing_tco:>18,.0f} {astar_tco:>18,.0f}")

    # Differences
    annual_opex_diff = astar_opex['annual_opex'] - existing_opex['annual_opex']
    npv_opex_diff = astar_opex['npv_opex'] - existing_opex['npv_opex']
    tco_diff = astar_tco - existing_tco
    capex_diff = astar['capex'] - existing['capex']

    print(f"\n{'='*70}")
    print("FINAL ANALYSIS")
    print(f"{'='*70}")

    print(f"\n  CAPEX Difference:        ${capex_diff:>+15,.0f} (A* is {'more' if capex_diff > 0 else 'less'} expensive)")
    print(f"  Annual OPEX Difference:  ${annual_opex_diff:>+15,.0f}/year")
    print(f"  NPV OPEX Difference:     ${npv_opex_diff:>+15,.0f} (30 years)")
    print(f"  TCO Difference:          ${tco_diff:>+15,.0f}")

    if tco_diff < 0:
        print(f"\n  >>> A* ROUTE HAS LOWER TOTAL COST OF OWNERSHIP BY ${-tco_diff:,.0f}")
        payback = capex_diff / (-annual_opex_diff) if annual_opex_diff < 0 else float('inf')
        if payback < 100:
            print(f"  >>> CAPEX premium pays back in {payback:.1f} years through OPEX savings")
    else:
        print(f"\n  >>> EXISTING PIPELINE HAS LOWER TCO BY ${tco_diff:,.0f}")

    # Per-km efficiency comparison
    print(f"\n  OPEX Efficiency:")
    print(f"    Existing: ${existing_opex['opex_per_km']:,.0f}/km/year")
    print(f"    A* Route: ${astar_opex['opex_per_km']:,.0f}/km/year")
    opex_efficiency_diff = existing_opex['opex_per_km'] - astar_opex['opex_per_km']
    if opex_efficiency_diff > 0:
        print(f"    A* is ${opex_efficiency_diff:,.0f}/km/year MORE EFFICIENT ({opex_efficiency_diff/existing_opex['opex_per_km']*100:.1f}%)")
    else:
        print(f"    Existing is ${-opex_efficiency_diff:,.0f}/km/year MORE EFFICIENT")


if __name__ == '__main__':
    main()
