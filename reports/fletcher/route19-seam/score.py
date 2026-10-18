import argparse
import importlib.util
import json
import math
from itertools import pairwise
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(
    description="Replay frozen Route 19 traces against unchanged TPS fits."
)
parser.add_argument("--out", required=True, type=Path)
parser.add_argument("--reference-dir", required=True, type=Path)
args = parser.parse_args()
args.out.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location(
    "common", R / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
INPUT_HASHES = {
    "route19-seam/observations.json": "a4a76997fb6109ae3feaf004dbe1cee9558705dd1edf704d28cbbac7ba57f7d9",
    "route19-seam/continuation-trace.json": "e61a507712bb36c1c1b9d7dda3f8fa6aa131a12c8a8b858ee7634559f722faed",
    "sheet16/observations.json": "d8537c6183c6a738d3aada9c28e3bcc56c31b3a8ef1350900cdaf4f519229c90",
    "visual-expansion/sheet-observations.json": "632f4b19fcbe64384232fc03693c4f51f646e51332c3d56e382e977ff0afda04",
    "sheet16/reference-receipts.json": "63211d66603a0652ed869d49100c8df93ebfed965314f02967d1e8631e8d9f10",
}
for relative, expected in INPUT_HASHES.items():
    c.verified(R / relative, expected)
for receipt in json.loads((R / "sheet16/reference-receipts.json").read_text()):
    c.verified(args.reference_dir / (receipt["name"] + ".geojson"), receipt["sha256"])
d = json.loads((R / "route19-seam/observations.json").read_text())
out = args.out
gcps = {}
for k, f in [
    ("16", "sheet16/observations.json"),
    ("19", "visual-expansion/sheet-observations.json"),
]:
    control_args = []
    for p in json.loads((R / f).read_text())["points"]:
        if p["role"] == "control":
            control_args += [
                "-gcp",
                *map(str, [*p["pixel_xy"], *c.merc([p["lonlat"]])[0]]),
            ]
    gcps[k] = control_args


def transform(k, xy):
    return np.array(
        [
            list(map(float, s.split()[:2]))
            for s in c.run(
                "gdaltransform",
                "-tps",
                *gcps[k],
                stdin="".join(f"{x} {y}\n" for x, y in xy),
            ).splitlines()
        ]
    )


def sample(xy, step=5):
    ret = []
    for a, b in pairwise(np.asarray(xy)):
        n = max(1, math.ceil(np.linalg.norm(b - a) / step))
        ret.extend(a + (b - a) * i / n for i in range(n))
    return np.array(ret + [xy[-1]])


features = json.loads((args.reference_dir / "highways.geojson").read_text())["features"]
segments = []
for f in features:
    if str(f["properties"]["RTE_NO"]) != "19":
        continue
    g = f["geometry"]
    parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    for p in parts:
        segments.extend(pairwise(c.merc(p)))
segments = np.asarray(segments)
a = segments[:, 0]
v = segments[:, 1] - a
vv = (v * v).sum(1)
nonzero = vv > 0
a, v, vv = a[nonzero], v[nonzero], vv[nonzero]


def distances(xy):
    t = np.clip(((xy[:, None] - a) * v).sum(2) / vv, 0, 1)
    dist = np.linalg.norm(xy[:, None] - (a + t[:, :, None] * v), axis=2)
    return dist.min(1) * np.cos(np.deg2rad(c.unmerc(xy)[:, 1]))


scores = {
    "input_hashes": INPUT_HASHES,
    "points": [],
    "lines": [],
    "line_metric": "Perpendicular nearest distance only; correlated samples do not check along-road displacement.",
    "duplicate_reference_segments_ignored": int((~nonzero).sum()),
}
for p in d["points"]:
    pred = c.unmerc(transform(p["sheet"], [p["pixel_xy"]]))[0]
    ll = p["lonlat"]
    err = 6371008.8 * np.hypot(
        np.deg2rad(pred[0] - ll[0]) * np.cos(np.deg2rad((pred[1] + ll[1]) / 2)),
        np.deg2rad(pred[1] - ll[1]),
    )
    scores["points"].append(
        {"id": p["id"], "predicted_lonlat": pred.tolist(), "error_ground_m": float(err)}
    )
curves = {}
for p in d["lines"] + [
    json.loads((R / "route19-seam/continuation-trace.json").read_text())
]:
    xy = transform(p["sheet"], sample(p["pixel_xy"]))
    curves[p["id"]] = xy
    err = distances(xy)
    scores["lines"].append(
        {
            "id": p["id"],
            "sample_count": len(xy),
            "median_ground_m": float(np.median(err)),
            "worst_ground_m": float(err.max()),
            "passes": bool(np.median(err) <= 100 and err.max() <= 200),
            "geographic_endpoints": c.unmerc(xy[[0, -1]]).tolist(),
        }
    )
s, t = curves["L16S"], curves["L19N"]
lo = max(s[:, 1].min(), t[:, 1].min())
hi = min(s[:, 1].max(), t[:, 1].max())
ys = np.linspace(lo, hi, 101)


def interp(x):
    x = x[np.argsort(x[:, 1])]
    return np.interp(ys, x[:, 1], x[:, 0])


xs, xt = interp(s), interp(t)
ll = c.unmerc(np.c_[(xs + xt) / 2, ys])
err = np.abs(xs - xt) * np.cos(np.deg2rad(ll[:, 1]))
i = int(err.argmin())
scores["seam"] = {
    "minimum_road_step_ground_m": float(err.min()),
    "maximum_road_step_ground_m": float(err.max()),
    "best_lonlat": ll[i].tolist(),
    "overlap_latitude_range": ll[[0, -1], 1].tolist(),
    "passes_25m": bool(err.min() <= 25),
}
c.write(out / "curves.json", {k: v.tolist() for k, v in curves.items()})
scores["curves_sha256"] = c.digest(out / "curves.json")
scores["control_counts"] = {k: len(v) // 5 for k, v in gcps.items()}
(out / "scores.json").write_text(json.dumps(scores, indent=2, allow_nan=False) + "\n")
print(json.dumps(scores, indent=2, allow_nan=False))
