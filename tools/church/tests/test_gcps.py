import unittest

from tools.church.gcps import (
    CHECK_ROLE,
    CONTROL_ROLE,
    GroundControlPoint,
    parse_gcp_csv,
    split_roles,
)
from tools.church.geometry import lonlat_to_mercator

VALID_CSV = """pixel_x,pixel_y,lon,lat,role,label
1000,2000,-61.5,46.1,control,Port Hood wharf
5000,7000,-61.2,46.3,control,Mabou bridge
9000,9000,-61.0,46.5,check,Inverness station
"""


class ParseTests(unittest.TestCase):
    def test_parses_every_row(self) -> None:
        points = parse_gcp_csv(VALID_CSV)
        self.assertEqual(len(points), 3)
        self.assertEqual(points[0].label, "Port Hood wharf")
        self.assertEqual(points[0].pixel_x, 1000.0)
        self.assertEqual(points[2].role, CHECK_ROLE)

    def test_mercator_matches_the_geometry_module(self) -> None:
        point = parse_gcp_csv(VALID_CSV)[0]
        self.assertEqual(point.mercator, lonlat_to_mercator(-61.5, 46.1))

    def test_blank_lines_and_comments_are_skipped(self) -> None:
        text = "# a comment\n" + VALID_CSV + "\n\n# trailing note\n"
        self.assertEqual(len(parse_gcp_csv(text)), 3)

    def test_rejects_unknown_role(self) -> None:
        text = VALID_CSV.replace("control,Port Hood wharf", "bogus,Port Hood wharf")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("bogus", str(caught.exception))

    def test_rejects_out_of_range_latitude(self) -> None:
        text = VALID_CSV.replace(",46.1,", ",946.1,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("latitude", str(caught.exception).lower())

    def test_rejects_out_of_range_longitude(self) -> None:
        text = VALID_CSV.replace("-61.5,", "-361.5,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("longitude", str(caught.exception).lower())

    def test_rejects_negative_pixel_coordinates(self) -> None:
        text = VALID_CSV.replace("1000,2000,", "-1000,2000,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("pixel", str(caught.exception).lower())

    def test_error_names_the_offending_line_number(self) -> None:
        # Header is line 1, so the second data row ("Mabou bridge") is line 3.
        text = VALID_CSV.replace(",46.3,", ",946.3,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("line 3", str(caught.exception))

    def test_line_numbers_account_for_skipped_comment_lines(self) -> None:
        # Reported numbers must match what an editor shows, or they are useless
        # for finding one bad point among several hundred.
        text = "# note\n# another\n" + VALID_CSV.replace(",46.3,", ",946.3,")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("line 5", str(caught.exception))

    def test_empty_input_is_rejected(self) -> None:
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv("# only a comment\n\n")
        self.assertIn("empty", str(caught.exception).lower())

    def test_rejects_missing_required_column(self) -> None:
        text = VALID_CSV.replace("pixel_x,pixel_y,lon,lat,role,label", "pixel_x,pixel_y,lon,lat,role")
        with self.assertRaises(ValueError) as caught:
            parse_gcp_csv(text)
        self.assertIn("label", str(caught.exception))


class SplitTests(unittest.TestCase):
    def test_splits_control_from_check(self) -> None:
        control, check = split_roles(parse_gcp_csv(VALID_CSV))
        self.assertEqual(len(control), 2)
        self.assertEqual(len(check), 1)
        self.assertTrue(all(p.role == CONTROL_ROLE for p in control))
        self.assertTrue(all(p.role == CHECK_ROLE for p in check))

    def test_split_of_empty_input_is_two_empty_lists(self) -> None:
        self.assertEqual(split_roles([]), ([], []))

    def test_point_is_hashable_and_frozen(self) -> None:
        point = GroundControlPoint(1.0, 2.0, -61.0, 46.0, CONTROL_ROLE, "x")
        self.assertIsInstance(hash(point), int)
        with self.assertRaises(Exception):
            point.lat = 0.0  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
