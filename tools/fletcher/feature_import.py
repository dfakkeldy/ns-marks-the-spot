"""Import v1 pilot observations as feature-led v2 records.

The v1 pilot format carried privacy-sensitive markers directly in the
observation JSON - a `property_selector` block naming the pilot parcel, a
`near_property` flag on final checks, and `pid-...` area ids used to key
qualitative review regions. None of that may reach the committed v2 output,
so this importer maps every such marker to a neutral v2 equivalent (or drops
it outright) and always runs `validate_observation` - including its privacy
guard - on the converted dict before returning it.
"""
from __future__ import annotations

import argparse
import json
import pathlib

from tools.fletcher.feature_observation import (
    ACCEPTED,
    METHOD_VERSION,
    NEEDS_RE_REVIEW,
    SCHEMA_VERSION,
    validate_observation,
)

IMPORT_NOTE = "imported from sheet19-feature-pilot-v1 pre-fit acceptance"
DIAGNOSTIC_NOTE = "held-out residual was seen in the 2026-07-26 affine pilot"
DIAGNOSTIC_ORIGIN = "burned-check-v1"
_REVIEW_DATE = "2026-07-26"


def _convert_point(point: dict, status: str, note: str) -> dict:
    identity = point.get("identity_rationale", "")
    historical = point.get("historical_description", "")
    if historical:
        identity = f"{identity} | {historical}" if identity else historical
    converted = {
        "id": point["id"],
        "feature_type": point["feature_type"],
        "pixel": dict(point["pixel"]),
        "lonlat": dict(point["modern_coordinate"]),
        "identity": identity,
        "uncertainty": point.get("uncertainty", ""),
        "modern_source": point.get("modern_source", {}),
        "evidence_crop": point.get("evidence_crop", {}),
        "review": {"status": status, "note": note, "date": _REVIEW_DATE},
    }
    return converted


def _convert_control(point: dict) -> dict:
    return _convert_point(point, ACCEPTED, IMPORT_NOTE)


def _convert_diagnostic(point: dict, region_map: dict[str, str], regions: dict[str, str]) -> dict:
    converted = _convert_point(point, NEEDS_RE_REVIEW, DIAGNOSTIC_NOTE)
    area_id = point.get("area_id")
    if area_id not in region_map:
        raise ValueError(f"no region_map entry for area_id {area_id!r}")
    region = region_map[area_id]
    if region not in regions:
        raise ValueError(
            f"area_id {area_id!r} maps to undeclared region {region!r}"
        )
    converted["origin"] = DIAGNOSTIC_ORIGIN
    converted["region"] = region
    return converted


def _convert_frame(frame: list[dict]) -> list[list[float]]:
    return [[point["x"], point["y"]] for point in frame]


def convert_v1(v1: dict, region_map: dict[str, str], regions: dict[str, str]) -> dict:
    """Convert a v1 pilot observation dict into a v2 feature-led observation.

    Raises `ValueError` (via `validate_observation`, or directly for an
    unmapped `final_checks[*].area_id`) rather than returning a record that
    could leak the pilot parcel's identity.
    """
    v2 = {
        "schema_version": SCHEMA_VERSION,
        "method_version": METHOD_VERSION,
        "sheet_id": v1["sheet_id"],
        "source_receipt": dict(v1["source_receipt"]),
        "usable_frame": _convert_frame(v1["usable_frame"]),
        "regions": dict(regions),
        "controls": [_convert_control(point) for point in v1.get("controls", ())],
        "diagnostics": [
            _convert_diagnostic(point, region_map, regions)
            for point in v1.get("final_checks", ())
        ],
        "final_checks": [],
        "rejected": [
            {"id": candidate["id"], "reason": candidate["reason"]}
            for candidate in v1.get("rejected_candidates", ())
        ],
        "checks_frozen_at": None,
    }
    validate_observation(v2)
    return v2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import a v1 pilot observation as a feature-led v2 record."
    )
    parser.add_argument("v1", type=pathlib.Path)
    parser.add_argument("--region-map", type=pathlib.Path, required=True)
    parser.add_argument("--regions", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args(argv)

    v1 = json.loads(args.v1.read_text(encoding="utf-8"))
    region_map = json.loads(args.region_map.read_text(encoding="utf-8"))
    regions = json.loads(args.regions.read_text(encoding="utf-8"))

    v2 = convert_v1(v1, region_map, regions)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(v2, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(json.dumps({
        "accepted": len(v2["controls"]),
        "diagnostics": len(v2["diagnostics"]),
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
