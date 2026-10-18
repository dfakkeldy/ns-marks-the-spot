"""Control points taken from a Church sheet's printed lat/lon graticule.

Why this exists
---------------
The 2026-07-24 pilot drew its controls from place-label centres matched to the
Canadian Geographical Names Database. That is structurally noisy: a cartographer
sets the word "CHETICAMP" beside the settlement, not on it. Measured on this
sheet the Chéticamp label sits about 3.7 km from the CGNDB village coordinate -
error baked into the controls themselves, which a thin-plate spline then
interpolates exactly and fans out between.

A printed graticule has no such ambiguity. Its intersections are exact by
construction, regularly spaced, and distributed across the whole panel. On the
1884 Inverness sheet the north panel carries a 5-arcminute lattice; the spacing
and the anchor were both verified against degree/minute labels engraved on the
scan (60d40'W with 47d00'N, and 60d50'W), not inferred.

What it does NOT fix
--------------------
The graticule is the cartographer's intended projection frame. Fitting it
recovers Church's coordinate system, not the accuracy of the topography he drew
inside it. Held-out physical features - shorelines, river mouths, road
junctions - remain the only honest measure of that, which is exactly why every
control here is a graticule intersection and every check is a physical feature.
"""

from __future__ import annotations

from dataclasses import dataclass

from tools.church.gcps import CONTROL_ROLE, GroundControlPoint

_MINUTES_PER_DEGREE = 60.0


@dataclass(frozen=True)
class LatticeIndex:
    """Position in the lattice: meridian index west-ward, parallel index south-ward."""

    meridian: int
    parallel: int


@dataclass(frozen=True)
class GraticuleAnchor:
    """Ties lattice indices to real coordinates via one identified intersection.

    Indices run the way the sheet does, because `lattice.perpendicular_offsets`
    orients each family's normal along increasing pixel x or y: meridian index
    increases EASTWARD (longitude increasing) and parallel index increases
    SOUTHWARD (latitude decreasing, since pixel y grows downward).

    Negative indices are legal and useful - the 47d00'N label that anchors the
    Inverness north panel sits two steps north of parallel index 0.
    """

    meridian_index: int
    meridian_lon: float
    parallel_index: int
    parallel_lat: float
    step_minutes: float

    def __post_init__(self) -> None:
        if self.step_minutes <= 0:
            raise ValueError(f"step_minutes must be positive, got {self.step_minutes}")

    @property
    def step_degrees(self) -> float:
        return self.step_minutes / _MINUTES_PER_DEGREE

    def coordinate(self, index: LatticeIndex) -> tuple[float, float]:
        """Longitude/latitude of a lattice intersection.

        Longitude rises with meridian index and latitude falls with parallel
        index, matching the sheet: x runs east, y runs south.
        """
        lon = self.meridian_lon + (index.meridian - self.meridian_index) * self.step_degrees
        lat = self.parallel_lat - (index.parallel - self.parallel_index) * self.step_degrees
        return lon, lat


def _format_dm(value: float, positive: str, negative: str) -> str:
    hemisphere = positive if value >= 0 else negative
    magnitude = abs(value)
    degrees = int(round(magnitude * _MINUTES_PER_DEGREE)) // 60
    minutes = int(round(magnitude * _MINUTES_PER_DEGREE)) % 60
    return f"{degrees}d{minutes:02d}m{hemisphere}"


@dataclass(frozen=True)
class GraticuleMesh:
    """Detected intersections plus the anchor that names them."""

    anchor: GraticuleAnchor
    intersections: dict[LatticeIndex, tuple[float, float]]

    def control_points(self) -> list[GroundControlPoint]:
        """Every intersection as a `control` GCP, in a stable, diffable order."""
        points: list[GroundControlPoint] = []
        for index in sorted(
            self.intersections, key=lambda i: (i.meridian, i.parallel)
        ):
            pixel_x, pixel_y = self.intersections[index]
            lon, lat = self.anchor.coordinate(index)
            label = (
                f"graticule {_format_dm(lon, 'E', 'W')} {_format_dm(lat, 'N', 'S')}"
            )
            points.append(
                GroundControlPoint(pixel_x, pixel_y, lon, lat, CONTROL_ROLE, label)
            )
        return points
