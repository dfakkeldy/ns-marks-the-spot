from __future__ import annotations

import json
import unittest

from tools.fletcher.feature_import import convert_v1
from tools.fletcher.feature_observation import validate_observation


def v1_fixture() -> dict:
    return {
        "schema_version": 1,
        "sheet_id": "19",
        "property_selector": {"pid": "50319672"},
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}],
        "acceptance_gate": {"check_rms_m_max": 100.0},
        "controls": [{
            "id": "c02", "feature_type": "road-road-intersection",
            "pixel": {"x": 1.0, "y": 2.0},
            "modern_coordinate": {"lon": -61.4, "lat": 45.9},
            "historical_description": "junction", "modern_description": "NSTDB",
            "identity_rationale": "same junction", "uncertainty": "ink",
            "acceptance": "accepted-pre-fit", "complex_id": "roads8:1|2",
            "modern_source": {"service_url": "https://x", "layers": [], "retrieved_at": "2026-07-26"},
            "evidence_crop": {"path": "controls/c02.jpg", "sha256": "s"},
        }],
        "final_checks": [{
            "id": "n02", "feature_type": "river-mouth",
            "pixel": {"x": 3.0, "y": 4.0},
            "modern_coordinate": {"lon": -61.5, "lat": 45.8},
            "historical_description": "stream mouth", "modern_description": "NSTDB",
            "identity_rationale": "same mouth", "uncertainty": "tide",
            "acceptance": "accepted-pre-fit",
            "area_id": "pid-50319672-coastal-north", "near_property": True,
            "modern_source": {"service_url": "https://x", "layers": [], "retrieved_at": "2026-07-26"},
            "evidence_crop": {"path": "checks/n02.jpg", "sha256": "s"},
        }],
        "rejected_candidates": [{"id": "c13", "reason": "realigned"}],
    }


REGION_MAP = {"pid-50319672-coastal-north": "qa-region-1"}
REGIONS = {"qa-region-1": "western coastal acceptance neighbourhood"}


class ConvertTests(unittest.TestCase):
    def test_converts_and_passes_validation(self) -> None:
        out = convert_v1(v1_fixture(), REGION_MAP, REGIONS)
        validate_observation(out)
        self.assertEqual(out["controls"][0]["review"]["status"], "accepted")
        diagnostic = out["diagnostics"][0]
        self.assertEqual(diagnostic["origin"], "burned-check-v1")
        self.assertEqual(diagnostic["review"]["status"], "needs-re-review")
        self.assertEqual(diagnostic["region"], "qa-region-1")
        self.assertEqual(out["rejected"], [{"id": "c13", "reason": "realigned"}])
        self.assertNotIn("pid", json.dumps(out))

    def test_unmapped_area_id_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "unknown-area"):
            fixture = v1_fixture()
            fixture["final_checks"][0]["area_id"] = "unknown-area"
            convert_v1(fixture, REGION_MAP, REGIONS)

    def test_region_map_target_must_be_declared(self) -> None:
        orphaned_region_map = {"pid-50319672-coastal-north": "qa-region-999"}
        with self.assertRaisesRegex(ValueError, "qa-region-999"):
            convert_v1(v1_fixture(), orphaned_region_map, REGIONS)


if __name__ == "__main__":
    unittest.main()
