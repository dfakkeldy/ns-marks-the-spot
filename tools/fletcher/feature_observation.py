"""Feature-led v2 observation records: load, validate, and expose GCP roles.

The observation JSON is the intellectual asset of the workflow — identity
decisions, provenance, and review notes. Rasters and crops stay on compute.
"""
from __future__ import annotations

import json
import pathlib
import re

from tools.church.gcps import CHECK_ROLE, CONTROL_ROLE, GroundControlPoint

SCHEMA_VERSION = 2
METHOD_VERSION = "feature-led-v2"
ACCEPTED = "accepted"
NEEDS_RE_REVIEW = "needs-re-review"
REJECTED = "rejected"
_STATUSES = frozenset({ACCEPTED, NEEDS_RE_REVIEW, REJECTED})
_FORBIDDEN_KEYS = frozenset({"pid", "property_selector", "near_property"})
# `(?<![a-z])` (case-insensitive, so it also excludes A-Z) stops "pid" from
# matching mid-word inside an unrelated word like "ra**pid** 50319 descent" -
# without it, the pattern below would treat "rapid" followed by any run of
# 5+ digits as a private marker.
_PRIVATE_VALUE = re.compile(r"(?<![a-z])pid[-_ ]?\d{5,}", re.IGNORECASE)
_REGION = re.compile(r"^qa-region-\d+$")
_POINT_LISTS = ("controls", "diagnostics", "final_checks")


def load_observation(path: pathlib.Path) -> dict:
    obs = json.loads(path.read_text(encoding="utf-8"))
    validate_observation(obs)
    return obs


def validate_observation(obs: dict) -> None:
    if obs.get("schema_version") != SCHEMA_VERSION:
        raise ValueError("schema_version must be 2")
    receipt = obs.get("source_receipt") or {}
    for field in ("rumsey_id", "width", "height", "sha256"):
        if not receipt.get(field):
            raise ValueError(f"source_receipt.{field} is required")
    assert_no_private_markers(obs)
    seen: set[str] = set()
    for list_name in _POINT_LISTS:
        for point in obs.get(list_name, ()):
            _validate_point(point, list_name, obs)
            if point["id"] in seen:
                raise ValueError(f"duplicate point id {point['id']}")
            seen.add(point["id"])


def _validate_point(point: dict, list_name: str, obs: dict) -> None:
    identifier = point.get("id")
    if not identifier:
        raise ValueError(f"{list_name} point missing id")
    for group, axes in (("pixel", ("x", "y")), ("lonlat", ("lon", "lat"))):
        values = point.get(group) or {}
        for axis in axes:
            if not isinstance(values.get(axis), (int, float)):
                raise ValueError(f"{identifier}: {group}.{axis} must be numeric")
    status = (point.get("review") or {}).get("status")
    if status not in _STATUSES:
        raise ValueError(f"{identifier}: review.status must be one of {sorted(_STATUSES)}")
    if list_name == "final_checks":
        region = point.get("region", "")
        if not _REGION.match(region) or region not in (obs.get("regions") or {}):
            raise ValueError(f"{identifier}: final check needs a declared qa-region label")


def _scan_private(node: object, path: str) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key in _FORBIDDEN_KEYS:
                raise ValueError(f"private marker key {key!r} at {path}")
            if isinstance(key, str) and _PRIVATE_VALUE.search(key):
                raise ValueError(f"private marker key {key!r} at {path}")
            _scan_private(value, f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            _scan_private(value, f"{path}[{index}]")
    elif isinstance(node, str) and _PRIVATE_VALUE.search(node):
        raise ValueError(f"private marker value at {path}")


def assert_no_private_markers(node: object) -> None:
    """Public entry point for the private-marker scan `_scan_private` runs.

    `validate_observation` uses this to gate an observation, and
    `feature_report.build_receipt` uses it to gate a committed receipt
    (including free-text fields like `reason`) before it is written -
    neither call site needs to know about `_scan_private`'s path-tracking
    implementation.
    """
    _scan_private(node, "$")


def _point_gcp(point: dict, role: str) -> GroundControlPoint:
    return GroundControlPoint(
        pixel_x=float(point["pixel"]["x"]),
        pixel_y=float(point["pixel"]["y"]),
        lon=float(point["lonlat"]["lon"]),
        lat=float(point["lonlat"]["lat"]),
        role=role,
        label=str(point["id"]),
    )


def accepted_controls(obs: dict) -> list[GroundControlPoint]:
    return [
        _point_gcp(point, CONTROL_ROLE)
        for point in obs.get("controls", ())
        if point["review"]["status"] == ACCEPTED
    ]


def frozen_checks(obs: dict) -> list[GroundControlPoint]:
    stamp = obs.get("checks_frozen_at")
    if not isinstance(stamp, str) or not stamp:
        raise ValueError("final checks are not frozen")
    return [
        _point_gcp(point, CHECK_ROLE)
        for point in obs.get("final_checks", ())
        if point["review"]["status"] == ACCEPTED
    ]
