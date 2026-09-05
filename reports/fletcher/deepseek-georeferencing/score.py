"""Score archived DeepSeek responses without moving or correcting predictions."""

import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path


def score(reference, responses):
    byid = {row["case_id"]: row for row in responses}
    if len(byid) != len(responses):
        raise ValueError("Duplicate response case")
    rows = []
    for case in reference["cases"]:
        cid = case["case_id"]
        response = byid.get(cid, {})
        answer = response.get("answer")
        valid = response.get("answer_valid", False)
        status = answer["status"] if valid and answer else "execution_or_format_failure"
        predicted = answer.get("historical_xy") if valid and answer else None
        error = None
        if status == "match" and case["positive"]:
            error = math.dist(predicted, case["expected_local_xy"])
        correct = bool(case["positive"] and error is not None and error <= 15)
        rows.append(
            {
                "case_id": cid,
                "target_id": case["target_id"],
                "positive": case["positive"],
                "status": status,
                "predicted_local_xy": predicted,
                "expected_local_xy": case["expected_local_xy"],
                "source_error_px": error,
                "correct_within_15px": correct,
                "evidence": answer.get("evidence") if valid and answer else None,
            }
        )
    positives = [r for r in rows if r["positive"]]
    negatives = [r for r in rows if not r["positive"]]
    accepted = [r for r in rows if r["status"] == "match"]
    correct = sum(r["correct_within_15px"] for r in positives)
    precision = correct / len(accepted) if accepted else 0
    errs = [r["source_error_px"] for r in positives if r["source_error_px"] is not None]
    gates = {
        "positive_correct_at_least_18": correct >= 18,
        "accepted_precision_at_least_95_percent": precision >= 0.95,
        "all_four_negatives_explicitly_rejected": len(negatives) == 4
        and all(r["status"] == "no_match" for r in negatives),
    }
    return {
        "case_count": len(rows),
        "positive_count": len(positives),
        "negative_count": len(negatives),
        "accepted_matches": len(accepted),
        "correct_positive_matches": correct,
        "positive_correct_fraction": correct / len(positives),
        "accepted_precision": precision,
        "positive_matches_outside_15px": sum(
            r["status"] == "match" and not r["correct_within_15px"] for r in positives
        ),
        "negative_false_matches": sum(r["status"] == "match" for r in negatives),
        "negatives_explicitly_rejected": sum(
            r["status"] == "no_match" for r in negatives
        ),
        "uncertain": sum(r["status"] == "uncertain" for r in rows),
        "execution_or_format_failures": sum(
            r["status"] == "execution_or_format_failure" for r in rows
        ),
        "median_positive_match_error_px": statistics.median(errs) if errs else None,
        "max_positive_match_error_px": max(errs) if errs else None,
        "numerical_gate": gates,
        "numerical_gate_passed": all(gates.values()),
        "visual_identity_gate": "requires separate source-crosshair adjudication; not inferred from coordinate distance",
        "points": rows,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--reference", type=Path, default=Path(__file__).with_name("reference.json")
    )
    ap.add_argument("--runs", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    ref = json.loads(args.reference.read_text())
    responses = []
    receipts = []
    for case in ref["cases"]:
        attempts = sorted((args.runs / case["case_id"]).glob("attempt-*/receipt.json"))
        row = {"case_id": case["case_id"], "answer_valid": False, "answer": None}
        for path in attempts:
            receipt = json.loads(path.read_text())
            receipts.append(receipt)
            if receipt["answer_valid"]:
                row.update(
                    answer_valid=True,
                    answer=json.loads((path.parent / "answer.json").read_text()),
                    attempt=receipt["attempt"],
                )
                break
        responses.append(row)
    result = score(ref, responses)
    result["reference_sha256"] = hashlib.sha256(args.reference.read_bytes()).hexdigest()
    for name, data in [
        ("responses.json", responses),
        ("run-receipts.json", receipts),
        ("scores.json", result),
    ]:
        (args.out / name).write_text(json.dumps(data, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "points"}, indent=2))


if __name__ == "__main__":
    main()
