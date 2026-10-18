import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveTps,applyTps} from '../../../web/src/userMaps/transform/tps';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';
const root='reports/church/cape-breton-interior-20260915/';
const results=[];
for(const [file,ncontrols,checks] of [['interior-support-trial/controls.csv',5,0],['interior-support-trial/diagnostic-review.csv',5,2],['selected-tps5/controls.csv',5,0],['selected-tps5/fresh-validation.csv',5,1],['western-support-trial/controls.csv',6,0],['western-support-trial/diagnostic-review.csv',6,2],['selected-tps6/controls.csv',6,0],['selected-tps6/fresh-validation.csv',6,1]] as const){
 const p=parseFletcherGcps(readFileSync(root+file,'utf8'),{pixelSize:{width:36223,height:35027}});
 assert.equal(p.gcps.length,ncontrols);assert.equal(p.checks.length,checks);assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(p)).rows,p.rows);
 const s=solveTps(p.gcps);assert.ok(s.ok);
 const ring=JSON.parse(readFileSync(root+'content-boundary.json','utf8')).ring_pixel_xy as number[][];
 const samples=[...p.checks.map(q=>[q.pixel.x,q.pixel.y]),...ring];
 const args=['-tps'];for(const q of p.gcps){const v=toMercator(q.map);args.push('-gcp',String(q.pixel.x),String(q.pixel.y),String(v.x),String(v.y));}
 const expected=execFileSync('gdaltransform',args,{input:samples.map(q=>`${q[0]} ${q[1]}\n`).join(''),encoding:'utf8'}).trim().split('\n').map(v=>v.split(/\s+/).map(Number));
 let worst=0;for(const [i,q] of samples.entries()){const v=applyTps(s.params,q[0],q[1]);worst=Math.max(worst,Math.hypot(v.x-expected[i][0],v.y-expected[i][1]));}
 assert.ok(worst<.001);results.push({file,controls:ncontrols,checks,semanticRoundtrip:true,maxTpsDifferenceProjectedMetres:worst});
}
console.log(JSON.stringify({results,scope:'Production parser and TPS solver at checks and content vertices only; not raw-scan browser mesh acceptance.'},null,2));
