import unittest

from tools.church.drawn import InkMask
from tools.church.paper_islands import paper_islands_in, select_paper_island


def mask_of(art: list[str]) -> InkMask:
    return InkMask(
        width=max(len(row) for row in art),
        height=len(art),
        pixels={
            (x, y)
            for y, row in enumerate(art)
            for x, character in enumerate(row)
            if character == "#"
        },
    )


class PaperIslandTests(unittest.TestCase):
    def test_reads_the_enclosed_paper_not_the_connected_ink_blob(self):
        mask = mask_of(
            [
                ".............",
                ".###########.",
                ".#.........#.",
                ".#.........#.",
                ".#...###...#.",
                ".#.........#.",
                ".#.........#.",
                ".###########.",
                ".............",
            ]
        )

        islands = paper_islands_in(mask, min_paper=5)

        self.assertEqual(len(islands), 1)
        self.assertAlmostEqual(islands[0].centroid_x, 6.0, delta=0.2)
        self.assertAlmostEqual(islands[0].centroid_y, 4.0, delta=0.2)

    def test_drops_the_border_connected_sea(self):
        mask = mask_of(
            [
                ".........",
                "..#####..",
                "..#...#..",
                "..#...#..",
                "..#...#..",
                "..#####..",
                ".........",
            ]
        )

        islands = paper_islands_in(mask, min_paper=1)

        self.assertEqual(len(islands), 1)
        self.assertFalse(islands[0].touches_border)

    def test_drops_regions_smaller_than_the_floor(self):
        mask = mask_of(
            [
                ".........",
                ".###.###.",
                ".#.#.#.#.",
                ".###.###.",
                ".........",
            ]
        )

        self.assertEqual(paper_islands_in(mask, min_paper=2), [])


class PaperIslandSelectionTests(unittest.TestCase):
    def test_the_qa_derived_area_band_admits_half_to_one_and_a_half(self):
        shape = paper_islands_in(
            mask_of(
                [
                    ".........",
                    ".#######.",
                    ".#.....#.",
                    ".#.....#.",
                    ".#######.",
                    ".........",
                ]
            ),
            min_paper=1,
        )[0]
        expected = shape.enclosed_area / 0.50

        selected = select_paper_island(
            [shape],
            expected_area_px=expected,
            prediction=(3.0, 2.0),
            radius_px=100.0,
        )

        self.assertIsNotNone(selected.shape)

    def test_rejects_the_incomplete_fragment_seen_at_area_ratio_point_45(self):
        shape = paper_islands_in(
            mask_of(
                [
                    ".........",
                    ".#######.",
                    ".#.....#.",
                    ".#.....#.",
                    ".#######.",
                    ".........",
                ]
            ),
            min_paper=1,
        )[0]
        expected = shape.enclosed_area / 0.49

        selected = select_paper_island(
            [shape],
            expected_area_px=expected,
            prediction=(3.0, 2.0),
            radius_px=100.0,
        )

        self.assertIsNone(selected.shape)


if __name__ == "__main__":
    unittest.main()
