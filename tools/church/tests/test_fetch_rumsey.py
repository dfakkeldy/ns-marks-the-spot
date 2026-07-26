import unittest

from tools.church import fetch_rumsey
from tools.church.fetch_rumsey import (
    IIIF_BASE,
    canvas_size,
    manifest_url,
    plan_regions,
    region_url,
)

INVERNESS_ID = "RUMSEY~8~1~353591~90120835"

# Trimmed from the live manifest, recorded 2026-07-24. Tests never hit the network.
MANIFEST_FIXTURE = {
    "label": "Topographical township map Inverness County, Nova Scotia",
    "attribution": "David Rumsey Historical Map Collection",
    "sequences": [
        {
            "canvases": [
                {
                    "width": 34427,
                    "height": 34543,
                    "images": [
                        {
                            "resource": {
                                "service": {
                                    "@id": f"{IIIF_BASE}/{INVERNESS_ID}",
                                    "profile": "http://iiif.io/api/image/2/level1.json",
                                }
                            }
                        }
                    ],
                }
            ]
        }
    ],
}


class UrlTests(unittest.TestCase):
    def test_manifest_url_uses_the_working_host(self) -> None:
        url = manifest_url(INVERNESS_ID)
        self.assertEqual(url, f"{IIIF_BASE}/m/{INVERNESS_ID}/manifest")
        # iiif.davidrumsey.com is NXDOMAIN - guard against regressing to it.
        self.assertNotIn("iiif.davidrumsey.com", url)

    def test_region_url_is_iiif_shaped(self) -> None:
        url = region_url(INVERNESS_ID, 0, 0, 2048, 2048, 2048)
        self.assertEqual(url, f"{IIIF_BASE}/{INVERNESS_ID}/0,0,2048,2048/2048,/0/default.jpg")


class ManifestTests(unittest.TestCase):
    def test_reads_canvas_dimensions(self) -> None:
        self.assertEqual(canvas_size(MANIFEST_FIXTURE), (34427, 34543))

    def test_raises_on_a_manifest_without_canvases(self) -> None:
        with self.assertRaises(ValueError):
            canvas_size({"sequences": [{"canvases": []}]})


class PlanRegionsTests(unittest.TestCase):
    def test_single_region_when_image_fits_one_tile(self) -> None:
        self.assertEqual(plan_regions(100, 80, tile_size=2048), [(0, 0, 100, 80)])

    def test_tiles_cover_the_image_exactly_without_overlap(self) -> None:
        width, height, tile = 5000, 4000, 2048
        regions = plan_regions(width, height, tile_size=tile)
        self.assertEqual(sum(w * h for _, _, w, h in regions), width * height)
        for x, y, w, h in regions:
            self.assertLessEqual(x + w, width)
            self.assertLessEqual(y + h, height)
            self.assertGreater(w, 0)
            self.assertGreater(h, 0)

    def test_edge_tiles_are_clipped_not_padded(self) -> None:
        regions = plan_regions(3000, 2048, tile_size=2048)
        self.assertIn((2048, 0, 952, 2048), regions)

    def test_inverness_full_size_plans_a_sane_tile_count(self) -> None:
        regions = plan_regions(34427, 34543, tile_size=2048)
        self.assertEqual(len(regions), 17 * 17)

    def test_rejects_non_positive_tile_size(self) -> None:
        with self.assertRaises(ValueError):
            plan_regions(100, 100, tile_size=0)


class RegionVrtBoundsTests(unittest.TestCase):
    def test_edge_region_uses_its_clipped_dimensions(self) -> None:
        bounds = getattr(fetch_rumsey, "region_vrt_bounds", None)
        self.assertIsNotNone(bounds)
        if bounds is None:
            return
        self.assertEqual(bounds(34816, 28672, 919, 1757), (34816, -28672, 35735, -30429))


if __name__ == "__main__":
    unittest.main()
