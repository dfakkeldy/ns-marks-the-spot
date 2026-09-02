"""Fit and score affine, polynomial and TPS warps for one Fletcher sheet."""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import subprocess
import sys
from collections.abc import Sequence

from tools.church.gcps import (
    CONTROL_ROLE,
    GroundControlPoint,
    load_gcps,
    split_roles,
)
from tools.church.georeference import check_errors, parse_gdaltransform_output
from tools.church.residuals import summarise
from tools.fletcher.pipeline import (
    AccuracyGate,
    CandidateAccuracy,
    choose_best_candidate,
)

METHOD_FLAGS = {
    "tps": ("-tps",),
    "affine": ("-order", "1"),
    "polynomial2": ("-order", "2"),
}


def _method_flags(method: str) -> list[str]:
    try:
        return list(METHOD_FLAGS[method])
    except KeyError:
        raise ValueError(f"unknown transform {method!r}") from None


def build_translate_command(
    source: str,
    output: str,
    points: list[GroundControlPoint],
) -> list[str]:
    command = [
        "gdal_translate",
        "-q",
        "-of",
        "VRT",
        "-a_srs",
        "EPSG:3857",
    ]
    for point in points:
        if point.role != CONTROL_ROLE:
            continue
        world_x, world_y = point.mercator
        command += [
            "-gcp",
            str(point.pixel_x),
            str(point.pixel_y),
            str(world_x),
            str(world_y),
        ]
    return [*command, source, output]


def build_transform_command(method: str, translated: str) -> list[str]:
    return ["gdaltransform", *_method_flags(method), translated]


def build_warp_command(
    method: str,
    translated: str,
    output: str,
    *,
    target_resolution_m: float = 4.0,
    cutline: str | None = None,
) -> list[str]:
    mask = ["-cutline", cutline, "-crop_to_cutline"] if cutline else []
    return [
        "gdalwarp",
        "-q",
        "-r",
        "bilinear",
        "-t_srs",
        "EPSG:3857",
        *_method_flags(method),
        *mask,
        "-tr",
        str(target_resolution_m),
        str(target_resolution_m),
        "-dstalpha",
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        "-co",
        "BIGTIFF=IF_SAFER",
        translated,
        output,
    ]


def densify_ring(
    frame: Sequence[tuple[float, float]],
    maximum_spacing_px: float = 250.0,
) -> list[tuple[float, float]]:
    """Subdivide a pixel-space ring so no edge exceeds the spacing.

    A thin-plate spline bends straight lines, so transforming only the four
    corners of a neat line would cut a straight chord across a curved edge and
    shave off real map content. Densify first, transform every vertex.
    """
    if maximum_spacing_px <= 0:
        raise ValueError("maximum_spacing_px must be positive")
    if len(frame) < 3:
        raise ValueError("a cutline frame requires at least three vertices")
    ring = [(float(x), float(y)) for x, y in frame]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    dense: list[tuple[float, float]] = []
    for (x0, y0), (x1, y1) in zip(ring[:-1], ring[1:], strict=True):
        dense.append((x0, y0))
        span = math.hypot(x1 - x0, y1 - y0)
        steps = int(span // maximum_spacing_px)
        for step in range(1, steps + 1):
            t = step * maximum_spacing_px / span
            if t >= 1.0:
                break
            dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    dense.append(ring[-1])
    return dense


def project_cutline(
    frame: Sequence[tuple[float, float]],
    method: str,
    translated: pathlib.Path,
    *,
    maximum_spacing_px: float = 250.0,
) -> list[tuple[float, float]]:
    """Push a pixel-space neat line through the same transform as the imagery."""
    dense = densify_ring(frame, maximum_spacing_px)
    completed = subprocess.run(
        build_transform_command(method, str(translated)),
        input="\n".join(f"{x} {y}" for x, y in dense),
        capture_output=True,
        text=True,
        check=True,
    )
    projected = parse_gdaltransform_output(completed.stdout)
    if len(projected) != len(dense):
        raise ValueError(
            f"cutline transform returned {len(projected)} of {len(dense)} vertices"
        )
    return projected


def cutline_feature_collection(ring: Sequence[tuple[float, float]]) -> str:
    """Serialise a projected ring as an EPSG:3857 polygon for gdalwarp."""
    closed = list(ring)
    if closed[0] != closed[-1]:
        closed.append(closed[0])
    return json.dumps({
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:EPSG::3857"},
        },
        "features": [{
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[x, y] for x, y in closed]],
            },
        }],
    })


def score_candidate(
    method: str,
    translated: pathlib.Path,
    control: list[GroundControlPoint],
    check: list[GroundControlPoint],
) -> CandidateAccuracy:
    stdin = "\n".join(f"{point.pixel_x} {point.pixel_y}" for point in check)
    completed = subprocess.run(
        build_transform_command(method, str(translated)),
        input=stdin,
        capture_output=True,
        text=True,
        check=True,
    )
    errors = check_errors(check, parse_gdaltransform_output(completed.stdout))
    report = summarise(control, check, errors)
    return CandidateAccuracy(
        method=method,
        control_count=report.control_count,
        check_count=report.check_count,
        rms_m=report.check_rms_m,
        p95_m=report.check_p95_m,
        max_m=report.check_max_m,
    )


def georeference(
    source: pathlib.Path,
    points_path: pathlib.Path,
    output_dir: pathlib.Path,
    *,
    target_resolution_m: float = 4.0,
    cutline_frame: Sequence[tuple[float, float]] | None = None,
) -> tuple[pathlib.Path, dict]:
    points = load_gcps(points_path)
    control, check = split_roles(points)
    if len(control) < 6:
        raise ValueError(
            f"{points_path} has {len(control)} control points; "
            "six are required to compare a second-order polynomial"
        )
    if not check:
        raise ValueError(f"{points_path} has no held-out check points")

    output_dir.mkdir(parents=True, exist_ok=True)
    translated = output_dir / "gcps.vrt"
    subprocess.run(
        build_translate_command(str(source), str(translated), points),
        check=True,
    )

    candidates: list[CandidateAccuracy] = []
    failures: dict[str, str] = {}
    for method in METHOD_FLAGS:
        try:
            candidate = score_candidate(method, translated, control, check)
            candidates.append(candidate)
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            failures[method] = str(error)

    winner = choose_best_candidate(candidates)
    # The mask is applied only after the winner is chosen and scored: accuracy
    # is always measured on the unmasked fit, so cropping can never flatter it.
    cutline_path: pathlib.Path | None = None
    if cutline_frame is not None:
        cutline_path = output_dir / "cutline-3857.geojson"
        cutline_path.write_text(
            cutline_feature_collection(
                project_cutline(cutline_frame, winner.method, translated)
            )
            + "\n",
            encoding="utf-8",
        )
    suffix = "-cutline" if cutline_path else ""
    raster = output_dir / f"{winner.method}{suffix}-3857.tif"
    subprocess.run(
        build_warp_command(
            winner.method,
            str(translated),
            str(raster),
            target_resolution_m=target_resolution_m,
            cutline=str(cutline_path) if cutline_path else None,
        ),
        check=True,
    )
    verdict = AccuracyGate().evaluate(
        control_count=winner.control_count,
        check_count=winner.check_count,
        rms_m=winner.rms_m,
        p95_m=winner.p95_m,
        max_m=winner.max_m,
    )
    metadata = {
        "selected_method": winner.method,
        "control_count": winner.control_count,
        "check_count": winner.check_count,
        "check_rms_m": winner.rms_m,
        "check_p95_m": winner.p95_m,
        "check_max_m": winner.max_m,
        "gate": "PASS" if verdict.passed else "FAIL",
        "reason": verdict.reason,
        "candidates": [candidate.__dict__ for candidate in candidates],
        "candidate_failures": failures,
    }
    (output_dir / "accuracy.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    return raster, metadata


def build_tile_command(
    source: pathlib.Path,
    output: pathlib.Path,
    zoom_min: int,
    zoom_max: int,
) -> list[str]:
    return [
        sys.executable,
        "-m",
        "osgeo_utils.gdal2tiles",
        "--xyz",
        "--resume",
        f"--zoom={zoom_min}-{zoom_max}",
        "--resampling=bilinear",
        str(source),
        str(output),
    ]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--points", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--target-resolution-m", type=float, default=4.0)
    parser.add_argument("--tiles", type=pathlib.Path)
    parser.add_argument("--zoom-min", type=int, default=8)
    parser.add_argument("--zoom-max", type=int, default=16)
    parser.add_argument(
        "--cutline-frame",
        type=pathlib.Path,
        help="frame JSON carrying frame_px, the neat line in source pixels; "
             "without it the warp keeps the sheet collar as before",
    )
    args = parser.parse_args(argv)

    frame = None
    if args.cutline_frame is not None:
        payload = json.loads(args.cutline_frame.read_text(encoding="utf-8"))
        frame = [(float(x), float(y)) for x, y in payload["frame_px"]]

    raster, metadata = georeference(
        args.source,
        args.points,
        args.output,
        target_resolution_m=args.target_resolution_m,
        cutline_frame=frame,
    )
    if args.tiles is not None:
        subprocess.run(
            build_tile_command(
                raster,
                args.tiles,
                args.zoom_min,
                args.zoom_max,
            ),
            check=True,
        )
    print(json.dumps({"raster": str(raster), **metadata}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
