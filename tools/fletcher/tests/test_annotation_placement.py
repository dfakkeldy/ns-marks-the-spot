import unittest

from tools.fletcher.annotation_placement import place_review, source_geometry


class AnnotationPlacementTests(unittest.TestCase):
    dimensions = (1000, 1000)
    hull = [(0, 0), (900, 0), (900, 900), (0, 900)]

    def place(self, review, transform=lambda rows: [[-61 + x / 10000, 46 - y / 10000] for x, y in rows], status="draft-supported-area"):
        return place_review(review, self.dimensions, self.hull, transform, status)

    def test_point_uses_reviewed_mark_not_label_or_search_centre(self):
        result = self.place({"status": "supported-source-association", "source_anchor_xy": [100, 200],
                             "source_label_boxes_xywh": [[500, 500, 80, 20]], "search_centre_lonlat": [0, 0]})
        self.assertEqual(result["geometry"], {"type": "Point", "coordinates": [-60.99, 45.98]})

    def test_separate_groups_stay_separate_and_edges_are_transformed(self):
        inputs = []
        def curved(rows):
            inputs.extend(rows)
            return [[-61 + x / 10000, 46 - y / 10000 + x*x / 1e9] for x, y in rows]
        result = self.place({"status": "unresolved", "candidate_symbol_regions_xywh":
                             [[100, 200, 80, 40], [300, 400, 30, 20]]}, curved)
        self.assertEqual(result["geometry"]["type"], "MultiPolygon")
        self.assertEqual(len(result["geometry"]["coordinates"]), 2)
        self.assertIn([140, 200], inputs)
        for polygon in result["geometry"]["coordinates"]:
            ring = polygon[0]
            self.assertEqual(ring[0], ring[-1])
            self.assertGreater(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:])), 0)

    def test_no_label_centre_fallback(self):
        result = self.place({"source_label_boxes_xywh": [[100, 100, 50, 20]]})
        self.assertIsNone(result["geometry"])
        self.assertEqual(result["placement_status"], "needs-source-review")

    def test_whole_group_must_be_supported_not_just_centre(self):
        result = self.place({"status": "unresolved", "candidate_symbol_regions_xywh": [[850, 100, 100, 30]]})
        self.assertIsNone(result["geometry"])
        self.assertEqual(result["placement_status"], "outside-supported-coverage")

    def test_failed_sheet_never_calls_transform(self):
        def forbidden(rows):
            self.fail("Failed alignment must not generate geometry")
        result = self.place({"status": "supported-source-association", "source_anchor_xy": [100, 100]}, forbidden, "failed")
        self.assertIsNone(result["geometry"])

    def test_invalid_native_coordinates_and_unreviewed_point_rejected(self):
        for review in [{"status": "supported-source-association", "source_anchor_xy": [1000, 20]},
                       {"status": "unresolved", "source_anchor_xy": [20, 20]},
                       {"status": "unresolved", "candidate_symbol_regions_xywh": [[0, 0, -1, 30]]}]:
            with self.assertRaises(ValueError):
                source_geometry(review, self.dimensions)

    def test_incomplete_or_invalid_transform_rejected(self):
        review = {"status": "supported-source-association", "source_anchor_xy": [100, 100]}
        for transform in [lambda rows: [], lambda rows: [[float("nan"), 46]], lambda rows: [[500, 500]]]:
            with self.assertRaises(ValueError):
                self.place(review, transform)
