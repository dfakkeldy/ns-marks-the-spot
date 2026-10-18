"""Replay frozen Hawkesbury fits; render a limited corridor and visual evidence.

Requires GDAL/OGR with SQLite/GEOS, NumPy, SciPy, Pillow and Matplotlib.
Large native imagery and modern vector extracts remain outside Git.
"""

import argparse
import csv
import importlib.util
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from PIL import Image
from scipy.spatial import ConvexHull

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "common", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference-dir", type=Path)
    parser.add_argument("--score-only", action="store_true")
    a = parser.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    data = json.loads((HERE / "revised-observations.json").read_text())
    fdata = json.loads((HERE / "validation-checks.json").read_text())
    gdata = json.loads((HERE / "tps-validation-checks.json").read_text())
    c.verified(HERE / "revised-observations.json", gdata["observations_sha256"])
    c.verified(HERE / "model-revision.json", gdata["model_sha256"])
    c.verified(
        HERE.parent / "sheet22/saved-user-controls.csv", data["saved_controls_sha256"]
    )
    base = json.loads((HERE.parent / "sheet22/observations.json").read_text())
    controls = [p for p in data["points"] if p["role"] == "control"]
    original = [p for p in base["points"] if p["role"] == "control"]
    assert len(controls) == 19 and controls[:17] == original
    sets = {
        "Q": [p for p in base["points"] if p["role"] == "check"],
        "C": json.loads((HERE / "checks.json").read_text())["points"],
        "F": fdata["points"],
        "G": gdata["points"],
    }
    assert len(sets["G"]) == 4

    def gcps(points):
        args = []
        for p, w in zip(points, c.merc([p["lonlat"] for p in points])):
            args += ["-gcp", *map(str, [*p["pixel_xy"], *w])]
        return args

    def transform(xy, n=19, model="TPS", inverse=False):
        text = c.run(
            "gdaltransform",
            *(["-i"] if inverse else []),
            *(["-tps"] if model == "TPS" else ["-order", 1]),
            *gcps(controls[:n]),
            stdin="".join(f"{x} {y}\n" for x, y in xy),
        )
        result = np.array([list(map(float, s.split()[:2])) for s in text.splitlines()])
        assert np.isfinite(result).all()
        return result

    scores = {
        "gate": gdata["gate"],
        "selected_model": "19-control TPS",
        "input_hashes": {
            n: c.digest(HERE / n)
            for n in [
                "revised-observations.json",
                "checks.json",
                "validation-checks.json",
                "tps-validation-checks.json",
                "model-revision.json",
            ]
        },
        "interpretation": "Only G is fresh validation of selected TPS. C was consumed to add N01/N02; F selected the TPS revision. Q remains whole-sheet diagnosis. All results retained.",
        "models": {},
    }
    for n, model in [(17, "affine"), (19, "affine"), (19, "TPS")]:
        name = f"{n}-{model}"
        scores["models"][name] = {}
        for set_name, points in sets.items():
            actual = np.array([p["lonlat"] for p in points])
            pred = c.unmerc(transform([p["pixel_xy"] for p in points], n, model))
            errors = 6371008.8 * np.hypot(
                np.deg2rad(pred[:, 0] - actual[:, 0])
                * np.cos(np.deg2rad((pred[:, 1] + actual[:, 1]) / 2)),
                np.deg2rad(pred[:, 1] - actual[:, 1]),
            )
            scores["models"][name][set_name] = {
                "median_ground_m": float(np.median(errors)),
                "worst_ground_m": float(errors.max()),
                "passes_numeric_gate": bool(
                    np.median(errors) <= 100 and errors.max() <= 200
                ),
                "checks": [
                    {
                        "id": p["id"],
                        "predicted_lonlat": ll.tolist(),
                        "error_ground_m": float(e),
                    }
                    for p, ll, e in zip(points, pred, errors)
                ],
            }
    # A native y-down map should have negative determinants. This is sampled,
    # not a proof of continuous TPS injectivity.
    xx, yy = np.meshgrid(np.arange(4350, 7060, 50), np.arange(1000, 5300, 50))
    grid = np.c_[xx.ravel(), yy.ravel()]
    w = transform(grid)
    dx, dy = transform(grid + [1, 0]) - w, transform(grid + [0, 1]) - w
    det = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
    scores["sampled_jacobian"] = {
        "samples": len(grid),
        "native_step_px": 50,
        "nonnegative_count": int((det >= 0).sum()),
        "min": float(det.min()),
        "max": float(det.max()),
        "limitation": "Samples include corridor surroundings; not a continuous no-fold proof.",
    }
    assert (det < 0).all()
    selected = scores["models"]["19-TPS"]["G"]
    scores["status"] = (
        "limited-corridor-gate-pass"
        if selected["passes_numeric_gate"]
        else "failed-geographic-gate"
    )
    c.write(a.out / "scores.json", scores)
    print(
        json.dumps(
            {
                "status": scores["status"],
                "fresh_TPS": selected,
                "jacobian": scores["sampled_jacobian"],
            }
        ),
        flush=True,
    )
    with (a.out / "hawkesbury-controls-checks.csv").open("w") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["pixel_x", "pixel_y", "lon", "lat", "role", "label"])
        for p in (
            controls
            + sets["F"]
            + sets["G"]
            + sets["Q"]
            + [p for p in sets["C"] if p["id"] not in ["C01", "C02"]]
        ):
            original_strings = p.get("original_numeric_strings")
            coords = (
                [original_strings[k] for k in ["pixel_x", "pixel_y", "lon", "lat"]]
                if original_strings
                else [*p["pixel_xy"], *p["lonlat"]]
            )
            writer.writerow([*coords, p["role"], p["id"]])
    if a.score_only:
        return
    assert a.source and a.reference_dir
    c.verified(a.source, data["source_sha256"])
    source = Image.open(a.source).convert("RGB")
    assert list(source.size) == data["source_dimensions"]
    features = {}
    vectors = {}
    for receipt in json.loads((HERE / "reference-receipts.json").read_text()):
        path = a.reference_dir / (receipt["name"] + ".geojson")
        c.verified(path, receipt["sha256"])
        features[receipt["name"]] = json.loads(path.read_text())["features"]
        parts = []
        for f in features[receipt["name"]]:
            g = f["geometry"]
            pp = (
                [g["coordinates"]]
                if g["type"] == "LineString"
                else (
                    [r for poly in g["coordinates"] for r in poly]
                    if g["type"] == "MultiPolygon"
                    else g["coordinates"]
                )
            )
            parts.extend(c.merc(p) for p in pp)
        vectors[receipt["name"]] = parts
    for set_name in ["C", "F", "G"]:
        fig, axes = plt.subplots(4, 2, figsize=(12, 14))
        for row, q in enumerate(sets[set_name]):
            box = q["source_crop"]["native_box"]
            crop = source.crop(box)
            axes[row, 0].imshow(crop, extent=(box[0], box[2], box[3], box[1]))
            x, y = q["pixel_xy"]
            axes[row, 0].plot(x, y, "+", color="cyan", ms=22, mew=1.5)
            axes[row, 0].set_title(q["id"] + " | native scan")
            centre = c.merc([q["lonlat"]])[0]
            ax = axes[row, 1]
            for name, col, width in [
                ("roads", "#999999", 1),
                ("highways", "#b77400", 1.5),
                ("water-lines", "#007bb3", 1.5),
                ("rail", "#9570ac", 0.8),
            ]:
                ax.add_collection(
                    LineCollection(vectors[name], colors=col, linewidths=width)
                )
            ax.plot(*centre, "+", color="#e03628", ms=22, mew=1.5)
            ax.set(
                xlim=(centre[0] - 500, centre[0] + 500),
                ylim=(centre[1] - 400, centre[1] + 400),
                aspect="equal",
                title=q["label"],
            )
            ax.ticklabel_format(useOffset=False, style="plain")
            ax.tick_params(labelsize=7)
        fig.suptitle(
            f"Sheet 22 / {set_name} checks: cyan native pixel; red modern reference\nOriginal scan frame, no rotation; modern axes EPSG:3857 metres",
            fontsize=12,
        )
        fig.tight_layout(rect=(0, 0, 1, 0.965))
        fig.savefig(a.out / (set_name + "-evidence.jpg"), dpi=130)
        plt.close(fig)
    assert selected["passes_numeric_gate"], (
        "Do not render an accepted corridor after a failed gate"
    )

    # Bound the artifact to the tested corridor. Route 19 ends at Port Hastings;
    # Highway 4 supplies the connection into northern Port Hawkesbury.
    def collection(name, geometries):
        path = a.out / (name + ".geojson")
        c.write(
            path,
            {
                "type": "FeatureCollection",
                "name": "regions",
                "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
                "features": [
                    {"type": "Feature", "properties": {}, "geometry": g}
                    for g in geometries
                ],
            },
        )
        return path

    def sql(name, src, query):
        path = a.out / (name + ".geojson")
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
            query,
            "-nln",
            "regions",
        )
        return path

    def polygon_wkt(points):
        return "POLYGON((" + ",".join(f"{x} {y}" for x, y in points) + "))"

    lo, hi = c.merc([[-61.49, 45.6185999], [-61.34, 45.7442922]])
    region = [
        [lo[0], lo[1]],
        [hi[0], lo[1]],
        [hi[0], hi[1]],
        [lo[0], hi[1]],
        [lo[0], lo[1]],
    ]
    route_geometries = {19: [], 4: []}
    for f in features["highways"]:
        route = f["properties"].get("RTE_NO")
        if route in [19, 4]:
            g = f["geometry"]
            for part in (
                [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
            ):
                route_geometries[route].append(
                    {"type": "LineString", "coordinates": c.merc(part).tolist()}
                )
    four = collection("route4-lines", route_geometries[4])
    flo, fhi = c.merc([[-61.405, 45.6185999], [-61.34, 45.65]])
    fbox = [
        flo.tolist(),
        [fhi[0], flo[1]],
        fhi.tolist(),
        [flo[0], fhi[1]],
        flo.tolist(),
    ]
    four = sql(
        "route4-town",
        four,
        f"SELECT ST_Intersection(ST_Union(geometry),ST_GeomFromText('{polygon_wkt(fbox)}',3857)) AS geometry FROM regions",
    )
    four_geom = json.loads(four.read_text())["features"][0]["geometry"]
    lines = collection("route-lines", route_geometries[19] + [four_geom])
    # Separate Route 4 clip excludes mainland roads and the southern untested town.
    clipped = sql(
        "route-clipped",
        lines,
        f"SELECT ST_Intersection(ST_Union(geometry),ST_GeomFromText('{polygon_wkt(region)}',3857)) AS geometry FROM regions",
    )
    # Use 500 ground metres each side; this is a browsing corridor, not accuracy.
    buffered = sql(
        "route-buffer",
        clipped,
        f"SELECT ST_Buffer(geometry,{500 / math.cos(math.radians(45.68))}) AS geometry FROM regions",
    )
    # Include only area bounded by observed positions, then native content.
    anchors = np.array(
        [p["pixel_xy"] for p in controls + sets["F"] + sets["G"] + sets["C"]]
    )
    hull = anchors[ConvexHull(anchors).vertices]
    hull = np.vstack((hull, hull[0]))
    hull_world = transform(c.dense_ring(hull)).tolist()
    hull_world.append(hull_world[0])
    content = np.array(
        json.loads((HERE.parent / "sheet22/boundary.json").read_text())["ring_pixel_xy"]
    )
    content_world = transform(c.dense_ring(content)).tolist()
    content_world.append(content_world[0])
    mask = sql(
        "corridor-cutline",
        buffered,
        f"SELECT ST_Intersection(ST_Intersection(ST_Intersection(geometry,ST_GeomFromText('{polygon_wkt(hull_world)}',3857)),ST_GeomFromText('{polygon_wkt(content_world)}',3857)),ST_GeomFromText('{polygon_wkt(region)}',3857)) AS geometry FROM regions",
    )
    vrt = a.out / "hawkesbury-gcps.vrt"
    c.run(
        "gdal_translate",
        "-of",
        "VRT",
        "-a_srs",
        "EPSG:3857",
        *gcps(controls),
        a.source,
        vrt,
    )
    tif = a.out / "hawkesbury-corridor-preview.tif"
    c.run(
        "gdalwarp",
        "-overwrite",
        "-tps",
        "-t_srs",
        "EPSG:3857",
        "-tr",
        5,
        5,
        "-tap",
        "-r",
        "cubic",
        "-dstalpha",
        "-cutline",
        mask,
        "-crop_to_cutline",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        vrt,
        tif,
    )
    info = json.loads(c.run("gdalinfo", "-json", tif))
    assert (
        len(info["bands"]) == 4 and info["bands"][-1]["colorInterpretation"] == "Alpha"
    )
    gt = info["geoTransform"]
    im = Image.open(tif).convert("RGBA")
    alpha = np.asarray(im)[:, :, 3]
    assert (alpha == 0).any() and (alpha == 255).any()
    im.thumbnail((1100, 1600))
    im.save(a.out / "corridor-preview.png")
    fig, ax = plt.subplots(figsize=(10, 14))
    ax.imshow(
        Image.open(tif),
        extent=(
            gt[0],
            gt[0] + info["size"][0] * gt[1],
            gt[3] + info["size"][1] * gt[5],
            gt[3],
        ),
    )
    for name, col in [("water-lines", "#008ac4"), ("highways", "#ee5c18")]:
        ax.add_collection(LineCollection(vectors[name], colors=col, linewidths=0.6))
    ax.set(
        xlim=(lo[0], hi[0]),
        ylim=(lo[1], hi[1]),
        aspect="equal",
        title="Hawkesbury corridor / TPS preview\nBlue: modern water; orange: modern highways",
    )
    for name, marker, color in [("G", "+", "#e31a1c"), ("F", "x", "#742292")]:
        pts = c.merc([p["lonlat"] for p in sets[name]])
        ax.scatter(pts[:, 0], pts[:, 1], marker=marker, c=color, s=45)
        for q, p in zip(sets[name], pts):
            ax.annotate(q["id"], p, xytext=(5, 5), textcoords="offset points")
    fig.tight_layout()
    fig.savefig(a.out / "corridor-overlay.jpg", dpi=140)
    plt.close(fig)
    receipt = {
        "file": tif.name,
        "sha256": c.digest(tif),
        "bytes": tif.stat().st_size,
        "dimensions": info["size"],
        "bands": 4,
        "crs": "EPSG:3857",
        "cell_size_projected_m": 5,
        "source_sha256": data["source_sha256"],
        "controls": 19,
        "preserved_hand_controls": 17,
        "model": "TPS",
        "coverage": "500 ground metre half-width around Route 19 / Highway 4 within observed hull and native content; latitude 45.6185999 to 45.7442922. Not the full sheet or full town.",
        "alpha_nonzero_cells": int((alpha > 0).sum()),
        "input_hashes": scores["input_hashes"],
        "source_boundary": "../sheet22/boundary.json",
    }
    c.write(a.out / "artifact-receipt.json", receipt)
    print(json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
