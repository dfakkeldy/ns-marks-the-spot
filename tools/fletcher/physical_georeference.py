"""Select a Sheet 24 transport transform by leave-one-out validation.

This stage deliberately accepts only frozen transport controls. Natural-feature
final checks are scored by a later, separate stage after one transform family
has been selected and refitted.
"""

from __future__ import annotations

import pathlib
import subprocess
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass

from tools.church.gcps import CONTROL_ROLE, GroundControlPoint
from tools.church.georeference import check_errors, parse_gdaltransform_output
from tools.church.residuals import summarise
from tools.fletcher.georeference import build_transform_command, build_translate_command
from tools.fletcher.physical_qa import StructuralVerdict, evaluate_structure


METHOD_FLAGS = {
    "affine": ("-order", "1"),
    "polynomial2": ("-order", "2"),
    "tps": ("-tps",),
}
METHOD_COMPLEXITY = {"affine": 0, "polynomial2": 1, "tps": 2}
METHODS = ("affine", "polynomial2", "tps")


@dataclass(frozen=True)
class AccuracyMetrics:
    """Leave-one-out error summary in ground metres."""

    point_count: int
    rms_m: float
    p95_m: float
    max_m: float


@dataclass(frozen=True)
class CandidateResult:
    """One transform family's leave-one-out outcome."""

    method: str
    metrics: AccuracyMetrics | None
    failure: str | None
    structure: StructuralVerdict | None = None


@dataclass(frozen=True)
class CandidateSet:
    """Every candidate outcome, including failures that cannot be selected."""

    candidates: tuple[CandidateResult, ...]
    failures: dict[str, str]


@dataclass(frozen=True)
class SelectionResult:
    """Selected family and the complete candidate evidence."""

    selected: CandidateResult
    candidates: CandidateSet


@dataclass(frozen=True)
class FinalCheckResult:
    """Reserved result record for the later natural-feature scoring stage."""

    method: str
    metrics: AccuracyMetrics


TransformRunner = Callable[..., subprocess.CompletedProcess[str]]


def loocv_folds(
    points: Sequence[GroundControlPoint],
) -> Iterator[tuple[GroundControlPoint, list[GroundControlPoint]]]:
    """Yield each transport control once with that point excluded from its fit."""
    for index, held in enumerate(points):
        yield held, [point for offset, point in enumerate(points) if offset != index]


def candidate_rank(candidate: CandidateResult) -> tuple[float, float, float, int]:
    """Return the fixed, deterministic transform ranking key."""
    metrics = candidate.metrics
    if (
        metrics is None
        or candidate.failure is not None
        or candidate.structure is None
        or not candidate.structure.passed
    ):
        raise ValueError(f"candidate {candidate.method!r} has no selectable metrics")
    return (
        metrics.rms_m,
        metrics.p95_m,
        metrics.max_m,
        METHOD_COMPLEXITY[candidate.method],
    )


def _require_control_only(controls: Sequence[GroundControlPoint]) -> None:
    intruders = [point.label for point in controls if point.role != CONTROL_ROLE]
    if intruders:
        raise ValueError(
            "transport transform selection accepts only control rows; found "
            + ", ".join(repr(label) for label in intruders)
        )


def evaluate_candidate(
    method: str,
    source: pathlib.Path,
    controls: Sequence[GroundControlPoint],
    output_dir: pathlib.Path,
    transform_runner: TransformRunner,
    *,
    frame_polygon: Sequence[tuple[float, float]] | None = None,
) -> CandidateResult:
    """Score one family with N leave-one-out transport-control folds.

    A failed GDAL invocation, invalid output, or invalid point set is retained
    as a candidate failure so later families still run.
    """
    try:
        if method not in METHOD_FLAGS:
            raise ValueError(f"unknown transform {method!r}")
        _require_control_only(controls)
        if not controls:
            raise ValueError(
                "at least one control is required for leave-one-out scoring"
            )

        errors: list[float] = []
        for held, training in loocv_folds(controls):
            translated = output_dir / method / f"fold-{held.label}" / "gcps.vrt"
            translated.parent.mkdir(parents=True, exist_ok=True)
            transform_runner(
                build_translate_command(str(source), str(translated), training),
                check=True,
            )
            completed = transform_runner(
                build_transform_command(method, str(translated)),
                input=f"{held.pixel_x} {held.pixel_y}",
                capture_output=True,
                text=True,
                check=True,
            )
            transformed = parse_gdaltransform_output(completed.stdout)
            errors.extend(check_errors([held], transformed))

        report = summarise(list(controls), list(controls), errors)
        if (
            report.check_rms_m is None
            or report.check_p95_m is None
            or report.check_max_m is None
        ):
            raise ValueError("leave-one-out scoring produced no residuals")
        metrics = AccuracyMetrics(
            len(errors), report.check_rms_m, report.check_p95_m, report.check_max_m
        )
        structural_vrt = output_dir / method / "structural" / "gcps.vrt"
        structural_vrt.parent.mkdir(parents=True, exist_ok=True)
        transform_runner(
            build_translate_command(str(source), str(structural_vrt), list(controls)),
            check=True,
        )
        structure_frame = (
            tuple((float(x), float(y)) for x, y in frame_polygon)
            if frame_polygon is not None
            else _control_frame(controls)
        )
        structure = evaluate_structure(
            _structural_transform(method, structural_vrt, transform_runner),
            structure_frame,
            [(point.pixel_x, point.pixel_y) for point in controls],
        )
        return CandidateResult(method, metrics, None, structure)
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        return CandidateResult(method, None, str(error), None)


def _control_frame(
    controls: Sequence[GroundControlPoint],
) -> tuple[tuple[float, float], ...]:
    minimum_x = min(point.pixel_x for point in controls)
    maximum_x = max(point.pixel_x for point in controls)
    minimum_y = min(point.pixel_y for point in controls)
    maximum_y = max(point.pixel_y for point in controls)
    if minimum_x == maximum_x or minimum_y == maximum_y:
        raise ValueError("controls do not span a two-dimensional structural frame")
    return (
        (minimum_x, minimum_y),
        (maximum_x, minimum_y),
        (maximum_x, maximum_y),
        (minimum_x, maximum_y),
    )


def _structural_transform(
    method: str,
    translated: pathlib.Path,
    transform_runner: TransformRunner,
) -> Callable[[float, float], tuple[float, float]]:
    """Build a scalar structural transform without eager GDAL imports."""
    if transform_runner is subprocess.run:
        from osgeo import gdal  # type: ignore[import-not-found]

        source = gdal.Open(str(translated), gdal.GA_ReadOnly)
        if source is None:
            raise ValueError(f"GDAL could not open structural VRT {translated}")
        options = (
            ["METHOD=GCP_TPS"]
            if method == "tps"
            else [
                "METHOD=GCP_POLYNOMIAL",
                f"MAX_GCP_ORDER={1 if method == 'affine' else 2}",
            ]
        )
        transformer = gdal.Transformer(source, None, options)
        if transformer is None:
            raise ValueError(f"GDAL could not create {method} structural transformer")

        def project(x: float, y: float) -> tuple[float, float]:
            success, transformed = transformer.TransformPoint(False, x, y)
            if not success:
                raise ValueError(f"{method} structural transform failed at ({x}, {y})")
            return float(transformed[0]), float(transformed[1])

        # Retain the source and transformer in this closure for its full lifetime.
        project._gdal_references = (source, transformer)  # type: ignore[attr-defined]
        return project

    def project_with_runner(x: float, y: float) -> tuple[float, float]:
        completed = transform_runner(
            build_transform_command(method, str(translated)),
            input=f"{x} {y}",
            capture_output=True,
            text=True,
            check=True,
        )
        return parse_gdaltransform_output(completed.stdout)[0]

    return project_with_runner


def evaluate_candidates(
    source: pathlib.Path,
    controls: Sequence[GroundControlPoint],
    output_dir: pathlib.Path,
    *,
    frame_polygon: Sequence[tuple[float, float]] | None = None,
) -> CandidateSet:
    """Evaluate every permitted transform in fixed complexity order."""
    candidates: list[CandidateResult] = []
    failures: dict[str, str] = {}
    for method in METHODS:
        try:
            candidate = evaluate_candidate(
                method,
                source,
                controls,
                output_dir,
                subprocess.run,
                frame_polygon=frame_polygon,
            )
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            candidate = CandidateResult(method, None, str(error), None)
        candidates.append(candidate)
        if candidate.failure is not None:
            failures[method] = candidate.failure
        elif candidate.structure is None:
            failures[method] = "structural verdict is missing"
        elif not candidate.structure.passed:
            failures[method] = candidate.structure.reason
    return CandidateSet(tuple(candidates), failures)


def choose_candidate(candidates: Sequence[CandidateResult]) -> CandidateResult:
    """Choose the best successful candidate without retrying another family."""
    valid = [
        candidate
        for candidate in candidates
        if candidate.failure is None
        and candidate.metrics is not None
        and candidate.structure is not None
        and candidate.structure.passed
    ]
    if not valid:
        raise ValueError(
            "cannot select a transform without successful leave-one-out metrics"
        )
    return min(valid, key=candidate_rank)
