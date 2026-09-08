"""Render a specified complete sheet neatline and replay supplied diagnostic checks.

Run with the benchmark Python environment and GDAL CLIs on PATH. Large source
and output rasters stay outside Git. This does not publish or accept geography.
"""

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from matplotlib.path import Path as Polygon

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "boundary", HERE.parent / "judique-boundary/build_boundary.py"
)
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--fit", type=Path, required=True)
    parser.add_argument("--boundary", type=Path, required=True)
    parser.add_argument("--checks", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    fit_path = args.fit
    fit = json.loads(fit_path.read_text())
    c.verified(args.source, fit["source_sha256"])
    controls = [p for p in fit["points"] if p["role"] == "control"]
    assert len(controls) >= 3
    gcps = []
    for p, world in zip(controls, c.merc([p["lonlat"] for p in controls])):
        gcps.extend(["-gcp", *map(str, [*p["pixel_xy"], *world])])

    def transform(points):
        text = c.run(
            "gdaltransform",
            "-tps",
            *gcps,
            stdin="".join(f"{x} {y}\n" for x, y in points),
        )
        return np.array(
            [list(map(float, row.split()[:2])) for row in text.splitlines()]
        )

    check_data = json.loads(args.checks.read_text())
    c.verified(fit_path, check_data["fit_sha256"])
    checks = check_data["points"]
    assert all(p["role"] == "check" for p in checks)
    assert not {tuple(p["lonlat"]) for p in checks} & {
        tuple(p["lonlat"]) for p in controls
    }
    predicted = c.unmerc(transform([p["pixel_xy"] for p in checks]))
    actual = np.array([p["lonlat"] for p in checks])
    errors = 6371008.8 * np.hypot(
        np.deg2rad(predicted[:, 0] - actual[:, 0])
        * np.cos(np.deg2rad((predicted[:, 1] + actual[:, 1]) / 2)),
        np.deg2rad(predicted[:, 1] - actual[:, 1]),
    )
    boundary_path = args.boundary
    boundary = json.loads(boundary_path.read_text())
    assert boundary["source_sha256"] == fit["source_sha256"]
    ring = np.array(boundary["ring_pixel_xy"])
    xx, yy = np.meshgrid(
        np.arange(ring[:, 0].min(), ring[:, 0].max(), 25),
        np.arange(ring[:, 1].min(), ring[:, 1].max(), 25),
    )
    samples = np.c_[xx.ravel(), yy.ravel()]
    samples = samples[Polygon(ring).contains_points(samples)]
    a, b, d = np.split(
        transform(np.vstack([samples, samples + [1, 0], samples + [0, 1]])), 3
    )
    dx, dy = b - a, d - a
    det = dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0]
    receipt = {
        "fit_sha256": c.digest(fit_path),
        "boundary_sha256": c.digest(boundary_path),
        "scope": "Complete inner neatline, no corridor or control-hull clipping",
        "check_status": check_data.get(
            "status",
            "Supplied frozen check set; see check file for independence and revision history",
        ),
        "checks_sha256": c.digest(args.checks),
        "median_ground_m": float(np.median(errors)),
        "worst_ground_m": float(max(errors)),
        "points": [
            {"id": p["id"], "error_ground_m": float(e), "predicted_lonlat": ll.tolist()}
            for p, e, ll in zip(checks, errors, predicted)
        ],
        "orientation": {
            "samples": len(samples),
            "native_grid_step_px": 25,
            "nonnegative_determinants": int((det >= 0).sum()),
            "determinant_range": [float(det.min()), float(det.max())],
        },
    }
    c.write(out / "scores.json", receipt)
    assert (det < 0).all(), "Sampled orientation failure: inspect before rendering"
    cutline = out / "neatline.geojson"
    c.write(
        cutline,
        {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": "EPSG:3857"}},
            "features": [
                {
                    "type": "Feature",
                    "properties": {},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [transform(c.dense_ring(ring)).tolist()],
                    },
                }
            ],
        },
    )
    vrt = out / "controls.vrt"
    c.run(
        "gdal_translate",
        "-of",
        "VRT",
        "-a_srs",
        "EPSG:3857",
        *gcps,
        args.source.resolve(),
        vrt,
    )
    tif = out / (fit["sheet"] + "-full-sheet.tif")
    c.run(
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
        cutline,
        "-crop_to_cutline",
        "-dstalpha",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        vrt,
        tif,
    )
    info = json.loads(c.run("gdalinfo", "-json", tif))
    assert (
        len(info["bands"]) == 4 and info["bands"][3]["colorInterpretation"] == "Alpha"
    )
    assert info["geoTransform"][1:3] == [5.0, 0.0]
    assert info["geoTransform"][4:] == [0.0, -5.0]
    receipt["raster"] = {
        "path": str(tif),
        "sha256": c.digest(tif),
        "size": info["size"],
        "bounds": info["wgs84Extent"],
    }
    c.write(out / "scores.json", receipt)
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
