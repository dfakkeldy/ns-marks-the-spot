exec(open('reports/fletcher/sheet10/point_tools.py').read())
import hashlib
pts=[]
def node(i,px,k,desc):
 r=nodes[k].copy();r.update(id=i,role='check',modern_node_id=k,pixel_xy=px,identity_evidence=desc,source_uncertainty_px=20,status='Fresh validation proposal collected after twelve-control freeze; review pending.');pts.append(r)
node('V01',[3650,1600],'J0633','Small eastern tributary of upper Middle River above Camp')
node('V02',[5849,1940],'J0800','Small eastern tributary of Barasois below western confluence')
node('V03',[9095,5200],'J1676','Smith Brook mouth on eastern St Anns Bay shore')
(D/'candidate-validation.json').write_text(json.dumps(dict(sheet='sheet-10',fit_sha256=hashlib.sha256((D/'repaired-fit.json').read_bytes()).hexdigest(),points=pts),indent=2)+'\n')
