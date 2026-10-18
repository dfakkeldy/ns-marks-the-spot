import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveTps,applyTps} from '../../../web/src/userMaps/transform/tps';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';
const root='reports/church/south-distributed-refinement-20260915/';
const ring=JSON.parse(readFileSync('reports/church/physical-review-20260913/inverness-south/final-artifact-receipt.json','utf8')).source_cutline as number[][];
const results=[];
for(const [file,ncontrols,nchecks] of [['controls.csv',11,0],['diagnostics.csv',11,16],['thirteen-controls/controls.csv',13,0],['thirteen-controls/diagnostics.csv',13,14],['selected-tps13/controls.csv',13,0]] as const){
 const p=parseFletcherGcps(readFileSync(root+file,'utf8'),{pixelSize:{width:34427,height:34543}});
 assert.equal(p.gcps.length,ncontrols);assert.equal(p.checks.length,nchecks);assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(p)).rows,p.rows);
 const result=solveTps(p.gcps);assert.ok(result.ok);
 const samples=[...p.checks.map(q=>[q.pixel.x,q.pixel.y]),...ring];const args=['-tps'];
 for(const q of p.gcps){const v=toMercator(q.map);args.push('-gcp',String(q.pixel.x),String(q.pixel.y),String(v.x),String(v.y));}
 const expected=execFileSync('gdaltransform',args,{input:samples.map(q=>`${q[0]} ${q[1]}\n`).join(''),encoding:'utf8'}).trim().split('\n').map(v=>v.split(/\s+/).map(Number));
 let worst=0;for(const [i,q] of samples.entries()){const v=applyTps(result.params,q[0],q[1]);worst=Math.max(worst,Math.hypot(v.x-expected[i][0],v.y-expected[i][1]));}
 assert.ok(worst<.001);results.push({file,controls:ncontrols,checks:nchecks,semanticRoundtrip:true,comparisons:[{method:'tps',maxDifferenceProjectedMetres:worst}]});
}
console.log(JSON.stringify({results,scope:'Production CSV parser and TPS solver at diagnostic checks and content vertices; not raw-scan browser mesh acceptance.'},null,2));
