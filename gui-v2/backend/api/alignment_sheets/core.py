import math
from typing import List, Tuple

from .models import StationEquation


class LinearReferencingSystem:
    """
    Handles conversion between Geometric Measure (M) and Engineering Station (Sta).
    Supports Station Equations (Gaps/Overlaps).
    """

    def __init__(self, equations: List[StationEquation] = None):
        # Sort equations by measure
        self.equations = sorted(equations or [], key=lambda e: e.measure_m)

    def measure_to_station(self, measure: float) -> str:
        """
        Converts a geometric measure (meters from start) to a Station string.
        Format: "100+50" (Imperial) or "10+050" (Metric).
        Currently using Metric formatting: KP km+meters.
        """

        # Find relevant equation zone
        # Default: Station = Measure (no equations)
        current_offset = 0.0

        # Simplified: apply all prior equation offsets.
        for eq in self.equations:
            if measure >= eq.measure_m:
                jump = eq.ahead_station - eq.back_station
                current_offset += jump
            else:
                break

        station_value = measure + current_offset
        return self._format_station(station_value)

    def _format_station(self, val: float) -> str:
        """Formats float station value to KP String."""
        km = int(val // 1000)
        m = val % 1000
        return f"KP {km}+{m:03.0f}"

    def get_station_ticks(self, start_m: float, end_m: float, interval_m: float) -> List[Tuple[float, str]]:
        """
        Generates station ticks for a given range of measures.
        Returns list of (measure, label).
        Handle equations correctly (skipping gaps, repeating overlaps).
        """
        ticks: List[Tuple[float, str]] = []

        zones = self._get_zones(start_m, end_m)
        for zone_start_m, zone_end_m, offset in zones:
            sta_start = zone_start_m + offset
            sta_end = zone_end_m + offset

            first_tick_sta = math.ceil(sta_start / interval_m) * interval_m
            curr_sta = first_tick_sta
            while curr_sta <= sta_end:
                curr_m = curr_sta - offset
                ticks.append((curr_m, self._format_station(curr_sta)))
                curr_sta += interval_m

        return ticks

    def _get_zones(self, start_m: float, end_m: float) -> List[Tuple[float, float, float]]:
        """
        Splits the measure range into zones defined by equations.
        Returns [(zone_start_m, zone_end_m, station_offset), ...]
        """
        zones: List[Tuple[float, float, float]] = []

        relevant_eqs = [e for e in self.equations if start_m < e.measure_m < end_m]

        current_offset = 0.0
        for eq in self.equations:
            if eq.measure_m <= start_m:
                current_offset += (eq.ahead_station - eq.back_station)
            else:
                break

        curr_m = start_m
        for eq in relevant_eqs:
            zones.append((curr_m, eq.measure_m, current_offset))
            curr_m = eq.measure_m
            current_offset += (eq.ahead_station - eq.back_station)

        zones.append((curr_m, end_m, current_offset))
        return zones















