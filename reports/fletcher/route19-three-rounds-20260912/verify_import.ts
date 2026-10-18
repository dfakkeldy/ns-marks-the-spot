// Bundle with web/node_modules/.bin/rolldown; run from repository root.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseFletcherGcps, serializeFletcherGcps } from '../../../web/src/userMaps/parsers/fletcherGcps';
import { applyTps, solveTps } from '../../../web/src/userMaps/transform/tps';
import { toMercator } from '../../../web/src/userMaps/transform/webMercator';
const root='reports/fletcher/route19-three-rounds-20260912/';
const results=[];
for(const sheet of ['14','16','22','19']){
  const dir=`${root}sheet-${sheet}/`;
  const fit=JSON.parse(readFileSync(dir+'round-3-fit.json','utf8'));
  const scores=JSON.parse(readFileSync(dir+'round-3-scores.json','utf8'));
  const options={pixelSize:{width:fit.source_dimensions[0],height:fit.source_dimensions[1]}};
  const controls=parseFletcherGcps(readFileSync(dir+`sheet-${sheet}-controls.csv`,'utf8'),options);
  const review=parseFletcherGcps(readFileSync(dir+`sheet-${sheet}-review.csv`,'utf8'),options);
  assert.equal(controls.gcps.length,scores.control_count);assert.equal(controls.checks.length,0);
  assert.equal(review.gcps.length,scores.control_count);assert.equal(review.checks.length,scores.check_count);
  for(const parsed of [controls,review])assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed),options).rows,parsed.rows);
  const solved=solveTps(controls.gcps);assert.ok(solved.ok);
  let maximum=0;
  for(const check of review.checks){
    const target=scores.points.find((p:{id:string})=>p.id===check.id);assert.ok(target);
    const expected=toMercator({lng:target.predicted_lonlat[0],lat:target.predicted_lonlat[1]});
    const actual=applyTps(solved.params,check.pixel.x,check.pixel.y);
    const error=Math.hypot(expected.x-actual.x,expected.y-actual.y);assert.ok(error<.001);maximum=Math.max(maximum,error);
  }
  results.push({sheet,controls:controls.gcps.length,excluded_checks:review.checks.length,semantic_roundtrip:true,maximum_web_gdal_difference_projected_m:maximum});
}
const receipt={results,scope:'Actual application CSV parser and TPS solver; does not test native-scan browser mesh or geographic accuracy.'};
writeFileSync(root+'import-verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
