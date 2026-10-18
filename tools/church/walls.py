"""Seams where a vector extract was cut, which are not shoreline.

The NSTDB water layer used as the modern reference is a tiled extract. Where a
tile boundary crosses open sea, the water polygon is closed along a straight
artificial line, and every vertex on that line shares one exact coordinate.

That matters because `shoreline_error.py` measures the distance from each
reference water EDGE pixel to the nearest historical ink. A seam running through
open Gulf is a water edge by that definition, and Church drew nothing out there,
so it contributes a distance of whatever the range to the real coast happens to
be - kilometres.

On the Inverness north panel this was not a rounding detail. 17.5 % of all edge
samples lay on seams, and in the panel's second quarter they were 1,556 of 4,087
samples with an RMS of 1,757 m, against 184 m for the 2,531 genuine coastline
samples in the very same band. The seams alone produced that band's published
1,091 m figure, which two previous attempts tried to explain as undrawn interior
and then as real coastal registration error. It was neither.

Detection is by repetition, not by a hardcoded grid: a real shoreline never puts
dozens of vertices on one exact longitude to six decimal places, and keying off
the data means a differently-tiled extract is handled without editing a table.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass

__all__ = ["ExtractWalls", "detect_extract_walls"]

DEFAULT_MIN_REPEATS = 10
"""How many vertices must share an exact coordinate before it reads as a seam.

Low enough to catch a short seam across a bay mouth, high enough that a genuinely
straight surveyed shore - a causeway or a training wall, tens of metres long at
this data's vertex spacing - is not mistaken for one.
"""

_PRECISION = 6
"""Coordinates are compared at ~0.1 m. Seam vertices are emitted from one clip
operation and agree exactly; natural neighbours do not."""


@dataclass(frozen=True)
class ExtractWalls:
    """Longitudes and latitudes along which an extract was cut."""

    longitudes: tuple[float, ...]
    latitudes: tuple[float, ...]

    def contains(self, lon: float, lat: float, tolerance: float) -> bool:
        """True when a point lies on one of the seams.

        `tolerance` is in degrees and should be set from the raster's own pixel
        size when masking a rasterised edge, because a burnt-in line straddles
        the exact coordinate by up to half a pixel.
        """
        if any(abs(lon - wall) <= tolerance for wall in self.longitudes):
            return True
        return any(abs(lat - wall) <= tolerance for wall in self.latitudes)

    @property
    def any(self) -> bool:
        return bool(self.longitudes or self.latitudes)


def detect_extract_walls(
    vertices: list[tuple[float, float]], min_repeats: int = DEFAULT_MIN_REPEATS
) -> ExtractWalls:
    """Find coordinate values repeated often enough to be a clip seam."""
    longitudes = collections.Counter(round(lon, _PRECISION) for lon, _ in vertices)
    latitudes = collections.Counter(round(lat, _PRECISION) for _, lat in vertices)
    return ExtractWalls(
        longitudes=tuple(sorted(v for v, n in longitudes.items() if n >= min_repeats)),
        latitudes=tuple(sorted(v for v, n in latitudes.items() if n >= min_repeats)),
    )
