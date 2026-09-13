import sys,json
from pathlib import Path
from collections import defaultdict
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.path import Path as PlotPath
from matplotlib.patches import PathPatch
from PIL import Image,ImageDraw
ROOT=Path('/Users/dfakkeldy/Downloads/fletcher-sheet21/refinement-20260912/search')
ROOT.mkdir(parents=True,exist_ok=True)
DATA=Path('/Users/dfakkeldy/Downloads/fletcher-sheet21/reference-full')
REPO=Path.cwd()
d=json.loads((REPO/'reports/fletcher/sheet21/search-guide.json').read_text())
known=[{'pixel_xy':[m['pixel_x'],p['pixel_y']], 'lonlat':[m['lon'],p['lat']]} for m in d['meridians'] for p in d['parallels']]
ll=np.array([r['lonlat'] for r in known]);px=np.array([r['pixel_xy'] for r in known]);guide=np.linalg.lstsq(np.c_[ll,np.ones(len(ll))],px,rcond=None)[0]
def xy(c):
 a=np.asarray(c);return np.c_[a[:,:2],np.ones(len(a))]@guide
name=sys.argv[1];box=tuple(map(int,sys.argv[2:6]));w,h=box[2]-box[0],box[3]-box[1]
im=Image.open('/Users/dfakkeldy/Downloads/fletcher-sheet21/native/sheet21.png');c=im.crop(box);c.save(ROOT/(name+'-source.png'));d=ImageDraw.Draw(c)
for x in range((box[0]//100+1)*100,box[2],100):d.line(((x-box[0]),0,x-box[0],h),fill='#2ea8b0',width=1);d.text((x-box[0]+3,5),str(x),fill='#ff3131',font_size=16)
for y in range((box[1]//100+1)*100,box[3],100):d.line((0,y-box[1],w,y-box[1]),fill='#2ea8b0',width=1);d.text((3,y-box[1]+3),str(y),fill='#ff3131',font_size=16)
c.save(ROOT/(name+'-grid.png'))
fig,ax=plt.subplots(figsize=(w/100,h/100));ends=defaultdict(list)
for name2,col,lw in [('roads','#9d9d9d',1),('water-lines','#0078b3',1.7),('rail','#8b549f',1)]:
 lines=[]
 for f in json.loads((DATA/(name2+'.geojson')).read_text())['features']:
  cc=f['geometry']['coordinates'];parts=[cc] if f['geometry']['type']=='LineString' else cc
  for part in parts:
   lines.append(xy(part))
   if name2=='water-lines':
    for ll in [part[0],part[-1]]:ends[tuple(round(n,7) for n in ll[:2])].append(f['properties']['OBJECTID'])
 ax.add_collection(LineCollection(lines,colors=col,linewidths=lw))
water_edges=[]
for feature in json.loads((DATA/'water-polygons.geojson').read_text())['features']:
 geom=feature['geometry'];polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates']
 for poly in polys:
  vertices=[];codes=[]
  for ring in poly:
   coords=xy(ring);water_edges.append(coords);vertices.extend(coords);codes.extend([PlotPath.MOVETO]+[PlotPath.LINETO]*(len(coords)-2)+[PlotPath.CLOSEPOLY])
  ax.add_patch(PathPatch(PlotPath(vertices,codes),facecolor="#d4edf8",edgecolor="none",alpha=.75,zorder=-1))
ax.add_collection(LineCollection(water_edges,colors='#299cb7',linewidths=.8))
nodes=[]
for ll,ids in ends.items():
 if len(ids)>=3:nodes.append({'lonlat':list(ll),'source_guide_xy':xy([ll])[0].tolist(),'objectids':sorted(ids)})
nodes.sort(key=lambda n:(-n['lonlat'][1],n['lonlat'][0]))
local=[]
for i,n in enumerate(nodes,1):
 n['id']=f'J{i:04}';x,y=n['source_guide_xy']
 if box[0]<x<box[2] and box[1]<y<box[3]:
  local.append(n);ax.plot(x,y,'o',ms=4,color='#d85131');ax.annotate(n['id'],(x,y),xytext=(4,-11),textcoords='offset points',fontsize=9,color='#ad3318',bbox=dict(fc='white',ec='none',alpha=.75,pad=0))
(ROOT/'all-modern-nodes-anchored.json').write_text(json.dumps(nodes,indent=2)+'\n');(ROOT/(name+'-nodes.json')).write_text(json.dumps(local,indent=2)+'\n')
ax.set(xlim=(box[0],box[2]),ylim=(box[3],box[1]),title='Modern water / roads: printed-graticule search guide ONLY; not physical controls',xlabel='Approximate source x',ylabel='Approximate source y');ax.set_aspect('equal');ax.grid(alpha=.2);fig.tight_layout();fig.savefig(ROOT/(name+'-modern.png'),dpi=100)
print('nodes',len(local))
