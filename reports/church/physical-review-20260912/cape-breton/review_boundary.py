import json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
from tools.church.panels import get_panel
r=Path('reports/church/physical-review-20260912/cape-breton');root=Path('/Users/dfakkeldy/Downloads/church-refinement-03');ring=[[18000,3700],[18150,3700],[18150,7900],[26800,7900],[26800,9300],[35450,9300],[35450,11200],[31600,11200],[31600,16200],[35450,16200],[35450,23800],[28600,23800],[28600,28000],[20700,28000],[20700,30600],[18400,30600],[5500,27750],[900,27750],[900,17300],[5200,17300],[5200,10550],[6500,10550]]
d=dict(source_sha256='148828288528bd9dfdf5d1c6677ed5e3f941f3730cf3a90919e51951afa9041d',source_dimensions=[36223,35027],ring_pixel_xy=ring,status='Source-content boundary candidate based on full overview and native archival crops; geography still rejected pending physical controls/checks',evidence='Excludes upper-left independent locator, top inset plans and directory, Cow Bay and Little Glace Bay plans, bottom Sydney Town/Sydney Harbour plan, and bottom town plans; retains the sloping southern main-map extension to Cape Chameau.',frames=[])
old=[(18400,4100),(27000,4100),(27000,9000),(35700,9000),(35700,10800),(31800,10800),(31800,16300),(35700,16300),(35700,27800),(900,27800),(900,17300),(5200,17300),(5200,10800)]
for name,path,origin,extent in [('overview',Path('/Users/dfakkeldy/Downloads/church-georeferencing-20260912/cape-breton-overview.jpg'),[0,0],[36223,35027]),('top',root/'cape-top.jpg',[17000,100],[18500,9000]),('bottom',root/'cape-bottom.jpg',[900,23500],[34500,10500])]:
 im=Image.open(path);draw=ImageDraw.Draw(im)
 def px(p):return ((p[0]-origin[0])*im.width/extent[0],(p[1]-origin[1])*im.height/extent[1])
 for rr,color in [(old,'#ef3333'),(ring,'#0077ee')]:draw.line([px(p) for p in rr]+[px(rr[0])],fill=color,width=4)
 draw.rectangle((0,0,600,35),fill='white');draw.text((8,8),'RED: previous crop   BLUE: revised content boundary',fill='black')
 im.save(r/(name+'-boundary-review.jpg'),quality=92);d['frames'].append(dict(name=name,origin=origin,extent=extent,display=im.size,rotation=0,source_crop_sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
(r/'content-boundary.json').write_text(json.dumps(d,indent=2)+'\n')
