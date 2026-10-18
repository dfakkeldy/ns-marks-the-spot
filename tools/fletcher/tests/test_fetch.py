from __future__ import annotations

import pathlib
import tempfile
import unittest
import urllib.error

from tools.fletcher.fetch import download_regions


class DownloadRegionsTests(unittest.TestCase):
    def test_retries_transient_failures_with_exponential_backoff(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            attempts = 0
            delays: list[float] = []

            def fetch(_: str) -> bytes:
                nonlocal attempts
                attempts += 1
                if attempts < 3:
                    raise urllib.error.URLError("temporary")
                return b"jpeg"

            paths = download_regions(
                rumsey_id="item",
                width=2,
                height=2,
                destination=pathlib.Path(directory),
                tile_size=2,
                fetch=fetch,
                sleep=delays.append,
                courtesy_delay_seconds=0.5,
                maximum_attempts=4,
            )

            self.assertEqual([path.read_bytes() for path in paths], [b"jpeg"])
            self.assertEqual(delays, [1.0, 2.0, 0.5])

    def test_existing_region_is_never_downloaded_again(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            destination = pathlib.Path(directory)
            cached = destination / "parts" / "000000_000000_000002_000002.jpg"
            cached.parent.mkdir()
            cached.write_bytes(b"cached")

            def unexpected_fetch(_: str) -> bytes:
                self.fail("cached region was downloaded again")

            paths = download_regions(
                rumsey_id="item",
                width=2,
                height=2,
                destination=destination,
                tile_size=2,
                fetch=unexpected_fetch,
                sleep=lambda _: None,
            )

            self.assertEqual(paths, [cached])
            self.assertEqual(cached.read_bytes(), b"cached")

    def test_edge_region_filename_preserves_its_real_dimensions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            paths = download_regions(
                rumsey_id="item",
                width=3,
                height=3,
                destination=pathlib.Path(directory),
                tile_size=2,
                fetch=lambda _: b"jpeg",
                sleep=lambda _: None,
            )

            self.assertEqual(
                [path.name for path in paths],
                [
                    "000000_000000_000002_000002.jpg",
                    "000002_000000_000001_000002.jpg",
                    "000000_000002_000002_000001.jpg",
                    "000002_000002_000001_000001.jpg",
                ],
            )


if __name__ == "__main__":
    unittest.main()
