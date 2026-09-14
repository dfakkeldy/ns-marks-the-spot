import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseFletcherGcps, serializeFletcherGcps} from '../../../web/src/userMaps/parsers/fletcherGcps';

const root = 'reports/church/target-refinement-20260913/richmond/';
const files = [
  ['promote-R26.csv', 11, 23],
  ['promote-R27.csv', 11, 23],
  ['promote-R26-R27.csv', 12, 22],
  ['distributed-14-tps.csv', 14, 20],
  ['candidate-controls.csv', 14, 0],
  ['fresh-validation-review.csv', 14, 6],
] as const;
const results = files.map(([file, controls, checks]) => {
  const parsed = parseFletcherGcps(readFileSync(root + file, 'utf8'), {
    pixelSize: {width: 35735, height: 30429},
  });
  assert.equal(parsed.gcps.length, controls, file);
  assert.equal(parsed.checks.length, checks, file);
  assert.deepEqual(parseFletcherGcps(serializeFletcherGcps(parsed)).rows, parsed.rows);
  return {file, controls, checks, semanticRoundtrip: true};
});
console.log(JSON.stringify({results,
  scope: 'Current production CSV parser and serializer. No browser mesh or geographic acceptance.'}, null, 2));
