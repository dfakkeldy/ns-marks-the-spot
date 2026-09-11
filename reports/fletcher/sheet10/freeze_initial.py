exec(open('reports/fletcher/sheet10/point_tools.py').read())
import hashlib,datetime
j=json.loads((D/'corrected-candidates.json').read_text());active=[p for p in j['points'] if p['role']=='control']
for p in active:p['status']='Native crosshair and modern context personally inspected before initial fit; original proposals and corrections retained.'
fit=dict(sheet='sheet-10',source_sha256=j['source_sha256'],source_width=10782,source_height=7612,points=active,method='Initial ten physical controls. Printed grid only guides search.',prior_control_count=0)
(D/'reviewed-fit.json').write_text(json.dumps(fit,indent=2)+'\n');sha=hashlib.sha256((D/'reviewed-fit.json').read_bytes()).hexdigest();(D/'initial-freeze.json').write_text(json.dumps(dict(fit_sha256=sha,frozen_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),control_ids=[p['id'] for p in active],diagnostics_collected_after_freeze=True),indent=2)+'\n')
pts=[]
def node(i,px,k,desc):
 r=nodes[k].copy();r.update(id=i,role='check',modern_node_id=k,pixel_xy=px,identity_evidence=desc,source_uncertainty_px=20,status='Unreviewed diagnostic proposal');pts.append(r)
node('Q01',[2554,2603],'J0963','Northern branch confluence on long western tributary of Middle River')
node('Q02',[5660,1387],'J0584','Upper Barasois Brook northern fork')
node('Q03',[6485,5185],'J1719','Elders Brook joining North River from east')
node('Q04',[8030,5355],'J1778','Brook mouth on west St Anns shore north of Beacon spit')
node('Q05',[4000,5915],'J1832','Baddeck Lakes northern inlet')
(D/'candidate-diagnostics.json').write_text(json.dumps(dict(sheet='sheet-10',fit_sha256=sha,points=pts),indent=2)+'\n');print(sha)
