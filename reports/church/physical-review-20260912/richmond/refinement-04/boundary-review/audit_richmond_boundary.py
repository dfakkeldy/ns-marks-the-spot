import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
from osgeo import gdal
r=Path('/var/home/dan/nsmarks-church-20260912/repo/reports/church/physical-review-20260912/richmond');out=Path('/var/home/dan/nsmarks-church-20260912/boundary-audit');out.mkdir(exist_ok=True)
source=Path('/var/home/dan/nsmarks-church-20260726/sources/downloads/richmond/richmond.tif');ds=gdal.Open(str(source));ring=json.loads((r/'content-boundary.json').read_text())['ring_pixel_xy'];frames=[]
for i,(x,y) in enumerate(ring):
 ox=max(0,min(35735-1400,x-700));oy=max(0,min(30429-1400,y-700));p=out/f'corner-{i:02}.jpg';gdal.Translate(str(p),ds,srcWin=[ox,oy,1400,1400],width=700,height=700,format='JPEG');im=Image.open(p);d=ImageDraw.Draw(im);xy=[((a-ox)/2,(b-oy)/2) for a,b in ring];d.line(xy+[xy[0]],fill='#0088ff',width=3);d.rectangle((0,0,700,24),fill='white');d.text((6,6),f'Corner {i}; native origin {ox},{oy}; 1400x1400 at 1:2',fill='black');im.save(p,quality=90);frames.append(dict(index=i,origin=[ox,oy],extent=[1400,1400],display=[700,700],rotation=0,source_corner=[x,y]))
for page in range(4):
 canvas=Image.new('RGB',(1400,1400),'white')
 for j in range(4):
  i=page*4+j
  if i<len(ring):canvas.paste(Image.open(out/f'corner-{i:02}.jpg'),((j%2)*700,(j//2)*700))
 canvas.save(out/f'boundary-corners-{page+1}.jpg',quality=90)
(out/'frames.json').write_text(json.dumps(dict(source_path=str(source),boundary_sha256=hashlib.sha256((r/'content-boundary.json').read_bytes()).hexdigest(),frames=frames),indent=2)+'\n')
