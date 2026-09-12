"""Freeze the personally inspected northern/western repair; never fit check rows."""
from pathlib import Path
import json,copy,hashlib,datetime
HERE=Path(__file__).resolve().parent; P=HERE.parent
if (HERE/'repair-freeze.json').exists(): raise SystemExit('Frozen evidence already exists; preserve it and start a new experiment directory.')
h=lambda p:hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
w=lambda n,d:(HERE/n).write_text(json.dumps(d,indent=2)+'\n')
fit=json.loads((P/'repaired-fit.json').read_text());props=json.loads((HERE/'corrected-proposals.json').read_text())['points'];v=json.loads((P/'validation.json').read_text());oldscore=json.loads((P/'validation-scores.json').read_text());old=copy.deepcopy(fit['points'])
for id,p in zip(['C16','C17'],props[:2]):
 q=copy.deepcopy(p);q.update(id=id,role='control',source_uncertainty_px=20,review_status='Personally inspected original unrotated native crosshair in close and wide context and modern marked vectors before fitting.')
 if id=='C16':
  q['promotion']={'old_id':'V02','old_check_record':next(x for x in v['points'] if x['id']=='V02'),'old_score_record':next(x for x in oldscore['points'] if x['id']=='V02'),'old_fit_sha256':oldscore['fit_sha256'],'status':'Used for repair; permanently diagnostic, never independent again.'}
  assert q['pixel_xy']==q['promotion']['old_check_record']['pixel_xy'] and q['lonlat']==q['promotion']['old_check_record']['lonlat']
 fit['points'].append(q)
assert fit['points'][:14]==old
fit['status']='Provisional 16-control TPS; previous fourteen controls preserved verbatim; whole-sheet geography remains unaccepted.'
w('repaired-fit.json',fit)
w('repair-freeze.json',{'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fit_sha256':h(HERE/'repaired-fit.json'),'prior_fit_sha256':h(P/'repaired-fit.json'),'source_sha256':fit['source_sha256'],'boundary_sha256':h(P/'boundary.json'),'control_count':16,'acceptance_criteria':{'median_ground_m_max':100,'worst_ground_m_max':200,'distributed_whole_raster_and_seams_required':True},'new_validation_collected':False})
diag=json.loads((P/'repair-diagnostic.json').read_text());diag['points']+= [p for p in v['points'] if p['id']!='V02'];diag.update(fit_sha256=h(HERE/'repaired-fit.json'),status='Reused old diagnostics and validation excluding fitted V02. No longer fresh evidence; old failed V02 preserved inside C16 promotion record.')
w('repair-diagnostic.json',diag)
