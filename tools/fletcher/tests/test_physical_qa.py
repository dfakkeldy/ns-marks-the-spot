from __future__ import annotations

import dataclasses
import copy
import json
import math
import pathlib
import unittest

from tools.fletcher.physical_qa import (
    REQUIRED_ARTIFACTS,
    VISUAL_CHECKS,
    ArtifactInventory,
    StructuralMetrics,
    StructuralVerdict,
    VisualReview,
    _point_fields,
    build_parser,
    coverage_components,
    evaluate_structure,
    validate_artifact_inventory,
    validate_visual_review,
)
from tools.fletcher.physical_observation import RejectedCandidate
from tools.fletcher.tests.physical_fixtures import CONTROL_PIXELS


OBSERVATION_SHA256 = "a" * 64


def artifact_payload() -> dict[str, object]:
    artifacts: dict[str, object] = {}
    for key in REQUIRED_ARTIFACTS:
        count = (
            10
            if key == "transport_control_crops"
            else 6
            if key == "natural_check_crops"
            else 1
        )
        artifacts[key] = [
            {
                "path": f"{key}/{index}.png",
                "sha256": f"{index + 1:064x}",
            }
            for index in range(count)
        ]
    return {
        "schema_version": 1,
        "observation_sha256": OBSERVATION_SHA256,
        "artifacts": artifacts,
    }


def review_payload() -> dict[str, object]:
    inventory = artifact_payload()
    return {
        "schema_version": 1,
        "gate": "PASS",
        "observation_sha256": OBSERVATION_SHA256,
        "checks": {
            check: (
                "NOT_APPLICABLE" if check == "shared_boundary_if_applicable" else "PASS"
            )
            for check in VISUAL_CHECKS
        },
        "artifact_inventory": inventory,
        "artifacts": copy.deepcopy(inventory["artifacts"]),
        "optional_artifact_uses": {},
    }


class StructuralGateTests(unittest.TestCase):
    def test_structural_records_are_frozen(self) -> None:
        self.assertTrue(StructuralMetrics.__dataclass_params__.frozen)
        self.assertTrue(StructuralVerdict.__dataclass_params__.frozen)

    def test_accepts_identity_like_transform(self) -> None:
        verdict = evaluate_structure(
            lambda x, y: (2.0 * x, 2.0 * y),
            frame_polygon=(
                (0.0, 0.0),
                (1000.0, 0.0),
                (1000.0, 1000.0),
                (0.0, 1000.0),
            ),
            control_pixels=CONTROL_PIXELS,
        )

        self.assertTrue(verdict.passed)
        self.assertEqual(verdict.sample_grid, (21, 21))
        self.assertGreater(verdict.metrics.cell_count, 0)

    def test_rejects_fold_nonfinite_anisotropy_and_area_outlier(self) -> None:
        cases = (
            (lambda x, y: (-x, y), "determinant"),
            (lambda x, y: (math.nan, y), "non-finite"),
            (lambda x, y: (5.0 * x, y), "anisotropy"),
            (
                lambda x, y: (
                    x * (0.1 if x > 500.0 else 1.0),
                    y,
                ),
                "area scale",
            ),
        )
        for transform, reason in cases:
            with self.subTest(reason=reason):
                verdict = evaluate_structure(
                    transform,
                    (
                        (0.0, 0.0),
                        (1000.0, 0.0),
                        (1000.0, 1000.0),
                        (0.0, 1000.0),
                    ),
                    CONTROL_PIXELS,
                )
                self.assertFalse(verdict.passed)
                self.assertIn(reason, verdict.reason)

    def test_collects_all_structural_violations(self) -> None:
        verdict = evaluate_structure(
            lambda x, y: (-5.0 * x, y),
            (
                (0.0, 0.0),
                (1000.0, 0.0),
                (1000.0, 1000.0),
                (0.0, 1000.0),
            ),
            CONTROL_PIXELS,
        )

        self.assertIn("determinant", verdict.reason)
        self.assertIn("anisotropy", verdict.reason)

    def test_rejects_overlapping_non_neighbour_mesh_cells(self) -> None:
        verdict = evaluate_structure(
            lambda x, y: (x % 300.0, y),
            (
                (0.0, 0.0),
                (1000.0, 0.0),
                (1000.0, 1000.0),
                (0.0, 1000.0),
            ),
            CONTROL_PIXELS,
        )

        self.assertFalse(verdict.passed)
        self.assertIn("overlap", verdict.reason)

    def test_rejects_self_intersecting_transformed_mesh_cell(self) -> None:
        verdict = evaluate_structure(
            lambda x, y: (
                x if int(y / 50.0) % 2 == 0 else 1000.0 - x,
                y,
            ),
            (
                (0.0, 0.0),
                (1000.0, 0.0),
                (1000.0, 1000.0),
                (0.0, 1000.0),
            ),
            CONTROL_PIXELS,
        )

        self.assertFalse(verdict.passed)
        self.assertIn("self-intersecting", verdict.reason)

    def test_rejects_disconnected_alpha_coverage(self) -> None:
        mask = [[True, True, False, True, True]]
        self.assertEqual(coverage_components(mask), 2)
        self.assertEqual(coverage_components([[False, False]]), 0)


class ArtifactAndReviewTests(unittest.TestCase):
    def test_review_records_are_frozen(self) -> None:
        self.assertTrue(ArtifactInventory.__dataclass_params__.frozen)
        self.assertTrue(VisualReview.__dataclass_params__.frozen)

    def test_missing_required_artifact_is_rejected(self) -> None:
        payload = artifact_payload()
        del payload["artifacts"]["warped_preview"]  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "warped_preview"):
            validate_artifact_inventory(payload)

    def test_crop_minimums_are_enforced(self) -> None:
        payload = artifact_payload()
        payload["artifacts"]["transport_control_crops"] = []  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "at least 10"):
            validate_artifact_inventory(payload)

    def test_observation_hash_mismatch_is_rejected(self) -> None:
        payload = review_payload()

        with self.assertRaisesRegex(ValueError, "observation"):
            validate_visual_review(json.dumps(payload), "b" * 64)

    def test_claimed_pass_with_failed_check_is_rejected(self) -> None:
        payload = review_payload()
        payload["checks"]["upright"] = "FAIL"  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "PASS"):
            validate_visual_review(json.dumps(payload), OBSERVATION_SHA256)

    def test_only_shared_boundary_may_be_not_applicable(self) -> None:
        payload = review_payload()
        payload["checks"]["upright"] = "NOT_APPLICABLE"  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "upright"):
            validate_visual_review(json.dumps(payload), OBSERVATION_SHA256)

    def test_artifact_path_or_hash_mismatch_is_rejected(self) -> None:
        payload = review_payload()
        payload["artifacts"]["warped_preview"][0]["sha256"] = "f" * 64  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "artifact"):
            validate_visual_review(json.dumps(payload), OBSERVATION_SHA256)

    def test_optional_artifact_requires_described_use(self) -> None:
        payload = review_payload()
        optional = [{"path": "optional/nsprd.png", "sha256": "e" * 64}]
        payload["artifact_inventory"]["artifacts"]["nsprd_overlay"] = optional  # type: ignore[index]
        payload["artifacts"]["nsprd_overlay"] = optional  # type: ignore[index]

        with self.assertRaisesRegex(ValueError, "described"):
            validate_visual_review(json.dumps(payload), OBSERVATION_SHA256)

    def test_valid_all_pass_review(self) -> None:
        review = validate_visual_review(
            json.dumps(review_payload()),
            OBSERVATION_SHA256,
        )

        self.assertEqual(review.gate, "PASS")
        self.assertEqual(review.observation_sha256, OBSERVATION_SHA256)


class RenderCommandTests(unittest.TestCase):
    def test_rejected_frozen_candidate_label_retains_reason(self) -> None:
        candidate = RejectedCandidate(
            id="rejected-crossing",
            reason="ambiguous-identity",
            pixel=(320.0, 480.0),
            description="two possible modern crossings",
        )

        identifier, x, y, label = _point_fields(candidate, "rejected")

        self.assertEqual((identifier, x, y), ("rejected-crossing", 320.0, 480.0))
        self.assertIn("ambiguous-identity", label)

    def test_render_requires_all_planned_inputs(self) -> None:
        parser = build_parser()
        parsed = parser.parse_args(
            [
                "render",
                "--source",
                "scan.tif",
                "--observation",
                "observation.json",
                "--selection",
                "selection.json",
                "--natural-checks",
                "natural.json",
                "--reference",
                "reference",
                "--output",
                "qa",
            ]
        )

        self.assertEqual(parsed.command, "render")
        for name in (
            "source",
            "observation",
            "selection",
            "natural_checks",
            "reference",
            "output",
        ):
            self.assertIsInstance(getattr(parsed, name), pathlib.Path)

    def test_render_help_does_not_name_deliverable_tiles_directory(self) -> None:
        help_text = build_parser().format_help()

        self.assertNotIn("/tiles/sheet-24-modern-v1/", help_text)


if __name__ == "__main__":
    unittest.main()
