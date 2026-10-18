"""Rectangular pixel crops on a Church archival scan.

Split out from `panels` so that `cutlines` can depend on a source window
without importing panels, which in turn needs cutlines. `panels` re-exports
SourceWindow, so existing callers are unaffected.
"""

from __future__ import annotations

from dataclasses import dataclass

from tools.church.gcps import GroundControlPoint


@dataclass(frozen=True)
class SourceWindow:
    """A rectangular crop in full-sheet pixel coordinates."""

    x: int
    y: int
    width: int
    height: int

    @property
    def x_end(self) -> int:
        return self.x + self.width

    @property
    def y_end(self) -> int:
        return self.y + self.height

    def contains(self, pixel_x: float, pixel_y: float) -> bool:
        return self.x <= pixel_x < self.x_end and self.y <= pixel_y < self.y_end

    def to_local_point(self, point: GroundControlPoint) -> GroundControlPoint:
        """Shift a full-sheet GCP into this crop's local pixel coordinates."""
        if not self.contains(point.pixel_x, point.pixel_y):
            raise ValueError(f"GCP {point.label!r} is outside the panel source window")
        return GroundControlPoint(
            point.pixel_x - self.x,
            point.pixel_y - self.y,
            point.lon,
            point.lat,
            point.role,
            point.label,
        )
