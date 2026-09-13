"""Compare exact rendered pixels with directly projected NSTDB vector geometry."""
import sys
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from PIL import Image
import work as w
BASELINES={
'14':'fletcher-sheet14/hay-boundary-audit/hay-result/sheet-14-full-sheet.tif',
'16':'mabou-north-audit-20260909/result36/sheet-16-full-sheet.tif',
'19':'judique-full-sheet/result/judique-full-sheet.tif',
'22':'hawkesbury-full-sheet/boundary-result/sheet-22-full-sheet.tif'}
CENTRES={'14':[(7443,3486),(9402,5898)],'16':[(8970,5799),(7828,1117)],'19':[(5113,4361),(9559,5692)],'22':[(2594,5707),(5402,1178)]}
s=sys.argv[1];folder=w.HERE/f'sheet-{s}';out=folder/'warped-review';out.mkdir(exist_ok=True)
local=w.DL/f'fletcher-route19-three-rounds-20260912/sheet-{s}';fit=w.read(folder/'round-3-fit.json')
rasters=[w.DL/BASELINES[s],local/f'sheet-{s}-full-sheet.tif'];vectors={}
expected=next(row['raster_sha256'] for row in w.read(w.ROOT/'full-sheets/inputs.json')['sheets'] if row['sheet']==s)
w.c.verified(rasters[0],expected)
for layer in ['water-lines','roads']:
    vectors[layer]=[]
    for f in w.read(w.DL/w.CONFIG[s]['reference']/f'{layer}.geojson')['features']:
        g=f['geometry'];parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates'];vectors[layer].extend(w.c.merc(a) for a in parts)
frames=[]
for index,pixel in enumerate(CENTRES[s]):
    centre=w.transform(fit,[pixel])[0];x0,y0=centre-1500;x1,y1=centre+1500
    fig,axes=plt.subplots(1,2,figsize=(15,7.5))
    for n,(ax,raster) in enumerate(zip(axes,rasters)):
        dest=local/f'review-{index}-{n}.png';w.c.run('gdal_translate','-q','-of','PNG','-projwin',x0,y1,x1,y0,'-outsize',1000,1000,raster,dest)
        info=__import__('json').loads(w.c.run('gdalinfo','-json',dest));gt=info['geoTransform'];width,height=info['size']
        ax.imshow(Image.open(dest),extent=[gt[0],gt[0]+width*gt[1],gt[3]+height*gt[5],gt[3]])
        for layer,color in [('roads','#e44fb5'),('water-lines','#00b9f1')]:
            parts=[a for a in vectors[layer] if a[:,0].min()<x1 and a[:,0].max()>x0 and a[:,1].min()<y1 and a[:,1].max()>y0]
            ax.add_collection(LineCollection(parts,colors=color,linewidths=.8,alpha=.8))
        ax.set(xlim=(x0,x1),ylim=(y0,y1),aspect='equal',title=['Baseline','After three rounds'][n]);ax.set_axis_off()
    name=f'area-{index+1}.jpg';fig.suptitle(f'Sheet {s} · actual GeoTIFF pixels · cyan NSTDB water / magenta roads');fig.tight_layout();fig.savefig(out/name,dpi=120);plt.close(fig)
    frames.append(dict(image=name,raster_paths=[str(p) for p in rasters],raster_hashes=[w.c.digest(p) for p in rasters],projected_bounds=[x0,y0,x1,y1],crs='EPSG:3857',scope='Actual raster window; vector reference projected directly, not through inverse fit.'))
w.write(out/'frames.json',frames)
