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
    "Plane",
    "chord_extreme",
    "cyclic_runs",
    "geographic_plane",
    "path_extreme",
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

RUNNER_UP_SEPARATION_M = 1000.0
"""How far from the winner a rival deviation must lie to count as a second feature.

A broad headland carries many vertices near its tip and they are not separate
features. Expressed in ground metres so the same number means the same distance
whether the caller works in degrees or in scan pixels.
"""


@dataclass(frozen=True)
class Plane:
    """Ground metres per unit of x and of y, for one stretch of coast.

    The rule has to run over two very different coordinate systems: the modern
    vector data in degrees, where a degree of longitude is two thirds of a degree
    of latitude at Inverness, and the engraving in scan pixels, which are square.
    Carrying the scale explicitly is what lets both be measured by one function
    instead of two that have to be kept in agreement by hand.
    """

    x_metres: float
    y_metres: float

    def __post_init__(self) -> None:
        if self.x_metres == 0.0 or self.y_metres == 0.0:
            raise ValueError(
                f"degenerate plane ({self.x_metres}, {self.y_metres}): a zero scale "
                f"collapses an axis and reports every feature as lying on its chord"
            )

    def metric(self, point: tuple[float, float]) -> tuple[float, float]:
        return (point[0] * self.x_metres, point[1] * self.y_metres)


def geographic_plane(latitude_deg: float) -> Plane:
    """The local metric plane at a latitude, collapsing longitude's compression."""
    return Plane(
        x_metres=_METRES_PER_DEGREE_LONGITUDE_EQUATOR * math.cos(math.radians(latitude_deg)),
        y_metres=_METRES_PER_DEGREE_LATITUDE,
    )


def perpendicular_in_plane(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
    plane: Plane,
) -> float:
    """Signed perpendicular distance from `point` to the chord, in ground metres.

    Signed, so the two sides of a chord are distinguishable - a headland and a
    cove head of equal size are not the same feature, and a caller comparing two
    representations needs to know it picked the same side on both.
    """
    px, py = plane.metric(point)
    ax, ay = plane.metric(start)
    bx, by = plane.metric(end)
    dx, dy = bx - ax, by - ay
    length = math.hypot(dx, dy)
    if length < 1e-9:
        raise ValueError("chord has no length; its two ends are the same point")
    # Cross product of the chord with the offset, normalised by chord length.
    return ((px - ax) * dy - (py - ay) * dx) / length


def perpendicular_metres(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    """`perpendicular_in_plane` for degrees, at the chord's own mean latitude."""
    return perpendicular_in_plane(
        point, start, end, geographic_plane((start[1] + end[1]) / 2.0)
    )


def cyclic_runs(values: list, keep: list[bool]) -> list[list]:
    """Contiguous stretches of `values` where `keep` is true, treating it as closed.

    A traced ring has no natural first element, so a stretch crossing index 0 is
    one run and not two. Both callers depend on that: clipping a coastline ring
    to a box, and cutting a traced region boundary at the tile edge.
    """
    if len(values) != len(keep):
        raise ValueError(f"mask of {len(keep)} does not match {len(values)} values")
    if not any(keep):
        return []
    if all(keep):
        return [list(values)]

    # Rotate so the sequence starts just after a gap; runs then stay contiguous.
    start = next(i for i in range(len(values)) if keep[i] and not keep[i - 1])
    order = list(range(start, len(values))) + list(range(start))
    runs: list[list] = []
    current: list = []
    for index in order:
        if keep[index]:
            current.append(values[index])
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return runs


def runs_in_box(ring: list[tuple[float, float]], box: BoundingBox) -> list[list]:
    """Contiguous stretches of `ring` lying inside `box`.

    More than one run means the box holds two separate pieces of coast, which no
    single chord can describe.
    """
    return cyclic_runs(list(ring), [box.contains(*vertex) for vertex in ring])


@dataclass(frozen=True)
class ChordFeature:
    """The point on a coastal stretch furthest from its own chord.

    Held in whatever coordinates the caller supplied - degrees for the modern
    vector data, scan pixels for the engraving. `lon`/`lat` alias `x`/`y` for
    geographic callers; there is no conversion, and none belongs here. Putting
    the transform under test inside the measurement of its own error is the
    circularity this whole pipeline is built to avoid.
    """

    x: float
    y: float
    prominence_m: float
    """Signed: positive and negative are opposite sides of the chord."""
    runner_up_m: float | None = None
    """Best deviation elsewhere on the run, for judging whether it is unique."""
    run_length: int = 0

    @property
    def lon(self) -> float:
        return self.x

    @property
    def lat(self) -> float:
        return self.y


def path_extreme(
    path: list[tuple[float, float]],
    min_prominence_m: float,
    plane: Plane,
) -> ChordFeature:
    """The point on an OPEN path furthest from the chord joining its two ends.

    Raises rather than returning a weak answer. Every refusal here is a candidate
    that would otherwise have entered a held-out set undefended.

    The path must be open. A closed ring's two ends are the same vertex, so its
    chord has no length and no point has a defined deviation from it - callers
    clip a ring to a box (`chord_extreme`) or cut it at the tile edge
    (`headlands.coast_path`) before arriving here.
    """
    if len(path) < 2 * ENDPOINT_MARGIN + 1:
        raise ValueError(
            f"only {len(path)} vertices on the path; too short to carry a chord"
        )

    deviations = [perpendicular_in_plane(v, path[0], path[-1], plane) for v in path]
    interior = range(ENDPOINT_MARGIN, len(path) - ENDPOINT_MARGIN)
    best = max(interior, key=lambda i: abs(deviations[i]))

    if abs(deviations[best]) < min_prominence_m:
        raise ValueError(
            f"no feature of the required prominence: the furthest point is "
            f"{abs(deviations[best]):.0f} m from the chord against a floor of "
            f"{min_prominence_m:.0f} m. A feature less prominent than the error "
            f"being measured cannot be told from its neighbour."
        )

    # A winner adjacent to an endpoint means the run was cut through a feature.
    edge = max(abs(deviations[i]) for i in range(len(path)) if i not in interior)
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
        if abs(deviations[i]) > 0
        and _metres_apart(path[i], path[best], plane) > RUNNER_UP_SEPARATION_M
    ]
    runner_up = max((deviations[i] for i in apart), key=abs, default=None)

    return ChordFeature(
        x=path[best][0],
        y=path[best][1],
        prominence_m=deviations[best],
        runner_up_m=runner_up,
        run_length=len(path),
    )


def chord_extreme(
    ring: list[tuple[float, float]],
    box: BoundingBox,
    min_prominence_m: float,
) -> ChordFeature:
    """The most prominent headland or cove head on the modern coast inside `box`.

    The geographic entry point: clip the ring to the box, then apply the shared
    rule in the local metric plane.
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
    plane = geographic_plane((run[0][1] + run[-1][1]) / 2.0)
    return path_extreme(run, min_prominence_m, plane)


def _metres_apart(
    a: tuple[float, float], b: tuple[float, float], plane: Plane
) -> float:
    ax, ay = plane.metric(a)
    bx, by = plane.metric(b)
    return math.hypot(ax - bx, ay - by)
