"""Build isolated image packets and a reference manifest; never supplies answers to workers."""

import argparse
import hashlib
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--source", type=Path, required=True)
parser.add_argument("--reference-dir", type=Path, required=True)
parser.add_argument("--out", type=Path, required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[3]
observations = repo / "reports/fletcher/visual-expansion/sheet-observations.json"
data = json.loads(observations.read_text())
assert hashlib.sha256(args.source.read_bytes()).hexdigest() == data["source_sha256"]
source = Image.open(args.source).convert("RGB")
assert source.size == (10815, 7549)
root = args.out.resolve()
root.mkdir(parents=True, exist_ok=True)
if (root / "reference.json").exists():
    raise SystemExit("Refusing to overwrite an existing packet set")
points = [
    p
    for p in data["points"]
    if p["role"] == "control" and p["review"] != "preserved-hand-added"
]
assert len(points) == 24
byid = {p["id"]: p for p in points}
rng = random.Random(20260905)
entries = [{"source": p, "target": p, "positive": True} for p in points]
for sid, tid in [("O01", "O06"), ("V03", "O03"), ("O06", "V05"), ("O10", "C3")]:
    entries.append({"source": byid[sid], "target": byid[tid], "positive": False})
rng.shuffle(entries)
R = 6378137


def merc(a):
    a = np.asarray(a)
    return np.c_[
        R * np.deg2rad(a[:, 0]), R * np.log(np.tan(np.pi / 4 + np.deg2rad(a[:, 1]) / 2))
    ]


lines = {}
for filename in ["water-lines.geojson", "roads.geojson"]:
    parts = []
    for feature in json.loads((args.reference_dir / filename).read_text())["features"]:
        geo = feature["geometry"]
        cs = geo["coordinates"]
        if geo["type"] == "LineString":
            cs = [cs]
        elif geo["type"] != "MultiLineString":
            continue
        for c in cs:
            arr = merc(c)
            parts.append((arr, arr.min(axis=0), arr.max(axis=0)))
    lines[filename] = parts
font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 16)
manifest = []
for index, entry in enumerate(entries, 1):
    cid = f"K{index:02d}"
    packet = root / "packets" / cid
    packet.mkdir(parents=True)
    p = entry["source"]
    target = entry["target"]
    # Variable offsets stop the crop centre leaking the requested historical location.
    dx, dy = rng.randint(230, 570), rng.randint(230, 570)
    x, y = round(p["pixel_xy"][0]) - dx, round(p["pixel_xy"][1]) - dy
    box = [x, y, 800, 800]
    context_box = [x - 400, y - 400, 1600, 1600]
    if not entry["positive"]:
        tx, ty = target["pixel_xy"]
        assert not (x - 400 <= tx < x + 1200 and y - 400 <= ty < y + 1200)
    detail = source.crop((x, y, x + 800, y + 800))
    detail.save(packet / "historical.png")
    grid = detail.copy()
    d = ImageDraw.Draw(grid)
    for n in range(100, 800, 100):
        d.line((n, 0, n, 799), fill=(40, 175, 195), width=1)
        d.line((0, n, 799, n), fill=(40, 175, 195), width=1)
        d.rectangle((n + 1, 0, n + 39, 20), fill="white")
        d.text((n + 2, 1), str(n), font=font, fill="#003750")
        d.rectangle((0, n + 1, 38, n + 22), fill="white")
        d.text((1, n + 2), str(n), font=font, fill="#003750")
    grid.save(packet / "historical-grid.png")
    source.crop((x - 400, y - 400, x + 1200, y + 1200)).resize(
        (800, 800), Image.Resampling.LANCZOS
    ).save(packet / "context.png")
    centre = merc([target["lonlat"]])[0]
    lo = centre - 2000
    hi = centre + 2000
    modern = Image.new("RGB", (800, 800), "#fffefa")
    d = ImageDraw.Draw(modern)
    for filename, color, width in [
        ("roads.geojson", "#929292", 2),
        ("water-lines.geojson", "#087fb2", 2),
    ]:
        for arr, mn, mx in lines[filename]:
            if np.any(mx < lo) or np.any(mn > hi):
                continue
            xy = np.c_[(arr[:, 0] - lo[0]) / 5, (hi[1] - arr[:, 1]) / 5]
            d.line([tuple(row) for row in xy], fill=color, width=width)
    d.ellipse((390, 390, 410, 410), outline="#ec1637", width=3)
    d.text(
        (10, 8),
        "N ↑   Water: blue   Roads: grey   Target: red ring",
        font=font,
        fill="#222222",
    )
    modern.save(packet / "modern.png")
    helper = Path(__file__).with_name("crop.py").read_text()
    (packet / "crop.py").write_text(helper)
    manifest.append(
        {
            "case_id": cid,
            "positive": entry["positive"],
            "source_region_xywh": box,
            "context_region_xywh": context_box,
            "source_anchor_id": p["id"],
            "target_id": target["id"],
            "target_pixel_xy": target["pixel_xy"],
            "target_lonlat": target["lonlat"],
            "expected_local_xy": [target["pixel_xy"][0] - x, target["pixel_xy"][1] - y]
            if entry["positive"]
            else None,
            "packet_hashes": {
                f.name: hashlib.sha256(f.read_bytes()).hexdigest()
                for f in packet.iterdir()
            },
        }
    )
result = {
    "seed": 20260905,
    "source_sha256": data["source_sha256"],
    "observations_sha256": hashlib.sha256(observations.read_bytes()).hexdigest(),
    "reference_hashes": {
        n: hashlib.sha256((args.reference_dir / n).read_bytes()).hexdigest()
        for n in lines
    },
    "cases": manifest,
}
(root / "reference.json").write_text(json.dumps(result, indent=2) + "\n")
print(
    "Prepared",
    len(manifest),
    "isolated packets;",
    sum(r["positive"] for r in manifest),
    "positive and",
    sum(not r["positive"] for r in manifest),
    "negative",
)
