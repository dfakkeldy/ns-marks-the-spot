import unittest

from tools.church.emit_candidates import resolve_candidate
from tools.church.island_supply import build_supply
from tools.church.landmarks import BoundingBox


WATER = [
    {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [[-10, 0], [-10, 10], [0, 10], [0, 0], [-10, 0]],
                [[-9, 1], [-7, 1], [-7, 3], [-9, 3], [-9, 1]],
                [[-5, 1], [-4, 1], [-4, 2], [-5, 2], [-5, 1]],
                [[-2, 1], [-1.5, 1], [-1.5, 1.5], [-2, 1.5], [-2, 1]],
            ],
        },
    }
]


class IslandSupplyTests(unittest.TestCase):
    def test_largest_uniquely_selectable_islands_are_frozen_in_rank_order(self) -> None:
        supply = build_supply(
            WATER,
            BoundingBox(west=-10, south=0, east=0, north=10),
            count=2,
        )

        self.assertEqual([row.label for row, _ in supply], ["supply-01", "supply-02"])
        self.assertEqual(resolve_candidate(supply[0][0], WATER), (-8.0, 2.0))
        self.assertEqual(resolve_candidate(supply[1][0], WATER), (-4.5, 1.5))

    def test_refuses_to_claim_more_islands_than_the_source_contains(self) -> None:
        supply = build_supply(
            WATER,
            BoundingBox(west=-10, south=0, east=0, north=10),
            count=10,
        )
        self.assertEqual(len(supply), 3)

    def test_each_box_resolves_to_exactly_its_frozen_centroid(self) -> None:
        supply = build_supply(
            WATER,
            BoundingBox(west=-10, south=0, east=0, north=10),
            count=3,
        )
        for row, expected in supply:
            self.assertEqual(resolve_candidate(row, WATER), expected)


if __name__ == "__main__":
    unittest.main()
