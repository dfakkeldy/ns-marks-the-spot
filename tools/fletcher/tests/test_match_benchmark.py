"""The benchmark must stay blind to evaluation pixels."""

import unittest

from tools.fletcher.match_benchmark import evaluate, prepare


class MatchBenchmarkTests(unittest.TestCase):
    def rows(self):
        return [
            {
                "label": str(i),
                "lon": -61 + x / 100,
                "lat": 46 + y / 100,
                "pixel_x": 100 + x * 10,
                "pixel_y": 100 + y * 10,
                "role": "control",
            }
            for i, (x, y) in enumerate([(0, 0), (9, 0), (0, 9), (9, 9), (4, 4), (3, 7)])
        ]

    def test_gold_pixels_cannot_change_matcher_inputs(self):
        rows = self.rows()
        inputs, gold = prepare(rows)
        seed_ids = {p["id"] for p in inputs["seeds"]}
        altered = [
            dict(r, pixel_x=9999, pixel_y=8888) if r["label"] not in seed_ids else r
            for r in rows
        ]
        other, _ = prepare(altered)
        self.assertEqual(inputs, other)
        self.assertTrue(gold)
        self.assertTrue(
            all(set(t) == {"id", "lon", "lat", "role"} for t in inputs["targets"])
        )

    def test_existing_checks_never_become_seeds(self):
        rows = self.rows() + [
            {
                "label": "check",
                "lon": -70,
                "lat": 50,
                "pixel_x": 1,
                "pixel_y": 1,
                "role": "check",
            }
        ]
        inputs, _ = prepare(rows)
        self.assertNotIn("check", {p["id"] for p in inputs["seeds"]})

    def test_missing_or_duplicate_predictions_are_not_scored(self):
        inputs, gold = prepare(self.rows())
        with self.assertRaises(ValueError):
            evaluate(inputs, gold, {"predictions": []})

    def test_collinear_seeds_refused(self):
        rows = [
            {
                "label": str(i),
                "lon": i,
                "lat": i,
                "pixel_x": i,
                "pixel_y": i,
                "role": "control",
            }
            for i in range(6)
        ]
        with self.assertRaises(ValueError):
            prepare(rows)


class ImageMatchingTests(unittest.TestCase):
    def setUp(self):
        try:
            import importlib

            importlib.import_module("cv2")
            importlib.import_module("numpy")
        except ImportError:
            self.skipTest("optional benchmark image dependencies not installed")

    def test_flat_or_repeated_texture_is_rejected(self):
        import numpy as np

        from tools.fletcher.match_benchmark import CONFIG, peak_choice

        self.assertFalse(peak_choice(np.ones((41, 41), np.float32), CONFIG)[-1])

    def test_shifted_linework_recovers_known_displacement(self):
        import json
        import math
        import tempfile
        from pathlib import Path

        import cv2
        import numpy as np

        from tools.fletcher.match_benchmark import CONFIG, propose

        def ll(x, y):
            return math.degrees(x / 6378137), math.degrees(
                2 * math.atan(math.exp(y / 6378137)) - math.pi / 2
            )

        seeds = []
        for i, (x, y) in enumerate([(30, 30), (450, 30), (30, 450), (450, 450)]):
            lon, lat = ll(x, y)
            seeds.append({"id": str(i), "pixel": [x, y], "lon": lon, "lat": lat})
        lon, lat = ll(256, 256)
        inputs = {
            "seeds": seeds,
            "targets": [{"id": "target", "lon": lon, "lat": lat, "role": "control"}],
            "config": dict(
                CONFIG,
                downsample=1,
                template_radius=50,
                search_radius=25,
                minimum_support=40,
            ),
        }
        line = np.array(
            [[220, 225], [230, 260], [250, 250], [270, 285], [290, 270]], np.int32
        )
        image = np.full((512, 512), 255, np.uint8)
        cv2.polylines(image, [line + np.array([12, -8])], False, 0, 1)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cv2.imwrite(str(root / "scan.png"), image)
            (root / "lines.json").write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": [ll(x, y) for x, y in line],
                                }
                            }
                        ],
                    }
                )
            )
            result = propose(inputs, root / "scan.png", [root / "lines.json"])
        np.testing.assert_allclose(
            result["predictions"][0]["pixel"], [268, 248], atol=1
        )
