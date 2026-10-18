from __future__ import annotations

import csv
import math
import pathlib
import tempfile
import unittest

from tools.church.geometry import lonlat_to_mercator, mercator_to_lonlat
from tools.fletcher.feature_candidates import (
    dedupe,
    road_intersections,
    water_junctions,
    write_csv,
)


def _north_offset(lon: float, lat: float, metres: float) -> tuple[float, float]:
    """A point roughly `metres` due north of (lon, lat), via the same Mercator
    round-trip `dedupe` uses, so the fixture's separation matches what the
    module under test will measure - not a geodesic approximation that could
    disagree with it."""
    x, y = lonlat_to_mercator(lon, lat)
    mercator_metres = metres / math.cos(math.radians(lat))
    return mercator_to_lonlat(x, y + mercator_metres)


def _line(coords: list[tuple[float, float]]) -> dict:
    return {"type": "LineString", "coordinates": [list(c) for c in coords]}


def _multiline(parts: list[list[tuple[float, float]]]) -> dict:
    return {
        "type": "MultiLineString",
        "coordinates": [[list(c) for c in part] for part in parts],
    }


def _feature(geometry: dict, properties: dict | None = None) -> dict:
    return {"type": "Feature", "geometry": geometry, "properties": properties or {}}


def _fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


class RoadIntersectionsTests(unittest.TestCase):
    def test_two_named_roads_sharing_endpoint_is_one_intersection(self) -> None:
        geojson = _fc([
            _feature(
                _line([(-61.5, 45.8), (-61.4, 45.8)]),
                {"STREET": "Main St", "OBJECTID": 1},
            ),
            _feature(
                _line([(-61.4, 45.8), (-61.3, 45.9)]),
                {"STREET": "Elm St", "OBJECTID": 2},
            ),
        ])

        result = road_intersections(geojson)

        self.assertEqual(len(result), 1)
        candidate = result[0]
        self.assertEqual(candidate["kind"], "road-road-intersection")
        self.assertAlmostEqual(candidate["lon"], -61.4, places=6)
        self.assertAlmostEqual(candidate["lat"], 45.8, places=6)
        self.assertEqual(candidate["names"], ["Elm St", "Main St"])

    def test_same_name_continuation_is_not_an_intersection(self) -> None:
        geojson = _fc([
            _feature(
                _line([(-61.6, 45.8), (-61.5, 45.8)]),
                {"STREET": "Shore Rd", "OBJECTID": 3},
            ),
            _feature(
                _line([(-61.5, 45.8), (-61.4, 45.8)]),
                {"STREET": "Shore Rd", "OBJECTID": 4},
            ),
        ])

        result = road_intersections(geojson)

        self.assertEqual(result, [])

    def test_unnamed_roads_fall_back_to_objectid(self) -> None:
        geojson = _fc([
            _feature(_line([(-61.5, 45.8), (-61.45, 45.8)]), {"OBJECTID": 7}),
            _feature(_line([(-61.45, 45.8), (-61.4, 45.9)]), {"OBJECTID": 8}),
        ])

        result = road_intersections(geojson)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["names"], ["obj-7", "obj-8"])

    def test_unnamed_roads_without_objectid_fall_back_to_index(self) -> None:
        geojson = _fc([
            _feature(_line([(-61.5, 45.8), (-61.45, 45.8)]), {}),
            _feature(_line([(-61.45, 45.8), (-61.4, 45.9)]), {}),
        ])

        result = road_intersections(geojson)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["names"], ["obj-0", "obj-1"])

    def test_multilinestring_part_endpoints_are_matched(self) -> None:
        geojson = _fc([
            _feature(
                _multiline([
                    [(-61.7, 45.8), (-61.6, 45.8)],
                    [(-61.6, 45.9), (-61.5, 45.9)],
                ]),
                {"STREET": "Ring Rd", "OBJECTID": 5},
            ),
            _feature(
                _line([(-61.6, 45.9), (-61.55, 46.0)]),
                {"STREET": "Cross Rd", "OBJECTID": 6},
            ),
        ])

        result = road_intersections(geojson)

        self.assertEqual(len(result), 1)
        candidate = result[0]
        self.assertAlmostEqual(candidate["lon"], -61.6, places=6)
        self.assertAlmostEqual(candidate["lat"], 45.9, places=6)
        self.assertEqual(candidate["names"], ["Cross Rd", "Ring Rd"])

    def test_mid_vertex_of_one_road_does_not_match_another_roads_endpoint(self) -> None:
        geojson = _fc([
            _feature(
                _line([(-61.6, 45.8), (-61.5, 45.85), (-61.4, 45.9)]),
                {"STREET": "Long Rd", "OBJECTID": 9},
            ),
            _feature(
                _line([(-61.5, 45.85), (-61.45, 45.95)]),
                {"STREET": "Spur Rd", "OBJECTID": 10},
            ),
        ])

        result = road_intersections(geojson)

        self.assertEqual(result, [])


class WaterJunctionsTests(unittest.TestCase):
    def test_tributary_endpoint_touching_river_mid_vertex_is_one_junction(self) -> None:
        geojson = _fc([
            _feature(
                _line([(-61.0, 45.0), (-60.95, 45.05), (-60.9, 45.1)]),
                {"OBJECTID": 10},
            ),
            _feature(
                _line([(-60.95, 45.05), (-60.9, 45.0)]),
                {"OBJECTID": 11},
            ),
        ])

        result = water_junctions(geojson)

        self.assertEqual(len(result), 1)
        candidate = result[0]
        self.assertEqual(candidate["kind"], "water-junction")
        self.assertAlmostEqual(candidate["lon"], -60.95, places=6)
        self.assertAlmostEqual(candidate["lat"], 45.05, places=6)
        self.assertEqual(candidate["names"], ["obj-10", "obj-11"])

    def test_endpoint_to_endpoint_between_two_features_counts_once(self) -> None:
        geojson = _fc([
            _feature(_line([(-60.6, 45.5), (-60.5, 45.5)]), {"OBJECTID": 20}),
            _feature(_line([(-60.5, 45.5), (-60.4, 45.6)]), {"OBJECTID": 21}),
        ])

        result = water_junctions(geojson)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["names"], ["obj-20", "obj-21"])

    def test_same_feature_only_vertex_reuse_is_not_a_junction(self) -> None:
        # A closed ring: first and last vertex coincide, but only one feature
        # touches that point, so nothing should be reported.
        geojson = _fc([
            _feature(
                _line([
                    (-60.2, 45.2),
                    (-60.15, 45.25),
                    (-60.1, 45.2),
                    (-60.2, 45.2),
                ]),
                {"OBJECTID": 30},
            ),
        ])

        result = water_junctions(geojson)

        self.assertEqual(result, [])


class DedupeTests(unittest.TestCase):
    def test_dedupe_collapses_candidates_about_50m_apart_keeping_first(self) -> None:
        lon0, lat0 = -61.4, 45.8
        lon1, lat1 = _north_offset(lon0, lat0, 50.0)
        candidates = [
            {"kind": "road-road-intersection", "lon": lon0, "lat": lat0, "names": ["a"]},
            {"kind": "road-road-intersection", "lon": lon1, "lat": lat1, "names": ["b"]},
        ]

        result = dedupe(candidates)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["names"], ["a"])

    def test_dedupe_keeps_candidates_about_500m_apart(self) -> None:
        lon0, lat0 = -61.4, 45.8
        lon1, lat1 = _north_offset(lon0, lat0, 500.0)
        candidates = [
            {"kind": "road-road-intersection", "lon": lon0, "lat": lat0, "names": ["a"]},
            {"kind": "road-road-intersection", "lon": lon1, "lat": lat1, "names": ["b"]},
        ]

        result = dedupe(candidates)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["names"], ["a"])
        self.assertEqual(result[1]["names"], ["b"])


class WriteCsvTests(unittest.TestCase):
    def test_write_csv_emits_exact_header_and_id_format(self) -> None:
        candidates = [
            {
                "kind": "road-road-intersection",
                "lon": -61.4,
                "lat": 45.8,
                "names": ["Elm St", "Main St"],
            },
            {
                "kind": "water-junction",
                "lon": -60.95,
                "lat": 45.05,
                "names": ["obj-10", "obj-11"],
            },
        ]

        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "candidates.csv"
            write_csv(candidates, path)
            text = path.read_text(encoding="utf-8")

        lines = text.splitlines()
        self.assertEqual(lines[0], "id,kind,lon,lat,names")

        rows = list(csv.reader(lines[1:]))
        self.assertEqual(rows[0][0], "cand-0001")
        self.assertEqual(rows[0][1], "road-road-intersection")
        self.assertEqual(rows[0][4], "Elm St|Main St")
        self.assertEqual(rows[1][0], "cand-0002")
        self.assertEqual(rows[1][4], "obj-10|obj-11")


if __name__ == "__main__":
    unittest.main()
