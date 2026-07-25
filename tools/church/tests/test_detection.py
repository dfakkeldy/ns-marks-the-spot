import json
import math
import pathlib
import unittest

from tools.church.detection import build_mesh, load_detection, parse_detection
from tools.church.gcps import CONTROL_ROLE, load_gcps
from tools.church.panels import get_panel

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
DETECTIONS = REPO_ROOT / "tools" / "church" / "detections"
GCPS = REPO_ROOT / "tools" / "church" / "gcps"

# Deliberately NOT redeclared here. The anchor and thresholds are measurements
# committed on the panel; a test that restated them would pass while the
# shipped pipeline used something else.
NORTH = get_panel("inverness", "north")
SOUTH = get_panel("inverness", "south")
RICHMOND = get_panel("richmond", "main")
ANY_ANCHOR = NORTH.graticule.anchor


def line(**overrides) -> dict:
    entry = {"cx": 0.0, "cy": 0.0, "dx": 1.0, "dy": 0.0, "extent_px": 100.0, "support": 1}
    entry.update(overrides)
    return entry


def artifact(**overrides) -> str:
    payload = {
        "panel": "north",
        "factor": 4,
        "origin": [1050, 780],
        "primary_angle_deg": 84.5,
        "secondary_angle_deg": 174.5,
        "family_a": [],
        "family_b": [],
    }
    payload.update(overrides)
    return json.dumps(payload)


class ParseDetectionTests(unittest.TestCase):
    def test_lifts_reduced_crop_pixels_to_full_sheet(self):
        detection = parse_detection(artifact(family_a=[line(cx=10.0, cy=20.0)]))
        self.assertEqual(
            (detection.family_a[0].cx, detection.family_a[0].cy), (1090.0, 860.0)
        )

    def test_scales_extent_but_not_direction(self):
        detection = parse_detection(
            artifact(family_a=[line(dx=0.6, dy=0.8, extent_px=100.0)])
        )
        fitted = detection.family_a[0]
        self.assertEqual(fitted.extent_px, 400.0)
        self.assertEqual((fitted.dx, fitted.dy), (0.6, 0.8))

    def test_rejects_a_missing_key(self):
        payload = json.loads(artifact())
        del payload["origin"]
        with self.assertRaises(ValueError) as caught:
            parse_detection(json.dumps(payload))
        self.assertIn("origin", str(caught.exception))

    def test_rejects_a_non_positive_factor(self):
        with self.assertRaises(ValueError):
            parse_detection(artifact(factor=0))


class BuildMeshTests(unittest.TestCase):
    def test_crosses_every_pair_of_lines(self):
        detection = parse_detection(
            artifact(
                factor=1,
                origin=[0, 0],
                family_a=[line(cx=x, cy=0.0, dx=0.0, dy=1.0) for x in (0.0, 1000.0)],
                family_b=[line(cx=0.0, cy=y, dx=1.0, dy=0.0) for y in (0.0, 800.0, 1600.0)],
            )
        )
        build = build_mesh(detection, ANY_ANCHOR, tolerance=50.0)
        self.assertEqual(len(build.mesh.intersections), 6)

    def test_reports_which_family_failed_to_fit(self):
        detection = parse_detection(
            artifact(
                factor=1,
                origin=[0, 0],
                family_a=[line(cx=0.0, dx=0.0, dy=1.0)],
                family_b=[line(cy=y, dx=1.0, dy=0.0) for y in (0.0, 800.0, 1600.0)],
            )
        )
        with self.assertRaises(ValueError) as caught:
            build_mesh(detection, ANY_ANCHOR, tolerance=50.0)
        self.assertIn("family A", str(caught.exception))


class InvernessNorthReproductionTests(unittest.TestCase):
    """The committed control CSV must be re-derivable from the committed detection.

    This is the whole point of versioning the detection artifact. If this test
    fails, either the pipeline changed behaviour or the CSV was hand-edited, and
    in both cases the provenance claim in the docs has stopped being true.
    """

    @classmethod
    def setUpClass(cls):
        cls.detection = load_detection(DETECTIONS / "inverness-north.json")
        cls.build = build_mesh(
            cls.detection,
            NORTH.graticule.anchor,
            tolerance=NORTH.graticule.tolerance_px,
            min_extent=NORTH.graticule.min_extent_px,
        )
        cls.committed = load_gcps(GCPS / "inverness-north.csv")

    def test_finds_five_meridians_and_six_parallels(self):
        self.assertEqual(self.build.family_a.indices, (0, 1, 2, 3, 4))
        self.assertEqual(self.build.family_b.indices, (0, 1, 2, 3, 4, 5))

    def test_no_lattice_position_is_missing(self):
        self.assertEqual(self.build.family_a.missing_indices, ())
        self.assertEqual(self.build.family_b.missing_indices, ())

    def test_lattice_fit_residuals_stay_small(self):
        # A 5-arcminute step is about 2,330 px across and 3,414 px down here, so
        # these residuals are around 1 % and 0.5 % of a step.
        self.assertLess(self.build.family_a.rms_px, 40.0)
        self.assertLess(self.build.family_b.rms_px, 20.0)

    def test_yields_thirty_controls(self):
        self.assertEqual(len(self.build.mesh.intersections), 30)
        self.assertEqual(len(self.committed), 30)

    def test_every_committed_point_is_a_control(self):
        # Graticule intersections are CONTROL. A check point must never be a
        # graticule intersection, or the accuracy measurement becomes circular.
        self.assertTrue(all(point.role == CONTROL_ROLE for point in self.committed))

    def test_reproduces_every_committed_pixel_position(self):
        rebuilt = {
            (round(p.lon, 6), round(p.lat, 6)): (p.pixel_x, p.pixel_y)
            for p in self.build.mesh.control_points()
        }
        worst = 0.0
        for point in self.committed:
            key = (round(point.lon, 6), round(point.lat, 6))
            self.assertIn(key, rebuilt, f"{point.label} is not in the rebuilt mesh")
            got_x, got_y = rebuilt[key]
            worst = max(worst, math.hypot(got_x - point.pixel_x, got_y - point.pixel_y))
        # At roughly 2.71 m per source pixel, one pixel is under three metres.
        self.assertLess(worst, 1.0, f"worst pixel disagreement {worst:.3f} px")

    def test_spacing_implies_the_documented_scan_resolution(self):
        # A 5-arcminute parallel step is 5 nautical miles = 9,260 m. The fitted
        # pitch divided into that is the sheet's metres-per-pixel, and it must
        # land on the ~2.71 m/px recorded in the docs.
        metres_per_pixel = 9260.0 / self.build.family_b.spacing_px
        self.assertAlmostEqual(metres_per_pixel, 2.71, delta=0.05)


class InvernessSouthReproductionTests(unittest.TestCase):
    """The south panel carries a 10-arcminute lattice, not the north's 5."""

    @classmethod
    def setUpClass(cls):
        cls.detection = load_detection(DETECTIONS / "inverness-south.json")
        cls.build = build_mesh(
            cls.detection,
            SOUTH.graticule.control_anchor,
            tolerance=SOUTH.graticule.tolerance_px,
            min_extent=SOUTH.graticule.min_extent_px,
        )
        cls.committed = load_gcps(GCPS / "inverness-south.csv")

    def test_finds_three_meridians_and_four_parallels(self):
        self.assertEqual(self.build.family_a.indices, (0, 1, 2))
        self.assertEqual(self.build.family_b.indices, (0, 1, 2, 3))
        self.assertEqual(len(self.build.mesh.intersections), 12)
        self.assertEqual(len(self.committed), 12)

    def test_reproduces_the_committed_control_points(self):
        rebuilt = {
            (round(p.lon, 6), round(p.lat, 6)): (p.pixel_x, p.pixel_y)
            for p in self.build.mesh.control_points()
        }
        for point in self.committed:
            key = (round(point.lon, 6), round(point.lat, 6))
            self.assertIn(key, rebuilt, f"{point.label} is not in the rebuilt mesh")
            got_x, got_y = rebuilt[key]
            self.assertLess(math.hypot(got_x - point.pixel_x, got_y - point.pixel_y), 1.0)

    def test_the_read_longitude_labels_land_on_their_rules(self):
        """"61 10'" was read at x~25055 and "61 00'" at x~29678, both at y~850."""
        by_lon = {}
        for point in self.committed:
            by_lon.setdefault(round(point.lon, 4), []).append(point.pixel_x)
        # Compare near the top of the panel, where the labels are printed. The
        # external Richmond calibration shifts every emitted longitude by the
        # same 17 arcseconds, but it cannot move the engraved rules: index 1 is
        # still the one labelled 61d10' and index 2 the one labelled 61d00'.
        west_to_east = sorted(by_lon)
        self.assertAlmostEqual(min(by_lon[west_to_east[1]]), 25055, delta=60)
        self.assertAlmostEqual(min(by_lon[west_to_east[2]]), 29678, delta=60)

    def test_the_read_latitude_labels_land_on_their_rules(self):
        """"46 00" sits on its rule at y~17146 and "45 50" at y~23880."""
        by_lat = {}
        for point in self.committed:
            by_lat.setdefault(round(point.lat, 4), []).append(point.pixel_y)
        self.assertAlmostEqual(max(by_lat[46.0]), 17146, delta=60)
        self.assertAlmostEqual(max(by_lat[45.8333]), 23880, delta=60)

    def test_both_panels_imply_the_same_engraving_scale(self):
        """Independent confirmation that one step is 5' and the other 10'.

        The two panels were detected separately, anchored on different labels,
        and fitted at different pitches. Reduced to metres per source pixel they
        must agree, and they do to better than half a percent.
        """
        north = build_mesh(
            load_detection(DETECTIONS / "inverness-north.json"),
            NORTH.graticule.anchor,
            tolerance=NORTH.graticule.tolerance_px,
            min_extent=NORTH.graticule.min_extent_px,
        )
        metres_per_arcminute = 1852.0
        north_scale = (
            5.0 * metres_per_arcminute / north.family_b.spacing_px
        )
        south_scale = (
            10.0 * metres_per_arcminute / self.build.family_b.spacing_px
        )
        self.assertAlmostEqual(north_scale, 2.71, delta=0.05)
        self.assertAlmostEqual(south_scale, 2.71, delta=0.05)
        self.assertAlmostEqual(north_scale, south_scale, delta=0.02)

    def test_meridian_index_zero_is_the_westernmost_rule(self):
        """Guards the sign flip that made the south longitudes run backwards.

        Index direction must come from the sheet, not from an arbitrary
        canonicalisation that flips at exactly 90 degrees - the north meridians
        stand at 84.5 and the south at 90.1.
        """
        for build in (self.build,):
            positions = {
                placed.index: placed.line.cx for placed in build.family_a.lines
            }
            ordered = [positions[i] for i in sorted(positions)]
            self.assertEqual(ordered, sorted(ordered))


class RichmondMainDetectionTests(unittest.TestCase):
    """The off-sample sheet must derive controls without hand-selected rules."""

    @classmethod
    def setUpClass(cls):
        cls.build = build_mesh(
            load_detection(DETECTIONS / "richmond-main.json"),
            RICHMOND.graticule.anchor,
            tolerance=RICHMOND.graticule.tolerance_px,
            min_extent=RICHMOND.graticule.min_extent_px,
        )

    def test_finds_all_seven_meridians_and_both_parallels(self):
        self.assertEqual(self.build.family_a.indices, (0, 1, 2, 3, 4, 5, 6))
        self.assertEqual(self.build.family_b.indices, (0, 1))
        self.assertEqual(len(self.build.mesh.intersections), 14)

    def test_no_lattice_position_is_missing(self):
        self.assertEqual(self.build.family_a.missing_indices, ())
        self.assertEqual(self.build.family_b.missing_indices, ())

    def test_lattice_fit_residuals_stay_small(self):
        self.assertLess(self.build.family_a.rms_px, 40.0)
        self.assertLess(self.build.family_b.rms_px, 30.0)


if __name__ == "__main__":
    unittest.main()
