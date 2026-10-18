exec(open('reports/fletcher/sheet03/point_tools.py').read())
import hashlib,datetime
p=json.loads((D/'corrected-candidates.json').read_text())
for q in p['points']:q['status']='Exact final crosshair and modern context personally inspected; geographic accuracy unaccepted.'
p.update(source_width=10668,source_height=7613,method='Seven reviewed physical river junctions. Prior printed grid is search-only.',prior_control_count=0);(D/'reviewed-fit.json').write_text(json.dumps(p,indent=2)+'\n');h=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();(D/'initial-freeze.json').write_text(json.dumps(dict(fit_sha256=h,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[q['id'] for q in p['points']],diagnostics_not_collected_yet=True),indent=2)+'\n');print(h)
