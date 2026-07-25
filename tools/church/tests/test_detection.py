import json
import math
import pathlib
import unittest

from tools.church.detection import build_mesh, load_detection, parse_detection
from tools.church.gcps import CONTROL_ROLE, load_gcps
from tools.church.graticule import GraticuleAnchor

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
DETECTIONS = REPO_ROOT / "tools" / "church" / "detections"
GCPS = REPO_ROOT / "tools" / "church" / "gcps"

# Read off the scan, not inferred: 60d40'W x 47d00'N at ~(12388, 3188), and
# 60d50'W at ~(9526, 28276). See docs/church-inverness-attempt-2-2026-07-24.md.
INVERNESS_NORTH_ANCHOR = GraticuleAnchor(
    meridian_index=0,
    meridian_lon=-(60.0 + 40.0 / 60.0),
    parallel_index=0,
    parallel_lat=46.0 + 50.0 / 60.0,
    step_minutes=5.0,
)
INVERNESS_TOLERANCE_PX = 120.0
INVERNESS_MIN_EXTENT_PX = 3500.0


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
        build = build_mesh(detection, INVERNESS_NORTH_ANCHOR, tolerance=50.0)
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
            build_mesh(detection, INVERNESS_NORTH_ANCHOR, tolerance=50.0)
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
            INVERNESS_NORTH_ANCHOR,
            tolerance=INVERNESS_TOLERANCE_PX,
            min_extent=INVERNESS_MIN_EXTENT_PX,
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


if __name__ == "__main__":
    unittest.main()
