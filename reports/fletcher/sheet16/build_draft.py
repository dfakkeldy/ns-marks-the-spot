"""Replay Sheet 16 frozen checks and render a reversible diagnostic draft.

Uses the existing Judique GDAL/coordinate helpers. Requires NumPy, SciPy, Pillow,
Matplotlib and GDAL on PATH. Large imagery remains outside the repository.
"""

import argparse
import csv
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
from matplotlib.path import Path as PlotPath
from PIL import Image, ImageDraw
from scipy.spatial import ConvexHull, Delaunay

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "judique_boundary", HERE.parent / "judique-boundary/build_boundary.py"
)
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
digest, verified, run = common.digest, common.verified, common.run
merc, unmerc, write, dense_ring = (
    common.merc,
    common.unmerc,
    common.write,
    common.dense_ring,
)


def clip_to_hull(ring, hull):
    """Clip a near-rectangular content ring by the convex control hull."""
    output = list(np.asarray(ring)[:-1])
    for a, b in zip(hull, np.roll(hull, -1, axis=0)):
        old, output = output, []
        edge = b - a

        def side(p, a=a, edge=edge):
            d = p - a
            return edge[0] * d[1] - edge[1] * d[0]

        for p, q in zip(old, old[1:] + old[:1]):
            sp, sq = side(p), side(q)
            if sp >= -1e-8:
                output.append(p)
            if (sp < -1e-8) != (sq < -1e-8):
                output.append(p + (q - p) * sp / (sp - sq))
    assert len(output) >= 3
    return np.array(output + [output[0]])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference-dir", type=Path)
    parser.add_argument("--judique-dir", type=Path)
    parser.add_argument("--score-only", action="store_true")
    args = parser.parse_args()
    if not args.score_only and not (args.source and args.reference_dir):
        parser.error("rendering requires --source and --reference-dir")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    data = json.loads((HERE / "observations.json").read_text())
    verified(
        HERE / "observations.json",
        "d8537c6183c6a738d3aada9c28e3bcc56c31b3a8ef1350900cdaf4f519229c90",
    )
    verified(HERE / "saved-user-controls.csv", data["saved_controls_sha256"])
    boundary = json.loads((HERE / "boundary.json").read_text())
    controls = [p for p in data["points"] if p["role"] == "control"]
    checks = [p for p in data["points"] if p["role"] == "check"]
    saved = list(
        csv.DictReader(
            line
            for line in (HERE / "saved-user-controls.csv").read_text().splitlines()
            if not line.startswith("#")
        )
    )
    saved_manual = {p["label"]: p for p in saved if p["label"].startswith("gcp-")}
    assert len(controls) == len(saved_manual) == 32 and len(checks) == 8
    for p in controls:
        assert all(
            saved_manual[p["id"]][k] == v
            for k, v in p["original_numeric_strings"].items()
        )
    xy = np.array([p["pixel_xy"] for p in controls])
    world = merc([p["lonlat"] for p in controls])
    qxy = np.array([p["pixel_xy"] for p in checks])
    actual = np.array([p["lonlat"] for p in checks])
    hull = xy[ConvexHull(xy).vertices]
    ring = np.array(boundary["ring_pixel_xy"])
    clipped_hull = clip_to_hull(ring, hull)
    assert PlotPath(ring).contains_points(dense_ring(clipped_hull), radius=0.01).all()
    tri = Delaunay(xy)
    inside = tri.find_simplex(qxy) >= 0
    gcp = []
    for p, w in zip(xy, world):
        gcp.extend(["-gcp", *map(str, [*p, *w])])

    def transform(points, model="TPS"):
        result = run(
            "gdaltransform",
            *(["-order", 1] if model == "affine" else ["-tps"]),
            *gcp,
            stdin="".join(f"{x} {y}\n" for x, y in points),
        )
        return np.array(
            [list(map(float, line.split()[:2])) for line in result.splitlines()]
        )

    fit = np.linalg.lstsq(np.c_[xy, np.ones(len(xy))], world, rcond=None)[0]
    assert (
        np.max(np.abs(transform(qxy, "affine") - np.c_[qxy, np.ones(len(qxy))] @ fit))
        < 0.0001
    )
    xx, yy = np.meshgrid(
        np.arange(ring[:, 0].min(), ring[:, 0].max(), 100),
        np.arange(ring[:, 1].min(), ring[:, 1].max(), 100),
    )
    grid = np.c_[xx.ravel(), yy.ravel()]
    grid = grid[PlotPath(ring).contains_points(grid)]
    scores = {
        "status": "passes frozen corridor checks; whole-sheet accuracy not established",
        "gate": data["gate"],
        "selected_model": "TPS",
        "selection": "Affine fails and TPS passes these eight corridor checks. Checks informed model selection; they are not fresh validation of any future repair. Whole-sheet geography is not validated.",
        "observations_sha256": digest(HERE / "observations.json"),
        "models": {},
    }
    for model in ["affine", "TPS"]:
        pred = unmerc(transform(qxy, model))
        errors = 6371008.8 * np.hypot(
            np.deg2rad(pred[:, 0] - actual[:, 0])
            * np.cos(np.deg2rad((pred[:, 1] + actual[:, 1]) / 2)),
            np.deg2rad(pred[:, 1] - actual[:, 1]),
        )
        base = transform(grid, model)
        dx = transform(grid + [1, 0], model) - base
        dy = transform(grid + [0, 1], model) - base
        det = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
        scores["models"][model] = {
            "median_ground_m": float(np.median(errors)),
            "worst_ground_m": float(errors.max()),
            "passes_gate": bool(np.median(errors) <= 100 and errors.max() <= 200),
            "sampled_jacobian": {
                "count": len(grid),
                "step_native_px": 100,
                "nonnegative_determinants": int((det >= 0).sum()),
                "min": float(det.min()),
                "max": float(det.max()),
                "note": "Native y is down; expected determinant is negative. Sampling does not prove a curved surface is fold-free.",
            },
            "checks": [
                {
                    "id": q["id"],
                    "predicted_lonlat": p.tolist(),
                    "error_ground_m": float(e),
                    "inside_control_hull": bool(h),
                }
                for q, p, e, h in zip(checks, pred, errors, inside)
            ],
        }
    area = lambda a: (
        abs(np.sum(a[:, 0] * np.roll(a[:, 1], -1) - a[:, 1] * np.roll(a[:, 0], -1))) / 2
    )
    scores["coverage"] = {
        "control_hull_fraction_of_content_area": float(area(clipped_hull) / area(ring)),
        "checks_inside_hull": int(inside.sum()),
        "checks_total": len(checks),
        "note": "Area includes sea. A hull limits extrapolation; it does not certify accuracy.",
    }
    assert scores["models"]["TPS"]["passes_gate"]
    write(out / "scores.json", scores)
    print(
        json.dumps(
            {
                m: {
                    k: v
                    for k, v in s.items()
                    if k in ["median_ground_m", "worst_ground_m", "passes_gate"]
                }
                for m, s in scores["models"].items()
            }
        ),
        flush=True,
    )
    with (out / "sheet16-controls-checks.csv").open("w") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["pixel_x", "pixel_y", "lon", "lat", "role", "label"])
        for p in data["points"]:
            original = p.get("original_numeric_strings")
            coords = (
                [original[k] for k in ["pixel_x", "pixel_y", "lon", "lat"]]
                if original
                else [*p["pixel_xy"], *p["lonlat"]]
            )
            writer.writerow([*coords, p["role"], p["id"]])
    if args.score_only:
        return
    verified(args.source, data["source_sha256"])
    vectors = {}
    for receipt in json.loads((HERE / "reference-receipts.json").read_text()):
        path = args.reference_dir / (receipt["name"] + ".geojson")
        verified(path, receipt["sha256"])
        vectors[receipt["name"]] = []
        for f in json.loads(path.read_text())["features"]:
            g = f["geometry"]
            if g["type"] == "LineString":
                parts = [g["coordinates"]]
            elif g["type"] in ["MultiLineString", "Polygon"]:
                parts = g["coordinates"]
            elif g["type"] == "MultiPolygon":
                parts = [r for p in g["coordinates"] for r in p]
            else:
                raise ValueError(g["type"])
            vectors[receipt["name"]].extend(merc(p) for p in parts)
    route = []
    for f in json.loads((args.reference_dir / "highways.geojson").read_text())[
        "features"
    ]:
        if str(f["properties"]["RTE_NO"]) == "19":
            geom = f["geometry"]
            parts = (
                [geom["coordinates"]]
                if geom["type"] == "LineString"
                else geom["coordinates"]
            )
            route.extend(merc(p) for p in parts)
    vectors["route19"] = route
    world_content = PlotPath(transform(dense_ring(ring)))
    world_supported = PlotPath(transform(dense_ring(clipped_hull)))
    samples = []
    for line in route:
        for a, b in pairwise(line):
            n = max(1, math.ceil(np.linalg.norm(b - a) / 25))
            samples.extend(a + (b - a) * i / n for i in range(n))
    samples = np.asarray(samples)
    in_content = world_content.contains_points(samples)
    in_hull = world_supported.contains_points(samples)
    write(
        out / "route19-coverage.json",
        {
            "scope": "Modern Route19 samples within Sheet16 content extent, including the short section north of Mabou. Coverage only, not road alignment accuracy.",
            "sampling": "At most 25 projected metres along each reference segment; sample counts are not a length-weighted percentage.",
            "inside_content_count": int(in_content.sum()),
            "inside_supported_count": int((in_content & in_hull).sum()),
            "outside_supported_lonlat": unmerc(samples[in_content & ~in_hull]).tolist(),
        },
    )
    source = Image.open(args.source).convert("RGB")
    assert list(source.size) == data["source_dimensions"]
    overview = source.copy()
    draw = ImageDraw.Draw(overview)
    for points, color in [(ring, "cyan"), (dense_ring(hull), "magenta")]:
        draw.line([tuple(p) for p in points], fill=color, width=12)
    for q in data["points"]:
        x, y = q["pixel_xy"]
        draw.ellipse(
            (x - 22, y - 22, x + 22, y + 22),
            fill="yellow" if q["role"] == "check" else "white",
            outline="black",
            width=3,
        )
        draw.text(
            (x + 28, y - 28),
            q["id"],
            fill="black",
            stroke_width=2,
            stroke_fill="white",
            font_size=42,
        )
    overview.thumbnail((2100, 1600))
    overview.save(out / "coverage-overview.jpg", quality=88)

    def modern_lines(ax, centre, radius):
        for name, color, width in [
            ("roads", "#888888", 1),
            ("highways", "#996600", 1.3),
            ("rail", "#8b549f", 1),
            ("water-polygons", "#0089bc", 0.6),
            ("water-lines", "#009ad4", 1.3),
        ]:
            lines = [
                a
                for a in vectors[name]
                if np.all(a.max(axis=0) >= centre - radius)
                and np.all(a.min(axis=0) <= centre + radius)
            ]
            ax.add_collection(LineCollection(lines, colors=color, linewidths=width))

    for q in checks:
        crop = q["source_crop"]
        native = source.crop(crop["native_box"]).resize(crop["display_size"])
        x0, y0, x1, y1 = crop["native_box"]
        x, y = q["pixel_xy"]
        cx, cy = (
            (x - x0) * native.width / (x1 - x0),
            (y - y0) * native.height / (y1 - y0),
        )
        draw = ImageDraw.Draw(native)
        for dx, dy in [(1, 0), (0, 1)]:
            for sign in [-1, 1]:
                draw.line(
                    (
                        cx + sign * 8 * dx,
                        cy + sign * 8 * dy,
                        cx + sign * 30 * dx,
                        cy + sign * 30 * dy,
                    ),
                    fill="cyan",
                    width=2,
                )
        draw.ellipse((cx - 3, cy - 3, cx + 3, cy + 3), outline="red")
        native.save(out / (q["id"] + "-source-crosshair.png"))
        centre = merc([q["lonlat"]])[0]
        radius = 550 / math.cos(math.radians(q["lonlat"][1]))
        fig, ax = plt.subplots(figsize=(7, 6))
        modern_lines(ax, centre, radius)
        ax.plot(*centre, "+", color="red", markersize=18)
        ax.set(
            xlim=(centre[0] - radius, centre[0] + radius),
            ylim=(centre[1] - radius, centre[1] + radius),
            title=q["id"] + " — north up; 1.1 km ground width",
            aspect="equal",
        )
        ax.set_axis_off()
        fig.tight_layout()
        fig.savefig(out / (q["id"] + "-modern.png"), dpi=100)
        plt.close(fig)
    for page in range(2):
        contact = Image.new("RGB", (1200, 1740), "white")
        draw = ImageDraw.Draw(contact)
        draw.text(
            (12, 8),
            "Native crosshair (left); modern reference, north up (right)",
            fill="black",
            font_size=22,
        )
        for i, q in enumerate(checks[page * 4 : page * 4 + 4]):
            y = 40 + i * 425
            draw.text((12, y), q["id"] + " - " + q["label"], fill="black", font_size=19)
            contact.paste(
                Image.open(out / (q["id"] + "-source-crosshair.png")), (10, y + 45)
            )
            modern = Image.open(out / (q["id"] + "-modern.png"))
            modern.thumbnail((590, 390))
            contact.paste(modern, (600, y + 25))
        contact.save(out / f"check-evidence-{page + 1}.jpg", quality=88)
    vrt = out / "saved-controls.vrt"
    run(
        "gdal_translate",
        "-of",
        "VRT",
        "-a_srs",
        "EPSG:3857",
        *gcp,
        args.source.resolve(),
        vrt,
    )
    receipts = []
    for label, pixel_ring in [
        ("neatline-diagnostic", dense_ring(ring)),
        ("supported-preview", dense_ring(clipped_hull)),
    ]:
        wring = transform(pixel_ring)
        cut = out / (label + "-cutline.geojson")
        write(
            cut,
            {
                "type": "FeatureCollection",
                "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "status": "passes frozen corridor checks; whole-sheet accuracy not established"
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [wring.tolist()],
                        },
                    }
                ],
            },
        )
        tif = out / ("sheet16-" + label + ".tif")
        run(
            "gdalwarp",
            "-overwrite",
            "-tps",
            "-t_srs",
            "EPSG:3857",
            "-r",
            "cubic",
            "-tr",
            5,
            5,
            "-tap",
            "-cutline",
            cut,
            "-crop_to_cutline",
            "-dstalpha",
            "-co",
            "COMPRESS=DEFLATE",
            "-co",
            "TILED=YES",
            vrt,
            tif,
        )
        info = json.loads(run("gdalinfo", "-json", tif))
        gt = info["geoTransform"]
        assert (
            len(info["bands"]) == 4
            and info["bands"][3]["colorInterpretation"] == "Alpha"
        )
        assert gt[1:3] == [5.0, 0.0] and gt[4:] == [0.0, -5.0]
        assert all(abs(gt[i] / 5 - round(gt[i] / 5)) < 1e-8 for i in [0, 3])
        png = out / ("sheet16-" + label + ".png")
        run("gdal_translate", "-of", "PNG", "-outsize", 1600, 0, tif, png)
        alpha = np.array(Image.open(png))[:, :, 3]
        assert alpha.min() == 0 and alpha.max() == 255
        write(out / (label + "-raster-info.json"), info)
        receipts.append(
            {
                "file": tif.name,
                "sha256": digest(tif),
                "size": info["size"],
                "geoTransform": gt,
                "alpha_min_max": [int(alpha.min()), int(alpha.max())],
            }
        )
        print("Rendered " + tif.name, flush=True)
    png = out / "sheet16-supported-preview.png"
    info = json.loads(run("gdalinfo", "-json", png))
    gt = info["geoTransform"]
    w, h = info["size"]
    fig, ax = plt.subplots(figsize=(12, 9))
    ax.imshow(
        Image.open(png),
        extent=[gt[0], gt[0] + w * gt[1], gt[3] + h * gt[5], gt[3]],
        origin="upper",
    )
    ax.add_collection(LineCollection(route, colors="#f07800", linewidths=2))
    for q in checks:
        coord = merc([q["lonlat"]])[0]
        ax.plot(*coord, "o", color="#00aadd", markersize=5)
        ax.annotate(
            q["id"],
            coord,
            xytext=(-35, 5) if q["id"] == "Q08" else (5, 5),
            textcoords="offset points",
            bbox={"facecolor": "white", "alpha": 0.8, "edgecolor": "none"},
        )
    ax.set(
        xlim=(gt[0], gt[0] + w * gt[1]),
        ylim=(gt[3] + h * gt[5], gt[3]),
        aspect="equal",
        title="Sheet16: Route19 in orange; eight separate checks in blue",
    )
    ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(out / "route19-overview.jpg", dpi=120)
    plt.close(fig)
    for qid in ["Q04", "Q07"]:
        q = next(q for q in checks if q["id"] == qid)
        a = merc([q["lonlat"]])[0]
        p = transform([q["pixel_xy"]])[0]
        centre, radius = (a + p) / 2, 1000
        crop = out / (qid + "-warp.png")
        run(
            "gdal_translate",
            "-of",
            "PNG",
            "-projwin",
            centre[0] - radius,
            centre[1] + radius,
            centre[0] + radius,
            centre[1] - radius,
            "-outsize",
            900,
            900,
            out / "sheet16-neatline-diagnostic.tif",
            crop,
        )
        info = json.loads(run("gdalinfo", "-json", crop))
        gt = info["geoTransform"]
        w, h = info["size"]
        fig, ax = plt.subplots(figsize=(9, 9))
        ax.imshow(
            Image.open(crop),
            extent=[gt[0], gt[0] + w * gt[1], gt[3] + h * gt[5], gt[3]],
            origin="upper",
        )
        modern_lines(ax, centre, radius)
        ax.plot([a[0], p[0]], [a[1], p[1]], "o-", color="red")
        for point, label in [(a, "Modern feature"), (p, "Mapped feature")]:
            ax.annotate(
                label,
                point,
                xytext=(8, 8),
                textcoords="offset points",
                bbox={"facecolor": "white", "alpha": 0.9},
            )
        ax.set(
            xlim=(centre[0] - radius, centre[0] + radius),
            ylim=(centre[1] - radius, centre[1] + radius),
            aspect="equal",
            title=qid + " TPS check — blue: modern water",
        )
        ax.set_axis_off()
        fig.tight_layout()
        fig.savefig(out / (qid + "-mismatch.jpg"), dpi=120)
        plt.close(fig)
    write(
        out / "artifact-receipt.json",
        {
            "source_sha256": data["source_sha256"],
            "observations_sha256": digest(HERE / "observations.json"),
            "boundary_sha256": digest(HERE / "boundary.json"),
            "build_script_sha256": digest(Path(__file__)),
            "model": "TPS",
            "frozen_corridor_checks_pass": True,
            "whole_sheet_accepted": False,
            "credit": "David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries",
            "rights": "CC BY-NC-SA 3.0 and recorded project permission; see ../INVENTORY.md. Crop, annotations and warp are modifications.",
            "rasters": receipts,
        },
    )
    if args.judique_dir:
        seam(out, args.judique_dir, vectors)


def seam(out, judique_dir, vectors):
    """Inspect the Sheet16 south/Judique north join on their existing fits."""
    prior = json.loads((judique_dir / "artifact-receipt.json").read_text())
    match = next(
        r for r in prior["rasters"] if r["file"] == "judique-neatline-diagnostic.tif"
    )
    verified(judique_dir / match["file"], match["sha256"])
    old_boundary = HERE.parent / "judique-boundary/boundary.json"
    old_fit = HERE.parent / "visual-expansion/sheet-observations.json"
    verified(old_boundary, prior["boundary_sha256"])
    verified(old_fit, prior["fit_observations_sha256"])

    def gcp_args(path):
        args = []
        for p in json.loads(path.read_text())["points"]:
            if p["role"] == "control":
                args.extend(
                    ["-gcp", *map(str, [*p["pixel_xy"], *merc([p["lonlat"]])[0]])]
                )
        return args

    def edge(vertices, gcps):
        vertices = np.asarray(vertices)
        points = []
        for a, b in pairwise(vertices):
            count = max(1, math.ceil(np.linalg.norm(b - a) / 25))
            points.extend(a + (b - a) * i / count for i in range(count))
        points.append(vertices[-1])
        result = run(
            "gdaltransform",
            "-tps",
            *gcps,
            stdin="".join(f"{x} {y}\n" for x, y in points),
        )
        return np.array([list(map(float, s.split()[:2])) for s in result.splitlines()])

    old = edge(
        json.loads(old_boundary.read_text())["ring_pixel_xy"][:19], gcp_args(old_fit)
    )
    new = edge(
        json.loads((HERE / "boundary.json").read_text())["south_edge_pixel_xy"],
        gcp_args(HERE / "observations.json"),
    )
    old = old[np.argsort(old[:, 0])]
    new = new[np.argsort(new[:, 0])]
    x = np.linspace(
        max(old[:, 0].min(), new[:, 0].min()) + 1,
        min(old[:, 0].max(), new[:, 0].max()) - 1,
        101,
    )
    y19 = np.interp(x, old[:, 0], old[:, 1])
    y16 = np.interp(x, new[:, 0], new[:, 1])
    ll = unmerc(np.c_[x, (y19 + y16) / 2])
    overlap = (y19 - y16) * np.cos(np.deg2rad(ll[:, 1]))
    crossings = []

    def cross(a, b):
        return a[0] * b[1] - a[1] * b[0]

    for line in vectors["route19"]:
        for p, q in pairwise(line):
            r = q - p
            for a, b in pairwise(new):
                v = b - a
                den = cross(r, v)
                if abs(den) < 1e-9:
                    continue
                t = cross(a - p, v) / den
                u = cross(a - p, r) / den
                if 0 <= t <= 1 and 0 <= u <= 1:
                    pt = p + t * r
                    geo = unmerc(np.array([pt]))[0]
                    crossings.append(
                        {
                            "lonlat": geo.tolist(),
                            "signed_overlap_ground_m": float(
                                (np.interp(pt[0], old[:, 0], old[:, 1]) - pt[1])
                                * math.cos(math.radians(geo[1]))
                            ),
                        }
                    )
    write(
        out / "southern-join.json",
        {
            "judique_raster_sha256": match["sha256"],
            "route19_crossings": crossings,
            "definition": "101 samples across the facing edge extent. Judique north minus Sheet16 south; positive=overlap and negative=gap. Approximate ground metres, not physical-feature agreement.",
            "minimum_ground_m": float(overlap.min()),
            "maximum_ground_m": float(overlap.max()),
            "samples": [
                {"longitude": float(l[0]), "signed_overlap_ground_m": float(e)}
                for l, e in zip(ll, overlap)
            ],
        },
    )
    bounds = merc([[-61.535, 45.916], [-61.425, 45.938]])
    left, bottom = bounds[0]
    right, top = bounds[1]
    fig, axes = plt.subplots(2, 1, figsize=(13, 9))
    for ax, path, title in zip(
        axes,
        [out / "sheet16-neatline-diagnostic.tif", judique_dir / match["file"]],
        [
            "Sheet16 southern edge - 32 saved controls, TPS",
            "Judique northern edge - unchanged 39-control TPS",
        ],
    ):
        png = out / (path.stem + "-join.png")
        run(
            "gdal_translate",
            "-of",
            "PNG",
            "-projwin",
            left,
            top,
            right,
            bottom,
            "-outsize",
            1400,
            0,
            path,
            png,
        )
        info = json.loads(run("gdalinfo", "-json", png))
        gt = info["geoTransform"]
        w, h = info["size"]
        ax.imshow(
            Image.open(png),
            extent=[gt[0], gt[0] + w * gt[1], gt[3] + h * gt[5], gt[3]],
            origin="upper",
        )
        for name, color, width in [
            ("roads", "#999999", 0.7),
            ("highways", "#d67c00", 1.3),
            ("water-lines", "#00a6ed", 1.1),
        ]:
            lines = [
                a
                for a in vectors[name]
                if np.all(a.max(axis=0) >= [left, bottom])
                and np.all(a.min(axis=0) <= [right, top])
            ]
            ax.add_collection(LineCollection(lines, colors=color, linewidths=width))
        ax.plot(old[:, 0], old[:, 1], color="#b02bb4", linewidth=2)
        ax.plot(new[:, 0], new[:, 1], color="#009447", linewidth=2)
        ax.set(xlim=(left, right), ylim=(bottom, top), aspect="equal", title=title)
        ax.set_axis_off()
    fig.suptitle(
        "Route19 join - blue: modern water; orange: highways; purple: Judique edge; green: Sheet16 edge"
    )
    fig.tight_layout()
    fig.savefig(out / "southern-join.jpg", dpi=120)
    plt.close(fig)


if __name__ == "__main__":
    main()
