import unittest

from tools.church.chords import Plane
from tools.church.drawn import InkMask
from tools.church.headlands import (
    MERGE_TOLERANCE_PX,
    PROMINENCE_RATIO_MAX,
    PROMINENCE_RATIO_MIN,
    HeadlandCandidate,
    coast_path,
    headlands_in,
    merge_opposing_faces,
    paper_regions,
    select_headland,
)

PIXELS = Plane(x_metres=1.0, y_metres=1.0)
"""One metre per pixel, so a test can read prominence straight off the fixture."""


def mask_from(art: str) -> InkMask:
    """Build an ink mask from ASCII art: '#' is ink, '.' is paper."""
    # Per line, not just the block: the triple-quoted fixtures below carry the
    # source file's indentation, and leading spaces would read as paper and
    # silently widen every tile.
    rows = [line.strip() for line in art.strip().splitlines()]
    width = max(len(row) for row in rows)
    pixels = {
        (x, y)
        for y, row in enumerate(rows)
        for x, character in enumerate(row)
        if character == "#"
    }
    return InkMask(width=width, height=len(rows), pixels=pixels)


def coast_mask(width: int, height: int, profile, thickness: int = 2) -> InkMask:
    """A shoreline stroke at y = profile(x), sea above it and land below."""
    pixels = set()
    for x in range(width):
        for step in range(thickness):
            y = profile(x) + step
            if 0 <= y < height:
                pixels.add((x, y))
    return InkMask(width=width, height=height, pixels=pixels)


def triangular_headland(base: int, peak_x: int, height: int, half_width: int):
    """A coast at `base` carrying one triangular headland pointing at the sea."""

    def profile(x: int) -> int:
        rise = max(0.0, height * (1.0 - abs(x - peak_x) / half_width))
        return base - int(round(rise))

    return profile


class PaperRegionsTests(unittest.TestCase):
    def test_a_diagonal_ink_line_seals_the_paper(self):
        # The whole reason paper is filled 4-connected while ink is traced
        # 8-connected. Church draws shorelines as hairlines that the scan
        # renders as single-pixel diagonal steps; 8-connected paper squeezes
        # straight through them and the "sea" swallows the county.
        mask = mask_from(
            """
            #...
            .#..
            ..#.
            ...#
            """
        )
        regions = paper_regions(mask, min_area=1)
        self.assertEqual(len(regions), 2)
        self.assertEqual(sorted(len(region) for region in regions), [6, 6])

    def test_regions_come_back_largest_first(self):
        mask = mask_from(
            """
            ..####
            ..#..#
            ..####
            ######
            """
        )
        regions = paper_regions(mask, min_area=1)
        self.assertGreater(len(regions), 1)
        self.assertEqual(
            [len(region) for region in regions],
            sorted((len(region) for region in regions), reverse=True),
        )

    def test_regions_smaller_than_the_floor_are_dropped(self):
        mask = mask_from(
            """
            ....##
            ....##
            ######
            #....#
            ######
            """
        )
        # The 4-pixel enclosed cell goes; the 8-pixel top-left block stays.
        regions = paper_regions(mask, min_area=5)
        self.assertEqual([len(region) for region in regions], [8])

    def test_an_all_ink_tile_has_no_paper(self):
        self.assertEqual(paper_regions(mask_from("####\n####"), min_area=1), [])


class CoastPathTests(unittest.TestCase):
    def test_cuts_the_traced_boundary_at_the_tile_edge(self):
        # A region's traced boundary is closed: it runs along the shoreline and
        # then back along the tile border. Only the shoreline part is coast, and
        # a closed ring has no chord anyway - its two ends are one vertex.
        mask = coast_mask(60, 40, lambda x: 20)
        sea = max(paper_regions(mask, min_area=10), key=len)
        path = coast_path(sea, mask)
        self.assertGreater(len(path), 40)
        self.assertTrue(all(not mask.on_border(x, y) for x, y in path))
        # A flat coast, so every vertex sits just above the stroke.
        self.assertTrue(all(y == 19 for _, y in path))

    def test_refuses_a_region_reaching_the_border_in_three_places(self):
        # Three border arcs means three separate stretches of coast in one tile,
        # and no single chord describes them.
        mask = mask_from(
            """
            ..#....#..
            ..#....#..
            ..#....#..
            ..........
            """
        )
        top = max(paper_regions(mask, min_area=1), key=len)
        with self.assertRaises(ValueError) as raised:
            coast_path(top, mask)
        self.assertIn("stretch", str(raised.exception).lower())

    def test_refuses_a_region_that_never_reaches_the_border(self):
        # Paper fully enclosed by ink is a field, a lake or the inside of a
        # letter - not a shore. Its boundary is closed with nothing to cut.
        mask = mask_from(
            """
            ######
            #....#
            #....#
            ######
            """
        )
        enclosed = min(paper_regions(mask, min_area=1), key=len)
        with self.assertRaises(ValueError) as raised:
            coast_path(enclosed, mask)
        self.assertIn("border", str(raised.exception).lower())


class HeadlandsInTests(unittest.TestCase):
    """The two faces of one engraved stroke, and what they say about each other."""

    def tile(self):
        return coast_mask(140, 80, triangular_headland(40, 70, 12, 20))

    def test_finds_the_drawn_headland_at_its_tip(self):
        found = headlands_in(self.tile(), min_area=200, min_prominence_m=4.0, plane=PIXELS)
        self.assertTrue(found)
        best = max(found, key=lambda candidate: abs(candidate.prominence_m))
        self.assertAlmostEqual(best.x, 70.0, delta=2.0)
        self.assertAlmostEqual(abs(best.prominence_m), 12.0, delta=2.0)

    def test_the_sea_and_land_faces_both_see_it(self):
        # The stroke has two sides and both bulge seaward together. Finding it
        # twice is not duplication - it is the only free corroboration available,
        # and their midpoint cancels the stroke's own thickness.
        found = headlands_in(self.tile(), min_area=200, min_prominence_m=4.0, plane=PIXELS)
        self.assertEqual(len(found), 2)
        near_tip = [c for c in found if abs(c.x - 70.0) <= 2.0]
        self.assertEqual(len(near_tip), 2)
        self.assertNotAlmostEqual(near_tip[0].y, near_tip[1].y, delta=0.5)

    def test_the_two_faces_are_traversed_in_opposite_directions(self):
        # Load-bearing for the merge: the boundary trace runs clockwise around
        # whichever blob it is given, so the shared shoreline is walked one way
        # from the sea and the other way from the land. Same bulge, opposite
        # sign. Two candidates agreeing in SIGN are not two faces of one stroke.
        found = headlands_in(self.tile(), min_area=200, min_prominence_m=4.0, plane=PIXELS)
        self.assertEqual(len(found), 2)
        self.assertLess(found[0].prominence_m * found[1].prominence_m, 0.0)

    def test_a_flat_coast_yields_nothing(self):
        flat = coast_mask(140, 80, lambda x: 40)
        self.assertEqual(
            headlands_in(flat, min_area=200, min_prominence_m=4.0, plane=PIXELS), []
        )


class MergeOpposingFacesTests(unittest.TestCase):
    def face(self, x, y, prominence):
        return HeadlandCandidate(
            x=x, y=y, prominence_m=prominence, runner_up_m=None, path_length=100,
            region_pixels=5000,
        )

    def test_two_faces_of_one_stroke_become_one_feature_at_their_midpoint(self):
        merged = merge_opposing_faces(
            [self.face(70.0, 28.0, 12.0), self.face(70.0, 32.0, -12.0)]
        )
        self.assertEqual(len(merged), 1)
        self.assertAlmostEqual(merged[0].y, 30.0, places=6)
        self.assertEqual(merged[0].sides, 2)
        self.assertAlmostEqual(merged[0].prominence_m, 12.0, places=6)

    def test_a_lone_face_survives_but_says_so(self):
        # Usable - one face still names the tip - but the stroke's own thickness
        # is no longer cancelled, and the audit has to show that.
        merged = merge_opposing_faces([self.face(70.0, 28.0, 12.0)])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].sides, 1)

    def test_two_nearby_features_of_the_same_sign_are_not_merged(self):
        # Same sign means the same traversal direction, so these are not the two
        # faces of one stroke; they are two readings that genuinely disagree.
        merged = merge_opposing_faces(
            [self.face(70.0, 28.0, 12.0), self.face(70.0, 31.0, 12.0)]
        )
        self.assertEqual(len(merged), 2)

    def test_features_further_apart_than_a_stroke_stay_separate(self):
        merged = merge_opposing_faces(
            [
                self.face(70.0, 28.0, 12.0),
                self.face(70.0, 28.0 + MERGE_TOLERANCE_PX * 3, -12.0),
            ]
        )
        self.assertEqual(len(merged), 2)


class SelectHeadlandTests(unittest.TestCase):
    """Anti-circularity. Prominence chooses; the prediction only narrows."""

    def candidate(self, x, y, prominence):
        return HeadlandCandidate(
            x=x, y=y, prominence_m=prominence, runner_up_m=None, path_length=100,
            region_pixels=5000, sides=2,
        )

    def test_prominence_decides_not_proximity(self):
        # The decoy sits ON the prediction and is the wrong size; the real
        # feature is 300 px away and the right size. Selecting by nearness would
        # drag the answer onto the transform being tested and dissolve any
        # systematic offset into apparent scatter.
        decoy = self.candidate(1000.0, 1000.0, 200.0)
        real = self.candidate(1300.0, 1000.0, 950.0)
        chosen = select_headland(
            [decoy, real],
            expected_prominence_m=1000.0,
            prediction=(1000.0, 1000.0),
            radius_px=500.0,
        )
        self.assertIs(chosen.candidate, real)

    def test_search_radius_cannot_invent_a_match(self):
        # Widening the radius may only ever ADD candidates to judge. It must
        # never turn a refusal into an acceptance of something the size band
        # already rejected.
        wrong_size = self.candidate(1000.0, 1000.0, 100.0)
        for radius in (100.0, 1000.0, 100000.0):
            chosen = select_headland(
                [wrong_size],
                expected_prominence_m=1000.0,
                prediction=(1000.0, 1000.0),
                radius_px=radius,
            )
            self.assertIsNone(chosen.candidate, msg=f"radius {radius}")

    def test_nothing_within_the_radius_is_refused(self):
        far = self.candidate(9000.0, 9000.0, 1000.0)
        chosen = select_headland(
            [far], expected_prominence_m=1000.0, prediction=(0.0, 0.0), radius_px=500.0
        )
        self.assertIsNone(chosen.candidate)
        self.assertIn("within", chosen.reason)

    def test_two_candidates_fitting_the_band_are_refused(self):
        # A guess recorded as a measurement is worse than a gap.
        chosen = select_headland(
            [self.candidate(1000.0, 1000.0, 980.0), self.candidate(1100.0, 1000.0, 1020.0)],
            expected_prominence_m=1000.0,
            prediction=(1000.0, 1000.0),
            radius_px=500.0,
        )
        self.assertIsNone(chosen.candidate)
        self.assertIn("ambiguous", chosen.reason)

    def test_the_sign_of_prominence_does_not_decide(self):
        # Traversal direction sets the sign and it is arbitrary, so magnitude is
        # the only comparable quantity across the two representations.
        chosen = select_headland(
            [self.candidate(1000.0, 1000.0, -1000.0)],
            expected_prominence_m=1000.0,
            prediction=(1000.0, 1000.0),
            radius_px=500.0,
        )
        self.assertIsNotNone(chosen.candidate)

    def test_the_ratio_band_is_reported_so_a_reader_can_weigh_it(self):
        chosen = select_headland(
            [self.candidate(1000.0, 1000.0, 1200.0)],
            expected_prominence_m=1000.0,
            prediction=(1000.0, 1000.0),
            radius_px=500.0,
        )
        self.assertAlmostEqual(chosen.prominence_ratio, 1.2, places=6)

    def test_a_band_edge_is_inclusive_at_both_ends(self):
        for ratio in (PROMINENCE_RATIO_MIN, PROMINENCE_RATIO_MAX):
            chosen = select_headland(
                [self.candidate(1000.0, 1000.0, 1000.0 * ratio)],
                expected_prominence_m=1000.0,
                prediction=(1000.0, 1000.0),
                radius_px=500.0,
            )
            self.assertIsNotNone(chosen.candidate, msg=f"ratio {ratio}")

    def test_a_non_positive_expectation_is_refused(self):
        with self.assertRaises(ValueError):
            select_headland(
                [], expected_prominence_m=0.0, prediction=(0.0, 0.0), radius_px=1.0
            )


if __name__ == "__main__":
    unittest.main()
