import unittest

from tools.church.blocks import block_min, reduced_shape, strip_plan


class ReducedShapeTests(unittest.TestCase):
    def test_exact_division(self):
        self.assertEqual(reduced_shape(100, 80, 4), (25, 20))

    def test_discards_a_partial_trailing_block(self):
        # Truncating keeps reduced * factor an exact source coordinate, with no
        # special case at the far margin.
        self.assertEqual(reduced_shape(103, 82, 4), (25, 20))

    def test_factor_of_one_is_the_identity(self):
        self.assertEqual(reduced_shape(103, 82, 1), (103, 82))

    def test_rejects_a_zero_factor(self):
        with self.assertRaises(ValueError):
            reduced_shape(100, 100, 0)

    def test_rejects_a_negative_size(self):
        with self.assertRaises(ValueError):
            reduced_shape(-1, 100, 4)


class StripPlanTests(unittest.TestCase):
    def test_covers_every_output_row_exactly_once(self):
        strips = strip_plan(out_height=1000, factor=4, max_source_rows=4096)
        self.assertEqual(sum(strip.out_rows for strip in strips), 1000)
        expected = 0
        for strip in strips:
            self.assertEqual(strip.out_y, expected)
            expected += strip.out_rows

    def test_never_splits_a_block_across_two_reads(self):
        for strip in strip_plan(out_height=1000, factor=4, max_source_rows=4090):
            self.assertEqual(strip.source_rows(4) % 4, 0)

    def test_a_short_raster_is_one_strip(self):
        self.assertEqual(len(strip_plan(out_height=10, factor=4, max_source_rows=4096)), 1)

    def test_rejects_a_strip_too_small_to_hold_a_block(self):
        with self.assertRaises(ValueError):
            strip_plan(out_height=100, factor=8, max_source_rows=4)


class BlockMinTests(unittest.TestCase):
    def test_takes_the_darkest_pixel_in_each_block(self):
        rows = [[9, 9, 9, 9], [9, 3, 9, 9], [9, 9, 9, 1], [9, 9, 9, 9]]
        self.assertEqual(block_min(rows, 2), [[3, 9], [9, 1]])

    def test_a_hairline_survives_reduction(self):
        # The property that makes this the right reduction: a one-pixel dark
        # rule on a light ground is still dark afterwards. An average would put
        # it at 240 of 255 and the Hough transform would never see it.
        rows = [[255] * 8 for _ in range(8)]
        for y in range(8):
            rows[y][3] = 0
        reduced = block_min(rows, 4)
        self.assertEqual(reduced, [[0, 255], [0, 255]])

    def test_factor_of_one_is_the_identity(self):
        rows = [[1, 2], [3, 4]]
        self.assertEqual(block_min(rows, 1), rows)

    def test_discards_a_partial_trailing_block(self):
        rows = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
        self.assertEqual(block_min(rows, 2), [[1]])

    def test_empty_input(self):
        self.assertEqual(block_min([], 4), [])

    def test_rejects_a_ragged_grid(self):
        with self.assertRaises(ValueError):
            block_min([[1, 2], [3]], 1)

    def test_rejects_a_zero_factor(self):
        with self.assertRaises(ValueError):
            block_min([[1]], 0)


if __name__ == "__main__":
    unittest.main()
