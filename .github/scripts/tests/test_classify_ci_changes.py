import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).parents[1] / "classify_ci_changes.py"
SPEC = importlib.util.spec_from_file_location("classify_ci_changes", SCRIPT_PATH)
assert SPEC is not None
assert SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ClassifyCIChangesTests(unittest.TestCase):
    def test_web_only_change_skips_native_ci(self) -> None:
        result = MODULE.classify_paths(["web/src/App.tsx", "web/package-lock.json"])

        self.assertTrue(result.web)
        self.assertFalse(result.native)

    def test_shared_web_icon_runs_web_only(self) -> None:
        result = MODULE.classify_paths(["docs/assets/app-icon.svg"])

        self.assertTrue(result.web)
        self.assertFalse(result.native)

    def test_native_change_skips_web_ci(self) -> None:
        result = MODULE.classify_paths(
            ["ns-marks-the-spot/MapEngine/MapKitEngine.swift"]
        )

        self.assertFalse(result.web)
        self.assertTrue(result.native)

    def test_documentation_only_change_skips_product_suites(self) -> None:
        result = MODULE.classify_paths(
            ["AGENTS.md", "CLAUDE.md", "README.md", "docs/guides/devlog.md"]
        )

        self.assertFalse(result.web)
        self.assertFalse(result.native)

    def test_ci_infrastructure_change_runs_both_suites(self) -> None:
        result = MODULE.classify_paths([".github/workflows/ci.yml"])

        self.assertTrue(result.web)
        self.assertTrue(result.native)

    def test_shared_dataset_change_runs_both_suites(self) -> None:
        """A refreshed snapshot moves through three copies, and the check that
        compares them lives in the web suite while the bytes ship natively."""
        for path in (
            "web/src/data/middletonTaxSale.snapshot.json",
            "SharedData/middletonTaxSale.snapshot.json",
            "NSMarksCore/Sources/NSDataServices/Resources/SharedData/manifest.json",
        ):
            with self.subTest(path=path):
                result = MODULE.classify_paths([path])

                self.assertTrue(result.web)
                self.assertTrue(result.native)

    def test_unknown_path_fails_safe_to_native_ci(self) -> None:
        result = MODULE.classify_paths(["NewProductSurface/config.json"])

        self.assertFalse(result.web)
        self.assertTrue(result.native)

    def test_map_research_uses_the_always_run_pipeline_checks(self) -> None:
        for path in (
            "reports/church/victoria-main-review/status.json",
            "reports/fletcher/full-sheets/inputs.json",
            "tools/church/physical_gcps/victoria-main.csv",
            "tools/fletcher/observations/sheet-24.json",
        ):
            with self.subTest(path=path):
                self.assertEqual(MODULE.classify_paths([path]), (False, False))

    def test_emitted_fletcher_gcps_still_exercise_both_product_parsers(self) -> None:
        self.assertEqual(
            MODULE.classify_paths(["tools/fletcher/gcps/sheet-24.csv"]),
            (True, True),
        )

    def test_research_does_not_hide_a_product_change(self) -> None:
        self.assertEqual(MODULE.classify_paths([
            "reports/church/review.json", "web/src/App.tsx",
        ]), (True, False))

    def test_empty_diff_fails_safe_to_both_suites(self) -> None:
        result = MODULE.classify_paths([])

        self.assertTrue(result.web)
        self.assertTrue(result.native)


if __name__ == "__main__":
    unittest.main()
