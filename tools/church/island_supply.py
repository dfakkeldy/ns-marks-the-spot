"""Freeze a pre-residual island candidate supply for one Church panel.

Candidates are the largest modern-water islands inside the panel's declared
geographic bounds whose centroids can be selected by a box containing no other
island centroid. The historical scan and its residuals are not inputs, so this
cannot silently favour islands the current warp already draws well.
"""

from __future__ import annotations

import argparse
import json
import pathlib

from tools.church.emit_candidates import CandidateRow, ISLAND_RULE, format_candidates
from tools.church.landmarks import BoundingBox, islands_within
from tools.church.panels import get_panel


def _unique_box(island, all_islands) -> BoundingBox | None:
    """Shrink an extent-derived box until it selects one centroid or refuse it."""
    half_lon = max(island.span_lon * 0.55, 0.001)
    half_lat = max(island.span_lat * 0.55, 0.001)
    for _ in range(12):
        box = BoundingBox(
            west=island.lon - half_lon,
            south=island.lat - half_lat,
            east=island.lon + half_lon,
            north=island.lat + half_lat,
        )
        inside = [
            candidate
            for candidate in all_islands
            if box.contains(candidate.lon, candidate.lat)
        ]
        if len(inside) == 1 and inside[0] == island:
            return box
        half_lon /= 2.0
        half_lat /= 2.0
    return None


def build_supply(
    features: list[dict],
    bounds: BoundingBox,
    count: int,
) -> list[tuple[CandidateRow, tuple[float, float]]]:
    """Return up to ``count`` objectively ranked, uniquely selectable islands."""
    if count <= 0:
        raise ValueError(f"count must be positive, got {count}")
    islands = islands_within(features, bounds)
    supply: list[tuple[CandidateRow, tuple[float, float]]] = []
    for island in islands:
        box = _unique_box(island, islands)
        if box is None:
            continue
        label = f"supply-{len(supply) + 1:02d}"
        supply.append(
            (
                CandidateRow(label=label, rule=ISLAND_RULE, box=box),
                (island.lon, island.lat),
            )
        )
        if len(supply) == count:
            break
    return supply


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("county")
    parser.add_argument("panel")
    parser.add_argument("--water", type=pathlib.Path, required=True)
    parser.add_argument("--count", type=int, default=24)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    panel = get_panel(args.county, args.panel)
    bounds = BoundingBox(
        west=panel.target_bounds.west,
        south=panel.target_bounds.south,
        east=panel.target_bounds.east,
        north=panel.target_bounds.north,
    )
    features = json.loads(args.water.read_text(encoding="utf-8"))["features"]
    supply = build_supply(features, bounds, args.count)
    header = (
        f"# Frozen pre-residual island supply for {args.county}/{args.panel}.\n"
        "# Ranked by modern NSTDB water-ring area within the registered panel bounds.\n"
        "# No historical pixel positions or residuals were inputs to this selection."
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(format_candidates(supply, header), encoding="utf-8")
    print(f"{len(supply)} candidates -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
