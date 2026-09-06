"""Render narrow checked extensions and a Route 19 strip on unchanged TPS rasters.

Requires the preceding score.py output, GDAL/OGR with SQLite/GEOS, NumPy,
SciPy, Pillow and Matplotlib. All original controls and native scans stay intact.
"""

import argparse
import importlib.util
import json
import math
from itertools import pairwise
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "common", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument("--out", type=Path, required=True)
p.add_argument("--sheet16-dir", type=Path, required=True)
p.add_argument("--judique-dir", type=Path, required=True)
p.add_argument("--reference-dir", type=Path, required=True)
a = p.parse_args()
out = a.out
out.mkdir(parents=True, exist_ok=True)
scores = json.loads((out / "scores.json").read_text())
c.verified(out / "curves.json", scores["curves_sha256"])
curves = {
    k: np.asarray(v) for k, v in json.loads((out / "curves.json").read_text()).items()
}
assert all(x["passes"] for x in scores["lines"]) and scores["seam"]["passes_25m"]
for path, h in scores["input_hashes"].items():
    c.verified(HERE.parent / path, h)
for item in json.loads((HERE.parent / "sheet16/reference-receipts.json").read_text()):
    c.verified(a.reference_dir / (item["name"] + ".geojson"), item["sha256"])
inputs = {}
for sheet, folder, report in [
    ("16", a.sheet16_dir, "sheet16"),
    ("19", a.judique_dir, "judique-boundary"),
]:
    receipt = json.loads((HERE.parent / report / "artifact-receipt.json").read_text())
    for item in receipt["rasters"]:
        c.verified(folder / item["file"], item["sha256"])
        inputs[sheet + "-" + item["file"]] = item["sha256"]
# All output geometries use the same projected grid as the already-warped sources.
seam_y = round(c.merc([scores["seam"]["best_lonlat"]])[0, 1] / 5) * 5
seam_lat = float(c.unmerc(np.array([[0, seam_y]]))[0, 1])
radius = 150 / math.cos(math.radians(46))


def collection(name, geometries):
    path = out / (name + ".geojson")
    c.write(
        path,
        {
            "type": "FeatureCollection",
            "name": "regions",
            "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
            "features": [
                {"type": "Feature", "properties": {}, "geometry": g} for g in geometries
            ],
        },
    )
    return path


def geometry(path):
    return json.loads(path.read_text())["features"][0]["geometry"]


def sql(name, source, statement):
    path = out / (name + ".geojson")
    if path.exists():
        path.unlink()
    c.run(
        "ogr2ogr",
        "-f",
        "GeoJSON",
        path,
        source,
        "-dialect",
        "SQLite",
        "-sql",
        statement,
        "-nln",
        "regions",
    )
    return path


def box_geom(lon1, lat1, lon2, lat2):
    lo, hi = c.merc([[lon1, lat1], [lon2, lat2]])
    return {
        "type": "Polygon",
        "coordinates": [
            [lo.tolist(), [hi[0], lo[1]], hi.tolist(), [lo[0], hi[1]], lo.tolist()]
        ],
    }


def wkt_box(lon1, lat1, lon2, lat2):
    return (
        "POLYGON(("
        + ",".join(
            f"{x} {y}" for x, y in box_geom(lon1, lat1, lon2, lat2)["coordinates"][0]
        )
        + "))"
    )


def patch(name, curve, lo, hi):
    path = collection(
        name + "-line", [{"type": "LineString", "coordinates": curve.tolist()}]
    )
    box = wkt_box(-62, lo, -61, hi)
    return sql(
        name,
        path,
        f"SELECT ST_Intersection(ST_Buffer(geometry,{radius}),ST_GeomFromText('{box}',3857)) AS geometry FROM regions",
    )


p16 = patch("porthood-extension", curves["L16P"], 45.9958, 45.9986)
s16 = patch("sheet16-join-extension", curves["L16S"], seam_lat, 45.9271)
s19 = patch(
    "judique-join-extension",
    np.vstack([curves["L19N"], curves["L19S"][1:]]),
    45.90995,
    seam_lat,
)
masks = {}
for k, folder, extras in [
    ("16", a.sheet16_dir, [p16, s16]),
    ("19", a.judique_dir, [s19]),
]:
    # These masks were emitted by the frozen prior builds; record their exact hashes.
    old = folder / "supported-preview-cutline.geojson"
    inputs[k + "-previous-cutline"] = c.digest(old)
    regions = collection(
        "sheet" + k + "-regions", [geometry(old), *[geometry(x) for x in extras]]
    )
    masks[k] = sql(
        "sheet" + k + "-extended-mask",
        regions,
        "SELECT ST_Union(geometry) AS geometry FROM regions",
    )


def warp(name, source, cutline):
    tif = out / (name + ".tif")
    c.run(
        "gdalwarp",
        "-overwrite",
        "-cutline",
        cutline,
        "-crop_to_cutline",
        "-tr",
        5,
        5,
        "-tap",
        "-r",
        "near",
        "-srcalpha",
        "-dstalpha",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        source,
        tif,
    )
    return tif


extended = {}
for k, folder, source in [
    ("16", a.sheet16_dir, "sheet16-neatline-diagnostic.tif"),
    ("19", a.judique_dir, "judique-neatline-diagnostic.tif"),
]:
    extended[k] = warp("sheet" + k + "-corridor-preview", folder / source, masks[k])
    print("Rendered", extended[k].name, flush=True)
route = []
for f in json.loads((a.reference_dir / "highways.geojson").read_text())["features"]:
    if str(f["properties"]["RTE_NO"]) != "19":
        continue
    g = f["geometry"]
    parts = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
    route.extend(c.merc(x) for x in parts)
route_path = collection(
    "modern-route19", [{"type": "LineString", "coordinates": x.tolist()} for x in route]
)
strip = sql(
    "route19-strip",
    route_path,
    f"SELECT ST_Union(ST_Buffer(geometry,{radius})) AS geometry FROM regions",
)
clipped = []
for k, lo, hi in [("16", seam_lat, 46.08), ("19", 45.91, seam_lat)]:
    box = wkt_box(-62, lo, -61, hi)
    cut = sql(
        "route19-sheet" + k + "-cut",
        strip,
        f"SELECT ST_Intersection(geometry,ST_GeomFromText('{box}',3857)) AS geometry FROM regions",
    )
    clipped.append(warp("route19-sheet" + k, extended[k], cut))
joined = out / "judique-mabou-route19-preview.tif"
c.run(
    "gdalwarp",
    "-overwrite",
    "-tr",
    5,
    5,
    "-tap",
    "-r",
    "near",
    "-srcalpha",
    "-dstalpha",
    "-co",
    "COMPRESS=DEFLATE",
    "-co",
    "TILED=YES",
    *clipped,
    joined,
)
print("Rendered", joined.name, flush=True)
# Export lossless full-grid alpha for exact coverage sampling, without loading RGBA.
alpha = out / "corridor-alpha.png"
c.run("gdal_translate", "-of", "PNG", "-b", 4, joined, alpha)
info = json.loads(c.run("gdalinfo", "-json", joined))
gt = info["geoTransform"]
mask = np.asarray(Image.open(alpha))
samples = []
for line in route:
    for x, y in pairwise(line):
        n = max(1, math.ceil(np.linalg.norm(y - x) / 10))
        samples.extend(x + (y - x) * i / n for i in range(n))
samples = np.asarray(samples)
ll = c.unmerc(samples)
selected = (ll[:, 1] >= 45.9101) & (ll[:, 1] <= 46.0799)
samples = samples[selected]
ll = ll[selected]
x = np.floor((samples[:, 0] - gt[0]) / gt[1]).astype(int)
y = np.floor((samples[:, 1] - gt[3]) / gt[5]).astype(int)
assert ((x >= 0) & (x < mask.shape[1]) & (y >= 0) & (y < mask.shape[0])).all()
missing = mask[y, x] == 0
coverage = {
    "sample_step_projected_m": 10,
    "sample_count": len(samples),
    "transparent_count": int(missing.sum()),
    "missing_lonlat": ll[missing].tolist(),
    "latitude_limits": [45.9101, 46.0799],
    "note": "Raster coverage along the extracted Route19 centreline, not an independent accuracy test or a length-weighted percentage.",
}
assert not missing.any(), "Transparent pixels remain on the modern Route19 centreline"
# Check every output cell touched by the reference line, including cells between samples.
line_box = wkt_box(-62, 45.9101, -61, 46.0799)
line_check = sql(
    "route19-coverage-line",
    route_path,
    f"SELECT ST_Intersection(geometry,ST_GeomFromText('{line_box}',3857)) AS geometry FROM regions",
)
line_tif = out / "route19-coverage-mask.tif"
if line_tif.exists():
    line_tif.unlink()
c.run(
    "gdal_rasterize",
    "-burn",
    1,
    "-at",
    "-ot",
    "Byte",
    "-te",
    gt[0],
    gt[3] + mask.shape[0] * gt[5],
    gt[0] + mask.shape[1] * gt[1],
    gt[3],
    "-ts",
    mask.shape[1],
    mask.shape[0],
    line_check,
    line_tif,
)
line_png = out / "route19-coverage-mask.png"
c.run("gdal_translate", "-of", "PNG", line_tif, line_png)
line_pixels = np.asarray(Image.open(line_png)) != 0
coverage["reference_line_raster_cells"] = int(line_pixels.sum())
coverage["transparent_reference_line_cells"] = int(((mask == 0) & line_pixels).sum())
assert coverage["reference_line_raster_cells"] > 0
assert coverage["transparent_reference_line_cells"] == 0

old_samples = np.vstack(list(curves.values()))
old_ll = c.unmerc(old_samples)
old_samples = old_samples[(old_ll[:, 1] >= 45.9101) & (old_ll[:, 1] <= 46.0799)]
old_x = np.floor((old_samples[:, 0] - gt[0]) / gt[1]).astype(int)
old_y = np.floor((old_samples[:, 1] - gt[3]) / gt[5]).astype(int)
assert (
    (old_x >= 0) & (old_x < mask.shape[1]) & (old_y >= 0) & (old_y < mask.shape[0])
).all()
coverage["old_road_trace_samples"] = len(old_samples)
coverage["old_road_transparent_count"] = int((mask[old_y, old_x] == 0).sum())
assert coverage["old_road_transparent_count"] == 0
c.write(out / "coverage.json", coverage)


# Measure actual road step at the rounded cut, not just the best search sample.
def road_x(line):
    order = np.argsort(line[:, 1])
    return float(np.interp(seam_y, line[order, 1], line[order, 0]))


step = abs(road_x(curves["L16S"]) - road_x(curves["L19N"])) * math.cos(
    math.radians(seam_lat)
)
assert step <= 25
receipt = {
    "input_raster_and_mask_hashes": inputs,
    "score_sha256": c.digest(out / "scores.json"),
    "score_script_sha256": c.digest(HERE / "score.py"),
    "render_script_sha256": c.digest(Path(__file__)),
    "seam_y_epsg3857": seam_y,
    "seam_latitude": seam_lat,
    "road_step_ground_m_at_cut": step,
    "extension_half_width_ground_m_at_46N": 150,
    "fit_changes": False,
    "scope": "Narrow Route19 browsing corridor from northern Judique to Mabou. Lateral road checks do not establish along-road or whole-sheet accuracy.",
    "rights": "David Rumsey Map Collection / Stanford University Libraries, CC BY-NC-SA 3.0 and recorded project permission. Crop/mosaic modifications; see ../INVENTORY.md.",
    "rasters": [],
}
for tif in [*extended.values(), joined]:
    inf = json.loads(c.run("gdalinfo", "-json", tif))
    assert len(inf["bands"]) == 4 and inf["bands"][3]["colorInterpretation"] == "Alpha"
    receipt["rasters"].append(
        {
            "file": tif.name,
            "sha256": c.digest(tif),
            "size": inf["size"],
            "geoTransform": inf["geoTransform"],
        }
    )
c.write(out / "artifact-receipt.json", receipt)


# Actual raster previews for visual review.
def image_plot(ax, tif, bounds):
    left, bottom = c.merc([[bounds[0], bounds[1]]])[0]
    right, top = c.merc([[bounds[2], bounds[3]]])[0]
    png = out / (tif.stem + "-" + str(round(bounds[1], 4)) + ".png")
    c.run(
        "gdal_translate",
        "-of",
        "PNG",
        "-projwin",
        left,
        top,
        right,
        bottom,
        "-outsize",
        1200,
        0,
        tif,
        png,
    )
    inf = json.loads(c.run("gdalinfo", "-json", png))
    g = inf["geoTransform"]
    w, h = inf["size"]
    ax.imshow(
        Image.open(png),
        extent=[g[0], g[0] + w * g[1], g[3] + h * g[5], g[3]],
        origin="upper",
    )
    ax.add_collection(LineCollection(route, colors="#ff8300", linewidths=1))
    ax.set(xlim=(left, right), ylim=(bottom, top), aspect="equal")
    ax.set_axis_off()


fig, axes = plt.subplots(1, 3, figsize=(15, 8))
bounds = [-61.485, 45.918, -61.464, 45.929]
for ax, tif, title in zip(
    axes,
    [
        a.sheet16_dir / "sheet16-neatline-diagnostic.tif",
        a.judique_dir / "judique-neatline-diagnostic.tif",
        joined,
    ],
    ["Sheet16 unchanged TPS", "Judique unchanged TPS", "Joined narrow corridor"],
):
    image_plot(ax, tif, bounds)
    ax.axhline(seam_y, color="#d100b2", linewidth=1)
    ax.set_title(title)
fig.suptitle(
    "Orange: modern Route19; magenta: chosen cut. Full-sheet joining is not established."
)
fig.tight_layout()
fig.savefig(out / "join-comparison.jpg", dpi=130)
plt.close(fig)
fig, ax = plt.subplots(figsize=(7, 10))
image_plot(ax, joined, [-61.54, 45.909, -61.40, 46.081])
ax.set_title(
    "Route19: northern Judique to Mabou\nCropped corridor preview, unchanged controls"
)
fig.tight_layout()
fig.savefig(out / "corridor-overview.jpg", dpi=130)
plt.close(fig)
print(json.dumps({"road_step_m": step, "coverage": coverage}, indent=2), flush=True)
