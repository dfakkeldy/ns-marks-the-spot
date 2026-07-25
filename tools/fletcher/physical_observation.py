"""Validate Sheet 24 physical-feature observations before georeferencing.

This module deliberately contains no GIS binding.  In particular, GDAL is
loaded only by the command-line source-size reader so importing this contract
cannot mutate a GIS host or require an installed GDAL runtime.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType

from tools.fletcher.fetch import sha256


SCHEMA_VERSION = 1
METHOD_VERSION = "modern-feature-v1"
SHEET_ID = "24"
RUMSEY_ID = "RUMSEY~8~1~2649~290017"
LIST_NUMBER = "3997.026"
SOURCE_WIDTH = 10782
SOURCE_HEIGHT = 7655
SOURCE_SHA256 = "735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8"
TRANSPORTATION_SERVICE_URL = (
    "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
    "BASE_NSTDB_10k_Roads_UT83/MapServer"
)
WATER_SERVICE_URL = (
    "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
    "BASE_NSTDB_10k_Water_WM84/MapServer"
)
TRANSPORTATION_LAYER_IDS = frozenset({"5", "6", "7", "8"})
WATER_LAYER_IDS = frozenset({"1", "4", "8"})

TRANSPORT_TYPES = frozenset({
    "road-road-intersection",
    "road-rail-crossing",
    "rail-rail-junction",
})
NATURAL_TYPES = frozenset({
    "river-confluence",
    "lake-outlet",
    "island-centroid",
    "headland",
    "coastline-junction",
})
REJECTION_REASONS = frozenset({
    "ambiguous-identity",
    "apparent-realignment",
    "generalized-drawing",
    "clipped-feature",
    "insufficient-topology",
    "source-error",
    "duplicate",
})
TERMINAL_STATES = frozenset({
    "source-drift",
    "modern-source-error",
    "insufficient-identity",
    "insufficient-distribution",
})
SUPPORTED_ZONES = frozenset({"coastal", "interior"})


class SourceDriftError(ValueError):
    """The fixed Sheet 24 source receipt does not match the inspected source."""


@dataclass(frozen=True)
class SourceReceipt:
    rumsey_id: str
    list_number: str
    width: int
    height: int
    sha256: str


@dataclass(frozen=True)
class AcceptedPoint:
    id: str
    feature_type: str
    pixel: tuple[float, float]
    modern_coordinate: tuple[float, float]
    historical_description: str
    modern_description: str
    identity_rationale: str
    uncertainty: str
    acceptance: str
    modern_source: Mapping[str, object]
    complex_id: str | None = None
    area_id: str | None = None
    zone: str | None = None
    derivation: str | None = None


@dataclass(frozen=True)
class RejectedCandidate:
    id: str
    reason: str
    pixel: tuple[float, float] | None = None
    description: str | None = None
    proposed_identity: str | None = None


@dataclass(frozen=True)
class PhysicalObservation:
    schema_version: int
    method_version: str
    sheet_id: str
    source_receipt: SourceReceipt
    status: str
    usable_frame: tuple[tuple[float, float], ...] | None
    controls: tuple[AcceptedPoint, ...]
    final_checks: tuple[AcceptedPoint, ...]
    rejected_candidates: tuple[RejectedCandidate, ...]
    terminal_state: str | None = None
    terminal_reason: str | None = None


@dataclass(frozen=True)
class SourceVerification:
    receipt: SourceReceipt
    source: pathlib.Path
    actual_width: int
    actual_height: int
    actual_sha256: str


def _mapping(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ValueError(f"{label} must be an object")
    return value


def _list(value: object, label: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be an array")
    return value


def _string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{label} must be finite")
    return result


def _positive_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _pixel(value: object, label: str) -> tuple[float, float]:
    fields = _mapping(value, label)
    return (_number(fields.get("x"), f"{label}.x"), _number(fields.get("y"), f"{label}.y"))


def _coordinate(value: object, label: str) -> tuple[float, float]:
    fields = _mapping(value, label)
    return (
        _number(fields.get("lon"), f"{label}.lon"),
        _number(fields.get("lat"), f"{label}.lat"),
    )


def _ring_coordinate(value: object, label: str) -> tuple[float, float]:
    if isinstance(value, Mapping):
        if "x" in value or "y" in value:
            return _pixel(value, label)
        return _coordinate(value, label)
    if (
        isinstance(value, Sequence)
        and not isinstance(value, (str, bytes))
        and len(value) == 2
    ):
        return (_number(value[0], f"{label}[0]"), _number(value[1], f"{label}[1]"))
    raise ValueError(f"{label} must be a coordinate")


def _normalise_ring(
    value: object,
    label: str,
    *,
    minimum_vertices: int,
) -> tuple[tuple[float, float], ...]:
    values = _list(value, label)
    ring = tuple(_ring_coordinate(point, f"{label}[{index}]") for index, point in enumerate(values))
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) < minimum_vertices or len(set(ring)) < minimum_vertices:
        raise ValueError(f"{label} needs at least {minimum_vertices} distinct vertices")
    _validate_simple_ring(ring, label)
    return ring


def _cross(
    first: tuple[float, float],
    second: tuple[float, float],
    third: tuple[float, float],
) -> float:
    return (
        (second[0] - first[0]) * (third[1] - first[1])
        - (second[1] - first[1]) * (third[0] - first[0])
    )


def _on_segment(
    first: tuple[float, float],
    second: tuple[float, float],
    point: tuple[float, float],
) -> bool:
    epsilon = 1e-12
    return (
        abs(_cross(first, second, point)) <= epsilon
        and min(first[0], second[0]) - epsilon <= point[0] <= max(first[0], second[0]) + epsilon
        and min(first[1], second[1]) - epsilon <= point[1] <= max(first[1], second[1]) + epsilon
    )


def _segments_intersect(
    first: tuple[float, float],
    second: tuple[float, float],
    third: tuple[float, float],
    fourth: tuple[float, float],
) -> bool:
    one = _cross(first, second, third)
    two = _cross(first, second, fourth)
    three = _cross(third, fourth, first)
    four = _cross(third, fourth, second)
    if ((one > 0 and two < 0) or (one < 0 and two > 0)) and (
        (three > 0 and four < 0) or (three < 0 and four > 0)
    ):
        return True
    return (
        _on_segment(first, second, third)
        or _on_segment(first, second, fourth)
        or _on_segment(third, fourth, first)
        or _on_segment(third, fourth, second)
    )


def _signed_area(ring: Sequence[tuple[float, float]]) -> float:
    return sum(
        first[0] * second[1] - second[0] * first[1]
        for first, second in zip(ring, (*ring[1:], ring[0]), strict=True)
    ) / 2.0


def _validate_simple_ring(ring: Sequence[tuple[float, float]], label: str) -> None:
    length = len(ring)
    for first_index in range(length):
        second_index = (first_index + 1) % length
        for third_index in range(first_index + 1, length):
            fourth_index = (third_index + 1) % length
            if first_index in (third_index, fourth_index) or second_index in (third_index, fourth_index):
                continue
            if _segments_intersect(
                ring[first_index], ring[second_index], ring[third_index], ring[fourth_index]
            ):
                raise ValueError(f"{label} is self-intersecting")
    if abs(_signed_area(ring)) <= 1e-12:
        raise ValueError(f"{label} has zero area")


def polygon_centroid(ring: Sequence[tuple[float, float]]) -> tuple[float, float]:
    """Return a simple polygon's centroid using the fixed shoelace rule."""
    points = tuple((float(point[0]), float(point[1])) for point in ring)
    if len(points) > 1 and points[0] == points[-1]:
        points = points[:-1]
    if len(points) < 3 or len(set(points)) < 3:
        raise ValueError("polygon needs at least three distinct vertices")
    _validate_simple_ring(points, "polygon")
    # Translate before applying the shoelace sums so valid geographic
    # coordinates do not lose meaningful precision through cancellation.
    origin = points[0]
    translated = tuple((point[0] - origin[0], point[1] - origin[1]) for point in points)
    twice_area = 2.0 * _signed_area(translated)
    x_total = 0.0
    y_total = 0.0
    for first, second in zip(
        translated, (*translated[1:], translated[0]), strict=True
    ):
        cross = first[0] * second[1] - second[0] * first[1]
        x_total += (first[0] + second[0]) * cross
        y_total += (first[1] + second[1]) * cross
    return (
        origin[0] + x_total / (3.0 * twice_area),
        origin[1] + y_total / (3.0 * twice_area),
    )


def _inside_or_on_boundary(
    point: tuple[float, float], ring: Sequence[tuple[float, float]]
) -> bool:
    if any(_on_segment(first, second, point) for first, second in zip(ring, (*ring[1:], ring[0]), strict=True)):
        return True
    inside = False
    x, y = point
    for first, second in zip(ring, (*ring[1:], ring[0]), strict=True):
        if (first[1] > y) != (second[1] > y):
            crossing_x = (second[0] - first[0]) * (y - first[1]) / (second[1] - first[1]) + first[0]
            if x < crossing_x:
                inside = not inside
    return inside


def _source_receipt(value: object) -> SourceReceipt:
    fields = _mapping(value, "source_receipt")
    receipt = SourceReceipt(
        rumsey_id=_string(fields.get("rumsey_id"), "source_receipt.rumsey_id"),
        list_number=_string(fields.get("list_number"), "source_receipt.list_number"),
        width=_positive_int(fields.get("width"), "source_receipt.width"),
        height=_positive_int(fields.get("height"), "source_receipt.height"),
        sha256=_string(fields.get("sha256"), "source_receipt.sha256"),
    )
    _assert_expected_receipt(receipt)
    return receipt


def _assert_expected_receipt(receipt: SourceReceipt) -> None:
    expected = (RUMSEY_ID, LIST_NUMBER, SOURCE_WIDTH, SOURCE_HEIGHT, SOURCE_SHA256)
    actual = (
        receipt.rumsey_id,
        receipt.list_number,
        receipt.width,
        receipt.height,
        receipt.sha256,
    )
    if actual != expected:
        raise SourceDriftError(
            "source-drift: expected "
            f"{RUMSEY_ID} {SOURCE_WIDTH}x{SOURCE_HEIGHT} {SOURCE_SHA256}; "
            f"got receipt {receipt.rumsey_id} {receipt.width}x{receipt.height} {receipt.sha256}"
        )


def _modern_source(value: object, label: str, role: str) -> Mapping[str, object]:
    fields = _mapping(value, label)
    required = (
        "service_url",
        "layer_id",
        "object_ids",
        "source_spatial_reference",
        "normalized_spatial_reference",
        "retrieved_at",
        "local_extract_path",
        "extract_sha256",
    )
    for field in required:
        if field not in fields:
            raise ValueError(f"{label}.{field} is required")
    object_ids = _list(fields["object_ids"], f"{label}.object_ids")
    if not object_ids:
        raise ValueError(f"{label}.object_ids must not be empty")
    normalized = _string(
        fields["normalized_spatial_reference"], f"{label}.normalized_spatial_reference"
    )
    if normalized != "EPSG:4326":
        raise ValueError(f"{label}.normalized_spatial_reference must be EPSG:4326")
    service_url = _string(fields["service_url"], f"{label}.service_url")
    layer_id = _string(fields["layer_id"], f"{label}.layer_id")
    expected_service, permitted_layers, source_name = (
        (TRANSPORTATION_SERVICE_URL, TRANSPORTATION_LAYER_IDS, "NSTDB Transportation")
        if role == "controls"
        else (WATER_SERVICE_URL, WATER_LAYER_IDS, "NSTDB Water")
    )
    if service_url != expected_service or layer_id not in permitted_layers:
        raise ValueError(
            f"{role} modern_source requires the official {source_name} service "
            "and a permitted relevant layer"
        )
    return MappingProxyType({
        "service_url": service_url,
        "layer_id": layer_id,
        "object_ids": tuple(sorted({str(item) for item in object_ids})),
        "source_spatial_reference": _string(
            fields["source_spatial_reference"], f"{label}.source_spatial_reference"
        ),
        "normalized_spatial_reference": normalized,
        "retrieved_at": _string(fields["retrieved_at"], f"{label}.retrieved_at"),
        "local_extract_path": _string(
            fields["local_extract_path"], f"{label}.local_extract_path"
        ),
        "extract_sha256": _string(fields["extract_sha256"], f"{label}.extract_sha256"),
    })


def _accepted_point(value: object, role: str, index: int) -> AcceptedPoint:
    fields = _mapping(value, f"{role}[{index}]")
    required = (
        "id",
        "feature_type",
        "pixel",
        "modern_coordinate",
        "historical_description",
        "modern_description",
        "identity_rationale",
        "uncertainty",
        "acceptance",
        "modern_source",
    )
    for field in required:
        if field not in fields:
            raise ValueError(f"{role}[{index}].{field} is required")
    feature_type = _string(fields["feature_type"], f"{role}[{index}].feature_type")
    expected_types = TRANSPORT_TYPES if role == "controls" else NATURAL_TYPES
    if feature_type not in expected_types:
        raise ValueError(f"{role} role requires an eligible {role[:-1]} feature")
    acceptance = _string(fields["acceptance"], f"{role}[{index}].acceptance")
    if acceptance != "accepted-pre-fit":
        raise ValueError(f"{role}[{index}].acceptance must be accepted-pre-fit")
    point = AcceptedPoint(
        id=_string(fields["id"], f"{role}[{index}].id"),
        feature_type=feature_type,
        pixel=_pixel(fields["pixel"], f"{role}[{index}].pixel"),
        modern_coordinate=_coordinate(
            fields["modern_coordinate"], f"{role}[{index}].modern_coordinate"
        ),
        historical_description=_string(
            fields["historical_description"], f"{role}[{index}].historical_description"
        ),
        modern_description=_string(
            fields["modern_description"], f"{role}[{index}].modern_description"
        ),
        identity_rationale=_string(
            fields["identity_rationale"], f"{role}[{index}].identity_rationale"
        ),
        uncertainty=_string(fields["uncertainty"], f"{role}[{index}].uncertainty"),
        acceptance=acceptance,
        modern_source=_modern_source(
            fields["modern_source"], f"{role}[{index}].modern_source", role
        ),
        complex_id=None,
        area_id=None,
        zone=None,
        derivation=None,
    )
    if role == "controls":
        complex_id = _string(fields.get("complex_id"), f"{role}[{index}].complex_id")
        return AcceptedPoint(**{**point.__dict__, "complex_id": complex_id})

    area_id = _string(fields.get("area_id"), f"{role}[{index}].area_id")
    zone = _string(fields.get("zone"), f"{role}[{index}].zone")
    if zone not in SUPPORTED_ZONES:
        raise ValueError(f"{role}[{index}].zone must be coastal or interior")
    derivation = _string(fields.get("derivation"), f"{role}[{index}].derivation")
    if derivation == "polygon-centroid":
        derivation_ring = _normalise_ring(
            fields.get("derivation_ring"),
            f"{role}[{index}].derivation_ring",
            minimum_vertices=3,
        )
        centroid = polygon_centroid(derivation_ring)
        if tuple(round(value, 8) for value in centroid) != tuple(
            round(value, 8) for value in point.modern_coordinate
        ):
            raise ValueError(f"{role}[{index}].modern_coordinate must match polygon centroid")
    return AcceptedPoint(**{
        **point.__dict__,
        "area_id": area_id,
        "zone": zone,
        "derivation": derivation,
    })


def _rejected_candidate(value: object, index: int) -> RejectedCandidate:
    fields = _mapping(value, f"rejected_candidates[{index}]")
    reason = fields.get("reason")
    if reason not in REJECTION_REASONS:
        raise ValueError("rejected candidate requires a fixed rejection reason")
    return RejectedCandidate(
        id=_string(fields.get("id"), f"rejected_candidates[{index}].id"),
        reason=reason,
        pixel=(
            _pixel(fields["pixel"], f"rejected_candidates[{index}].pixel")
            if "pixel" in fields
            else None
        ),
        description=(
            _string(fields["description"], f"rejected_candidates[{index}].description")
            if "description" in fields
            else None
        ),
        proposed_identity=(
            _string(
                fields["proposed_identity"],
                f"rejected_candidates[{index}].proposed_identity",
            )
            if "proposed_identity" in fields
            else None
        ),
    )


def _pixel_key(pixel: tuple[float, float]) -> tuple[float, float]:
    return (round(pixel[0], 3), round(pixel[1], 3))


def _world_key(coordinate: tuple[float, float]) -> tuple[float, float]:
    return (round(coordinate[0], 8), round(coordinate[1], 8))


def _require_unique(points: Sequence[AcceptedPoint]) -> None:
    ids = [point.id for point in points]
    pixels = [_pixel_key(point.pixel) for point in points]
    coordinates = [_world_key(point.modern_coordinate) for point in points]
    for label, values in (("id", ids), ("pixel", pixels), ("modern coordinate", coordinates)):
        if len(values) != len(set(values)):
            raise ValueError(f"duplicate {label} across accepted roles")


def _validate_frame_containment(
    frame: Sequence[tuple[float, float]],
    controls: Sequence[AcceptedPoint],
    final_checks: Sequence[AcceptedPoint],
    rejected: Sequence[RejectedCandidate],
) -> None:
    for point in (*controls, *final_checks):
        if not _inside_or_on_boundary(point.pixel, frame):
            raise ValueError(f"accepted point {point.id} lies outside usable_frame")
    for candidate in rejected:
        if candidate.pixel is not None and not _inside_or_on_boundary(candidate.pixel, frame):
            raise ValueError(f"rejected candidate {candidate.id} lies outside usable_frame")


def _validate_rejected_evidence(candidates: Sequence[RejectedCandidate]) -> None:
    for candidate in candidates:
        if candidate.pixel is None:
            raise ValueError("rejected candidate requires a measured pixel")
        if not (candidate.proposed_identity or candidate.description):
            raise ValueError(
                "rejected candidate requires a proposed identity or description"
            )


def _validate_frozen_distribution(
    frame: Sequence[tuple[float, float]],
    controls: Sequence[AcceptedPoint],
    final_checks: Sequence[AcceptedPoint],
) -> None:
    if len(controls) < 10:
        raise ValueError("frozen observation requires at least 10 transport controls")
    if len(final_checks) < 6:
        raise ValueError("frozen observation requires at least 6 natural final checks")
    min_x = min(point[0] for point in frame)
    max_x = max(point[0] for point in frame)
    min_y = min(point[1] for point in frame)
    max_y = max(point[1] for point in frame)
    x_span = max(point.pixel[0] for point in controls) - min(point.pixel[0] for point in controls)
    y_span = max(point.pixel[1] for point in controls) - min(point.pixel[1] for point in controls)
    if x_span < 0.70 * (max_x - min_x) or y_span < 0.70 * (max_y - min_y):
        raise ValueError("transport controls must span at least 70% of usable-frame x and y")
    midpoint = ((min_x + max_x) / 2.0, (min_y + max_y) / 2.0)
    quadrants = {
        (point.pixel[0] < midpoint[0], point.pixel[1] < midpoint[1])
        for point in controls
        if point.pixel[0] != midpoint[0] and point.pixel[1] != midpoint[1]
    }
    if quadrants != {(True, True), (True, False), (False, True), (False, False)}:
        raise ValueError("transport controls must cover all usable-frame quadrants")
    complex_ids = [point.complex_id for point in controls]
    if len(complex_ids) != len(set(complex_ids)):
        raise ValueError("duplicate transport junction complex")
    areas = {point.area_id for point in final_checks}
    if len(areas) < 3:
        raise ValueError("final checks require three separated areas")
    if len({point.feature_type for point in final_checks}) < 2:
        raise ValueError("final checks require at least two natural feature classes")
    zones = {point.zone for point in final_checks}
    if zones != SUPPORTED_ZONES:
        raise ValueError("final checks require both supported coastal and interior zones")
    derivations = {
        (
            str(point.modern_source["service_url"]),
            str(point.modern_source["layer_id"]),
            tuple(point.modern_source["object_ids"]),
            point.derivation,
        )
        for point in final_checks
    }
    if len(derivations) != len(final_checks):
        raise ValueError("duplicate natural derivation")


def parse_observation(text: str) -> PhysicalObservation:
    """Parse and validate the fixed Sheet 24 physical-observation contract."""
    payload = _mapping(json.loads(text), "observation")
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"schema_version must be {SCHEMA_VERSION}")
    if payload.get("method_version") != METHOD_VERSION:
        raise ValueError(f"method_version must be {METHOD_VERSION}")
    if payload.get("sheet_id") != SHEET_ID:
        raise ValueError("physical observations are restricted to Sheet 24")
    receipt = _source_receipt(payload.get("source_receipt"))
    status = payload.get("status")
    if status not in {"frozen", "rejected"}:
        raise ValueError("status must be frozen or rejected")

    controls = tuple(
        _accepted_point(value, "controls", index)
        for index, value in enumerate(_list(payload.get("controls"), "controls"))
    )
    final_checks = tuple(
        _accepted_point(value, "final_checks", index)
        for index, value in enumerate(_list(payload.get("final_checks"), "final_checks"))
    )
    rejected = tuple(
        _rejected_candidate(value, index)
        for index, value in enumerate(_list(payload.get("rejected_candidates", []), "rejected_candidates"))
    )
    _require_unique((*controls, *final_checks))
    if status == "frozen" or controls or final_checks or rejected:
        _validate_rejected_evidence(rejected)

    measured_pixels = bool(controls or final_checks or any(item.pixel is not None for item in rejected))
    frame_value = payload.get("usable_frame")
    if status == "frozen" or measured_pixels:
        frame = _normalise_ring(frame_value, "usable_frame", minimum_vertices=4)
        _validate_frame_containment(frame, controls, final_checks, rejected)
    elif frame_value is None:
        frame = None
    else:
        frame = _normalise_ring(frame_value, "usable_frame", minimum_vertices=4)

    terminal_state: str | None = None
    terminal_reason: str | None = None
    if status == "frozen":
        assert frame is not None
        _validate_frozen_distribution(frame, controls, final_checks)
    else:
        terminal_state = payload.get("terminal_state")
        if terminal_state not in TERMINAL_STATES:
            raise ValueError("rejected observation requires a supported terminal_state")
        terminal_reason = _string(payload.get("terminal_reason"), "terminal_reason")
        if payload.get("emitted") or payload.get("fitted"):
            raise ValueError("rejected observations may not be emitted or fitted")

    return PhysicalObservation(
        schema_version=SCHEMA_VERSION,
        method_version=METHOD_VERSION,
        sheet_id=SHEET_ID,
        source_receipt=receipt,
        status=status,
        usable_frame=frame,
        controls=controls,
        final_checks=final_checks,
        rejected_candidates=rejected,
        terminal_state=terminal_state,
        terminal_reason=terminal_reason,
    )


def load_observation(path: pathlib.Path) -> PhysicalObservation:
    return parse_observation(path.read_text(encoding="utf-8"))


def observation_sha256(path: pathlib.Path) -> str:
    return sha256(path)


def verify_source(
    receipt: SourceReceipt,
    source: pathlib.Path,
    read_size: Callable[[pathlib.Path], tuple[int, int]],
) -> SourceVerification:
    """Verify the exact source identity, raster dimensions, and content hash."""
    _assert_expected_receipt(receipt)
    actual_width, actual_height = read_size(source)
    actual_sha256 = sha256(source)
    if (actual_width, actual_height, actual_sha256) != (
        receipt.width,
        receipt.height,
        receipt.sha256,
    ):
        raise SourceDriftError(
            "source-drift: expected "
            f"{receipt.rumsey_id} {receipt.width}x{receipt.height} {receipt.sha256}; "
            f"got {actual_width}x{actual_height} {actual_sha256}"
        )
    return SourceVerification(
        receipt=receipt,
        source=source,
        actual_width=actual_width,
        actual_height=actual_height,
        actual_sha256=actual_sha256,
    )


def _manifest_dimension(fields: Mapping[str, object], source_key: str, fallback_key: str) -> int:
    if source_key in fields:
        return _positive_int(fields[source_key], f"manifest.{source_key}")
    return _positive_int(fields.get(fallback_key), f"manifest.{fallback_key}")


def verify_manifest_source(
    manifest_path: pathlib.Path,
    sheet_id: str,
    source: pathlib.Path,
    read_size: Callable[[pathlib.Path], tuple[int, int]],
) -> SourceVerification:
    """Verify Sheet 24's manifest receipt and the supplied raster file."""
    if sheet_id != SHEET_ID:
        raise SourceDriftError("source-drift: physical observations are restricted to Sheet 24")
    try:
        manifest = _mapping(json.loads(manifest_path.read_text(encoding="utf-8")), "manifest")
        sheets = _mapping(manifest.get("sheets"), "manifest.sheets")
        fields = _mapping(sheets.get(SHEET_ID), "manifest.sheets.24")
        declared_path = _string(fields.get("source_path"), "manifest.sheets.24.source_path")
        declared = pathlib.Path(declared_path)
        if not declared.is_absolute():
            declared = manifest_path.parent / declared
        if declared.resolve() != source.resolve():
            raise SourceDriftError(
                f"source-drift: manifest source path {declared} does not match {source}"
            )
        receipt = SourceReceipt(
            rumsey_id=_string(fields.get("rumsey_id"), "manifest.sheets.24.rumsey_id"),
            list_number=_string(fields.get("list_number"), "manifest.sheets.24.list_number"),
            width=_manifest_dimension(fields, "source_width", "width"),
            height=_manifest_dimension(fields, "source_height", "height"),
            sha256=_string(fields.get("source_sha256"), "manifest.sheets.24.source_sha256"),
        )
    except SourceDriftError:
        raise
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SourceDriftError(f"source-drift: invalid Sheet 24 manifest receipt: {error}") from error
    return verify_source(receipt, source, read_size)


def _gdal_read_size(source: pathlib.Path) -> tuple[int, int]:
    """Read raster dimensions only when the verification CLI is invoked."""
    from osgeo import gdal

    dataset = gdal.Open(str(source))
    if dataset is None:
        raise ValueError(f"could not open {source}")
    return (dataset.RasterXSize, dataset.RasterYSize)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    verify_parser = commands.add_parser("verify-source")
    verify_parser.add_argument("--manifest", type=pathlib.Path, required=True)
    verify_parser.add_argument("--sheet", required=True)
    verify_parser.add_argument("--source", type=pathlib.Path, required=True)
    validate_parser = commands.add_parser("validate")
    validate_parser.add_argument("observation", type=pathlib.Path)
    validate_parser.add_argument("--require-rejected", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "verify-source":
            verified = verify_manifest_source(
                args.manifest, args.sheet, args.source, _gdal_read_size
            )
            print(json.dumps({
                "sheet": SHEET_ID,
                "source": str(verified.source),
                "width": verified.actual_width,
                "height": verified.actual_height,
                "sha256": verified.actual_sha256,
            }, sort_keys=True))
        else:
            observation = load_observation(args.observation)
            if args.require_rejected and not observation.rejected_candidates:
                raise ValueError("observation requires at least one rejected candidate")
            print(json.dumps({
                "sheet": observation.sheet_id,
                "status": observation.status,
                "controls": len(observation.controls),
                "final_checks": len(observation.final_checks),
                "rejected_candidates": len(observation.rejected_candidates),
                "sha256": observation_sha256(args.observation),
            }, sort_keys=True))
    except (OSError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
