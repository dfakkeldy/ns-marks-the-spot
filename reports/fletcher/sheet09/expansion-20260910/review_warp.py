"""Inspect the actual provisional Sheet9 raster, alone and overlaid with NSTDB geometry.

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
DATA = Path.home() / "Downloads/fletcher-sheet09"
OUT = HERE / "warped-review"
OUT.mkdir(exist_ok=True)
RASTER = DATA / "expansion-20260910/sheet-09-full-sheet.tif"
RASTERS = [
    ("16-control provisional TPS raster", RASTER),
    ("Same raster + modern reference", RASTER),
]
REGIONS = {
    "cheticamp-harbour": [
        -61.06792939352159,
        46.5922181791636,
        -61.0122535458462,
        46.61576810198122,
    ],
    "faribault": [-60.9169773, 46.5852935, -60.8869298, 46.6111433],
    "fiset-aucoin": [-60.9769361, 46.5805015, -60.9311439, 46.60997],
    "grand-etang": [-61.047003600000004, 46.5531644, -61.0129697, 46.572704],
    "west-basile": [-61.0878228, 46.4880208, -61.0468128, 46.5231668],
    "farm-interior": [-60.9801646, 46.5350136, -60.941516899999996, 46.5618543],
    "first-second-fork": [-60.9074978, 46.4605954, -60.869645399999996, 46.4929496],
    "stewart": [-60.9518873, 46.446033899999996, -60.9121152, 46.4671803],
    "unsupported-southwest": [-61.079, 46.438, -61.009, 46.487],
    "rocky-eastern-interior": [-60.949, 46.515, -60.845, 46.556],
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
    for f in json.loads((DATA / f"reference-full/{layer}.geojson").read_text())[
        "features"
    ]:
        g = f["geometry"]
        parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        vectors[layer].extend(merc(p) for p in parts)
frames = []
for name, (west, south, east, north) in REGIONS.items():
    (x0, y0), (x1, y1) = merc([[west, south], [east, north]])
    fig, axes = plt.subplots(1, 2, figsize=(15, 10))
    for i, ((label, raster), ax) in enumerate(zip(RASTERS, axes)):
        dest = DATA / f"expansion-20260910/{name}-{i}.png"
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
            if i == 0
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
            "reference": "reports/fletcher/sheet09/reference-receipts.json",
            "method": "GDAL raster geographic window; modern vectors projected directly to EPSG:3857, not inverse search guide.",
        }
    )
(OUT / "frames.json").write_text(json.dumps(frames, indent=2) + "\n")
