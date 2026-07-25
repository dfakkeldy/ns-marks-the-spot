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
    if metrics is None or candidate.failure is not None:
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
            raise ValueError("at least one control is required for leave-one-out scoring")

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
        return CandidateResult(
            method,
            AccuracyMetrics(
                len(errors), report.check_rms_m, report.check_p95_m, report.check_max_m
            ),
            None,
        )
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        return CandidateResult(method, None, str(error))


def evaluate_candidates(
    source: pathlib.Path,
    controls: Sequence[GroundControlPoint],
    output_dir: pathlib.Path,
) -> CandidateSet:
    """Evaluate every permitted transform in fixed complexity order."""
    candidates: list[CandidateResult] = []
    failures: dict[str, str] = {}
    for method in METHODS:
        try:
            candidate = evaluate_candidate(method, source, controls, output_dir, subprocess.run)
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            candidate = CandidateResult(method, None, str(error))
        candidates.append(candidate)
        if candidate.failure is not None:
            failures[method] = candidate.failure
    return CandidateSet(tuple(candidates), failures)


def choose_candidate(candidates: Sequence[CandidateResult]) -> CandidateResult:
    """Choose the best successful candidate without retrying another family."""
    valid = [
        candidate
        for candidate in candidates
        if candidate.failure is None and candidate.metrics is not None
    ]
    if not valid:
        raise ValueError("cannot select a transform without successful leave-one-out metrics")
    return min(valid, key=candidate_rank)
