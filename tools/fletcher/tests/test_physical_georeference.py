from __future__ import annotations

import dataclasses
import copy
import inspect
import json
import pathlib
import tempfile
import unittest
from unittest import mock

from tools.church.gcps import GroundControlPoint, parse_gcp_csv
from tools.fletcher.physical_georeference import (
    AccuracyMetrics,
    CandidateResult,
    CandidateSet,
    build_selected_warp_command,
    build_parser,
    choose_candidate,
    evaluate_candidate,
    evaluate_candidates,
    evaluate_final_gates,
    finalize_result,
    main,
    prefit_failure_result,
    project_usable_frame,
    score_final_checks,
    select_transform,
    loocv_folds,
    tile_if_pass,
)
from tools.fletcher.emit_physical_gcps import emit
from tools.fletcher.physical_observation import parse_observation
from tools.fletcher.physical_qa import (
    REQUIRED_ARTIFACTS,
    VISUAL_CHECKS,
    StructuralMetrics,
    StructuralVerdict,
)
from tools.fletcher.tests.physical_fixtures import valid_observation


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


def visual_review_payload(observation_sha256: str, gate: str = "PASS") -> dict:
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
    checks = {
        check: (
            "NOT_APPLICABLE" if check == "shared_boundary_if_applicable" else "PASS"
        )
        for check in VISUAL_CHECKS
    }
    if gate == "FAIL":
        checks["upright"] = "FAIL"
    inventory = {
        "schema_version": 1,
        "observation_sha256": observation_sha256,
        "artifacts": artifacts,
    }
    return {
        "schema_version": 1,
        "gate": gate,
        "observation_sha256": observation_sha256,
        "checks": checks,
        "artifact_inventory": inventory,
        "artifacts": copy.deepcopy(artifacts),
        "optional_artifact_uses": {},
    }


class StagedCommandTests(unittest.TestCase):
    def test_select_parser_has_no_check_argument(self) -> None:
        parser = build_parser()
        select = parser.parse_args([
            "select", "--source", "scan.tif", "--controls", "controls.csv",
            "--observation", "observation.json", "--output", "selection",
        ])
        self.assertFalse(hasattr(select, "checks"))

    def test_score_uses_the_frozen_refit_and_cannot_select_a_family(self) -> None:
        signature = inspect.signature(score_final_checks)
        self.assertNotIn("method", signature.parameters)
        self.assertNotIn("controls_path", signature.parameters)

    def test_both_numerical_gates_are_required(self) -> None:
        transport_pass = AccuracyMetrics(10, 100.0, 200.0, 300.0)
        transport_fail = AccuracyMetrics(10, 401.0, 500.0, 700.0)
        natural_pass = AccuracyMetrics(6, 120.0, 220.0, 320.0)
        natural_fail = AccuracyMetrics(6, 450.0, 600.0, 800.0)
        self.assertEqual(
            evaluate_final_gates(transport_pass, natural_fail).disposition,
            "FAIL",
        )
        self.assertEqual(
            evaluate_final_gates(transport_fail, natural_pass).disposition,
            "FAIL",
        )

    def test_tiling_refuses_non_pass_and_wrong_zoom_range(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            failed = root / "failed.json"
            passed = root / "passed.json"
            failed.write_text('{"disposition":"natural-check-fail"}\n')
            passed.write_text(
                '{"disposition":"PASS","visual_qa":{"gate":"PASS"}}\n'
            )
            with self.assertRaisesRegex(ValueError, "final PASS"):
                tile_if_pass(failed, root / "raster.tif", root / "tiles")
            with self.assertRaisesRegex(ValueError, "8 through 16"):
                tile_if_pass(
                    passed, root / "raster.tif", root / "tiles", 9, 16
                )

    def test_prefit_failure_refuses_a_fittable_observation(self) -> None:
        frozen = parse_observation(json.dumps(valid_observation()))
        with self.assertRaisesRegex(ValueError, "status.*rejected"):
            prefit_failure_result(frozen)

    def test_select_loads_only_the_generated_control_csv(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        emitted = emit(observation)
        failures = CandidateSet(
            tuple(
                CandidateResult(method, None, "fit failed")
                for method in ("affine", "polynomial2", "tps")
            ),
            {
                "affine": "fit failed",
                "polynomial2": "fit failed",
                "tps": "fit failed",
            },
        )
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "scan.tif"
            source.write_bytes(b"source")
            observation_path = root / "observation.json"
            observation_path.write_text(json.dumps(valid_observation()))
            controls = root / "controls.csv"
            controls.write_text(emitted.controls)
            output = root / "selection"
            from tools.church.gcps import load_gcps as real_load_gcps

            with (
                mock.patch(
                    "tools.fletcher.physical_georeference.load_gcps",
                    wraps=real_load_gcps,
                ) as load,
                mock.patch(
                    "tools.fletcher.physical_georeference.verify_source"
                ),
                mock.patch(
                    "tools.fletcher.physical_georeference.evaluate_candidates",
                    return_value=failures,
                ),
            ):
                result = select_transform(
                    source, controls, observation_path, output
                )

            self.assertEqual(result.disposition, "candidate-failure")
            load.assert_called_once_with(controls)
            self.assertNotIn("check", controls.name)

    def test_select_rejects_a_control_csv_not_generated_by_observation(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "scan.tif"
            source.write_bytes(b"source")
            observation_path = root / "observation.json"
            observation_path.write_text(json.dumps(valid_observation()))
            controls = root / "controls.csv"
            controls.write_text(
                emit(observation).controls.replace("control-0", "substituted")
            )
            with (
                mock.patch(
                    "tools.fletcher.physical_georeference.verify_source"
                ),
                mock.patch(
                    "tools.fletcher.physical_georeference.evaluate_candidates"
                ) as evaluate,
            ):
                with self.assertRaisesRegex(ValueError, "generated"):
                    select_transform(
                        source, controls, observation_path, root / "selection"
                    )
            evaluate.assert_not_called()

    def test_selected_transport_miss_does_not_fall_back_to_another_family(
        self,
    ) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        candidates = CandidateSet(
            (
                CandidateResult(
                    "affine",
                    AccuracyMetrics(10, 100.0, 200.0, 1600.0),
                    None,
                    passing_structure(),
                ),
                CandidateResult(
                    "polynomial2",
                    AccuracyMetrics(10, 200.0, 300.0, 400.0),
                    None,
                    passing_structure(),
                ),
                CandidateResult(
                    "tps",
                    AccuracyMetrics(10, 250.0, 350.0, 450.0),
                    None,
                    passing_structure(),
                ),
            ),
            {},
        )
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            source = root / "scan.tif"
            source.write_bytes(b"source")
            observation_path = root / "observation.json"
            observation_path.write_text(json.dumps(valid_observation()))
            controls = root / "controls.csv"
            controls.write_text(emit(observation).controls)
            with (
                mock.patch(
                    "tools.fletcher.physical_georeference.verify_source"
                ),
                mock.patch(
                    "tools.fletcher.physical_georeference.evaluate_candidates",
                    return_value=candidates,
                ),
                mock.patch(
                    "tools.fletcher.physical_georeference.subprocess.run"
                ) as run,
            ):
                result = select_transform(
                    source, controls, observation_path, root / "selection"
                )

        self.assertEqual(result.disposition, "transport-cross-validation-fail")
        self.assertEqual(result.selected.method, "affine")
        run.assert_not_called()

    def test_selected_warp_crops_to_projected_frozen_usable_frame(self) -> None:
        runner = mock.Mock(
            return_value=mock.Mock(
                stdout=(
                    "1000 2000 0\n1100 2000 0\n1100 2200 0\n"
                    "1000 2200 0\n"
                )
            )
        )
        projected = project_usable_frame(
            FRAME,
            "affine",
            pathlib.Path("selected-gcps.vrt"),
            runner,
            maximum_spacing_px=1000.0,
        )
        command = build_selected_warp_command(
            "affine",
            pathlib.Path("selected-gcps.vrt"),
            pathlib.Path("selected-3857.tif"),
            pathlib.Path("projected-cutline.geojson"),
        )

        self.assertEqual(
            projected,
            [(1000.0, 2000.0), (1100.0, 2000.0),
             (1100.0, 2200.0), (1000.0, 2200.0)],
        )
        self.assertEqual(
            runner.call_args.kwargs["input"],
            "0.0 0.0\n100.0 0.0\n100.0 200.0\n0.0 200.0",
        )
        self.assertIn("-cutline", command)
        self.assertIn("-crop_to_cutline", command)
        self.assertIn("-dstalpha", command)

    def test_score_reads_only_selection_and_check_csv(self) -> None:
        observation = parse_observation(json.dumps(valid_observation()))
        checks_text = emit(observation).checks
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            selected_vrt = root / "selected-gcps.vrt"
            selected_vrt.write_text("frozen VRT")
            selection = root / "selection.json"
            from tools.fletcher.fetch import sha256
            selection.write_text(json.dumps({
                "schema_version": 1,
                "method_version": "modern-feature-v1",
                "observation_sha256": "a" * 64,
                "disposition": "selection-pass",
                "selected_method": "affine",
                "selected_vrt_path": str(selected_vrt),
                "selected_vrt_sha256": sha256(selected_vrt),
                "transport_gate": "PASS",
                "structural_gate": "PASS",
            }))
            checks = root / "checks.csv"
            checks.write_text(checks_text)
            output = root / "natural-checks.json"
            expected_lines = [
                f"{point.mercator[0]} {point.mercator[1]} 0"
                for point in parse_gcp_csv(checks_text)
            ]
            original_read_text = pathlib.Path.read_text

            with (
                mock.patch(
                    "pathlib.Path.read_text",
                    autospec=True,
                    side_effect=original_read_text,
                ) as read_text,
                mock.patch(
                    "tools.fletcher.physical_georeference.subprocess.run",
                    return_value=mock.Mock(stdout="\n".join(expected_lines) + "\n"),
                ),
            ):
                result = score_final_checks(selection, checks, output)

            self.assertEqual(result.metrics, AccuracyMetrics(6, 0.0, 0.0, 0.0))
            self.assertEqual(
                {call.args[0] for call in read_text.call_args_list},
                {selection, checks},
            )

    def test_prefit_failure_preserves_rejection_and_marks_every_stage_not_run(
        self,
    ) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-distribution"
        payload["terminal_reason"] = "accepted points do not span the frozen frame"
        observation = parse_observation(json.dumps(payload))

        result = prefit_failure_result(observation)

        self.assertEqual(result["disposition"], "insufficient-distribution")
        self.assertEqual(result["source_receipt"], payload["source_receipt"])
        self.assertEqual(result["accepted_control_count"], 10)
        self.assertEqual(result["accepted_check_count"], 6)
        self.assertEqual(result["rejected_candidate_count"], 1)
        for stage in (
            "candidate_stage",
            "transport_stage",
            "structural_stage",
            "natural_stage",
            "visual_stage",
            "raster_stage",
            "tile_stage",
        ):
            self.assertEqual(result[stage], "not-run")
        self.assertNotIn("tile_path", result)

    def test_prefit_failure_cli_hashes_observation_without_gcp_or_gdal_work(
        self,
    ) -> None:
        payload = valid_observation()
        payload["status"] = "rejected"
        payload["terminal_state"] = "insufficient-identity"
        payload["terminal_reason"] = "not enough unambiguous transport identities"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            observation = root / "observation.json"
            observation.write_text(json.dumps(payload))
            output = root / "result.json"
            from tools.fletcher.fetch import sha256

            with (
                mock.patch(
                    "tools.fletcher.physical_georeference.load_gcps"
                ) as load,
                mock.patch(
                    "tools.fletcher.physical_georeference.subprocess.run"
                ) as run,
                mock.patch("builtins.print"),
            ):
                self.assertEqual(main([
                    "prefit-failure",
                    "--observation", str(observation),
                    "--output", str(output),
                ]), 0)

            result = json.loads(output.read_text())
            self.assertEqual(result["observation_sha256"], sha256(observation))
            load.assert_not_called()
            run.assert_not_called()

    def test_finalize_preserves_terminal_selection_and_downstream_not_run(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            selection = pathlib.Path(directory) / "selection.json"
            selection.write_text(json.dumps({
                "schema_version": 1,
                "method_version": "modern-feature-v1",
                "observation_sha256": "a" * 64,
                "source_receipt": valid_observation()["source_receipt"],
                "candidate_stage": "failed",
                "transport_gate": "not-run",
                "structural_gate": "FAIL",
                "raster_stage": "not-run",
                "disposition": "structural-fail",
                "reason": "no candidate passed structure",
            }))

            result = finalize_result(selection, None, None)

        self.assertEqual(result["disposition"], "structural-fail")
        self.assertEqual(result["natural_stage"], "not-run")
        self.assertEqual(result["visual_stage"], "not-run")
        self.assertEqual(result["tile_stage"], "not-run")
        self.assertNotIn("tile_path", result)

    def test_finalize_requires_hash_bound_natural_and_visual_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            raster = root / "selected-3857.tif"
            raster.write_bytes(b"raster")
            selection = root / "selection.json"
            from tools.fletcher.fetch import sha256
            selection.write_text(json.dumps({
                "schema_version": 1,
                "method_version": "modern-feature-v1",
                "observation_sha256": "a" * 64,
                "source_receipt": valid_observation()["source_receipt"],
                "candidate_stage": "passed",
                "selected_method": "affine",
                "selected_candidate": {
                    "point_count": 10,
                    "rms_m": 100.0,
                    "p95_m": 200.0,
                    "max_m": 300.0,
                    "residuals": [],
                },
                "transport_gate": "PASS",
                "structural_gate": "PASS",
                "raster_stage": "generated",
                "selected_raster_path": str(raster),
                "selected_raster_sha256": sha256(raster),
                "disposition": "selection-pass",
                "reason": "selected",
            }))
            natural = root / "natural.json"
            natural.write_text(json.dumps({
                "schema_version": 1,
                "method_version": "modern-feature-v1",
                "observation_sha256": "a" * 64,
                "selection_sha256": sha256(selection),
                "selected_method": "affine",
                "check_count": 6,
                "rms_m": 100.0,
                "p95_m": 200.0,
                "max_m": 300.0,
                "gate": "PASS",
                "disposition": "natural-check-pass",
                "reason": "passed",
            }))
            review = root / "review.json"
            review.write_text(json.dumps(visual_review_payload("a" * 64)))

            result = finalize_result(selection, natural, review)

        self.assertEqual(result["disposition"], "PASS")
        self.assertEqual(result["visual_qa"]["gate"], "PASS")
        self.assertEqual(result["tile_stage"], "not-generated")
        self.assertEqual(result["tile_png_count"], 0)

    def test_tile_counts_only_pngs_and_atomically_updates_pass_result(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            raster = root / "selected-3857.tif"
            raster.write_bytes(b"raster")
            from tools.fletcher.fetch import sha256
            result_path = root / "result.json"
            result_path.write_text(json.dumps({
                "disposition": "PASS",
                "visual_qa": {"gate": "PASS"},
                "selected_raster_path": str(raster),
                "selected_raster_sha256": sha256(raster),
                "tile_stage": "not-generated",
                "tile_png_count": 0,
            }))
            tiles = root / "tiles"

            def run(command: list[str], **_: object) -> mock.Mock:
                (tiles / "8" / "0").mkdir(parents=True)
                (tiles / "8" / "0" / "0.png").write_bytes(b"png")
                (tiles / "8" / "0" / "metadata.json").write_text("{}")
                return mock.Mock()

            with mock.patch(
                "tools.fletcher.physical_georeference.subprocess.run",
                side_effect=run,
            ) as runner:
                result = tile_if_pass(result_path, raster, tiles)

            self.assertEqual(result["tile_stage"], "tiled")
            self.assertEqual(result["tile_png_count"], 1)
            command = runner.call_args.args[0]
            self.assertIn("--xyz", command)
            self.assertIn("--resume", command)
            self.assertIn("--zoom=8-16", command)
            self.assertEqual(
                json.loads(result_path.read_text())["tile_png_count"], 1
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
