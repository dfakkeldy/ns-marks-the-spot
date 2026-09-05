import unittest

from build_provincial_atlas import feature_layer, validate_row, validate_release, record_row


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


if __name__ == '__main__':
    unittest.main()
