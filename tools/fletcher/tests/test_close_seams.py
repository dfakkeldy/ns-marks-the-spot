"""Cartographic seam closure must move source detail, not paint empty areas."""
import unittest
try:
    import numpy as np
except ImportError:
    np = None

if np is not None:
    from tools.fletcher.close_seams import close_line

@unittest.skipIf(np is None, "optional NumPy dependency absent")
class CloseSeamsTests(unittest.TestCase):
    def fixture(self, gap=10):
        n=120
        pixels=np.zeros((4,n), dtype=np.uint8)
        pixels[:3]=np.arange(n, dtype=np.uint8)
        pixels[3]=255
        owner=np.ones(n,dtype=np.uint8)
        owner[60:]=2
        pixels[:,50:50+gap]=0
        owner[50:50+gap]=0
        return pixels,owner

    def test_stretches_both_sides_and_retains_interiors(self):
        pixels,owner=self.fixture()
        before=pixels.copy()
        result,labels,stats=close_line(pixels,owner,max_gap=12,band=20,allowed={(1,2)})
        self.assertTrue(np.all(result[3]>0))
        np.testing.assert_array_equal(result[:,:25],before[:,:25])
        np.testing.assert_array_equal(result[:,90:],before[:,90:])
        self.assertEqual(set(labels),{1,2})
        self.assertLess(result[0,54],50)
        self.assertGreaterEqual(result[0,55],60)
        self.assertEqual(stats['closed_gaps'],1)
        self.assertEqual(stats['closed_pixels'],10)

    def test_does_not_fill_same_sheet_hole(self):
        pixels,owner=self.fixture()
        owner[owner==2]=1
        result,_,stats=close_line(pixels,owner,max_gap=12,band=20,allowed={(1,2)})
        np.testing.assert_array_equal(result,pixels)
        self.assertEqual(stats['closed_gaps'],0)

    def test_does_not_bridge_large_gap_or_unreviewed_pair(self):
        pixels,owner=self.fixture()
        for limit,pairs in [(5,{(1,2)}),(12,{(1,3)})]:
            result,_,_=close_line(pixels,owner,max_gap=limit,band=20,allowed=pairs)
            np.testing.assert_array_equal(result,pixels)

    def test_does_not_extend_external_frame(self):
        pixels,owner=self.fixture()
        pixels[:,:60]=0; owner[:60]=0
        result,_,_=close_line(pixels,owner,max_gap=100,band=20,allowed={(1,2)})
        np.testing.assert_array_equal(result,pixels)

    def test_odd_gap_and_non_square_multigap_line(self):
        pixels,owner=self.fixture(gap=9)
        owner[59:]=2
        result,labels,_=close_line(pixels,owner,max_gap=12,band=20,allowed={(1,2)})
        self.assertTrue(np.all(result[3]>0))
        self.assertTrue(np.all(np.diff(result[0].astype(float))>=0))
        self.assertTrue(np.all(labels>0))

    def test_raster_edge_sliver_does_not_block_the_junction(self):
        pixels,owner=self.fixture()
        pixels[:,63:65]=0; owner[63:65]=0
        result,labels,stats=close_line(pixels,owner,max_gap=20,band=20,allowed={(1,2)})
        self.assertTrue(np.all(result[3]>0))
        self.assertTrue(np.all(labels>0))
        self.assertEqual(stats["closed_pixels"],12)

    def test_two_same_sheet_holes_do_not_become_an_intersheet_gap(self):
        pixels=np.full((4,240),255,dtype=np.uint8)
        owner=np.ones(240,dtype=np.uint8); owner[110:]=2
        for a,b in [(100,103),(113,115)]:
            pixels[:,a:b]=0; owner[a:b]=0
        result,labels,stats=close_line(pixels,owner,max_gap=30,band=20,allowed={(1,2)})
        np.testing.assert_array_equal(result,pixels)
        np.testing.assert_array_equal(labels,owner)
        self.assertEqual(stats["closed_gaps"],0)

    def test_refuses_to_stretch_tiny_island_into_gap(self):
        pixels,owner=self.fixture()
        pixels[:,:47]=0; owner[:47]=0
        result,_,stats=close_line(pixels,owner,max_gap=12,band=20,allowed={(1,2)})
        np.testing.assert_array_equal(result,pixels)
        self.assertEqual(stats['closed_gaps'],0)

if __name__=='__main__': unittest.main()
