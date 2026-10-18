import importlib.util
import unittest
from pathlib import Path
from pyproj import Transformer
spec=importlib.util.spec_from_file_location('score',Path(__file__).with_name('score.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ScoreTests(unittest.TestCase):
    def test_no_checks_is_unvalidated_not_zero_error(self):
        result=module.score({},[])
        self.assertEqual(result['count'],0)
        self.assertIsNone(result['rms_ground_m'])
        self.assertIsNone(result['max_ground_m'])
    def test_geodesic_ground_error_not_mercator_distance(self):
        to_xy=Transformer.from_crs(4326,3857,always_xy=True);x,y=to_xy.transform(-66,44)
        fit={'crs':'EPSG:3857','matrix':[[1,0],[0,-1],[x,y]],'points':[]}
        result=module.score(fit,[{'pixel_xy':[100,0],'lonlat':[-66,44]}])
        self.assertGreater(result['rms_ground_m'],70);self.assertLess(result['rms_ground_m'],74)
        self.assertGreater(result['mean_east_ground_m'],70)
    def test_control_alias_cannot_reenter_checks(self):
        p={'pixel_xy':[1,2],'lonlat':[-66,44]};fit={'crs':'EPSG:3857','matrix':[[1,0],[0,-1],[0,0]],'points':[p]}
        with self.assertRaises(AssertionError):module.score(fit,[dict(p,pixel_xy=[3,4])])
if __name__=='__main__':unittest.main()
