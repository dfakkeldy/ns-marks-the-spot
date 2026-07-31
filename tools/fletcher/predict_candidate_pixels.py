"""Pre-position mined candidates on the scan so a human only has to drag them.

`feature_candidates.py` proposes WHERE a control could be, in lon/lat. It cannot
say where that place falls in scan pixels, so every proposal still cost a
two-pane hunt: find the feature on the modern map, then find it again on the
1884 engraving. This projects each candidate through the sheet's existing fit,
so the pin arrives near its answer and the human only drags the scan side.

Selection fills the SPARSEST gaps first. Held-out error tracks local control
spacing at roughly 16% of it (`reports/fletcher/SHEET19_DENSITY_DIAGNOSTIC.md`),
so a point added where controls are already dense buys almost nothing while one
added in a gap buys a lot. Candidates are emitted in that priority order, which
means a human who stops after twenty has done the twenty most valuable ones
rather than an arbitrary twenty.

The emitted file carries the sheet's ACCEPTED controls first, at their measured
pixels, then the proposals. Two reasons: importing replaces the whole set, so
omitting the accepted controls would throw away the fit; and because the panel
numbers rows in file order, "everything numbered above N needs dragging" is a
rule the human can actually follow in a UI that does not show labels.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import pathlib
import subprocess

from tools.fletcher.emit_import_gcps import HEADER, LONLAT_DECIMALS, PIXEL_DECIMALS

EARTH_RADIUS_M = 6378137.0


def to_mercator(lon: float, lat: float) -> tuple[float, float]:
    x = EARTH_RADIUS_M * math.radians(lon)
    y = EARTH_RADIUS_M * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


def inverse_transform(
    controls: list[dict], lonlats: list[tuple[float, float]], runner=None
) -> list[tuple[float, float]]:
    """Project lon/lat back into scan pixels through a TPS built from `controls`.

    `gdaltransform -i` inverts the same warp the fit and the score use, so a
    prediction lands where that fit believes the feature is. Reimplementing the
    inversion here would be a second, subtly different transform whose
    disagreement with the fit would look like human placement error.
    """
    command = ["gdaltransform", "-tps", "-i"]
    for control in controls:
        pixel, lonlat = control["pixel"], control["lonlat"]
        world_x, world_y = to_mercator(lonlat["lon"], lonlat["lat"])
        command += ["-gcp", str(pixel["x"]), str(pixel["y"]), str(world_x), str(world_y)]

    stdin = "".join(f"{x} {y}\n" for x, y in (to_mercator(lon, lat) for lon, lat in lonlats))
    run = runner or (
        lambda cmd, text: subprocess.run(
            cmd, input=text, capture_output=True, text=True, timeout=300, check=True
        ).stdout
    )
    out = run(command, stdin)
    pixels = []
    for line in out.strip().splitlines():
        parts = line.split()
        pixels.append((float(parts[0]), float(parts[1])))
    return pixels


def inside(frame: list[list[float]], x: float, y: float) -> bool:
    xs = [point[0] for point in frame]
    ys = [point[1] for point in frame]
    return min(xs) <= x <= max(xs) and min(ys) <= y <= max(ys)


def select_sparsest(
    existing: list[tuple[float, float]],
    candidates: list[dict],
    count: int,
    min_gap_px: float,
) -> list[dict]:
    """Farthest-point selection seeded with the controls already placed.

    Each pick is the candidate furthest from everything chosen so far, so the
    widest gap is always filled next. Seeding with `existing` is what stops the
    first picks from crowding controls the sheet already has.
    """
    chosen: list[dict] = []
    placed = list(existing)
    remaining = [c for c in candidates]
    while remaining and len(chosen) < count:
        best, best_gap = None, -1.0
        for candidate in remaining:
            gap = min(
                math.hypot(candidate["px"] - px, candidate["py"] - py)
                for px, py in placed
            )
            if gap > best_gap:
                best, best_gap = candidate, gap
        if best is None or best_gap < min_gap_px:
            break
        chosen.append({**best, "gap_px": best_gap})
        placed.append((best["px"], best["py"]))
        remaining.remove(best)
    return chosen


def _row(px: float, py: float, lon: float, lat: float, role: str, label: str) -> str:
    return (
        f"{px:.{PIXEL_DECIMALS}f},{py:.{PIXEL_DECIMALS}f},"
        f"{lon:.{LONLAT_DECIMALS}f},{lat:.{LONLAT_DECIMALS}f},{role},{label}"
    )


def build_csv(observation: dict, proposals: list[dict]) -> str:
    controls = observation["controls"]
    lines = [
        f"# sheet-{observation.get('sheet_id', '?')} accepted controls + machine proposals.",
        "# GENERATED - do not hand-edit.",
        f"# Rows 1-{len(controls)} are ACCEPTED controls at measured pixels: do not drag.",
        f"# Rows {len(controls) + 1}-{len(controls) + len(proposals)} are PROPOSALS at"
        " PREDICTED pixels: drag every one onto the drawn feature, or delete it.",
        "# A proposal sits exactly where the current fit expects it, so its residual"
        " reads 0 until you move it. Residual cannot tell you which are still undragged.",
        HEADER,
    ]
    for control in controls:
        lines.append(
            _row(
                control["pixel"]["x"],
                control["pixel"]["y"],
                control["lonlat"]["lon"],
                control["lonlat"]["lat"],
                "control",
                control["id"],
            )
        )
    for proposal in proposals:
        lines.append(
            _row(
                proposal["px"],
                proposal["py"],
                proposal["lon"],
                proposal["lat"],
                "control",
                proposal["id"],
            )
        )
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--observation", type=pathlib.Path, required=True)
    parser.add_argument("--candidates", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--count", type=int, default=40)
    parser.add_argument(
        "--min-gap-px",
        type=float,
        default=250.0,
        help="Skip a candidate closer than this to an already-placed point.",
    )
    args = parser.parse_args(argv)

    observation = json.loads(args.observation.read_text(encoding="utf-8"))
    rows = list(csv.DictReader(args.candidates.open(encoding="utf-8")))
    lonlats = [(float(r["lon"]), float(r["lat"])) for r in rows]
    pixels = inverse_transform(observation["controls"], lonlats)

    frame = observation["usable_frame"]
    candidates = [
        {"id": r["id"], "kind": r["kind"], "lon": ll[0], "lat": ll[1], "px": px, "py": py}
        for r, ll, (px, py) in zip(rows, lonlats, pixels)
        if inside(frame, px, py)
    ]

    existing = [(c["pixel"]["x"], c["pixel"]["y"]) for c in observation["controls"]]
    chosen = select_sparsest(existing, candidates, args.count, args.min_gap_px)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(build_csv(observation, chosen), encoding="utf-8")
    widest = chosen[0]["gap_px"] if chosen else 0.0
    tightest = chosen[-1]["gap_px"] if chosen else 0.0
    print(
        f"{len(rows)} candidates -> {len(candidates)} inside the frame -> "
        f"{len(chosen)} proposed (gap {widest:.0f}px down to {tightest:.0f}px)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
