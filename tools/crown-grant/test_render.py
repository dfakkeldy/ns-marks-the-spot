import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from osgeo import gdal
spec=importlib.util.spec_from_file_location('renderer',Path(__file__).with_name('render_sheet.py'));renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
class PixelFrameTest(unittest.TestCase):
    def test_edge_polygon_samples_pixel_centres_and_preserves_legacy(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp);source=p/'source.png';Image.new('RGB',(8,8),'white').save(source)
            fit=p/'fit.json';fit.write_text(json.dumps(dict(source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),source_dimensions=[8,8],crs='EPSG:32620',matrix=[[6,0],[0,-6],[260000,4860000]])))
            components=p/'components.json';components.write_text(json.dumps(dict(components=[dict(id='main',status='fixture',ring_pixel_xy=[[1,1],[4,1],[4,4],[1,4]])])))
            for legacy,count in [(False,9),(True,16)]:
                out=p/str(legacy);renderer.render(source,fit,components,out,legacy)
                ds=gdal.Open(str(out/'main-native.tif'));alpha=ds.GetRasterBand(4).ReadAsArray();self.assertEqual(int((alpha>0).sum()),count)
if __name__=='__main__':unittest.main()
