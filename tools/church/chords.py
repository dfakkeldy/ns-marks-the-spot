"""A candidate rule that survives a coast which trends.

Why the extremal rules were not enough
--------------------------------------
"The westernmost vertex inside this box" names a physical point only where the
coast actually turns. Where it runs steadily in one direction, every vertex is
the westernmost one so far, and the answer is whichever perpendicular bound the
box happened to cut - it moves when the box moves.
`emit_candidates._refuse_if_truncated` already refuses that, saying so in as
many words.

The trap is reading that refusal as evidence about the *data*. The fourth
Inverness attempt sampled the north Cape Breton shore, found no local extremum,
and concluded the reference had generalised away the coves Church drew and
named. It had not. With the extract's tile seam removed that shore carries 1,969
vertices at 3.6 m median spacing - it is densely digitised, and simply trends
0.689 m east per metre north. Detrending surfaces coves of 158-349 m indentation
at once. The guard was reporting a broken instrument, not missing features.

The rule here
-------------
Deviation from the chord joining the two ends of the coastline stretch inside
the box - the Douglas-Peucker criterion. It is scale-free, it is immune to the
trend by construction (subtracting the chord *is* detrending), and it names the
same physical point on the modern vector data and on the engraving without
anyone judging where a coastline "turns".

Prominence is not a detail
--------------------------
`min_prominence_m` exists because a check feature less prominent than the error
being measured cannot be identified reliably. On the north panel the three coves
detrending finds sit about 800 m apart against 700-900 m of error: pair one with
its neighbour and nothing in the data would say so. That is the failure that
matched the compact Clarke Id. to the candidate for the long Cameron Id. Fewer,
larger features beat more, smaller ones, so this rule refuses rather than
returning something it cannot defend.

Pure stdlib, like the rest of the decision-making modules.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from tools.church.landmarks import BoundingBox

__all__ = [
    "ChordFeature",
    "chord_extreme",
    "perpendicular_metres",
    "runs_in_box",
]

_METRES_PER_DEGREE_LATITUDE = 110574.0
_METRES_PER_DEGREE_LONGITUDE_EQUATOR = 111320.0

ENDPOINT_MARGIN = 2
"""Vertices at each end of the run that may not win.

The chord is anchored on the run's ends, so the deviation there is zero by
construction and the vertices beside them are nearly so. A winner this close to
an end means the box clipped the feature instead of selecting it - the same
defect `_refuse_if_truncated` catches for the extremal rules.
"""


def _metric(point: tuple[float, float], latitude_deg: float) -> tuple[float, float]:
    """Degrees to local metres, collapsing longitude's compression."""
    return (
        point[0] * _METRES_PER_DEGREE_LONGITUDE_EQUATOR * math.cos(math.radians(latitude_deg)),
        point[1] * _METRES_PER_DEGREE_LATITUDE,
    )


def perpendicular_metres(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """Signed perpendicular distance from `point` to the chord, in ground metres.

    Signed, so the two sides of a chord are distinguishable - a headland and a
    cove head of equal size are not the same feature, and a caller comparing two
    representations needs to know it picked the same side on both.
    """
    reference_lat = (start[1] + end[1]) / 2.0
    px, py = _metric(point, reference_lat)
    ax, ay = _metric(start, reference_lat)
    bx, by = _metric(end, reference_lat)
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 1e-9:
        raise ValueError("chord has no length; its two ends are the same point")
    # Cross product of the chord with the offset, normalised by chord length.
    return ((px - ax) * dy - (py - ay) * dx) / length


def runs_in_box(ring: list[tuple[float, float]], box: BoundingBox) -> list[list]:
    """Contiguous stretches of `ring` lying inside `box`.

    A closed ring has no natural first vertex, so a stretch crossing index 0 is
    one run and not two. More than one run means the box holds two separate
    pieces of coast, which no single chord can describe.
    """
    inside = [box.contains(*vertex) for vertex in ring]
    if not any(inside):
        return []
    if all(inside):
        return [list(ring)]

    # Rotate so the ring starts just after a gap; any run then stays contiguous.
    start = next(i for i in range(len(ring)) if inside[i] and not inside[i - 1])
    order = list(range(start, len(ring))) + list(range(start))
    runs: list[list] = []
    current: list = []
    for index in order:
        if inside[index]:
            current.append(ring[index])
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


@dataclass(frozen=True)
class ChordFeature:
    """The point on a coastal stretch furthest from its own chord."""

    lon: float
    lat: float
    prominence_m: float
    """Signed: positive and negative are opposite sides of the chord."""
    runner_up_m: float | None = None
    """Best deviation elsewhere on the run, for judging whether it is unique."""
    run_length: int = 0


def chord_extreme(
    ring: list[tuple[float, float]],
    box: BoundingBox,
    min_prominence_m: float,
) -> ChordFeature:
    """The most prominent headland or cove head on the coast inside `box`.

    Raises rather than returning a weak answer. Every refusal here is a candidate
    that would otherwise have entered a held-out set undefended.
    """
    runs = runs_in_box(ring, box)
    if not runs:
        raise ValueError(f"no coastline vertices inside {box}")
    if len(runs) > 1:
        raise ValueError(
            f"the box holds {len(runs)} separate stretches of coast, and no single "
            f"chord describes them; tighten the box onto one"
        )

    run = runs[0]
    if len(run) < 2 * ENDPOINT_MARGIN + 1:
        raise ValueError(
            f"only {len(run)} vertices inside the box; too short to carry a chord"
        )

    deviations = [perpendicular_metres(v, run[0], run[-1]) for v in run]
    interior = range(ENDPOINT_MARGIN, len(run) - ENDPOINT_MARGIN)
    best = max(interior, key=lambda i: abs(deviations[i]))

    if abs(deviations[best]) < min_prominence_m:
        raise ValueError(
            f"no feature of the required prominence: the furthest point is "
            f"{abs(deviations[best]):.0f} m from the chord against a floor of "
            f"{min_prominence_m:.0f} m. A feature less prominent than the error "
            f"being measured cannot be told from its neighbour."
        )

    # A winner adjacent to an endpoint means the run was cut through a feature.
    edge = max(abs(deviations[i]) for i in range(len(run)) if i not in interior)
    if edge >= abs(deviations[best]):
        raise ValueError(
            f"the largest deviation sits at the end of the run ({edge:.0f} m against "
            f"{abs(deviations[best]):.0f} m inside), so the box clipped the feature "
            f"rather than selecting it. Widen the box along the coast."
        )

    # Runner-up, excluding the winner's own shoulders: a broad headland has many
    # vertices near its tip and they are not separate features.
    apart = [
        i
        for i in interior
        if abs(deviations[i]) > 0 and _degrees_apart(run[i], run[best]) > 0.01
    ]
    runner_up = max((deviations[i] for i in apart), key=abs, default=None)

    return ChordFeature(
        lon=run[best][0],
        lat=run[best][1],
        prominence_m=deviations[best],
        runner_up_m=runner_up,
        run_length=len(run),
    )


def _degrees_apart(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])
