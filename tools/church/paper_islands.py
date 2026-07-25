"""Read an engraved island from the paper enclosed by its shoreline.

Richmond's large islands carry names, hachure, and property linework. Those
marks join the shoreline into one dense ink blob, so tracing connected ink
cannot recover the island's outer outline. The paper inside the shoreline is a
separate connected region, however, and its outer boundary ignores internal ink
holes. This module measures that boundary while retaining the same
modern-vs-drawn enclosed-area selection rule.
"""

from __future__ import annotations

import math

from tools.church.drawn import (
    DrawnShape,
    InkMask,
    Selection,
    shape_signature,
    trace_outer_boundary,
)
from tools.church.headlands import paper_regions
from tools.church.landmarks import polygon_centroid

__all__ = [
    "PAPER_AREA_RATIO_MAX",
    "PAPER_AREA_RATIO_MIN",
    "paper_islands_in",
    "select_paper_island",
]

PAPER_AREA_RATIO_MIN = 0.50
PAPER_AREA_RATIO_MAX = 1.50
"""QA-derived modern/drawn area band for Richmond's enclosed-paper reader.

The initial run was opened to 0.35-1.90. Visual inspection independently
identified the only two apparent matches below 0.50 as an incomplete island
fragment (0.45) and a road/label enclosure (0.49). The eight correct unique
outlines fell at 0.51-1.29. Tightening after QA makes the resulting offset an
optimistic bound, so reports using it must say so explicitly.
"""


def paper_islands_in(mask: InkMask, min_paper: int) -> list[DrawnShape]:
    """Closed, non-border paper regions, largest enclosed area first.

    The border-connected region is the surrounding sea or map background and
    cannot be an island interior. Interior ink becomes a hole in the paper
    region; tracing the region's OUTER boundary ignores that hole and follows
    the coast-facing edge instead.
    """
    shapes: list[DrawnShape] = []
    for region in paper_regions(mask, min_paper):
        if any(mask.on_border(x, y) for x, y in region):
            continue
        ring = trace_outer_boundary(region)
        if len(ring) < 3:
            continue
        try:
            x, y, area = polygon_centroid(ring)
            elongation, orientation = shape_signature(ring, 1.0, -1.0)
        except ValueError:
            continue
        shapes.append(
            DrawnShape(
                centroid_x=x,
                centroid_y=y,
                enclosed_area=area,
                # There is deliberately no ink-fill test in this reader. The
                # region is paper, and internal ink is the reason it exists.
                ink_pixels=0,
                touches_border=False,
                elongation=elongation,
                orientation_deg=orientation,
                ring=tuple(ring),
            )
        )
    shapes.sort(key=lambda shape: -shape.enclosed_area)
    return shapes


def select_paper_island(
    shapes: list[DrawnShape],
    expected_area_px: float,
    prediction: tuple[float, float],
    radius_px: float,
) -> Selection:
    """Select the only nearby paper region in the fixed area band, or refuse."""
    if expected_area_px <= 0:
        raise ValueError(f"expected area must be positive, got {expected_area_px}")

    px, py = prediction
    near = [
        shape
        for shape in shapes
        if math.hypot(shape.centroid_x - px, shape.centroid_y - py) <= radius_px
    ]
    if not near:
        return Selection(
            None,
            f"no enclosed paper region within {radius_px:.0f} px of the prediction",
        )

    def ratio(shape: DrawnShape) -> float:
        return shape.enclosed_area / expected_area_px

    fits = [
        shape
        for shape in near
        if PAPER_AREA_RATIO_MIN <= ratio(shape) <= PAPER_AREA_RATIO_MAX
    ]
    if not fits:
        best = min(near, key=lambda shape: abs(ratio(shape) - 1.0))
        return Selection(
            None,
            f"no enclosed paper region of the right size: {len(near)} nearby, "
            f"closest area ratio {ratio(best):.2f}, band "
            f"{PAPER_AREA_RATIO_MIN}-{PAPER_AREA_RATIO_MAX}",
            considered=len(near),
            runner_up_area_ratio=ratio(best),
        )
    if len(fits) > 1:
        ranked = sorted(fits, key=lambda shape: abs(ratio(shape) - 1.0))
        return Selection(
            None,
            f"ambiguous: {len(fits)} enclosed paper regions fit the size band "
            f"(area ratios {', '.join(f'{ratio(shape):.2f}' for shape in ranked[:4])})",
            considered=len(near),
            area_ratio=ratio(ranked[0]),
            runner_up_area_ratio=ratio(ranked[1]),
        )

    chosen = fits[0]
    others = [shape for shape in near if shape is not chosen]
    runner_up = (
        min(others, key=lambda shape: abs(ratio(shape) - 1.0))
        if others
        else None
    )
    return Selection(
        chosen,
        "selected on enclosed-paper area",
        considered=len(near),
        area_ratio=ratio(chosen),
        runner_up_area_ratio=ratio(runner_up) if runner_up else None,
        distance_px=math.hypot(chosen.centroid_x - px, chosen.centroid_y - py),
    )
