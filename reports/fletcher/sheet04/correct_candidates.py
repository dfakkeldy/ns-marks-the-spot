exec(open('reports/fletcher/sheet04/point_tools.py').read())
p=json.loads((D/'candidate-controls.json').read_text());good=[];bad=[]
xy={'C01':[2716,1468],'C02':[3560,1910],'C03':[3135,3504],'C04':[2821,3401],'C05':[2123,4235],'C07':[3990,3853],'C08':[3957,4248],'C10':[3862,6122]}
notes={'C01':'Move onto northern-bank junction; bank width remains an uncertainty. Tributary lengths differ.','C02':'Move onto western tributary junction. The next upstream western tributary is shorter historically; local order supports correspondence.','C03':'Move onto lake outlet rather than adjacent land. Lake shape and outlet reach differ.','C04':'Move from the southern peninsula onto the northern inlet; modern extra tributaries and lake shape differ.','C05':'Move from northern arm onto confluence. North/south tributary order supports identity; historical arms are shorter.','C07':'Move from sea onto easternmost headland; historical rounded point differs from fine modern outline.','C08':'Initial world point was offshore rock 21509. Corrected to northernmost vertex of connected Ingonish Island shoreline component seeded at 17782; move native pixel to northern lobe.','C10':'Initial world point was offshore rock 20224. Corrected to mainland coast WACO20 eastern tip behind rock; move native pixel onto eastern extremity of rounded cape. Modern small rocks and detailed outline differ.'}
for q in p['points']:
 i=q['id']
 if i in ['C06','C09']:
  q['status']='Rejected and unscored';q['rejection_reason']='Native northern tributary meets or is obscured by road before the river; exact junction and branch order are not established.' if i=='C06' else 'Modern selected eastern tip is coastal island 22540; historical target is attached Middle Head peninsula. Exact corresponding mainland/island tip is not established.';bad.append(q);continue
 q['initial_pixel_xy']=q['pixel_xy'];q['pixel_xy']=xy[i];q['correction']=notes[i]
 if i in ['C08','C10']:
  q['initial_modern_record']={k:q[k] for k in ['lonlat','guide_xy','modern_objectid','modern_part','modern_vertex','modern_properties']}
  r=json.loads((D/'island-component-review.json').read_text())['northern_extremity'] if i=='C08' else max([r for r in rows if 3680<r['guide_xy'][0]<3800 and 6100<r['guide_xy'][1]<6200 and r['modern_properties']['FEAT_CODE']=='WACO20'],key=lambda r:r['lonlat'][0]);q.update(r)
 q['status']='Identity and wide context reviewed; exact corrected crosshair pending inspection before fitting.';good.append(q)
p['points']=good;(D/'corrected-candidates.json').write_text(json.dumps(p,indent=2)+'\n');(D/'rejected-controls.json').write_text(json.dumps(dict(sheet='sheet-04',points=bad),indent=2)+'\n')
