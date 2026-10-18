import unittest

from tools.church.make_tiles import tile_command


class TileCommandTests(unittest.TestCase):
    def test_uses_xyz_scheme_not_tms(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertIn("--xyz", command)

    def test_passes_the_zoom_range(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertIn("--zoom=8-16", command)

    def test_rejects_inverted_zoom_range(self) -> None:
        with self.assertRaises(ValueError):
            tile_command("warped.tif", "out", 16, 8)

    def test_names_the_input_and_output_last(self) -> None:
        command = tile_command("warped.tif", "tiles/church-inverness", 8, 16)
        self.assertEqual(command[-2:], ["warped.tif", "tiles/church-inverness"])


if __name__ == "__main__":
    unittest.main()
