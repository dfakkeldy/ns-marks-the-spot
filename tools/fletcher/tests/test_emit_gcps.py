from __future__ import annotations

import json
import unittest

from tools.church.gcps import parse_gcp_csv, split_roles
from tools.fletcher.emit_gcps import emit


class EmitGCPTests(unittest.TestCase):
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
