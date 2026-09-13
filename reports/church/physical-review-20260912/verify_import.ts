// Bundle with web/node_modules/.bin/rolldown; run from repository root.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFletcherGcps, serializeFletcherGcps } from '../../../web/src/userMaps/parsers/fletcherGcps';
import { applyAffine, solveAffineFromGcps } from '../../../web/src/userMaps/transform/affine';
import { toMercator } from '../../../web/src/userMaps/transform/webMercator';
const root = 'reports/church/physical-review-20260912/';
const options = { pixelSize: { width: 35735, height: 30429 } };
const draft = parseFletcherGcps(readFileSync(root + 'richmond/physical-draft.csv', 'utf8'), options);
const blake = parseFletcherGcps(readFileSync(root + 'richmond/physical-draft-with-blake-diagnostic.csv', 'utf8'), options);
const north = parseFletcherGcps(readFileSync(root + 'north-diagnostic-review.csv', 'utf8'), {pixelSize:{width:34427,height:34543}});
assert.equal(draft.gcps.length, 4); assert.equal(draft.checks.length, 4);
assert.equal(blake.gcps.length, 4); assert.equal(blake.checks.length, 5);
assert.equal(north.gcps.length, 30); assert.equal(north.checks.length, 3);
for (const parsed of [draft, blake, north]) {
  assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed)).rows, parsed.rows);
}
const fit = solveAffineFromGcps(draft.gcps); assert.ok(fit);
const expected = JSON.parse(readFileSync(root + 'richmond/physical-draft-scores.json','utf8')).models.affine.points;
let maximumDifference = 0;
for (const check of draft.checks) {
  const record = expected.find((p:{id:string}) => p.id === check.id); assert.ok(record);
  const actual = applyAffine(fit, check.pixel.x, check.pixel.y);
  const world = toMercator({lng:record.predicted_lonlat[0],lat:record.predicted_lonlat[1]});
  const difference = Math.hypot(actual.x-world.x, actual.y-world.y);
  assert.ok(difference < 0.001); maximumDifference = Math.max(maximumDifference,difference);
}
console.log(JSON.stringify({richmond_controls:4,richmond_checks:4,corrected_blake_check:1,north_checks:3,semantic_csv_roundtrip:true,maximum_affine_web_gdal_difference_projected_m:maximumDifference,scope:'Parser/affine solver consistency; raw-scan browser mesh not exercised; no geographic acceptance'},null,2));
