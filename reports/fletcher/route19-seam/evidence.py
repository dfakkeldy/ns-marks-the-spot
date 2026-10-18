"""Render original-scan crosshairs and modern topology for the frozen seam checks."""

import argparse
import importlib.util
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "common", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--source16", type=Path, required=True)
p.add_argument("--source19", type=Path, required=True)
p.add_argument("--reference-dir", type=Path, required=True)
p.add_argument("--out", type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
d = json.loads((HERE / "observations.json").read_text())
sources = {}
for k, path in [("16", a.source16), ("19", a.source19)]:
    c.verified(path, d["source_sha256"][k])
    sources[k] = Image.open(path)
vectors = {}
for receipt in json.loads(
    (HERE.parent / "sheet16/reference-receipts.json").read_text()
):
    path = a.reference_dir / (receipt["name"] + ".geojson")
    c.verified(path, receipt["sha256"])
    vectors[receipt["name"]] = []
    for f in json.loads(path.read_text())["features"]:
        g = f["geometry"]
        parts = (
            [g["coordinates"]]
            if g["type"] == "LineString"
            else g["coordinates"]
            if g["type"] in ["MultiLineString", "Polygon"]
            else [r for p in g["coordinates"] for r in p]
        )
        vectors[receipt["name"]].extend(c.merc(x) for x in parts)
fig, axes = plt.subplots(2, 2, figsize=(12, 9))
frames = []
for row, q in enumerate(d["points"]):
    x, y = q["pixel_xy"]
    box = [x - 90, y - 70, x + 90, y + 70]
    crop = sources[q["sheet"]].crop(box).resize((720, 560))
    dr = ImageDraw.Draw(crop)
    dr.line((330, 280, 390, 280), fill="cyan", width=2)
    dr.line((360, 250, 360, 310), fill="cyan", width=2)
    axes[row, 0].imshow(crop)
    axes[row, 0].set_axis_off()
    axes[row, 0].set_title(q["id"] + " native crosshair")
    centre = c.merc([q["lonlat"]])[0]
    radius = 700
    ax = axes[row, 1]
    for name, col, lw in [
        ("roads", "#888888", 0.8),
        ("highways", "#dd8800", 1.2),
        ("water-lines", "#0099c6", 1.2),
    ]:
        local = [
            x
            for x in vectors[name]
            if (x.max(0) >= centre - radius).all()
            and (x.min(0) <= centre + radius).all()
        ]
        ax.add_collection(LineCollection(local, colors=col, linewidths=lw))
    ax.plot(*centre, "+", color="red", markersize=14)
    ax.set(
        xlim=(centre[0] - radius, centre[0] + radius),
        ylim=(centre[1] - radius, centre[1] + radius),
        aspect="equal",
        title=q["label"],
    )
    ax.set_axis_off()
    frames.append(
        {
            "id": q["id"],
            "sheet": q["sheet"],
            "native_box": box,
            "display_size": [720, 560],
            "rotation_degrees": 0,
            "crosshair_display_xy": [360, 280],
            "modern_reference_lonlat": q["lonlat"],
        }
    )
fig.suptitle(
    "Additional stream checks: original native pixels and modern NSTDB topology"
)
fig.tight_layout()
fig.savefig(a.out / "stream-checks.jpg", dpi=140)
plt.close(fig)
for q in d["lines"] + [json.loads((HERE / "continuation-trace.json").read_text())]:
    pts = q["pixel_xy"]
    box = [
        min(x for x, y in pts) - 60,
        min(y for x, y in pts) - 10,
        max(x for x, y in pts) + 60,
        max(y for x, y in pts) + 10,
    ]
    crop = sources[q["sheet"]].crop(box)
    ImageDraw.Draw(crop).line(
        [(x - box[0], y - box[1]) for x, y in pts], fill="cyan", width=1
    )
    crop.resize((crop.width * 3, crop.height * 3)).save(
        a.out / (q["id"] + "-trace.jpg"), quality=90
    )
    frames.append(
        {
            "id": q["id"],
            "sheet": q["sheet"],
            "native_box": box,
            "display_size": [crop.width * 3, crop.height * 3],
            "rotation_degrees": 0,
            "trace": "original native vertices minus crop origin, multiplied by 3",
        }
    )
c.write(a.out / "evidence-frames.json", frames)
