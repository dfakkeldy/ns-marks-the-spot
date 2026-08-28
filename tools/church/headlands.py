"""Find the headland Church engraved, and measure it by the modern coast's own rule.

Why this exists
---------------
`drawn.py` reads an island off the scan by tracing its closed outline and taking
the shoelace centroid - the same definition already applied to the modern
polygon. That works because an island is an area. A headland is not: it is a
point on an open curve, and it has no centroid to compare.

So the north panel had no drawn side at all. It carried two check points, which
is not a measurement, and every attempt to widen that supply ran into the fact
that "the northernmost vertex in this box" names one physical point on the whole
of Cape Breton no matter how many boxes ask for it.

`chords.py` solved the modern half: deviation from the chord joining the ends of
a coastal stretch names a headland without anyone judging where a coast "turns",
and it survives a shore that trends. This module supplies the other half, so both
sides of a north residual come from that one rule.

Prominence is the enclosed area of a headland
---------------------------------------------
The anti-circularity argument is `drawn.py`'s, transposed. Selecting the ink
nearest the predicted pixel would drag every answer toward the transform under
test and dissolve a systematic offset into apparent scatter. So selection is
decided by PROMINENCE - how far the tip stands off its own chord - which is a
property of the drawn shape alone and carries no positional information. The
prediction only crops a tile and discards features kilometres away.

Finding the shoreline without deciding which side is the sea
------------------------------------------------------------
The engraved coastline is a stroke, and the obvious move - trace the ink and use
it as a path - fails on this map: at the dilation needed to close a dashed
hairline the coast stroke merges with hachure, lot lines and lettering, and its
traced outline wanders into every one of them.

The paper does not have that problem. Fill the NON-ink pixels and the shoreline
appears as the boundary between two fills, clean on the seaward side whatever the
land is carrying. Which fill is the sea never has to be decided: every large
region is measured, and prominence chooses, exactly as enclosed area chooses in
`drawn.py`.

Paper is filled 4-connected while ink is traced 8-connected. That pairing is not
a detail - a single-pixel diagonal hairline is watertight to a 4-connected fill
and porous to an 8-connected one, and Church draws a great deal of coast as
single-pixel diagonal steps.

Both faces of the stroke are read, and that is the point
--------------------------------------------------------
The sea's fill and the land's fill share the shoreline, so one headland is found
twice - once from each face of the stroke. That is the only free corroboration
in this pipeline: two independent traces of the same engraved line. Their
midpoint also cancels the stroke's own thickness, which a single face carries as
a bias of half a stroke plus the dilation radius.

Pure stdlib, like the rest of the decision-making modules. The raster side lives
in `headland_checks.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import math

from tools.church.chords import Plane, cyclic_runs, path_extreme
from tools.church.drawn import InkMask, trace_outer_boundary

__all__ = [
    "MERGE_TOLERANCE_PX",
    "PROMINENCE_RATIO_MAX",
    "PROMINENCE_RATIO_MIN",
    "HeadlandCandidate",
    "HeadlandSelection",
    "coast_path",
    "graticule_segments",
    "headlands_in",
    "merge_opposing_faces",
    "paper_regions",
    "segment_pixels",
    "select_headland",
]

_GRATICULE_EXTENSION = 20000.0
"""How far past the control mesh a graticule line is assumed to keep running, in
source pixels (~54 km). The Inverness sheet is ~29,000 px tall, so this reaches
its edges from anywhere on it."""


def graticule_segments(points) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """The engraved graticule as line segments in full-sheet pixels.

    Built from the committed control mesh rather than detected again. Those
    points ARE the graticule intersections - they are what the warp is fitted on -
    so joining consecutive points that share a longitude gives a meridian and
    consecutive points sharing a latitude gives a parallel. Nothing new has to be
    found, and the lines cannot drift out of step with the transform being tested
    because they come from the same file it does.
    """
    segments = []
    # Each family is sorted along ITSELF: a meridian by latitude, a parallel by
    # longitude. Sorting a meridian by pixel_x instead would order it by the
    # coordinate that barely varies along it and zig-zag the segments.
    for family_of, along in (
        (lambda p: p.lon, lambda p: p.lat),
        (lambda p: p.lat, lambda p: p.lon),
    ):
        families: dict[float, list] = {}
        for point in points:
            families.setdefault(round(family_of(point), 6), []).append(point)
        for family in families.values():
            if len(family) < 2:
                continue
            ordered = sorted(family, key=along)
            first, last = ordered[0], ordered[-1]
            dx = last.pixel_x - first.pixel_x
            dy = last.pixel_y - first.pixel_y
            span = math.hypot(dx, dy)
            if span < 1e-6:
                continue
            # Extended well past the mesh, because the ENGRAVING is. The control
            # mesh stops at the westernmost intersection Church labelled, around
            # -61.0, while his parallels carry on ruled across the open Gulf -
            # which is precisely the water these tiles sit in. Segments that
            # stopped at the mesh would leave the lines uncut exactly where they
            # do the damage.
            reach = _GRATICULE_EXTENSION
            segments.append(
                (
                    (first.pixel_x - dx / span * reach, first.pixel_y - dy / span * reach),
                    (last.pixel_x + dx / span * reach, last.pixel_y + dy / span * reach),
                )
            )
    return segments


RIVAL_STRETCH_SHARE = 0.25
"""How long a second shoreline run must be, against the longest, to be a rival.

The first north run demanded EXACTLY one non-border run and refused all nine
genuine coastal tiles because of it. The tiles show why: Church's sea carries the
engraved graticule, roads running down to the water and the odd inset rule, and
every one of those that touches the tile edge makes the paper fill detour around
it. Those detours are non-border runs, and they are five or ten pixels long.

The guard's intent was to refuse a tile holding two separate STRETCHES OF COAST,
which no single chord can describe. A detour around a road is not one. So the
longest run is taken and a second is only a rival if it is comparable - which
keeps the refusal that matters and drops the one that was only ever an artifact
of how the boundary is walked.
"""

MERGE_TOLERANCE_PX = 24.0
"""How far apart the two faces of one engraved stroke may sit.

The gap is the stroke's own width plus twice the dilation radius. Inverness
draws its coast at roughly 3 source pixels and this pipeline dilates by up to 4,
so about 11 px; the allowance is doubled again because a trace rounds a sharp
tip on the outside of the curve and the two faces do not round it equally.

Too generous and two genuinely different features get averaged into one that is
neither. Too tight and the corroboration is lost and every point carries the
stroke-thickness bias. It is checked against `sides` in the audit: a run where
most points come back with `sides == 1` means this is too tight.
"""

PROMINENCE_RATIO_MIN = 0.5
PROMINENCE_RATIO_MAX = 2.0
"""How far the drawn prominence may differ from the modern one and still be it.

Set as a prior, BEFORE any north run, and stated here so it cannot quietly
become a fitted parameter. The reasoning: an 1884 engraver generalising a coast
at roughly 1:63,000 rounds a headland off rather than inventing or deleting one,
so a factor of two either way should contain the honest matches and still reject
a tip paired with the wrong cove.

`drawn.py`'s area band was opened wide and then closed once the run produced
evidence, and its docstring says plainly that doing so flatters the error. If
these numbers move after a north run, the same warning applies and belongs
beside them.
"""


def paper_regions(mask: InkMask, min_area: int) -> list[set]:
    """Connected regions of NON-ink pixels, largest first.

    4-connected, deliberately. Ink is traced 8-connected in `drawn.py`, and the
    two have to be topological opposites or the pair is inconsistent: an
    8-connected paper fill walks diagonally between two ink pixels that an
    8-connected ink trace considers joined, so a sealed shoreline leaks and the
    sea swallows the land.

    `min_area` is what keeps this tractable and what keeps it honest. The fill
    walks paper, which is dense, so a tile costs its own area rather than its ink
    - and the small cells a map is full of (fields, lots, the insides of letters)
    are not shores and must not be offered as candidates.
    """
    seen: set = set()
    found: list[set] = []
    for y in range(mask.height):
        for x in range(mask.width):
            start = (x, y)
            if start in mask.pixels or start in seen:
                continue
            region = {start}
            seen.add(start)
            stack = [start]
            while stack:
                cx, cy = stack.pop()
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    neighbour = (cx + dx, cy + dy)
                    if not (0 <= neighbour[0] < mask.width):
                        continue
                    if not (0 <= neighbour[1] < mask.height):
                        continue
                    if neighbour in mask.pixels or neighbour in seen:
                        continue
                    seen.add(neighbour)
                    region.add(neighbour)
                    stack.append(neighbour)
            if len(region) >= min_area:
                found.append(region)
    found.sort(key=len, reverse=True)
    return found


def segment_pixels(
    segments: list[tuple[tuple[float, float], tuple[float, float]]],
    radius: int,
    width: int,
    height: int,
) -> set:
    """Every tile pixel within `radius` of one of these line segments.

    Used to hand `coast_path` the engraved graticule. Church rules his parallels
    and meridians straight across the sea, and the paper fill has no choice but
    to follow them: on the first north run six of nine tiles chose a "headland"
    sitting on a graticule line at the tile edge, because an excursion out along
    a ruled line and back dwarfs any real cove.
    """
    marked: set = set()
    for (x0, y0), (x1, y1) in segments:
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for step in range(steps + 1):
            t = step / steps if steps else 0.0
            cx = int(round(x0 + (x1 - x0) * t))
            cy = int(round(y0 + (y1 - y0) * t))
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    px, py = cx + dx, cy + dy
                    if 0 <= px < width and 0 <= py < height:
                        marked.add((px, py))
    return marked


def coast_path(
    region: set, mask: InkMask, excluded: set | frozenset = frozenset()
) -> list[tuple[int, int]]:
    """The shoreline face of one paper region: its boundary, cut where it is not coast.

    A region's traced boundary is closed - it follows the shoreline and then
    returns along the tile border - and a closed ring has no chord, because its
    two ends are the same vertex. Cutting at the border leaves the part that is
    actually coast.

    `excluded` is cut in exactly the same way, and carries the engraved
    graticule. Cutting rather than erasing is deliberate: rubbing a ruled line
    out of the ink would also rub out the shoreline everywhere the two cross, and
    the paper fill would pour through the gap. Cutting damages nothing - it only
    says that the stretch where the boundary runs along a ruled line is not a
    stretch of coast, which is exactly what the tile edge already says.

    The longest surviving stretch is the shoreline; see `RIVAL_STRETCH_SHARE`.
    """
    ring = trace_outer_boundary(region)
    if len(ring) < 3:
        raise ValueError(f"region of {len(region)} px has no traceable boundary")

    edge = [mask.on_border(x, y) or (x, y) in excluded for x, y in ring]
    if not any(edge):
        raise ValueError(
            "the region never reaches the tile border, so its boundary is closed "
            "and has no chord: paper enclosed by ink is a field, a lake or the "
            "inside of a letter, not a shore"
        )

    runs = sorted(
        cyclic_runs(ring, [not on_edge for on_edge in edge]), key=len, reverse=True
    )
    if not runs:
        raise ValueError(
            "the region's whole boundary lies on the tile edge, so nothing in it "
            "is drawn coast"
        )
    if len(runs) > 1 and len(runs[1]) > RIVAL_STRETCH_SHARE * len(runs[0]):
        raise ValueError(
            f"the tile holds two comparable stretches of coast ({len(runs[0])} and "
            f"{len(runs[1])} vertices) and no single chord describes both; tighten "
            f"the tile onto one"
        )
    return runs[0]


@dataclass(frozen=True)
class HeadlandCandidate:
    """One point read off the engraving as the most prominent on its stretch.

    Coordinates are tile-local pixels. Nothing here has been through the
    transform under test, which is what makes it usable as a held-out check.
    """

    x: float
    y: float
    prominence_m: float
    """Signed. The sign follows the traversal direction, which is arbitrary, so
    it is comparable BETWEEN the two faces of one stroke and not to anything
    else."""
    runner_up_m: float | None
    path_length: int
    region_pixels: int
    sides: int = 1
    """How many faces of the stroke produced this point. 2 is corroborated and
    has the stroke's thickness cancelled; 1 does not."""
    paths: tuple = field(default=(), compare=False, repr=False)
    """The traced shoreline(s) this came from, kept for the QA sheet. Looking at
    them is not optional: a detector that locks onto a lake shore or the edge of
    a hachure field is worse than an eyeball, because it is wrong at scale."""


def headlands_in(
    mask: InkMask,
    min_area: int,
    min_prominence_m: float,
    plane: Plane,
    excluded: set | frozenset = frozenset(),
) -> list[HeadlandCandidate]:
    """Every prominent drawn headland in a tile, one per usable paper region.

    Regions whose boundary cannot carry a chord - enclosed paper, several
    stretches of shore, nothing prominent enough - are skipped rather than
    reported. A region that refuses is not evidence about the map; it is a
    region this rule has nothing to say about.
    """
    found: list[HeadlandCandidate] = []
    for region in paper_regions(mask, min_area):
        try:
            path = coast_path(region, mask, excluded)
            feature = path_extreme(path, min_prominence_m, plane)
        except ValueError:
            continue
        found.append(
            HeadlandCandidate(
                x=float(feature.x),
                y=float(feature.y),
                prominence_m=feature.prominence_m,
                runner_up_m=feature.runner_up_m,
                path_length=feature.run_length,
                region_pixels=len(region),
                paths=(tuple(path),),
            )
        )
    return found


def merge_opposing_faces(
    candidates: list[HeadlandCandidate], tolerance_px: float = MERGE_TOLERANCE_PX
) -> list[HeadlandCandidate]:
    """Fold the two faces of one engraved stroke into a single point at their midpoint.

    A merge requires OPPOSITE signs, not just nearness. The boundary trace walks
    clockwise around whatever region it is given, so the shoreline shared by the
    sea's fill and the land's fill is walked in opposite directions and one bulge
    yields two deviations of opposite sign. Two nearby readings that agree in
    sign are therefore not two views of one stroke - they are two readings that
    genuinely disagree, and averaging them would hide that.

    The midpoint is worth the trouble: each face sits half a stroke plus the
    dilation radius off the engraved line, on opposite sides, so the average
    lands on the line itself.
    """
    merged: list[HeadlandCandidate] = []
    taken: set[int] = set()
    for i, candidate in enumerate(candidates):
        if i in taken:
            continue
        partner = None
        for j in range(i + 1, len(candidates)):
            if j in taken:
                continue
            other = candidates[j]
            if candidate.prominence_m * other.prominence_m >= 0.0:
                continue
            if abs(other.x - candidate.x) > tolerance_px:
                continue
            if abs(other.y - candidate.y) > tolerance_px:
                continue
            partner = (j, other)
            break
        if partner is None:
            merged.append(candidate)
            continue
        j, other = partner
        taken.add(j)
        merged.append(
            HeadlandCandidate(
                x=(candidate.x + other.x) / 2.0,
                y=(candidate.y + other.y) / 2.0,
                prominence_m=(abs(candidate.prominence_m) + abs(other.prominence_m)) / 2.0,
                runner_up_m=max(
                    (v for v in (candidate.runner_up_m, other.runner_up_m) if v is not None),
                    key=abs,
                    default=None,
                ),
                path_length=max(candidate.path_length, other.path_length),
                region_pixels=max(candidate.region_pixels, other.region_pixels),
                sides=2,
                paths=candidate.paths + other.paths,
            )
        )
    return merged


@dataclass(frozen=True)
class HeadlandSelection:
    """The outcome of choosing one drawn headland, including why, and the runner-up."""

    candidate: HeadlandCandidate | None
    reason: str
    considered: int = 0
    prominence_ratio: float | None = None
    runner_up_prominence_ratio: float | None = None
    distance_px: float | None = None


def select_headland(
    candidates: list[HeadlandCandidate],
    expected_prominence_m: float,
    prediction: tuple[float, float],
    radius_px: float,
    ratio_min: float = PROMINENCE_RATIO_MIN,
    ratio_max: float = PROMINENCE_RATIO_MAX,
) -> HeadlandSelection:
    """Pick the one drawn headland matching a modern one, or refuse.

    Order matters, and it is `drawn.py`'s order. Nearness only narrows the field
    to this stretch of coast; prominence does the choosing, and it does not know
    where the transform predicted the tip would be. Reverse the two and the
    routine hands the prediction back to whoever asked for it.

    Magnitude, not sign: the sign of a deviation follows the direction the
    boundary happened to be walked, which is a property of the tracer and not of
    the coast, so it is not comparable between the drawing and the modern data.
    """
    if expected_prominence_m <= 0:
        raise ValueError(
            f"expected prominence must be positive, got {expected_prominence_m}"
        )

    px, py = prediction
    near = [
        candidate
        for candidate in candidates
        if ((candidate.x - px) ** 2 + (candidate.y - py) ** 2) ** 0.5 <= radius_px
    ]
    if not near:
        return HeadlandSelection(
            None, f"no drawn headland within {radius_px:.0f} px of the prediction"
        )

    def ratio(candidate: HeadlandCandidate) -> float:
        return abs(candidate.prominence_m) / expected_prominence_m

    fits = [c for c in near if ratio_min <= ratio(c) <= ratio_max]
    if not fits:
        best = min(near, key=lambda c: abs(ratio(c) - 1.0))
        return HeadlandSelection(
            None,
            f"no headland of the right prominence: {len(near)} nearby, closest ratio "
            f"{ratio(best):.2f}, band {ratio_min}-{ratio_max}",
            considered=len(near),
            runner_up_prominence_ratio=ratio(best),
        )

    if len(fits) > 1:
        ranked = sorted(fits, key=lambda c: abs(ratio(c) - 1.0))
        return HeadlandSelection(
            None,
            f"ambiguous: {len(fits)} drawn headlands fit the prominence band (ratios "
            f"{', '.join(f'{ratio(c):.2f}' for c in ranked[:4])}); the tile needs a "
            f"human, or the box needs tightening",
            considered=len(near),
            prominence_ratio=ratio(ranked[0]),
            runner_up_prominence_ratio=ratio(ranked[1]),
        )

    chosen = fits[0]
    others = [c for c in near if c is not chosen]
    runner_up = min(others, key=lambda c: abs(ratio(c) - 1.0)) if others else None
    return HeadlandSelection(
        chosen,
        "selected on prominence",
        considered=len(near),
        prominence_ratio=ratio(chosen),
        runner_up_prominence_ratio=ratio(runner_up) if runner_up else None,
        distance_px=((chosen.x - px) ** 2 + (chosen.y - py) ** 2) ** 0.5,
    )
