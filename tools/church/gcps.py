"""Ground control points for georeferencing a Church county sheet.

GCPs live in version-controlled CSV files so they stay reviewable in diffs -
they are the real intellectual asset of this pipeline, far more valuable than
the derived rasters.

Each row carries a `role`:
  * `control` - fed to gdalwarp to build the warp.
  * `check`   - held out entirely, used only to measure accuracy afterwards.

The split matters. A thin-plate spline interpolates its control points exactly,
so residuals measured at control points are always ~0 and say nothing about
accuracy. Only held-out check points give an honest number.
"""

from __future__ import annotations

import csv
import io
import pathlib
from dataclasses import dataclass

from tools.church.geometry import lonlat_to_mercator

CONTROL_ROLE = "control"
CHECK_ROLE = "check"
_VALID_ROLES = frozenset({CONTROL_ROLE, CHECK_ROLE})
_REQUIRED_COLUMNS = ("pixel_x", "pixel_y", "lon", "lat", "role", "label")


@dataclass(frozen=True)
class GroundControlPoint:
    """A single pixel-to-world correspondence."""

    pixel_x: float
    pixel_y: float
    lon: float
    lat: float
    role: str
    label: str

    @property
    def mercator(self) -> tuple[float, float]:
        """This point's world position in EPSG:3857 metres."""
        return lonlat_to_mercator(self.lon, self.lat)


def parse_gcp_csv(text: str) -> list[GroundControlPoint]:
    """Parse GCP CSV text, validating every row.

    Raises ValueError naming the TRUE file line number, so a bad point in a file
    of several hundred is findable. Comment and blank lines are skipped for
    parsing but still counted, so the reported number matches what an editor
    shows.
    """
    kept: list[tuple[int, str]] = [
        (number, line)
        for number, line in enumerate(text.splitlines(), start=1)
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not kept:
        raise ValueError("GCP file is empty")

    reader = csv.DictReader(io.StringIO("\n".join(line for _, line in kept)))
    if reader.fieldnames is None:
        raise ValueError("GCP file is empty")

    missing = [column for column in _REQUIRED_COLUMNS if column not in reader.fieldnames]
    if missing:
        raise ValueError(f"GCP file is missing required column(s): {', '.join(missing)}")

    points: list[GroundControlPoint] = []
    for index, row in enumerate(reader):
        # kept[0] is the header row, so data row `index` is kept[index + 1].
        points.append(_parse_row(row, kept[index + 1][0]))
    return points


def _parse_row(row: dict[str, str], line_number: int) -> GroundControlPoint:
    def number(column: str) -> float:
        raw = (row.get(column) or "").strip()
        try:
            return float(raw)
        except ValueError:
            raise ValueError(f"line {line_number}: {column} is not a number: {raw!r}") from None

    pixel_x = number("pixel_x")
    pixel_y = number("pixel_y")
    lon = number("lon")
    lat = number("lat")
    role = (row.get("role") or "").strip()
    label = (row.get("label") or "").strip()

    if pixel_x < 0 or pixel_y < 0:
        raise ValueError(f"line {line_number}: pixel coordinates must be non-negative")
    if not -180.0 <= lon <= 180.0:
        raise ValueError(f"line {line_number}: longitude out of range: {lon}")
    if not -85.05112878 <= lat <= 85.05112878:
        raise ValueError(f"line {line_number}: latitude out of Web Mercator range: {lat}")
    if role not in _VALID_ROLES:
        raise ValueError(
            f"line {line_number}: unknown role {role!r}; expected one of {sorted(_VALID_ROLES)}"
        )
    if not label:
        raise ValueError(f"line {line_number}: label must not be empty")

    return GroundControlPoint(pixel_x, pixel_y, lon, lat, role, label)


def load_gcps(path: pathlib.Path) -> list[GroundControlPoint]:
    """Read and parse a GCP CSV file."""
    return parse_gcp_csv(path.read_text(encoding="utf-8"))


def split_roles(
    points: list[GroundControlPoint],
) -> tuple[list[GroundControlPoint], list[GroundControlPoint]]:
    """Partition points into (control, check)."""
    control = [p for p in points if p.role == CONTROL_ROLE]
    check = [p for p in points if p.role == CHECK_ROLE]
    return control, check
