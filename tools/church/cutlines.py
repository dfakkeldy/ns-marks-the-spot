"""Non-rectangular panel cutlines in full-sheet pixel coordinates.

A Church wall sheet is a composite. On the 1884 Inverness sheet a single
straight diagonal separates the "NORTHERN SECTION" strip from the main southern
map, and both are surrounded by title art, an engraved vignette, and town-plan
insets. An axis-aligned rectangle cannot describe either panel: any box drawn
around one necessarily swallows a wedge of the other.

The 2026-07-24 pilot used two overlapping rectangles and produced exactly the
predicted failure - a thin-plate spline fitted on one panel's controls but
applied to the neighbouring panel's pixels, fanning out between them. Cutlines
exist so a panel's warp only ever sees that panel's ink.

Coordinates are pixels on the complete archival scan, matching the GCP CSVs.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil, floor

from tools.church.windows import SourceWindow

Vertex = tuple[float, float]


@dataclass(frozen=True)
class Cutline:
    """A closed simple polygon bounding one panel's usable ink."""

    vertices: tuple[Vertex, ...]

    def __post_init__(self) -> None:
        if len(self.vertices) < 3:
            raise ValueError(
                f"a cutline needs at least 3 vertices, got {len(self.vertices)}"
            )
        for x, y in self.vertices:
            if x < 0 or y < 0:
                raise ValueError(
                    f"cutline pixel coordinates must be non-negative, got ({x}, {y})"
                )

    @property
    def bounding_window(self) -> SourceWindow:
        """Smallest whole-pixel crop containing the polygon.

        Rounds outward. Rounding inward would shave ink off the panel edge, and
        a half-pixel of lost coastline is a half-pixel we can never warp.
        """
        xs = [x for x, _ in self.vertices]
        ys = [y for _, y in self.vertices]
        x = floor(min(xs))
        y = floor(min(ys))
        return SourceWindow(
            x=x,
            y=y,
            width=ceil(max(xs)) - x,
            height=ceil(max(ys)) - y,
        )

    @property
    def area(self) -> float:
        """Enclosed area in square pixels (shoelace), independent of winding.

        Compared against the bounding window's area this quantifies how much
        neighbouring-panel and decorative material a rectangular crop would
        have swept in - the defect that sank the 2026-07-24 pilot.
        """
        total = 0.0
        count = len(self.vertices)
        for index in range(count):
            x0, y0 = self.vertices[index]
            x1, y1 = self.vertices[(index + 1) % count]
            total += x0 * y1 - x1 * y0
        return abs(total) / 2.0

    def contains(self, pixel_x: float, pixel_y: float) -> bool:
        """Even-odd ray cast. Points exactly on an edge are NOT contained.

        Strictness matters: two panels meeting along a shared divider must not
        both claim the divider itself.
        """
        if self._on_boundary(pixel_x, pixel_y):
            return False

        inside = False
        count = len(self.vertices)
        for index in range(count):
            x0, y0 = self.vertices[index]
            x1, y1 = self.vertices[(index + 1) % count]
            if (y0 > pixel_y) != (y1 > pixel_y):
                crossing_x = x0 + (pixel_y - y0) * (x1 - x0) / (y1 - y0)
                if pixel_x < crossing_x:
                    inside = not inside
        return inside

    def _on_boundary(self, pixel_x: float, pixel_y: float) -> bool:
        count = len(self.vertices)
        for index in range(count):
            start = self.vertices[index]
            end = self.vertices[(index + 1) % count]
            if _point_on_segment((pixel_x, pixel_y), start, end):
                return True
        return False

    def to_local(self, window: SourceWindow) -> "Cutline":
        """Shift into a crop's local pixel space, matching SourceWindow.to_local_point."""
        return Cutline(
            tuple((x - window.x, y - window.y) for x, y in self.vertices)
        )

    def overlaps(self, other: "Cutline") -> bool:
        """True when the two polygons share interior area.

        Detects the three ways simple polygons can share interior: boundaries
        crossing properly, one polygon lying inside the other, and boundaries
        touching collinearly while interiors overlap. Polygons that meet only
        along a shared edge - the Inverness north/south divider - do not
        overlap.
        """
        if self._segments_properly_cross(other):
            return True
        return self._has_interior_point_inside(other) or other._has_interior_point_inside(self)

    def _segments_properly_cross(self, other: "Cutline") -> bool:
        for a_start, a_end in self._edges():
            for b_start, b_end in other._edges():
                if _segments_properly_intersect(a_start, a_end, b_start, b_end):
                    return True
        return False

    def _has_interior_point_inside(self, other: "Cutline") -> bool:
        """Probe this polygon's vertices and edge midpoints against `other`.

        Midpoints are what catch collinear boundary overlap, where every shared
        vertex sits exactly on the other polygon's edge and so is excluded by
        the strict `contains`.
        """
        for vertex in self.vertices:
            if other.contains(*vertex):
                return True
        for start, end in self._edges():
            midpoint = ((start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0)
            if other.contains(*midpoint):
                return True
        return False

    def _edges(self) -> list[tuple[Vertex, Vertex]]:
        count = len(self.vertices)
        return [
            (self.vertices[index], self.vertices[(index + 1) % count])
            for index in range(count)
        ]


def _cross(origin: Vertex, a: Vertex, b: Vertex) -> float:
    return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0])


def _point_on_segment(point: Vertex, start: Vertex, end: Vertex) -> bool:
    if abs(_cross(start, end, point)) > 1e-9:
        return False
    return (
        min(start[0], end[0]) - 1e-9 <= point[0] <= max(start[0], end[0]) + 1e-9
        and min(start[1], end[1]) - 1e-9 <= point[1] <= max(start[1], end[1]) + 1e-9
    )


def _segments_properly_intersect(
    a_start: Vertex, a_end: Vertex, b_start: Vertex, b_end: Vertex
) -> bool:
    """Strict crossing: shared endpoints and touching edges do not count.

    A zero determinant means an endpoint lies on the other segment's line. That
    is a touch, not a crossing, so it must short-circuit before the sign test -
    otherwise `0` reads as "not positive" and a shared vertex looks like a side
    change. Adjacent panels meeting along a divider touch constantly.
    """
    d1 = _cross(a_start, a_end, b_start)
    d2 = _cross(a_start, a_end, b_end)
    d3 = _cross(b_start, b_end, a_start)
    d4 = _cross(b_start, b_end, a_end)
    if min(abs(d1), abs(d2), abs(d3), abs(d4)) <= 1e-9:
        return False
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))
