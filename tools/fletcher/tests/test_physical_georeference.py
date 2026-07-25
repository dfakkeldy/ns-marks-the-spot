from __future__ import annotations

import inspect
import pathlib
import tempfile
import unittest
from unittest import mock

from tools.church.gcps import GroundControlPoint
from tools.fletcher.physical_georeference import (
    AccuracyMetrics,
    CandidateResult,
    choose_candidate,
    evaluate_candidate,
    evaluate_candidates,
    loocv_folds,
)


def make_controls() -> list[GroundControlPoint]:
    return [
        GroundControlPoint(
            float(index * 10),
            float((index % 3) * 100),
            -61.0 + index * 0.001,
            45.5 + index * 0.001,
            "control",
            f"control-{index:02d}",
        )
        for index in range(10)
    ]


class LeaveOneOutTests(unittest.TestCase):
    def test_each_control_is_absent_from_its_fold_fit(self) -> None:
        controls = make_controls()
        folds = list(loocv_folds(controls))

        self.assertEqual(len(folds), 10)
        for held, training in folds:
            self.assertNotIn(held, training)
            self.assertEqual(len(training), 9)
            self.assertEqual(set(training) | {held}, set(controls))

    def test_final_check_coordinates_cannot_enter_candidate_api(self) -> None:
        signature = inspect.signature(evaluate_candidate)

        self.assertNotIn("checks", signature.parameters)
        self.assertNotIn("final_checks", signature.parameters)

    def test_candidate_failures_are_retained(self) -> None:
        source = pathlib.Path("scan.tif")
        controls = make_controls()
        output_dir = pathlib.Path("out")
        with mock.patch(
            "tools.fletcher.physical_georeference.evaluate_candidate",
            side_effect=[
                CandidateResult("affine", AccuracyMetrics(10, 50.0, 80.0, 90.0), None),
                ValueError("rank deficient"),
                CandidateResult("tps", AccuracyMetrics(10, 40.0, 70.0, 85.0), None),
            ],
        ):
            result = evaluate_candidates(source, controls, output_dir)

        self.assertEqual(result.failures["polynomial2"], "rank deficient")
        self.assertEqual(
            [candidate.method for candidate in result.candidates],
            ["affine", "polynomial2", "tps"],
        )

    def test_tie_break_is_rms_p95_max_then_complexity(self) -> None:
        tied = [
            CandidateResult("tps", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
            CandidateResult("polynomial2", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
            CandidateResult("affine", AccuracyMetrics(10, 20.0, 30.0, 40.0), None),
        ]

        self.assertEqual(choose_candidate(tied).method, "affine")

    def test_fold_fits_exclude_the_held_control(self) -> None:
        controls = make_controls()
        coordinates = {
            (point.pixel_x, point.pixel_y): point.mercator for point in controls
        }

        def run(command: list[str], **kwargs: object) -> mock.Mock:
            if command[0] == "gdaltransform":
                pixel_x, pixel_y = map(float, str(kwargs["input"]).split())
                world_x, world_y = coordinates[(pixel_x, pixel_y)]
                return mock.Mock(stdout=f"{world_x} {world_y} 0\\n")
            return mock.Mock(stdout="")

        runner = mock.Mock(side_effect=run)

        with tempfile.TemporaryDirectory() as directory:
            candidate = evaluate_candidate(
                "affine", pathlib.Path("scan.tif"), controls, pathlib.Path(directory), runner
            )

        self.assertIsNone(candidate.failure)
        self.assertEqual(candidate.metrics, AccuracyMetrics(10, 0.0, 0.0, 0.0))
        translate_commands = [
            call.args[0] for call in runner.call_args_list
            if call.args[0][0] == "gdal_translate"
        ]
        self.assertEqual(len(translate_commands), 10)
        for held, command in zip(controls, translate_commands, strict=True):
            self.assertEqual(command.count("-gcp"), 9)
            pixel_pairs = [
                (command[index + 1], command[index + 2])
                for index, value in enumerate(command)
                if value == "-gcp"
            ]
            self.assertNotIn((str(held.pixel_x), str(held.pixel_y)), pixel_pairs)

    def test_all_methods_use_their_actual_gdal_flag(self) -> None:
        controls = make_controls()
        coordinates = {
            (point.pixel_x, point.pixel_y): point.mercator for point in controls
        }

        def run(command: list[str], **kwargs: object) -> mock.Mock:
            if command[0] == "gdaltransform":
                pixel_x, pixel_y = map(float, str(kwargs["input"]).split())
                world_x, world_y = coordinates[(pixel_x, pixel_y)]
                return mock.Mock(stdout=f"{world_x} {world_y} 0\\n")
            return mock.Mock(stdout="")

        runner = mock.Mock(side_effect=run)

        with tempfile.TemporaryDirectory() as directory:
            for method, flag in (
                ("affine", ("-order", "1")),
                ("polynomial2", ("-order", "2")),
                ("tps", ("-tps",)),
            ):
                with self.subTest(method=method):
                    candidate = evaluate_candidate(
                        method,
                        pathlib.Path("scan.tif"),
                        controls,
                        pathlib.Path(directory),
                        runner,
                    )
                    self.assertIsNone(candidate.failure)
                    transforms = [
                        call.args[0] for call in runner.call_args_list
                        if call.args[0][0] == "gdaltransform"
                    ]
                    self.assertTrue(all(all(value in command for value in flag) for command in transforms))
                    runner.reset_mock()

    def test_non_control_rows_are_refused_before_fitting(self) -> None:
        controls = make_controls()
        controls.append(GroundControlPoint(999.0, 999.0, -60.0, 46.0, "check", "final"))
        runner = mock.Mock()

        candidate = evaluate_candidate(
            "affine", pathlib.Path("scan.tif"), controls, pathlib.Path("out"), runner
        )

        self.assertIn("control", candidate.failure or "")
        runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()
