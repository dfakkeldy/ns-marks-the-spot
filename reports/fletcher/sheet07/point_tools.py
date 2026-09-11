from pathlib import Path
import json,numpy as np
D=Path('reports/fletcher/sheet07');L=Path.home()/'Downloads/fletcher-sheet07';obs=json.loads((D/'search-guide.json').read_text());p=[dict(pixel_xy=[a['pixel_x'],a['pixel_y']],lonlat=[obs['meridians'][a['meridian_index']]['lon'],obs['parallels'][a['parallel_index']]['lat']]) for a in obs['intersections']];g=np.linalg.lstsq(np.c_[[r['lonlat'] for r in p],np.ones(len(p))],np.array([r['pixel_xy'] for r in p]),rcond=None)[0]
rows=[]
for f in json.loads((L/'reference-full/water-lines.geojson').read_text())['features']:
 geom=f['geometry'];parts=[geom['coordinates']] if geom['type']=='LineString' else geom['coordinates']
 for pi,part in enumerate(parts):
  for vi,ll in enumerate(part):
   xy=(np.array([*ll[:2],1])@g).tolist();rows.append(dict(lonlat=ll[:2],guide_xy=xy,modern_objectid=f['properties']['OBJECTID'],modern_part=pi,modern_vertex=vi,modern_properties=f['properties']))
def select(box,axis,direction):
 near=[r for r in rows if box[0]<r['guide_xy'][0]<box[2] and box[1]<r['guide_xy'][1]<box[3]]
 return (max if direction=='max' else min)(near,key=lambda r:r['lonlat'][axis])
nodes={p['id']:p for p in json.loads((L/'search/all-modern-nodes-anchored.json').read_text())}
