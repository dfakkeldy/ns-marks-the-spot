"""Find the island outline Church engraved, and take its centroid by the same rule.

Why this exists
---------------
Attempt 4 measured the south panel at 457.8 m held-out RMS using pixel positions
read BY EYE off contact sheets, with a stated +/-40 source px (~110 m) reading
uncertainty. That is inside the tolerance, but it is not reproducible, it cannot
be audited, and - worse - a systematic eyeball bias would look exactly like the
~270 m north-east offset that attempt 4 reported as a property of the map. A
measurement cannot be used to diagnose a bias it might itself have created.

So the drawn coordinate is derived here instead, by the SAME definition already
applied to the modern geometry: threshold the ink, trace the closed outline, and
push that ring through `landmarks.polygon_centroid`. Modern side, a shoelace over
the island's polygon ring; drawn side, a shoelace over the traced outline ring.
Same rule on both sides is what makes the comparison honest.

Circularity, and how the search window avoids it
------------------------------------------------
The obvious selector - "the ink nearest the predicted pixel" - would drag every
answer toward the transform being tested and dissolve any systematic offset into
apparent scatter. It is precisely the wrong tool for this question.

So selection is decided by ENCLOSED AREA, which is a property of the shape alone
and carries no positional information. The prediction is used only to crop a tile
and to discard shapes kilometres away. `radius_px` is deliberately several times
the largest error under test: it can lose a point, but it cannot move one, and
the anti-circularity tests in test_drawn.py pin that down.

If two shapes in one tile both fit the size, this refuses to answer. A guess
recorded as a measurement is worse than a gap - that is the lesson of the four
north candidates that turned out to be one vertex.

Pure stdlib, like the rest of the decision-making modules, so it is testable
without a GIS host. The raster side lives in `drawn_checks.py`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from tools.church.landmarks import polygon_centroid

__all__ = [
    "AREA_RATIO_MAX",
    "AREA_RATIO_MIN",
    "CHECK_COLUMNS",
    "MIN_FILL_RATIO",
    "SOURCE_METRES_PER_PIXEL",
    "DrawnShape",
    "InkMask",
    "Selection",
    "dilated",
    "DUPLICATE_TOLERANCE_PX",
    "format_check_rows",
    "refuse_duplicate_matches",
    "ink_mask",
    "orientation_gap",
    "polygon_moments",
    "select_shape",
    "shape_signature",
    "shapes_in",
    "square_degrees_to_pixel_area",
    "tile_origin",
    "trace_outer_boundary",
]

CHECK_COLUMNS = ("pixel_x", "pixel_y", "lon", "lat", "role", "label")

SOURCE_METRES_PER_PIXEL = 2.718
"""Ground metres per pixel of the archival Inverness scan.

Measured twice, from two different lattices, which is why it is trusted. North
parallels sit 3,413.7 px per 5 arcminutes = 682.7 px/arcmin; south parallels sit
6,814.4 px per 10 arcminutes = 681.4 px/arcmin. At 1,852 m per arcminute both
give 2.718 m per pixel - one engraving measured at two different steps. See the
derivation comment above `_INVERNESS_SOUTH_GRATICULE` in panels.py.
"""

_METRES_PER_DEGREE_LATITUDE = 110574.0
_METRES_PER_DEGREE_LONGITUDE_EQUATOR = 111320.0


def square_degrees_to_pixel_area(
    area_sq_deg: float,
    latitude_deg: float,
    metres_per_pixel: float = SOURCE_METRES_PER_PIXEL,
) -> float:
    """How many scan pixels a modern island of this size should cover.

    `landmarks.polygon_centroid` returns area in squared degrees, which is not a
    real area - a degree of longitude is only about two thirds of a degree of
    latitude at Inverness's 46 N. Collapsing that anisotropy is the whole job
    here, and getting it backwards would inflate every expected area by ~1.4x
    and quietly widen the size filter into uselessness.
    """
    metres_per_degree_lon = _METRES_PER_DEGREE_LONGITUDE_EQUATOR * math.cos(
        math.radians(latitude_deg)
    )
    area_m2 = area_sq_deg * metres_per_degree_lon * _METRES_PER_DEGREE_LATITUDE
    return area_m2 / (metres_per_pixel**2)


MIN_FILL_RATIO = 2.0
"""Least enclosed-area-per-ink-pixel a shape may have and still be an island.

An island outline is a thin loop around a lot of paper, so it encloses several
times its own ink. A word is mostly ink, and the first run of this detector
accepted the lettering "Cove" out of "Clarke Cove" as an island because it
enclosed roughly the right area.

Measured on the Margaree tile at `dilate_px=4`: the island reads 3.69, and every
lettering and hachure blob near it reads between 0.85 and 0.98. The cut sits
between those two populations. It is tied to the dilation radius - heavier
dilation fattens the stroke and lowers every fill - so the two settings move
together.
"""

AREA_RATIO_MIN = 0.6
AREA_RATIO_MAX = 1.7
"""How far the drawn area may differ from the modern area and still be the same island.

Opened wide on the assumption that an 1884 engraver drew small islands larger
than life, then closed once the run produced evidence. Correct matches, confirmed
by eye on the QA sheet, land at 0.96-1.35. Every match that visual inspection
showed to be the WRONG feature - the word "Cove", the compact Clarke Id. standing
in for the long Cameron Id., a sliver beside a scan artifact - landed at
0.32-0.54. The engraver was faithful about island size; it was the detector that
was not.

Tightening this AFTER seeing the numbers deserves to be stated plainly: it drops
badly-placed points and therefore flatters the error. It is justified only
because those points were shown to be misidentified independently of their
residual - you cannot measure registration with a point that is not the feature -
and any figure derived under it is an optimistic bound, not a fair one.
"""

# Clockwise in image coordinates, where +y runs down the page: W, NW, N, NE, E,
# SE, S, SW. Moore tracing needs them in ring order, not axis order.
_NEIGHBOURS = (
    (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1),
)


@dataclass(frozen=True)
class InkMask:
    """Which pixels of a tile carry ink. Coordinates are tile-local."""

    width: int
    height: int
    pixels: set = field(compare=False)

    def on_border(self, x: int, y: int) -> bool:
        return x <= 0 or y <= 0 or x >= self.width - 1 or y >= self.height - 1


def ink_mask(rows, darkness: int) -> InkMask:
    """Threshold a greyscale tile into ink / paper.

    `darkness` is "darker than", matching `detect_graticule`, so one number means
    the same thing everywhere in this pipeline.
    """
    pixels = set()
    height = 0
    width = 0
    for y, row in enumerate(rows):
        height = y + 1
        length = 0
        for x, value in enumerate(row):
            length = x + 1
            if value < darkness:
                pixels.add((x, y))
        width = max(width, length)
    return InkMask(width=width, height=height, pixels=pixels)


def dilated(mask: InkMask, radius: int) -> InkMask:
    """Grow the ink by `radius` pixels, to bridge a broken engraved outline.

    This is load-bearing, not tidying. The Inverness engraving draws islands with
    a hairline that the scan resolves as a dashed line: Margaree Island's outline
    breaks into arcs enclosing 16 % of its area at radius 3, and snaps shut to
    106 % at radius 4. Without this the islands that carry the south panel simply
    are not there.

    Growth costs a little area - a 950 px perimeter grown by 4 px adds ~4 %, which
    the ratio band absorbs - and moves the centroid only where growth is
    asymmetric. Around a closed outline it is not; where an island merges with the
    mainland the result touches the tile edge and is refused rather than measured.

    Done separably, x then y, which is identical to the square structuring element
    (see the equivalence test) and turns an O(r^2) scan into O(r).
    """
    if radius <= 0:
        return mask
    spread_x = set()
    for x, y in mask.pixels:
        for dx in range(-radius, radius + 1):
            nx = x + dx
            if 0 <= nx < mask.width:
                spread_x.add((nx, y))
    grown = set()
    for x, y in spread_x:
        for dy in range(-radius, radius + 1):
            ny = y + dy
            if 0 <= ny < mask.height:
                grown.add((x, ny))
    return InkMask(width=mask.width, height=mask.height, pixels=grown)


def _components(mask: InkMask) -> list[set]:
    """8-connected runs of ink.

    Flood fill walks ink only, never paper, so cost scales with what was drawn
    rather than with the tile - which is what makes a 1400 px tile tractable in
    pure Python.
    """
    seen: set = set()
    found: list[set] = []
    for pixel in mask.pixels:
        if pixel in seen:
            continue
        blob = {pixel}
        seen.add(pixel)
        stack = [pixel]
        while stack:
            x, y = stack.pop()
            for dx, dy in _NEIGHBOURS:
                neighbour = (x + dx, y + dy)
                if neighbour in mask.pixels and neighbour not in seen:
                    seen.add(neighbour)
                    blob.add(neighbour)
                    stack.append(neighbour)
        found.append(blob)
    return found


def trace_outer_boundary(pixels: set) -> list[tuple[int, int]]:
    """Moore-neighbour trace of the OUTSIDE edge of one connected blob.

    Outside, not inside, is the whole point. A drawn island is a closed stroke
    with paper in the middle; the ring around the outside of that stroke encloses
    the island, while the ring around the hole would enclose only the water-free
    interior and would move with the stroke's thickness.
    """
    if not pixels:
        return []
    start = min(pixels, key=lambda pixel: (pixel[1], pixel[0]))
    if len(pixels) == 1:
        return [start]

    ring = [start]
    current = start
    # The pixel due west of the topmost-leftmost one is guaranteed to be paper,
    # so starting the sweep there always finds the boundary rather than cutting
    # across the blob.
    backtrack = 0
    states: set = set()
    while True:
        step = None
        for offset in range(1, 9):
            index = (backtrack + offset) % 8
            dx, dy = _NEIGHBOURS[index]
            neighbour = (current[0] + dx, current[1] + dy)
            if neighbour in pixels:
                step = (index, neighbour)
                break
        if step is None:
            break
        index, neighbour = step
        state = (current, index)
        if state in states:
            break
        states.add(state)
        current = neighbour
        backtrack = (index + 4) % 8
        if current == start and len(ring) > 1:
            break
        ring.append(current)
    return ring


def polygon_moments(ring: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Second central moments of a closed ring: `(mu20, mu02, mu11)`.

    Variances of the enclosed AREA, not of the vertices. Sampling the vertices
    instead would weight whichever part of the outline the engraver drew in most
    detail, so two drawings of the same island would disagree.
    """
    doubled_area = 0.0
    cx = cy = 0.0
    xx = yy = xy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, list(ring[1:]) + [ring[0]]):
        cross = x0 * y1 - x1 * y0
        doubled_area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
        xx += (x0 * x0 + x0 * x1 + x1 * x1) * cross
        yy += (y0 * y0 + y0 * y1 + y1 * y1) * cross
        xy += (x0 * y1 + 2.0 * x0 * y0 + 2.0 * x1 * y1 + x1 * y0) * cross
    if abs(doubled_area) < 1e-14:
        raise ValueError("ring encloses no area")
    area = doubled_area / 2.0
    cx /= 6.0 * area
    cy /= 6.0 * area
    return (
        xx / (12.0 * area) - cx * cx,
        yy / (12.0 * area) - cy * cy,
        xy / (24.0 * area) - cx * cy,
    )


def shape_signature(
    ring: list[tuple[float, float]], x_scale: float = 1.0, y_scale: float = 1.0
) -> tuple[float, float]:
    """`(elongation, orientation_deg)` of a ring, both scale-free.

    Elongation is the ratio of the principal axes, 1.0 for a circle. Orientation
    is the long axis measured anticlockwise from +x, wrapped into 0-180 because
    an axis has no head or tail.

    `x_scale`/`y_scale` put both representations in the same frame: the modern
    ring arrives in degrees, where a degree of longitude is two thirds of a
    degree of latitude, and the drawn ring arrives in pixels with y running DOWN
    the page. Comparing them raw would call every island the wrong shape and
    every orientation the wrong sign.
    """
    scaled = [(x * x_scale, y * y_scale) for x, y in ring]
    mu20, mu02, mu11 = polygon_moments(scaled)
    common = mu20 + mu02
    spread = math.hypot(2.0 * mu11, mu20 - mu02)
    larger = (common + spread) / 2.0
    smaller = (common - spread) / 2.0
    if smaller <= 0:
        return float("inf"), 0.0
    elongation = math.sqrt(larger / smaller)
    orientation = math.degrees(0.5 * math.atan2(2.0 * mu11, mu20 - mu02)) % 180.0
    return elongation, orientation


def orientation_gap(a: float, b: float) -> float:
    """Smallest angle between two undirected axes, in degrees (0-90)."""
    gap = abs(a - b) % 180.0
    return min(gap, 180.0 - gap)


@dataclass(frozen=True)
class DrawnShape:
    """One closed outline found on the scan, with its shoelace centroid."""

    centroid_x: float
    centroid_y: float
    enclosed_area: float
    ink_pixels: int
    touches_border: bool
    elongation: float = 1.0
    orientation_deg: float = 0.0
    ring: tuple = field(default=(), compare=False, repr=False)

    @property
    def fill_ratio(self) -> float:
        """Enclosed area per pixel of ink. High for an outline, low for a word."""
        return self.enclosed_area / max(1, self.ink_pixels)


def shapes_in(mask: InkMask, min_ink: int) -> list[DrawnShape]:
    """Every closed outline in the tile, largest enclosed area first.

    Shapes enclosing no area are dropped rather than reported. A coastline
    crossing the tile is ink, and its outer boundary runs out along one side and
    back along the other, cancelling to zero - it is not an island and must not
    be offered as one.
    """
    shapes: list[DrawnShape] = []
    for blob in _components(mask):
        if len(blob) < min_ink:
            continue
        ring = trace_outer_boundary(blob)
        if len(ring) < 3:
            continue
        try:
            x, y, area = polygon_centroid(ring)
            # y_scale=-1 flips the page's downward y so the reported angle is
            # anticlockwise-from-east, the same convention the modern ring uses.
            elongation, orientation = shape_signature(ring, 1.0, -1.0)
        except ValueError:
            continue  # collinear: a rule, a neat line, or a stretch of coast
        shapes.append(
            DrawnShape(
                centroid_x=x,
                centroid_y=y,
                enclosed_area=area,
                ink_pixels=len(blob),
                touches_border=any(mask.on_border(px, py) for px, py in blob),
                elongation=elongation,
                orientation_deg=orientation,
                ring=tuple(ring),
            )
        )
    shapes.sort(key=lambda shape: -shape.enclosed_area)
    return shapes


@dataclass(frozen=True)
class Selection:
    """The outcome of choosing one shape, including why, and what came second."""

    shape: DrawnShape | None
    reason: str
    considered: int = 0
    area_ratio: float | None = None
    runner_up_area_ratio: float | None = None
    distance_px: float | None = None


def select_shape(
    shapes: list[DrawnShape],
    expected_area_px: float,
    prediction: tuple[float, float],
    radius_px: float,
    area_ratio_min: float = AREA_RATIO_MIN,
    area_ratio_max: float = AREA_RATIO_MAX,
) -> Selection:
    """Pick the one drawn island matching a modern island, or refuse.

    Order matters. Nearness only narrows the field to this stretch of coast; ink
    fill and enclosed area do the actual choosing, and neither of them knows
    where the transform predicted the island would be. Reverse those two and the
    routine would quietly hand the prediction back to whoever asked for it.

    Aspect and orientation were tried here too and removed. They are the natural
    way to tell one island from a similar neighbour, but the reference layer
    cannot support them: NSTDB renders Margaree Island at 1.44:1 where the
    engraving draws it at 3.62:1, and returns a degenerate ring for at least one
    other candidate. `DrawnShape` still reports both for the audit record, where
    a reader can weigh them; nothing filters on them.
    """
    if expected_area_px <= 0:
        raise ValueError(f"expected area must be positive, got {expected_area_px}")

    px, py = prediction
    near = [
        shape
        for shape in shapes
        if ((shape.centroid_x - px) ** 2 + (shape.centroid_y - py) ** 2) ** 0.5 <= radius_px
    ]
    if not near:
        return Selection(None, f"no closed outline within {radius_px:.0f} px of the prediction")

    def ratio(shape: DrawnShape) -> float:
        return shape.enclosed_area / expected_area_px

    inky = [s for s in near if s.fill_ratio < MIN_FILL_RATIO]
    near = [s for s in near if s.fill_ratio >= MIN_FILL_RATIO]
    if not near:
        return Selection(
            None,
            f"every nearby shape is more ink than enclosure (fill < {MIN_FILL_RATIO}): "
            f"lettering, hachure or a scan edge, not an island ({len(inky)} such)",
        )

    fits = [s for s in near if area_ratio_min <= ratio(s) <= area_ratio_max]
    if not fits:
        best = min(near, key=lambda s: abs(ratio(s) - 1.0))
        return Selection(
            None,
            f"no shape of the right size: {len(near)} nearby, closest area ratio "
            f"{ratio(best):.2f}, band {area_ratio_min}-{area_ratio_max}",
            considered=len(near),
            runner_up_area_ratio=ratio(best),
        )

    clipped = [s for s in fits if s.touches_border]
    fits = [s for s in fits if not s.touches_border]
    if not fits:
        return Selection(
            None,
            f"the only size-matching shape is clipped by the tile edge, so its "
            f"centroid is an artifact of the crop ({len(clipped)} such)",
            considered=len(near),
        )

    if len(fits) > 1:
        ranked = sorted(fits, key=lambda s: abs(ratio(s) - 1.0))
        return Selection(
            None,
            f"ambiguous: {len(fits)} shapes fit the size band (area ratios "
            f"{', '.join(f'{ratio(s):.2f}' for s in ranked[:4])}); the tile needs a "
            f"human, or the box needs tightening",
            considered=len(near),
            area_ratio=ratio(ranked[0]),
            runner_up_area_ratio=ratio(ranked[1]),
        )

    chosen = fits[0]
    others = [s for s in near if s is not chosen]
    runner_up = min(others, key=lambda s: abs(ratio(s) - 1.0)) if others else None
    return Selection(
        chosen,
        "selected on enclosed area",
        considered=len(near),
        area_ratio=ratio(chosen),
        runner_up_area_ratio=ratio(runner_up) if runner_up else None,
        distance_px=((chosen.centroid_x - px) ** 2 + (chosen.centroid_y - py) ** 2) ** 0.5,
    )


DUPLICATE_TOLERANCE_PX = 8.0
"""How close two accepted centroids may be before they are the same drawing."""


def refuse_duplicate_matches(
    records: list[dict], tolerance_px: float = DUPLICATE_TOLERANCE_PX
) -> list[dict]:
    """Reject every candidate that resolved to the same drawn shape as another.

    Attempt 4 found four north candidates - Cape St Lawrence, Cape North, Meat
    Cove and Aspy Bay - all resolving to one vertex, because there is exactly one
    northernmost point on Cape Breton. This is that failure in the south: two
    different modern islands both matched the single outline at (27161, 27227),
    and at least one of those pairings has to be wrong.

    Both sides are refused, not one. Which of the two is the real match is
    exactly what the evidence does not say, and keeping the closer one would just
    be the prediction choosing again.
    """
    out = []
    for record in records:
        if not record.get("accepted"):
            out.append(record)
            continue
        clashes = [
            other["label"]
            for other in records
            if other is not record
            and other.get("accepted")
            and abs(other["pixel_x"] - record["pixel_x"]) <= tolerance_px
            and abs(other["pixel_y"] - record["pixel_y"]) <= tolerance_px
        ]
        if clashes:
            merged = dict(record)
            merged["accepted"] = False
            merged["reason"] = (
                f"resolved to the same drawn outline as {', '.join(sorted(clashes))}; "
                f"two modern islands cannot both be one drawing, and nothing here "
                f"says which pairing is the real one"
            )
            out.append(merged)
        else:
            out.append(record)
    return out


def tile_origin(centre: float, tile: int, limit: int) -> int:
    """Top-left of a tile centred on a prediction, clamped into the raster.

    Clamping rather than allowing a negative offset: a tile that runs off the
    sheet comes back blank, and a blank tile reads as "Church drew nothing here"
    when the truth is "nobody read this".
    """
    return max(0, min(limit - tile, int(round(centre - tile / 2))))


def format_check_rows(records: list[dict], header: str) -> str:
    """Render the held-out check CSV from accepted detections.

    Accepted rows only. A candidate the detector refused is a gap in the
    evidence and belongs in the audit JSON and in the file's own header prose,
    not as a row with a guessed coordinate in it.

    Pixel columns keep one decimal. A shoelace centroid over a few hundred
    boundary points genuinely resolves below a pixel, and rounding it to an
    integer would throw away ~1.4 m for no reason - small, but this is the file
    the verdict is computed from.
    """
    lines = [header.rstrip("\n"), ",".join(CHECK_COLUMNS)]
    for record in records:
        if not record.get("accepted"):
            continue
        lines.append(
            f"{record['pixel_x']:.1f},{record['pixel_y']:.1f},"
            f"{record['lon']:.6f},{record['lat']:.6f},check,{record['label']}"
        )
    return "\n".join(lines) + "\n"
