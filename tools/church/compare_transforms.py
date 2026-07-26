"""Compare Church-map transform models against one frozen held-out check set.

This command builds only the small GCP-bearing VRT. It does not materialize a
warped county raster; the winning transform is passed to ``georeference`` after
the comparison. That keeps model selection fast while preserving the exact
GDAL transformer and ground-metre residual calculation used in production.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess

from tools.church.cutline_warp import TRANSFORMS, transform_arguments
from tools.church.gcps import combine_control_and_checks, load_check_points, load_gcps
from tools.church.georeference import (
    build_translate_command,
    check_errors,
    parse_gdaltransform_output,
)
from tools.church.panels import get_panel
from tools.church.residuals import AccuracyReport, summarise

GATES = {"rms": 400.0, "p95": 900.0, "max": 1500.0}
"""Fixed county acceptance gates in ground metres."""


def passes_gates(report: AccuracyReport) -> bool:
    """Whether a model has complete held-out evidence inside every fixed gate."""
    return (
        report.check_count > 0
        and report.check_rms_m is not None
        and report.check_p95_m is not None
        and report.check_max_m is not None
        and report.check_rms_m <= GATES["rms"]
        and report.check_p95_m <= GATES["p95"]
        and report.check_max_m <= GATES["max"]
    )


def comparison_result(transform: str, report: AccuracyReport) -> dict:
    """JSON-ready result for one transform."""
    return {
        "transform": transform,
        "passes": passes_gates(report),
        "gates_m": GATES,
        "accuracy": report.as_dict(),
    }


def select_simplest(results: list[dict]) -> str | None:
    """Select the first passing result in affine, polynomial2, TPS order."""
    by_transform = {result["transform"]: result for result in results}
    for transform in TRANSFORMS:
        result = by_transform.get(transform)
        if result is not None and result["passes"]:
            return transform
    return None


def transform_check_points(
    translated: pathlib.Path,
    check,
    transform: str,
) -> list[tuple[float, float]]:
    """Project held-out pixels through one GDAL GCP transformer."""
    stdin = "\n".join(f"{point.pixel_x} {point.pixel_y}" for point in check)
    completed = subprocess.run(
        ["gdaltransform", *transform_arguments(transform), str(translated)],
        input=stdin,
        capture_output=True,
        text=True,
        check=True,
    )
    return parse_gdaltransform_output(completed.stdout)


def compare(
    slug: str,
    source: pathlib.Path,
    gcp_path: pathlib.Path,
    check_path: pathlib.Path,
    output_dir: pathlib.Path,
    panel_slug: str | None = None,
) -> dict:
    """Evaluate all supported models against the same control and check points."""
    panel = get_panel(slug, panel_slug) if panel_slug else None
    full_control, full_check = combine_control_and_checks(
        load_gcps(gcp_path),
        load_check_points(check_path),
    )
    if panel is not None:
        control = [panel.window.to_local_point(point) for point in full_control]
        check = [panel.window.to_local_point(point) for point in full_check]
    else:
        control, check = full_control, full_check

    output_dir.mkdir(parents=True, exist_ok=True)
    output_slug = f"{slug}-{panel.slug}" if panel else slug
    translated = output_dir / f"{output_slug}-comparison-gcp.vrt"
    subprocess.run(
        build_translate_command(
            str(source),
            str(translated),
            full_control,
            panel.window if panel else None,
        ),
        check=True,
    )

    results = []
    for transform in TRANSFORMS:
        transformed = transform_check_points(translated, check, transform)
        report = summarise(control, check, check_errors(check, transformed))
        results.append(comparison_result(transform, report))

    return {
        "county": slug,
        "panel": panel_slug,
        "source": str(source),
        "control_path": str(gcp_path),
        "check_path": str(check_path),
        "model_order": list(TRANSFORMS),
        "models": results,
        "selected_transform": select_simplest(results),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compare affine, polynomial2, and TPS on frozen Church checks."
    )
    parser.add_argument("slug")
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--gcps", type=pathlib.Path, required=True)
    parser.add_argument("--checks", type=pathlib.Path, required=True)
    parser.add_argument("--panel")
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--report", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    result = compare(
        args.slug,
        args.source,
        args.gcps,
        args.checks,
        args.output,
        args.panel,
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
