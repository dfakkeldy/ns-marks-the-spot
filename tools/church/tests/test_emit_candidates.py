import unittest

from tools.church.landmarks import BoundingBox
from tools.church.emit_candidates import (
    HEADLAND_MIN_PROMINENCE_M,
    CandidateRow,
    format_candidates,
    parse_candidate_csv,
    resolve_candidate,
)


def coast_feature(lon: float, tip_offset: float = -0.02) -> dict:
    """A water polygon whose eastern edge is a coast carrying one headland.

    The tip stands 0.02 degrees of longitude off the chord, which at 46 N is
    about 1,540 m - comfortably over the 800 m prominence floor.
    """
    return {
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [lon - 0.5, 46.0],
                    [lon - 0.5, 46.2],
                    [lon, 46.2],
                    [lon, 46.16],
                    [lon, 46.12],
                    [lon + tip_offset, 46.10],
                    [lon, 46.08],
                    [lon, 46.04],
                    [lon, 46.0],
                    [lon - 0.5, 46.0],
                ]
            ],
        }
    }


COAST = [coast_feature(-61.0)]
HEADLAND_BOX = BoundingBox(west=-61.05, south=46.02, east=-60.99, north=46.18)

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


class HeadlandRuleTests(unittest.TestCase):
    """The rule that gives the north panel a candidate supply at all.

    The extremal rules name one physical point on the whole of Cape Breton no
    matter how many boxes ask for it, because the north coast simply trends.
    This one names a point wherever the coast genuinely turns.
    """

    def row(self, box: BoundingBox) -> CandidateRow:
        return CandidateRow(label="a-headland", rule="headland", box=box)

    def test_returns_the_most_prominent_point_on_the_stretch(self) -> None:
        lon, lat = resolve_candidate(self.row(HEADLAND_BOX), COAST)
        self.assertAlmostEqual(lon, -61.02, places=6)
        self.assertAlmostEqual(lat, 46.10, places=6)

    def test_a_stretch_with_nothing_prominent_is_refused(self) -> None:
        # The straight run south of the headland. An extremal rule would happily
        # return whichever end the box cut; this one has to say there is nothing
        # here to identify.
        straight = BoundingBox(west=-61.05, south=45.99, east=-60.99, north=46.09)
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(self.row(straight), COAST)
        self.assertIn("prominence", str(caught.exception))

    def test_a_feature_below_the_floor_is_refused(self) -> None:
        # 0.005 degrees of longitude at 46 N is about 386 m, under the 800 m
        # floor: a feature smaller than the error under test cannot be told from
        # its neighbour, so it must not enter a held-out set.
        small = [coast_feature(-61.0, tip_offset=-0.005)]
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(self.row(HEADLAND_BOX), small)
        self.assertIn(f"{HEADLAND_MIN_PROMINENCE_M:.0f} m", str(caught.exception))

    def test_two_shorelines_in_one_box_are_refused(self) -> None:
        # A mainland cove and an island's cape in the same box are two stretches
        # of coast. Nothing in the data says which one Church drew, and picking
        # the nearer would be the prediction choosing.
        both = [coast_feature(-61.0), coast_feature(-60.97)]
        wide = BoundingBox(west=-61.05, south=46.02, east=-60.96, north=46.18)
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(self.row(wide), both)
        self.assertIn("2 separate shorelines", str(caught.exception))

    def test_a_stretch_with_two_equal_features_is_refused(self) -> None:
        # The north panel's whole result. A second tip of nearly the same
        # prominence on the same stretch means prominence cannot say which one
        # the engraving drew, and pairing with either is a coin toss.
        # Dense enough that both tips sit clear of the endpoint margin; a sparse
        # coast puts them among the vertices that may not win, and the stretch
        # reads as flat instead.
        shore = []
        for step in range(16):
            lat = round(46.30 - 0.02 * step, 6)
            if lat == 46.20:
                shore.append([-61.020, lat])    # first tip
            elif lat == 46.10:
                shore.append([-61.019, lat])    # second tip, 95 % as prominent
            else:
                shore.append([-61.0, lat])
        twin = {
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [[-61.5, 46.0], [-61.5, 46.32]] + shore + [[-61.5, 46.0]]
                ],
            }
        }
        both = BoundingBox(west=-61.05, south=46.04, east=-60.99, north=46.26)
        with self.assertRaises(ValueError) as caught:
            resolve_candidate(self.row(both), [twin])
        self.assertIn("tell them apart", str(caught.exception))

    def test_an_empty_box_is_refused(self) -> None:
        empty = BoundingBox(west=-50.0, south=40.0, east=-49.0, north=41.0)
        with self.assertRaises(ValueError):
            resolve_candidate(self.row(empty), COAST)

    def test_the_rule_survives_a_csv_round_trip(self) -> None:
        row = self.row(HEADLAND_BOX)
        text = format_candidates([(row, resolve_candidate(row, COAST))], "# header")
        parsed = parse_candidate_csv(text)
        self.assertEqual(parsed[0].rule, "headland")
        self.assertEqual(parsed[0].box, HEADLAND_BOX)


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
