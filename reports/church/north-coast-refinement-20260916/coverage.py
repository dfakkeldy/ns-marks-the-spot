import json,sys
from pathlib import Path
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import MultiPoint
from tools.church.gcps import load_gcps
r=Path('reports/church/north-coast-refinement-20260916'); rows=load_gcps(r/'retained-diagnostic-review.csv'); ring=json.loads((r/'content-boundary.json').read_text())['ring_pixel_xy'];cs=[p for p in rows if p.role=='control']; hull=MultiPoint([(p.pixel_x,p.pixel_y) for p in cs]).convex_hull
fig,ax=plt.subplots(figsize=(7,10));ax.fill(*zip(*ring),color='#eeeeee');ax.plot(*hull.exterior.xy,'--',color='#4e79a7',label='TPS5 control hull')
coverage=[]
for p in rows:
 ax.scatter(p.pixel_x,p.pixel_y,c='#225ea8' if p.role=='control' else '#bf4d28',marker='s' if p.role=='control' else 'o');ax.annotate(p.label,(p.pixel_x,p.pixel_y),xytext=(7,4),textcoords='offset points')
 if p.role=='check':
  from shapely.geometry import Point
  coverage.append({'id':p.label,'inside_control_hull':hull.covers(Point(p.pixel_x,p.pixel_y))})
ax.invert_yaxis();ax.set_aspect('equal');ax.margins(.12);ax.set_xlabel('Original Inverness composite x (native pixels)');ax.set_ylabel('Original Inverness composite y (native pixels)');ax.set_title('Retained TPS5: 5 controls and 5 diagnostics\nNo fresh checks after the refinement decision');ax.legend();fig.tight_layout();fig.savefig(r/'coverage.png',dpi=150)
(r/'coverage.json').write_text(json.dumps({'checks':coverage,'scope':'Five diagnostic checks; three inland points share one watershed. Northern tip, intervening coast, inland north and cross-sheet seams remain insufficiently checked.'},indent=2)+'\n')
