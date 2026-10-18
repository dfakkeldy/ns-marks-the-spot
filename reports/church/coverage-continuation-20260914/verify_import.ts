import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps, serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveAffineFromGcps, applyAffine} from '../../../web/src/userMaps/transform/affine';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';

const root = 'reports/church/coverage-continuation-20260914/richmond/';
const files = [
  ['additional-validation.csv', 14, 8, 'affine'],
  ['cumulative-validation.csv', 14, 14, 'affine'],
] as const;
const results = [];
for (const [file, controls, checks, method] of files) {
  const parsed = parseFletcherGcps(readFileSync(root + file, 'utf8'), {
    pixelSize: {width: 35735, height: 30429},
  });
  assert.equal(parsed.gcps.length, controls, file);
  assert.equal(parsed.checks.length, checks, file);
  assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed)).rows, parsed.rows);
  let difference: number | null = null;
  if (method === 'affine') {
    const model = solveAffineFromGcps(parsed.gcps);
    assert.ok(model, file);
    const ring = JSON.parse(readFileSync('reports/church/physical-review-20260912/richmond/content-boundary.json','utf8')).ring_pixel_xy as number[][];
    const samples = [...parsed.checks.map(p => [p.pixel.x,p.pixel.y]), ...ring];
    const args = ['-order','1'];
    for (const p of parsed.gcps) {
      const xy = toMercator(p.map);
      args.push('-gcp',String(p.pixel.x),String(p.pixel.y),String(xy.x),String(xy.y));
    }
    const expected = execFileSync('gdaltransform',args,{
      input:samples.map(p => `${p[0]} ${p[1]}\n`).join(''),encoding:'utf8',
    }).trim().split('\n').map(line => line.split(/\s+/).map(Number));
    difference = 0;
    for (const [i,p] of samples.entries()) {
      const xy = applyAffine(model,p[0],p[1]);
      difference = Math.max(difference,Math.hypot(xy.x-expected[i][0],xy.y-expected[i][1]));
    }
    assert.ok(difference < .001, `${file}: ${difference}`);
  }
  results.push({file,controls,checks,semanticRoundtrip:true,affineMaxDifferenceProjectedMetres:difference});
}
console.log(JSON.stringify({results,
  scope:'Current production parser/serializer and affine solver at checks and full content vertices. No raw-scan browser mesh or geographic acceptance.'},null,2));
