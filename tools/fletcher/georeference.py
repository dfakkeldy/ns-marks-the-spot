"""Fit and score affine, polynomial and TPS warps for one Fletcher sheet."""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

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
) -> list[str]:
    return [
        "gdalwarp",
        "-q",
        "-r",
        "bilinear",
        "-t_srs",
        "EPSG:3857",
        *_method_flags(method),
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
    rasters: dict[str, pathlib.Path] = {}
    failures: dict[str, str] = {}
    for method in METHOD_FLAGS:
        try:
            candidate = score_candidate(method, translated, control, check)
            raster = output_dir / f"{method}-3857.tif"
            subprocess.run(
                build_warp_command(
                    method,
                    str(translated),
                    str(raster),
                    target_resolution_m=target_resolution_m,
                ),
                check=True,
            )
            candidates.append(candidate)
            rasters[method] = raster
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            failures[method] = str(error)

    winner = choose_best_candidate(candidates)
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
    return rasters[winner.method], metadata


def build_tile_command(
    source: pathlib.Path,
    output: pathlib.Path,
    zoom_min: int,
    zoom_max: int,
) -> list[str]:
    return [
        "gdal2tiles.py",
        "--xyz",
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
    args = parser.parse_args(argv)

    raster, metadata = georeference(
        args.source,
        args.points,
        args.output,
        target_resolution_m=args.target_resolution_m,
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
