"""Verify rendered corridor mechanics, independent of geographic acceptance."""

import argparse
import importlib.util
import json
from itertools import pairwise
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.interpolate import RBFInterpolator

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("build", HERE / "build.py")
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
c = b.c
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--out", type=Path, required=True)
a = p.parse_args()
receipt = json.loads((a.out / "artifact-receipt.json").read_text())
tif = a.out / receipt["file"]
c.verified(tif, receipt["sha256"])
info = json.loads(c.run("gdalinfo", "-json", tif))
alpha = np.asarray(Image.open(tif))[:, :, 3]
gt = info["geoTransform"]
lines = json.loads((a.out / "route-clipped.geojson").read_text())["features"][0][
    "geometry"
]


def line_parts(g):
    if g["type"] == "LineString":
        yield np.array(g["coordinates"])
    elif g["type"] == "MultiLineString":
        yield from (np.array(x) for x in g["coordinates"])
    elif g["type"] == "GeometryCollection":
        for child in g["geometries"]:
            yield from line_parts(child)


samples = []
for line in line_parts(lines):
    for start, end in pairwise(line):
        # At most 10 projected metres between samples (~7 ground metres).
        n = max(2, int(np.ceil(np.linalg.norm(end - start) / 10)) + 1)
        samples.extend(start + np.linspace(0, 1, n)[:, None] * (end - start))
samples = np.array(samples)
# Omit the two intentionally hard-cut endpoints (10 projected metre margin).
ymin, ymax = c.merc([[-61.4, 45.6185999], [-61.4, 45.7442922]])[:, 1]
samples = samples[(samples[:, 1] > ymin + 10) & (samples[:, 1] < ymax - 10)]
pixels = np.floor(
    np.c_[(samples[:, 0] - gt[0]) / gt[1], (samples[:, 1] - gt[3]) / gt[5]]
).astype(int)
inside = (
    (pixels[:, 0] >= 0)
    & (pixels[:, 1] >= 0)
    & (pixels[:, 0] < alpha.shape[1])
    & (pixels[:, 1] < alpha.shape[0])
)
missing = ~inside
missing[inside] |= alpha[pixels[inside, 1], pixels[inside, 0]] == 0
assert not missing.any(), f"{missing.sum()} missing road samples"
data = json.loads((HERE / "revised-observations.json").read_text())
cs = [q for q in data["points"] if q["role"] == "control"]
xy = np.array([q["pixel_xy"] for q in cs])
world = c.merc([q["lonlat"] for q in cs])
queries = json.loads((HERE / "tps-validation-checks.json").read_text())["points"]
qxy = np.array([q["pixel_xy"] for q in queries])
fit = RBFInterpolator(xy, world, kernel="thin_plate_spline", degree=1, smoothing=0)
ref = json.loads((a.out / "scores.json").read_text())["models"]["19-TPS"]["G"]["checks"]
delta = np.max(
    np.linalg.norm(fit(qxy) - c.merc([q["predicted_lonlat"] for q in ref]), axis=1)
)
assert delta < 0.001
assert receipt["source_sha256"] == data["source_sha256"]
report = {
    "route_sample_count": len(samples),
    "route_missing_alpha_samples": int(missing.sum()),
    "sampling": "At most 10 projected metres; omit 10 m margin at deliberate north/south hard cuts. This checks rendered coverage, not geographic truth.",
    "scipy_vs_gdal_max_projected_m": float(delta),
    "independent_solver_note": "Same 19 TPS controls; solver agreement does not validate correspondence.",
    "geotiff_sha256": c.digest(tif),
    "four_bands_rgba": len(info["bands"]) == 4,
    "transparent_pixels": int((alpha == 0).sum()),
    "opaque_pixels": int((alpha == 255).sum()),
}
c.write(a.out / "render-verification.json", report)
print(json.dumps(report))
