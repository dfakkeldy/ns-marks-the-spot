import pathlib
import unittest
from unittest import mock

from tools.church.prepare_vrt import main


class PrepareVrtTests(unittest.TestCase):
    def test_cli_builds_the_registered_panel_crop_without_warping(self) -> None:
        with (
            mock.patch(
                "tools.church.prepare_vrt.load_gcps",
                return_value=[],
            ),
            mock.patch("tools.church.prepare_vrt.subprocess.run") as run,
        ):
            main(
                [
                    "victoria",
                    "main",
                    "--source",
                    "victoria.tif",
                    "--gcps",
                    "victoria-main.csv",
                    "--out",
                    "comparison/main.vrt",
                ]
            )

        command = run.call_args.args[0]
        self.assertEqual(command[command.index("-of") + 1], "VRT")
        self.assertEqual(
            command[command.index("-srcwin") + 1 : command.index("-srcwin") + 5],
            ["13800", "1200", "19400", "28800"],
        )
        self.assertEqual(command[-2:], ["victoria.tif", "comparison/main.vrt"])
        self.assertEqual(run.call_args.kwargs, {"check": True})


if __name__ == "__main__":
    unittest.main()
