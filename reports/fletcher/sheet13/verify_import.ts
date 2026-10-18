// Bundle with web/node_modules/.bin/rolldown and run from the repository root.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFletcherGcps, serializeFletcherGcps } from '../../../web/src/userMaps/parsers/fletcherGcps';
import { applyTps, solveTps } from '../../../web/src/userMaps/transform/tps';
import { toMercator } from '../../../web/src/userMaps/transform/webMercator';

const directory = process.argv[2] ?? 'reports/fletcher/sheet13/';
const expectedControls = JSON.parse(readFileSync(directory + 'regional-fit.json', 'utf8')).points.length;
const expectedChecks = JSON.parse(readFileSync(directory + 'regional-diagnostics.json', 'utf8')).points.length;
const options = { pixelSize: { width: 10872, height: 7682 } };
const controls = parseFletcherGcps(readFileSync(directory + 'sheet-13-controls.csv', 'utf8'), options);
const checks = parseFletcherGcps(readFileSync(directory + 'sheet-13-diagnostic-review.csv', 'utf8'), options);
assert.equal(controls.gcps.length, expectedControls);
assert.equal(controls.checks.length, 0);
assert.equal(checks.gcps.length, expectedControls);
assert.equal(checks.checks.length, expectedChecks);
for (const parsed of [controls, checks]) {
  const roundtrip = parseFletcherGcps(serializeFletcherGcps(parsed), options);
  assert.deepEqual(roundtrip.rows, parsed.rows);
}
const fitted = solveTps(controls.gcps);
assert.ok(fitted.ok, 'Web TPS must accept the delivered controls');
const scores = JSON.parse(readFileSync(directory + 'regional-diagnostic-scores.json', 'utf8'));
let maximumDifference = 0;
for (const check of checks.checks) {
  const record = scores.points.find((row: { id: string }) => row.id === check.id);
  assert.ok(record, `Missing GDAL score for ${check.id}`);
  const expected = toMercator({ lng: record.predicted_lonlat[0], lat: record.predicted_lonlat[1] });
  const actual = applyTps(fitted.params, check.pixel.x, check.pixel.y);
  const difference = Math.hypot(expected.x - actual.x, expected.y - actual.y);
  assert.ok(difference < 0.001, `Web/GDAL disagreement at ${check.id}: ${difference} m`);
  maximumDifference = Math.max(maximumDifference, difference);
}
console.log(JSON.stringify({ controls: expectedControls, checks: expectedChecks, semantic_csv_roundtrip: true,
  maximum_web_gdal_difference_projected_m: maximumDifference,
  scope: 'Parser and solver consistency; not browser mesh or geographic acceptance.' }, null, 2));
