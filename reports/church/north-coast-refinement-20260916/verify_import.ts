import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
const root='reports/church/north-coast-refinement-20260916/';
const results=[];
for(const [file,ncontrols,nchecks] of [['trials/tps5-controls.csv',5,0],['trials/plus-calumruadh-controls.csv',6,0],['trials/plus-presquile-controls.csv',6,0],['trials/plus-both-controls.csv',7,0],['selected/reserved-validation.csv',6,1],['retained-diagnostic-review.csv',5,5]] as const){
 const p=parseFletcherGcps(readFileSync(root+file,'utf8'),{pixelSize:{width:34427,height:34543}});
 assert.equal(p.gcps.length,ncontrols);assert.equal(p.checks.length,nchecks);assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(p)).rows,p.rows);
 results.push({file,controls:ncontrols,checks:nchecks,semanticRoundtrip:true});
}
console.log(JSON.stringify({results,scope:'Production editable CSV parser; no raw-scan browser mesh acceptance.'},null,2));
