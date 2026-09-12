"""Verify preserved experiment evidence; passing is not geographic acceptance."""
from pathlib import Path
import datetime,hashlib,json,subprocess
D=Path(__file__).resolve().parent;P=D.parent;R=D.parents[3]
DATA=Path.home()/'Downloads/fletcher-sheet18'
def j(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
RECORDED_ROOT = Path('/Users/dfakkeldy/.codex/worktrees/8d5b/ns-marks-the-spot')

def resolve_recorded_path(value, root=R):
    path = Path(value)
    if path.is_absolute():
        try:
            relative = path.relative_to(RECORDED_ROOT)
        except ValueError:
            return path  # External source, reference and raster locations stay exact.
        return R / relative
    return root / path

def verify(rows, root=R):
    for row in rows:
        assert sha(resolve_recorded_path(row['path'], root)) == row['sha256'], row['path']
base=j(D/'baseline-verification.json')
subprocess.run(['git','merge-base','--is-ancestor',base['base_commit'],'origin/nightly'],cwd=R,check=True)
verify(base['files']);provenance=j(D/'render-provenance.json');verify(provenance['files']);verify(provenance['rasters'])
for row in provenance['files']:
    path=resolve_recorded_path(row['path'])
    if path.parent==P:
        original=subprocess.check_output(['git','show',base['base_commit']+':'+str(path.relative_to(R))],cwd=R)
        assert hashlib.sha256(original).hexdigest()==row['sha256']
for ref in j(P/'reference-receipts.json'):
    p=DATA/'reference-full'/(ref['name']+'.geojson')
    assert sha(p)==ref['sha256'] and len(j(p)['features'])==ref['count']
features={f['properties']['OBJECTID']:f for f in j(DATA/'reference-full/water-lines.geojson')['features']}
def direct(point):
    for oid in point.get('objectids',point.get('modern_objectids',[])):
        g=features[oid]['geometry'];parts=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
        assert any(max(abs(a-b) for a,b in zip(xy,point['lonlat']))<1e-7 for part in parts for xy in [part[0],part[-1]])
    assert point.get('objectids',point.get('modern_objectids')),point['id']
oldpath=P/'regional-fit.json';results=[]
for stage,prior,n,nd,ids,cells in [(D,oldpath,15,6,{'F03','F04'},48011486),(D/'16-control',D/'reviewed-fit.json',16,7,{'F05','F06'},47516104)]:
    fit=j(stage/'reviewed-fit.json');old=j(prior);freeze=j(stage/'frozen-fit.json');checks=j(stage/'validation.json')
    assert fit['points'][:-1]==old['points'] and len(fit['points'])==n
    assert fit['source_dimensions']==[10832,7683]
    assert freeze['fit_sha256']==checks['fit_sha256']==sha(stage/'reviewed-fit.json')
    assert freeze['prior_fit_sha256']==sha(prior) and freeze['boundary_sha256']==sha(P/'boundary.json')
    times=[freeze['frozen_at'],checks['selected_at'],checks['reviewed_at']]
    assert all(datetime.datetime.fromisoformat(a)<datetime.datetime.fromisoformat(b) for a,b in zip(times,times[1:]))
    assert {p['id'] for p in checks['points']}==ids
    prior_files=list(P.glob('*.json'))+(list(D.glob('*.json')) if stage!=D else [])
    for point in checks['points']:
        assert point['lonlat'] not in [p['lonlat'] for p in fit['points']]
        assert point['pixel_xy'] not in [p['pixel_xy'] for p in fit['points']]
        for f in prior_files:
            data=j(f)
            for q in (data.get('points',[]) if isinstance(data,dict) else []):
                assert point['pixel_xy']!=q.get('pixel_xy') and point['lonlat']!=q.get('lonlat')
    for f in stage.glob('*.json'):
        if f.name not in ['reviewed-additions.json','fresh-candidates.json','fresh-pond-proposals.json','fresh-adjusted.json','validation.json']:continue
        for point in j(f)['points']:direct(point)
    for sn,cn,fp in [('validation-scores.json','validation.json',stage/'reviewed-fit.json'),('baseline-scores.json','baseline-checks.json',oldpath),('raster-receipt.json','diagnostic-checks.json',stage/'reviewed-fit.json')]:
        score=j(stage/sn)
        assert score['fit_sha256']==sha(fp) and score['checks_sha256']==sha(stage/cn)
        assert {p['id'] for p in score['points']}=={p['id'] for p in j(stage/cn)['points']}
    receipt=j(stage/'raster-receipt.json');raster=receipt['raster'];coverage=j(stage/'coverage.json')
    assert sha(Path(raster['path']))==raster['sha256']
    assert receipt['orientation']['samples']==71821 and receipt['orientation']['nonnegative_determinants']==0
    assert coverage['passed'] and coverage['transparent_interior_cells']==0 and coverage['expected_interior_cells']==cells
    assert coverage['raster_sha256']==raster['sha256']
    assert coverage['cutline_sha256']==sha(Path(raster['path']).parent/'neatline.geojson')
    imports=j(stage/'import-verification.json')
    assert (imports['controls'],imports['checks'],imports['validation_checks'])==(n,nd,2)
    assert imports['semantic_csv_roundtrip'] and imports['maximum_web_gdal_difference_projected_m']<1e-7
    browser=j(stage/'browser/verification.json');mobile=j(stage/'browser/mobile-verification.json')
    assert browser['enabledStateSurvived'] and browser['before']==browser['after']
    for snapshot in [browser['before'],browser['after'],mobile]:
        assert snapshot['storedRasterSha256']==raster['sha256']
        assert [snapshot['record']['pixelSize']['width'],snapshot['record']['pixelSize']['height']]==raster['size']
        assert snapshot['transparentPixels']>0 and snapshot['opaquePixels']>0
    assert j(stage/'browser/errors.json')==[]
    results.append({'controls':n,'diagnostics':nd,'fresh_checks':2,'coverage_cells':cells,'technical_evidence':'pass','whole_sheet_geographically_accepted':False})
# Promotion identities remain exactly where the preceding failed checks were measured.
for source,new in [(j(P/'validation.json')['points'],j(D/'reviewed-additions.json')['points'][0]),(j(D/'validation.json')['points'],j(D/'16-control/reviewed-additions.json')['points'][0])]:
    original=next(p for p in source if p['id']==new['promoted_from'])
    assert original['pixel_xy']==new['pixel_xy'] and original['lonlat']==new['lonlat']
frames=0
for f in D.rglob('frames.json'):
    for frame in j(f):
        if 'point_record' not in frame:continue
        point=next(p for p in j(R/'reports/fletcher'/frame['point_record'])['points'] if p['id']==frame['point_id'])
        assert frame['native_coordinates']==point['pixel_xy'] and frame['modern_lonlat']==point['lonlat'] and frame['rotation_degrees']==0
        x0,y0,x1,y1=frame['native_box'];assert [(x0+x1)/2,(y0+y1)/2]==point['pixel_xy'];frames+=1
assert frames==16
visual=j(D/'visual-review.json');verify(visual['figures'],D)
assert visual['count']==len(visual['figures'])==50
assert {str(p.relative_to(D)) for p in D.rglob('*') if p.suffix in ['.jpg','.png']}=={r['path'] for r in visual['figures']}
assert not j(D/'acceptance.json')['whole_sheet_geographically_accepted']
result={'passed':True,'stages':results,'verified_native_frames':frames,'viewed_figures':50,'whole_sheet_geographically_accepted':False}
(D/'packet-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
