"""Warp a Church county sheet to EPSG:3857 and measure how well it landed.

Thin-plate spline, not affine. Church county maps were compiled for legibility
of resident names rather than surveyed on a grid, so their internal geometry
does not admit a global affine fit. See docs/CHURCH_MAPS.md.

Accuracy comes from `role=check` points that never touch the warp. TPS
interpolates its control points exactly, so measuring error there would always
return ~0 regardless of how good the result actually is.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import subprocess

from tools.church.counties import ChurchCounty, get_county
from tools.church.gcps import CONTROL_ROLE, GroundControlPoint, load_gcps, split_roles
from tools.church.geometry import mercator_to_ground_metres
from tools.church.residuals import AccuracyReport, summarise

RUMSEY_ATTRIBUTION = (
    "David Rumsey Map Collection, David Rumsey Map Center, Stanford Libraries"
)
RUMSEY_LICENCE_URL = "https://www.davidrumsey.com/about/copyright-and-permissions"


def build_gcp_arguments(points: list[GroundControlPoint]) -> list[str]:
    """Build `-gcp pixel_x pixel_y mercator_x mercator_y` flags for gdal_translate.

    Check points are deliberately excluded - including them would make the
    accuracy measurement circular.
    """
    arguments: list[str] = []
    for point in points:
        if point.role != CONTROL_ROLE:
            continue
        world_x, world_y = point.mercator
        arguments += ["-gcp", str(point.pixel_x), str(point.pixel_y), str(world_x), str(world_y)]
    return arguments


def warp_command(translated: str, output: str, tps: bool = True) -> list[str]:
    """gdalwarp invocation targeting Web Mercator."""
    command = ["gdalwarp", "-r", "bilinear", "-t_srs", "EPSG:3857"]
    if tps:
        command.append("-tps")
    command += ["-co", "COMPRESS=DEFLATE", "-co", "TILED=YES", translated, output]
    return command


def parse_gdaltransform_output(text: str) -> list[tuple[float, float]]:
    """Parse `gdaltransform` stdout, which emits `x y z` per line."""
    results: list[tuple[float, float]] = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2:
            results.append((float(parts[0]), float(parts[1])))
    return results


def check_errors(
    check_points: list[GroundControlPoint], transformed: list[tuple[float, float]]
) -> list[float]:
    """Ground-metre error at each held-out check point."""
    if len(check_points) != len(transformed):
        raise ValueError(
            f"expected {len(check_points)} transformed points, got {len(transformed)}"
        )
    errors: list[float] = []
    for point, (got_x, got_y) in zip(check_points, transformed):
        want_x, want_y = point.mercator
        errors.append(
            mercator_to_ground_metres(math.hypot(got_x - want_x, got_y - want_y), point.lat)
        )
    return errors


def build_metadata(
    county: ChurchCounty,
    report: AccuracyReport,
    zoom_min: int,
    zoom_max: int,
    source_url: str,
    retrieved: str,
) -> dict:
    """Provenance + accuracy record written beside the tiles."""
    return {
        "county": county.name,
        "slug": county.slug,
        "layer_id": county.layer_id,
        "published_year": county.published_year,
        "scale_denominator": county.scale_denominator,
        "rumsey_id": county.rumsey_id,
        "source_url": source_url,
        "retrieved": retrieved,
        "srs": "EPSG:3857",
        "tile_scheme": "xyz",
        "zoom": {"min": zoom_min, "max": zoom_max},
        "attribution": RUMSEY_ATTRIBUTION,
        "licence_url": RUMSEY_LICENCE_URL,
        "warp": "thin-plate-spline",
        "accuracy": report.as_dict(),
    }


def georeference(
    slug: str, source: pathlib.Path, gcp_path: pathlib.Path, output_dir: pathlib.Path
) -> tuple[pathlib.Path, AccuracyReport]:
    """Warp `source` using the county's GCPs, returning the raster and its accuracy."""
    county = get_county(slug)
    points = load_gcps(gcp_path)
    control, check = split_roles(points)
    if len(control) < 3:
        raise ValueError(
            f"{gcp_path} has {len(control)} control points; need at least 3. "
            f"Capture them in QGIS Georeferencer - see docs/CHURCH_MAPS.md. "
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    translated = output_dir / f"{slug}-gcp.tif"
    subprocess.run(
        ["gdal_translate", "-q", "-a_srs", "EPSG:3857",
         *build_gcp_arguments(control), str(source), str(translated)],
        check=True,
    )

    warped = output_dir / f"{slug}-3857.tif"
    subprocess.run(warp_command(str(translated), str(warped)), check=True)

    errors: list[float] | None = None
    if check:
        stdin = "\n".join(f"{p.pixel_x} {p.pixel_y}" for p in check)
        completed = subprocess.run(
            ["gdaltransform", "-tps", str(translated)],
            input=stdin, capture_output=True, text=True, check=True,
        )
        errors = check_errors(check, parse_gdaltransform_output(completed.stdout))

    return warped, summarise(control, check, errors)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Georeference a Church county sheet.")
    parser.add_argument("slug")
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--gcps", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("build/church"))
    args = parser.parse_args(argv)
    warped, report = georeference(args.slug, args.source, args.gcps, args.output / args.slug)
    print(warped)
    print(json.dumps(report.as_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
