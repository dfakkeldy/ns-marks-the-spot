"""Regenerate paired native and NSTDB audits for this frozen refinement."""

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "review", HERE.parent / "review_points.py"
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
review.main(
    [
        (
            "14",
            "sheet14/refinement-20260909/fit.json",
            "fletcher-sheet14/native/sheet14.png",
            "fletcher-sheet14/reference",
            ["C09", "R01", "R02", "R03"],
        ),
        (
            "14",
            "sheet14/refinement-20260909/checks.json",
            "fletcher-sheet14/native/sheet14.png",
            "fletcher-sheet14/reference",
            ["T01", "T02", "T03", "T04", "R04"],
        ),
    ],
    HERE / "review",
)
