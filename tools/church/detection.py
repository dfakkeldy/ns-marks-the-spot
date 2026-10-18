"""Read a committed graticule-detection artifact and turn it into a control mesh.

The one step of this pipeline that needs OpenCV is finding straight segments in
the scan. Its output - a few kilobytes of fitted lines - is committed under
`tools/church/detections/`, which is the seam that makes everything downstream
reproducible from a clean checkout with nothing installed:

    detections/*.json  ->  lattice fit  ->  intersections  ->  gcps/*.csv

Re-running the detection needs the archival scan and a GDAL/OpenCV host. Re-
deriving the control points from a detection does not, so the committed CSV can
be regenerated and checked in CI.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass

from tools.church.graticule import GraticuleAnchor, GraticuleMesh, LatticeIndex
from tools.church.lattice import LatticeFamily, fit_family
from tools.church.linefit import FittedLine, intersect

__all__ = [
    "Detection",
    "MeshBuild",
    "build_mesh",
    "load_detection",
    "parse_detection",
]


@dataclass(frozen=True)
class Detection:
    """Fitted lines from one panel, already lifted to full-sheet pixels."""

    panel: str
    primary_angle_deg: float
    secondary_angle_deg: float
    family_a: tuple[FittedLine, ...]
    family_b: tuple[FittedLine, ...]


@dataclass(frozen=True)
class MeshBuild:
    """A fitted mesh plus the two families it came from."""

    mesh: GraticuleMesh
    family_a: LatticeFamily
    family_b: LatticeFamily


def parse_detection(text: str) -> Detection:
    """Parse a detection artifact, converting reduced-crop pixels to full-sheet.

    Detection runs on a block-reduced crop of one panel, so its coordinates are
    local and scaled. Converting here, once, means no downstream code has to
    remember which pixel space it is holding - the mistake that put the pilot's
    two panels on top of each other.
    """
    raw = json.loads(text)
    for key in ("panel", "factor", "origin", "family_a", "family_b"):
        if key not in raw:
            raise ValueError(f"detection artifact is missing {key!r}")

    factor = float(raw["factor"])
    if factor <= 0:
        raise ValueError(f"detection factor must be positive, got {factor}")
    origin_x, origin_y = raw["origin"]

    def lines(key: str) -> tuple[FittedLine, ...]:
        return tuple(
            FittedLine(
                cx=float(entry["cx"]),
                cy=float(entry["cy"]),
                dx=float(entry["dx"]),
                dy=float(entry["dy"]),
                extent_px=float(entry["extent_px"]),
                support=int(entry["support"]),
            ).scaled(factor, float(origin_x), float(origin_y))
            for entry in raw[key]
        )

    return Detection(
        panel=str(raw["panel"]),
        primary_angle_deg=float(raw.get("primary_angle_deg", 0.0)),
        secondary_angle_deg=float(raw.get("secondary_angle_deg", 0.0)),
        family_a=lines("family_a"),
        family_b=lines("family_b"),
    )


def load_detection(path: pathlib.Path) -> Detection:
    """Read a detection artifact from disk."""
    return parse_detection(path.read_text(encoding="utf-8"))


def build_mesh(
    detection: Detection,
    anchor: GraticuleAnchor,
    tolerance: float,
    min_extent: float | tuple[float, float] = 0.0,
) -> MeshBuild:
    """Fit both families to lattices and cross them into a control mesh.

    Every pair of lines is crossed, so a family of 5 meridians and one of 6
    parallels yields 30 controls spread over the whole panel rather than the
    handful a human would place by hand.

    `min_extent` may be given per family. The two families rarely face the same
    competition: on the Inverness south panel the roads follow the coast north
    to south, so they impersonate meridians and not parallels. Filtering both
    families at the meridians' threshold would discard real parallels, and at
    the parallels' threshold the meridian family fits a nonsense 967 px pitch
    through a bundle of roads.
    """
    extent_a, extent_b = (
        min_extent if isinstance(min_extent, tuple) else (min_extent, min_extent)
    )
    family_a = fit_family(list(detection.family_a), tolerance, extent_a)
    family_b = fit_family(list(detection.family_b), tolerance, extent_b)
    if family_a is None or family_b is None:
        missing = [
            name
            for name, family in (("A", family_a), ("B", family_b))
            if family is None
        ]
        raise ValueError(
            f"no consistent lattice for family {', '.join(missing)} on panel "
            f"{detection.panel!r}; detection found too few lines, or they are "
            f"not regularly spaced"
        )

    intersections: dict[LatticeIndex, tuple[float, float]] = {}
    for placed_a in family_a.lines:
        for placed_b in family_b.lines:
            crossing = intersect(placed_a.line, placed_b.line)
            if crossing is None:
                continue
            intersections[LatticeIndex(placed_a.index, placed_b.index)] = crossing

    if not intersections:
        raise ValueError(f"families on panel {detection.panel!r} never cross")

    return MeshBuild(
        mesh=GraticuleMesh(anchor, intersections),
        family_a=family_a,
        family_b=family_b,
    )
