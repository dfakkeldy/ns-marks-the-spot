import unittest

from build_provincial_atlas import (WOODLAND_BANDS, WOODLAND_TOLERANCE_DEGREES, WOODLAND_TRANSFORM, ZOOMS, feature_layer,
                                    generalize, record_row, repair_polygon, validate_release, validate_row,
                                    woodland_geometry_expression)

try:
    from osgeo import ogr
except ImportError:  # pragma: no cover - GDAL is only needed for the build itself
    ogr = None


class ProvincialAtlasTests(unittest.TestCase):
    def test_preserves_road_name_and_identifier(self):
        row = {'source_row_id': 'row-1', 'roadsegid': '494840',
               'street': 'Chisholm-MacLean Rd', 'roadc_desc': 'Local',
               'feat_desc': 'ROAD - Local - 1 Lane - Unpaved',
               'the_geom': {'type': 'LineString', 'coordinates': [[-61.47, 45.81], [-61.46, 45.82]]}}
        feature = validate_row('roads', row)
        self.assertEqual(feature['properties']['street'], 'Chisholm-MacLean Rd')
        self.assertEqual(feature['properties']['roadsegid'], '494840')
        self.assertEqual(feature_layer('roads', feature['properties']), 'roads_local')

    def test_track_is_not_promoted_to_a_local_road(self):
        self.assertEqual(feature_layer('roads', {'roadc_desc': 'Track'}), 'roads_access')
        self.assertEqual(feature_layer('roads', {'roadc_desc': 'Trans Canada'}), 'roads_major')

    def test_missing_geometry_and_malformed_names_fail(self):
        with self.assertRaises(ValueError):
            validate_row('roads', {'roadsegid': '1'})
        with self.assertRaises(ValueError):
            validate_row('roads', {'source_row_id': '1', 'roadsegid': '1', 'street': 17,
                         'the_geom': {'type': 'Point', 'coordinates': [-61, 45]}})

    def test_changed_release_or_truncated_download_fails(self):
        for before, after, expected, actual in [(1, 2, 10, 10), (1, 1, 10, 9), (1, 1, 0, 0)]:
            with self.assertRaises(ValueError):
                validate_release(before, after, expected, actual)
        validate_release(1, 1, 10, 10)

    def test_source_null_geometry_is_explicitly_quarantined(self):
        record = record_row('waterways', {'source_row_id': 'row-sxpj~d3w6.hd9k', 'feat_desc': 'River - Single Line'})
        self.assertIsNone(record['geometry'])
        self.assertEqual(record['rejectionReason'], 'source-null-geometry')
        self.assertEqual(record['properties']['source_row_id'], 'row-sxpj~d3w6.hd9k')

    def test_woodland_simplification_tolerance_is_in_degrees(self):
        # Socrata applies the tolerance in the dataset's own units (degrees). A
        # tolerance of 2 collapsed nearly every woodland ring to a triangle.
        self.assertEqual(woodland_geometry_expression(), 'simplify_preserve_topology(the_geom, 0.000018)')
        self.assertLess(WOODLAND_TOLERANCE_DEGREES * 111_320, 2.01)
        self.assertIn('degree', WOODLAND_TRANSFORM)

    @unittest.skipUnless(ogr, 'GDAL bindings not installed')
    def test_invalid_source_polygon_is_repaired_without_losing_area(self):
        bowtie = ogr.CreateGeometryFromWkt('POLYGON((0 0,2 2,2 0,0 2,0 0))')
        geom, repaired = repair_polygon(bowtie)
        self.assertTrue(repaired)
        self.assertTrue(geom.IsValid())
        self.assertEqual(geom.GetGeometryName(), 'MULTIPOLYGON')
        self.assertAlmostEqual(geom.GetArea(), 2.0)
        square = ogr.CreateGeometryFromWkt('POLYGON((0 0,0 1,1 1,1 0,0 0))')
        geom, repaired = repair_polygon(square)
        self.assertFalse(repaired)
        self.assertTrue(geom.Equals(square))
        collapsed = ogr.CreateGeometryFromWkt('POLYGON((0 0,1 0,2 0,0 0))')
        self.assertEqual(repair_polygon(collapsed), (None, True))

    def test_woodland_bands_cover_the_layer_zoom_range_once(self):
        zooms = sorted(zoom for layer, (low, high) in ZOOMS.items() if layer.startswith('woodland') for zoom in range(low, high + 1))
        self.assertEqual(zooms, list(range(8, 14)))
        self.assertEqual(WOODLAND_BANDS[0][:3], ('woodland', 12, 13))

    @unittest.skipUnless(ogr, 'GDAL bindings not installed')
    def test_lower_zoom_band_drops_sub_pixel_rings_but_keeps_area(self):
        with_hole = ogr.CreateGeometryFromWkt('POLYGON((0 0,0 10,10 10,10 0,0 0),(4 4,4 4.1,4.1 4.1,4.1 4,4 4))')
        display = generalize(with_hole, 0.5, 1.0)
        self.assertEqual(display.GetGeometryCount(), 1)
        self.assertAlmostEqual(display.GetArea(), 100.0)
        self.assertIsNone(generalize(ogr.CreateGeometryFromWkt('POLYGON((0 0,0 0.1,0.1 0.1,0.1 0,0 0))'), 0.5, 1.0))


if __name__ == '__main__':
    unittest.main()
