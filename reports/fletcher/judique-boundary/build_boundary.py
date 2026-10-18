"""Replay frozen Judique boundary checks and render reversible masked drafts.

Requires NumPy, SciPy, Pillow, Matplotlib and GDAL command-line tools on PATH.
The source scan and modern vectors stay outside Git. No controls are changed.
"""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
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
R = 6378137


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verified(path, expected):
    if digest(path) != expected:
        raise ValueError(f"SHA256 mismatch: {path}")


def run(name, *args, stdin=None):
    executable = shutil.which(name)
    if executable is None:
        raise RuntimeError(f"{name} must be on PATH")
    return subprocess.run(
        [executable, *map(str, args)],
        input=stdin,
        text=True,
        capture_output=True,
        check=True,
    ).stdout


def merc(ll):
    a = np.asarray(ll)
    return np.c_[
        R * np.deg2rad(a[:, 0]), R * np.log(np.tan(np.pi / 4 + np.deg2rad(a[:, 1]) / 2))
    ]


def unmerc(a):
    return np.c_[
        np.rad2deg(a[:, 0] / R),
        np.rad2deg(2 * np.arctan(np.exp(a[:, 1] / R)) - np.pi / 2),
    ]


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def dense_ring(ring):
    vertices = np.asarray(ring)
    if np.array_equal(vertices[0], vertices[-1]):
        vertices = vertices[:-1]
    samples = []
    for a, b in zip(vertices, np.roll(vertices, -1, axis=0)):
        count = max(1, math.ceil(np.linalg.norm(b - a) / 25))
        samples.extend(a + (b - a) * i / count for i in range(count))
    return np.asarray(samples + [samples[0]])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference-dir", type=Path)
    parser.add_argument("--score-only", action="store_true")
    args = parser.parse_args()
    if not args.score_only and (args.source is None or args.reference_dir is None):
        parser.error("rendering requires --source and --reference-dir")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    observations = HERE / "additional-checks.json"
    check_data = json.loads(observations.read_text())
    boundary = json.loads((HERE / "boundary.json").read_text())
    fit_path = HERE.parent / "visual-expansion/sheet-observations.json"
    verified(fit_path, check_data["fit_observations_sha256"])
    fit = json.loads(fit_path.read_text())
    controls = [p for p in fit["points"] if p["role"] == "control"]
    checks = check_data["points"]
    assert len(controls) == 39 and len(checks) == 8
    assert all(q["role"] == "check" for q in checks)
    assert not {tuple(q["pixel_xy"]) for q in checks} & {
        tuple(q["pixel_xy"]) for q in fit["points"]
    }
    xy = np.asarray([p["pixel_xy"] for p in controls])
    gcp = []
    for pixel, world in zip(xy, merc([p["lonlat"] for p in controls])):
        gcp.extend(["-gcp", *map(str, [*pixel, *world])])

    def transform(points):
        result = run(
            "gdaltransform",
            "-tps",
            *gcp,
            stdin="".join(f"{x} {y}\n" for x, y in points),
        )
        return np.asarray(
            [list(map(float, line.split()[:2])) for line in result.splitlines()]
        )

    qxy = np.asarray([q["pixel_xy"] for q in checks])
    actual = np.asarray([q["lonlat"] for q in checks])
    predicted = unmerc(transform(qxy))
    error = 6371008.8 * np.hypot(
        np.deg2rad(predicted[:, 0] - actual[:, 0])
        * np.cos(np.deg2rad((predicted[:, 1] + actual[:, 1]) / 2)),
        np.deg2rad(predicted[:, 1] - actual[:, 1]),
    )
    tri = Delaunay(xy)
    inside = tri.find_simplex(qxy) >= 0
    ring = np.asarray(boundary["ring_pixel_xy"])
    polygon = PlotPath(ring)
    # The present control hull is entirely inside this content mask. Refuse to
    # silently reuse the hull if a future boundary requires polygon intersection.
    hull = xy[ConvexHull(xy).vertices]
    hull_dense = dense_ring(hull)
    assert polygon.contains_points(hull_dense).all()
    xx, yy = np.meshgrid(
        np.arange(ring[:, 0].min(), ring[:, 0].max(), 25),
        np.arange(ring[:, 1].min(), ring[:, 1].max(), 25),
    )
    samples = np.c_[xx.ravel(), yy.ravel()]
    samples = samples[polygon.contains_points(samples)]
    a, b, c = np.split(
        transform(np.vstack([samples, samples + [1, 0], samples + [0, 1]])), 3
    )
    dx, dy = b - a, c - a
    determinants = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
    sample_inside = tri.find_simplex(samples) >= 0
    groups = {}
    for label, selected in [
        ("all", np.ones(len(checks), dtype=bool)),
        ("inside_hull", inside),
        ("outside_hull", ~inside),
    ]:
        values = error[selected]
        groups[label] = {
            "count": len(values),
            "median_ground_m": float(np.median(values)) if len(values) else None,
            "worst_ground_m": float(max(values)) if len(values) else None,
        }
    gate = check_data["gate"]
    scores = {
        "fit_observations_sha256": digest(fit_path),
        "additional_checks_sha256": digest(observations),
        "boundary_sha256": digest(HERE / "boundary.json"),
        "fit": "Unchanged 39-control GDAL TPS in EPSG:3857; checks excluded",
        "groups": groups,
        "points": [
            {
                "id": q["id"],
                "error_ground_m": float(e),
                "predicted_lonlat": p.tolist(),
                "inside_control_hull": bool(i),
            }
            for q, e, p, i in zip(checks, error, predicted, inside)
        ],
        "accuracy_gate_passed": bool(
            np.median(error) <= gate["median_max_ground_m"]
            and max(error) <= gate["worst_max_ground_m"]
        ),
        "jacobian": {
            "sample_spacing_native_px": 25,
            "sample_count": len(samples),
            "folded_or_degenerate_samples": int((determinants >= 0).sum()),
            "folded_inside_hull": int(((determinants >= 0) & sample_inside).sum()),
            "minimum": float(min(determinants)),
            "maximum": float(max(determinants)),
            "expected_sign": "negative because source y increases down",
            "limitation": "Sampled numerical diagnostic, not proof between samples",
        },
        "sheet_ready_for_seamless_tiles": False,
        "limitations": check_data["limitations"]
        + [
            "Adjoining-sheet geography and common seam lines are untested.",
            "A map-content crop does not validate unsupported extrapolation.",
        ],
    }
    write(out / "scores.json", scores)
    print(json.dumps(scores, indent=2), flush=True)
    if args.score_only:
        return

    verified(args.source, check_data["source_sha256"])
    assert boundary["source_sha256"] == check_data["source_sha256"]
    receipts = json.loads(
        (HERE.parent / "matching-benchmark/reference-receipts.json").read_text()
    )
    vectors = {}
    for name in ["water-lines", "roads", "rail"]:
        path = args.reference_dir / (name + ".geojson")
        verified(path, next(r["sha256"] for r in receipts if r["name"] == name))
        vectors[name] = []
        for feature in json.loads(path.read_text())["features"]:
            geom = feature["geometry"]
            parts = (
                [geom["coordinates"]]
                if geom["type"] == "LineString"
                else geom["coordinates"]
            )
            vectors[name].extend(merc(part) for part in parts)
    source = Image.open(args.source).convert("RGB")
    assert list(source.size) == check_data["source_dimensions"]
    overview = source.copy()
    d = ImageDraw.Draw(overview)
    d.line([tuple(p) for p in ring], fill="cyan", width=10)
    d.line([tuple(p) for p in hull_dense], fill="magenta", width=10)
    for q in checks:
        x, y = q["pixel_xy"]
        d.ellipse(
            (x - 22, y - 22, x + 22, y + 22), fill="yellow", outline="black", width=3
        )
        d.text(
            (x + 28, y - 28),
            q["id"],
            fill="black",
            stroke_width=2,
            stroke_fill="white",
            font_size=48,
        )
    overview.thumbnail((2100, 1600))
    overview.save(out / "boundary-overview.png")
    overview.save(out / "boundary-overview.jpg", quality=88)
    for q in checks:
        crop = q["source_crop"]
        native = source.crop(crop["native_box"]).resize(crop["display_size"])
        draw = ImageDraw.Draw(native)
        cx, cy = native.width / 2, native.height / 2
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
        for name, colour, width in [
            ("roads", "#999999", 1),
            ("water-lines", "#0078b3", 1.8),
            ("rail", "#8b549f", 1),
        ]:
            lines = [
                a
                for a in vectors[name]
                if np.all(a.max(axis=0) >= centre - radius)
                and np.all(a.min(axis=0) <= centre + radius)
            ]
            ax.add_collection(LineCollection(lines, colors=colour, linewidths=width))
        ax.plot(*centre, "+", color="red", markersize=18)
        ax.set(
            xlim=(centre[0] - radius, centre[0] + radius),
            ylim=(centre[1] - radius, centre[1] + radius),
            title=f"{q['id']} {q['modern_node']} — north up; 1.1 km ground width",
        )
        ax.set_aspect("equal")
        ax.set_axis_off()
        fig.tight_layout()
        fig.savefig(out / (q["id"] + "-modern.png"), dpi=100)
        plt.close(fig)

    for page in range(2):
        contact = Image.new("RGB", (1200, 4 * 425 + 40), "white")
        draw = ImageDraw.Draw(contact)
        draw.text(
            (12, 8),
            "Native crosshair (left); modern reference, north up (right)",
            fill="black",
            font_size=22,
        )
        for i, q in enumerate(checks[page * 4 : page * 4 + 4]):
            y = 40 + i * 425
            draw.text((12, y), q["id"] + " — " + q["label"], fill="black", font_size=19)
            contact.paste(
                Image.open(out / (q["id"] + "-source-crosshair.png")), (10, y + 45)
            )
            modern = Image.open(out / (q["id"] + "-modern.png"))
            modern.thumbnail((590, 390))
            contact.paste(modern, (600, y + 25))
        contact.save(out / f"check-evidence-{page + 1}.jpg", quality=88)

    vrt = out / "frozen-controls.vrt"
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
    raster_receipts = []
    for label, native_ring in [
        ("neatline-diagnostic", dense_ring(ring)),
        ("supported-preview", hull_dense),
    ]:
        warped_ring = transform(native_ring)
        cut = out / (label + "-cutline.geojson")
        write(
            cut,
            {
                "type": "FeatureCollection",
                "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"scope": label},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [warped_ring.tolist()],
                        },
                    }
                ],
            },
        )
        tif = out / ("judique-" + label + ".tif")
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
        assert (
            len(info["bands"]) == 4
            and info["bands"][3]["colorInterpretation"] == "Alpha"
        )
        assert info["geoTransform"][1:3] == [5.0, 0.0]
        assert info["geoTransform"][4:] == [0.0, -5.0]
        assert (
            abs(info["geoTransform"][0] / 5 - round(info["geoTransform"][0] / 5)) < 1e-8
        )
        assert (
            abs(info["geoTransform"][3] / 5 - round(info["geoTransform"][3] / 5)) < 1e-8
        )
        png = out / ("judique-" + label + ".png")
        run("gdal_translate", "-of", "PNG", "-outsize", "1600", "0", tif, png)
        alpha = np.asarray(Image.open(png))[:, :, 3]
        assert alpha.min() == 0 and alpha.max() == 255
        write(out / (label + "-raster-info.json"), info)
        raster_receipts.append(
            {
                "file": tif.name,
                "sha256": digest(tif),
                "size": info["size"],
                "geoTransform": info["geoTransform"],
                "alpha": True,
                "scope": label,
            }
        )
        print(f"Rendered {tif.name}: {info['size']}", flush=True)

    # Post-score diagnosis: show the frozen lake mismatch without altering it.
    lake_index = next(i for i, q in enumerate(checks) if q["id"] == "B07")
    lake = checks[lake_index]
    actual_world = merc([lake["lonlat"]])[0]
    predicted_world = merc([predicted[lake_index]])[0]
    centre = (actual_world + predicted_world) / 2
    radius = 800 / math.cos(math.radians(lake["lonlat"][1]))
    extent = [
        centre[0] - radius,
        centre[0] + radius,
        centre[1] - radius,
        centre[1] + radius,
    ]
    diagnostic_crop = out / "lake-warp-crop.png"
    run(
        "gdal_translate",
        "-of",
        "PNG",
        "-projwin",
        extent[0],
        extent[3],
        extent[1],
        extent[2],
        "-outsize",
        900,
        900,
        out / "judique-neatline-diagnostic.tif",
        diagnostic_crop,
    )
    crop_info = json.loads(run("gdalinfo", "-json", diagnostic_crop))
    gt = crop_info["geoTransform"]
    width, height = crop_info["size"]
    fig, ax = plt.subplots(figsize=(9, 9))
    ax.imshow(
        Image.open(diagnostic_crop),
        extent=[gt[0], gt[0] + gt[1] * width, gt[3] + gt[5] * height, gt[3]],
        origin="upper",
    )
    for name, colour in [("roads", "#999999"), ("water-lines", "#00aaff")]:
        lines = [
            a
            for a in vectors[name]
            if np.all(a.max(axis=0) >= centre - radius)
            and np.all(a.min(axis=0) <= centre + radius)
        ]
        ax.add_collection(LineCollection(lines, colors=colour, linewidths=1.4))
    ax.plot(
        [actual_world[0], predicted_world[0]],
        [actual_world[1], predicted_world[1]],
        "o-",
        color="red",
        linewidth=2,
    )
    ax.annotate(
        "Modern outlet",
        actual_world,
        xytext=(8, 8),
        textcoords="offset points",
        bbox={"facecolor": "white", "alpha": 0.9, "edgecolor": "none"},
    )
    ax.annotate(
        "Frozen warp outlet",
        predicted_world,
        xytext=(8, -18),
        textcoords="offset points",
        bbox={"facecolor": "white", "alpha": 0.9, "edgecolor": "none"},
    )
    ax.set(
        xlim=extent[:2],
        ylim=extent[2:],
        title=f"B07: {error[lake_index]:.0f} m ground error — outside control hull",
    )
    ax.set_aspect("equal")
    ax.set_axis_off()
    fig.tight_layout()
    fig.savefig(out / "lake-mismatch.jpg", dpi=130)
    plt.close(fig)
    write(
        out / "artifact-receipt.json",
        {
            "source_sha256": digest(args.source),
            "fit_observations_sha256": digest(fit_path),
            "additional_checks_sha256": digest(observations),
            "boundary_sha256": digest(HERE / "boundary.json"),
            "rasters": raster_receipts,
            "evidence": [
                {"file": path.name, "sha256": digest(path)}
                for path in sorted(out.glob("*.jpg"))
            ],
            "credit": "David Rumsey Map Collection, David Rumsey Map Center, Stanford University Libraries",
            "rights": "CC BY-NC-SA 3.0 and recorded project permission; see ../INVENTORY.md",
        },
    )


if __name__ == "__main__":
    main()
