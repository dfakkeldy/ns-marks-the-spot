"""Fit and group the straight linework detected on a Church sheet.

Detection itself needs OpenCV, but everything after it is arithmetic. Keeping
that arithmetic here - pure stdlib, like the rest of `tools/church` - means the
control mesh can be re-derived from a committed detection artifact on any
machine, including CI, with no third-party dependency at all.

Two jobs:

`merge_collinear` turns the Hough transform's shower of short, broken segments
back into the small number of infinite lines that actually exist on the sheet.
A printed graticule rule crossing a panel is reported as dozens of fragments
wherever a label, a river, or fold damage interrupts it.

`intersect` crosses two such lines. Meridians and parallels are deliberately
NOT assumed perpendicular: on the conic construction Church used they need not
cross at right angles in sheet pixel space, and forcing perpendicularity would
bias every control point in the mesh.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

__all__ = [
    "FittedLine",
    "Segment",
    "angular_distance",
    "canonical_direction",
    "dominant_angles",
    "fit_line",
    "intersect",
    "merge_collinear",
    "segment_angle_deg",
    "split_families",
]

Segment = tuple[float, float, float, float]
"""A detected line segment as (x0, y0, x1, y1)."""


def segment_angle_deg(segment: Segment) -> float:
    """Orientation of a segment in degrees, folded into [0, 180).

    A line has no direction, only an orientation: a segment drawn right-to-left
    is the same rule as one drawn left-to-right.
    """
    x0, y0, x1, y1 = segment
    return math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180.0


def angular_distance(a: float, b: float) -> float:
    """Smallest angle between two orientations, in [0, 90].

    Orientations live on a circle of circumference 180, so 179 degrees and
    1 degree are 2 degrees apart, not 178.
    """
    difference = abs(a - b) % 180.0
    return min(difference, 180.0 - difference)


def canonical_direction(dx: float, dy: float) -> tuple[float, float]:
    """Orient an axis by the sign of its dominant component.

    A line fit returns an axis, and the sign of that axis is arbitrary - an
    eigen or singular-value decomposition may hand back either end. Averaging
    raw fitted directions therefore lets arbitrarily-flipped lines cancel.
    Orienting by x alone is also unstable around 90 degrees: Victoria's
    meridians included tiny positive dx values with both dy signs. Use x for a
    horizontal axis and y for a vertical one, where the sign is well-defined.
    """
    dominant = dx if abs(dx) >= abs(dy) else dy
    if dominant < 0.0:
        return -dx, -dy
    return dx, dy


@dataclass(frozen=True)
class FittedLine:
    """An infinite line: a point on it, a unit direction, and its support."""

    cx: float
    cy: float
    dx: float
    dy: float
    extent_px: float
    support: int

    @property
    def angle_deg(self) -> float:
        return math.degrees(math.atan2(self.dy, self.dx)) % 180.0

    @property
    def normal(self) -> tuple[float, float]:
        """Unit normal, the direction rotated a quarter turn."""
        return -self.dy, self.dx

    def offset_from(self, x: float, y: float) -> float:
        """Signed perpendicular distance from a point to this line."""
        nx, ny = self.normal
        return nx * (x - self.cx) + ny * (y - self.cy)

    def scaled(self, factor: float, origin_x: float, origin_y: float) -> "FittedLine":
        """Lift a line fitted on a reduced crop back to full-sheet pixels.

        Direction is scale- and translation-invariant, so only the anchor point
        and the extent move.
        """
        return FittedLine(
            cx=self.cx * factor + origin_x,
            cy=self.cy * factor + origin_y,
            dx=self.dx,
            dy=self.dy,
            extent_px=self.extent_px * factor,
            support=self.support,
        )


def fit_line(points: list[tuple[float, float]]) -> FittedLine:
    """Total-least-squares line through a point cloud.

    Ordinary least squares minimises vertical residuals, which blows up as a
    line approaches vertical - and half the graticule IS near-vertical. Total
    least squares minimises perpendicular distance instead, so it is stable at
    every orientation.

    For two dimensions the principal axis is the dominant eigenvector of the
    2x2 covariance matrix, which has a closed form. No SVD, and no numpy.
    """
    if len(points) < 2:
        raise ValueError(f"need at least 2 points to fit a line, got {len(points)}")

    count = float(len(points))
    mean_x = sum(x for x, _ in points) / count
    mean_y = sum(y for _, y in points) / count

    sxx = sum((x - mean_x) ** 2 for x, _ in points)
    syy = sum((y - mean_y) ** 2 for _, y in points)
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in points)

    if abs(sxy) < 1e-12:
        # Already axis-aligned; the covariance matrix is diagonal.
        dx, dy = (1.0, 0.0) if sxx >= syy else (0.0, 1.0)
    else:
        # Larger eigenvalue of [[sxx, sxy], [sxy, syy]].
        eigenvalue = 0.5 * (sxx + syy + math.hypot(sxx - syy, 2.0 * sxy))
        # Both rows give the eigenvector; take the better-conditioned one.
        if abs(eigenvalue - syy) >= abs(eigenvalue - sxx):
            dx, dy = eigenvalue - syy, sxy
        else:
            dx, dy = sxy, eigenvalue - sxx
        norm = math.hypot(dx, dy)
        dx, dy = dx / norm, dy / norm

    dx, dy = canonical_direction(dx, dy)
    projections = [(x - mean_x) * dx + (y - mean_y) * dy for x, y in points]
    return FittedLine(
        cx=mean_x,
        cy=mean_y,
        dx=dx,
        dy=dy,
        extent_px=max(projections) - min(projections),
        support=1,
    )


def merge_collinear(
    segments: list[Segment], angle_tol: float, offset_tol: float
) -> list[FittedLine]:
    """Group segments that lie on the same line and refit each group as one.

    Grouping is greedy against the seed segment rather than transitive: chaining
    "near enough" segments pairwise would let a long shallow arc - a river, a
    road - walk its way into one line, which is exactly the false positive the
    lattice fit downstream is trying to avoid.
    """
    lines: list[FittedLine] = []
    used = [False] * len(segments)
    for index, seed in enumerate(segments):
        if used[index]:
            continue
        used[index] = True
        group = [seed]
        seed_angle = segment_angle_deg(seed)
        length = math.hypot(seed[2] - seed[0], seed[3] - seed[1])
        if length == 0.0:
            continue
        nx, ny = -(seed[3] - seed[1]) / length, (seed[2] - seed[0]) / length
        seed_offset = nx * seed[0] + ny * seed[1]

        for other_index in range(index + 1, len(segments)):
            if used[other_index]:
                continue
            other = segments[other_index]
            if angular_distance(segment_angle_deg(other), seed_angle) > angle_tol:
                continue
            if abs(nx * other[0] + ny * other[1] - seed_offset) > offset_tol:
                continue
            group.append(other)
            used[other_index] = True

        points = [(s[0], s[1]) for s in group] + [(s[2], s[3]) for s in group]
        fitted = fit_line(points)
        lines.append(
            FittedLine(
                cx=fitted.cx,
                cy=fitted.cy,
                dx=fitted.dx,
                dy=fitted.dy,
                extent_px=fitted.extent_px,
                support=len(group),
            )
        )
    return lines


def dominant_angles(
    segments: list[Segment], separation_deg: float = 25.0, smooth: int = 5
) -> tuple[float, float]:
    """The two busiest orientations present, found from the data.

    The second family is searched only outside `separation_deg` of the first,
    otherwise the winner's own shoulder wins again and both families come back
    as the same set of lines.

    These are a fallback. Where a printed degree/minute label has actually been
    read off the scan, pin the angles to it instead: a label is evidence, and a
    histogram peak is a vote that dense coastal hachure can win.
    """
    if not segments:
        raise ValueError("no segments to take angles from")

    bins = [0] * 180
    for segment in segments:
        bins[int(segment_angle_deg(segment)) % 180] += 1

    half = smooth // 2
    smoothed = [
        sum(bins[(index + offset) % 180] for offset in range(-half, half + 1)) / float(smooth)
        for index in range(180)
    ]

    primary = max(range(180), key=lambda i: smoothed[i])
    secondary = max(
        (i for i in range(180) if angular_distance(i + 0.5, primary + 0.5) >= separation_deg),
        key=lambda i: smoothed[i],
        default=primary,
    )
    return primary + 0.5, secondary + 0.5


def split_families(
    segments: list[Segment], primary: float, secondary: float, angle_tol: float
) -> tuple[list[Segment], list[Segment]]:
    """Partition segments into the two angular families.

    A segment near neither angle is dropped, and a segment near both - possible
    only if the two families are within `2 * angle_tol` of each other - goes to
    whichever it is closer to, so the two families can never share a segment.
    """
    family_a: list[Segment] = []
    family_b: list[Segment] = []
    for segment in segments:
        angle = segment_angle_deg(segment)
        to_primary = angular_distance(angle, primary)
        to_secondary = angular_distance(angle, secondary)
        if to_primary > angle_tol and to_secondary > angle_tol:
            continue
        (family_a if to_primary <= to_secondary else family_b).append(segment)
    return family_a, family_b


def intersect(a: FittedLine, b: FittedLine) -> tuple[float, float] | None:
    """Where two infinite lines cross, or None if they are parallel."""
    denominator = a.dx * (-b.dy) - a.dy * (-b.dx)
    if abs(denominator) < 1e-12:
        return None
    t = ((b.cx - a.cx) * (-b.dy) - (b.cy - a.cy) * (-b.dx)) / denominator
    return a.cx + a.dx * t, a.cy + a.dy * t
