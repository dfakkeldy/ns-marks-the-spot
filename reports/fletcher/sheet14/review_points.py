"""Render native crosshairs and modern vector context for full-sheet additions.

Run with the benchmark Python environment. These figures are review evidence,
not automatic correspondence acceptance or a numerical accuracy test.
"""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = Path.home() / "Downloads"
PACKETS = [
    (
        "14",
        "sheet14/final-fit.json",
        "fletcher-sheet14/native/sheet14.png",
        "fletcher-sheet14/reference",
        [
            "C01",
            "C03",
            "C04",
            "C06",
            "C07",
            "C08",
            "C10",
            "C12",
            "C13",
            "C14",
            "C15",
            "C16",
            "C17",
            "C09",
            "Q08",
            "C05",
            "C11",
            "Q06",
            "F03",
            "F04",
            "F05",
            "G03",
        ],
    ),
    (
        "14",
        "sheet14/final-checks.json",
        "fletcher-sheet14/native/sheet14.png",
        "fletcher-sheet14/reference",
        ["Q02", "Q03", "F06", "F07", "G01"],
    ),
]


def main():
    out = ROOT / "sheet14/review"
    out.mkdir(exist_ok=True)
    receipts = []
    for sheet, record, source, reference, ids in PACKETS:
        data = json.loads((ROOT / record).read_text())
        native = Image.open(DOWNLOADS / source)
        vectors = {}
        for layer in ("water-lines", "roads"):
            features = json.loads(
                (DOWNLOADS / reference / f"{layer}.geojson").read_text()
            )["features"]
            vectors[layer] = []
            for feature in features:
                geometry = feature["geometry"]
                parts = (
                    [geometry["coordinates"]]
                    if geometry["type"] == "LineString"
                    else geometry["coordinates"]
                )
                vectors[layer].extend(np.asarray(part)[:, :2] for part in parts)
        for point in data["points"]:
            if point["id"] not in ids:
                continue
            x, y = point["pixel_xy"]
            lon, lat = point["lonlat"]
            box = (int(x) - 110, int(y) - 110, int(x) + 110, int(y) + 110)
            fig, axes = plt.subplots(1, 2, figsize=(9, 4.4))
            axes[0].imshow(native.crop(box), extent=(box[0], box[2], box[3], box[1]))
            axes[0].plot(x, y, "+", color="red", markersize=17, markeredgewidth=1)
            axes[0].set_title(f"Native pixel ({x}, {y})")
            axes[0].tick_params(labelsize=7)
            scale = np.array([111195 * np.cos(np.deg2rad(lat)), 111195])
            for layer, color in [("roads", "#999999"), ("water-lines", "#0078b3")]:
                lines = [(part - [lon, lat]) * scale for part in vectors[layer]]
                lines = [
                    part
                    for part in lines
                    if np.all(part.min(axis=0) < 450)
                    and np.all(part.max(axis=0) > -450)
                ]
                axes[1].add_collection(
                    LineCollection(lines, colors=color, linewidths=1)
                )
            axes[1].plot(0, 0, "+", color="red", markersize=17, markeredgewidth=1)
            axes[1].set(
                xlim=(-450, 450),
                ylim=(-450, 450),
                aspect="equal",
                title="Modern NSTDB · east/north ground m",
            )
            axes[1].tick_params(labelsize=7)
            fig.suptitle(f"Sheet {sheet} · {point['id']} · {point['role']}")
            fig.tight_layout()
            name = f"sheet-{sheet}-{point['id']}.jpg"
            fig.savefig(out / name, dpi=130)
            plt.close(fig)
            receipts.append(
                {
                    "image": name,
                    "point_record": record,
                    "point_id": point["id"],
                    "native_box": box,
                    "native_coordinates": point["pixel_xy"],
                    "modern_lonlat": point["lonlat"],
                    "rotation_degrees": 0,
                }
            )
    (out / "frames.json").write_text(json.dumps(receipts, indent=2) + "\n")


if __name__ == "__main__":
    main()
