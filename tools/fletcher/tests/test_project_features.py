"""Source/placement/export boundaries for reviewed Fletcher features."""
import copy
import json
import math
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
from tools.fletcher import project_labels as labels, project_features as features, export_features


class FeatureEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.data=labels.read(labels.ROOT/features.REPORT/'sheet-19-features.geojson')
        self.rows={f['id']:f for f in self.data['features']}

    def test_church_correction_and_rejected_prediction_are_preserved(self):
        old=labels.read(labels.ROOT/features.PILOT/'mapped-annotations.geojson')
        old_church=next(f for f in old['features'] if f['id']=='F19-JUD-015')
        church=self.rows[old_church['id']]
        self.assertEqual(church['geometry'],old_church['geometry'])
        self.assertEqual(church['properties']['placement_correction'],old_church['properties']['placement_correction'])
        self.assertEqual(church['properties']['previous_placements'][0]['feature'],old_church)
        self.assertNotEqual(church['properties']['map_derived_geometry'],church['geometry'])
        self.assertGreater(church['geometry']['coordinates'][0],-61.49115)

    def test_original_annotations_remain_unlocated_and_preserved(self):
        inventory=labels.read(labels.ROOT/labels.INVENTORIES/'sheet-19-reviewed.json')
        for a in inventory['annotations']:
            self.assertIsNone(a['geometry'])
            if a['id'] in self.rows:
                self.assertEqual(self.rows[a['id']]['properties']['source_annotation'],a)
        self.assertNotIn('F19-JUD-014',self.rows)  # Settlement lettering is not a feature point.

    def test_ambiguous_services_share_group_without_invented_buildings(self):
        for aid in ['F19-JUD-006','F19-JUD-009','F19-JUD-010','F19-JUD-021','F19-JUD-077','F19-JUD-078','F19-JUD-079']:
            self.assertEqual(self.rows[aid]['geometry']['type'],'Polygon')
            self.assertIsNone(self.rows[aid]['properties']['source_review']['source_anchor_xy'])
        self.assertEqual(self.rows['F19-JUD-009']['geometry'],self.rows['F19-JUD-010']['geometry'])

    def test_source_symbols_not_lettering_centres(self):
        gold=self.rows['F19-JUD-094']['properties']
        self.assertEqual(gold['source_geometry_native']['coordinates'],[6955,3930])
        self.assertIn('user explicitly identified',gold['prior_locality_review']['evidence'])
        for f in self.rows.values():
            p=f['properties']; geometry=p['source_geometry_native']
            if geometry['type']=='Point':
                self.assertNotIn(geometry['coordinates'],[labels.box_center(b,p['source_dimensions_px']) for b in p['source_annotation']['source_label_boxes_xywh']])

    def test_export_excludes_pending_geographic_reviews(self):
        pending=copy.deepcopy(self.data)
        pending['features'][0]['properties']['geographic_review_status']='pending-current-fit-review'
        with tempfile.TemporaryDirectory() as tmp,patch.object(labels,'read',return_value=pending):
            exported=export_features.export([19],Path(tmp))
            self.assertEqual(len(exported),len(pending['features'])-1)
            self.assertNotIn(pending['features'][0]['id'],{f['id'] for f in exported})

    def test_committed_placement_review_images_and_fits_match(self):
        review=labels.read(labels.ROOT/features.REPORT/'sheet-19-placement-review.json')
        self.assertEqual(review['fit_sha256'],self.data['provenance']['fit_sha256'])
        for item in review['reviews']:
            self.assertEqual(labels.digest(labels.ROOT/features.REPORT/item['scene']),item['scene_sha256'])
        frames=labels.read(labels.ROOT/features.REPORT/'judique-geographic-review-frames.json')
        for scene in frames['scenes']:
            if scene['name'] in ('north-services','church-brook','chisholm-mills'):
                self.assertTrue(scene['highway19_label_drawn'])
                self.assertTrue(scene['context_object_ids']['highways'])
        self.assertTrue({'roads','highways','bridges'}<={r['name'] for r in frames['reference_receipts']})

    @unittest.skipUnless(shutil.which('gdaltransform'),'GDAL CLI optional in stdlib CI')
    def test_one_outside_neatline_feature_does_not_block_other_records(self):
        original_inside = labels.inside
        with patch.object(labels, 'inside', side_effect=lambda point, ring: False if point == [4022,1338] else original_inside(point,ring)):
            data=features.project(19,shutil.which('gdaltransform'))
        rows={f['id']:f for f in data['features']}
        self.assertIsNone(rows['F19-JUD-004']['geometry'])
        self.assertEqual(rows['F19-JUD-004']['properties']['placement_status'],'outside-fit-neatline')
        self.assertIsNotNone(rows['F19-JUD-007']['geometry'])
        self.assertEqual(len(rows),len(self.rows))

    @unittest.skipUnless(shutil.which('gdaltransform'),'GDAL CLI optional in stdlib CI')
    def test_committed_feature_geometry_replays(self):
        actual=features.project(19,shutil.which('gdaltransform'))
        def compare_coordinates(old, new):
            self.assertEqual(len(old),len(new))
            for a,b in zip(old,new):
                if isinstance(a,list): compare_coordinates(a,b)
                else: self.assertTrue(math.isclose(a,b,abs_tol=1e-8,rel_tol=0))
        for old,new in zip(self.data['features'],actual['features']):
            for old_parent,new_parent,key in [(old,new,'geometry'),(old['properties'],new['properties'],'map_derived_geometry')]:
                if old_parent[key] is None:self.assertIsNone(new_parent[key])
                else:
                    self.assertEqual(old_parent[key]['type'],new_parent[key]['type'])
                    compare_coordinates(old_parent[key]['coordinates'],new_parent[key]['coordinates'])
                    new_parent[key]=old_parent[key]
        self.assertEqual(actual,self.data)

if __name__=='__main__':unittest.main()
