from __future__ import annotations

import copy
import unittest

from tools.fletcher.feature_observation import (
    ACCEPTED,
    NEEDS_RE_REVIEW,
    accepted_controls,
    frozen_checks,
    validate_observation,
)


def minimal_obs() -> dict:
    point = {
        "id": "c01",
        "feature_type": "road-road-intersection",
        "pixel": {"x": 100.0, "y": 200.0},
        "lonlat": {"lon": -61.4, "lat": 45.8},
        "identity": "junction",
        "uncertainty": "ink width",
        "modern_source": {"service_url": "https://example", "layers": [], "retrieved_at": "2026-07-26"},
        "review": {"status": ACCEPTED, "note": "ok", "date": "2026-07-26"},
    }
    check = copy.deepcopy(point)
    check.update({"id": "n01", "region": "qa-region-1"})
    return {
        "schema_version": 2,
        "method_version": "feature-led-v2",
        "sheet_id": "19",
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [[0, 0], [10, 0], [10, 10], [0, 10]],
        "regions": {"qa-region-1": "west"},
        "controls": [point],
        "diagnostics": [],
        "final_checks": [check],
        "rejected": [],
        "checks_frozen_at": None,
    }


class ValidateTests(unittest.TestCase):
    def test_valid_observation_passes(self) -> None:
        validate_observation(minimal_obs())

    def test_duplicate_ids_rejected(self) -> None:
        obs = minimal_obs()
        obs["final_checks"][0]["id"] = "c01"
        with self.assertRaisesRegex(ValueError, "duplicate"):
            validate_observation(obs)

    def test_private_key_rejected(self) -> None:
        obs = minimal_obs()
        obs["controls"][0]["near_property"] = True
        with self.assertRaisesRegex(ValueError, "private"):
            validate_observation(obs)

    def test_private_value_rejected(self) -> None:
        obs = minimal_obs()
        obs["controls"][0]["identity"] = "near pid-50319672 shore"
        with self.assertRaisesRegex(ValueError, "private"):
            validate_observation(obs)

    def test_check_requires_known_region(self) -> None:
        obs = minimal_obs()
        obs["final_checks"][0]["region"] = "qa-region-9"
        with self.assertRaisesRegex(ValueError, "region"):
            validate_observation(obs)


class RoleTests(unittest.TestCase):
    def test_accepted_controls_excludes_unreviewed(self) -> None:
        obs = minimal_obs()
        extra = copy.deepcopy(obs["controls"][0])
        extra.update({"id": "c02"})
        extra["review"] = {"status": NEEDS_RE_REVIEW, "note": "", "date": ""}
        obs["controls"].append(extra)
        points = accepted_controls(obs)
        self.assertEqual([p.label for p in points], ["c01"])
        self.assertEqual(points[0].pixel_x, 100.0)

    def test_frozen_checks_requires_freeze_stamp(self) -> None:
        obs = minimal_obs()
        with self.assertRaisesRegex(ValueError, "frozen"):
            frozen_checks(obs)
        obs["checks_frozen_at"] = "2026-07-27"
        self.assertEqual([p.label for p in frozen_checks(obs)], ["n01"])

    def test_frozen_checks_requires_string_stamp(self) -> None:
        obs = minimal_obs()
        obs["checks_frozen_at"] = 12345
        with self.assertRaisesRegex(ValueError, "frozen"):
            frozen_checks(obs)

    def test_frozen_checks_excludes_unreviewed(self) -> None:
        obs = minimal_obs()
        obs["checks_frozen_at"] = "2026-07-27"
        extra = copy.deepcopy(obs["final_checks"][0])
        extra.update({"id": "n02"})
        extra["review"] = {"status": NEEDS_RE_REVIEW, "note": "", "date": ""}
        obs["final_checks"].append(extra)
        points = frozen_checks(obs)
        self.assertEqual([p.label for p in points], ["n01"])


if __name__ == "__main__":
    unittest.main()
