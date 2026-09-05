"""Replay this fixed visual experiment's scores; does not edit any controls.

Run from any directory with NumPy and gdaltransform available. Raw imagery and
provincial vectors are unnecessary for score replay; visual identification is
manual and is documented separately, not reproduced by this script.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
R = 6378137.0


def mercator(lonlat):
    lon, lat = lonlat
    return np.array(
        [
            R * math.radians(lon),
            R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)),
        ]
    )


def lonlat(xy):
    return [
        math.degrees(xy[0] / R),
        math.degrees(2 * math.atan(math.exp(xy[1] / R)) - math.pi / 2),
    ]


def metres(a, b):
    return 6371008.8 * math.hypot(
        math.radians(a[0] - b[0]) * math.cos(math.radians((a[1] + b[1]) / 2)),
        math.radians(a[1] - b[1]),
    )


def reference(controls, points):
    executable = shutil.which("gdaltransform")
    if executable is None:
        raise RuntimeError("gdaltransform is required")
    cmd = [executable, "-tps"]
    for row in controls:
        x, y = mercator([float(row["lon"]), float(row["lat"])])
        cmd += ["-gcp", row["pixel_x"], row["pixel_y"], str(x), str(y)]
    stdin = "".join(f"{p['pixel_xy'][0]} {p['pixel_xy'][1]}\n" for p in points)
    output = subprocess.run(
        cmd, input=stdin, text=True, capture_output=True, check=True
    ).stdout
    result = [
        lonlat(list(map(float, line.split()[:2]))) for line in output.splitlines()
    ]
    assert len(result) == len(points)
    return result


def close(actual, expected):
    assert math.isfinite(actual) and abs(actual - expected) < 0.001, (actual, expected)


def main():
    predictions = json.loads((HERE / "predictions.json").read_text())
    scores = json.loads((HERE / "scores.json").read_text())
    source = REPO / scores["reference_path"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == scores["reference_sha256"]
    assert (
        hashlib.sha256((HERE / "predictions.json").read_bytes()).hexdigest()
        == scores["predictions_sha256"]
    )
    controls = [
        r
        for r in csv.DictReader(
            l for l in source.read_text().splitlines() if not l.startswith("#")
        )
        if r["role"] == "control"
    ]
    assert len(controls) == scores["reference_control_count"] == 60
    points = predictions["points"]
    refs = reference(controls, points)
    grid = json.loads((REPO / "tools/fletcher/observations/sheet-19.json").read_text())
    xf = np.polyfit(
        [m["pixel_x"] for m in grid["meridians"]],
        [m["lon"] for m in grid["meridians"]],
        1,
    )
    yf = np.polyfit(
        [m["pixel_y"] for m in grid["parallels"]],
        [m["lat"] for m in grid["parallels"]],
        1,
    )
    base = [
        [
            float(np.polyval(xf, p["pixel_xy"][0])),
            float(np.polyval(yf, p["pixel_xy"][1])),
        ]
        for p in points
    ]
    shift = mercator(points[0]["lonlat"]) - mercator(base[0])
    for p, ref, b, saved in zip(points, refs, base, scores["points"]):
        assert p["id"] == saved["id"]
        close(metres(ref, p["lonlat"]), saved["reference_agreement_m"])
        close(metres(b, p["lonlat"]), saved["printed_grid_to_proposal_m"])
        close(metres(b, ref), saved["printed_grid_to_reference_m"])
        close(
            metres(lonlat(mercator(b) + shift), p["lonlat"]),
            saved["target_translation_residual_m"],
        )
    gate = predictions["pre_scoring_gate"]
    result = {
        "target_reference": scores["points"][0]["reference_agreement_m"]
        <= gate["target_agreement_with_saved_warp_max_m"],
        "context_reference": all(
            r["reference_agreement_m"]
            <= gate["each_context_agreement_with_saved_warp_max_m"]
            for r in scores["points"][1:]
        ),
        "context_translation": all(
            r["target_translation_residual_m"]
            <= gate["one_target_translation_each_context_residual_max_m"]
            for r in scores["points"][1:]
        ),
    }
    assert result == scores["gate"] and all(result.values()) == scores["passed"]
    diagnostic = json.loads((HERE / "reference-diagnostic.json").read_text())
    reduced = reference([r for r in controls if r["label"] != "cand-0141"], points)
    for p, ref, saved in zip(points, reduced, diagnostic["points"]):
        close(metres(ref, p["lonlat"]), saved["agreement_m"])
    print("Replayed 4 frozen correspondences and reference sensitivity to within 1 mm.")
    print("Primary gate remains FAIL; local translation consistency passes.")


if __name__ == "__main__":
    main()
