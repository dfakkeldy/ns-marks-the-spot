import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseFletcherGcps, serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';
import {solveAffineFromGcps, applyAffine} from '../../../web/src/userMaps/transform/affine';
import {toMercator} from '../../../web/src/userMaps/transform/webMercator';

// Bundle with the repository's rolldown for Node, then run from the repo root.
// This tests editable inventories and exact affine calculations, not browser mesh.
const root = 'reports/church/distributed-review-20260913/';
const files = [
  ['richmond/fresh-validation-review.csv', 35735, 30429, 10, 2, 'tps'],
  ['inverness-north/corrected-I10-frozen.csv', 34427, 34543, 4, 0, 'affine'],
  ['inverness-north/diagnostic-review.csv', 34427, 34543, 4, 1, 'affine'],
  ['inverness-north/fresh-validation-review.csv', 34427, 34543, 4, 1, 'affine'],
  ['victoria-northwest/fresh-validation-review.csv', 33711, 31468, 4, 1, 'affine'],
  ['victoria-main/fresh-validation-review.csv', 33711, 31468, 4, 1, 'affine'],
  ['cape-breton/frozen-controls.csv', 36223, 35027, 3, 0, 'affine'],
  ['cape-breton/physical-trial.csv', 36223, 35027, 3, 1, 'affine'],
  ['inverness-south/audited-diagnostic-review.csv', 34427, 34543, 4, 6, 'affine'],
] as const;
const results = [];
for (const [name, width, height, controlCount, checkCount, method] of files) {
  const parsed = parseFletcherGcps(readFileSync(root + name, 'utf8'), {pixelSize: {width, height}});
  assert.equal(parsed.gcps.length, controlCount, name);
  assert.equal(parsed.checks.length, checkCount, name);
  assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed)).rows, parsed.rows);
  let difference: number | null = null;
  if (method === 'affine' && checkCount > 0) {
    const model = solveAffineFromGcps(parsed.gcps);
    assert.ok(model, name);
    const args = ['-order', '1'];
    for (const control of parsed.gcps) {
      const xy = toMercator(control.map);
      args.push('-gcp', String(control.pixel.x), String(control.pixel.y), String(xy.x), String(xy.y));
    }
    const expected = execFileSync('gdaltransform', args, {
      encoding: 'utf8',
      input: parsed.checks.map(c => `${c.pixel.x} ${c.pixel.y}\n`).join(''),
    }).trim().split('\n').map(line => line.split(/\s+/).map(Number));
    difference = 0;
    for (const [i, check] of parsed.checks.entries()) {
      const xy = applyAffine(model, check.pixel.x, check.pixel.y);
      difference = Math.max(difference, Math.hypot(xy.x - expected[i][0], xy.y - expected[i][1]));
    }
    assert.ok(difference < .001, `${name}: ${difference}`);
  }
  results.push({file: name, controls: controlCount, checks: checkCount, semanticRoundtrip: true,
    affineMaxDifferenceProjectedMetres: difference});
}
console.log(JSON.stringify({results,
  scope: 'Current production CSV parser and affine solver. TPS inventory roundtrip only. No browser rendering, raw-scan mesh or geographic acceptance.'}, null, 2));
