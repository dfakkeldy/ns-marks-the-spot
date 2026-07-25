"""Re-derive check-point candidate coordinates from their rule and their box.

    python3 -m tools.church.emit_candidates \
        --water reference/nstdb-major-water.geojson \
        --candidates tools/church/checks/inverness-north-candidates.csv --check

A candidate file's real content is its `label,rule,box_*` columns. The `lon` and
`lat` beside them are *derived*: they are whatever applying that rule to that box
over the modern water layer returns. Committing the derivation, rather than only
its answer, is what lets a box be corrected and the coordinates follow
automatically instead of being retyped.

That mattered immediately. Three north candidates - `cape-st-lawrence-north-tip`,
`cape-north-north-tip` and `meat-cove-north-point` - had boxes drawn adjacent, so
all three selected essentially the same headland vertex 0.25 km apart rather than
the 25 km intended. Correcting a box by hand and leaving the old coordinate in
place would have looked exactly like a fix.

`--check` asserts the committed file still matches what the rules produce, the
same guarantee `emit_gcps --check` gives the control CSV, and catches a
hand-edited coordinate.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import pathlib
from dataclasses import dataclass

from tools.church.chords import ChordFeature, chord_extreme
from tools.church.landmarks import (
    EXTREME_RULES,
    BoundingBox,
    all_rings,
    extreme_vertex,
    islands_within,
    vertices_of,
)

__all__ = [
    "CandidateRow",
    "HEADLAND_MIN_PROMINENCE_M",
    "HEADLAND_RULE",
    "ISLAND_RULE",
    "format_candidates",
    "resolve_headland_feature",
    "parse_candidate_csv",
    "resolve_candidate",
]

ISLAND_RULE = "island"
HEADLAND_RULE = "headland"
COLUMNS = ("label", "lon", "lat", "rule", "box_west", "box_south", "box_east", "box_north")

HEADLAND_MIN_PROMINENCE_M = 800.0
"""Least chord deviation a headland must have to serve as a check point.

Not a taste setting. The north panel's error is being tested against a 400 m RMS
and a 1,500 m maximum, and a feature less prominent than the error being measured
cannot be told from its neighbour - pair a 300 m cove with the one 800 m along
the shore and nothing in the data would object. That is precisely the failure
that matched the compact Clarke Id. to the candidate for the long Cameron Id.

800 m was chosen from the supply, before any drawn point was read: across the
north panel the rule finds 155 features inside the cutline, of which 17 clear
800 m and 8 of those also stand more than 1.5 km from their nearest rival. Fewer,
larger, better-separated features beat more, smaller ones.
"""


@dataclass(frozen=True)
class CandidateRow:
    """One candidate's *inputs*: what to look for and where to look for it."""

    label: str
    rule: str
    box: BoundingBox


def parse_candidate_csv(text: str) -> list[CandidateRow]:
    """Read a candidate file, keeping only the columns that are inputs.

    `lon`/`lat` are deliberately discarded: re-deriving them is the whole point,
    and reading them back in would let a stale coordinate survive a box fix.
    """
    lines = [
        line
        for line in text.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not lines:
        raise ValueError("candidate file is empty")

    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    missing = [c for c in COLUMNS if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"candidate file is missing column(s): {', '.join(missing)}")

    rows: list[CandidateRow] = []
    for row in reader:
        label = (row.get("label") or "").strip()
        rule = (row.get("rule") or "").strip()
        if not label:
            raise ValueError("candidate rows must be labelled")
        if rule not in (ISLAND_RULE, HEADLAND_RULE) and rule not in EXTREME_RULES:
            raise ValueError(
                f"{label}: unknown rule {rule!r}; expected {ISLAND_RULE!r}, "
                f"{HEADLAND_RULE!r} or one of {sorted(EXTREME_RULES)}"
            )
        rows.append(
            CandidateRow(
                label=label,
                rule=rule,
                box=BoundingBox(
                    west=float(row["box_west"]),
                    south=float(row["box_south"]),
                    east=float(row["box_east"]),
                    north=float(row["box_north"]),
                ),
            )
        )
    return rows


def resolve_candidate(row: CandidateRow, features: list[dict]) -> tuple[float, float]:
    """Apply one candidate's rule to the modern water layer.

    An empty box raises rather than returning nothing. A candidate whose box
    selects no geometry is a defect in the box, and dropping it quietly would
    shrink the held-out set without saying so.
    """
    if row.rule == ISLAND_RULE:
        islands = islands_within(features, row.box)
        if not islands:
            raise ValueError(f"{row.label}: no island centroid inside {row.box}")
        biggest = islands[0]
        return biggest.lon, biggest.lat

    if row.rule == HEADLAND_RULE:
        found = resolve_headland_feature(row, features)
        return found.lon, found.lat

    vertices: list[tuple[float, float]] = []
    for feature in features:
        vertices += vertices_of(feature.get("geometry") or {})
    try:
        lon, lat = extreme_vertex(vertices, row.box, row.rule)
    except ValueError as error:
        raise ValueError(f"{row.label}: {error}") from None
    _refuse_if_truncated(row, lon, lat)
    return lon, lat


def resolve_headland_feature(row: CandidateRow, features: list[dict]) -> ChordFeature:
    """The most prominent point on the one stretch of coast inside the box.

    Returns the whole feature, not just its coordinate, because its PROMINENCE is
    what the drawn side is selected on. `headland_checks` needs to know how far
    this tip stands off its own chord in order to recognise the same tip on the
    engraving without using its position to do so.

    Every ring in the layer is offered to the rule, and exactly one may answer.
    A ring is a continuous stretch of shore, so two answering rings means the box
    spans two shorelines - a mainland cove and an island's cape, say - and no
    single chord describes both. `chord_extreme` already refuses two stretches
    WITHIN a ring; this is the same refusal across rings.

    The extremal rules need `_refuse_if_truncated` on top of their answer because
    they can name the box edge. This rule cannot: it measures deviation from the
    chord joining the stretch's own ends, and its own endpoint guard already
    rejects a winner sitting against them.
    """
    answers: list[ChordFeature] = []
    refusals: list[str] = []
    for feature in features:
        for ring in all_rings(feature.get("geometry") or {}):
            try:
                answers.append(chord_extreme(ring, row.box, HEADLAND_MIN_PROMINENCE_M))
            except ValueError as error:
                refusals.append(str(error))

    if not answers:
        detail = f"; last refusal: {refusals[-1]}" if refusals else ""
        raise ValueError(
            f"{row.label}: no coastal stretch inside {row.box} carries a feature of "
            f"{HEADLAND_MIN_PROMINENCE_M:.0f} m prominence{detail}"
        )
    if len(answers) > 1:
        listed = ", ".join(
            f"({found.lon:.4f}, {found.lat:.4f}) at {found.prominence_m:.0f} m"
            for found in answers
        )
        raise ValueError(
            f"{row.label}: {len(answers)} separate shorelines inside {row.box} each "
            f"carry a prominent feature [{listed}], and nothing here says which one "
            f"Church drew; tighten the box onto a single stretch of coast"
        )
    return answers[0]


# For each rule, the box bound it sorts against and the coordinate it compares.
_SORTING_EDGE = {
    "west": ("box_west", lambda box: box.west, 0),
    "east": ("box_east", lambda box: box.east, 0),
    "south": ("box_south", lambda box: box.south, 1),
    "north": ("box_north", lambda box: box.north, 1),
}

EDGE_TOLERANCE_DEG = 1e-4
"""About 11 m. NSTDB vertices are far finer than this, so a genuine extremity
landing this close to the bound that selected it means the box cut the feature."""


def _refuse_if_truncated(row: CandidateRow, lon: float, lat: float) -> None:
    """Reject an "extremity" that is really the box edge.

    A box is meant to isolate one feature so that an extremal rule names a
    physical point. If the answer sits on the bound being sorted against, the
    feature carries on past the box and the coordinate would move whenever
    somebody nudged the box - which is the opposite of an objective rule.

    Only the sorting bound is checked. A `west` rule touching box_south is
    ordinary and intended: latitude bounds are how one headland is separated
    from the next.
    """
    name, bound_of, axis = _SORTING_EDGE[row.rule]
    bound = bound_of(row.box)
    value = (lon, lat)[axis]
    if abs(value - bound) <= EDGE_TOLERANCE_DEG:
        raise ValueError(
            f"{row.label}: the {row.rule}ernmost vertex landed on {name}={bound!r} "
            f"(got {value:.6f}), so the box clips the feature instead of selecting it. "
            f"Widen {name}, or the coordinate is just wherever the box was drawn. "
            f"Note NSTDB water polygons have artificial offshore boundaries, so a box "
            f"reaching into open sea will select one of those."
        )

    # The perpendicular axis matters just as much. A coastline that runs
    # steadily in one direction has no local extremity at all, so the answer is
    # whichever end of the box the rule happened to reach - and it moves as soon
    # as the box does. A real headland or cove head sits strictly inside both
    # perpendicular bounds.
    other_axis = 1 - axis
    lower_name, lower = ("box_south", row.box.south) if other_axis else ("box_west", row.box.west)
    upper_name, upper = ("box_north", row.box.north) if other_axis else ("box_east", row.box.east)
    across = (lon, lat)[other_axis]
    for edge_name, edge in ((lower_name, lower), (upper_name, upper)):
        if abs(across - edge) <= EDGE_TOLERANCE_DEG:
            raise ValueError(
                f"{row.label}: the {row.rule}ernmost vertex landed on {edge_name}={edge!r} "
                f"(got {across:.6f}), so the perpendicular bound chose it rather than any "
                f"physical extremity - the coastline here simply runs {row.rule}ward without "
                f"turning. A point defined this way moves whenever the box moves. Pick a "
                f"feature that genuinely protrudes, or use the {ISLAND_RULE!r} rule."
            )


def format_candidates(
    resolved: list[tuple[CandidateRow, tuple[float, float]]], header: str
) -> str:
    """Render a candidate file.

    Derived coordinates get a fixed six decimals - about 0.1 m, far finer than
    any feature readable on the scan - so the file stays visually aligned.

    Box bounds instead get Python's shortest round-tripping repr. They are
    *input*, chosen by a person, and `%g` would render them at six significant
    figures: a box edge at -61.234567 would be rewritten as -61.2346, moving it
    about 5 m every time the file was regenerated.
    """
    lines = [header.rstrip("\n"), ",".join(COLUMNS)]
    for row, (lon, lat) in resolved:
        box = ",".join(
            repr(float(bound))
            for bound in (row.box.west, row.box.south, row.box.east, row.box.north)
        )
        lines.append(f"{row.label},{lon:.6f},{lat:.6f},{row.rule},{box}")
    return "\n".join(lines) + "\n"


def _header_of(text: str) -> str:
    leading = []
    for line in text.splitlines():
        if line.lstrip().startswith("#"):
            leading.append(line)
        elif line.strip():
            break
    return "\n".join(leading)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--water", type=pathlib.Path, required=True)
    parser.add_argument("--candidates", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path)
    parser.add_argument(
        "--check",
        action="store_true",
        help="assert the committed file already matches the rules, and change nothing",
    )
    args = parser.parse_args(argv)

    existing = args.candidates.read_text(encoding="utf-8")
    rows = parse_candidate_csv(existing)
    features = json.loads(args.water.read_text(encoding="utf-8"))["features"]
    resolved = [(row, resolve_candidate(row, features)) for row in rows]
    rendered = format_candidates(resolved, header=_header_of(existing))

    if args.check:
        if rendered != existing:
            print(f"{args.candidates} does not match its own rules and boxes")
            return 1
        print(f"{args.candidates}: {len(rows)} candidates match their rules")
        return 0

    destination = args.out or args.candidates
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(rendered, encoding="utf-8")
    print(f"wrote {destination} ({len(rows)} candidates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
