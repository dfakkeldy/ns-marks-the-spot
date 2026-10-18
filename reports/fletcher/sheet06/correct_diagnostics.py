exec(open('reports/fletcher/sheet06/point_tools.py').read())
d=json.loads((D/'candidate-diagnostics.json').read_text())
for p in d['points']:
 if p['id']=='Q01':p['pixel_xy']=[8397,3338]
 if p['id']=='Q02':p['pixel_xy']=[7751,6144];p.update(nodes['J0521']);p.update(id='Q02',modern_node_id='J0521');p['identity_evidence']='Faribault Brook main southeastern arm and western tributary junction; corrected from downstream western tributary fork J0534 to J0521 before scoring.'
 if p['id']=='Q03':p['pixel_xy']=[6052,5592]
 p['status']='Corrected diagnostic pending exact crosshair inspection before first score.'
(D/'diagnostic.json').write_text(json.dumps(d,indent=2)+'\n')
