"""Export only reviewed approximate historical features and their native excerpts."""
import argparse
from pathlib import Path
from . import project_labels as labels
from .project_features import REPORT


def export(sheets, out):
    features=[]; sources=[]
    for sheet in sheets:
        path=REPORT/f'sheet-{sheet}-features.geojson'
        data=labels.read(labels.ROOT/path)
        sources.append({'sheet':sheet,'path':str(path),'sha256':labels.digest(labels.ROOT/path),'provenance':data['provenance']})
        for f in data['features']:
            p=f['properties']
            if f['geometry'] is None or p['geographic_review_status']!='approximate-placement-reviewed':continue
            props={key:p[key] for key in ('annotation_id','sheet','source_text','kind','reading_status','placement_status','geographic_role','geometry_meaning','fit_revision','fit_sha256','source_sha256','source_dimensions_px','source_geometry_native','source_crop','source_context_url','source_url','credit','imagery_licence_url')}
            props.update(source_note=p['source_review']['note'],placement_note=p['placement_review']['evidence'],
                         source_excerpt=f"excerpts/{f['id']}.jpg",evidence_url=f"https://github.com/dfakkeldy/ns-marks-the-spot/blob/nightly/{path}",
                         evidence_sha256=sources[-1]['sha256'])
            if p.get('placement_correction'):props['placement_correction']=p['placement_correction']
            features.append({'type':'Feature','id':f['id'],'geometry':f['geometry'],'properties':props})
    labels.require(len({f['id'] for f in features})==len(features),'Duplicate export identity')
    labels.write(out/'reviewed.geojson',{'type':'FeatureCollection','features':features})
    changes='Historical annotations transcribed, source symbols/groups/linear reaches reviewed, projected with frozen TPS fits'
    if any(f['properties'].get('placement_correction') for f in features):
        changes+='; one explicit church correction from local review and OpenStreetMap (ODbL 1.0)'
    changes+='.'
    labels.write(out/'source.json',{'scope':'Reviewed approximate Fletcher historical features; ongoing digitization, incomplete sheet inventory.',
                                 'feature_count':len(features),'sources':sources,'derivative_sha256':labels.digest(out/'reviewed.geojson'),
                                 'credit':'David Rumsey Map Collection / David Rumsey Map Center, Stanford University Libraries',
                                 'imagery_licence_url':'https://creativecommons.org/licenses/by-nc-sa/3.0/',
                                 'changes':changes,
                                 'accuracy':'Approximate historical information, not surveyed sites or current conditions. Group areas do not imply properties or site footprints. Line endpoints delimit reviewed source evidence, not exact falls or complete waterway extents.'})
    return features


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sheet',type=int,action='append',required=True)
    parser.add_argument('--out',type=Path,default=labels.ROOT/'web/public/fletcher-features')
    parser.add_argument('--source',type=Path,help='Native scan for the single requested sheet; required to create/update excerpts')
    args=parser.parse_args();features=export(args.sheet,args.out)
    if args.source:
        labels.require(len(args.sheet)==1,'One native source per excerpt batch')
        from PIL import Image
        Image.MAX_IMAGE_PIXELS=150_000_000
        source_hash=labels.digest(args.source)
        with Image.open(args.source) as image:
            for f in features:
                p=f['properties'];labels.require(source_hash==p['source_sha256'] and list(image.size)==p['source_dimensions_px'],'Wrong native excerpt source')
                x,y,w,h=p['source_crop']['native_xywh'];path=args.out/p['source_excerpt'];path.parent.mkdir(parents=True,exist_ok=True)
                image.crop((x,y,x+w,y+h)).convert('RGB').save(path,quality=94)
    receipt=labels.read(args.out/'source.json')
    receipt['excerpts']=[]
    for f in features:
        p=f['properties'];path=args.out/p['source_excerpt']
        labels.require(path.is_file(),f'Missing native excerpt: {path}')
        receipt['excerpts'].append({'annotation_id':f['id'],'path':p['source_excerpt'],
                                    'sha256':labels.digest(path),'source_sha256':p['source_sha256'],
                                    'frame':p['source_crop']})
    labels.write(args.out/'source.json',receipt)
    print(f'{len(features)} reviewed features exported')

if __name__=='__main__':main()
