"""Geographic panels embedded in A.F. Church county sheets.

Some Church sheets are composites: the county is split into multiple map
panels and surrounded by title art or town-plan insets. A panel owns a source
pixel window, while GCP CSVs continue to use coordinates from the complete
archival scan.
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


@dataclass(frozen=True)
class ChurchPanel:
    """One independently georeferenced geographic panel on a county sheet."""

    county_slug: str
    slug: str
    window: SourceWindow


_PANELS = {
    ("inverness", "north"): ChurchPanel(
        county_slug="inverness",
        slug="north",
        window=SourceWindow(x=0, y=0, width=14500, height=32200),
    ),
    ("inverness", "south"): ChurchPanel(
        county_slug="inverness",
        slug="south",
        window=SourceWindow(x=12500, y=0, width=21500, height=33500),
    ),
}


def get_panel(county_slug: str, panel_slug: str) -> ChurchPanel:
    """Return one registered panel."""
    try:
        return _PANELS[(county_slug, panel_slug)]
    except KeyError:
        raise KeyError(f"unknown Church panel: {county_slug}/{panel_slug}") from None


def panels_for_county(county_slug: str) -> list[ChurchPanel]:
    """Return a county's panels in display order."""
    return [
        panel
        for (registered_county, _), panel in _PANELS.items()
        if registered_county == county_slug
    ]
