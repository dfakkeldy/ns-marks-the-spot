exec(open('reports/fletcher/sheet10/point_tools.py').read())
j=json.loads((D/'candidate-controls.json').read_text())
px={'C01':[3670,3270],'C02':[3652,1701],'C03':[5826,1910],'C04':[6967,3536],'C05':[4725,3097],'C06':[9945,1457],'C07':[9312,2445],'C08':[8127,3151],'C09':[2616,6250],'C11':[8056,5953]}
for p in j['points']:
 p['original_candidate']=dict(p)
 if p['id'] in px:p['pixel_xy']=px[p['id']]
 if p['id'] in ['C01','C09']:
  k='J1167' if p['id']=='C01' else 'J1953';r=nodes[k].copy();r.pop('id');p.update(r);p['modern_node_id']=k;p['correction_reason']='Original world point was the eastern tributary; changed to identified western tributary before first fit.'
 if p['id']=='C11':
  rr=[r for r in rows if r['modern_properties']['FEAT_CODE'].startswith('WACO') and 7880<r['guide_xy'][0]<8030 and 5800<r['guide_xy'][1]<6000];r=min(rr,key=lambda r:r['lonlat'][1]);p.update(r);p['correction_reason']='Original modern extremum selected adjacent mainland. Corrected to southern spit tip before fit.';print('C11',r['guide_xy'],r['modern_objectid'])
 if p['id'] in ['C10','C12']:
  p['role']='rejected';p['status']='Rejected unscored: braided Middle River / West Branch bank identity is ambiguous.' if p['id']=='C10' else 'Rejected unscored: native proposal is on land inland of Oyster Pond; intended point identity not established.'
 else:p['status']='Corrected before first fit; native review pending.'
(D/'corrected-candidates.json').write_text(json.dumps(j,indent=2)+'\n')
