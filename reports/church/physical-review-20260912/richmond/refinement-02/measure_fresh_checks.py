"""Measure fresh validation outlines after the seven-control fit was frozen.

No fit, predicted positions, residuals, or score filtering are used here.
"""
import json,hashlib,csv,sys
from pathlib import Path
from PIL import Image,ImageDraw
from tools.church.landmarks import polygon_centroid
ROOT=Path(sys.argv[1]);HERE=Path(__file__).resolve().parent
FROZEN='b7dc6719747a32d2fc4c64cc65df45514cac20ab7a9b7bad69768710035da7f6'
assert hashlib.sha256((HERE/'frozen-fit.csv').read_bytes()).hexdigest()==FROZEN
frames=json.loads((ROOT/'search-frames.json').read_text())
items=[
('F01','Northern isolated island near engraved 45d50 rule','martin-native',[13900,7770],[500,500],'north-fresh',8,[[220,284],[215,259],[223,220],[229,183],[237,151],[259,128],[268,132],[277,161],[284,184],[293,224],[280,241],[266,259],[250,261],[231,285]],50,'Isolated narrow island southeast of the large western harbour peninsula, adjacent to the engraved 45d50 parallel. Both the shoreline shape and isolation agree; no nearby alternative island occupies the same position relative to the peninsula.'),
('F02','Western basin northern diamond islet','F02-native',[6050,17680],[350,300],'west-fresh',8,[[119,181],[131,174],[142,160],[161,150],[186,140],[205,146],[212,157],[227,184],[214,193],[205,205],[179,216],[164,207],[147,192],[128,186]],60,'Small isolated northern islet in Inhabitants Basin, northwest of the long central island and northeast of F03. Surrounding shore projections and island order corroborate the identity.'),
('F03','Western basin western quadrilateral islet','F03-native',[5780,17930],[400,350],'west-fresh',9,[[96,184],[97,140],[109,130],[132,119],[151,123],[173,136],[198,143],[223,142],[249,133],[246,151],[230,177],[215,192],[194,199],[172,197],[140,191]],70,'Islet west of the long central island and southwest of F02, north of the broad southwestern island. Short missing southern ink strokes are explicitly closed for this provisional centroid. F02 and F03 are separate features in one locality, not broad independent regional coverage.'),
('F04','Island labelled Heron near Escousse','F04-native',[9770,18220],[400,380],'west-fresh',2,[[106,139],[119,120],[141,109],[158,103],[190,111],[219,103],[240,106],[264,114],[261,139],[246,150],[239,168],[223,193],[205,211],[187,207],[172,191],[150,174],[143,156],[120,157],[112,149]],50,'Isolated island just offshore at Escousse, south of the Benoit and Buffet island group. Triangular engraving and modern outline are generalized but the surrounding islands, shore corner, and southeast-pointing projection identify the same feature.')]
obs=[]
for ident,label,name,origin,size,frame,idx,outline,uncertainty,evidence in items:
 modern=next(c for f in frames if f['name']==frame for c in f['candidates'] if c['index']==idx);x,y,area=polygon_centroid(outline);pixel=[x+origin[0],y+origin[1]]
 im=Image.open(ROOT/(name+'.jpg'));d=ImageDraw.Draw(im);d.line([tuple(p) for p in outline]+[tuple(outline[0])],fill='#0088cc',width=2);d.line((x-18,y,x+18,y),fill='red',width=2);d.line((x,y-18,x,y+18),fill='red',width=2);im.save(HERE/(ident+'-native-review.jpg'),quality=92)
 obs.append(dict(id=ident,label=label,role='check',pixel_xy=pixel,lonlat=modern['lonlat'],modern_feature_id=modern['feature_id'],modern_polygon=modern['polygon'],modern_ring=modern['ring'],source_frame=dict(origin=origin,extent=size,display=size,rotation=0),source_outline_crop_pixels=outline,feature_definition='Shoelace centroid of corresponding island outline in original scan / frozen modern lon-lat ring',source_crop_sha256=hashlib.sha256((ROOT/(name+'.jpg')).read_bytes()).hexdigest(),placement_uncertainty_ground_m=uncertainty,identity_evidence=evidence,reviewer='Codex native outline and broad-context review; no user verification claimed'))
doc=dict(fit_sha256=FROZEN,selection_status='Exact correspondences and outlines chosen after the seven-control TPS was frozen; all four recorded before scoring; no fitting or selection by residual.',source_sha256='462194ca1ca810d88416d7cd344f17c5f37acf20c8e43381dc3064668010a5f7',reference_sha256='02bbd4c7a583e3f9156ca93ed9dc9617659d4d53b72b81bb74971c75c561740f',points=obs,abstentions=[{'area':'northern harbour island pair','reason':'Relative shape/order differs between historical pair and modern larger southwestern island plus small northeastern rock; no identity assignment adopted.'},{'area':'island between Round group and Boom Island','reason':'The modern isolated island is not clearly drawn in the historical context; no point measured.'}],coverage_limit='One northern check and three western checks spanning two western localities. No fresh check near Grand Narrows or the far eastern/southern edge; not a county-wide validation set.')
(HERE/'fresh-checks.json').write_text(json.dumps(doc,indent=2)+'\n')
with (HERE/'fresh-checks.csv').open('w',newline='') as f:
 w=csv.writer(f,lineterminator='\n');w.writerow(['pixel_x','pixel_y','lon','lat','role','label'])
 for p in obs:w.writerow([*p['pixel_xy'],*p['lonlat'],'check',p['id']])
print([(p['id'],p['pixel_xy']) for p in obs])
