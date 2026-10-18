from __future__ import annotations

import json
import unittest

from tools.church.gcps import parse_gcp_csv, split_roles
from tools.fletcher.emit_gcps import emit


class EmitGCPTests(unittest.TestCase):
    def test_uses_individually_measured_pixels_for_a_distorted_grid(self) -> None:
        observation = {
            "sheet": "test",
            "meridians": [
                {"pixel_x": 100.0, "lon": -61.0, "label": "61d00mW"},
                {"pixel_x": 200.0, "lon": -60.9, "label": "60d54mW"},
            ],
            "parallels": [
                {"pixel_y": 300.0, "lat": 45.5, "label": "45d30mN"},
                {"pixel_y": 400.0, "lat": 45.4, "label": "45d24mN"},
            ],
            "intersections": [
                {
                    "meridian_index": 0,
                    "parallel_index": 0,
                    "pixel_x": 10.0,
                    "pixel_y": 30.0,
                },
                {
                    "meridian_index": 1,
                    "parallel_index": 0,
                    "pixel_x": 21.0,
                    "pixel_y": 31.0,
                },
                {
                    "meridian_index": 0,
                    "parallel_index": 1,
                    "pixel_x": 11.0,
                    "pixel_y": 40.0,
                },
                {
                    "meridian_index": 1,
                    "parallel_index": 1,
                    "pixel_x": 22.0,
                    "pixel_y": 42.0,
                },
            ],
            "check_intersections": [[1, 1]],
        }

        points = parse_gcp_csv(emit(json.dumps(observation)))
        control, check = split_roles(points)

        self.assertEqual(
            [(point.pixel_x, point.pixel_y) for point in control],
            [(10.0, 30.0), (21.0, 31.0), (11.0, 40.0)],
        )
        self.assertEqual(
            (
                check[0].pixel_x,
                check[0].pixel_y,
                check[0].lon,
                check[0].lat,
            ),
            (22.0, 42.0, -60.9, 45.4),
        )

    def test_rejects_duplicate_individually_measured_intersections(self) -> None:
        observation = {
            "sheet": "test",
            "meridians": [
                {"pixel_x": 100.0, "lon": -61.0, "label": "61d00mW"}
            ],
            "parallels": [
                {"pixel_y": 300.0, "lat": 45.5, "label": "45d30mN"}
            ],
            "intersections": [
                {
                    "meridian_index": 0,
                    "parallel_index": 0,
                    "pixel_x": 10.0,
                    "pixel_y": 30.0,
                },
                {
                    "meridian_index": 0,
                    "parallel_index": 0,
                    "pixel_x": 11.0,
                    "pixel_y": 31.0,
                },
            ],
            "check_intersections": [],
        }

        with self.assertRaisesRegex(ValueError, "duplicate"):
            emit(json.dumps(observation))

    def test_rejects_a_declared_check_without_measured_pixels(self) -> None:
        observation = {
            "sheet": "test",
            "meridians": [
                {"pixel_x": 100.0, "lon": -61.0, "label": "61d00mW"},
                {"pixel_x": 200.0, "lon": -60.9, "label": "60d54mW"},
            ],
            "parallels": [
                {"pixel_y": 300.0, "lat": 45.5, "label": "45d30mN"}
            ],
            "intersections": [
                {
                    "meridian_index": 0,
                    "parallel_index": 0,
                    "pixel_x": 10.0,
                    "pixel_y": 30.0,
                }
            ],
            "check_intersections": [[1, 0]],
        }

        with self.assertRaisesRegex(ValueError, "measured pixels"):
            emit(json.dumps(observation))

    def test_crosses_observed_rules_and_keeps_declared_checks_out_of_control(self) -> None:
        observation = {
            "sheet": "test",
            "meridians": [
                {"pixel_x": 10.0, "lon": -60.5, "label": "west"},
                {"pixel_x": 20.0, "lon": -60.4, "label": "east"},
            ],
            "parallels": [
                {"pixel_y": 30.0, "lat": 45.9, "label": "north"},
                {"pixel_y": 40.0, "lat": 45.8, "label": "south"},
            ],
            "check_intersections": [[0, 1]],
        }

        points = parse_gcp_csv(emit(json.dumps(observation)))
        control, check = split_roles(points)

        self.assertEqual(len(control), 3)
        self.assertEqual(len(check), 1)
        self.assertEqual(
            (check[0].pixel_x, check[0].pixel_y, check[0].lon, check[0].lat),
            (10.0, 40.0, -60.5, 45.8),
        )

    def test_rejects_a_check_index_outside_the_observed_lattice(self) -> None:
        observation = {
            "sheet": "test",
            "meridians": [{"pixel_x": 10.0, "lon": -60.5, "label": "west"}],
            "parallels": [{"pixel_y": 30.0, "lat": 45.9, "label": "north"}],
            "check_intersections": [[1, 0]],
        }

        with self.assertRaisesRegex(ValueError, "outside"):
            emit(json.dumps(observation))


if __name__ == "__main__":
    unittest.main()
