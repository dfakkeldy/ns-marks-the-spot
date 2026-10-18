"""Compare actual baseline and refined rasters with unchanged NSTDB geometry.

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
DATA = Path.home() / "Downloads/fletcher-sheet16"
OUT = HERE / "warped-review"
OUT.mkdir(exist_ok=True)
RASTERS = [
    (
        "34 controls (previous)",
        Path.home() / "Downloads/mabou-full-sheet/result/sheet-16-full-sheet.tif",
    ),
    (
        "36 controls (selected refinement)",
        Path.home()
        / "Downloads/mabou-north-audit-20260909/result36/sheet-16-full-sheet.tif",
    ),
]
REGIONS = {
    "glendyer": [-61.372, 46.065, -61.325, 46.102],
    "elgin": [-61.328, 46.07, -61.29, 46.105],
    "mabou-estuary": [-61.445, 46.061, -61.399, 46.091],
}


def merc(c):
    a = np.asarray(c)
    return np.c_[
        np.deg2rad(a[:, 0]) * 6378137,
        6378137 * np.log(np.tan(np.pi / 4 + np.deg2rad(a[:, 1]) / 2)),
    ]


vectors = {}
for layer in ["water-lines", "roads"]:
    vectors[layer] = []
    for f in json.loads((DATA / f"reference/{layer}.geojson").read_text())["features"]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        vectors[layer].extend(merc(p) for p in parts)
frames = []
for name, (west, south, east, north) in REGIONS.items():
    (x0, y0), (x1, y1) = merc([[west, south], [east, north]])
    fig, axes = plt.subplots(1, 2, figsize=(15, 10))
    for i, ((label, raster), ax) in enumerate(zip(RASTERS, axes)):
        dest = Path.home() / f"Downloads/mabou-north-audit-20260909/{name}-{i}.png"
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
        for layer, color, lw in [
            ("roads", "#e34fce", 0.55),
            ("water-lines", "#00baff", 0.85),
        ]:
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
            "reference": "reports/fletcher/sheet16/reference-receipts.json",
            "method": "GDAL raster geographic window; modern vectors projected directly to EPSG:3857, not inverse search guide.",
        }
    )
(OUT / "frames.json").write_text(json.dumps(frames, indent=2) + "\n")
