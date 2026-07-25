"""Select a Sheet 24 transport transform by leave-one-out validation.

This stage deliberately accepts only frozen transport controls. Natural-feature
final checks are scored by a later, separate stage after one transform family
has been selected and refitted.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime
import hashlib
import json
import math
import os
import pathlib
import subprocess
import tempfile
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass

from tools.church.cutline_warp import cutline_geojson
from tools.church.gcps import (
    CONTROL_ROLE,
    GroundControlPoint,
    load_gcps,
    parse_check_csv,
)
from tools.church.georeference import check_errors, parse_gdaltransform_output
from tools.church.residuals import summarise
from tools.fletcher.emit_physical_gcps import emit
from tools.fletcher.fetch import sha256
from tools.fletcher.georeference import (
    build_tile_command,
    build_transform_command,
    build_translate_command,
)
from tools.fletcher.physical_observation import (
    METHOD_VERSION,
    PhysicalObservation,
    SourceDriftError,
    load_observation,
    observation_sha256,
    verify_source,
)
from tools.fletcher.physical_qa import (
    DELIVERABLE_TILE_ROOT,
    StructuralVerdict,
    evaluate_structure,
    validate_visual_review,
    verify_artifact_inventory_files,
)


METHOD_FLAGS = {
    "affine": ("-order", "1"),
    "polynomial2": ("-order", "2"),
    "tps": ("-tps",),
}
METHOD_COMPLEXITY = {"affine": 0, "polynomial2": 1, "tps": 2}
METHODS = ("affine", "polynomial2", "tps")
TERMINAL_STATES = frozenset({
    "source-drift",
    "modern-source-error",
    "insufficient-identity",
    "insufficient-distribution",
    "candidate-failure",
    "transport-cross-validation-fail",
    "structural-fail",
    "natural-check-fail",
    "visual-qa-fail",
    "PASS",
})


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
    loocv_failure: str | None = None
    structural_failure: str | None = None
    residuals: tuple["ResidualEvidence", ...] = ()


@dataclass(frozen=True)
class CandidateSet:
    """Every candidate outcome, including failures that cannot be selected."""

    candidates: tuple[CandidateResult, ...]
    failures: dict[str, str]


@dataclass(frozen=True)
class SelectionResult:
    """Selected family and the complete candidate evidence."""

    selected: CandidateResult | None
    candidates: CandidateSet
    disposition: str = "selection-pass"
    reason: str = "selection completed"
    selection_path: pathlib.Path | None = None


@dataclass(frozen=True)
class FinalCheckResult:
    """Reserved result record for the later natural-feature scoring stage."""

    method: str
    metrics: AccuracyMetrics
    disposition: str = "natural-check-pass"
    output_path: pathlib.Path | None = None


@dataclass(frozen=True)
class ResidualEvidence:
    """One frozen expected/actual correspondence and its ground error."""

    id: str
    expected: tuple[float, float]
    actual: tuple[float, float]
    error_m: float

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "expected": list(self.expected),
            "actual": list(self.actual),
            "error_m": self.error_m,
        }


@dataclass(frozen=True)
class ModernGateVerdict:
    """The combined fixed numerical-gate outcome."""

    passed: bool
    disposition: str
    reason: str


TransformRunner = Callable[..., subprocess.CompletedProcess[str]]


def _json_object(path: pathlib.Path, label: str) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def _write_json_atomic(path: pathlib.Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _write_json_once(path: pathlib.Path, payload: dict[str, object]) -> None:
    """Atomically publish a JSON receipt without ever replacing an existing one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    temporary: pathlib.Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(encoded)
            temporary = pathlib.Path(handle.name)
        try:
            os.link(temporary, path)
        except FileExistsError:
            raise ValueError(
                f"natural-check result already exists and cannot be overwritten: {path}"
            ) from None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _metric_payload(metrics: AccuracyMetrics | None) -> dict[str, object] | None:
    return dataclasses.asdict(metrics) if metrics is not None else None


def _structure_payload(
    structure: StructuralVerdict | None,
) -> dict[str, object] | None:
    return dataclasses.asdict(structure) if structure is not None else None


def _candidate_payload(candidate: CandidateResult) -> dict[str, object]:
    return {
        "method": candidate.method,
        "metrics": _metric_payload(candidate.metrics),
        "failure": candidate.failure,
        "loocv_failure": candidate.loocv_failure,
        "structural_failure": candidate.structural_failure,
        "structure": _structure_payload(candidate.structure),
        "residuals": [residual.as_dict() for residual in candidate.residuals],
    }


def _modern_source_receipts(
    observation: PhysicalObservation,
) -> dict[str, list[dict[str, object]]]:
    return {
        role: [
            {
                "point_id": point.id,
                "feature_type": point.feature_type,
                **dict(point.modern_source),
            }
            for point in sorted(points, key=lambda item: item.id)
        ]
        for role, points in (
            ("transport_controls", observation.controls),
            ("natural_checks", observation.final_checks),
        )
    }


def _terminal_selection(
    *,
    source: pathlib.Path,
    controls_path: pathlib.Path,
    observation_path: pathlib.Path,
    observation: PhysicalObservation,
    observation_hash: str,
    output_dir: pathlib.Path,
    candidates: CandidateSet,
    disposition: str,
    reason: str,
    selected: CandidateResult | None = None,
) -> SelectionResult:
    selection_path = output_dir / "selection.json"
    payload: dict[str, object] = {
        "schema_version": 1,
        "method_version": METHOD_VERSION,
        "sheet_id": observation.sheet_id,
        "source_receipt": dataclasses.asdict(observation.source_receipt),
        "source_path": str(source),
        "observation_path": str(observation_path),
        "observation_sha256": observation_hash,
        "controls_path": str(controls_path),
        "controls_sha256": (
            sha256(controls_path)
            if disposition != "source-drift" and controls_path.is_file()
            else None
        ),
        "control_count": len(observation.controls),
        "accepted_control_count": len(observation.controls),
        "accepted_check_count": len(observation.final_checks),
        "rejected_candidate_count": len(observation.rejected_candidates),
        "modern_source_receipts": _modern_source_receipts(observation),
        "candidate_stage": (
            "not-run"
            if disposition == "source-drift"
            else "failed"
            if disposition == "candidate-failure"
            else "passed"
        ),
        "candidate_failures": candidates.failures,
        "candidates": [_candidate_payload(candidate) for candidate in candidates.candidates],
        "selected_method": selected.method if selected is not None else None,
        "selected_candidate": (
            {
                **(_metric_payload(selected.metrics) or {}),
                "residuals": [
                    residual.as_dict() for residual in selected.residuals
                ],
            }
            if selected is not None
            else None
        ),
        "transport_gate": (
            "FAIL"
            if disposition == "transport-cross-validation-fail"
            else "not-run"
            if selected is None
            else "PASS"
        ),
        "transport_stage": (
            "failed"
            if disposition == "transport-cross-validation-fail"
            else "passed"
            if disposition == "selection-pass"
            else "not-run"
        ),
        "structural_gate": (
            "PASS"
            if selected is not None
            and selected.structure is not None
            and selected.structure.passed
            else "FAIL"
            if disposition == "structural-fail"
            else "not-run"
        ),
        "structural_stage": (
            "failed"
            if disposition == "structural-fail"
            else "passed"
            if selected is not None
            and selected.structure is not None
            and selected.structure.passed
            else "not-run"
        ),
        "structural": (
            _structure_payload(selected.structure) if selected is not None else None
        ),
        "raster_stage": "not-run",
        "natural_stage": "not-run",
        "visual_stage": "not-run",
        "tile_stage": "not-run",
        "disposition": disposition,
        "reason": reason,
    }
    _write_json_atomic(selection_path, payload)
    return SelectionResult(
        selected,
        candidates,
        disposition,
        reason,
        selection_path,
    )


def _accuracy_passes(metrics: AccuracyMetrics, minimum_points: int) -> bool:
    return (
        metrics.point_count >= minimum_points
        and metrics.rms_m <= 400.0
        and metrics.p95_m <= 900.0
        and metrics.max_m <= 1500.0
    )


def _accuracy_metrics_from_mapping(
    value: object,
    *,
    count_key: str,
    label: str,
) -> AccuracyMetrics:
    if not isinstance(value, dict):
        raise ValueError(f"{label} metrics must be an object")
    count = value.get(count_key)
    numbers = tuple(value.get(key) for key in ("rms_m", "p95_m", "max_m"))
    if isinstance(count, bool) or not isinstance(count, int) or count < 0:
        raise ValueError(f"{label} {count_key} must be a non-negative integer")
    if any(
        isinstance(number, bool)
        or not isinstance(number, (int, float))
        or not math.isfinite(float(number))
        or float(number) < 0
        for number in numbers
    ):
        raise ValueError(f"{label} metrics must be finite non-negative numbers")
    return AccuracyMetrics(count, *(float(number) for number in numbers))


def evaluate_final_gates(
    transport: AccuracyMetrics,
    natural: AccuracyMetrics,
) -> ModernGateVerdict:
    """Require both independent measurements to meet the fixed gate."""
    failures: list[str] = []
    if not _accuracy_passes(transport, 10):
        failures.append("transport leave-one-out gate failed")
    if not _accuracy_passes(natural, 6):
        failures.append("untouched natural-feature gate failed")
    if failures:
        return ModernGateVerdict(False, "FAIL", "; ".join(failures))
    return ModernGateVerdict(True, "PASS", "both fixed numerical gates passed")


def _densify_ring(
    frame: Sequence[tuple[float, float]],
    maximum_spacing_px: float,
) -> list[tuple[float, float]]:
    if maximum_spacing_px <= 0:
        raise ValueError("maximum_spacing_px must be positive")
    if len(frame) < 3:
        raise ValueError("usable frame requires at least three vertices")
    dense: list[tuple[float, float]] = []
    normalized = tuple((float(x), float(y)) for x, y in frame)
    for start, end in zip(
        normalized, (*normalized[1:], normalized[0]), strict=True
    ):
        dense.append(start)
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        steps = max(1, math.ceil(length / maximum_spacing_px))
        for step in range(1, steps):
            fraction = step / steps
            dense.append(
                (
                    start[0] + (end[0] - start[0]) * fraction,
                    start[1] + (end[1] - start[1]) * fraction,
                )
            )
    return dense


def project_usable_frame(
    frame: Sequence[tuple[float, float]],
    method: str,
    selected_vrt: pathlib.Path,
    transform_runner: TransformRunner = subprocess.run,
    *,
    maximum_spacing_px: float = 250.0,
) -> list[tuple[float, float]]:
    """Project only the frozen observation frame through the selected refit."""
    dense = _densify_ring(frame, maximum_spacing_px)
    completed = transform_runner(
        build_transform_command(method, str(selected_vrt)),
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


def build_selected_warp_command(
    method: str,
    selected_vrt: pathlib.Path,
    selected_raster: pathlib.Path,
    projected_cutline: pathlib.Path,
    *,
    target_resolution_m: float = 4.0,
) -> list[str]:
    """Build the selected all-control warp with the frozen projected cutline."""
    return [
        "gdalwarp",
        "-q",
        "-r",
        "bilinear",
        "-t_srs",
        "EPSG:3857",
        *METHOD_FLAGS[method],
        "-cutline",
        str(projected_cutline),
        "-crop_to_cutline",
        "-dstalpha",
        "-tr",
        str(target_resolution_m),
        str(target_resolution_m),
        "-co",
        "COMPRESS=DEFLATE",
        "-co",
        "TILED=YES",
        "-co",
        "BIGTIFF=IF_SAFER",
        str(selected_vrt),
        str(selected_raster),
    ]


def _read_raster_size(source: pathlib.Path) -> tuple[int, int]:
    from osgeo import gdal  # type: ignore[import-not-found]

    dataset = gdal.Open(str(source), gdal.GA_ReadOnly)
    if dataset is None:
        raise ValueError(f"GDAL could not open source scan {source}")
    return int(dataset.RasterXSize), int(dataset.RasterYSize)


def select_transform(
    source: pathlib.Path,
    controls_path: pathlib.Path,
    observation_path: pathlib.Path,
    output_dir: pathlib.Path,
) -> SelectionResult:
    """Select once from controls, then freeze and warp the all-control refit."""
    observation = load_observation(observation_path)
    if observation.status != "frozen":
        raise ValueError("select requires a frozen observation")
    observation_hash = observation_sha256(observation_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        verify_source(observation.source_receipt, source, _read_raster_size)
    except SourceDriftError as error:
        return _terminal_selection(
            source=source,
            controls_path=controls_path,
            observation_path=observation_path,
            observation=observation,
            observation_hash=observation_hash,
            output_dir=output_dir,
            candidates=CandidateSet((), {}),
            disposition="source-drift",
            reason=str(error),
        )

    generated = emit(observation)
    if controls_path.read_text(encoding="utf-8") != generated.controls:
        raise ValueError("controls CSV is not the generated frozen observation output")
    controls = load_gcps(controls_path)
    _require_control_only(controls)
    expected = [
        (
            point.id,
            tuple(float(f"{value:.1f}") for value in point.pixel),
            tuple(float(f"{value:.8f}") for value in point.modern_coordinate),
        )
        for point in sorted(observation.controls, key=lambda item: item.id)
    ]
    actual = [
        (
            point.label,
            (point.pixel_x, point.pixel_y),
            (point.lon, point.lat),
        )
        for point in controls
    ]
    if actual != expected:
        raise ValueError("controls CSV identity/coordinates do not match observation")
    if observation.usable_frame is None:
        raise ValueError("frozen observation has no usable frame")

    candidates = evaluate_candidates(
        source,
        controls,
        output_dir / "candidates",
        frame_polygon=observation.usable_frame,
    )
    selectable = [
        candidate
        for candidate in candidates.candidates
        if candidate.metrics is not None
        and candidate.failure is None
        and candidate.structure is not None
        and candidate.structure.passed
    ]
    if not selectable:
        any_numerical = any(
            candidate.metrics is not None for candidate in candidates.candidates
        )
        disposition = "structural-fail" if any_numerical else "candidate-failure"
        reason = (
            "no candidate passed the structural gate"
            if any_numerical
            else "all transform candidates failed"
        )
        return _terminal_selection(
            source=source,
            controls_path=controls_path,
            observation_path=observation_path,
            observation=observation,
            observation_hash=observation_hash,
            output_dir=output_dir,
            candidates=candidates,
            disposition=disposition,
            reason=reason,
        )

    selected = choose_candidate(candidates.candidates)
    assert selected.metrics is not None
    if not _accuracy_passes(selected.metrics, 10):
        return _terminal_selection(
            source=source,
            controls_path=controls_path,
            observation_path=observation_path,
            observation=observation,
            observation_hash=observation_hash,
            output_dir=output_dir,
            candidates=candidates,
            disposition="transport-cross-validation-fail",
            reason="selected transport leave-one-out metrics miss 10/400/900/1500 gate",
            selected=selected,
        )

    selected_vrt = output_dir / "selected-gcps.vrt"
    selected_raster = output_dir / "selected-3857.tif"
    cutline_path = output_dir / "projected-cutline.geojson"
    subprocess.run(
        build_translate_command(str(source), str(selected_vrt), controls),
        check=True,
    )
    projected = project_usable_frame(
        observation.usable_frame,
        selected.method,
        selected_vrt,
    )
    cutline_path.write_text(
        cutline_geojson(projected, 3857) + "\n",
        encoding="utf-8",
    )
    subprocess.run(
        build_selected_warp_command(
            selected.method,
            selected_vrt,
            selected_raster,
            cutline_path,
        ),
        check=True,
    )
    selection_path = output_dir / "selection.json"
    payload: dict[str, object] = {
        "schema_version": 1,
        "method_version": METHOD_VERSION,
        "sheet_id": observation.sheet_id,
        "source_receipt": dataclasses.asdict(observation.source_receipt),
        "source_path": str(source),
        "source_sha256": sha256(source),
        "observation_path": str(observation_path),
        "observation_sha256": observation_hash,
        "controls_path": str(controls_path),
        "controls_sha256": sha256(controls_path),
        "expected_checks_sha256": hashlib.sha256(
            generated.checks.encode("utf-8")
        ).hexdigest(),
        "expected_check_count": len(observation.final_checks),
        "expected_check_ids": [
            point.id
            for point in sorted(observation.final_checks, key=lambda item: item.id)
        ],
        "control_count": len(controls),
        "accepted_control_count": len(observation.controls),
        "accepted_check_count": len(observation.final_checks),
        "rejected_candidate_count": len(observation.rejected_candidates),
        "modern_source_receipts": _modern_source_receipts(observation),
        "candidate_stage": "passed",
        "candidate_failures": candidates.failures,
        "candidates": [_candidate_payload(candidate) for candidate in candidates.candidates],
        "selected_method": selected.method,
        "selected_candidate": {
            **(_metric_payload(selected.metrics) or {}),
            "residuals": [
                residual.as_dict() for residual in selected.residuals
            ],
        },
        "transport_gate": "PASS",
        "transport_stage": "passed",
        "structural_gate": "PASS",
        "structural_stage": "passed",
        "structural": _structure_payload(selected.structure),
        "selected_vrt_path": str(selected_vrt),
        "selected_vrt_sha256": sha256(selected_vrt),
        "projected_cutline_path": str(cutline_path),
        "projected_cutline_sha256": sha256(cutline_path),
        "selected_raster_path": str(selected_raster),
        "selected_raster_sha256": sha256(selected_raster),
        "raster_stage": "generated",
        "natural_stage": "not-run",
        "visual_stage": "not-run",
        "tile_stage": "not-run",
        "disposition": "selection-pass",
        "reason": "selected family passed transport and structural gates",
    }
    _write_json_atomic(selection_path, payload)
    return SelectionResult(
        selected,
        candidates,
        "selection-pass",
        str(payload["reason"]),
        selection_path,
    )


def score_final_checks(
    selection_path: pathlib.Path,
    checks_path: pathlib.Path,
    output_path: pathlib.Path,
) -> FinalCheckResult:
    """Score untouched checks against a frozen selected all-control transform."""
    if output_path.exists():
        raise ValueError(
            f"natural-check result already exists and cannot be overwritten: {output_path}"
        )
    selection = _json_object(selection_path, "selection")
    if selection.get("schema_version") != 1:
        raise ValueError("selection schema_version must be 1")
    if selection.get("method_version") != METHOD_VERSION:
        raise ValueError(f"selection method_version must be {METHOD_VERSION}")
    if (
        selection.get("disposition") != "selection-pass"
        or selection.get("transport_gate") != "PASS"
        or selection.get("structural_gate") != "PASS"
    ):
        raise ValueError("natural scoring requires transport and structural PASS")
    method = selection.get("selected_method")
    if method not in METHODS:
        raise ValueError("selection has no supported frozen selected_method")
    selected_vrt_value = selection.get("selected_vrt_path")
    if not isinstance(selected_vrt_value, str) or not selected_vrt_value:
        raise ValueError("selection has no selected all-control VRT path")
    selected_vrt = pathlib.Path(selected_vrt_value)
    if sha256(selected_vrt) != selection.get("selected_vrt_sha256"):
        raise ValueError("selected all-control VRT SHA-256 does not match selection")

    checks_bytes = checks_path.read_bytes()
    checks_hash = hashlib.sha256(checks_bytes).hexdigest()
    expected_hash = selection.get("expected_checks_sha256")
    expected_count = selection.get("expected_check_count")
    expected_ids = selection.get("expected_check_ids")
    if (
        not isinstance(expected_hash, str)
        or len(expected_hash) != 64
        or checks_hash != expected_hash
        or isinstance(expected_count, bool)
        or not isinstance(expected_count, int)
        or not isinstance(expected_ids, list)
        or any(not isinstance(identifier, str) for identifier in expected_ids)
        or len(expected_ids) != expected_count
        or len(set(expected_ids)) != len(expected_ids)
    ):
        raise ValueError(
            "supplied checks do not match the frozen observation check commitment"
        )
    try:
        checks_text = checks_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("frozen check CSV must be UTF-8") from error
    checks = parse_check_csv(checks_text)
    check_ids = [point.label for point in checks]
    if len(checks) != expected_count or check_ids != expected_ids:
        raise ValueError(
            "supplied checks do not match the frozen observation check IDs/count"
        )
    stdin = "\n".join(f"{point.pixel_x} {point.pixel_y}" for point in checks)
    completed = subprocess.run(
        build_transform_command(str(method), str(selected_vrt)),
        input=stdin,
        capture_output=True,
        text=True,
        check=True,
    )
    transformed = parse_gdaltransform_output(completed.stdout)
    errors = check_errors(checks, transformed)
    residuals = tuple(
        ResidualEvidence(
            point.label,
            point.mercator,
            actual,
            error,
        )
        for point, actual, error in zip(checks, transformed, errors, strict=True)
    )
    report = summarise([], checks, errors)
    if (
        report.check_rms_m is None
        or report.check_p95_m is None
        or report.check_max_m is None
    ):
        raise ValueError("natural scoring produced no residuals")
    metrics = AccuracyMetrics(
        len(checks),
        report.check_rms_m,
        report.check_p95_m,
        report.check_max_m,
    )
    passed = _accuracy_passes(metrics, 6)
    disposition = "natural-check-pass" if passed else "natural-check-fail"
    payload: dict[str, object] = {
        "schema_version": 1,
        "method_version": METHOD_VERSION,
        "observation_sha256": selection["observation_sha256"],
        "selection_sha256": sha256(selection_path),
        "selected_method": method,
        "check_count": len(checks),
        "check_ids": check_ids,
        "checks_path": str(checks_path),
        "checks_sha256": checks_hash,
        "residuals": [residual.as_dict() for residual in residuals],
        "rms_m": metrics.rms_m,
        "p95_m": metrics.p95_m,
        "max_m": metrics.max_m,
        "gate": "PASS" if passed else "FAIL",
        "disposition": disposition,
        "reason": (
            "untouched natural features passed 6/400/900/1500 gate"
            if passed
            else "untouched natural features miss 6/400/900/1500 gate"
        ),
    }
    _write_json_once(output_path, payload)
    return FinalCheckResult(method, metrics, disposition, output_path)


def prefit_failure_result(observation: PhysicalObservation) -> dict:
    """Normalize an observation that was rejected before any fitting."""
    if observation.status != "rejected":
        raise ValueError("observation status must be rejected")
    assert observation.terminal_state is not None
    assert observation.terminal_reason is not None
    return {
        "schema_version": 1,
        "method_version": observation.method_version,
        "sheet_id": observation.sheet_id,
        "source_receipt": dataclasses.asdict(observation.source_receipt),
        "observation_sha256": None,
        "accepted_control_count": len(observation.controls),
        "accepted_check_count": len(observation.final_checks),
        "rejected_candidate_count": len(observation.rejected_candidates),
        "modern_source_receipts": _modern_source_receipts(observation),
        "candidate_stage": "not-run",
        "candidate_failures": {},
        "candidates": [],
        "transport_stage": "not-run",
        "transport_metrics": None,
        "structural_stage": "not-run",
        "structural": None,
        "natural_stage": "not-run",
        "natural_metrics": None,
        "visual_stage": "not-run",
        "visual_qa": None,
        "raster_stage": "not-run",
        "selected_raster_path": None,
        "selected_raster_sha256": None,
        "tile_stage": "not-run",
        "tile_png_count": 0,
        "disposition": observation.terminal_state,
        "reason": observation.terminal_reason,
    }


def _validate_selected_raster(result: dict[str, object]) -> pathlib.Path:
    value = result.get("selected_raster_path")
    if not isinstance(value, str) or not value:
        raise ValueError("result has no selected raster path")
    raster = pathlib.Path(value)
    recorded_hash = result.get("selected_raster_sha256")
    if not isinstance(recorded_hash, str) or sha256(raster) != recorded_hash:
        raise ValueError("selected raster SHA-256 does not match")
    return raster


def _validate_selection_pass_evidence(selection: dict[str, object]) -> None:
    if (
        selection.get("transport_gate") != "PASS"
        or selection.get("transport_stage") != "passed"
    ):
        raise ValueError("selection-pass requires transport stage PASS")
    if (
        selection.get("structural_gate") != "PASS"
        or selection.get("structural_stage") != "passed"
    ):
        raise ValueError("selection-pass requires structural stage PASS")
    structural = selection.get("structural")
    if (
        not isinstance(structural, dict)
        or structural.get("passed") is not True
        or structural.get("reason") != "PASS"
    ):
        raise ValueError("selection-pass requires complete structural evidence")
    sample_grid = structural.get("sample_grid")
    metrics = structural.get("metrics")
    if sample_grid not in ([21, 21], (21, 21)) or not isinstance(metrics, dict):
        raise ValueError("selection-pass requires complete structural evidence")
    integer_fields = (
        "sample_count",
        "cell_count",
        "mesh_components",
        "overlapping_cell_pairs",
    )
    numeric_fields = (
        "determinant_min",
        "determinant_max",
        "anisotropy_max",
        "area_scale_min",
        "area_scale_median",
        "area_scale_max",
    )
    if any(
        isinstance(metrics.get(field), bool)
        or not isinstance(metrics.get(field), int)
        for field in integer_fields
    ) or any(
        isinstance(metrics.get(field), bool)
        or not isinstance(metrics.get(field), (int, float))
        or not math.isfinite(float(metrics[field]))
        for field in numeric_fields
    ):
        raise ValueError("selection-pass requires complete structural evidence")
    if (
        metrics["sample_count"] <= 0
        or metrics["cell_count"] <= 0
        or metrics["determinant_min"] <= 0
        or metrics["anisotropy_max"] > 4.0
        or metrics["area_scale_min"] <= 0
        or metrics["area_scale_median"] <= 0
        or metrics["area_scale_max"] <= 0
        or metrics["mesh_components"] != 1
        or metrics["overlapping_cell_pairs"] != 0
        or metrics["determinant_max"] < metrics["determinant_min"]
        or not (
            metrics["area_scale_min"]
            <= metrics["area_scale_median"]
            <= metrics["area_scale_max"]
        )
    ):
        raise ValueError("selection-pass structural evidence is internally unsafe")
    if selection.get("selected_method") not in METHODS:
        raise ValueError("selection-pass requires a supported selected method")
    transport = _accuracy_metrics_from_mapping(
        selection.get("selected_candidate"),
        count_key="point_count",
        label="transport",
    )
    selected_candidate = selection["selected_candidate"]
    assert isinstance(selected_candidate, dict)
    residuals = selected_candidate.get("residuals")
    if (
        not _accuracy_passes(transport, 10)
        or not isinstance(residuals, list)
        or len(residuals) != transport.point_count
        or any(
            not isinstance(residual, dict)
            or not isinstance(residual.get("id"), str)
            for residual in residuals
        )
        or len({residual["id"] for residual in residuals}) != len(residuals)
    ):
        raise ValueError("selection-pass transport evidence is incomplete")


def finalize_result(
    selection_path: pathlib.Path,
    final_check_path: pathlib.Path | None,
    visual_review_path: pathlib.Path | None,
) -> dict:
    """Preserve the reached terminal state and require each later bound receipt."""
    selection = _json_object(selection_path, "selection")
    if selection.get("schema_version") != 1:
        raise ValueError("selection schema_version must be 1")
    if selection.get("method_version") != METHOD_VERSION:
        raise ValueError(f"selection method_version must be {METHOD_VERSION}")
    observation_hash = selection.get("observation_sha256")
    if not isinstance(observation_hash, str) or len(observation_hash) != 64:
        raise ValueError("selection observation_sha256 is required")

    result = dict(selection)
    result["selection_path"] = str(selection_path)
    result["selection_sha256"] = sha256(selection_path)
    disposition = selection.get("disposition")
    early_failures = {
        "source-drift",
        "modern-source-error",
        "insufficient-identity",
        "insufficient-distribution",
        "candidate-failure",
        "transport-cross-validation-fail",
        "structural-fail",
    }
    if disposition in early_failures:
        if final_check_path is not None or visual_review_path is not None:
            raise ValueError(
                f"{disposition} must not supply downstream natural or visual evidence"
            )
        result.update({
            "natural_stage": "not-run",
            "natural_metrics": None,
            "visual_stage": "not-run",
            "visual_qa": None,
            "tile_stage": "not-run",
            "tile_png_count": 0,
            "disposition": disposition,
        })
        result.pop("tile_path", None)
        return result
    if disposition != "selection-pass":
        raise ValueError(f"unsupported selection disposition {disposition!r}")
    _validate_selection_pass_evidence(selection)
    if final_check_path is None:
        raise ValueError("selection PASS requires natural-check evidence")
    transport = _accuracy_metrics_from_mapping(
        selection.get("selected_candidate"),
        count_key="point_count",
        label="transport",
    )
    if not _accuracy_passes(transport, 10):
        raise ValueError("selection PASS has transport metrics outside fixed gate")

    natural = _json_object(final_check_path, "natural checks")
    if natural.get("schema_version") != 1:
        raise ValueError("natural checks schema_version must be 1")
    if natural.get("method_version") != METHOD_VERSION:
        raise ValueError(f"natural checks method_version must be {METHOD_VERSION}")
    if natural.get("selection_sha256") != result["selection_sha256"]:
        raise ValueError("natural checks selection SHA-256 does not match")
    if natural.get("observation_sha256") != observation_hash:
        raise ValueError("natural checks observation SHA-256 does not match")
    if natural.get("selected_method") != selection.get("selected_method"):
        raise ValueError("natural checks selected method does not match")
    expected_check_hash = selection.get("expected_checks_sha256")
    expected_check_count = selection.get("expected_check_count")
    expected_check_ids = selection.get("expected_check_ids")
    if (
        not isinstance(expected_check_hash, str)
        or len(expected_check_hash) != 64
        or isinstance(expected_check_count, bool)
        or not isinstance(expected_check_count, int)
        or expected_check_count < 6
        or not isinstance(expected_check_ids, list)
        or any(not isinstance(identifier, str) for identifier in expected_check_ids)
        or len(expected_check_ids) != expected_check_count
        or len(set(expected_check_ids)) != len(expected_check_ids)
    ):
        raise ValueError("selection check commitment is incomplete")
    if (
        natural.get("check_count") != expected_check_count
        or natural.get("check_ids") != expected_check_ids
    ):
        raise ValueError("natural check IDs/count do not match selection commitment")
    if natural.get("checks_sha256") != expected_check_hash:
        raise ValueError("natural check-file SHA-256 does not match selection commitment")
    checks_path_value = natural.get("checks_path")
    if not isinstance(checks_path_value, str) or not checks_path_value:
        raise ValueError("natural checks receipt has no check-file path")
    recorded_checks_path = pathlib.Path(checks_path_value)
    if not recorded_checks_path.is_file():
        raise ValueError("natural checks receipt check-file is missing")
    if sha256(recorded_checks_path) != expected_check_hash:
        raise ValueError("natural check-file actual SHA-256 does not match")
    residuals = natural.get("residuals")
    if (
        not isinstance(residuals, list)
        or len(residuals) != expected_check_count
        or [residual.get("id") for residual in residuals if isinstance(residual, dict)]
        != expected_check_ids
        or any(
            not isinstance(residual, dict)
            or any(
                not isinstance(residual.get(endpoint), list)
                or len(residual[endpoint]) != 2
                or any(
                    isinstance(coordinate, bool)
                    or not isinstance(coordinate, (int, float))
                    or not math.isfinite(float(coordinate))
                    for coordinate in residual[endpoint]
                )
                for endpoint in ("expected", "actual")
            )
            or isinstance(residual.get("error_m"), bool)
            or not isinstance(residual.get("error_m"), (int, float))
            or not math.isfinite(float(residual["error_m"]))
            or float(residual["error_m"]) < 0
            for residual in residuals
        )
    ):
        raise ValueError("natural residual IDs/count do not match frozen checks")
    natural_gate = natural.get("gate")
    if natural_gate not in {"PASS", "FAIL"}:
        raise ValueError("natural checks gate must be PASS or FAIL")
    natural_metrics = _accuracy_metrics_from_mapping(
        natural,
        count_key="check_count",
        label="natural",
    )
    expected_natural_gate = (
        "PASS" if _accuracy_passes(natural_metrics, 6) else "FAIL"
    )
    if natural_gate != expected_natural_gate:
        raise ValueError("natural checks gate does not match fixed metrics")
    expected_natural_disposition = (
        "natural-check-pass" if natural_gate == "PASS" else "natural-check-fail"
    )
    if natural.get("disposition") != expected_natural_disposition:
        raise ValueError("natural checks disposition does not match gate")
    result.update({
        "natural_checks_path": str(final_check_path),
        "natural_checks_sha256": sha256(final_check_path),
        "natural_stage": "passed" if natural_gate == "PASS" else "failed",
        "natural_metrics": _metric_payload(natural_metrics),
    })
    if natural_gate == "FAIL":
        if visual_review_path is not None:
            raise ValueError(
                "natural-check-fail must not supply downstream visual evidence"
            )
        result.update({
            "visual_stage": "not-run",
            "visual_qa": None,
            "tile_stage": "not-run",
            "tile_png_count": 0,
            "disposition": "natural-check-fail",
            "reason": natural.get("reason", "untouched natural-feature gate failed"),
        })
        result.pop("tile_path", None)
        return result
    if visual_review_path is None:
        raise ValueError("both numerical gates PASS requires visual review")

    visual_text = visual_review_path.read_text(encoding="utf-8")
    natural_checks_hash = sha256(final_check_path)
    selected_raster = _validate_selected_raster(result)
    selected_raster_hash = sha256(selected_raster)
    visual = validate_visual_review(
        visual_text,
        observation_hash,
        expected_selection_sha256=str(result["selection_sha256"]),
        expected_natural_checks_sha256=natural_checks_hash,
        expected_selected_raster_sha256=selected_raster_hash,
    )
    visual_payload = json.loads(visual_text)
    assert isinstance(visual_payload, dict)
    inventory_path = visual.artifact_inventory_path
    expected_inventory_path = (
        visual.artifact_inventory.artifact_root / "artifact-inventory.json"
    ).resolve(strict=False)
    if inventory_path.resolve(strict=False) != expected_inventory_path:
        raise ValueError(
            "visual review artifact inventory path does not match artifact root"
        )
    if not inventory_path.is_file():
        raise ValueError("visual review artifact inventory is missing")
    if sha256(inventory_path) != visual.artifact_inventory_sha256:
        raise ValueError("visual review artifact inventory SHA-256 does not match")
    inventory_payload = _json_object(inventory_path, "artifact inventory")
    if inventory_payload != visual_payload.get("artifact_inventory"):
        raise ValueError(
            "visual review embedded artifact inventory does not match inventory file"
        )
    verify_artifact_inventory_files(visual.artifact_inventory)
    result.update({
        "artifact_inventory_sha256": visual.artifact_inventory_sha256,
        "visual_review_path": str(visual_review_path),
        "visual_review_sha256": sha256(visual_review_path),
        "visual_stage": "passed" if visual.gate == "PASS" else "failed",
        "visual_qa": visual_payload,
        "tile_png_count": 0,
    })
    if visual.gate == "FAIL":
        result.update({
            "tile_stage": "not-run",
            "disposition": "visual-qa-fail",
            "reason": "hash-bound visual QA failed",
        })
        result.pop("tile_path", None)
    else:
        result.update({
            "tile_stage": "not-generated",
            "tile_path": str(DELIVERABLE_TILE_ROOT),
            "disposition": "PASS",
            "reason": "numerical, structural, artifact, and visual gates passed",
        })
    return result


def tile_if_pass(
    result_path: pathlib.Path,
    raster_path: pathlib.Path,
    tiles_path: pathlib.Path,
    zoom_min: int = 8,
    zoom_max: int = 16,
) -> dict:
    """Refuse tile generation until the exact final PASS contract is present."""
    result = json.loads(result_path.read_text(encoding="utf-8"))
    if not isinstance(result, dict):
        raise ValueError("result must contain a JSON object")
    if result.get("disposition") != "PASS":
        raise ValueError("tiling requires an exact final PASS")
    if (zoom_min, zoom_max) != (8, 16):
        raise ValueError("deliverable tiling requires zooms 8 through 16")
    visual = result.get("visual_qa")
    if not isinstance(visual, dict) or visual.get("gate") != "PASS":
        raise ValueError("tiling requires visual PASS")
    recorded_raster = _validate_selected_raster(result)
    if recorded_raster.resolve(strict=False) != raster_path.resolve(strict=False):
        raise ValueError("raster path does not match final PASS result")
    subprocess.run(
        build_tile_command(raster_path, tiles_path, zoom_min, zoom_max),
        check=True,
    )
    count = sum(1 for path in tiles_path.rglob("*.png") if path.is_file())
    result.update({
        "tile_stage": "tiled",
        "tile_png_count": count,
        "tile_path": str(tiles_path),
        "tile_completed_at": datetime.datetime.now(
            datetime.timezone.utc
        ).isoformat().replace("+00:00", "Z"),
    })
    _write_json_atomic(result_path, result)
    return result


def build_parser() -> argparse.ArgumentParser:
    """Build the staged physical-georeference command line."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    subparsers = parser.add_subparsers(dest="command", required=True)

    select = subparsers.add_parser("select")
    select.add_argument("--source", type=pathlib.Path, required=True)
    select.add_argument("--controls", type=pathlib.Path, required=True)
    select.add_argument("--observation", type=pathlib.Path, required=True)
    select.add_argument("--output", type=pathlib.Path, required=True)

    score = subparsers.add_parser("score")
    score.add_argument("--selection", type=pathlib.Path, required=True)
    score.add_argument("--checks", type=pathlib.Path, required=True)
    score.add_argument("--output", type=pathlib.Path, required=True)

    finalize = subparsers.add_parser("finalize")
    finalize.add_argument("--selection", type=pathlib.Path, required=True)
    finalize.add_argument("--natural-checks", type=pathlib.Path)
    finalize.add_argument("--visual-review", type=pathlib.Path)
    finalize.add_argument("--output", type=pathlib.Path, required=True)

    tile = subparsers.add_parser("tile")
    tile.add_argument("--result", type=pathlib.Path, required=True)
    tile.add_argument("--raster", type=pathlib.Path, required=True)
    tile.add_argument("--tiles", type=pathlib.Path, required=True)
    tile.add_argument("--zoom-min", type=int, default=8)
    tile.add_argument("--zoom-max", type=int, default=16)

    prefit = subparsers.add_parser("prefit-failure")
    prefit.add_argument("--observation", type=pathlib.Path, required=True)
    prefit.add_argument("--output", type=pathlib.Path, required=True)
    return parser


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
    if method not in METHOD_FLAGS:
        return CandidateResult(
            method,
            None,
            f"unknown transform {method!r}",
            None,
        )
    try:
        _require_control_only(controls)
    except ValueError as error:
        return CandidateResult(method, None, str(error), None)
    if not controls:
        return CandidateResult(
            method,
            None,
            "at least one control is required for leave-one-out scoring",
            None,
        )
    if frame_polygon is None:
        return CandidateResult(
            method,
            None,
            "exact usable frame is required for structural evaluation",
            None,
        )
    structure_frame = tuple((float(x), float(y)) for x, y in frame_polygon)

    metrics: AccuracyMetrics | None = None
    loocv_failure: str | None = None
    residuals: list[ResidualEvidence] = []
    try:
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
            fold_errors = check_errors([held], transformed)
            errors.extend(fold_errors)
            if len(transformed) != 1 or len(fold_errors) != 1:
                raise ValueError("leave-one-out fold produced invalid residual evidence")
            residuals.append(
                ResidualEvidence(
                    held.label,
                    held.mercator,
                    transformed[0],
                    fold_errors[0],
                )
            )

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
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        loocv_failure = str(error)

    structure: StructuralVerdict | None = None
    structural_failure: str | None = None
    try:
        structural_vrt = output_dir / method / "structural" / "gcps.vrt"
        structural_vrt.parent.mkdir(parents=True, exist_ok=True)
        transform_runner(
            build_translate_command(str(source), str(structural_vrt), list(controls)),
            check=True,
        )
        structure = evaluate_structure(
            _structural_transform(method, structural_vrt, transform_runner),
            structure_frame,
            [(point.pixel_x, point.pixel_y) for point in controls],
        )
        if not structure.passed:
            structural_failure = structure.reason
    except (OSError, subprocess.CalledProcessError, ValueError) as error:
        structural_failure = str(error)

    failures = tuple(
        failure
        for failure in (
            f"leave-one-out: {loocv_failure}" if loocv_failure else None,
            f"structural: {structural_failure}" if structural_failure else None,
        )
        if failure is not None
    )
    return CandidateResult(
        method,
        metrics,
        "; ".join(failures) if failures else None,
        structure,
        loocv_failure,
        structural_failure,
        tuple(residuals),
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
        transformed = parse_gdaltransform_output(completed.stdout)
        if len(transformed) != 1:
            raise ValueError(
                f"{method} structural transform returned {len(transformed)} points"
            )
        return transformed[0]

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


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "select":
        result = select_transform(
            args.source,
            args.controls,
            args.observation,
            args.output,
        )
        print(result.selection_path)
    elif args.command == "score":
        result = score_final_checks(
            args.selection,
            args.checks,
            args.output,
        )
        print(result.output_path)
    elif args.command == "finalize":
        payload = finalize_result(
            args.selection,
            args.natural_checks,
            args.visual_review,
        )
        _write_json_atomic(args.output, payload)
        print(args.output)
    elif args.command == "tile":
        tile_if_pass(
            args.result,
            args.raster,
            args.tiles,
            args.zoom_min,
            args.zoom_max,
        )
        print(args.result)
    elif args.command == "prefit-failure":
        observation = load_observation(args.observation)
        payload = prefit_failure_result(observation)
        payload["observation_sha256"] = observation_sha256(args.observation)
        _write_json_atomic(args.output, payload)
        print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
