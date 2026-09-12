import unittest

try:
    from osgeo import ogr
except ImportError:
    ogr = None
from build_crown_atlas import dissolve


@unittest.skipUnless(ogr, 'GDAL bindings not installed')
class CrownAtlasTests(unittest.TestCase):
    def test_adjacent_and_overlapping_parcels_become_a_single_fill(self):
        parcels = [ogr.CreateGeometryFromWkt(wkt) for wkt in [
            'POLYGON((0 0,2 0,2 2,0 2,0 0))',
            'POLYGON((2 0,4 0,4 2,2 2,2 0))',
            'POLYGON((1 0,3 0,3 2,1 2,1 0))']]
        merged = dissolve(parcels)
        self.assertAlmostEqual(merged.GetArea(), 8)
        outline = merged.Boundary()
        self.assertAlmostEqual(outline.Length(), 12)
        internal = ogr.CreateGeometryFromWkt('LINESTRING(2 0.1,2 1.9)')
        self.assertFalse(outline.Intersects(internal))

    def test_holes_disconnected_land_and_real_gaps_are_preserved(self):
        parcels = [ogr.CreateGeometryFromWkt(wkt) for wkt in [
            'POLYGON((0 0,4 0,4 4,0 4,0 0),(1 1,1 3,3 3,3 1,1 1))',
            'POLYGON((4.00001 0,5 0,5 1,4.00001 1,4.00001 0))']]
        merged = dissolve(parcels)
        self.assertEqual(merged.GetGeometryCount(), 2)
        self.assertAlmostEqual(merged.GetArea(), 12.99999)
        hole = ogr.CreateGeometryFromWkt('POINT(2 2)')
        self.assertFalse(merged.Intersects(hole))
        self.assertAlmostEqual(merged.Boundary().Length(), 27.99998)

    def test_empty_dissolve_fails_closed(self):
        with self.assertRaises(ValueError):
            dissolve([])


if __name__ == '__main__':
    unittest.main()
