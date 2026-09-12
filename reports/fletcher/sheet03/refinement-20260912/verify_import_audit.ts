import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseFletcherGcps, serializeFletcherGcps } from '../../../../web/src/userMaps/parsers/fletcherGcps';
import { applyTps, solveTps } from '../../../../web/src/userMaps/transform/tps';
import { toMercator } from '../../../../web/src/userMaps/transform/webMercator';
const d='reports/fletcher/sheet03/refinement-20260912/';
const read=(name:string)=>JSON.parse(readFileSync(d+name,'utf8'));
const receipts=[];
for(const stage of ['nine','ten']){
 const fit=read(`fit-${stage}.json`),diag=read(`diagnostics-${stage}.json`),checks=read(stage==='nine'?'validation.json':'validation-ten.json');
 const scores=[...read(stage==='nine'?'raster-nine-receipt.json':'raster-receipt.json').points,...read(stage==='nine'?'validation-scores.json':'validation-ten-scores.json').points];
 let max=0;
 for(const [kind,extra] of [['controls',[]],['diagnostic-review',diag.points],['validation-review',checks.points]] as const){
  const rows=[...fit.points,...extra];
  const csv='pixel_x,pixel_y,lon,lat,role,label\n'+rows.map(p=>[...p.pixel_xy,...p.lonlat,p.role,p.id].join(',')).join('\n')+'\n';
  const path=d+`sheet-03-${stage}-${kind}.csv`;writeFileSync(path,csv);
  const options={pixelSize:{width:10668,height:7613}};
  const parsed=parseFletcherGcps(readFileSync(path,'utf8'),options);
  assert.equal(parsed.gcps.length,fit.points.length);assert.equal(parsed.checks.length,extra.length);
  assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed),options).rows,parsed.rows);
  const solved=solveTps(parsed.gcps);assert.ok(solved.ok);
  for(const p of parsed.checks){
   const s=scores.find(q=>q.id===p.id);assert.ok(s);
   const actual=applyTps(solved.params,p.pixel.x,p.pixel.y);const expected=toMercator({lng:s.predicted_lonlat[0],lat:s.predicted_lonlat[1]});
   const error=Math.hypot(actual.x-expected.x,actual.y-expected.y);assert.ok(error<.001);max=Math.max(max,error);
  }
 }
 receipts.push({stage,controls:fit.points.length,diagnostics:diag.points.length,historical_checks:checks.points.length,semantic_roundtrip:true,maximum_web_gdal_difference_projected_m:max});
}
console.log(JSON.stringify({passed:true,experiments:receipts,scope:'Preserved historical check files, including U06 with post-score definition uncertainty; not acceptance or newly collected validation.'},null,2));
