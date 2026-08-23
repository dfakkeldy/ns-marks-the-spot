import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).parents[1] / "resolve-ios-test-destination.py"
SPEC = importlib.util.spec_from_file_location("resolve_ios_test_destination", SCRIPT_PATH)
assert SPEC is not None
assert SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def lines(text: str) -> list[str]:
    return text.strip("\n").splitlines(keepends=True)


class ResolveIOSTestDestinationTests(unittest.TestCase):
    def test_an_ineligible_preferred_device_does_not_win(self) -> None:
        """The bug this script was written around.

        A runner can list a simulator it cannot run, and the preferred name
        sorts ahead of every other. Reading both sections chose the broken one
        and the test job failed on a machine that had a working simulator.
        """
        resolved = MODULE.select_destination(lines("""
        Available destinations for the "ns-marks-the-spot" scheme:
                { platform:macOS, arch:arm64, variant:Mac Catalyst, id:0000, name:My Mac }
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17 }

        Ineligible destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS Simulator, id:BBBB, OS:26.5, name:iPhone 17 Pro, error:iPhone 17 Pro is not available because it is not currently installed. }
        """))

        self.assertEqual(resolved, "platform=iOS Simulator,name=iPhone 17,OS=26.0")

    def test_an_ineligible_copy_does_not_replace_the_available_one(self) -> None:
        """Same device, same OS, listed under both headings.

        The two entries collapse to one, and which one survived used to depend
        on the order they were printed in.
        """
        resolved = MODULE.select_destination(lines("""
        Available destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17 Pro }

        Ineligible destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17 Pro, error:unavailable }
        """))

        self.assertEqual(resolved, "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.0")

    def test_a_destination_carrying_an_error_is_never_chosen(self) -> None:
        """The backstop, for output whose headings this no longer recognises."""
        resolved = MODULE.select_destination(lines("""
        Available destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17, error:booted into recovery }
        """))

        self.assertIsNone(resolved)

    def test_the_newest_os_wins_and_the_preferred_device_wins_within_it(self) -> None:
        resolved = MODULE.select_destination(lines("""
        Available destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17 Pro }
                { platform:iOS Simulator, id:BBBB, OS:26.1, name:iPhone 17 }
                { platform:iOS Simulator, id:CCCC, OS:26.1, name:iPhone 17 Pro }
        """))

        self.assertEqual(resolved, "platform=iOS Simulator,name=iPhone 17 Pro,OS=26.1")

    def test_nothing_is_read_before_a_heading(self) -> None:
        """Warnings print above the first heading, and some of them have braces."""
        resolved = MODULE.select_destination(lines("""
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPhone 17 }

        Ineligible destinations for the "ns-marks-the-spot" scheme:
                { platform:iOS, id:placeholder, name:Any iOS Device }
        """))

        self.assertIsNone(resolved)

    def test_a_runner_with_no_iphone_simulator_resolves_nothing(self) -> None:
        """Which is what makes the job fail rather than test nothing and pass."""
        resolved = MODULE.select_destination(lines("""
        Available destinations for the "ns-marks-the-spot" scheme:
                { platform:macOS, arch:arm64, variant:Mac Catalyst, id:0000, name:My Mac }
                { platform:iOS Simulator, id:AAAA, OS:26.0, name:iPad Pro 13-inch (M4) }
        """))

        self.assertIsNone(resolved)


if __name__ == "__main__":
    unittest.main()
