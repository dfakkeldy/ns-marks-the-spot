"""Freeze manually reviewed native outlines; derive centroids and review overlays."""
import json,sys,hashlib
from pathlib import Path
from PIL import Image,ImageDraw
from tools.church.landmarks import polygon_centroid
root=Path(sys.argv[1]);out=Path(__file__).resolve().parent
frames=json.loads((root/'search-frames.json').read_text())
items=[
('C01','Round Island','control','round-native',[13050,4600],[600,500],'north-islands',6,
[[156,245],[179,231],[201,223],[213,207],[211,190],[218,161],[244,148],[267,137],[290,144],[301,151],[299,163],[331,192],[370,218],[399,234],[430,242],[455,260],[452,266],[422,279],[402,277],[385,273],[361,291],[341,317],[309,331],[275,334],[235,333],[197,330],[173,323],[162,303],[158,280]],
'Large western triangular island in the northern island group, immediately north of Boom Island and west of the split historical eastern island. North-shore points and island order match the reference. Native outline is continuous.',40),
('C02','Islet north of Barque group','control','island-above-barque-native',[22450,17330],[600,550],'grand-river',16,
[[238,267],[250,257],[256,238],[268,214],[280,210],[293,212],[307,229],[329,243],[310,262],[299,277],[277,286],[259,283]],
'Isolated main islet between the mainland coast and the three Barque islands. Uses the main modern land ring; nearby tiny rock is not substituted for it. Historical small-island outline is exaggerated and its northeast stroke is damaged: short straight closures across missing ink support only a provisional centroid, not a surveyed shoreline.',90),
('D01','Small island east of Round group','check','north-check-native',[13950,4770],[400,420],'north-islands',4,
[[97,119],[137,112],[167,121],[184,147],[206,174],[193,185],[174,201],[160,195],[151,180],[148,167],[130,155],[110,157],[97,141]],
'Isolated small island east of the two historical eastern pieces (one connected modern island). Round Island lies to the west. Small-island cartographic exaggeration limits centroid precision. Reserved from all fits; diagnostic because selected after inspecting the baseline northern mismatch.',60)]
observations=[]
for ident,label,role,name,origin,size,frame,idx,outline,evidence,uncertainty in items:
 modern=next(c for f in frames if f['name']==frame for c in f['candidates'] if c['index']==idx)
 cx,cy,area=polygon_centroid(outline);pixel=[origin[0]+cx,origin[1]+cy];im=Image.open(root/(name+'.jpg'));draw=ImageDraw.Draw(im);draw.line([tuple(p) for p in outline]+[tuple(outline[0])],fill='#0088cc',width=2);draw.line((cx-20,cy,cx+20,cy),fill='red',width=2);draw.line((cx,cy-20,cx,cy+20),fill='red',width=2);im.save(out/(ident+'-native-review.jpg'),quality=92)
 observations.append(dict(id=ident,label=label,role=role,pixel_xy=pixel,lonlat=modern['lonlat'],modern_feature_id=modern['feature_id'],modern_polygon=modern['polygon'],modern_ring=modern['ring'],modern_definition='lon/lat shoelace centroid of identified NSTDB water-polygon interior ring',source_frame=dict(origin=origin,extent=size,display=size,rotation=0,pixel_convention='original native continuous pixel coordinates; no screenshot-space transfer'),outline_crop_pixels=outline,source_definition='shoelace centroid of visually traced native island outline',source_crop_sha256=hashlib.sha256((root/(name+'.jpg')).read_bytes()).hexdigest(),identity_evidence=evidence,placement_uncertainty_ground_m=uncertainty,reviewer='Codex native outline and broad-topology review; no user point audit claimed'))
(out/'new-observations.json').write_text(json.dumps(dict(source_sha256='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7',source_dimensions=[35735,30429],reference_sha256='02bbd4c7a583e3f9156ca93ed9dc9617659d4d53b72b81bb74971c75c561740f',points=observations,rejected=[dict(candidate='large island east of Round Island',reason='Historical drawing has two separated pieces; modern ring is connected. No centroid match adopted.')]),indent=2)+'\n')
print([(o['id'],o['pixel_xy']) for o in observations])
