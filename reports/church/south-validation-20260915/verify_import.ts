import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveAffineFromGcps,applyAffine} from '../../../web/src/userMaps/transform/affine';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';
const root='reports/church/south-validation-20260915/';
const ring=JSON.parse(readFileSync('reports/church/physical-review-20260913/inverness-south/final-artifact-receipt.json','utf8')).source_cutline as number[][];
const results=[];
for(const [file,nchecks] of [['controls.csv',0],['fresh-validation.csv',14],['northern-expansion/new-checks.csv',2],['road-expansion/new-checks.csv',3],['eastern-expansion/new-checks.csv',4]] as const){
 const p=parseFletcherGcps(readFileSync(root+file,'utf8'),{pixelSize:{width:34427,height:34543}});
 assert.equal(p.gcps.length,4);assert.equal(p.checks.length,nchecks);assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(p)).rows,p.rows);
 const affine=solveAffineFromGcps(p.gcps);assert.ok(affine);
 const samples=[...p.checks.map(q=>[q.pixel.x,q.pixel.y]),...ring];const args=['-order','1'];
 for(const q of p.gcps){const v=toMercator(q.map);args.push('-gcp',String(q.pixel.x),String(q.pixel.y),String(v.x),String(v.y));}
 const expected=execFileSync('gdaltransform',args,{input:samples.map(q=>`${q[0]} ${q[1]}\n`).join(''),encoding:'utf8'}).trim().split('\n').map(v=>v.split(/\s+/).map(Number));
 let worst=0;for(const [i,q] of samples.entries()){const v=applyAffine(affine,q[0],q[1]);worst=Math.max(worst,Math.hypot(v.x-expected[i][0],v.y-expected[i][1]));}
 assert.ok(worst<.001);results.push({file,controls:4,checks:nchecks,semanticRoundtrip:true,comparisons:[{method:'affine',maxDifferenceProjectedMetres:worst}]});
}
console.log(JSON.stringify({results,scope:'Production CSV parser and retained affine solver at fresh checks and content vertices; not raw-scan browser mesh acceptance.'},null,2));
