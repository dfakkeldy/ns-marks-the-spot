"""Objectively-defined coastline landmarks, for held-out check points.

Why not place-names
-------------------
A settlement has no single true coordinate. The 2026-07-24 pilot paired the
drawn word "CHETICAMP" with the gazetteer coordinate of the village and baked
about 3.7 km of error straight into its controls. Any check point sourced the
same way would be measuring the cartographer's lettering habits, not the warp.

A headland does have a true coordinate. "The westernmost vertex of the
coastline inside this box" is a rule, not a judgement: it picks the same
physical point on the modern vector data and on the historical drawing, and
anyone can re-run it and disagree with the answer on the evidence.

The box is the one arbitrary part, so it is versioned alongside the result. Draw
it generously around an isolated feature and the extremum is stable; draw it
across two headlands and it is not, which is a defect visible in the committed
numbers rather than hidden in someone's process.

Islands are the other good source: an island's centroid is unambiguous in both
representations and needs no box at all beyond the one that selects it.

Everything here is pure stdlib and works on parsed GeoJSON, so it is testable
without a GIS host.
"""

from __future__ import annotations

from dataclasses import dataclass

__all__ = [
    "BoundingBox",
    "EXTREME_RULES",
    "Island",
    "extreme_vertex",
    "interior_rings",
    "islands_within",
    "polygon_centroid",
    "vertices_of",
]


@dataclass(frozen=True)
class BoundingBox:
    """A longitude/latitude box selecting one feature."""

    west: float
    south: float
    east: float
    north: float

    def __post_init__(self) -> None:
        if self.west >= self.east or self.south >= self.north:
            raise ValueError(
                f"degenerate box: ({self.west}, {self.south}) to ({self.east}, {self.north})"
            )

    def contains(self, lon: float, lat: float) -> bool:
        return self.west <= lon <= self.east and self.south <= lat <= self.north


EXTREME_RULES = {
    "west": lambda point: point[0],
    "east": lambda point: -point[0],
    "south": lambda point: point[1],
    "north": lambda point: -point[1],
}
"""Each rule sorts ascending, so `min` picks the extremity it names."""


def vertices_of(geometry: dict) -> list[tuple[float, float]]:
    """Every coordinate in a GeoJSON geometry, at any nesting depth.

    Depth-agnostic because NSTDB mixes Polygon and MultiPolygon in one layer and
    the distinction is irrelevant to "where is the coastline".
    """
    found: list[tuple[float, float]] = []

    def walk(item) -> None:
        if not item:
            return
        if isinstance(item[0], (int, float)):
            found.append((float(item[0]), float(item[1])))
            return
        for child in item:
            walk(child)

    # Document order, not stack order. Extremal rules do not care, but a caller
    # eyeballing the output against the source file does.
    walk(geometry.get("coordinates"))
    return found


def extreme_vertex(
    vertices: list[tuple[float, float]], box: BoundingBox, rule: str
) -> tuple[float, float]:
    """The extremity named by `rule` among the vertices inside `box`."""
    if rule not in EXTREME_RULES:
        raise ValueError(f"unknown rule {rule!r}; expected one of {sorted(EXTREME_RULES)}")
    inside = [v for v in vertices if box.contains(*v)]
    if not inside:
        raise ValueError(f"no coastline vertices inside {box}")
    return min(inside, key=EXTREME_RULES[rule])


def interior_rings(geometry: dict) -> list[list[tuple[float, float]]]:
    """Holes in a polygon layer. In a water layer, these are the islands."""
    kind = geometry.get("type")
    if kind == "Polygon":
        polygons = [geometry.get("coordinates") or []]
    elif kind == "MultiPolygon":
        polygons = geometry.get("coordinates") or []
    else:
        return []
    return [
        [(float(x), float(y)) for x, y in ring]
        for polygon in polygons
        for ring in polygon[1:]
    ]


def polygon_centroid(ring: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Shoelace centroid and area of a closed ring: `(lon, lat, area)`.

    Area comes back in squared degrees - fine for ranking islands by size, which
    is all it is used for. Never report it as a real area.
    """
    if len(ring) < 3:
        raise ValueError(f"a ring needs at least 3 points, got {len(ring)}")

    doubled_area = 0.0
    x_sum = 0.0
    y_sum = 0.0
    for (x0, y0), (x1, y1) in zip(ring, list(ring[1:]) + [ring[0]]):
        cross = x0 * y1 - x1 * y0
        doubled_area += cross
        x_sum += (x0 + x1) * cross
        y_sum += (y0 + y1) * cross
    if abs(doubled_area) < 1e-14:
        raise ValueError("ring encloses no area; it is degenerate or self-cancelling")

    area = doubled_area / 2.0
    return x_sum / (6.0 * area), y_sum / (6.0 * area), abs(area)


@dataclass(frozen=True)
class Island:
    """One island, ranked by size so the biggest and most drawable come first."""

    lon: float
    lat: float
    area_sq_deg: float
    span_lon: float
    span_lat: float


def islands_within(features: list[dict], box: BoundingBox) -> list[Island]:
    """Islands whose centroid falls inside `box`, largest first."""
    found: list[Island] = []
    for feature in features:
        geometry = feature.get("geometry") or {}
        for ring in interior_rings(geometry):
            try:
                lon, lat, area = polygon_centroid(ring)
            except ValueError:
                continue
            if not box.contains(lon, lat):
                continue
            longitudes = [x for x, _ in ring]
            latitudes = [y for _, y in ring]
            found.append(
                Island(
                    lon=lon,
                    lat=lat,
                    area_sq_deg=area,
                    span_lon=max(longitudes) - min(longitudes),
                    span_lat=max(latitudes) - min(latitudes),
                )
            )
    found.sort(key=lambda island: -island.area_sq_deg)
    return found
