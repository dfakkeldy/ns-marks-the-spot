"""Measure crop-inset sensitivity on frozen fits; do not modify either sheet.

Run from the repository root with benchmark Python and GDAL CLIs on PATH.
"""

import importlib.util
import json
from pathlib import Path

import numpy as np

s = importlib.util.spec_from_file_location(
    "b", "reports/fletcher/judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(s)
s.loader.exec_module(c)
r = Path("reports/fletcher/northern-validation-20260909")
protocol = json.loads((r / "protocol.json").read_text())
curves = {}
hashes = {}
for sheet, sel, offset in [
    ("14", lambda a: a[:, 1] > 6400, 8),
    ("16", lambda a: a[:, 1] < 1100, -8),
]:
    fitpath = Path(protocol["fits"][sheet]["path"])
    c.verified(fitpath, protocol["fits"][sheet]["sha256"])
    fit = json.loads(fitpath.read_text())
    bp = Path(f"reports/fletcher/sheet{sheet}/boundary.json")
    boundary = json.loads(bp.read_text())
    a = np.array(boundary["ring_pixel_xy"])
    a = np.unique(a[sel(a)], axis=0)
    a = a[np.argsort(a[:, 0])]
    xx = np.arange(a[0, 0], a[-1, 0], 10)
    xy = np.c_[xx, np.interp(xx, a[:, 0], a[:, 1])]
    gcps = []
    for p, w in zip(fit["points"], c.merc([p["lonlat"] for p in fit["points"]])):
        gcps.extend(["-gcp", *map(str, [*p["pixel_xy"], *w])])
    inp = np.vstack([xy, xy + [0, offset]])
    world = np.array(
        [
            list(map(float, l.split()[:2]))
            for l in c.run(
                "gdaltransform",
                "-tps",
                *gcps,
                stdin="".join(f"{x} {y}\n" for x, y in inp),
            ).splitlines()
        ]
    )
    curves[sheet] = np.split(world, 2)
    hashes[sheet] = {"fit_sha256": c.digest(fitpath), "boundary_sha256": c.digest(bp)}
pts = []
for lon in np.linspace(-61.46, -61.24, 221):
    x = c.R * np.deg2rad(lon)
    ys = {}
    for sheet, arrs in curves.items():
        ys[sheet] = []
        for a in arrs:
            assert np.all(np.diff(a[:, 0]) > 0) and a[0, 0] < x < a[-1, 0]
            ys[sheet].append(float(np.interp(x, a[:, 0], a[:, 1])))
    lat = c.unmerc(np.array([[x, (ys["14"][0] + ys["16"][0]) / 2]]))[0, 1]
    scale = np.cos(np.deg2rad(lat))
    before = (ys["14"][0] - ys["16"][0]) * scale
    after = (ys["14"][1] - ys["16"][1]) * scale
    pts.append(
        {
            "lon": float(lon),
            "current_gap_ground_m": before,
            "gap_without_8px_vertical_insets_ground_m": after,
            "recovered_ground_m": before - after,
        }
    )
d = {
    "scope": "Sensitivity only. Restore 8 native y pixels along Sheet14 bottom and Sheet16 top; no fit or production crop changes. Original joins are piecewise curves, densified at10px. This is not a newly supported boundary match.",
    "inputs": hashes,
    "longitude_range": [-61.46, -61.24],
    "current_gap_range_ground_m": [
        min(p["current_gap_ground_m"] for p in pts),
        max(p["current_gap_ground_m"] for p in pts),
    ],
    "untrimmed_gap_range_ground_m": [
        min(p["gap_without_8px_vertical_insets_ground_m"] for p in pts),
        max(p["gap_without_8px_vertical_insets_ground_m"] for p in pts),
    ],
    "recovered_range_ground_m": [
        min(p["recovered_ground_m"] for p in pts),
        max(p["recovered_ground_m"] for p in pts),
    ],
    "points": pts,
}
c.write(r / "join-inset-sensitivity.json", d)
print({k: v for k, v in d.items() if k != "points"})
