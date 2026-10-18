"""Cover candidate pre-positioning: paging, frame filtering, gap selection, CSV."""

from __future__ import annotations

import unittest

from tools.fletcher.fetch_nstdb_extract import PAGE, fetch
from tools.fletcher.predict_candidate_pixels import (
    build_csv,
    inside,
    inverse_transform,
    select_sparsest,
)


class FetchPagingTest(unittest.TestCase):
    def test_follows_the_servers_truncation_flag(self):
        pages = [
            {"features": [{"id": i} for i in range(PAGE)], "exceededTransferLimit": True},
            {"features": [{"id": "last"}], "exceededTransferLimit": False},
        ]
        seen = []

        def getter(url, params):
            seen.append(int(params["resultOffset"]))
            return pages[len(seen) - 1]

        result = fetch("http://example/0", "0,0,1,1", getter=getter)
        self.assertEqual(len(result["features"]), PAGE + 1)
        self.assertEqual(seen, [0, PAGE])

    def test_stops_on_a_short_page_when_the_flag_is_absent(self):
        # Some layers omit exceededTransferLimit; a short page is the only
        # signal left, and without this the loop would never terminate.
        def getter(url, params):
            return {"features": [{"id": 1}]}

        result = fetch("http://example/0", "0,0,1,1", getter=getter)
        self.assertEqual(len(result["features"]), 1)

    def test_empty_truncated_page_is_an_error(self):
        def getter(url, params):
            return {"features": [], "exceededTransferLimit": True}

        with self.assertRaisesRegex(RuntimeError, "empty.*truncated"):
            fetch("http://e/0", "0,0,1,1", getter=getter)

    def test_service_error_after_a_page_cannot_return_a_partial_extract(self):
        pages = iter([
            {"features": [{"id": i} for i in range(PAGE)]},
            {"error": {"code": 400, "message": "Failed to execute query."}},
        ])
        with self.assertRaisesRegex(RuntimeError, "400"):
            fetch("http://e/0", "0,0,1,1", getter=lambda *_: next(pages))

    def test_missing_features_is_not_an_empty_success(self):
        with self.assertRaisesRegex(RuntimeError, "features"):
            fetch("http://e/0", "0,0,1,1", getter=lambda *_: {})

    def test_real_empty_response_remains_valid(self):
        self.assertEqual(fetch("http://e/0", "0,0,1,1", getter=lambda *_: {"features": []})["features"], [])


class SelectionTest(unittest.TestCase):
    FRAME = [[0, 0], [100, 0], [100, 100], [0, 100]]

    def test_frame_filtering_uses_the_usable_frame_bounds(self):
        self.assertTrue(inside(self.FRAME, 50, 50))
        self.assertFalse(inside(self.FRAME, 150, 50))
        self.assertFalse(inside(self.FRAME, 50, -1))

    def test_fills_the_widest_gap_first(self):
        existing = [(0.0, 0.0)]
        candidates = [
            {"id": "near", "px": 10.0, "py": 0.0},
            {"id": "far", "px": 90.0, "py": 0.0},
            {"id": "mid", "px": 50.0, "py": 0.0},
        ]
        picked = select_sparsest(existing, candidates, count=3, min_gap_px=1.0)
        self.assertEqual([p["id"] for p in picked], ["far", "mid", "near"])

    def test_seeding_with_existing_controls_stops_crowding_them(self):
        # Without the seed, a candidate sitting on top of a placed control
        # would be picked first and buy nothing.
        existing = [(50.0, 50.0)]
        candidates = [
            {"id": "on-top", "px": 51.0, "py": 50.0},
            {"id": "gap", "px": 99.0, "py": 99.0},
        ]
        picked = select_sparsest(existing, candidates, count=1, min_gap_px=1.0)
        self.assertEqual([p["id"] for p in picked], ["gap"])

    def test_stops_once_every_remaining_gap_is_below_the_floor(self):
        existing = [(0.0, 0.0)]
        candidates = [{"id": "a", "px": 5.0, "py": 0.0}]
        self.assertEqual(select_sparsest(existing, candidates, 5, min_gap_px=100.0), [])


class CsvTest(unittest.TestCase):
    OBS = {
        "sheet_id": 19,
        "usable_frame": [[0, 0], [100, 0], [100, 100], [0, 100]],
        "controls": [
            {"id": "c1", "pixel": {"x": 10.0, "y": 20.0}, "lonlat": {"lon": -61.5, "lat": 45.9}}
        ],
    }

    def test_accepted_controls_come_before_proposals(self):
        # The panel numbers rows in file order and does not show labels, so
        # "everything above N needs dragging" is the only usable rule.
        csv = build_csv(self.OBS, [{"id": "cand-1", "px": 80.0, "py": 80.0, "lon": -61.2, "lat": 45.8}])
        body = [l for l in csv.splitlines() if not l.startswith("#") and not l.startswith("pixel_x")]
        self.assertTrue(body[0].endswith(",control,c1"))
        self.assertTrue(body[1].endswith(",control,cand-1"))

    def test_header_warns_that_a_proposals_residual_reads_zero(self):
        # A prediction sits exactly where the fit expects it, so residual
        # cannot be used to find undragged pins. Saying so is the only guard.
        csv = build_csv(self.OBS, [{"id": "c-1", "px": 1.0, "py": 1.0, "lon": -61.0, "lat": 45.0}])
        comments = "\n".join(l for l in csv.splitlines() if l.startswith("#"))
        self.assertIn("residual reads 0", comments)
        self.assertIn("Rows 2-2 are PROPOSALS", comments)


class InverseTransformTest(unittest.TestCase):
    def test_builds_an_inverted_tps_and_parses_pixels_back(self):
        captured = {}

        def runner(command, stdin):
            captured["command"] = command
            captured["stdin"] = stdin
            return "123.5 456.5 0\n"

        out = inverse_transform(
            [{"pixel": {"x": 1, "y": 2}, "lonlat": {"lon": -61.0, "lat": 45.0}}],
            [(-61.5, 45.9)],
            runner=runner,
        )
        self.assertEqual(out, [(123.5, 456.5)])
        # `-i` is what makes this lon/lat -> pixel rather than the forward warp.
        self.assertIn("-i", captured["command"])
        self.assertIn("-tps", captured["command"])
        self.assertIn("-gcp", captured["command"])


if __name__ == "__main__":
    unittest.main()
