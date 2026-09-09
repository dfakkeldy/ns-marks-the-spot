"""Reproduce the reserved Mabou northern check crosshairs."""

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "review", HERE.parent.parent / "sheet14/review_points.py"
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
review.main(
    [
        (
            "16",
            "mabou-full-sheet/north-audit-20260909/checks.json",
            "fletcher-sheet16/native/sheet16.png",
            "fletcher-sheet16/reference",
            ["N01", "N02", "N03"],
        )
    ],
    HERE / "review",
)
