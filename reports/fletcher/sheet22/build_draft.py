"""Replay Sheet 22 frozen checks and render a reversible diagnostic draft.

Uses the existing Judique GDAL/coordinate helpers. Requires NumPy, SciPy, Pillow,
Matplotlib and GDAL on PATH. Large imagery remains outside the repository.
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
        "d64dd31b6004113a424d83ff2764845aeef39dceed57373ac7d54ffaa885f9eb",
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
    assert len(controls) == len(saved_manual) == 17 and len(checks) == 8
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
    assert PlotPath(ring).contains_points(dense_ring(hull)).all()
    tri = Delaunay(xy)
    inside = tri.find_simplex(qxy) >= 0
    gcp = []
    for p, w in zip(xy, world):
        gcp.extend(["-gcp", *map(str, [*p, *w])])

    def transform(points, model="affine"):
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
    assert np.max(np.abs(transform(qxy) - np.c_[qxy, np.ones(len(qxy))] @ fit)) < 0.0001
    xx, yy = np.meshgrid(
        np.arange(ring[:, 0].min(), ring[:, 0].max(), 100),
        np.arange(ring[:, 1].min(), ring[:, 1].max(), 100),
    )
    grid = np.c_[xx.ravel(), yy.ravel()]
    grid = grid[PlotPath(ring).contains_points(grid)]
    scores = {
        "status": "failed-geographic-gate; diagnostic only",
        "gate": data["gate"],
        "selected_diagnostic_model": "affine",
        "selection": "Both fail; affine is simpler and has lower median and worst errors on these checks. Checks are now model-selection diagnostics, not fresh validation.",
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
        "control_hull_fraction_of_content_area": float(area(hull) / area(ring)),
        "checks_inside_hull": int(inside.sum()),
        "checks_total": len(checks),
        "note": "Area includes sea. A hull limits extrapolation; it does not certify accuracy.",
    }
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
    with (out / "sheet22-controls-checks.csv").open("w") as stream:
        writer = csv.writer(stream)
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
        ("neatline-diagnostic", ring),
        ("supported-diagnostic", dense_ring(hull)),
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
                            "status": "failed-geographic-gate; diagnostic only"
                        },
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [wring.tolist()],
                        },
                    }
                ],
            },
        )
        tif = out / ("sheet22-" + label + ".tif")
        run(
            "gdalwarp",
            "-overwrite",
            "-order",
            1,
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
        png = out / ("sheet22-" + label + ".png")
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
    for qid in ["Q01", "Q04"]:
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
            out / "sheet22-neatline-diagnostic.tif",
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
        for point, label in [(a, "Modern junction"), (p, "Mapped junction")]:
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
            title=qid + " affine diagnostic — blue: modern water",
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
            "model": "affine",
            "geographic_acceptance": False,
            "credit": "David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries",
            "rights": "CC BY-NC-SA 3.0 and recorded project permission; see ../INVENTORY.md. Crop, annotations and warp are modifications.",
            "rasters": receipts,
        },
    )
    if args.judique_dir:
        seam(out, args.judique_dir, vectors)


def seam(out, judique_dir, vectors):
    """Compare content extents and imagery without choosing a production seam."""
    prior = json.loads((judique_dir / "artifact-receipt.json").read_text())
    # Verify the exact previously rendered Judique diagnostic, never a live layer.
    receipts = prior.get("rasters", prior.get("raster_receipts", []))
    match = next(r for r in receipts if r["file"] == "judique-neatline-diagnostic.tif")
    verified(judique_dir / match["file"], match["sha256"])

    def polygon(path):
        return np.array(
            json.loads(path.read_text())["features"][0]["geometry"]["coordinates"][0]
        )

    boundary_path = HERE.parent / "judique-boundary/boundary.json"
    verified(boundary_path, prior["boundary_sha256"])
    fit_path = HERE.parent / "visual-expansion/sheet-observations.json"
    verified(fit_path, prior["fit_observations_sha256"])
    old_gcp = []
    for p in json.loads(fit_path.read_text())["points"]:
        if p["role"] == "control":
            old_gcp.extend(
                ["-gcp", *map(str, [*p["pixel_xy"], *merc([p["lonlat"]])[0]])]
            )
    old = polygon(judique_dir / "neatline-diagnostic-cutline.geojson")
    new = polygon(out / "neatline-diagnostic-cutline.geojson")
    old_native = dense_ring(
        json.loads((HERE.parent / "judique-boundary/boundary.json").read_text())[
            "ring_pixel_xy"
        ]
    )
    assert len(old_native) == len(old)
    replay = run(
        "gdaltransform",
        "-tps",
        *old_gcp,
        stdin="".join(f"{x} {y}\n" for x, y in old_native),
    )
    replay = np.array(
        [list(map(float, line.split()[:2])) for line in replay.splitlines()]
    )
    assert np.max(np.abs(replay - old)) < 0.00001

    # Only facing edges; rotated side corners do not measure the north/south join.
    old_edge = old[old_native[:, 1] >= 6537]
    new_edge = new[:8]
    lo = max(old_edge[:, 0].min(), new_edge[:, 0].min())
    hi = min(old_edge[:, 0].max(), new_edge[:, 0].max())

    def crossings(poly, x):
        a, b = poly[:-1], poly[1:]
        mask = ((a[:, 0] <= x) & (b[:, 0] > x)) | ((b[:, 0] <= x) & (a[:, 0] > x))
        return a[mask, 1] + (x - a[mask, 0]) * (b[mask, 1] - a[mask, 1]) / (
            b[mask, 0] - a[mask, 0]
        )

    records = []
    for x in np.linspace(lo + 1, hi - 1, 101):
        south, north = crossings(old_edge, x).min(), crossings(new_edge, x).max()
        ll = unmerc(np.array([[x, (south + north) / 2]]))[0]
        records.append(
            {
                "longitude": float(ll[0]),
                "signed_overlap_ground_m": float(
                    (north - south) * math.cos(math.radians(ll[1]))
                ),
            }
        )
    vals = [p["signed_overlap_ground_m"] for p in records]
    write(
        out / "northern-join.json",
        {
            "judique_raster_sha256": match["sha256"],
            "definition": "At 101 longitude samples across the shared facing-edge extent, excluding rotated side corners: Sheet22 north edge minus Judique south edge, converted from Mercator metres using local cosine. Positive=overlap; negative=gap. Not physical-feature agreement or a final seam.",
            "minimum_ground_m": min(vals),
            "maximum_ground_m": max(vals),
            "samples": records,
        },
    )
    # A common north-up strip includes the known Judique B07 outlet error and
    # Sheet22 Q01 mismatch. Distinct panels avoid hiding errors by draw order.
    bounds = merc([[-61.44, 45.737], [-61.36, 45.763]])
    left, bottom = bounds[0]
    right, top = bounds[1]
    fig, axes = plt.subplots(2, 1, figsize=(13, 10))
    for ax, path, title in zip(
        axes,
        [judique_dir / match["file"], out / "sheet22-neatline-diagnostic.tif"],
        [
            "Judique frozen TPS — known southern lake error retained",
            "Sheet22 saved-control affine — northern fork error retained",
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
        ax.set_facecolor("#eeeeee")
        ax.imshow(
            Image.open(png),
            extent=[gt[0], gt[0] + w * gt[1], gt[3] + h * gt[5], gt[3]],
            origin="upper",
        )
        for name, color, width in [
            ("roads", "#888888", 0.6),
            ("water-lines", "#00a6ec", 1.1),
        ]:
            lines = [
                a
                for a in vectors[name]
                if np.all(a.max(axis=0) >= [left, bottom])
                and np.all(a.min(axis=0) <= [right, top])
            ]
            ax.add_collection(LineCollection(lines, colors=color, linewidths=width))
        for poly, color in [(old, "#b02bb4"), (new, "#009447")]:
            ax.plot(poly[:, 0], poly[:, 1], color=color, linewidth=2)
        ax.set(xlim=(left, right), ylim=(bottom, top), aspect="equal", title=title)
        ax.set_axis_off()
    fig.suptitle(
        "Northern join diagnostic — blue: modern water; purple: Judique edge; green: Sheet22 edge"
    )
    fig.tight_layout()
    fig.savefig(out / "northern-join.jpg", dpi=120)
    plt.close(fig)


if __name__ == "__main__":
    main()
