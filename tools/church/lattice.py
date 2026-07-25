"""Fit a regular 1-D lattice to one family of graticule lines.

A printed graticule is a geometric construction, not topography: within a panel
its meridians are evenly spaced and so are its parallels. Fitting that
regularity does three jobs at once.

1. It rejects impostors. Roads, county boundaries and railway lines can run
   straight for thousands of pixels at the right angle, but they do not land on
   a regular pitch, so they fall out of the lattice.
2. It merges duplicate detections of one rule that the Hough transform reported
   twice.
3. It names every surviving line with an integer index. That is what lets a
   SINGLE intersection whose printed degree/minute label was read off the scan
   anchor the entire mesh to real coordinates - see `graticule.py`.

Missing rules are legal and expected: where a rule is buried under hachure for
its whole length it simply has no line at that index, and the lattice reports
the gap rather than inventing a control point there.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from tools.church.linefit import FittedLine, canonical_direction

__all__ = [
    "LatticeFamily",
    "LatticeFit",
    "PlacedLine",
    "candidate_spacings",
    "fit_family",
    "fit_spacing",
    "merge_duplicates",
    "perpendicular_offsets",
]


@dataclass(frozen=True)
class LatticeFit:
    """A regular pitch fitted to a set of 1-D positions."""

    spacing: float
    intercept: float
    indices: tuple[int, ...]
    rms: float


@dataclass(frozen=True)
class PlacedLine:
    """A graticule line together with the lattice index it was assigned."""

    line: FittedLine
    offset: float
    index: int


@dataclass(frozen=True)
class LatticeFamily:
    """One fitted family: its pitch, its shared orientation, and its lines."""

    spacing_px: float
    rms_px: float
    reference: tuple[float, float]
    direction: tuple[float, float]
    normal: tuple[float, float]
    lines: tuple[PlacedLine, ...]

    @property
    def indices(self) -> tuple[int, ...]:
        return tuple(placed.index for placed in self.lines)

    @property
    def missing_indices(self) -> tuple[int, ...]:
        """Lattice positions with no detected rule, between the ones found."""
        found = set(self.indices)
        return tuple(i for i in range(min(found), max(found) + 1) if i not in found)


def perpendicular_offsets(
    lines: list[FittedLine],
) -> tuple[list[float], tuple[float, float], tuple[float, float], tuple[float, float]]:
    """Collapse a family to 1-D: each line's signed distance from a shared datum.

    Returns `(offsets, reference, direction, normal)`.

    Directions are sign-normalised before averaging. A line fit returns an axis
    whose sign is arbitrary, and a single flipped vector would otherwise tilt
    the family's mean direction and shear every offset along with it.

    The NORMAL is then oriented by its dominant axis: along increasing sheet x
    for a near-horizontal normal (meridians), or increasing y for a near-
    vertical normal (parallels). That fixes which end of the family gets lattice
    index 0 - westernmost for meridians, northernmost for parallels - no matter
    how the family happens to be tilted.

    Without this the index direction is decided by the direction
    canonicalisation, which flips at exactly 90 degrees. The Inverness north
    meridians stand at 84.5 degrees and the south meridians at 90.1, so the two
    panels landed index 0 on opposite sides of the sheet and the same anchor
    convention produced longitudes running backwards on one of them.
    """
    if not lines:
        raise ValueError("cannot take offsets of an empty family")

    count = float(len(lines))
    reference = (
        sum(line.cx for line in lines) / count,
        sum(line.cy for line in lines) / count,
    )

    sum_dx = 0.0
    sum_dy = 0.0
    for line in lines:
        dx, dy = canonical_direction(line.dx, line.dy)
        sum_dx += dx
        sum_dy += dy
    norm = math.hypot(sum_dx, sum_dy)
    if norm < 1e-12:
        raise ValueError("family directions cancel; these lines are not one family")
    direction = (sum_dx / norm, sum_dy / norm)
    normal = (-direction[1], direction[0])
    dominant = normal[0] if abs(normal[0]) >= abs(normal[1]) else normal[1]
    if dominant < 0.0:
        normal = (-normal[0], -normal[1])

    offsets = [
        normal[0] * (line.cx - reference[0]) + normal[1] * (line.cy - reference[1])
        for line in lines
    ]
    return offsets, reference, direction, normal


def merge_duplicates(
    lines: list[FittedLine], offsets: list[float], tolerance: float
) -> tuple[list[FittedLine], list[float]]:
    """Collapse lines closer together than `tolerance` into one apiece.

    The survivor is the one with the greater extent - the longer detection is
    the better-supported fit of the same rule.
    """
    if len(lines) != len(offsets):
        raise ValueError(f"got {len(lines)} lines but {len(offsets)} offsets")

    order = sorted(range(len(lines)), key=lambda i: offsets[i])
    kept_lines: list[FittedLine] = []
    kept_offsets: list[float] = []
    for index in order:
        line, offset = lines[index], offsets[index]
        if kept_offsets and abs(offset - kept_offsets[-1]) < tolerance:
            if line.extent_px > kept_lines[-1].extent_px:
                kept_lines[-1] = line
                kept_offsets[-1] = offset
            continue
        kept_lines.append(line)
        kept_offsets.append(offset)
    return kept_lines, kept_offsets


def candidate_spacings(offsets: list[float], tolerance: float) -> list[float]:
    """Every plausible pitch: each observed gap, and its integer fractions.

    The fractions matter because a rule may be missing: with index 2 absent,
    the observed gap from 1 to 3 is twice the true pitch, and only dividing it
    recovers the real one. Fractions below `2 * tolerance` are dropped - at that
    size the fit tolerance alone would let almost any pitch through.
    """
    ordered = sorted(offsets)
    found: set[float] = set()
    for lower, upper in zip(ordered, ordered[1:]):
        gap = upper - lower
        for divisor in range(1, 5):
            if gap / divisor > tolerance * 2.0:
                found.add(gap / divisor)
    return sorted(found)


def fit_spacing(offsets: list[float], tolerance: float) -> LatticeFit | None:
    """Best regular pitch through a set of 1-D positions, or None.

    Ties are broken toward the LARGEST pitch that still fits. A smaller pitch
    always fits too - it just invents phantom rules between the real ones and
    then reports them as missing - so preferring the largest is what keeps the
    lattice honest about how many rules the sheet actually carries.
    """
    if len(offsets) < 2:
        return None

    ordered = sorted(offsets)
    best: LatticeFit | None = None
    for spacing in candidate_spacings(ordered, tolerance):
        indices = [round((value - ordered[0]) / spacing) for value in ordered]
        if len(set(indices)) < len(indices):
            # Two rules assigned the same lattice position: pitch is too coarse.
            continue

        refined = _least_squares_line(indices, ordered)
        if refined is None:
            continue
        refined_spacing, intercept = refined
        residuals = [
            value - (intercept + index * refined_spacing)
            for index, value in zip(indices, ordered)
        ]
        rms = math.sqrt(sum(r * r for r in residuals) / len(residuals))
        if rms > tolerance:
            continue
        if best is None or refined_spacing > best.spacing:
            best = LatticeFit(refined_spacing, intercept, tuple(indices), rms)
    return best


def _least_squares_line(indices: list[int], values: list[float]) -> tuple[float, float] | None:
    """Least-squares `value = slope * index + intercept`."""
    count = float(len(indices))
    sum_i = float(sum(indices))
    sum_ii = float(sum(i * i for i in indices))
    sum_v = sum(values)
    sum_iv = sum(i * v for i, v in zip(indices, values))

    determinant = sum_ii * count - sum_i * sum_i
    if abs(determinant) < 1e-12:
        return None
    slope = (sum_iv * count - sum_i * sum_v) / determinant
    intercept = (sum_ii * sum_v - sum_i * sum_iv) / determinant
    return slope, intercept


def fit_family(
    lines: list[FittedLine], tolerance: float, min_extent: float = 0.0
) -> LatticeFamily | None:
    """Filter, deduplicate, and index one angular family. None if no pitch fits."""
    long_enough = [line for line in lines if line.extent_px >= min_extent]
    if len(long_enough) < 2:
        return None

    offsets, reference, direction, normal = perpendicular_offsets(long_enough)
    merged_lines, merged_offsets = merge_duplicates(long_enough, offsets, tolerance)
    fit = fit_spacing(merged_offsets, tolerance)
    if fit is None:
        return None

    return LatticeFamily(
        spacing_px=fit.spacing,
        rms_px=fit.rms,
        reference=reference,
        direction=direction,
        normal=normal,
        lines=tuple(
            PlacedLine(line=line, offset=offset, index=index)
            for line, offset, index in zip(merged_lines, merged_offsets, fit.indices)
        ),
    )
