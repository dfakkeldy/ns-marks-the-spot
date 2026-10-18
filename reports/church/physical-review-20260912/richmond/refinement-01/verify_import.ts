// Run the real web parser and TPS solver against the frozen refinement CSV.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps,serializeFletcherGcps} from '../../../../../web/src/userMaps/parsers/fletcherGcps';
import {solveTps,applyTps} from '../../../../../web/src/userMaps/transform/tps';
import {toMercator} from '../../../../../web/src/userMaps/transform/webMercator';
const path='reports/church/physical-review-20260912/richmond/refinement-01/richmond-refined.csv';
const parsed=parseFletcherGcps(readFileSync(path,'utf8'),{pixelSize:{width:35735,height:30429}});
assert.equal(parsed.gcps.length,6);assert.equal(parsed.checks.length,6);
assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed)).rows,parsed.rows);
const fit=solveTps(parsed.gcps);assert.ok(fit.ok);
const args=['-tps'];
for(const p of parsed.gcps){const xy=toMercator(p.map);args.push('-gcp',String(p.pixel.x),String(p.pixel.y),String(xy.x),String(xy.y));}
const gdal=execFileSync('gdaltransform',args,{encoding:'utf8',input:parsed.checks.map(p=>`${p.pixel.x} ${p.pixel.y}\n`).join('')}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
let difference=0;
for(const [i,p] of parsed.checks.entries()){const xy=applyTps(fit.params,p.pixel.x,p.pixel.y);const d=Math.hypot(xy.x-gdal[i][0],xy.y-gdal[i][1]);assert.ok(d<0.001,`${p.id}: ${d}`);difference=Math.max(difference,d);}
console.log(JSON.stringify({controls:6,checks:6,semantic_csv_roundtrip:true,maximum_web_gdal_difference_projected_m:difference,scope:'Parser and TPS computation only; not raw-scan browser mesh or geographic acceptance'},null,2));
