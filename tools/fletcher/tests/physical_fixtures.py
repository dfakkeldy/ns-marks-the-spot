"""Reusable fixtures for Sheet 24 physical-observation tests."""

from __future__ import annotations

import copy


CONTROL_PIXELS = (
    (100.0, 100.0), (900.0, 100.0), (100.0, 900.0), (900.0, 900.0),
    (500.0, 100.0), (500.0, 900.0), (100.0, 500.0), (900.0, 500.0),
    (350.0, 350.0), (650.0, 650.0),
)

CHECK_PIXELS = (
    (150.0, 250.0), (850.0, 250.0), (250.0, 750.0),
    (750.0, 750.0), (450.0, 550.0), (550.0, 450.0),
)

RUMSEY_ID = "RUMSEY~8~1~2649~290017"
LIST_NUMBER = "3997.026"
SOURCE_SHA256 = "735daf2fb3b8afd12bef672ffaad9425c05ec1873a75afdb708ff048cb8dfee8"
TRANSPORTATION_SERVICE_URL = (
    "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
    "BASE_NSTDB_10k_Roads_UT83/MapServer"
)
WATER_SERVICE_URL = (
    "https://nsgiwa.novascotia.ca/arcgis/rest/services/BASE/"
    "BASE_NSTDB_10k_Water_WM84/MapServer"
)


def _modern_source(index: int, service_url: str, layer_id: int, spatial_reference: str) -> dict:
    return {
        "service_url": service_url,
        "layer_id": str(layer_id),
        "object_ids": [index],
        "source_spatial_reference": spatial_reference,
        "normalized_spatial_reference": "EPSG:4326",
        "retrieved_at": "2026-07-25T12:00:00Z",
        "local_extract_path": f"private/extracts/sheet-24-{index}.geojson",
        "extract_sha256": f"{index:064x}",
    }


def _point(index: int, pixel: tuple[float, float], feature_type: str) -> dict:
    layer_id = (7, 6, 8)[index % 3]
    return {
        "id": f"control-{index}",
        "feature_type": feature_type,
        "pixel": {"x": pixel[0], "y": pixel[1]},
        "modern_coordinate": {"lon": -61.0 + index / 1000, "lat": 45.0 + index / 1000},
        "historical_description": f"historic transport feature {index}",
        "modern_description": f"modern transport feature {index}",
        "identity_rationale": f"topology confirms control {index}",
        "uncertainty": "low",
        "acceptance": "accepted-pre-fit",
        "modern_source": _modern_source(
            index, TRANSPORTATION_SERVICE_URL, layer_id, "EPSG:2038"
        ),
        "complex_id": f"junction-complex-{index}",
    }


def _check(index: int, pixel: tuple[float, float], feature_type: str) -> dict:
    layer_id = (1, 4, 8)[index % 3]
    return {
        "id": f"check-{index}",
        "feature_type": feature_type,
        "pixel": {"x": pixel[0], "y": pixel[1]},
        "modern_coordinate": {"lon": -60.5 + index / 1000, "lat": 45.5 + index / 1000},
        "historical_description": f"historic natural feature {index}",
        "modern_description": f"modern natural feature {index}",
        "identity_rationale": f"physical feature confirms check {index}",
        "uncertainty": "low",
        "acceptance": "accepted-pre-fit",
        "modern_source": _modern_source(
            100 + index, WATER_SERVICE_URL, layer_id, "EPSG:3857"
        ),
        "area_id": ("coast-a", "coast-b", "interior-a")[index % 3],
        "zone": "coastal" if index < 3 else "interior",
        "derivation": "observed-coordinate",
    }


def valid_observation() -> dict:
    transport_types = (
        "road-road-intersection",
        "road-rail-crossing",
        "rail-rail-junction",
    )
    natural_types = ("river-confluence", "lake-outlet")
    return {
        "schema_version": 1,
        "method_version": "modern-feature-v1",
        "sheet_id": "24",
        "source_receipt": {
            "rumsey_id": RUMSEY_ID,
            "list_number": LIST_NUMBER,
            "width": 10782,
            "height": 7655,
            "sha256": SOURCE_SHA256,
        },
        "status": "frozen",
        "usable_frame": [
            {"x": 0.0, "y": 0.0},
            {"x": 1000.0, "y": 0.0},
            {"x": 1000.0, "y": 1000.0},
            {"x": 0.0, "y": 1000.0},
        ],
        "controls": [
            _point(index, pixel, transport_types[index % len(transport_types)])
            for index, pixel in enumerate(CONTROL_PIXELS)
        ],
        "final_checks": [
            _check(index, pixel, natural_types[index % len(natural_types)])
            for index, pixel in enumerate(CHECK_PIXELS)
        ],
        "rejected_candidates": [
            {
                "id": "rejected-ambiguous-crossing",
                "pixel": {"x": 300.0, "y": 300.0},
                "reason": "ambiguous-identity",
                "description": "Two similarly shaped crossings cannot be distinguished.",
            }
        ],
    }


def duplicate_control_field(payload: dict, field: str) -> dict:
    changed = copy.deepcopy(payload)
    source = changed["controls"][0]
    target = changed["controls"][1]
    if field == "modern_coordinate":
        target[field] = copy.deepcopy(source[field])
    elif field == "pixel":
        target[field] = copy.deepcopy(source[field])
    else:
        target[field] = source[field]
    return changed
