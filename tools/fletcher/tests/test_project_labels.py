"""Frame, provenance and fail-closed regression tests for the frozen per-sheet derivatives."""
import math
import shutil
import subprocess
import unittest

from tools.fletcher import project_labels as p


class FrameTests(unittest.TestCase):
    def test_resized_crop_uses_independent_axes_and_original_offset(self):
        self.assertEqual(p.crop_to_source([125, 75], [1400, 1030, 1000, 600], [500, 200]), [1650, 1255])

    def test_native_box_center_has_no_second_crop_offset_or_half_pixel_shift(self):
        self.assertEqual(p.box_center([3690, 2470, 170, 49], [10815, 7549]), [3775, 2494.5])

    def test_invalid_box_fails_closed(self):
        for box in [[-1, 10, 30, 20], [10, 10, 0, 20], [90, 10, 20, 20], [10, math.nan, 5, 5]]:
            with self.subTest(box=box), self.assertRaises(ValueError):
                p.box_center(box, [100, 100])

    def test_boundary_and_outside_are_unsupported(self):
        ring = [[0, 0], [100, 0], [100, 100], [0, 100]]
        self.assertTrue(p.inside([50, 50], ring))
        for point in [[0, 50], [100, 50], [50, 0], [50, 100], [-1, 50], [101, 50]]:
            self.assertFalse(p.inside(point, ring))

    def test_mercator_axis_order(self):
        world = p.mercator([-61.4, 45.8])
        self.assertLess(world[0], 0)
        self.assertGreater(world[1], 0)
        for expected, actual in zip([-61.4, 45.8], p.lonlat(world)):
            self.assertAlmostEqual(expected, actual, places=10)


class FrozenDerivativeTests(unittest.TestCase):
    def test_all_original_annotations_and_pixels_preserved(self):
        for sheet, count in [(19, 166), (16, 256), (22, 301), (14, 166)]:
            data = p.read(p.ROOT / p.REPORT / f"sheet-{sheet}-labels.geojson")
            original = p.read(p.ROOT / p.INVENTORIES / f"sheet-{sheet}-reviewed.json")
            self.assertEqual(len(data["features"]), count)
            for annotation, feature in zip(original["annotations"], data["features"]):
                for key, value in annotation.items():
                    self.assertEqual(feature["properties"][key], value, (sheet, annotation["id"], key))
                self.assertEqual(feature["properties"]["fit_revision"], p.REVISIONS[sheet])
                self.assertEqual(feature["properties"]["fit_sha256"], data["provenance"]["fit_sha256"])
                for box, anchor in zip(annotation["source_label_boxes_xywh"], feature["properties"]["label_anchors"]):
                    self.assertEqual(anchor["source_pixel_xy"], p.box_center(box, original["source_dimensions_px"]))

    def test_pinned_revisions_are_already_on_nightly(self):
        # GitHub deletes a PR branch after its squash merge, so a pin naming a
        # PR-branch commit becomes unreachable from a checkout of nightly. Frozen
        # inputs must land on nightly first and be pinned by a later change.
        probe = subprocess.run(["git", "rev-parse", "--verify", "--quiet", "origin/nightly^{commit}"],
                               cwd=p.ROOT, capture_output=True, text=True)
        if probe.returncode != 0:
            self.skipTest("origin/nightly is not available in this checkout")
        for sheet, revision in p.REVISIONS.items():
            with self.subTest(sheet=sheet):
                ancestry = subprocess.run(["git", "merge-base", "--is-ancestor", revision, "origin/nightly"], cwd=p.ROOT)
                self.assertEqual(ancestry.returncode, 0,
                                 f"Sheet {sheet} pins {revision}, which is not on origin/nightly (fetch origin first)")

    def test_unreachable_pin_fails_closed_with_a_named_revision(self):
        original = p.REVISIONS[16]
        p.REVISIONS[16] = "0" * 40
        try:
            with self.assertRaisesRegex(ValueError, "cannot be read at pinned revision 0{40}"):
                p.load_inputs(16)
        finally:
            p.REVISIONS[16] = original

    def test_frozen_fit_and_source_hashes_still_match(self):
        for sheet in p.SHEETS:
            _, _, inventory, _, _, _, provenance = p.load_inputs(sheet)
            data = p.read(p.ROOT / p.REPORT / f"sheet-{sheet}-labels.geojson")
            self.assertEqual(data["provenance"], provenance)
            self.assertEqual(data["source_sha256"], inventory["source_sha256"])

    def test_neatline_holdbacks_and_coordinate_axes(self):
        expected = {16: {"F16-PHM-146", "F16-PHM-147", "F16-PHM-149", "F16-PHM-197", "F16-PHM-200"},
                    19: set(), 22: {"F22-HAW-181"}, 14: set()}
        for sheet, ids in expected.items():
            data = p.read(p.ROOT / p.REPORT / f"sheet-{sheet}-labels.geojson")
            self.assertEqual({f["id"] for f in data["features"] if f["geometry"] is None}, ids)
            for f in data["features"]:
                anchors = f["properties"]["label_anchors"]
                for anchor in anchors:
                    if anchor["status"] == "outside-fit-neatline":
                        self.assertIsNone(anchor["lonlat"])
                        self.assertIsNone(anchor["projected_xy_m"])
                    else:
                        lon, lat = anchor["lonlat"]
                        self.assertTrue(-62 < lon < -61 and 45 < lat < 47)
                if f["geometry"]:
                    self.assertEqual(f["geometry"]["coordinates"], [a["lonlat"] for a in anchors])

    def test_all_packet_equality_receipts_are_linked_to_source(self):
        total = 0
        for sheet in p.SHEETS:
            audit = p.read(p.ROOT / p.REPORT / f"sheet-{sheet}-frame-audit.json")
            manifest = p.read(p.ROOT / p.INVENTORIES / f"sheet-{sheet}-manifest.json")
            self.assertEqual(audit["source_sha256"], manifest["source_sha256"])
            self.assertEqual(len(audit["crops"]), len(manifest["crops"]))
            for crop, original in zip(audit["crops"], manifest["crops"]):
                for key, value in original.items():
                    self.assertEqual(crop[key], value)
                self.assertTrue(crop["native_pixels_equal"])
                self.assertEqual(crop["scale_to_native_xy"], [1, 1])
                self.assertEqual(crop["offset_to_native_xy"], original["source_xywh"][:2])
            total += len(audit["crops"])
        self.assertEqual(total, 145)

    @unittest.skipUnless(shutil.which("gdaltransform"), "GDAL CLI is optional in stdlib CI")
    def test_gdal_reproduces_entire_committed_derivative(self):
        for sheet in p.SHEETS:
            expected = p.read(p.ROOT / p.REPORT / f"sheet-{sheet}-labels.geojson")
            actual = p.project(sheet, shutil.which("gdaltransform"))
            # GDAL/platform versions may differ in final floating-point bits.
            # Check coordinates numerically, then compare all remaining fields exactly.
            for old, new in zip(expected["features"], actual["features"]):
                for a, b in zip(old["properties"]["label_anchors"], new["properties"]["label_anchors"]):
                    for key, tolerance in [("projected_xy_m", 0.001), ("lonlat", 1e-8)]:
                        if a[key] is None:
                            self.assertIsNone(b[key])
                        else:
                            self.assertLess(math.dist(a[key], b[key]), tolerance)
                            b[key] = a[key]
                if new["geometry"] is not None:
                    new["geometry"]["coordinates"] = [a["lonlat"] for a in new["properties"]["label_anchors"]]
            for key in ["max_control_residual_projected_m", "max_frozen_check_difference_projected_m"]:
                self.assertLess(actual["verification"][key], 0.001)
                actual["verification"][key] = expected["verification"][key]
            actual["gdal_version"] = expected["gdal_version"]
            self.assertEqual(actual, expected)


if __name__ == "__main__":
    unittest.main()
