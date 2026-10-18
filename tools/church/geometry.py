"""Spherical Web Mercator (EPSG:3857) conversions.

The ground-distance correction here is load-bearing. EPSG:3857 is conformal but
not equidistant: distances inflate by 1/cos(latitude). At Inverness County's
~46 degrees N that is roughly 44 percent, so an accuracy figure measured in raw
3857 units would be badly wrong. Every distance we report to a user passes
through `mercator_to_ground_metres`.
"""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6378137.0
"""Semi-major axis of WGS84, the sphere radius EPSG:3857 assumes."""


def lonlat_to_mercator(lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """Convert WGS84 degrees to EPSG:3857 metres."""
    x = math.radians(lon_deg) * EARTH_RADIUS_M
    y = math.log(math.tan(math.pi / 4.0 + math.radians(lat_deg) / 2.0)) * EARTH_RADIUS_M
    return x, y


def mercator_to_lonlat(x: float, y: float) -> tuple[float, float]:
    """Convert EPSG:3857 metres back to WGS84 degrees."""
    lon_deg = math.degrees(x / EARTH_RADIUS_M)
    lat_deg = math.degrees(2.0 * math.atan(math.exp(y / EARTH_RADIUS_M)) - math.pi / 2.0)
    return lon_deg, lat_deg


def mercator_to_ground_metres(mercator_distance: float, latitude_deg: float) -> float:
    """Scale a distance measured in EPSG:3857 metres to true ground metres."""
    return mercator_distance * math.cos(math.radians(latitude_deg))
