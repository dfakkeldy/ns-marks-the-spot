"""Replay the frozen Judique draft; checks never enter the TPS fit.

Requires NumPy, SciPy and GDAL command-line tools. Outputs stay in --out.
"""

import argparse
import csv
import hashlib
import io
import json
import math
import shutil
import subprocess
from pathlib import Path

import numpy as np
from scipy.spatial import ConvexHull, Delaunay

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--observations",
    type=Path,
    default=Path(__file__).with_name("sheet-observations.json"),
)
parser.add_argument("--out", type=Path, required=True)
parser.add_argument(
    "--source",
    type=Path,
    help="Verified native 10815 x 7549 PNG; required unless --score-only",
)
parser.add_argument("--score-only", action="store_true")
args = parser.parse_args()
ROOT = args.out.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[3]
REPORT = args.observations.resolve().parent
observations_path = args.observations.resolve()


def gdal(name):
    executable = shutil.which(name)
    if not executable:
        raise SystemExit(f"{name} must be on PATH")
    return executable


p = json.loads(observations_path.read_text())
ctrl = [r for r in p["points"] if r["role"] == "control"]
checks = [r for r in p["points"] if r["role"] == "check"]
R = 6378137


def merc(ll):
    a = np.asarray(ll)
    return np.c_[
        R * np.deg2rad(a[:, 0]), R * np.log(np.tan(np.pi / 4 + np.deg2rad(a[:, 1]) / 2))
    ]


def unmerc(a):
    return np.c_[
        np.rad2deg(a[:, 0] / R),
        np.rad2deg(2 * np.arctan(np.exp(a[:, 1] / R)) - np.pi / 2),
    ]


def distance(a, b):
    return 6371008.8 * np.hypot(
        np.deg2rad(a[:, 0] - b[:, 0]) * np.cos(np.deg2rad((a[:, 1] + b[:, 1]) / 2)),
        np.deg2rad(a[:, 1] - b[:, 1]),
    )


xy = np.array([r["pixel_xy"] for r in ctrl])
world = merc([r["lonlat"] for r in ctrl])
gcp = []
for q, w in zip(xy, world):
    gcp += ["-gcp", str(q[0]), str(q[1]), str(w[0]), str(w[1])]


def transform(a):
    stdout = subprocess.run(
        [gdal("gdaltransform"), "-tps"] + gcp,
        input="".join(f"{q[0]} {q[1]}\n" for q in a),
        text=True,
        capture_output=True,
        check=True,
    ).stdout
    return np.array([list(map(float, l.split()[:2])) for l in stdout.splitlines()])


qxy = np.array([r["pixel_xy"] for r in checks])
qw = np.array([r["lonlat"] for r in checks])
pred = transform(qxy)
ll = unmerc(pred)
err = distance(ll, qw)
tri = Delaunay(xy)
inside = tri.find_simplex(qxy) >= 0
# Four user-reviewed controls, translation of printed grid only.
grid = json.loads((REPO / "tools/fletcher/observations/sheet-19.json").read_text())
xf = np.polyfit(
    [r["pixel_x"] for r in grid["meridians"]], [r["lon"] for r in grid["meridians"]], 1
)
yf = np.polyfit(
    [r["pixel_y"] for r in grid["parallels"]], [r["lat"] for r in grid["parallels"]], 1
)


def baseline(a):
    return merc(np.c_[np.polyval(xf, a[:, 0]), np.polyval(yf, a[:, 1])])


reviewed = np.array([r.get("review") == "user-reviewed" for r in ctrl])
assert reviewed.sum() == 4
shift = np.median(world[reviewed] - baseline(xy[reviewed]), axis=0)
old_err = distance(unmerc(baseline(qxy) + shift), qw)
xx, yy = np.meshgrid(
    np.arange(xy[:, 0].min(), xy[:, 0].max() + 1, 25),
    np.arange(xy[:, 1].min(), xy[:, 1].max() + 1, 25),
)
sample = np.c_[xx.ravel(), yy.ravel()]
sample = sample[tri.find_simplex(sample) >= 0]
f = transform(np.vstack([sample, sample + [1, 0], sample + [0, 1]]))
a, b, c = np.split(f, 3)
dx = b - a
dy = c - a
det = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
rows = [
    {
        "id": r["id"],
        "predicted_lonlat": l.tolist(),
        "error_m": float(e),
        "four_reviewed_translation_error_m": float(oe),
        "inside_control_hull": bool(ins),
    }
    for r, l, e, oe, ins in zip(checks, ll, err, old_err, inside)
]
g = p["gate"]
gate = {
    "median_error": bool(np.median(err) <= g["check_median_max_ground_m"]),
    "max_error": bool(max(err) <= g["check_max_ground_m"]),
    "checks_inside_hull": bool(inside.all()),
    "no_sampled_folds": bool((det < 0).all()),
}
score = {
    "observations_sha256": hashlib.sha256(observations_path.read_bytes()).hexdigest(),
    "control_count": len(ctrl),
    "check_count": len(checks),
    "method": "GDAL TPS in EPSG:3857, check points never supplied as GCPs",
    "points": rows,
    "median_error_m": float(np.median(err)),
    "max_error_m": float(max(err)),
    "baseline_median_error_m": float(np.median(old_err)),
    "jacobian": {
        "sample_spacing_source_px": 25,
        "sample_count": len(sample),
        "folded_or_degenerate_samples": int((det >= 0).sum()),
        "expected_sign": "negative: source y increases downwards",
        "minimum_determinant": float(det.min()),
        "maximum_determinant": float(det.max()),
        "limitation": "A sampled numerical diagnostic, not a proof between samples.",
    },
    "gate": gate,
    "passed": all(gate.values()),
}
(ROOT / "scores.json").write_text(json.dumps(score, indent=2) + "\n")
print(json.dumps(score, indent=2))
# Retain numeric spellings for saved hand points and refuse changed coordinates.
original_path = REPO / "tools/fletcher/measured/sheet-19.csv"
original_rows = {
    r["label"]: r
    for r in csv.DictReader(
        line
        for line in original_path.read_text().splitlines()
        if not line.startswith("#")
    )
}
output = io.StringIO(newline="")
output.write("# Judique Sheet 19 DRAFT; native scan 10815 x 7549.\n")
output.write(
    "# Checks are excluded from fitting. Import replaces controls; use a separate draft map.\n"
)
output.write(
    f"# Frozen observations SHA256: {hashlib.sha256(observations_path.read_bytes()).hexdigest()}\n"
)
writer = csv.writer(output, lineterminator="\n")
writer.writerow(["pixel_x", "pixel_y", "lon", "lat", "role", "label"])
for row in p["points"]:
    values = [*row["pixel_xy"], *row["lonlat"]]
    if row.get("review") == "preserved-hand-added":
        saved = original_rows[row["id"]]
        strings = [saved[k] for k in ["pixel_x", "pixel_y", "lon", "lat"]]
        if list(map(float, strings)) != values:
            raise SystemExit(f"Changed hand control {row['id']}")
        values = strings
    writer.writerow([*values, row["role"], row["id"]])
(ROOT / "judique-sheet19-draft.csv").write_text(output.getvalue())
if args.score_only:
    raise SystemExit(0)
if args.source is None:
    parser.error("--source is required to render a raster")
if hashlib.sha256(args.source.read_bytes()).hexdigest() != p["source_sha256"]:
    raise SystemExit("Native source SHA256 mismatch")
# Densify source control hull before mapping its clipping edge.
h = ConvexHull(xy)
ring = xy[h.vertices]
dense = []
for a, b in zip(ring, np.roll(ring, -1, axis=0)):
    n = math.ceil(np.linalg.norm(b - a) / 25)
    dense.extend(a + (b - a) * i / n for i in range(n))
warped = transform(np.array(dense))
warped = np.vstack([warped, warped[0]])
cut = {
    "type": "FeatureCollection",
    "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
    "features": [
        {
            "type": "Feature",
            "properties": {},
            "geometry": {"type": "Polygon", "coordinates": [warped.tolist()]},
        }
    ],
}
(ROOT / "preview-hull.geojson").write_text(json.dumps(cut))
source = str(args.source.resolve())
vrt = str(ROOT / "preview-controls.vrt")
tif = str(ROOT / "judique-sheet19-draft.tif")
cmd = (
    [gdal("gdal_translate"), "-of", "VRT", "-a_srs", "EPSG:3857"] + gcp + [source, vrt]
)
subprocess.run(cmd, check=True, capture_output=True)
cmd = [
    gdal("gdalwarp"),
    "-overwrite",
    "-tps",
    "-t_srs",
    "EPSG:3857",
    "-r",
    "cubic",
    "-tr",
    "5",
    "5",
    "-cutline",
    str(ROOT / "preview-hull.geojson"),
    "-crop_to_cutline",
    "-dstalpha",
    "-co",
    "COMPRESS=DEFLATE",
    "-co",
    "TILED=YES",
    vrt,
    tif,
]
subprocess.run(cmd, check=True, capture_output=True)
info = json.loads(
    subprocess.run(
        [gdal("gdalinfo"), "-json", tif], check=True, text=True, capture_output=True
    ).stdout
)
(ROOT / "raster-info.json").write_text(json.dumps(info, indent=2) + "\n")
subprocess.run(
    [
        gdal("gdal_translate"),
        "-of",
        "PNG",
        tif,
        str(ROOT / "judique-sheet19-draft.png"),
    ],
    check=True,
    capture_output=True,
)
print("Wrote clipped draft GeoTIFF", info["size"])
