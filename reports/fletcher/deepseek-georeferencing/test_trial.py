"""Integrity checks for the trial's parser and scoring, independent of model success."""

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).with_name(name + ".py")
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


runner = load("run")
scorer = load("score")


class TrialTests(unittest.TestCase):
    def test_parser_refuses_nonfinite_outside_and_wrong_case(self):
        for xy in ["[NaN,1]", "[Infinity,1]", "[-1,1]", "[800,0]", "[true,1]", "null"]:
            with self.assertRaises(ValueError):
                runner.parse_answer(
                    '{"case_id":"K01","status":"match","historical_xy":'
                    + xy
                    + ',"evidence":"fork"}',
                    "K01",
                )
        with self.assertRaises(ValueError):
            runner.parse_answer(
                '{"case_id":"K02","status":"match","historical_xy":[10,20],"evidence":"fork"}',
                "K01",
            )

    def test_negative_match_counts_against_precision_and_gate(self):
        ref = {
            "cases": [
                {
                    "case_id": "P",
                    "target_id": "T",
                    "positive": True,
                    "expected_local_xy": [10, 10],
                },
                {
                    "case_id": "N",
                    "target_id": "C1",
                    "positive": False,
                    "expected_local_xy": None,
                },
            ]
        }
        responses = [
            {
                "case_id": cid,
                "answer_valid": True,
                "answer": {
                    "status": "match",
                    "historical_xy": [10, 10],
                    "evidence": "fork",
                },
            }
            for cid in ["P", "N"]
        ]
        out = scorer.score(ref, responses)
        self.assertEqual(out["accepted_precision"], 0.5)
        self.assertEqual(out["negative_false_matches"], 1)
        self.assertFalse(out["numerical_gate_passed"])

    def test_failed_case_stays_in_coverage_denominator(self):
        ref = {
            "cases": [
                {
                    "case_id": cid,
                    "target_id": cid,
                    "positive": True,
                    "expected_local_xy": [10, 10],
                }
                for cid in ["P1", "P2"]
            ]
        }
        out = scorer.score(
            ref,
            [
                {
                    "case_id": "P1",
                    "answer_valid": True,
                    "answer": {
                        "status": "match",
                        "historical_xy": [10, 10],
                        "evidence": "fork",
                    },
                }
            ],
        )
        self.assertEqual(out["positive_correct_fraction"], 0.5)
        self.assertEqual(out["execution_or_format_failures"], 1)

    def test_format_diagnostic_extracts_one_object_without_coordinate_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = {
                "cases": [
                    {
                        "case_id": "K01",
                        "target_id": "T",
                        "positive": True,
                        "expected_local_xy": [10, 10],
                    }
                ]
            }
            (root / "reference.json").write_text(json.dumps(reference))
            attempt = root / "runs/K01/attempt-1"
            attempt.mkdir(parents=True)
            (attempt / "receipt.json").write_text(
                json.dumps(
                    {
                        "case_id": "K01",
                        "answer_valid": False,
                        "attempt": 1,
                        "exit_code": 0,
                        "timed_out": False,
                    }
                )
            )
            answer = {
                "case_id": "K01",
                "status": "match",
                "historical_xy": [12, 14],
                "evidence": "one fork",
            }
            (attempt / "final.txt").write_text(
                "Explanation before JSON.\n" + json.dumps(answer)
            )
            command = [
                sys.executable,
                str(Path(__file__).with_name("score.py")),
                "--reference",
                str(root / "reference.json"),
                "--runs",
                str(root / "runs"),
                "--out",
                str(root / "out"),
                "--normalize-format",
            ]
            subprocess.run(command, check=True, capture_output=True)
            response = json.loads((root / "out/responses.json").read_text())[0]
            self.assertEqual(response["answer"], answer)
            self.assertTrue(response["format_normalized"])
            # Two valid objects are ambiguous; the diagnostic must not choose one.
            (attempt / "final.txt").write_text(
                json.dumps(answer) + "\n" + json.dumps(answer)
            )
            subprocess.run(command, check=True, capture_output=True)
            response = json.loads((root / "out/responses.json").read_text())[0]
            self.assertFalse(response["answer_valid"])


if __name__ == "__main__":
    unittest.main()
