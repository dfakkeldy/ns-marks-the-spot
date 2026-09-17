import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveAffineFromGcps,applyAffine} from '../../../web/src/userMaps/transform/affine';
import {solveTps,applyTps} from '../../../web/src/userMaps/transform/tps';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';
const root='reports/church/inverness-south-continuation-20260915/';
const files=[['controls.csv',4,0],['new-checks.csv',4,2],['cumulative-fresh.csv',4,3],['skye-refinement/diagnostic-review.csv',5,8],['skye-refinement/six-distributed/diagnostic-review.csv',6,7],['skye-refinement/seven-distributed/diagnostic-review.csv',7,6]] as const;
const ring=JSON.parse(readFileSync('reports/church/physical-review-20260913/inverness-south/final-artifact-receipt.json','utf8')).source_cutline as number[][];
const results=[];
for(const [file,ncontrols,nchecks] of files){
 const p=parseFletcherGcps(readFileSync(root+file,'utf8'),{pixelSize:{width:34427,height:34543}});assert.equal(p.gcps.length,ncontrols);assert.equal(p.checks.length,nchecks);assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(p)).rows,p.rows);
 const samples=[...p.checks.map(q=>[q.pixel.x,q.pixel.y]),...ring];
 const comparisons=[];
 for(const method of ncontrols===4?['affine']:['affine','tps']){
  const affine=solveAffineFromGcps(p.gcps);assert.ok(affine);const tps=solveTps(p.gcps);assert.ok(tps.ok);
  const args=method==='affine'?['-order','1']:['-tps'];for(const q of p.gcps){const v=toMercator(q.map);args.push('-gcp',String(q.pixel.x),String(q.pixel.y),String(v.x),String(v.y));}
  const expected=execFileSync('gdaltransform',args,{input:samples.map(q=>`${q[0]} ${q[1]}\n`).join(''),encoding:'utf8'}).trim().split('\n').map(v=>v.split(/\s+/).map(Number));
  let worst=0;for(const [i,q] of samples.entries()){const v=method==='affine'?applyAffine(affine,q[0],q[1]):applyTps(tps.params,q[0],q[1]);worst=Math.max(worst,Math.hypot(v.x-expected[i][0],v.y-expected[i][1]));}
  assert.ok(worst<.001);comparisons.push({method,maxDifferenceProjectedMetres:worst});
 }
 results.push({file,controls:ncontrols,checks:nchecks,semanticRoundtrip:true,comparisons});
}
console.log(JSON.stringify({results,scope:'Production CSV parser and solvers only. Trial solver agreement is not geographic acceptance or a rendered-trial test.'},null,2));
