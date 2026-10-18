"""Render source-frame checks and inspect local TPS mechanics for the seam."""

import argparse
import csv
import importlib.util
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image, ImageDraw
from scipy.interpolate import RBFInterpolator

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "common", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--out", type=Path, required=True)
p.add_argument("--source19", type=Path, required=True)
p.add_argument("--source22", type=Path, required=True)
p.add_argument("--reference-dir", type=Path, required=True)
a = p.parse_args()
a.out.mkdir(exist_ok=True, parents=True)
obs = json.loads((HERE / "observations.json").read_text())
fresh = json.loads((HERE / "fresh-checks.json").read_text())
revised = json.loads((HERE / "revised-judique.json").read_text())
cs = [p for p in revised["points"] if p["role"] == "control"]
old = json.loads((HERE.parent / "visual-expansion/sheet-observations.json").read_text())
assert len(cs) == 40 and cs[:39] == [p for p in old["points"] if p["role"] == "control"]
source = {}
for k, path, expected in [
    ("19", a.source19, revised["source_sha256"]),
    (
        "22",
        a.source22,
        json.loads(
            (HERE.parent / "sheet22-corridor/revised-observations.json").read_text()
        )["source_sha256"],
    ),
]:
    c.verified(path, expected)
    source[k] = Image.open(path).convert("RGB")
vectors = {}
for r in json.loads(
    (HERE.parent / "sheet22-corridor/reference-receipts.json").read_text()
):
    path = a.reference_dir / (r["name"] + ".geojson")
    c.verified(path, r["sha256"])
    parts = []
    if r["name"] == "water-polygons":
        continue
    for f in json.loads(path.read_text())["features"]:
        g = f["geometry"]
        parts.extend(
            c.merc(x)
            for x in (
                [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
            )
        )
    vectors[r["name"]] = parts
points = obs["points"] + fresh["points"]
fig, axes = plt.subplots(4, 2, figsize=(12, 14))
for row, q in enumerate(points):
    box = q["source_crop"]["native_box"]
    im = source[q["sheet"]].crop(box)
    axes[row, 0].imshow(im, extent=(box[0], box[2], box[3], box[1]))
    axes[row, 0].plot(*q["pixel_xy"], "+", color="cyan", ms=22, mew=1.5)
    role = "consumed as S01 control" if q["id"] == "P19" else "check"
    axes[row, 0].set_title(q["id"] + " / " + role)
    ax = axes[row, 1]
    centre = c.merc([q["lonlat"]])[0]
    for name, col, width in [
        ("water-lines", "#007cba", 1.6),
        ("roads", "#909090", 0.8),
        ("highways", "#dc8100", 1.5),
        ("rail", "#9674a6", 0.8),
    ]:
        ax.add_collection(LineCollection(vectors[name], colors=col, linewidths=width))
    ax.plot(*centre, "+", color="#c93326", ms=22, mew=1.5)
    ax.set(
        xlim=(centre[0] - 500, centre[0] + 500),
        ylim=(centre[1] - 400, centre[1] + 400),
        aspect="equal",
        title=q["label"],
    )
    ax.ticklabel_format(useOffset=False, style="plain")
    ax.tick_params(labelsize=7)
fig.suptitle(
    "Southern seam: native image-edge pixels and modern EPSG:3857 references",
    fontsize=12,
)
fig.tight_layout(rect=(0, 0, 1, 0.97))
fig.savefig(a.out / "physical-checks.jpg", dpi=130)
plt.close(fig)
for line in obs["lines"] + [json.loads((HERE / "longpoint-trace.json").read_text())]:
    frame = line.get("source_crop", line)
    box = frame["native_box"]
    size = frame["display_size"]
    im = source[line["sheet"].split("-")[0]].crop(box).resize(size)
    xy = [
        (
            (x - box[0]) * size[0] / (box[2] - box[0]),
            (y - box[1]) * size[1] / (box[3] - box[1]),
        )
        for x, y in line["pixel_xy"]
    ]
    d = ImageDraw.Draw(im)
    d.line(xy, fill="cyan", width=2)
    for x, y in xy:
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill="red")
    im.save(a.out / (line["id"] + "-trace.png"))
# Cross-check the local TPS formula and sample orientation in the used southern region.
xy = np.array([p["pixel_xy"] for p in cs])
world = c.merc([p["lonlat"] for p in cs])
fit = RBFInterpolator(xy, world, kernel="thin_plate_spline", degree=1, smoothing=0)
x, y = np.meshgrid(np.arange(4200, 4550, 10), np.arange(6000, 6566, 10))
grid = np.c_[x.ravel(), y.ravel()]
w = fit(grid)
dx = fit(grid + [1, 0]) - w
dy = fit(grid + [0, 1]) - w
det = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
assert (det < 0).all()
scores = json.loads((a.out / "scores.json").read_text())
ref = {q["id"]: q for q in scores["points"]}
qxy = np.array([q["pixel_xy"] for q in fresh["points"]])
delta = float(
    np.linalg.norm(
        fit(qxy) - c.merc([ref[q["id"]]["predicted_lonlat"] for q in fresh["points"]]),
        axis=1,
    ).max()
)
assert delta < 0.001
c.write(
    a.out / "warp-verification.json",
    {
        "preserved_controls": 39,
        "total_controls": 40,
        "scipy_gdal_max_projected_m": delta,
        "local_jacobian_samples": len(grid),
        "nonnegative_jacobians": int((det >= 0).sum()),
        "min_jacobian": float(det.min()),
        "max_jacobian": float(det.max()),
        "note": "Same-input solver agreement and sampled orientation; not independent geography or a continuous no-fold proof.",
    },
)
with (a.out / "judique-local-controls-checks.csv").open("w") as stream:
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(["pixel_x", "pixel_y", "lon", "lat", "role", "label"])
    for q in cs + fresh["points"]:
        writer.writerow([*q["pixel_xy"], *q["lonlat"], q["role"], q["id"]])
print(
    "Preserved 39 controls; fresh-check solver agreement and local orientation verified."
)
