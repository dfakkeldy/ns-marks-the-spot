"""Tests for the Sheet 24 physical-observation contract."""

from __future__ import annotations

import json
import pathlib
import tempfile
import unittest
from unittest import mock

from tools.fletcher.physical_observation import (
    SourceDriftError,
    SourceReceipt,
    parse_observation,
    polygon_centroid,
    verify_manifest_source,
    verify_source,
)
from tools.fletcher.tests.physical_fixtures import (
    LIST_NUMBER,
    RUMSEY_ID,
    SOURCE_SHA256,
    duplicate_control_field,
    valid_observation,
)


class PhysicalObservationTests(unittest.TestCase):
    def test_accepts_a_distributed_role_separated_observation(self) -> None:
        parsed = parse_observation(json.dumps(valid_observation()))
        self.assertEqual(parsed.method_version, "modern-feature-v1")
        self.assertEqual(len(parsed.controls), 10)
        self.assertEqual(len(parsed.final_checks), 6)

    def test_rejects_transport_feature_in_final_checks(self) -> None:
        payload = valid_observation()
        payload["final_checks"][0]["feature_type"] = "road-road-intersection"
        with self.assertRaisesRegex(ValueError, "role.*feature"):
            parse_observation(json.dumps(payload))

    def test_rejects_duplicate_id_pixel_coordinate_and_junction_complex(self) -> None:
        for field in ("id", "pixel", "modern_coordinate", "complex_id"):
            with self.subTest(field=field):
                payload = duplicate_control_field(valid_observation(), field)
                with self.assertRaisesRegex(ValueError, "duplicate"):
                    parse_observation(json.dumps(payload))

    def test_requires_counts_quadrants_and_seventy_percent_spans(self) -> None:
        payload = valid_observation()
        payload["controls"] = payload["controls"][:9]
        with self.assertRaisesRegex(ValueError, "at least 10"):
            parse_observation(json.dumps(payload))

        payload = valid_observation()
        for point in payload["controls"]:
            point["pixel"]["x"] = 400.0 + point["pixel"]["x"] * 0.1
        with self.assertRaisesRegex(ValueError, "70%"):
            parse_observation(json.dumps(payload))

    def test_requires_three_check_areas_two_classes_and_supported_zones(self) -> None:
        payload = valid_observation()
        for point in payload["final_checks"]:
            point["area_id"] = "one-place"
        with self.assertRaisesRegex(ValueError, "three separated areas"):
            parse_observation(json.dumps(payload))

    def test_rejected_candidate_requires_a_fixed_reason(self) -> None:
        payload = valid_observation()
        payload["rejected_candidates"][0].pop("reason")
        with self.assertRaisesRegex(ValueError, "rejection reason"):
            parse_observation(json.dumps(payload))

    def test_accepts_an_explicit_pre_fit_failure_without_forcing_counts(self) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-identity"
        payload["terminal_reason"] = "only seven transport nodes are unambiguous"
        payload["controls"] = payload["controls"][:7]
        payload["final_checks"] = []
        parsed = parse_observation(json.dumps(payload))
        self.assertEqual(parsed.status, "rejected")

    def test_source_drift_without_inspected_pixels_may_omit_the_frame(self) -> None:
        payload = valid_observation()
        payload.update({
            "status": "rejected",
            "terminal_state": "source-drift",
            "terminal_reason": "the supplied bytes do not match the frozen receipt",
            "controls": [],
            "final_checks": [],
            "rejected_candidates": [],
        })
        payload.pop("usable_frame")
        self.assertIsNone(parse_observation(json.dumps(payload)).usable_frame)

    def test_polygon_centroid_uses_the_fixed_shoelace_rule(self) -> None:
        self.assertEqual(
            polygon_centroid(((0.0, 0.0), (6.0, 0.0), (0.0, 6.0))),
            (2.0, 2.0),
        )

    def test_rejects_invalid_frame_and_outside_measured_pixels(self) -> None:
        payload = valid_observation()
        payload["usable_frame"] = [
            {"x": 0.0, "y": 0.0}, {"x": 1000.0, "y": 1000.0},
            {"x": 1000.0, "y": 0.0}, {"x": 0.0, "y": 1000.0},
        ]
        with self.assertRaisesRegex(ValueError, "self-intersecting"):
            parse_observation(json.dumps(payload))

        payload = valid_observation()
        payload["controls"][0]["pixel"]["x"] = 1001.0
        with self.assertRaisesRegex(ValueError, "usable_frame"):
            parse_observation(json.dumps(payload))

    def test_rejects_duplicate_natural_derivation(self) -> None:
        payload = valid_observation()
        source = payload["final_checks"][0]
        target = payload["final_checks"][1]
        target["modern_source"] = source["modern_source"]
        target["derivation"] = source["derivation"]
        with self.assertRaisesRegex(ValueError, "duplicate natural derivation"):
            parse_observation(json.dumps(payload))

    def test_polygon_centroid_derivation_uses_the_fixed_centroid(self) -> None:
        payload = valid_observation()
        check = payload["final_checks"][0]
        check["derivation"] = "polygon-centroid"
        check["derivation_ring"] = [
            {"lon": -60.503, "lat": 45.497},
            {"lon": -60.497, "lat": 45.497},
            {"lon": -60.500, "lat": 45.506},
        ]
        self.assertEqual(
            parse_observation(json.dumps(payload)).final_checks[0].modern_coordinate,
            (-60.5, 45.5),
        )

    def test_rejects_wrong_source_receipt_as_source_drift(self) -> None:
        payload = valid_observation()
        payload["source_receipt"]["rumsey_id"] = "wrong"
        with self.assertRaisesRegex(ValueError, "source-drift"):
            parse_observation(json.dumps(payload))


class SourceVerificationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.receipt = SourceReceipt(
            rumsey_id=RUMSEY_ID,
            list_number=LIST_NUMBER,
            width=10782,
            height=7655,
            sha256=SOURCE_SHA256,
        )

    def test_verifies_source_and_rejects_every_source_drift_field(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory) / "sheet-24.tif"
            source.write_bytes(b"sheet-24")
            receipt = self.receipt

            with mock.patch(
                "tools.fletcher.physical_observation.sha256",
                return_value=SOURCE_SHA256,
            ):
                verified = verify_source(receipt, source, lambda _: (10782, 7655))
            self.assertEqual(verified.actual_width, 10782)
            self.assertEqual(verified.actual_sha256, SOURCE_SHA256)

            for field, value in (
                ("rumsey_id", "wrong-rumsey"),
                ("list_number", "wrong-list"),
                ("width", 1),
                ("sha256", "0" * 64),
            ):
                with self.subTest(field=field):
                    changed = {**receipt.__dict__, field: value}
                    with self.assertRaisesRegex(SourceDriftError, "source-drift"):
                        verify_source(SourceReceipt(**changed), source, lambda _: (10782, 7655))

            with self.assertRaisesRegex(SourceDriftError, "source-drift"):
                verify_source(receipt, source, lambda _: (1, 7655))

            with self.assertRaisesRegex(SourceDriftError, "source-drift"):
                verify_source(receipt, source, lambda _: (10782, 7655))

    def test_verifies_the_required_sheet_24_manifest_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "sheet-24.tif"
            source.write_bytes(b"sheet-24")
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"sheets": {"24": {
                "rumsey_id": RUMSEY_ID,
                "list_number": LIST_NUMBER,
                "source_path": str(source),
                "source_sha256": SOURCE_SHA256,
                "source_width": 10782,
                "source_height": 7655,
            }}}), encoding="utf-8")
            with mock.patch(
                "tools.fletcher.physical_observation.sha256",
                return_value=SOURCE_SHA256,
            ):
                verified = verify_manifest_source(
                    manifest, "24", source, lambda _: (10782, 7655)
                )
            self.assertEqual(verified.receipt.rumsey_id, RUMSEY_ID)


if __name__ == "__main__":
    unittest.main()
