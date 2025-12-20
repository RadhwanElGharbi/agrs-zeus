#!/usr/bin/env python3
"""
Hydraulic Analysis and Compression Station Comparison for Pipeline Routes

Calculates:
1. Pressure drop along route using Panhandle B equation (industry standard for gas)
2. Elevation-induced pressure changes (hydrostatic head)
3. Required compression stations based on minimum delivery pressure
4. CAPEX for compression stations
5. OPEX for compression (energy costs)
6. Total Cost of Ownership comparison

Reference equations:
- Panhandle B: Q = 737 * E * (Tb/Pb)^1.02 * D^2.53 * [(P1^2 - P2^2) / (G * Tf * L * Z)]^0.51
- Hydrostatic head: ΔP = ρ * g * Δh (adjusted for gas compressibility)
"""

import numpy as np
import json
import geopandas as gpd
from shapely.geometry import LineString
from shapely.ops import linemerge
from pathlib import Path
import rasterio
import warnings
warnings.filterwarnings('ignore')

# Project paths
PROJECT_DIR = Path('/opt/agrs/Projects/test_project2')
RASTER_DIR = PROJECT_DIR / 'data/rasters/processed'
ASTAR_ROUTE = Path('/opt/agrs/agentic_framework/data/routes/test_project2_astar_saipem.geojson')

# Load pipeline specs
with open(PROJECT_DIR / 'pipeline_specs.json') as f:
    SPECS = json.load(f)

# Physical constants
R = 8314.0  # Universal gas constant J/(kmol·K)
g = 9.81    # Gravitational acceleration m/s²

# Pipeline parameters from specs
PIPE_DIAMETER_MM = SPECS['diameter_mm']  # 660.4 mm (26")
PIPE_DIAMETER_M = PIPE_DIAMETER_MM / 1000
PIPE_DIAMETER_IN = PIPE_DIAMETER_MM / 25.4  # Convert to inches for Panhandle

HYDRAULICS = SPECS['hydraulics']
INLET_PRESSURE_BAR = HYDRAULICS['initial_pressure_bar']  # 70 bar
MIN_DELIVERY_PRESSURE_BAR = HYDRAULICS['min_delivery_pressure_bar']  # 45 bar
MAX_PRESSURE_BAR = HYDRAULICS['max_operating_pressure_bar']  # 75 bar
FLOW_RATE_M3_S = HYDRAULICS['volumetric_flow_rate_m3_s']  # 1.0 m³/s at STP
TEMP_K = HYDRAULICS['operating_temperature_k']  # 288.15 K (15°C)
GAS_SG = HYDRAULICS['gas_specific_gravity']  # 0.58 (natural gas)
GAS_MW = HYDRAULICS['gas_molecular_weight_kg_kmol']  # 16.8 kg/kmol
PIPE_ROUGHNESS_MM = HYDRAULICS['pipe_roughness_mm']  # 0.045 mm

# Compressor economics
COMPRESSOR_CAPEX_PER_KW = HYDRAULICS['compressor_capex_per_kw_usd']  # $5,000/kW
COMPRESSOR_OPEX_FRACTION = HYDRAULICS['compressor_opex_fraction']  # 3% of CAPEX annually
ENERGY_COST_PER_KWH = HYDRAULICS['energy_cost_usd_per_kwh']  # $0.05/kWh

# Additional compressor parameters
COMPRESSOR_EFFICIENCY = 0.85  # Typical centrifugal compressor efficiency
COMPRESSOR_AVAILABILITY = 0.95  # 95% uptime
HOURS_PER_YEAR = 8760


def calculate_z_factor(pressure_bar, temp_k, sg):
    """
    Calculate gas compressibility factor (Z) using Standing-Katz correlation approximation.
    For natural gas at typical pipeline conditions, Z ≈ 0.85-0.95
    """
    # Pseudo-critical properties for natural gas
    Tpc = 170.5 + 307.3 * sg  # K
    Ppc = 709.6 - 58.7 * sg   # psia

    # Reduced properties
    Tr = temp_k / Tpc
    Pr = (pressure_bar * 14.504) / Ppc  # Convert bar to psia

    # Simplified correlation (valid for Tr > 1.0, Pr < 10)
    Z = 1 - (3.52 * Pr / (10 ** (0.9813 * Tr))) + (0.274 * Pr**2 / (10 ** (0.8157 * Tr)))
    Z = max(0.7, min(1.0, Z))  # Clamp to reasonable range

    return Z


def calculate_gas_density(pressure_bar, temp_k, mw, z):
    """Calculate gas density using real gas equation: ρ = PM/(ZRT)"""
    pressure_pa = pressure_bar * 100000
    rho = (pressure_pa * mw) / (z * R * temp_k)
    return rho


def calculate_friction_pressure_drop(length_km, diameter_mm, flow_m3_s, inlet_pressure_bar,
                                      sg, temp_k, z):
    """
    Calculate friction pressure drop using the General Flow Equation.

    Uses Darcy-Weisbach with Colebrook friction factor for gas pipelines.

    ΔP = (f * L * ρ * v²) / (2 * D)

    For compressible gas flow, we use average density along the segment.

    Parameters:
    - length_km: Segment length in km
    - diameter_mm: Inside diameter in mm
    - flow_m3_s: Volumetric flow rate at standard conditions (m³/s)
    - inlet_pressure_bar: Inlet pressure in bar
    - sg: Gas specific gravity (air = 1.0)
    - temp_k: Temperature in Kelvin
    - z: Compressibility factor

    Returns pressure drop in bar
    """
    # Convert units
    length_m = length_km * 1000
    diameter_m = diameter_mm / 1000

    # Gas properties
    # Density at pipeline conditions: ρ = P * MW / (Z * R * T)
    mw = sg * 28.97  # Molecular weight (air MW = 28.97)
    inlet_pressure_pa = inlet_pressure_bar * 100000
    rho = (inlet_pressure_pa * mw) / (z * 8314 * temp_k)  # kg/m³

    # Actual volumetric flow at pipeline conditions
    # Q_actual = Q_std * (P_std/P_actual) * (T_actual/T_std) * Z
    P_std = 101325  # Pa
    T_std = 288.15  # K
    Q_actual = flow_m3_s * (P_std / inlet_pressure_pa) * (temp_k / T_std) * z

    # Flow velocity
    area = np.pi * (diameter_m / 2) ** 2
    velocity = Q_actual / area  # m/s

    # Reynolds number
    # Dynamic viscosity of natural gas ≈ 1.1e-5 Pa·s at pipeline conditions
    mu = 1.1e-5
    Re = (rho * velocity * diameter_m) / mu

    # Friction factor using Colebrook-White (approximation for turbulent flow)
    # For smooth pipes (gas pipelines typically have ε/D ≈ 0.00007)
    epsilon = PIPE_ROUGHNESS_MM / 1000  # Convert to meters
    relative_roughness = epsilon / diameter_m

    # Swamee-Jain approximation of Colebrook equation (valid for turbulent flow)
    if Re > 4000:
        f = 0.25 / (np.log10(relative_roughness/3.7 + 5.74/Re**0.9))**2
    else:
        f = 64 / Re  # Laminar flow

    # Darcy-Weisbach pressure drop
    delta_p_pa = (f * length_m * rho * velocity**2) / (2 * diameter_m)
    delta_p_bar = delta_p_pa / 100000

    return delta_p_bar


def panhandle_b_pressure_drop(length_km, diameter_in, flow_mmscfd, inlet_pressure_psia,
                               sg, temp_r, z, efficiency=0.92):
    """
    Wrapper that uses the more accurate General Flow Equation.
    Kept for API compatibility.
    """
    # Convert to SI units and call the main function
    diameter_mm = diameter_in * 25.4
    inlet_pressure_bar = inlet_pressure_psia / 14.504
    temp_k = temp_r / 1.8

    # Convert MMSCFD to m³/s at standard conditions
    # 1 MMSCFD = 1e6 SCF/day = 1e6 * 0.0283168 m³/day = 28316.8 m³/day
    # = 28316.8 / 86400 m³/s = 0.3277 m³/s per MMSCFD
    flow_m3_s = flow_mmscfd * 0.3277

    delta_p_bar = calculate_friction_pressure_drop(
        length_km, diameter_mm, flow_m3_s, inlet_pressure_bar, sg, temp_k, z
    )

    outlet_pressure_bar = inlet_pressure_bar - delta_p_bar
    outlet_pressure_psia = outlet_pressure_bar * 14.504

    return max(0, outlet_pressure_psia)


def flow_m3s_to_mmscfd(flow_m3_s):
    """Convert volumetric flow rate from m³/s to MMSCFD (million standard cubic feet per day)"""
    # 1 m³ = 35.3147 ft³
    # 1 day = 86400 seconds
    ft3_per_day = flow_m3_s * 35.3147 * 86400
    mmscfd = ft3_per_day / 1e6
    return mmscfd


def calculate_hydrostatic_pressure_change(elevation_change_m, avg_pressure_bar, temp_k, sg):
    """
    Calculate pressure change due to elevation using gas column weight.

    For gas: ΔP = (ρ * g * Δh) / 1000  [bar]

    Gas density varies with pressure, so we use average pressure.
    """
    z = calculate_z_factor(avg_pressure_bar, temp_k, sg)
    mw = GAS_MW

    # Average gas density at pipeline conditions
    rho = calculate_gas_density(avg_pressure_bar, temp_k, mw, z)

    # Pressure change (positive for downhill, negative for uphill)
    # Negative elevation_change (going down) = pressure increase
    delta_p_pa = rho * g * (-elevation_change_m)
    delta_p_bar = delta_p_pa / 100000

    return delta_p_bar


def calculate_compressor_power(inlet_pressure_bar, outlet_pressure_bar, flow_m3_s, temp_k, sg, efficiency=0.85):
    """
    Calculate compressor power using isentropic compression.

    W = (k/(k-1)) * Z * R * T * [(P2/P1)^((k-1)/k) - 1] * (mass_flow / MW) / efficiency

    For natural gas, k (specific heat ratio) ≈ 1.3
    """
    k = 1.3  # Specific heat ratio for natural gas
    z = calculate_z_factor((inlet_pressure_bar + outlet_pressure_bar) / 2, temp_k, sg)

    # Mass flow rate
    rho_inlet = calculate_gas_density(inlet_pressure_bar, temp_k, GAS_MW, z)
    mass_flow = flow_m3_s * rho_inlet  # kg/s

    # Pressure ratio
    pr = outlet_pressure_bar / inlet_pressure_bar

    if pr <= 1:
        return 0  # No compression needed

    # Isentropic work
    work = (k / (k - 1)) * z * R * temp_k * (pr ** ((k - 1) / k) - 1) * (mass_flow / GAS_MW)

    # Actual power with efficiency
    power_kw = work / (efficiency * 1000)

    return power_kw


def get_elevation_profile(geometry, dem_path):
    """Extract elevation profile along a route geometry"""
    with rasterio.open(dem_path) as src:
        dem = src.read(1)
        transform = src.transform

        if geometry.geom_type == 'MultiLineString':
            geometry = linemerge(geometry)

        if geometry.geom_type == 'MultiLineString':
            geometries = list(geometry.geoms)
        else:
            geometries = [geometry]

        elevations = []
        distances = []
        cumulative_dist = 0

        for geom_part in geometries:
            coords = list(geom_part.coords)
            for i, coord in enumerate(coords):
                x, y = coord[0], coord[1]  # Handle 2D or 3D coordinates
                # Get pixel coordinates
                col = int((x - transform[2]) / transform[0])
                row = int((y - transform[5]) / transform[4])

                if 0 <= row < dem.shape[0] and 0 <= col < dem.shape[1]:
                    elev = dem[row, col]
                    elevations.append(elev)
                    distances.append(cumulative_dist)

                if i > 0:
                    prev_x, prev_y = coords[i-1][0], coords[i-1][1]
                    segment_dist = np.sqrt((x - prev_x)**2 + (y - prev_y)**2)
                    cumulative_dist += segment_dist

    return np.array(distances), np.array(elevations)


def analyze_route_hydraulics(name, geometry, dem_path, truncate_y=None):
    """
    Perform full hydraulic analysis on a pipeline route.

    Returns pressure profile, required compressor stations, and costs.
    """
    print(f"\n{'='*70}")
    print(f"HYDRAULIC ANALYSIS: {name}")
    print(f"{'='*70}")

    # Handle MultiLineString
    if geometry.geom_type == 'MultiLineString':
        geometry = linemerge(geometry)

    if geometry.geom_type == 'MultiLineString':
        geometries = list(geometry.geoms)
    else:
        geometries = [geometry]

    # Truncate if needed
    if truncate_y is not None:
        new_geoms = []
        for geom in geometries:
            coords = list(geom.coords)
            new_coords = [(x, y) for x, y in coords if y >= truncate_y]
            if len(new_coords) >= 2:
                new_geoms.append(LineString(new_coords))
        if new_geoms:
            geometry = linemerge(new_geoms) if len(new_geoms) > 1 else new_geoms[0]
            if geometry.geom_type == 'MultiLineString':
                geometries = list(geometry.geoms)
            else:
                geometries = [geometry]

    # Get elevation profile
    distances, elevations = get_elevation_profile(geometry, dem_path)
    total_length_m = distances[-1] if len(distances) > 0 else 0
    total_length_km = total_length_m / 1000

    print(f"\nRoute Statistics:")
    print(f"  Total length: {total_length_km:.2f} km")
    print(f"  Elevation range: {elevations.min():.1f}m to {elevations.max():.1f}m")
    print(f"  Net elevation change: {elevations[-1] - elevations[0]:.1f}m")
    print(f"  Total elevation gain: {np.sum(np.maximum(np.diff(elevations), 0)):.1f}m")
    print(f"  Total elevation loss: {np.sum(np.maximum(-np.diff(elevations), 0)):.1f}m")

    # Pipeline parameters
    print(f"\nPipeline Parameters:")
    print(f"  Diameter: {PIPE_DIAMETER_MM:.1f} mm ({PIPE_DIAMETER_IN:.1f} in)")
    print(f"  Inlet pressure: {INLET_PRESSURE_BAR} bar")
    print(f"  Min delivery pressure: {MIN_DELIVERY_PRESSURE_BAR} bar")
    print(f"  Flow rate: {FLOW_RATE_M3_S} m³/s ({flow_m3s_to_mmscfd(FLOW_RATE_M3_S):.2f} MMSCFD)")
    print(f"  Gas SG: {GAS_SG}")
    print(f"  Temperature: {TEMP_K} K ({TEMP_K - 273.15:.1f}°C)")

    # Convert units for Panhandle B
    flow_mmscfd = flow_m3s_to_mmscfd(FLOW_RATE_M3_S)
    temp_r = TEMP_K * 1.8  # Kelvin to Rankine
    diameter_in = PIPE_DIAMETER_IN

    # Simulate pressure along route in segments
    segment_length_km = 1.0  # 1 km segments for analysis
    num_segments = int(np.ceil(total_length_km / segment_length_km))

    pressures = [INLET_PRESSURE_BAR]
    compressor_stations = []
    current_pressure = INLET_PRESSURE_BAR

    print(f"\nPressure Profile Analysis ({num_segments} segments):")
    print(f"  {'Dist (km)':<12} {'Elev (m)':<12} {'P_in (bar)':<12} {'P_out (bar)':<12} {'Status':<20}")
    print(f"  {'-'*68}")

    for i in range(num_segments):
        start_dist = i * segment_length_km * 1000
        end_dist = min((i + 1) * segment_length_km * 1000, total_length_m)
        seg_length_km = (end_dist - start_dist) / 1000

        # Find elevations at segment boundaries
        start_idx = np.searchsorted(distances, start_dist)
        end_idx = np.searchsorted(distances, end_dist)
        start_idx = min(start_idx, len(elevations) - 1)
        end_idx = min(end_idx, len(elevations) - 1)

        start_elev = elevations[start_idx]
        end_elev = elevations[end_idx]
        elev_change = end_elev - start_elev

        # Calculate Z factor at current pressure
        z = calculate_z_factor(current_pressure, TEMP_K, GAS_SG)

        # Friction pressure drop (Panhandle B)
        inlet_psia = current_pressure * 14.504
        outlet_psia = panhandle_b_pressure_drop(
            seg_length_km, diameter_in, flow_mmscfd,
            inlet_psia, GAS_SG, temp_r, z
        )
        outlet_pressure_friction = outlet_psia / 14.504

        # Hydrostatic pressure change
        avg_pressure = (current_pressure + outlet_pressure_friction) / 2
        hydrostatic_change = calculate_hydrostatic_pressure_change(
            elev_change, avg_pressure, TEMP_K, GAS_SG
        )

        # Total outlet pressure
        outlet_pressure = outlet_pressure_friction + hydrostatic_change

        status = "OK"

        # Check if pressure dropped below minimum
        if outlet_pressure < MIN_DELIVERY_PRESSURE_BAR:
            # Need compressor station
            compressor_inlet_p = outlet_pressure
            compressor_outlet_p = INLET_PRESSURE_BAR  # Boost back to inlet pressure

            # Calculate compressor power
            comp_power = calculate_compressor_power(
                max(compressor_inlet_p, 10),  # Min 10 bar inlet
                compressor_outlet_p,
                FLOW_RATE_M3_S,
                TEMP_K,
                GAS_SG,
                COMPRESSOR_EFFICIENCY
            )

            compressor_stations.append({
                'location_km': end_dist / 1000,
                'inlet_pressure_bar': compressor_inlet_p,
                'outlet_pressure_bar': compressor_outlet_p,
                'power_kw': comp_power,
                'elevation_m': end_elev,
            })

            outlet_pressure = compressor_outlet_p
            status = f"COMPRESSOR ({comp_power:.0f} kW)"

        pressures.append(outlet_pressure)
        current_pressure = outlet_pressure

        # Print every 5 km or when compressor added
        if i % 5 == 0 or 'COMPRESSOR' in status:
            print(f"  {end_dist/1000:<12.1f} {end_elev:<12.1f} {pressures[-2]:<12.1f} {outlet_pressure:<12.1f} {status:<20}")

    final_pressure = pressures[-1]
    print(f"\n  Final delivery pressure: {final_pressure:.1f} bar")

    # Compression station summary
    print(f"\n{'='*70}")
    print(f"COMPRESSION STATION REQUIREMENTS")
    print(f"{'='*70}")

    if compressor_stations:
        print(f"\n  Number of stations: {len(compressor_stations)}")
        print(f"\n  {'#':<4} {'Location (km)':<15} {'Inlet (bar)':<12} {'Outlet (bar)':<12} {'Power (kW)':<12}")
        print(f"  {'-'*55}")

        total_power = 0
        for i, cs in enumerate(compressor_stations):
            print(f"  {i+1:<4} {cs['location_km']:<15.1f} {cs['inlet_pressure_bar']:<12.1f} {cs['outlet_pressure_bar']:<12.1f} {cs['power_kw']:<12.0f}")
            total_power += cs['power_kw']

        print(f"\n  Total installed power: {total_power:,.0f} kW ({total_power/1000:.1f} MW)")
    else:
        print(f"\n  No compression stations required!")
        total_power = 0

    # Cost analysis
    print(f"\n{'='*70}")
    print(f"COMPRESSION COST ANALYSIS")
    print(f"{'='*70}")

    # CAPEX
    compressor_capex = total_power * COMPRESSOR_CAPEX_PER_KW
    # Add station infrastructure (buildings, controls, etc.) - typically 50% of equipment
    station_infrastructure = compressor_capex * 0.5 * len(compressor_stations) if compressor_stations else 0
    total_compression_capex = compressor_capex + station_infrastructure

    print(f"\n  CAPEX:")
    print(f"    Compressor equipment ({total_power:,.0f} kW × ${COMPRESSOR_CAPEX_PER_KW:,}/kW): ${compressor_capex:,.0f}")
    print(f"    Station infrastructure ({len(compressor_stations)} stations): ${station_infrastructure:,.0f}")
    print(f"    TOTAL COMPRESSION CAPEX: ${total_compression_capex:,.0f}")

    # OPEX
    # Energy cost
    operating_hours = HOURS_PER_YEAR * COMPRESSOR_AVAILABILITY
    annual_energy_kwh = total_power * operating_hours
    annual_energy_cost = annual_energy_kwh * ENERGY_COST_PER_KWH

    # Maintenance (% of CAPEX)
    annual_maintenance = total_compression_capex * COMPRESSOR_OPEX_FRACTION

    # Staff and other operating costs (~$500k per station per year)
    annual_staffing = len(compressor_stations) * 500000 if compressor_stations else 0

    total_annual_opex = annual_energy_cost + annual_maintenance + annual_staffing

    print(f"\n  Annual OPEX:")
    print(f"    Energy ({annual_energy_kwh/1e6:.1f} GWh × ${ENERGY_COST_PER_KWH}/kWh): ${annual_energy_cost:,.0f}")
    print(f"    Maintenance ({COMPRESSOR_OPEX_FRACTION*100:.0f}% of CAPEX): ${annual_maintenance:,.0f}")
    print(f"    Staffing & operations: ${annual_staffing:,.0f}")
    print(f"    TOTAL ANNUAL OPEX: ${total_annual_opex:,.0f}")

    # NPV (30 years, 5% discount)
    years = 30
    rate = 0.05
    npv_factor = (1 - (1 + rate) ** -years) / rate
    npv_opex = total_annual_opex * npv_factor

    print(f"\n  NPV of OPEX (30 years @ 5%): ${npv_opex:,.0f}")
    print(f"  TOTAL COMPRESSION TCO: ${total_compression_capex + npv_opex:,.0f}")

    return {
        'length_km': total_length_km,
        'elevation_gain': np.sum(np.maximum(np.diff(elevations), 0)),
        'elevation_loss': np.sum(np.maximum(-np.diff(elevations), 0)),
        'net_elevation_change': elevations[-1] - elevations[0],
        'final_pressure_bar': final_pressure,
        'num_compressor_stations': len(compressor_stations),
        'total_compressor_power_kw': total_power,
        'compressor_stations': compressor_stations,
        'compression_capex': total_compression_capex,
        'annual_compression_opex': total_annual_opex,
        'npv_compression_opex': npv_opex,
        'compression_tco': total_compression_capex + npv_opex,
    }


def main():
    print("=" * 70)
    print("PIPELINE HYDRAULIC & COMPRESSION ANALYSIS")
    print("Existing Pipeline vs A* Generated Route")
    print("=" * 70)

    # Override flow rate to a high-capacity scenario that stresses the system
    # A 26" pipeline can handle up to 500-600 MMSCFD at high pressure
    # Let's analyze at near-capacity: 500 MMSCFD to see compression requirements
    global FLOW_RATE_M3_S
    realistic_mmscfd = 500.0  # Million standard cubic feet per day - high capacity
    # Convert back: MMSCFD to m³/s = MMSCFD × 1e6 / 35.3147 / 86400
    FLOW_RATE_M3_S = realistic_mmscfd * 1e6 / 35.3147 / 86400
    print(f"\nUsing high-capacity flow rate: {realistic_mmscfd:.0f} MMSCFD ({FLOW_RATE_M3_S:.1f} m³/s)")
    print("(This represents near-maximum throughput for a 26\" transmission pipeline)")

    dem_path = RASTER_DIR / 'dem_epsg32633_processed.tif'

    # Load existing pipeline
    print("\nLoading existing pipeline...")
    existing_gdf = gpd.read_file(PROJECT_DIR / 'data/vectors/pipelines.gpkg')
    existing_geom = linemerge(existing_gdf.geometry.tolist())
    existing_bounds = existing_gdf.total_bounds
    truncate_y = existing_bounds[1]  # Min Y for fair comparison

    # Load A* route
    print("Loading A* generated route...")
    with open(ASTAR_ROUTE) as f:
        astar_data = json.load(f)

    astar_lines = []
    for feat in astar_data['features']:
        if feat['geometry']['type'] == 'LineString':
            coords = feat['geometry']['coordinates']
            astar_lines.append(LineString(coords))

    astar_geom = linemerge(astar_lines)

    # Analyze both routes
    existing_results = analyze_route_hydraulics(
        "EXISTING PIPELINE",
        existing_geom,
        dem_path,
        truncate_y=None  # Use full existing pipeline
    )

    astar_results = analyze_route_hydraulics(
        "A* GENERATED ROUTE",
        astar_geom,
        dem_path,
        truncate_y=truncate_y  # Truncate to match existing endpoint
    )

    # Comparison summary
    print(f"\n{'='*70}")
    print("HYDRAULIC COMPARISON SUMMARY")
    print(f"{'='*70}")

    print(f"\n{'Metric':<40} {'Existing':>15} {'A* Route':>15}")
    print("-" * 72)
    print(f"{'Route Length (km)':<40} {existing_results['length_km']:>15.2f} {astar_results['length_km']:>15.2f}")
    print(f"{'Total Elevation Gain (m)':<40} {existing_results['elevation_gain']:>15.0f} {astar_results['elevation_gain']:>15.0f}")
    print(f"{'Total Elevation Loss (m)':<40} {existing_results['elevation_loss']:>15.0f} {astar_results['elevation_loss']:>15.0f}")
    print(f"{'Net Elevation Change (m)':<40} {existing_results['net_elevation_change']:>15.0f} {astar_results['net_elevation_change']:>15.0f}")
    print(f"{'Final Delivery Pressure (bar)':<40} {existing_results['final_pressure_bar']:>15.1f} {astar_results['final_pressure_bar']:>15.1f}")
    print(f"{'Number of Compressor Stations':<40} {existing_results['num_compressor_stations']:>15} {astar_results['num_compressor_stations']:>15}")
    print(f"{'Total Compressor Power (kW)':<40} {existing_results['total_compressor_power_kw']:>15,.0f} {astar_results['total_compressor_power_kw']:>15,.0f}")

    print(f"\n{'COMPRESSION COSTS':<40}")
    print("-" * 72)
    print(f"{'Compression CAPEX ($)':<40} {existing_results['compression_capex']:>15,.0f} {astar_results['compression_capex']:>15,.0f}")
    print(f"{'Annual Compression OPEX ($)':<40} {existing_results['annual_compression_opex']:>15,.0f} {astar_results['annual_compression_opex']:>15,.0f}")
    print(f"{'NPV Compression OPEX (30yr, $)':<40} {existing_results['npv_compression_opex']:>15,.0f} {astar_results['npv_compression_opex']:>15,.0f}")
    print(f"{'Compression TCO ($)':<40} {existing_results['compression_tco']:>15,.0f} {astar_results['compression_tco']:>15,.0f}")

    # Include pipeline CAPEX from previous analysis
    existing_pipeline_capex = 112230542
    astar_pipeline_capex = 169772184

    print(f"\n{'TOTAL COST OF OWNERSHIP':<40}")
    print("-" * 72)
    print(f"{'Pipeline CAPEX ($)':<40} {existing_pipeline_capex:>15,.0f} {astar_pipeline_capex:>15,.0f}")
    print(f"{'Compression CAPEX ($)':<40} {existing_results['compression_capex']:>15,.0f} {astar_results['compression_capex']:>15,.0f}")
    print(f"{'NPV Compression OPEX ($)':<40} {existing_results['npv_compression_opex']:>15,.0f} {astar_results['npv_compression_opex']:>15,.0f}")

    existing_total_tco = existing_pipeline_capex + existing_results['compression_tco']
    astar_total_tco = astar_pipeline_capex + astar_results['compression_tco']

    print(f"{'-'*72}")
    print(f"{'GRAND TOTAL TCO ($)':<40} {existing_total_tco:>15,.0f} {astar_total_tco:>15,.0f}")

    tco_diff = astar_total_tco - existing_total_tco
    print(f"\n{'='*70}")
    print("FINAL VERDICT")
    print(f"{'='*70}")

    if tco_diff < 0:
        print(f"\n  >>> A* ROUTE HAS LOWER TOTAL COST OF OWNERSHIP BY ${-tco_diff:,.0f}")
    else:
        print(f"\n  >>> EXISTING PIPELINE HAS LOWER TCO BY ${tco_diff:,.0f}")

    # Compression savings breakdown
    comp_capex_diff = astar_results['compression_capex'] - existing_results['compression_capex']
    comp_opex_diff = astar_results['npv_compression_opex'] - existing_results['npv_compression_opex']
    pipeline_capex_diff = astar_pipeline_capex - existing_pipeline_capex

    print(f"\n  Cost Breakdown:")
    print(f"    Pipeline CAPEX difference:    ${pipeline_capex_diff:>+15,.0f}")
    print(f"    Compression CAPEX difference: ${comp_capex_diff:>+15,.0f}")
    print(f"    Compression OPEX difference:  ${comp_opex_diff:>+15,.0f}")
    print(f"    {'-'*45}")
    print(f"    TOTAL difference:             ${tco_diff:>+15,.0f}")

    if existing_results['num_compressor_stations'] != astar_results['num_compressor_stations']:
        station_diff = astar_results['num_compressor_stations'] - existing_results['num_compressor_stations']
        print(f"\n  A* route requires {abs(station_diff)} {'fewer' if station_diff < 0 else 'more'} compressor station(s)")

    # Additional analysis: delivery pressure and downstream recompression costs
    print(f"\n{'='*70}")
    print("DOWNSTREAM RECOMPRESSION ANALYSIS")
    print(f"{'='*70}")
    print("\nEven without mid-route compression, lower delivery pressure requires")
    print("more work at the receiving terminal to boost gas to distribution pressure.")

    # Assume distribution network requires 60 bar
    distribution_pressure = 60.0  # bar

    existing_boost = max(0, distribution_pressure - existing_results['final_pressure_bar'])
    astar_boost = max(0, distribution_pressure - astar_results['final_pressure_bar'])

    print(f"\n  Required boost to {distribution_pressure} bar distribution pressure:")
    print(f"    Existing pipeline: {existing_boost:.1f} bar boost needed")
    print(f"    A* route: {astar_boost:.1f} bar boost needed")

    # Calculate downstream compression power and costs
    if existing_boost > 0 or astar_boost > 0:
        # Compression power for downstream boost
        ex_downstream_power = calculate_compressor_power(
            existing_results['final_pressure_bar'],
            distribution_pressure,
            FLOW_RATE_M3_S,
            TEMP_K,
            GAS_SG,
            COMPRESSOR_EFFICIENCY
        ) if existing_boost > 0 else 0

        as_downstream_power = calculate_compressor_power(
            astar_results['final_pressure_bar'],
            distribution_pressure,
            FLOW_RATE_M3_S,
            TEMP_K,
            GAS_SG,
            COMPRESSOR_EFFICIENCY
        ) if astar_boost > 0 else 0

        print(f"\n  Downstream compression power required:")
        print(f"    Existing pipeline: {ex_downstream_power:,.0f} kW")
        print(f"    A* route: {as_downstream_power:,.0f} kW")

        # Annual energy cost difference
        ex_annual_energy = ex_downstream_power * HOURS_PER_YEAR * COMPRESSOR_AVAILABILITY * ENERGY_COST_PER_KWH
        as_annual_energy = as_downstream_power * HOURS_PER_YEAR * COMPRESSOR_AVAILABILITY * ENERGY_COST_PER_KWH

        energy_diff = as_annual_energy - ex_annual_energy

        print(f"\n  Annual downstream compression energy cost:")
        print(f"    Existing pipeline: ${ex_annual_energy:,.0f}/year")
        print(f"    A* route: ${as_annual_energy:,.0f}/year")
        print(f"    Difference: ${energy_diff:>+,.0f}/year")

        # NPV over 30 years
        years = 30
        rate = 0.05
        npv_factor = (1 - (1 + rate) ** -years) / rate
        npv_energy_diff = energy_diff * npv_factor

        print(f"\n  NPV of downstream compression difference (30 years):")
        print(f"    ${npv_energy_diff:>+,.0f}")

        # Updated TCO including downstream
        print(f"\n{'='*70}")
        print("UPDATED TCO INCLUDING DOWNSTREAM COMPRESSION")
        print(f"{'='*70}")

        existing_downstream_npv = ex_annual_energy * npv_factor
        astar_downstream_npv = as_annual_energy * npv_factor

        existing_full_tco = existing_total_tco + existing_downstream_npv
        astar_full_tco = astar_total_tco + astar_downstream_npv

        print(f"\n{'Component':<40} {'Existing':>15} {'A* Route':>15}")
        print("-" * 72)
        print(f"{'Pipeline CAPEX ($)':<40} {existing_pipeline_capex:>15,.0f} {astar_pipeline_capex:>15,.0f}")
        print(f"{'Mid-route Compression ($)':<40} {existing_results['compression_tco']:>15,.0f} {astar_results['compression_tco']:>15,.0f}")
        print(f"{'Downstream Compression NPV ($)':<40} {existing_downstream_npv:>15,.0f} {astar_downstream_npv:>15,.0f}")
        print(f"{'-'*72}")
        print(f"{'FULL TCO ($)':<40} {existing_full_tco:>15,.0f} {astar_full_tco:>15,.0f}")

        full_tco_diff = astar_full_tco - existing_full_tco
        print(f"\n  >>> FULL TCO DIFFERENCE: ${full_tco_diff:>+,.0f}")

        if full_tco_diff > 0:
            print(f"  >>> EXISTING PIPELINE REMAINS CHEAPER BY ${full_tco_diff:,.0f}")
        else:
            print(f"  >>> A* ROUTE IS CHEAPER BY ${-full_tco_diff:,.0f}")
    else:
        print(f"\n  Both routes deliver above {distribution_pressure} bar - no downstream boost needed.")


if __name__ == '__main__':
    main()
