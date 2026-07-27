from __future__ import annotations

import json
import math
import pathlib
import tempfile
import unittest

from tools.church.geometry import lonlat_to_mercator
from tools.fletcher.feature_georeference import _metrics, fit, freeze, loo_rows, score
from tools.fletcher.feature_observation import ACCEPTED, NEEDS_RE_REVIEW, accepted_controls


def _grid_controls(count: int) -> list[dict]:
    """Synthetic controls on a regular pixel/lonlat grid, all pre-accepted."""
    columns = 4
    points = []
    for index in range(count):
        row, column = divmod(index, columns)
        points.append(
            {
                "id": f"c{index:02d}",
                "pixel": {"x": 100.0 + column * 200.0, "y": 100.0 + row * 200.0},
                "lonlat": {"lon": -61.40 + column * 0.01, "lat": 45.80 + row * 0.01},
                "review": {"status": ACCEPTED},
            }
        )
    return points


def _obs_with_controls(controls: list[dict]) -> dict:
    return {"controls": controls, "final_checks": []}


def _gcp_pixel_pairs(command: list[str]) -> list[tuple[float, float]]:
    """Extract the (pixel_x, pixel_y) half of every `-gcp` flag in a command."""
    pairs = []
    index = 0
    while index < len(command):
        if command[index] == "-gcp":
            pairs.append((float(command[index + 1]), float(command[index + 2])))
            index += 5
        else:
            index += 1
    return pairs


class RecordingRunner:
    """Fake Runner that records every call and answers with empty stdout."""

    def __init__(self) -> None:
        self.calls: list[tuple[list[str], str | None]] = []

    def __call__(self, command: list[str], stdin: str | None) -> str:
        self.calls.append((command, stdin))
        return ""


def _raising_runner(command: list[str], stdin: str | None) -> str:
    raise AssertionError("runner must not be invoked below the control minimum")


class FakeLooRunner:
    """Fake Runner for LOO folds: answers gdaltransform with a canned offset.

    `points_by_label` maps a held-out control's id to its true mercator
    position, latitude, and the ground-metre error the canned gdaltransform
    output should produce for that fold. The offset is computed in raw
    EPSG:3857 units so that, after `mercator_to_ground_metres` scales it back
    down by cos(lat), the resulting error is exactly the requested value.
    """

    def __init__(self, points_by_label: dict[str, dict[str, float]]) -> None:
        self.calls: list[tuple[list[str], str | None]] = []
        self._points = points_by_label

    def __call__(self, command: list[str], stdin: str | None) -> str:
        self.calls.append((command, stdin))
        if command and command[0] == "gdaltransform":
            label = pathlib.Path(command[-1]).stem
            info = self._points[label]
            offset = info["error_m"] / math.cos(math.radians(info["lat"]))
            got_x = info["x"] + offset
            got_y = info["y"]
            return f"{got_x} {got_y} 0\n"
        return ""


class FitTests(unittest.TestCase):
    def test_fit_raises_below_minimum_controls(self) -> None:
        obs = _obs_with_controls(_grid_controls(11))
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = pathlib.Path(tmp) / "fit"
            with self.assertRaisesRegex(ValueError, "12"):
                fit("source.tif", obs, out_dir, runner=_raising_runner)
            self.assertFalse(out_dir.exists())

    def test_fit_invokes_translate_then_warp_and_writes_receipt(self) -> None:
        controls = _grid_controls(12)
        obs = _obs_with_controls(controls)
        runner = RecordingRunner()
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = pathlib.Path(tmp) / "fit"
            warped = fit("source.tif", obs, out_dir, runner=runner)

            self.assertEqual(len(runner.calls), 2)
            translate_command, _ = runner.calls[0]
            warp_cmd, _ = runner.calls[1]

            self.assertEqual(translate_command[0], "gdal_translate")
            self.assertEqual(translate_command.count("-gcp"), 12)
            self.assertEqual(warp_cmd[0], "gdalwarp")
            self.assertIn("-tps", warp_cmd)

            # Every production warp needs -dstalpha, or the rotated sheet's
            # empty corners tile as opaque black instead of transparent;
            # `warp_command` only adds it itself when target_bounds is set,
            # which `fit` never passes, so `fit` must add it directly,
            # immediately before the source (controls.vrt) path.
            vrt_path = str(out_dir / "controls.vrt")
            self.assertIn("-dstalpha", warp_cmd)
            self.assertEqual(warp_cmd[warp_cmd.index(vrt_path) - 1], "-dstalpha")

            self.assertEqual(warped, out_dir / "warped-3857.tif")
            self.assertTrue((out_dir / "controls.vrt").parent.is_dir())

            receipt = json.loads((out_dir / "fit.json").read_text(encoding="utf-8"))
            self.assertEqual(receipt["control_count"], 12)
            self.assertEqual(
                set(receipt["control_ids"]), {point["id"] for point in controls}
            )
            self.assertEqual(receipt["commands"]["translate"], translate_command)
            self.assertEqual(receipt["commands"]["warp"], warp_cmd)


class LooRowsTests(unittest.TestCase):
    def _points_by_label(
        self, gcps, displaced_label: str | None, displaced_error_m: float = 500.0
    ) -> dict[str, dict[str, float]]:
        points_by_label = {}
        for index, point in enumerate(gcps):
            error = (
                displaced_error_m
                if point.label == displaced_label
                else 8.0 + (index % 5)
            )
            mercator_x, mercator_y = point.mercator
            points_by_label[point.label] = {
                "x": mercator_x,
                "y": mercator_y,
                "lat": point.lat,
                "error_m": error,
            }
        return points_by_label

    def test_loo_rows_flags_displaced_point(self) -> None:
        controls = _grid_controls(13)
        obs = _obs_with_controls(controls)
        gcps = accepted_controls(obs)
        displaced_label = "c07"
        runner = FakeLooRunner(self._points_by_label(gcps, displaced_label))

        with tempfile.TemporaryDirectory() as tmp:
            rows = loo_rows("source.tif", obs, pathlib.Path(tmp), runner=runner)

        self.assertEqual(len(rows), 13)
        self.assertEqual({row["id"] for row in rows}, {point.label for point in gcps})

        # Sorted by descending error - the displaced point comes first.
        self.assertEqual(rows[0]["id"], displaced_label)
        self.assertAlmostEqual(rows[0]["error_m"], 500.0, places=3)
        self.assertTrue(rows[0]["flagged"])
        self.assertTrue(all(not row["flagged"] for row in rows[1:]))

        errors = [row["error_m"] for row in rows]
        self.assertEqual(errors, sorted(errors, reverse=True))

    def test_loo_rows_raises_below_minimum_controls(self) -> None:
        obs = _obs_with_controls(_grid_controls(11))
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = pathlib.Path(tmp) / "loo"
            with self.assertRaisesRegex(ValueError, "12"):
                loo_rows("source.tif", obs, out_dir, runner=_raising_runner)

    def test_loo_rows_does_not_flag_error_within_three_times_median(self) -> None:
        # One point at 250 m (over the 100 m absolute bar, but at most 3x a
        # median that this fixture holds at >= ~83.3 m) must stay unflagged -
        # proving the flag rule is a real AND, not just the absolute bar.
        controls = _grid_controls(13)
        obs = _obs_with_controls(controls)
        gcps = accepted_controls(obs)
        boundary_label = "c07"
        points_by_label = {}
        for index, point in enumerate(gcps):
            if point.label == boundary_label:
                error = 250.0
            else:
                error = 90.0 + (index % 5)
            mercator_x, mercator_y = point.mercator
            points_by_label[point.label] = {
                "x": mercator_x,
                "y": mercator_y,
                "lat": point.lat,
                "error_m": error,
            }
        runner = FakeLooRunner(points_by_label)

        with tempfile.TemporaryDirectory() as tmp:
            rows = loo_rows("source.tif", obs, pathlib.Path(tmp), runner=runner)

        by_id = {row["id"]: row for row in rows}
        boundary_row = by_id[boundary_label]
        self.assertAlmostEqual(boundary_row["error_m"], 250.0, places=3)
        self.assertGreater(boundary_row["error_m"], 100.0)

        errors = sorted(row["error_m"] for row in rows)
        median = errors[len(errors) // 2]
        self.assertLessEqual(boundary_row["error_m"], 3.0 * median)
        self.assertFalse(boundary_row["flagged"])

    def test_held_out_point_excluded_from_its_own_fold(self) -> None:
        controls = _grid_controls(13)
        obs = _obs_with_controls(controls)
        gcps = accepted_controls(obs)
        runner = FakeLooRunner(self._points_by_label(gcps, displaced_label=None))

        with tempfile.TemporaryDirectory() as tmp:
            loo_rows("source.tif", obs, pathlib.Path(tmp), runner=runner)

        translate_calls = [
            command for command, _ in runner.calls if command[0] == "gdal_translate"
        ]
        self.assertEqual(len(translate_calls), 13)
        by_label = {point.label: point for point in gcps}
        for command in translate_calls:
            label = pathlib.Path(command[-1]).stem
            pairs = _gcp_pixel_pairs(command)
            self.assertEqual(len(pairs), 12)
            held = by_label[label]
            self.assertNotIn((held.pixel_x, held.pixel_y), pairs)


def _final_check_point(identifier: str, region: str, status: str = ACCEPTED) -> dict:
    """A minimally valid final-check point - same dummy pixel/lonlat is fine,
    since `validate_observation` only requires ids to be unique, not
    coordinates."""
    return {
        "id": identifier,
        "pixel": {"x": 100.0, "y": 100.0},
        "lonlat": {"lon": -61.4, "lat": 45.8},
        "review": {"status": status, "note": "", "date": "2026-07-26"},
        "region": region,
    }


def _freeze_obs(final_checks: list[dict], regions: dict[str, str]) -> dict:
    """A full observation valid enough for `load_observation` to accept it."""
    return {
        "schema_version": 2,
        "method_version": "feature-led-v2",
        "sheet_id": "19",
        "source_receipt": {"rumsey_id": "R", "width": 10, "height": 10, "sha256": "abc"},
        "usable_frame": [[0, 0], [10, 0], [10, 10], [0, 10]],
        "regions": regions,
        "controls": [],
        "diagnostics": [],
        "final_checks": final_checks,
        "rejected": [],
        "checks_frozen_at": None,
    }


class FreezeTests(unittest.TestCase):
    def test_freeze_rejects_seven_checks(self) -> None:
        checks = [_final_check_point(f"n{i:02d}", f"qa-region-{i % 3 + 1}") for i in range(7)]
        regions = {"qa-region-1": "a", "qa-region-2": "b", "qa-region-3": "c"}
        obs = _freeze_obs(checks, regions)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "obs.json"
            path.write_text(json.dumps(obs), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "8"):
                freeze(path, "2026-07-27")

            persisted = json.loads(path.read_text(encoding="utf-8"))
            self.assertIsNone(persisted["checks_frozen_at"])

    def test_freeze_rejects_two_regions(self) -> None:
        checks = [
            _final_check_point(f"n{i:02d}", "qa-region-1" if i < 4 else "qa-region-2")
            for i in range(8)
        ]
        regions = {"qa-region-1": "a", "qa-region-2": "b"}
        obs = _freeze_obs(checks, regions)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "obs.json"
            path.write_text(json.dumps(obs), encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "region"):
                freeze(path, "2026-07-27")

            persisted = json.loads(path.read_text(encoding="utf-8"))
            self.assertIsNone(persisted["checks_frozen_at"])

    def test_freeze_rejects_unaccepted_final_check(self) -> None:
        checks = [_final_check_point(f"n{i:02d}", f"qa-region-{i % 3 + 1}") for i in range(8)]
        checks[3]["review"]["status"] = NEEDS_RE_REVIEW
        regions = {"qa-region-1": "a", "qa-region-2": "b", "qa-region-3": "c"}
        obs = _freeze_obs(checks, regions)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "obs.json"
            original_text = json.dumps(obs)
            path.write_text(original_text, encoding="utf-8")

            with self.assertRaises(ValueError):
                freeze(path, "2026-07-27")

            self.assertEqual(path.read_text(encoding="utf-8"), original_text)

    def test_freeze_stamps_and_persists(self) -> None:
        checks = [_final_check_point(f"n{i:02d}", f"qa-region-{i % 3 + 1}") for i in range(8)]
        regions = {"qa-region-1": "a", "qa-region-2": "b", "qa-region-3": "c"}
        obs = _freeze_obs(checks, regions)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "obs.json"
            path.write_text(json.dumps(obs), encoding="utf-8")

            updated = freeze(path, "2026-07-27")

            self.assertEqual(updated["checks_frozen_at"], "2026-07-27")
            persisted_text = path.read_text(encoding="utf-8")
            self.assertTrue(persisted_text.endswith("\n"))
            self.assertIn('\n  "schema_version"', persisted_text)  # 2-space indent
            persisted = json.loads(persisted_text)
            self.assertEqual(persisted, updated)

    def test_freeze_refuses_double_freeze(self) -> None:
        checks = [_final_check_point(f"n{i:02d}", f"qa-region-{i % 3 + 1}") for i in range(8)]
        regions = {"qa-region-1": "a", "qa-region-2": "b", "qa-region-3": "c"}
        obs = _freeze_obs(checks, regions)
        obs["checks_frozen_at"] = "2026-01-01"
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "obs.json"
            original_text = json.dumps(obs)
            path.write_text(original_text, encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "already frozen"):
                freeze(path, "2026-07-27")

            self.assertEqual(path.read_text(encoding="utf-8"), original_text)


class ScoreRunner:
    """Fake Runner for `score`: one gdaltransform call, all pixels on stdin.

    Keyed by pixel rather than by a per-fold vrt filename (unlike
    `FakeLooRunner`) because `score` must issue a single `gdaltransform` call
    carrying every held-out check pixel at once, not one call per point.
    """

    def __init__(self, expected_by_pixel: dict[tuple[float, float], dict[str, float]]) -> None:
        self.calls: list[tuple[list[str], str | None]] = []
        self._expected = expected_by_pixel

    def __call__(self, command: list[str], stdin: str | None) -> str:
        self.calls.append((command, stdin))
        if command and command[0] == "gdaltransform":
            lines = []
            for line in stdin.strip().splitlines():
                x_str, y_str = line.split()
                info = self._expected[(float(x_str), float(y_str))]
                offset = info["error_m"] / math.cos(math.radians(info["lat"]))
                lines.append(f"{info['x'] + offset} {info['y']} 0")
            return "\n".join(lines) + "\n"
        return ""


class ScoreTests(unittest.TestCase):
    def test_score_refuses_unfrozen_obs(self) -> None:
        obs = {"checks_frozen_at": None, "final_checks": []}
        with tempfile.TemporaryDirectory() as tmp:
            out_path = pathlib.Path(tmp) / "score.json"
            with self.assertRaisesRegex(ValueError, "frozen"):
                score("source.tif", obs, out_path, "2026-07-28", runner=_raising_runner)
            self.assertFalse(out_path.exists())

    def test_score_refuses_existing_out_path(self) -> None:
        obs = {"checks_frozen_at": "2026-07-27", "final_checks": []}
        with tempfile.TemporaryDirectory() as tmp:
            out_path = pathlib.Path(tmp) / "score.json"
            out_path.write_text("existing", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "already scored"):
                score("source.tif", obs, out_path, "2026-07-28", runner=_raising_runner)

            self.assertEqual(out_path.read_text(encoding="utf-8"), "existing")

    def test_score_raises_below_minimum_controls(self) -> None:
        obs = {
            "checks_frozen_at": "2026-07-27",
            "final_checks": [],
            "controls": _grid_controls(11),
        }
        with tempfile.TemporaryDirectory() as tmp:
            out_path = pathlib.Path(tmp) / "score.json"
            with self.assertRaisesRegex(ValueError, "at least 12"):
                score("source.tif", obs, out_path, "2026-07-28", runner=_raising_runner)
            self.assertFalse(out_path.exists())

    def test_score_groups_per_region_metrics(self) -> None:
        controls = _grid_controls(12)
        region_errors = {
            "qa-region-1": [10.0, 20.0, 30.0],
            "qa-region-2": [5.0, 15.0],
            "qa-region-3": [8.0, 12.0, 100.0],
        }
        final_checks = []
        expected_by_pixel = {}
        index = 0
        for region, errors in region_errors.items():
            for error in errors:
                identifier = f"n{index:02d}"
                pixel_x = 1000.0 + index * 40.0
                pixel_y = 2000.0 + index * 25.0
                lon = -61.30 + index * 0.001
                lat = 45.75
                final_checks.append(
                    {
                        "id": identifier,
                        "pixel": {"x": pixel_x, "y": pixel_y},
                        "lonlat": {"lon": lon, "lat": lat},
                        "review": {"status": ACCEPTED},
                        "region": region,
                    }
                )
                mercator_x, mercator_y = lonlat_to_mercator(lon, lat)
                expected_by_pixel[(pixel_x, pixel_y)] = {
                    "x": mercator_x,
                    "y": mercator_y,
                    "lat": lat,
                    "error_m": error,
                }
                index += 1

        obs = {
            "checks_frozen_at": "2026-07-27",
            "controls": controls,
            "final_checks": final_checks,
        }
        runner = ScoreRunner(expected_by_pixel)

        with tempfile.TemporaryDirectory() as tmp:
            out_path = pathlib.Path(tmp) / "score" / "score.json"
            result = score("source.tif", obs, out_path, "2026-07-28", runner=runner)

            # Exactly one controls-only translate, then one gdaltransform call
            # carrying every check pixel - never one gdaltransform per point.
            self.assertEqual(len(runner.calls), 2)
            translate_command, _ = runner.calls[0]
            gdaltransform_command, stdin = runner.calls[1]
            self.assertEqual(translate_command[0], "gdal_translate")
            self.assertEqual(translate_command.count("-gcp"), 12)
            self.assertEqual(gdaltransform_command[0], "gdaltransform")
            self.assertEqual(len(stdin.strip().splitlines()), 8)

            # `score`'s VRT is named distinctly from `fit`'s own
            # "controls.vrt" so a score run pointed at the same directory as
            # a fit run cannot silently overwrite that fit's provenance VRT.
            self.assertEqual(
                translate_command[-1],
                str(out_path.parent / "score-controls.vrt"),
            )

            self.assertEqual(result["scored_at"], "2026-07-28")
            self.assertEqual(result["control_count"], 12)

            # Each recovered error should match its canned target (up to the
            # mercator round trip's floating-point precision).
            flat_expected = {
                f"n{i:02d}": error
                for i, error in enumerate(
                    error for errors in region_errors.values() for error in errors
                )
            }
            self.assertEqual(set(result["per_check"]), set(flat_expected))
            for identifier, expected_error in flat_expected.items():
                self.assertAlmostEqual(result["per_check"][identifier], expected_error, places=3)

            # Grouping/aggregation correctness: overall and per-region metrics
            # must be exactly `_metrics` applied to the *actual* per-check
            # errors, bucketed by region - proving the plumbing groups
            # correctly, independent of mercator round-trip precision.
            self.assertEqual(result["overall"], _metrics(list(result["per_check"].values())))
            self.assertEqual(set(result["regions"]), set(region_errors))
            region1_ids = [f"n{i:02d}" for i in range(3)]
            self.assertEqual(
                result["regions"]["qa-region-1"],
                _metrics([result["per_check"][i] for i in region1_ids]),
            )

            persisted = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(persisted, result)


if __name__ == "__main__":
    unittest.main()
