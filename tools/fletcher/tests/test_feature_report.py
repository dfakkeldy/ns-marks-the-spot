from __future__ import annotations

import json
import pathlib
import tempfile
import unittest

from tools.fletcher.feature_observation import ACCEPTED, SCHEMA_VERSION, METHOD_VERSION
from tools.fletcher.feature_report import (
    MARK_END,
    MARK_START,
    build_receipt,
    main,
    render_feature_table,
    update_results_md,
)


def _pass_receipt() -> dict:
    return {
        "sheet_id": "19",
        "method_version": "feature-led-v2",
        "disposition": "PASS",
        "reason": "held-out thresholds satisfied",
        "observation_sha256": "a" * 64,
        "control_count": 12,
        "check_count": 8,
        "score": {
            "scored_at": "2026-07-26",
            "control_count": 12,
            "overall": {"count": 8, "rms_m": 9.44, "p95_m": 16.249, "max_m": 20.06},
            "regions": {"a": {}, "b": {}, "c": {}},
            "per_check": {},
        },
        "recorded_at": "2026-07-26",
    }


def _fail_receipt() -> dict:
    """A rejected result recorded before scoring ran - no measured history."""
    return {
        "sheet_id": "5",
        "method_version": "feature-led-v2",
        "disposition": "FAIL",
        "reason": "insufficient accepted controls",
        "observation_sha256": "b" * 64,
        "control_count": 4,
        "check_count": 0,
        "score": None,
        "recorded_at": "2026-07-26",
    }


def _fail_receipt_with_score() -> dict:
    """A rejected result that WAS scored - the gate failed, but the measured
    history must still be reported, not hidden behind the FAIL disposition."""
    return {
        "sheet_id": "12",
        "method_version": "feature-led-v2",
        "disposition": "FAIL",
        "reason": "held-out RMS exceeded gate",
        "observation_sha256": "c" * 64,
        "control_count": 10,
        "check_count": 6,
        "score": {
            "scored_at": "2026-07-26",
            "control_count": 10,
            "overall": {"count": 6, "rms_m": 30.12, "p95_m": 45.67, "max_m": 60.06},
            "regions": {"x": {}, "y": {}},
            "per_check": {},
        },
        "recorded_at": "2026-07-26",
    }


def _blocked_receipt() -> dict:
    """A blocked result: never scored, so metrics stay missing."""
    return {
        "sheet_id": "3",
        "method_version": "feature-led-v2",
        "disposition": "blocked",
        "reason": "final checks not yet frozen",
        "observation_sha256": "d" * 64,
        "control_count": 2,
        "check_count": 0,
        "score": None,
        "recorded_at": "2026-07-26",
    }


class BuildReceiptPrivacyTests(unittest.TestCase):
    """`build_receipt` must scan the assembled receipt (including the free-text
    `reason` an operator types) for private markers before returning it - a
    receipt is a committed artifact, same as an observation."""

    def _obs(self) -> dict:
        return {"sheet_id": "19", "method_version": "feature-led-v2"}

    def test_reason_with_private_marker_raises(self) -> None:
        with self.assertRaisesRegex(ValueError, "private"):
            build_receipt(
                self._obs(),
                None,
                "FAIL",
                "near pid 50319672",
                "a" * 64,
                "2026-07-26",
            )

    def test_clean_reason_passes(self) -> None:
        receipt = build_receipt(
            self._obs(),
            None,
            "FAIL",
            "insufficient accepted controls",
            "a" * 64,
            "2026-07-26",
        )
        self.assertEqual(receipt["reason"], "insufficient accepted controls")


class RenderFeatureTableTests(unittest.TestCase):
    def test_pass_row_rounds_metrics_fail_row_missing_metrics_sorted_by_sheet(self) -> None:
        table = render_feature_table([_pass_receipt(), _fail_receipt()])

        self.assertIn(
            "| Sheet | Disposition | Controls | Checks | RMS m | P95 m | Max m | "
            "Regions | Reason |",
            table,
        )
        self.assertIn(
            "| 19 | PASS | 12 | 8 | 9.4 | 16.2 | 20.1 | 3 | "
            "held-out thresholds satisfied |",
            table,
        )
        self.assertIn(
            "| 5 | FAIL | 4 | 0 | — | — | — | — | "
            "insufficient accepted controls |",
            table,
        )
        # Sorted numerically by sheet id: sheet 5 before sheet 19.
        self.assertLess(table.index("| 5 |"), table.index("| 19 |"))

    def test_fail_row_with_a_score_shows_its_measured_metrics(self) -> None:
        table = render_feature_table([_fail_receipt_with_score()])

        self.assertIn(
            "| 12 | FAIL | 10 | 6 | 30.1 | 45.7 | 60.1 | 2 | "
            "held-out RMS exceeded gate |",
            table,
        )

    def test_blocked_row_with_null_score_shows_missing_metrics(self) -> None:
        table = render_feature_table([_blocked_receipt()])

        self.assertIn(
            "| 3 | blocked | 2 | 0 | — | — | — | — | "
            "final checks not yet frozen |",
            table,
        )

    def test_disposition_and_metrics_are_independent_columns(self) -> None:
        """A PASS row is unchanged by this fix: its own score still renders."""
        table = render_feature_table([_pass_receipt()])

        self.assertIn(
            "| 19 | PASS | 12 | 8 | 9.4 | 16.2 | 20.1 | 3 | "
            "held-out thresholds satisfied |",
            table,
        )


class UpdateResultsMdTests(unittest.TestCase):
    def test_appends_section_with_markers_and_preamble_when_absent(self) -> None:
        original = "# Fletcher results\n\nExisting engraved-grid content.\n"
        table = "| Sheet |\n| ---: |\n| 19 |"

        updated = update_results_md(original, table)

        self.assertTrue(updated.startswith(original))
        self.assertIn("## Feature-led v2 registrations", updated)
        self.assertIn(MARK_START, updated)
        self.assertIn(MARK_END, updated)
        self.assertIn(table, updated)
        self.assertLess(updated.index(MARK_START), updated.index(table))
        self.assertLess(updated.index(table), updated.index(MARK_END))
        self.assertIn("do not alter the engraved-grid diagnostics above", updated)

    def test_replaces_stale_content_between_existing_markers_exact_string(self) -> None:
        before = (
            "# Fletcher results\n\n"
            "Existing engraved-grid content that must survive untouched.\n\n"
            "## Feature-led v2 registrations\n\n"
            "These rows measure feature-led v2 alignment to modern NSTDB "
            "features at\n"
            "frozen held-out checks; they do not alter the engraved-grid "
            "diagnostics above.\n"
        )
        after = "\n\n## What next\n\nTrailing content that must survive untouched.\n"
        text = before + MARK_START + "\nSTALE OLD TABLE ROW\n" + MARK_END + after
        new_table = "| Sheet |\n| ---: |\n| 19 |"

        updated = update_results_md(text, new_table)

        expected = before + MARK_START + "\n" + new_table + "\n" + MARK_END + after
        self.assertEqual(updated, expected)

    def test_is_idempotent(self) -> None:
        original = "# Fletcher results\n\nExisting content.\n"
        table = "| Sheet |\n| ---: |\n| 19 |"

        once = update_results_md(original, table)
        twice = update_results_md(once, table)

        self.assertEqual(once, twice)

    def test_raises_on_unmatched_start_marker_only(self) -> None:
        text = f"# Fletcher results\n\n{MARK_START}\nOnly a start marker.\n"

        with self.assertRaises(ValueError):
            update_results_md(text, "| Sheet |\n| ---: |\n| 19 |")

    def test_raises_on_unmatched_end_marker_only(self) -> None:
        text = f"# Fletcher results\n\nOnly an end marker.\n{MARK_END}\n"

        with self.assertRaises(ValueError):
            update_results_md(text, "| Sheet |\n| ---: |\n| 19 |")


def _obs_fixture() -> dict:
    def _point(identifier: str, region: str | None = None) -> dict:
        point = {
            "id": identifier,
            "pixel": {"x": 1.0, "y": 2.0},
            "lonlat": {"lon": -61.4, "lat": 45.9},
            "review": {"status": ACCEPTED, "note": "", "date": "2026-07-26"},
        }
        if region is not None:
            point["region"] = region
        return point

    return {
        "schema_version": SCHEMA_VERSION,
        "method_version": METHOD_VERSION,
        "sheet_id": "19",
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [[0, 0], [10, 0], [10, 10], [0, 10]],
        "regions": {"qa-region-1": "north shore"},
        "controls": [_point("c01"), _point("c02")],
        "diagnostics": [],
        "final_checks": [_point("n01", "qa-region-1")],
        "rejected": [],
        "checks_frozen_at": "2026-07-26",
    }


class MainRecordTests(unittest.TestCase):
    def test_record_writes_receipt_and_rewrites_results_md_marker_section(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            obs_path = tmp_path / "sheet-19.json"
            obs_path.write_text(json.dumps(_obs_fixture()), encoding="utf-8")

            score_path = tmp_path / "sheet-19-score.json"
            score = {
                "scored_at": "2026-07-26",
                "control_count": 2,
                "overall": {"count": 1, "rms_m": 5.0, "p95_m": 6.0, "max_m": 7.0},
                "regions": {"qa-region-1": {"count": 1, "rms_m": 5.0, "p95_m": 6.0, "max_m": 7.0}},
                "per_check": {"n01": 5.0},
            }
            score_path.write_text(json.dumps(score), encoding="utf-8")

            out_path = tmp_path / "results" / "sheet-19-feature-v2.json"
            results_md_path = tmp_path / "RESULTS.md"
            results_md_path.write_text(
                "# Fletcher results\n\nEngraved-grid content.\n", encoding="utf-8"
            )

            rc = main(
                [
                    "record",
                    "--observation",
                    str(obs_path),
                    "--score",
                    str(score_path),
                    "--disposition",
                    "PASS",
                    "--reason",
                    "held-out thresholds satisfied",
                    "--recorded-at",
                    "2026-07-26",
                    "--out",
                    str(out_path),
                    "--results-md",
                    str(results_md_path),
                ]
            )

            self.assertEqual(rc, 0)
            receipt = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(receipt["sheet_id"], "19")
            self.assertEqual(receipt["disposition"], "PASS")
            self.assertEqual(receipt["control_count"], 2)
            self.assertEqual(receipt["check_count"], 1)
            self.assertEqual(receipt["recorded_at"], "2026-07-26")
            import hashlib

            self.assertEqual(
                receipt["observation_sha256"],
                hashlib.sha256(obs_path.read_bytes()).hexdigest(),
            )

            results_md = results_md_path.read_text(encoding="utf-8")
            self.assertTrue(results_md.startswith("# Fletcher results\n\nEngraved-grid content.\n"))
            self.assertIn("| 19 | PASS | 2 | 1 | 5.0 | 6.0 | 7.0 | 1 |", results_md)

    def test_record_aggregates_across_pre_existing_receipts_sorted_by_sheet(self) -> None:
        """A `record` run must rebuild the marker section from every receipt
        on disk, not just the one it just wrote - a pre-existing sheet-17
        receipt must still show up alongside the newly recorded sheet-19 row,
        in sheet-id order."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            results_dir = tmp_path / "results"
            results_dir.mkdir()

            existing_receipt = {
                "sheet_id": "17",
                "method_version": "feature-led-v2",
                "disposition": "FAIL",
                "reason": "held-out RMS exceeded gate",
                "observation_sha256": "e" * 64,
                "control_count": 9,
                "check_count": 5,
                "score": None,
                "recorded_at": "2026-07-20",
            }
            (results_dir / "sheet-17-feature-v2.json").write_text(
                json.dumps(existing_receipt), encoding="utf-8"
            )

            obs_path = tmp_path / "sheet-19.json"
            obs_path.write_text(json.dumps(_obs_fixture()), encoding="utf-8")

            score_path = tmp_path / "sheet-19-score.json"
            score = {
                "scored_at": "2026-07-26",
                "control_count": 2,
                "overall": {"count": 1, "rms_m": 5.0, "p95_m": 6.0, "max_m": 7.0},
                "regions": {"qa-region-1": {"count": 1, "rms_m": 5.0, "p95_m": 6.0, "max_m": 7.0}},
                "per_check": {"n01": 5.0},
            }
            score_path.write_text(json.dumps(score), encoding="utf-8")

            results_md_path = tmp_path / "RESULTS.md"
            results_md_path.write_text(
                "# Fletcher results\n\nEngraved-grid content.\n", encoding="utf-8"
            )

            rc = main(
                [
                    "record",
                    "--observation",
                    str(obs_path),
                    "--score",
                    str(score_path),
                    "--disposition",
                    "PASS",
                    "--reason",
                    "held-out thresholds satisfied",
                    "--recorded-at",
                    "2026-07-26",
                    "--out",
                    str(results_dir / "sheet-19-feature-v2.json"),
                    "--results-md",
                    str(results_md_path),
                ]
            )

            self.assertEqual(rc, 0)
            results_md = results_md_path.read_text(encoding="utf-8")
            self.assertIn(
                "| 17 | FAIL | 9 | 5 | — | — | — | — | held-out RMS exceeded gate |",
                results_md,
            )
            self.assertIn(
                "| 19 | PASS | 2 | 1 | 5.0 | 6.0 | 7.0 | 1 | "
                "held-out thresholds satisfied |",
                results_md,
            )
            # Sorted by sheet id: 17 before 19.
            self.assertLess(results_md.index("| 17 |"), results_md.index("| 19 |"))

    def test_record_rejects_invalid_disposition(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            obs_path = tmp_path / "sheet-19.json"
            obs_path.write_text(json.dumps(_obs_fixture()), encoding="utf-8")

            with self.assertRaises(SystemExit):
                main(
                    [
                        "record",
                        "--observation",
                        str(obs_path),
                        "--disposition",
                        "bogus",
                        "--reason",
                        "x",
                        "--recorded-at",
                        "2026-07-26",
                        "--out",
                        str(tmp_path / "results" / "sheet-19-feature-v2.json"),
                        "--results-md",
                        str(tmp_path / "RESULTS.md"),
                    ]
                )


if __name__ == "__main__":
    unittest.main()
