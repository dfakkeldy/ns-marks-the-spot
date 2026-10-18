"""Render an explicitly diagnostic southern seam without changing prior previews."""

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
p.add_argument("--source19", type=Path, required=True)
p.add_argument("--source22", type=Path, required=True)
p.add_argument("--reference-dir", type=Path, required=True)
p.add_argument("--north-reference-dir", type=Path, required=True)
p.add_argument("--previous-north", type=Path, required=True)
p.add_argument("--previous-judique", type=Path, required=True)
p.add_argument("--previous-hawkesbury", type=Path, required=True)
p.add_argument("--allow-diagnostic", action="store_true")
a = p.parse_args()
out = a.out
out.mkdir(parents=True, exist_ok=True)
scores = json.loads((out / "scores.json").read_text())
assert scores["fresh_validation"]["passes"]
if not scores["seam"]["passes_25m"] and not a.allow_diagnostic:
    raise SystemExit("Seam failed; explicit --allow-diagnostic required")
for f, h in scores["input_hashes"].items():
    c.verified(HERE.parent / f, h)
c.verified(out / "curves.json", scores["curves_sha256"])
curves = {
    k: np.array(v) for k, v in json.loads((out / "curves.json").read_text()).items()
}
initial = {
    k: np.array(v)
    for k, v in json.loads((HERE / "initial-curves.json").read_text()).items()
}
data = {
    k: json.loads((HERE.parent / f).read_text())
    for k, f in [
        ("19", "southern-seam/revised-judique.json"),
        ("22", "sheet22-corridor/revised-observations.json"),
    ]
}
inputs = {}
for k, src in [("19", a.source19), ("22", a.source22)]:
    c.verified(src, data[k]["source_sha256"])
    inputs["native-" + k] = c.digest(src)
for key, path, receipt_file, filename in [
    (
        "north",
        a.previous_north,
        "route19-seam/artifact-receipt.json",
        "judique-mabou-route19-preview.tif",
    ),
    (
        "judique",
        a.previous_judique,
        "judique-boundary/artifact-receipt.json",
        "judique-supported-preview.tif",
    ),
    (
        "hawkesbury",
        a.previous_hawkesbury,
        "sheet22-corridor/artifact-receipt.json",
        "hawkesbury-corridor-preview.tif",
    ),
]:
    receipt = json.loads((HERE.parent / receipt_file).read_text())
    row = (
        receipt
        if receipt.get("file") == filename
        else next(x for x in receipt["rasters"] if x["file"] == filename)
    )
    c.verified(path, row["sha256"])
    inputs[key] = c.digest(path)
for r in json.loads(
    (HERE.parent / "sheet22-corridor/reference-receipts.json").read_text()
):
    c.verified(a.reference_dir / (r["name"] + ".geojson"), r["sha256"])
receipt = json.loads(
    (HERE.parent / "placement-pilot/road-context-receipts.json").read_text()
)[0]
c.verified(a.north_reference_dir / "highways.geojson", receipt["sha256"])
inputs["northern-highways"] = receipt["sha256"]


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


def geom(path):
    return json.loads(path.read_text())["features"][0]["geometry"]


def sql(name, src, q):
    path = out / (name + ".geojson")
    path.unlink(missing_ok=True)
    c.run(
        "ogr2ogr",
        "-f",
        "GeoJSON",
        path,
        src,
        "-dialect",
        "SQLite",
        "-sql",
        q,
        "-nln",
        "regions",
    )
    return path


def poly(points):
    return {"type": "Polygon", "coordinates": [points]}


def wkt(points):
    return "POLYGON((" + ",".join(f"{x} {y}" for x, y in points) + "))"


def box(lo, hi):
    low, high = c.merc([[-61.7, lo], [-61.2, hi]])
    return [
        low.tolist(),
        [high[0], low[1]],
        high.tolist(),
        [low[0], high[1]],
        low.tolist(),
    ]


def cut(name, path, lo, hi):
    return sql(
        name,
        path,
        f"SELECT ST_Intersection(geometry,ST_GeomFromText('{wkt(box(lo, hi))}',3857)) AS geometry FROM regions",
    )


def gcps(k):
    ret = []
    for pt in data[k]["points"]:
        if pt["role"] == "control":
            ret += ["-gcp", *map(str, [*pt["pixel_xy"], *c.merc([pt["lonlat"]])[0]])]
    return ret


def transform(k, xy):
    return np.array(
        [
            list(map(float, s.split()[:2]))
            for s in c.run(
                "gdaltransform",
                "-tps",
                *gcps(k),
                stdin="".join(f"{x} {y}\n" for x, y in xy),
            ).splitlines()
        ]
    )


def x_at(line, ys):
    line = line[np.argsort(line[:, 1])]
    return np.interp(ys, line[:, 1], line[:, 0])


# Select a transition back to the unchanged Judique raster within the checked trace.
ys = np.arange(*c.merc([[-61.4, 45.759], [-61.4, 45.764]])[:, 1], 5)
err = np.abs(x_at(initial["L19"], ys) - x_at(curves["L19"], ys))
upper_y = float(ys[err.argmin()])
upper_y = round(upper_y / 5) * 5
upper_lat = float(c.unmerc(np.array([[0, upper_y]]))[0, 1])
upper_step = float(
    abs(x_at(initial["L19"], upper_y) - x_at(curves["L19"], upper_y))
    * math.cos(math.radians(upper_lat))
)
assert upper_step < 25
# Round inward to retain real native content rather than extending its bottom row.
seam_y = math.ceil(c.merc([scores["seam"]["best_lonlat"]])[0, 1] / 5) * 5
seam_lat = float(c.unmerc(np.array([[0, seam_y]]))[0, 1])
step = float(
    abs(x_at(curves["L19"], seam_y) - x_at(curves["L22"], seam_y))
    * math.cos(math.radians(seam_lat))
)
if step > 25 and not a.allow_diagnostic:
    raise SystemExit("Rendered cut fails seam limit; explicit diagnostic mode required")
route = []
for folder in [a.north_reference_dir, a.reference_dir]:
    for f in json.loads((folder / "highways.geojson").read_text())["features"]:
        if int(f["properties"]["RTE_NO"]) != 19:
            continue
        g = f["geometry"]
        route.extend(
            c.merc(part)
            for part in (
                [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
            )
        )
route_path = collection(
    "route19", [{"type": "LineString", "coordinates": x.tolist()} for x in route]
)
strip = sql(
    "route19-strip",
    route_path,
    f"SELECT ST_Union(ST_Buffer(geometry,{150 / math.cos(math.radians(45.8))})) AS geometry FROM regions",
)
# Add only inspected interior pixels recovered from the conservative edge masks.
obs = json.loads((HERE / "observations.json").read_text())
content = {}
for k, source_report in [("19", "judique-boundary"), ("22", "sheet22")]:
    ring = np.array(
        json.loads((HERE.parent / source_report / "boundary.json").read_text())[
            "ring_pixel_xy"
        ]
    )
    xy = transform(k, c.dense_ring(ring)).tolist()
    xy.append(xy[0])
    x1, y1, x2, y2 = obs["edge_recovery"][k]["native_box"]
    b = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]])
    extra = transform(k, c.dense_ring(b)).tolist()
    extra.append(extra[0])
    regions = collection("content-" + k, [poly(xy), poly(extra)])
    content[k] = sql(
        "content-union-" + k,
        regions,
        "SELECT ST_Union(geometry) AS geometry FROM regions",
    )


def warp(name, src, mask, native=None):
    tif = out / (name + ".tif")
    if native:
        vrt = out / (name + ".vrt")
        c.run(
            "gdal_translate",
            "-of",
            "VRT",
            "-a_srs",
            "EPSG:3857",
            *gcps(native),
            src,
            vrt,
        )
        src = vrt
    c.run(
        "gdalwarp",
        "-overwrite",
        *(["-tps", "-t_srs", "EPSG:3857"] if native else ["-srcalpha"]),
        "-dstalpha",
        "-cutline",
        mask,
        "-crop_to_cutline",
        "-tr",
        5,
        5,
        "-tap",
        "-r",
        "cubic" if native else "near",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        src,
        tif,
    )
    return tif


patches = {}
for k, lo, hi, src in [
    ("19", seam_lat, upper_lat, a.source19),
    ("22", 45.7442922, seam_lat, a.source22),
]:
    base = cut("patch-band-" + k, strip, lo, hi)
    g = geom(content[k])
    # Use geometry JSON through SQLite's GeoJSON constructor to preserve holes/types.
    geometry_json = json.dumps(g, separators=(",", ":"))
    mask = sql(
        "patch-mask-" + k,
        base,
        f"SELECT ST_Intersection(geometry,SetSRID(GeomFromGeoJSON('{geometry_json}'),3857)) AS geometry FROM regions",
    )
    patches[k] = warp("sheet" + k + "-local-patch", src, mask, k)
central = warp(
    "judique-central-strip",
    a.previous_judique,
    cut("central-mask", strip, upper_lat, 45.91),
)
# Recover the previously unexamined Long Point hull gap using the unchanged warp.
assert next(x for x in scores["lines"] if x["id"] == "L19M")["passes"]
long_line = collection(
    "longpoint-trace", [{"type": "LineString", "coordinates": curves["L19M"].tolist()}]
)
long_mask = sql(
    "longpoint-buffer",
    long_line,
    f"SELECT ST_Buffer(geometry,{150 / math.cos(math.radians(45.8))}) AS geometry FROM regions",
)
long_mask = cut("longpoint-mask", long_mask, 45.7905, 45.8000)
neatline = a.previous_judique.with_name("judique-neatline-diagnostic.tif")
old_receipt = json.loads(
    (HERE.parent / "judique-boundary/artifact-receipt.json").read_text()
)
old_hash = next(
    x["sha256"] for x in old_receipt["rasters"] if x["file"] == neatline.name
)
c.verified(neatline, old_hash)
inputs["judique-neatline"] = old_hash
long_patch = warp("longpoint-recovered", neatline, long_mask)

# The two preceding artifacts already have exact matching latitude boundaries.
joined = out / "hawkesbury-mabou-joined-diagnostic.tif"
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
    a.previous_hawkesbury,
    patches["22"],
    patches["19"],
    central,
    long_patch,
    a.previous_north,
    joined,
)
info = json.loads(c.run("gdalinfo", "-json", joined))
gt = info["geoTransform"]
assert len(info["bands"]) == 4 and info["bands"][3]["colorInterpretation"] == "Alpha"
alpha_path = out / "alpha.png"
c.run("gdal_translate", "-of", "PNG", "-b", 4, joined, alpha_path)
alpha = np.asarray(Image.open(alpha_path))
samples = []
for line in route:
    for start, end in pairwise(line):
        n = max(1, math.ceil(np.linalg.norm(end - start) / 10))
        samples.extend(start + np.arange(n)[:, None] / n * (end - start))
samples = np.array(samples)
ll = c.unmerc(samples)
take = (ll[:, 1] > 45.6473) & (ll[:, 1] < 46.0799)
samples = samples[take]
ll = ll[take]
px = np.floor(
    np.c_[(samples[:, 0] - gt[0]) / gt[1], (samples[:, 1] - gt[3]) / gt[5]]
).astype(int)
inbounds = (
    (px[:, 0] >= 0)
    & (px[:, 1] >= 0)
    & (px[:, 0] < alpha.shape[1])
    & (px[:, 1] < alpha.shape[0])
)
missing = ~inbounds
missing[inbounds] |= alpha[px[inbounds, 1], px[inbounds, 0]] == 0
coverage = {
    "reference_samples": len(samples),
    "missing_count": int(missing.sum()),
    "missing_lonlat": ll[missing].tolist(),
    "scope": "Route 19 samples between 45.6473 and 46.0799; no more than 10 projected metre spacing. Coverage is not geographic acceptance.",
}
# Rasterize every output cell touched by the reference road, including between samples.
line_check = cut("route19-coverage-line", route_path, 45.6473, 46.0799)
line_tif = out / "route19-coverage-mask.tif"
line_tif.unlink(missing_ok=True)
c.run(
    "gdal_rasterize",
    "-burn",
    1,
    "-at",
    "-ot",
    "Byte",
    "-te",
    gt[0],
    gt[3] + alpha.shape[0] * gt[5],
    gt[0] + alpha.shape[1] * gt[1],
    gt[3],
    "-ts",
    alpha.shape[1],
    alpha.shape[0],
    line_check,
    line_tif,
)
line_png = out / "route19-coverage-mask.png"
c.run("gdal_translate", "-of", "PNG", line_tif, line_png)
line_cells = np.asarray(Image.open(line_png)) != 0
coverage["reference_line_cells"] = int(line_cells.sum())
coverage["transparent_line_cells"] = int(((alpha == 0) & line_cells).sum())
assert coverage["reference_line_cells"] > 0
assert coverage["transparent_line_cells"] == 0 and coverage["missing_count"] == 0
c.write(out / "coverage.json", coverage)
receipt = {
    "status": "diagnostic-seam-failed" if step > 25 else "seam-numeric-pass",
    "seam_limit_ground_m": 25,
    "road_step_ground_m_at_rendered_cut": step,
    "seam_y_epsg3857": seam_y,
    "seam_latitude": seam_lat,
    "upper_transition_latitude": upper_lat,
    "upper_transition_road_step_ground_m": upper_step,
    "new_control": "Judique S01, previously P19; 39 original controls preserved",
    "revision_scope": "40-control TPS only in southern Judique local patch; preceding rasters elsewhere unchanged",
    "inputs": inputs,
    "scores_sha256": c.digest(out / "scores.json"),
    "rasters": [
        {
            "file": joined.name,
            "sha256": c.digest(joined),
            "dimensions": info["size"],
            "bytes": joined.stat().st_size,
        }
    ],
    "coverage": coverage,
    "note": "No gap-filling, stretching, feathering or invented pixels. Failed seam remains explicit; not an accepted seamless tileset.",
}
c.write(out / "artifact-receipt.json", receipt)
# Keep a full-resolution local TIFF for inspection despite the browser's 4096px preview cap.
dlo, dhi = c.merc([[-61.475, 45.744], [-61.455, 45.761]])
detail = out / "judique-hawkesbury-seam-detail.tif"
c.run(
    "gdal_translate",
    "-projwin",
    dlo[0],
    dhi[1],
    dhi[0],
    dlo[1],
    "-co",
    "COMPRESS=DEFLATE",
    "-co",
    "TILED=YES",
    joined,
    detail,
)
dinfo = json.loads(c.run("gdalinfo", "-json", detail))
receipt["rasters"].append(
    {
        "file": detail.name,
        "sha256": c.digest(detail),
        "dimensions": dinfo["size"],
        "bytes": detail.stat().st_size,
    }
)
c.write(out / "artifact-receipt.json", receipt)
# Preview the actual three raster results around the join at a useful scale.
fig, axes = plt.subplots(1, 3, figsize=(15, 9))
lo, hi = c.merc([[-61.4675, 45.7465], [-61.4585, 45.7495]])
for ax, tif, title in zip(
    axes,
    [patches["19"], patches["22"], joined],
    [
        "Judique local revision",
        "Hawkesbury unchanged TPS",
        f"Joined diagnostic: {step:.1f} m road step",
    ],
):
    png = out / (tif.stem + "-detail.png")
    c.run(
        "gdal_translate",
        "-of",
        "PNG",
        "-projwin",
        lo[0],
        hi[1],
        hi[0],
        lo[1],
        "-outsize",
        600,
        0,
        tif,
        png,
    )
    inf = json.loads(c.run("gdalinfo", "-json", png))
    g = inf["geoTransform"]
    w, h = inf["size"]
    ax.imshow(Image.open(png), extent=(g[0], g[0] + w * g[1], g[3] + h * g[5], g[3]))
    ax.add_collection(LineCollection(route, colors="#e77b13", linewidths=1))
    ax.axhline(seam_y, color="#b12062", linestyle="--", linewidth=0.8)
    ax.set(xlim=(lo[0], hi[0]), ylim=(lo[1], hi[1]), aspect="equal", title=title)
    ax.set_axis_off()
fig.tight_layout()
fig.savefig(out / "join-comparison.jpg", dpi=130)
plt.close(fig)
c.run(
    "gdal_translate",
    "-of",
    "PNG",
    "-outsize",
    0,
    1800,
    joined,
    out / "corridor-overview.png",
)
print(
    json.dumps(
        {
            "status": receipt["status"],
            "rasters": receipt["rasters"],
            "missing": coverage["missing_count"],
            "road_step": step,
        }
    ),
    flush=True,
)
