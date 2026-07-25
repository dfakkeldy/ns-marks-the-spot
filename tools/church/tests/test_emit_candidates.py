import unittest

from tools.church.landmarks import BoundingBox
from tools.church.emit_candidates import (
    CandidateRow,
    format_candidates,
    parse_candidate_csv,
    resolve_candidate,
)

# A square "water" polygon with one square island punched out of it as an
# interior ring, which is how NSTDB represents islands in a water layer.
WATER = {
    "type": "FeatureCollection",
    "features": [
        {
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-61.5, 46.0],
                        [-61.5, 46.5],
                        [-61.0, 46.5],
                        [-61.0, 46.0],
                        [-61.5, 46.0],
                    ],
                    [
                        [-61.4, 46.1],
                        [-61.4, 46.2],
                        [-61.3, 46.2],
                        [-61.3, 46.1],
                        [-61.4, 46.1],
                    ],
                ],
            }
        }
    ],
}

CSV = """# a comment line
label,lon,lat,rule,box_west,box_south,box_east,box_north
south-west-corner,-61.5,46.0,west,-61.6,45.9,-61.45,46.05
the-island,-61.35,46.15,island,-61.45,46.05,-61.25,46.25
"""


class ParseTests(unittest.TestCase):
    def test_reads_rule_and_box(self) -> None:
        rows = parse_candidate_csv(CSV)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].label, "south-west-corner")
        self.assertEqual(rows[0].rule, "west")
        self.assertEqual(rows[0].box.west, -61.6)
        self.assertEqual(rows[1].rule, "island")

    def test_rejects_an_unknown_rule(self) -> None:
        text = CSV.replace("west,-61.6", "sideways,-61.6")
        with self.assertRaises(ValueError) as caught:
            parse_candidate_csv(text)
        self.assertIn("sideways", str(caught.exception))


class ResolveTests(unittest.TestCase):
    def test_extremal_rule_picks_the_named_extremity(self) -> None:
        row = parse_candidate_csv(CSV)[0]
        lon, lat = resolve_candidate(row, WATER["features"])
        self.assertAlmostEqual(lon, -61.5)
        self.assertAlmostEqual(lat, 46.0)

    def test_island_rule_returns_the_interior_ring_centroid(self) -> None:
        row = parse_candidate_csv(CSV)[1]
        lon, lat = resolve_candidate(row, WATER["features"])
        self.assertAlmostEqual(lon, -61.35)
        self.assertAlmostEqual(lat, 46.15)

    def test_an_empty_box_is_an_error_not_a_silent_skip(self) -> None:
        row = CandidateRow(
            label="offshore",
            rule="west",
            box=parse_candidate_csv(CSV)[0].box.__class__(-10.0, 10.0, -9.0, 11.0),
        )
        with self.assertRaises(ValueError):
            resolve_candidate(row, WATER["features"])


class TruncationTests(unittest.TestCase):
    """A box must SELECT a feature, never CLIP it.

    When an extremal rule returns a coordinate sitting exactly on the box edge
    it sorts by, the feature continues past the box and the "extremity" is an
    artifact of where the box was drawn. Attempt 3's `cape-rouge-west-tip`
    returned lon -61.099997 against a box_west of -61.1 and predicted onto blank
    paper, because NSTDB water polygons carry artificial offshore boundaries and
    the box had reached one.
    """

    def test_a_box_clipping_the_feature_is_refused(self) -> None:
        # WATER's outer ring runs down lon -61.5; a box reaching past it selects
        # that artificial edge rather than any real westward extremity.
        row = CandidateRow(
            label="clipped-west",
            rule="west",
            box=BoundingBox(-61.5, 46.0, -61.2, 46.4),
        )
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(row, WATER["features"])
        message = str(caught.exception)
        self.assertIn("clipped-west", message)
        self.assertIn("box_west", message)

    def test_an_extremum_on_the_perpendicular_bound_is_refused(self) -> None:
        """On a monotonic coast a `west` rule returns whatever the latitude
        bound happens to cut, not a headland.

        `pleasant-bay-west-tip` returned lat 46.800017 against a box_south of
        46.8: the north Cape Breton coast runs steadily further west as it runs
        south, so the box's own bound chose the answer. Such a point moves
        whenever the box moves and is not a physical feature at all.
        """
        row = CandidateRow(
            label="band-artifact",
            rule="west",
            box=BoundingBox(-61.6, 46.0, -61.2, 46.4),
        )
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(row, WATER["features"])
        self.assertIn("box_south", str(caught.exception))

    def test_a_genuine_extremity_interior_on_both_axes_is_accepted(self) -> None:
        row = CandidateRow(
            label="real-headland",
            rule="west",
            box=BoundingBox(-61.6, 45.9, -61.2, 46.4),
        )
        lon, lat = resolve_candidate(row, WATER["features"])
        self.assertAlmostEqual(lon, -61.5)
        self.assertAlmostEqual(lat, 46.0)

    def test_island_rule_is_exempt(self) -> None:
        row = CandidateRow(
            label="the-island",
            rule="island",
            box=BoundingBox(-61.45, 46.05, -61.25, 46.25),
        )
        self.assertAlmostEqual(resolve_candidate(row, WATER["features"])[0], -61.35)


class FormatTests(unittest.TestCase):
    def test_round_trips_through_its_own_parser(self) -> None:
        rows = parse_candidate_csv(CSV)
        resolved = [(row, resolve_candidate(row, WATER["features"])) for row in rows]
        text = format_candidates(resolved, header="# regenerated")
        self.assertTrue(text.startswith("# regenerated"))
        self.assertTrue(text.endswith("\n"))
        again = parse_candidate_csv(text)
        self.assertEqual([r.label for r in again], [r.label for r in rows])
        self.assertEqual([r.box for r in again], [r.box for r in rows])

    def test_box_bounds_survive_a_round_trip_exactly(self) -> None:
        """`%g` renders 6 significant figures, which silently moves a box edge.

        A box is the one arbitrary input a candidate has. Rewriting the file
        must never quietly nudge it, or a later `--check` compares against a
        box nobody chose.
        """
        row = CandidateRow(
            label="precise",
            rule="west",
            box=BoundingBox(-61.234567, 46.098765, -61.0, 46.5),
        )
        text = format_candidates([(row, (-61.2, 46.1))], header="#")
        self.assertIn("-61.234567", text)
        self.assertEqual(parse_candidate_csv(text)[0].box, row.box)

    def test_whole_number_bounds_keep_their_decimal_point(self) -> None:
        row = CandidateRow(label="round", rule="north", box=BoundingBox(-61.0, 46.0, -60.5, 47.0))
        self.assertIn("-61.0,46.0,-60.5,47.0", format_candidates([(row, (-61.0, 47.0))], header="#"))

    def test_is_stable_when_nothing_changed(self) -> None:
        rows = parse_candidate_csv(CSV)
        resolved = [(row, resolve_candidate(row, WATER["features"])) for row in rows]
        once = format_candidates(resolved, header="# regenerated")
        twice = format_candidates(
            [(row, resolve_candidate(row, WATER["features"])) for row in parse_candidate_csv(once)],
            header="# regenerated",
        )
        self.assertEqual(once, twice)


if __name__ == "__main__":
    unittest.main()
