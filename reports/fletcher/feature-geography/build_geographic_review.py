"""Compare the exact current raster and independent modern vectors at one extent."""
import argparse
import math
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,str(Path(__file__).resolve().parents[3]))
from tools.fletcher.project_labels import ROOT,read,write,digest,require,mercator


def paths(geometry):
    if geometry['type']=='Point': return [[geometry['coordinates']]]
    if geometry['type']=='LineString': return [geometry['coordinates']]
    if geometry['type'] in ('MultiLineString','Polygon'): return geometry['coordinates']
    if geometry['type']=='MultiPolygon': return [ring for polygon in geometry['coordinates'] for ring in polygon]
    raise ValueError(geometry['type'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raster',type=Path,required=True)
    parser.add_argument('--references',type=Path,required=True)
    args=parser.parse_args()
    directory=ROOT/'reports/fletcher/feature-geography'
    data=read(directory/'sheet-19-features.geojson')
    active=next(s for s in read(ROOT/'reports/fletcher/full-sheets/inputs.json')['sheets'] if s['sheet']=='19')
    require(digest(args.raster)==active['raster_sha256'],'Wrong current raster')
    refs=read(ROOT/'reports/fletcher/matching-benchmark/reference-receipts.json')+read(ROOT/'reports/fletcher/placement-pilot/road-context-receipts.json')
    vectors={}
    for ref in refs:
        file=args.references/(ref['name']+'.geojson')
        require(digest(file)==ref['sha256'],f"Reference mismatch: {ref['name']}")
        vectors[ref['name']]=read(file)['features']
    groups={'eastern-forge-mill':[60,62], 'mclennan-mill':[68], 'central-schools':[71,72,73], 'long-point-north':[74,82], 'long-point-south':[87,89], 'western-school':[91], 'central-coastal-services':[18,19,24], 'dennistown-school':[50], 'river-denys-services':[57,58], 'north-services':[4,5,6,7,8,9,10,11], 'church-brook':[13,15,21], 'chisholm-mills':[77,78,79], 'northeast-mine':[61], 'glendale':[94,103,117]}
    receipt={'fit_sha256':data['provenance']['fit_sha256'],'raster_sha256':digest(args.raster),'reference_receipts':refs,'coordinate_convention':'North up; identical EPSG:3857 extent in raster and independent-vector panels. Extent is in projected metres, not ground metres.','scenes':[]}
    font=ImageFont.load_default(size=18)
    for name,ids in groups.items():
        features=[f for f in data['features'] if int(f['id'].split('-')[-1]) in ids]
        points=[mercator(p) for f in features for ring in paths(f['geometry']) for p in ring]
        x0,y0=map(min,zip(*points));x1,y1=map(max,zip(*points));cx,cy=(x0+x1)/2,(y0+y1)/2
        span=max(2600,x1-x0+1500,y1-y0+1500); west,north=cx-span/2,cy+span/2
        def pixel(ll):
            x,y=mercator(ll);return ((x-west)*800/span,(north-y)*800/span)
        png=directory/f'.{name}.png'
        subprocess.run([shutil.which('gdal_translate'),'-q','-of','PNG','-projwin',str(west),str(north),str(west+span),str(north-span),'-outsize','800','800',str(args.raster),str(png)],check=True,capture_output=True)
        hist=Image.new('RGB',(800,800),'#cccac3');warped=Image.open(png).convert('RGBA');hist.paste(warped,mask=warped.getchannel('A'))
        modern=Image.new('RGB',(800,800),'#faf3e5');draw=ImageDraw.Draw(modern)
        seen={k:[] for k in vectors};h19=[]
        for key,color,width in [('water-polygons','#abd6dc',1),('water-lines','#498eaa',2),('rail','#888888',1),('roads','#a17443',2),('highways','#a34d1f',4),('bridges','#6c481f',4)]:
            for feature in vectors[key]:
                rings=[[pixel(p) for p in ring] for ring in paths(feature['geometry'])]
                allp=[p for ring in rings for p in ring]
                if not allp or max(p[0] for p in allp)<0 or min(p[0] for p in allp)>800 or max(p[1] for p in allp)<0 or min(p[1] for p in allp)>800:continue
                seen[key].append(feature['properties']['OBJECTID'])
                for ring in rings:
                    if key=='water-polygons' and len(ring)>2:draw.polygon(ring,fill=color)
                    elif len(ring)>1:draw.line(ring,fill=color,width=width)
                    if key=='highways' and feature['properties'].get('RTE_NO')==19:h19 += [p for p in ring if 50<p[0]<650 and 50<p[1]<750]
        if h19:
            x,y=min(h19,key=lambda p:abs(p[1]-120));draw.text((x+8,y),'Highway 19',fill='#893e16',font=font,stroke_width=2,stroke_fill='#faf3e5')
        for image in (hist,modern):
            ink=ImageDraw.Draw(image)
            for feature in features:
                g=feature['properties']['map_derived_geometry'] if image is hist else feature['geometry']
                if g is None:continue
                rings=[[pixel(p) for p in ring] for ring in paths(g)]
                for ring in rings:
                    if len(ring)==1:
                        x,y=ring[0];ink.ellipse((x-7,y-7,x+7,y+7),outline='#00665d',width=3)
                    else:ink.line(ring,fill='#00665d',width=3)
                x,y=rings[0][0];ink.text((x+10,y-20),feature['id'][-3:],fill='#00665d',font=font,stroke_width=2,stroke_fill='#faf3e5')
        panel=Image.new('RGB',(1600,880),'white');panel.paste(hist,(0,80));panel.paste(modern,(800,80));ink=ImageDraw.Draw(panel)
        ink.text((10,6),f'Judique {name}: current historical raster / NSTDB roads, highways, bridges and water',fill='black',font=font)
        ink.text((10,31),'Teal: source mark/group projection; church modern panel keeps east-side correction. Group outlines are not property boundaries.',fill='black',font=font)
        ink.text((10,56),'Source: David Rumsey / Stanford, CC BY-NC-SA 3.0. Modern: Province of Nova Scotia NSTDB; corrected church © OSM contributors, ODbL.',fill='black',font=font)
        output=directory/f'judique-{name}-geography.jpg';panel.save(output,quality=90)
        warped.close();png.unlink();Path(str(png)+'.aux.xml').unlink(missing_ok=True)
        receipt['scenes'].append({'name':name,'annotation_ids':[f['id'] for f in features],'extent_epsg3857':[west,north-span,west+span,north],'panel_pixels':[800,800],'image_path':output.name,'image_sha256':digest(output),'context_object_ids':seen,'highway19_label_drawn':bool(h19),'meaning':'Context objects are drawn features, not accepted correspondences. Visual review is recorded separately.'})
    write(directory/'judique-geographic-review-frames.json',receipt)

if __name__=='__main__':main()
