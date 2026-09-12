import unittest
import tempfile
from pathlib import Path

try:
    from osgeo import gdal, ogr, osr
except ImportError:
    ogr = None
from build_crown_atlas import dissolve, boundary_lines


@unittest.skipUnless(ogr, 'GDAL bindings not installed')
class CrownAtlasTests(unittest.TestCase):
    def test_adjacent_and_overlapping_parcels_have_only_union_boundary(self):
        parcels = [ogr.CreateGeometryFromWkt(wkt) for wkt in [
            'POLYGON((0 0,2 0,2 2,0 2,0 0))',
            'POLYGON((2 0,4 0,4 2,2 2,2 0))',
            'POLYGON((1 0,3 0,3 2,1 2,1 0))']]
        merged = dissolve(parcels)
        self.assertAlmostEqual(merged.GetArea(), 8)
        outline = boundary_lines(merged)
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
        self.assertAlmostEqual(boundary_lines(merged).Length(), 27.99998)

    def test_empty_dissolve_fails_closed(self):
        with self.assertRaises(ValueError):
            dissolve([])

    def test_tile_cut_through_merged_land_does_not_gain_an_outline(self):
        gdal.UseExceptions()
        ogr.UseExceptions()
        srs = osr.SpatialReference()
        srs.ImportFromEPSG(4326)
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
        polygon = ogr.CreateGeometryFromWkt('POLYGON((-61.55 45.85,-61.5 45.85,-61.5 45.9,-61.55 45.9,-61.55 45.85))')
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            data = ogr.GetDriverByName('GPKG').CreateDataSource(str(path / 'test.gpkg'))
            for name, geom in [('crown', polygon), ('crown_outline', boundary_lines(polygon))]:
                layer = data.CreateLayer(name, srs, ogr.wkbUnknown)
                feature = ogr.Feature(layer.GetLayerDefn())
                feature.SetGeometry(geom)
                layer.CreateFeature(feature)
            feature = layer = data = None
            result = gdal.VectorTranslate(str(path / 'test.pmtiles'), str(path / 'test.gpkg'), format='PMTiles',
                                          datasetCreationOptions=['MINZOOM=13', 'MAXZOOM=13', 'EXTENT=8192'])
            result = None
            tiles = gdal.OpenEx(str(path / 'test.pmtiles'), gdal.OF_VECTOR, open_options=['ZOOM_LEVEL=13'])
            fill = tiles.GetLayerByName('crown')
            transform = osr.CoordinateTransformation(srs, fill.GetSpatialRef())
            # This longitude is an exact z13 tile cut, wholly inside the polygon.
            west, south, _ = transform.TransformPoint(-61.5235, 45.873)
            east, north, _ = transform.TransformPoint(-61.5233, 45.877)
            fill.SetSpatialFilterRect(west, south, east, north)
            self.assertIsNotNone(fill.GetNextFeature())
            outline = tiles.GetLayerByName('crown_outline')
            outline.SetSpatialFilterRect(west, south, east, north)
            self.assertIsNone(outline.GetNextFeature())


if __name__ == '__main__':
    unittest.main()
