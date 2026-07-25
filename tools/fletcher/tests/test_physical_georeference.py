from __future__ import annotations

import dataclasses
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
from tools.fletcher.physical_qa import StructuralMetrics, StructuralVerdict


FRAME = (
    (0.0, 0.0),
    (100.0, 0.0),
    (100.0, 200.0),
    (0.0, 200.0),
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


def passing_structure() -> StructuralVerdict:
    return StructuralVerdict(
        passed=True,
        reason="PASS",
        sample_grid=(21, 21),
        metrics=StructuralMetrics(
            sample_count=441,
            cell_count=400,
            determinant_min=1.0,
            determinant_max=1.0,
            anisotropy_max=1.0,
            area_scale_min=1.0,
            area_scale_median=1.0,
            area_scale_max=1.0,
            mesh_components=1,
            overlapping_cell_pairs=0,
        ),
    )


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
                CandidateResult(
                    "affine",
                    AccuracyMetrics(10, 50.0, 80.0, 90.0),
                    None,
                    passing_structure(),
                ),
                ValueError("rank deficient"),
                CandidateResult(
                    "tps",
                    AccuracyMetrics(10, 40.0, 70.0, 85.0),
                    None,
                    passing_structure(),
                ),
            ],
        ):
            result = evaluate_candidates(
                source,
                controls,
                output_dir,
                frame_polygon=FRAME,
            )

        self.assertEqual(result.failures["polynomial2"], "rank deficient")
        self.assertEqual(
            [candidate.method for candidate in result.candidates],
            ["affine", "polynomial2", "tps"],
        )

    def test_tie_break_is_rms_p95_max_then_complexity(self) -> None:
        tied = [
            CandidateResult(
                "tps", AccuracyMetrics(10, 20.0, 30.0, 40.0), None, passing_structure()
            ),
            CandidateResult(
                "polynomial2",
                AccuracyMetrics(10, 20.0, 30.0, 40.0),
                None,
                passing_structure(),
            ),
            CandidateResult(
                "affine",
                AccuracyMetrics(10, 20.0, 30.0, 40.0),
                None,
                passing_structure(),
            ),
        ]

        self.assertEqual(choose_candidate(tied).method, "affine")

    def test_structural_failure_is_retained_and_excluded_from_ranking(self) -> None:
        unsafe = StructuralVerdict(
            passed=False,
            reason="non-positive determinant at 12 mesh samples",
            sample_grid=(21, 21),
            metrics=dataclasses.replace(
                passing_structure().metrics,
                determinant_min=-1.0,
            ),
        )
        candidates = [
            CandidateResult("affine", AccuracyMetrics(10, 1.0, 1.0, 1.0), None, unsafe),
            CandidateResult(
                "polynomial2",
                AccuracyMetrics(10, 20.0, 30.0, 40.0),
                None,
                passing_structure(),
            ),
        ]

        selected = choose_candidate(candidates)

        self.assertEqual(selected.method, "polynomial2")
        self.assertIn("determinant", candidates[0].structure.reason)

    def test_candidate_refits_all_controls_before_structural_evaluation(self) -> None:
        controls = make_controls()
        runner = mock.Mock(return_value=mock.Mock(stdout="0 0 0\n"))
        with (
            tempfile.TemporaryDirectory() as directory,
            mock.patch(
                "tools.fletcher.physical_georeference.check_errors",
                return_value=[0.0],
            ),
            mock.patch(
                "tools.fletcher.physical_georeference.evaluate_structure",
                return_value=passing_structure(),
            ) as evaluate,
        ):
            result = evaluate_candidate(
                "affine",
                pathlib.Path("scan.tif"),
                controls,
                pathlib.Path(directory),
                runner,
                frame_polygon=FRAME,
            )

        self.assertIsNone(result.failure)
        self.assertEqual(result.structure, passing_structure())
        structural_translates = [
            call.args[0]
            for call in runner.call_args_list
            if call.args[0][0] == "gdal_translate" and "structural" in call.args[0][-1]
        ]
        self.assertEqual(len(structural_translates), 1)
        self.assertEqual(structural_translates[0].count("-gcp"), len(controls))
        self.assertEqual(evaluate.call_args.args[1], FRAME)
        self.assertEqual(
            evaluate.call_args.args[2],
            [(point.pixel_x, point.pixel_y) for point in controls],
        )

    def test_fold_fits_exclude_the_held_control(self) -> None:
        controls = make_controls()
        coordinates = {
            (point.pixel_x, point.pixel_y): point.mercator for point in controls
        }

        def run(command: list[str], **kwargs: object) -> mock.Mock:
            if command[0] == "gdaltransform":
                pixel_x, pixel_y = map(float, str(kwargs["input"]).split())
                if any("structural" in str(value) for value in command):
                    return mock.Mock(stdout=f"{pixel_x * 2} {pixel_y * 2} 0\\n")
                world_x, world_y = coordinates[(pixel_x, pixel_y)]
                return mock.Mock(stdout=f"{world_x} {world_y} 0\\n")
            return mock.Mock(stdout="")

        runner = mock.Mock(side_effect=run)

        with tempfile.TemporaryDirectory() as directory:
            candidate = evaluate_candidate(
                "affine",
                pathlib.Path("scan.tif"),
                controls,
                pathlib.Path(directory),
                runner,
                frame_polygon=FRAME,
            )

        self.assertIsNone(candidate.failure)
        self.assertEqual(candidate.metrics, AccuracyMetrics(10, 0.0, 0.0, 0.0))
        translate_commands = [
            call.args[0]
            for call in runner.call_args_list
            if call.args[0][0] == "gdal_translate" and "fold-" in call.args[0][-1]
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
                if any("structural" in str(value) for value in command):
                    return mock.Mock(stdout=f"{pixel_x * 2} {pixel_y * 2} 0\\n")
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
                        frame_polygon=FRAME,
                    )
                    self.assertIsNone(candidate.failure)
                    transforms = [
                        call.args[0]
                        for call in runner.call_args_list
                        if call.args[0][0] == "gdaltransform"
                    ]
                    self.assertTrue(
                        all(
                            all(value in command for value in flag)
                            for command in transforms
                        )
                    )
                    runner.reset_mock()

    def test_non_control_rows_are_refused_before_fitting(self) -> None:
        controls = make_controls()
        controls.append(GroundControlPoint(999.0, 999.0, -60.0, 46.0, "check", "final"))
        runner = mock.Mock()

        candidate = evaluate_candidate(
            "affine",
            pathlib.Path("scan.tif"),
            controls,
            pathlib.Path("out"),
            runner,
            frame_polygon=FRAME,
        )

        self.assertIn("control", candidate.failure or "")
        runner.assert_not_called()

    def test_exact_usable_frame_is_required_without_bbox_fallback(self) -> None:
        candidate = evaluate_candidate(
            "affine",
            pathlib.Path("scan.tif"),
            make_controls(),
            pathlib.Path("out"),
            mock.Mock(),
        )

        self.assertIn("usable frame", candidate.failure or "")

    def test_loocv_failure_does_not_skip_all_control_structural_refit(self) -> None:
        controls = make_controls()

        def run(command: list[str], **kwargs: object) -> mock.Mock:
            if any("fold-" in str(value) for value in command):
                raise ValueError("LOOCV transform failed")
            return mock.Mock(stdout="")

        runner = mock.Mock(side_effect=run)
        with (
            tempfile.TemporaryDirectory() as directory,
            mock.patch(
                "tools.fletcher.physical_georeference.evaluate_structure",
                return_value=passing_structure(),
            ) as evaluate,
        ):
            candidate = evaluate_candidate(
                "affine",
                pathlib.Path("scan.tif"),
                controls,
                pathlib.Path(directory),
                runner,
                frame_polygon=FRAME,
            )

        self.assertIsNone(candidate.metrics)
        self.assertIn("LOOCV transform failed", candidate.loocv_failure or "")
        self.assertIsNone(candidate.structural_failure)
        self.assertEqual(candidate.structure, passing_structure())
        evaluate.assert_called_once()

    def test_both_loocv_and_structural_failures_are_retained(self) -> None:
        controls = make_controls()

        def run(command: list[str], **kwargs: object) -> mock.Mock:
            if any("fold-" in str(value) for value in command):
                raise ValueError("LOOCV failed")
            if any("structural" in str(value) for value in command):
                raise ValueError("structural refit failed")
            return mock.Mock(stdout="")

        with tempfile.TemporaryDirectory() as directory:
            candidate = evaluate_candidate(
                "affine",
                pathlib.Path("scan.tif"),
                controls,
                pathlib.Path(directory),
                mock.Mock(side_effect=run),
                frame_polygon=FRAME,
            )

        self.assertIn("LOOCV failed", candidate.loocv_failure or "")
        self.assertIn("structural refit failed", candidate.structural_failure or "")
        self.assertIn("LOOCV failed", candidate.failure or "")
        self.assertIn("structural refit failed", candidate.failure or "")


if __name__ == "__main__":
    unittest.main()
