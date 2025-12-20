#!/usr/bin/env python3
"""
Iterative Route Optimizer

This script iterates through different A* distance weights to find
a route that is cheaper than the existing SNAM pipeline.

Target: Beat $88.2M (existing pipeline with detailed cost analysis)
"""

import subprocess
import sys
import json
from pathlib import Path

# Import detailed cost analysis
sys.path.insert(0, str(Path(__file__).parent))
from detailed_cost_analysis import analyze_route_detailed, DETAILED_COSTS

PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
OUTPUT_DIR = Path('/opt/agrs/agentic_framework/data/routes')
EXISTING_PIPELINE = PROJECT_DIR / 'data/vectors/pipelines.gpkg'

# Target: Existing pipeline cost from detailed analysis
TARGET_COST = 88_200_000  # $88.2M


def run_astar(distance_weight, suffix):
    """Run A* generator with given distance weight"""
    print(f"\n{'='*60}")
    print(f"Generating route with distance_weight={distance_weight}")
    print(f"{'='*60}")

    result = subprocess.run(
        ['python3', str(PROJECT_DIR / 'astar_route_generator.py'), str(distance_weight), suffix],
        capture_output=True,
        text=True
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:", result.stderr)

    # Return the output file path
    output_file = OUTPUT_DIR / f'test_project2_astar_saipem{suffix}.geojson'
    if output_file.exists():
        return output_file
    return None


def analyze_route(route_file, route_name):
    """Analyze route using detailed cost model"""
    print(f"\nAnalyzing: {route_name}")

    result = analyze_route_detailed(str(route_file), route_name)

    if result:
        print(f"  Length: {result['length_km']:.2f} km")
        print(f"  Total Cost: ${result['total_cost']:,.0f}")
        print(f"  Cost/km: ${result['cost_per_km']:,.0f}")

    return result


def main():
    print("="*60)
    print("ITERATIVE ROUTE OPTIMIZER")
    print("="*60)
    print(f"Target: Beat existing pipeline at ${TARGET_COST:,.0f}")
    print()

    results = []

    # Try different distance weights
    # Higher weight = shorter routes but potentially more expensive terrain
    # We need to find the sweet spot
    distance_weights = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]

    for dw in distance_weights:
        suffix = f"_dw{dw}"

        # Generate route
        route_file = run_astar(dw, suffix)

        if route_file and route_file.exists():
            # Analyze with detailed cost model
            analysis = analyze_route(route_file, f"A* (dw={dw})")

            if analysis:
                analysis['distance_weight'] = dw
                analysis['file'] = str(route_file)
                results.append(analysis)

                # Check if we beat the target
                if analysis['total_cost'] < TARGET_COST:
                    print(f"\n{'*'*60}")
                    print(f"SUCCESS! Route with dw={dw} beats existing pipeline!")
                    print(f"Total cost: ${analysis['total_cost']:,.0f}")
                    print(f"Savings: ${TARGET_COST - analysis['total_cost']:,.0f}")
                    print(f"{'*'*60}")

    # Summary
    print("\n" + "="*60)
    print("ITERATION SUMMARY")
    print("="*60)
    print(f"\nExisting Pipeline: ${TARGET_COST:,.0f} (38.31 km)")
    print("\nA* Routes Generated:")
    print("-"*60)

    for r in sorted(results, key=lambda x: x['total_cost']):
        status = "WINNER!" if r['total_cost'] < TARGET_COST else ""
        diff = r['total_cost'] - TARGET_COST
        diff_str = f"+${diff:,.0f}" if diff > 0 else f"-${abs(diff):,.0f}"
        print(f"  dw={r['distance_weight']:.1f}: {r['length_km']:.2f}km, ${r['total_cost']:,.0f} ({diff_str}) {status}")

    # Find best
    if results:
        best = min(results, key=lambda x: x['total_cost'])
        print(f"\nBest A* Route: dw={best['distance_weight']}")
        print(f"  Length: {best['length_km']:.2f} km")
        print(f"  Cost: ${best['total_cost']:,.0f}")
        print(f"  Gap to target: ${best['total_cost'] - TARGET_COST:,.0f}")

        if best['total_cost'] >= TARGET_COST:
            print("\nNO ROUTE BEATS EXISTING PIPELINE YET.")
            print("Need to try more approaches...")

    return results


if __name__ == "__main__":
    main()
