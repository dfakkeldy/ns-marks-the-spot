from __future__ import annotations

import json
import math
import pathlib
import tempfile
import unittest

from tools.fletcher.feature_georeference import fit, loo_rows
from tools.fletcher.feature_observation import ACCEPTED, accepted_controls


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


if __name__ == "__main__":
    unittest.main()
