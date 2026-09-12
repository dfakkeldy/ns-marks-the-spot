"""Inspect the actual provisional Sheet21 raster, alone and overlaid with NSTDB geometry.

Run with benchmark Python and GDAL CLI on PATH. No inverse search guide is used.
"""

import json
import subprocess
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image

HERE = Path(__file__).resolve().parent
DATA = Path.home() / "Downloads/fletcher-sheet21"
OUT = HERE / "warped-review"
OUT.mkdir(exist_ok=True)
RASTER = DATA / "repaired-fifteen/sheet-21-full-sheet.tif"
RASTERS = [("Preserved 15 + modern", RASTER), ("Experimental 17 + modern", DATA/"refinement-20260912/sheet-21-full-sheet.tif"), ("Experimental 17 alone", DATA/"refinement-20260912/sheet-21-full-sheet.tif")]
REGIONS = {'west-bay': [-61.2, 45.695, -61.105, 45.755], 'north-central': [-61.105, 45.7, -61.02, 45.755], 'sporting-mountain': [-61.04, 45.68, -60.94, 45.751], 'eastern-lakes': [-60.94, 45.665, -60.825, 45.75], 'black-river': [-61.19, 45.65, -61.025, 45.69], 'central-lakes': [-61.125, 45.625, -60.995, 45.665], 'southwest-islands': [-61.23, 45.56, -61.075, 45.625], 'lennox-passage': [-61.08, 45.565, -60.94, 45.63], 'river-bourgeois': [-60.95, 45.59, -60.825, 45.665], 'isle-madame': [-61.06, 45.56, -60.87, 45.592]}


def merc(c):
    a = np.asarray(c)
    return np.c_[
        np.deg2rad(a[:, 0]) * 6378137,
        6378137 * np.log(np.tan(np.pi / 4 + np.deg2rad(a[:, 1]) / 2)),
    ]


vectors = {}
for layer in ["water-lines", "roads"]:
    vectors[layer] = []
    for f in json.loads((DATA / f"reference-full/{layer}.geojson").read_text())[
        "features"
    ]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        vectors[layer].extend(merc(p) for p in parts)
frames = []
for name, (west, south, east, north) in REGIONS.items():
    (x0, y0), (x1, y1) = merc([[west, south], [east, north]])
    fig, axes = plt.subplots(1, 3, figsize=(21, 10))
    for i, ((label, raster), ax) in enumerate(zip(RASTERS, axes)):
        dest = DATA / f"refinement-20260912/{name}-{i}.png"
        subprocess.run(
            [
                "gdal_translate",
                "-q",
                "-of",
                "PNG",
                "-projwin",
                str(x0),
                str(y1),
                str(x1),
                str(y0),
                "-outsize",
                "1000",
                "0",
                str(raster),
                str(dest),
            ],
            check=True,
        )
        info = json.loads(
            subprocess.check_output(["gdalinfo", "-json", str(dest)], text=True)
        )
        gt = info["geoTransform"]
        w, h = info["size"]
        extent = [gt[0], gt[0] + w * gt[1], gt[3] + h * gt[5], gt[3]]
        ax.imshow(Image.open(dest), extent=extent)
        for layer, color, lw in (
            []
            if i == 2
            else [
                ("roads", "#e34fce", 0.55),
                ("water-lines", "#00baff", 0.85),
            ]
        ):
            parts = [
                p
                for p in vectors[layer]
                if p[:, 0].min() < x1
                and p[:, 0].max() > x0
                and p[:, 1].min() < y1
                and p[:, 1].max() > y0
            ]
            ax.add_collection(
                LineCollection(parts, colors=color, linewidths=lw, alpha=0.85)
            )
        ax.set(xlim=(x0, x1), ylim=(y0, y1), aspect="equal", title=label)
        ax.set_axis_off()
    fig.suptitle(
        f"{name}: actual warped imagery · cyan NSTDB water · magenta current roads"
    )
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(OUT / f"{name}.jpg", dpi=140)
    plt.close(fig)
    frames.append(
        {
            "image": f"{name}.jpg",
            "lonlat_bounds": [west, south, east, north],
            "rasters": [str(p) for _, p in RASTERS],
            "reference": "reports/fletcher/sheet21/reference-receipts.json",
            "method": "GDAL raster geographic window; modern vectors projected directly to EPSG:3857, not inverse search guide.",
        }
    )
(OUT / "frames.json").write_text(json.dumps(frames, indent=2) + "\n")
