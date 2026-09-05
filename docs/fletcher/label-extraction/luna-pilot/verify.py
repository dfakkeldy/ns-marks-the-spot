"""Verify the archived pilot. Run normally, without Python optimization (-O)."""
from pathlib import Path
import json,hashlib,re
from collections import Counter
import argparse
parser=argparse.ArgumentParser(description='Verify archived pilot structure and arithmetic; this does not validate visual readings.')
parser.add_argument('--crops', type=Path, help='Optional folder containing the six exact PNG crops for hash verification')
args=parser.parse_args()
out=Path(__file__).resolve().parent
load=lambda name:json.loads((out/name).read_text())
crops={c['id']:c for c in load('crops.json')['crops']};ref=load('reference.json');runs=load('runs.json');adj=load('adjudication.json');results=load('results.json')['results']
refs={f['source_annotation_id']:(c['crop_id'],f) for c in ref['crops'] for f in c['complete_annotations']}
assert len(refs)==27 and sum(f['text_scoring']=='clear-reference' for c,f in refs.values())==24
assert hashlib.sha256((out/'reference.json').read_bytes()).hexdigest()==runs['reference_sha256']
assert hashlib.sha256((out/'worker-prompt.txt').read_bytes()).hexdigest()==runs['worker_prompt_sha256']
def box_valid(b,w,h):
 assert len(b)==4 and all(type(v) is int for v in b)
 x,y,bw,bh=b;assert x>=0 and y>=0 and bw>0 and bh>0 and x+bw<=w and y+bh<=h

def norm(s):return ' '.join(s.replace('\\n',' ').replace('ᶜ','c').casefold().split())
def letters(s):return re.sub(r'[^\w ]','',norm(s))
for run in runs['runs']:
 model=run['model_requested'].replace('gpt-5.6-','');cs=[];anns={}
 for raw in run['raw_outputs']:
  assert hashlib.sha256((out/raw['filename']).read_bytes()).hexdigest()==raw['sha256']
  data=load(raw['filename']);assert data['model_requested']==run['model_requested']
  for c in data['crops']:
   cs.append(c['crop_id']);crop=crops[c['crop_id']];w,h=crop['source_region_xywh'][2:];assert [c['width'],c['height']]==[w,h]
   for f in c['annotations']:
    assert f['local_id'] not in anns and f['local_id'].startswith(c['crop_id']+'-');anns[f['local_id']]=f
    assert f['source_text'] and f['reading_status'] in ('clear','tentative','partial') and f['label_boxes_xywh']
    for b in f['label_boxes_xywh']:box_valid(b,w,h)
   for u in c['unresolved_regions']:box_valid(u['box_xywh'],w,h)
 assert sorted(cs)==sorted(crops)
 rows=adj['models'][model]['reference_comparisons'];assert len(rows)==27 and {q['source_annotation_id'] for q in rows}==set(refs)
 for q in rows:
  crop,expected=refs[q['source_annotation_id']];assert q['crop_id']==crop
  for id in q['candidate_ids']:assert id in anns and id.startswith(crop+'-')
  s=q['proposed_text_for_comparison']
  if expected['text_scoring']=='provisional-excluded':status='provisional-excluded'
  elif norm(s)==norm(expected['source_text']):status='exact-normalized'
  elif letters(s)==letters(expected['source_text']):status='punctuation-only'
  elif 'incomplete' in q['grouping']:status='incomplete'
  else:status='wrong-wording'
  assert status==q['text_result']
 for d in adj['models'][model]['observed_box_defects']:assert d['candidate_id'] in anns
 counts=Counter(q['text_result'] for q in rows);result=next(r for r in results if r['model_requested']==run['model_requested'])
 assert result['candidate_records']==len(anns)
 assert result['exact_normalized_after_manual_regrouping']==counts['exact-normalized']
 assert result['punctuation_only_after_manual_regrouping']==counts['punctuation-only']
 assert result['wrong_wording']==counts['wrong-wording'] and result['incomplete']==counts['incomplete']
 assert counts['provisional-excluded']==3 and sum(counts.values())==27 and not result['automatic_import_allowed']
 print(model,len(anns),'records;',result['exact_normalized_after_manual_regrouping'],'exact / 24; references, raw hashes, bounds and score arithmetic pass')
if args.crops:
 for c in crops.values():
  local=args.crops/c['image_filename'];assert hashlib.sha256(local.read_bytes()).hexdigest()==c['image_sha256']
for doc in [out/'README.md',out.parent/'README.md']:
 for target in re.findall(r'\]\(([^)]+)\)',doc.read_text()):
  if not target.startswith(('https:','http:','#')):assert (doc.parent/target).exists(),target
assert runs['pending']['model_requested']=='claude-opus-5' and runs['pending']['candidate_records'] is None and runs['pending']['score'] is None
print('PASS: 90 raw candidate records, optional crop hashes, reference integrity, score arithmetic, pending model state and local links.')
